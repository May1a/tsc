import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import { isNonExecutableDeclaration } from "./comparisons.js";
import type { JsIrCondition, JsIrValueExpression } from "./expressions.js";
import { iteratorErrorSubject } from "./iterator-subject.js";
import { type Produced, produced, unsupportedIn } from "./lowered.js";
import {
  FINALLY_JUMP,
  FINALLY_NORMAL,
  FINALLY_RETURN,
  FINALLY_THROW,
  SM_STATE_SLOT,
  emitStateBranch
} from "./state-machine-core.js";
import { containsSuspension, lowerStateMachineExpression } from "./state-machine-expr.js";
import { bindPatternValue, lowerVariableList } from "./state-machine-bindings.js";
import type { FinallyFrame, StateMachineBuilder } from "./state-machine.js";

export function lowerStatementList(
  builder: StateMachineBuilder,
  statements: ts.NodeArray<ts.Statement> | readonly ts.Statement[],
  bindings: Map<string, JsIrBindingValue>
): Produced<undefined> {
  for (const statement of statements) {
    if (isNonExecutableDeclaration(statement) || ts.isEmptyStatement(statement)) {
      continue;
    }
    const lowered = lowerStateMachineStatement(builder, statement, bindings);
    if (lowered.kind !== "lowered") {
      return lowered;
    }
  }
  return produced(undefined);
}

function lowerStateMachineStatement(
  builder: StateMachineBuilder,
  statement: ts.Statement,
  bindings: Map<string, JsIrBindingValue>
): Produced<undefined> {
  if (ts.isBlock(statement)) {
    return lowerStatementList(builder, statement.statements, new Map(bindings));
  }
  if (ts.isVariableStatement(statement)) {
    return lowerVariableList(builder, statement.declarationList, bindings);
  }
  if (ts.isExpressionStatement(statement)) {
    return lowerStateMachineExpressionStatement(builder, statement.expression, bindings);
  }
  if (ts.isReturnStatement(statement)) {
    return lowerStateMachineReturn(builder, statement, bindings);
  }
  if (ts.isThrowStatement(statement)) {
    return lowerStateMachineThrow(builder, statement, bindings);
  }
  if (ts.isIfStatement(statement)) {
    return lowerStateMachineIf(builder, statement, bindings);
  }
  return lowerStateMachineControlStatement(builder, statement, bindings);
}

function lowerStateMachineControlStatement(
  builder: StateMachineBuilder,
  statement: ts.Statement,
  bindings: Map<string, JsIrBindingValue>
): Produced<undefined> {
  if (ts.isWhileStatement(statement)) {
    return lowerStateMachineWhile(builder, statement, bindings);
  }
  if (ts.isDoStatement(statement)) {
    return lowerStateMachineDoWhile(builder, statement, bindings);
  }
  if (ts.isForStatement(statement)) {
    return lowerStateMachineFor(builder, statement, bindings);
  }
  if (ts.isForOfStatement(statement)) {
    return lowerStateMachineForOf(builder, statement, bindings);
  }
  if (ts.isSwitchStatement(statement)) {
    return lowerStateMachineSwitch(builder, statement, bindings);
  }
  if (ts.isTryStatement(statement)) {
    return lowerStateMachineTry(builder, statement, bindings);
  }
  if (ts.isLabeledStatement(statement)) {
    return lowerStateMachineLabeled(builder, statement, bindings);
  }
  if (ts.isBreakStatement(statement) || ts.isContinueStatement(statement)) {
    return lowerStateMachineJump(builder, statement);
  }
  return unsupportedIn("This statement inside a generator or async function is not supported yet");
}

function hasRenamedLiftedTarget(expression: ts.Expression, bindings: ReadonlyMap<string, JsIrBindingValue>): boolean {
  if (ts.isBinaryExpression(expression) && ts.isIdentifier(expression.left)) {
    const binding = bindings.get(expression.left.text);
    return binding?.kind === "valueVariable" && binding.name !== expression.left.text;
  }
  if ((ts.isPrefixUnaryExpression(expression) || ts.isPostfixUnaryExpression(expression)) && ts.isIdentifier(expression.operand)) {
    const binding = bindings.get(expression.operand.text);
    return binding?.kind === "valueVariable" && binding.name !== expression.operand.text;
  }
  return false;
}

