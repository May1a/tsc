import { type Lowered, loweredPayload, notApplicable, produced } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import type { JsIrStringExpression, JsIrValueExpression } from "./expressions.js";
import { lowerCanonicalArrayIndexString, unwrapTypeOnlyExpression } from "./predicates.js";
import { CLASS_THIS_NAME } from "./class-names.js";
import { lowerInlineCppValueExpression } from "./inline-cpp.js";
import { lowerClassValueExpression } from "./class-values.js";
import { lowerDirectValueExpression } from "./direct-values.js";
import { lowerValueCallExpression } from "./value-calls.js";
import { lowerRuntimeObjectLiteralExpression } from "./object-literals.js";
import { isFunctionPrototypeAccess } from "./optional-chains.js";
import { isBoxedAggregateCandidateBinding, objectHasNestedFields } from "./builtins/object-producers.js";
import { lowerPropertyKeyExpression } from "./string-expressions.js";

export function lowerValueExpression(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  const unwrappedExpression = unwrapTypeOnlyExpression(expression);
  if (unwrappedExpression !== expression) {
    return context.lowerValueExpression(context, unwrappedExpression, bindings);
  }

  if (expression.kind === ts.SyntaxKind.ThisKeyword && bindings.get(CLASS_THIS_NAME)?.kind === "valueVariable") {
    return produced({ kind: "variable", name: CLASS_THIS_NAME });
  }

  const inlineCppValue = lowerInlineCppValueExpression(context.inlineCpp, expression);
  if (inlineCppValue.kind !== "notApplicable") {
    return inlineCppValue;
  }

  const classValue = lowerClassValueExpression(context, expression, bindings);
  if (classValue.kind !== "notApplicable") {
    return classValue;
  }

  const directValue = lowerDirectValueExpression(context, expression, bindings);
  if (directValue.kind !== "notApplicable") {
    return directValue;
  }

  const aggregateValue = lowerAggregateValueExpression(context, expression, bindings);
  if (aggregateValue.kind !== "notApplicable") {
    return aggregateValue;
  }

  const scalarValue = lowerScalarValueExpression(context, expression, bindings);
  if (scalarValue.kind !== "notApplicable") {
    return scalarValue;
  }

  if (ts.isCallExpression(expression) && !(ts.isIdentifier(expression.expression) && expression.expression.text === "print")) {
    return lowerValueCallExpression(context, expression, bindings);
  }

  return notApplicable;
}

function lowerAggregateValueExpression(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  if (ts.isObjectLiteralExpression(expression)) {
    const value = lowerRuntimeObjectLiteralExpression(context, expression, bindings);
    if (value.kind === "unsupported") {
      return value;
    }
    if (value.kind === "lowered") {
      return produced({ kind: "objectLiteralValue", value: value.operation });
    }
  }

  if (ts.isArrayLiteralExpression(expression)) {
    const arrayLiteralValue = lowerValueTypedArrayLiteralExpression(context, expression, bindings);
    if (arrayLiteralValue.kind !== "notApplicable") {
      return arrayLiteralValue;
    }
  }

  if (ts.isElementAccessExpression(expression)) {
    if (ts.isIdentifier(expression.expression)) {
      const arrayAccess = lowerRuntimeArrayValueAccess(context, expression, bindings);
      if (arrayAccess.kind !== "notApplicable") {
        return arrayAccess;
      }
      const objectAccess = lowerRuntimeObjectElementValueAccess(context, expression, bindings);
      if (objectAccess.kind !== "notApplicable") {
        return objectAccess;
      }
    }
    const valueAccess = lowerValueElementAccess(context, expression, bindings);
    if (valueAccess.kind !== "notApplicable") {
      return valueAccess;
    }
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return lowerAggregatePropertyValueAccess(context, expression, bindings);
  }

  if (ts.isIdentifier(expression)) {
    const binding = bindings.get(expression.text);
    if (binding?.kind === "runtimeObject") {
      return produced({ kind: "objectRef", name: binding.name });
    }
    if (binding?.kind === "runtimeArray") {
      return produced({ kind: "arrayRef", name: binding.name });
    }
  }

  return notApplicable;
}

function lowerValueTypedArrayLiteralExpression(
  context: LoweringContext,
  expression: ts.ArrayLiteralExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  const valueElements: JsIrValueExpression[] = [];
  for (const element of expression.elements) {
    if (ts.isSpreadElement(element) || ts.isOmittedExpression(element)) {
      return notApplicable;
    }
    const value = context.lowerValueExpression(context, element, bindings);
    if (value.kind !== "lowered") {
      return value;
    }
    valueElements.push(value.operation);
  }
  return produced({ kind: "runtimeArrayValue", elements: valueElements });
}

function lowerAggregatePropertyValueAccess(
  context: LoweringContext,
  expression: ts.PropertyAccessExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  if (expression.expression.kind === ts.SyntaxKind.ThisKeyword) {
    const value = context.lowerValueExpression(context, expression.expression, bindings);
    if (value.kind === "unsupported") {
      return value;
    }
    if (value.kind === "lowered") {
      return produced({ kind: "valueObjectDynamicAccess", value: value.operation, key: { kind: "literal", value: expression.name.text } });
    }
  }
  const receiver = unwrapTypeOnlyExpression(expression.expression);
  if (!ts.isIdentifier(receiver)) {
    return notApplicable;
  }
  const binding = bindings.get(receiver.text);
  if (isFunctionPrototypeAccess(expression, bindings)) {
    return notApplicable;
  }
  if (binding?.kind === "runtimeObject" && binding.errorName !== undefined && expression.name.text === "stack") {
    return notApplicable;
  }
  if (binding?.kind === "runtimeObject") {
    return produced({ kind: "objectDynamicAccess", objectName: binding.name, key: { kind: "literal", value: expression.name.text } });
  }
  if (isBoxedAggregateCandidateBinding(binding)) {
    const value = context.lowerValueExpression(context, receiver, bindings);
    if (value.kind === "unsupported") {
      return value;
    }
    if (value.kind === "lowered") {
      return produced({ kind: "valueObjectDynamicAccess", value: value.operation, key: { kind: "literal", value: expression.name.text } });
    }
  }
  return notApplicable;
}

