import { type Lowered, notApplicable, produced } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import type { JsIrValueExpression } from "./expressions.js";

export function lowerCollectionForEachPayload(
  context: LoweringContext,
  binding: Extract<JsIrBindingValue, { readonly kind: "runtimeMap" | "runtimeSet" }>,
  args: ts.NodeArray<ts.Expression>,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<{ readonly kind: "runtimeCollectionForEach"; readonly collectionName: string; readonly isMap: boolean; readonly callback: JsIrValueExpression; readonly thisArg?: JsIrValueExpression }> {
  if (args.length !== 1 && args.length !== 2) {
    return notApplicable;
  }
  const callback = context.lowerValueExpression(context, args[0], bindings);
  if (callback.kind !== "lowered") {
    return callback;
  }
  let thisArg: JsIrValueExpression | undefined;
  if (args.length === 2) {
    const loweredThis = context.lowerValueExpression(context, args[1], bindings);
    if (loweredThis.kind !== "lowered") {
      return loweredThis;
    }
    thisArg = loweredThis.operation;
  }
  return produced({
    kind: "runtimeCollectionForEach",
    collectionName: binding.name,
    isMap: binding.kind === "runtimeMap",
    callback: callback.operation,
    ...(thisArg === undefined ? {} : { thisArg })
  });
}

export function lowerRuntimeCollectionValueMethodCall(
  context: LoweringContext,
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  if (!ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression)) {
    return notApplicable;
  }
  const binding = bindings.get(expression.expression.expression.text);
  if (binding?.kind !== "runtimeMap" && binding?.kind !== "runtimeSet") {
    return notApplicable;
  }
  const method = expression.expression.name.text;
  if (binding.kind === "runtimeMap" && method === "get" && expression.arguments.length === 1) {
    const key = context.lowerValueExpression(context, expression.arguments[0], bindings);
    return key.kind === "lowered" ? produced({ kind: "runtimeMapGet", mapName: binding.name, key: key.operation }) : key;
  }
  if (method === "clear" && expression.arguments.length === 0) {
    return produced({ kind: "runtimeCollectionClear", collectionName: binding.name });
  }
  if ((method === "keys" || method === "values" || method === "entries") && expression.arguments.length === 0) {
    return produced({ kind: "runtimeCollectionIterator", collectionName: binding.name, sourceKind: binding.kind === "runtimeMap" ? "map" : "set", iterationKind: method });
  }
  if (method === "forEach") {
    return lowerCollectionForEachPayload(context, binding, expression.arguments, bindings);
  }
  return notApplicable;
}

export const jsonMaxIndent = 10;

export const jsonStringifyMaxArgumentCount = 3;
