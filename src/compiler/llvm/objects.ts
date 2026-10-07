import type {
  JsIrObjectValue,
  JsIrRuntimeObjectValue,
  JsIrValueExpression
} from "../ir/expressions.js";
import type { JsIrOperation } from "../ir/types.js";
import { emitNamedValueBinding } from "./conditions.js";
import type { EmitContext, JsValue, NumberValue, RuntimeObjectValue } from "./context.js";
import { emitArrayIndex, llvmDoubleBitcastOperand } from "./numbers.js";
import { emitRuntimeArrayPointer, emitRuntimeObjectPointer } from "./layout.js";
import { variablePointerName } from "./names.js";

/**
 * The runtime object tier: one function per `runtimeObject*` operation.
 *
 * "Runtime" means the general js-value object — the one with a prototype, arbitrary properties and
 * `Object.keys` — as opposed to a *known-shape* object, which is a static layout of `i64` fields with
 * no prototype and no property table. Both exist in this compiler and they are not two spellings of
 * one thing: `knownShapeObjectToRuntimeValue` is the boundary, and it is one direction only.
 *
 * The property-descriptor flags are here rather than in a shared encoding table because only this
 * tier writes them, and `descriptorFlags` is the only reader of the three constants — the numbering is
 * the runtime's, not a general-purpose bit layout.
 *
 * `Object.keys`/`values`/`entries` and the descriptor accessors each need a target pointer and a helper
 * symbol, so those three pairs sit at the bottom: they are the two shapes every enumeration needs, and
 * they differ only in which one the runtime reads.
 */

