import ts from "typescript";
import type { JsIrBindingValue, JsIrCallArgument } from "./bindings.js";
import type {
  JsIrCondition,
  JsIrNumberOperator,
  JsIrRuntimeObjectField,
  JsIrStringExpression,
  JsIrValueComparisonOperator,
  JsIrValueExpression
} from "./expressions.js";
import { type Produced, produced, unsupportedIn, withRefusal } from "./lowered.js";
import { unwrapTypeOnlyExpression } from "./predicates.js";
import { SM_STATE_SLOT, type StateMachineExpressionHost } from "./state-machine-core.js";
import { lowerDelegatingYield } from "./state-machine-yield.js";

/** Whether `node` contains a `yield` or `await` in the current function (not inside nested functions/classes). */
export function containsSuspension(node: ts.Node): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (found) {
      return;
    }
    if (ts.isYieldExpression(child) || ts.isAwaitExpression(child)) {
      found = true;
      return;
    }
    if (child !== node && (ts.isFunctionLike(child) || ts.isClassLike(child))) {
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

const numberBinaryOperators: ReadonlyMap<ts.SyntaxKind, JsIrNumberOperator> = new Map([
  [ts.SyntaxKind.MinusToken, "subtract"],
  [ts.SyntaxKind.AsteriskToken, "multiply"],
  [ts.SyntaxKind.SlashToken, "divide"],
  [ts.SyntaxKind.PercentToken, "remainder"],
  [ts.SyntaxKind.AsteriskAsteriskToken, "power"],
  [ts.SyntaxKind.AmpersandToken, "bitAnd"],
  [ts.SyntaxKind.BarToken, "bitOr"],
  [ts.SyntaxKind.CaretToken, "bitXor"],
  [ts.SyntaxKind.LessThanLessThanToken, "shiftLeft"],
  [ts.SyntaxKind.GreaterThanGreaterThanToken, "shiftRight"],
  [ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken, "shiftRightUnsigned"]
]);

const relationalOperators: ReadonlyMap<ts.SyntaxKind, JsIrValueComparisonOperator> = new Map([
  [ts.SyntaxKind.LessThanToken, "<"],
  [ts.SyntaxKind.LessThanEqualsToken, "<="],
  [ts.SyntaxKind.GreaterThanToken, ">"],
  [ts.SyntaxKind.GreaterThanEqualsToken, ">="]
]);

const compoundOperators: ReadonlyMap<ts.SyntaxKind, ts.SyntaxKind> = new Map([
  [ts.SyntaxKind.PlusEqualsToken, ts.SyntaxKind.PlusToken],
  [ts.SyntaxKind.MinusEqualsToken, ts.SyntaxKind.MinusToken],
  [ts.SyntaxKind.AsteriskEqualsToken, ts.SyntaxKind.AsteriskToken],
  [ts.SyntaxKind.SlashEqualsToken, ts.SyntaxKind.SlashToken],
  [ts.SyntaxKind.PercentEqualsToken, ts.SyntaxKind.PercentToken],
  [ts.SyntaxKind.AsteriskAsteriskEqualsToken, ts.SyntaxKind.AsteriskAsteriskToken]
]);

/** Lowers an expression inside a suspendable function, splitting into states at `yield` / `await`. */
export function lowerStateMachineExpression(
  host: StateMachineExpressionHost,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrValueExpression> {
  const unwrapped = unwrapTypeOnlyExpression(expression);
  if (!containsSuspension(unwrapped)) {
    const lowered = host.context.lowerValueExpression(host.context, unwrapped, bindings);
    if (lowered.kind !== "lowered") {
      return withRefusal(lowered, unsupportedIn("This expression inside a generator or async function cannot be evaluated"));
    }
    return lowered;
  }
  if (ts.isAwaitExpression(unwrapped)) {
    return lowerAwaitExpression(host, unwrapped, bindings);
  }
  if (ts.isYieldExpression(unwrapped)) {
    return lowerYieldExpression(host, unwrapped, bindings);
  }
  if (ts.isBinaryExpression(unwrapped)) {
    return lowerSuspendingBinary(host, unwrapped, bindings);
  }
  if (ts.isConditionalExpression(unwrapped)) {
    return lowerSuspendingConditional(host, unwrapped, bindings);
  }
  return lowerSuspendingCompoundExpression(host, unwrapped, bindings);
}

function lowerSuspendingCompoundExpression(
  host: StateMachineExpressionHost,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrValueExpression> {
  if (ts.isPrefixUnaryExpression(expression) || ts.isTypeOfExpression(expression) || ts.isVoidExpression(expression)) {
    return lowerSuspendingUnary(host, expression, bindings);
  }
  if (ts.isCallExpression(expression)) {
    return lowerSuspendingCall(host, expression, bindings);
  }
  if (ts.isArrayLiteralExpression(expression)) {
    return lowerSuspendingArray(host, expression, bindings);
  }
  if (ts.isObjectLiteralExpression(expression)) {
    return lowerSuspendingObject(host, expression, bindings);
  }
  if (ts.isTemplateExpression(expression)) {
    return lowerSuspendingTemplate(host, expression, bindings);
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return lowerSuspendingPropertyAccess(host, expression, bindings);
  }
  if (ts.isElementAccessExpression(expression)) {
    return lowerSuspendingElementAccess(host, expression, bindings);
  }
  if (ts.isNewExpression(expression)) {
    return lowerSuspendingNew(host, expression, bindings);
  }
  return unsupportedIn("This expression containing `yield` or `await` is not supported yet");
}

function spillToTemp(host: StateMachineExpressionHost, value: JsIrValueExpression): JsIrValueExpression {
  const slot = host.allocateTemp("expr");
  host.emit({ kind: "assignValue", name: slot, value });
  return { kind: "variable", name: slot };
}

function lowerAwaitExpression(
  host: StateMachineExpressionHost,
  expression: ts.AwaitExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrValueExpression> {
  const operand = lowerStateMachineExpression(host, expression.expression, bindings);
  if (operand.kind !== "lowered") {
    return operand;
  }
  const resultSlot = host.allocateTemp("await");
  host.emitSuspend(operand.operation, resultSlot);
  return produced({ kind: "variable", name: resultSlot });
}

function lowerYieldExpression(
  host: StateMachineExpressionHost,
  expression: ts.YieldExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrValueExpression> {
  if (expression.asteriskToken !== undefined) {
    return lowerDelegatingYield(host, expression, bindings, lowerStateMachineExpression);
  }
  let yielded: JsIrValueExpression = { kind: "undefined" };
  if (expression.expression !== undefined) {
    const operand = lowerStateMachineExpression(host, expression.expression, bindings);
    if (operand.kind !== "lowered") {
      return operand;
    }
    yielded = operand.operation;
  }
  const resultSlot = host.allocateTemp("yield");
  host.emitSuspend(yielded, resultSlot);
  return produced({ kind: "variable", name: resultSlot });
}

function lowerSuspendingBinary(
  host: StateMachineExpressionHost,
  expression: ts.BinaryExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrValueExpression> {
  const op = expression.operatorToken.kind;
  if (op === ts.SyntaxKind.CommaToken) {
    const left = lowerStateMachineExpression(host, expression.left, bindings);
    if (left.kind !== "lowered") {
      return left;
    }
    host.emit({ kind: "discardValue", value: left.operation });
    return lowerStateMachineExpression(host, expression.right, bindings);
  }
  if (op === ts.SyntaxKind.AmpersandAmpersandToken || op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
    return lowerSuspendingLogical(host, expression, op, bindings);
  }
  if (op === ts.SyntaxKind.EqualsToken) {
    const right = lowerStateMachineExpression(host, expression.right, bindings);
    if (right.kind !== "lowered") {
      return right;
    }
    const saved = spillToTemp(host, right.operation);
    const assigned = host.emitAssignToTarget(expression.left, saved, bindings);
    if (assigned.kind !== "lowered") {
      return assigned;
    }
    return produced(saved);
  }
  const baseOp = compoundOperators.get(op);
  if (baseOp !== undefined) {
    return lowerSuspendingCompoundAssign(host, expression.left, baseOp, expression.right, bindings);
  }
  const left = lowerStateMachineExpression(host, expression.left, bindings);
  if (left.kind !== "lowered") {
    return left;
  }
  const leftVal = containsSuspension(expression.right) ? spillToTemp(host, left.operation) : left.operation;
  const right = lowerStateMachineExpression(host, expression.right, bindings);
  if (right.kind !== "lowered") {
    return right;
  }
  return combineBinaryValue(op, leftVal, right.operation);
}

function lowerSuspendingCompoundAssign(
  host: StateMachineExpressionHost,
  leftNode: ts.Expression,
  baseOp: ts.SyntaxKind,
  rightNode: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrValueExpression> {
  const current = lowerStateMachineExpression(host, leftNode, bindings);
  if (current.kind !== "lowered") {
    return current;
  }
  const savedLeft = spillToTemp(host, current.operation);
  const right = lowerStateMachineExpression(host, rightNode, bindings);
  if (right.kind !== "lowered") {
    return right;
  }
  const combined = combineBinaryValue(baseOp, savedLeft, right.operation);
  if (combined.kind !== "lowered") {
    return combined;
  }
  const saved = spillToTemp(host, combined.operation);
  const assigned = host.emitAssignToTarget(leftNode, saved, bindings);
  if (assigned.kind !== "lowered") {
    return assigned;
  }
  return produced(saved);
}

function combineBinaryValue(op: ts.SyntaxKind, left: JsIrValueExpression, right: JsIrValueExpression): Produced<JsIrValueExpression> {
  if (op === ts.SyntaxKind.PlusToken) {
    return produced({ kind: "valuePlus", left, right });
  }
  if (op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsEqualsToken) {
    const operator: "===" | "!==" = op === ts.SyntaxKind.EqualsEqualsEqualsToken ? "===" : "!==";
    return produced({ kind: "boolean", value: { kind: "valueComparison", operator, left, right } });
  }
  if (op === ts.SyntaxKind.EqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsToken) {
    const operator: "==" | "!=" = op === ts.SyntaxKind.EqualsEqualsToken ? "==" : "!=";
    return produced({ kind: "boolean", value: { kind: "valueLooseComparison", operator, left, right } });
  }
  const relational = relationalOperators.get(op);
  if (relational !== undefined) {
    return produced({ kind: "boolean", value: { kind: "valueRelationalComparison", operator: relational, left, right } });
  }
  const numeric = numberBinaryOperators.get(op);
  if (numeric !== undefined) {
    return produced({
      kind: "number",
      value: { kind: "binary", operator: numeric, left: { kind: "valueToNumber", value: left }, right: { kind: "valueToNumber", value: right } }
    });
  }
  if (op === ts.SyntaxKind.InstanceOfKeyword) {
    return produced({ kind: "boolean", value: { kind: "valueInstanceOf", left, right } });
  }
  return unsupportedIn("This binary operator around `yield` or `await` is not supported yet");
}

function lowerSuspendingLogical(
  host: StateMachineExpressionHost,
  expression: ts.BinaryExpression,
  op: ts.SyntaxKind,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrValueExpression> {
  const left = lowerStateMachineExpression(host, expression.left, bindings);
  if (left.kind !== "lowered") {
    return left;
  }
  const outSlot = host.allocateTemp("logic");
  const rightState = host.allocateState();
  const joinState = host.allocateState();
  const outRef: JsIrValueExpression = { kind: "variable", name: outSlot };

  host.emit({ kind: "assignValue", name: outSlot, value: left.operation });
  const evaluateRightCondition = logicalShouldEvalRight(op, outRef);
  host.emit({
    kind: "if",
    condition: evaluateRightCondition,
    thenOperations: [{ kind: "assignValue", name: SM_STATE_SLOT, value: { kind: "number", value: { kind: "literal", value: rightState } } }, { kind: "break" }],
    elseOperations: [{ kind: "assignValue", name: SM_STATE_SLOT, value: { kind: "number", value: { kind: "literal", value: joinState } } }, { kind: "break" }]
  });

  host.switchToState(rightState);
  const right = lowerStateMachineExpression(host, expression.right, bindings);
  if (right.kind !== "lowered") {
    return right;
  }
  host.emit({ kind: "assignValue", name: outSlot, value: right.operation });
  host.emitGoto(joinState);

  host.switchToState(joinState);
  return produced(outRef);
}

function logicalShouldEvalRight(op: ts.SyntaxKind, value: JsIrValueExpression): JsIrCondition {
  if (op === ts.SyntaxKind.AmpersandAmpersandToken) {
    return { kind: "valueTruthy", value };
  }
  if (op === ts.SyntaxKind.BarBarToken) {
    return { kind: "negate", condition: { kind: "valueTruthy", value } };
  }
  return {
    kind: "or",
    left: { kind: "valueComparison", operator: "===", left: value, right: { kind: "null" } },
    right: { kind: "valueComparison", operator: "===", left: value, right: { kind: "undefined" } }
  };
}

function lowerSuspendingConditional(
  host: StateMachineExpressionHost,
  expression: ts.ConditionalExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrValueExpression> {
  const condition = lowerStateMachineExpression(host, expression.condition, bindings);
  if (condition.kind !== "lowered") {
    return condition;
  }
  const outSlot = host.allocateTemp("cond");
  const thenState = host.allocateState();
  const elseState = host.allocateState();
  const joinState = host.allocateState();
  host.emit({
    kind: "if",
    condition: { kind: "valueTruthy", value: condition.operation },
    thenOperations: [{ kind: "assignValue", name: SM_STATE_SLOT, value: { kind: "number", value: { kind: "literal", value: thenState } } }, { kind: "break" }],
    elseOperations: [{ kind: "assignValue", name: SM_STATE_SLOT, value: { kind: "number", value: { kind: "literal", value: elseState } } }, { kind: "break" }]
  });
  host.switchToState(thenState);
  const consequent = lowerStateMachineExpression(host, expression.whenTrue, bindings);
  if (consequent.kind !== "lowered") {
    return consequent;
  }
  host.emit({ kind: "assignValue", name: outSlot, value: consequent.operation });
  host.emitGoto(joinState);
  host.switchToState(elseState);
  const alternate = lowerStateMachineExpression(host, expression.whenFalse, bindings);
  if (alternate.kind !== "lowered") {
    return alternate;
  }
  host.emit({ kind: "assignValue", name: outSlot, value: alternate.operation });
  host.emitGoto(joinState);
  host.switchToState(joinState);
  return produced({ kind: "variable", name: outSlot });
}

function lowerSuspendingUnary(
  host: StateMachineExpressionHost,
  expression: ts.PrefixUnaryExpression | ts.TypeOfExpression | ts.VoidExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrValueExpression> {
  const innerNode = ts.isPrefixUnaryExpression(expression) ? expression.operand : expression.expression;
  const inner = lowerStateMachineExpression(host, innerNode, bindings);
  if (inner.kind !== "lowered") {
    return inner;
  }
  if (ts.isTypeOfExpression(expression)) {
    return produced({ kind: "string", value: { kind: "valueTypeOf", value: inner.operation } });
  }
  if (ts.isVoidExpression(expression)) {
    return produced({ kind: "void", expression: inner.operation });
  }
  if (expression.operator === ts.SyntaxKind.ExclamationToken) {
    return produced({ kind: "boolean", value: { kind: "negate", condition: { kind: "valueTruthy", value: inner.operation } } });
  }
  if (expression.operator === ts.SyntaxKind.MinusToken) {
    return produced({ kind: "number", value: { kind: "unary", operator: "negate", value: { kind: "valueToNumber", value: inner.operation } } });
  }
  if (expression.operator === ts.SyntaxKind.PlusToken) {
    return produced({ kind: "number", value: { kind: "valueToNumber", value: inner.operation } });
  }
  if (expression.operator === ts.SyntaxKind.TildeToken) {
    return produced({ kind: "number", value: { kind: "unary", operator: "bitNot", value: { kind: "valueToNumber", value: inner.operation } } });
  }
  return unsupportedIn("This unary operator around `yield` or `await` is not supported yet");
}

function lowerSuspendingCall(
  host: StateMachineExpressionHost,
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrValueExpression> {
  if (ts.isPropertyAccessExpression(expression.expression)) {
    const special = lowerSuspendingBuiltinCall(host, expression, expression.expression, bindings);
    if (special !== undefined) {
      return special;
    }
    const receiver = lowerStateMachineExpression(host, expression.expression.expression, bindings);
    if (receiver.kind !== "lowered") {
      return receiver;
    }
    const receiverVal = spillToTemp(host, receiver.operation);
    const args = lowerSuspendingCallArgs(host, expression.arguments, bindings);
    if (args.kind !== "lowered") {
      return args;
    }
    const key: JsIrStringExpression = { kind: "literal", value: expression.expression.name.text };
    return produced({
      kind: "callValue",
      callee: { kind: "valueObjectDynamicAccess", value: receiverVal, key },
      arguments: args.operation,
      methodReceiver: receiverVal,
      methodKey: key
    });
  }
  if (ts.isIdentifier(expression.expression) && !bindings.has(expression.expression.text)) {
    const builtin = lowerSuspendingGlobalCall(host, expression.expression.text, expression.arguments, bindings);
    if (builtin !== undefined) {
      return builtin;
    }
  }
  const callee = lowerStateMachineExpression(host, expression.expression, bindings);
  if (callee.kind !== "lowered") {
    return callee;
  }
  const calleeVal = spillToTemp(host, callee.operation);
  const args = lowerSuspendingCallArgs(host, expression.arguments, bindings);
  if (args.kind !== "lowered") {
    return args;
  }
  return produced({ kind: "callValue", callee: calleeVal, arguments: args.operation });
}

function lowerSuspendingGlobalCall(
  host: StateMachineExpressionHost,
  name: string,
  args: ts.NodeArray<ts.Expression>,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrValueExpression> | undefined {
  if (name !== "String" && name !== "Number" && name !== "Boolean" && name !== "print") {
    return undefined;
  }
  const first = args.at(0);
  let argValue: JsIrValueExpression = { kind: "undefined" };
  if (first !== undefined) {
    const lowered = lowerStateMachineExpression(host, first, bindings);
    if (lowered.kind !== "lowered") {
      return lowered;
    }
    argValue = lowered.operation;
  }
  if (name === "String") {
    return produced({ kind: "string", value: first === undefined ? { kind: "literal", value: "" } : { kind: "stringConversion", value: argValue } });
  }
  if (name === "Number") {
    return produced({ kind: "number", value: first === undefined ? { kind: "literal", value: 0 } : { kind: "valueToNumber", value: argValue } });
  }
  if (name === "Boolean") {
    return produced({ kind: "boolean", value: { kind: "valueTruthy", value: argValue } });
  }
  host.emit({ kind: "print", expression: { kind: "value", value: argValue } });
  return produced({ kind: "undefined" });
}

function lowerSuspendingBuiltinCall(
  host: StateMachineExpressionHost,
  expression: ts.CallExpression,
  callee: ts.PropertyAccessExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrValueExpression> | undefined {
  if (!ts.isIdentifier(callee.expression)) {
    return undefined;
  }
  const owner = callee.expression.text;
  const method = callee.name.text;
  if (owner === "Promise" && !bindings.has("Promise")
    && (method === "resolve" || method === "reject" || method === "all" || method === "race" || method === "allSettled" || method === "any")) {
    if (expression.arguments.length === 0) {
      return produced({ kind: "promiseStatic", method });
    }
    const arg = lowerStateMachineExpression(host, expression.arguments[0], bindings);
    return arg.kind === "lowered" ? produced({ kind: "promiseStatic", method, argument: arg.operation }) : arg;
  }
  if (owner === "console" && method === "log" && !bindings.has("console")) {
    const values: JsIrValueExpression[] = [];
    for (const arg of expression.arguments) {
      const lowered = lowerStateMachineExpression(host, arg, bindings);
      if (lowered.kind !== "lowered") {
        return lowered;
      }
      values.push(spillToTemp(host, lowered.operation));
    }
    host.emit({ kind: "consoleLog", arguments: values });
    return produced({ kind: "undefined" });
  }
  return undefined;
}

function lowerSuspendingCallArgs(
  host: StateMachineExpressionHost,
  args: ts.NodeArray<ts.Expression>,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<readonly JsIrCallArgument[]> {
  const lowered: JsIrCallArgument[] = [];
  for (const arg of args) {
    if (ts.isSpreadElement(arg)) {
      return unsupportedIn("Spread arguments containing `yield` or `await` are not supported yet");
    }
    const value = lowerStateMachineExpression(host, arg, bindings);
    if (value.kind !== "lowered") {
      return value;
    }
    lowered.push({ valueKind: "value", value: spillToTemp(host, value.operation) });
  }
  return produced(lowered);
}

function lowerSuspendingArray(
  host: StateMachineExpressionHost,
  expression: ts.ArrayLiteralExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrValueExpression> {
  const elements: JsIrValueExpression[] = [];
  for (const element of expression.elements) {
    if (ts.isSpreadElement(element) || ts.isOmittedExpression(element)) {
      return unsupportedIn("Spread or elision in array literal with `yield` or `await` is not supported yet");
    }
    const lowered = lowerStateMachineExpression(host, element, bindings);
    if (lowered.kind !== "lowered") {
      return lowered;
    }
    elements.push(spillToTemp(host, lowered.operation));
  }
  return produced({ kind: "runtimeArrayValue", elements });
}

function lowerSuspendingObject(
  host: StateMachineExpressionHost,
  expression: ts.ObjectLiteralExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrValueExpression> {
  const fields: JsIrRuntimeObjectField[] = [];
  for (const prop of expression.properties) {
    if (ts.isPropertyAssignment(prop)) {
      const key = lowerObjectPropertyKey(host, prop.name, bindings);
      if (key.kind !== "lowered") {
        return key;
      }
      const value = lowerStateMachineExpression(host, prop.initializer, bindings);
      if (value.kind !== "lowered") {
        return value;
      }
      fields.push({ kind: "field", key: key.operation, value: spillToTemp(host, value.operation) });
      continue;
    }
    if (ts.isShorthandPropertyAssignment(prop)) {
      const value = lowerStateMachineExpression(host, prop.name, bindings);
      if (value.kind !== "lowered") {
        return value;
      }
      fields.push({ kind: "field", key: { kind: "literal", value: prop.name.text }, value: spillToTemp(host, value.operation) });
      continue;
    }
    return unsupportedIn("This object literal property around `yield` or `await` is not supported yet");
  }
  return produced({ kind: "objectLiteralValue", value: { fields } });
}

function lowerObjectPropertyKey(
  host: StateMachineExpressionHost,
  name: ts.PropertyName,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrStringExpression> {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return produced({ kind: "literal", value: name.text });
  }
  if (ts.isComputedPropertyName(name)) {
    const keyVal = lowerStateMachineExpression(host, name.expression, bindings);
    if (keyVal.kind !== "lowered") {
      return keyVal;
    }
    return produced({ kind: "stringConversion", value: spillToTemp(host, keyVal.operation) });
  }
  return unsupportedIn("This object property key around `yield` or `await` is not supported yet");
}

function lowerSuspendingTemplate(
  host: StateMachineExpressionHost,
  expression: ts.TemplateExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrValueExpression> {
  let result: JsIrStringExpression = { kind: "literal", value: expression.head.text };
  for (const span of expression.templateSpans) {
    const part = lowerStateMachineExpression(host, span.expression, bindings);
    if (part.kind !== "lowered") {
      return part;
    }
    const saved = spillToTemp(host, part.operation);
    result = { kind: "concat", left: result, right: { kind: "stringConversion", value: saved } };
    if (span.literal.text.length > 0) {
      result = { kind: "concat", left: result, right: { kind: "literal", value: span.literal.text } };
    }
  }
  return produced({ kind: "string", value: result });
}

function lowerSuspendingPropertyAccess(
  host: StateMachineExpressionHost,
  expression: ts.PropertyAccessExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrValueExpression> {
  const receiver = lowerStateMachineExpression(host, expression.expression, bindings);
  if (receiver.kind !== "lowered") {
    return receiver;
  }
  return produced({
    kind: "valueObjectDynamicAccess",
    value: receiver.operation,
    key: { kind: "literal", value: expression.name.text }
  });
}

function lowerSuspendingElementAccess(
  host: StateMachineExpressionHost,
  expression: ts.ElementAccessExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrValueExpression> {
  const receiver = lowerStateMachineExpression(host, expression.expression, bindings);
  if (receiver.kind !== "lowered") {
    return receiver;
  }
  const receiverVal = containsSuspension(expression.argumentExpression) ? spillToTemp(host, receiver.operation) : receiver.operation;
  const key = lowerStateMachineExpression(host, expression.argumentExpression, bindings);
  if (key.kind !== "lowered") {
    return key;
  }
  return produced({
    kind: "valueObjectDynamicAccess",
    value: receiverVal,
    key: { kind: "stringConversion", value: key.operation }
  });
}

function lowerSuspendingNew(
  host: StateMachineExpressionHost,
  expression: ts.NewExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrValueExpression> {
  const callee = lowerStateMachineExpression(host, expression.expression, bindings);
  if (callee.kind !== "lowered") {
    return callee;
  }
  const calleeVal = spillToTemp(host, callee.operation);
  const args = lowerSuspendingCallArgs(host, expression.arguments ?? ts.factory.createNodeArray(), bindings);
  if (args.kind !== "lowered") {
    return args;
  }
  return produced({ kind: "callValue", callee: calleeVal, arguments: args.operation });
}
