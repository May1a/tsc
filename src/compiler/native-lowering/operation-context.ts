import type { BindingRef, ResolvedClosureValue, ResolvedOperation } from "../binding-resolution/index.js";
import type { LlvmValue, llvm } from "../llvm-ir/index.js";
import type { BindingAccess } from "./binding-access.js";
import type { ExpressionCalls, ExpressionContext } from "./expression-context.js";
import type { BoxedValue } from "./value-boundary.js";
import type { FlowCapability } from "./control-flow.js";

export interface OperationEntries {
  operation(operation: ResolvedOperation): void;
  operations(operations: readonly ResolvedOperation[]): void;
}

export interface OperationCalls extends ExpressionCalls {
  reference(target: BindingRef): BoxedValue;
  closure(value: ResolvedClosureValue): BoxedValue;
  callback(operation: Extract<ResolvedOperation, { readonly kind: "runtimeArrayMapFunctionObject" }>): BoxedValue;
  returnedClosure(operation: Extract<ResolvedOperation, { readonly kind: "returnClosure" }>): BoxedValue;
}

export interface OperationContext extends ExpressionContext {
  readonly writes: BindingAccess;
  readonly operations: OperationEntries;
  readonly flow: FlowCapability;
  readonly calls: OperationCalls;
  initializeFixedArray(reference: BindingRef, values: readonly LlvmValue<typeof llvm.double>[]): void;
  returnValue(value: BoxedValue): void;
  throwValue(value: BoxedValue): void;
}
