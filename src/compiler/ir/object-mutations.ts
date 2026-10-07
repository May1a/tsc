import { type Lowered, loweredOptional, loweredPayload, notApplicable, produced } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import type { JsIrOperation } from "./types.js";
import type { JsIrObjectAssignSource, JsIrRuntimeDataDescriptor } from "./expressions.js";
import { lowerRuntimeDataDescriptorMapValue, objectHasNestedFields } from "./builtins/object-producers.js";
import { isProvenBoxedAggregateBinding } from "./number-access.js";
import { definePropertyArgumentCount } from "./predicates.js";
import { lowerPropertyKeyExpression } from "./string-expressions.js";
import { lowerRuntimeDataDescriptor } from "./object-descriptors.js";
import { lowerRuntimeObjectFieldName } from "./object-literals.js";

export function lowerRuntimeObjectCallStatement(
  context: LoweringContext,
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression)) {
    return notApplicable;
  }
  if (expression.expression.expression.text !== "Object") {
    return notApplicable;
  }

  if (expression.expression.name.text === "setPrototypeOf") {
    return loweredOptional(lowerRuntimeSetPrototypeCall(expression, bindings));
  }
  if (expression.expression.name.text === "defineProperty") {
    return lowerRuntimeDefinePropertyCall(context, expression, bindings);
  }
  if (expression.expression.name.text === "defineProperties") {
    return lowerRuntimeDefinePropertiesCall(context, expression, bindings);
  }
  if (expression.expression.name.text === "preventExtensions") {
    return loweredOptional(lowerUnaryRuntimeObjectCall(expression, bindings, "runtimeObjectPreventExtensions"));
  }
  if (expression.expression.name.text === "seal") {
    return loweredOptional(lowerUnaryRuntimeObjectCall(expression, bindings, "runtimeObjectSeal"));
  }
  if (expression.expression.name.text === "freeze") {
    return loweredOptional(lowerUnaryRuntimeObjectCall(expression, bindings, "runtimeObjectFreeze"));
  }
  if (expression.expression.name.text === "assign") {
    return lowerRuntimeObjectAssignCall(context, expression, bindings);
  }
  return notApplicable;
}

function lowerUnaryRuntimeObjectCall(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  kind: "runtimeObjectPreventExtensions" | "runtimeObjectSeal" | "runtimeObjectFreeze"
): JsIrOperation | undefined {
  if (expression.arguments.length !== 1) {
    return undefined;
  }
  const [target] = expression.arguments;
  if (!ts.isIdentifier(target) || bindings.get(target.text)?.kind !== "runtimeObject") {
    return undefined;
  }
  return { kind, objectName: target.text };
}

function lowerRuntimeObjectAssignCall(
  context: LoweringContext,
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (expression.arguments.length < 2) {
    return notApplicable;
  }
  const [target, ...sourceExpressions] = expression.arguments;
  if (!ts.isIdentifier(target) || bindings.get(target.text)?.kind !== "runtimeObject") {
    return notApplicable;
  }
  const loweredSources: JsIrObjectAssignSource[] = [];
  for (const source of sourceExpressions) {
    const loweredSource = lowerObjectAssignSource(context, source, bindings);
    if (loweredSource.kind !== "lowered") {
      return loweredSource;
    }
    loweredSources.push(loweredSource.operation);
  }
  return produced({ kind: "runtimeObjectAssign", targetName: target.text, sources: loweredSources });
}

function lowerRuntimeSetPrototypeCall(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (expression.arguments.length !== 2) {
    return undefined;
  }
  const [target, prototype] = expression.arguments;
  if (!ts.isIdentifier(target)) {
    return undefined;
  }
  const targetBinding = bindings.get(target.text);
  let targetKind: "object" | "array" | undefined;
  if (targetBinding?.kind === "runtimeObject") {
    targetKind = "object";
  }
  if (targetBinding?.kind === "runtimeArray") {
    targetKind = "array";
  }
  if (targetKind === undefined) {
    return undefined;
  }
  if (prototype.kind === ts.SyntaxKind.NullKeyword) {
    return { kind: "runtimeObjectSetPrototype", targetName: target.text, targetKind };
  }
  if (!ts.isIdentifier(prototype) || prototype.text === target.text) {
    return undefined;
  }
  const prototypeBinding = bindings.get(prototype.text);
  if (prototypeBinding?.kind !== "runtimeObject") {
    return undefined;
  }
  return { kind: "runtimeObjectSetPrototype", targetName: target.text, targetKind, prototypeName: prototype.text };
}