export const descriptorWritableFlag = 1;
export const descriptorEnumerableFlag = 2;
export const descriptorConfigurableFlag = 4;
export function emitRuntimeObjectLiteralOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeObjectLiteral" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeObject", name: operation.name });
  const runtimeObject: RuntimeObjectValue = { pointerName };
  return emitRuntimeObjectLiteralStorage(runtimeObject.pointerName, operation.value, context);
}
export function emitRuntimeObjectCreateOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeObjectCreate" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeObject", name: operation.name });
  const prototypeLines: string[] = [];
  let prototype = "null";
  if (operation.prototypeName !== undefined) {
    const prototypeObject = emitRuntimeObjectPointer(operation.prototypeName, context);
    prototypeLines.push(...prototypeObject.lines);
    prototype = prototypeObject.value;
  }
  const objectName = `%obj.rt.${context.objectIndex}`;
  context.objectIndex += 1;
  return [
    `  ${pointerName} = alloca ptr`,
    ...prototypeLines,
    `  ${objectName} = call ptr @objectCreate(ptr ${prototype})`,
    `  store ptr ${objectName}, ptr ${pointerName}`
  ];
}
export function emitRuntimeObjectKeysOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeObjectKeys" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  const object = emitRuntimeKeysTargetPointer(operation, context);
  const result = `%arr.rt.${context.arrayIndex}`;
  context.arrayIndex += 1;
  const helper = runtimeKeysHelper(operation.targetKind);
  const argumentType = runtimeAggregateArgumentType(operation.targetKind);
  return [
    `  ${pointerName} = alloca ptr`,
    ...object.lines,
    `  ${result} = call ptr @${helper}(${argumentType} ${object.value})`,
    `  store ptr ${result}, ptr ${pointerName}`
  ];
}
export function emitRuntimeObjectValuesOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeObjectValues" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  const target = emitRuntimeValuesTargetPointer(operation, context);
  const result = `%arr.rt.${context.arrayIndex}`;
  context.arrayIndex += 1;
  let helper: "arrayValues" | "objectValues" | "valueObjectValues" = "objectValues";
  if (operation.targetKind === "array") {
    helper = "arrayValues";
  } else if (operation.targetKind === "value") {
    helper = "valueObjectValues";
  }
  const argumentType = runtimeAggregateArgumentType(operation.targetKind);
  return [`  ${pointerName} = alloca ptr`, ...target.lines, `  ${result} = call ptr @${helper}(${argumentType} ${target.value})`, `  store ptr ${result}, ptr ${pointerName}`];
}
export function emitRuntimeObjectEntriesOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeObjectEntries" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  let target = emitRuntimeObjectPointer(operation.targetName, context);
  if (operation.targetKind === "array") {
    target = emitRuntimeArrayPointer(operation.targetName, context);
  } else if (operation.targetKind === "value") {
    target = emitNamedValueBinding(operation.targetName, context);
  }
  const result = `%arr.rt.${context.arrayIndex}`;
  context.arrayIndex += 1;
  let helper: "arrayEntries" | "objectEntries" | "valueObjectEntries" = "objectEntries";
  if (operation.targetKind === "array") {
    helper = "arrayEntries";
  } else if (operation.targetKind === "value") {
    helper = "valueObjectEntries";
  }
  const argumentType = runtimeAggregateArgumentType(operation.targetKind);
  return [`  ${pointerName} = alloca ptr`, ...target.lines, `  ${result} = call ptr @${helper}(${argumentType} ${target.value})`, `  store ptr ${result}, ptr ${pointerName}`];
}
export function emitRuntimeObjectFromEntriesOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeObjectFromEntries" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeObject", name: operation.name });
  const entries = emitRuntimeArrayPointer(operation.entriesName, context);
  const result = `%obj.rt.${context.objectIndex}`;
  context.objectIndex += 1;
  return [`  ${pointerName} = alloca ptr`, ...entries.lines, `  ${result} = call ptr @objectFromEntries(ptr ${entries.value})`, `  store ptr ${result}, ptr ${pointerName}`];
}
export function emitRuntimeObjectOwnPropertyDescriptorOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeObjectOwnPropertyDescriptor" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "valueVariable", name: operation.name });
  const result = `%value.${context.numIndex}`;
  context.numIndex += 1;
  if (operation.targetKind === "array") {
    const array = emitRuntimeArrayPointer(operation.targetName, context);
    if (operation.index === undefined) {
      return [`  ${pointerName} = alloca i64`, ...array.lines, `  ${result} = call i64 @arrayLengthPropertyDescriptor(ptr ${array.value})`, `  store i64 ${result}, ptr ${pointerName}`];
    }
    const key = context.emitStringExpression(operation.key);
    const index = emitArrayIndex(operation.index ?? { kind: "literal", value: 0 }, context);
    return [`  ${pointerName} = alloca i64`, ...array.lines, ...key.lines, ...index.lines, `  ${result} = call i64 @arrayOwnPropertyDescriptor(ptr ${array.value}, i64 ${key.length}, ptr ${key.value}, i64 ${index.value})`, `  store i64 ${result}, ptr ${pointerName}`];
  }
  if (operation.targetKind === "value") {
    const value = emitNamedValueBinding(operation.targetName, context);
    const key = context.emitStringExpression(operation.key);
    let index: NumberValue = { lines: [], value: "0" };
    if (operation.index !== undefined) {
      index = emitArrayIndex(operation.index, context);
    }
    let isLength = "false";
    if (operation.isLength === true) {
      isLength = "true";
    }
    return [`  ${pointerName} = alloca i64`, ...value.lines, ...key.lines, ...index.lines, `  ${result} = call i64 @valueObjectOwnPropertyDescriptor(i64 ${value.value}, i64 ${key.length}, ptr ${key.value}, i64 ${index.value}, i1 ${isLength})`, `  store i64 ${result}, ptr ${pointerName}`];
  }
  const object = emitRuntimeObjectPointer(operation.targetName, context);
  const key = context.emitStringExpression(operation.key);
  return [`  ${pointerName} = alloca i64`, ...object.lines, ...key.lines, `  ${result} = call i64 @objectOwnPropertyDescriptor(ptr ${object.value}, i64 ${key.length}, ptr ${key.value})`, `  store i64 ${result}, ptr ${pointerName}`];
}
export function emitRuntimeObjectOwnPropertyNamesOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeObjectOwnPropertyNames" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  const result = `%arr.rt.${context.arrayIndex}`;
  context.arrayIndex += 1;
  if (operation.targetKind === "array") {
    const array = emitRuntimeArrayPointer(operation.targetName, context);
    return [`  ${pointerName} = alloca ptr`, ...array.lines, `  ${result} = call ptr @arrayOwnPropertyNames(ptr ${array.value})`, `  store ptr ${result}, ptr ${pointerName}`];
  }
  if (operation.targetKind === "value") {
    const value = emitNamedValueBinding(operation.targetName, context);
    return [`  ${pointerName} = alloca ptr`, ...value.lines, `  ${result} = call ptr @valueObjectOwnPropertyNames(i64 ${value.value})`, `  store ptr ${result}, ptr ${pointerName}`];
  }
  const object = emitRuntimeObjectPointer(operation.targetName, context);
  return [`  ${pointerName} = alloca ptr`, ...object.lines, `  ${result} = call ptr @objectOwnPropertyNames(ptr ${object.value})`, `  store ptr ${result}, ptr ${pointerName}`];
}
export function emitRuntimeObjectOwnPropertyDescriptorsOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeObjectOwnPropertyDescriptors" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeObject", name: operation.name });
  const result = `%obj.rt.${context.objectIndex}`;
  context.objectIndex += 1;
  if (operation.targetKind === "value") {
    const value = emitNamedValueBinding(operation.targetName, context);
    return [`  ${pointerName} = alloca ptr`, ...value.lines, `  ${result} = call ptr @valueObjectOwnPropertyDescriptors(i64 ${value.value})`, `  store ptr ${result}, ptr ${pointerName}`];
  }
  if (operation.targetKind === "array") {
    const array = emitRuntimeArrayPointer(operation.targetName, context);
    return [`  ${pointerName} = alloca ptr`, ...array.lines, `  ${result} = call ptr @arrayOwnPropertyDescriptors(ptr ${array.value})`, `  store ptr ${result}, ptr ${pointerName}`];
  }
  const object = emitRuntimeObjectPointer(operation.targetName, context);
  return [`  ${pointerName} = alloca ptr`, ...object.lines, `  ${result} = call ptr @objectOwnPropertyDescriptors(ptr ${object.value})`, `  store ptr ${result}, ptr ${pointerName}`];
}
export function emitRuntimeValuesTargetPointer(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeObjectValues" }>,
  context: EmitContext
): NumberValue {
  if (operation.targetKind === "value") {
    return emitNamedValueBinding(operation.targetName, context);
  }
  if (operation.targetKind === "array") {
    return emitRuntimeArrayPointer(operation.targetName, context);
  }
  return emitRuntimeObjectPointer(operation.targetName, context);
}
export function emitRuntimeObjectGetPrototypeOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeObjectGetPrototype" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeObject", name: operation.name });
  const target = emitRuntimePrototypeTargetPointer(operation, context);
  const helper = runtimeGetPrototypeHelper(operation.targetKind);
  const result = `%obj.rt.${context.objectIndex}`;
  context.objectIndex += 1;
  return [`  ${pointerName} = alloca ptr`, ...target.lines, `  ${result} = call ptr @${helper}(ptr ${target.value})`, `  store ptr ${result}, ptr ${pointerName}`];
}
export function emitRuntimeKeysTargetPointer(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeObjectKeys" }>,
  context: EmitContext
): NumberValue {
  if (operation.targetKind === "value") {
    return emitNamedValueBinding(operation.targetName, context);
  }
  if (operation.targetKind === "array") {
    return emitRuntimeArrayPointer(operation.targetName, context);
  }
  return emitRuntimeObjectPointer(operation.targetName, context);
}
export function runtimeKeysHelper(targetKind: "object" | "array" | "value"): "objectKeys" | "arrayKeys" | "valueObjectKeys" {
  if (targetKind === "array") {
    return "arrayKeys";
  }
  if (targetKind === "value") {
    return "valueObjectKeys";
  }
  return "objectKeys";
}
export function runtimeAggregateArgumentType(targetKind: "object" | "array" | "value"): "ptr" | "i64" {
  if (targetKind === "value") {
    return "i64";
  }
  return "ptr";
}
export function emitRuntimePrototypeTargetPointer(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeObjectGetPrototype" }>,
  context: EmitContext
): NumberValue {
  if (operation.targetKind === "array") {
    return emitRuntimeArrayPointer(operation.targetName, context);
  }
  return emitRuntimeObjectPointer(operation.targetName, context);
}
export function runtimeGetPrototypeHelper(targetKind: "object" | "array"): "objectGetPrototype" | "arrayGetPrototype" {
  if (targetKind === "array") {
    return "arrayGetPrototype";
  }
  return "objectGetPrototype";
}
export function knownShapeObjectToRuntimeValue(value: JsIrObjectValue): JsIrRuntimeObjectValue {
  return {
    fields: value.fields
      .flatMap((field) => {
        if (field.value.kind === "object") {
          throw new Error("Nested known-shape object fields cannot be converted to runtime JSValue dictionaries yet");
        }
        return [{ kind: "field" as const, key: { kind: "literal" as const, value: field.name }, value: { kind: "number" as const, value: field.value.value } }];
      })
  };
}
export function emitRuntimeObjectLiteralStorage(
  pointerName: string,
  value: JsIrRuntimeObjectValue,
  context: EmitContext
): string[] {
  const objectName = `%obj.rt.${context.objectIndex}`;
  context.objectIndex += 1;
  const ownFieldCount = value.fields.filter((field) => field.kind === "field").length;
  const lines = [`  ${pointerName} = alloca ptr`, `  ${objectName} = call ptr @objectNew(i64 ${ownFieldCount})`, `  store ptr ${objectName}, ptr ${pointerName}`];
  for (const field of value.fields) {
    if (field.kind === "spread") {
      const source = emitRuntimeObjectPointer(field.sourceName, context);
      lines.push(...source.lines, `  call void @objectAssign(ptr ${objectName}, ptr ${source.value})`);
      continue;
    }
    const key = context.emitStringExpression(field.key);
    const fieldValue = context.emitValue(field.value);
    lines.push(...key.lines, ...fieldValue.lines, `  call void @objectSet(ptr ${objectName}, i64 ${key.length}, ptr ${key.value}, i64 ${fieldValue.value})`);
  }
  return lines;
}
export function emitRuntimeObjectStoreOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeObjectStore" }>,
  context: EmitContext
): string[] {
  const object = emitRuntimeObjectPointer(operation.objectName, context);
  const key = context.emitStringExpression(operation.key);
  const value = context.emitValue(operation.value);
  return [...object.lines, ...key.lines, ...value.lines, `  call void @objectSet(ptr ${object.value}, i64 ${key.length}, ptr ${key.value}, i64 ${value.value})`];
}
export function emitRuntimeObjectDeleteOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeObjectDelete" }>,
  context: EmitContext
): string[] {
  const object = emitRuntimeObjectPointer(operation.objectName, context);
  const key = context.emitStringExpression(operation.key);
  return [...object.lines, ...key.lines, `  call void @objectDelete(ptr ${object.value}, i64 ${key.length}, ptr ${key.value})`];
}
export function emitRuntimeObjectSetPrototypeOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeObjectSetPrototype" }>,
  context: EmitContext
): string[] {
  let target = emitRuntimeObjectPointer(operation.targetName, context);
  if (operation.targetKind === "array") {
    target = emitRuntimeArrayPointer(operation.targetName, context);
  }
  const lines = [...target.lines];
  let prototype = "null";
  if (operation.prototypeName !== undefined) {
    const prototypeObject = emitRuntimeObjectPointer(operation.prototypeName, context);
    lines.push(...prototypeObject.lines);
    prototype = prototypeObject.value;
  }
  let helper: "arraySetPrototype" | "objectSetPrototype" = "objectSetPrototype";
  if (operation.targetKind === "array") {
    helper = "arraySetPrototype";
  }
  lines.push(`  call void @${helper}(ptr ${target.value}, ptr ${prototype})`);
  return lines;
}
export function emitRuntimeObjectDefineDataPropertyOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeObjectDefineDataProperty" }>,
  context: EmitContext
): string[] {
  const object = emitRuntimeObjectPointer(operation.objectName, context);
  const key = context.emitStringExpression(operation.descriptor.key);
  const value = context.emitValue(operation.descriptor.value);
  const flags = descriptorFlags(operation.descriptor);
  return [
    ...object.lines,
    ...key.lines,
    ...value.lines,
    `  call void @objectDefineDataProperty(ptr ${object.value}, i64 ${key.length}, ptr ${key.value}, i64 ${value.value}, i64 ${flags})`
  ];
}
export function emitRuntimeObjectStateMutationOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeObjectPreventExtensions" | "runtimeObjectSeal" | "runtimeObjectFreeze" }>,
  context: EmitContext
): string[] {
  const object = emitRuntimeObjectPointer(operation.objectName, context);
  const helperByKind = {
    runtimeObjectPreventExtensions: "objectPreventExtensions",
    runtimeObjectSeal: "objectSeal",
    runtimeObjectFreeze: "objectFreeze"
  } as const;
  const helper = helperByKind[operation.kind];
  return [...object.lines, `  call void @${helper}(ptr ${object.value})`];
}
// eslint-disable-next-line max-statements -- Object.assign emission handles each supported source shape explicitly.
export function emitRuntimeObjectAssignOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeObjectAssign" }>,
  context: EmitContext
): string[] {
  const target = emitRuntimeObjectPointer(operation.targetName, context);
  const lines = [...target.lines];
  for (const source of operation.sources) {
    if (source.kind === "runtimeObject") {
      const sourceObject = emitRuntimeObjectPointer(source.name, context);
      lines.push(...sourceObject.lines, `  call void @objectAssign(ptr ${target.value}, ptr ${sourceObject.value})`);
      continue;
    }
    if (source.kind === "runtimeArray") {
      const sourceArray = emitRuntimeArrayPointer(source.name, context);
      lines.push(...sourceArray.lines, `  call void @objectAssignArray(ptr ${target.value}, ptr ${sourceArray.value})`);
      continue;
    }
    if (source.kind === "fixedObject") {
      const pointerName = `%obj.assign.${context.objectIndex}`;
      const loadedName = `%obj.assign.ptr.${context.objectIndex}`;
      context.objectIndex += 1;
      lines.push(...emitRuntimeObjectLiteralStorage(pointerName, knownShapeObjectToRuntimeValue(source.value), context));
      lines.push(`  ${loadedName} = load ptr, ptr ${pointerName}`, `  call void @objectAssign(ptr ${target.value}, ptr ${loadedName})`);
      continue;
    }
    if (source.kind === "fixedArray") {
      for (let index = 0; index < source.length; index += 1) {
        const keyName = `%assign.key.${context.numIndex}`;
        const value = emitNumberValueExpression({ kind: "number", value: { kind: "arrayAccess", arrayName: source.name, index: { kind: "literal", value: index } } }, context);
        context.numIndex += 1;
        lines.push(`  ${keyName} = call ptr @indexToString(i64 ${index})`, ...value.lines, `  call void @objectSet(ptr ${target.value}, i64 ${String(index).length}, ptr ${keyName}, i64 ${value.value})`);
      }
      continue;
    }
    const value = context.emitValue(source.value);
    lines.push(...value.lines, `  call void @valueObjectAssign(ptr ${target.value}, i64 ${value.value})`);
  }
  return lines;
}
export function descriptorFlags(descriptor: Extract<JsIrOperation, { readonly kind: "runtimeObjectDefineDataProperty" }>["descriptor"]): number {
  let flags = 0;
  if (descriptor.writable) {
    flags += descriptorWritableFlag;
  }
  if (descriptor.enumerable) {
    flags += descriptorEnumerableFlag;
  }
  if (descriptor.configurable) {
    flags += descriptorConfigurableFlag;
  }
  return flags;
}
export function emitRuntimeObjectValueExpression(
  expression: Extract<JsIrValueExpression, { readonly kind: "objectDynamicAccess" }>,
  context: EmitContext
): JsValue {
  const object = emitRuntimeObjectPointer(expression.objectName, context);
  const key = context.emitStringExpression(expression.key);
  const valueIndex = context.numIndex;
  context.numIndex += 1;
  const value = `%value.${valueIndex}`;
  return {
    lines: [...object.lines, ...key.lines, `  ${value} = call i64 @objectGet(ptr ${object.value}, i64 ${key.length}, ptr ${key.value})`],
    value
  };
}
export function emitNumberValueExpression(expression: Extract<JsIrValueExpression, { readonly kind: "number" }>, context: EmitContext): JsValue {
  const number = context.emitNumberExpression(expression.value);
  const index = context.numIndex;
  context.numIndex += 1;
  const value = `%value.${index}`;
  return { lines: [...number.lines, `  ${value} = call i64 @valueBoxNumber(double ${llvmDoubleBitcastOperand(number.value)})`], value };
}
