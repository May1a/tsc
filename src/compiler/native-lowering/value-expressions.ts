import type { ResolvedValueExpression } from "../binding-resolution/index.js";
import { type VariantHandlers, dispatchKind } from "../dispatch.js";
import { type ExpressionContext, boxBoolean, boxString } from "./expression-context.js";
import type { BoxedValue } from "./value-boundary.js";
import { arrayAccess, arrayAt, arrayIncludes, arrayRemove, boxedMethod, boxedPrimitive, freshArray, objectLiteral, privateField } from "./value-aggregates.js";
import { coalesce, lazyDefault, logical, optionalChain, ternary } from "./value-branches.js";
import { jsonParse, jsonStringify, regexCompile, regexMatch, stringCodeUnit, stringIndex, stringPredicate } from "./value-builtins.js";
import { callValue, newInstance } from "./value-invocations.js";
import { type ValueNode, arrayPointer, keep, numericValue, property, undefinedValue } from "./value-support.js";
import { numberIndex } from "./numbers.js";

type ValueVariants = { readonly [K in ResolvedValueExpression["kind"]]: ValueNode<K> };

const handlers: VariantHandlers<ValueVariants, ExpressionContext, BoxedValue> = {
  undefined: (_expression, context) => undefinedValue(context),
  null: (_expression, context) => context.values.forBlock(context.cursor.currentBlock()).immediate("null"),
  number: (expression, context) => numericValue(context.expressions.number(expression.value), context),
  boolean: (expression, context) => boxBoolean(context.expressions.condition(expression.value), context),
  string: (expression, context) => boxString(context.expressions.string(expression.value), context),
  variable: (expression, context) => context.bindings.value(expression.name),
  call: (expression, context) => context.calls.direct(expression),
  callValue,
  functionObject: (expression, context) => context.calls.functionObject(expression),
  inlineCppValue: (expression, context) => context.calls.inlineCpp(expression.symbol),
  newInstance,
  taggedTemplateValue: (expression, context) => context.calls.tagged(expression),
  valuePlus: (expression, context) => {
    const left = keep(context.expressions.value(expression.left), context);
    const right = keep(context.expressions.value(expression.right), context);
    return context.runtime.callBoxed("valuePlus", [left, right], context.cursor.uniqueName("value.plus"));
  },
  boxedMethodCall: boxedMethod,
  boxedPrimitive,
  objectRef: (expression, context) => context.bindings.value(expression.name),
  arrayRef: (expression, context) => context.bindings.value(expression.name),
  objectLiteralValue: (expression, context) => objectLiteral(expression.value, context),
  runtimeArrayValue: (expression, context) => freshArray(expression.elements.map((element) => () => context.expressions.value(element)), context),
  arrayAccess,
  arrayPop: arrayRemove,
  arrayShift: arrayRemove,
  arrayIncludes,
  arrayAt,
  arrayFind: (expression, context) => context.runtime.callBoxed("arrayFind", [arrayPointer(expression.arrayName, context)], context.cursor.uniqueName("array.find")),
  arrayForEach: (_expression, context) => undefinedValue(context),
  objectDynamicAccess: (expression, context) => {
    const receiver = keep(context.bindings.value(expression.objectName), context);
    return property(receiver, context.expressions.string(expression.key), context);
  },
  valueObjectDynamicAccess: (expression, context) => {
    const receiver = keep(context.expressions.value(expression.value), context);
    return property(receiver, context.expressions.string(expression.key), context);
  },
  valueArrayAccess: (expression, context) => {
    const receiver = keep(context.expressions.value(expression.value), context);
    numberIndex(expression.index, context);
    return property(receiver, context.expressions.string(expression.key), context);
  },
  privateFieldAccess: privateField,
  runtimeMapGet: (expression, context) => {
    const owner = keep(context.bindings.value(expression.mapName), context);
    const map = context.values.forBlock(context.cursor.currentBlock()).unboxReference(owner);
    const key = keep(context.expressions.value(expression.key), context);
    return context.runtime.callBoxed("collectionGet", [map, key], context.cursor.uniqueName("map.get"));
  },
  ternary,
  lazyDefault,
  logicalValue: logical,
  nullishCoalesce: coalesce,
  optionalChain,
  optionalTarget: (_expression, context) => context.optional.current(),
  void: (expression, context) => {
    context.expressions.value(expression.expression);
    return undefinedValue(context);
  },
  sequence: (expression, context) => {
    context.expressions.value(expression.left);
    return context.expressions.value(expression.right);
  },
  jsonParse,
  jsonStringify,
  regexCompile,
  regexExec: regexMatch,
  regexMatch,
  stringStartsWith: stringPredicate,
  stringEndsWith: stringPredicate,
  stringCharCodeAt: stringCodeUnit,
  stringCodePointAt: stringCodeUnit,
  stringLocaleCompare: stringCodeUnit,
  stringIndexOf: stringIndex,
  stringLastIndexOf: stringIndex
};

export function lowerValueExpression(expression: ResolvedValueExpression, context: ExpressionContext): BoxedValue {
  return keep(dispatchKind(handlers, expression, context), context);
}
