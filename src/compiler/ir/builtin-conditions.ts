import { type Lowered, loweredPayload, notApplicable, produced } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import type { JsIrCondition, JsIrStringExpression, JsIrValueExpression } from "./expressions.js";
import { lowerCanonicalArrayIndexString, unwrapTypeOnlyExpression } from "./predicates.js";
import { lowerPropertyKeyExpression } from "./string-expressions.js";
import { isBoxedAggregateCandidateBinding } from "./builtins/object-producers.js";
import { classifyObjectLiteral } from "./object-literals.js";
import { classifyArrayLiteral } from "./array-literals.js";

export function lowerRuntimeCollectionHasCondition(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrCondition> {
  if (!ts.isCallExpression(expression) || !ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression) || expression.arguments.length !== 1) {
    return notApplicable;
  }
  const receiver = expression.expression.expression.text;
  const binding = bindings.get(receiver);
  if (binding?.kind !== "runtimeMap" && binding?.kind !== "runtimeSet") {
    return notApplicable;
  }
  const method = expression.expression.name.text;
  if (method !== "has" && method !== "delete") {
    return notApplicable;
  }
  const key = context.lowerValueExpression(context, expression.arguments[0], bindings);
  if (key.kind !== "lowered") {
    return key;
  }
  if (method === "has") {
    return produced({ kind: "runtimeCollectionHas", collectionName: binding.name, key: key.operation });
  }
  return produced({ kind: "runtimeCollectionDelete", collectionName: binding.name, key: key.operation });
}

export function lowerRuntimeStringSearchCondition(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrCondition> {
  if (!ts.isCallExpression(expression) || !ts.isPropertyAccessExpression(expression.expression) || expression.arguments.length !== 1) {
    return notApplicable;
  }
  const method = expression.expression.name.text;
  if (method !== "includes" && method !== "startsWith" && method !== "endsWith") {
    return notApplicable;
  }
  const receiverResult = context.lowerStringRuntimeExpression(context, expression.expression.expression, bindings);
  if (receiverResult.kind === "unsupported") {
    return receiverResult;
  }
  const receiver = loweredPayload(receiverResult);
  const searchResult = context.lowerStringRuntimeExpression(context, expression.arguments[0], bindings);
  if (searchResult.kind === "unsupported") {
    return searchResult;
  }
  const search = loweredPayload(searchResult);
  if (receiver === undefined || search === undefined) {
    return notApplicable;
  }
  return produced({ kind: "stringSearch", method, receiver, search });
}

// eslint-disable-next-line complexity -- Number predicate routing is centralized with the existing predicate surface.
export function lowerNumberPredicateCondition(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrCondition> {
  if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === "Boolean" && expression.arguments.length === 1) {
    const value = context.lowerValueExpression(context, expression.arguments[0], bindings);
    if (value.kind === "unsupported") {
      return value;
    }
    if (value.kind === "lowered") {
      return produced({ kind: "valueTruthy", value: value.operation });
    }
  }
  if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === "isNaN" && expression.arguments.length === 1) {
    const value = context.lowerValueExpression(context, expression.arguments[0], bindings);
    if (value.kind === "unsupported") {
      return value;
    }
    if (value.kind === "lowered") {
      return produced({ kind: "numberPredicate", predicate: "globalIsNaN", value: value.operation });
    }
  }
  if (!ts.isCallExpression(expression) || !ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression) || expression.expression.expression.text !== "Number" || expression.arguments.length !== 1) {
    return notApplicable;
  }
  const value = context.lowerValueExpression(context, expression.arguments[0], bindings);
  if (value.kind !== "lowered") {
    return value;
  }
  if (expression.expression.name.text === "isNaN") {
    return produced({ kind: "numberPredicate", predicate: "numberIsNaN", value: value.operation });
  }
  if (expression.expression.name.text === "isFinite") {
    return produced({ kind: "numberPredicate", predicate: "numberIsFinite", value: value.operation });
  }
  if (expression.expression.name.text === "isInteger") {
    return produced({ kind: "numberPredicate", predicate: "numberIsInteger", value: value.operation });
  }
  if (expression.expression.name.text === "isSafeInteger") {
    return produced({ kind: "numberPredicate", predicate: "numberIsSafeInteger", value: value.operation });
  }
  return notApplicable;
}

