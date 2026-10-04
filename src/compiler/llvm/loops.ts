import type { JsIrSwitchClause } from "../ir/expressions.js";
import type { JsIrOperation } from "../ir/types.js";
import { loopFrameName } from "./names.js";

/**
 * The GC loop frame, and the "does control flow continue past here" questions.
 *
 * A loop saves the root-stack depth before the body and restores it at the back edge, so a boxed value
 * allocated in one iteration cannot be collected while the next iteration still references it. That is
 * what `emitLoopFrameSave` and `emitLoopIterationPrologue` are, and they are the reason `LoopLabels`
 * in `context.ts` is an unwinding depth stack rather than anything to do with source labels.
 *
 * `emitLoopBackEdge` needs to know whether the body already returned or threw, and that is the same
 * question the block-scoped statement emitters ask when they decide whether to emit a `br` afterwards.
 * So the three `*Terminates` predicates sit here too: "does this list of operations fall off the end"
 * is one question about the IR, asked from four places, and answering it four times is how the four
 * answers drift apart.
 */

export function switchClauseTerminates(clause: JsIrSwitchClause): boolean {
  return operationListTerminates(clause.operations);
}
export function tryCatchOperationTerminates(operation: Extract<JsIrOperation, { readonly kind: "tryCatch" }>): boolean {
  if (operation.finallyOperations === undefined) {
    return operationListTerminates(operation.tryOperations) && operationListTerminates(operation.catchOperations);
  }
  // Fall through only when try or catch can complete normally and finally falls through.
  if (operationListTerminates(operation.finallyOperations)) {
    return true;
  }
  const tryFallsThrough = !operationListTerminates(operation.tryOperations);
  const { hasCatch } = operation;
  const catchFallsThrough = hasCatch && !operationListTerminates(operation.catchOperations);
  // No NORMAL join path ⇒ the statement never reaches subsequent ops.
  return !tryFallsThrough && !catchFallsThrough;
}
export function operationListTerminates(operations: readonly JsIrOperation[]): boolean {
  const last = operations.at(-1);
  if (last === undefined) {
    return false;
  }
  if (last.kind === "block" || last.kind === "bindingGroup") {
    return operationListTerminates(last.operations);
  }
  if (last.kind === "tryCatch") {
    return tryCatchOperationTerminates(last);
  }
  if (last.kind === "if") {
    return last.elseOperations.length > 0 && operationListTerminates(last.thenOperations) && operationListTerminates(last.elseOperations);
  }
  return last.kind === "break" || last.kind === "continue" || last.kind === "returnNumber" || last.kind === "returnString" || last.kind === "returnValue" || last.kind === "returnClosure" || last.kind === "throwValue";
}
export function emitLoopBackEdge(target: string, operations: readonly JsIrOperation[]): string[] {
  if (operationListTerminates(operations)) {
    return [];
  }
  return [`  br label %${target}`];
}
// Emitted once before a loop: capture the root-stack depth so each iteration can be
// reset back to it. Keeps per-iteration temporaries from accumulating across the
// stress loops while preserving every loop-invariant root pushed before the loop.
export function emitLoopFrameSave(loopIndex: number): string {
  return `  ${loopFrameName(loopIndex)} = call i64 @gcRootSave()`;
}
// Emitted at the top of every loop body: drop the previous iteration's roots, then run
// a safepoint. Collection only ever happens here (and at function-level boundaries), so
// raw pointers built mid-statement are never reclaimed, and prior-iteration garbage is
// reclaimed once the body has re-rooted whatever it still needs. Also reached via
// `continue`, which targets the cond/step block and flows back through the body top.
export function emitLoopIterationPrologue(loopIndex: number): string[] {
  return [`  call void @gcRootRestore(i64 ${loopFrameName(loopIndex)})`, "  call void @gcSafepoint()"];
}
