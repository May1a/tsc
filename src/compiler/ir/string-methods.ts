import { type Lowered, loweredPayload, notApplicable, produced } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import type { JsIrNumberExpression, JsIrValueExpression } from "./expressions.js";
import { numericLiteralValue } from "./number-constants.js";

export function lowerStringValueMethodCall(
  context: LoweringContext,
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  const stringMethod = lowerStringMethodCall(context, expression, bindings);
  if (stringMethod.kind === "unsupported") {
    return stringMethod;
  }
  if (stringMethod.kind === "lowered") {
    if (typeof stringMethod.operation === "object") {
      return produced({ kind: "undefined" });
    }
    if (typeof stringMethod.operation === "string") {
      return produced({ kind: "string", value: { kind: "literal", value: stringMethod.operation } });
    }
    if (typeof stringMethod.operation === "number") {
      if (Number.isNaN(stringMethod.operation)) {
        return produced({ kind: "number", value: { kind: "nan" } });
      }
      return produced({ kind: "number", value: { kind: "literal", value: stringMethod.operation } });
    }
    return produced({ kind: "boolean", value: { kind: "boolean", value: stringMethod.operation } });
  }
  return lowerRuntimeStringMethodCall(context, expression, bindings);
}

// eslint-disable-next-line complexity, max-statements -- Runtime string method dispatch routes every method to a dedicated IR node for emission.
function lowerRuntimeStringMethodCall(
  context: LoweringContext,
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  if (!ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression)) {
    return notApplicable;
  }
  const receiverName = expression.expression.expression.text;
  const receiverBinding = bindings.get(receiverName);
  if (receiverBinding === undefined) {
    return notApplicable;
  }
  const receiver = context.lowerStringRuntimeExpression(context, expression.expression.expression, bindings);
  if (receiver.kind !== "lowered") {
    return receiver;
  }
  const method = expression.expression.name.text;
  const args = [...expression.arguments];
  const first = args.at(0);
  if ((method === "startsWith" || method === "endsWith") && (args.length === 1 || args.length === 2)) {
    if (first === undefined) {
      return notApplicable;
    }
    const search = context.lowerStringRuntimeExpression(context, first, bindings);
    if (search.kind !== "lowered") {
      return search;
    }
    let position: JsIrNumberExpression | undefined;
    if (args.length === 2) {
      const pos = context.lowerNumberExpression(context, args[1], bindings);
      if (pos.kind !== "lowered") {
        return pos;
      }
      position = pos.operation;
    }
    if (method === "startsWith") {
      if (position === undefined) {
        return produced({ kind: "stringStartsWith", receiver: receiver.operation, search: search.operation });
      }
      return produced({ kind: "stringStartsWith", receiver: receiver.operation, search: search.operation, position });
    }
    if (position === undefined) {
      return produced({ kind: "stringEndsWith", receiver: receiver.operation, search: search.operation });
    }
    return produced({ kind: "stringEndsWith", receiver: receiver.operation, search: search.operation, position });
  }
  if ((method === "charCodeAt" || method === "codePointAt") && args.length === 1) {
    if (first === undefined) {
      return notApplicable;
    }
    const index = context.lowerNumberExpression(context, first, bindings);
    if (index.kind !== "lowered") {
      return index;
    }
    if (method === "charCodeAt") {
      return produced({ kind: "stringCharCodeAt", receiver: receiver.operation, index: index.operation });
    }
    return produced({ kind: "stringCodePointAt", receiver: receiver.operation, index: index.operation });
  }
  if (method === "indexOf" && (args.length === 1 || args.length === 2)) {
    if (first === undefined) {
      return notApplicable;
    }
    const search = context.lowerStringRuntimeExpression(context, first, bindings);
    if (search.kind !== "lowered") {
      return search;
    }
    let position: JsIrNumberExpression | undefined;
    if (args.length === 2) {
      const loweredPosition = context.lowerNumberExpression(context, args[1], bindings);
      if (loweredPosition.kind !== "lowered") {
        return loweredPosition;
      }
      position = loweredPosition.operation;
    }
    return produced({ kind: "stringIndexOf", receiver: receiver.operation, search: search.operation, position });
  }
  if (method === "lastIndexOf" && args.length === 1) {
    if (first === undefined) {
      return notApplicable;
    }
    const search = context.lowerStringRuntimeExpression(context, first, bindings);
    if (search.kind !== "lowered") {
      return search;
    }
    return produced({ kind: "stringLastIndexOf", receiver: receiver.operation, search: search.operation });
  }
  if (method === "localeCompare" && args.length === 1) {
    if (first === undefined) {
      return notApplicable;
    }
    const other = context.lowerStringRuntimeExpression(context, first, bindings);
    if (other.kind !== "lowered") {
      return other;
    }
    return produced({ kind: "stringLocaleCompare", receiver: receiver.operation, index: { kind: "literal", value: 0 }, other: other.operation });
  }
  if (method === "at" && args.length === 1) {
    if (first === undefined) {
      return notApplicable;
    }
    const position = context.lowerNumberExpression(context, first, bindings);
    if (position.kind !== "lowered") {
      return position;
    }
    return produced({ kind: "string", value: { kind: "stringMethod", method: "at", receiver: receiver.operation, position: position.operation } });
  }
  if (method === "normalize" && args.length === 0) {
    return produced({ kind: "string", value: { kind: "stringMethod", method: "normalize", receiver: receiver.operation } });
  }
  return notApplicable;
}

