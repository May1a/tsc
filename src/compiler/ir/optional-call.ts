import type ts from "typescript";

// still evaluates the callee; it just skips the dispatch when the result is nullish.
export function optionalStatementCallee(expression: ts.CallExpression): true | undefined {
  if (expression.questionDotToken === undefined) {
    return undefined;
  }
  return true;
}
