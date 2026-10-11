import ts from "typescript";
import { isRuntimeIdentifierReference } from "./captures.js";
import { isUndefinedExpression, unwrapTypeOnlyExpression } from "./predicates.js";

/**
 * Which `let` and `var` declarations of a source file need boxed storage.
 *
 * Lowering chooses a binding's representation from its initializer: a number initializer gives a
 * `double` slot, a string one a string slot. A later write of another kind cannot fit that slot.
 * This plan reads every write to every declaration before any statement lowers, so the choice is
 * made once and never patched. A declaration is boxed when it has no initializer, when its
 * initializer is followed by a later write and the writes include a nullish value, a non-scalar
 * (an object, array, `new`, function, class or regular expression), or two different scalar kinds.
 *
 * Writes are classified from syntax alone, because lowering also runs without a type checker. A
 * write the syntax does not decide (a call, an identifier) is `unknown` and changes nothing: such a
 * declaration lowers from its initializer as before, and a mismatched write is refused where it is
 * lowered. Captured bindings need nothing here, because binding resolution gives them a shared
 * environment cell whatever their representation.
 *
 * Loop items (`for (let x of ...)`) are not planned: their loop operation fixes their
 * representation. They are still recorded as declarations so they shadow outer names.
 */
export interface StoragePlan {
  readonly boxed: ReadonlySet<ts.VariableDeclaration>;
}

export const emptyStoragePlan: StoragePlan = { boxed: new Set() };

export function isBoxedDeclaration(plan: StoragePlan, declaration: ts.VariableDeclaration): boolean {
  return plan.boxed.has(declaration);
}

export type StorageWriteKind = "number" | "string" | "boolean" | "nullish" | "nonScalar" | "unknown";

/** The kind of value one write stores, or `unknown` when the syntax does not decide it. */
export function classifyStorageWrite(expression: ts.Expression): StorageWriteKind {
  const unwrapped = unwrapTypeOnlyExpression(expression);
  if (unwrapped.kind === ts.SyntaxKind.NullKeyword || isUndefinedExpression(unwrapped) || ts.isVoidExpression(unwrapped)) {
    return "nullish";
  }
  if (unwrapped.kind === ts.SyntaxKind.TrueKeyword || unwrapped.kind === ts.SyntaxKind.FalseKeyword ||
    ts.isDeleteExpression(unwrapped)) {
    return "boolean";
  }
  if (ts.isNumericLiteral(unwrapped) || isSignedNumericLiteral(unwrapped)) {
    return "number";
  }
  if (ts.isStringLiteral(unwrapped) || ts.isNoSubstitutionTemplateLiteral(unwrapped) || ts.isTemplateExpression(unwrapped) ||
    ts.isTypeOfExpression(unwrapped)) {
    return "string";
  }
  if (isNonScalarLiteral(unwrapped)) {
    return "nonScalar";
  }
  return "unknown";
}

function isSignedNumericLiteral(expression: ts.Expression): boolean {
  return ts.isPrefixUnaryExpression(expression) &&
    (expression.operator === ts.SyntaxKind.MinusToken || expression.operator === ts.SyntaxKind.PlusToken) &&
    ts.isNumericLiteral(expression.operand);
}

function isNonScalarLiteral(expression: ts.Expression): boolean {
  return ts.isObjectLiteralExpression(expression) || ts.isArrayLiteralExpression(expression) || ts.isNewExpression(expression) ||
    ts.isArrowFunction(expression) || ts.isFunctionExpression(expression) || ts.isClassExpression(expression) ||
    expression.kind === ts.SyntaxKind.RegularExpressionLiteral;
}

/**
 * The kind a compound assignment stores. Arithmetic and bitwise operators always produce a number;
 * `+=` produces a string when its right side is one and is otherwise undecided; the logical
 * assignments store their right side or keep the current value.
 */
function compoundWriteKind(operator: ts.SyntaxKind, right: ts.Expression): StorageWriteKind {
  switch (operator) {
    case ts.SyntaxKind.PlusEqualsToken: {
      return classifyStorageWrite(right) === "string" ? "string" : "unknown";
    }
    case ts.SyntaxKind.BarBarEqualsToken:
    case ts.SyntaxKind.AmpersandAmpersandEqualsToken:
    case ts.SyntaxKind.QuestionQuestionEqualsToken: {
      return classifyStorageWrite(right);
    }
    default: {
      return "number";
    }
  }
}

/** One planned declaration: its first declarator and every kind written to it. */
interface PlannedBinding {
  readonly declaration: ts.VariableDeclaration;
  readonly writes: StorageWriteKind[];
  hasInitializer: boolean;
}

