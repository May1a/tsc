import { type Lowered, notApplicable, produced } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import type { JsIrOperation } from "./types.js";
import { errorConstructorNames, unwrapTypeOnlyExpression } from "./predicates.js";
import type { JsIrValueExpression } from "./expressions.js";

export function lowerRuntimeErrorLiteral(
  context: LoweringContext,
  name: string,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<Extract<JsIrOperation, { readonly kind: "runtimeErrorLiteral" }>> {
  let call: ts.NewExpression | ts.CallExpression | undefined;
  if (ts.isNewExpression(expression) || ts.isCallExpression(expression)) {
    call = expression;
  }
  if (call === undefined || !ts.isIdentifier(call.expression)) {
    return notApplicable;
  }
  const errorName = call.expression.text;
  if (!errorConstructorNames.has(errorName) || bindings.has(errorName)) {
    return notApplicable;
  }
  const callArguments = call.arguments ?? [];
  if (callArguments.length > 1) {
    return notApplicable;
  }
  if (callArguments.length === 0) {
    return produced({ kind: "runtimeErrorLiteral", name, errorName, message: { kind: "string", value: { kind: "literal", value: "" } } });
  }
  const message = lowerErrorMessageValue(context, callArguments[0], bindings);
  if (message.kind !== "lowered") {
    return message;
  }
  return produced({ kind: "runtimeErrorLiteral", name, errorName, message: message.operation });
}

function lowerErrorMessageValue(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  const argument = unwrapTypeOnlyExpression(expression);
  if (ts.isIdentifier(argument) && argument.text === "undefined" && !bindings.has("undefined")) {
    return produced({ kind: "string", value: { kind: "literal", value: "" } });
  }
  const stringValue = context.lowerStringRuntimeExpression(context, argument, bindings);
  if (stringValue.kind === "unsupported") {
    return stringValue;
  }
  if (stringValue.kind === "lowered") {
    return produced({ kind: "string", value: stringValue.operation });
  }
  const value = context.lowerValueExpression(context, argument, bindings);
  if (value.kind !== "lowered") {
    return value;
  }
  return produced({ kind: "string", value: { kind: "stringConversion", value: value.operation } });
}
