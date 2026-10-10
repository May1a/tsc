import type { ResolvedOperation } from "../binding-resolution/index.js";
import type { VariantHandlers, VariantOfKind } from "../dispatch.js";
import { llvm } from "../llvm-ir/index.js";
import type { OperationContext } from "./operation-context.js";
import type { BoxedValue } from "./value-boundary.js";
import { keep, undefinedValue } from "./value-support.js";
import { initializeAggregate } from "./aggregate-support.js";

type CallbackKind =
  | "runtimeArrayMapCallback" | "runtimeArrayFlatMapCallback" | "runtimeArrayFilterCallback" | "runtimeArrayForEachCallback"
  | "runtimeArrayFindCallback" | "runtimeArrayFindIndexCallback" | "runtimeArrayReduceCallback" | "runtimeArrayMapFunctionObject"
  | "runtimeArraySort" | "runtimeArrayFrom" | "runtimeArrayFromValue" | "runtimeArrayFromCollection"
  | "constClosure" | "function" | "returnClosure";
type CallbackNode<K extends CallbackKind> = VariantOfKind<ResolvedOperation, K>;
type CallbackVariants = { readonly [K in CallbackKind]: CallbackNode<K> };
type Method = CallbackNode<"runtimeArrayMapFunctionObject">["method"];

const visitHelpers = {
  map: "arrayMapCallback", flatMap: "arrayFlatMapCallback", filter: "arrayFilterCallback", forEach: "arrayForEachCallback",
  find: "arrayFindCallback", findIndex: "arrayFindIndexCallback"
} as const;

function invoke(method: Method, array: BoxedValue, callback: BoxedValue, context: OperationContext,
  initial?: BoxedValue, thisArg?: BoxedValue): BoxedValue {
  keep(array, context); keep(callback, context);
  if (method === "reduce" || method === "reduceRight") {
    const value = initial ?? undefinedValue(context);
    keep(value, context);
    const provided = context.cursor.currentBlock().int(llvm.i1, initial === undefined ? 0n : 1n);
    return keep(context.runtime.callWithCompletion(method === "reduce" ? "arrayReduceCallback" : "arrayReduceRightCallback", [array, callback, value, provided],
      context.cursor.uniqueName("array.reduce"), context.exceptionTarget()), context);
  }
  const receiver = thisArg ?? undefinedValue(context);
  keep(receiver, context);
  return keep(context.runtime.callWithCompletion(visitHelpers[method], [array, callback, receiver],
    context.cursor.uniqueName(`array.${method}`), context.exceptionTarget()), context);
}

type NamedCallback = CallbackNode<"runtimeArrayMapCallback" | "runtimeArrayFlatMapCallback" | "runtimeArrayFilterCallback" |
  "runtimeArrayForEachCallback" | "runtimeArrayFindCallback" | "runtimeArrayFindIndexCallback">;

function named(operation: NamedCallback, method: Exclude<Method, "reduce" | "reduceRight">, context: OperationContext): void {
  const array = keep(context.bindings.value(operation.arrayName), context);
  const callback = keep(context.calls.reference(operation.callbackName), context);
  const result = invoke(method, array, callback, context);
  if (operation.kind !== "runtimeArrayForEachCallback") { context.writes.storeValue(operation.name, result); }
}

function inline(operation: CallbackNode<"runtimeArrayMapFunctionObject">, context: OperationContext): void {
  const array = keep(context.bindings.value(operation.arrayName), context);
  const callback = keep(context.calls.callback(operation), context);
  const initial = operation.initialValue === undefined ? undefined : keep(context.expressions.value(operation.initialValue), context);
  const thisArg = operation.thisArg === undefined ? undefined : keep(context.expressions.value(operation.thisArg), context);
  context.writes.storeValue(operation.name, invoke(operation.method, array, callback, context, initial, thisArg));
}

