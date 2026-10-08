import type { JsIrOperation } from "../ir/types.js";
import { emitNamedValueBinding } from "./conditions.js";
import type { EmitContext, JsValue } from "./context.js";
import { stringLengthPointerName, uniqueLocalName, uniqueValueSlotName, variablePointerName } from "./names.js";
import {
  emitRuntimeCollectionPointer,
  emitRuntimeObjectPointer
} from "./layout.js";
import {
  createCleanupFrame,
  emitCleanupAfterBody,
  emitCleanupFinalDispatch,
  emitGeneratedJsCall,
  emitIteratorCloseBody,
  emitThrowEntryBlock
} from "./completion.js";
import { emitNumberValueExpression } from "./objects.js";
import { emitObjectFieldPointer } from "./paths.js";
import { emitPrivateFieldBrandThrow } from "./value-calls.js";
import { emitArrayElementPointer, emitArrayIndex } from "./numbers.js";
import { addStringConstant, utf8ByteLength } from "./strings.js";
import { jsValueUndefined } from "./values.js";

/**
 * The binding and assignment statements: `let`, `assign`, a store into an aggregate, a private-field
 * write, and array destructuring.
 *
 * A `let` emits nothing but a binding-map entry — the variable's slot already exists, allocated when the
 * enclosing function or block was entered. That is why `emitLet*` returns no lines: the binding is
 * compiler state, not code, and a `let` that shadows an outer name changes which slot later reads
 * resolve to without changing a single instruction.
 *
 * `emitValueAggregateStore` is reached under four names — an object store, an array store, a private
 * field, and the `delete` forms — because all four are "find the slot, write an `i64`", and they differ
 * only in how the slot is named. `bindingSlotName` is the reason they can share: it resolves a
 * *declaration's* slot, which is not always the identifier the expression names.
 */