export function lowerPresenceConditionExpression(
  context: LoweringContext,
  expression: ts.BinaryExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrCondition> {
  if (expression.operatorToken.kind !== ts.SyntaxKind.InKeyword || !ts.isIdentifier(expression.right)) {
    return notApplicable;
  }
  const binding = bindings.get(expression.right.text);
  if (binding?.kind === "runtimeObject") {
    const key = context.lowerStringRuntimeExpression(context, expression.left, bindings);
    if (key.kind === "unsupported") {
      return key;
    }
    if (key.kind === "lowered") {
      return produced({ kind: "runtimeObjectHas", objectName: expression.right.text, key: key.operation, ownOnly: false });
    }
  }
  if (binding?.kind === "runtimeArray") {
    const indexResult = context.lowerNumberExpression(context, expression.left, bindings);
    if (indexResult.kind === "unsupported") {
      return indexResult;
    }
    let index = loweredPayload(indexResult);
    let key: JsIrStringExpression | undefined;
    if (ts.isNumericLiteral(expression.left)) {
      key = { kind: "literal", value: expression.left.text };
    }
    const stringIndex = lowerCanonicalArrayIndexString(expression.left);
    if (stringIndex !== undefined) {
      index = { kind: "literal", value: stringIndex };
      key = { kind: "literal", value: String(stringIndex) };
    }
    if (index !== undefined) {
      return produced({ kind: "runtimeArrayHas", arrayName: expression.right.text, index, key, ownOnly: false });
    }
    const propertyKeyExpressionResult = lowerPropertyKeyExpression(context, expression.left, bindings);
    if (propertyKeyExpressionResult.kind === "unsupported") {
      return propertyKeyExpressionResult;
    }
    key = loweredPayload(propertyKeyExpressionResult);
    if (key !== undefined) {
      return produced({ kind: "runtimeArrayHas", arrayName: expression.right.text, index: { kind: "literal", value: -1 }, key, ownOnly: false });
    }
  }
  return notApplicable;
}

export function lowerHasOwnConditionExpression(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrCondition> {
  if (!ts.isCallExpression(expression) || expression.arguments.length !== 2) {
    return notApplicable;
  }
  const callee = expression.expression;
  if (!ts.isPropertyAccessExpression(callee) || !ts.isIdentifier(callee.expression) || callee.expression.text !== "Object" || callee.name.text !== "hasOwn") {
    return notApplicable;
  }
  const [target, keyExpression] = expression.arguments;
  if (!ts.isIdentifier(target)) {
    return notApplicable;
  }
  const binding = bindings.get(target.text);
  if (binding?.kind === "runtimeObject") {
    const key = context.lowerStringRuntimeExpression(context, keyExpression, bindings);
    if (key.kind === "unsupported") {
      return key;
    }
    if (key.kind === "lowered") {
      return produced({ kind: "runtimeObjectHas", objectName: target.text, key: key.operation, ownOnly: true, receiverKind: "object" });
    }
  }
  if (isBoxedAggregateCandidateBinding(binding)) {
    const key = context.lowerStringRuntimeExpression(context, keyExpression, bindings);
    if (key.kind === "unsupported") {
      return key;
    }
    if (key.kind === "lowered") {
      return produced({ kind: "runtimeObjectHas", objectName: target.text, key: key.operation, ownOnly: true, receiverKind: "value" });
    }
  }
  if (binding?.kind === "runtimeArray") {
    return lowerOwnArrayPropertyCondition(context, target.text, keyExpression, bindings);
  }
  return notApplicable;
}

export function lowerObjectMethodSugarConditionExpression(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrCondition> {
  if (!ts.isCallExpression(expression) || expression.arguments.length !== 1 || !ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression)) {
    return notApplicable;
  }
  const receiver = expression.expression.expression.text;
  const method = expression.expression.name.text;
  if (method !== "hasOwnProperty" && method !== "propertyIsEnumerable") {
    return notApplicable;
  }
  const binding = bindings.get(receiver);
  const [keyExpression] = expression.arguments;
  if (binding?.kind === "runtimeObject") {
    const key = lowerPropertyKeyExpression(context, keyExpression, bindings);
    if (key.kind !== "lowered") {
      return key;
    }
    if (method === "hasOwnProperty") {
      return produced({ kind: "runtimeObjectHas", objectName: receiver, key: key.operation, ownOnly: true });
    }
    return produced({ kind: "runtimeObjectPropertyIsEnumerable", objectName: receiver, key: key.operation });
  }
  if (binding?.kind === "runtimeArray") {
    return lowerOwnArrayPropertyCondition(context, receiver, keyExpression, bindings);
  }
  return notApplicable;
}

/**
 * The receiver of a `valueOf`/`toString` call when it is a boxed primitive, or `undefined` when it
 * is not. The binding is read rather than the lowered value so the decision is made once, from the
 * shape the lowering already recorded.
 */
export function lowerBoxedPrimitiveReceiver(
  receiver: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  if (!ts.isIdentifier(receiver)) {
    return undefined;
  }
  const binding = bindings.get(receiver.text);
  if (binding?.kind !== "value" || binding.value.kind !== "boxedPrimitive") {
    return undefined;
  }
  return binding.value;
}

// eslint-disable-next-line complexity -- Array.isArray classification mirrors supported receiver shapes explicitly.
export function lowerArrayIsArrayConditionExpression(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrCondition> {
  if (!ts.isCallExpression(expression) || expression.arguments.length !== 1) {
    return notApplicable;
  }
  const callee = expression.expression;
  if (!ts.isPropertyAccessExpression(callee) || !ts.isIdentifier(callee.expression) || callee.expression.text !== "Array" || callee.name.text !== "isArray") {
    return notApplicable;
  }
  const [arg] = expression.arguments;
  if ((ts.isIdentifier(arg) && arg.text === "undefined") || arg.kind === ts.SyntaxKind.UndefinedKeyword || arg.kind === ts.SyntaxKind.NullKeyword || arg.kind === ts.SyntaxKind.TrueKeyword || arg.kind === ts.SyntaxKind.FalseKeyword || ts.isNumericLiteral(arg) || ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
    return produced({ kind: "runtimeArrayIsArray", value: false });
  }
  if (!ts.isIdentifier(arg)) {
    return lowerLiteralArrayCheck(context, arg, bindings);
  }
  const binding = bindings.get(arg.text);
  if (binding?.kind === "array") {
    return produced({ kind: "runtimeArrayIsArray", value: true });
  }
  if (binding?.kind === "runtimeArray") {
    return produced({ kind: "runtimeArrayIsArray", value: true });
  }
  if (binding?.kind === "runtimeObject") {
    return produced({ kind: "runtimeArrayIsArray", value: false });
  }
  if (isBoxedAggregateCandidateBinding(binding)) {
    const value = context.lowerValueExpression(context, arg, bindings);
    if (value.kind === "unsupported") {
      return value;
    }
    if (value.kind === "lowered") {
      return produced({ kind: "runtimeArrayIsArray", value: value.operation });
    }
  }
  return notApplicable;
}

export function lowerRuntimeArrayEverySomeConditionExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {
  if (!ts.isCallExpression(expression)) {
    return undefined;
  }
  if (expression.arguments.length > 0) {
    return undefined;
  }
  const callee = expression.expression;
  if (!ts.isPropertyAccessExpression(callee)) {
    return undefined;
  }
  let receiver: ts.Expression = callee.expression;
  while (ts.isParenthesizedExpression(receiver)) {
    receiver = receiver.expression;
  }
  receiver = unwrapTypeOnlyExpression(receiver);
  if (!ts.isIdentifier(receiver)) {
    return undefined;
  }
  if (bindings.get(receiver.text)?.kind !== "runtimeArray") {
    return undefined;
  }
  if (callee.name.text === "every") {
    return { kind: "runtimeArrayEvery", arrayName: receiver.text };
  }
  if (callee.name.text === "some") {
    return { kind: "runtimeArraySome", arrayName: receiver.text };
  }
  return undefined;
}

export function lowerObjectIsConditionExpression(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrCondition> {
  if (!ts.isCallExpression(expression) || expression.arguments.length !== 2) {
    return notApplicable;
  }
  const callee = expression.expression;
  if (!ts.isPropertyAccessExpression(callee) || !ts.isIdentifier(callee.expression) || callee.expression.text !== "Object" || callee.name.text !== "is") {
    return notApplicable;
  }
  const [leftArg, rightArg] = expression.arguments;
  let left: ts.Expression = leftArg;
  let right: ts.Expression = rightArg;
  while (ts.isParenthesizedExpression(left)) {
    left = left.expression;
  }
  while (ts.isParenthesizedExpression(right)) {
    right = right.expression;
  }
  left = unwrapTypeOnlyExpression(left);
  right = unwrapTypeOnlyExpression(right);
  const leftValueResult = context.lowerValueExpression(context, left, bindings);
  if (leftValueResult.kind === "unsupported") {
    return leftValueResult;
  }
  const leftValue = loweredPayload(leftValueResult);
  const rightValueResult = context.lowerValueExpression(context, right, bindings);
  if (rightValueResult.kind === "unsupported") {
    return rightValueResult;
  }
  const rightValue = loweredPayload(rightValueResult);
  if (leftValue === undefined || rightValue === undefined) {
    return notApplicable;
  }
  return produced({ kind: "objectIs", left: leftValue, right: rightValue });
}

function lowerOwnArrayPropertyCondition(
  context: LoweringContext,
  arrayName: string,
  keyExpression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrCondition> {
  const indexResult2 = context.lowerNumberExpression(context, keyExpression, bindings);
  if (indexResult2.kind === "unsupported") {
    return indexResult2;
  }
  let index = loweredPayload(indexResult2);
  const stringIndex = lowerCanonicalArrayIndexString(keyExpression);
  if (stringIndex !== undefined) {
    index = { kind: "literal", value: stringIndex };
  }
  if (index !== undefined) {
    return produced({ kind: "runtimeArrayHas", arrayName, index, ownOnly: true });
  }
  const key = lowerPropertyKeyExpression(context, keyExpression, bindings);
  if (key.kind === "unsupported") {
    return key;
  }
  if (key.kind === "lowered") {
    return produced({ kind: "runtimeArrayHas", arrayName, index: { kind: "literal", value: -1 }, key: key.operation, ownOnly: true });
  }
  return notApplicable;
}

function lowerLiteralArrayCheck(
  context: LoweringContext,
  arg: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrCondition> {
  const objectLiteral = classifyObjectLiteral(context, arg, bindings);
  if (objectLiteral.kind === "unsupported") {
    return objectLiteral;
  }
  if (objectLiteral.kind === "lowered") {
    return produced({ kind: "runtimeArrayIsArray", value: false });
  }
  const arrayLiteral = classifyArrayLiteral(context, arg, bindings);
  if (arrayLiteral.kind === "unsupported") {
    return arrayLiteral;
  }
  if (arrayLiteral.kind === "lowered") {
    return produced({ kind: "runtimeArrayIsArray", value: true });
  }
  return notApplicable;
}
