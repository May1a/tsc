import {
  type LlvmCallSignature, type LlvmFunctionSpec, type LlvmValue, llvm
} from "../llvm-ir/index.js";
import type { BlockCursor } from "./cursor.js";
import type { HeapFacts } from "./gc.js";
import { type ExceptionTarget, completionAggregate } from "./completion.js";
import type { BoxedValue } from "./value-boundary.js";

export type CompletionFunctionSpec = LlvmFunctionSpec & { readonly returns: typeof completionAggregate };
export type CompletionCallSignature = LlvmCallSignature & { readonly returns: typeof completionAggregate };

export interface CompletionCallCapability {
  direct(spec: CompletionFunctionSpec, args: readonly LlvmValue[], name: string, exception: ExceptionTarget): BoxedValue;
  indirect(pointer: LlvmValue<typeof llvm.ptr>, signature: CompletionCallSignature,
    args: readonly LlvmValue[], name: string, exception: ExceptionTarget): BoxedValue;
  returnValue(value: BoxedValue): void;
  throwValue(value: BoxedValue): void;
}

export function consumeCompletion(
  cursor: BlockCursor, facts: HeapFacts, result: LlvmValue<typeof completionAggregate>, name: string, exception: ExceptionTarget
): BoxedValue {
  const block = cursor.currentBlock();
  const payload = block.extractValue(result, 0, `${name}.payload`);
  const threw = block.extractValue(result, 1, `${name}.threw`);
  facts.boxed(payload);
  const failed = cursor.reserveBlock(`${name}.failed`);
  const continued = cursor.reserveBlock(`${name}.continued`);
  block.condBr(threw, failed, continued);
  cursor.openBlock(failed);
  cursor.currentBlock().store(payload, exception.payloadSlot);
  cursor.currentBlock().br(exception.block);
  cursor.openBlock(continued);
  return payload;
}

export function createCompletionCalls(cursor: BlockCursor, facts: HeapFacts): CompletionCallCapability {
  function finish(value: BoxedValue, threw: boolean): void {
    const block = cursor.currentBlock();
    const payload = block.insertValue(block.undef(completionAggregate, "completion.empty"), value, 0, "completion.value");
    const result = block.insertValue(payload, block.int(llvm.i1, threw ? 1n : 0n), 1, "completion.result");
    block.ret(result);
  }
  return Object.freeze({
    direct(spec: CompletionFunctionSpec, args: readonly LlvmValue[], name: string, exception: ExceptionTarget) {
      const result = cursor.currentBlock().call<typeof completionAggregate, CompletionFunctionSpec>(spec, args, name);
      return consumeCompletion(cursor, facts, result, name, exception);
    },
    indirect(pointer: LlvmValue<typeof llvm.ptr>, signature: CompletionCallSignature,
      args: readonly LlvmValue[], name: string, exception: ExceptionTarget) {
      const result = cursor.currentBlock().callIndirect<typeof completionAggregate, CompletionCallSignature>(pointer, signature, args, name);
      return consumeCompletion(cursor, facts, result, name, exception);
    },
    returnValue(value: BoxedValue) { finish(value, false); },
    throwValue(value: BoxedValue) { finish(value, true); }
  });
}
