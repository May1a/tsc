import ts from "typescript";

export function iteratorErrorSubject(expression: ts.Expression): string {
  let current = expression;
  while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isTypeAssertionExpression(current) || ts.isNonNullExpression(current)) {
    current = current.expression;
  }
  if (ts.isIdentifier(current)) {
    return current.text;
  }
  return "value";
}