function sort(operation: CallbackNode<"runtimeArraySort">, context: OperationContext): void {
  const array = keep(context.bindings.value(operation.arrayName), context);
  if (operation.callbackName === undefined) {
    const pointer = context.values.forBlock(context.cursor.currentBlock()).unboxReference(array);
    context.runtime.callVoid("arraySortDefault", [pointer]);
    context.writes.storeValue(operation.name, array);
    return;
  }
  const callback = keep(context.calls.reference(operation.callbackName), context);
  const result = context.runtime.callWithCompletion("arraySortCallback", [array, callback], context.cursor.uniqueName("array.sort"), context.exceptionTarget());
  context.writes.storeValue(operation.name, result);
}

function fromCollection(operation: CallbackNode<"runtimeArrayFromCollection">, context: OperationContext): void {
  const owner = keep(context.bindings.value(operation.collectionName), context);
  const pointer = context.values.forBlock(context.cursor.currentBlock()).unboxReference(owner);
  const source = context.cursor.currentBlock().int(llvm.i64, operation.sourceKind === "map" ? 2n : 3n);
  const kinds = { keys: 0n, values: 1n, entries: 2n } as const;
  const iteration = context.cursor.currentBlock().int(llvm.i64, kinds[operation.iterationKind]);
  const mapper = operation.mapper === undefined ? undefinedValue(context) : keep(context.expressions.value(operation.mapper), context);
  const thisArg = operation.thisArg === undefined ? undefinedValue(context) : keep(context.expressions.value(operation.thisArg), context);
  const result = context.runtime.callWithCompletion("arrayFromCollection", [pointer, source, iteration, mapper, thisArg], context.cursor.uniqueName("array.from"), context.exceptionTarget());
  context.writes.storeValue(operation.name, result);
}

export const callbackOperationHandlers: VariantHandlers<CallbackVariants, OperationContext, void> = {
  constClosure: (operation, context) => context.writes.storeValue(operation.name, context.calls.closure(operation.value)),
  function: (operation, context) => context.writes.storeValue(operation.name, context.calls.reference(operation.name)),
  returnClosure: (operation, context) => context.returnValue(context.calls.returnedClosure(operation)),
  runtimeArrayMapCallback: (operation, context) => named(operation, "map", context),
  runtimeArrayFlatMapCallback: (operation, context) => named(operation, "flatMap", context),
  runtimeArrayFilterCallback: (operation, context) => named(operation, "filter", context),
  runtimeArrayForEachCallback: (operation, context) => named(operation, "forEach", context),
  runtimeArrayFindCallback: (operation, context) => named(operation, "find", context),
  runtimeArrayFindIndexCallback: (operation, context) => named(operation, "findIndex", context),
  runtimeArrayMapFunctionObject: inline,
  runtimeArrayReduceCallback: (operation, context) => {
    const array = keep(context.bindings.value(operation.arrayName), context);
    const callback = keep(context.calls.reference(operation.callbackName), context);
    const initial = operation.initialValue === undefined ? undefined : keep(context.expressions.value(operation.initialValue), context);
    context.writes.storeValue(operation.name, invoke(operation.direction === "right" ? "reduceRight" : "reduce", array, callback, context, initial));
  },
  runtimeArraySort: sort,
  runtimeArrayFrom: (operation, context) => {
    const owner = keep(context.bindings.value(operation.targetName), context);
    const pointer = context.values.forBlock(context.cursor.currentBlock()).unboxReference(owner);
    const result = context.runtime.callPointer(operation.targetKind === "array" ? "arrayFromArray" : "arrayFromObject", [pointer], context.cursor.uniqueName("array.from"));
    initializeAggregate(operation.name, result, "array", context);
  },
  runtimeArrayFromValue: (operation, context) => {
    const source = keep(context.expressions.value(operation.source), context);
    const mapper = operation.mapper === undefined ? undefinedValue(context) : keep(context.expressions.value(operation.mapper), context);
    const thisArg = operation.thisArg === undefined ? undefinedValue(context) : keep(context.expressions.value(operation.thisArg), context);
    const result = context.runtime.callWithCompletion("arrayFromValue", [source, mapper, thisArg], context.cursor.uniqueName("array.from"), context.exceptionTarget());
    context.writes.storeValue(operation.name, result);
  },
  runtimeArrayFromCollection: fromCollection
};