function lowerValueElementAccess(
  context: LoweringContext,
  expression: ts.ElementAccessExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  const value = lowerValueElementReceiver(context, expression.expression, bindings);
  if (value.kind !== "lowered") {
    return value;
  }
  const indexResult = context.lowerNumberExpression(context, expression.argumentExpression, bindings);
  if (indexResult.kind === "unsupported") {
    return indexResult;
  }
  let index = loweredPayload(indexResult);
  const stringIndex = lowerCanonicalArrayIndexString(expression.argumentExpression);
  if (stringIndex !== undefined) {
    index = { kind: "literal", value: stringIndex };
  }
  if (index !== undefined) {
    const keyValue = index.kind === "literal" ? String(index.value) : "0";
    return produced({ kind: "valueArrayAccess", value: value.operation, index, key: { kind: "literal", value: keyValue } });
  }
  const key = lowerPropertyKeyExpression(context, expression.argumentExpression, bindings);
  if (key.kind === "unsupported") {
    return key;
  }
  if (key.kind === "lowered") {
    return produced({ kind: "valueObjectDynamicAccess", value: value.operation, key: key.operation });
  }
  return notApplicable;
}

function lowerValueElementReceiver(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  if (ts.isElementAccessExpression(expression)) {
    return context.lowerValueExpression(context, expression, bindings);
  }
  if (!ts.isIdentifier(expression)) {
    return notApplicable;
  }
  const binding = bindings.get(expression.text);
  if (!isBoxedAggregateCandidateBinding(binding)) {
    return notApplicable;
  }
  return context.lowerValueExpression(context, expression, bindings);
}

function lowerRuntimeArrayValueAccess(
  context: LoweringContext,
  expression: ts.ElementAccessExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  if (!ts.isIdentifier(expression.expression) || bindings.get(expression.expression.text)?.kind !== "runtimeArray") {
    return notApplicable;
  }
  const indexResult2 = context.lowerNumberExpression(context, expression.argumentExpression, bindings);
  if (indexResult2.kind === "unsupported") {
    return indexResult2;
  }
  let index = loweredPayload(indexResult2);
  let key: JsIrStringExpression | undefined;
  const stringIndex = lowerCanonicalArrayIndexString(expression.argumentExpression);
  if (stringIndex !== undefined) {
    index = { kind: "literal", value: stringIndex };
    key = { kind: "literal", value: String(stringIndex) };
  }
  if (index !== undefined) {
    if (ts.isNumericLiteral(expression.argumentExpression)) {
      key = { kind: "literal", value: expression.argumentExpression.text };
    }
    return produced({ kind: "arrayAccess", arrayName: expression.expression.text, index, key });
  }
  if (ts.isStringLiteral(expression.argumentExpression) && expression.argumentExpression.text === "length") {
    return produced({ kind: "number", value: { kind: "arrayLength", arrayName: expression.expression.text } });
  }
  const propertyKeyExpressionResult = lowerPropertyKeyExpression(context, expression.argumentExpression, bindings);
  if (propertyKeyExpressionResult.kind === "unsupported") {
    return propertyKeyExpressionResult;
  }
  key = loweredPayload(propertyKeyExpressionResult);
  if (key !== undefined) {
    return produced({ kind: "arrayAccess", arrayName: expression.expression.text, index: { kind: "literal", value: -1 }, key });
  }
  return notApplicable;
}

function lowerRuntimeObjectElementValueAccess(
  context: LoweringContext,
  expression: ts.ElementAccessExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  if (!ts.isIdentifier(expression.expression)) {
    return notApplicable;
  }
  const binding = bindings.get(expression.expression.text);
  if (binding?.kind !== "object" && binding?.kind !== "runtimeObject") {
    return notApplicable;
  }
  if (binding.kind === "object" && objectHasNestedFields(binding.value)) {
    return notApplicable;
  }
  const key = lowerPropertyKeyExpression(context, expression.argumentExpression, bindings);
  if (key.kind !== "lowered") {
    return key;
  }
  return produced({ kind: "objectDynamicAccess", objectName: expression.expression.text, key: key.operation });
}

function lowerScalarValueExpression(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  const stringValue = context.lowerStringRuntimeExpression(context, expression, bindings);
  if (stringValue.kind === "unsupported") {
    return stringValue;
  }
  if (stringValue.kind === "lowered") {
    return produced({ kind: "string", value: stringValue.operation });
  }

  const numberValue = context.lowerNumberExpression(context, expression, bindings);
  if (numberValue.kind === "unsupported") {
    return numberValue;
  }
  if (numberValue.kind === "lowered") {
    return produced({ kind: "number", value: numberValue.operation });
  }

  const booleanValue = context.lowerConditionExpression(context, expression, bindings);
  if (booleanValue.kind === "unsupported") {
    return booleanValue;
  }
  if (booleanValue.kind === "lowered") {
    return produced({ kind: "boolean", value: booleanValue.operation });
  }

  return notApplicable;
}
