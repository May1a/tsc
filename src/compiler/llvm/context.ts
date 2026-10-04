import type { JsIrBindingValue, JsIrCallArgument, JsIrFunctionObjectDefinition, JsIrFunctionParameter } from "../ir/bindings.js";
import type { JsIrCondition, JsIrNumberExpression, JsIrObjectValue, JsIrStringExpression, JsIrValueExpression } from "../ir/expressions.js";
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



/**
 * The recursion the emitter cannot express with static imports.
 *
 * `emitValue`, `emitOperations`, `emitCondition` and `emitOperation` call each other through the
 * operation table, and every handler in the table calls back into them. Written as free functions
 * that is a cycle across modules the moment a handler moves out of `llvm.ts` — the handler needs the
 * core, and the core needs the handler. Written as fields on the context it is not a cycle at all:
 * `EmitContext` is already the state carrier, it is already passed to every one of these functions,
 * and the four bindings are assigned once per emission.
 *
 * The parameter disappears with them. `emitValueExpression(e, ctx)` becomes `ctx.emitValue(e)`, which
 * is why this is 144 call sites and no signature changes.
 */
/**
 * The operation variant a handler for kind `K` receives.
 *
 * This is what makes `operationEmitters` total rather than merely checked: each handler is typed
 * against the one variant its key selects, so a handler cannot read a field its kind does not have,
 * and the mapped parameter type of the table forces a key for every kind. The single assertion in
 * `operationEmitterFor` exists only because TypeScript cannot correlate a union-typed discriminant
 * with the handler it selects — see the note there.
 */
export type OperationOf<K extends JsIrOperation["kind"]> = Extract<JsIrOperation, { readonly kind: K }>;

export interface Emitter {
  readonly emitValue: (expression: JsIrValueExpression) => JsValue;
  readonly emitOperations: (operations: readonly JsIrOperation[]) => string[];
  readonly emitCondition: (condition: JsIrCondition) => NumberValue;
  readonly emitOperation: (operation: JsIrOperation) => string[];
  /**
   * The scalar tiers and the argument ABI, for the same reason as the four above and with the same
   * cost. `emitCallArguments` needs the *raw* number and string forms so it can box them, and the
   * number and string tiers need the argument ABI for a call, so each names the other two and the
   * three form a cycle that no ordering of imports can break.
   */
  readonly emitNumberExpression: (expression: JsIrNumberExpression) => NumberValue;
  readonly emitStringExpression: (expression: JsIrStringExpression) => StringValue;
  readonly emitCallArguments: (
    args: readonly JsIrCallArgument[]
  ) => { readonly lines: string[]; readonly values: string[] };
  readonly emitCallExpressionResult: (expression: {
    readonly kind: "call";
    readonly name: string;
    readonly arguments: readonly JsIrNumberExpression[];
  }) => { readonly lines: string[]; readonly value: string };
  readonly emitStringCallExpressionResult: (expression: {
    readonly kind: "call";
    readonly name: string;
    readonly arguments: readonly JsIrCallArgument[];
  }) => StringValue;
}

export interface EmitContext extends Emitter {
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
