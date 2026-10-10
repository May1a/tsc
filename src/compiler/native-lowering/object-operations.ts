import type { BindingRef, ResolvedDataDescriptor, ResolvedObjectAssignSource, ResolvedObjectValue } from "../binding-resolution/index.js";
import { llvm } from "../llvm-ir/index.js";
import { type OperationHandlers, type OperationNode, initializeAggregate, integer, objectPointer, ownAggregate } from "./aggregate-support.js";
import { errorClassId } from "./error-classes.js";
import { boxString } from "./expression-context.js";
import { numberIndex } from "./numbers.js";
import type { OperationContext } from "./operation-context.js";
import { objectLiteral } from "./value-aggregates.js";
import { arrayPointer, keep, literalString, numericValue, stringValue } from "./value-support.js";

function initializeFields(reference: BindingRef, value: ResolvedObjectValue, path: readonly string[], context: OperationContext): void {
  for (const field of value.fields) {
    const fieldPath = [...path, field.name];
    if (field.value.kind === "object") {
      initializeFields(reference, field.value.value, fieldPath, context);
    } else {
      const number = context.expressions.number(field.value.value);
      context.cursor.currentBlock().store(number, context.bindings.objectField(reference, fieldPath));
    }
  }
}

function fixedLiteral(operation: OperationNode<"objectLiteral">, context: OperationContext): void {
  initializeFields(operation.name, operation.value, [], context);
  if (operation.needsRuntimeShadow) context.writes.initializeObjectShadow(operation.name);
}

function runtimeLiteral(operation: OperationNode<"runtimeObjectLiteral">, context: OperationContext): void {
  context.writes.storeValue(operation.name, objectLiteral(operation.value, context));
}

function create(operation: OperationNode<"runtimeObjectCreate">, context: OperationContext): void {
  const prototype = operation.prototypeName === undefined ? context.cursor.currentBlock().nullPtr() : objectPointer(operation.prototypeName, context);
  const pointer = context.runtime.callPointer("objectCreate", [prototype], context.cursor.uniqueName("object.create"));
  initializeAggregate(operation.name, pointer, "object", context);
}

function errorLiteral(operation: OperationNode<"runtimeErrorLiteral">, context: OperationContext): void {
  const message = keep(context.expressions.value(operation.message), context);
  const name = literalString(operation.errorName, context);
  const pointer = context.runtime.callPointer("errorNew", [integer(BigInt(errorClassId(operation.errorName)), context), name.length, name.bytes, message],
    context.cursor.uniqueName("error.new"));
  initializeAggregate(operation.name, pointer, "object", context);
}

const enumerationHelpers = {
  runtimeObjectKeys: { object: "objectKeys", array: "arrayKeys", value: "valueObjectKeys" },
  runtimeObjectValues: { object: "objectValues", array: "arrayValues", value: "valueObjectValues" },
  runtimeObjectEntries: { object: "objectEntries", array: "arrayEntries", value: "valueObjectEntries" },
  runtimeObjectOwnPropertyNames: { object: "objectOwnPropertyNames", array: "arrayOwnPropertyNames", value: "valueObjectOwnPropertyNames" },
  runtimeObjectOwnPropertyDescriptors: {
    object: "objectOwnPropertyDescriptors", array: "arrayOwnPropertyDescriptors", value: "valueObjectOwnPropertyDescriptors"
  }
} as const;

function enumerate(operation: OperationNode<keyof typeof enumerationHelpers>, context: OperationContext): void {
  const target = enumerationTarget(operation, context);
  const symbol = enumerationHelpers[operation.kind][operation.targetKind];
  const result = context.runtime.callPointer(symbol, [target], context.cursor.uniqueName("object.enumerate"));
  initializeAggregate(operation.name, result, operation.kind === "runtimeObjectOwnPropertyDescriptors" ? "object" : "array", context);
}

function enumerationTarget(operation: OperationNode<keyof typeof enumerationHelpers>, context: OperationContext) {
  switch (operation.targetKind) {
    case "value": { return keep(context.bindings.value(operation.targetName), context); }
    case "array": { return arrayPointer(operation.targetName, context); }
    case "object": { return objectPointer(operation.targetName, context); }
    default: {
      const exhaustive: never = operation.targetKind;
      throw new Error(`Unknown aggregate target ${String(exhaustive)}`);
    }
  }
}

function fromEntries(operation: OperationNode<"runtimeObjectFromEntries">, context: OperationContext): void {
  const entries = arrayPointer(operation.entriesName, context);
  const result = context.runtime.callPointer("objectFromEntries", [entries], context.cursor.uniqueName("object.from.entries"));
  initializeAggregate(operation.name, result, "object", context);
}

