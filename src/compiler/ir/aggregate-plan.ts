import ts from "typescript";
import { unwrapTypeOnlyExpression } from "./predicates.js";
import { isRuntimeIdentifierReference } from "./captures.js";

/** One `const`/`let`/`var` declaration initialized with an array or object literal. */
export interface PlannedAggregate {
  readonly declaration: ts.VariableDeclaration;
  readonly kind: "array" | "object";
  readonly literalKeys: ReadonlySet<string>;
  readonly ownerFunction: ts.Node | undefined;
  promoted: boolean;
}

/** Classifies a declaration's initializer as a fixed-aggregate candidate, or `undefined`. */
export function aggregateCandidateFor(
  declaration: ts.VariableDeclaration,
  ownerFunction: ts.Node | undefined
): PlannedAggregate | undefined {
  if (!ts.isIdentifier(declaration.name) || declaration.initializer === undefined) {
    return undefined;
  }
  const init = unwrapTypeOnlyExpression(declaration.initializer);
  if (ts.isArrayLiteralExpression(init)) {
    return { declaration, kind: "array", literalKeys: new Set(), ownerFunction, promoted: false };
  }
  if (ts.isObjectLiteralExpression(init) && init.properties.length > 0) {
    return { declaration, kind: "object", literalKeys: collectObjectLiteralKeys(init), ownerFunction, promoted: false };
  }
  return undefined;
}

function collectObjectLiteralKeys(literal: ts.ObjectLiteralExpression): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const property of literal.properties) {
    if (ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) {
      keys.add(property.name.text);
    }
  }
  return keys;
}

/**
 * Whether using `identifier` in its syntactic context requires its aggregate declaration to live in
 * runtime storage instead of specialized fixed array/object storage.
 */
export function useRequiresRuntimeAggregate(
  identifier: ts.Identifier,
  aggregate: PlannedAggregate,
  currentFunction: ts.Node | undefined,
  classifyWrite: (expression: ts.Expression) => string
): boolean {
  if (!isRuntimeIdentifierReference(identifier)) {
    return false;
  }
  if (aggregate.kind === "array") {
    return arrayUseRequiresRuntime(identifier, aggregate.ownerFunction, currentFunction, classifyWrite);
  }
  return objectUseRequiresRuntime(identifier, aggregate, currentFunction, classifyWrite);
}

function arrayUseRequiresRuntime(
  identifier: ts.Identifier,
  ownerFunction: ts.Node | undefined,
  currentFunction: ts.Node | undefined,
  classifyWrite: (expression: ts.Expression) => string
): boolean {
  if (ownerFunction !== undefined && ownerFunction !== currentFunction) {
    return true;
  }
  const { parent } = identifier;
  if (ts.isTypeOfExpression(parent)) {
    return false;
  }
  if (ts.isPropertyAccessExpression(parent) && parent.expression === identifier) {
    return parent.name.text !== "length" || isAssignedTarget(parent);
  }
  if (ts.isElementAccessExpression(parent) && parent.expression === identifier) {
    return elementAccessRequiresRuntimeArray(parent, classifyWrite);
  }
  if (ts.isForOfStatement(parent) && parent.expression === identifier) {
    return !isConstIdentifierForOf(parent);
  }
  if (ts.isVariableDeclaration(parent) && parent.initializer === identifier) {
    return !isSimpleConstArrayDestructuring(parent);
  }
  if (ts.isSpreadElement(parent) && (ts.isArrayLiteralExpression(parent.parent) || ts.isCallExpression(parent.parent))) {
    return false;
  }
  if (isArrayIsArrayCallArgument(identifier)) {
    return false;
  }
  return true;
}

function elementAccessRequiresRuntimeArray(
  access: ts.ElementAccessExpression,
  classifyWrite: (expression: ts.Expression) => string
): boolean {
  if (ts.isDeleteExpression(access.parent)) {
    return true;
  }
  if (ts.isStringLiteral(access.argumentExpression)) {
    return true;
  }
  if (ts.isBinaryExpression(access.parent) && access.parent.left === access && isAssignmentKind(access.parent.operatorToken.kind)) {
    const kind = classifyWrite(access.parent.right);
    return kind === "nullish" || kind === "string" || kind === "boolean" || kind === "nonScalar";
  }
  return false;
}

function objectUseRequiresRuntime(
  identifier: ts.Identifier,
  aggregate: PlannedAggregate,
  currentFunction: ts.Node | undefined,
  classifyWrite: (expression: ts.Expression) => string
): boolean {
  if (aggregate.ownerFunction !== undefined && aggregate.ownerFunction !== currentFunction) {
    return true;
  }
  const { parent } = identifier;
  if (ts.isTypeOfExpression(parent)) {
    return false;
  }
  if (ts.isPropertyAccessExpression(parent) && parent.expression === identifier) {
    return objectMemberAccessRequiresRuntime(parent, parent.name.text, aggregate.literalKeys, classifyWrite);
  }
  if (ts.isElementAccessExpression(parent) && parent.expression === identifier) {
    if (!ts.isStringLiteral(parent.argumentExpression)) {
      return true;
    }
    return objectMemberAccessRequiresRuntime(parent, parent.argumentExpression.text, aggregate.literalKeys, classifyWrite);
  }
  if (ts.isVariableDeclaration(parent) && parent.initializer === identifier) {
    return !isSimpleConstObjectDestructuring(parent, aggregate.literalKeys);
  }
  return true;
}

