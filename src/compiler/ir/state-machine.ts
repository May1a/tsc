import ts from "typescript";
import type { JsIrBindingValue, JsIrFunctionObjectCapture } from "./bindings.js";
import { CLASS_THIS_NAME } from "./class-names.js";
import type { LoweringContext } from "./context.js";
import type { JsIrCondition, JsIrSwitchClause, JsIrValueExpression } from "./expressions.js";
import { type Produced, produced, unsupportedIn } from "./lowered.js";
import { lowerCapturedBindingValue } from "./captures.js";
import {
  FINALLY_JUMP,
  FINALLY_RETURN,
  FINALLY_THROW,
  SM_ARG_PARAM,
  SM_MODE_PARAM,
  SM_STATE_SLOT,
  type StateMachineExpressionHost
} from "./state-machine-core.js";
import { lowerStateMachineExpression } from "./state-machine-expr.js";
import { hoistVarDeclarations } from "./state-machine-bindings.js";
import { lowerStatementList } from "./state-machine-statements.js";
import type { JsIrOperation } from "./types.js";

export type SuspendableKind = "generator" | "async";

export interface SuspendableBodyOptions {
  readonly kind: SuspendableKind;
  readonly body: ts.ConciseBody;
  readonly bindings: ReadonlyMap<string, JsIrBindingValue>;
  readonly outerParameterNames: ReadonlySet<string>;
  readonly outerCaptureNames: readonly string[];
  readonly nameHint: string;
}

export interface ExceptionHandlerRegion {
  readonly startState: number;
  readonly endState: number;
  readonly kind: "catch" | "finally";
  readonly targetState: number;
  readonly catchSlot?: string;
  readonly finKindSlot?: string;
  readonly finValSlot?: string;
}

export interface FinallyFrame {
  readonly finallyState: number;
  readonly finKindSlot: string;
  readonly finValSlot: string;
}

export interface LoopTargetFrame {
  readonly label: string | undefined;
  readonly breakState: number;
  readonly continueState: number | undefined;
  readonly finallyDepth: number;
}

/** Detects whether a function-like node is a generator (`*`) or `async` function. */
export function suspendableKindFor(
  node: ts.FunctionLikeDeclaration
): SuspendableKind | undefined {
  const isAsync = ts.canHaveModifiers(node)
    && ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) === true;
  if (isAsync) {
    return "async";
  }
  if (node.asteriskToken !== undefined) {
    return "generator";
  }
  return undefined;
}

/**
 * Lowers a generator (`function*`, `*m()`) or async (`async function`, `async () =>`, `async m()`)
 * body into a unified state-machine `step(__sm_mode, __sm_arg)` closure capturing lifted frame slots,
 * and returns the outer function's operations (`letValue` frame cells + `generatorCreate` / `asyncStart`).
 */
export function lowerSuspendableBody(
  context: LoweringContext,
  options: SuspendableBodyOptions
): Produced<readonly JsIrOperation[]> {
  const builder = new StateMachineBuilder(context, options.kind, options.outerParameterNames);
  const bodyBindings = new Map(options.bindings);
  hoistVarDeclarations(builder, options.body, bodyBindings);

  // State 0: one-time prologue for suspendedStart `.return(v)` / `.throw(e)`.
  const bodyStartState = builder.allocateState();
  emitPrologueState(builder, bodyStartState);

  builder.switchToState(bodyStartState);
  if (ts.isBlock(options.body)) {
    const lowered = lowerStatementList(builder, options.body.statements, bodyBindings);
    if (lowered.kind !== "lowered") {
      return lowered;
    }
    if (!builder.isStateTerminated()) {
      builder.emitReturn({ kind: "undefined" });
    }
  } else {
    const value = lowerStateMachineExpression(builder, options.body, bodyBindings);
    if (value.kind !== "lowered") {
      return value;
    }
    builder.emitReturn(value.operation);
  }

  return produced(assembleOuterOperations(context, builder, options));
}

function emitPrologueState(builder: StateMachineBuilder, bodyStartState: number): void {
  builder.switchToState(0);
  const modeRef: JsIrValueExpression = { kind: "variable", name: SM_MODE_PARAM };
  const argRef: JsIrValueExpression = { kind: "variable", name: SM_ARG_PARAM };
  builder.emit({
    kind: "if",
    condition: { kind: "valueComparison", operator: "===", left: modeRef, right: { kind: "number", value: { kind: "literal", value: 1 } } },
    thenOperations: [
      { kind: "assignValue", name: SM_STATE_SLOT, value: { kind: "number", value: { kind: "literal", value: -1 } } },
      { kind: "returnValue", expression: { kind: "iteratorResult", value: argRef, done: true } }
    ],
    elseOperations: [
      {
        kind: "if",
        condition: { kind: "valueComparison", operator: "===", left: modeRef, right: { kind: "number", value: { kind: "literal", value: 2 } } },
        thenOperations: [
          { kind: "assignValue", name: SM_STATE_SLOT, value: { kind: "number", value: { kind: "literal", value: -1 } } },
          { kind: "throwValue", value: argRef }
        ],
        elseOperations: [
          { kind: "assignValue", name: SM_STATE_SLOT, value: { kind: "number", value: { kind: "literal", value: bodyStartState } } },
          { kind: "break" }
        ]
      }
    ]
  });
}