function ownDescriptor(operation: OperationNode<"runtimeObjectOwnPropertyDescriptor">, context: OperationContext): void {
  const receiver = keep(context.bindings.value(operation.targetName), context);
  const key = context.expressions.string(operation.key);
  boxString(key, context);
  if (operation.targetKind !== "array") {
    const index = operation.index === undefined ? integer(0n, context) : numberIndex(operation.index, context);
    const result = context.runtime.callBoxed("valueObjectOwnPropertyDescriptor", [receiver, key.length, key.bytes, index,
      context.cursor.currentBlock().int(llvm.i1, operation.isLength === true ? 1n : 0n)], context.cursor.uniqueName("property.descriptor"));
    context.writes.storeValue(operation.name, result);
    return;
  }
  const target = context.runtime.callPointer("valueArrayPtr", [receiver], context.cursor.uniqueName("descriptor.array"));
  const result = operation.index === undefined
    ? context.runtime.callBoxed("arrayLengthPropertyDescriptor", [target], context.cursor.uniqueName("length.descriptor"))
    : context.runtime.callBoxed("arrayOwnPropertyDescriptor", [target, key.length, key.bytes, numberIndex(operation.index, context)],
      context.cursor.uniqueName("property.descriptor"));
  context.writes.storeValue(operation.name, result);
}

function getPrototype(operation: OperationNode<"runtimeObjectGetPrototype">, context: OperationContext): void {
  const target = operation.targetKind === "array" ? arrayPointer(operation.targetName, context) : objectPointer(operation.targetName, context);
  const result = context.runtime.callPointer(operation.targetKind === "array" ? "arrayGetPrototype" : "objectGetPrototype", [target],
    context.cursor.uniqueName("object.prototype"));
  initializeAggregate(operation.name, result, "object", context);
}

function setPrototype(operation: OperationNode<"runtimeObjectSetPrototype">, context: OperationContext): void {
  const target = operation.targetKind === "array" ? arrayPointer(operation.targetName, context) : objectPointer(operation.targetName, context);
  const prototype = operation.prototypeName === undefined ? context.cursor.currentBlock().nullPtr() : objectPointer(operation.prototypeName, context);
  context.runtime.callVoid(operation.targetKind === "array" ? "arraySetPrototype" : "objectSetPrototype", [target, prototype]);
}

function valuePrototype(operation: OperationNode<"valueObjectSetPrototype">, context: OperationContext): void {
  const target = objectPointer(operation.targetName, context);
  const prototype = objectPointer(operation.prototypeName, context);
  context.runtime.callVoid("objectSetPrototype", [target, prototype]);
}

function numberStore(operation: OperationNode<"objectStore">, context: OperationContext): void {
  context.writes.storeObjectNumber(operation.objectName, operation.path, context.expressions.number(operation.value));
}

function store(operation: OperationNode<"runtimeObjectStore" | "valueObjectStore">, context: OperationContext): void {
  const target = operation.kind === "runtimeObjectStore" ? objectPointer(operation.objectName, context)
    : keep(context.bindings.value(operation.targetName), context);
  const key = context.expressions.string(operation.key);
  boxString(key, context);
  const value = keep(context.expressions.value(operation.value), context);
  context.runtime.callVoid(operation.kind === "runtimeObjectStore" ? "objectSet" : "valueObjectSet", [target, key.length, key.bytes, value]);
}

function privateStore(operation: OperationNode<"privateFieldStore">, context: OperationContext): void {
  const receiver = keep(context.bindings.value(operation.targetName), context);
  const value = keep(context.expressions.value(operation.value), context);
  const key = literalString(operation.key, context);
  const branded = context.runtime.call("valueObjectHasOwn", [receiver, key.length, key.bytes], context.cursor.uniqueName("private.brand"));
  const valid = context.cursor.reserveBlock("private.valid");
  const invalid = context.cursor.reserveBlock("private.invalid");
  context.cursor.currentBlock().condBr(branded, valid, invalid);
  context.cursor.openBlock(invalid);
  context.runtime.callWithCompletion("iteratorTypeError", [stringValue(operation.message, context)],
    context.cursor.uniqueName("private.error"), context.exceptionTarget());
  context.cursor.currentBlock().unreachable();
  context.cursor.openBlock(valid);
  context.runtime.callVoid("valueObjectSet", [receiver, key.length, key.bytes, value]);
}

function deleteProperty(operation: OperationNode<"runtimeObjectDelete" | "valueObjectDelete">, context: OperationContext): void {
  const reference = operation.kind === "runtimeObjectDelete" ? operation.objectName : operation.targetName;
  const receiver = keep(context.bindings.value(reference), context);
  const key = context.expressions.string(operation.key);
  context.runtime.callVoid("valueObjectDelete", [receiver, key.length, key.bytes]);
}