function objectMemberAccessRequiresRuntime(
  access: ts.PropertyAccessExpression | ts.ElementAccessExpression,
  memberKey: string,
  literalKeys: ReadonlySet<string>,
  classifyWrite: (expression: ts.Expression) => string
): boolean {
  if (!literalKeys.has(memberKey)) {
    return true;
  }
  if (ts.isCallExpression(access.parent) && access.parent.expression === access) {
    return true;
  }
  if (ts.isDeleteExpression(access.parent)) {
    return true;
  }
  let outermost: ts.Expression = access;
  while (isStaticObjectMemberStep(outermost.parent, outermost)) {
    outermost = outermost.parent;
    if (ts.isCallExpression(outermost.parent) && outermost.parent.expression === outermost) {
      return true;
    }
    if (ts.isDeleteExpression(outermost.parent)) {
      return true;
    }
  }
  if (ts.isElementAccessExpression(outermost.parent) && outermost.parent.expression === outermost) {
    return true;
  }
  if (ts.isBinaryExpression(outermost.parent) && outermost.parent.left === outermost && isAssignmentKind(outermost.parent.operatorToken.kind)) {
    const kind = classifyWrite(outermost.parent.right);
    return kind === "nullish" || kind === "string" || kind === "boolean" || kind === "nonScalar";
  }
  return false;
}

function isStaticObjectMemberStep(
  node: ts.Node,
  receiver: ts.Expression
): node is ts.PropertyAccessExpression | ts.ElementAccessExpression {
  if (ts.isPropertyAccessExpression(node) && node.expression === receiver) {
    return true;
  }
  return ts.isElementAccessExpression(node) && node.expression === receiver && ts.isStringLiteral(node.argumentExpression);
}

function isAssignedTarget(node: ts.Expression): boolean {
  const { parent } = node;
  if (ts.isBinaryExpression(parent) && parent.left === node && isAssignmentKind(parent.operatorToken.kind)) {
    return true;
  }
  return (ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) &&
    (parent.operator === ts.SyntaxKind.PlusPlusToken || parent.operator === ts.SyntaxKind.MinusMinusToken);
}

function isAssignmentKind(kind: ts.SyntaxKind): boolean {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
}

function isConstIdentifierForOf(statement: ts.ForOfStatement): boolean {
  return ts.isVariableDeclarationList(statement.initializer) &&
    (statement.initializer.flags & ts.NodeFlags.Const) !== 0 &&
    statement.initializer.declarations.length === 1 &&
    ts.isIdentifier(statement.initializer.declarations[0].name);
}

function isSimpleConstArrayDestructuring(declaration: ts.VariableDeclaration): boolean {
  if (!ts.isArrayBindingPattern(declaration.name) || !ts.isVariableDeclarationList(declaration.parent)) {
    return false;
  }
  if ((declaration.parent.flags & ts.NodeFlags.Const) === 0) {
    return false;
  }
  return declaration.name.elements.every((element) =>
    ts.isOmittedExpression(element) || (element.dotDotDotToken === undefined && ts.isIdentifier(element.name))
  );
}

function isSimpleConstObjectDestructuring(
  declaration: ts.VariableDeclaration,
  literalKeys: ReadonlySet<string>
): boolean {
  if (!ts.isObjectBindingPattern(declaration.name) || !ts.isVariableDeclarationList(declaration.parent)) {
    return false;
  }
  if ((declaration.parent.flags & ts.NodeFlags.Const) === 0) {
    return false;
  }
  return declaration.name.elements.every((element) => {
    if (element.dotDotDotToken !== undefined || !ts.isIdentifier(element.name)) {
      return false;
    }
    if (element.propertyName === undefined) {
      return literalKeys.has(element.name.text);
    }
    return (ts.isIdentifier(element.propertyName) || ts.isStringLiteral(element.propertyName)) &&
      literalKeys.has(element.propertyName.text);
  });
}

function isArrayIsArrayCallArgument(identifier: ts.Identifier): boolean {
  const { parent } = identifier;
  return ts.isCallExpression(parent) &&
    parent.arguments.length === 1 &&
    parent.arguments[0] === identifier &&
    ts.isPropertyAccessExpression(parent.expression) &&
    ts.isIdentifier(parent.expression.expression) &&
    parent.expression.expression.text === "Array" &&
    parent.expression.name.text === "isArray";
}
