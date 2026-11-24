import type { ResolvedValueExpression } from "../binding-resolution/index.js";
import { type VariantHandlers, dispatchKind } from "../dispatch.js";
import { type ExpressionContext, boxBoolean, boxString } from "./expression-context.js";
import type { BoxedValue } from "./value-boundary.js";
import { arrayAccess, arrayAt, arrayIncludes, arrayRemove, boxedMethod, boxedPrimitive, freshRuntimeArray, objectLiteral, privateField } from "./value-aggregates.js";
import { coalesce, lazyDefault, logical, optionalChain, ternary } from "./value-branches.js";
import { jsonParse, jsonStringify, objectAssignValue, objectEnumerateValue, objectStateValue, regexCompile, regexMatch, regexSplitValue, stringCodeUnit, stringIndex, stringLocaleCompare, stringPredicate, stringSplitValue } from "./value-builtins.js";
import { callValue, constructValue, newInstance } from "./value-invocations.js";
import { type ValueNode, arrayPointer, keep, literalString, numericValue, property, stringValue, undefinedValue } from "./value-support.js";
import { errorClassId } from "./error-classes.js";
import { llvm } from "../llvm-ir/index.js";

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
  newTarget: (_expression, context) => context.runtime.callBoxed("newTargetGet", [], context.cursor.uniqueName("new.target")),
  newInstance,
  taggedTemplateValue: (expression, context) => context.calls.tagged(expression),
  valuePlus: (expression, context) => {
    const left = keep(context.expressions.value(expression.left), context);
    const right = keep(context.expressions.value(expression.right), context);
    return keep(context.runtime.callWithCompletion("valuePlus", [left, right], context.cursor.uniqueName("value.plus"),
      context.exceptionTarget()), context);
  },
  boxedMethodCall: boxedMethod,
  boxedPrimitive,
  objectRef: (expression, context) => context.bindings.value(expression.name),
  arrayRef: (expression, context) => context.bindings.value(expression.name),
  objectLiteralValue: (expression, context) => objectLiteral(expression.value, context),
  runtimeArrayValue: (expression, context) => freshRuntimeArray(expression.elements, context),
  objectFreeze: objectStateValue,
  objectSeal: objectStateValue,
  objectPreventExtensions: objectStateValue,
  objectAssignValue,
  objectEnumerateValue,
  stringSplitValue,
  regexSplitValue,
  assignVariableValue: (expression, context) => {
    const value = keep(context.expressions.value(expression.value), context);
    context.bindings.storeValue(expression.name, value);
    return value;
  },
  propertyStoreValue: (expression, context) => {
    const receiver = keep(context.expressions.value(expression.receiver), context);
    const key = context.expressions.string(expression.key);
    boxString(key, context);
    const value = keep(context.expressions.value(expression.value), context);
    context.runtime.callWithCompletion("valueObjectSet", [receiver, key.length, key.bytes, value],
      context.cursor.uniqueName("property.store"), context.exceptionTarget());
    return value;
  },
  privateFieldStoreValue: (expression, context) => {
    const receiver = keep(context.expressions.value(expression.receiver), context);
    const value = keep(context.expressions.value(expression.value), context);
    const key = literalString(expression.key, context);
    const message = stringValue(expression.message, context);
    context.runtime.callWithCompletion("valuePrivateSet", [receiver, key.length, key.bytes, value, message],
      context.cursor.uniqueName("private.store"), context.exceptionTarget());
    return value;
  },
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
    if (expression.index.kind === "literal") {
      return property(receiver, context.expressions.string(expression.key), context);
    }
    const index = context.expressions.number(expression.index);
    const key = context.runtime.callString("numberToShortestString", [index], context.cursor.uniqueName("index.key"));
    return property(receiver, key, context);
  },
  privateFieldAccess: privateField,
  runtimeMapGet: (expression, context) => {
    const owner = keep(context.bindings.value(expression.mapName), context);
    const map = context.values.forBlock(context.cursor.currentBlock()).unboxReference(owner);
    const key = keep(context.expressions.value(expression.key), context);
    return context.runtime.callBoxed("collectionGet", [map, key], context.cursor.uniqueName("map.get"));
  },
  runtimeCollectionIterator: (expression, context) => {
    const owner = keep(context.bindings.value(expression.collectionName), context);
    const collection = context.values.forBlock(context.cursor.currentBlock()).unboxReference(owner);
    const block = context.cursor.currentBlock();
    const sourceKind = block.int(llvm.i64, expression.sourceKind === "map" ? 2n : 3n);
    const modes = { keys: 0n, values: 1n, entries: 2n } as const;
    const mode = block.int(llvm.i64, modes[expression.iterationKind]);
    return context.runtime.callBoxed("createCollectionIterator", [collection, sourceKind, mode],
      context.cursor.uniqueName("collection.iterator"));
  },
  runtimeCollectionClear: (expression, context) => {
    const owner = keep(context.bindings.value(expression.collectionName), context);
    const collection = context.values.forBlock(context.cursor.currentBlock()).unboxReference(owner);
    context.runtime.callVoid("collectionClear", [collection]);
    return undefinedValue(context);
  },
  runtimeCollectionForEach: (expression, context) => {
    const owner = keep(context.bindings.value(expression.collectionName), context);
    const collection = context.values.forBlock(context.cursor.currentBlock()).unboxReference(owner);
    const callback = keep(context.expressions.value(expression.callback), context);
    const thisArg = expression.thisArg === undefined ? undefinedValue(context) : keep(context.expressions.value(expression.thisArg), context);
    const isMap = context.cursor.currentBlock().int(llvm.i1, expression.isMap ? 1n : 0n);
    return context.runtime.callWithCompletion("collectionForEach", [collection, isMap, callback, thisArg],
      context.cursor.uniqueName("collection.for.each"), context.exceptionTarget());
  },
  dateNew: (expression, context) => {
    const milliseconds = expression.milliseconds === undefined
      ? context.runtime.call("dateNow", [], context.cursor.uniqueName("date.now"))
      : context.expressions.number(expression.milliseconds);
    return context.runtime.callBoxed("dateNew", [milliseconds], context.cursor.uniqueName("date.new"));
  },
  generatorCreate: (expression, context) => {
    const step = keep(context.expressions.value(expression.step), context);
    return context.runtime.callBoxed("generatorCreate", [step], context.cursor.uniqueName("generator.create"));
  },
  asyncStart: (expression, context) => {
    const step = keep(context.expressions.value(expression.step), context);
    return context.runtime.callBoxed("asyncStart", [step], context.cursor.uniqueName("async.start"));
  },
  iteratorResult: (expression, context) => {
    const value = keep(context.expressions.value(expression.value), context);
    const done = context.cursor.currentBlock().int(llvm.i1, expression.done ? 1n : 0n);
    return context.runtime.callBoxed("iteratorResultObject", [value, done], context.cursor.uniqueName("iterator.result"));
  },
  iteratorOpen: (expression, context) => {
    const iterable = keep(context.expressions.value(expression.iterable), context);
    return context.runtime.callWithCompletion("getIteratorValue",
      [iterable, stringValue(expression.notIterableMessage, context)],
      context.cursor.uniqueName("iterator.open"), context.exceptionTarget());
  },
  promiseNew: (expression, context) => {
    const executor = keep(context.expressions.value(expression.executor), context);
    return context.runtime.callWithCompletion("promiseNew", [executor], context.cursor.uniqueName("promise.new"), context.exceptionTarget());
  },
  promiseStatic: (expression, context) => {
    const runtimeByMethod = {
      resolve: "promiseResolveStatic",
      reject: "promiseRejectStatic",
      all: "promiseAll",
      race: "promiseRace",
      allSettled: "promiseAllSettled",
      any: "promiseAny"
    } as const;
    const argument = expression.argument === undefined ? undefinedValue(context) : keep(context.expressions.value(expression.argument), context);
    return context.runtime.callBoxed(runtimeByMethod[expression.method], [argument], context.cursor.uniqueName("promise.static"));
  },
  ternary,
  lazyDefault,
  logicalValue: logical,
  nullishCoalesce: coalesce,
  optionalChain,
  optionalTarget: (_expression, context) => context.optional.current(),
  unresolvableReference: (expression, context) => context.runtime.callWithCompletion("errorThrowReference",
    [stringValue(expression.message, context)], context.cursor.uniqueName("reference.error"), context.exceptionTarget()),
  errorConstructor: (expression, context) => context.runtime.callBoxed("errorConstructorValue",
    [context.cursor.currentBlock().int(llvm.i64, BigInt(errorClassId(expression.errorName)))], context.cursor.uniqueName("error.constructor")),
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
  stringLocaleCompare,
  stringIndexOf: stringIndex,
  stringLastIndexOf: stringIndex,
  collectionNewValue: (expression, context) => {
    const kindCode = { map: 0n, set: 1n, weakMap: 2n, weakSet: 3n }[expression.collectionKind];
    const kind = context.cursor.currentBlock().int(llvm.i64, kindCode);
    if (expression.iterable === undefined) {
      const pointer = context.runtime.callPointer("collectionNewWithKind", [kind], context.cursor.uniqueName("collection.new"));
      return keep(context.values.forBlock(context.cursor.currentBlock()).boxReference("object", pointer), context);
    }
    const iterable = keep(context.expressions.value(expression.iterable), context);
    const message = stringValue(expression.notIterableMessage ?? "Collection source is not iterable", context);
    return keep(context.runtime.callWithCompletion("collectionFromIterableWithKind", [iterable, message, kind],
      context.cursor.uniqueName("collection.from.iterable"), context.exceptionTarget()), context);
  },
  classAdoptSuper: (expression, context) => {
    const instance = keep(context.expressions.value(expression.instance), context);
    const returned = keep(context.expressions.value(expression.returned), context);
    const prototype = keep(context.bindings.value(expression.prototypeName), context);
    const protoPtr = context.runtime.callPointer("valueObjectPtr", [prototype], context.cursor.uniqueName("super.proto"));
    return keep(context.runtime.callBoxed("classAdoptSuper", [instance, returned, protoPtr], context.cursor.uniqueName("super.adopt")), context);
  },
  nodeGlobal: (expression, context) => {
    const helpers = {
      process: "nodeProcessGet",
      Buffer: "nodeBufferObject",
      globalThis: "jsGlobalThisObject",
      Symbol: "symbolConstructorObject",
      Object: "jsObjectConstructor",
      Reflect: "jsReflectObject",
      Array: "jsArrayConstructor",
      performance: "jsPerformanceObject",
      setTimeout: "jsSetTimeoutFn",
      clearTimeout: "jsClearTimeoutFn",
      BigInt: "jsBigIntConstructor",
      Proxy: "jsProxyConstructor",
      Date: "jsDateConstructor",
      RegExp: "jsRegExpConstructor",
      Int32Array: "jsInt32ArrayConstructor",
      Uint32Array: "jsUint32ArrayConstructor",
      AbortController: "jsAbortControllerConstructor",
      Intl: "jsIntlObject",
      Math: "jsMathObject",
      String: "jsStringConstructor",
      Number: "jsNumberConstructor",
      Boolean: "jsBooleanConstructor",
      setInterval: "jsSetIntervalFn",
      clearInterval: "jsClearIntervalFn",
      Map: "jsMapConstructor",
      Set: "jsSetConstructor",
      WeakMap: "jsWeakMapConstructor",
      WeakSet: "jsWeakSetConstructor",
      Uint8Array: "jsUint8ArrayConstructor",
      Float64Array: "jsFloat64ArrayConstructor",
      URL: "jsURLConstructor",
      console: "jsConsoleObject",
      JSON: "jsJsonObject"
    } as const;
    return keep(context.runtime.callBoxed(helpers[expression.name], [], context.cursor.uniqueName("js.global")), context);
  },
  nodeBuiltinModule: (expression, context) => {
    const helpers = {
      fs: "nodeFsModule",
      path: "nodePathModule",
      os: "nodeOsModule",
      child_process: "nodeChildProcessModule"
    } as const;
    return keep(context.runtime.callBoxed(helpers[expression.moduleName], [], context.cursor.uniqueName("node.module")), context);
  },
  uint8ArrayNew: (expression, context) => {
    const arg = expression.argument === undefined ? undefinedValue(context) : keep(context.expressions.value(expression.argument), context);
    return keep(context.runtime.callBoxed("nodeUint8ArrayNew", [arg], context.cursor.uniqueName("uint8array.new")), context);
  },
  propertyUpdateValue: (expression, context) => {
    const receiver = keep(context.expressions.value(expression.receiver), context);
    const key = context.expressions.string(expression.key);
    boxString(key, context);
    const previous = keep(property(receiver, key, context), context);
    const currentNum = context.runtime.call("valueToNumber", [previous], context.cursor.uniqueName("prop.update.num"));
    const block = context.cursor.currentBlock();
    const delta = block.double(expression.operator === "increment" ? 1 : -1);
    const updatedNum = block.fadd(currentNum, delta, context.cursor.uniqueName("prop.update.next"));
    const updatedVal = keep(numericValue(updatedNum, context), context);
    context.runtime.callWithCompletion("valueObjectSet", [receiver, key.length, key.bytes, updatedVal],
      context.cursor.uniqueName("prop.update.store"), context.exceptionTarget());
    return expression.prefix ? updatedVal : keep(numericValue(currentNum, context), context);
  },
  variableUpdateValue: (expression, context) => {
    const previous = keep(context.bindings.value(expression.name), context);
    const currentNum = context.runtime.call("valueToNumber", [previous], context.cursor.uniqueName("var.update.num"));
    const block = context.cursor.currentBlock();
    const delta = block.double(expression.operator === "increment" ? 1 : -1);
    const updatedNum = block.fadd(currentNum, delta, context.cursor.uniqueName("var.update.next"));
    const updatedVal = keep(numericValue(updatedNum, context), context);
    context.bindings.storeValue(expression.name, updatedVal);
    return expression.prefix ? updatedVal : keep(numericValue(currentNum, context), context);
  },
  bigIntLiteral: (expression, context) => {
    const text = literalString(expression.value, context);
    return keep(context.runtime.callBoxed("bigIntFromString", [text.bytes, text.length], context.cursor.uniqueName("bigint.lit")), context);
  },
  valueBinaryOp: (expression, context) => {
    const left = keep(context.expressions.value(expression.left), context);
    const right = keep(context.expressions.value(expression.right), context);
    const opCodes = {
      subtract: 0n,
      multiply: 1n,
      divide: 2n,
      modulo: 3n,
      exponent: 4n,
      bitAnd: 5n,
      bitOr: 6n,
      bitXor: 7n,
      shiftLeft: 8n,
      shiftRight: 9n,
      unsignedShiftRight: 10n
    } as const;
    const op = context.cursor.currentBlock().int(llvm.i64, opCodes[expression.operator]);
    return keep(context.runtime.callBoxed("valueBinaryOp", [op, left, right], context.cursor.uniqueName("val.binop")), context);
  },
  valueUnaryOp: (expression, context) => {
    const value = keep(context.expressions.value(expression.value), context);
    const op = context.cursor.currentBlock().int(llvm.i64, expression.operator === "negate" ? 0n : 1n);
    return keep(context.runtime.callBoxed("valueUnaryOp", [op, value], context.cursor.uniqueName("val.unop")), context);
  },
  constructValue
};

export function lowerValueExpression(expression: ResolvedValueExpression, context: ExpressionContext): BoxedValue {
  return keep(dispatchKind(handlers, expression, context), context);
}
