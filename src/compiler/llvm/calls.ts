import type { JsIrCallArgument } from "../ir/bindings.js";
import type { JsIrNumberExpression } from "../ir/expressions.js";
import { emitGeneratedJsCall } from "./completion.js";
import type { EmitContext, StringValue } from "./context.js";
import { llvmDoubleBitcastOperand } from "./numbers.js";

/**
 * The argument ABI: how an IR call's arguments become `i64` operands, and how a call's result is
 * converted back to a `double` or a `ptr`.
 *
 * `JsIrCallArgument` records each argument's `valueKind` statically, which is why this dispatches
 * rather than asking the value tier: the *number* and *string* cases must box the argument
 * themselves, because a `JsValue` is already an `i64` and there would be nothing left to box. That is
 * also why this sits below the scalar tiers instead of calling them, and why both of those are
 * reached through `context` — this module, `numbers.ts` and `string-expressions.ts` would otherwise
 * form a three-way import cycle.
 *
 * The two `*CallExpressionResult` functions are the mirror image: a call that produced a js value,
 * read as a number or as a string. `valueNumber` and the string conversion are the only conversions
 * here; anything else a call might produce is already the right representation.
 */

export function emitCallExpressionResult(expression: { readonly kind: "call"; readonly name: string; readonly arguments: readonly JsIrNumberExpression[] }, context: EmitContext): { readonly lines: string[]; readonly value: string } {
  const lines: string[] = [];
  const argValues: string[] = [];
  for (const arg of expression.arguments) {
    const result = context.emitNumberExpression(arg);
    const argIndex = context.numIndex;
    context.numIndex += 1;
    const boxed = `%arg.num.${argIndex}`;
    lines.push(...result.lines, `  ${boxed} = call i64 @valueBoxNumber(double ${llvmDoubleBitcastOperand(result.value)})`);
    argValues.push(`i64 ${boxed}`);
  }
  const generated = emitGeneratedJsCall(expression.name, argValues, context);
  const number = `%call.${context.numIndex}.num`;
  context.numIndex += 1;
  lines.push(...generated.lines, `  ${number} = call double @valueNumber(i64 ${generated.value})`);
  return { lines, value: number };
}
export function emitStringCallExpressionResult(expression: { readonly kind: "call"; readonly name: string; readonly arguments: readonly JsIrCallArgument[] }, context: EmitContext): StringValue {
  const args = context.emitCallArguments(expression.arguments);
  const generated = emitGeneratedJsCall(expression.name, args.values, context);
  const value = `%call.${context.stringIndex}.ptr`;
  const length = `%call.${context.stringIndex}.len`;
  context.stringIndex += 1;
  return {
    lines: [
      ...args.lines,
      ...generated.lines,
      `  ${value} = call ptr @valueStringPtr(i64 ${generated.value})`,
      `  ${length} = call i64 @valueStringLength(i64 ${generated.value})`
    ],
    value,
    length
  };
}
export function emitCallArguments(args: readonly JsIrCallArgument[], context: EmitContext): { readonly lines: string[]; readonly values: string[] } {
  const lines: string[] = [];
  const values: string[] = [];
  for (const arg of args) {
    if (arg.valueKind === "string") {
      const result = context.emitStringExpression(arg.value);
      const index = context.stringIndex;
      context.stringIndex += 1;
      const boxed = `%arg.str.${index}`;
      lines.push(...result.lines, `  ${boxed} = call i64 @valueBoxString(ptr ${result.value}, i64 ${result.length})`);
      values.push(`i64 ${boxed}`);
      continue;
    }
    if (arg.valueKind === "value") {
      const result = context.emitValue(arg.value);
      lines.push(...result.lines);
      values.push(`i64 ${result.value}`);
      continue;
    }
    const result = context.emitNumberExpression(arg.value);
    const index = context.numIndex;
    context.numIndex += 1;
    const boxed = `%arg.num.${index}`;
    lines.push(...result.lines, `  ${boxed} = call i64 @valueBoxNumber(double ${llvmDoubleBitcastOperand(result.value)})`);
    values.push(`i64 ${boxed}`);
  }
  return { lines, values };
}
