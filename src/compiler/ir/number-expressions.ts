import { type Lowered, loweredPayload, notApplicable, produced } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import type { JsIrNumberExpression } from "./expressions.js";
import { unwrapTypeOnlyExpression } from "./predicates.js";
import { lowerRegexSearchNumberExpression } from "./regex.js";
import { lowerArrayNumberMethodCall, lowerNumberCoercionExpression, lowerNumericBuiltinCall, lowerStringNumberMethodCall } from "./number-builtins.js";
import { numberConstantValue, numberExpressionFromNumber } from "./number-constants.js";
import { lowerClassNumberAccess, lowerNumberAccessExpression } from "./number-access.js";
import { lowerNumberOperator } from "./number-operators.js";
import { classLoweringState } from "./class-info.js";
import { isPlannedBuiltinCall } from "./builtins/index.js";
import { lowerCallThisValue, lowerSpreadCallValue } from "./value-calls.js";
import { lowerCallArguments, lowerValueCallArguments } from "./call-arguments.js";

// eslint-disable-next-line complexity, max-statements -- Numeric literal/identifier/NaN/prefix-unary recognition centralizes the canonical JSValue conversion paths.
export function lowerNumberExpression(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrNumberExpression> {
  const unwrappedExpression = unwrapTypeOnlyExpression(expression);
  if (unwrappedExpression !== expression) {
    return context.lowerNumberExpression(context, unwrappedExpression, bindings);
  }

  const regexSearch = lowerRegexSearchNumberExpression(context, expression, bindings);
  if (regexSearch.kind !== "notApplicable") {
    return regexSearch;
  }

  const numericBuiltin = lowerNumericBuiltinCall(context, expression, bindings);
  if (numericBuiltin.kind !== "notApplicable") {
    return numericBuiltin;
  }

  if (ts.isNumericLiteral(expression)) {
    return produced({
      kind: "literal",
      value: Number(expression.text)
    });
  }

  if (ts.isIdentifier(expression)) {
    if (expression.text === "NaN") {
      return produced({ kind: "nan" });
    }
    if (expression.text === "Infinity") {
      return produced({ kind: "literal", value: Number.POSITIVE_INFINITY });
    }
    const binding = bindings.get(expression.text);
    if (binding?.kind !== "number") {
      return notApplicable;
    }
    return produced(binding.value);
  }

  if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === "Math") {
    if (expression.name.text === "PI") {
      return produced({ kind: "literal", value: Math.PI });
    }
    if (expression.name.text === "E") {
      return produced({ kind: "literal", value: Math.E });
    }
    if (expression.name.text === "NaN") {
      return produced({ kind: "nan" });
    }
    if (expression.name.text === "Infinity") {
      return produced({ kind: "literal", value: Number.POSITIVE_INFINITY });
    }
  }

  if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === "Number") {
    const constant = numberConstantValue(expression.name.text);
    if (constant !== undefined) {
      return produced(numberExpressionFromNumber(constant));
    }
  }

  if (
    ts.isPrefixUnaryExpression(expression) &&
    expression.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(expression.operand) &&
    expression.operand.text === "0"
  ) {
    return produced({ kind: "negatedZero" });
  }

  if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text !== "print" && expression.expression.text !== "Boolean" && expression.expression.text !== "isNaN") {
    return lowerNumberCallExpression(context, expression, bindings);
  }

  if (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression)) {
    const method = lowerArrayNumberMethodCall(context, expression, bindings);
    if (method.kind !== "notApplicable") {
      return method;
    }
    const stringMethod = lowerStringNumberMethodCall(context, expression, bindings);
    if (stringMethod.kind !== "notApplicable") {
      return stringMethod;
    }
  }

  const classNumber = lowerClassNumberAccess(context, expression, bindings);
  if (classNumber.kind !== "notApplicable") {
    return classNumber;
  }

  const access = lowerNumberAccessExpression(context, expression, bindings);
  if (access.kind !== "notApplicable") {
    return access;
  }

  const collectionSize = lowerRuntimeCollectionSizeExpression(expression, bindings);
  if (collectionSize !== undefined) {
    return produced(collectionSize);
  }

  if (ts.isPrefixUnaryExpression(expression) && expression.operator === ts.SyntaxKind.MinusToken) {
    const value = context.lowerNumberExpression(context, expression.operand, bindings);
    if (value.kind !== "lowered") {
      return value;
    }

    return produced({
      kind: "unary",
      operator: "negate",
      value: value.operation
    });
  }

  if (ts.isPrefixUnaryExpression(expression) && expression.operator === ts.SyntaxKind.TildeToken) {
    const value = context.lowerNumberExpression(context, expression.operand, bindings);
    if (value.kind !== "lowered") {
      return value;
    }
    return produced({ kind: "unary", operator: "bitNot", value: value.operation });
  }

  const update = lowerUpdateNumberExpression(expression, bindings);
  if (update !== undefined) {
    return produced(update);
  }

  if (ts.isConditionalExpression(expression)) {
    return lowerNumberConditionalExpression(context, expression, bindings);
  }

  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.CommaToken) {
    const left = context.lowerValueExpression(context, expression.left, bindings);
    if (left.kind !== "lowered") {
      return left;
    }
    const rightValue = context.lowerValueExpression(context, expression.right, bindings);
    if (rightValue.kind !== "lowered") {
      return rightValue;
    }
    return produced({ kind: "valueToNumber", value: { kind: "sequence", left: left.operation, right: rightValue.operation } });
  }

  if (!ts.isBinaryExpression(expression)) {
    return notApplicable;
  }

  return lowerNumberBinaryExpression(context, expression, bindings);
}

