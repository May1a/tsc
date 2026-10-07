import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import type { JsIrOperation } from "./types.js";
import { type Lowered, type LoweredStatementList, type Produced, loweredOperation, notApplicable, produced, unsupportedIn } from "./lowered.js";
import { lowerBlockStatements } from "./statement-lists.js";
import { type DestructuringSource, lowerArrayDestructuringElements } from "./destructuring.js";
import { unwrapTypeOnlyExpression } from "./predicates.js";
import { lowerRuntimeErrorLiteral } from "./errors.js";

export function lowerThrowStatement(
  context: LoweringContext,
  statement: ts.ThrowStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (context.finallyBlockDepth > 0 && context.tryRegionOfCatchFinallyDepth > 0) {
    return notApplicable;
  }
  const value = context.lowerValueExpression(context, statement.expression, bindings);
  if (value.kind !== "lowered") {
    return value;
  }
  return produced({ kind: "throwValue", value: value.operation });
}

function lowerTryRegionOperations(
  context: LoweringContext,
  statement: ts.TryStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): LoweredStatementList {
  const tracksTryRegion = statement.catchClause !== undefined && statement.finallyBlock !== undefined;
  if (tracksTryRegion) {
    context.tryRegionOfCatchFinallyDepth += 1;
  }
  try {
    return lowerBlockStatements(context, statement.tryBlock, bindings);
  } finally {
    if (tracksTryRegion) {
      context.tryRegionOfCatchFinallyDepth -= 1;
    }
  }
}

function lowerFinallyBlockOperations(
  context: LoweringContext,
  block: ts.Block,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): LoweredStatementList {
  context.finallyBlockDepth += 1;
  try {
    return lowerBlockStatements(context, block, bindings);
  } finally {
    context.finallyBlockDepth -= 1;
  }
}

export function lowerTryCatchStatement(
  context: LoweringContext,
  statement: ts.TryStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  // Semantically-equivalent compile-time shortcut for the direct
  // `try { throw expr; } catch (e) { ... }` shape without finally. It avoids real
  // exception machinery for the common cases (error construction and plain value
  // throws) and does not conflict with the general `tryCatch` lowering below.
  if (statement.finallyBlock === undefined) {
    const shortcut = lowerDirectThrowTryCatchShortcut(context, statement, bindings);
    if (shortcut.kind === "unsupported") {
      return shortcut;
    }
    if (shortcut.kind === "lowered") {
      return loweredOperation(shortcut.operation);
    }
  }

  // General path: lower try/catch/finally using normal block statement lowering.
  // The catch variable is bound as a value variable and is lexically scoped to the
  // catch block (a fresh binding map shadows any outer binding of the same name
  // without leaking outwards). Cleanup/completion routing for finally is owned by
  // the LLVM backend's shared cleanup stack.
  const tryOperations = lowerTryRegionOperations(context, statement, bindings);
  if (tryOperations.kind === "unsupported") {
    return tryOperations;
  }

  const { catchClause } = statement;
  let catchVariable = "";
  let catchOperations: readonly JsIrOperation[] = [];
  if (catchClause !== undefined) {
    const loweredCatchResult = lowerCatchClause(context, statement, catchClause, bindings);
    if (loweredCatchResult.kind === "unsupported") {
      return loweredCatchResult;
    }
    const loweredCatch = loweredCatchResult.operation;
    catchVariable = loweredCatch.variable;
    catchOperations = loweredCatch.operations;
  }

  let finallyOperations: readonly JsIrOperation[] | undefined;
  if (statement.finallyBlock !== undefined) {
    const loweredFinally = lowerFinallyBlockOperations(context, statement.finallyBlock, bindings);
    if (loweredFinally.kind === "unsupported") {
      return loweredFinally;
    }
    finallyOperations = loweredFinally.operation;
  }

  if (catchClause === undefined && finallyOperations === undefined) {
    // `try { ... }` with neither catch nor finally is not valid TypeScript;
    // defensively run the try body as a plain block.
    return loweredOperation({ kind: "block", operations: tryOperations.operation });
  }

  return loweredOperation({
    kind: "tryCatch",
    tryOperations: tryOperations.operation,
    catchVariable,
    catchOperations,
    hasCatch: catchClause !== undefined,
    finallyOperations
  });
}

interface CatchClauseBody {
  readonly variable: string;
  readonly operations: readonly JsIrOperation[];
}

