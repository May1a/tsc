import type { JsIrCallArgument } from "../ir/bindings.js";
import type { JsIrNumberExpression, JsIrStringExpression, JsIrValueExpression } from "../ir/expressions.js";
import type { JsIrOperation } from "../ir/types.js";
import { emitGeneratedJsCall, emitNormalGeneratedReturn, emitRootStackPush } from "./completion.js";
import { emitOperationsWithScopedBindings } from "./branches.js";
import { emitRuntimeArrayPointer } from "./layout.js";
import { llvmDoubleBitcastOperand } from "./numbers.js";
import type { EmitContext, OperationOf } from "./context.js";

/**
 * The statements that emit nothing much: a block, a binding group, a hoisted function, a throw, a return,
 * a named-array store or delete, and a call.
 *
 * Grouping them is not tidiness — it is that each is the *whole* of its operation. A block delegates to
 * `emitOperationsWithScopedBindings` and adds the binding restore; a `bindingGroup` adds only the
 * bindings; a `function` statement adds no lines at all, because the definition was hoisted out of the
 * statement list by `emitLlvmModule` before the body was reached. Those three look like missing
 * implementations and are in fact the ones with nothing to emit.
 *
 * `emitThrowValueOperation` is the only place a `throw` becomes code, and it is a transfer through the
 * completion protocol rather than a `br`: the value is rooted, stored as the pending exception, and the
 * branch goes to the exception target, which runs any `finally` on the way.
 *
 * The three returns differ in what they hand back — a `double`, a `ptr` plus length, or a `JsValue` —
 * and all three route through `emitNormalGeneratedReturn` rather than emitting a `ret`, so that a
 * `return` inside a `try` still runs the `finally`.
 */

export function emitScopedBlockOperation(
  operation: OperationOf<"block">,
  context: EmitContext
): string[] {
  return emitOperationsWithScopedBindings(operation.operations, context);
}
export function emitBindingGroupOperation(
  operation: OperationOf<"bindingGroup">,
  context: EmitContext
): string[] {
  return context.emitOperations(operation.operations);
}
export function emitHoistedFunctionOperation(_operation: OperationOf<"function">, _context: EmitContext): string[] {
  return [];
}
export function emitThrowValueOperation(operation: OperationOf<"throwValue">, context: EmitContext): string[] {
  const value = context.emitValue(operation.value);
  // exceptionTarget is already the nearest catch or cleanup throw-entry.
  return [
    ...value.lines,
    emitRootStackPush(value.value, context),
    `  store i64 ${value.value}, ptr ${context.exceptionSlot}`,
    `  br label %${context.exceptionTarget}`
  ];
}
export function emitRuntimeArrayNamedStoreOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayNamedStore" }>,
  context: EmitContext
): string[] {
  const array = emitRuntimeArrayPointer(operation.arrayName, context);
  const key = context.emitStringExpression(operation.key);
  const value = context.emitValue(operation.value);
  return [...array.lines, ...key.lines, ...value.lines, `  call void @arraySetNamed(ptr ${array.value}, i64 ${key.length}, ptr ${key.value}, i64 ${value.value})`];
}
export function emitRuntimeArrayNamedDeleteOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayNamedDelete" }>,
  context: EmitContext
): string[] {
  const array = emitRuntimeArrayPointer(operation.arrayName, context);
  const key = context.emitStringExpression(operation.key);
  return [...array.lines, ...key.lines, `  call void @arrayDeleteNamed(ptr ${array.value}, i64 ${key.length}, ptr ${key.value})`];
}
export function emitCallOperation(operation: { readonly kind: "call"; readonly name: string; readonly arguments: readonly JsIrCallArgument[] }, context: EmitContext): string[] {
  const args = context.emitCallArguments(operation.arguments);
  return [...args.lines, ...emitGeneratedJsCall(operation.name, args.values, context).lines];
}
export function emitNumberReturnOperation(operation: { readonly kind: "returnNumber"; readonly expression: JsIrNumberExpression }, context: EmitContext): string[] {
  const result = context.emitNumberExpression(operation.expression);
  const index = context.numIndex;
  context.numIndex += 1;
  const boxed = `%ret.num.${index}`;
  return [...result.lines, `  ${boxed} = call i64 @valueBoxNumber(double ${llvmDoubleBitcastOperand(result.value)})`, ...emitNormalGeneratedReturn(boxed, context)];
}
export function emitStringReturnOperation(operation: { readonly kind: "returnString"; readonly expression: JsIrStringExpression }, context: EmitContext): string[] {
  const result = context.emitStringExpression(operation.expression);
  const index = context.stringIndex;
  context.stringIndex += 1;
  const boxed = `%ret.str.${index}`;
  // Box, then restore this frame and return the raw i64. No safepoint runs between the
  // box and the ret, and the caller re-roots the result at the handoff (see the value
  // "call" emitter), so the freshly-boxed string is never collected in the gap.
  return [
    ...result.lines,
    `  ${boxed} = call i64 @valueBoxString(ptr ${result.value}, i64 ${result.length})`,
    ...emitNormalGeneratedReturn(boxed, context)
  ];
}
export function emitValueReturnOperation(operation: { readonly kind: "returnValue"; readonly expression: JsIrValueExpression }, context: EmitContext): string[] {
  const result = context.emitValue(operation.expression);
  return [...result.lines, ...emitNormalGeneratedReturn(result.value, context)];
}
