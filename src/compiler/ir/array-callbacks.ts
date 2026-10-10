import { unsupportedFormMessage } from "./builtins/manifest.js";
import { type Lowered, loweredPayload, notApplicable, produced, unsupportedIn } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue, JsIrFunctionParameter, JsIrValueKind } from "./bindings.js";
import type { JsIrOperation } from "./types.js";
import type { JsIrValueExpression } from "./expressions.js";
import { CLASS_THIS_NAME } from "./class-names.js";
import { containsLexicalThis } from "./class-info.js";
import { functionFrameBindings } from "./function-parameters.js";
import { functionReturnKind } from "./binding-updates.js";
import { lowerBlockStatements } from "./statement-lists.js";

const arrayReduceMethodByDirection: Readonly<Record<"left" | "right", "reduce" | "reduceRight">> = {
  left: "reduce",
  right: "reduceRight"
};

const arrayCallbackArgumentCount = 3;

const reduceCallbackArgumentCount = 4;

// eslint-disable-next-line complexity, max-statements -- Runtime array callback routing keeps method-specific validation in one place.
export function lowerRuntimeArrayCallbackBinding(
  context: LoweringContext,
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!ts.isCallExpression(initializer) || !ts.isPropertyAccessExpression(initializer.expression) || !ts.isIdentifier(initializer.expression.expression)) {
    return notApplicable;
  }
  const arrayName = initializer.expression.expression.text;
  if (bindings.get(arrayName)?.kind !== "runtimeArray") {
    return notApplicable;
  }
  const method = initializer.expression.name.text;
  if (method === "reduce" || method === "reduceRight") {
    const direction: "left" | "right" = method === "reduceRight" ? "right" : "left";
    return lowerRuntimeArrayReduceCallbackBinding(context, name, arrayName, initializer.arguments, bindings, direction);
  }
  if (method !== "map" && method !== "flatMap" && method !== "filter" && method !== "find" && method !== "findIndex") {
    return notApplicable;
  }
  if (initializer.arguments.length !== 1 && initializer.arguments.length !== 2) {
    return notApplicable;
  }
  const [callback] = initializer.arguments;
  const inlineCallback = lowerInlineArrayCallbackFunctionObject(context, name, arrayName, callback, initializer.arguments[1], bindings, arrayCallbackArgumentCount, method);
  if (inlineCallback.kind !== "notApplicable") {
    return inlineCallback;
  }
  if (initializer.arguments.length !== 1) {
    return notApplicable;
  }
  if (!ts.isIdentifier(callback)) {
    return notApplicable;
  }
  const callbackBindingResult = lowerArrayCallbackBinding(callback.text, bindings, arrayCallbackArgumentCount);
  if (callbackBindingResult.kind === "unsupported") {
    return callbackBindingResult;
  }
  const callbackBinding = loweredPayload(callbackBindingResult);
  if (callbackBinding === undefined || callbackBinding.returnKind === "void") {
    return notApplicable;
  }
  if (method === "map") {
    return produced({ kind: "runtimeArrayMapCallback", name, arrayName, callbackName: callback.text, callbackParameters: callbackBinding.parameters, callbackReturnKind: callbackBinding.returnKind });
  }
  if (method === "flatMap") {
    return produced({ kind: "runtimeArrayFlatMapCallback", name, arrayName, callbackName: callback.text, callbackParameters: callbackBinding.parameters, callbackReturnKind: callbackBinding.returnKind });
  }
  if (method === "filter") {
    return produced({ kind: "runtimeArrayFilterCallback", name, arrayName, callbackName: callback.text, callbackParameters: callbackBinding.parameters, callbackReturnKind: callbackBinding.returnKind });
  }
  if (method === "find") {
    return produced({ kind: "runtimeArrayFindCallback", name, arrayName, callbackName: callback.text, callbackParameters: callbackBinding.parameters, callbackReturnKind: callbackBinding.returnKind });
  }
  return produced({ kind: "runtimeArrayFindIndexCallback", name, arrayName, callbackName: callback.text, callbackParameters: callbackBinding.parameters, callbackReturnKind: callbackBinding.returnKind });
}

