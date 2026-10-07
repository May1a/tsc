import type ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import { unsupportedStatementMessage } from "./diagnostics.js";
import type { JsIrOperation } from "./types.js";

/**
 * The outcome of trying to recognize one AST shape.
 *
 * `notApplicable` continues the recognizer chain. `unsupported` stops it and carries the reason
 * straight to the diagnostic. A recognizer that returned `undefined` for both meant that a shape
 * it matched and could not handle looked exactly like a shape nothing recognized, which is why
 * lowering had to traverse the file twice: once to find out, once to report.
 *
 * Sub-recognizers *inside* an already-matched form still use `| undefined` for "not this
 * variant" — at that point there is no chain to continue, so the ambiguity is gone.
 */
export type Lowered<T = JsIrOperation> =
  | { readonly kind: "lowered"; readonly operation: T }
  | { readonly kind: "notApplicable" }
  | { readonly kind: "unsupported"; readonly reason: string };
/**
 * `Lowered` without `notApplicable`: a step that either produced a value or refused.
 *
 * The three-state form is for a *chain* recognizer, where `notApplicable` is what tells the next
 * recognizer to try. Once a chain has matched, the steps below it are past that decision and a
 * `notApplicable` there would be a bug rather than a fallback — it would read as "try something else"
 * at a point where there is nothing else to try. The class tier is below every chain, so it uses
 * this one.
 */
export type Produced<T> =
  | { readonly kind: "lowered"; readonly operation: T }
  | { readonly kind: "unsupported"; readonly reason: string };
export const produced = <T>(operation: T): Produced<T> => ({ kind: "lowered", operation });
export const unsupportedIn = <T>(reason: string): Produced<T> => ({ kind: "unsupported", reason });
/** A statement list, or the reason one of its statements could not be lowered. */
export type LoweredStatementList = Produced<readonly JsIrOperation[]>;
export const notApplicable: Lowered<never> = { kind: "notApplicable" };
export const loweredOperation = (operation: JsIrOperation): Lowered => ({ kind: "lowered", operation });
export const unsupported = (reason: string): Lowered => ({ kind: "unsupported", reason });
export const loweredOperationList = (operations: readonly JsIrOperation[]): LoweredStatementList => produced(operations);
export const loweredUnsupportedStatementList = (reason: string): LoweredStatementList => unsupportedIn(reason);
/**
 * A statement whose recognizer returned `Lowered`.
 *
 * A recognizer that already carries a reason wins over the generic message: it knows *why* the statement
 * failed, and reconstructing that from the syntax afterwards is how a diagnostic ends up naming the shape
 * instead of the feature. Only a `notApplicable` — nothing claimed the statement — falls back.
 */
export function loweredStatementResult(
  result: Lowered,
  statement: ts.Statement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (result.kind !== "notApplicable") {
    return result;
  }
  return unsupported(unsupportedStatementMessage(statement, bindings));
}

/** A leaf recognizer's optional payload becomes an explicit chain result. */
export function loweredOptional<T>(operation: T | undefined): Lowered<T> {
  if (operation === undefined) {
    return notApplicable;
  }
  return produced(operation);
}

/** After a refusal has propagated, a chain can still decline this variant. */
export function loweredPayload<T>(result: Exclude<Lowered<T>, { readonly kind: "unsupported" }>): T | undefined {
  if (result.kind === "lowered") {
    return result.operation;
  }
  return undefined;
}

/** Keep a producer's refusal when its caller has a more general decline. */
export function withRefusal<T>(
  result: Exclude<Lowered<unknown>, { readonly kind: "lowered" }>,
  fallback: Produced<T>
): Produced<T>;
export function withRefusal<T>(
  result: Exclude<Lowered<unknown>, { readonly kind: "lowered" }>,
  fallback: Lowered<T>
): Lowered<T>;
export function withRefusal<T>(
  result: Exclude<Lowered<unknown>, { readonly kind: "lowered" }>,
  fallback: Lowered<T>
): Lowered<T> {
  if (result.kind === "unsupported") {
    return result;
  }
  return fallback;
}
