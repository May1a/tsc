import type { EmitContext } from "./context.js";
import { jsValueUndefined } from "./values.js";

/**
 * How a generated function returns and unwinds: the GC-root stack that keeps a boxed value alive
 * across an allocating call, the payload/status aggregate it returns through, and the completion
 * protocol that routes a pending `return`/`throw`/`break`/`continue` out through the active
 * `finally` and IteratorClose frames.
 *
 * These three are one concept rather than three. A cleanup frame has to root its own value before
 * it can store it, and it has to reach the function's return by way of the same packed aggregate a
 * plain `ret` uses; splitting them leaves each one holding a reference to a convention defined in
 * another file. `context.ts` holds the mutable state — `EmitContext.cleanupStack` and
 * `completionSlots` — and imports the two types below from here, so this is the only two-way
 * relation in the emitter and both of its edges are `import type`, which `verbatimModuleSyntax`
 * erases.
 *
 * `CleanupFrame` describes a region to unwind through; the `COMPLETION_*` kinds below are what an
 * unwind carries. The frame's own `kind` is *not* one of them — it says which protocol owns the
 * frame (`finally` or `IteratorClose`), not how the frame completes.
 */

export interface CleanupFrame {
  readonly index: number;
  readonly entryLabel: string;
  readonly finalDispatchLabel: string;
  readonly joinLabel: string;
  readonly throwEntryLabel: string;
  readonly rootFrameName: string;
  /** Entry label of the next outer cleanup frame, if any. */
  readonly outerEntryLabel?: string;
  /** Break/continue destinations resumed when this frame is the outermost cleanup. */
  readonly resumeDests: Map<number, string>;
  readonly kind: "finally" | "iteratorClose";
  /** Same-loop continue targets this label and must not run IteratorClose. */
  readonly skipContinueLabel?: string;
  iteratorSlot?: string;
}

export interface CompletionSlots {
  readonly kind: string;
  readonly value: string;
  readonly destination: string;
  readonly until: string;
}

/** Pending abrupt/normal completion kinds for finally / IteratorClose cleanup. */
export const COMPLETION_NORMAL = 0;
const COMPLETION_RETURN = 1;
export const COMPLETION_THROW = 2;
export const COMPLETION_BREAK = 3;
export const COMPLETION_CONTINUE = 4;

export const generatedReturnType = "{ i64, i1 }";

// Pin a freshly-allocated boxed value onto the GC root stack. It is released when
// the enclosing scope restores the root-stack depth (function ret, or the per-
// iteration restore at a loop back-edge), so the value survives any subsequent
// allocating call / safepoint until then.
export function emitRootStackPush(value: string, _context: EmitContext): string {
  return `  call void @gcRootPush(i64 ${value})`;
}

// Restore the root stack to the depth captured at this function's entry. Emitted at
// every ret/throw point; correct regardless of how many pushes ran, in which branch,
// or how many returns exist (replaces the old static pop counter).
function emitRootStackRestore(context: EmitContext): string[] {
  return [`  call void @gcRootRestore(i64 ${context.gcFrameName})`];
}

export function emitPackedGeneratedReturn(value: string, status: string, context: EmitContext, prefix: string): string[] {
  const index = context.callIndex;
  context.callIndex += 1;
  const base = `%${prefix}.${index}.base`;
  const result = `%${prefix}.${index}`;
  return [
    `  ${base} = insertvalue ${generatedReturnType} undef, i64 ${value}, 0`,
    `  ${result} = insertvalue ${generatedReturnType} ${base}, i1 ${status}, 1`,
    `  ret ${generatedReturnType} ${result}`
  ];
}

export function emitNormalGeneratedReturn(value: string, context: EmitContext): string[] {
  if (context.cleanupStack.length > 0) {
    return emitCompletionTransfer(context, {
      kind: COMPLETION_RETURN,
      value,
      untilDepth: 0
    });
  }
  if (context.isMain) {
    return [`  br label %${context.normalExitLabel ?? "main.normal"}`];
  }
  return [...emitRootStackRestore(context), ...emitPackedGeneratedReturn(value, "false", context, "generated.return")];
}

function internCompletionDest(context: EmitContext, label: string, frame: CleanupFrame): number {
  for (const [id, existing] of frame.resumeDests) {
    if (existing === label) {
      return id;
    }
  }
  const id = context.nextDestId;
  context.nextDestId += 1;
  frame.resumeDests.set(id, label);
  return id;
}

interface CompletionTransfer {
  readonly kind: number;
  readonly value?: string;
  readonly destLabel?: string;
  readonly untilDepth: number;
}

/**
 * Route a completion through active cleanup frames (innermost first), or execute it
 * directly when no cleanup is required.
 */