/**
 * A lexical scope of the walk. A name maps to its planned binding, or to `undefined` when the
 * declaration that owns it is not planned (a `const`, parameter, loop item, function or class),
 * which still stops resolution from reaching an outer binding of the same name.
 */
interface PlanScope {
  readonly parent: PlanScope | undefined;
  readonly isFunction: boolean;
  readonly names: Map<string, PlannedBinding | undefined>;
}

class StoragePlanWalk {
  readonly #bindings: PlannedBinding[] = [];

  public plan(): StoragePlan {
    return { boxed: new Set(this.#bindings.filter(needsBoxedStorage).map((binding) => binding.declaration)) };
  }

  public statements(statements: readonly ts.Statement[], scope: PlanScope): void {
    for (const statement of statements) {
      this.#hoistFunctionName(statement, scope);
    }
    for (const statement of statements) {
      this.#node(statement, scope);
    }
  }

  #node(node: ts.Node, scope: PlanScope): void {
    if (this.#scopeNode(node, scope) || this.#writeNode(node, scope) || ts.isIdentifier(node)) {
      return;
    }
    if (ts.isClassDeclaration(node) || ts.isEnumDeclaration(node) || ts.isModuleDeclaration(node)) {
      if (node.name !== undefined && ts.isIdentifier(node.name)) shadow(scope, node.name.text);
    }
    ts.forEachChild(node, (child) => this.#node(child, scope));
  }

  /** Walks a node that opens a scope or declares names, and reports whether it was one. */
  #scopeNode(node: ts.Node, scope: PlanScope): boolean {
    if (ts.isFunctionLike(node)) {
      this.#function(node, scope);
    } else if (ts.isVariableDeclarationList(node)) {
      this.#declarationList(node, scope);
    } else if (ts.isBlock(node) || ts.isModuleBlock(node) || ts.isCaseBlock(node)) {
      this.#block(node, scope);
    } else if (ts.isCatchClause(node)) {
      this.#catchClause(node, scope);
    } else if (ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node)) {
      this.#loop(node, scope);
    } else {
      return false;
    }
    return true;
  }

  /** Records an assignment or update of an identifier, and reports whether the node was one. */
  #writeNode(node: ts.Node, scope: PlanScope): boolean {
    if (ts.isBinaryExpression(node) && isAssignmentOperator(node.operatorToken.kind) && ts.isIdentifier(node.left)) {
      this.#assignment(node.left, node.operatorToken.kind, node.right, scope);
      return true;
    }
    if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) && isUpdateOperator(node.operator) &&
      ts.isIdentifier(node.operand)) {
      resolve(scope, node.operand.text)?.writes.push("number");
      return true;
    }
    return false;
  }

  #hoistFunctionName(statement: ts.Statement, scope: PlanScope): void {
    if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
      shadow(scope, statement.name.text);
    }
  }

  #function(node: ts.SignatureDeclaration, scope: PlanScope): void {
    // A named function expression binds its own name in a scope between the outer one and its body.
    const named = childScope(scope, true);
    if (ts.isFunctionExpression(node) && node.name !== undefined) shadow(named, node.name.text);
    const body = childScope(named, true);
    for (const parameter of node.parameters) {
      this.#bindingName(parameter.name, body);
      if (parameter.initializer !== undefined) this.#node(parameter.initializer, body);
    }
    if (!("body" in node) || node.body === undefined) {
      return;
    }
    if (ts.isBlock(node.body)) {
      this.statements(node.body.statements, body);
    } else {
      this.#node(node.body, body);
    }
  }

  #block(node: ts.Block | ts.ModuleBlock | ts.CaseBlock, scope: PlanScope): void {
    const block = childScope(scope, false);
    if (ts.isCaseBlock(node)) {
      for (const clause of node.clauses) {
        if (ts.isCaseClause(clause)) this.#node(clause.expression, block);
        this.statements(clause.statements, block);
      }
      return;
    }
    this.statements(node.statements, block);
  }

  #catchClause(node: ts.CatchClause, scope: PlanScope): void {
    const clause = childScope(scope, false);
    if (node.variableDeclaration !== undefined) this.#bindingName(node.variableDeclaration.name, clause);
    this.#block(node.block, clause);
  }

  #loop(node: ts.ForStatement | ts.ForOfStatement | ts.ForInStatement, scope: PlanScope): void {
    const loop = childScope(scope, false);
    if (ts.isForStatement(node)) {
      for (const part of [node.initializer, node.condition, node.incrementor]) {
        if (part !== undefined) this.#node(part, loop);
      }
    } else {
      this.#node(node.expression, loop);
      this.#loopItem(node.initializer, loop);
    }
    this.#node(node.statement, loop);
  }

  /** A `for...of` or `for...in` item: a declared item shadows, an assigned identifier is written. */
  #loopItem(initializer: ts.ForInitializer, loop: PlanScope): void {
    if (ts.isVariableDeclarationList(initializer)) {
      const owner = isVarList(initializer) ? functionScope(loop) : loop;
      for (const declaration of initializer.declarations) this.#bindingName(declaration.name, owner);
    } else if (ts.isIdentifier(initializer)) {
      resolve(loop, initializer.text)?.writes.push("unknown");
    } else {
      this.#node(initializer, loop);
    }
  }

  #declarationList(list: ts.VariableDeclarationList, scope: PlanScope): void {
    const isConst = (list.flags & ts.NodeFlags.Const) !== 0;
    for (const declaration of list.declarations) {
      if (isConst || !ts.isIdentifier(declaration.name)) {
        this.#bindingName(declaration.name, scope);
      } else {
        this.#declare(declaration, declaration.name.text, isVarList(list) ? functionScope(scope) : scope);
      }
      if (declaration.initializer !== undefined) this.#node(declaration.initializer, scope);
    }
  }

  /**
   * Records a `let` or `var` declarator. A `var` that redeclares a name its function already
   * declared is the same binding, so its initializer is one more write to the first declarator.
   */
  #declare(declaration: ts.VariableDeclaration, name: string, scope: PlanScope): void {
    const existing = scope.names.get(name);
    const binding = existing ?? { declaration, writes: [], hasInitializer: false };
    if (existing === undefined) {
      scope.names.set(name, binding);
      this.#bindings.push(binding);
    }
    if (declaration.initializer === undefined) {
      return;
    }
    binding.writes.push(classifyStorageWrite(declaration.initializer));
    binding.hasInitializer = true;
  }

  #assignment(target: ts.Identifier, operator: ts.SyntaxKind, right: ts.Expression, scope: PlanScope): void {
    const kind = operator === ts.SyntaxKind.EqualsToken ? classifyStorageWrite(right) : compoundWriteKind(operator, right);
    if (isRuntimeIdentifierReference(target)) resolve(scope, target.text)?.writes.push(kind);
    this.#node(right, scope);
  }

  /** Declares every name a binding pattern introduces as unplanned, and walks its defaults. */
  #bindingName(name: ts.BindingName, scope: PlanScope): void {
    if (ts.isIdentifier(name)) {
      shadow(scope, name.text);
      return;
    }
    for (const element of name.elements) {
      if (ts.isOmittedExpression(element)) continue;
      this.#bindingName(element.name, scope);
      if (element.initializer !== undefined) this.#node(element.initializer, scope);
    }
  }
}

