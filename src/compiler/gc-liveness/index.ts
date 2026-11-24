import {
  type BuiltLlvmFunction,
  type LlvmInstruction,
  llvmValueText
} from "../llvm-ir/index.js";
import { runtimeContracts } from "../runtime-contracts/index.js";
import type { RuntimeCallContract } from "../runtime-contracts/types.js";
import { type LiveNames, liveAcross, liveOutOf } from "./liveness.js";
import { RootWalk, isProtected, rootsEntering } from "./roots.js";
import type { GcFunctionFacts, GcViolation } from "./types.js";

export type { GcFunctionFacts, GcHeapReference, GcProtection, GcViolation } from "./types.js";

const contractsByName: ReadonlyMap<string, RuntimeCallContract> =
  new Map(Object.values(runtimeContracts).map((contract) => [contract.name, contract]));

function canCollect(instruction: LlvmInstruction): boolean {
  return instruction.kind === "call" &&
    (instruction.callee.kind === "pointer" || contractsByName.get(instruction.callee.name)?.effects.collects !== false);
}

export function verifyGcLiveness(fn: BuiltLlvmFunction, facts: GcFunctionFacts): readonly GcViolation[] {
  const references = new Map(facts.heapReferences.map((reference) => [llvmValueText(reference.value), reference]));
  const frames = rootFrameNames(fn);
  const heapNames: LiveNames = (operand) => references.has(llvmValueText(operand)) ? [llvmValueText(operand)] : [];
  // The root states must also keep what protects a live reference, and the frames still to be restored.
  const consultedNames: LiveNames = (operand) => {
    const name = llvmValueText(operand);
    const reference = references.get(name);
    if (reference !== undefined) { return [name, llvmValueText(reference.protection.value)]; }
    return frames.has(name) ? [name] : [];
  };
  const liveOut = liveOutOf(fn, heapNames);
  const entering = rootsEntering(fn, facts, liveOutOf(fn, consultedNames));
  return fn.blocks.flatMap((block) => {
    const input = entering.get(block.label.name);
    if (input === undefined) { return []; }
    const across = liveAcross(block, liveOut.get(block.label.name) ?? new Set(), heapNames, canCollect);
    const walk = new RootWalk(input);
    return block.instructions.flatMap((instruction, index) => {
      const unprotected = [...across.get(instruction) ?? []].filter((name) => {
        const reference = references.get(name);
        return reference !== undefined && !isProtected(reference, walk.state());
      });
      const frameError = walk.step(instruction);
      return [
        ...frameError === undefined ? [] : [violation(fn, block.label.name, index, "", frameError)],
        ...unprotected.map((name) => violation(
          fn, block.label.name, index, name, `Heap reference ${name} is live across collection without a root on every path`
        ))
      ];
    });
  });
}

function rootFrameNames(fn: BuiltLlvmFunction): ReadonlySet<string> {
  return new Set(fn.blocks.flatMap((block) => block.instructions.flatMap((instruction) =>
    instruction.kind === "call" && instruction.callee.kind === "symbol" && instruction.callee.name === "gcRootSave" &&
    instruction.result !== undefined ? [llvmValueText(instruction.result)] : [])));
}

function violation(fn: BuiltLlvmFunction, blockName: string, instructionIndex: number, value: string, message: string): GcViolation {
  return { functionName: fn.spec.name, blockName, instructionIndex, value, message };
}
