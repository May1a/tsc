import { type Lowered, loweredPayload, notApplicable, produced } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import type { JsIrValueExpression } from "./expressions.js";
import { jsonMaxIndent, jsonStringifyMaxArgumentCount } from "./collection-values.js";
import { unwrapTypeOnlyExpression } from "./predicates.js";

// eslint-disable-next-line complexity -- JSON.stringify routes value, replacer, and indent argument shapes in one place.
export function lowerJsonStringifyCall(
  context: LoweringContext,
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  if (!ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression)) {
    return notApplicable;
  }
  if (expression.expression.expression.text !== "JSON" || expression.expression.name.text !== "stringify" || bindings.has("JSON")) {
    return notApplicable;
  }
  if (expression.arguments.length === 0 || expression.arguments.length > jsonStringifyMaxArgumentCount) {
    return notApplicable;
  }
  const value = context.lowerValueExpression(context, expression.arguments[0], bindings);
  if (value.kind !== "lowered") {
    return value;
  }
  let replacerName: string | undefined;
  if (expression.arguments.length >= 2) {
    const replacer = unwrapTypeOnlyExpression(expression.arguments[1]);
    const isNullish = replacer.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(replacer) && replacer.text === "undefined");
    if (!isNullish) {
      if (!ts.isIdentifier(replacer)) {
        return notApplicable;
      }
      const binding = bindings.get(replacer.text);
      if (binding?.kind !== "runtimeArray") {
        return notApplicable;
      }
      replacerName = binding.name;
    }
  }
  let indent = 0;
  if (expression.arguments.length === jsonStringifyMaxArgumentCount) {
    const indentExpression = unwrapTypeOnlyExpression(expression.arguments[2]);
    if (!ts.isNumericLiteral(indentExpression)) {
      return notApplicable;
    }
    indent = Math.min(Math.trunc(Number(indentExpression.text)), jsonMaxIndent);
    if (indent < 0 || Number.isNaN(indent)) {
      return notApplicable;
    }
  }
  return produced({ kind: "jsonStringify", value: value.operation, replacerName, indent });
}

const jsonParseMaxArgumentCount = 2;

export function lowerJsonParseCall(
  context: LoweringContext,
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  if (!ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression)) {
    return notApplicable;
  }
  if (expression.expression.expression.text !== "JSON" || expression.expression.name.text !== "parse" || bindings.has("JSON")) {
    return notApplicable;
  }
  if (expression.arguments.length === 0 || expression.arguments.length > jsonParseMaxArgumentCount) {
    return notApplicable;
  }
  const text = context.lowerValueExpression(context, expression.arguments[0], bindings);
  if (text.kind !== "lowered") {
    return text;
  }
  let reviver: JsIrValueExpression | undefined;
  if (expression.arguments.length === jsonParseMaxArgumentCount) {
    const valueExpressionResult = context.lowerValueExpression(context, expression.arguments[1], bindings);
    if (valueExpressionResult.kind === "unsupported") {
      return valueExpressionResult;
    }
    reviver = loweredPayload(valueExpressionResult);
    if (reviver === undefined) {
      return notApplicable;
    }
  }
  return produced({ kind: "jsonParse", text: text.operation, reviver });
}

// materialized into a fresh throwaway slot.
export function lowerJsonStatementCall(
  context: LoweringContext,
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression)) {
    return notApplicable;
  }
  if (expression.expression.expression.text !== "JSON" || bindings.has("JSON")) {
    return notApplicable;
  }
  const method = expression.expression.name.text;
  if (method !== "parse" && method !== "stringify") {
    return notApplicable;
  }
  const value = context.lowerValueExpression(context, expression, bindings);
  if (value.kind !== "lowered") {
    return value;
  }
  const name = `__tscn_json_stmt_${context.nextJsonStatementValueId}`;
  context.nextJsonStatementValueId += 1;
  return produced({ kind: "letValue", name, value: value.operation });
}
