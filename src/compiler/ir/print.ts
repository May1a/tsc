import { type Lowered, notApplicable, produced } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue, JsIrCallArgument } from "./bindings.js";
import type { JsIrExpression } from "./expressions.js";
import { isPlannedBuiltinCall } from "./builtins/index.js";
import { lowerCallArguments } from "./call-arguments.js";
import { lowerStringExpression } from "./string-constants.js";

export function lowerPrintExpression(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrExpression> {
  if (ts.isIdentifier(expression) && bindings.has(expression.text)) {
    return produced({
      kind: "identifier",
      name: expression.text
    });
  }

  const stringPrintExpression = lowerStringPrintExpression(context, expression, bindings);
  if (stringPrintExpression.kind !== "notApplicable") {
    return stringPrintExpression;
  }

  const numberArgument = context.lowerNumberExpression(context, expression, bindings);
  if (numberArgument.kind === "unsupported") {
    return numberArgument;
  }
  if (numberArgument.kind === "lowered") {
    return produced({
      kind: "number",
      value: numberArgument.operation
    });
  }

  if (expression.kind === ts.SyntaxKind.TrueKeyword || expression.kind === ts.SyntaxKind.FalseKeyword) {
    return produced({
      kind: "boolean",
      value: expression.kind === ts.SyntaxKind.TrueKeyword
    });
  }

  const valuePrintExpression = lowerValuePrintExpression(context, expression, bindings);
  if (valuePrintExpression.kind !== "notApplicable") {
    return valuePrintExpression;
  }

  if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text !== "print") {
    return lowerPrintCallExpression(context, expression.expression, expression.arguments, bindings);
  }

  return notApplicable;
}

function lowerValuePrintExpression(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrExpression> {
  const valueArgument = context.lowerValueExpression(context, expression, bindings);
  if (valueArgument.kind !== "lowered") {
    return valueArgument;
  }
  return produced({ kind: "value", value: valueArgument.operation });
}

function lowerStringPrintExpression(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrExpression> {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return produced({ kind: "string", value: expression.text });
  }

  const stringArgument = lowerStringExpression(expression, bindings);
  if (stringArgument !== undefined) {
    return produced({ kind: "string", value: stringArgument });
  }

  const stringExpression = context.lowerStringRuntimeExpression(context, expression, bindings);
  if (stringExpression.kind === "unsupported") {
    return stringExpression;
  }
  if (stringExpression.kind === "lowered") {
    return produced({ kind: "stringExpression", value: stringExpression.operation });
  }

  return notApplicable;
}

function lowerPrintCallExpression(
  context: LoweringContext,
  calleeExpression: ts.Identifier,
  argumentExpressions: ts.NodeArray<ts.Expression>,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrExpression> {
  if (isPlannedBuiltinCall(calleeExpression, bindings)) {
    return notApplicable;
  }
  const callee = bindings.get(calleeExpression.text);
  const args: JsIrCallArgument[] = [];
  if (callee?.kind === "closure") {
    args.push(...callee.value.captures.map((value) => ({ valueKind: "number" as const, value })));
  }
  const loweredArgs = lowerCallArguments(context, calleeExpression.text, argumentExpressions, bindings);
  if (loweredArgs.kind !== "lowered") {
    return loweredArgs;
  }
  args.push(...loweredArgs.operation);
  let name = calleeExpression.text;
  if (callee?.kind === "closure") {
    name = callee.value.functionName;
  }
  return produced({ kind: "call", name, arguments: args });
}
