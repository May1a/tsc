import { type Lowered, loweredPayload, notApplicable, produced } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import type { JsIrNumberExpression } from "./expressions.js";
import { coerceStringToNumber, decimalRadix, numberExpressionFromNumber, numericLiteralValue } from "./number-constants.js";
import { isMathMethod } from "./comparisons.js";
import { lowerStringExpression } from "./string-constants.js";
import { lowerArrayMethodValues } from "./array-arguments.js";
import { lowerStringMethodCall } from "./string-methods.js";

// eslint-disable-next-line complexity, max-statements -- Scoped numeric built-in routing is centralized during roadmap package AQ/AR.
export function lowerNumericBuiltinCall(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrNumberExpression> {
  if (!ts.isCallExpression(expression)) {
    return notApplicable;
  }
  const dateNumber = lowerDateNumberCall(context, expression, bindings);
  if (dateNumber.kind !== "notApplicable") {
    return dateNumber;
  }
  if (ts.isIdentifier(expression.expression)) {
    if (expression.expression.text === "Number" && expression.arguments.length === 1) {
      if (ts.isObjectLiteralExpression(expression.arguments[0])) {
        return produced({ kind: "nan" });
      }
      if (ts.isArrayLiteralExpression(expression.arguments[0])) {
        return lowerArrayLiteralNumberCoercion(context, expression.arguments[0], bindings);
      }
      const stringResult = context.lowerStringRuntimeExpression(context, expression.arguments[0], bindings);
      if (stringResult.kind === "unsupported") {
        return stringResult;
      }
      const string = loweredPayload(stringResult);
      if (string?.kind === "literal") {
        return produced(numberExpressionFromNumber(coerceStringToNumber(string.value)));
      }
      const value = context.lowerValueExpression(context, expression.arguments[0], bindings);
      if (value.kind === "unsupported") {
        return value;
      }
      if (value.kind === "lowered") {
        return produced({ kind: "valueToNumber", value: value.operation });
      }
    }
    if (expression.expression.text === "parseInt" && (expression.arguments.length === 1 || expression.arguments.length === 2)) {
      if (expression.arguments.length === 2) {
        const radixResult = context.lowerNumberExpression(context, expression.arguments[1], bindings);
        if (radixResult.kind === "unsupported") {
          return radixResult;
        }
        const radix = loweredPayload(radixResult);
        if (numericLiteralValue(radix ?? { kind: "nan" }) !== decimalRadix) {
          return notApplicable;
        }
      }
      const value = context.lowerStringRuntimeExpression(context, expression.arguments[0], bindings);
      if (value.kind === "unsupported") {
        return value;
      }
      if (value.kind === "lowered") {
        return produced({ kind: "parseInt", value: value.operation });
      }
    }
    if (expression.expression.text === "parseFloat" && expression.arguments.length === 1) {
      const value = context.lowerStringRuntimeExpression(context, expression.arguments[0], bindings);
      if (value.kind === "unsupported") {
        return value;
      }
      if (value.kind === "lowered") {
        return produced({ kind: "parseFloat", value: value.operation });
      }
    }
  }
  if (!ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression) || expression.expression.expression.text !== "Math") {
    if (!ts.isPropertyAccessExpression(expression.expression) ||
      !ts.isIdentifier(expression.expression.expression) || expression.expression.expression.text !== "Number") {
      return notApplicable;
    }
    const method = expression.expression.name.text;
    if (method === "parseInt" && (expression.arguments.length === 1 || expression.arguments.length === 2)) {
      if (expression.arguments.length === 2) {
        const radixResult2 = context.lowerNumberExpression(context, expression.arguments[1], bindings);
        if (radixResult2.kind === "unsupported") {
          return radixResult2;
        }
        const radix = loweredPayload(radixResult2);
        if (numericLiteralValue(radix ?? { kind: "nan" }) !== decimalRadix) {
          return notApplicable;
        }
      }
      const value = context.lowerStringRuntimeExpression(context, expression.arguments[0], bindings);
      if (value.kind === "unsupported") {
        return value;
      }
      if (value.kind === "lowered") {
        return produced({ kind: "parseInt", value: value.operation });
      }
    }
    if (method === "parseFloat" && expression.arguments.length === 1) {
      const value = context.lowerStringRuntimeExpression(context, expression.arguments[0], bindings);
      if (value.kind === "unsupported") {
        return value;
      }
      if (value.kind === "lowered") {
        return produced({ kind: "parseFloat", value: value.operation });
      }
    }
    return notApplicable;
  }
  const method = expression.expression.name.text;
  if (method === "PI" || method === "E" || method === "NaN" || method === "Infinity") {
    return notApplicable;
  }
  if (!isMathMethod(method)) {
    return notApplicable;
  }
  const args: JsIrNumberExpression[] = [];
  for (const argument of expression.arguments) {
    const lowered = context.lowerNumberExpression(context, argument, bindings);
    if (lowered.kind !== "lowered") {
      return lowered;
    }
    args.push(lowered.operation);
  }
  return produced({ kind: "mathCall", method, arguments: args });
}

