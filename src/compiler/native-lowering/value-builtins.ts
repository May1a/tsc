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
