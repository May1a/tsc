import { emitGeneratedJsCall, emitRootStackPush } from "./completion.js";
import type { EmitContext, JsValue, OperationOf } from "./context.js";
import { runtimeIteratorKindCode, variablePointerName } from "./names.js";
import {
  emitRuntimeArrayPointer,
  emitRuntimeCollectionPointer,
  emitRuntimeObjectPointer
} from "./layout.js";
import { emitArrayIndex } from "./numbers.js";
import type { JsIrFunctionParameter, JsIrValueKind } from "../ir/bindings.js";
import type { JsIrOperation } from "../ir/types.js";
import { addStringConstant } from "./strings.js";
import { jsValueUndefined } from "./values.js";

/**
 * The array methods that take a callback: map, flatMap, filter, find, findIndex, reduce,
 * forEach, sort, and the `Array.from` family.
 *
 * Every one of them has the same three-part problem and they solve it the same way. The callback may be
 * inlined (a source arrow), a named function, or a function object; it is lowered to a real function
 * definition and handed to the runtime as a js value; and the callback's return value has to be
 * unboxed back to whatever the caller wanted — a `double` for `findIndex`, a js value for `map`. So
 * this tier is mostly the *plumbing*, and `emitArrayCallbackArguments` and `emitArrayCallbackReturn`
 * are the two functions that do it.
 *
 * `sort` is the exception and the reason it is here rather than with the other aggregates: its callback
 * takes two elements and returns a `double`, not one element and a value, so it gets its own comparator
 * path rather than going through the shared return coercion.
 */

