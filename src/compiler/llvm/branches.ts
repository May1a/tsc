import type { JsIrOperation } from "../ir/types.js";
import type { EmitContext, LoopLabels } from "./context.js";
import {
  COMPLETION_BREAK,
  COMPLETION_CONTINUE,
  COMPLETION_NORMAL,
  COMPLETION_THROW,
  createCleanupFrame,
  emitActiveCleanupRootRestore,
  emitCleanupAfterBody,
  emitCleanupFinalDispatch,
  emitCompletionTransfer,
  emitRootStackPush,
  emitThrowEntryBlock
} from "./completion.js";
import { operationListTerminates, switchClauseTerminates } from "./loops.js";

/**
 * The branch tier: `if`, `switch`, `try`, `break`, `continue`, and a bare block.
 *
 * A block exists as a statement because it owns bindings. `emitOperationsWithScopedBindings` snapshots
 * and restores `context.bindings` and `context.objectLayouts` around the body, which is what makes a
 * `{ let x = 1 }` inside an `if` not leak `x` — the binding map is the scope, and there is no separate
 * scope object to push.
 *
 * `try` is here rather than in `completion.ts` because it *creates* a cleanup frame while the completion
 * protocol *runs* one. `try/finally` and `try/catch` both emit a frame, and the frame's final dispatch
 * is a `switch` on the completion kind — so the branch tier and the completion tier are two halves of
 * the same mechanism, and only the half that asks "is this a branch?" belongs with the branches.
 *
 * `break` and `continue` carry no label. They unwind `context.loopLabels` to the innermost matching
 * label and let `completion.ts` run any `finally` between here and there. A *source* label is a
 * different thing and the IR does not have one yet — that is batch 2's labeled statements, and it is
 * why `LoopLabels` reads as an exception-unwinding depth stack.
 */