export function lowerUpdateNumberExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Extract<JsIrNumberExpression, { readonly kind: "update" }> | undefined {
  if (ts.isPrefixUnaryExpression(expression) && (expression.operator === ts.SyntaxKind.PlusPlusToken || expression.operator === ts.SyntaxKind.MinusMinusToken) && ts.isIdentifier(expression.operand)) {
    const binding = bindings.get(expression.operand.text);
    if (binding?.kind === "number" && binding.value.kind === "variable") {
      return { kind: "update", name: expression.operand.text, operator: updateOperator(expression.operator), prefix: true };
    }
  }
  if (ts.isPostfixUnaryExpression(expression) && ts.isIdentifier(expression.operand)) {
    const binding = bindings.get(expression.operand.text);
    if (binding?.kind === "number" && binding.value.kind === "variable") {
      return { kind: "update", name: expression.operand.text, operator: updateOperator(expression.operator), prefix: false };
    }
  }
  return undefined;
}

function updateOperator(kind: ts.SyntaxKind.PlusPlusToken | ts.SyntaxKind.MinusMinusToken): "increment" | "decrement" {
  if (kind === ts.SyntaxKind.PlusPlusToken) {
    return "increment";
  }
  return "decrement";
}

function lowerRuntimeCollectionSizeExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrNumberExpression | undefined {
  if (!ts.isPropertyAccessExpression(expression) || !ts.isIdentifier(expression.expression) || expression.name.text !== "size") {
    return undefined;
  }
  const binding = bindings.get(expression.expression.text);
  if (binding?.kind !== "runtimeMap" && binding?.kind !== "runtimeSet") {
    return undefined;
  }
  return { kind: "runtimeCollectionSize", collectionName: binding.name };
}