/** `Array.from` over an array, a mapper, or another collection. */
export function emitRuntimeArrayFromFamilyOperation(
  operation: OperationOf<"runtimeArrayFrom" | "runtimeArrayFromValue" | "runtimeArrayFromCollection">,
  context: EmitContext
): string[] {
  if (operation.kind === "runtimeArrayFromValue") {
    return emitRuntimeArrayFromValueOperation(operation, context);
  }
  if (operation.kind === "runtimeArrayFromCollection") {
    return emitRuntimeArrayFromCollectionOperation(operation, context);
  }
  return emitRuntimeArrayFromOperation(operation, context);
}
export function emitRuntimeArrayMapCallbackOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayMapCallback" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  const source = emitRuntimeArrayPointer(operation.arrayName, context);
  const index = context.arrayIndex;
  context.arrayIndex += 1;
  const length = `%arr.map.len.${index}`;
  const output = `%arr.map.out.${index}`;
  const iPointer = `%arr.map.i.${index}.addr`;
  const condLabel = `arr.map.cond.${index}`;
  const bodyLabel = `arr.map.body.${index}`;
  const endLabel = `arr.map.end.${index}`;
  const currentIndex = `%arr.map.i.${index}`;
  const nextIndex = `%arr.map.next.${index}`;
  const element = `%arr.map.value.${index}`;
  const callbackArgs = emitArrayCallbackArguments(operation.callbackParameters, source.value, currentIndex, element, index);
  const callbackReturn = emitArrayCallbackReturn(operation.callbackReturnKind, operation.callbackName, callbackArgs.values, index, context);
  return [
    `  ${pointerName} = alloca ptr`,
    ...source.lines,
    `  ${length} = call i64 @arrayLength(ptr ${source.value})`,
    `  ${output} = call ptr @arrayNew(i64 ${length})`,
    `  store ptr ${output}, ptr ${pointerName}`,
    `  ${iPointer} = alloca i64`,
    `  store i64 0, ptr ${iPointer}`,
    `  br label %${condLabel}`,
    `${condLabel}:`,
    `  ${currentIndex} = load i64, ptr ${iPointer}`,
    `  %arr.map.done.${index} = icmp eq i64 ${currentIndex}, ${length}`,
    `  br i1 %arr.map.done.${index}, label %${endLabel}, label %${bodyLabel}`,
    `${bodyLabel}:`,
    `  ${element} = call i64 @arrayGet(ptr ${source.value}, i64 ${currentIndex})`,
    ...callbackArgs.lines,
    ...callbackReturn.lines,
    `  call void @arraySet(ptr ${output}, i64 ${currentIndex}, i64 ${callbackReturn.value})`,
    `  ${nextIndex} = add i64 ${currentIndex}, 1`,
    `  store i64 ${nextIndex}, ptr ${iPointer}`,
    `  br label %${condLabel}`,
    `${endLabel}:`
  ];
}
// eslint-disable-next-line max-statements -- Function-object array dispatch keeps method routing next to the map tracer bullet emitter.
export function emitRuntimeArrayMapFunctionObjectOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayMapFunctionObject" }>,
  context: EmitContext
): string[] {
  if (operation.method === "filter") {
    return emitRuntimeArrayFilterFunctionObjectOperation(operation, context);
  }
  if (operation.method === "flatMap") {
    return emitRuntimeArrayFlatMapFunctionObjectOperation(operation, context);
  }
  if (operation.method === "find" || operation.method === "findIndex") {
    return emitRuntimeArrayFindFunctionObjectOperation(operation, context);
  }
  if (operation.method === "reduce" || operation.method === "reduceRight") {
    return emitRuntimeArrayReduceFunctionObjectOperation(operation, context);
  }
  if (operation.method === "forEach") {
    return emitRuntimeArrayForEachFunctionObjectOperation(operation, context);
  }
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  const source = emitRuntimeArrayPointer(operation.arrayName, context);
  const index = context.arrayIndex;
  context.arrayIndex += 1;
  const length = `%arr.map.len.${index}`;
  const output = `%arr.map.out.${index}`;
  const iPointer = `%arr.map.i.${index}.addr`;
  const condLabel = `arr.map.cond.${index}`;
  const bodyLabel = `arr.map.body.${index}`;
  const endLabel = `arr.map.end.${index}`;
  const currentIndex = `%arr.map.i.${index}`;
  const nextIndex = `%arr.map.next.${index}`;
  const element = `%arr.map.value.${index}`;
  const callbackArgs = emitArrayCallbackArguments(operation.callbackParameters, source.value, currentIndex, element, index);
  const functionObject = emitFunctionObjectValue(operation, context, index);
  const callbackReturn = emitFunctionObjectCallbackReturn(functionObject.value, callbackArgs.values, index, context);
  return [
    `  ${pointerName} = alloca ptr`,
    ...functionObject.lines,
    ...source.lines,
    `  ${length} = call i64 @arrayLength(ptr ${source.value})`,
    `  ${output} = call ptr @arrayNew(i64 ${length})`,
    `  store ptr ${output}, ptr ${pointerName}`,
    `  ${iPointer} = alloca i64`,
    `  store i64 0, ptr ${iPointer}`,
    `  br label %${condLabel}`,
    `${condLabel}:`,
    `  ${currentIndex} = load i64, ptr ${iPointer}`,
    `  %arr.map.done.${index} = icmp eq i64 ${currentIndex}, ${length}`,
    `  br i1 %arr.map.done.${index}, label %${endLabel}, label %${bodyLabel}`,
    `${bodyLabel}:`,
    `  ${element} = call i64 @arrayGet(ptr ${source.value}, i64 ${currentIndex})`,
    ...callbackArgs.lines,
    ...callbackReturn.lines,
    `  call void @arraySet(ptr ${output}, i64 ${currentIndex}, i64 ${callbackReturn.value})`,
    `  ${nextIndex} = add i64 ${currentIndex}, 1`,
    `  store i64 ${nextIndex}, ptr ${iPointer}`,
    `  br label %${condLabel}`,
    `${endLabel}:`
  ];
}
export function emitFunctionObjectValue(operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayMapFunctionObject" }>, context: EmitContext, index: number): { readonly lines: readonly string[]; readonly value: string } {
  const functionValue = `%arr.fnobj.${index}`;
  const captures = operation.captures ?? [];
  const captureLines: string[] = [];
  let environment = "null";
  if (captures.length > 0) {
    const emittedCaptures = captures.map((capture) => context.emitValue(capture.value));
    for (const capture of emittedCaptures) {
      captureLines.push(...capture.lines, `  call void @gcRootPush(i64 ${capture.value})`);
    }
    environment = `%arr.fnobj.env.${index}`;
    captureLines.push(`  ${environment} = call ptr @environmentNew(i64 ${captures.length})`);
    for (let captureIndex = 0; captureIndex < emittedCaptures.length; captureIndex += 1) {
      captureLines.push(`  call void @environmentSet(ptr ${environment}, i64 ${captureIndex}, i64 ${emittedCaptures[captureIndex].value})`);
    }
  }
  const thisArg = emitFunctionObjectThisArg(operation, context, `%arr.fnobj.this.frame.${index}`);
  const newCall = `  ${functionValue} = call i64 @functionObjectNew(ptr @${operation.callbackName}, ptr ${environment}, i64 ${thisArg.value}, i64 ${jsValueUndefined}, i64 ${operation.callbackParameters.length})`;
  const push = emitRootStackPush(functionValue, context);
  return { lines: [...captureLines, ...thisArg.setup, newCall, ...thisArg.cleanup, push], value: functionValue };
}
export function emitFunctionObjectThisArg(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayMapFunctionObject" }>,
  context: EmitContext,
  frameName: string
): { readonly setup: readonly string[]; readonly value: string; readonly cleanup: readonly string[] } {
  if (operation.thisArg === undefined) {
    return { setup: [], value: jsValueUndefined, cleanup: [] };
  }
  const { lines, value: emittedValue } = context.emitValue(operation.thisArg);
  let value = jsValueUndefined;
  if (operation.callbackKind === "ordinary") {
    value = emittedValue;
  }
  return {
    setup: [`  ${frameName} = call i64 @gcRootSave()`, ...lines, `  call void @gcRootPush(i64 ${emittedValue})`],
    value,
    cleanup: [`  call void @gcRootRestore(i64 ${frameName})`]
  };
}
export function emitRuntimeArrayFlatMapFunctionObjectOperation(operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayMapFunctionObject" }>, context: EmitContext): string[] {
  const direct: Extract<JsIrOperation, { readonly kind: "runtimeArrayFlatMapCallback" }> = { kind: "runtimeArrayFlatMapCallback", name: operation.name, arrayName: operation.arrayName, callbackName: operation.callbackName, callbackParameters: operation.callbackParameters, callbackReturnKind: nonVoidCallbackReturnKind(operation.callbackReturnKind) };
  return emitRuntimeArrayCallbackFunctionObjectPrelude(operation, context, (functionValue) => emitRuntimeArrayFlatMapCallbackOperationWithReturn(direct, context, (args, index) => emitFunctionObjectCallbackReturn(functionValue, args, index, context)));
}
export function emitRuntimeArrayFilterFunctionObjectOperation(operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayMapFunctionObject" }>, context: EmitContext): string[] {
  const direct: Extract<JsIrOperation, { readonly kind: "runtimeArrayFilterCallback" }> = { kind: "runtimeArrayFilterCallback", name: operation.name, arrayName: operation.arrayName, callbackName: operation.callbackName, callbackParameters: operation.callbackParameters, callbackReturnKind: nonVoidCallbackReturnKind(operation.callbackReturnKind) };
  return emitRuntimeArrayCallbackFunctionObjectPrelude(operation, context, (functionValue) => emitRuntimeArrayFilterCallbackOperationWithReturn(direct, context, (args, index) => emitFunctionObjectCallbackReturn(functionValue, args, index, context)));
}
export function emitRuntimeArrayForEachFunctionObjectOperation(operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayMapFunctionObject" }>, context: EmitContext): string[] {
  const direct: Extract<JsIrOperation, { readonly kind: "runtimeArrayForEachCallback" }> = { kind: "runtimeArrayForEachCallback", arrayName: operation.arrayName, callbackName: operation.callbackName, callbackParameters: operation.callbackParameters, callbackReturnKind: operation.callbackReturnKind };
  return emitRuntimeArrayCallbackFunctionObjectPrelude(operation, context, (functionValue) => emitRuntimeArrayForEachCallbackOperationWithCall(direct, context, (args, index) => emitFunctionObjectCallbackReturn(functionValue, args, index, context).lines));
}
export function emitRuntimeArrayFindFunctionObjectOperation(operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayMapFunctionObject" }>, context: EmitContext): string[] {
  let kind: "runtimeArrayFindCallback" | "runtimeArrayFindIndexCallback" = "runtimeArrayFindIndexCallback";
  if (operation.method === "find") {
    kind = "runtimeArrayFindCallback";
  }
  const direct: Extract<JsIrOperation, { readonly kind: "runtimeArrayFindCallback" | "runtimeArrayFindIndexCallback" }> = { kind, name: operation.name, arrayName: operation.arrayName, callbackName: operation.callbackName, callbackParameters: operation.callbackParameters, callbackReturnKind: nonVoidCallbackReturnKind(operation.callbackReturnKind) };
  return emitRuntimeArrayCallbackFunctionObjectPrelude(operation, context, (functionValue) => emitRuntimeArrayFindCallbackOperationWithReturn(direct, context, (args, index) => emitFunctionObjectCallbackReturn(functionValue, args, index, context)));
}
export function emitRuntimeArrayReduceFunctionObjectOperation(operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayMapFunctionObject" }>, context: EmitContext): string[] {
  const direct: Extract<JsIrOperation, { readonly kind: "runtimeArrayReduceCallback" }> = { kind: "runtimeArrayReduceCallback", name: operation.name, arrayName: operation.arrayName, callbackName: operation.callbackName, callbackParameters: operation.callbackParameters, callbackReturnKind: nonVoidCallbackReturnKind(operation.callbackReturnKind), initialValue: operation.initialValue, direction: operation.direction ?? "left" };
  return emitRuntimeArrayCallbackFunctionObjectPrelude(operation, context, (functionValue) => emitRuntimeArrayReduceCallbackOperationWithReturn(direct, context, (args, index) => emitFunctionObjectCallbackReturn(functionValue, args, index, context)));
}
export function nonVoidCallbackReturnKind(returnKind: JsIrValueKind | "void"): JsIrValueKind {
  if (returnKind === "void") {
    return "value";
  }
  return returnKind;
}
export function emitRuntimeArrayCallbackFunctionObjectPrelude(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayMapFunctionObject" }>,
  context: EmitContext,
  emitBody: (functionValue: string) => string[]
): string[] {
  const index = context.arrayIndex;
  const functionObject = emitFunctionObjectValue(operation, context, index);
  return [...functionObject.lines, ...emitBody(functionObject.value)];
}
// eslint-disable-next-line max-statements -- flatMap emits callback invocation plus one-level array flattening in one loop.
export function emitRuntimeArrayFlatMapCallbackOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayFlatMapCallback" }>,
  context: EmitContext
): string[] {
  return emitRuntimeArrayFlatMapCallbackOperationWithReturn(operation, context, (args, index) => emitArrayCallbackReturn(operation.callbackReturnKind, operation.callbackName, args, index, context));
}
// eslint-disable-next-line max-statements -- flatMap emits callback invocation plus one-level array flattening in one loop.
export function emitRuntimeArrayFlatMapCallbackOperationWithReturn(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayFlatMapCallback" }>,
  context: EmitContext,
  emitCallbackReturn: (args: readonly string[], loopIndex: number) => { readonly lines: readonly string[]; readonly value: string }
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  const source = emitRuntimeArrayPointer(operation.arrayName, context);
  const index = context.arrayIndex;
  context.arrayIndex += 1;
  const length = `%arr.flatmap.len.${index}`;
  const output = `%arr.flatmap.out.${index}`;
  const iPointer = `%arr.flatmap.i.${index}.addr`;
  const innerPointer = `%arr.flatmap.inner.i.${index}.addr`;
  const condLabel = `arr.flatmap.cond.${index}`;
  const bodyLabel = `arr.flatmap.body.${index}`;
  const flattenLabel = `arr.flatmap.flatten.${index}`;
  const scalarLabel = `arr.flatmap.scalar.${index}`;
  const innerCondLabel = `arr.flatmap.inner.cond.${index}`;
  const innerBodyLabel = `arr.flatmap.inner.body.${index}`;
  const advanceLabel = `arr.flatmap.advance.${index}`;
  const endLabel = `arr.flatmap.end.${index}`;
  const currentIndex = `%arr.flatmap.i.${index}`;
  const nextIndex = `%arr.flatmap.next.${index}`;
  const element = `%arr.flatmap.value.${index}`;
  const callbackArgs = emitArrayCallbackArguments(operation.callbackParameters, source.value, currentIndex, element, index);
  const callbackReturn = emitCallbackReturn(callbackArgs.values, index);
  const isArray = `%arr.flatmap.is.array.${index}`;
  const innerArray = `%arr.flatmap.inner.array.${index}`;
  const innerLength = `%arr.flatmap.inner.len.${index}`;
  const innerIndex = `%arr.flatmap.inner.i.${index}`;
  const innerNext = `%arr.flatmap.inner.next.${index}`;
  const innerValue = `%arr.flatmap.inner.value.${index}`;
  return [`  ${pointerName} = alloca ptr`, ...source.lines, `  ${length} = call i64 @arrayLength(ptr ${source.value})`, `  ${output} = call ptr @arrayNew(i64 0)`, `  store ptr ${output}, ptr ${pointerName}`, `  ${iPointer} = alloca i64`, `  ${innerPointer} = alloca i64`, `  store i64 0, ptr ${iPointer}`, `  br label %${condLabel}`, `${condLabel}:`, `  ${currentIndex} = load i64, ptr ${iPointer}`, `  %arr.flatmap.done.${index} = icmp eq i64 ${currentIndex}, ${length}`, `  br i1 %arr.flatmap.done.${index}, label %${endLabel}, label %${bodyLabel}`, `${bodyLabel}:`, `  ${element} = call i64 @arrayGet(ptr ${source.value}, i64 ${currentIndex})`, ...callbackArgs.lines, ...callbackReturn.lines, `  ${isArray} = call i1 @valueIsArray(i64 ${callbackReturn.value})`, `  br i1 ${isArray}, label %${flattenLabel}, label %${scalarLabel}`, `${scalarLabel}:`, `  call i64 @arrayPush(ptr ${output}, i64 ${callbackReturn.value})`, `  br label %${advanceLabel}`, `${flattenLabel}:`, `  ${innerArray} = call ptr @valueArrayPtr(i64 ${callbackReturn.value})`, `  ${innerLength} = call i64 @arrayLength(ptr ${innerArray})`, `  store i64 0, ptr ${innerPointer}`, `  br label %${innerCondLabel}`, `${innerCondLabel}:`, `  ${innerIndex} = load i64, ptr ${innerPointer}`, `  %arr.flatmap.inner.done.${index} = icmp eq i64 ${innerIndex}, ${innerLength}`, `  br i1 %arr.flatmap.inner.done.${index}, label %${advanceLabel}, label %${innerBodyLabel}`, `${innerBodyLabel}:`, `  ${innerValue} = call i64 @arrayGet(ptr ${innerArray}, i64 ${innerIndex})`, `  call i64 @arrayPush(ptr ${output}, i64 ${innerValue})`, `  ${innerNext} = add i64 ${innerIndex}, 1`, `  store i64 ${innerNext}, ptr ${innerPointer}`, `  br label %${innerCondLabel}`, `${advanceLabel}:`, `  ${nextIndex} = add i64 ${currentIndex}, 1`, `  store i64 ${nextIndex}, ptr ${iPointer}`, `  br label %${condLabel}`, `${endLabel}:`];
}
export function emitRuntimeArrayFilterCallbackOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayFilterCallback" }>,
  context: EmitContext
): string[] {
  return emitRuntimeArrayFilterCallbackOperationWithReturn(operation, context, (args, index) => emitArrayCallbackReturn(operation.callbackReturnKind, operation.callbackName, args, index, context));
}
export function emitRuntimeArrayFilterCallbackOperationWithReturn(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayFilterCallback" }>,
  context: EmitContext,
  emitCallbackReturn: (args: readonly string[], loopIndex: number) => { readonly lines: readonly string[]; readonly value: string }
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  const source = emitRuntimeArrayPointer(operation.arrayName, context);
  const index = context.arrayIndex;
  context.arrayIndex += 1;
  const length = `%arr.filter.len.${index}`;
  const output = `%arr.filter.out.${index}`;
  const iPointer = `%arr.filter.i.${index}.addr`;
  const condLabel = `arr.filter.cond.${index}`;
  const bodyLabel = `arr.filter.body.${index}`;
  const keepLabel = `arr.filter.keep.${index}`;
  const advanceLabel = `arr.filter.advance.${index}`;
  const endLabel = `arr.filter.end.${index}`;
  const currentIndex = `%arr.filter.i.${index}`;
  const nextIndex = `%arr.filter.next.${index}`;
  const element = `%arr.filter.value.${index}`;
  const callbackArgs = emitArrayCallbackArguments(operation.callbackParameters, source.value, currentIndex, element, index);
  const callbackReturn = emitCallbackReturn(callbackArgs.values, index);
  const keep = `%arr.filter.keep.value.${index}`;
  return [`  ${pointerName} = alloca ptr`, ...source.lines, `  ${length} = call i64 @arrayLength(ptr ${source.value})`, `  ${output} = call ptr @arrayNew(i64 0)`, `  store ptr ${output}, ptr ${pointerName}`, `  ${iPointer} = alloca i64`, `  store i64 0, ptr ${iPointer}`, `  br label %${condLabel}`, `${condLabel}:`, `  ${currentIndex} = load i64, ptr ${iPointer}`, `  %arr.filter.done.${index} = icmp eq i64 ${currentIndex}, ${length}`, `  br i1 %arr.filter.done.${index}, label %${endLabel}, label %${bodyLabel}`, `${bodyLabel}:`, `  ${element} = call i64 @arrayGet(ptr ${source.value}, i64 ${currentIndex})`, ...callbackArgs.lines, ...callbackReturn.lines, `  ${keep} = call i1 @valueTruthy(i64 ${callbackReturn.value})`, `  br i1 ${keep}, label %${keepLabel}, label %${advanceLabel}`, `${keepLabel}:`, `  call i64 @arrayPush(ptr ${output}, i64 ${element})`, `  br label %${advanceLabel}`, `${advanceLabel}:`, `  ${nextIndex} = add i64 ${currentIndex}, 1`, `  store i64 ${nextIndex}, ptr ${iPointer}`, `  br label %${condLabel}`, `${endLabel}:`];
}
export function emitRuntimeArrayForEachCallbackOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayForEachCallback" }>,
  context: EmitContext
): string[] {
  return emitRuntimeArrayForEachCallbackOperationWithCall(operation, context, (args) => emitIgnoredCallbackCall(operation.callbackReturnKind, operation.callbackName, args, context));
}
export function emitRuntimeArrayForEachCallbackOperationWithCall(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayForEachCallback" }>,
  context: EmitContext,
  emitCallbackCall: (args: readonly string[], loopIndex: number) => readonly string[]
): string[] {
  const source = emitRuntimeArrayPointer(operation.arrayName, context);
  const index = context.arrayIndex;
  context.arrayIndex += 1;
  const length = `%arr.each.len.${index}`;
  const iPointer = `%arr.each.i.${index}.addr`;
  const condLabel = `arr.each.cond.${index}`;
  const bodyLabel = `arr.each.body.${index}`;
  const endLabel = `arr.each.end.${index}`;
  const currentIndex = `%arr.each.i.${index}`;
  const nextIndex = `%arr.each.next.${index}`;
  const element = `%arr.each.value.${index}`;
  const callbackArgs = emitArrayCallbackArguments(operation.callbackParameters, source.value, currentIndex, element, index);
  return [...source.lines, `  ${length} = call i64 @arrayLength(ptr ${source.value})`, `  ${iPointer} = alloca i64`, `  store i64 0, ptr ${iPointer}`, `  br label %${condLabel}`, `${condLabel}:`, `  ${currentIndex} = load i64, ptr ${iPointer}`, `  %arr.each.done.${index} = icmp eq i64 ${currentIndex}, ${length}`, `  br i1 %arr.each.done.${index}, label %${endLabel}, label %${bodyLabel}`, `${bodyLabel}:`, `  ${element} = call i64 @arrayGet(ptr ${source.value}, i64 ${currentIndex})`, ...callbackArgs.lines, ...emitCallbackCall(callbackArgs.values, index), `  ${nextIndex} = add i64 ${currentIndex}, 1`, `  store i64 ${nextIndex}, ptr ${iPointer}`, `  br label %${condLabel}`, `${endLabel}:`];
}
export function emitRuntimeArrayScalarCallbackOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayFindCallback" | "runtimeArrayFindIndexCallback" | "runtimeArrayReduceCallback" }>,
  context: EmitContext
): string[] {
  if (operation.kind === "runtimeArrayReduceCallback") {
    return emitRuntimeArrayReduceCallbackOperation(operation, context);
  }
  return emitRuntimeArrayFindCallbackOperation(operation, context);
}
// eslint-disable-next-line max-statements -- Find and findIndex share one loop because only result storage differs.
export function emitRuntimeArrayFindCallbackOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayFindCallback" | "runtimeArrayFindIndexCallback" }>,
  context: EmitContext
): string[] {
  return emitRuntimeArrayFindCallbackOperationWithReturn(operation, context, (args, index) => emitArrayCallbackReturn(operation.callbackReturnKind, operation.callbackName, args, index, context));
}
// eslint-disable-next-line max-statements -- Find and findIndex share one loop because only result storage differs.
export function emitRuntimeArrayFindCallbackOperationWithReturn(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayFindCallback" | "runtimeArrayFindIndexCallback" }>,
  context: EmitContext,
  emitCallbackReturn: (args: readonly string[], loopIndex: number) => { readonly lines: readonly string[]; readonly value: string }
): string[] {
  const isIndex = operation.kind === "runtimeArrayFindIndexCallback";
  const pointerName = variablePointerName(operation.name);
  if (isIndex) {
    context.bindings.set(operation.name, { kind: "number", value: { kind: "variable", name: pointerName } });
  } else {
    context.bindings.set(operation.name, { kind: "valueVariable", name: operation.name });
  }
  const source = emitRuntimeArrayPointer(operation.arrayName, context);
  const index = context.arrayIndex;
  context.arrayIndex += 1;
  const length = `%arr.find.len.${index}`;
  const iPointer = `%arr.find.i.${index}.addr`;
  const foundPointer = `%arr.find.found.${index}.addr`;
  const condLabel = `arr.find.cond.${index}`;
  const bodyLabel = `arr.find.body.${index}`;
  const matchLabel = `arr.find.match.${index}`;
  const advanceLabel = `arr.find.advance.${index}`;
  const endLabel = `arr.find.end.${index}`;
  const currentIndex = `%arr.find.i.${index}`;
  const nextIndex = `%arr.find.next.${index}`;
  const found = `%arr.find.found.${index}`;
  const notFound = `%arr.find.notfound.${index}`;
  const canContinue = `%arr.find.continue.${index}`;
  const element = `%arr.find.value.${index}`;
  const callbackArgs = emitArrayCallbackArguments(operation.callbackParameters, source.value, currentIndex, element, index);
  const callbackReturn = emitCallbackReturn(callbackArgs.values, index);
  const keep = `%arr.find.keep.${index}`;
  let initialStore = [`  ${pointerName} = alloca i64`, `  store i64 ${jsValueUndefined}, ptr ${pointerName}`];
  let matchStore = [`  store i64 ${element}, ptr ${pointerName}`];
  if (isIndex) {
    initialStore = [`  ${pointerName} = alloca double`, `  store double -1.0, ptr ${pointerName}`];
    matchStore = [`  %arr.find.index.num.${index} = uitofp i64 ${currentIndex} to double`, `  store double %arr.find.index.num.${index}, ptr ${pointerName}`];
  }
  return [...initialStore, ...source.lines, `  ${length} = call i64 @arrayLength(ptr ${source.value})`, `  ${iPointer} = alloca i64`, `  ${foundPointer} = alloca i1`, `  store i64 0, ptr ${iPointer}`, `  store i1 false, ptr ${foundPointer}`, `  br label %${condLabel}`, `${condLabel}:`, `  ${currentIndex} = load i64, ptr ${iPointer}`, `  ${found} = load i1, ptr ${foundPointer}`, `  ${notFound} = xor i1 ${found}, true`, `  %arr.find.inrange.${index} = icmp ult i64 ${currentIndex}, ${length}`, `  ${canContinue} = and i1 %arr.find.inrange.${index}, ${notFound}`, `  br i1 ${canContinue}, label %${bodyLabel}, label %${endLabel}`, `${bodyLabel}:`, `  ${element} = call i64 @arrayGet(ptr ${source.value}, i64 ${currentIndex})`, ...callbackArgs.lines, ...callbackReturn.lines, `  ${keep} = call i1 @valueTruthy(i64 ${callbackReturn.value})`, `  br i1 ${keep}, label %${matchLabel}, label %${advanceLabel}`, `${matchLabel}:`, ...matchStore, `  store i1 true, ptr ${foundPointer}`, `  br label %${advanceLabel}`, `${advanceLabel}:`, `  ${nextIndex} = add i64 ${currentIndex}, 1`, `  store i64 ${nextIndex}, ptr ${iPointer}`, `  br label %${condLabel}`, `${endLabel}:`];
}
// eslint-disable-next-line max-statements -- reduce/reduceRight share accumulator setup and directional loop emission.
export function emitRuntimeArrayReduceCallbackOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayReduceCallback" }>,
  context: EmitContext
): string[] {
  return emitRuntimeArrayReduceCallbackOperationWithReturn(operation, context, (args, index) => emitArrayCallbackReturn(operation.callbackReturnKind, operation.callbackName, args, index, context));
}
// eslint-disable-next-line max-statements -- reduce/reduceRight share accumulator setup and directional loop emission.
export function emitRuntimeArrayReduceCallbackOperationWithReturn(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayReduceCallback" }>,
  context: EmitContext,
  emitCallbackReturn: (args: readonly string[], loopIndex: number) => { readonly lines: readonly string[]; readonly value: string }
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "valueVariable", name: operation.name });
  const source = emitRuntimeArrayPointer(operation.arrayName, context);
  const index = context.arrayIndex;
  context.arrayIndex += 1;
  const length = `%arr.reduce.len.${index}`;
  const iPointer = `%arr.reduce.i.${index}.addr`;
  const condLabel = `arr.reduce.cond.${index}`;
  const bodyLabel = `arr.reduce.body.${index}`;
  const endLabel = `arr.reduce.end.${index}`;
  const currentIndex = `%arr.reduce.i.${index}`;
  const nextIndex = `%arr.reduce.next.${index}`;
  const element = `%arr.reduce.value.${index}`;
  let initial: JsValue | undefined;
  if (operation.initialValue !== undefined) {
    initial = context.emitValue(operation.initialValue);
  }
  let startIndex = "1";
  let initialLines = [`  %arr.reduce.initial.${index} = call i64 @arrayGet(ptr ${source.value}, i64 0)`];
  if (initial !== undefined) {
    startIndex = "0";
    initialLines = [...initial.lines, `  %arr.reduce.initial.${index} = add i64 ${initial.value}, 0`];
  }
  let doneCheck = `%arr.reduce.done.${index} = icmp eq i64 ${currentIndex}, ${length}`;
  let nextLine = `  ${nextIndex} = add i64 ${currentIndex}, 1`;
  if (operation.direction === "right") {
    startIndex = `%arr.reduce.start.${index}`;
    initialLines = [`  %arr.reduce.last.${index} = sub i64 ${length}, 1`, `  %arr.reduce.initial.${index} = call i64 @arrayGet(ptr ${source.value}, i64 %arr.reduce.last.${index})`, `  ${startIndex} = sub i64 ${length}, 2`];
    if (initial !== undefined) {
      initialLines = [...initial.lines, `  %arr.reduce.initial.${index} = add i64 ${initial.value}, 0`, `  ${startIndex} = sub i64 ${length}, 1`];
    }
    doneCheck = `%arr.reduce.done.${index} = icmp slt i64 ${currentIndex}, 0`;
    nextLine = `  ${nextIndex} = sub i64 ${currentIndex}, 1`;
  }
  const callbackArgs = emitReduceCallbackArguments(operation.callbackParameters, source.value, currentIndex, pointerName, element, index);
  const callbackReturn = emitCallbackReturn(callbackArgs.values, index);
  return [`  ${pointerName} = alloca i64`, ...source.lines, `  ${length} = call i64 @arrayLength(ptr ${source.value})`, ...initialLines, `  store i64 %arr.reduce.initial.${index}, ptr ${pointerName}`, `  ${iPointer} = alloca i64`, `  store i64 ${startIndex}, ptr ${iPointer}`, `  br label %${condLabel}`, `${condLabel}:`, `  ${currentIndex} = load i64, ptr ${iPointer}`, `  ${doneCheck}`, `  br i1 %arr.reduce.done.${index}, label %${endLabel}, label %${bodyLabel}`, `${bodyLabel}:`, `  ${element} = call i64 @arrayGet(ptr ${source.value}, i64 ${currentIndex})`, ...callbackArgs.lines, ...callbackReturn.lines, `  store i64 ${callbackReturn.value}, ptr ${pointerName}`, nextLine, `  store i64 ${nextIndex}, ptr ${iPointer}`, `  br label %${condLabel}`, `${endLabel}:`];
}
export function emitArrayCallbackArguments(
  parameters: readonly JsIrFunctionParameter[],
  sourceArray: string,
  currentIndex: string,
  element: string,
  loopIndex: number
): { readonly lines: readonly string[]; readonly values: readonly string[] } {
  const lines: string[] = [];
  const values: string[] = [];
  for (let parameterIndex = 0; parameterIndex < parameters.length; parameterIndex += 1) {
    // Number and value callback parameters share the uniform i64 JSValue ABI; the
    // callee unboxes numbers in its prologue.
    const value = emitArrayCallbackValueArgument(parameterIndex, sourceArray, currentIndex, element, loopIndex, lines);
    values.push(`i64 ${value}`);
  }
  return { lines, values };
}
export function emitReduceCallbackArguments(
  parameters: readonly JsIrFunctionParameter[],
  sourceArray: string,
  currentIndex: string,
  accumulatorPointer: string,
  element: string,
  loopIndex: number
): { readonly lines: readonly string[]; readonly values: readonly string[] } {
  const lines: string[] = [];
  const values: string[] = [];
  const accumulator = `%arr.reduce.acc.${loopIndex}`;
  lines.push(`  ${accumulator} = load i64, ptr ${accumulatorPointer}`);
  const valueArguments = [accumulator, element];
  // Number and value callback parameters share the uniform i64 JSValue ABI; the
  // callee unboxes numbers in its prologue.
  for (let parameterIndex = 0; parameterIndex < parameters.length; parameterIndex += 1) {
    if (parameterIndex < 2) {
      values.push(`i64 ${valueArguments[parameterIndex]}`);
      continue;
    }
    const value = emitArrayCallbackValueArgument(parameterIndex - 1, sourceArray, currentIndex, element, loopIndex, lines);
    values.push(`i64 ${value}`);
  }
  return { lines, values };
}
export function emitArrayCallbackValueArgument(
  parameterIndex: number,
  sourceArray: string,
  currentIndex: string,
  element: string,
  loopIndex: number,
  lines: string[]
): string {
  if (parameterIndex === 0) {
    return element;
  }
  if (parameterIndex === 1) {
    const number = `%arr.map.arg.${loopIndex}.idx.num`;
    const value = `%arr.map.arg.${loopIndex}.idx.value`;
    lines.push(`  ${number} = uitofp i64 ${currentIndex} to double`, `  ${value} = call i64 @valueBoxNumber(double ${number})`);
    return value;
  }
  const value = `%arr.map.arg.${loopIndex}.array`;
  lines.push(`  ${value} = call i64 @valueBoxArray(ptr ${sourceArray})`);
  return value;
}
export function emitArrayCallbackReturn(
  _returnKind: JsIrValueKind,
  callbackName: string,
  args: readonly string[],
  _loopIndex: number,
  context: EmitContext
): { readonly lines: readonly string[]; readonly value: string } {
  return emitGeneratedJsCall(callbackName, args, context);
}
export function emitFunctionObjectCallbackReturn(
  functionValue: string,
  args: readonly string[],
  loopIndex: number,
  context: EmitContext
): { readonly lines: readonly string[]; readonly value: string } {
  const rawArgs = args.map((arg) => arg.replace(/^i64 /, ""));
  const argv = `%arr.map.argv.${loopIndex}`;
  const lines = [`  ${argv} = alloca i64, i64 ${rawArgs.length}`];
  for (let i = 0; i < rawArgs.length; i += 1) {
    const slot = `%arr.map.argv.${loopIndex}.${i}`;
    lines.push(`  ${slot} = getelementptr i64, ptr ${argv}, i64 ${i}`, `  store i64 ${rawArgs[i]}, ptr ${slot}`);
  }
  const generated = emitGeneratedJsCall(
    "jsCall",
    [`i64 ${functionValue}`, `i64 ${rawArgs.length}`, `ptr ${argv}`, `i64 ${jsValueUndefined}`],
    context
  );
  lines.push(...generated.lines);
  return { lines, value: generated.value };
}
export function emitIgnoredCallbackCall(
  _returnKind: JsIrValueKind | "void",
  callbackName: string,
  args: readonly string[],
  context: EmitContext
): readonly string[] {
  return emitGeneratedJsCall(callbackName, args, context).lines;
}
export function emitRuntimeArrayFlatOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayFlat" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  const array = emitRuntimeArrayPointer(operation.arrayName, context);
  const depth = emitArrayIndex(operation.depth, context);
  const result = `%arr.rt.${context.arrayIndex}`;
  context.arrayIndex += 1;
  return [
    `  ${pointerName} = alloca ptr`,
    ...array.lines,
    ...depth.lines,
    `  ${result} = call ptr @arrayFlat(ptr ${array.value}, i64 ${depth.value})`,
    `  store ptr ${result}, ptr ${pointerName}`
  ];
}
export function emitRuntimeArrayFromOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayFrom" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  let source = emitRuntimeArrayPointer(operation.targetName, context);
  let helper: "arrayFromArray" | "arrayFromObject" = "arrayFromArray";
  if (operation.targetKind === "object") {
    source = emitRuntimeObjectPointer(operation.targetName, context);
    helper = "arrayFromObject";
  }
  const result = `%arr.from.${context.arrayIndex}`;
  context.arrayIndex += 1;
  return [`  ${pointerName} = alloca ptr`, ...source.lines, `  ${result} = call ptr @${helper}(ptr ${source.value})`, `  store ptr ${result}, ptr ${pointerName}`];
}
export function emitRuntimeArrayFromValueOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayFromValue" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  const source = context.emitValue(operation.source);
  let mapper: JsValue = { lines: [], value: jsValueUndefined };
  if (operation.mapper !== undefined) {
    mapper = context.emitValue(operation.mapper);
  }
  let thisArg: JsValue = { lines: [], value: jsValueUndefined };
  if (operation.thisArg !== undefined) {
    thisArg = context.emitValue(operation.thisArg);
  }
  const generated = emitGeneratedJsCall("arrayFromValue", [`i64 ${source.value}`, `i64 ${mapper.value}`, `i64 ${thisArg.value}`], context);
  const arrayPtr = `%arr.from.value.${context.arrayIndex}`;
  context.arrayIndex += 1;
  return [
    `  ${pointerName} = alloca ptr`,
    ...source.lines,
    ...mapper.lines,
    `  call void @gcRootPush(i64 ${mapper.value})`,
    ...thisArg.lines,
    `  call void @gcRootPush(i64 ${thisArg.value})`,
    ...generated.lines,
    `  ${arrayPtr} = call ptr @valueArrayPtr(i64 ${generated.value})`,
    `  store ptr ${arrayPtr}, ptr ${pointerName}`
  ];
}
// Consumes a Map/Set through its protocol-compatible collection iterator into a new runtime array.
// eslint-disable-next-line max-statements -- Iterator setup, optional mapping, and collection are one control-flow operation.
export function emitRuntimeArrayFromCollectionOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayFromCollection" }>,
  context: EmitContext
): string[] {
  const index = context.arrayIndex;
  context.arrayIndex += 1;
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  const collection = emitRuntimeCollectionPointer(operation.collectionName, context);
  let mapper: JsValue = { lines: [], value: jsValueUndefined };
  if (operation.mapper !== undefined) {
    mapper = context.emitValue(operation.mapper);
  }
  let thisArg: JsValue = { lines: [], value: jsValueUndefined };
  if (operation.thisArg !== undefined) {
    thisArg = context.emitValue(operation.thisArg);
  }
  const modeCode = runtimeIteratorKindCode(operation.iterationKind);
  let sourceCode = 3;
  if (operation.sourceKind === "map") {
    sourceCode = 2;
  }
  const iteratorCall = emitGeneratedJsCall("getCollectionIterator", [`ptr ${collection.value}`, `i64 ${sourceCode}`, `i64 ${modeCode}`], context);
  const iterator = iteratorCall.value;
  const out = `%arr.from.col.out.${index}`;
  const outRoot = `%arr.from.col.out.root.${index}`;
  const loopFrame = `%arr.from.col.loop.frame.${index}`;
  const nextCall = emitGeneratedJsCall("callIteratorNext", [`i64 ${iterator}`], context);
  const doneKey = addStringConstant("done", context);
  const valueKey = addStringConstant("value", context);
  const doneValue = `%arr.from.col.done.${index}`;
  const isDone = `%arr.from.col.is.done.${index}`;
  const item = `%arr.from.col.item.${index}`;
  const mappedItem = `%arr.from.col.mapped.${index}`;
  const currentIndex = `%arr.from.col.index.${index}`;
  const nextIndex = `%arr.from.col.index.next.${index}`;
  const indexPointer = `%arr.from.col.index.addr.${index}`;
  const condLabel = `arr.from.col.cond.${index}`;
  const bodyLabel = `arr.from.col.body.${index}`;
  const endLabel = `arr.from.col.end.${index}`;
  let pushedValue = item;
  const mappingLines: string[] = [];
  if (operation.mapper !== undefined) {
    const indexNumber = `%arr.from.col.index.number.${index}`;
    const indexValue = `%arr.from.col.index.value.${index}`;
    const argv = `%arr.from.col.map.argv.${index}`;
    const arg0 = `%arr.from.col.map.arg0.${index}`;
    const arg1 = `%arr.from.col.map.arg1.${index}`;
    const mapped = emitGeneratedJsCall("jsCall", [`i64 ${mapper.value}`, "i64 2", `ptr ${argv}`, `i64 ${thisArg.value}`], context);
    mappingLines.push(
      `  ${indexNumber} = uitofp i64 ${currentIndex} to double`,
      `  ${indexValue} = call i64 @valueBoxNumber(double ${indexNumber})`,
      `  ${argv} = alloca i64, i64 2`,
      `  ${arg0} = getelementptr i64, ptr ${argv}, i64 0`,
      `  store i64 ${item}, ptr ${arg0}`,
      `  ${arg1} = getelementptr i64, ptr ${argv}, i64 1`,
      `  store i64 ${indexValue}, ptr ${arg1}`,
      ...mapped.lines,
      `  ${mappedItem} = add i64 ${mapped.value}, 0`
    );
    pushedValue = mappedItem;
  }
  return [
    `  ${pointerName} = alloca ptr`,
    ...collection.lines,
    ...mapper.lines,
    `  call void @gcRootPush(i64 ${mapper.value})`,
    ...thisArg.lines,
    `  call void @gcRootPush(i64 ${thisArg.value})`,
    ...iteratorCall.lines,
    `  call void @gcRootPush(i64 ${iterator})`,
    `  ${out} = call ptr @arrayNew(i64 0)`,
    `  store ptr ${out}, ptr ${pointerName}`,
    `  ${outRoot} = call i64 @valueBoxArray(ptr ${out})`,
    `  call void @gcRootPush(i64 ${outRoot})`,
    `  ${indexPointer} = alloca i64`,
    `  store i64 0, ptr ${indexPointer}`,
    `  ${loopFrame} = call i64 @gcRootSave()`,
    `  br label %${condLabel}`,
    `${condLabel}:`,
    `  call void @gcRootRestore(i64 ${loopFrame})`,
    `  call void @gcSafepoint()`,
    ...nextCall.lines,
    `  ${doneValue} = call i64 @valuePropertyGet(i64 ${nextCall.value}, i64 4, ptr ${doneKey})`,
    `  ${isDone} = call i1 @valueTruthy(i64 ${doneValue})`,
    `  br i1 ${isDone}, label %${endLabel}, label %${bodyLabel}`,
    `${bodyLabel}:`,
    `  ${item} = call i64 @valuePropertyGet(i64 ${nextCall.value}, i64 5, ptr ${valueKey})`,
    `  ${currentIndex} = load i64, ptr ${indexPointer}`,
    ...mappingLines,
    `  call void @gcRootPush(i64 ${pushedValue})`,
    `  call i64 @arrayPush(ptr ${out}, i64 ${pushedValue})`,
    `  ${nextIndex} = add i64 ${currentIndex}, 1`,
    `  store i64 ${nextIndex}, ptr ${indexPointer}`,
    `  br label %${condLabel}`,
    `${endLabel}:`
  ];
}
export function emitRuntimeArraySortOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArraySort" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  const array = emitRuntimeArrayPointer(operation.arrayName, context);
  if (operation.callbackName === undefined || operation.callbackParameters === undefined || operation.callbackReturnKind === undefined) {
    return [`  ${pointerName} = alloca ptr`, ...array.lines, `  call void @arraySortDefault(ptr ${array.value})`, `  store ptr ${array.value}, ptr ${pointerName}`];
  }
  const sortLines = emitRuntimeArrayComparatorSort(array.value, operation.callbackName, operation.callbackParameters, operation.callbackReturnKind, context);
  return [`  ${pointerName} = alloca ptr`, ...array.lines, ...sortLines, `  store ptr ${array.value}, ptr ${pointerName}`];
}
// eslint-disable-next-line max-statements -- Comparator sort owns nested loop labels plus callback invocation.
export function emitRuntimeArrayComparatorSort(
  array: string,
  callbackName: string,
  callbackParameters: readonly JsIrFunctionParameter[],
  callbackReturnKind: JsIrValueKind,
  context: EmitContext
): string[] {
  const index = context.arrayIndex;
  context.arrayIndex += 1;
  const length = `%arr.sort.len.${index}`;
  const iPointer = `%arr.sort.i.${index}.addr`;
  const jPointer = `%arr.sort.j.${index}.addr`;
  const outerCond = `arr.sort.outer.cond.${index}`;
  const outerBody = `arr.sort.outer.body.${index}`;
  const innerCond = `arr.sort.inner.cond.${index}`;
  const innerBody = `arr.sort.inner.body.${index}`;
  const swapLabel = `arr.sort.swap.${index}`;
  const advanceLabel = `arr.sort.advance.${index}`;
  const outerAdvance = `arr.sort.outer.advance.${index}`;
  const endLabel = `arr.sort.end.${index}`;
  const i = `%arr.sort.i.${index}`;
  const j = `%arr.sort.j.${index}`;
  const nextJ = `%arr.sort.next.j.${index}`;
  const nextI = `%arr.sort.next.i.${index}`;
  const limit = `%arr.sort.limit.${index}`;
  const left = `%arr.sort.left.${index}`;
  const right = `%arr.sort.right.${index}`;
  const callbackArgs = emitSortCallbackArguments(callbackParameters, left, right);
  const callbackReturn = emitArrayCallbackReturn(callbackReturnKind, callbackName, callbackArgs.values, index, context);
  const order = `%arr.sort.order.${index}`;
  const shouldSwap = `%arr.sort.should.swap.${index}`;
  return [`  ${length} = call i64 @arrayLength(ptr ${array})`, `  ${iPointer} = alloca i64`, `  ${jPointer} = alloca i64`, `  store i64 0, ptr ${iPointer}`, `  br label %${outerCond}`, `${outerCond}:`, `  ${i} = load i64, ptr ${iPointer}`, `  %arr.sort.outer.done.${index} = icmp uge i64 ${i}, ${length}`, `  br i1 %arr.sort.outer.done.${index}, label %${endLabel}, label %${outerBody}`, `${outerBody}:`, `  store i64 0, ptr ${jPointer}`, `  br label %${innerCond}`, `${innerCond}:`, `  ${j} = load i64, ptr ${jPointer}`, `  ${limit} = sub i64 ${length}, 1`, `  %arr.sort.inner.done.${index} = icmp uge i64 ${j}, ${limit}`, `  br i1 %arr.sort.inner.done.${index}, label %${outerAdvance}, label %${innerBody}`, `${innerBody}:`, `  ${nextJ} = add i64 ${j}, 1`, `  ${left} = call i64 @arrayGet(ptr ${array}, i64 ${j})`, `  ${right} = call i64 @arrayGet(ptr ${array}, i64 ${nextJ})`, ...callbackArgs.lines, ...callbackReturn.lines, `  ${order} = call double @valueToNumber(i64 ${callbackReturn.value})`, `  ${shouldSwap} = fcmp ogt double ${order}, 0.0`, `  br i1 ${shouldSwap}, label %${swapLabel}, label %${advanceLabel}`, `${swapLabel}:`, `  call void @arraySet(ptr ${array}, i64 ${j}, i64 ${right})`, `  call void @arraySet(ptr ${array}, i64 ${nextJ}, i64 ${left})`, `  br label %${advanceLabel}`, `${advanceLabel}:`, `  store i64 ${nextJ}, ptr ${jPointer}`, `  br label %${innerCond}`, `${outerAdvance}:`, `  ${nextI} = add i64 ${i}, 1`, `  store i64 ${nextI}, ptr ${iPointer}`, `  br label %${outerCond}`, `${endLabel}:`];
}
export function emitSortCallbackArguments(
  parameters: readonly JsIrFunctionParameter[],
  left: string,
  right: string
): { readonly lines: readonly string[]; readonly values: readonly string[] } {
  const lines: string[] = [];
  const values: string[] = [];
  const rawValues = [left, right];
  // Number and value callback parameters share the uniform i64 JSValue ABI; the
  // callee unboxes numbers in its prologue.
  for (let parameterIndex = 0; parameterIndex < parameters.length; parameterIndex += 1) {
    const raw = rawValues[parameterIndex] ?? jsValueUndefined;
    values.push(`i64 ${raw}`);
  }
  return { lines, values };
}
