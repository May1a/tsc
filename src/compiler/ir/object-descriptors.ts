import { type Lowered, loweredOptional, loweredPayload, notApplicable, produced } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import type { JsIrObjectValue, JsIrRuntimeDataDescriptor, JsIrRuntimeObjectField, JsIrRuntimeObjectValue, JsIrStringExpression, JsIrValueExpression } from "./expressions.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import { isBoxedAggregateCandidateBinding, lowerRuntimeDataDescriptorValue, objectHasNestedFields } from "./builtins/object-producers.js";
import { lowerBooleanExpression } from "./conditions.js";
import { lowerPropertyKeyExpression } from "./string-expressions.js";
import { lowerCanonicalArrayIndexString } from "./predicates.js";

// eslint-disable-next-line complexity, max-statements -- Descriptor literal lowering keeps data descriptor validation in one place.
export function lowerRuntimeDataDescriptor(
  context: LoweringContext,
  key: JsIrStringExpression | undefined,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrRuntimeDataDescriptor> {
  if (key === undefined || !ts.isObjectLiteralExpression(expression)) {
    if (key !== undefined && ts.isIdentifier(expression)) {
      const binding = bindings.get(expression.text);
      if (binding?.kind === "runtimeObject" && binding.value !== undefined) {
        return loweredOptional(lowerRuntimeDataDescriptorValue(key, { kind: "objectRef", name: expression.text }, bindings, binding.value));
      }
    }
    return notApplicable;
  }
  let value: JsIrValueExpression | undefined;
  let writable = false;
  let enumerable = false;
  let configurable = false;
  for (const property of expression.properties) {
    if (ts.isShorthandPropertyAssignment(property)) {
      const booleanValue = lowerBooleanExpression(property.name, bindings);
      if (booleanValue === undefined) {
        return notApplicable;
      }
      if (property.name.text === "writable") {
        writable = booleanValue;
        continue;
      }
      if (property.name.text === "enumerable") {
        enumerable = booleanValue;
        continue;
      }
      if (property.name.text === "configurable") {
        configurable = booleanValue;
        continue;
      }
      return notApplicable;
    }
    if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) {
      return notApplicable;
    }
    if (property.name.text === "value") {
      const valueExpressionResult = context.lowerValueExpression(context, property.initializer, bindings);
      if (valueExpressionResult.kind === "unsupported") {
        return valueExpressionResult;
      }
      value = loweredPayload(valueExpressionResult);
      continue;
    }
    const booleanValue = lowerBooleanExpression(property.initializer, bindings);
    if (booleanValue === undefined) {
      return notApplicable;
    }
    if (property.name.text === "writable") {
      writable = booleanValue;
      continue;
    }
    if (property.name.text === "enumerable") {
      enumerable = booleanValue;
      continue;
    }
    if (property.name.text === "configurable") {
      configurable = booleanValue;
      continue;
    }
    return notApplicable;
  }
  if (value === undefined) {
    return notApplicable;
  }
  return produced({ key, value, writable, enumerable, configurable });
}

export function fixedObjectToRuntimeObjectValue(value: JsIrObjectValue): JsIrRuntimeObjectValue | undefined {
  const fields: JsIrRuntimeObjectField[] = [];
  for (const field of value.fields) {
    if (field.value.kind !== "number") {
      return undefined;
    }
    fields.push({ kind: "field", key: { kind: "literal", value: field.name }, value: { kind: "number", value: field.value.value } });
  }
  return { fields };
}

// eslint-disable-next-line complexity, max-statements -- Descriptor lowering handles object, array, and boxed aggregate receiver shapes.
export function lowerRuntimeObjectOwnPropertyDescriptorBinding(
  context: LoweringContext,
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!ts.isCallExpression(initializer) || initializer.arguments.length !== 2) {
    return notApplicable;
  }
  const callee = initializer.expression;
  if (!ts.isPropertyAccessExpression(callee) || !ts.isIdentifier(callee.expression) || callee.expression.text !== "Object" || callee.name.text !== "getOwnPropertyDescriptor") {
    return notApplicable;
  }
  const [target, keyExpression] = initializer.arguments;
  if (!ts.isIdentifier(target)) {
    return notApplicable;
  }
  const binding = bindings.get(target.text);
  if (binding?.kind === "runtimeObject" || (binding?.kind === "object" && !objectHasNestedFields(binding.value))) {
    const key = lowerPropertyKeyExpression(context, keyExpression, bindings);
    if (key.kind === "unsupported") {
      return key;
    }
    if (key.kind === "lowered") {
      return produced({ kind: "runtimeObjectOwnPropertyDescriptor", name, targetName: target.text, targetKind: "object", key: key.operation });
    }
  }
  if (binding?.kind === "runtimeArray") {
    if (ts.isStringLiteral(keyExpression) && keyExpression.text === "length") {
      return produced({ kind: "runtimeObjectOwnPropertyDescriptor", name, targetName: target.text, targetKind: "array", key: { kind: "literal", value: "length" }, isLength: true });
    }
    const key = lowerPropertyKeyExpression(context, keyExpression, bindings);
    if (key.kind !== "lowered") {
      return key;
    }
    const indexResult = context.lowerNumberExpression(context, keyExpression, bindings);
    if (indexResult.kind === "unsupported") {
      return indexResult;
    }
    let index = loweredPayload(indexResult);
    const stringIndex = lowerCanonicalArrayIndexString(keyExpression);
    if (stringIndex !== undefined) {
      index = { kind: "literal", value: stringIndex };
    }
    index ??= { kind: "literal", value: -1 };
    return produced({ kind: "runtimeObjectOwnPropertyDescriptor", name, targetName: target.text, targetKind: "array", key: key.operation, index });
  }
  if (isBoxedAggregateCandidateBinding(binding)) {
    const key = lowerPropertyKeyExpression(context, keyExpression, bindings);
    if (key.kind !== "lowered") {
      return key;
    }
    if (ts.isStringLiteral(keyExpression) && keyExpression.text === "length") {
      return produced({ kind: "runtimeObjectOwnPropertyDescriptor", name, targetName: target.text, targetKind: "value", key: key.operation, isLength: true });
    }
    const indexResult2 = context.lowerNumberExpression(context, keyExpression, bindings);
    if (indexResult2.kind === "unsupported") {
      return indexResult2;
    }
    let index = loweredPayload(indexResult2);
    const stringIndex = lowerCanonicalArrayIndexString(keyExpression);
    if (stringIndex !== undefined) {
      index = { kind: "literal", value: stringIndex };
    }
    return produced({ kind: "runtimeObjectOwnPropertyDescriptor", name, targetName: target.text, targetKind: "value", key: key.operation, index });
  }
  return notApplicable;
}
