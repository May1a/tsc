import type { JsIrOperation } from "../ir/types.js";
import type { EmitContext, OperationOf } from "./context.js";
import { emitGeneratedJsCall } from "./completion.js";
import { emitRuntimeArrayPointer, emitRuntimeCollectionPointer } from "./layout.js";
import { variablePointerName } from "./names.js";
import { addStringConstant, utf8ByteLength } from "./strings.js";
import { jsValueTrue } from "./values.js";

/**
 * The Map/Set tier. Both owners share these emitters because both are the same runtime object with a
 * different key discipline, so the table in `operations.ts` points `runtimeMapSet` and `runtimeSetAdd`
 * at one function rather than near-duplicating it.
 *
 * `kindCode` is the discriminator the runtime stores in the collection header, which is why `keys` is
 * 0: it is the `for (const k of map)` case, and the others are ordered after it. That ordering is
 * load-bearing — the header field is a byte in the emitted object, not a name in TypeScript.
 */

/** The IR operation of one kind, narrowed from the whole union. */
/** Stores into a collection's fixed slots. One shape for all three: a `getelementptr` plus a `store`. */
export function emitRuntimeCollectionMutationOperation(
  operation: OperationOf<"runtimeCollectionSetIterator" | "runtimeMapSet" | "runtimeSetAdd">,
  context: EmitContext
): string[] {
  if (operation.kind === "runtimeCollectionSetIterator") {
    const collection = emitRuntimeCollectionPointer(operation.collectionName, context);
    const value = context.emitValue(operation.value);
    const slot = `%collection.iterator.slot.${context.objectIndex}`;
    context.objectIndex += 1;
    return [...collection.lines, ...value.lines, `  ${slot} = getelementptr i8, ptr ${collection.value}, i64 32`, `  store i64 ${value.value}, ptr ${slot}`];
  }
  if (operation.kind === "runtimeMapSet") {
    const collection = emitRuntimeCollectionPointer(operation.mapName, context);
    const key = context.emitValue(operation.key);
    const value = context.emitValue(operation.value);
    return [...collection.lines, ...key.lines, ...value.lines, `  call void @collectionSet(ptr ${collection.value}, i64 ${key.value}, i64 ${value.value})`];
  }
  const collection = emitRuntimeCollectionPointer(operation.setName, context);
  const value = context.emitValue(operation.value);
  return [...collection.lines, ...value.lines, `  call void @collectionSet(ptr ${collection.value}, i64 ${value.value}, i64 ${jsValueTrue})`];
}
export function emitRuntimeCollectionNewOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeMapNew" | "runtimeSetNew" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  let bindingKind: "runtimeMap" | "runtimeSet" = "runtimeSet";
  if (operation.kind === "runtimeMapNew") {
    bindingKind = "runtimeMap";
  }
  context.bindings.set(operation.name, { kind: bindingKind, name: operation.name });
  return [`  ${pointerName} = alloca ptr`, `  %${operation.name}.collection = call ptr @collectionNew()`, `  store ptr %${operation.name}.collection, ptr ${pointerName}`];
}
// Consumes the currently supported iterable-constructor source shape: a runtime
// array. Map entries are runtime array pairs, matching `new Map([[k, v]])`.
// eslint-disable-next-line max-statements -- Constructor iteration emits allocation, loop control, and per-kind insertion in one LLVM block.
export function emitRuntimeCollectionFromArrayOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeMapFromArray" | "runtimeSetFromArray" }>,
  context: EmitContext
): string[] {
  const index = context.arrayIndex;
  context.arrayIndex += 1;
  const pointerName = variablePointerName(operation.name);
  const source = emitRuntimeArrayPointer(operation.sourceName, context);
  const collection = `%${operation.name}.collection`;
  const length = `%${operation.name}.source.length.${index}`;
  const indexSlot = `%${operation.name}.source.index.slot.${index}`;
  const currentIndex = `%${operation.name}.source.index.${index}`;
  const inRange = `%${operation.name}.source.in.range.${index}`;
  const element = `%${operation.name}.source.element.${index}`;
  const nextIndex = `%${operation.name}.source.next.${index}`;
  const condLabel = `${operation.name}.from.array.cond.${index}`;
  const bodyLabel = `${operation.name}.from.array.body.${index}`;
  const endLabel = `${operation.name}.from.array.end.${index}`;
  let bindingKind: "runtimeMap" | "runtimeSet" = "runtimeSet";
  if (operation.kind === "runtimeMapFromArray") {
    bindingKind = "runtimeMap";
  }
  context.bindings.set(operation.name, { kind: bindingKind, name: operation.name });
  const lines = [
    `  ${pointerName} = alloca ptr`,
    ...source.lines,
    `  ${collection} = call ptr @collectionNew()`,
    `  store ptr ${collection}, ptr ${pointerName}`,
    `  ${length} = call i64 @arrayLength(ptr ${source.value})`,
    `  ${indexSlot} = alloca i64`,
    `  store i64 0, ptr ${indexSlot}`,
    `  br label %${condLabel}`,
    `${condLabel}:`,
    `  ${currentIndex} = load i64, ptr ${indexSlot}`,
    `  ${inRange} = icmp ult i64 ${currentIndex}, ${length}`,
    `  br i1 ${inRange}, label %${bodyLabel}, label %${endLabel}`,
    `${bodyLabel}:`,
    `  ${element} = call i64 @arrayGet(ptr ${source.value}, i64 ${currentIndex})`
  ];
  if (operation.kind === "runtimeMapFromArray") {
    const keyConstant = addStringConstant("0", context);
    const valueConstant = addStringConstant("1", context);
    const key = `%${operation.name}.source.entry.key.${index}`;
    const value = `%${operation.name}.source.entry.value.${index}`;
    lines.push(
      `  ${key} = call i64 @valueArrayGet(i64 ${element}, i64 0, i64 1, ptr ${keyConstant})`,
      `  ${value} = call i64 @valueArrayGet(i64 ${element}, i64 1, i64 1, ptr ${valueConstant})`,
      `  call void @collectionSet(ptr ${collection}, i64 ${key}, i64 ${value})`
    );
  } else {
    lines.push(`  call void @collectionSet(ptr ${collection}, i64 ${element}, i64 ${jsValueTrue})`);
  }
  lines.push(
    `  ${nextIndex} = add i64 ${currentIndex}, 1`,
    `  store i64 ${nextIndex}, ptr ${indexSlot}`,
    `  br label %${condLabel}`,
    `${endLabel}:`
  );
  return lines;
}
export function emitRuntimeCollectionResultOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeMapSetResult" | "runtimeSetAddResult" }>,
  context: EmitContext
): string[] {
  let sourceName: string;
  if (operation.kind === "runtimeMapSetResult") {
    sourceName = operation.mapName;
  } else {
    sourceName = operation.setName;
  }
  const collection = emitRuntimeCollectionPointer(sourceName, context);
  const pointerName = variablePointerName(operation.name);
  const lines = [`  ${pointerName} = alloca ptr`, ...collection.lines];
  if (operation.kind === "runtimeMapSetResult") {
    const key = context.emitValue(operation.key);
    const value = context.emitValue(operation.value);
    lines.push(...key.lines, ...value.lines, `  call void @collectionSet(ptr ${collection.value}, i64 ${key.value}, i64 ${value.value})`);
  } else {
    const value = context.emitValue(operation.value);
    lines.push(...value.lines, `  call void @collectionSet(ptr ${collection.value}, i64 ${value.value}, i64 ${jsValueTrue})`);
  }
  lines.push(`  store ptr ${collection.value}, ptr ${pointerName}`);
  let bindingKind: "runtimeMap" | "runtimeSet" = "runtimeSet";
  if (operation.kind === "runtimeMapSetResult") {
    bindingKind = "runtimeMap";
  }
  context.bindings.set(operation.name, { kind: bindingKind, name: operation.name });
  return lines;
}
export function emitRuntimeCollectionFromIterableOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeMapFromIterable" | "runtimeSetFromIterable" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  let bindingKind: "runtimeMap" | "runtimeSet" = "runtimeSet";
  let helper: "mapFromIterable" | "setFromIterable" = "setFromIterable";
  if (operation.kind === "runtimeMapFromIterable") {
    bindingKind = "runtimeMap";
    helper = "mapFromIterable";
  }
  context.bindings.set(operation.name, { kind: bindingKind, name: operation.name });
  const iterable = context.emitValue(operation.iterable);
  const messageConstant = addStringConstant(operation.notIterableMessage, context);
  const message = `%${operation.name}.not.iterable`;
  const generated = emitGeneratedJsCall(helper, [`i64 ${iterable.value}`, `i64 ${message}`], context);
  const collection = `%${operation.name}.collection`;
  return [
    `  ${pointerName} = alloca ptr`,
    ...iterable.lines,
    `  call void @gcRootPush(i64 ${iterable.value})`,
    `  ${message} = call i64 @valueBoxString(ptr ${messageConstant}, i64 ${utf8ByteLength(operation.notIterableMessage)})`,
    ...generated.lines,
    `  ${collection} = inttoptr i64 ${generated.value} to ptr`,
    `  store ptr ${collection}, ptr ${pointerName}`
  ];
}
// Copies entries/values from one collection into a new Map or Set using the
// protocol-compatible collection iterator (entries for maps, values for sets).
// eslint-disable-next-line max-statements -- Collection copy emits iterator acquisition, next loop, and Map/Set insertion together.
export function emitRuntimeCollectionFromCollectionOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeMapFromCollection" | "runtimeSetFromCollection" }>,
  context: EmitContext
): string[] {
  const index = context.arrayIndex;
  context.arrayIndex += 1;
  const pointerName = variablePointerName(operation.name);
  let bindingKind: "runtimeMap" | "runtimeSet" = "runtimeSet";
  if (operation.kind === "runtimeMapFromCollection") {
    bindingKind = "runtimeMap";
  }
  context.bindings.set(operation.name, { kind: bindingKind, name: operation.name });
  const source = emitRuntimeCollectionPointer(operation.sourceName, context);
  let sourceCode = 3;
  let iterationKind = 1;
  if (operation.sourceKind === "map") {
    sourceCode = 2;
    iterationKind = 2;
  }
  const iteratorCall = emitGeneratedJsCall("getCollectionIterator", [`ptr ${source.value}`, `i64 ${sourceCode}`, `i64 ${iterationKind}`], context);
  const iterator = iteratorCall.value;
  const collection = `%${operation.name}.collection`;
  const collectionRoot = `%${operation.name}.collection.root`;
  const loopFrame = `%col.from.col.loop.frame.${index}`;
  const nextCall = emitGeneratedJsCall("callIteratorNext", [`i64 ${iterator}`], context);
  const doneKey = addStringConstant("done", context);
  const valueKey = addStringConstant("value", context);
  const doneValue = `%col.from.col.done.${index}`;
  const isDone = `%col.from.col.is.done.${index}`;
  const item = `%col.from.col.item.${index}`;
  const condLabel = `col.from.col.cond.${index}`;
  const bodyLabel = `col.from.col.body.${index}`;
  const endLabel = `col.from.col.end.${index}`;
  const lines = [
    `  ${pointerName} = alloca ptr`,
    ...source.lines,
    `  ${collection} = call ptr @collectionNew()`,
    `  store ptr ${collection}, ptr ${pointerName}`,
    `  ${collectionRoot} = call i64 @valueBoxObject(ptr ${collection})`,
    `  call void @gcRootPush(i64 ${collectionRoot})`,
    ...iteratorCall.lines,
    `  call void @gcRootPush(i64 ${iterator})`,
    `  ${loopFrame} = call i64 @gcRootSave()`,
    `  br label %${condLabel}`,
    `${condLabel}:`,
    `  call void @gcRootRestore(i64 ${loopFrame})`,
    `  call void @gcSafepoint()`,
    ...nextCall.lines,
    `  ${doneValue} = call i64 @valueObjectGet(i64 ${nextCall.value}, i64 4, ptr ${doneKey})`,
    `  ${isDone} = call i1 @valueTruthy(i64 ${doneValue})`,
    `  br i1 ${isDone}, label %${endLabel}, label %${bodyLabel}`,
    `${bodyLabel}:`,
    `  ${item} = call i64 @valueObjectGet(i64 ${nextCall.value}, i64 5, ptr ${valueKey})`,
    `  call void @gcRootPush(i64 ${item})`
  ];
  if (operation.kind === "runtimeMapFromCollection") {
    const keyConstant = addStringConstant("0", context);
    const valueConstant = addStringConstant("1", context);
    const key = `%col.from.col.key.${index}`;
    const value = `%col.from.col.value.${index}`;
    // Entry objects and arrays both support property keys "0"/"1".
    lines.push(
      `  ${key} = call i64 @valueArrayGet(i64 ${item}, i64 0, i64 1, ptr ${keyConstant})`,
      `  ${value} = call i64 @valueArrayGet(i64 ${item}, i64 1, i64 1, ptr ${valueConstant})`,
      `  call void @collectionSet(ptr ${collection}, i64 ${key}, i64 ${value})`
    );
  } else {
    lines.push(`  call void @collectionSet(ptr ${collection}, i64 ${item}, i64 ${jsValueTrue})`);
  }
  lines.push(`  br label %${condLabel}`, `${endLabel}:`);
  return lines;
}