function lowerRuntimeArrayReduceCallbackBinding(
  context: LoweringContext,
  name: string,
  arrayName: string,
  args: ts.NodeArray<ts.Expression>,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  direction: "left" | "right"
): Lowered {
  if (args.length !== 1 && args.length !== 2) {
    return notApplicable;
  }
  const [callback] = args;
  const method = arrayReduceMethodByDirection[direction];
  const inlineCallback = lowerInlineArrayCallbackFunctionObject(context, name, arrayName, callback, undefined, bindings, reduceCallbackArgumentCount, method);
  if (inlineCallback.kind === "unsupported") {
    return inlineCallback;
  }
  if (inlineCallback.kind === "lowered") {
    if (args.length === 1) {
      return produced(inlineCallback.operation);
    }
    const initialValue = context.lowerValueExpression(context, args[1], bindings);
    if (initialValue.kind !== "lowered") {
      return initialValue;
    }
    return produced({ ...inlineCallback.operation, initialValue: initialValue.operation, direction });
  }
  if (!ts.isIdentifier(callback)) {
    return notApplicable;
  }
  const callbackBinding = lowerArrayCallbackBinding(callback.text, bindings, reduceCallbackArgumentCount);
  if (callbackBinding.kind !== "lowered") {
    return callbackBinding;
  }
  if (callbackBinding.operation.returnKind === "void") {
    return notApplicable;
  }
  let initialValue: JsIrValueExpression | undefined;
  if (args.length === 2) {
    const valueExpressionResult = context.lowerValueExpression(context, args[1], bindings);
    if (valueExpressionResult.kind === "unsupported") {
      return valueExpressionResult;
    }
    initialValue = loweredPayload(valueExpressionResult);
    if (initialValue === undefined) {
      return notApplicable;
    }
  }
  return produced({ kind: "runtimeArrayReduceCallback", name, arrayName, callbackName: callback.text, callbackParameters: callbackBinding.operation.parameters, callbackReturnKind: callbackBinding.operation.returnKind, initialValue, direction });
}

export function lowerRuntimeArrayForEachCallbackStatement(
  context: LoweringContext,
  arrayName: string,
  args: ts.NodeArray<ts.Expression>,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (args.length !== 1 && args.length !== 2) {
    return notApplicable;
  }
  const [callback] = args;
  const inlineCallback = lowerInlineArrayCallbackFunctionObject(context, "__tscn_each", arrayName, callback, args[1], bindings, arrayCallbackArgumentCount, "forEach");
  if (inlineCallback.kind !== "notApplicable") {
    return inlineCallback;
  }
  if (args.length !== 1) {
    return notApplicable;
  }
  if (!ts.isIdentifier(callback)) {
    return notApplicable;
  }
  const callbackBinding = lowerArrayCallbackBinding(callback.text, bindings, arrayCallbackArgumentCount);
  if (callbackBinding.kind !== "lowered") {
    return callbackBinding;
  }
  return produced({ kind: "runtimeArrayForEachCallback", arrayName, callbackName: callback.text, callbackParameters: callbackBinding.operation.parameters, callbackReturnKind: callbackBinding.operation.returnKind });
}

export function lowerArrayCallbackBinding(
  callbackName: string,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  maxParameters: number
): Lowered<Extract<JsIrBindingValue, { readonly kind: "function" }>> {
  const callbackBinding = bindings.get(callbackName);
  if (callbackBinding?.kind !== "function" || callbackBinding.parameters.length > maxParameters || callbackBinding.parameters.some((parameter) => parameter.valueKind === "string")) {
    return notApplicable;
  }
  if (callbackBinding.parameters.some((parameter, index) => index >= 2 && parameter.valueKind !== "value")) {
    return notApplicable;
  }
  return produced(callbackBinding);
}

// eslint-disable-next-line complexity, max-statements -- Callback lowering validates syntax, parameters, receiver semantics, and the body as one atomic operation.
function lowerInlineArrayCallbackFunctionObject(
  context: LoweringContext,
  name: string,
  arrayName: string,
  callback: ts.Expression,
  thisArgExpression: ts.Expression | undefined,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  maxParameters: number,
  method: "map" | "flatMap" | "filter" | "find" | "findIndex" | "reduce" | "reduceRight" | "forEach"
): Lowered<Extract<JsIrOperation, { readonly kind: "runtimeArrayMapFunctionObject" }>> {
  if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) {
    return lowerArrayCallbackValueWrapper(context, name, arrayName, callback, thisArgExpression, bindings, maxParameters, method);
  }
  if (callback.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) === true) {
    return unsupportedIn(unsupportedFormMessage("async-function"));
  }
  if (ts.isFunctionExpression(callback) && callback.asteriskToken !== undefined) {
    return unsupportedIn(unsupportedFormMessage("generator-function"));
  }
  const callbackKind: "arrow" | "ordinary" = ts.isArrowFunction(callback) ? "arrow" : "ordinary";
  const declaredParameters = [...callback.parameters];
  const firstParameter = declaredParameters.at(0);
  if (callbackKind === "ordinary" && firstParameter !== undefined && ts.isIdentifier(firstParameter.name) && firstParameter.name.text === CLASS_THIS_NAME) {
    declaredParameters.shift();
  }
  const captures: { name: string; valueKind: JsIrValueKind; value: JsIrValueExpression }[] = [];
  if (callbackKind === "arrow" && containsLexicalThis(callback.body)) {
    const thisBinding = bindings.get(CLASS_THIS_NAME);
    if (thisBinding?.kind !== "valueVariable") {
      return notApplicable;
    }
    captures.push({ name: CLASS_THIS_NAME, valueKind: "value", value: { kind: "variable", name: thisBinding.name } });
  }
  if (declaredParameters.length > maxParameters) {
    return notApplicable;
  }
  const parameters: JsIrFunctionParameter[] = [];
  const callbackBindings = functionFrameBindings(bindings);
  if (callbackKind === "ordinary") {
    callbackBindings.set(CLASS_THIS_NAME, { kind: "valueVariable", name: CLASS_THIS_NAME });
  }
  for (const parameter of declaredParameters) {
    if (!ts.isIdentifier(parameter.name) || parameter.initializer !== undefined || parameter.dotDotDotToken !== undefined) {
      return notApplicable;
    }
    parameters.push({ name: parameter.name.text, valueKind: "value" });
    callbackBindings.set(parameter.name.text, { kind: "valueVariable", name: parameter.name.text });
  }
  const body = lowerInlineFunctionBody(context, callback.body, callbackBindings);
  if (body.kind !== "lowered") {
    return body;
  }
  const returnKind = functionReturnKind(body.operation);
  if (returnKind === "void" && method !== "forEach") {
    return notApplicable;
  }
  let thisArg: JsIrValueExpression | undefined;
  if (thisArgExpression !== undefined) {
    const valueExpressionResult2 = context.lowerValueExpression(context, thisArgExpression, bindings);
    if (valueExpressionResult2.kind === "unsupported") {
      return valueExpressionResult2;
    }
    thisArg = loweredPayload(valueExpressionResult2);
    if (thisArg === undefined) {
      return notApplicable;
    }
  }
  const callbackName = `__tscn_fnobj_${name}_${context.nextFunctionObjectId}`.replace(/[^A-Za-z0-9_]/g, "_");
  context.nextFunctionObjectId += 1;
  const direction: "left" | "right" = method === "reduceRight" ? "right" : "left";
  return produced({ kind: "runtimeArrayMapFunctionObject", method, name, arrayName, callbackName, callbackParameters: parameters, callbackReturnKind: returnKind, callbackBody: body.operation, callbackKind, direction, thisArg, captures });
}