function assembleOuterOperations(
  context: LoweringContext,
  builder: StateMachineBuilder,
  options: SuspendableBodyOptions
): readonly JsIrOperation[] {
  const outerOps: JsIrOperation[] = [
    { kind: "letValue", name: SM_STATE_SLOT, value: { kind: "number", value: { kind: "literal", value: 0 } } }
  ];
  for (const slot of builder.liftedSlots) {
    outerOps.push({ kind: "letValue", name: slot, value: { kind: "undefined" } });
  }

  const captures = collectStepCaptures(builder, options);
  const stepCodeName = `__tscn_sm_${options.nameHint}_${context.nextFunctionObjectId}`.replace(/[^A-Za-z0-9_]/g, "_");
  context.nextFunctionObjectId += 1;

  const stepExpression: JsIrValueExpression = {
    kind: "functionObject",
    definition: {
      codeName: stepCodeName,
      parameters: [
        { name: SM_MODE_PARAM, valueKind: "value" },
        { name: SM_ARG_PARAM, valueKind: "value" }
      ],
      functionKind: "arrow",
      returnKind: "value",
      body: buildStepBody(builder),
      captures
    }
  };

  outerOps.push({
    kind: "returnValue",
    expression: options.kind === "generator"
      ? { kind: "generatorCreate", step: stepExpression }
      : { kind: "asyncStart", step: stepExpression }
  });
  return outerOps;
}

function collectStepCaptures(
  builder: StateMachineBuilder,
  options: SuspendableBodyOptions
): readonly JsIrFunctionObjectCapture[] {
  const captures: JsIrFunctionObjectCapture[] = [
    { name: SM_STATE_SLOT, valueKind: "value", value: { kind: "variable", name: SM_STATE_SLOT } }
  ];
  const seen = new Set<string>([SM_STATE_SLOT]);
  for (const slot of builder.liftedSlots) {
    if (!seen.has(slot)) {
      seen.add(slot);
      captures.push({ name: slot, valueKind: "value", value: { kind: "variable", name: slot } });
    }
  }
  for (const paramName of options.outerParameterNames) {
    if (seen.has(paramName)) {
      continue;
    }
    const captured = lowerCapturedBindingValue(options.bindings.get(paramName));
    if (captured !== undefined) {
      seen.add(paramName);
      captures.push({ name: paramName, ...captured });
    }
  }
  for (const outerName of options.outerCaptureNames) {
    if (seen.has(outerName)) {
      continue;
    }
    const captured = lowerCapturedBindingValue(options.bindings.get(outerName));
    if (captured !== undefined) {
      seen.add(outerName);
      captures.push({ name: outerName, ...captured });
    }
  }
  return captures;
}

function buildStepBody(builder: StateMachineBuilder): readonly JsIrOperation[] {
  const clauses: JsIrSwitchClause[] = builder.states.map((operations, index) => ({
    test: { kind: "number", value: { kind: "literal", value: index } },
    operations
  }));
  clauses.push({
    operations: [{ kind: "returnValue", expression: { kind: "iteratorResult", value: { kind: "undefined" }, done: true } }]
  });
  const switchOp: JsIrOperation = {
    kind: "switch",
    expression: { kind: "variable", name: SM_STATE_SLOT },
    clauses
  };
  const catchOps = buildExceptionDispatch(builder.handlers);
  return [{
    kind: "while",
    condition: { kind: "boolean", value: true },
    body: [{
      kind: "tryCatch",
      tryOperations: [switchOp],
      catchVariable: "__sm_err",
      catchOperations: catchOps,
      hasCatch: true
    }]
  }];
}