export function emitLetNumberOperation(
  operation: Extract<JsIrOperation, { readonly kind: "letNumber" }>,
  context: EmitContext
): string[] {
  const result = context.emitNumberExpression(operation.value);
  const pointer = uniqueLocalName(variablePointerName(operation.name), context);
  context.bindings.set(operation.name, { kind: "number", value: { kind: "variable", name: pointer } });
  return [...result.lines, `  ${pointer} = alloca double`, `  store double ${result.value}, ptr ${pointer}`];
}
export function emitLetStringOperation(
  operation: Extract<JsIrOperation, { readonly kind: "letString" }>,
  context: EmitContext
): string[] {
  const result = context.emitStringExpression(operation.value);
  const pointer = uniqueLocalName(variablePointerName(operation.name), context);
  const lengthPointer = uniqueLocalName(stringLengthPointerName(operation.name), context);
  context.bindings.set(operation.name, { kind: "stringVariable", name: operation.name });
  return [
    ...result.lines,
    `  ${pointer} = alloca ptr`,
    `  ${lengthPointer} = alloca i64`,
    `  store ptr ${result.value}, ptr ${pointer}`,
    `  store i64 ${result.length}, ptr ${lengthPointer}`
  ];
}
export function emitLetBooleanOperation(
  operation: Extract<JsIrOperation, { readonly kind: "letBoolean" }>,
  context: EmitContext
): string[] {
  const result = context.emitCondition(operation.value);
  const pointer = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "booleanVariable", name: operation.name });
  return [...result.lines, `  ${pointer} = alloca i1`, `  store i1 ${result.value}, ptr ${pointer}`];
}
// Materializes a JSValue into a stable memory slot and binds the name to it, so
// every later reference loads the same value (used for class instance locals).
export function emitLetValueOperation(
  operation: Extract<JsIrOperation, { readonly kind: "letValue" }>,
  context: EmitContext
): string[] {
  const value = context.emitValue(operation.value);
  if (operation.moduleGlobal === true) {
    context.bindings.set(operation.name, { kind: "valueVariable", name: operation.name });
    context.valueGlobals.add(operation.name);
    return [
      ...value.lines,
      `  store i64 ${value.value}, ptr @${operation.name}.value`,
      `  call void @gcRootPush(i64 ${value.value})`
    ];
  }
  const slotName = uniqueValueSlotName(operation.name, context);
  const pointer = variablePointerName(slotName);
  context.bindings.set(operation.name, { kind: "valueVariable", name: slotName });
  return [...value.lines, `  ${pointer} = alloca i64`, `  store i64 ${value.value}, ptr ${pointer}`];
}
export function emitAssignNumberOperation(
  operation: Extract<JsIrOperation, { readonly kind: "assignNumber" }>,
  context: EmitContext
): string[] {
  const binding = context.bindings.get(operation.name);
  if (binding?.kind !== "number" || binding.value.kind !== "variable") {
    return [];
  }

  const result = context.emitNumberExpression(operation.value);
  return [...result.lines, `  store double ${result.value}, ptr ${binding.value.name}`];
}
export function emitAssignStringOperation(
  operation: Extract<JsIrOperation, { readonly kind: "assignString" }>,
  context: EmitContext
): string[] {
  const binding = context.bindings.get(operation.name);
  if (binding?.kind !== "stringVariable") {
    return [];
  }

  const result = context.emitStringExpression(operation.value);
  return [
    ...result.lines,
    `  store ptr ${result.value}, ptr ${variablePointerName(binding.name)}`,
    `  store i64 ${result.length}, ptr ${stringLengthPointerName(binding.name)}`
  ];
}
export function emitAssignBooleanOperation(
  operation: Extract<JsIrOperation, { readonly kind: "assignBoolean" }>,
  context: EmitContext
): string[] {
  const binding = context.bindings.get(operation.name);
  if (binding?.kind !== "booleanVariable") {
    return [];
  }

  const result = context.emitCondition(operation.value);
  return [...result.lines, `  store i1 ${result.value}, ptr ${variablePointerName(binding.name)}`];
}
export function emitArrayStoreOperation(
  operation: Extract<JsIrOperation, { readonly kind: "arrayStore" }>,
  context: EmitContext
): string[] {
  const pointer = emitArrayElementPointer(operation.arrayName, operation.index, context);
  const value = context.emitNumberExpression(operation.value);
  return [...pointer.lines, ...value.lines, `  store double ${value.value}, ptr ${pointer.value}`];
}
export function emitObjectStoreOperation(
  operation: Extract<JsIrOperation, { readonly kind: "objectStore" }>,
  context: EmitContext
): string[] {
  const pointer = emitObjectFieldPointer(operation.objectName, operation.path, context);
  if (pointer === undefined) {
    return [];
  }
  const value = context.emitNumberExpression(operation.value);
  const lines = [...pointer.lines, ...value.lines, `  store double ${value.value}, ptr ${pointer.value}`];
  const layout = context.objectLayouts.get(operation.objectName);
  if (layout?.runtimePointerName !== undefined && operation.path.length === 1) {
    const key = context.emitStringExpression({ kind: "literal", value: operation.path[0] });
    const jsValue = emitNumberValueExpression({ kind: "number", value: operation.value }, context);
    const object = emitRuntimeObjectPointer(operation.objectName, context);
    lines.push(...key.lines, ...jsValue.lines, ...object.lines, `  call void @objectSet(ptr ${object.value}, i64 ${key.length}, ptr ${key.value}, i64 ${jsValue.value})`);
  }
  return lines;
}
export function emitValueAggregateStoreOperation(
  operation: Extract<JsIrOperation, { readonly kind: "valueObjectStore" | "valueArrayStore" | "valueArraySetLength" }>,
  context: EmitContext
): string[] {
  const receiver = emitNamedValueBinding(operation.targetName, context);
  if (operation.kind === "valueArraySetLength") {
    const length = emitArrayIndex(operation.length, context);
    return [...receiver.lines, ...length.lines, `  call void @valueArraySetLength(i64 ${receiver.value}, i64 ${length.value})`];
  }
  if (operation.kind === "valueArrayStore") {
    const index = emitArrayIndex(operation.index, context);
    const value = context.emitValue(operation.value);
    return [...receiver.lines, ...index.lines, ...value.lines, `  call void @valueArraySet(i64 ${receiver.value}, i64 ${index.value}, i64 ${value.value})`];
  }
  const key = context.emitStringExpression(operation.key);
  const value = context.emitValue(operation.value);
  return [...receiver.lines, ...key.lines, ...value.lines, `  call void @valueObjectSet(i64 ${receiver.value}, i64 ${key.length}, ptr ${key.value}, i64 ${value.value})`];
}
// Emits a private field write: the class-mangled key must be an own property of
// the receiver (the brand), otherwise a TypeError is thrown.
export function emitPrivateFieldStoreOperation(
  operation: Extract<JsIrOperation, { readonly kind: "privateFieldStore" }>,
  context: EmitContext
): string[] {
  const receiver = emitNamedValueBinding(operation.targetName, context);
  const value = context.emitValue(operation.value);
  const keyConstant = addStringConstant(operation.key, context);
  const keyLength = utf8ByteLength(operation.key);
  const index = context.objectIndex;
  context.objectIndex += 1;
  const has = `%priv.has.${index}`;
  const okLabel = `priv.ok.${index}`;
  const throwLabel = `priv.throw.${index}`;
  return [
    ...receiver.lines,
    ...value.lines,
    `  ${has} = call i1 @valueObjectHasOwn(i64 ${receiver.value}, i64 ${keyLength}, ptr ${keyConstant})`,
    `  br i1 ${has}, label %${okLabel}, label %${throwLabel}`,
    `${throwLabel}:`,
    ...emitPrivateFieldBrandThrow(operation.message, `priv.store.${index}`, context),
    `${okLabel}:`,
    `  call void @valueObjectSet(i64 ${receiver.value}, i64 ${keyLength}, ptr ${keyConstant}, i64 ${value.value})`
  ];
}
export function emitValueAggregateDeleteOperation(
  operation: Extract<JsIrOperation, { readonly kind: "valueObjectDelete" | "valueArrayDelete" }>,
  context: EmitContext
): string[] {
  const receiver = emitNamedValueBinding(operation.targetName, context);
  if (operation.kind === "valueArrayDelete") {
    const index = emitArrayIndex(operation.index, context);
    return [...receiver.lines, ...index.lines, `  call void @valueArrayDelete(i64 ${receiver.value}, i64 ${index.value})`];
  }
  const key = context.emitStringExpression(operation.key);
  return [...receiver.lines, ...key.lines, `  call void @valueObjectDelete(i64 ${receiver.value}, i64 ${key.length}, ptr ${key.value})`];
}
// Array binding consumes the iterator protocol, including lazy defaults, nested
// patterns, rest collection, and IteratorClose for binding-time failures.
// eslint-disable-next-line complexity, max-statements -- The protocol state machine is intentionally emitted in one place.
export function emitArrayDestructureProtocolOperation(
  operation: Extract<JsIrOperation, { readonly kind: "arrayDestructureProtocol" }>,
  context: EmitContext
): string[] {
  const index = context.arrayIndex;
  context.arrayIndex += 1;
  const normalLabel = `destructure.proto.normal.${index}`;
  const endLabel = `destructure.proto.end.${index}`;
  const iteratorSlot = `%destructure.proto.iter.${index}.addr`;
  const doneSlot = `%destructure.proto.done.${index}.addr`;

  let iteratorCall: JsValue;
  let setupLines: string[];
  if (operation.source.kind === "collection") {
    const collection = emitRuntimeCollectionPointer(operation.source.name, context);
    let sourceKind = 3;
    let iterationKind = 1;
    if (operation.source.sourceKind === "map") {
      sourceKind = 2;
      iterationKind = 2;
    }
    iteratorCall = emitGeneratedJsCall("getCollectionIterator", [`ptr ${collection.value}`, `i64 ${sourceKind}`, `i64 ${iterationKind}`], context);
    setupLines = [...collection.lines, ...iteratorCall.lines];
  } else {
    const iterable = context.emitValue(operation.source.value);
    const messageConstant = addStringConstant(operation.notIterableMessage, context);
    const message = `%destructure.proto.not.iterable.${index}`;
    iteratorCall = emitGeneratedJsCall("getIteratorValue", [`i64 ${iterable.value}`, `i64 ${message}`], context);
    setupLines = [
      ...iterable.lines,
      `  call void @gcRootPush(i64 ${iterable.value})`,
      `  ${message} = call i64 @valueBoxString(ptr ${messageConstant}, i64 ${utf8ByteLength(operation.notIterableMessage)})`,
      ...iteratorCall.lines
    ];
  }
  const doneKey = addStringConstant("done", context);
  const valueKey = addStringConstant("value", context);
  const lines = [
    ...setupLines,
    `  ${iteratorSlot} = alloca i64`,
    `  store i64 ${iteratorCall.value}, ptr ${iteratorSlot}`,
    `  call void @gcRootPush(i64 ${iteratorCall.value})`,
    `  ${doneSlot} = alloca i1`,
    `  store i1 false, ptr ${doneSlot}`
  ];

  for (const element of operation.elements) {
    if (element.kind === "binding") {
      const slotName = `${element.name}.destructure.${index}`;
      lines.push(`  ${variablePointerName(slotName)} = alloca i64`);
      context.bindings.set(element.name, { kind: "valueVariable", name: slotName });
    } else if (element.kind === "rest") {
      const slotName = `${element.name}.destructure.${index}`;
      lines.push(`  ${variablePointerName(slotName)} = alloca ptr`);
      context.bindings.set(element.name, { kind: "runtimeArray", name: slotName });
    } else if (element.kind === "nested") {
      const slotName = `${element.temporaryName}.destructure.${index}`;
      lines.push(`  ${variablePointerName(slotName)} = alloca i64`);
      context.bindings.set(element.temporaryName, { kind: "valueVariable", name: slotName });
    }
  }
  const closeFrame = createCleanupFrame(context, "iteratorClose", { iteratorSlot });
  context.cleanupStack.push(closeFrame);
  const outerException = context.exceptionTarget;

  for (let elementIndex = 0; elementIndex < operation.elements.length; elementIndex += 1) {
    const element = operation.elements[elementIndex];
    // The loop bound guarantees this index; the guard keeps the element non-optional so the
    // `kind` narrowing below stays total.
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- live once noUncheckedIndexedAccess is enabled
    if (element === undefined) {
      throw new Error(`Array destructure element ${elementIndex} is missing`);
    }
    if (element.kind === "rest") {
      const restArray = `%destructure.proto.rest.${index}.${elementIndex}`;
      const restBoxed = `%destructure.proto.rest.boxed.${index}.${elementIndex}`;
      const restCond = `destructure.proto.rest.cond.${index}.${elementIndex}`;
      const restCall = `destructure.proto.rest.call.${index}.${elementIndex}`;
      const restValue = `destructure.proto.rest.value.${index}.${elementIndex}`;
      const restDone = `destructure.proto.rest.done.${index}.${elementIndex}`;
      const iterator = `%destructure.proto.rest.iter.${index}.${elementIndex}`;
      const nextCall = emitGeneratedJsCall("callIteratorNext", [`i64 ${iterator}`], context);
      const doneValue = `%destructure.proto.rest.done.value.${index}.${elementIndex}`;
      const isDone = `%destructure.proto.rest.is.done.${index}.${elementIndex}`;
      const value = `%destructure.proto.rest.item.${index}.${elementIndex}`;
      const alreadyDone = `%destructure.proto.rest.already.done.${index}.${elementIndex}`;
      lines.push(
        `  ${restArray} = call ptr @arrayNew(i64 0)`,
        // Root the rest array across the consumption loop: the per-iteration
        // safepoint can collect while the raw pointer only lives in an alloca
        // (same shape as the iterable-spread destination rooting).
        `  ${restBoxed} = call i64 @valueBoxArray(ptr ${restArray})`,
        `  call void @gcRootPush(i64 ${restBoxed})`,
        `  store ptr ${restArray}, ptr ${variablePointerName(`${element.name}.destructure.${index}`)}`,
        `  br label %${restCond}`,
        `${restCond}:`,
        `  ${alreadyDone} = load i1, ptr ${doneSlot}`,
        `  br i1 ${alreadyDone}, label %${restDone}, label %${restCall}`,
        `${restCall}:`,
        `  ${iterator} = load i64, ptr ${iteratorSlot}`,
        ...nextCall.lines,
        `  ${doneValue} = call i64 @valuePropertyGet(i64 ${nextCall.value}, i64 4, ptr ${doneKey})`,
        `  ${isDone} = call i1 @valueTruthy(i64 ${doneValue})`,
        `  br i1 ${isDone}, label %${restDone}, label %${restValue}`,
        `${restValue}:`,
        `  ${value} = call i64 @valuePropertyGet(i64 ${nextCall.value}, i64 5, ptr ${valueKey})`,
        `  call void @gcRootPush(i64 ${value})`,
        `  call i64 @arrayPush(ptr ${restArray}, i64 ${value})`,
        `  call void @gcSafepoint()`,
        `  br label %${restCond}`,
        `${restDone}:`,
        `  store i1 true, ptr ${doneSlot}`
      );
      continue;
    }

    const checkLabel = `destructure.proto.check.${index}.${elementIndex}`;
    const callLabel = `destructure.proto.call.${index}.${elementIndex}`;
    const yieldedLabel = `destructure.proto.yielded.${index}.${elementIndex}`;
    const exhaustedLabel = `destructure.proto.exhausted.${index}.${elementIndex}`;
    const bindLabel = `destructure.proto.bind.${index}.${elementIndex}`;
    const incomingSlot = `%destructure.proto.incoming.${index}.${elementIndex}.addr`;
    const iterator = `%destructure.proto.iter.${index}.${elementIndex}`;
    const alreadyDone = `%destructure.proto.already.done.${index}.${elementIndex}`;
    const nextCall = emitGeneratedJsCall("callIteratorNext", [`i64 ${iterator}`], context);
    const doneValue = `%destructure.proto.done.value.${index}.${elementIndex}`;
    const isDone = `%destructure.proto.is.done.${index}.${elementIndex}`;
    lines.push(
      `  ${incomingSlot} = alloca i64`,
      `  br label %${checkLabel}`,
      `${checkLabel}:`,
      `  ${alreadyDone} = load i1, ptr ${doneSlot}`,
      `  br i1 ${alreadyDone}, label %${exhaustedLabel}, label %${callLabel}`,
      `${callLabel}:`,
      `  ${iterator} = load i64, ptr ${iteratorSlot}`,
      ...nextCall.lines,
      `  ${doneValue} = call i64 @valuePropertyGet(i64 ${nextCall.value}, i64 4, ptr ${doneKey})`,
      `  ${isDone} = call i1 @valueTruthy(i64 ${doneValue})`,
      `  br i1 ${isDone}, label %${exhaustedLabel}, label %${yieldedLabel}`,
      `${yieldedLabel}:`
    );
    const yieldedValue = `%destructure.proto.item.${index}.${elementIndex}`;
    lines.push(
      `  ${yieldedValue} = call i64 @valuePropertyGet(i64 ${nextCall.value}, i64 5, ptr ${valueKey})`,
      `  store i64 ${yieldedValue}, ptr ${incomingSlot}`,
      `  br label %${bindLabel}`,
      `${exhaustedLabel}:`,
      `  store i1 true, ptr ${doneSlot}`,
      `  store i64 ${jsValueUndefined}, ptr ${incomingSlot}`,
      `  br label %${bindLabel}`,
      `${bindLabel}:`
    );
    if (element.kind === "elision") {
      continue;
    }
    const incoming = `%destructure.proto.incoming.${index}.${elementIndex}`;
    lines.push(`  ${incoming} = load i64, ptr ${incomingSlot}`, `  call void @gcRootPush(i64 ${incoming})`);
    if (element.kind === "binding") {
      if (element.defaultValue === undefined) {
        lines.push(`  store i64 ${incoming}, ptr ${variablePointerName(`${element.name}.destructure.${index}`)}`);
      } else {
        const defaultLabel = `destructure.proto.default.${index}.${elementIndex}`;
        const storeLabel = `destructure.proto.store.${index}.${elementIndex}`;
        const useDefault = `%destructure.proto.use.default.${index}.${elementIndex}`;
        context.exceptionTarget = closeFrame.throwEntryLabel;
        const defaultValue = context.emitValue(element.defaultValue);
        context.exceptionTarget = outerException;
        lines.push(
          `  ${useDefault} = icmp eq i64 ${incoming}, ${jsValueUndefined}`,
          `  br i1 ${useDefault}, label %${defaultLabel}, label %${storeLabel}`,
          `${defaultLabel}:`,
          ...defaultValue.lines,
          `  store i64 ${defaultValue.value}, ptr ${variablePointerName(`${element.name}.destructure.${index}`)}`,
          `  br label %${storeLabel}.done`,
          `${storeLabel}:`,
          `  store i64 ${incoming}, ptr ${variablePointerName(`${element.name}.destructure.${index}`)}`,
          `  br label %${storeLabel}.done`,
          `${storeLabel}.done:`
        );
      }
    } else {
      lines.push(`  store i64 ${incoming}, ptr ${variablePointerName(`${element.temporaryName}.destructure.${index}`)}`);
      context.exceptionTarget = closeFrame.throwEntryLabel;
      lines.push(...context.emitOperations(element.operations));
      context.exceptionTarget = outerException;
    }
  }
  context.cleanupStack.pop();
  context.exceptionTarget = outerException;
  const isDone = `%destructure.proto.finished.${index}`;
  const closeLabel = `destructure.proto.close.${index}`;
  const iterator = `%destructure.proto.close.iter.${index}`;
  const closeCall = emitGeneratedJsCall("iteratorClose", [`i64 ${iterator}`], context);
  lines.push(
    `  ${isDone} = load i1, ptr ${doneSlot}`,
    `  br i1 ${isDone}, label %${normalLabel}, label %${closeLabel}`,
    `${closeLabel}:`,
    `  ${iterator} = load i64, ptr ${iteratorSlot}`,
    ...closeCall.lines,
    `  br label %${normalLabel}`,
    `${closeFrame.entryLabel}:`,
    `  ${closeFrame.rootFrameName} = call i64 @gcRootSave()`,
    ...emitIteratorCloseBody(context, closeFrame),
    ...emitCleanupAfterBody(context, closeFrame),
    ...emitThrowEntryBlock(context, closeFrame),
    ...emitCleanupFinalDispatch(context, closeFrame),
    `${closeFrame.joinLabel}:`,
    "  unreachable",
    `${normalLabel}:`,
    `  br label %${endLabel}`,
    `${endLabel}:`
  );
  return lines;
}