// eslint-disable-next-line complexity, max-statements -- String method folding centralizes the narrow boxed-string roadmap slice.
export function lowerStringMethodCall(
  context: LoweringContext,
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<string | number | boolean | { readonly kind: "undefined" }> {
  if (!ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression)) {
    return notApplicable;
  }
  const receiverName = expression.expression.expression.text;
  const value = stringLiteralBindingValue(bindings.get(receiverName));
  if (value === undefined) {
    return notApplicable;
  }
  const method = expression.expression.name.text;
  const args = [...expression.arguments];
  const first = args.at(0);
  const second = args.at(1);
  if ((method === "includes" || method === "indexOf" || method === "startsWith" || method === "endsWith") && (expression.arguments.length === 1 || expression.arguments.length === 2)) {
    const searchResult = lowerStringSearchArgument(context, first, bindings);
    if (searchResult.kind === "unsupported") {
      return searchResult;
    }
    const search = loweredPayload(searchResult);
    let fromIndex = 0;
    if (second !== undefined) {
      const fromNumber = context.lowerNumberExpression(context, second, bindings);
      if (fromNumber.kind !== "lowered") {
        return fromNumber;
      }
      const literal = numericLiteralValue(fromNumber.operation);
      if (literal === undefined) {
        return notApplicable;
      }
      fromIndex = literal;
    }
    if (search === undefined) {
      return notApplicable;
    }
    if (method === "includes") {
      return produced(value.includes(search, fromIndex));
    }
    if (method === "startsWith") {
      return produced(value.startsWith(search, fromIndex));
    }
    if (method === "endsWith") {
      let endPosition: number | undefined;
      if (second !== undefined) {
        endPosition = fromIndex;
      }
      return produced(value.endsWith(search, endPosition));
    }
    return produced(value.indexOf(search, fromIndex));
  }
  if (method === "trim" && expression.arguments.length === 0) {
    return produced(value.trim());
  }
  if (method === "trimStart" && expression.arguments.length === 0) {
    return produced(value.trimStart());
  }
  if (method === "trimEnd" && expression.arguments.length === 0) {
    return produced(value.trimEnd());
  }
  let firstLiteral: number | undefined;
  if (first !== undefined) {
    const firstNumber = context.lowerNumberExpression(context, first, bindings);
    if (firstNumber.kind === "unsupported") {
      return firstNumber;
    }
    if (firstNumber.kind === "lowered") {
      firstLiteral = numericLiteralValue(firstNumber.operation);
    }
  }
  let secondLiteral: number | undefined;
  if (second !== undefined) {
    const secondNumber = context.lowerNumberExpression(context, second, bindings);
    if (secondNumber.kind === "unsupported") {
      return secondNumber;
    }
    if (secondNumber.kind === "lowered") {
      secondLiteral = numericLiteralValue(secondNumber.operation);
    }
  }
  if ((first !== undefined && firstLiteral === undefined) || (second !== undefined && secondLiteral === undefined)) {
    return notApplicable;
  }
  if (method === "charAt" && expression.arguments.length === 1) {
    return produced(value.charAt(Math.max(0, firstLiteral ?? 0)));
  }
  if (method === "charCodeAt" && expression.arguments.length === 1) {
    return produced(value.charCodeAt(Math.max(0, firstLiteral ?? 0)));
  }
  if (method === "codePointAt" && expression.arguments.length === 1) {
    return produced(value.codePointAt(Math.max(0, firstLiteral ?? 0)) ?? { kind: "undefined" });
  }
  if (method === "at" && expression.arguments.length === 1) {
    return produced(value.at(firstLiteral ?? 0) ?? { kind: "undefined" });
  }
  if (method === "slice" && (expression.arguments.length === 1 || expression.arguments.length === 2)) {
    return produced(value.slice(firstLiteral ?? 0, secondLiteral));
  }
  if (method === "substring" && (expression.arguments.length === 1 || expression.arguments.length === 2)) {
    return produced(value.substring(firstLiteral ?? 0, secondLiteral));
  }
  if (method === "substr" && (expression.arguments.length === 1 || expression.arguments.length === 2)) {
    return produced(stringSubstr(value, firstLiteral ?? 0, secondLiteral));
  }
  return notApplicable;
}

function stringLiteralBindingValue(receiver: JsIrBindingValue | undefined): string | undefined {
  if (receiver?.kind === "string") {
    const { value } = receiver;
    return value;
  }
  if (receiver?.kind === "stringExpression" && receiver.value.kind === "literal") {
    const { value } = receiver.value;
    return value;
  }
  if (receiver?.kind === "value" && receiver.value.kind === "string" && receiver.value.value.kind === "literal") {
    const { value } = receiver.value.value;
    return value;
  }
  return undefined;
}

function stringSubstr(value: string, start: number, length: number | undefined): string {
  let from = start;
  if (from < 0) {
    from = Math.max(value.length + from, 0);
  }
  if (length === undefined) {
    return value.slice(from);
  }
  if (length < 0) {
    return "";
  }
  return value.slice(from, from + length);
}

function lowerStringSearchArgument(context: LoweringContext,
  expression: ts.Expression | undefined, bindings: ReadonlyMap<string, JsIrBindingValue>): Lowered<string> {
  if (expression === undefined) {
    return notApplicable;
  }
  const loweredResult = context.lowerStringRuntimeExpression(context, expression, bindings);
  if (loweredResult.kind === "unsupported") {
    return loweredResult;
  }
  const lowered = loweredPayload(loweredResult);
  if (lowered?.kind === "literal") {
    return produced(lowered.value);
  }
  return notApplicable;
}
