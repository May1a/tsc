import { classifyStorageWrite } from "./storage-plan.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import { type Lowered, loweredPayload, notApplicable, produced, unsupported, unsupportedIn, withRefusal } from "./lowered.js";
import type { JsIrCondition, JsIrNumberExpression, JsIrNumberOperator, JsIrStringExpression, JsIrValueExpression } from "./expressions.js";
import { lowerObjectAccessPath, objectPathExists } from "./builtins/object-producers.js";
import { lowerSymbolIteratorKeyExpression } from "./class-info.js";
import { isUndefinedExpression, lowerCanonicalArrayIndexString } from "./predicates.js";
import { lowerPropertyKeyExpression } from "./string-expressions.js";
import { isBoxedStoreReceiverBinding } from "./number-access.js";
import { lowerStringExpression } from "./string-constants.js";
import { lowerClassPrivateFieldStore, lowerClassPrivateFieldValueStore } from "./class-values.js";
import { lowerClassPropertyAssignment } from "./class-mutations.js";
import { isAssignmentPattern, lowerDestructuringAssignment } from "./destructuring-assignment.js";
import { CLASS_THIS_NAME } from "./class-names.js";
import { expressionSnippet } from "./diagnostics.js";

// eslint-disable-next-line max-statements -- Assignment routing handles scalar, aggregate, nullish, and compound stores together.
export function lowerAssignmentStatement(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!ts.isBinaryExpression(expression)) {
    return notApplicable;
  }

  const logical = logicalAssignmentOperator(expression.operatorToken.kind);
  if (logical !== undefined) {
    return lowerLogicalAssignmentStatement(context, expression, logical, bindings);
  }

  const compound = lowerCompoundAssignmentStatement(context, expression, bindings);
  if (compound.kind !== "notApplicable") {
    return compound;
  }

  if (expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken) {
    return notApplicable;
  }

  if (isAssignmentPattern(expression.left)) {
    return lowerDestructuringAssignmentStatement(context, expression.left, expression.right, bindings);
  }

  if (ts.isElementAccessExpression(expression.left)) {
    return lowerElementAssignment(context, expression.left, expression.right, bindings);
  }

  if (ts.isPropertyAccessExpression(expression.left)) {
    return lowerObjectPropertyAssignment(context, expression.left, expression.right, bindings);
  }

  if (!ts.isIdentifier(expression.left)) {
    return notApplicable;
  }
  return lowerIdentifierAssignment(context, expression.left, expression.right, bindings);
}

/**
 * A string, or a value the storage plan counted as one by its declared type. The plan boxes a binding
 * for any other write, so the conversion never changes what is stored.
 */
