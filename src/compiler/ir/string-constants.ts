import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";

export function lowerStringExpression(expression: ts.Expression, bindings: ReadonlyMap<string, JsIrBindingValue>): string | undefined {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }

  if (ts.isIdentifier(expression)) {
    const binding = bindings.get(expression.text);
    if (binding?.kind !== "string") {
      return undefined;
    }
    return binding.value;
  }

  if (!ts.isBinaryExpression(expression) || expression.operatorToken.kind !== ts.SyntaxKind.PlusToken) {
    return undefined;
  }

  const left = lowerStringExpression(expression.left, bindings);
  const right = lowerStringExpression(expression.right, bindings);
  if (left === undefined || right === undefined) {
    return undefined;
  }

  return left + right;
}
