import { type Lowered, notApplicable, produced } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue, JsIrCallArgument, JsIrFunctionParameter } from "./bindings.js";
import type { JsIrClosureValue, JsIrNumberExpression, JsIrValueExpression } from "./expressions.js";
import { lowerTypedCallArgument } from "./call-arguments.js";
import { functionExpressionKind, unwrapTypeOnlyExpression } from "./predicates.js";
import { containsLexicalArguments, containsLexicalThis } from "./class-info.js";
import { CLASS_THIS_NAME } from "./class-names.js";
import { collectParameterBindingNames } from "./var-hoisting.js";
import { collectFunctionExpressionCaptureNames, functionExpressionSelfReferences, lowerInlineFunctionCaptures } from "./captures.js";
import { lowerInlineFunctionBody } from "./array-callbacks.js";
import { functionReturnKind } from "./binding-updates.js";
import { lowerSuspendableBody, suspendableKindFor } from "./state-machine.js";

export function lowerClosureFactoryCall(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrClosureValue> {
  if (!ts.isCallExpression(expression) || !ts.isIdentifier(expression.expression)) {
    return notApplicable;
  }

  const factory = bindings.get(expression.expression.text);
  if (factory?.kind !== "closureFactory") {
    return notApplicable;
  }
  if (expression.arguments.length !== factory.factoryParameters.length) {
    return notApplicable;
  }

  const factoryArgs = new Map<string, JsIrNumberExpression>();
  for (let i = 0; i < factory.factoryParameters.length; i++) {
    const argument = expression.arguments[i];
    const lowered = context.lowerNumberExpression(context, argument, bindings);
    if (lowered.kind !== "lowered") {
      return lowered;
    }
    factoryArgs.set(factory.factoryParameters[i], lowered.operation);
  }

  const captures: JsIrNumberExpression[] = [];
  for (const captureName of factory.captureNames) {
    const capture = factoryArgs.get(captureName);
    if (capture === undefined) {
      return notApplicable;
    }
    captures.push(capture);
  }

  return produced({
    functionName: factory.functionName,
    captures
  });
}

export function lowerPlainConstructorArguments(
  context: LoweringContext,
  parameters: readonly JsIrFunctionParameter[],
  args: ts.NodeArray<ts.Expression>,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<readonly JsIrCallArgument[]> {
  if (args.length > parameters.length || parameters.some((parameter) => parameter.isRest === true)) {
    return notApplicable;
  }
  const lowered: JsIrCallArgument[] = [];
  for (let index = 0; index < parameters.length; index += 1) {
    const parameter = parameters[index];
    if (index < args.length) {
      const value = lowerTypedCallArgument(context, parameter, args[index], bindings);
      if (value.kind !== "lowered") {
        return value;
      }
      lowered.push(value.operation);
    } else if (parameter.valueKind === "value") {
      lowered.push({ valueKind: "value", value: { kind: "undefined" } });
    } else if (parameter.defaultValue === undefined) {
      return notApplicable;
    } else {
      lowered.push({ valueKind: "undefined" });
    }
  }
  return produced(lowered);
}

// eslint-disable-next-line complexity, max-statements -- Function value lowering validates both declaration references and inline function syntax.
export function lowerFunctionObjectValue(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  inferredName?: string
): Lowered<JsIrValueExpression> {
  const unwrappedExpression = unwrapTypeOnlyExpression(expression);
  if (unwrappedExpression !== expression) {
    return lowerFunctionObjectValue(context, unwrappedExpression, bindings, inferredName);
  }
  if (ts.isIdentifier(expression)) {
    const binding = bindings.get(expression.text);
    if (binding?.kind !== "function" && binding?.kind !== "functionReference") {
      return notApplicable;
    }
    const codeName = `__tscn_fnobj_ref_${expression.text}_${context.nextFunctionObjectId}`.replace(/[^A-Za-z0-9_]/g, "_");
    context.nextFunctionObjectId += 1;
    return produced({
      kind: "functionObject",
      definition: {
        codeName,
        parameters: binding.parameters,
        functionKind: "ordinary",
        returnKind: binding.returnKind,
        directTarget: expression.text
      }
    });
  }

  if (!ts.isArrowFunction(expression) && !ts.isFunctionExpression(expression)) {
    return notApplicable;
  }
  const suspendKind = suspendableKindFor(expression);

  const functionKind = functionExpressionKind(expression);
  const arrowCapturesThis = functionKind === "arrow" && containsLexicalThis(expression.body);
  if (arrowCapturesThis && bindings.get(CLASS_THIS_NAME)?.kind !== "valueVariable") {
    return notApplicable;
  }
  const loweredParams = context.lowerFunctionParameters(context, expression.parameters, bindings);
  if (loweredParams.kind === "unsupported") {
    return loweredParams;
  }
  const { parameters, bindings: functionBindings } = loweredParams.operation;
  if (functionKind === "ordinary") {
    functionBindings.set(CLASS_THIS_NAME, { kind: "valueVariable", name: CLASS_THIS_NAME });
  }
  const selfNames = new Set<string>();
  if (ts.isFunctionExpression(expression) && expression.name !== undefined && bindings.get(expression.name.text) === undefined) {
    selfNames.add(expression.name.text);
  }
  if (inferredName !== undefined && bindings.get(inferredName) === undefined) {
    selfNames.add(inferredName);
  }
  // A function object is emitted under a generated `__tscn_fnobj_*` name with
  // the dynamic (argc/argv) calling convention, so a recursive reference to
  // its own name — or to the variable its initializer is being bound to, which
  // is not bound yet during lowering — would compile into a direct call to a
  // function that is never emitted. Reject such self-references outright.
  if (selfNames.size > 0 && functionExpressionSelfReferences(expression.body, selfNames)) {
    return notApplicable;
  }
  const extraLocals: string[] = [...selfNames];
  if (functionKind === "ordinary") {
    extraLocals.push(CLASS_THIS_NAME);
  }
  const localNames = collectParameterBindingNames(expression.parameters, extraLocals);
  const usesArguments = functionKind === "ordinary" && !localNames.has("arguments") && containsLexicalArguments(expression.body);
  if (usesArguments) {
    functionBindings.set("arguments", { kind: "valueVariable", name: "arguments" });
    localNames.add("arguments");
  }
  const rawCaptureNames = collectFunctionExpressionCaptureNames(expression, localNames, bindings);
  const captureNames = arrowCapturesThis && !rawCaptureNames.includes(CLASS_THIS_NAME)
    ? [CLASS_THIS_NAME, ...rawCaptureNames]
    : rawCaptureNames;
  const runtimeName = expression.name?.text ?? inferredName;
  const displayName = runtimeName ?? "anonymous";
  const body = suspendKind === undefined
    ? lowerInlineFunctionBody(context, expression.body, functionBindings)
    : lowerSuspendableBody(context, {
        kind: suspendKind,
        body: expression.body,
        bindings: functionBindings,
        outerParameterNames: localNames,
        outerCaptureNames: captureNames,
        nameHint: displayName
      });
  if (body.kind !== "lowered") {
    return body;
  }
  const captures = lowerInlineFunctionCaptures(captureNames, bindings);
  if (captures === undefined) {
    return notApplicable;
  }
  const codeName = `__tscn_fnobj_${displayName}_${context.nextFunctionObjectId}`.replace(/[^A-Za-z0-9_]/g, "_");
  context.nextFunctionObjectId += 1;
  return produced({
    kind: "functionObject",
    definition: {
      codeName,
      parameters,
      functionKind,
      returnKind: functionReturnKind(body.operation),
      body: body.operation,
      inferredName: runtimeName,
      ...(captures.length === 0 ? {} : { captures }),
      ...(usesArguments ? { usesArguments: true } : {})
    }
  });
}
