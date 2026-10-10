import type { ResolvedOperation } from "../binding-resolution/index.js";
import type { BindingAccess } from "./binding-access.js";
import type { FlowCapability } from "./control-flow.js";
import { type ExpressionContext, createExpressionContext } from "./expression-context.js";
import type { FunctionCapabilities, NativeFunctionBuilder } from "./function-owner.js";
import type { OperationCalls, OperationContext } from "./operation-context.js";
import { lowerOperation } from "./operations.js";
import { lowerNumber } from "./numbers.js";
import { lowerString } from "./string-expressions.js";
import { lowerCondition } from "./conditions.js";
import { lowerValueExpression } from "./value-expressions.js";

export interface OperationOwnerOptions {
  readonly capabilities: FunctionCapabilities;
  readonly writes: BindingAccess;
  readonly flow: FlowCapability;
  readonly calls: (context: ExpressionContext) => OperationCalls;
  readonly stringConstant: ExpressionContext["stringConstant"];
  readonly withTrace: NativeFunctionBuilder["withTrace"];
}

export function createOperationContext(options: OperationOwnerOptions): OperationContext {
  const { flow, writes } = options;
  const expression = createExpressionContext({
    capabilities: options.capabilities, bindings: writes, calls: options.calls, stringConstant: options.stringConstant,
    exceptionTarget: () => flow.exceptionTarget(),
    handlers: { number: lowerNumber, string: lowerString, condition: lowerCondition, value: lowerValueExpression }
  });
  const { calls } = expression;
  const context = Object.freeze<OperationContext>({
    ...expression, flow, writes, calls,
    initializeFixedArray: (reference, values) => writes.initializeFixedArray(reference, values),
    returnValue: (value) => flow.returnValue(value), throwValue: (value) => flow.throwValue(value),
    operations: Object.freeze<OperationContext["operations"]>({
      operation: (operation) => {
        if (operation.trace === undefined) { lowerOperation(operation, context); }
        else { options.withTrace(operation.trace.id, () => lowerOperation(operation, context)); }
      },
      operations: (operations: readonly ResolvedOperation[]) => {
        for (const operation of operations) {
          if (expression.cursor.currentBlock().terminated) { break; }
          context.operations.operation(operation);
        }
      }
    })
  });
  return context;
}
