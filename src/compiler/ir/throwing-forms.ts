import ts from "typescript";

/**
 * Forms that always throw at runtime, which this build refuses rather than lowering to their throw.
 *
 * TypeScript reports each of them as a type error (TS2588, TS2372, TS2448), so a checked program never
 * reaches here. Test262 compiles plain JavaScript with semantic diagnostics suppressed, and without
 * these checks the forms compiled to code that silently did not throw.
 */

/** An assignment, compound assignment or `++`/`--` whose target is a `const` binding throws a TypeError. */
export function constWriteRefusal(typeChecker: ts.TypeChecker | undefined, expression: ts.Expression): string | undefined {
  const target = writeTarget(expression);
  return target === undefined ? undefined : constAssignmentRefusal(typeChecker, target);
}

function writeTarget(expression: ts.Expression): ts.Expression | undefined {
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
    expression.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
    return expression.left;
  }
  if ((ts.isPrefixUnaryExpression(expression) || ts.isPostfixUnaryExpression(expression)) && isUpdateOperator(expression.operator)) {
    return expression.operand;
  }
  return undefined;
}

function isUpdateOperator(operator: ts.SyntaxKind): boolean {
  return operator === ts.SyntaxKind.PlusPlusToken || operator === ts.SyntaxKind.MinusMinusToken;
}

function constAssignmentRefusal(typeChecker: ts.TypeChecker | undefined, target: ts.Expression): string | undefined {
  if (typeChecker === undefined || !ts.isIdentifier(target)) {
    return undefined;
  }
  const declaration = typeChecker.getSymbolAtLocation(target)?.valueDeclaration;
  if (declaration === undefined || !isConstDeclaration(declaration)) {
    return undefined;
  }
  return `Assigning to the constant \`${target.text}\` throws a TypeError, which this build does not lower yet`;
}

function isConstDeclaration(declaration: ts.Declaration): boolean {
  if (!ts.isVariableDeclaration(declaration) && !ts.isBindingElement(declaration)) {
    return false;
  }
  return (ts.getCombinedNodeFlags(declaration) & ts.NodeFlags.Const) !== 0;
}

/**
 * The first name `expression` reads, outside any nested function, whose declaration is one of
 * `declarations`: a binding whose initialization has not run yet where `expression` evaluates, so the
 * read throws a ReferenceError.
 */
export function uninitializedReadRefusal(
  typeChecker: ts.TypeChecker | undefined,
  expression: ts.Node,
  declarations: ReadonlySet<ts.Node>
): string | undefined {
  if (typeChecker === undefined || declarations.size === 0) {
    return undefined;
  }
  let found: string | undefined;
  const visit = (node: ts.Node): void => {
    if (found !== undefined || ts.isFunctionLike(node)) {
      return;
    }
    if (ts.isIdentifier(node)) {
      const declaration = typeChecker.getSymbolAtLocation(node)?.valueDeclaration;
      if (declaration !== undefined && declarations.has(declaration)) {
        found = node.text;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(expression);
  return found === undefined
    ? undefined
    : `Reading \`${found}\` before its binding is initialized throws a ReferenceError, which this build does not lower yet`;
}

/** The declarations a binding name introduces: an identifier's own, and every element of a pattern. */
export function bindingDeclarations(name: ts.BindingName): readonly ts.Node[] {
  if (ts.isIdentifier(name)) {
    return [name.parent];
  }
  return name.elements.flatMap((element) => ts.isOmittedExpression(element) ? [] : bindingDeclarations(element.name));
}

/** A parameter's default that reads its own parameter, or a later one, before it is initialized. */
export function uninitializedParameterRefusal(
  typeChecker: ts.TypeChecker | undefined,
  parameters: readonly ts.ParameterDeclaration[],
  index: number
): string | undefined {
  const initializer = parameters.at(index)?.initializer;
  if (initializer === undefined) {
    return undefined;
  }
  const declarations = new Set<ts.Node>();
  for (const parameter of parameters.slice(index)) {
    declarations.add(parameter);
    for (const declaration of bindingDeclarations(parameter.name)) {
      declarations.add(declaration);
    }
  }
  return uninitializedReadRefusal(typeChecker, initializer, declarations);
}
