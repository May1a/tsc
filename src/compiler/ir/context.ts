import type { ClassInfo } from "./class-info.js";
import type { lowerStatement } from "./statements.js";
import type { lowerObjectMethodFunctionValue } from "./object-methods.js";
import type { lowerTypedCallArguments } from "./call-arguments.js";
import type { lowerValueExpression } from "./value-expressions.js";
import type { lowerNumberExpression } from "./number-expressions.js";
import type { lowerStringRuntimeExpression } from "./string-expressions.js";
import type { lowerConditionExpression } from "./conditions.js";
import type { lowerObjectDestructuringElements } from "./object-destructuring.js";
import type { lowerConstAggregateBinding, lowerConstVariableBinding } from "./variable-bindings.js";

/** Recursive lowering entries and the state of the current source-file traversal. */
export interface LoweringContext {
  enclosingLoopLabels: (string | undefined)[];
  pendingLoopLabel: string | undefined;
  classThisInScope: boolean;
  activeEnclosingClass: ClassInfo | undefined;
  activeClassMethodStatic: boolean;
  nextFunctionObjectId: number;
  nextJsonStatementValueId: number;
  tryRegionOfCatchFinallyDepth: number;
  finallyBlockDepth: number;
  readonly lowerStatement: typeof lowerStatement;
  readonly lowerObjectMethodFunctionValue: typeof lowerObjectMethodFunctionValue;
  readonly lowerTypedCallArguments: typeof lowerTypedCallArguments;
  readonly lowerValueExpression: typeof lowerValueExpression;
  readonly lowerNumberExpression: typeof lowerNumberExpression;
  readonly lowerStringRuntimeExpression: typeof lowerStringRuntimeExpression;
  readonly lowerConditionExpression: typeof lowerConditionExpression;
  readonly lowerObjectDestructuringElements: typeof lowerObjectDestructuringElements;
  readonly lowerConstVariableBinding: typeof lowerConstVariableBinding;
  readonly lowerConstAggregateBinding: typeof lowerConstAggregateBinding;
}
