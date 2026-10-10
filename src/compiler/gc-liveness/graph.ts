import type { BuiltLlvmBlock, BuiltLlvmFunction, LlvmInstruction } from "../llvm-ir/index.js";

export function successors(block: BuiltLlvmBlock): readonly string[] {
  const terminator = block.instructions.at(-1);
  if (terminator === undefined) {
    throw new Error(`GC verification requires a terminated block: ${block.label.name}`);
  }
  return instructionSuccessors(terminator);
}

function instructionSuccessors(instruction: LlvmInstruction): readonly string[] {
  switch (instruction.kind) {
    case "branch": { return [instruction.target.name]; }
    case "conditionalBranch": { return [instruction.whenTrue.name, instruction.whenFalse.name]; }
    case "switch": { return [instruction.defaultTarget.name, ...instruction.cases.map((entry) => entry.target.name)]; }
    case "return":
    case "unreachable": { return []; }
    default: { throw new Error("GC verification requires a terminator at the end of every block"); }
  }
}

export function predecessorMap(fn: BuiltLlvmFunction): ReadonlyMap<string, ReadonlySet<string>> {
  const predecessors = new Map(fn.blocks.map((block) => [block.label.name, new Set<string>()]));
  for (const block of fn.blocks) {
    for (const successor of successors(block)) {
      const sources = predecessors.get(successor);
      if (sources === undefined) {
        throw new Error(`GC verification found an unknown successor: ${successor}`);
      }
      sources.add(block.label.name);
    }
  }
  return predecessors;
}

export function sameSet<T>(left: ReadonlySet<T>, right: ReadonlySet<T>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

export function intersection<T>(left: ReadonlySet<T>, right: ReadonlySet<T>): Set<T> {
  return new Set([...left].filter((value) => right.has(value)));
}
