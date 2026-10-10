import { lowerStatement } from "./statements.js";
import { lowerObjectMethodFunctionValue } from "./object-methods.js";
import { lowerTypedCallArguments } from "./call-arguments.js";
import { lowerValueExpression } from "./value-expressions.js";
import { lowerNumberExpression } from "./number-expressions.js";
import { lowerStringRuntimeExpression } from "./string-expressions.js";
import { lowerConditionExpression } from "./conditions.js";
import { lowerObjectDestructuringElements } from "./object-destructuring.js";
import { lowerConstAggregateBinding, lowerConstVariableBinding } from "./variable-bindings.js";
import type { LoweringContext, LoweringContextOptions } from "./context.js";

/** The state of one `lowerToJsIr` invocation: nothing here survives the call that created it. */
export function createLoweringContext(options: LoweringContextOptions): LoweringContext {
  return {
    enclosingLoopLabels: [],
    pendingLoopLabel: undefined,
    classThisInScope: false,
    activeEnclosingClass: undefined,
    activeClassMethodStatic: false,
    nextFunctionObjectId: 0,
    nextJsonStatementValueId: 0,
    classes: new Map(),
    typeChecker: options.typeChecker,
    inlineCpp: options.inlineCpp,
    tryRegionOfCatchFinallyDepth: 0,
    finallyBlockDepth: 0,
    lowerStatement,
    lowerObjectMethodFunctionValue,
    lowerTypedCallArguments,
    lowerValueExpression,
    lowerNumberExpression,
    lowerStringRuntimeExpression,
    lowerConditionExpression,
    lowerObjectDestructuringElements,
    lowerConstVariableBinding,
    lowerConstAggregateBinding,
  };
}
