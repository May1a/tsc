import type ts from "typescript";
import type { ClassHierarchy } from "./class-hierarchy.js";
import type { StoragePlan } from "./storage-plan.js";
import type { ClassInfo } from "./class-info.js";
import type { InlineCppCompilation } from "./inline-cpp.js";
import type { lowerStatement } from "./statements.js";
import type { lowerObjectMethodFunctionValue } from "./object-methods.js";
import type { lowerTypedCallArguments } from "./call-arguments.js";
import type { lowerValueExpression } from "./value-expressions.js";
import type { lowerNumberExpression } from "./number-expressions.js";
import type { lowerStringRuntimeExpression } from "./string-expressions.js";
import type { lowerConditionExpression } from "./conditions.js";
import type { lowerObjectDestructuringElements } from "./object-destructuring.js";
import type { lowerConstAggregateBinding, lowerConstVariableBinding } from "./variable-bindings.js";

/** What one `lowerToJsIr` invocation was given, and nothing it has lowered yet. */
export interface LoweringContextOptions {
  readonly typeChecker: ts.TypeChecker | undefined;
  readonly inlineCpp: InlineCppCompilation;
}

/** Recursive lowering entries and the state of the current compilation. */
export interface LoweringContext {
  enclosingLoopLabels: (string | undefined)[];
  pendingLoopLabel: string | undefined;
  classThisInScope: boolean;
  activeEnclosingClass: ClassInfo | undefined;
  activeClassMethodStatic: boolean;
  nextFunctionObjectId: number;
  nextJsonStatementValueId: number;
  nextOptionalCallStatementValueId: number;
  /**
   * The classes the source file being lowered has declared, under every name each answers to.
   *
   * Replaced with an empty map per source file, because a class may only extend another class declared
   * in the same module. The id counter below is *not* reset with it: an id names a class within its
   * compilation, so two compilations of the same program produce the same ids.
   */
  classes: Map<string, ClassInfo>;
  /**
   * The source file's class declarations, collected before any of them lowers. Whether an instance
   * call dispatches depends on subclasses the registry above may not contain yet. Set per source file
   * with `classes`.
   */
  classHierarchy: ClassHierarchy;
  /**
   * The source file's `let` and `var` declarations that need boxed storage, decided from every write
   * before any statement lowers. Set per source file with `classes`.
   */
  storagePlan: StoragePlan;
  /**
   * The program's type checker, for the questions a type answers that lowering state cannot: which
   * class an identifier's static type names, and what a call returns.
   */
  readonly typeChecker: ts.TypeChecker | undefined;
  /** The inline C++ escape hatch's flag and the blocks this compilation has collected. */
  readonly inlineCpp: InlineCppCompilation;
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
