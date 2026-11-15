import ts from "typescript";
import type { JsIrValueExpression } from "./expressions.js";
import type { JsIrBindingValue, JsIrFunctionObjectDefinition, JsIrValueKind } from "./bindings.js";
import type { JsIrOperation } from "./types.js";

/**
 * Which names a function captures, and how a closure reads one.
 *
 * A function object in this language is a real definition with a real environment, not a value copied
 * at the point of the expression. So before one can be emitted the compiler has to answer two questions:
 * which outer names its body mentions, and — for the name *it* is bound to — whether it mentions itself.
 * `collectFunctionDeclarationEnclosingCaptureNames` and `collectFunctionExpressionCaptureNames` are the
 * first; `functionExpressionSelfReferences` is the second, and it is a different question because a
 * self-reference is what makes a declaration a function rather than a closure over its own name.
 *
 * `identifierResolvesInEnclosingFunction` is what keeps the answer honest. An identifier inside a
 * function body resolves to a capture only if no parameter or local shadows it, so a walk that skipped
 * the shadow check would capture names the body never reads and emit an environment slot for each.
 *
 * `collectPromotedAggregateNames` is the same question for aggregates: an object or array literal
 * declared outside a function and mentioned inside it has to be promoted, because the closure holds a
 * reference rather than a copy of its fields.
 */

