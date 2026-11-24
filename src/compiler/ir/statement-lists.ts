import { type LoweredStatementList, loweredOperationList } from "./lowered.js";
import type { JsIrOperation } from "./types.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import { unsupportedStatementMessage } from "./diagnostics.js";
import { isNonExecutableDeclaration } from "./comparisons.js";
import { collectFunctionDeclarationEnclosingCaptureNames } from "./captures.js";
import { updateBindings } from "./binding-updates.js";
import { collectForwardReferences } from "./forward-references.js";

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

type StatementEntry = { readonly kind: "operation"; readonly operation: JsIrOperation } |
  { readonly kind: "function"; readonly statement: ts.FunctionDeclaration };

/** One statement list's state: what it binds so far, and what is still to be placed. */
interface StatementListState {
  readonly statements: readonly ts.Statement[];
  readonly bindings: Map<string, JsIrBindingValue>;
  readonly predeclaredConsts: ReadonlySet<string>;
  readonly repeats: boolean;
}

export function lowerStatementList(
  context: LoweringContext,
  statements: readonly ts.Statement[],
  bindings: ReadonlyMap<string, JsIrBindingValue>
): LoweredStatementList {
  const predeclaredConsts = collectClosureReferencedConsts(statements);
  const state: StatementListState = {
    statements, bindings: new Map(bindings), predeclaredConsts, repeats: statements.some(isInsideLoop)
  };
  const entries: StatementEntry[] = [];
  for (const name of predeclaredConsts) {
    state.bindings.set(name, { kind: "valueVariable", name });
    // A loop renews a declaration's cell when it executes, which would detach the closures created
    // before it, so in a loop the cell is made at the top of the body instead.
    if (state.repeats) {
      entries.push({ kind: "operation", operation: { kind: "letValue", name, value: { kind: "undefined" } } });
    }
  }
  for (const statement of statements) {
    if (isNonExecutableDeclaration(statement)) {
      continue;
    }
    const entry = lowerStatementEntry(context, statement, state);
    if (entry.kind === "unsupported") {
      return entry;
    }
    entries.push(entry);
  }
  return placeDeferredFunctions(context, entries, state);
}

function lowerStatementEntry(
  context: LoweringContext,
  statement: ts.Statement,
  state: StatementListState
): StatementEntry | { readonly kind: "unsupported"; readonly reason: string } {
  if (ts.isFunctionDeclaration(statement) && hasForwardCapture(context, statement, state.statements)) {
    registerDeferredFunction(statement, state.bindings);
    return { kind: "function", statement };
  }
  const predeclared = lowerPredeclaredConstStatement(context, statement, state);
  if (predeclared !== undefined) {
    return predeclared.kind === "lowered" ? { kind: "operation", operation: predeclared.operation } : predeclared;
  }
  const result = context.lowerStatement(context, statement, state.bindings);
  if (result.kind === "unsupported") {
    return result;
  }
  if (result.kind === "notApplicable") {
    return { kind: "unsupported", reason: unsupportedStatementMessage(statement, state.bindings) };
  }
  updateBindings(result.operation, state.bindings);
  return { kind: "operation", operation: result.operation };
}

/** Lowers the functions that had to wait until every name they capture was bound. */
function placeDeferredFunctions(
  context: LoweringContext,
  entries: readonly StatementEntry[],
  state: StatementListState
): LoweredStatementList {
  const operations: JsIrOperation[] = [];
  for (const entry of entries) {
    if (entry.kind === "operation") {
      operations.push(entry.operation);
      continue;
    }
    const result = context.lowerStatement(context, entry.statement, state.bindings);
    if (result.kind === "unsupported") return result;
    if (result.kind === "notApplicable") {
      return { kind: "unsupported", reason: unsupportedStatementMessage(entry.statement, state.bindings) };
    }
    const refusal = forwardCaptureRefusal(result.operation, entry.statement, state.statements, state.predeclaredConsts);
    if (refusal !== undefined) return { kind: "unsupported", reason: refusal };
    operations.push(result.operation);
    updateBindings(result.operation, state.bindings);
  }
  return loweredOperationList(operations);
}

function collectClosureReferencedConsts(statements: readonly ts.Statement[]): ReadonlySet<string> {
  const constOrder = new Map<string, number>();
  for (const [index, statement] of statements.entries()) {
    if (!ts.isVariableStatement(statement) || (statement.declarationList.flags & ts.NodeFlags.Const) === 0) {
      continue;
    }
    if (statement.declarationList.declarations.length !== 1) {
      continue;
    }
    const [decl] = statement.declarationList.declarations;
    if (ts.isIdentifier(decl.name) && decl.initializer !== undefined) {
      constOrder.set(decl.name.text, index);
    }
  }
  return collectForwardReferences(statements, constOrder);
}

function lowerPredeclaredConstStatement(
  context: LoweringContext,
  statement: ts.Statement,
  { predeclaredConsts, bindings, repeats }: StatementListState
): { readonly kind: "lowered"; readonly operation: JsIrOperation } | { readonly kind: "unsupported"; readonly reason: string } | undefined {
  if (!ts.isVariableStatement(statement) || statement.declarationList.declarations.length !== 1) {
    return undefined;
  }
  const [decl] = statement.declarationList.declarations;
  if (!ts.isIdentifier(decl.name) || decl.initializer === undefined || !predeclaredConsts.has(decl.name.text)) {
    return undefined;
  }
  const value = context.lowerValueExpression(context, decl.initializer, bindings);
  if (value.kind !== "lowered") {
    return {
      kind: "unsupported",
      reason: value.kind === "unsupported" ? value.reason : unsupportedStatementMessage(statement, bindings)
    };
  }
  const name = decl.name.text;
  return { kind: "lowered", operation: repeats
    ? { kind: "assignValue", name, value: value.operation }
    : { kind: "letValue", name, value: value.operation } };
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
  operation: JsIrOperation,
  declaration: ts.FunctionDeclaration,
  statements: readonly ts.Statement[],
  predeclaredConsts: ReadonlySet<string>
): string | undefined {
  if (isInsideLoop(declaration)) return "Forward lexical capture inside a loop requires scope-entry cell allocation";
  const later = statements.slice(statements.indexOf(declaration) + 1);
  if (operation.kind === "function" && later.some((statement) => ts.isVariableStatement(statement) &&
    statement.declarationList.declarations.some((binding) => !ts.isIdentifier(binding.name) &&
      (operation.enclosingCaptureNames ?? []).some((name) => bindingContains(binding.name, name))))) {
    return "Forward destructuring capture requires predeclared pattern bindings";
  }
  if (operation.kind === "function" &&
    (operation.enclosingCaptureNames ?? []).some((name) => !predeclaredConsts.has(name) && isConstDeclaration(later, name))) {
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
