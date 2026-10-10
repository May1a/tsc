import type { ResolvedRuntimeObjectValue } from "../binding-resolution/index.js";
import { llvm } from "../llvm-ir/index.js";
import { branchValue } from "./expression-branches.js";
import { numberIndex } from "./numbers.js";
import { type ExpressionContext, boxString } from "./expression-context.js";
import type { BoxedValue } from "./value-boundary.js";
import { type ValueNode, arrayPointer, keep, literalString, numericValue, property, stringValue, undefinedValue } from "./value-support.js";

export function freshArray(values: readonly (() => BoxedValue)[], context: ExpressionContext): BoxedValue {
  const block = context.cursor.currentBlock();
  const array = context.runtime.callPointer("arrayNew", [block.int(llvm.i64, BigInt(values.length))], context.cursor.uniqueName("array.literal"));
  const boxed = keep(context.values.forBlock(context.cursor.currentBlock()).boxReference("array", array), context);
  for (const [index, evaluate] of values.entries()) {
    const value = keep(evaluate(), context);
    context.runtime.callVoid("arraySet", [array, context.cursor.currentBlock().int(llvm.i64, BigInt(index)), value]);
  }
  return boxed;
}

export function objectLiteral(value: ResolvedRuntimeObjectValue, context: ExpressionContext): BoxedValue {
  const block = context.cursor.currentBlock();
  const count = value.fields.filter((field) => field.kind === "field").length;
  const object = context.runtime.callPointer("objectNew", [block.int(llvm.i64, BigInt(count))], context.cursor.uniqueName("object.literal"));
  const boxed = keep(context.values.forBlock(context.cursor.currentBlock()).boxReference("object", object), context);
  for (const field of value.fields) {
    if (field.kind === "spread") {
      const source = keep(context.bindings.value(field.sourceName), context);
      context.runtime.callVoid("valueObjectAssign", [object, source]);
    } else {
      const key = context.expressions.string(field.key);
      boxString(key, context);
      const propertyValue = keep(context.expressions.value(field.value), context);
      context.runtime.callVoid("objectSet", [object, key.length, key.bytes, propertyValue]);
    }
  }
  return boxed;
}

export function arrayAccess(expression: ValueNode<"arrayAccess">, context: ExpressionContext): BoxedValue {
  const length = context.bindings.fixedArrayLength(expression.arrayName);
  if (length !== undefined && expression.key === undefined) {
    const number = context.expressions.number(expression.index);
    const index = context.runtime.call("numberToIndex", [number], context.cursor.uniqueName("array.index"));
    const block = context.cursor.currentBlock();
    const integer = block.cast("sitofp", index, llvm.double, context.cursor.uniqueName("array.integer"));
    const exact = block.fcmp("oeq", number, integer, context.cursor.uniqueName("array.exact.index"));
    const inBounds = block.icmp("ult", index, block.int(llvm.i64, BigInt(length)), context.cursor.uniqueName("array.in.bounds"));
    const valid = block.and(exact, inBounds, context.cursor.uniqueName("array.valid.index"));
    const result = branchValue(context.cursor, valid, llvm.i64, () => {
      const slot = context.bindings.arrayElement(expression.arrayName, index);
      return numericValue(context.cursor.currentBlock().load(llvm.double, slot, context.cursor.uniqueName("array.number")), context);
    }, () => undefinedValue(context), "array.fixed.access");
    return context.values.forBlock(context.cursor.currentBlock()).fromBoundary(result);
  }
  const receiver = keep(context.bindings.value(expression.arrayName), context);
  const index = numberIndex(expression.index, context);
  if (expression.key !== undefined) {
    return property(receiver, context.expressions.string(expression.key), context);
  }
  return context.runtime.callBoxed("valueArrayGet", [receiver, index, context.cursor.currentBlock().int(llvm.i64, 0n),
    context.cursor.currentBlock().nullPtr()], context.cursor.uniqueName("array.get"));
}

export function arrayRemove(expression: ValueNode<"arrayPop">, context: ExpressionContext): BoxedValue {
  const array = arrayPointer(expression.arrayName, context);
  return context.runtime.callBoxed(expression.kind, [array], context.cursor.uniqueName("array.remove"));
}

export function arrayAt(expression: ValueNode<"arrayAt">, context: ExpressionContext): BoxedValue {
  const array = arrayPointer(expression.arrayName, context);
  const index = numberIndex(expression.index, context);
  return context.runtime.callBoxed("arrayAt", [array, index], context.cursor.uniqueName("array.at"));
}

export function arrayIncludes(expression: ValueNode<"arrayIncludes">, context: ExpressionContext): BoxedValue {
  const array = arrayPointer(expression.arrayName, context);
  const value = keep(context.expressions.value(expression.value), context);
  const included = context.runtime.call("arrayIncludes", [array, value], context.cursor.uniqueName("array.includes"));
  const block = context.cursor.currentBlock();
  const boundary = context.values.forBlock(block);
  return block.select(included, boundary.immediate("true"), boundary.immediate("false"), context.cursor.uniqueName("includes.value"));
}

export function privateField(expression: ValueNode<"privateFieldAccess">, context: ExpressionContext): BoxedValue {
  const receiver = keep(context.expressions.value(expression.receiver), context);
  const key = literalString(expression.key, context);
  const branded = context.runtime.call("valueObjectHasOwn", [receiver, key.length, key.bytes], context.cursor.uniqueName("private.brand"));
  const valid = context.cursor.reserveBlock("private.valid");
  const invalid = context.cursor.reserveBlock("private.invalid");
  context.cursor.currentBlock().condBr(branded, valid, invalid);
  context.cursor.openBlock(invalid);
  const message = stringValue(expression.message, context);
  context.runtime.callWithCompletion("iteratorTypeError", [message], context.cursor.uniqueName("private.error"), context.exceptionTarget());
  context.cursor.currentBlock().unreachable();
  context.cursor.openBlock(valid);
  return property(receiver, key, context);
}

export function boxedPrimitive(expression: ValueNode<"boxedPrimitive">, context: ExpressionContext): BoxedValue {
  const inner = keep(context.expressions.value(expression.inner), context);
  const object = context.runtime.callPointer("objectNew", [context.cursor.currentBlock().int(llvm.i64, expression.storeLength === true ? 2n : 1n)],
    context.cursor.uniqueName("primitive.object"));
  const boxed = keep(context.values.forBlock(context.cursor.currentBlock()).boxReference("object", object), context);
  const primitiveKey = literalString("primitive", context);
  context.runtime.callVoid("objectSet", [object, primitiveKey.length, primitiveKey.bytes, inner]);
  if (expression.storeLength === true) {
    const length = context.runtime.call("valueStringLength", [inner], context.cursor.uniqueName("primitive.length"));
    const number = context.cursor.currentBlock().cast("uitofp", length, llvm.double, context.cursor.uniqueName("primitive.length.number"));
    const key = literalString("length", context);
    context.runtime.callVoid("objectSet", [object, key.length, key.bytes, numericValue(number, context)]);
  }
  return boxed;
}

export function boxedMethod(expression: ValueNode<"boxedMethodCall">, context: ExpressionContext): BoxedValue {
  const receiver = keep(context.expressions.value(expression.receiver), context);
  const object = context.runtime.callPointer("valueObjectPtr", [receiver], context.cursor.uniqueName("boxed.pointer"));
  if (expression.method === "valueOf") {
    return context.runtime.callBoxed("boxedValueOf", [object], context.cursor.uniqueName("boxed.value.of"));
  }
  return boxString(context.runtime.callString("boxedToString", [object], context.cursor.uniqueName("boxed.string")), context);
}