export function collectPromotedAggregateNames(statements: ts.NodeArray<ts.Statement>): ReadonlySet<string> {
  const names = new Set<string>();
  for (const statement of statements) {
    if (!ts.isExpressionStatement(statement)) {
      continue;
    }
    const { expression } = statement;
    if (ts.isCallExpression(expression)) {
      if (ts.isPropertyAccessExpression(expression.expression) && ts.isIdentifier(expression.expression.expression)) {
        const method = expression.expression.name.text;
        if (method === "push" || method === "unshift" || method === "pop" || method === "shift" || method === "fill" || method === "reverse" || method === "copyWithin") {
          names.add(expression.expression.expression.text);
        }
      }
      if (ts.isPropertyAccessExpression(expression.expression) && ts.isIdentifier(expression.expression.expression) && expression.expression.expression.text === "Object" && expression.expression.name.text === "assign") {
        const [target] = expression.arguments;
        if (ts.isIdentifier(target)) {
          names.add(target.text);
        }
      }
    }
  }
  return names;
}
export function collectFunctionDeclarationEnclosingCaptureNames(
  typeChecker: ts.TypeChecker | undefined,
  declaration: ts.FunctionDeclaration,
  outerBindings: ReadonlyMap<string, JsIrBindingValue>
): readonly string[] {
  const captures: string[] = [];
  const seen = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (node !== declaration && ts.isFunctionLike(node) && !ts.isArrowFunction(node)) {
      return;
    }
    if (
      ts.isIdentifier(node) &&
      outerBindings.has(node.text) &&
      !seen.has(node.text) &&
      isRuntimeIdentifierReference(node) &&
      identifierResolvesInEnclosingFunction(typeChecker, node, declaration)
    ) {
      seen.add(node.text);
      captures.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  if (declaration.body !== undefined) {
    ts.forEachChild(declaration.body, visit);
  }
  for (const parameter of declaration.parameters) {
    visit(parameter.name);
    if (parameter.initializer !== undefined) {
      visit(parameter.initializer);
    }
  }
  return captures;
}
/**
 * Whether an identifier inside a function body reads an outer binding rather than a local one.
 *
 * The checker answers this; without one the walk can only guess, and a name it wrongly captures costs
 * an environment slot rather than a wrong answer, so the guess is the safe direction.
 */
export function identifierResolvesInEnclosingFunction(
  typeChecker: ts.TypeChecker | undefined,
  identifier: ts.Identifier,
  declaration: ts.FunctionDeclaration
): boolean {
  const symbol = typeChecker?.getSymbolAtLocation(identifier);
  if (symbol?.declarations === undefined) {
    return true;
  }
  return symbol.declarations.some((symbolDeclaration) => {
    if (
      symbolDeclaration === declaration ||
      (symbolDeclaration.getSourceFile() === declaration.getSourceFile() &&
        symbolDeclaration.pos >= declaration.pos &&
        symbolDeclaration.end <= declaration.end)
    ) {
      return false;
    }
    let ancestor = symbolDeclaration.parent;
    while (!ts.isSourceFile(ancestor)) {
      if (ts.isFunctionLike(ancestor)) {
        return true;
      }
      ancestor = ancestor.parent;
    }
    return false;
  });
}
export function isRuntimeIdentifierReference(identifier: ts.Identifier): boolean {
  if (ts.isPartOfTypeNode(identifier)) {
    return false;
  }
  const { parent } = identifier;
  if (ts.isPropertyAccessExpression(parent) && parent.name === identifier) {
    return false;
  }
  if (
    (ts.isPropertyAssignment(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isPropertyDeclaration(parent)) &&
    parent.name === identifier
  ) {
    return false;
  }
  if (ts.isBindingElement(parent) && parent.propertyName === identifier) {
    return false;
  }
  if (
    (ts.isLabeledStatement(parent) || ts.isBreakStatement(parent) || ts.isContinueStatement(parent)) &&
    parent.label === identifier
  ) {
    return false;
  }
  return true;
}
export function collectFunctionExpressionCaptureNames(
  expression: ts.ArrowFunction | ts.FunctionExpression,
  localNames: ReadonlySet<string>,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): readonly string[] {
  const captures: string[] = [];
  const seen = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (node !== expression && ts.isFunctionLike(node) && !ts.isArrowFunction(node)) {
      return;
    }
    if (ts.isIdentifier(node) && bindings.has(node.text) && !localNames.has(node.text) && !seen.has(node.text)) {
      if (!(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)) {
        seen.add(node.text);
        captures.push(node.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(expression.body);
  return captures;
}
export function lowerCapturedBindingValue(
  binding: JsIrBindingValue | undefined
): { readonly valueKind: JsIrValueKind; readonly value: JsIrValueExpression } | undefined {
  return lowerCapturedScalarValue(binding) ?? lowerCapturedAggregateValue(binding);
}

function lowerCapturedScalarValue(
  binding: JsIrBindingValue | undefined
): { readonly valueKind: JsIrValueKind; readonly value: JsIrValueExpression } | undefined {
  if (binding?.kind === "number") {
    return { valueKind: "number", value: { kind: "number", value: binding.value } };
  }
  if (binding?.kind === "string") {
    return { valueKind: "string", value: { kind: "string", value: { kind: "literal", value: binding.value } } };
  }
  if (binding?.kind === "stringExpression") {
    return { valueKind: "string", value: { kind: "string", value: binding.value } };
  }
  if (binding?.kind === "stringVariable") {
    return { valueKind: "string", value: { kind: "string", value: { kind: "variable", name: binding.name } } };
  }
  return lowerCapturedBooleanValue(binding);
}

function lowerCapturedBooleanValue(
  binding: JsIrBindingValue | undefined
): { readonly valueKind: JsIrValueKind; readonly value: JsIrValueExpression } | undefined {
  if (binding?.kind === "booleanVariable") {
    return { valueKind: "value", value: { kind: "boolean", value: { kind: "booleanVariable", name: binding.name } } };
  }
  if (binding?.kind === "boolean") {
    return { valueKind: "value", value: { kind: "boolean", value: { kind: "boolean", value: binding.value } } };
  }
  if (binding?.kind === "booleanExpression") {
    return { valueKind: "value", value: { kind: "boolean", value: binding.value } };
  }
  return undefined;
}

function lowerCapturedAggregateValue(
  binding: JsIrBindingValue | undefined
): { readonly valueKind: JsIrValueKind; readonly value: JsIrValueExpression } | undefined {
  if (binding?.kind === "value") {
    return { valueKind: "value", value: binding.value };
  }
  if (binding?.kind === "valueVariable") {
    return { valueKind: "value", value: { kind: "variable", name: binding.name } };
  }
  if (binding?.kind === "runtimeObject") {
    return { valueKind: "value", value: { kind: "objectRef", name: binding.name } };
  }
  if (binding?.kind === "runtimeArray") {
    return { valueKind: "value", value: { kind: "arrayRef", name: binding.name } };
  }
  return undefined;
}
export function functionExpressionSelfReferences(body: ts.ConciseBody, names: ReadonlySet<string>): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) {
      return;
    }
    if (ts.isIdentifier(node) && names.has(node.text) && isRuntimeIdentifierReference(node)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return found;
}
export function collectFunctionObjectDefinitions(operations: readonly JsIrOperation[]): readonly JsIrFunctionObjectDefinition[] {
  const definitions = new Map<string, JsIrFunctionObjectDefinition>();
  const visited = new Set<object>();
  const visit = (value: unknown): void => {
    if (value === null || typeof value !== "object" || visited.has(value)) {
      return;
    }
    visited.add(value);
    if (Array.isArray(value)) {
      for (const element of value) {
        visit(element);
      }
      return;
    }
    if (isFunctionObjectContainer(value)) {
      definitions.set(value.definition.codeName, value.definition);
    }
    for (const child of Object.values(value)) {
      visit(child);
    }
  };
  visit(operations);
  return [...definitions.values()];
}
export function isFunctionObjectContainer(value: object): value is { readonly kind: "functionObject"; readonly definition: JsIrFunctionObjectDefinition } {
  if (!("kind" in value) || value.kind !== "functionObject" || !("definition" in value) || value.definition === null || typeof value.definition !== "object") {
    return false;
  }
  return "codeName" in value.definition && typeof value.definition.codeName === "string";
}

/**
 * Whether a binding is a mutable scalar whose reads and writes must share one cell.
 *
 * Only `let`/`var` number, string, and boolean slots qualify: every other binding either
 * inlines (const scalars) or already travels by reference (boxed values, aggregates).
 */
export function isMutableScalarBinding(binding: JsIrBindingValue | undefined): boolean {
  return binding?.kind === "stringVariable" || binding?.kind === "booleanVariable" ||
    (binding?.kind === "number" && binding.value.kind === "variable");
}

/**
 * The environment reads a nested function carries for the outer names it mentions.
 *
 * Returns `undefined` when a capture has no cell representation (a fixed aggregate, an
 * unlowered shape), so the caller declines the function form instead of emitting a closure
 * that drops the name.
 */
export function lowerInlineFunctionCaptures(
  captureNames: readonly string[],
  bindings: ReadonlyMap<string, JsIrBindingValue>
): { readonly name: string; readonly valueKind: JsIrValueKind; readonly value: JsIrValueExpression }[] | undefined {
  const captures: { readonly name: string; readonly valueKind: JsIrValueKind; readonly value: JsIrValueExpression }[] = [];
  for (const name of captureNames) {
    const binding = bindings.get(name);
    const capture = lowerCapturedBindingValue(binding);
    if (capture === undefined) {
      // A mutable scalar must travel in the environment, so a missing cell representation declines
      // the function form. Any other binding keeps its previous resolution: the body still reads
      // the outer identity, which is what marks it captured.
      if (isMutableScalarBinding(binding)) {
        return undefined;
      }
      continue;
    }
    captures.push({ name, ...capture });
  }
  return captures;
}

/**
 * Which outer names a method or constructor body reads, for its `enclosingCaptureNames`.
 *
 * Function declarations answer this with `collectFunctionDeclarationEnclosingCaptureNames`; methods
 * have no declaration node of their own, so this walks the body instead. Nested non-arrow functions
 * close over their own frame and are skipped, while nested arrows read through this frame and are
 * included, which is what makes a capture transitive to the closure that needs it. A name shadowed
 * by a parameter is never a capture; a name shadowed by a body local is over-captured without a
 * checker, which costs an environment slot rather than a wrong answer.
 */
export function collectMethodEnclosingCaptureNames(
  typeChecker: ts.TypeChecker | undefined,
  container: ts.Node,
  body: ts.Node,
  parameters: readonly ts.ParameterDeclaration[],
  outerBindings: ReadonlyMap<string, JsIrBindingValue>
): readonly string[] {
  const parameterNames = new Set<string>();
  for (const parameter of parameters) {
    if (ts.isIdentifier(parameter.name)) {
      parameterNames.add(parameter.name.text);
    }
  }
  const captures: string[] = [];
  const seen = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (node !== container && ts.isFunctionLike(node) && !ts.isArrowFunction(node)) {
      return;
    }
    if (ts.isIdentifier(node) && outerBindings.has(node.text) && !parameterNames.has(node.text) && !seen.has(node.text) &&
      isRuntimeIdentifierReference(node) && identifierResolvesOutsideContainer(typeChecker, node, container)) {
      seen.add(node.text);
      captures.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  for (const parameter of parameters) {
    visit(parameter.name);
    if (parameter.initializer !== undefined) {
      visit(parameter.initializer);
    }
  }
  return captures;
}

function identifierResolvesOutsideContainer(
  typeChecker: ts.TypeChecker | undefined,
  identifier: ts.Identifier,
  container: ts.Node
): boolean {
  const symbol = typeChecker?.getSymbolAtLocation(identifier);
  if (symbol?.declarations === undefined) {
    return true;
  }
  return symbol.declarations.some((symbolDeclaration) => symbolDeclaration.pos < container.pos || symbolDeclaration.end > container.end);
}
