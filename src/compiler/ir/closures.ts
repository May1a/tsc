import { unsupportedFormMessage } from "./builtins/manifest.js";
import { type Lowered, notApplicable, produced, unsupportedIn } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue, JsIrCallArgument, JsIrFunctionParameter } from "./bindings.js";
import type { JsIrClosureValue, JsIrNumberExpression, JsIrValueExpression } from "./expressions.js";
import { lowerTypedCallArgument } from "./call-arguments.js";
import { unwrapTypeOnlyExpression } from "./predicates.js";
import { functionExpressionKind } from "./returns.js";
import { containsLexicalThis, parameterValueKind, runtimeParameters } from "./class-info.js";
import { bindFunctionParameter, functionFrameBindings } from "./function-parameters.js";
import { CLASS_THIS_NAME } from "./class-names.js";
import { functionExpressionSelfReferences } from "./captures.js";
import { lowerInlineFunctionBody } from "./array-callbacks.js";
import { functionReturnKind } from "./binding-updates.js";

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
    } else if (parameter.valueKind === "number" && parameter.defaultValue !== undefined) {
      lowered.push({ valueKind: "undefined" });
    } else {
      return notApplicable;
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
  if (expression.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) === true) {
    return unsupportedIn(unsupportedFormMessage("async-function"));
  }
  if (ts.isFunctionExpression(expression) && expression.asteriskToken !== undefined) {
    return unsupportedIn(unsupportedFormMessage("generator-function"));
  }

  const functionKind = functionExpressionKind(expression);
  if (functionKind === "arrow" && containsLexicalThis(expression.body)) {
    return notApplicable;
  }
  const parameters: JsIrFunctionParameter[] = [];
  const functionBindings = functionFrameBindings(bindings);
  if (functionKind === "ordinary") {
    functionBindings.set(CLASS_THIS_NAME, { kind: "valueVariable", name: CLASS_THIS_NAME });
  }
  for (const parameter of runtimeParameters(expression.parameters)) {
    if (!ts.isIdentifier(parameter.name) || parameter.initializer !== undefined || parameter.dotDotDotToken !== undefined) {
      return notApplicable;
    }
    const valueKind = parameterValueKind(parameter);
    parameters.push({ name: parameter.name.text, valueKind });
    bindFunctionParameter(parameter.name.text, valueKind, false, functionBindings);
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
  const body = lowerInlineFunctionBody(context, expression.body, functionBindings);
  if (body.kind !== "lowered") {
    return body;
  }
  const runtimeName = expression.name?.text ?? inferredName;
  const displayName = runtimeName ?? "anonymous";
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
      inferredName: runtimeName
    }
  });
}