export function emitCompletionTransfer(context: EmitContext, transfer: CompletionTransfer): string[] {
  const { cleanupStack } = context;
  if (cleanupStack.length === 0 || transfer.untilDepth >= cleanupStack.length) {
    return emitDirectCompletion(context, transfer);
  }
  const untilFrame = cleanupStack[transfer.untilDepth];
  const firstFrame = cleanupStack[cleanupStack.length - 1];
  const lines: string[] = [
    ...emitActiveCleanupRootRestore(context),
    `  store i8 ${transfer.kind}, ptr ${context.completionSlots.kind}`
  ];
  if (transfer.value !== undefined) {
    lines.push(`  store i64 ${transfer.value}, ptr ${context.completionSlots.value}`, emitRootStackPush(transfer.value, context));
  }
  if (transfer.destLabel !== undefined) {
    const destId = internCompletionDest(context, transfer.destLabel, untilFrame);
    lines.push(`  store i32 ${destId}, ptr ${context.completionSlots.destination}`);
  }
  lines.push(`  store i32 ${transfer.untilDepth}, ptr ${context.completionSlots.until}`, `  br label %${firstFrame.entryLabel}`);
  return lines;
}

/** An abrupt completion exits every cleanup body currently on the emission stack. */
export function emitActiveCleanupRootRestore(context: EmitContext): string[] {
  const outermost = context.activeCleanupBodies.at(0);
  if (outermost === undefined) {
    return [];
  }
  return [`  call void @gcRootRestore(i64 ${outermost.rootFrameName})`];
}

function emitDirectCompletion(context: EmitContext, transfer: CompletionTransfer): string[] {
  switch (transfer.kind) {
    case COMPLETION_NORMAL: {
      return [];
    }
    case COMPLETION_RETURN: {
      const value = transfer.value ?? jsValueUndefined;
      if (context.isMain) {
        return [`  br label %${context.normalExitLabel ?? "main.normal"}`];
      }
      return [...emitRootStackRestore(context), ...emitPackedGeneratedReturn(value, "false", context, "generated.return")];
    }
    case COMPLETION_THROW: {
      const value = transfer.value ?? jsValueUndefined;
      return [
        ...emitActiveCleanupRootRestore(context),
        `  store i64 ${value}, ptr ${context.exceptionSlot}`,
        emitRootStackPush(value, context),
        `  br label %${context.exceptionTarget}`
      ];
    }
    case COMPLETION_BREAK:
    case COMPLETION_CONTINUE: {
      if (transfer.destLabel === undefined) {
        return [];
      }
      return [...emitActiveCleanupRootRestore(context), `  br label %${transfer.destLabel}`];
    }
    default: {
      return [];
    }
  }
}

/** After a cleanup frame's body: chain to the next outer frame or final-dispatch. */
export function emitCleanupAfterBody(context: EmitContext, frame: CleanupFrame): string[] {
  const seq = context.cleanupSeq;
  context.cleanupSeq += 1;
  const untilValue = `%cleanup.until.${seq}`;
  const more = `%cleanup.more.${seq}`;
  if (frame.index === 0 || frame.outerEntryLabel === undefined) {
    return [`  br label %${frame.finalDispatchLabel}`];
  }
  return [
    `  ${untilValue} = load i32, ptr ${context.completionSlots.until}`,
    `  ${more} = icmp sgt i32 ${frame.index}, ${untilValue}`,
    `  br i1 ${more}, label %${frame.outerEntryLabel}, label %${frame.finalDispatchLabel}`
  ];
}

export function emitCleanupFinalDispatch(context: EmitContext, frame: CleanupFrame): string[] {
  const seq = context.cleanupSeq;
  context.cleanupSeq += 1;
  const kind = `%cleanup.kind.${seq}`;
  const value = `%cleanup.value.${seq}`;
  const dest = `%cleanup.dest.${seq}`;
  const lines: string[] = [
    `${frame.finalDispatchLabel}:`,
    `  ${kind} = load i8, ptr ${context.completionSlots.kind}`,
    `  switch i8 ${kind}, label %${frame.joinLabel} [`
  ];
  const returnLabel = `cleanup.ret.${seq}`;
  const throwLabel = `cleanup.throw.${seq}`;
  const breakLabel = `cleanup.break.${seq}`;
  const continueLabel = `cleanup.cont.${seq}`;
  lines.push(
    `    i8 ${COMPLETION_NORMAL}, label %${frame.joinLabel}`,
    `    i8 ${COMPLETION_RETURN}, label %${returnLabel}`,
    `    i8 ${COMPLETION_THROW}, label %${throwLabel}`,
    `    i8 ${COMPLETION_BREAK}, label %${breakLabel}`,
    `    i8 ${COMPLETION_CONTINUE}, label %${continueLabel}`,
    "  ]",
    `${returnLabel}:`,
    `  ${value} = load i64, ptr ${context.completionSlots.value}`,
    ...emitDirectCompletion(context, { kind: COMPLETION_RETURN, value, untilDepth: 0 }),
    `${throwLabel}:`,
    `  %cleanup.throw.val.${seq} = load i64, ptr ${context.completionSlots.value}`,
    `  store i64 %cleanup.throw.val.${seq}, ptr ${context.exceptionSlot}`,
    `  br label %${context.exceptionTarget}`,
    `${breakLabel}:`,
    `  ${dest} = load i32, ptr ${context.completionSlots.destination}`,
    ...emitDestSwitch(dest, frame, frame.joinLabel),
    `${continueLabel}:`,
    `  %cleanup.cont.dest.${seq} = load i32, ptr ${context.completionSlots.destination}`,
    ...emitDestSwitch(`%cleanup.cont.dest.${seq}`, frame, frame.joinLabel)
  );
  return lines;
}