function lowerDateNumberCall(
  context: LoweringContext,
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrNumberExpression> {
  if (!ts.isPropertyAccessExpression(expression.expression)) {
    return notApplicable;
  }
  const receiver = expression.expression.expression;
  const method = expression.expression.name.text;
  if (ts.isIdentifier(receiver) && receiver.text === "Date" && !bindings.has("Date")) {
    if (method === "now" && expression.arguments.length === 0) {
      return produced({ kind: "literal", value: 0 });
    }
    if (method === "parse" && expression.arguments.length === 1) {
      const value = lowerStringExpression(expression.arguments[0], bindings);
      if (value === undefined) {
        return notApplicable;
      }
      return produced(numberExpressionFromNumber(Date.parse(value)));
    }
  }
  if ((method === "getTime" || method === "valueOf") && expression.arguments.length === 0) {
    return lowerDateConstructorMilliseconds(context, receiver, bindings);
  }
  return notApplicable;
}

export function lowerDateConstructorMilliseconds(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrNumberExpression> {
  if (!ts.isNewExpression(expression) || !ts.isIdentifier(expression.expression) || expression.expression.text !== "Date" || bindings.has("Date")) {
    return notApplicable;
  }
  const args = expression.arguments ?? [];
  if (args.length !== 1) {
    return notApplicable;
  }
  return context.lowerNumberExpression(context, args[0], bindings);
}

export function lowerArrayNumberMethodCall(
  context: LoweringContext,
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrNumberExpression> {
  if (!ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression)) {
    return notApplicable;
  }
  const arrayName = expression.expression.expression.text;
  if (bindings.get(arrayName)?.kind !== "runtimeArray") {
    return notApplicable;
  }
  const method = expression.expression.name.text;
  if (method !== "push" && method !== "unshift") {
    if ((method === "indexOf" || method === "lastIndexOf") && (expression.arguments.length === 1 || expression.arguments.length === 2)) {
      const valueResult = context.lowerValueExpression(context, expression.arguments[0], bindings);
      if (valueResult.kind === "unsupported") {
        return valueResult;
      }
      const value = loweredPayload(valueResult);
      let fromIndex: JsIrNumberExpression | undefined;
      if (expression.arguments.length === 2) {
        const numberExpressionResult = context.lowerNumberExpression(context, expression.arguments[1], bindings);
        if (numberExpressionResult.kind === "unsupported") {
          return numberExpressionResult;
        }
        fromIndex = loweredPayload(numberExpressionResult);
      }
      if (value !== undefined && (expression.arguments.length === 1 || fromIndex !== undefined)) {
        return produced({ kind: "arrayIndexOf", arrayName, value, fromEnd: method === "lastIndexOf", fromIndex });
      }
    }
    if (method === "findIndex" && expression.arguments.length === 0) {
      return produced({ kind: "arrayFindIndex", arrayName });
    }
    return notApplicable;
  }
  const values = lowerArrayMethodValues(context, expression.arguments, bindings);
  if (values.kind !== "lowered") {
    return values;
  }
  return produced({ kind: arrayAppendNumberExpressionKind(method), arrayName, values: values.operation });
}

export function lowerStringNumberMethodCall(
  context: LoweringContext,
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrNumberExpression> {
  const stringMethodResult = lowerStringMethodCall(context, expression, bindings);
  if (stringMethodResult.kind === "unsupported") {
    return stringMethodResult;
  }
  const stringMethod = loweredPayload(stringMethodResult);
  if (typeof stringMethod !== "number") {
    return notApplicable;
  }
  return produced(numberExpressionFromNumber(stringMethod));
}

function arrayAppendNumberExpressionKind(method: "push" | "unshift"): "arrayPush" | "arrayUnshift" {
  if (method === "push") {
    return "arrayPush";
  }
  return "arrayUnshift";
}

export function lowerNumberCoercionExpression(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrNumberExpression> {
  const direct = context.lowerNumberExpression(context, expression, bindings);
  if (direct.kind !== "notApplicable") {
    return direct;
  }
  if (expression.kind === ts.SyntaxKind.NullKeyword) {
    return produced({ kind: "literal", value: 0 });
  }
  if (expression.kind === ts.SyntaxKind.UndefinedKeyword || (ts.isIdentifier(expression) && expression.text === "undefined")) {
    return produced({ kind: "nan" });
  }
  const condition = context.lowerConditionExpression(context, expression, bindings);
  if (condition.kind === "unsupported") {
    return condition;
  }
  if (condition.kind === "lowered" && condition.operation.kind === "boolean") {
    if (condition.operation.value) {
      return produced({ kind: "literal", value: 1 });
    }
    return produced({ kind: "literal", value: 0 });
  }
  const stringResult2 = context.lowerStringRuntimeExpression(context, expression, bindings);
  if (stringResult2.kind === "unsupported") {
    return stringResult2;
  }
  const string = loweredPayload(stringResult2);
  if (string?.kind === "literal") {
    return produced(numberExpressionFromNumber(coerceStringToNumber(string.value)));
  }
  if (ts.isObjectLiteralExpression(expression)) {
    return produced({ kind: "nan" });
  }
  if (ts.isArrayLiteralExpression(expression)) {
    return lowerArrayLiteralNumberCoercion(context, expression, bindings);
  }
  return notApplicable;
}

function lowerArrayLiteralNumberCoercion(
  context: LoweringContext,
  expression: ts.ArrayLiteralExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrNumberExpression> {
  if (expression.elements.length === 0) {
    return produced({ kind: "literal", value: 0 });
  }
  if (expression.elements.length !== 1) {
    return produced({ kind: "nan" });
  }
  const [element] = expression.elements;
  if (ts.isSpreadElement(element)) {
    return notApplicable;
  }
  return lowerNumberCoercionExpression(context, element, bindings);
}