function lowerArrayCallbackValueWrapper(
  context: LoweringContext,
  name: string,
  arrayName: string,
  callback: ts.Expression,
  thisArgExpression: ts.Expression | undefined,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  maxParameters: number,
  method: "map" | "flatMap" | "filter" | "find" | "findIndex" | "reduce" | "reduceRight" | "forEach"
): Lowered<Extract<JsIrOperation, { readonly kind: "runtimeArrayMapFunctionObject" }>> {
  const callbackValue = context.lowerValueExpression(context, callback, bindings);
  if (callbackValue.kind !== "lowered") {
    return callbackValue;
  }
  let thisValue: JsIrValueExpression = { kind: "undefined" };
  if (thisArgExpression !== undefined) {
    const loweredThis = context.lowerValueExpression(context, thisArgExpression, bindings);
    if (loweredThis.kind !== "lowered") {
      return loweredThis;
    }
    thisValue = loweredThis.operation;
  }
  const id = context.nextFunctionObjectId;
  context.nextFunctionObjectId += 1;
  const callbackName = `__tscn_fnobj_${name}_${id}`.replace(/[^A-Za-z0-9_]/g, "_");
  const callbackCaptureName = `__callback_${id}`;
  const thisCaptureName = `__callback_this_${id}`;
  const parameters = Array.from({ length: maxParameters }, (_, index) => ({ name: `__callback_arg_${id}_${index}`, valueKind: "value" as const }));
  const callArguments = parameters.map((parameter) => ({ valueKind: "value" as const, value: { kind: "variable" as const, name: parameter.name } }));
  const body: JsIrOperation[] = [{
    kind: "returnValue",
    expression: {
      kind: "callValue",
      callee: { kind: "variable", name: callbackCaptureName },
      arguments: callArguments,
      thisValue: { kind: "variable", name: thisCaptureName }
    }
  }];
  return produced({
    kind: "runtimeArrayMapFunctionObject",
    method,
    name,
    arrayName,
    callbackName,
    callbackParameters: parameters,
    callbackReturnKind: "value",
    callbackBody: body,
    callbackKind: "arrow",
    direction: arrayCallbackDirection(method),
    captures: [
      { name: callbackCaptureName, valueKind: "value", value: callbackValue.operation },
      { name: thisCaptureName, valueKind: "value", value: thisValue }
    ]
  });
}

function arrayCallbackDirection(method: "map" | "flatMap" | "filter" | "find" | "findIndex" | "reduce" | "reduceRight" | "forEach"): "left" | "right" {
  if (method === "reduceRight") {
    return "right";
  }
  return "left";
}

export function lowerInlineFunctionBody(
  context: LoweringContext,
  body: ts.ConciseBody,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<readonly JsIrOperation[]> {
  if (ts.isBlock(body)) {
    return lowerBlockStatements(context, body, bindings);
  }
  const expression = context.lowerValueExpression(context, body, bindings);
  if (expression.kind !== "lowered") {
    return expression;
  }
  return produced([{ kind: "returnValue", expression: expression.operation }]);
}
