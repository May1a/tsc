import { type Lowered, loweredPayload, notApplicable, produced } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import type { JsIrNumberExpression, JsIrStringExpression } from "./expressions.js";
import { numericLiteralValue } from "./number-constants.js";

const minimumNumberRadix = 2;

const maximumNumberRadix = 36;

const maximumToFixedDigits = 100;

// eslint-disable-next-line complexity, max-statements -- String method argument validation mirrors the supported runtime surface explicitly.
export function lowerRuntimeStringMethodExpression(
  context: LoweringContext,
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrStringExpression> {
  if (!ts.isPropertyAccessExpression(expression.expression)) {
    return notApplicable;
  }
  const method = expression.expression.name.text;
  const receiver = context.lowerStringRuntimeExpression(context, expression.expression.expression, bindings);
  if (receiver.kind !== "lowered") {
    return receiver;
  }
  if ((method === "trim" || method === "trimStart" || method === "trimEnd" || method === "toUpperCase" || method === "toLowerCase") && expression.arguments.length === 0) {
    return produced({ kind: "stringMethod", method, receiver: receiver.operation });
  }
  if (method === "repeat" && expression.arguments.length === 1) {
    const countResult = context.lowerNumberExpression(context, expression.arguments[0], bindings);
    if (countResult.kind === "unsupported") {
      return countResult;
    }
    const count = loweredPayload(countResult);
    let literal: number | undefined;
    if (count !== undefined) {
      literal = numericLiteralValue(count);
    }
    if (count === undefined || (literal !== undefined && literal < 0)) {
      return notApplicable;
    }
    return produced({ kind: "stringMethod", method, receiver: receiver.operation, count });
  }
  if ((method === "replace" || method === "replaceAll") && expression.arguments.length === 2) {
    const searchResult = context.lowerStringRuntimeExpression(context, expression.arguments[0], bindings);
    if (searchResult.kind === "unsupported") {
      return searchResult;
    }
    const search = loweredPayload(searchResult);
    const replacementResult = context.lowerStringRuntimeExpression(context, expression.arguments[1], bindings);
    if (replacementResult.kind === "unsupported") {
      return replacementResult;
    }
    const replacement = loweredPayload(replacementResult);
    if (search === undefined || replacement === undefined) {
      return notApplicable;
    }
    return produced({ kind: "stringMethod", method, receiver: receiver.operation, search, replacement });
  }
  if ((method === "padStart" || method === "padEnd") && expression.arguments.length === 2) {
    const targetLengthResult = context.lowerNumberExpression(context, expression.arguments[0], bindings);
    if (targetLengthResult.kind === "unsupported") {
      return targetLengthResult;
    }
    const targetLength = loweredPayload(targetLengthResult);
    const padStringResult = context.lowerStringRuntimeExpression(context, expression.arguments[1], bindings);
    if (padStringResult.kind === "unsupported") {
      return padStringResult;
    }
    const padString = loweredPayload(padStringResult);
    if (targetLength === undefined || padString === undefined) {
      return notApplicable;
    }
    return produced({ kind: "stringMethod", method, receiver: receiver.operation, targetLength, padString });
  }
  if ((method === "charAt" || method === "at") && expression.arguments.length <= 1) {
    const position = lowerOptionalStringIndexArgument(context, expression.arguments[0], bindings);
    if (position.kind !== "lowered") {
      return position;
    }
    return produced({ kind: "stringMethod", method, receiver: receiver.operation, position: position.operation });
  }
  if ((method === "slice" || method === "substring" || method === "substr") && expression.arguments.length <= 2) {
    const start = lowerOptionalStringIndexArgument(context, expression.arguments[0], bindings);
    if (start.kind !== "lowered") {
      return start;
    }
    let end: JsIrNumberExpression | undefined;
    if (expression.arguments.length === 2) {
      const loweredEnd = context.lowerNumberExpression(context, expression.arguments[1], bindings);
      if (loweredEnd.kind !== "lowered") {
        return loweredEnd;
      }
      end = loweredEnd.operation;
    }
    return produced({ kind: "stringMethod", method, receiver: receiver.operation, start: start.operation, end });
  }
  return notApplicable;
}

function lowerOptionalStringIndexArgument(
  context: LoweringContext,
  argument: ts.Expression | undefined,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrNumberExpression> {
  if (argument === undefined) {
    return produced({ kind: "literal", value: 0 });
  }
  return context.lowerNumberExpression(context, argument, bindings);
}

export function lowerStringFromCharCodeExpression(
  context: LoweringContext,
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrStringExpression> {
  if (!ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression)) {
    return notApplicable;
  }
  if (expression.expression.expression.text !== "String" || expression.expression.name.text !== "fromCharCode" || bindings.has("String")) {
    return notApplicable;
  }
  const codes: JsIrNumberExpression[] = [];
  for (const argument of expression.arguments) {
    const code = context.lowerNumberExpression(context, argument, bindings);
    if (code.kind !== "lowered") {
      return code;
    }
    codes.push(code.operation);
  }
  return produced({ kind: "stringFromCharCode", codes });
}

export function lowerRuntimeNumberFormatExpression(
  context: LoweringContext,
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrStringExpression> {
  if (!ts.isPropertyAccessExpression(expression.expression)) {
    return notApplicable;
  }
  const method = expression.expression.name.text;
  if (method !== "toFixed" && method !== "toPrecision" && method !== "toExponential" && method !== "toString") {
    return notApplicable;
  }
  const receiverResult = context.lowerNumberExpression(context, expression.expression.expression, bindings);
  if (receiverResult.kind === "unsupported") {
    return receiverResult;
  }
  const receiver = loweredPayload(receiverResult);
  if (receiver === undefined || expression.arguments.length > 1) {
    return notApplicable;
  }
  if (expression.arguments.length === 0) {
    return produced({ kind: "numberFormat", method, receiver });
  }
  const argument = context.lowerNumberExpression(context, expression.arguments[0], bindings);
  if (argument.kind !== "lowered") {
    return argument;
  }
  const literal = numericLiteralValue(argument.operation);
  if (method === "toFixed" && literal !== undefined && (literal < 0 || literal > maximumToFixedDigits)) {
    return notApplicable;
  }
  if (method === "toString" && literal !== undefined && (literal < minimumNumberRadix || literal > maximumNumberRadix)) {
    return notApplicable;
  }
  return produced({ kind: "numberFormat", method, receiver, argument: argument.operation });
}
