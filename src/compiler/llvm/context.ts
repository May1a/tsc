import type { JsIrBindingValue, JsIrFunctionObjectDefinition, JsIrFunctionParameter } from "../ir/bindings.js";
import type { JsIrObjectValue } from "../ir/expressions.js";
import type { JsIrOperation } from "../ir/types.js";
import type { CleanupFrame, CompletionSlots } from "./completion.js";
import type { LegacyLlvmTraceMarker } from "../llvm-ir/index.js";

// Generated JavaScript functions use an explicit payload/status ABI. Most runtime
// helpers remain scalar; jsCall / getIteratorValue / callIteratorNext use the
// explicit value-or-exception aggregate return.
export type LlvmReturnType = "aggregate";

/**
 * What emission carries from one operation to the next.
 *
 * `EmitContext` is the whole mutable surface of the emitter: the counter pool every emitted name
 * draws from, the binding map the lowering wrote, the cleanup stack `finally` and IteratorClose push
 * onto, and the loop-label stack `break` and `continue` unwind. It is one interface rather than a
 * dozen parameters because every emitter takes it and half of them mutate it.
 *
 * The per-tier result types exist because each tier emits lines *and* returns an SSA name, and the
 * pairs would otherwise be tuples. `JsValue` is the value-tier one; `NumberValue`, `StringValue` and
 * the array and object variants are the narrower proofs the lower tiers carry.
 *
 * Type-only, with no runtime dependency at all. The completion kinds `CleanupFrame.kind` refers to
 * are the exception and stay in the emitter: they are values, and they are read only by the cleanup
 * emitters, so moving them here would have forced a second import statement from this path for a
 * caller that wants only the types.
 *
 * Nothing here decides what code to emit. It says what the emitter knows when it does, which is why
 * the imports are all type-only and this module has no runtime dependency at all.
 */
export const COMPLETION_RETURN = 1;
export const COMPLETION_THROW = 2;
export const COMPLETION_BREAK = 3;
export const COMPLETION_CONTINUE = 4;



export interface EmitContext {
  readonly bindings: Map<string, JsIrBindingValue>;
  readonly stringConstants: string[];
  readonly arrayGlobals: string[];
  readonly objectTypes: string[];
  readonly objectLayouts: Map<string, ObjectLayout>;
  readonly valueGlobals: Set<string>;
  readonly loopLabels: LoopLabels[];
  /** Innermost-to-outermost cleanup regions (finally / IteratorClose). */
  readonly cleanupStack: CleanupFrame[];
  /** Cleanup bodies currently being emitted, outermost first. */
  readonly activeCleanupBodies: CleanupFrame[];
  hasNumberPrint: boolean;
  printIndex: number;
  ifIndex: number;
  cmpIndex: number;
  numIndex: number;
  callIndex: number;
  loopIndex: number;
  logicIndex: number;
  boolIndex: number;
  stringIndex: number;
  arrayIndex: number;
  objectIndex: number;
  tryIndex: number;
  cleanupSeq: number;
  readonly optionalTargets: string[];
  exceptionTarget: string;
  exceptionSlot: string;
  // Pending completion slots (function-scoped); shared by all cleanup regions.
  readonly completionSlots: CompletionSlots;
  nextDestId: number;
  /** True when emitting @main rather than a generated JS function. */
  readonly isMain: boolean;
  /** Label for normal @main exit (ignored for generated functions). */
  readonly normalExitLabel?: string;
  // GC root protocol: the SSA name holding this function's saved root-stack depth
  // (from @gcRootSave at entry). Every ret/throw restores to this depth instead of
  // emitting a static number of pops, so the root stack stays balanced across loops,
  // branches, and multiple returns.
  gcFrameName: string;
  readonly traceMarkers: Map<string, Omit<LegacyLlvmTraceMarker, "line">>;
  readonly suppressTrace?: boolean;
}

export type ObjectLayout = ObjectValue;

export interface NumberValue {
  readonly lines: readonly string[];
  readonly value: string;
}

export interface StringValue {
  readonly lines: readonly string[];
  readonly value: string;
  readonly length: string;
}

export interface JsValue {
  readonly lines: readonly string[];
  readonly value: string;
}

export interface ArrayValue {
  readonly name: string;
  readonly length: number;
  readonly storageKind: "global" | "stack";
}

export interface RuntimeArrayValue {
  readonly pointerName: string;
}

export interface ObjectValue {
  readonly typeName: string;
  readonly pointerName: string;
  readonly runtimePointerName?: string;
  readonly value: JsIrObjectValue;
}

export interface RuntimeObjectValue {
  readonly pointerName: string;
}

export interface LoopLabels {
  readonly breakLabel: string;
  readonly continueLabel?: string;
  /** cleanupStack.length when the loop was entered; cleanups at or above this depth run on break. */
  readonly cleanupDepth: number;
}

export interface FunctionDef {
  readonly name: string;
  readonly parameters: readonly JsIrFunctionParameter[];
  readonly body: readonly JsIrOperation[];
  readonly outerBindings: Map<string, JsIrBindingValue>;
  readonly traceOperation?: JsIrOperation;
  readonly callingConvention?: "direct" | "functionObject";
  readonly usesDynamicThis?: boolean;
  readonly captures?: JsIrFunctionObjectDefinition["captures"];
  returnType: LlvmReturnType;
}
