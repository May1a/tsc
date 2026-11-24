import { llvm } from "../llvm-ir/index.js";
import { type ExpressionContext, boxString } from "./expression-context.js";
import { numberIndex } from "./numbers.js";
import type { BoxedValue } from "./value-boundary.js";
import { type ValueNode, arrayPointer, keep, numericValue, undefinedValue } from "./value-support.js";

export function jsonParse(expression: ValueNode<"jsonParse">, context: ExpressionContext): BoxedValue {
  const text = keep(context.expressions.value(expression.text), context);
  const reviver = expression.reviver === undefined ? undefinedValue(context) : keep(context.expressions.value(expression.reviver), context);
  return context.runtime.callWithCompletion("jsonParse", [text, reviver], context.cursor.uniqueName("json.parse"), context.exceptionTarget());
}

export function jsonStringify(expression: ValueNode<"jsonStringify">, context: ExpressionContext): BoxedValue {
  const source = keep(context.expressions.value(expression.value), context);
  const filter = expression.replacerName === undefined ? context.cursor.currentBlock().nullPtr()
    : arrayPointer(expression.replacerName, context);
  const indent = context.cursor.currentBlock().int(llvm.i64, BigInt(expression.indent));
  return context.runtime.callWithCompletion("jsonStringify", [source, filter, indent], context.cursor.uniqueName("json.stringify"), context.exceptionTarget());
}

export function regexCompile(expression: ValueNode<"regexCompile">, context: ExpressionContext): BoxedValue {
  const pattern = boxString(context.expressions.string(expression.pattern), context);
  const flags = boxString(context.expressions.string(expression.flags), context);
  return context.runtime.callWithCompletion("regexCompile", [pattern, flags], context.cursor.uniqueName("regex.compile"), context.exceptionTarget());
}

export function regexMatch(expression: ValueNode<"regexExec"> | ValueNode<"regexMatch">, context: ExpressionContext): BoxedValue {
  const regex = keep(context.expressions.value(expression.regex), context);
  const input = boxString(context.expressions.string(expression.input), context);
  return context.runtime.callWithCompletion(expression.kind, [regex, input], context.cursor.uniqueName(expression.kind), context.exceptionTarget());
}

export function stringPredicate(expression: ValueNode<"stringStartsWith">, context: ExpressionContext): BoxedValue {
  const receiver = context.expressions.string(expression.receiver);
  boxString(receiver, context);
  const search = context.expressions.string(expression.search);
  boxString(search, context);
  const prefix = [receiver.length, receiver.bytes, search.length, search.bytes];
  const position = expression.position === undefined ? undefined : numberIndex(expression.position, context);
  const result = expression.kind === "stringStartsWith"
    ? context.runtime.call(position === undefined ? "stringStartsWith" : "stringStartsWithAt", position === undefined ? prefix : [...prefix, position], context.cursor.uniqueName("starts.with"))
    : context.runtime.call("stringEndsWith", prefix, context.cursor.uniqueName("ends.with"));
  const block = context.cursor.currentBlock();
  const boundary = context.values.forBlock(block);
  return block.select(result, boundary.immediate("true"), boundary.immediate("false"), context.cursor.uniqueName("string.predicate"));
}

export function stringCodeUnit(expression: ValueNode<"stringCharCodeAt">, context: ExpressionContext): BoxedValue {
  const receiver = context.expressions.string(expression.receiver);
  boxString(receiver, context);
  const index = numberIndex(expression.index, context);
  const result = context.runtime.call("stringCharCodeAt", [receiver.length, receiver.bytes, index], context.cursor.uniqueName("string.code"));
  return numericValue(result, context);
}

export function stringLocaleCompare(expression: ValueNode<"stringLocaleCompare">, context: ExpressionContext): BoxedValue {
  const receiver = context.expressions.string(expression.receiver);
  boxString(receiver, context);
  const other = context.expressions.string(expression.other ?? { kind: "literal", value: "" });
  boxString(other, context);
  const result = context.runtime.call("stringLocaleCompare", [receiver.length, receiver.bytes, other.length, other.bytes],
    context.cursor.uniqueName("string.locale.compare"));
  return numericValue(result, context);
}

