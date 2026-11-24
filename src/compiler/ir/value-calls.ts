import { type Lowered, loweredPayload, notApplicable, produced, unsupportedIn, withRefusal } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import type { JsIrRuntimeArrayElement, JsIrStringExpression, JsIrValueExpression } from "./expressions.js";
import { lowerCallArguments, lowerValueCallArguments } from "./call-arguments.js";
import { isKnownGlobalCallee, isPlannedBuiltinCall } from "./builtins/index.js";
import { optionalReceiverGuard, optionalStatementCallee } from "./optional-call.js";
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
  if (spreadCall.kind === "lowered") {
    return produced(optionalReceiverGuard(spreadCall.operation) ?? spreadCall.operation);
  }
  if (spreadCall.kind !== "notApplicable") {
    return spreadCall;
  }
  if (ts.isIdentifier(expression.expression)) {
    const directCall = lowerNamedValueCall(context, expression.expression, expression.arguments, bindings);
    if (directCall.kind !== "notApplicable") {
      return directCall;
    }
    // See `lowerCallStatement`: an unbound global has no definition behind it, while an unbound
    // cross-module function does.
    if (bindings.get(expression.expression.text) === undefined && isKnownGlobalCallee(expression.expression)) {
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
  const argsResult = lowerValueCallArguments(context, expression.arguments, bindings, expression.expression.getText());
  if (argsResult.kind === "unsupported") {
    return argsResult;
  }
  const args = loweredPayload(argsResult);
  if (calleeValue === undefined || args === undefined) {
    // As in the statement path, an unlowered callee is reported by name at the diagnostic, while an
    // unlowered argument of a lowered callee is this call's own refusal.
    if (calleeValue !== undefined && argsResult.kind !== "lowered") {
      return withRefusal(argsResult, unsupportedIn(`Arguments to \`${expression.expression.getText()}\` must be expressions this build can evaluate`));
    }
    return notApplicable;
  }
  const target = resolveCallValueTarget(context, expression.expression, calleeValue, bindings);
  if (target.kind !== "lowered") {
    return target;
  }
  const built: Extract<JsIrValueExpression, { readonly kind: "callValue" }> = {
    kind: "callValue",
    arguments: args,
    ...target.operation,
    optionalCallee: optionalStatementCallee(expression)
  };
  return produced(optionalReceiverGuard(built) ?? built);
}

function lowerNamedValueCall(
  context: LoweringContext,
  target: ts.Identifier,
  arguments_: ts.NodeArray<ts.Expression>,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  const callee = bindings.get(target.text);
  if ((callee?.kind === "function" || callee?.kind === "functionReference") && callee.returnKind === "value") {
    const args = lowerCallArguments(context, target.text, arguments_, bindings);
    return args.kind === "lowered" ? produced({ kind: "call", name: target.text, arguments: args.operation }) : args;
  }
  if (callee !== undefined) {
    return notApplicable;
  }
  const symbol = context.typeChecker?.getSymbolAtLocation(target);
  if (symbol === undefined || (symbol.flags & ts.SymbolFlags.Alias) === 0) {
    return notApplicable;
  }
  const args = lowerValueCallArguments(context, arguments_, bindings, target.text);
  if (args.kind === "lowered") {
    return produced({ kind: "call", name: target.text, arguments: args.operation });
  }
  return withRefusal(args, unsupportedIn(`Arguments to \`${target.text}\` must be expressions this build can evaluate`));
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
  if (ts.isPropertyAccessExpression(callee) && !ts.isPrivateIdentifier(callee.name) && callee.questionDotToken === undefined) {
    const receiver = context.lowerValueExpression(context, callee.expression, bindings);
    if (receiver.kind !== "lowered") {
      return receiver;
    }
    return produced({ receiver: receiver.operation, key: { kind: "literal", value: callee.name.text } });
  }
  if (ts.isElementAccessExpression(callee) && callee.questionDotToken === undefined) {
    const receiverResult = context.lowerValueExpression(context, callee.expression, bindings);
    if (receiverResult.kind === "unsupported") {
      return receiverResult;
    }
    const receiver = loweredPayload(receiverResult);
    const keyResult = lowerPropertyKeyExpression(context, callee.argumentExpression, bindings);
    if (keyResult.kind === "unsupported") {
      return keyResult;
    }
    let key = loweredPayload(keyResult);
    if (key === undefined) {
      const indexResult = context.lowerNumberExpression(context, callee.argumentExpression, bindings);
      if (indexResult.kind === "unsupported") {
        return indexResult;
      }
      const index = loweredPayload(indexResult);
      if (index !== undefined) {
        key = index.kind === "literal"
          ? { kind: "literal", value: String(index.value) }
          : { kind: "stringConversion", value: { kind: "number", value: index } };
      }
    }
    if (receiver === undefined || key === undefined) {
      return notApplicable;
    }
    return produced({ receiver, key });
  }
  return notApplicable;
}

interface MethodCallTarget {
  readonly methodReceiver: JsIrValueExpression;
  readonly methodKey: JsIrStringExpression;
}

function isNonOptionalPublicMemberCallee(callee: ts.LeftHandSideExpression): boolean {
  return (ts.isPropertyAccessExpression(callee) && !ts.isPrivateIdentifier(callee.name) && callee.questionDotToken === undefined)
    || (ts.isElementAccessExpression(callee) && callee.questionDotToken === undefined);
}

/**
 * Reuses the already-lowered receiver and key from `calleeValue` when a non-optional member call
 * lowered to a dynamic property or element lookup, avoiding re-lowering the receiver chain.
 */
function extractMethodCallTarget(
  callee: ts.LeftHandSideExpression,
  calleeValue: JsIrValueExpression
): MethodCallTarget | undefined {
  if (!isNonOptionalPublicMemberCallee(callee)) {
    return undefined;
  }
  if (calleeValue.kind === "valueObjectDynamicAccess") {
    return { methodReceiver: calleeValue.value, methodKey: calleeValue.key };
  }
  if (calleeValue.kind === "objectDynamicAccess") {
    return { methodReceiver: { kind: "objectRef", name: calleeValue.objectName }, methodKey: calleeValue.key };
  }
  if (calleeValue.kind === "valueArrayAccess") {
    const methodKey: JsIrStringExpression = calleeValue.index.kind === "literal"
      ? { kind: "literal", value: String(calleeValue.index.value) }
      : { kind: "stringConversion", value: { kind: "number", value: calleeValue.index } };
    return { methodReceiver: calleeValue.value, methodKey };
  }
  if (calleeValue.kind === "arrayAccess") {
    const methodKey: JsIrStringExpression = calleeValue.key
      ?? (calleeValue.index.kind === "literal"
        ? { kind: "literal", value: String(calleeValue.index.value) }
        : { kind: "stringConversion", value: { kind: "number", value: calleeValue.index } });
    return { methodReceiver: { kind: "arrayRef", name: calleeValue.arrayName }, methodKey };
  }
  return undefined;
}

interface ResolvedCallValueTarget {
  readonly callee: JsIrValueExpression;
  readonly thisValue?: JsIrValueExpression;
  readonly methodReceiver?: JsIrValueExpression;
  readonly methodKey?: JsIrStringExpression;
}

/**
 * Resolves the callee and receiver for a `callValue`. For non-optional member calls, lifts the
 * receiver and key into `methodReceiver`/`methodKey` (dropping the redundant `callee` subtree) so
 * chained calls stay linear in IR size and evaluate each receiver once.
 */
export function resolveCallValueTarget(
  context: LoweringContext,
  callee: ts.LeftHandSideExpression,
  calleeValue: JsIrValueExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<ResolvedCallValueTarget> {
  const extracted = extractMethodCallTarget(callee, calleeValue);
  if (extracted !== undefined) {
    return produced({ callee: { kind: "undefined" }, ...extracted });
  }
  if (calleeValue.kind !== "optionalChain") {
    const methodTarget = lowerMethodCallTarget(context, callee, bindings);
    if (methodTarget.kind === "unsupported") {
      return methodTarget;
    }
    if (methodTarget.kind === "lowered") {
      return produced({
        callee: { kind: "undefined" },
        methodReceiver: methodTarget.operation.receiver,
        methodKey: methodTarget.operation.key
      });
    }
  }
  const callThis = lowerCallThisValue(context, callee, bindings);
  if (callThis.kind === "unsupported") {
    return callThis;
  }
  return produced({ callee: calleeValue, thisValue: loweredPayload(callThis) });
}

export function lowerSpreadCallValue(
  context: LoweringContext,
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<Extract<JsIrValueExpression, { readonly kind: "callValue" }>> {
  if (!expression.arguments.some(ts.isSpreadElement) || isFixedRestSpreadCall(expression, bindings)) {
    return notApplicable;
  }
  const callee = context.lowerValueExpression(context, expression.expression, bindings);
  if (callee.kind !== "lowered") {
    return callee;
  }
  const target = resolveCallValueTarget(context, expression.expression, callee.operation, bindings);
  if (target.kind !== "lowered") {
    return target;
  }
  const spreadArguments = lowerSpreadElements(context, expression.arguments, bindings);
  if (spreadArguments.kind !== "lowered") {
    return spreadArguments;
  }
  return produced({
    kind: "callValue",
    arguments: [],
    ...target.operation,
    spreadArguments: spreadArguments.operation
  });
}

function isFixedRestSpreadCall(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): boolean {
  if (!ts.isIdentifier(expression.expression)) {
    return false;
  }
  const directFunction = bindings.get(expression.expression.text);
  const hasRestParameter =
    (directFunction?.kind === "function" || directFunction?.kind === "functionReference") &&
    directFunction.parameters.some((parameter) => parameter.isRest === true);
  if (!hasRestParameter) {
    return false;
  }
  return expression.arguments.every((argument) =>
    !ts.isSpreadElement(argument) || (ts.isIdentifier(argument.expression) && bindings.get(argument.expression.text)?.kind === "array")
  );
}

export function lowerSpreadElements(
  context: LoweringContext,
  argumentList: ts.NodeArray<ts.Expression>,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<readonly JsIrRuntimeArrayElement[]> {
  const spreadArguments: JsIrRuntimeArrayElement[] = [];
  for (const argument of argumentList) {
    if (ts.isSpreadElement(argument)) {
      if (ts.isIdentifier(argument.expression) && bindings.get(argument.expression.text)?.kind === "array") {
        spreadArguments.push({ kind: "spread", arrayName: argument.expression.text, sourceKind: "fixed" });
        continue;
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
  return produced(spreadArguments);
}
