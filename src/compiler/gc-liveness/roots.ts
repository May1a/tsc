import {
  type BuiltLlvmBlock,
  type BuiltLlvmFunction,
  type LlvmInstruction,
  llvmValueText
} from "../llvm-ir/index.js";
import { intersection, predecessorMap, sameSet, successors } from "./graph.js";
import type { GcFunctionFacts, GcHeapReference } from "./types.js";

interface RootSnapshot {
  readonly roots: ReadonlySet<string>;
  readonly ancestors: ReadonlySet<string>;
}

interface GcRootState {
  readonly roots: ReadonlySet<string>;
  readonly availableFrames: ReadonlySet<string>;
  readonly snapshots: ReadonlyMap<string, RootSnapshot>;
}

export function isProtected(reference: GcHeapReference, state: GcRootState): boolean {
  return state.roots.has(llvmValueText(reference.value)) || state.roots.has(llvmValueText(reference.protection.value));
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

/** The root stack while walking one block. Each step replaces only what its instruction changes. */
export class RootWalk {
  #roots: Set<string>;
  #availableFrames: ReadonlySet<string>;
  #snapshots: ReadonlyMap<string, RootSnapshot>;

  public constructor(state: GcRootState) {
    this.#roots = new Set(state.roots);
    this.#availableFrames = state.availableFrames;
    this.#snapshots = state.snapshots;
  }

  public state(): GcRootState {
    return { roots: this.#roots, availableFrames: this.#availableFrames, snapshots: this.#snapshots };
  }

  /** Applies one instruction, returning why it misuses a root frame when it does. */
  public step(instruction: LlvmInstruction): string | undefined {
    if (instruction.kind !== "call" || instruction.callee.kind !== "symbol") {
      return undefined;
    }
    const { name } = instruction.callee;
    const operand = instruction.arguments.at(0);
    if (name === "gcRootSave" && instruction.result !== undefined) {
      this.#save(llvmValueText(instruction.result));
    } else if (name === "gcRootPush" && operand !== undefined) {
      this.#roots.add(llvmValueText(operand));
    } else if (name === "gcRootRestore" && operand !== undefined) {
      return this.#restore(llvmValueText(operand));
    } else if (name === "gcRootPop") {
      this.#reset();
      return "Use an owned root frame and gcRootRestore instead of gcRootPop";
    }
    return undefined;
  }

  #save(frame: string): void {
    this.#snapshots = new Map([...this.#snapshots, [frame, { roots: new Set(this.#roots), ancestors: this.#availableFrames }]]);
    this.#availableFrames = new Set([...this.#availableFrames, frame]);
  }

  #restore(frame: string): string | undefined {
    const snapshot = this.#snapshots.get(frame);
    if (!this.#availableFrames.has(frame) || snapshot === undefined) {
      this.#reset();
      return `Root frame ${frame} is unavailable or has already been unwound`;
    }
    this.#roots = new Set(snapshot.roots);
    this.#availableFrames = new Set([...snapshot.ancestors, frame]);
    return undefined;
  }

  #reset(): void {
    this.#roots = new Set();
    this.#availableFrames = new Set();
    this.#snapshots = new Map();
  }
}

/** Forgets roots and frames nothing after this point can consult, so states stay proportional to what is live. */
function restrict(state: GcRootState, needed: ReadonlySet<string>): GcRootState {
  const availableFrames = intersection(state.availableFrames, needed);
  return {
    roots: intersection(needed, state.roots),
    availableFrames,
    snapshots: new Map([...availableFrames].flatMap((frame) => {
      const snapshot = state.snapshots.get(frame);
      return snapshot === undefined ? [] : [[frame, {
        roots: intersection(snapshot.roots, needed), ancestors: intersection(snapshot.ancestors, needed)
      }] as const];
    }))
  };
}

function phiAliases(state: GcRootState, block: BuiltLlvmBlock, predecessor: string): GcRootState {
  const aliases = block.instructions.flatMap((instruction) => {
    if (instruction.kind !== "phi") {
      return [];
    }
    const incoming = instruction.incoming.find((entry) => entry.block.name === predecessor);
    return incoming === undefined ? [] : [{ from: llvmValueText(incoming.value), to: llvmValueText(instruction.result) }];
  });
  if (aliases.length === 0) {
    return state;
  }
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

/** The root state entering each reachable block. `needed` is what each block's exit may still consult. */
export function rootsEntering(
  fn: BuiltLlvmFunction, facts: GcFunctionFacts, needed: ReadonlyMap<string, ReadonlySet<string>>
): ReadonlyMap<string, GcRootState> {
  const predecessors = predecessorMap(fn);
  const blocks = new Map(fn.blocks.map((block) => [block.label.name, block]));
  const initial = emptyState(new Set(facts.borrowedRoots.map((protection) => llvmValueText(protection.value))));
  const inputs = new Map<string, GcRootState>();
  const outputs = new Map<string, GcRootState>();
  const pending = new Set([fn.entry.label.name]);
  for (const name of pending) {
    pending.delete(name);
    const block = blocks.get(name);
    const input = block === undefined ? undefined : blockInput(block, fn.entry.label.name, initial, predecessors, outputs);
    if (block === undefined || input === undefined) {
      continue;
    }
    inputs.set(name, input);
    const walk = new RootWalk(input);
    for (const instruction of block.instructions) {
      walk.step(instruction);
    }
    const output = restrict(walk.state(), needed.get(name) ?? new Set());
    const previous = outputs.get(name);
    if (previous === undefined || !sameState(previous, output)) {
      outputs.set(name, output);
      for (const successor of successors(block)) {
        pending.add(successor);
      }
    }
  }
  return inputs;
}