function buildExceptionDispatch(handlers: readonly ExceptionHandlerRegion[]): readonly JsIrOperation[] {
  const errRef: JsIrValueExpression = { kind: "variable", name: "__sm_err" };
  let fallback: readonly JsIrOperation[] = [
    { kind: "assignValue", name: SM_STATE_SLOT, value: { kind: "number", value: { kind: "literal", value: -1 } } },
    { kind: "throwValue", value: errRef }
  ];
  const ordered = [...handlers].toSorted((a, b) => (b.endState - b.startState) - (a.endState - a.startState));
  const stateNum = { kind: "valueToNumber" as const, value: { kind: "variable" as const, name: SM_STATE_SLOT } };
  for (const region of ordered) {
    const inRange: JsIrCondition = {
      kind: "and",
      left: { kind: "numberComparison", operator: ">=", left: stateNum, right: { kind: "literal", value: region.startState } },
      right: { kind: "numberComparison", operator: "<=", left: stateNum, right: { kind: "literal", value: region.endState } }
    };
    const thenOperations: JsIrOperation[] = [];
    if (region.kind === "catch") {
      if (region.catchSlot !== undefined) {
        thenOperations.push({ kind: "assignValue", name: region.catchSlot, value: errRef });
      }
    } else {
      if (region.finKindSlot !== undefined) {
        thenOperations.push({ kind: "assignValue", name: region.finKindSlot, value: { kind: "number", value: { kind: "literal", value: FINALLY_THROW } } });
      }
      if (region.finValSlot !== undefined) {
        thenOperations.push({ kind: "assignValue", name: region.finValSlot, value: errRef });
      }
    }
    thenOperations.push({ kind: "assignValue", name: SM_STATE_SLOT, value: { kind: "number", value: { kind: "literal", value: region.targetState } } });
    fallback = [{ kind: "if", condition: inRange, thenOperations, elseOperations: fallback }];
  }
  return fallback;
}

export class StateMachineBuilder implements StateMachineExpressionHost {
  public readonly context: LoweringContext;
  public readonly kind: SuspendableKind;
  public readonly states: JsIrOperation[][] = [[]];
  public readonly liftedSlots: string[] = [];
  public readonly handlers: ExceptionHandlerRegion[] = [];
  public readonly finallyStack: FinallyFrame[] = [];
  public readonly loopStack: LoopTargetFrame[] = [];
  public pendingLabel: string | undefined = undefined;
  readonly #reservedNames: Set<string>;
  readonly #terminatedStates = new Set<number>();
  #currentState = 0;
  #nextTempId = 0;

  public constructor(context: LoweringContext, kind: SuspendableKind, outerParameterNames: ReadonlySet<string>) {
    this.context = context;
    this.kind = kind;
    this.#reservedNames = new Set([SM_MODE_PARAM, SM_ARG_PARAM, SM_STATE_SLOT, "__sm_err", CLASS_THIS_NAME, ...outerParameterNames]);
  }

  public allocateLocal(preferredName: string): string {
    if (!this.#reservedNames.has(preferredName) && !preferredName.startsWith("__sm_")) {
      this.#reservedNames.add(preferredName);
      this.liftedSlots.push(preferredName);
      return preferredName;
    }
    const slot = `__sm_v${this.#nextTempId}_${preferredName}`;
    this.#nextTempId += 1;
    this.#reservedNames.add(slot);
    this.liftedSlots.push(slot);
    return slot;
  }

  public allocateTemp(prefix = "t"): string {
    const slot = `__sm_${prefix}${this.#nextTempId}`;
    this.#nextTempId += 1;
    this.#reservedNames.add(slot);
    this.liftedSlots.push(slot);
    return slot;
  }

  public allocateState(): number {
    const id = this.states.length;
    this.states.push([]);
    return id;
  }

  public switchToState(state: number): void {
    this.#currentState = state;
  }

  public isStateTerminated(): boolean {
    return this.#terminatedStates.has(this.#currentState);
  }

