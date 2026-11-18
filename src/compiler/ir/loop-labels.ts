import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import { type Lowered, loweredOperation, unsupportedIn } from "./lowered.js";

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
 *
 * A label that resolves to nothing is refused rather than treated as unlabelled. Falling back to `{ kind }`
 * silently retargets the jump at the innermost loop, which compiles and computes the wrong answer; the only
 * way to reach it is a label stack that is out of step with the loops actually being lowered, so the honest
 * answer is to say the label named no enclosing loop rather than to compile a jump to the wrong target.
 *
 * A label that names an enclosing non-loop labeled block resolves to a `breakBlock` jump: the target is
 * identified by label name rather than by depth because labeled blocks do not occupy positions in the loop
 * depth count.
 */
export function lowerLabelledJump(context: LoweringContext,
  kind: "break" | "continue", label: ts.Identifier | undefined): Lowered {
  if (label === undefined) {
    return loweredOperation({ kind });
  }
  if (kind === "break" && context.enclosingBlockLabels.includes(label.text)) {
    return loweredOperation({ kind: "breakBlock", label: label.text });
  }
  const targetDepth = loopDepthForLabel(context, label.text);
  if (targetDepth === undefined) {
    return unsupportedIn(`\`${kind} ${label.text}\` does not name an enclosing loop this build lowered`);
  }
  return loweredOperation({ kind, targetDepth });
}

/**
 * `label: statement`.
 *
 * A label on a loop names the loop, and `break label` / `continue label` then resolve to a depth — which is
 * what makes the two indistinguishable from an unlabelled jump once the depth is known.
 *
 * A label on a non-loop statement names a block exit: `break label` jumps to after the labeled statement.
 * `continue` on a labeled block is never valid TypeScript. The body is lowered into a `labeledBlock`
 * operation, and `break label` lowers to a `breakBlock` jump resolved by name.
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
  if (isLoop) {
    context.pendingLoopLabel = statement.label.text;
    try {
      return context.lowerStatement(context, body, bindings);
    } finally {
      context.pendingLoopLabel = undefined;
    }
  }
  // Non-loop: lower the body as a labeled block scope. The label is pushed so that
  // `break label` inside the body resolves to a `breakBlock` exit, not a loop depth.
  const labelName = statement.label.text;
  context.enclosingBlockLabels.push(labelName);
  try {
    const loweredBody = context.lowerStatement(context, body, bindings);
    if (loweredBody.kind !== "lowered") {
      return loweredBody;
    }
    // Wrap in a labeledBlock so the native lowering can install a break target around it.
    // A body that is already a block or bindingGroup is kept as-is inside the wrapper to
    // avoid a redundant nesting level.
    const operations = loweredBody.operation.kind === "block" || loweredBody.operation.kind === "bindingGroup"
      ? loweredBody.operation.operations
      : [loweredBody.operation];
    return loweredOperation({ kind: "labeledBlock", label: labelName, operations: [...operations] });
  } finally {
    context.enclosingBlockLabels.pop();
  }
}
