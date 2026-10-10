import {
  type BuiltLlvmBlock,
  type BuiltLlvmFunction,
  llvmInstructionOperands,
  llvmInstructionResult,
  llvmValueText
} from "../llvm-ir/index.js";
import { sameSet, successors } from "./graph.js";

export interface GcLiveness {
  readonly after: ReadonlyMap<string, readonly ReadonlySet<string>[]>;
}

function edgeUses(
  block: BuiltLlvmBlock,
  predecessor: string,
  liveIn: ReadonlySet<string>,
  livePhis: ReadonlySet<string>
): ReadonlySet<string> {
  const phiInputs = block.instructions.flatMap((instruction) => instruction.kind === "phi" && livePhis.has(llvmValueText(instruction.result))
    ? instruction.incoming.filter((entry) => entry.block.name === predecessor).map((entry) => llvmValueText(entry.value))
    : []);
  return new Set([...liveIn, ...phiInputs]);
}

function backward(block: BuiltLlvmBlock, liveOut: ReadonlySet<string>): {
  readonly before: ReadonlySet<string>;
  readonly after: readonly ReadonlySet<string>[];
  readonly livePhis: ReadonlySet<string>;
} {
  const live = new Set(liveOut);
  const livePhis = new Set<string>();
  const after: ReadonlySet<string>[] = Array.from({ length: block.instructions.length }, () => new Set<string>());
  for (let index = block.instructions.length - 1; index >= 0; index -= 1) {
    const instruction = block.instructions[index];
    after[index] = new Set(live);
    const result = llvmInstructionResult(instruction);
    if (result !== undefined) {
      if (instruction.kind === "phi" && live.has(llvmValueText(result))) {
        livePhis.add(llvmValueText(result));
      }
      live.delete(llvmValueText(result));
    }
    if (instruction.kind !== "phi") {
      for (const operand of llvmInstructionOperands(instruction)) {
        live.add(llvmValueText(operand));
      }
    }
  }
  return { before: live, after, livePhis };
}

export function analyzeGcLiveness(fn: BuiltLlvmFunction): GcLiveness {
  const blocks = new Map(fn.blocks.map((block) => [block.label.name, block]));
  const liveIn = new Map(fn.blocks.map((block) => [block.label.name, new Set<string>()]));
  const livePhis = new Map(fn.blocks.map((block) => [block.label.name, new Set<string>()]));
  const after = new Map<string, readonly ReadonlySet<string>[]>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const block of fn.blocks.toReversed()) {
      const liveOut = outgoingValues(block, blocks, liveIn, livePhis);
      const result = backward(block, liveOut);
      const previous = liveIn.get(block.label.name);
      const previousPhis = livePhis.get(block.label.name);
      if (previous === undefined || previousPhis === undefined || !sameSet(previous, result.before) || !sameSet(previousPhis, result.livePhis)) {
        liveIn.set(block.label.name, new Set(result.before));
        livePhis.set(block.label.name, new Set(result.livePhis));
        changed = true;
      }
      after.set(block.label.name, result.after);
    }
  }
  return { after };
}

function outgoingValues(
  block: BuiltLlvmBlock,
  blocks: ReadonlyMap<string, BuiltLlvmBlock>,
  liveIn: ReadonlyMap<string, ReadonlySet<string>>,
  livePhis: ReadonlyMap<string, ReadonlySet<string>>
): ReadonlySet<string> {
  const values = new Set<string>();
  for (const name of successors(block)) {
    const successor = blocks.get(name);
    const inputs = liveIn.get(name);
    const phis = livePhis.get(name);
    if (successor === undefined || inputs === undefined || phis === undefined) {
      throw new Error(`GC verification found an unknown successor: ${name}`);
    }
    for (const value of edgeUses(successor, block.label.name, inputs, phis)) {
      values.add(value);
    }
  }
  return values;
}
