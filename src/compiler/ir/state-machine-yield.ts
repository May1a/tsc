import type ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import type { JsIrCondition, JsIrValueExpression } from "./expressions.js";
import { iteratorErrorSubject } from "./iterator-subject.js";
import { type Produced, produced, unsupportedIn } from "./lowered.js";
import { SM_ARG_PARAM, SM_MODE_PARAM, SM_STATE_SLOT, type StateMachineExpressionHost } from "./state-machine-core.js";
import type { JsIrOperation } from "./types.js";

export type LowerExprFn = (
  host: StateMachineExpressionHost,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
) => Produced<JsIrValueExpression>;

export function lowerDelegatingYield(
  host: StateMachineExpressionHost,
  expression: ts.YieldExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  lowerExpr: LowerExprFn
): Produced<JsIrValueExpression> {
  if (expression.expression === undefined) {
    return unsupportedIn("`yield*` requires an iterable operand");
  }
  const operand = lowerExpr(host, expression.expression, bindings);
  if (operand.kind !== "lowered") {
    return operand;
  }
  const subSlot = host.allocateTemp("sub");
  const modeSlot = host.allocateTemp("submode");
  const argSlot = host.allocateTemp("subarg");
  const resSlot = host.allocateTemp("subres");
  const outSlot = host.allocateTemp("yieldstar");
  const loopState = host.allocateState();
  const resumeState = host.allocateState();
  const afterState = host.allocateState();
  const message = `${iteratorErrorSubject(expression.expression)} is not iterable`;

  host.emit({ kind: "assignValue", name: subSlot, value: { kind: "iteratorOpen", iterable: operand.operation, notIterableMessage: message } });
  host.emit({ kind: "assignValue", name: modeSlot, value: { kind: "number", value: { kind: "literal", value: 0 } } });
  host.emit({ kind: "assignValue", name: argSlot, value: { kind: "undefined" } });
  host.emitGoto(loopState);

  emitDelegatingYieldLoop(host, { subSlot, modeSlot, argSlot, resSlot, outSlot, loopState, resumeState, afterState });

  host.switchToState(resumeState);
  host.emit({ kind: "assignValue", name: modeSlot, value: { kind: "variable", name: SM_MODE_PARAM } });
  host.emit({ kind: "assignValue", name: argSlot, value: { kind: "variable", name: SM_ARG_PARAM } });
  host.emitGoto(loopState);

  host.switchToState(afterState);
  return produced({ kind: "variable", name: outSlot });
}

interface DelegatingYieldSlots {
  readonly subSlot: string;
  readonly modeSlot: string;
  readonly argSlot: string;
  readonly resSlot: string;
  readonly outSlot: string;
  readonly loopState: number;
  readonly resumeState: number;
  readonly afterState: number;
}

function emitDelegatingYieldLoop(host: StateMachineExpressionHost, slots: DelegatingYieldSlots): void {
  const { subSlot, modeSlot, argSlot, resSlot, outSlot, loopState, resumeState, afterState } = slots;
  const subRef: JsIrValueExpression = { kind: "variable", name: subSlot };
  const argRef: JsIrValueExpression = { kind: "variable", name: argSlot };
  const resRef: JsIrValueExpression = { kind: "variable", name: resSlot };
  const modeEq = (value: number): JsIrCondition => ({
    kind: "valueComparison",
    operator: "===",
    left: { kind: "variable", name: modeSlot },
    right: { kind: "number", value: { kind: "literal", value } }
  });
  const resDone: JsIrCondition = {
    kind: "valueTruthy",
    value: { kind: "valueObjectDynamicAccess", value: resRef, key: { kind: "literal", value: "done" } }
  };
  const resValue: JsIrValueExpression = { kind: "valueObjectDynamicAccess", value: resRef, key: { kind: "literal", value: "value" } };
  const yieldSubValue: readonly JsIrOperation[] = [
    { kind: "assignValue", name: SM_STATE_SLOT, value: { kind: "number", value: { kind: "literal", value: resumeState } } },
    { kind: "returnValue", expression: { kind: "iteratorResult", value: resValue, done: false } }
  ];

  const returnOps = buildDelegatingReturnOps(host, subRef, argRef, resSlot, resDone, resValue, yieldSubValue);
  const throwOps = buildDelegatingThrowOps(subRef, argRef, resSlot, outSlot, resDone, resValue, afterState, yieldSubValue);
  const nextOps: readonly JsIrOperation[] = [
    {
      kind: "assignValue",
      name: resSlot,
      value: {
        kind: "callValue",
        callee: { kind: "valueObjectDynamicAccess", value: subRef, key: { kind: "literal", value: "next" } },
        arguments: [{ valueKind: "value", value: argRef }],
        methodReceiver: subRef,
        methodKey: { kind: "literal", value: "next" }
      }
    },
    {
      kind: "if",
      condition: resDone,
      thenOperations: [
        { kind: "assignValue", name: outSlot, value: resValue },
        { kind: "assignValue", name: SM_STATE_SLOT, value: { kind: "number", value: { kind: "literal", value: afterState } } },
        { kind: "break" }
      ],
      elseOperations: yieldSubValue
    }
  ];

  host.switchToState(loopState);
  host.emit({
    kind: "if",
    condition: modeEq(1),
    thenOperations: returnOps,
    elseOperations: [{ kind: "if", condition: modeEq(2), thenOperations: throwOps, elseOperations: nextOps }]
  });
}

