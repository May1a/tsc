import {
  type BuiltLlvmFunction,
  type LlvmInstruction,
  llvmInstructionOperands,
  llvmInstructionResult,
  llvmValueText
} from "../llvm-ir/index.js";
import { runtimeContracts } from "../runtime-contracts/index.js";
import type { RuntimeCallContract } from "../runtime-contracts/types.js";
import { analyzeGcLiveness } from "./liveness.js";
import { analyzeGcRoots, isProtected } from "./roots.js";
import type { GcFunctionFacts, GcViolation } from "./types.js";

export type { GcFunctionFacts, GcHeapReference, GcProtection, GcViolation } from "./types.js";

const contractsByName: ReadonlyMap<string, RuntimeCallContract> =
  new Map(Object.values(runtimeContracts).map((contract) => [contract.name, contract]));

function canCollect(instruction: LlvmInstruction): boolean {
  return instruction.kind === "call" &&
    (instruction.callee.kind === "pointer" || contractsByName.get(instruction.callee.name)?.effects.collects !== false);
}

export function verifyGcLiveness(fn: BuiltLlvmFunction, facts: GcFunctionFacts): readonly GcViolation[] {
  const liveness = analyzeGcLiveness(fn);
  const roots = analyzeGcRoots(fn, facts);
  const references = new Map(facts.heapReferences.map((reference) => [llvmValueText(reference.value), reference]));
  return fn.blocks.flatMap((block) => block.instructions.flatMap((instruction, index) => {
    const state = roots.before.get(block.label.name)?.at(index);
    if (state === undefined) {
      return [];
    }
    const frameError = roots.frameErrors.get(instruction);
    const errors = frameError === undefined ? [] : [violation(fn, block.label.name, index, "", frameError)];
    if (!canCollect(instruction)) {
      return errors;
    }
    const live = new Set(liveness.after.get(block.label.name)?.at(index));
    const result = llvmInstructionResult(instruction);
    if (result !== undefined) {
      live.delete(llvmValueText(result));
    }
    for (const operand of llvmInstructionOperands(instruction)) {
      live.add(llvmValueText(operand));
    }
    return [...errors, ...[...live].flatMap((value) => {
      const reference = references.get(value);
      return reference === undefined || isProtected(reference, state) ? [] : [violation(
        fn, block.label.name, index, value, `Heap reference ${value} is live across collection without a root on every path`
      )];
    })];
  }));
}

function violation(fn: BuiltLlvmFunction, blockName: string, instructionIndex: number, value: string, message: string): GcViolation {
  return { functionName: fn.spec.name, blockName, instructionIndex, value, message };
}