function lowerRuntimeDefinePropertyCall(
  context: LoweringContext,
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (expression.arguments.length !== definePropertyArgumentCount) {
    return notApplicable;
  }
  const [target, keyExpression, descriptorExpression] = expression.arguments;
  if (!ts.isIdentifier(target) || bindings.get(target.text)?.kind !== "runtimeObject") {
    return notApplicable;
  }
  const keyResult = lowerPropertyKeyExpression(context, keyExpression, bindings);
  if (keyResult.kind === "unsupported") {
    return keyResult;
  }
  const key = loweredPayload(keyResult);
  const descriptor = lowerRuntimeDataDescriptor(context, key, descriptorExpression, bindings);
  if (descriptor.kind !== "lowered") {
    return descriptor;
  }
  return produced({ kind: "runtimeObjectDefineDataProperty", objectName: target.text, descriptor: descriptor.operation });
}

function lowerRuntimeDefinePropertiesCall(
  context: LoweringContext,
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (expression.arguments.length !== 2) {
    return notApplicable;
  }
  const [target, descriptorsExpression] = expression.arguments;
  if (!ts.isIdentifier(target) || bindings.get(target.text)?.kind !== "runtimeObject" || !ts.isObjectLiteralExpression(descriptorsExpression)) {
    return notApplicable;
  }
  const descriptors = lowerRuntimeDataDescriptorMap(context, descriptorsExpression, bindings);
  if (descriptors.kind !== "lowered") {
    return descriptors;
  }
  return produced({ kind: "runtimeObjectDefineDataProperties", objectName: target.text, descriptors: descriptors.operation });
}

function lowerRuntimeDataDescriptorMap(
  context: LoweringContext,
  expression: ts.ObjectLiteralExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<readonly JsIrRuntimeDataDescriptor[]> {
  const descriptors: JsIrRuntimeDataDescriptor[] = [];
  for (const property of expression.properties) {
    if (ts.isSpreadAssignment(property)) {
      if (!ts.isIdentifier(property.expression)) {
        return notApplicable;
      }
      const source = bindings.get(property.expression.text);
      if (source?.kind !== "runtimeObject" || source.value === undefined) {
        return notApplicable;
      }
      const spreadDescriptors = lowerRuntimeDataDescriptorMapValue(source.value, bindings);
      if (spreadDescriptors === undefined) {
        return notApplicable;
      }
      descriptors.push(...spreadDescriptors);
      continue;
    }
    if (ts.isShorthandPropertyAssignment(property)) {
      const descriptor = lowerRuntimeDataDescriptor(context, { kind: "literal", value: property.name.text }, property.name, bindings);
      if (descriptor.kind !== "lowered") {
        return descriptor;
      }
      descriptors.push(descriptor.operation);
      continue;
    }
    if (!ts.isPropertyAssignment(property)) {
      return notApplicable;
    }
    const keyResult2 = lowerRuntimeObjectFieldName(context, property.name, bindings);
    if (keyResult2.kind === "unsupported") {
      return keyResult2;
    }
    const key = loweredPayload(keyResult2);
    const descriptor = lowerRuntimeDataDescriptor(context, key, property.initializer, bindings);
    if (descriptor.kind !== "lowered") {
      return descriptor;
    }
    descriptors.push(descriptor.operation);
  }
  return produced(descriptors);
}

function lowerObjectAssignSource(
  context: LoweringContext,
  source: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrObjectAssignSource> {
  if (!ts.isIdentifier(source)) {
    return notApplicable;
  }
  const binding = bindings.get(source.text);
  if (binding?.kind === "runtimeObject") {
    return produced({ kind: "runtimeObject", name: source.text });
  }
  if (binding?.kind === "runtimeArray") {
    return produced({ kind: "runtimeArray", name: source.text });
  }
  if (binding?.kind === "object" && !objectHasNestedFields(binding.value)) {
    return produced({ kind: "fixedObject", value: binding.value });
  }
  if (binding?.kind === "array") {
    return produced({ kind: "fixedArray", name: source.text, length: binding.length });
  }
  if (isProvenBoxedAggregateBinding(binding)) {
    const value = context.lowerValueExpression(context, source, bindings);
    if (value.kind === "unsupported") {
      return value;
    }
    if (value.kind === "lowered") {
      return produced({ kind: "value", value: value.operation });
    }
  }
  return notApplicable;
}