function lowerStateMachineExpressionStatement(
  builder: StateMachineBuilder,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<undefined> {
  if (hasRenamedLiftedTarget(expression, bindings)) {
    const renamed = lowerRenamedTargetStatement(builder, expression, bindings);
    if (renamed !== undefined) {
      return renamed;
    }
  }
  if (!containsSuspension(expression) && !hasRenamedLiftedTarget(expression, bindings)) {
    const stmt = builder.context.lowerExpressionStatement(builder.context, expression, bindings);
    if (stmt.kind === "lowered") {
      builder.emit(stmt.operation);
      return produced(undefined);
    }
    if (stmt.kind === "unsupported") {
      return stmt;
    }
  }
  const value = lowerStateMachineExpression(builder, expression, bindings);
  if (value.kind !== "lowered") {
    return value;
  }
  builder.emit({ kind: "discardValue", value: value.operation });
  return produced(undefined);
}

function lowerRenamedTargetStatement(
  builder: StateMachineBuilder,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<undefined> | undefined {
  if ((ts.isPrefixUnaryExpression(expression) || ts.isPostfixUnaryExpression(expression)) && ts.isIdentifier(expression.operand)) {
    const binding = bindings.get(expression.operand.text);
    if (binding?.kind !== "valueVariable") {
      return undefined;
    }
    if (expression.operator === ts.SyntaxKind.PlusPlusToken || expression.operator === ts.SyntaxKind.MinusMinusToken) {
      const operator = expression.operator === ts.SyntaxKind.PlusPlusToken ? "add" : "subtract";
      builder.emit({
        kind: "assignValue",
        name: binding.name,
        value: {
          kind: "number",
          value: { kind: "binary", operator, left: { kind: "valueToNumber", value: { kind: "variable", name: binding.name } }, right: { kind: "literal", value: 1 } }
        }
      });
      return produced(undefined);
    }
  }
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(expression.left)) {
    const right = lowerStateMachineExpression(builder, expression.right, bindings);
    if (right.kind !== "lowered") {
      return right;
    }
    return builder.emitAssignToTarget(expression.left, right.operation, bindings);
  }
  return undefined;
}

function lowerStateMachineReturn(
  builder: StateMachineBuilder,
  statement: ts.ReturnStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<undefined> {
  let value: JsIrValueExpression = { kind: "undefined" };
  if (statement.expression !== undefined) {
    const lowered = lowerStateMachineExpression(builder, statement.expression, bindings);
    if (lowered.kind !== "lowered") {
      return lowered;
    }
    value = lowered.operation;
  }
  builder.emitReturn(value);
  return produced(undefined);
}

function lowerStateMachineThrow(
  builder: StateMachineBuilder,
  statement: ts.ThrowStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<undefined> {
  const value = lowerStateMachineExpression(builder, statement.expression, bindings);
  if (value.kind !== "lowered") {
    return value;
  }
  builder.emit({ kind: "throwValue", value: value.operation });
  return produced(undefined);
}

function lowerStateMachineIf(
  builder: StateMachineBuilder,
  statement: ts.IfStatement,
  bindings: Map<string, JsIrBindingValue>
): Produced<undefined> {
  const condVal = lowerStateMachineExpression(builder, statement.expression, bindings);
  if (condVal.kind !== "lowered") {
    return condVal;
  }
  const thenState = builder.allocateState();
  const afterState = builder.allocateState();
  const elseState = statement.elseStatement === undefined ? afterState : builder.allocateState();
  emitStateBranch(builder, { kind: "valueTruthy", value: condVal.operation }, thenState, elseState);

  builder.switchToState(thenState);
  const thenResult = lowerStateMachineStatement(builder, statement.thenStatement, new Map(bindings));
  if (thenResult.kind !== "lowered") {
    return thenResult;
  }
  builder.emitGoto(afterState);

  if (statement.elseStatement !== undefined) {
    builder.switchToState(elseState);
    const elseResult = lowerStateMachineStatement(builder, statement.elseStatement, new Map(bindings));
    if (elseResult.kind !== "lowered") {
      return elseResult;
    }
    builder.emitGoto(afterState);
  }

  builder.switchToState(afterState);
  return produced(undefined);
}

function lowerStateMachineWhile(
  builder: StateMachineBuilder,
  statement: ts.WhileStatement,
  bindings: Map<string, JsIrBindingValue>
): Produced<undefined> {
  const label = consumePendingLabel(builder);
  const condState = builder.allocateState();
  const bodyState = builder.allocateState();
  const afterState = builder.allocateState();

  builder.emitGoto(condState);
  builder.switchToState(condState);
  const condVal = lowerStateMachineExpression(builder, statement.expression, bindings);
  if (condVal.kind !== "lowered") {
    return condVal;
  }
  emitStateBranch(builder, { kind: "valueTruthy", value: condVal.operation }, bodyState, afterState);

  builder.loopStack.push({ label, breakState: afterState, continueState: condState, finallyDepth: builder.finallyStack.length });
  builder.switchToState(bodyState);
  const bodyResult = lowerStateMachineStatement(builder, statement.statement, new Map(bindings));
  builder.loopStack.pop();
  if (bodyResult.kind !== "lowered") {
    return bodyResult;
  }
  builder.emitGoto(condState);

  builder.switchToState(afterState);
  return produced(undefined);
}

function lowerStateMachineDoWhile(
  builder: StateMachineBuilder,
  statement: ts.DoStatement,
  bindings: Map<string, JsIrBindingValue>
): Produced<undefined> {
  const label = consumePendingLabel(builder);
  const bodyState = builder.allocateState();
  const condState = builder.allocateState();
  const afterState = builder.allocateState();

  builder.emitGoto(bodyState);
  builder.loopStack.push({ label, breakState: afterState, continueState: condState, finallyDepth: builder.finallyStack.length });
  builder.switchToState(bodyState);
  const bodyResult = lowerStateMachineStatement(builder, statement.statement, new Map(bindings));
  builder.loopStack.pop();
  if (bodyResult.kind !== "lowered") {
    return bodyResult;
  }
  builder.emitGoto(condState);

  builder.switchToState(condState);
  const condVal = lowerStateMachineExpression(builder, statement.expression, bindings);
  if (condVal.kind !== "lowered") {
    return condVal;
  }
  emitStateBranch(builder, { kind: "valueTruthy", value: condVal.operation }, bodyState, afterState);

  builder.switchToState(afterState);
  return produced(undefined);
}

function lowerStateMachineFor(
  builder: StateMachineBuilder,
  statement: ts.ForStatement,
  bindings: Map<string, JsIrBindingValue>
): Produced<undefined> {
  const label = consumePendingLabel(builder);
  const loopBindings = new Map(bindings);
  const initResult = lowerForInitializer(builder, statement.initializer, loopBindings);
  if (initResult.kind !== "lowered") {
    return initResult;
  }
  const condState = builder.allocateState();
  const bodyState = builder.allocateState();
  const updateState = builder.allocateState();
  const afterState = builder.allocateState();

  builder.emitGoto(condState);
  builder.switchToState(condState);
  const condResult = lowerForCondition(builder, statement.condition, loopBindings, bodyState, afterState);
  if (condResult.kind !== "lowered") {
    return condResult;
  }

  builder.loopStack.push({ label, breakState: afterState, continueState: updateState, finallyDepth: builder.finallyStack.length });
  builder.switchToState(bodyState);
  const bodyResult = lowerStateMachineStatement(builder, statement.statement, new Map(loopBindings));
  builder.loopStack.pop();
  if (bodyResult.kind !== "lowered") {
    return bodyResult;
  }
  builder.emitGoto(updateState);

  builder.switchToState(updateState);
  if (statement.incrementor !== undefined) {
    const incResult = lowerStateMachineExpressionStatement(builder, statement.incrementor, loopBindings);
    if (incResult.kind !== "lowered") {
      return incResult;
    }
  }
  builder.emitGoto(condState);
  builder.switchToState(afterState);
  return produced(undefined);
}

function lowerForInitializer(
  builder: StateMachineBuilder,
  initializer: ts.ForInitializer | undefined,
  loopBindings: Map<string, JsIrBindingValue>
): Produced<undefined> {
  if (initializer === undefined) {
    return produced(undefined);
  }
  return ts.isVariableDeclarationList(initializer)
    ? lowerVariableList(builder, initializer, loopBindings)
    : lowerStateMachineExpressionStatement(builder, initializer, loopBindings);
}

function lowerForCondition(
  builder: StateMachineBuilder,
  condition: ts.Expression | undefined,
  loopBindings: Map<string, JsIrBindingValue>,
  bodyState: number,
  afterState: number
): Produced<undefined> {
  if (condition === undefined) {
    builder.emitGoto(bodyState);
    return produced(undefined);
  }
  const condVal = lowerStateMachineExpression(builder, condition, loopBindings);
  if (condVal.kind !== "lowered") {
    return condVal;
  }
  emitStateBranch(builder, { kind: "valueTruthy", value: condVal.operation }, bodyState, afterState);
  return produced(undefined);
}

function lowerStateMachineForOf(
  builder: StateMachineBuilder,
  statement: ts.ForOfStatement,
  bindings: Map<string, JsIrBindingValue>
): Produced<undefined> {
  if (statement.awaitModifier !== undefined) {
    return unsupportedIn("`for await...of` is not supported yet");
  }
  const label = consumePendingLabel(builder);
  const iterable = lowerStateMachineExpression(builder, statement.expression, bindings);
  if (iterable.kind !== "lowered") {
    return iterable;
  }
  const iterSlot = builder.allocateTemp("iter");
  const stepSlot = builder.allocateTemp("step");
  const message = `${iteratorErrorSubject(statement.expression)} is not iterable`;
  builder.emit({ kind: "assignValue", name: iterSlot, value: { kind: "iteratorOpen", iterable: iterable.operation, notIterableMessage: message } });

  const loopState = builder.allocateState();
  const bodyState = builder.allocateState();
  const afterState = builder.allocateState();

  emitForOfStep(builder, iterSlot, stepSlot, loopState, bodyState, afterState);

  const iterBindings = new Map(bindings);
  builder.switchToState(bodyState);
  const stepValue: JsIrValueExpression = { kind: "valueObjectDynamicAccess", value: { kind: "variable", name: stepSlot }, key: { kind: "literal", value: "value" } };
  const assignInit = assignForOfInitializer(builder, statement.initializer, stepValue, iterBindings);
  if (assignInit.kind !== "lowered") {
    return assignInit;
  }
  builder.loopStack.push({ label, breakState: afterState, continueState: loopState, finallyDepth: builder.finallyStack.length });
  const bodyResult = lowerStateMachineStatement(builder, statement.statement, iterBindings);
  builder.loopStack.pop();
  if (bodyResult.kind !== "lowered") {
    return bodyResult;
  }
  builder.emitGoto(loopState);
  builder.switchToState(afterState);
  return produced(undefined);
}

function emitForOfStep(
  builder: StateMachineBuilder,
  iterSlot: string,
  stepSlot: string,
  loopState: number,
  bodyState: number,
  afterState: number
): void {
  const iterRef: JsIrValueExpression = { kind: "variable", name: iterSlot };
  const stepRef: JsIrValueExpression = { kind: "variable", name: stepSlot };
  builder.emitGoto(loopState);
  builder.switchToState(loopState);
  builder.emit({
    kind: "assignValue",
    name: stepSlot,
    value: {
      kind: "callValue",
      callee: { kind: "valueObjectDynamicAccess", value: iterRef, key: { kind: "literal", value: "next" } },
      arguments: [],
      methodReceiver: iterRef,
      methodKey: { kind: "literal", value: "next" }
    }
  });
  emitStateBranch(builder, { kind: "valueTruthy", value: { kind: "valueObjectDynamicAccess", value: stepRef, key: { kind: "literal", value: "done" } } }, afterState, bodyState);
}

function assignForOfInitializer(
  builder: StateMachineBuilder,
  initializer: ts.ForInitializer,
  value: JsIrValueExpression,
  bindings: Map<string, JsIrBindingValue>
): Produced<undefined> {
  if (ts.isVariableDeclarationList(initializer)) {
    const [decl] = initializer.declarations;
    const isVar = (initializer.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) === 0;
    return bindPatternValue(builder, decl.name, value, isVar, bindings);
  }
  return builder.emitAssignToTarget(initializer, value, bindings);
}

function lowerStateMachineSwitch(
  builder: StateMachineBuilder,
  statement: ts.SwitchStatement,
  bindings: Map<string, JsIrBindingValue>
): Produced<undefined> {
  const label = consumePendingLabel(builder);
  const discriminant = lowerStateMachineExpression(builder, statement.expression, bindings);
  if (discriminant.kind !== "lowered") {
    return discriminant;
  }
  const discSlot = builder.allocateTemp("sw");
  builder.emit({ kind: "assignValue", name: discSlot, value: discriminant.operation });
  const afterState = builder.allocateState();
  const clauseStates = statement.caseBlock.clauses.map(() => builder.allocateState());
  const testsResult = lowerSwitchTests(builder, statement.caseBlock.clauses, clauseStates, discSlot, afterState, bindings);
  if (testsResult.kind !== "lowered") {
    return testsResult;
  }
  const clausesResult = lowerSwitchClauses(builder, statement.caseBlock.clauses, clauseStates, label, afterState, bindings);
  if (clausesResult.kind !== "lowered") {
    return clausesResult;
  }
  builder.switchToState(afterState);
  return produced(undefined);
}

function lowerSwitchTests(
  builder: StateMachineBuilder,
  clauses: ts.NodeArray<ts.CaseOrDefaultClause>,
  clauseStates: readonly number[],
  discSlot: string,
  afterState: number,
  bindings: Map<string, JsIrBindingValue>
): Produced<undefined> {
  const discRef: JsIrValueExpression = { kind: "variable", name: discSlot };
  let defaultState = afterState;
  for (const [index, clause] of clauses.entries()) {
    if (ts.isDefaultClause(clause)) {
      defaultState = clauseStates[index];
      continue;
    }
    const test = lowerStateMachineExpression(builder, clause.expression, bindings);
    if (test.kind !== "lowered") {
      return test;
    }
    const nextTestState = builder.allocateState();
    emitStateBranch(builder, { kind: "valueComparison", operator: "===", left: discRef, right: test.operation }, clauseStates[index], nextTestState);
    builder.switchToState(nextTestState);
  }
  builder.emitGoto(defaultState);
  return produced(undefined);
}

function lowerSwitchClauses(
  builder: StateMachineBuilder,
  clauses: ts.NodeArray<ts.CaseOrDefaultClause>,
  clauseStates: readonly number[],
  label: string | undefined,
  afterState: number,
  bindings: Map<string, JsIrBindingValue>
): Produced<undefined> {
  const switchBindings = new Map(bindings);
  builder.loopStack.push({ label, breakState: afterState, continueState: undefined, finallyDepth: builder.finallyStack.length });
  for (const [index, clause] of clauses.entries()) {
    builder.switchToState(clauseStates[index]);
    const lowered = lowerStatementList(builder, clause.statements, switchBindings);
    if (lowered.kind !== "lowered") {
      builder.loopStack.pop();
      return lowered;
    }
    builder.emitGoto(clauseStates[index + 1] ?? afterState);
  }
  builder.loopStack.pop();
  return produced(undefined);
}

function lowerStateMachineTry(
  builder: StateMachineBuilder,
  statement: ts.TryStatement,
  bindings: Map<string, JsIrBindingValue>
): Produced<undefined> {
  const finallyFrame: FinallyFrame | undefined = statement.finallyBlock === undefined
    ? undefined
    : { finallyState: builder.allocateState(), finKindSlot: builder.allocateTemp("finkind"), finValSlot: builder.allocateTemp("finval") };
  const afterState = builder.allocateState();
  const tryStart = builder.allocateState();
  builder.emitGoto(tryStart);

  if (finallyFrame !== undefined) {
    builder.finallyStack.push(finallyFrame);
  }
  const bodyResult = lowerTryAndCatch(builder, statement, tryStart, finallyFrame, afterState, bindings);
  if (finallyFrame !== undefined) {
    builder.finallyStack.pop();
  }
  if (bodyResult.kind !== "lowered") {
    return bodyResult;
  }

  if (statement.finallyBlock !== undefined && finallyFrame !== undefined) {
    const finResult = lowerStateMachineFinally(builder, statement.finallyBlock, finallyFrame, afterState, bindings);
    if (finResult.kind !== "lowered") {
      return finResult;
    }
  }
  builder.switchToState(afterState);
  return produced(undefined);
}

function lowerTryAndCatch(
  builder: StateMachineBuilder,
  statement: ts.TryStatement,
  tryStart: number,
  finallyFrame: FinallyFrame | undefined,
  afterState: number,
  bindings: Map<string, JsIrBindingValue>
): Produced<undefined> {
  builder.switchToState(tryStart);
  const tryResult = lowerStatementList(builder, statement.tryBlock.statements, new Map(bindings));
  if (tryResult.kind !== "lowered") {
    return tryResult;
  }
  const tryEnd = builder.states.length - 1;
  emitNormalTryExit(builder, finallyFrame, afterState);

  if (statement.catchClause !== undefined) {
    return lowerStateMachineCatch(builder, statement.catchClause, tryStart, tryEnd, finallyFrame, afterState, bindings);
  }
  if (finallyFrame !== undefined) {
    builder.handlers.push({ startState: tryStart, endState: tryEnd, kind: "finally", targetState: finallyFrame.finallyState, finKindSlot: finallyFrame.finKindSlot, finValSlot: finallyFrame.finValSlot });
  }
  return produced(undefined);
}

function emitNormalTryExit(
  builder: StateMachineBuilder,
  finallyFrame: FinallyFrame | undefined,
  afterState: number
): void {
  if (finallyFrame !== undefined) {
    builder.emit({ kind: "assignValue", name: finallyFrame.finKindSlot, value: { kind: "number", value: { kind: "literal", value: FINALLY_NORMAL } } });
    builder.emitGoto(finallyFrame.finallyState);
    return;
  }
  builder.emitGoto(afterState);
}

function lowerStateMachineCatch(
  builder: StateMachineBuilder,
  catchClause: ts.CatchClause,
  tryStart: number,
  tryEnd: number,
  finallyFrame: FinallyFrame | undefined,
  afterState: number,
  bindings: Map<string, JsIrBindingValue>
): Produced<undefined> {
  const catchStart = builder.allocateState();
  const catchBindings = new Map(bindings);
  let catchSlot: string | undefined;
  const catchDecl = catchClause.variableDeclaration?.name;
  if (catchDecl !== undefined) {
    if (ts.isIdentifier(catchDecl)) {
      catchSlot = builder.allocateLocal(catchDecl.text);
      catchBindings.set(catchDecl.text, { kind: "valueVariable", name: catchSlot });
    } else {
      catchSlot = builder.allocateTemp("catch");
    }
  }
  builder.handlers.push({ startState: tryStart, endState: tryEnd, kind: "catch", targetState: catchStart, catchSlot });

  builder.switchToState(catchStart);
  if (catchDecl !== undefined && !ts.isIdentifier(catchDecl) && catchSlot !== undefined) {
    const bound = bindPatternValue(builder, catchDecl, { kind: "variable", name: catchSlot }, false, catchBindings);
    if (bound.kind !== "lowered") {
      return bound;
    }
  }
  const lowered = lowerStatementList(builder, catchClause.block.statements, catchBindings);
  if (lowered.kind !== "lowered") {
    return lowered;
  }
  const catchEnd = builder.states.length - 1;
  emitNormalTryExit(builder, finallyFrame, afterState);

  if (finallyFrame !== undefined) {
    builder.handlers.push({ startState: catchStart, endState: catchEnd, kind: "finally", targetState: finallyFrame.finallyState, finKindSlot: finallyFrame.finKindSlot, finValSlot: finallyFrame.finValSlot });
  }
  return produced(undefined);
}

function lowerStateMachineFinally(
  builder: StateMachineBuilder,
  finallyBlock: ts.Block,
  finallyFrame: FinallyFrame,
  afterState: number,
  bindings: Map<string, JsIrBindingValue>
): Produced<undefined> {
  builder.switchToState(finallyFrame.finallyState);
  const lowered = lowerStatementList(builder, finallyBlock.statements, new Map(bindings));
  if (lowered.kind !== "lowered") {
    return lowered;
  }
  const kindRef: JsIrValueExpression = { kind: "variable", name: finallyFrame.finKindSlot };
  const valRef: JsIrValueExpression = { kind: "variable", name: finallyFrame.finValSlot };
  const retResumeState = builder.allocateState();
  const eq = (value: number): JsIrCondition => ({
    kind: "valueComparison",
    operator: "===",
    left: kindRef,
    right: { kind: "number", value: { kind: "literal", value } }
  });
  builder.emit({
    kind: "if",
    condition: eq(FINALLY_RETURN),
    thenOperations: [{ kind: "assignValue", name: SM_STATE_SLOT, value: { kind: "number", value: { kind: "literal", value: retResumeState } } }, { kind: "break" }],
    elseOperations: [{
      kind: "if",
      condition: eq(FINALLY_THROW),
      thenOperations: [{ kind: "throwValue", value: valRef }],
      elseOperations: [{
        kind: "if",
        condition: eq(FINALLY_JUMP),
        thenOperations: [{ kind: "assignValue", name: SM_STATE_SLOT, value: valRef }, { kind: "break" }],
        elseOperations: [{ kind: "assignValue", name: SM_STATE_SLOT, value: { kind: "number", value: { kind: "literal", value: afterState } } }, { kind: "break" }]
      }]
    }]
  });
  builder.switchToState(retResumeState);
  builder.emitReturn(valRef);
  return produced(undefined);
}

function lowerStateMachineLabeled(
  builder: StateMachineBuilder,
  statement: ts.LabeledStatement,
  bindings: Map<string, JsIrBindingValue>
): Produced<undefined> {
  const inner = statement.statement;
  if (ts.isWhileStatement(inner) || ts.isDoStatement(inner) || ts.isForStatement(inner)
    || ts.isForOfStatement(inner) || ts.isSwitchStatement(inner)) {
    builder.pendingLabel = statement.label.text;
    return lowerStateMachineStatement(builder, inner, bindings);
  }
  const afterState = builder.allocateState();
  builder.loopStack.push({ label: statement.label.text, breakState: afterState, continueState: undefined, finallyDepth: builder.finallyStack.length });
  const result = lowerStateMachineStatement(builder, inner, bindings);
  builder.loopStack.pop();
  if (result.kind !== "lowered") {
    return result;
  }
  builder.emitGoto(afterState);
  builder.switchToState(afterState);
  return produced(undefined);
}

function lowerStateMachineJump(
  builder: StateMachineBuilder,
  statement: ts.BreakStatement | ts.ContinueStatement
): Produced<undefined> {
  const label = statement.label?.text;
  const isContinue = ts.isContinueStatement(statement);
  for (let index = builder.loopStack.length - 1; index >= 0; index -= 1) {
    const frame = builder.loopStack[index];
    if (isContinue && frame.continueState === undefined) {
      continue;
    }
    if (label !== undefined && frame.label !== label) {
      continue;
    }
    const target = isContinue ? frame.continueState : frame.breakState;
    if (target !== undefined) {
      builder.emitJump(target, frame.finallyDepth);
      return produced(undefined);
    }
  }
  return unsupportedIn(`\`${isContinue ? "continue" : "break"}\` has no matching enclosing target`);
}

function consumePendingLabel(builder: StateMachineBuilder): string | undefined {
  const label = builder.pendingLabel;
  builder.pendingLabel = undefined;
  return label;
}
