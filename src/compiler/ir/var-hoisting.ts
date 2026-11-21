import ts from "typescript";
import type { LoweringContext } from "./context.js";
import type { JsIrBindingValue } from "./bindings.js";
import type { JsIrOperation } from "./types.js";

/**
 * Collects identifier names declared by nested `var` statements or loop headers inside `statements`
 * (without crossing into nested functions or classes) so they can be hoisted as function-scoped
 * boxed bindings at the top of the enclosing module or function body.
 */
export function collectHoistedNestedVarNames(
  statements: readonly ts.Statement[],
  excludedNames: ReadonlySet<string> = new Set()
): readonly string[] {
  const topLevelDeclared = new Set<string>(excludedNames);
  const hoisted: string[] = [];
  const seen = new Set<string>();

  for (const statement of statements) {
    recordTopLevelDeclarations(statement, topLevelDeclared);
    collectFromNestedStatement(statement, topLevelDeclared, seen, hoisted);
  }
  return hoisted;
}

/**
 * Runs `lower` with any nested `var` declarations in `statements` pre-hoisted into `bindings` and
 * `context.hoistedVars`, passing the synthesized `letValue` preface operations to `lower`.
 */
export function withHoistedVars<T>(
  context: LoweringContext,
  statements: readonly ts.Statement[],
  bindings: Map<string, JsIrBindingValue>,
  parameterNames: ReadonlySet<string>,
  lower: (preface: readonly JsIrOperation[]) => T
): T {
  const hoistedNames = collectHoistedNestedVarNames(statements, parameterNames);
  const preface: JsIrOperation[] = hoistedNames.map((name) => ({
    kind: "letValue",
    name,
    value: { kind: "undefined" },
    functionScoped: true
  }));
  for (const name of hoistedNames) {
    bindings.set(name, { kind: "valueVariable", name });
  }
  const previous = context.hoistedVars;
  context.hoistedVars = new Set(hoistedNames);
  try {
    return lower(preface);
  } finally {
    context.hoistedVars = previous;
  }
}

function recordTopLevelDeclarations(statement: ts.Statement, declared: Set<string>): void {
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      collectBindingIdentifiers(declaration.name, declared);
    }
    return;
  }
  if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) &&
    statement.name !== undefined && ts.isIdentifier(statement.name)) {
    declared.add(statement.name.text);
  }
}

function collectBindingIdentifiers(name: ts.BindingName, out: Set<string>): void {
  if (ts.isIdentifier(name)) {
    out.add(name.text);
    return;
  }
  for (const element of name.elements) {
    if (!ts.isOmittedExpression(element)) {
      collectBindingIdentifiers(element.name, out);
    }
  }
}

function isVarDeclarationList(list: ts.VariableDeclarationList): boolean {
  return (list.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) === 0;
}

function collectFromNestedStatement(
  statement: ts.Statement,
  excluded: ReadonlySet<string>,
  seen: Set<string>,
  out: string[]
): void {
  if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isVariableStatement(statement)) {
    return;
  }
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionLike(node) || ts.isClassLike(node)) {
      return;
    }
    if (ts.isVariableDeclarationList(node) && isVarDeclarationList(node)) {
      for (const declaration of node.declarations) {
        if (ts.isIdentifier(declaration.name) && !excluded.has(declaration.name.text) && !seen.has(declaration.name.text)) {
          seen.add(declaration.name.text);
          out.push(declaration.name.text);
        }
      }
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(statement);
}
