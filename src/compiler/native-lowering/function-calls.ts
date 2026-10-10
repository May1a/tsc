import { type LlvmValue, llvm } from "../llvm-ir/index.js";
import type { ExpressionContext } from "./expression-context.js";
import type { BoxedValue } from "./value-boundary.js";
import { keep, undefinedValue } from "./value-support.js";

export interface ArgumentBuffer {
  readonly count: LlvmValue<typeof llvm.i64>;
  readonly pointer: LlvmValue<typeof llvm.ptr>;
}

export function argumentBuffer(values: readonly BoxedValue[], context: ExpressionContext): ArgumentBuffer {
  const block = context.cursor.currentBlock();
  const count = block.int(llvm.i64, BigInt(values.length));
  const pointer = block.allocaArray(llvm.i64, count, context.cursor.uniqueName("arguments"));
  for (const [index, value] of values.entries()) {
    keep(value, context);
    const slot = block.getElementPtr(llvm.i64, pointer, [{ type: llvm.i64, value: BigInt(index) }], context.cursor.uniqueName("argument"));
    block.store(value, slot);
  }
  return { count, pointer };
}

export function invokeFunction(callee: BoxedValue, values: readonly BoxedValue[], context: ExpressionContext): BoxedValue {
  keep(callee, context);
  const args = argumentBuffer(values, context);
  const value = context.runtime.callWithCompletion("jsCall", [callee, args.count, args.pointer, undefinedValue(context)],
    context.cursor.uniqueName("function.call"), context.exceptionTarget());
  return keep(value, context);
}
