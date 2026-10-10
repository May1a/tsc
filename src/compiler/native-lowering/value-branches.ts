import { llvm } from "../llvm-ir/index.js";
import { branchValue } from "./expression-branches.js";
import type { ExpressionContext } from "./expression-context.js";
import type { BoxedValue } from "./value-boundary.js";
import { type ValueNode, keep, nullish, undefinedValue } from "./value-support.js";

function joined(condition: Parameters<typeof branchValue>[1], yes: () => BoxedValue, no: () => BoxedValue,
  context: ExpressionContext, hint: string): BoxedValue {
  const result = branchValue(context.cursor, condition, llvm.i64, yes, no, hint);
  return context.values.forBlock(context.cursor.currentBlock()).fromBoundary(result);
}

export function ternary(expression: ValueNode<"ternary">, context: ExpressionContext): BoxedValue {
  return joined(context.expressions.condition(expression.condition),
    () => context.expressions.value(expression.consequent), () => context.expressions.value(expression.alternate), context, "value.ternary");
}

export function lazyDefault(expression: ValueNode<"lazyDefault">, context: ExpressionContext): BoxedValue {
  const value = keep(context.expressions.value(expression.value), context);
  const missing = context.values.forBlock(context.cursor.currentBlock()).isImmediate(value, "undefined");
  return joined(missing, () => context.expressions.value(expression.defaultValue), () => value, context, "value.default");
}

export function logical(expression: ValueNode<"logicalValue">, context: ExpressionContext): BoxedValue {
  const left = keep(context.expressions.value(expression.left), context);
  const truthy = context.runtime.call("valueTruthy", [left], context.cursor.uniqueName("logical.truthy"));
  const right = () => context.expressions.value(expression.right);
  return expression.operator === "&&" ? joined(truthy, right, () => left, context, "value.and")
    : joined(truthy, () => left, right, context, "value.or");
}

export function coalesce(expression: ValueNode<"nullishCoalesce">, context: ExpressionContext): BoxedValue {
  const left = keep(context.expressions.value(expression.left), context);
  return joined(nullish(left, context), () => context.expressions.value(expression.right), () => left, context, "value.coalesce");
}

export function optionalChain(expression: ValueNode<"optionalChain">, context: ExpressionContext): BoxedValue {
  const guard = keep(context.expressions.value(expression.guard), context);
  return joined(nullish(guard, context), () => undefinedValue(context),
    () => context.optional.withTarget(guard, () => context.expressions.value(expression.access)), context, "value.optional");
}
