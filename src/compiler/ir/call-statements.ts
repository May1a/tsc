import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import type { JsIrValueExpression } from "./expressions.js";
import { type Lowered, loweredPayload, notApplicable, produced, unsupportedIn, withRefusal } from "./lowered.js";
import { lowerClassMethodCall } from "./class-calls.js";
import { lowerJsonStatementCall } from "./json-values.js";
import { lowerCallThisValue, lowerSpreadCallValue } from "./value-calls.js";
import { unlowerableCallee } from "./builtins/index.js";
import { lowerCallArguments, lowerValueCallArguments } from "./call-arguments.js";
import { discardOptionalCall, optionalReceiverGuard, optionalStatementCallee } from "./optional-call.js";

export function lowerCallStatement(
  context: LoweringContext,
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (ts.isIdentifier(expression.expression) && expression.expression.text === "print") {
    return notApplicable;
  }

  // A discarded `<instance>.<method>(...)` is still a class method call, and the value path
  // cannot see that: it reads the method off the receiver, and class methods are never
  // installed on the prototype, so `jsCall` dispatched on `undefined` and the program
  // segfaulted. Resolve it to the generated method function here, exactly as the value path
  // does, so both positions agree.
  const methodCall = lowerClassMethodCallStatement(context, expression, bindings);
  if (methodCall.kind !== "notApplicable") {
    return methodCall;
  }

  const jsonStatement = lowerJsonStatementCall(context, expression, bindings);
  if (jsonStatement.kind !== "notApplicable") {
    return jsonStatement;
  }

  const spreadCall = lowerSpreadCallValue(context, expression, bindings);
  if (spreadCall.kind === "lowered") {
    const guarded = optionalReceiverGuard(spreadCall.operation);
    if (guarded !== undefined) {
      return produced(discardOptionalCall(context, guarded));
    }
    return produced(spreadCall.operation);
  }
  if (spreadCall.kind !== "notApplicable") {
    return spreadCall;
  }

  let identifierBinding: JsIrBindingValue | undefined;
  if (ts.isIdentifier(expression.expression)) {
    identifierBinding = bindings.get(expression.expression.text);
  }
  if (unlowerableCallee(expression.expression, identifierBinding, bindings)) {
    return notApplicable;
  }
  if (!ts.isIdentifier(expression.expression) || identifierBinding?.kind === "value" || identifierBinding?.kind === "valueVariable") {
    return lowerDynamicCallStatement(context, expression, bindings);
  }

  const args = lowerCallArguments(context, expression.expression.text, expression.arguments, bindings);
  if (args.kind !== "lowered") {
    return args;
  }

  return produced({ kind: "call", name: expression.expression.text, arguments: args.operation });
}

function lowerClassMethodCallStatement(
  context: LoweringContext,
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!ts.isPropertyAccessExpression(expression.expression)) {
    return notApplicable;
  }
  const methodCall = lowerClassMethodCall(context, expression, expression.expression, bindings);
  if (methodCall.kind === "lowered") {
    // A class method on an optional receiver (`s?.area()`) lowers to the direct call guarded
    // by the receiver's nullish check. The guard is a value, so a discarded call materializes
    // it into a throwaway slot rather than dropping the short-circuit.
    if (methodCall.operation.kind === "optionalChain") {
      return produced(discardOptionalCall(context, methodCall.operation));
    }
    return produced(methodCall.operation);
  }
  if (methodCall.kind !== "notApplicable") {
    return methodCall;
  }
  return notApplicable;
}

function lowerDynamicCallStatement(
  context: LoweringContext,
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const calleeResult = context.lowerValueExpression(context, expression.expression, bindings);
  if (calleeResult.kind === "unsupported") {
    return calleeResult;
  }
  const callee = loweredPayload(calleeResult);
  const argsResult = lowerValueCallArguments(context, expression.arguments, bindings, expression.expression.getText());
  if (argsResult.kind === "unsupported") {
    return argsResult;
  }
  const args = loweredPayload(argsResult);
  if (callee === undefined || args === undefined) {
    // The callee names the failure when it did not lower: the diagnostic reports the unrecognized
    // target. Only when the callee lowered and an argument did not is the call's own shape at fault.
    if (callee !== undefined && argsResult.kind !== "lowered") {
      return withRefusal(argsResult, unsupportedIn(`Arguments to \`${expression.expression.getText()}\` must be expressions this build can evaluate`));
    }
    return notApplicable;
  }
  const callThisValueResult = lowerCallThisValue(context, expression.expression, bindings);
  if (callThisValueResult.kind === "unsupported") {
    return callThisValueResult;
  }
  const built: Extract<JsIrValueExpression, { readonly kind: "callValue" }> = {
    kind: "callValue",
    callee,
    arguments: args,
    thisValue: loweredPayload(callThisValueResult),
    optionalCallee: optionalStatementCallee(expression)
  };
  const guarded = optionalReceiverGuard(built);
  if (guarded !== undefined) {
    return produced(discardOptionalCall(context, guarded));
  }
  return produced(built);
}