  public emit(operation: JsIrOperation): void {
    if (this.#terminatedStates.has(this.#currentState)) {
      return;
    }
    this.states[this.#currentState].push(operation);
    if (operation.kind === "returnValue" || operation.kind === "throwValue" || operation.kind === "break") {
      this.#terminatedStates.add(this.#currentState);
    }
  }

  public emitGoto(targetState: number): void {
    if (this.#terminatedStates.has(this.#currentState)) {
      return;
    }
    this.emit({ kind: "assignValue", name: SM_STATE_SLOT, value: { kind: "number", value: { kind: "literal", value: targetState } } });
    this.emit({ kind: "break" });
  }

  public emitReturn(value: JsIrValueExpression): void {
    if (this.#terminatedStates.has(this.#currentState)) {
      return;
    }
    const frame = this.finallyStack.at(-1);
    if (frame !== undefined) {
      this.emit({ kind: "assignValue", name: frame.finKindSlot, value: { kind: "number", value: { kind: "literal", value: FINALLY_RETURN } } });
      this.emit({ kind: "assignValue", name: frame.finValSlot, value });
      this.emitGoto(frame.finallyState);
      return;
    }
    this.emit({ kind: "assignValue", name: SM_STATE_SLOT, value: { kind: "number", value: { kind: "literal", value: -1 } } });
    this.emit({ kind: "returnValue", expression: { kind: "iteratorResult", value, done: true } });
  }

  public emitJump(targetState: number, targetFinallyDepth: number): void {
    if (this.#terminatedStates.has(this.#currentState)) {
      return;
    }
    if (this.finallyStack.length > targetFinallyDepth) {
      const frame = this.finallyStack.at(-1);
      if (frame !== undefined) {
        this.emit({ kind: "assignValue", name: frame.finKindSlot, value: { kind: "number", value: { kind: "literal", value: FINALLY_JUMP } } });
        this.emit({ kind: "assignValue", name: frame.finValSlot, value: { kind: "number", value: { kind: "literal", value: targetState } } });
        this.emitGoto(frame.finallyState);
        return;
      }
    }
    this.emitGoto(targetState);
  }

  public emitSuspend(yieldedValue: JsIrValueExpression, resultSlot: string | undefined): void {
    const resumeState = this.allocateState();
    this.emit({ kind: "assignValue", name: SM_STATE_SLOT, value: { kind: "number", value: { kind: "literal", value: resumeState } } });
    this.emit({ kind: "returnValue", expression: { kind: "iteratorResult", value: yieldedValue, done: false } });

    this.switchToState(resumeState);
    const modeRef: JsIrValueExpression = { kind: "variable", name: SM_MODE_PARAM };
    const argRef: JsIrValueExpression = { kind: "variable", name: SM_ARG_PARAM };

    const afterCheckState = this.allocateState();
    const returnState = this.kind === "generator" ? this.allocateState() : undefined;
    const mode2Cond: JsIrCondition = {
      kind: "valueComparison",
      operator: "===",
      left: modeRef,
      right: { kind: "number", value: { kind: "literal", value: 2 } }
    };
    const normalOps: JsIrOperation[] = resultSlot === undefined
      ? []
      : [{ kind: "assignValue", name: resultSlot, value: argRef }];
    normalOps.push(
      { kind: "assignValue", name: SM_STATE_SLOT, value: { kind: "number", value: { kind: "literal", value: afterCheckState } } },
      { kind: "break" }
    );

    const elseOps: readonly JsIrOperation[] = returnState === undefined
      ? normalOps
      : [{
          kind: "if",
          condition: { kind: "valueComparison", operator: "===", left: modeRef, right: { kind: "number", value: { kind: "literal", value: 1 } } },
          thenOperations: [
            { kind: "assignValue", name: SM_STATE_SLOT, value: { kind: "number", value: { kind: "literal", value: returnState } } },
            { kind: "break" }
          ],
          elseOperations: normalOps
        }];

    this.emit({
      kind: "if",
      condition: mode2Cond,
      thenOperations: [{ kind: "throwValue", value: argRef }],
      elseOperations: elseOps
    });

    if (returnState !== undefined) {
      this.switchToState(returnState);
      this.emitReturn(argRef);
    }
    this.switchToState(afterCheckState);
  }

  public emitAssignToTarget(
    target: ts.Expression,
    value: JsIrValueExpression,
    bindings: ReadonlyMap<string, JsIrBindingValue>
  ): Produced<undefined> {
    if (ts.isIdentifier(target)) {
      const binding = bindings.get(target.text);
      if (binding?.kind !== "valueVariable") {
        return unsupportedIn(`Cannot assign to \`${target.text}\` inside a generator or async function`);
      }
      this.emit({ kind: "assignValue", name: binding.name, value });
      return produced(undefined);
    }
    if (ts.isPropertyAccessExpression(target)) {
      const recv = lowerStateMachineExpression(this, target.expression, bindings);
      if (recv.kind !== "lowered") {
        return recv;
      }
      const recvSlot = this.allocateTemp("obj");
      this.emit({ kind: "assignValue", name: recvSlot, value: recv.operation });
      this.emit({ kind: "valueObjectStore", targetName: recvSlot, key: { kind: "literal", value: target.name.text }, value });
      return produced(undefined);
    }
    if (ts.isElementAccessExpression(target)) {
      const recv = lowerStateMachineExpression(this, target.expression, bindings);
      if (recv.kind !== "lowered") {
        return recv;
      }
      const recvSlot = this.allocateTemp("obj");
      this.emit({ kind: "assignValue", name: recvSlot, value: recv.operation });
      const key = lowerStateMachineExpression(this, target.argumentExpression, bindings);
      if (key.kind !== "lowered") {
        return key;
      }
      this.emit({ kind: "valueObjectStore", targetName: recvSlot, key: { kind: "stringConversion", value: key.operation }, value });
      return produced(undefined);
    }
    return unsupportedIn("This assignment target around `yield` or `await` is not supported yet");
  }
}
