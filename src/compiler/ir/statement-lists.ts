import { type LoweredStatementList, loweredOperationList } from "./lowered.js";
import type { JsIrOperation } from "./types.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import { unsupportedStatementMessage } from "./diagnostics.js";
import { isNonExecutableDeclaration } from "./comparisons.js";
import { collectFunctionDeclarationEnclosingCaptureNames } from "./captures.js";
import { updateBindings } from "./binding-updates.js";

/**
 * The operations of a lowered body, or `undefined` when it could not be lowered. A recognizer
 * that still returns `JsIrOperation | undefined` has nowhere to put the reason, so the statement
 * tier reports its own; converting that recognizer to return `Lowered` forwards the real one.
 */

export function lowerStatementBody(
  context: LoweringContext,
  statement: ts.Statement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): LoweredStatementList {
  if (ts.isBlock(statement)) {
    return lowerBlockStatements(context, statement, bindings);
  }
  return lowerStatementList(context, [statement], bindings);
}

export function lowerBlockStatements(
  context: LoweringContext,
  block: ts.Block,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): LoweredStatementList {
  return lowerStatementList(context, block.statements, bindings);
}

export function lowerStatementList(
  context: LoweringContext,
  statements: readonly ts.Statement[],
  bindings: ReadonlyMap<string, JsIrBindingValue>
): LoweredStatementList {
  const entries: ({ readonly kind: "operation"; readonly operation: JsIrOperation } |
    { readonly kind: "function"; readonly statement: ts.FunctionDeclaration })[] = [];
  const blockBindings = new Map(bindings);

  for (const statement of statements) {
    if (isNonExecutableDeclaration(statement)) {
      continue;
    }

    if (ts.isFunctionDeclaration(statement) && hasForwardCapture(context, statement, statements)) {
      entries.push({ kind: "function", statement });
      registerDeferredFunction(statement, blockBindings);
      continue;
    }
    const result = context.lowerStatement(context, statement, blockBindings);
    if (result.kind === "unsupported") {
      return result;
    }
    if (result.kind === "notApplicable") {
      return { kind: "unsupported", reason: unsupportedStatementMessage(statement, blockBindings) };
    }

    entries.push({ kind: "operation", operation: result.operation });
    updateBindings(result.operation, blockBindings);
  }

  const operations: JsIrOperation[] = [];
  for (const entry of entries) {
    if (entry.kind === "operation") {
      operations.push(entry.operation);
      continue;
    }
    const result = context.lowerStatement(context, entry.statement, blockBindings);
    if (result.kind === "unsupported") return result;
    if (result.kind === "notApplicable") {
      return { kind: "unsupported", reason: unsupportedStatementMessage(entry.statement, blockBindings) };
    }
    const refusal = forwardCaptureRefusal(result.operation, entry.statement, statements);
    if (refusal !== undefined) return { kind: "unsupported", reason: refusal };
    operations.push(result.operation);
    updateBindings(result.operation, blockBindings);
  }
  return loweredOperationList(operations);
}

/** Loop declarations currently renew their cells at the declaration, after hoisted closures capture. */
function isInsideLoop(statement: ts.Statement): boolean {
  for (let node: ts.Node = statement.parent; !ts.isSourceFile(node); node = node.parent) {
    if (ts.isFunctionLike(node)) return false;
    if (ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node) ||
      ts.isWhileStatement(node) || ts.isDoStatement(node)) return true;
  }
  return false;
}

function isConstDeclaration(statements: readonly ts.Statement[], name: string): boolean {
  return statements.some((statement) => ts.isVariableStatement(statement) &&
    (statement.declarationList.flags & ts.NodeFlags.Const) !== 0 &&
    statement.declarationList.declarations.some((declaration) => bindingContains(declaration.name, name)));
}

function bindingContains(binding: ts.BindingName, name: string): boolean {
  return ts.isIdentifier(binding) ? binding.text === name
    : binding.elements.some((element) => !ts.isOmittedExpression(element) && bindingContains(element.name, name));
}

function hasForwardCapture(
  context: LoweringContext, declaration: ts.FunctionDeclaration, statements: readonly ts.Statement[]
): boolean {
  const later = statements.slice(statements.indexOf(declaration) + 1);
  const names = new Map<string, JsIrBindingValue>();
  for (const statement of later) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const binding of statement.declarationList.declarations) collectBindingNames(binding.name, names);
  }
  return collectFunctionDeclarationEnclosingCaptureNames(context.typeChecker, declaration, names).length > 0;
}

function collectBindingNames(binding: ts.BindingName, names: Map<string, JsIrBindingValue>): void {
  if (ts.isIdentifier(binding)) { names.set(binding.text, { kind: "valueVariable", name: binding.text }); return; }
  for (const element of binding.elements) {
    if (!ts.isOmittedExpression(element)) collectBindingNames(element.name, names);
  }
}

function forwardCaptureRefusal(
  operation: JsIrOperation, declaration: ts.FunctionDeclaration, statements: readonly ts.Statement[]
): string | undefined {
  if (isInsideLoop(declaration)) return "Forward lexical capture inside a loop requires scope-entry cell allocation";
  const later = statements.slice(statements.indexOf(declaration) + 1);
  if (operation.kind === "function" && later.some((statement) => ts.isVariableStatement(statement) &&
    statement.declarationList.declarations.some((binding) => !ts.isIdentifier(binding.name) &&
      (operation.enclosingCaptureNames ?? []).some((name) => bindingContains(binding.name, name))))) {
    return "Forward destructuring capture requires predeclared pattern bindings";
  }
  if (operation.kind === "function" &&
    (operation.enclosingCaptureNames ?? []).some((name) => isConstDeclaration(later, name))) {
    return "Forward const capture requires a non-folded lexical read";
  }
  return undefined;
}

/** Calls can use the boxed function object before its body has been lowered. */
function registerDeferredFunction(declaration: ts.FunctionDeclaration, bindings: Map<string, JsIrBindingValue>): void {
  if (declaration.name !== undefined) {
    bindings.set(declaration.name.text, { kind: "valueVariable", name: declaration.name.text, valueType: "function" });
  }
}
