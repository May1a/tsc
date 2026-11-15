import type ts from "typescript";
import type { LoweringContext } from "./context.js";
import type { JsIrValueExpression } from "./expressions.js";
import type { JsIrOperation } from "./types.js";

// still evaluates the callee; it just skips the dispatch when the result is nullish.
export function optionalStatementCallee(expression: ts.CallExpression): true | undefined {
  if (expression.questionDotToken === undefined) {
    return undefined;
  }
  return true;
}

// A call whose callee lowered to an optional chain (`o?.f`, `a?.b.f`) short-circuits on the
// chain's guard instead of dispatching on it. When the receiver is nullish the whole call yields
// `undefined` without evaluating the arguments; when it is not, the call runs exactly as the
// non-optional one would, so a missing method still dispatches on `undefined` and throws.
// Lifting the guard around the call reuses the chain's own short-circuit for that.
export function optionalReceiverGuard(
  call: Extract<JsIrValueExpression, { readonly kind: "callValue" }>
): Extract<JsIrValueExpression, { readonly kind: "optionalChain" }> | undefined {
  if (call.callee.kind !== "optionalChain") {
    return undefined;
  }
  return { kind: "optionalChain", guard: call.callee.guard, access: { ...call, callee: call.callee.access } };
}

// A discarded optional-receiver call still needs its effects, so it is materialized into a fresh
// throwaway slot, as discarded JSON calls are.
export function discardOptionalCall(context: LoweringContext, value: JsIrValueExpression): JsIrOperation {
  const name = `__tscn_optional_stmt_${context.nextOptionalCallStatementValueId}`;
  context.nextOptionalCallStatementValueId += 1;
  return { kind: "letValue", name, value };
}
