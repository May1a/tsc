import { unsupportedFormMessage } from "./builtins/manifest.js";
import { type Lowered, loweredPayload, notApplicable, produced, unsupportedIn } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import type { ObjectLiteralClassification } from "./literal-types.js";
import type { JsIrObjectField, JsIrObjectValue, JsIrRuntimeObjectField, JsIrRuntimeObjectValue, JsIrStringExpression } from "./expressions.js";
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

// eslint-disable-next-line max-statements -- Runtime object literals validate spread, shorthand, methods, and value fields in one pass.
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
    if (ts.isGetAccessorDeclaration(property) || ts.isSetAccessorDeclaration(property)) {
      return unsupportedIn(unsupportedFormMessage("object-literal-accessor"));
    }

    if (ts.isSpreadAssignment(property)) {
      const spread = lowerObjectSpreadField(property, bindings);
      if (spread.kind !== "lowered") {
        return spread;
      }
      fields.push(spread.operation);
      continue;
    }
    if (ts.isShorthandPropertyAssignment(property)) {
      const value = context.lowerValueExpression(context, property.name, bindings);
      if (value.kind !== "lowered") {
        return value;
      }
      fields.push({ kind: "field", key: { kind: "literal", value: property.name.text }, value: value.operation });
      continue;
    }
    if (ts.isMethodDeclaration(property) && property.body !== undefined) {
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
      fields.push({ kind: "field", key, value });
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
    const valueResult2 = context.lowerValueExpression(context, property.initializer, bindings);
    if (valueResult2.kind === "unsupported") {
      return valueResult2;
    }
    const value = loweredPayload(valueResult2);
    if (key === undefined || value === undefined) {
      return notApplicable;
    }
    fields.push({ kind: "field", key, value });
  }
  return produced({ fields });
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
