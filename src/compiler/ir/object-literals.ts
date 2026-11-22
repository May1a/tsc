import { type Lowered, loweredPayload, notApplicable, produced } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import type { ObjectLiteralClassification } from "./literal-types.js";
import type { JsIrObjectField, JsIrObjectValue, JsIrRuntimeObjectField, JsIrRuntimeObjectValue, JsIrStringExpression, JsIrValueExpression } from "./expressions.js";
import { lowerPropertyKeyExpression } from "./string-expressions.js";

export function classifyObjectLiteral(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<ObjectLiteralClassification> {
  const fixed = lowerObjectLiteralExpression(context, expression, bindings);
  if (fixed.kind === "unsupported") {
    return fixed;
  }
  if (fixed.kind === "lowered") {
    if (fixed.operation.fields.length === 0) {
      return produced({ kind: "runtime", value: { fields: [] } });
    }
    return produced({ kind: "fixed", value: fixed.operation });
  }

  const runtime = lowerRuntimeObjectLiteralExpression(context, expression, bindings);
  if (runtime.kind === "unsupported") {
    return runtime;
  }
  if (runtime.kind === "lowered") {
    return produced({ kind: "runtime", value: runtime.operation });
  }

  return notApplicable;
}

function lowerObjectLiteralExpression(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrObjectValue> {
  if (!ts.isObjectLiteralExpression(expression)) {
    return notApplicable;
  }

  const fields: JsIrObjectField[] = [];
  for (const property of expression.properties) {
    if (!ts.isPropertyAssignment(property)) {
      return notApplicable;
    }
    const fieldName = lowerObjectFieldName(property.name);
    if (fieldName === undefined) {
      return notApplicable;
    }
    const objectValue = lowerObjectLiteralExpression(context, property.initializer, bindings);
    if (objectValue.kind === "unsupported") {
      return objectValue;
    }
    if (objectValue.kind === "lowered") {
      fields.push({ name: fieldName, value: { kind: "object", value: objectValue.operation } });
      continue;
    }
    const numberValue = context.lowerNumberExpression(context, property.initializer, bindings);
    if (numberValue.kind !== "lowered") {
      return numberValue;
    }
    fields.push({ name: fieldName, value: { kind: "number", value: numberValue.operation } });
  }
  return produced({ fields });
}

export function lowerRuntimeObjectLiteralExpression(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrRuntimeObjectValue> {
  if (!ts.isObjectLiteralExpression(expression)) {
    return notApplicable;
  }
  const fields: JsIrRuntimeObjectField[] = [];
  for (const property of expression.properties) {
    const field = lowerRuntimeObjectProperty(context, property, bindings);
    if (field.kind !== "lowered") {
      return field;
    }
    fields.push(field.operation);
  }
  return produced({ fields });
}

function lowerRuntimeObjectProperty(
  context: LoweringContext,
  property: ts.ObjectLiteralElementLike,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrRuntimeObjectField> {
  if (ts.isGetAccessorDeclaration(property) || ts.isSetAccessorDeclaration(property)) {
    return lowerObjectAccessorField(context, property, bindings);
  }
  if (ts.isSpreadAssignment(property)) {
    return lowerObjectSpreadField(property, bindings);
  }
  if (ts.isShorthandPropertyAssignment(property)) {
    const value = context.lowerValueExpression(context, property.name, bindings);
    return value.kind === "lowered" ? produced({ kind: "field", key: { kind: "literal", value: property.name.text }, value: value.operation }) : value;
  }
  if (ts.isMethodDeclaration(property) && property.body !== undefined) {
    return lowerKeyedObjectField(
      lowerRuntimeObjectFieldName(context, property.name, bindings),
      context.lowerObjectMethodFunctionValue(context, property, bindings)
    );
  }
  if (ts.isPropertyAssignment(property)) {
    return lowerKeyedObjectField(
      lowerRuntimeObjectFieldName(context, property.name, bindings),
      context.lowerValueExpression(context, property.initializer, bindings)
    );
  }
  return notApplicable;
}

function lowerKeyedObjectField(
  keyResult: Lowered<JsIrStringExpression>,
  valueResult: Lowered<JsIrValueExpression>
): Lowered<JsIrRuntimeObjectField> {
  if (keyResult.kind === "unsupported") {
    return keyResult;
  }
  if (valueResult.kind === "unsupported") {
    return valueResult;
  }
  const key = loweredPayload(keyResult);
  const value = loweredPayload(valueResult);
  return key !== undefined && value !== undefined ? produced({ kind: "field", key, value }) : notApplicable;
}

export function lowerRuntimeObjectFieldName(
  context: LoweringContext,
  name: ts.PropertyName,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrStringExpression> {
  // A numeric literal name is a string key. JavaScript has one property-key type, so `{ 0: "A" }` and
  // `{ "0": "A" }` are the same object, and an enum's reverse mapping is exactly that shape: a numeric
  // key holding the member's name.
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return produced({ kind: "literal", value: name.text });
  }
  if (!ts.isComputedPropertyName(name)) {
    return notApplicable;
  }
  return lowerPropertyKeyExpression(context, name.expression, bindings);
}

function lowerObjectFieldName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
    return name.text;
  }
  return undefined;
}

function lowerObjectAccessorField(
  context: LoweringContext,
  property: ts.GetAccessorDeclaration | ts.SetAccessorDeclaration,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrRuntimeObjectField> {
  const keyResult = lowerRuntimeObjectFieldName(context, property.name, bindings);
  if (keyResult.kind === "unsupported") {
    return keyResult;
  }
  const key = loweredPayload(keyResult);
  const valueResult = context.lowerObjectMethodFunctionValue(context, property, bindings);
  if (valueResult.kind === "unsupported") {
    return valueResult;
  }
  const value = loweredPayload(valueResult);
  if (key === undefined || value === undefined) {
    return notApplicable;
  }
  if (ts.isGetAccessorDeclaration(property)) {
    return produced({ kind: "accessor", key, getter: value });
  }
  return produced({ kind: "accessor", key, setter: value });
}

function lowerObjectSpreadField(
  property: ts.SpreadAssignment,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrRuntimeObjectField> {
  if (!ts.isIdentifier(property.expression)) {
    return notApplicable;
  }
  const sourceBinding = bindings.get(property.expression.text);
  if (sourceBinding?.kind !== "runtimeObject" && sourceBinding?.kind !== "object") {
    return notApplicable;
  }
  return produced({ kind: "spread", sourceName: property.expression.text });

}
