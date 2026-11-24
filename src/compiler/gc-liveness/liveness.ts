import {
  type BuiltLlvmBlock,
  type BuiltLlvmFunction,
  type LlvmInstruction,
  type LlvmValue,
  llvmInstructionOperands,
  llvmInstructionResult,
  llvmValueText
} from "../llvm-ir/index.js";
import { predecessorMap, sameSet, successors } from "./graph.js";

/** The names an operand keeps live; values the verifier does not track keep none. */
export type LiveNames = (operand: LlvmValue) => readonly string[];

/** One block's contribution to liveness, independent of what is live after it. */
interface BlockEffects {
  readonly block: BuiltLlvmBlock;
  /** Names read before any definition in the block, phi results included. */
  readonly upward: ReadonlySet<string>;
  readonly definitions: ReadonlySet<string>;
  readonly phiResults: ReadonlySet<string>;
}

function blockEffects(block: BuiltLlvmBlock, names: LiveNames): BlockEffects {
  const upward = new Set<string>();
  const definitions = new Set<string>();
  const phiResults = new Set<string>();
  for (const instruction of block.instructions) {
    const result = llvmInstructionResult(instruction);
    if (instruction.kind === "phi") {
      phiResults.add(llvmValueText(instruction.result));
      continue;
    }
    for (const name of operandNames(instruction, names)) {
      if (!definitions.has(name)) { upward.add(name); }
    }
    if (result !== undefined) { definitions.add(llvmValueText(result)); }
  }
  return { block, upward, definitions, phiResults };
}

function operandNames(instruction: LlvmInstruction, names: LiveNames): readonly string[] {
  return llvmInstructionOperands(instruction).flatMap(names);
}

function liveBefore(effects: BlockEffects, liveOut: ReadonlySet<string>): Set<string> {
  const live = new Set(effects.upward);
  for (const name of liveOut) {
    if (!effects.definitions.has(name)) { live.add(name); }
  }
  return live;
}

/** What is live on the edge from `predecessor`: a live phi reads its input there, not in its block. */
function liveOnEdge(effects: BlockEffects, before: ReadonlySet<string>, predecessor: string, names: LiveNames): readonly string[] {
  const inputs = effects.block.instructions.flatMap((instruction) =>
    instruction.kind === "phi" && before.has(llvmValueText(instruction.result))
      ? instruction.incoming.filter((entry) => entry.block.name === predecessor).flatMap((entry) => names(entry.value))
      : []);
  return [...[...before].filter((name) => !effects.phiResults.has(name)), ...inputs];
}

/** What the successors analyzed so far read, as seen from the end of `block`. */
function liveIntoSuccessors(
  block: BuiltLlvmBlock,
  effects: ReadonlyMap<string, BlockEffects>,
  before: ReadonlyMap<string, ReadonlySet<string>>,
  names: LiveNames
): ReadonlySet<string> {
  return new Set(successors(block).flatMap((successor) => {
    const next = effects.get(successor);
    if (next === undefined) { throw new Error(`GC verification found an unknown successor: ${successor}`); }
    const nextBefore = before.get(successor);
    return nextBefore === undefined ? [] : liveOnEdge(next, nextBefore, block.label.name, names);
  }));
}

/** The names live on exit from each block. */
export function liveOutOf(fn: BuiltLlvmFunction, names: LiveNames): ReadonlyMap<string, ReadonlySet<string>> {
  const effects = new Map(fn.blocks.map((block) => [block.label.name, blockEffects(block, names)]));
  const predecessors = predecessorMap(fn);
  const before = new Map<string, ReadonlySet<string>>();
  const liveOut = new Map<string, ReadonlySet<string>>(fn.blocks.map((block) => [block.label.name, new Set<string>()]));
  const pending = new Set(fn.blocks.map((block) => block.label.name));
  const work = [...pending];
  for (let name = work.pop(); name !== undefined; name = work.pop()) {
    pending.delete(name);
    const own = effects.get(name);
    if (own === undefined) { throw new Error(`GC verification found an unknown block: ${name}`); }
    const outgoing = liveIntoSuccessors(own.block, effects, before, names);
    liveOut.set(name, outgoing);
    const incoming = liveBefore(own, outgoing);
    const previous = before.get(name);
    if (previous !== undefined && sameSet(previous, incoming)) { continue; }
    before.set(name, incoming);
    for (const predecessor of predecessors.get(name) ?? []) {
      if (!pending.has(predecessor)) { pending.add(predecessor); work.push(predecessor); }
    }
  }
  return liveOut;
}

/** The names live across each selected instruction: what it reads, and what is read after it. */
export function liveAcross(
  block: BuiltLlvmBlock,
  liveOut: ReadonlySet<string>,
  names: LiveNames,
  selected: (instruction: LlvmInstruction) => boolean
): ReadonlyMap<LlvmInstruction, ReadonlySet<string>> {
  const live = new Set(liveOut);
  const across = new Map<LlvmInstruction, ReadonlySet<string>>();
  for (const instruction of block.instructions.toReversed()) {
    const result = llvmInstructionResult(instruction);
    if (result !== undefined) { live.delete(llvmValueText(result)); }
    if (instruction.kind !== "phi") {
      for (const name of operandNames(instruction, names)) { live.add(name); }
    }
    if (selected(instruction)) { across.set(instruction, new Set(live)); }
  }
  return across;
}