/**
 * A binding written only by its initializer keeps the representation lowering chooses for that
 * initializer, whatever it is. One with no initializer starts as `undefined`, which only a boxed
 * slot holds. Otherwise every write must fit one scalar kind.
 */
function needsBoxedStorage(binding: PlannedBinding): boolean {
  if (!binding.hasInitializer) {
    return true;
  }
  if (binding.writes.length === 1) {
    return false;
  }
  if (binding.writes.some((kind) => kind === "nullish" || kind === "nonScalar")) {
    return true;
  }
  const scalarKinds = new Set(binding.writes.filter((kind) => kind === "number" || kind === "string" || kind === "boolean"));
  return scalarKinds.size > 1;
}

function childScope(parent: PlanScope, isFunction: boolean): PlanScope {
  return { parent, isFunction, names: new Map() };
}

function functionScope(scope: PlanScope): PlanScope {
  let current = scope;
  while (!current.isFunction && current.parent !== undefined) current = current.parent;
  return current;
}

function shadow(scope: PlanScope, name: string): void {
  if (!scope.names.has(name)) scope.names.set(name, undefined);
}

function resolve(scope: PlanScope, name: string): PlannedBinding | undefined {
  for (let current: PlanScope | undefined = scope; current !== undefined; current = current.parent) {
    if (current.names.has(name)) return current.names.get(name);
  }
  return undefined;
}

function isVarList(list: ts.VariableDeclarationList): boolean {
  return (list.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) === 0;
}

function isUpdateOperator(operator: ts.SyntaxKind): boolean {
  return operator === ts.SyntaxKind.PlusPlusToken || operator === ts.SyntaxKind.MinusMinusToken;
}

function isAssignmentOperator(operator: ts.SyntaxKind): boolean {
  return operator >= ts.SyntaxKind.FirstAssignment && operator <= ts.SyntaxKind.LastAssignment;
}

/** Plans every `let` and `var` declaration in a source file, before any of it lowers. */
export function collectStoragePlan(sourceFile: ts.SourceFile): StoragePlan {
  const walk = new StoragePlanWalk();
  walk.statements(sourceFile.statements, { parent: undefined, isFunction: true, names: new Map() });
  return walk.plan();
}
