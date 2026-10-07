import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import type { LoweringContext } from "./context.js";
import { type Lowered, loweredPayload, notApplicable, produced } from "./lowered.js";
import type { JsIrCondition, JsIrValueExpression } from "./expressions.js";
import { errorConstructorNames, unwrapTypeOnlyExpression } from "./predicates.js";
import { classLoweringState, classPrototypeName } from "./class-info.js";
import { lowerClassInstanceExpression } from "./class-calls.js";
import { lowerRegexTestCondition } from "./regex.js";
import { lowerArrayIsArrayConditionExpression, lowerHasOwnConditionExpression, lowerNumberPredicateCondition, lowerObjectIsConditionExpression, lowerObjectMethodSugarConditionExpression, lowerPresenceConditionExpression, lowerRuntimeArrayEverySomeConditionExpression, lowerRuntimeCollectionHasCondition, lowerRuntimeStringSearchCondition } from "./builtin-conditions.js";
import { lowerRuntimeCollectionIdentityCondition, lowerTruthyConditionExpression } from "./comparisons.js";
import { lowerRuntimeObjectStateCondition } from "./builtins/object-producers.js";
import { lowerComparisonConditionExpression } from "./comparisons-lowering.js";

export function lowerBooleanExpression(expression: ts.Expression, bindings: ReadonlyMap<string, JsIrBindingValue>): boolean | undefined {
  if (expression.kind === ts.SyntaxKind.TrueKeyword || expression.kind === ts.SyntaxKind.FalseKeyword) {
    return expression.kind === ts.SyntaxKind.TrueKeyword;
  }

  if (ts.isIdentifier(expression)) {
    const binding = bindings.get(expression.text);
    if (binding?.kind === "boolean") {
      return binding.value;
    }
    if (binding?.kind === "booleanVariable") {
      return binding.initialValue;
    }
  }

  return undefined;
}