function lowerDeclaredString(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrStringExpression> {
  const direct = context.lowerStringRuntimeExpression(context, expression, bindings);
  if (direct.kind !== "notApplicable" || classifyStorageWrite(expression, context.typeChecker) !== "string") {
    return direct;
  }
  const value = context.lowerValueExpression(context, expression, bindings);
  return value.kind === "lowered" ? produced({ kind: "stringConversion", value: value.operation }) : value;
}

/** A number, or a value the storage plan counted as one by its declared type. */
function lowerDeclaredNumber(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrNumberExpression> {
  const direct = context.lowerNumberExpression(context, expression, bindings);
  if (direct.kind !== "notApplicable" || classifyStorageWrite(expression, context.typeChecker) !== "number") {
    return direct;
  }
  const value = context.lowerValueExpression(context, expression, bindings);
  return value.kind === "lowered" ? produced({ kind: "valueToNumber", value: value.operation }) : value;
}

/** `name = value`, in the representation the binding's storage holds. */
function lowerIdentifierAssignment(
  context: LoweringContext,
  left: ts.Identifier,
  right: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const binding = bindings.get(left.text);
  if (binding?.kind === "stringVariable") {
    const value = lowerDeclaredString(context, right, bindings);
    if (value.kind !== "lowered") {
      return withRefusal(value, unsupportedIn(`Assigning a non-string value to \`${left.text}\`, which holds a string, is not supported: a binding keeps the representation of its initializer`));
    }

    return produced({ kind: "assignString", name: left.text, value: value.operation });
  }

  if (binding?.kind === "booleanVariable") {
    const value = context.lowerConditionExpression(context, right, bindings);
    if (value.kind !== "lowered") {
      return withRefusal(value, unsupportedIn(`Assigning a non-boolean value to \`${left.text}\`, which holds a boolean, is not supported: a binding keeps the representation of its initializer`));
    }

    return produced({ kind: "assignBoolean", name: left.text, value: value.operation });
  }

  if (binding?.kind === "valueVariable") {
    return lowerBoxedAssignment(context, left.text, right, bindings);
  }

  if (binding === undefined) {
    return unsupported(`Assignment to \`${left.text}\`, which has no declared binding, is not supported`);
  }

  if (binding.kind !== "number" || binding.value.kind !== "variable") {
    return unsupported(`Cannot assign to \`${left.text}\` because it does not hold a mutable number`);
  }

  const value = lowerDeclaredNumber(context, right, bindings);
  if (value.kind !== "lowered") {
    return withRefusal(value, unsupportedIn(`Assigning ${assignedValueDescription(right)} to \`${left.text}\`, which holds a number, is not supported: a binding keeps the representation of its initializer`));
  }

  return produced({ kind: "assignNumber", name: left.text, value: value.operation });
}

/**
 * How the right-hand side of a mismatched number assignment reads in the refusal.
 *
 * The common cases name their literal; anything else is described by the limitation rather than
 * quoted, so a long expression does not become the message.
 */
function assignedValueDescription(right: ts.Expression): string {
  if (right.kind === ts.SyntaxKind.NullKeyword) {
    return "`null`";
  }
  if (isUndefinedExpression(right)) {
    return "`undefined`";
  }
  return "a non-number value";
}

function lowerCompoundAssignmentStatement(
  context: LoweringContext,
  expression: ts.BinaryExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const operator = lowerCompoundAssignmentOperator(expression.operatorToken.kind);
  if (operator === undefined) {
    return notApplicable;
  }
  if (ts.isPropertyAccessExpression(expression.left) && ts.isPrivateIdentifier(expression.left.name)) {
    return lowerPrivateFieldCompoundAssignment(context, expression.left, expression.right, operator, bindings);
  }
  if (ts.isPropertyAccessExpression(expression.left) && isReevaluableReceiver(expression.left.expression)) {
    return lowerPropertyCompoundAssignment(context, expression.left, expression.right, operator, bindings);
  }
  if (!ts.isIdentifier(expression.left)) {
    return notApplicable;
  }
  const binding = bindings.get(expression.left.text);
  if (binding?.kind === "stringVariable") {
    if (expression.operatorToken.kind !== ts.SyntaxKind.PlusEqualsToken) {
      return unsupported(`Compound assignment to \`${expression.left.text}\` is only supported for mutable number bindings and \`+=\` on strings`);
    }
    const right = lowerStringCompoundOperand(context, expression.right, bindings);
    if (right.kind !== "lowered") {
      return right;
    }
    return produced({
      kind: "assignString",
      name: expression.left.text,
      value: { kind: "concat", left: { kind: "variable", name: expression.left.text }, right: right.operation }
    });
  }
  if (binding?.kind === "valueVariable") {
    return lowerBoxedCompoundAssignment(context, expression.left.text, expression.right, operator, bindings);
  }
  if (binding?.kind !== "number" || binding.value.kind !== "variable") {
    return unsupported(`Compound assignment to \`${expression.left.text}\` is only supported for mutable number bindings`);
  }
  const right = lowerCoercedCompoundNumberRight(context, expression.right, bindings);
  if (right.kind !== "lowered") {
    return right;
  }
  return produced({
    kind: "assignNumber",
    name: expression.left.text,
    value: { kind: "binary", operator, left: { kind: "variable", name: expression.left.text }, right: right.operation }
  });
}

function lowerCoercedCompoundNumberRight(
  context: LoweringContext,
  rightExpression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrNumberExpression> {
  const numeric = context.lowerNumberExpression(context, rightExpression, bindings);
  if (numeric.kind !== "notApplicable") {
    return numeric;
  }
  const value = context.lowerValueExpression(context, rightExpression, bindings);
  return value.kind === "lowered" ? produced({ kind: "valueToNumber", value: value.operation }) : value;
}

function lowerStringCompoundOperand(
  context: LoweringContext,
  right: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrStringExpression> {
  const stringRight = context.lowerStringRuntimeExpression(context, right, bindings);
  if (stringRight.kind !== "notApplicable") {
    return stringRight;
  }
  const valueRight = context.lowerValueExpression(context, right, bindings);
  return valueRight.kind === "lowered" ? produced({ kind: "stringConversion", value: valueRight.operation }) : valueRight;
}

function lowerPropertyCompoundAssignment(
  context: LoweringContext,
  left: ts.PropertyAccessExpression,
  rightExpression: ts.Expression,
  operator: JsIrNumberOperator,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const current = context.lowerValueExpression(context, left, bindings);
  if (current.kind !== "lowered") {
    return current;
  }
  let combined: JsIrValueExpression;
  if (operator === "add") {
    const right = context.lowerValueExpression(context, rightExpression, bindings);
    if (right.kind !== "lowered") {
      return right;
    }
    combined = { kind: "valuePlus", left: current.operation, right: right.operation };
  } else {
    const right = lowerCoercedCompoundNumberRight(context, rightExpression, bindings);
    if (right.kind !== "lowered") {
      return right;
    }
    combined = { kind: "number", value: { kind: "binary", operator, left: { kind: "valueToNumber", value: current.operation }, right: right.operation } };
  }
  return lowerPropertyValueStore(left, combined, bindings);
}

/** Store a pre-lowered value into a re-evaluable property target (`obj.prop` or `this.prop`). */
export function lowerPropertyValueStore(
  left: ts.PropertyAccessExpression,
  value: JsIrValueExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (left.expression.kind === ts.SyntaxKind.ThisKeyword && bindings.get(CLASS_THIS_NAME)?.kind === "valueVariable") {
    return produced({ kind: "valueObjectStore", targetName: CLASS_THIS_NAME, key: { kind: "literal", value: left.name.text }, value });
  }
  if (!ts.isIdentifier(left.expression)) {
    return notApplicable;
  }
  const binding = bindings.get(left.expression.text);
  if (binding?.kind === "runtimeObject") {
    return produced({ kind: "runtimeObjectStore", objectName: left.expression.text, key: { kind: "literal", value: left.name.text }, value });
  }
  if (isBoxedStoreReceiverBinding(binding)) {
    return produced({ kind: "valueObjectStore", targetName: left.expression.text, key: { kind: "literal", value: left.name.text }, value });
  }
  return notApplicable;
}

function lowerPrivateFieldCompoundAssignment(
  context: LoweringContext,
  left: ts.PropertyAccessExpression,
  rightExpression: ts.Expression,
  operator: JsIrNumberOperator,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const current = context.lowerValueExpression(context, left, bindings);
  if (current.kind !== "lowered") {
    return current;
  }
  let combined: JsIrValueExpression;
  if (operator === "add") {
    const right = context.lowerValueExpression(context, rightExpression, bindings);
    if (right.kind !== "lowered") {
      return right;
    }
    combined = { kind: "valuePlus", left: current.operation, right: right.operation };
  } else {
    const right = context.lowerNumberExpression(context, rightExpression, bindings);
    if (right.kind !== "lowered") {
      return right;
    }
    combined = { kind: "number", value: { kind: "binary", operator, left: { kind: "valueToNumber", value: current.operation }, right: right.operation } };
  }
  return lowerClassPrivateFieldValueStore(context, left, combined, bindings);
}

/** An assignment to a boxed binding, which holds whatever value it is given. */
function lowerBoxedAssignment(
  context: LoweringContext,
  name: string,
  right: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const value = context.lowerValueExpression(context, right, bindings);
  if (value.kind !== "lowered") {
    return withRefusal(value, unsupportedIn(`The value assigned to \`${name}\` is not an expression this build can evaluate`));
  }
  return produced({ kind: "assignValue", name, value: value.operation });
}

/**
 * A compound assignment to a boxed binding, which may hold any value.
 *
 * `+=` keeps JavaScript's `+`, which concatenates when either side is a string. Every other operator
 * converts the current value to a number first, as the operator does in JavaScript.
 */
function lowerBoxedCompoundAssignment(
  context: LoweringContext,
  name: string,
  rightExpression: ts.Expression,
  operator: JsIrNumberOperator,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const current: JsIrValueExpression = { kind: "variable", name };
  if (operator === "add") {
    const right = context.lowerValueExpression(context, rightExpression, bindings);
    if (right.kind !== "lowered") {
      return withRefusal(right, unsupportedIn(`The value added to \`${name}\` is not an expression this build can evaluate`));
    }
    return produced({ kind: "assignValue", name, value: { kind: "valuePlus", left: current, right: right.operation } });
  }
  const right = lowerCoercedCompoundNumberRight(context, rightExpression, bindings);
  if (right.kind !== "lowered") {
    return withRefusal(right, unsupportedIn(`The right-hand side of a compound assignment to \`${name}\` must be a number this build can evaluate`));
  }
  return produced({
    kind: "assignValue",
    name,
    value: { kind: "number", value: { kind: "binary", operator, left: { kind: "valueToNumber", value: current }, right: right.operation } }
  });
}

function lowerCompoundAssignmentOperator(kind: ts.SyntaxKind): JsIrNumberOperator | undefined {
  switch (kind) {
    case ts.SyntaxKind.PlusEqualsToken: { return "add"; }
    case ts.SyntaxKind.MinusEqualsToken: { return "subtract"; }
    case ts.SyntaxKind.AsteriskEqualsToken: { return "multiply"; }
    case ts.SyntaxKind.SlashEqualsToken: { return "divide"; }
    case ts.SyntaxKind.PercentEqualsToken: { return "remainder"; }
    case ts.SyntaxKind.AmpersandEqualsToken: { return "bitAnd"; }
    case ts.SyntaxKind.BarEqualsToken: { return "bitOr"; }
    case ts.SyntaxKind.CaretEqualsToken: { return "bitXor"; }
    case ts.SyntaxKind.LessThanLessThanEqualsToken: { return "shiftLeft"; }
    case ts.SyntaxKind.GreaterThanGreaterThanEqualsToken: { return "shiftRight"; }
    case ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken: { return "shiftRightUnsigned"; }
    case ts.SyntaxKind.AsteriskAsteriskEqualsToken: { return "power"; }
    default: { return undefined; }
  }
}

/** A logical assignment operator, with when it stores as a test of the value its target held. */
interface LogicalAssignmentOperator {
  readonly text: "&&=" | "||=" | "??=";
  assigns(current: JsIrValueExpression): JsIrCondition;
}

function logicalAssignmentOperator(kind: ts.SyntaxKind): LogicalAssignmentOperator | undefined {
  switch (kind) {
    case ts.SyntaxKind.AmpersandAmpersandEqualsToken: {
      return { text: "&&=", assigns: (current) => ({ kind: "valueTruthy", value: current }) };
    }
    case ts.SyntaxKind.BarBarEqualsToken: {
      return { text: "||=", assigns: (current) => ({ kind: "negate", condition: { kind: "valueTruthy", value: current } }) };
    }
    case ts.SyntaxKind.QuestionQuestionEqualsToken: {
      return { text: "??=", assigns: (current) => ({ kind: "valueLooseComparison", operator: "==", left: current, right: { kind: "null" } }) };
    }
    default: { return undefined; }
  }
}

/**
 * `target &&= value`, `target ||= value`, or `target ??= value`: read the target once, and evaluate and
 * store the value only when the operator's test holds for what was read.
 *
 * The read and the store are lowered as two expressions, so each evaluates the target's reference. That
 * is only the single evaluation JavaScript performs when re-evaluating the reference has no effect: a
 * binding, or a property of a binding or `this` under a literal or binding key. Any other member target
 * would run its object or key expression twice, so it is refused.
 */
function lowerLogicalAssignmentStatement(
  context: LoweringContext,
  expression: ts.BinaryExpression,
  operator: LogicalAssignmentOperator,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const target = expression.left;
  if (!ts.isIdentifier(target) && !isReevaluableMemberTarget(target)) {
    return unsupported(`\`${operator.text}\` is supported on a binding, or on a property of a binding or \`this\` with a literal or binding key; \`${expressionSnippet(target)}\` would evaluate its object or key twice`);
  }
  const current = context.lowerValueExpression(context, target, bindings);
  if (current.kind !== "lowered") {
    return withRefusal(current, unsupported(`The target of \`${operator.text}\` is not a value this build can read: \`${expressionSnippet(target)}\``));
  }
  const store = lowerLogicalAssignmentStore(context, target, expression.right, bindings);
  if (store.kind !== "lowered") {
    return withRefusal(store, unsupported(`The target of \`${operator.text}\` is not one this build can assign: \`${expressionSnippet(target)}\``));
  }
  return produced({ kind: "if", condition: operator.assigns(current.operation), thenOperations: [store.operation], elseOperations: [] });
}

function lowerLogicalAssignmentStore(
  context: LoweringContext,
  target: ts.Identifier | ts.PropertyAccessExpression | ts.ElementAccessExpression,
  value: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (ts.isIdentifier(target)) {
    return lowerIdentifierAssignment(context, target, value, bindings);
  }
  if (ts.isElementAccessExpression(target)) {
    return lowerElementAssignment(context, target, value, bindings);
  }
  return lowerObjectPropertyAssignment(context, target, value, bindings);
}

/** A member target whose object and key evaluate to the same reference however often they are evaluated. */
function isReevaluableMemberTarget(
  target: ts.Expression
): target is ts.PropertyAccessExpression | ts.ElementAccessExpression {
  if (ts.isPropertyAccessExpression(target)) {
    return target.questionDotToken === undefined && isReevaluableReceiver(target.expression);
  }
  if (ts.isElementAccessExpression(target)) {
    const key = target.argumentExpression;
    return target.questionDotToken === undefined && isReevaluableReceiver(target.expression) &&
      (ts.isIdentifier(key) || ts.isStringLiteralLike(key) || ts.isNumericLiteral(key));
  }
  return false;
}

function isReevaluableReceiver(expression: ts.Expression): boolean {
  if (ts.isIdentifier(expression) || expression.kind === ts.SyntaxKind.ThisKeyword) {
    return true;
  }
  return ts.isPropertyAccessExpression(expression) &&
    expression.questionDotToken === undefined &&
    isReevaluableReceiver(expression.expression);
}

// eslint-disable-next-line complexity, max-statements -- Element assignment handles fixed, runtime, and boxed aggregate targets.
function lowerElementAssignment(
  context: LoweringContext,
  left: ts.ElementAccessExpression,
  right: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const objectAccess = lowerObjectAccessPath(left, bindings);
  if (objectAccess !== undefined) {
    const objectValue = context.lowerNumberExpression(context, right, bindings);
    if (objectValue.kind !== "lowered") {
      return objectValue;
    }
    return produced({ kind: "objectStore", objectName: objectAccess.objectName, path: objectAccess.path, value: objectValue.operation });
  }

  if (!ts.isIdentifier(left.expression) || !bindings.has(left.expression.text)) {
    const receiver = context.lowerValueExpression(context, left.expression, bindings);
    if (receiver.kind === "unsupported") {
      return receiver;
    }
    const runtimeValue = context.lowerValueExpression(context, right, bindings);
    if (runtimeValue.kind === "unsupported") {
      return runtimeValue;
    }
    if (receiver.kind !== "lowered" || runtimeValue.kind !== "lowered") {
      return notApplicable;
    }
    const recvName = `__tscn_assign_recv_${context.nextSyntheticTempId++}`;
    const indexResult = context.lowerNumberExpression(context, left.argumentExpression, bindings);
    if (indexResult.kind === "unsupported") {
      return indexResult;
    }
    if (indexResult.kind === "lowered") {
      return produced({
        kind: "block",
        operations: [
          { kind: "letValue", name: recvName, value: receiver.operation },
          { kind: "valueArrayStore", targetName: recvName, index: indexResult.operation, value: runtimeValue.operation }
        ]
      });
    }
    const keyResult = lowerPropertyKeyExpression(context, left.argumentExpression, bindings);
    if (keyResult.kind === "unsupported") {
      return keyResult;
    }
    if (keyResult.kind !== "lowered") {
      return notApplicable;
    }
    return produced({
      kind: "block",
      operations: [
        { kind: "letValue", name: recvName, value: receiver.operation },
        { kind: "valueObjectStore", targetName: recvName, key: keyResult.operation, value: runtimeValue.operation }
      ]
    });
  }

  const arrayBinding = bindings.get(left.expression.text);
  if (
    (arrayBinding?.kind === "runtimeMap" || arrayBinding?.kind === "runtimeSet") &&
    lowerSymbolIteratorKeyExpression(left.argumentExpression, bindings) !== undefined
  ) {
    const iteratorMethod = context.lowerValueExpression(context, right, bindings);
    if (iteratorMethod.kind === "unsupported") {
      return iteratorMethod;
    }
    if (iteratorMethod.kind === "lowered") {
      return produced({ kind: "runtimeCollectionSetIterator", collectionName: arrayBinding.name, value: iteratorMethod.operation });
    }
  }
  const indexResult = context.lowerNumberExpression(context, left.argumentExpression, bindings);
  if (indexResult.kind === "unsupported") {
    return indexResult;
  }
  let index = loweredPayload(indexResult);
  if (arrayBinding?.kind === "runtimeArray" && index === undefined) {
    const stringIndex = lowerCanonicalArrayIndexString(left.argumentExpression);
    if (stringIndex !== undefined) {
      index = { kind: "literal", value: stringIndex };
    }
  }
  const valueResult = context.lowerNumberExpression(context, right, bindings);
  if (valueResult.kind === "unsupported") {
    return valueResult;
  }
  const value = loweredPayload(valueResult);
  if (arrayBinding?.kind === "array" && index !== undefined && value !== undefined) {
    return produced({ kind: "arrayStore", arrayName: left.expression.text, index, value });
  }

  const objectStore = lowerObjectElementAssignment(context, left, right, arrayBinding, bindings);
  if (objectStore.kind !== "notApplicable") {
    return objectStore;
  }

  const runtimeValueResult = context.lowerValueExpression(context, right, bindings);
  if (runtimeValueResult.kind === "unsupported") {
    return runtimeValueResult;
  }
  const runtimeValue = loweredPayload(runtimeValueResult);
  if (arrayBinding?.kind === "runtimeArray" && index !== undefined && runtimeValue !== undefined) {
    return produced({ kind: "runtimeArrayStore", arrayName: left.expression.text, index, value: runtimeValue });
  }
  if (arrayBinding?.kind === "runtimeArray" && runtimeValue !== undefined) {
    const key = lowerPropertyKeyExpression(context, left.argumentExpression, bindings);
    if (key.kind === "unsupported") {
      return key;
    }
    if (key.kind === "lowered") {
      return produced({ kind: "runtimeArrayNamedStore", arrayName: left.expression.text, key: key.operation, value: runtimeValue });
    }
  }
  if (isBoxedStoreReceiverBinding(arrayBinding) && runtimeValue !== undefined) {
    if (index !== undefined) {
      return produced({ kind: "valueArrayStore", targetName: left.expression.text, index, value: runtimeValue });
    }
    const key = lowerPropertyKeyExpression(context, left.argumentExpression, bindings);
    if (key.kind === "unsupported") {
      return key;
    }
    if (key.kind === "lowered") {
      return produced({ kind: "valueObjectStore", targetName: left.expression.text, key: key.operation, value: runtimeValue });
    }
  }

  return notApplicable;
}

function lowerObjectElementAssignment(
  context: LoweringContext,
  left: ts.ElementAccessExpression,
  right: ts.Expression,
  binding: JsIrBindingValue | undefined,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!ts.isIdentifier(left.expression)) {
    return notApplicable;
  }

  if (binding?.kind === "object") {
    const key = lowerStringExpression(left.argumentExpression, bindings);
    const objectValueResult = context.lowerNumberExpression(context, right, bindings);
    if (objectValueResult.kind === "unsupported") {
      return objectValueResult;
    }
    const objectValue = loweredPayload(objectValueResult);
    if (key !== undefined && objectValue !== undefined && objectPathExists(binding.value, [key])) {
      return produced({ kind: "objectStore", objectName: left.expression.text, path: [key], value: objectValue });
    }
    return notApplicable;
  }

  if (binding?.kind !== "runtimeObject") {
    return notApplicable;
  }

  const keyResult = lowerPropertyKeyExpression(context, left.argumentExpression, bindings);
  if (keyResult.kind === "unsupported") {
    return keyResult;
  }
  const key = loweredPayload(keyResult);
  const runtimeValueResult2 = context.lowerValueExpression(context, right, bindings);
  if (runtimeValueResult2.kind === "unsupported") {
    return runtimeValueResult2;
  }
  const runtimeValue = loweredPayload(runtimeValueResult2);
  if (key === undefined || runtimeValue === undefined) {
    return notApplicable;
  }
  return produced({ kind: "runtimeObjectStore", objectName: left.expression.text, key, value: runtimeValue });
}

// eslint-disable-next-line complexity, max-statements -- Property-assignment routing dispatches class, runtime, boxed, and fixed targets in one place.
function lowerObjectPropertyAssignment(
  context: LoweringContext,
  left: ts.PropertyAccessExpression,
  right: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const privateStore = lowerClassPrivateFieldStore(context, left, right, bindings);
  if (privateStore.kind !== "notApplicable") {
    return privateStore;
  }

  const thisStore = lowerThisPropertyAssignment(context, left, right, bindings);
  if (thisStore.kind !== "notApplicable") {
    return thisStore;
  }

  const classAssignment = lowerClassPropertyAssignment(context, left, right, bindings);
  if (classAssignment.kind !== "notApplicable") {
    return classAssignment;
  }

  if (ts.isIdentifier(left.expression)) {
    const binding = bindings.get(left.expression.text);
    if (binding?.kind === "runtimeArray" && left.name.text === "length") {
      const length = context.lowerNumberExpression(context, right, bindings);
      if (length.kind === "unsupported") {
        return length;
      }
      if (length.kind === "lowered") {
        return produced({ kind: "runtimeArraySetLength", arrayName: left.expression.text, length: length.operation });
      }
    }
    if (isBoxedStoreReceiverBinding(binding) && left.name.text === "length") {
      const length = context.lowerNumberExpression(context, right, bindings);
      if (length.kind === "unsupported") {
        return length;
      }
      if (length.kind === "lowered") {
        return produced({ kind: "valueArraySetLength", targetName: left.expression.text, length: length.operation });
      }
    }
    if (binding?.kind === "runtimeObject") {
      const value = context.lowerValueExpression(context, right, bindings);
      if (value.kind === "unsupported") {
        return value;
      }
      if (value.kind === "lowered") {
        return produced({ kind: "runtimeObjectStore", objectName: left.expression.text, key: { kind: "literal", value: left.name.text }, value: value.operation });
      }
    }
    if (isBoxedStoreReceiverBinding(binding)) {
      const value = context.lowerValueExpression(context, right, bindings);
      if (value.kind === "unsupported") {
        return value;
      }
      if (value.kind === "lowered") {
        return produced({ kind: "valueObjectStore", targetName: left.expression.text, key: { kind: "literal", value: left.name.text }, value: value.operation });
      }
    }
  }

  const access = lowerObjectAccessPath(left, bindings);
  if (access !== undefined) {
    const valueResult2 = context.lowerNumberExpression(context, right, bindings);
    if (valueResult2.kind === "unsupported") {
      return valueResult2;
    }
    const value = loweredPayload(valueResult2);
    if (value !== undefined) {
      return produced({ kind: "objectStore", objectName: access.objectName, path: access.path, value });
    }
  }

  if (left.expression.kind !== ts.SyntaxKind.ThisKeyword) {
    const receiver = context.lowerValueExpression(context, left.expression, bindings);
    if (receiver.kind === "unsupported") {
      return receiver;
    }
    if (receiver.kind === "lowered") {
      const recvName = `__tscn_assign_recv_${context.nextSyntheticTempId++}`;
      if (left.name.text === "length") {
        const length = context.lowerNumberExpression(context, right, bindings);
        if (length.kind === "unsupported") {
          return length;
        }
        if (length.kind === "lowered") {
          return produced({
            kind: "block",
            operations: [
              { kind: "letValue", name: recvName, value: receiver.operation },
              { kind: "valueArraySetLength", targetName: recvName, length: length.operation }
            ]
          });
        }
      }
      const value = context.lowerValueExpression(context, right, bindings);
      if (value.kind === "unsupported") {
        return value;
      }
      if (value.kind === "lowered") {
        return produced({
          kind: "block",
          operations: [
            { kind: "letValue", name: recvName, value: receiver.operation },
            { kind: "valueObjectStore", targetName: recvName, key: { kind: "literal", value: left.name.text }, value: value.operation }
          ]
        });
      }
    }
  }

  return notApplicable;
}

function lowerThisPropertyAssignment(
  context: LoweringContext,
  left: ts.PropertyAccessExpression,
  right: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  // Object-literal methods and class methods both bind `this` as a valueVariable.
  if (left.expression.kind !== ts.SyntaxKind.ThisKeyword || bindings.get(CLASS_THIS_NAME)?.kind !== "valueVariable") {
    return notApplicable;
  }
  const value = context.lowerValueExpression(context, right, bindings);
  if (value.kind !== "lowered") {
    if (value.kind === "unsupported") {
      return value;
    }
    if (context.classThisInScope) {
      return unsupportedIn(`The value written to \`this.${left.name.text}\` is not an expression this build can evaluate`);
    }
    return notApplicable;
  }
  return produced({
    kind: "valueObjectStore",
    targetName: CLASS_THIS_NAME,
    key: { kind: "literal", value: left.name.text },
    value: value.operation
  });
}

/** `[a, b] = source` or `({ a } = source)` as a statement: the source, then each target in order. */
function lowerDestructuringAssignmentStatement(
  context: LoweringContext,
  pattern: ts.ArrayLiteralExpression | ts.ObjectLiteralExpression,
  right: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const source = context.lowerValueExpression(context, right, bindings);
  if (source.kind !== "lowered") {
    return withRefusal(source, unsupportedIn("The source of a destructuring assignment must be an expression this build can evaluate"));
  }
  const operations = lowerDestructuringAssignment(context, pattern, source.operation, bindings);
  return operations.kind === "lowered" ? produced({ kind: "bindingGroup", operations: [...operations.operation] }) : operations;
}
