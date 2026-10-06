import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import { type Lowered, loweredPayload, notApplicable, produced } from "./lowered.js";
import { lowerClassMethodCall } from "./class-calls.js";
import { lowerJsonStatementCall } from "./json-values.js";
import { lowerCallThisValue, lowerSpreadCallValue } from "./value-calls.js";
import { unlowerableCallee } from "./builtins/index.js";
import { lowerCallArguments, lowerValueCallArguments } from "./call-arguments.js";
import { optionalStatementCallee } from "./optional-call.js";

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
  if (ts.isPropertyAccessExpression(expression.expression)) {
    const methodCall = lowerClassMethodCall(context, expression, expression.expression, bindings);
    if (methodCall.kind !== "notApplicable") {
      return methodCall;
    }
  }

  const jsonStatement = lowerJsonStatementCall(context, expression, bindings);
  if (jsonStatement.kind !== "notApplicable") {
    return jsonStatement;
  }

  const spreadCall = lowerSpreadCallValue(context, expression, bindings);
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
  const argsResult = lowerValueCallArguments(context, expression.arguments, bindings);
  if (argsResult.kind === "unsupported") {
    return argsResult;
  }
  const args = loweredPayload(argsResult);
  if (callee === undefined || args === undefined) {
    return notApplicable;
  }
  const callThisValueResult = lowerCallThisValue(context, expression.expression, bindings);
  if (callThisValueResult.kind === "unsupported") {
    return callThisValueResult;
  }
  return produced({
    kind: "callValue",
    callee,
    arguments: args,
    thisValue: loweredPayload(callThisValueResult),
    optionalCallee: optionalStatementCallee(expression)
  });
}