const stateHelpers = {
  runtimeObjectPreventExtensions: "objectPreventExtensions", runtimeObjectSeal: "objectSeal", runtimeObjectFreeze: "objectFreeze"
} as const;

function state(operation: OperationNode<keyof typeof stateHelpers>, context: OperationContext): void {
  context.runtime.callVoid(stateHelpers[operation.kind], [objectPointer(operation.objectName, context)]);
}

function descriptorFlags(descriptor: ResolvedDataDescriptor): bigint {
  const writable = 1n;
  const enumerable = 2n;
  const configurable = 4n;
  return (descriptor.writable ? writable : 0n) | (descriptor.enumerable ? enumerable : 0n) | (descriptor.configurable ? configurable : 0n);
}

function dataProperty(object: ReturnType<typeof objectPointer>, descriptor: ResolvedDataDescriptor, context: OperationContext): void {
  const key = context.expressions.string(descriptor.key);
  boxString(key, context);
  const value = keep(context.expressions.value(descriptor.value), context);
  context.runtime.callVoid("objectDefineDataProperty", [object, key.length, key.bytes, value, integer(descriptorFlags(descriptor), context)]);
}

function defineProperty(operation: OperationNode<"runtimeObjectDefineDataProperty">, context: OperationContext): void {
  dataProperty(objectPointer(operation.objectName, context), operation.descriptor, context);
}

function defineProperties(operation: OperationNode<"runtimeObjectDefineDataProperties">, context: OperationContext): void {
  const object = objectPointer(operation.objectName, context);
  const descriptors = operation.descriptors.map((descriptor) => {
    const key = context.expressions.string(descriptor.key);
    boxString(key, context);
    const value = keep(context.expressions.value(descriptor.value), context);
    return { key, value, flags: descriptorFlags(descriptor) };
  });
  for (const descriptor of descriptors) {
    context.runtime.callVoid("objectDefineDataProperty", [object, descriptor.key.length, descriptor.key.bytes, descriptor.value, integer(descriptor.flags, context)]);
  }
}

function fixedObjectValue(value: ResolvedObjectValue, context: OperationContext): ReturnType<typeof ownAggregate> {
  const pointer = context.runtime.callPointer("objectNew", [integer(BigInt(value.fields.length), context)], context.cursor.uniqueName("object.literal"));
  const object = ownAggregate(pointer, "object", context);
  for (const field of value.fields) {
    const key = literalString(field.name, context);
    const boxed = field.value.kind === "object" ? fixedObjectValue(field.value.value, context).value
      : numericValue(context.expressions.number(field.value.value), context);
    context.runtime.callVoid("objectSet", [pointer, key.length, key.bytes, boxed]);
  }
  return object;
}

function assignSource(source: ResolvedObjectAssignSource, context: OperationContext) {
  switch (source.kind) {
    case "runtimeObject":
    case "runtimeArray":
    case "fixedArray": { return keep(context.bindings.value(source.name), context); }
    case "fixedObject": { return fixedObjectValue(source.value, context).value; }
    case "value": { return keep(context.expressions.value(source.value), context); }
    default: {
      const exhaustive: never = source;
      throw new Error(`Unknown Object.assign source ${String(exhaustive)}`);
    }
  }
}

function assign(operation: OperationNode<"runtimeObjectAssign">, context: OperationContext): void {
  const target = objectPointer(operation.targetName, context);
  const sources = operation.sources.map((source) => assignSource(source, context));
  for (const source of sources) {
    context.runtime.callVoid("valueObjectAssign", [target, source]);
  }
}

export const objectOperationHandlers = {
  objectLiteral: fixedLiteral, runtimeObjectLiteral: runtimeLiteral, runtimeObjectCreate: create, runtimeErrorLiteral: errorLiteral,
  runtimeObjectKeys: enumerate, runtimeObjectValues: enumerate, runtimeObjectEntries: enumerate,
  runtimeObjectOwnPropertyNames: enumerate, runtimeObjectOwnPropertyDescriptors: enumerate, runtimeObjectFromEntries: fromEntries,
  runtimeObjectOwnPropertyDescriptor: ownDescriptor, runtimeObjectGetPrototype: getPrototype, runtimeObjectSetPrototype: setPrototype,
  valueObjectSetPrototype: valuePrototype, objectStore: numberStore, runtimeObjectStore: store, valueObjectStore: store,
  privateFieldStore: privateStore, runtimeObjectDelete: deleteProperty, valueObjectDelete: deleteProperty,
  runtimeObjectPreventExtensions: state, runtimeObjectSeal: state, runtimeObjectFreeze: state,
  runtimeObjectAssign: assign, runtimeObjectDefineDataProperty: defineProperty, runtimeObjectDefineDataProperties: defineProperties
} satisfies Partial<OperationHandlers>;
