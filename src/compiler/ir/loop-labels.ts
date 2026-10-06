import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrOperation } from "./types.js";
import type { JsIrBindingValue } from "./bindings.js";
import { type Lowered, unsupportedIn } from "./lowered.js";

/**
 * Lower a loop's body with `pendingLoopLabel` adopted as the label of the loop being entered.
 *
 * The label is consumed either way, so a loop that declines leaves nothing behind for its next sibling.
 */
export function withinLoopLabel<T>(context: LoweringContext,
  lowerBody: () => T): T {
  const label = context.pendingLoopLabel;
  context.pendingLoopLabel = undefined;
  // Every loop takes a frame, labelled or not: the depth a `break label` resolves to counts *loops*, so an
  // unlabelled one between here and the target has to occupy a position or the count is short.
  context.enclosingLoopLabels.push(label);
  try {
    return lowerBody();
  } finally {
    context.enclosingLoopLabels.pop();
  }
}

/**
 * How many loops lie between here and the one `label` names, or `undefined` when no enclosing loop has
 * that label — which for a well-typed program means a labelled `break` that names nothing in scope.
 */
function loopDepthForLabel(context: LoweringContext,
  label: string): number | undefined {
  for (let index = context.enclosingLoopLabels.length - 1; index >= 0; index--) {
    if (context.enclosingLoopLabels[index] === label) {
      return context.enclosingLoopLabels.length - 1 - index;
    }
  }
  return undefined;
}

/**
 * `break` or `continue`, with the depth a label resolved to.
 *
 * An unlabelled jump is the innermost loop, which is depth zero and therefore carries no field at all — so
 * every existing jump lowers to the same operation it did before.
 */
export function lowerLabelledJump(context: LoweringContext,
  kind: "break" | "continue", label: ts.Identifier | undefined): JsIrOperation {
  if (label === undefined) {
    return { kind };
  }
  const targetDepth = loopDepthForLabel(context, label.text);
  if (targetDepth === undefined) {
    return { kind };
  }
  return { kind, targetDepth };
}

/**
 * `label: statement`.
 *
 * A label on a loop names the loop, and `break label` / `continue label` then resolve to a depth — which is
 * what makes the two indistinguishable from an unlabelled jump once the depth is known. A label on
 * anything else names a statement that is not a jump target this lowering can reach: a `break` out of a
 * labelled block has to leave a construct the IR has no frame for, so it is declined by name rather than
 * compiled as a jump to the wrong loop.
 */
export function lowerLabelledStatement(
  context: LoweringContext,
  statement: ts.LabeledStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!ts.isIdentifier(statement.label)) {
    return unsupportedIn("A statement label must be an identifier");
  }
  const body = statement.statement;
  const isLoop =
    ts.isForStatement(body) ||
    ts.isForOfStatement(body) ||
    ts.isForInStatement(body) ||
    ts.isWhileStatement(body) ||
    ts.isDoStatement(body);
  if (!isLoop) {
    return unsupportedIn(
      `\`${statement.label.text}:\` must label a loop; a label on a block or conditional is not supported yet`
    );
  }
  context.pendingLoopLabel = statement.label.text;
  try {
    return context.lowerStatement(context, body, bindings);
  } finally {
    context.pendingLoopLabel = undefined;
  }
}
