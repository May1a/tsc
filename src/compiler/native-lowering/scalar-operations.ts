import type { ResolvedOperation } from "../binding-resolution/index.js";
import type { VariantHandlers, VariantOfKind } from "../dispatch.js";
import type { OperationContext } from "./operation-context.js";
import { llvm } from "../llvm-ir/index.js";
import { boxString } from "./expression-context.js";
import { literalString } from "./value-support.js";

type ScalarKind =
  | "constNumber" | "letNumber" | "assignNumber" | "constString" | "constStringExpression" | "letString" | "assignString"
  | "constBoolean" | "constBooleanExpression" | "letBoolean" | "assignBoolean" | "constValue" | "letValue"
  | "print" | "throwValue" | "returnNumber" | "returnString" | "returnValue" | "call" | "callValue" | "inlineCpp"
  | "requireObjectCoercible" | "block" | "bindingGroup" | "if" | "tryCatch" | "switch" | "while" | "doWhile" | "for" | "break" | "continue";

type ScalarVariants = { readonly [K in ScalarKind]: VariantOfKind<ResolvedOperation, K> };

export const scalarOperationHandlers: VariantHandlers<ScalarVariants, OperationContext, void> = {
  constNumber: (operation, context) => context.writes.storeNumber(operation.name, context.expressions.number(operation.value)),
  letNumber: (operation, context) => context.writes.storeNumber(operation.name, context.expressions.number(operation.value)),
  assignNumber: (operation, context) => context.writes.storeNumber(operation.name, context.expressions.number(operation.value)),
  constString: (operation, context) => context.writes.storeString(operation.name, literalString(operation.value, context)),
  constStringExpression: (operation, context) => context.writes.storeString(operation.name, context.expressions.string(operation.value)),
  letString: (operation, context) => context.writes.storeString(operation.name, context.expressions.string(operation.value)),
  assignString: (operation, context) => context.writes.storeString(operation.name, context.expressions.string(operation.value)),
  constBoolean: (operation, context) => context.writes.storeBoolean(operation.name,
    context.cursor.currentBlock().int(llvm.i1, operation.value ? 1n : 0n)),
  constBooleanExpression: (operation, context) => context.writes.storeBoolean(operation.name, context.expressions.condition(operation.value)),
  letBoolean: (operation, context) => context.writes.storeBoolean(operation.name, context.expressions.condition(operation.value)),
  assignBoolean: (operation, context) => context.writes.storeBoolean(operation.name, context.expressions.condition(operation.value)),
  constValue: (operation, context) => context.writes.storeValue(operation.name, context.expressions.value(operation.value)),
  letValue: (operation, context) => context.writes.storeValue(operation.name, context.expressions.value(operation.value)),
  print: (operation, context) => context.runtime.callVoid("valuePrint", [context.expressions.expression(operation.expression)]),
  throwValue: (operation, context) => context.throwValue(context.expressions.value(operation.value)),
  returnNumber: (operation, context) => {
    const value = context.expressions.number(operation.expression);
    context.returnValue(context.values.forBlock(context.cursor.currentBlock()).boxNumber(value));
  },
  returnString: (operation, context) => context.returnValue(boxString(context.expressions.string(operation.expression), context)),
  returnValue: (operation, context) => context.returnValue(context.expressions.value(operation.expression)),
  call: (operation, context) => { context.calls.direct(operation); },
  callValue: (operation, context) => { context.expressions.value(operation); },
  inlineCpp: (operation, context) => { context.calls.inlineCpp(operation.symbol); },
  requireObjectCoercible: (operation, context) => {
    const value = context.expressions.value(operation.value);
    context.runtime.callWithCompletion("requireObjectCoercible", [value], context.cursor.uniqueName("coercible"), context.exceptionTarget());
  },
  block: (operation, context) => context.operations.operations(operation.operations),
  bindingGroup: (operation, context) => context.operations.operations(operation.operations),
  if: (operation, context) => context.flow.branch(operation, context),
  tryCatch: (operation, context) => context.flow.tryCatch(operation, context),
  switch: (operation, context) => context.flow.switch(operation, context),
  while: (operation, context) => context.flow.loop(operation, context),
  doWhile: (operation, context) => context.flow.loop(operation, context),
  for: (operation, context) => context.flow.loop(operation, context),
  break: (operation, context) => context.flow.jump(operation),
  continue: (operation, context) => context.flow.jump(operation)
};
