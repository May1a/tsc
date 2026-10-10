import type { ResolvedValueExpression } from "../binding-resolution/index.js";
import type { VariantOfKind } from "../dispatch.js";
import { type LlvmValue, llvm } from "../llvm-ir/index.js";
import { type ExpressionContext, type NativeString, boxString } from "./expression-context.js";
import type { BoxedValue } from "./value-boundary.js";

export type ValueNode<K extends ResolvedValueExpression["kind"]> = VariantOfKind<ResolvedValueExpression, K>;

export function keep(value: BoxedValue, context: ExpressionContext): BoxedValue {
  context.roots.push(value);
  return value;
}

export function literalString(value: string, context: ExpressionContext): NativeString {
  const block = context.cursor.currentBlock();
  return { bytes: block.globalPointer(context.stringConstant(value)), length: block.int(llvm.i64, BigInt(new TextEncoder().encode(value).length)) };
}

export function stringValue(value: string, context: ExpressionContext): BoxedValue {
  return boxString(literalString(value, context), context);
}

export function undefinedValue(context: ExpressionContext): BoxedValue {
  return context.values.forBlock(context.cursor.currentBlock()).immediate("undefined");
}

export function numericValue(number: LlvmValue<typeof llvm.double>, context: ExpressionContext): BoxedValue {
  return context.values.forBlock(context.cursor.currentBlock()).boxNumber(number);
}

export function nullish(value: BoxedValue, context: ExpressionContext): LlvmValue<typeof llvm.i1> {
  const block = context.cursor.currentBlock();
  const boundary = context.values.forBlock(block);
  return block.or(boundary.isImmediate(value, "undefined"), boundary.isImmediate(value, "null"), context.cursor.uniqueName("nullish"));
}

export function property(receiver: BoxedValue, key: NativeString, context: ExpressionContext): BoxedValue {
  return context.runtime.callWithCompletion("checkedValuePropertyGet", [receiver, key.length, key.bytes],
    context.cursor.uniqueName("property"), context.exceptionTarget());
}

export function arrayPointer(reference: ValueNode<"arrayRef">["name"], context: ExpressionContext): LlvmValue<typeof llvm.ptr> {
  const value = keep(context.bindings.value(reference), context);
  return context.runtime.callPointer("valueArrayPtr", [value], context.cursor.uniqueName("array.pointer"));
}
