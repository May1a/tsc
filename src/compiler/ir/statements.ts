import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import { type Lowered, loweredOperation, loweredStatementResult, notApplicable } from "./lowered.js";
import { traceOperationFromNode } from "./class-info.js";
import { lowerVariableBinding } from "./variable-bindings.js";
import { lowerIfStatement, lowerSwitchStatement } from "./branches.js";
import { lowerDoWhileStatement, lowerForInStatement, lowerForOfStatement, lowerForStatement, lowerWhileStatement } from "./loops.js";
import { lowerLabelledJump, lowerLabelledStatement } from "./loop-labels.js";
import { lowerFunctionDeclaration } from "./functions.js";
import { lowerNamespaceDeclarationStatement } from "./namespaces.js";
import { lowerEnumDeclarationStatement } from "./enums.js";
import { lowerReturnStatement } from "./returns.js";
import { lowerThrowStatement, lowerTryCatchStatement } from "./exceptions.js";
import { lowerExpressionStatement } from "./expression-statements.js";

export function lowerStatement(
  context: LoweringContext,
  statement: ts.Statement,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  promotedAggregates: ReadonlySet<string> = new Set()
): Lowered {
  const result = lowerStatementCore(context, statement, bindings, promotedAggregates);
  if (result.kind !== "lowered") {
    return result;
  }
  return loweredOperation(traceOperationFromNode(result.operation, statement));
}

// eslint-disable-next-line max-statements -- Statement dispatch covers all supported top-level node kinds in one place.
function lowerStatementCore(
  context: LoweringContext,
  statement: ts.Statement,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  promotedAggregates: ReadonlySet<string> = new Set()
): Lowered {
  if (ts.isVariableStatement(statement)) {
    return loweredStatementResult(lowerVariableBinding(context, statement, bindings, promotedAggregates), statement, bindings);
  }

  if (ts.isIfStatement(statement)) {
    return loweredStatementResult(lowerIfStatement(context, statement, bindings), statement, bindings);
  }

  if (ts.isSwitchStatement(statement)) {
    return lowerSwitchStatement(context, statement, bindings);
  }

  if (ts.isWhileStatement(statement)) {
    return loweredStatementResult(lowerWhileStatement(context, statement, bindings), statement, bindings);
  }

  if (ts.isForStatement(statement)) {
    return loweredStatementResult(lowerForStatement(context, statement, bindings), statement, bindings);
  }

  if (ts.isForOfStatement(statement)) {
    return loweredStatementResult(lowerForOfStatement(context, statement, bindings), statement, bindings);
  }

  if (ts.isForInStatement(statement)) {
    return loweredStatementResult(lowerForInStatement(context, statement, bindings), statement, bindings);
  }

  if (ts.isDoStatement(statement)) {
    return loweredStatementResult(lowerDoWhileStatement(context, statement, bindings), statement, bindings);
  }

  if (ts.isBreakStatement(statement)) {
    return lowerLabelledJump(context, "break", statement.label);
  }

  if (ts.isContinueStatement(statement)) {
    return lowerLabelledJump(context, "continue", statement.label);
  }

  if (ts.isLabeledStatement(statement)) {
    return lowerLabelledStatement(context, statement, bindings);
  }

  if (ts.isFunctionDeclaration(statement)) {
    return lowerFunctionDeclaration(context, statement, bindings);
  }

  // A `namespace` is a statement whose value is an object, and the object-literal tier already knows how
  // to build one. Only the non-module kind reaches here: `declare module` is a `declare` declaration and
  // `isNonExecutableDeclaration` has already dropped it.
  if (ts.isModuleDeclaration(statement)) {
    return lowerNamespaceDeclarationStatement(context, statement, bindings);
  }

  // An enum's value is an object holding both the forward and reverse mappings, so it lowers to the same
  // runtime-object literal a namespace does.
  if (ts.isEnumDeclaration(statement)) {
    return lowerEnumDeclarationStatement(statement);
  }

  if (ts.isReturnStatement(statement)) {
    return loweredStatementResult(lowerReturnStatement(context, statement, bindings), statement, bindings);
  }

  if (ts.isThrowStatement(statement)) {
    return loweredStatementResult(lowerThrowStatement(context, statement, bindings), statement, bindings);
  }

  if (ts.isTryStatement(statement)) {
    return lowerTryCatchStatement(context, statement, bindings);
  }

  if (ts.isExpressionStatement(statement)) {
    return loweredStatementResult(lowerExpressionStatement(context, statement.expression, bindings), statement, bindings);
  }

  return notApplicable;
}
