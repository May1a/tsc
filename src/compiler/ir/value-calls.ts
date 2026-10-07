import { type Lowered, loweredPayload, notApplicable, produced } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import type { JsIrRuntimeArrayElement, JsIrStringExpression, JsIrValueExpression } from "./expressions.js";
import { lowerCallArguments, lowerValueCallArguments } from "./call-arguments.js";
import { isKnownGlobalCallee, isPlannedBuiltinCall } from "./builtins/index.js";
import { optionalStatementCallee } from "./optional-call.js";
import { lowerPropertyKeyExpression } from "./string-expressions.js";
import { iteratorErrorSubject } from "./iterator-subject.js";

export function lowerValueConditionalExpression(
  context: LoweringContext,
  expression: ts.ConditionalExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  const condition = context.lowerConditionExpression(context, expression.condition, bindings);
  if (condition.kind === "unsupported") {
    return condition;
  }
  const consequentResult = context.lowerValueExpression(context, expression.whenTrue, bindings);
  if (consequentResult.kind === "unsupported") {
    return consequentResult;
  }
  const consequent = loweredPayload(consequentResult);
  const alternateResult = context.lowerValueExpression(context, expression.whenFalse, bindings);
  if (alternateResult.kind === "unsupported") {
    return alternateResult;
  }
  const alternate = loweredPayload(alternateResult);
  if (condition.kind !== "lowered" || consequent === undefined || alternate === undefined) {
    return notApplicable;
  }
  return produced({ kind: "ternary", condition: condition.operation, consequent, alternate });
}

export function lowerValueCallExpression(
  context: LoweringContext,
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  const spreadCall = lowerSpreadCallValue(context, expression, bindings);
  if (spreadCall.kind !== "notApplicable") {
    return spreadCall;
  }
  if (ts.isIdentifier(expression.expression)) {
    const callee = bindings.get(expression.expression.text);
    if (callee?.kind === "function" && callee.returnKind === "value") {
      const args = lowerCallArguments(context, expression.expression.text, expression.arguments, bindings);
      if (args.kind !== "lowered") {
        return args;
      }
      return produced({ kind: "call", name: expression.expression.text, arguments: args.operation });
    }
    // See `lowerCallStatement`: an unbound global has no definition behind it, while an unbound
    // cross-module function does.
    if (callee === undefined && isKnownGlobalCallee(expression.expression)) {
      return notApplicable;
    }
  }

  if (isPlannedBuiltinCall(expression.expression, bindings)) {
    return notApplicable;
  }
  const calleeValueResult = context.lowerValueExpression(context, expression.expression, bindings);
  if (calleeValueResult.kind === "unsupported") {
    return calleeValueResult;
  }
  const calleeValue = loweredPayload(calleeValueResult);
  const argsResult = lowerValueCallArguments(context, expression.arguments, bindings);
  if (argsResult.kind === "unsupported") {
    return argsResult;
  }
  const args = loweredPayload(argsResult);
  if (calleeValue === undefined || args === undefined) {
    return notApplicable;
  }
  const callThisValueResult = lowerCallThisValue(context, expression.expression, bindings);
  if (callThisValueResult.kind === "unsupported") {
    return callThisValueResult;
  }
  return produced({
    kind: "callValue",
    callee: calleeValue,
    arguments: args,
    thisValue: loweredPayload(callThisValueResult),
    optionalCallee: optionalStatementCallee(expression)
  });
}

export function lowerCallThisValue(
  context: LoweringContext,
  callee: ts.LeftHandSideExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  if (ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee)) {
    return context.lowerValueExpression(context, callee.expression, bindings);
  }
  return notApplicable;
}

function lowerMethodCallTarget(
  context: LoweringContext,
  callee: ts.LeftHandSideExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<{ readonly receiver: JsIrValueExpression; readonly key: JsIrStringExpression }> {
  if (ts.isPropertyAccessExpression(callee)) {
    const receiver = context.lowerValueExpression(context, callee.expression, bindings);
    if (receiver.kind !== "lowered") {
      return receiver;
    }
    return produced({ receiver: receiver.operation, key: { kind: "literal", value: callee.name.text } });
  }
  if (ts.isElementAccessExpression(callee)) {
    const receiverResult = context.lowerValueExpression(context, callee.expression, bindings);
    if (receiverResult.kind === "unsupported") {
      return receiverResult;
    }
    const receiver = loweredPayload(receiverResult);
    const keyResult = lowerPropertyKeyExpression(context, callee.argumentExpression, bindings);
    if (keyResult.kind === "unsupported") {
      return keyResult;
    }
    const key = loweredPayload(keyResult);
    if (receiver === undefined || key === undefined) {
      return notApplicable;
    }
    return produced({ receiver, key });
  }
  return notApplicable;
}

// eslint-disable-next-line max-statements -- Spread lowering validates fixed and iterable arguments before preserving a single method receiver evaluation.
export function lowerSpreadCallValue(
  context: LoweringContext,
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<Extract<JsIrValueExpression, { readonly kind: "callValue" }>> {
  if (!expression.arguments.some(ts.isSpreadElement)) {
    return notApplicable;
  }
  if (ts.isIdentifier(expression.expression)) {
    const directFunction = bindings.get(expression.expression.text);
    const hasRestParameter = directFunction?.kind === "function" && directFunction.parameters.some((parameter) => parameter.isRest === true);
    const spreadsAreFixed = expression.arguments.every((argument) => {
      if (!ts.isSpreadElement(argument)) {
        return true;
      }
      return ts.isIdentifier(argument.expression) && bindings.get(argument.expression.text)?.kind === "array";
    });
    if (hasRestParameter && spreadsAreFixed) {
      return notApplicable;
    }
  }
  const callee = context.lowerValueExpression(context, expression.expression, bindings);
  if (callee.kind !== "lowered") {
    return callee;
  }
  const methodTargetResult = lowerMethodCallTarget(context, expression.expression, bindings);
  if (methodTargetResult.kind === "unsupported") {
    return methodTargetResult;
  }
  const methodTarget = loweredPayload(methodTargetResult);
  const spreadArguments: JsIrRuntimeArrayElement[] = [];
  for (const argument of expression.arguments) {
    if (ts.isSpreadElement(argument)) {
      if (ts.isIdentifier(argument.expression)) {
        const binding = bindings.get(argument.expression.text);
        if (binding?.kind === "array") {
          spreadArguments.push({ kind: "spread", arrayName: binding.name, sourceKind: "fixed" });
          continue;
        }
      }
      const source = context.lowerValueExpression(context, argument.expression, bindings);
      if (source.kind !== "lowered") {
        return source;
      }
      spreadArguments.push({
        kind: "iterableSpread",
        source: source.operation,
        notIterableMessage: `${iteratorErrorSubject(argument.expression)} is not iterable`
      });
      continue;
    }
    const value = context.lowerValueExpression(context, argument, bindings);
    if (value.kind !== "lowered") {
      return value;
    }
    spreadArguments.push({ kind: "value", value: value.operation });
  }
  let thisValue: JsIrValueExpression | undefined;
  if (methodTarget === undefined) {
    const callThisValueResult2 = lowerCallThisValue(context, expression.expression, bindings);
    if (callThisValueResult2.kind === "unsupported") {
      return callThisValueResult2;
    }
    thisValue = loweredPayload(callThisValueResult2);
  }
  return produced({
    kind: "callValue",
    callee: callee.operation,
    arguments: [],
    thisValue,
    methodReceiver: methodTarget?.receiver,
    methodKey: methodTarget?.key,
    spreadArguments
  });
}