export const noLines = 0;
export function emitTryCatchOperation(
  operation: Extract<JsIrOperation, { readonly kind: "tryCatch" }>,
  context: EmitContext
): string[] {
  if (operation.finallyOperations !== undefined) {
    return emitTryFinallyOperation(operation, context);
  }
  return emitTryCatchOnlyOperation(operation, context);
}
export function emitTryCatchOnlyOperation(
  operation: Extract<JsIrOperation, { readonly kind: "tryCatch" }>,
  context: EmitContext
): string[] {
  const index = context.tryIndex;
  context.tryIndex += 1;
  const tryLabel = `try.body.${index}`;
  const catchLabel = `try.catch.${index}`;
  const joinLabel = `try.join.${index}`;
  const outerTarget = context.exceptionTarget;
  const tryBindings = new Map(context.bindings);
  context.exceptionTarget = catchLabel;
  const tryLines = emitOperationsWithScopedBindings(operation.tryOperations, context);
  context.exceptionTarget = outerTarget;
  const catchValue = `%try.catch.value.${index}`;
  const catchBindings = new Map(context.bindings);
  if (operation.catchVariable !== "") {
    catchBindings.set(operation.catchVariable, { kind: "valueVariable", name: catchValue });
  }
  context.bindings.clear();
  for (const [name, binding] of catchBindings) {
    context.bindings.set(name, binding);
  }
  const catchLines = emitOperationsWithScopedBindings(operation.catchOperations, context);
  context.bindings.clear();
  for (const [name, binding] of tryBindings) {
    context.bindings.set(name, binding);
  }
  const lines = [`  br label %${tryLabel}`, `${tryLabel}:`, ...tryLines];
  if (!operationListTerminates(operation.tryOperations)) {
    lines.push(`  br label %${joinLabel}`);
  }
  lines.push(`${catchLabel}:`, `  ${catchValue} = load i64, ptr ${context.exceptionSlot}`, ...catchLines);
  if (!operationListTerminates(operation.catchOperations)) {
    lines.push(`  br label %${joinLabel}`);
  }
  if (!operationListTerminates(operation.tryOperations) || !operationListTerminates(operation.catchOperations)) {
    lines.push(`${joinLabel}:`);
  }
  return lines;
}
// eslint-disable-next-line max-statements, complexity -- try/finally lowers catch, cleanup stack, and completion dispatch together.
export function emitTryFinallyOperation(
  operation: Extract<JsIrOperation, { readonly kind: "tryCatch" }>,
  context: EmitContext
): string[] {
  const finallyOperations = operation.finallyOperations ?? [];
  const includeCatch = operation.hasCatch;

  const frame = createCleanupFrame(context, "finally");
  const tryLabel = `try.body.${frame.index}.${context.tryIndex}`;
  const catchLabel = `try.catch.${frame.index}.${context.tryIndex}`;
  const catchValue = `%try.catch.value.${frame.index}.${context.tryIndex}`;
  const outerTarget = context.exceptionTarget;
  const outerBindings = new Map(context.bindings);

  // --- try region ---
  context.cleanupStack.push(frame);
  if (includeCatch) {
    context.exceptionTarget = catchLabel;
  } else {
    context.exceptionTarget = frame.throwEntryLabel;
  }
  const tryLines = emitOperationsWithScopedBindings(operation.tryOperations, context);
  const tryTerminates = operationListTerminates(operation.tryOperations);

  // --- catch region (optional) ---
  let catchLines: string[] = [];
  let catchTerminates = true;
  if (includeCatch) {
    context.exceptionTarget = frame.throwEntryLabel;
    const catchBindings = new Map(outerBindings);
    if (operation.catchVariable !== "") {
      catchBindings.set(operation.catchVariable, { kind: "valueVariable", name: catchValue });
    }
    context.bindings.clear();
    for (const [name, binding] of catchBindings) {
      context.bindings.set(name, binding);
    }
    catchLines = emitOperationsWithScopedBindings(operation.catchOperations, context);
    catchTerminates = operationListTerminates(operation.catchOperations);
  }

  context.cleanupStack.pop();
  context.exceptionTarget = outerTarget;
  context.bindings.clear();
  for (const [name, binding] of outerBindings) {
    context.bindings.set(name, binding);
  }

  // --- finally body (frame not on cleanup stack; throws replace pending completion) ---
  const finallyRethrow = `cleanup.finally.rethrow.${frame.index}.${context.tryIndex}`;
  const savedCompletionIndex = context.cleanupSeq;
  context.cleanupSeq += 1;
  const savedKind = `%cleanup.saved.kind.${savedCompletionIndex}`;
  const savedValue = `%cleanup.saved.value.${savedCompletionIndex}`;
  const savedDest = `%cleanup.saved.dest.${savedCompletionIndex}`;
  const savedUntil = `%cleanup.saved.until.${savedCompletionIndex}`;
  context.exceptionTarget = finallyRethrow;
  context.activeCleanupBodies.push(frame);
  const finallyLines = emitOperationsWithScopedBindings(finallyOperations, context);
  const abruptCleanupRootRestore = emitActiveCleanupRootRestore(context);
  context.activeCleanupBodies.pop();
  const finallyTerminates = operationListTerminates(finallyOperations);
  context.exceptionTarget = outerTarget;

  const lines: string[] = [`  br label %${tryLabel}`, `${tryLabel}:`, ...tryLines];
  if (!tryTerminates) {
    lines.push(
      `  store i8 ${COMPLETION_NORMAL}, ptr ${context.completionSlots.kind}`,
      `  store i32 ${frame.index}, ptr ${context.completionSlots.until}`,
      `  br label %${frame.entryLabel}`
    );
  }

  if (includeCatch) {
    lines.push(`${catchLabel}:`, `  ${catchValue} = load i64, ptr ${context.exceptionSlot}`, ...catchLines);
    if (!catchTerminates) {
      lines.push(
        `  store i8 ${COMPLETION_NORMAL}, ptr ${context.completionSlots.kind}`,
        `  store i32 ${frame.index}, ptr ${context.completionSlots.until}`,
        `  br label %${frame.entryLabel}`
      );
    }
  }

  lines.push(
    `${frame.entryLabel}:`,
    `  ${frame.rootFrameName} = call i64 @gcRootSave()`,
    `  ${savedKind} = load i8, ptr ${context.completionSlots.kind}`,
    `  ${savedValue} = load i64, ptr ${context.completionSlots.value}`,
    `  ${savedDest} = load i32, ptr ${context.completionSlots.destination}`,
    `  ${savedUntil} = load i32, ptr ${context.completionSlots.until}`,
    ...finallyLines
  );
  if (!finallyTerminates) {
    lines.push(
      `  call void @gcRootRestore(i64 ${frame.rootFrameName})`,
      `  store i8 ${savedKind}, ptr ${context.completionSlots.kind}`,
      `  store i64 ${savedValue}, ptr ${context.completionSlots.value}`,
      `  store i32 ${savedDest}, ptr ${context.completionSlots.destination}`,
      `  store i32 ${savedUntil}, ptr ${context.completionSlots.until}`,
      ...emitCleanupAfterBody(context, frame)
    );
  }

  // Throw from finally replaces any pending completion and continues outer cleanups.
  const rethrowSeq = context.cleanupSeq;
  context.cleanupSeq += 1;
  const rethrowValue = `%finally.rethrow.val.${rethrowSeq}`;
  lines.push(
    `${finallyRethrow}:`,
    `  ${rethrowValue} = load i64, ptr ${context.exceptionSlot}`,
    ...abruptCleanupRootRestore,
    `  store i8 ${COMPLETION_THROW}, ptr ${context.completionSlots.kind}`,
    `  store i64 ${rethrowValue}, ptr ${context.completionSlots.value}`,
    emitRootStackPush(rethrowValue, context)
  );
  if (frame.outerEntryLabel === undefined) {
    lines.push(
      `  store i64 ${rethrowValue}, ptr ${context.exceptionSlot}`,
      `  br label %${outerTarget}`
    );
  } else {
    lines.push(
      `  store i32 0, ptr ${context.completionSlots.until}`,
      `  br label %${frame.outerEntryLabel}`
    );
  }

  lines.push(...emitThrowEntryBlock(context, frame));
  lines.push(...emitCleanupFinalDispatch(context, frame));
  // Join is the NORMAL fallthrough target. When no try/catch path can complete
  // normally, the block is still referenced by the dispatch switch default and
  // must be a valid terminated block.
  const canNormalJoin =
    (!tryTerminates || (includeCatch && !catchTerminates)) && !finallyTerminates;
  lines.push(`${frame.joinLabel}:`);
  if (!canNormalJoin) {
    lines.push("  unreachable");
  }
  return lines;
}
export function emitIfOperation(operation: Extract<JsIrOperation, { readonly kind: "if" }>, context: EmitContext): string[] {
  const {condition, thenOperations, elseOperations} = operation;
  const {ifIndex} = context;
  context.ifIndex += 1;
  const thenLabel = `if.then.${ifIndex}`;
  const elseLabel = `if.else.${ifIndex}`;
  const endLabel = `if.end.${ifIndex}`;
  let falseLabel = endLabel;
  if (elseOperations.length > noLines) {
    falseLabel = elseLabel;
  }
  const emittedCondition = context.emitCondition(condition);
  const lines = [
    ...emittedCondition.lines,
    `  br i1 ${emittedCondition.value}, label %${thenLabel}, label %${falseLabel}`,
    `${thenLabel}:`
  ];

  lines.push(...emitOperationsWithScopedBindings(thenOperations, context));
  if (!operationListTerminates(thenOperations)) {
    lines.push(`  br label %${endLabel}`);
  }

  if (elseOperations.length > noLines) {
    lines.push(`${elseLabel}:`);
    lines.push(...emitOperationsWithScopedBindings(elseOperations, context));
    if (!operationListTerminates(elseOperations)) {
      lines.push(`  br label %${endLabel}`);
    }
  }

  if (!operationListTerminates(thenOperations) || elseOperations.length === noLines || !operationListTerminates(elseOperations)) {
    lines.push(`${endLabel}:`);
  }
  return lines;
}
// eslint-disable-next-line max-statements -- Switch emission owns dispatch labels plus source-order fall-through labels.
export function emitSwitchOperation(operation: Extract<JsIrOperation, { readonly kind: "switch" }>, context: EmitContext): string[] {
  const { loopIndex } = context;
  context.loopIndex += 1;
  const endLabel = `switch.end.${loopIndex}`;
  const clauseLabels = operation.clauses.map((_, index) => `switch.case.${loopIndex}.${index}`);
  const caseIndexes: number[] = [];
  for (let index = 0; index < operation.clauses.length; index++) {
    if (operation.clauses[index].test !== undefined) {
      caseIndexes.push(index);
    }
  }
  const defaultIndex = operation.clauses.findIndex((clause) => clause.test === undefined);
  let noMatchLabel = endLabel;
  if (defaultIndex !== -1) {
    noMatchLabel = clauseLabels[defaultIndex];
  }
  const discriminant = context.emitValue(operation.expression);
  const firstCompareLabel = switchCompareLabel(loopIndex, caseIndexes[0]);
  let firstDispatchLabel = noMatchLabel;
  if (firstCompareLabel !== undefined) {
    firstDispatchLabel = firstCompareLabel;
  }
  const lines = [...discriminant.lines, `  br label %${firstDispatchLabel}`];

  for (let index = 0; index < caseIndexes.length; index++) {
    const clauseIndex = caseIndexes[index];
    const clause = operation.clauses[clauseIndex];
    const test = context.emitValue(clause.test ?? { kind: "undefined" });
    const compare = `%switch.cmp.${loopIndex}.${index}`;
    const currentCompareLabel = `switch.test.${loopIndex}.${clauseIndex}`;
    const nextCompareLabel = switchCompareLabel(loopIndex, caseIndexes[index + 1]);
    let failedLabel = noMatchLabel;
    if (nextCompareLabel !== undefined) {
      failedLabel = nextCompareLabel;
    }
    lines.push(
      `${currentCompareLabel}:`,
      ...test.lines,
      `  ${compare} = call i1 @valueStrictEquals(i64 ${discriminant.value}, i64 ${test.value})`,
      `  br i1 ${compare}, label %${clauseLabels[clauseIndex]}, label %${failedLabel}`
    );
  }

  context.loopLabels.push({ breakLabel: endLabel , cleanupDepth: context.cleanupStack.length });
  for (let index = 0; index < operation.clauses.length; index++) {
    const clause = operation.clauses[index];
    const nextLabel = clauseLabels[index + 1] ?? endLabel;
    const bodyLines = emitOperationsWithScopedBindings(clause.operations, context);
    lines.push(`${clauseLabels[index]}:`, ...bodyLines);
    if (!switchClauseTerminates(clause)) {
      lines.push(`  br label %${nextLabel}`);
    }
  }
  context.loopLabels.pop();

  lines.push(`${endLabel}:`);
  return lines;
}
export function switchCompareLabel(loopIndex: number, clauseIndex: number | undefined): string | undefined {
  if (clauseIndex === undefined) {
    return undefined;
  }
  return `switch.test.${loopIndex}.${clauseIndex}`;
}
export function emitBreakOperation(context: EmitContext): string[] {
  const labels = context.loopLabels.at(-1);
  if (labels === undefined) {
    return [];
  }
  // Run cleanups entered inside this loop (iterator close + nested finally).
  if (context.cleanupStack.length > labels.cleanupDepth) {
    return emitCompletionTransfer(context, {
      kind: COMPLETION_BREAK,
      destLabel: labels.breakLabel,
      untilDepth: labels.cleanupDepth
    });
  }
  return [`  br label %${labels.breakLabel}`];
}
export function emitContinueOperation(context: EmitContext): string[] {
  let labels: LoopLabels | undefined;
  for (let index = context.loopLabels.length - 1; index >= 0; index--) {
    const candidate = context.loopLabels[index];
    if (candidate.continueLabel !== undefined) {
      labels = candidate;
      break;
    }
  }
  if (labels === undefined) {
    return [];
  }
  const { continueLabel } = labels;
  if (continueLabel === undefined) {
    return [];
  }

  // Same-loop continue skips the loop's own IteratorClose frame (at cleanupDepth),
  // but still runs nested finally frames inside the body.
  if (context.cleanupStack.length > labels.cleanupDepth) {
    const untilDepth = continueCleanupUntilDepth(context, labels);
    if (untilDepth < context.cleanupStack.length) {
      return emitCompletionTransfer(context, {
        kind: COMPLETION_CONTINUE,
        destLabel: continueLabel,
        untilDepth
      });
    }
  }
  return [`  br label %${continueLabel}`];
}
/**
 * Outermost cleanup index that must run for a continue to `labels`.
 * Skips an IteratorClose frame that owns this loop's continue label.
 * Returns cleanupStack.length when no cleanup is required.
 */
export function continueCleanupUntilDepth(context: EmitContext, labels: LoopLabels): number {
  const { continueLabel, cleanupDepth } = labels;
  let until = cleanupDepth;
  // Skip the for-of IteratorClose frame installed at cleanupDepth for this loop.
  if (
    until < context.cleanupStack.length &&
    context.cleanupStack[until]?.kind === "iteratorClose" &&
    context.cleanupStack[until]?.skipContinueLabel === continueLabel
  ) {
    until += 1;
  }
  // Nested finally frames above `until` must still run.
  if (until >= context.cleanupStack.length) {
    return context.cleanupStack.length;
  }
  return until;
}
export function emitOperationsWithScopedBindings(operations: readonly JsIrOperation[], context: EmitContext): string[] {
  const previousBindings = new Map(context.bindings);
  const previousObjectLayouts = new Map(context.objectLayouts);
  const lines = context.emitOperations(operations);
  context.bindings.clear();
  for (const [name, value] of previousBindings) {
    context.bindings.set(name, value);
  }
  context.objectLayouts.clear();
  for (const [name, value] of previousObjectLayouts) {
    context.objectLayouts.set(name, value);
  }
  return lines;
}
