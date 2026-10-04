import { emitCondition } from "./conditions.js";
import type { EmitContext, FunctionDef } from "./context.js";
import { emitOperation, emitOperations } from "./operations.js";
import { emitCallArguments, emitCallExpressionResult, emitStringCallExpressionResult } from "./calls.js";
import { emitNumberExpression } from "./numbers.js";
import { emitStringExpression } from "./string-expressions.js";
import { emitValueExpression } from "./value-expressions.js";

/**
 * Building an `EmitContext`: one for the module, one per function definition.
 *
 * The dispatch bindings close over the context they belong to, which is what breaks the emitter's
 * recursion without threading a parameter through every handler. They are assigned here because this is
 * the only place a context comes into existence.
 *
 * A function context copies its parent's `bindings` and `objectLayouts`, and that is the whole reason a
 * nested function closes over an outer variable rather than capturing a mutable slot: the binding map is
 * copied at definition time and restored per call, so a closure sees the value as of the moment it was
 * created. `traceMarkers` is shared rather than copied, because the trace map is assembled across the
 * whole module and has to see every marker.
 */

export function createMainEmitContext(): EmitContext {
  // The four dispatch bindings close over `context` itself, which is safe because they are only
  // called once emission is under way — the object is complete by then.
  const context: EmitContext = {
    emitValue: (expression) => emitValueExpression(expression, context),
    emitOperations: (operations) => emitOperations(operations, context),
    emitCondition: (condition) => emitCondition(condition, context),
    emitOperation: (operation) => emitOperation(operation, context),
    emitNumberExpression: (expression) => emitNumberExpression(expression, context),
    emitStringExpression: (expression) => emitStringExpression(expression, context),
    emitCallArguments: (args) => emitCallArguments(args, context),
    emitCallExpressionResult: (expression) => emitCallExpressionResult(expression, context),
    emitStringCallExpressionResult: (expression) => emitStringCallExpressionResult(expression, context),
    bindings: new Map(),
    stringConstants: [],
    arrayGlobals: [],
    objectTypes: [],
    objectLayouts: new Map(),
    valueGlobals: new Set(),
    loopLabels: [],
    cleanupStack: [],
    activeCleanupBodies: [],
    hasNumberPrint: false,
    printIndex: 0,
    ifIndex: 0,
    cmpIndex: 0,
    numIndex: 0,
    callIndex: 0,
    loopIndex: 0,
    logicIndex: 0,
    boolIndex: 0,
    stringIndex: 0,
    arrayIndex: 0,
    objectIndex: 0,
    tryIndex: 0,
    cleanupSeq: 0,
    optionalTargets: [],
    exceptionTarget: "main.unhandled",
    exceptionSlot: "%main.exception.slot",
    completionSlots: {
      kind: "%main.completion.kind",
      value: "%main.completion.value",
      destination: "%main.completion.dest",
      until: "%main.completion.until"
    },
    nextDestId: 0,
    isMain: true,
    normalExitLabel: "main.normal",
    gcFrameName: "%gc.main.frame",
    traceMarkers: new Map()
  };
  return context;
}

export function createFunctionEmitContext(fn: FunctionDef, parent: EmitContext): EmitContext {
  const context: EmitContext = {
    emitValue: (expression) => emitValueExpression(expression, context),
    emitOperations: (operations) => emitOperations(operations, context),
    emitCondition: (condition) => emitCondition(condition, context),
    emitOperation: (operation) => emitOperation(operation, context),
    emitNumberExpression: (expression) => emitNumberExpression(expression, context),
    emitStringExpression: (expression) => emitStringExpression(expression, context),
    emitCallArguments: (args) => emitCallArguments(args, context),
    emitCallExpressionResult: (expression) => emitCallExpressionResult(expression, context),
    emitStringCallExpressionResult: (expression) => emitStringCallExpressionResult(expression, context),
    bindings: new Map(fn.outerBindings),
    stringConstants: parent.stringConstants,
    arrayGlobals: parent.arrayGlobals,
    objectTypes: parent.objectTypes,
    objectLayouts: new Map(parent.objectLayouts),
    valueGlobals: parent.valueGlobals,
    loopLabels: [],
    cleanupStack: [],
    activeCleanupBodies: [],
    hasNumberPrint: parent.hasNumberPrint,
    printIndex: parent.printIndex,
    ifIndex: 0,
    cmpIndex: 0,
    numIndex: 0,
    callIndex: 0,
    loopIndex: 0,
    logicIndex: 0,
    boolIndex: 0,
    stringIndex: 0,
    arrayIndex: parent.arrayIndex,
    objectIndex: parent.objectIndex,
    tryIndex: 0,
    cleanupSeq: 0,
    optionalTargets: [],
    exceptionTarget: "fn.exception",
    exceptionSlot: "%fn.exception.slot",
    completionSlots: {
      kind: "%fn.completion.kind",
      value: "%fn.completion.value",
      destination: "%fn.completion.dest",
      until: "%fn.completion.until"
    },
    nextDestId: 0,
    isMain: false,
    gcFrameName: "%gc.frame",
    traceMarkers: parent.traceMarkers,
    suppressTrace: fn.traceOperation === undefined
  };
  return context;
}