function emitDestSwitch(destValue: string, frame: CleanupFrame, fallback: string): string[] {
  if (frame.resumeDests.size === 0) {
    return [`  br label %${fallback}`];
  }
  const lines: string[] = [`  switch i32 ${destValue}, label %${fallback} [`];
  for (const [id, label] of frame.resumeDests) {
    lines.push(`    i32 ${id}, label %${label}`);
  }
  lines.push("  ]");
  return lines;
}

export function createCleanupFrame(
  context: EmitContext,
  kind: "finally" | "iteratorClose",
  options: { readonly skipContinueLabel?: string; readonly iteratorSlot?: string } = {}
): CleanupFrame {
  const index = context.cleanupStack.length;
  const id = context.tryIndex;
  context.tryIndex += 1;
  let outerEntryLabel: string | undefined;
  if (index > 0) {
    outerEntryLabel = context.cleanupStack[index - 1]?.entryLabel;
  }
  return {
    index,
    entryLabel: `cleanup.entry.${id}`,
    finalDispatchLabel: `cleanup.dispatch.${id}`,
    joinLabel: `cleanup.join.${id}`,
    throwEntryLabel: `cleanup.throw.entry.${id}`,
    rootFrameName: `%gc.cleanup.${id}`,
    outerEntryLabel,
    resumeDests: new Map(),
    kind,
    skipContinueLabel: options.skipContinueLabel,
    iteratorSlot: options.iteratorSlot
  };
}

export function emitThrowEntryBlock(context: EmitContext, frame: CleanupFrame): string[] {
  const seq = context.cleanupSeq;
  context.cleanupSeq += 1;
  const value = `%cleanup.throw.entry.val.${seq}`;
  return [
    `${frame.throwEntryLabel}:`,
    `  ${value} = load i64, ptr ${context.exceptionSlot}`,
    `  store i8 ${COMPLETION_THROW}, ptr ${context.completionSlots.kind}`,
    `  store i64 ${value}, ptr ${context.completionSlots.value}`,
    `  store i32 ${frame.index}, ptr ${context.completionSlots.until}`,
    `  br label %${frame.entryLabel}`
  ];
}

export function emitIteratorCloseBody(context: EmitContext, frame: CleanupFrame): string[] {
  const seq = context.cleanupSeq;
  context.cleanupSeq += 1;
  const iterator = `%iter.close.iter.${seq}`;
  const result = `%iter.close.result.${seq}`;
  const payload = `%iter.close.payload.${seq}`;
  const exception = `%iter.close.exc.${seq}`;
  const kind = `%iter.close.kind.${seq}`;
  const isThrow = `%iter.close.is.throw.${seq}`;
  const cont = `iter.close.cont.${seq}`;
  const replace = `iter.close.replace.${seq}`;
  const keep = `iter.close.keep.${seq}`;
  const slot = frame.iteratorSlot ?? "ptr null";
  return [
    `  ${iterator} = load i64, ptr ${slot}`,
    `  ${result} = call ${generatedReturnType} @iteratorClose(i64 ${iterator})`,
    `  ${payload} = extractvalue ${generatedReturnType} ${result}, 0`,
    `  ${exception} = extractvalue ${generatedReturnType} ${result}, 1`,
    emitRootStackPush(payload, context),
    `  br i1 ${exception}, label %${replace}.check, label %${cont}.restore`,
    `${replace}.check:`,
    `  ${kind} = load i8, ptr ${context.completionSlots.kind}`,
    `  ${isThrow} = icmp eq i8 ${kind}, ${COMPLETION_THROW}`,
    `  br i1 ${isThrow}, label %${keep}, label %${replace}`,
    `${replace}:`,
    `  store i8 ${COMPLETION_THROW}, ptr ${context.completionSlots.kind}`,
    `  store i64 ${payload}, ptr ${context.completionSlots.value}`,
    `  call void @gcRootRestore(i64 ${frame.rootFrameName})`,
    emitRootStackPush(payload, context),
    `  br label %${cont}`,
    `${keep}:`,
    `  call void @gcRootRestore(i64 ${frame.rootFrameName})`,
    `  br label %${cont}`,
    `${cont}.restore:`,
    `  call void @gcRootRestore(i64 ${frame.rootFrameName})`,
    `  br label %${cont}`,
    `${cont}:`
  ];
}

export function emitExceptionReturnBlock(context: EmitContext): string[] {
  return [
    `${context.exceptionTarget}:`,
    `  %exception.value = load i64, ptr ${context.exceptionSlot}`,
    ...emitRootStackRestore(context),
    ...emitPackedGeneratedReturn("%exception.value", "true", context, "generated.exception")
  ];
}
