import { type Lowered, loweredPayload, notApplicable, produced } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import type ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import type { JsIrCondition } from "./expressions.js";
import { lowerBooleanComparisonExpression, lowerComparisonOperator } from "./comparisons.js";
import { lowerStringExpression } from "./string-constants.js";

export function lowerComparisonConditionExpression(
  context: LoweringContext,
  expression: ts.BinaryExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrCondition> {

  const operator = lowerComparisonOperator(expression.operatorToken.kind);
  if (operator === undefined) {
    return notApplicable;
  }

  const stringComparison = lowerStringComparisonExpression(context, expression, operator, bindings);
  if (stringComparison.kind !== "notApplicable") {
    return stringComparison;
  }

  const booleanComparison = lowerBooleanComparisonExpression(expression, operator, bindings);
  if (booleanComparison !== undefined) {
    return produced(booleanComparison);
  }

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
  if (left !== undefined && right !== undefined && operator !== "==" && operator !== "!=") {
    return produced({
      kind: "numberComparison",
      operator,
      left,
      right
    });
  }

  return lowerValueComparisonExpression(context, expression, operator, bindings);
}

function lowerStringComparisonExpression(
  context: LoweringContext,
  expression: ts.BinaryExpression,
  operator: "===" | "!==" | "==" | "!=" | "<" | "<=" | ">" | ">=",
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrCondition> {
  if (operator !== "===" && operator !== "!==") {
    return notApplicable;
  }

  const left = lowerStringExpression(expression.left, bindings);
  const right = lowerStringExpression(expression.right, bindings);
  if (left !== undefined && right !== undefined) {
    let value = left === right;
    if (operator === "!==") {
      value = !value;
    }

    return produced({ kind: "boolean", value });
  }

  const runtimeLeftResult = context.lowerStringRuntimeExpression(context, expression.left, bindings);
  if (runtimeLeftResult.kind === "unsupported") {
    return runtimeLeftResult;
  }
  const runtimeLeft = loweredPayload(runtimeLeftResult);
  const runtimeRightResult = context.lowerStringRuntimeExpression(context, expression.right, bindings);
  if (runtimeRightResult.kind === "unsupported") {
    return runtimeRightResult;
  }
  const runtimeRight = loweredPayload(runtimeRightResult);
  if (runtimeLeft === undefined || runtimeRight === undefined) {
    return notApplicable;
  }

  return produced({ kind: "stringComparison", operator, left: runtimeLeft, right: runtimeRight });
}

function lowerValueComparisonExpression(
  context: LoweringContext,
  expression: ts.BinaryExpression,
  operator: "===" | "!==" | "==" | "!=" | "<" | "<=" | ">" | ">=",
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrCondition> {
  const leftResult2 = context.lowerValueExpression(context, expression.left, bindings);
  if (leftResult2.kind === "unsupported") {
    return leftResult2;
  }
  const left = loweredPayload(leftResult2);
  const rightResult2 = context.lowerValueExpression(context, expression.right, bindings);
  if (rightResult2.kind === "unsupported") {
    return rightResult2;
  }
  const right = loweredPayload(rightResult2);
  if (left === undefined || right === undefined) {
    return notApplicable;
  }

  if (operator === "==" || operator === "!=") {
    return produced({ kind: "valueLooseComparison", operator, left, right });
  }

  if (operator !== "===" && operator !== "!==") {
    return produced({ kind: "valueRelationalComparison", operator, left, right });
  }

  return produced({ kind: "valueComparison", operator, left, right });
}
