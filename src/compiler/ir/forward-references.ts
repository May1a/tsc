import { isRuntimeIdentifierReference } from "./captures.js";
import { boundNames } from "./predicates.js";
import { isNonExecutableDeclaration } from "./comparisons.js";
import ts from "typescript";

/**
 * The names of `order` that a closure mentions at or before the statement declaring them.
 *
 * `order` maps each name to the index of its declaring statement. Such a name cannot keep a folded
 * or unboxed representation, because the closure exists before its initializer runs. A name a
 * parameter shadows is not a reference; one a body local shadows is reported, which costs a boxed
 * slot rather than a wrong answer.
 */
export function collectForwardReferences(
  statements: readonly ts.Statement[],
  order: ReadonlyMap<string, number>
): ReadonlySet<string> {
  if (order.size === 0) {
    return new Set();
  }
  return new Set(statements.flatMap((statement, index) =>
    isNonExecutableDeclaration(statement) ? [] : closuresIn(statement).flatMap((closure) =>
      referencedNames(closure, new Set([...order].filter(([, declared]) => declared >= index).map(([name]) => name))))));
}

function closuresIn(node: ts.Node): readonly ts.Node[] {
  if (ts.isFunctionLike(node) || ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
    return [node];
  }
  const closures: ts.Node[] = [];
  ts.forEachChild(node, (child) => { closures.push(...closuresIn(child)); });
  return closures;
}

function referencedNames(node: ts.Node, names: ReadonlySet<string>): readonly string[] {
  if (ts.isIdentifier(node)) {
    return names.has(node.text) && isRuntimeIdentifierReference(node) && !isDeclarationName(node) ? [node.text] : [];
  }
  const parameters = ts.isFunctionLike(node) ? new Set(node.parameters.flatMap((parameter) => boundNames(parameter.name))) : new Set<string>();
  const visible = new Set([...names].filter((name) => !parameters.has(name)));
  const referenced: string[] = [];
  ts.forEachChild(node, (child) => { referenced.push(...referencedNames(child, visible)); });
  return referenced;
}

function isDeclarationName(identifier: ts.Identifier): boolean {
  const { parent } = identifier;
  return (ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isBindingElement(parent) ||
    ts.isFunctionDeclaration(parent) || ts.isFunctionExpression(parent)) && parent.name === identifier;
}
