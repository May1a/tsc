import { type Lowered, notApplicable, produced } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import type { JsIrValueExpression } from "./expressions.js";

export function lowerRuntimeCollectionValueMethodCall(
  context: LoweringContext,
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  if (!ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression) || expression.arguments.length !== 1) {
    return notApplicable;
  }
  const receiver = expression.expression.expression.text;
  const binding = bindings.get(receiver);
  if (binding?.kind !== "runtimeMap" || expression.expression.name.text !== "get") {
    return notApplicable;
  }
  const key = context.lowerValueExpression(context, expression.arguments[0], bindings);
  if (key.kind !== "lowered") {
    return key;
  }
  return produced({ kind: "runtimeMapGet", mapName: binding.name, key: key.operation });
}

export const jsonMaxIndent = 10;

export const jsonStringifyMaxArgumentCount = 3;
