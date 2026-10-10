import {
  type BuiltLlvmBlock,
  type BuiltLlvmFunction,
  type LlvmInstruction,
  type LlvmValue,
  llvmValueText
} from "../llvm-ir/index.js";
import { intersection, predecessorMap, sameSet } from "./graph.js";
import type { GcFunctionFacts, GcHeapReference, GcProtection } from "./types.js";

interface RootSnapshot {
  readonly roots: ReadonlySet<string>;
  readonly ancestors: ReadonlySet<string>;
}

export interface GcRootState {
  readonly roots: ReadonlySet<string>;
  readonly availableFrames: ReadonlySet<string>;
  readonly snapshots: ReadonlyMap<string, RootSnapshot>;
}

export interface GcRootAnalysis {
  readonly before: ReadonlyMap<string, readonly GcRootState[]>;
  readonly frameErrors: ReadonlyMap<LlvmInstruction, string>;
}

export function protectionKey(protection: GcProtection): string {
  return valueKey(protection.value);
}

export function valueKey(value: LlvmValue): string {
  return `value:${llvmValueText(value)}`;
}

export function isProtected(reference: GcHeapReference, state: GcRootState): boolean {
  return state.roots.has(valueKey(reference.value)) || state.roots.has(protectionKey(reference.protection));
}

function emptyState(roots: ReadonlySet<string> = new Set()): GcRootState {
  return { roots, availableFrames: new Set(), snapshots: new Map() };
}

function merge(left: GcRootState, right: GcRootState): GcRootState {
  const availableFrames = intersection(left.availableFrames, right.availableFrames);
  const snapshots = new Map([...availableFrames].flatMap((frame) => {
    const first = left.snapshots.get(frame);
    const second = right.snapshots.get(frame);
    return first === undefined || second === undefined ? [] : [[frame, {
      roots: intersection(first.roots, second.roots), ancestors: intersection(first.ancestors, second.ancestors)
    }] as const];
  }));
  return { roots: intersection(left.roots, right.roots), availableFrames, snapshots };
}

function sameState(left: GcRootState, right: GcRootState): boolean {
  return sameSet(left.roots, right.roots) && sameSet(left.availableFrames, right.availableFrames) &&
    [...left.availableFrames].every((frame) => {
      const first = left.snapshots.get(frame);
      const second = right.snapshots.get(frame);
      return first !== undefined && second !== undefined &&
        sameSet(first.roots, second.roots) && sameSet(first.ancestors, second.ancestors);
    });
}

function transfer(state: GcRootState, instruction: LlvmInstruction, errors: Map<LlvmInstruction, string>): GcRootState {
  if (instruction.kind !== "call" || instruction.callee.kind !== "symbol") {
    return state;
  }
  const { name } = instruction.callee;
  const operand = instruction.arguments.at(0);
  if (name === "gcRootSave" && instruction.result !== undefined) {
    const frame = llvmValueText(instruction.result);
    const snapshots = new Map(state.snapshots);
    snapshots.set(frame, { roots: state.roots, ancestors: state.availableFrames });
    return { ...state, availableFrames: new Set([...state.availableFrames, frame]), snapshots };
  }
  if (name === "gcRootPush" && operand !== undefined) {
    return { ...state, roots: new Set([...state.roots, valueKey(operand)]) };
  }
  if (name === "gcRootRestore" && operand !== undefined) {
    const frame = llvmValueText(operand);
    const snapshot = state.snapshots.get(frame);
    if (!state.availableFrames.has(frame) || snapshot === undefined) {
      errors.set(instruction, `Root frame ${frame} is unavailable or has already been unwound`);
      return emptyState();
    }
    return { roots: snapshot.roots, availableFrames: new Set([...snapshot.ancestors, frame]), snapshots: state.snapshots };
  }
  if (name === "gcRootPop") {
    errors.set(instruction, "Use an owned root frame and gcRootRestore instead of gcRootPop");
    return emptyState();
  }
  return state;
}

function phiAliases(state: GcRootState, block: BuiltLlvmBlock, predecessor: string): GcRootState {
  const aliases = block.instructions.flatMap((instruction) => {
    if (instruction.kind !== "phi") {
      return [];
    }
    const incoming = instruction.incoming.find((entry) => entry.block.name === predecessor);
    return incoming === undefined ? [] : [{ from: valueKey(incoming.value), to: valueKey(instruction.result) }];
  });
  const results = new Set(aliases.map((alias) => alias.to));
  const addAliases = (roots: ReadonlySet<string>): ReadonlySet<string> => new Set([
    ...[...roots].filter((root) => !results.has(root)),
    ...aliases.filter((alias) => roots.has(alias.from)).map((alias) => alias.to)
  ]);
  return {
    ...state,
    roots: addAliases(state.roots),
    snapshots: new Map([...state.snapshots].map(([frame, snapshot]) => [frame, { ...snapshot, roots: addAliases(snapshot.roots) }]))
  };
}

function blockInput(
  block: BuiltLlvmBlock,
  entry: string,
  initial: GcRootState,
  predecessors: ReadonlyMap<string, ReadonlySet<string>>,
  outputs: ReadonlyMap<string, GcRootState>
): GcRootState | undefined {
  const incoming = [...predecessors.get(block.label.name) ?? []].flatMap((name) => {
    const state = outputs.get(name);
    return state === undefined ? [] : [phiAliases(state, block, name)];
  });
  const states = block.label.name === entry ? [initial, ...incoming] : incoming;
  let result: GcRootState | undefined;
  for (const state of states) {
    result = result === undefined ? state : merge(result, state);
  }
  return result;
}

export function analyzeGcRoots(fn: BuiltLlvmFunction, facts: GcFunctionFacts): GcRootAnalysis {
  const predecessors = predecessorMap(fn);
  const initial = emptyState(new Set(facts.borrowedRoots.map(protectionKey)));
  const outputs = new Map<string, GcRootState>();
  const before = new Map<string, readonly GcRootState[]>();
  const frameErrors = new Map<LlvmInstruction, string>();
  let changed = true;
  while (changed) {
    changed = false;
    frameErrors.clear();
    for (const block of fn.blocks) {
      const input = blockInput(block, fn.entry.label.name, initial, predecessors, outputs);
      if (input === undefined) {
        continue;
      }
      const states: GcRootState[] = [];
      let output = input;
      for (const instruction of block.instructions) {
        states.push(output);
        output = transfer(output, instruction, frameErrors);
      }
      before.set(block.label.name, states);
      const previous = outputs.get(block.label.name);
      if (previous === undefined || !sameState(previous, output)) {
        outputs.set(block.label.name, output);
        changed = true;
      }
    }
  }
  return { before, frameErrors };
}
