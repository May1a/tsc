import ts from "typescript";

export function iteratorErrorSubject(expression: ts.Expression): string {
  let current = expression;
  // `satisfies` is here because it is one of the erasure-only forms: `for (const x of (xs satisfies T))`
  // erases to `for (const x of xs)`, so leaving it wrapped made the message say "value" where the erased
  // JavaScript names the subject. It is not in `unwrapTypeOnlyExpression`'s job here because this loop
  // only has to reach the identifier to name it.
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  if (ts.isIdentifier(current)) {
    return current.text;
  }
  return "value";
}