function lowerNumberBinaryExpression(
  context: LoweringContext,
  expression: ts.BinaryExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrNumberExpression> {
  const leftResult = context.lowerNumberExpression(context, expression.left, bindings);
  if (leftResult.kind === "unsupported") {
    return leftResult;
  }
  const left = loweredPayload(leftResult);
  const rightResult = context.lowerNumberExpression(context, expression.right, bindings);
  if (rightResult.kind === "unsupported") {
    return rightResult;
  }
  const right = loweredPayload(rightResult);
  if (left === undefined || right === undefined) {
    return notApplicable;
  }

  const operator = lowerNumberOperator(expression.operatorToken.kind);
  if (operator === undefined) {
    return notApplicable;
  }

  return produced({
    kind: "binary",
    operator,
    left,
    right
  });
}

function lowerNumberConditionalExpression(
  context: LoweringContext,
  expression: ts.ConditionalExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrNumberExpression> {
  const condition = context.lowerConditionExpression(context, expression.condition, bindings);
  const consequentResult = context.lowerNumberExpression(context, expression.whenTrue, bindings);
  if (consequentResult.kind === "unsupported") {
    return consequentResult;
  }
  const consequent = loweredPayload(consequentResult);
  const alternateResult = context.lowerNumberExpression(context, expression.whenFalse, bindings);
  if (alternateResult.kind === "unsupported") {
    return alternateResult;
  }
  const alternate = loweredPayload(alternateResult);
  if (condition.kind !== "lowered" || consequent === undefined || alternate === undefined) {
    return notApplicable;
  }

  return produced({
    kind: "ternary",
    condition: condition.operation,
    consequent,
    alternate
  });
}

// eslint-disable-next-line complexity, max-statements -- Number-call lowering preserves direct and dynamic call fast paths during ABI migration.
function lowerNumberCallExpression(
  context: LoweringContext,
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrNumberExpression> {
  if (classLoweringState.typeChecker !== undefined) {
    const callType = classLoweringState.typeChecker.getTypeAtLocation(expression);
    if ((callType.flags & (ts.TypeFlags.String | ts.TypeFlags.StringLiteral)) !== 0) {
      return notApplicable;
    }
  }
  if (isPlannedBuiltinCall(expression.expression, bindings)) {
    return notApplicable;
  }
  const spreadCall = lowerSpreadCallValue(context, expression, bindings);
  if (spreadCall.kind === "unsupported") {
    return spreadCall;
  }
  if (spreadCall.kind === "lowered") {
    return produced({ kind: "valueToNumber", value: spreadCall.operation });
  }
  if (!ts.isIdentifier(expression.expression)) {
    const calleeValueResult = context.lowerValueExpression(context, expression.expression, bindings);
    if (calleeValueResult.kind === "unsupported") {
      return calleeValueResult;
    }
    const calleeValue = loweredPayload(calleeValueResult);
    const dynamicArgsResult = lowerValueCallArguments(context, expression.arguments, bindings);
    if (dynamicArgsResult.kind === "unsupported") {
      return dynamicArgsResult;
    }
    const dynamicArgs = loweredPayload(dynamicArgsResult);
    if (calleeValue === undefined || dynamicArgs === undefined) {
      return notApplicable;
    }
    const callThisValueResult = lowerCallThisValue(context, expression.expression, bindings);
    if (callThisValueResult.kind === "unsupported") {
      return callThisValueResult;
    }
    return produced({ kind: "valueToNumber", value: { kind: "callValue", callee: calleeValue, arguments: dynamicArgs, thisValue: loweredPayload(callThisValueResult) } });
  }

  if (expression.expression.text === "Number" && expression.arguments.length === 1) {
    return lowerNumberCoercionExpression(context, expression.arguments[0], bindings);
  }

  const callee = bindings.get(expression.expression.text);
  if (callee?.kind === "value" || callee?.kind === "valueVariable") {
    const calleeValueResult2 = context.lowerValueExpression(context, expression.expression, bindings);
    if (calleeValueResult2.kind === "unsupported") {
      return calleeValueResult2;
    }
    const calleeValue = loweredPayload(calleeValueResult2);
    const dynamicArgsResult2 = lowerValueCallArguments(context, expression.arguments, bindings);
    if (dynamicArgsResult2.kind === "unsupported") {
      return dynamicArgsResult2;
    }
    const dynamicArgs = loweredPayload(dynamicArgsResult2);
    if (calleeValue === undefined || dynamicArgs === undefined) {
      return notApplicable;
    }
    const callThisValueResult2 = lowerCallThisValue(context, expression.expression, bindings);
    if (callThisValueResult2.kind === "unsupported") {
      return callThisValueResult2;
    }
    return produced({ kind: "valueToNumber", value: { kind: "callValue", callee: calleeValue, arguments: dynamicArgs, thisValue: loweredPayload(callThisValueResult2) } });
  }
  const args: JsIrNumberExpression[] = [];
  let name = expression.expression.text;
  if (callee?.kind === "closure") {
    args.push(...callee.value.captures);
    name = callee.value.functionName;
  } else if (callee?.kind === "function" && (callee.returnKind === "string" || callee.returnKind === "value")) {
    return notApplicable;
  }

  const loweredArgs = lowerCallArguments(context, expression.expression.text, expression.arguments, bindings);
  if (loweredArgs.kind !== "lowered") {
    return loweredArgs;
  }
  for (const arg of loweredArgs.operation) {
    if (arg.valueKind !== "number") {
      return notApplicable;
    }
    args.push(arg.value);
  }

  return produced({ kind: "call", name, arguments: args });
}