export function stringIndex(expression: ValueNode<"stringIndexOf">, context: ExpressionContext): BoxedValue {
  const receiver = context.expressions.string(expression.receiver);
  boxString(receiver, context);
  const search = context.expressions.string(expression.search);
  boxString(search, context);
  const prefix = [receiver.length, receiver.bytes, search.length, search.bytes];
  if (expression.kind === "stringLastIndexOf") {
    return numericValue(context.runtime.call("stringLastIndexOf", prefix, context.cursor.uniqueName("string.last.index")), context);
  }
  const position = numberIndex(expression.position ?? { kind: "literal", value: 0 }, context);
  return numericValue(context.runtime.call("stringIndexOf", [...prefix, position], context.cursor.uniqueName("string.index")), context);
}

export function stringSplitValue(expression: ValueNode<"stringSplitValue">, context: ExpressionContext): BoxedValue {
  const receiver = context.expressions.string(expression.receiver);
  boxString(receiver, context);
  const separator = context.expressions.string(expression.separator);
  boxString(separator, context);
  const limit = expression.limit === undefined ? context.cursor.currentBlock().int(llvm.i64, -1n) : numberIndex(expression.limit, context);
  const array = context.runtime.callPointer("stringSplit", [receiver.length, receiver.bytes, separator.length, separator.bytes, limit],
    context.cursor.uniqueName("string.split"));
  return keep(context.values.forBlock(context.cursor.currentBlock()).boxReference("array", array), context);
}

export function regexSplitValue(expression: ValueNode<"regexSplitValue">, context: ExpressionContext): BoxedValue {
  const receiver = boxString(context.expressions.string(expression.receiver), context);
  const regex = keep(context.expressions.value(expression.regex), context);
  const limit = expression.limit === undefined ? context.cursor.currentBlock().int(llvm.i64, -1n) : numberIndex(expression.limit, context);
  const array = context.runtime.callPointer("regexSplit", [regex, receiver, limit], context.cursor.uniqueName("regex.split"));
  return keep(context.values.forBlock(context.cursor.currentBlock()).boxReference("array", array), context);
}

const objectStateHelpers = {
  objectFreeze: "valueObjectFreeze",
  objectSeal: "valueObjectSeal",
  objectPreventExtensions: "valueObjectPreventExtensions"
} as const;

export function objectStateValue(
  expression: ValueNode<"objectFreeze">,
  context: ExpressionContext
): BoxedValue {
  const value = keep(context.expressions.value(expression.value), context);
  return context.runtime.callBoxed(objectStateHelpers[expression.kind], [value], context.cursor.uniqueName("object.state"));
}

export function objectAssignValue(expression: ValueNode<"objectAssignValue">, context: ExpressionContext): BoxedValue {
  let target = keep(context.expressions.value(expression.target), context);
  for (const sourceExpression of expression.sources) {
    const source = keep(context.expressions.value(sourceExpression), context);
    target = keep(context.runtime.callBoxed("valueObjectAssignValue", [target, source], context.cursor.uniqueName("object.assign")), context);
  }
  return target;
}

const objectEnumerateHelpers = {
  keys: "valueObjectKeys",
  values: "valueObjectValues",
  entries: "valueObjectEntries",
  getOwnPropertyNames: "valueObjectOwnPropertyNames"
} as const;

export function objectEnumerateValue(expression: ValueNode<"objectEnumerateValue">, context: ExpressionContext): BoxedValue {
  const target = keep(context.expressions.value(expression.target), context);
  const array = context.runtime.callPointer(objectEnumerateHelpers[expression.method], [target], context.cursor.uniqueName("object.enum"));
  return keep(context.values.forBlock(context.cursor.currentBlock()).boxReference("array", array), context);
}
