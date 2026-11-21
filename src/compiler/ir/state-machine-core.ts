import type ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import type { LoweringContext } from "./context.js";
import type { JsIrCondition, JsIrValueExpression } from "./expressions.js";
import type { Produced } from "./lowered.js";
import type { JsIrOperation } from "./types.js";

export interface StateMachineExpressionHost {
  readonly context: LoweringContext;
  readonly kind: "generator" | "async";
  allocateTemp(prefix?: string): string;
  allocateState(): number;
  switchToState(state: number): void;
  emit(operation: JsIrOperation): void;
  emitGoto(targetState: number): void;
  emitReturn(value: JsIrValueExpression): void;
  emitSuspend(yieldedValue: JsIrValueExpression, resultSlot: string | undefined): void;
  emitAssignToTarget(target: ts.Expression, value: JsIrValueExpression, bindings: ReadonlyMap<string, JsIrBindingValue>): Produced<undefined>;
  isStateTerminated(): boolean;
}

export const SM_MODE_PARAM = "__sm_mode";
export const SM_ARG_PARAM = "__sm_arg";
export const SM_STATE_SLOT = "__sm_state";
export const FINALLY_NORMAL = 0;
export const FINALLY_RETURN = 1;
export const FINALLY_THROW = 2;
export const FINALLY_JUMP = 3;

export function emitStateBranch(
  host: StateMachineExpressionHost,
  condition: JsIrCondition,
  thenState: number,
  elseState: number
): void {
  host.emit({
    kind: "if",
    condition,
    thenOperations: [{ kind: "assignValue", name: SM_STATE_SLOT, value: { kind: "number", value: { kind: "literal", value: thenState } } }, { kind: "break" }],
    elseOperations: [{ kind: "assignValue", name: SM_STATE_SLOT, value: { kind: "number", value: { kind: "literal", value: elseState } } }, { kind: "break" }]
  });
}
