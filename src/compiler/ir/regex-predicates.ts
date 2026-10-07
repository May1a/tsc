import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";

export function isRegExpConstructorCall(node: ts.Node): node is ts.NewExpression {
  return ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "RegExp";
}

export function isRegexExpression(expression: ts.Expression, bindings: ReadonlyMap<string, JsIrBindingValue>): boolean {
  if (expression.kind === ts.SyntaxKind.RegularExpressionLiteral || isRegExpConstructorCall(expression)) {
    return true;
  }
  if (!ts.isIdentifier(expression)) {
    return false;
  }
  const binding = bindings.get(expression.text);
  return binding?.kind === "valueVariable" && binding.valueType === "regex";
}
