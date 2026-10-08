import { type Lowered, notApplicable, produced } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import type { JsIrValueExpression } from "./expressions.js";

export function lowerArrayValueMethodCall(
  context: LoweringContext,
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  if (!ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression)) {
    return notApplicable;
  }
  const arrayName = expression.expression.expression.text;
  if (bindings.get(arrayName)?.kind !== "runtimeArray") {
    return notApplicable;
  }
  const method = expression.expression.name.text;
  const iteratorCall = lowerArrayIteratorMethodCall(arrayName, method, expression.arguments.length);
  if (iteratorCall.kind !== "notApplicable") {
    return iteratorCall;
  }
  if (method === "pop" || method === "shift") {
    return produced({ kind: arrayRemoveValueExpressionKind(method), arrayName });
  }
  if (method === "includes" && expression.arguments.length === 1) {
    const value = context.lowerValueExpression(context, expression.arguments[0], bindings);
    if (value.kind === "unsupported") {
      return value;
    }
    if (value.kind === "lowered") {
      return produced({ kind: "arrayIncludes", arrayName, value: value.operation });
    }
  }
  if (method === "at" && expression.arguments.length === 1) {
    const index = context.lowerNumberExpression(context, expression.arguments[0], bindings);
    if (index.kind === "unsupported") {
      return index;
    }
    if (index.kind === "lowered") {
      return produced({ kind: "arrayAt", arrayName, index: index.operation });
    }
  }
  if (method === "find" && expression.arguments.length === 0) {
    return produced({ kind: "arrayFind", arrayName });
  }
  if (method === "forEach" && expression.arguments.length === 0) {
    return produced({ kind: "arrayForEach", arrayName });
  }
  return notApplicable;
}

function lowerArrayIteratorMethodCall(
  arrayName: string,
  method: string,
  argumentCount: number
): Lowered<Extract<JsIrValueExpression, { kind: "callValue" }>> {
  if ((method !== "entries" && method !== "keys" && method !== "values") || argumentCount !== 0) {
    return notApplicable;
  }
  const receiver: JsIrValueExpression = { kind: "arrayRef", name: arrayName };
  return produced({
    kind: "callValue",
    callee: {
      kind: "valueArrayAccess",
      value: receiver,
      index: { kind: "literal", value: -1 },
      key: { kind: "literal", value: method }
    },
    arguments: [],
    thisValue: receiver
  });
}

function arrayRemoveValueExpressionKind(method: "pop" | "shift"): "arrayPop" | "arrayShift" {
  if (method === "pop") {
    return "arrayPop";
  }
  return "arrayShift";
}