function lowerCatchClause(
  context: LoweringContext,
  statement: ts.TryStatement,
  catchClause: ts.CatchClause,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<CatchClauseBody> {
  const catchBindings = new Map(bindings);
  const catchBinding = catchClause.variableDeclaration?.name;
  const destructuringOperations: JsIrOperation[] = [];
  let variable = catchBindingName(catchClause);
  if (catchBinding !== undefined && (ts.isArrayBindingPattern(catchBinding) || ts.isObjectBindingPattern(catchBinding))) {
    variable = `__catch${statement.pos}`;
    catchBindings.set(variable, { kind: "valueVariable", name: variable });
    const source: DestructuringSource = { name: variable, binding: { kind: "valueVariable", name: variable } };
    let lowered: boolean;
    if (ts.isArrayBindingPattern(catchBinding)) {
      const arrayDestructuringElementsResult = lowerArrayDestructuringElements(context, catchBinding, source, catchBindings, destructuringOperations, true);
      if (arrayDestructuringElementsResult.kind === "unsupported") {
        return arrayDestructuringElementsResult;
      }
      lowered = arrayDestructuringElementsResult.operation;
    } else {
      const objectDestructuringElementsResult = context.lowerObjectDestructuringElements(context, catchBinding, source, catchBindings, destructuringOperations, true);
      if (objectDestructuringElementsResult.kind === "unsupported") {
        return objectDestructuringElementsResult;
      }
      lowered = objectDestructuringElementsResult.operation;
    }
    if (!lowered) {
      return unsupportedIn("Destructuring a catch binding is not supported");
    }
  } else if (variable !== "") {
    catchBindings.set(variable, { kind: "valueVariable", name: variable });
  }
  const blockOperations = lowerBlockStatements(context, catchClause.block, catchBindings);
  if (blockOperations.kind === "unsupported") {
    return blockOperations;
  }
  return produced({ variable, operations: [...destructuringOperations, ...blockOperations.operation] });
}

function catchBindingName(catchClause: ts.CatchClause): string {
  const variable = catchClause.variableDeclaration?.name;
  if (variable !== undefined && ts.isIdentifier(variable)) {
    return variable.text;
  }
  return "";
}

function lowerDirectThrowTryCatchShortcut(
  context: LoweringContext,
  statement: ts.TryStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const { catchClause } = statement;
  if (catchClause === undefined || statement.tryBlock.statements.length !== 1) {
    return notApplicable;
  }
  const [throwStatement] = statement.tryBlock.statements;
  if (!ts.isThrowStatement(throwStatement)) {
    return notApplicable;
  }
  const catchVariable = catchBindingName(catchClause);
  if (catchVariable === "") {
    return notApplicable;
  }
  const errorCatch = lowerErrorTryCatchStatement(context, statement, throwStatement, catchVariable, bindings);
  if (errorCatch.kind !== "notApplicable") {
    return errorCatch;
  }
  const thrown = context.lowerValueExpression(context, throwStatement.expression, bindings);
  if (thrown.kind !== "lowered") {
    return thrown;
  }
  const shortcutBindings = new Map(bindings);
  shortcutBindings.set(catchVariable, { kind: "value", value: thrown.operation });
  const operationsResult = lowerBlockStatements(context, catchClause.block, shortcutBindings);
  if (operationsResult.kind === "unsupported") {
    return operationsResult;
  }
  const operations = operationsResult.operation;

  return produced({ kind: "block", operations: [{ kind: "constValue", name: catchVariable, value: thrown.operation }, ...operations] });
}

function lowerErrorTryCatchStatement(
  context: LoweringContext,
  statement: ts.TryStatement,
  throwStatement: ts.ThrowStatement,
  variableName: string,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (statement.catchClause === undefined) {
    return notApplicable;
  }
  const thrownExpression = unwrapTypeOnlyExpression(throwStatement.expression);
  const errorOperation = lowerRuntimeErrorLiteral(context, `${variableName}.thrown.${statement.pos}`, thrownExpression, bindings);
  if (errorOperation.kind === "unsupported") {
    return errorOperation;
  }
  if (errorOperation.kind === "lowered") {
    const catchBindings = new Map(bindings);
    catchBindings.set(variableName, { kind: "runtimeObject", name: errorOperation.operation.name, errorName: errorOperation.operation.errorName });
    const operationsResult = lowerBlockStatements(context, statement.catchClause.block, catchBindings);
    if (operationsResult.kind === "unsupported") {
      return operationsResult;
    }
    const operations = operationsResult.operation;

    return produced({ kind: "block", operations: [errorOperation.operation, ...operations] });
  }
  if (!ts.isIdentifier(thrownExpression)) {
    return notApplicable;
  }
  const thrownBinding = bindings.get(thrownExpression.text);
  if (thrownBinding?.kind !== "runtimeObject" && thrownBinding?.kind !== "runtimeArray") {
    return notApplicable;
  }
  const catchBindings = new Map(bindings);
  catchBindings.set(variableName, thrownBinding);
  const operationsResult = lowerBlockStatements(context, statement.catchClause.block, catchBindings);
  if (operationsResult.kind === "unsupported") {
    return operationsResult;
  }
  const operations = operationsResult.operation;

  return produced({ kind: "block", operations: [...operations] });
}
