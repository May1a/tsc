import { type Lowered, produced } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import type ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import type { JsIrValueExpression } from "./expressions.js";

export function lowerArrayMethodValues(
  context: LoweringContext,
  args: ts.NodeArray<ts.Expression>,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<readonly JsIrValueExpression[]> {
  const values: JsIrValueExpression[] = [];
  for (const arg of args) {
    const value = context.lowerValueExpression(context, arg, bindings);
    if (value.kind !== "lowered") {
      return value;
    }
    values.push(value.operation);
  }
  return produced(values);
}
