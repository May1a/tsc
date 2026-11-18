import type { JumpTargetFrame, LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import { type Lowered, loweredOperation, unsupportedIn } from "./lowered.js";

/**
 * Lower a construct `break` can leave with its frame on the jump-target stack.
 *
 * Every loop, `switch`, and labeled non-loop statement takes a frame, labelled or not: the depth a `break`
 * resolves to counts these frames, and native lowering installs one break target for each of them in the
 * same order. A construct that does not take a frame makes every enclosing count short.
 */
function withinJumpTarget<T>(context: LoweringContext,
  frame: JumpTargetFrame, lowerBody: () => T): T {
  context.enclosingJumpTargets.push(frame);
  try {
    return lowerBody();
  } finally {
    context.enclosingJumpTargets.pop();
  }
}

/**
 * Lower a loop's body with `pendingLoopLabel` adopted as the label of the loop being entered.
 *
 * The label is consumed either way, so a loop that declines leaves nothing behind for its next sibling.
 */
export function withinLoopLabel<T>(context: LoweringContext,
  lowerBody: () => T): T {
  const label = context.pendingLoopLabel;
  context.pendingLoopLabel = undefined;
  return withinJumpTarget(context, { kind: "loop", label }, lowerBody);
}

/** Lower a `switch`'s clauses inside the break target the `switch` installs. */
export function withinSwitch<T>(context: LoweringContext,
  lowerClauses: () => T): T {
  return withinJumpTarget(context, { kind: "switch", label: undefined }, lowerClauses);
}

/**
 * How many jump targets lie between here and the one the jump leaves, or `undefined` when none matches.
 *
 * `break` counts every frame, because native lowering gives loops, switches, and labeled blocks a break
 * target each. `continue` counts only loops, the frames with a continue target. An unlabelled jump leaves
 * the innermost loop or `switch`; a labeled block is reachable only by name. Frames of an enclosing
 * function can sit below the current function's frames, but a valid program's jump always matches a
 * frame of its own function first: TypeScript rejects jumps that cross a function boundary.
 */
function jumpTargetDepth(context: LoweringContext,
  kind: "break" | "continue", label: string | undefined): number | undefined {
  const frames = kind === "continue"
    ? context.enclosingJumpTargets.filter((frame) => frame.kind === "loop")
    : context.enclosingJumpTargets;
  const index = frames.findLastIndex((frame) =>
    label === undefined ? frame.kind !== "labeledBlock" : frame.label === label);
  return index === -1 ? undefined : frames.length - 1 - index;
}

/**
 * `break` or `continue`, with the depth of the jump target it leaves.
 *
 * The innermost target is depth zero and carries no field at all, so an ordinary jump lowers to the
 * same operation whether or not anything encloses it.
 *
 * A jump that resolves to nothing is refused rather than treated as unlabelled. Falling back to `{ kind }`
 * silently retargets the jump at the innermost target, which compiles and computes the wrong answer; the
 * only way to reach it is a jump-target stack that is out of step with the constructs actually being
 * lowered, so the honest answer is to say the jump named no enclosing target.
 */
export function lowerLabelledJump(context: LoweringContext,
  kind: "break" | "continue", label: ts.Identifier | undefined): Lowered {
  const targetDepth = jumpTargetDepth(context, kind, label?.text);
  if (targetDepth === undefined) {
    const named = label === undefined ? `\`${kind}\`` : `\`${kind} ${label.text}\``;
    return unsupportedIn(`${named} does not name an enclosing statement this build lowered`);
  }
  return loweredOperation(targetDepth === 0 ? { kind } : { kind, targetDepth });
}

/**
 * `label: statement`.
 *
 * A label on a loop names the loop, and `break label` / `continue label` then resolve to a depth — which is
 * what makes the two indistinguishable from an unlabelled jump once the depth is known.
 *
 * A label on any other statement wraps it in a `labeledBlock`, a break target whose exit is the end of the
 * statement. `break label` resolves to its depth exactly as it does for a loop; `continue label` cannot
 * name it, which TypeScript rejects.
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
  const loweredBody = withinJumpTarget(context, { kind: "labeledBlock", label: statement.label.text },
    () => context.lowerStatement(context, body, bindings));
  if (loweredBody.kind !== "lowered") {
    return loweredBody;
  }
  return loweredOperation({ kind: "labeledBlock", operations: [loweredBody.operation] });
}