function buildDelegatingReturnOps(
  host: StateMachineExpressionHost,
  subRef: JsIrValueExpression,
  argRef: JsIrValueExpression,
  resSlot: string,
  resDone: JsIrCondition,
  resValue: JsIrValueExpression,
  yieldSubValue: readonly JsIrOperation[]
): readonly JsIrOperation[] {
  const fnSlot = host.allocateTemp("retfn");
  const fnRef: JsIrValueExpression = { kind: "variable", name: fnSlot };
  const isNullish: JsIrCondition = {
    kind: "or",
    left: { kind: "valueComparison", operator: "===", left: fnRef, right: { kind: "undefined" } },
    right: { kind: "valueComparison", operator: "===", left: fnRef, right: { kind: "null" } }
  };
  const completeReturn = (value: JsIrValueExpression): readonly JsIrOperation[] => {
    const ops: JsIrOperation[] = [];
    collectReturnOps(host, value, ops);
    return ops;
  };
  return [
    { kind: "assignValue", name: fnSlot, value: { kind: "valueObjectDynamicAccess", value: subRef, key: { kind: "literal", value: "return" } } },
    {
      kind: "if",
      condition: isNullish,
      thenOperations: completeReturn(argRef),
      elseOperations: [
        {
          kind: "assignValue",
          name: resSlot,
          value: { kind: "callValue", callee: fnRef, arguments: [{ valueKind: "value", value: argRef }], thisValue: subRef }
        },
        { kind: "if", condition: resDone, thenOperations: completeReturn(resValue), elseOperations: yieldSubValue }
      ]
    }
  ];
}

function collectReturnOps(host: StateMachineExpressionHost, value: JsIrValueExpression, ops: JsIrOperation[]): void {
  const finishState = host.allocateState();
  const valSlot = host.allocateTemp("retv");
  ops.push(
    { kind: "assignValue", name: valSlot, value },
    { kind: "assignValue", name: SM_STATE_SLOT, value: { kind: "number", value: { kind: "literal", value: finishState } } },
    { kind: "break" }
  );
  host.switchToState(finishState);
  host.emitReturn({ kind: "variable", name: valSlot });
}

function buildDelegatingThrowOps(
  subRef: JsIrValueExpression,
  argRef: JsIrValueExpression,
  resSlot: string,
  outSlot: string,
  resDone: JsIrCondition,
  resValue: JsIrValueExpression,
  afterState: number,
  yieldSubValue: readonly JsIrOperation[]
): readonly JsIrOperation[] {
  const throwFn: JsIrValueExpression = { kind: "valueObjectDynamicAccess", value: subRef, key: { kind: "literal", value: "throw" } };
  const isNullish: JsIrCondition = {
    kind: "or",
    left: { kind: "valueComparison", operator: "===", left: throwFn, right: { kind: "undefined" } },
    right: { kind: "valueComparison", operator: "===", left: throwFn, right: { kind: "null" } }
  };
  return [
    {
      kind: "if",
      condition: isNullish,
      thenOperations: [{ kind: "throwValue", value: argRef }],
      elseOperations: [
        {
          kind: "assignValue",
          name: resSlot,
          value: {
            kind: "callValue",
            callee: throwFn,
            arguments: [{ valueKind: "value", value: argRef }],
            methodReceiver: subRef,
            methodKey: { kind: "literal", value: "throw" }
          }
        },
        {
          kind: "if",
          condition: resDone,
          thenOperations: [
            { kind: "assignValue", name: outSlot, value: resValue },
            { kind: "assignValue", name: SM_STATE_SLOT, value: { kind: "number", value: { kind: "literal", value: afterState } } },
            { kind: "break" }
          ],
          elseOperations: yieldSubValue
        }
      ]
    }
  ];
}