function lowerInstanceOfCondition(
  context: LoweringContext,
  expression: ts.BinaryExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrCondition> {
  const right = unwrapTypeOnlyExpression(expression.right);
  if (ts.isIdentifier(right) && !bindings.has(right.text)) {
    const classInfo = classLoweringState.registry?.get(right.text);
    if (classInfo !== undefined) {
      const instance = lowerClassInstanceExpression(context, unwrapTypeOnlyExpression(expression.left), bindings);
      if (instance.kind === "unsupported") {
        return instance;
      }
      let value: JsIrValueExpression | undefined;
      if (instance.kind === "lowered") {
        value = instance.operation;
      } else {
        const valueExpressionResult = context.lowerValueExpression(context, unwrapTypeOnlyExpression(expression.left), bindings);
        if (valueExpressionResult.kind === "unsupported") {
          return valueExpressionResult;
        }
        value = loweredPayload(valueExpressionResult);
      }
      if (value !== undefined) {
        return produced({ kind: "classInstanceOf", value, prototypeName: classPrototypeName(classInfo.name) });
      }
    }
  }
  if (!ts.isIdentifier(right) || !errorConstructorNames.has(right.text) || bindings.has(right.text)) {
    return notApplicable;
  }
  const errorCondition = lowerErrorInstanceOfCondition(context, expression.left, right.text, bindings);
  if (errorCondition.kind !== "lowered") {
    return errorCondition;
  }
  return produced(errorCondition.operation);
}

function lowerErrorInstanceOfCondition(
  context: LoweringContext,
  leftExpression: ts.Expression,
  constructorName: string,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrCondition> {
  const left = unwrapTypeOnlyExpression(leftExpression);
  if (!ts.isIdentifier(left)) {
    return notApplicable;
  }
  const binding = bindings.get(left.text);
  if (binding?.kind === "runtimeObject") {
    return produced({ kind: "boolean", value: errorInstanceMatches(binding.errorName, constructorName) });
  }
  if (binding?.kind === "runtimeArray" || binding?.kind === "object" || binding?.kind === "array") {
    return produced({ kind: "boolean", value: false });
  }
  // Boxed values (catch variables, JSON.parse results, dynamic property reads)
  // resolve the error class at runtime; primitive bindings stay unsupported.
  if (binding?.kind === "valueVariable" || binding?.kind === "value") {
    const value = context.lowerValueExpression(context, left, bindings);
    if (value.kind === "unsupported") {
      return value;
    }
    if (value.kind === "lowered") {
      return produced({ kind: "errorInstanceOf", value: value.operation, errorName: constructorName });
    }
  }
  return notApplicable;
}

function errorInstanceMatches(errorName: string | undefined, constructorName: string): boolean {
  if (errorName === undefined) {
    return false;
  }
  if (constructorName === "Error") {
    return true;
  }
  return errorName === constructorName;
}

// eslint-disable-next-line complexity, max-statements -- Condition lowering is still centralized while runtime predicates are introduced.
export function lowerConditionExpression(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrCondition> {
  const unwrappedExpression = unwrapTypeOnlyExpression(expression);
  if (unwrappedExpression !== expression) {
    return context.lowerConditionExpression(context, unwrappedExpression, bindings);
  }

  const regexTest = lowerRegexTestCondition(context, expression, bindings);
  if (regexTest.kind !== "notApplicable") {
    return regexTest;
  }

  if (ts.isPrefixUnaryExpression(expression) && expression.operator === ts.SyntaxKind.ExclamationToken) {
    const operand = context.lowerConditionExpression(context, expression.operand, bindings);
    if (operand.kind !== "lowered") {
      return operand;
    }

    return produced({ kind: "negate", condition: operand.operation });
  }

  if (ts.isBinaryExpression(expression)) {
    if (expression.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword) {
      return lowerInstanceOfCondition(context, expression, bindings);
    }
    const logicalCondition = lowerLogicalConditionExpression(context, expression, bindings);
    if (logicalCondition.kind !== "notApplicable") {
      return logicalCondition;
    }
    const presenceCondition = lowerPresenceConditionExpression(context, expression, bindings);
    if (presenceCondition.kind !== "notApplicable") {
      return presenceCondition;
    }
    const collectionIdentity = lowerRuntimeCollectionIdentityCondition(expression, bindings);
    if (collectionIdentity !== undefined) {
      return produced(collectionIdentity);
    }
  }

  const hasOwnCondition = lowerHasOwnConditionExpression(context, expression, bindings);
  if (hasOwnCondition.kind !== "notApplicable") {
    return hasOwnCondition;
  }

  const methodSugar = lowerObjectMethodSugarConditionExpression(context, expression, bindings);
  if (methodSugar.kind !== "notApplicable") {
    return methodSugar;
  }

  const isArray = lowerArrayIsArrayConditionExpression(context, expression, bindings);
  if (isArray.kind !== "notApplicable") {
    return isArray;
  }

  const everySome = lowerRuntimeArrayEverySomeConditionExpression(expression, bindings);
  if (everySome !== undefined) {
    return produced(everySome);
  }

  const objectIsCondition = lowerObjectIsConditionExpression(context, expression, bindings);
  if (objectIsCondition.kind !== "notApplicable") {
    return objectIsCondition;
  }

  const objectStateCondition = lowerRuntimeObjectStateCondition(expression, bindings);
  if (objectStateCondition !== undefined) {
    return produced(objectStateCondition);
  }

  const numberPredicate = lowerNumberPredicateCondition(context, expression, bindings);
  if (numberPredicate.kind !== "notApplicable") {
    return numberPredicate;
  }

  const stringSearch = lowerRuntimeStringSearchCondition(context, expression, bindings);
  if (stringSearch.kind !== "notApplicable") {
    return stringSearch;
  }

  const collectionHas = lowerRuntimeCollectionHasCondition(context, expression, bindings);
  if (collectionHas.kind !== "notApplicable") {
    return collectionHas;
  }

  if (ts.isIdentifier(expression)) {
    const binding = bindings.get(expression.text);
    if (binding?.kind === "booleanExpression") {
      return produced(binding.value);
    }
    if (binding?.kind === "booleanVariable") {
      return produced({ kind: "booleanVariable", name: binding.name });
    }
  }

  const booleanValue = lowerBooleanExpression(expression, bindings);
  if (booleanValue !== undefined) {
    return produced({ kind: "boolean", value: booleanValue });
  }

  const truthy = lowerTruthyConditionExpression(expression, bindings);
  if (truthy !== undefined) {
    return produced(truthy);
  }

  if (!ts.isBinaryExpression(expression)) {
    return notApplicable;
  }

  const comparison = lowerComparisonConditionExpression(context, expression, bindings);
  if (comparison.kind !== "lowered") {
    return comparison;
  }
  return produced(comparison.operation);
}

function lowerLogicalConditionExpression(
  context: LoweringContext,
  expression: ts.BinaryExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrCondition> {
  if (
    expression.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken &&
    expression.operatorToken.kind !== ts.SyntaxKind.BarBarToken
  ) {
    return notApplicable;
  }

  // A refusal on either operand is this function's answer, not a decline: `true && Boolean(new.target)`
  // matched the `&&` shape, so folding it to `notApplicable` made the statement tier reconstruct a
  // generic message and the reason that said which form was unsupported never reached the user.
  const left = context.lowerConditionExpression(context, expression.left, bindings);
  if (left.kind === "unsupported") {
    return left;
  }
  const right = context.lowerConditionExpression(context, expression.right, bindings);
  if (right.kind === "unsupported") {
    return right;
  }
  if (left.kind !== "lowered" || right.kind !== "lowered") {
    return notApplicable;
  }

  if (expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    return produced({ kind: "and", left: left.operation, right: right.operation });
  }

  return produced({ kind: "or", left: left.operation, right: right.operation });
}
