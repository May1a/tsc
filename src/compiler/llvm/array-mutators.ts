import type { JsIrValueExpression } from "../ir/expressions.js";
import type { JsIrOperation } from "../ir/types.js";
import type { EmitContext, JsValue, NumberValue } from "./context.js";
import { emitRuntimeArrayPointer } from "./layout.js";
import { emitArrayIndex } from "./numbers.js";

/**
 * The array mutators: store, delete, push, pop, shift, unshift, fill, reverse, copyWithin, setLength.
 *
 * These are the operations that change an array in place, and they share one thing: none of them
 * produces a value the source can name, because the receiver is the result. `emitRuntimeArrayAppend`
 * and `emitRuntimeArrayRemove` are each reached under two names — `push`/`unshift` and
 * `pop`/`shift` — and they differ only in the index they start from, so the table points both keys at
 * one function rather than duplicating it.
 *
 * `arrayValueRemoveHelper` is the `pop`/`shift` counterpart on the *value* tier: it returns the removed
 * element rather than leaving it in the array. The two cannot share because one has an element to
 * produce and the other does not.
 */

export function emitRuntimeArrayStoreOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayStore" }>,
  context: EmitContext
): string[] {
  const array = emitRuntimeArrayPointer(operation.arrayName, context);
  const index = emitArrayIndex(operation.index, context);
  const value = context.emitValue(operation.value);
  return [...array.lines, ...index.lines, ...value.lines, `  call void @arraySet(ptr ${array.value}, i64 ${index.value}, i64 ${value.value})`];
}
export function emitRuntimeArrayDeleteOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayDelete" }>,
  context: EmitContext
): string[] {
  const array = emitRuntimeArrayPointer(operation.arrayName, context);
  const index = emitArrayIndex(operation.index, context);
  return [...array.lines, ...index.lines, `  call void @arrayDelete(ptr ${array.value}, i64 ${index.value})`];
}
export function emitRuntimeArraySetLengthOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArraySetLength" }>,
  context: EmitContext
): string[] {
  const array = emitRuntimeArrayPointer(operation.arrayName, context);
  const length = emitArrayIndex(operation.length, context);
  return [...array.lines, ...length.lines, `  call void @arraySetLength(ptr ${array.value}, i64 ${length.value})`];
}
export function emitRuntimeArrayAppendOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayPush" | "runtimeArrayUnshift" }>,
  context: EmitContext
): string[] {
  const array = emitRuntimeArrayPointer(operation.arrayName, context);
  const values = operation.values.map((value) => context.emitValue(value));
  const lines = [...array.lines];
  const helper = runtimeArrayAppendHelper(operation.kind);
  for (const value of values) {
    lines.push(...value.lines, `  call i64 @${helper}(ptr ${array.value}, i64 ${value.value})`);
  }
  return lines;
}
export function emitRuntimeArrayRemoveOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayPop" | "runtimeArrayShift" }>,
  context: EmitContext
): string[] {
  const array = emitRuntimeArrayPointer(operation.arrayName, context);
  const helper = runtimeArrayRemoveHelper(operation.kind);
  return [...array.lines, `  call i64 @${helper}(ptr ${array.value})`];
}
export function emitRuntimeArrayFillOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayFill" }>,
  context: EmitContext
): string[] {
  const array = emitRuntimeArrayPointer(operation.arrayName, context);
  const value = context.emitValue(operation.value);
  let start: NumberValue = { lines: [], value: "0" };
  let end: NumberValue;
  if (operation.start !== undefined) {
    start = emitArrayIndex(operation.start, context);
  }
  if (operation.end === undefined) {
    const length = `%arr.len.${context.numIndex}`;
    context.numIndex += 1;
    end = { lines: [`  ${length} = call i64 @arrayLength(ptr ${array.value})`], value: length };
  } else {
    end = emitArrayIndex(operation.end, context);
  }
  return [...array.lines, ...value.lines, ...start.lines, ...end.lines, `  call void @arrayFill(ptr ${array.value}, i64 ${value.value}, i64 ${start.value}, i64 ${end.value})`];
}
export function emitRuntimeArrayReverseOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayReverse" }>,
  context: EmitContext
): string[] {
  const array = emitRuntimeArrayPointer(operation.arrayName, context);
  return [...array.lines, `  call void @arrayReverse(ptr ${array.value})`];
}
export function emitRuntimeArrayCopyWithinOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayCopyWithin" }>,
  context: EmitContext
): string[] {
  const array = emitRuntimeArrayPointer(operation.arrayName, context);
  const target = emitArrayIndex(operation.target, context);
  const start = emitArrayIndex(operation.start, context);
  let end: NumberValue;
  if (operation.end === undefined) {
    const length = `%arr.len.${context.numIndex}`;
    context.numIndex += 1;
    end = { lines: [`  ${length} = call i64 @arrayLength(ptr ${array.value})`], value: length };
  } else {
    end = emitArrayIndex(operation.end, context);
  }
  return [...array.lines, ...target.lines, ...start.lines, ...end.lines, `  call void @arrayCopyWithin(ptr ${array.value}, i64 ${target.value}, i64 ${start.value}, i64 ${end.value})`];
}
export function runtimeArrayAppendHelper(kind: "runtimeArrayPush" | "runtimeArrayUnshift"): "arrayPush" | "arrayUnshift" {
  if (kind === "runtimeArrayPush") {
    return "arrayPush";
  }
  return "arrayUnshift";
}
export function runtimeArrayRemoveHelper(kind: "runtimeArrayPop" | "runtimeArrayShift"): "arrayPop" | "arrayShift" {
  if (kind === "runtimeArrayPop") {
    return "arrayPop";
  }
  return "arrayShift";
}
export function emitRuntimeArrayRemoveValueExpression(
  expression: Extract<JsIrValueExpression, { readonly kind: "arrayPop" | "arrayShift" }>,
  context: EmitContext
): JsValue {
  const array = emitRuntimeArrayPointer(expression.arrayName, context);
  const valueIndex = context.numIndex;
  context.numIndex += 1;
  const value = `%value.${valueIndex}`;
  const helper = arrayValueRemoveHelper(expression.kind);
  return { lines: [...array.lines, `  ${value} = call i64 @${helper}(ptr ${array.value})`], value };
}
export function arrayValueRemoveHelper(kind: "arrayPop" | "arrayShift"): "arrayPop" | "arrayShift" {
  if (kind === "arrayPop") {
    return "arrayPop";
  }
  return "arrayShift";
}
