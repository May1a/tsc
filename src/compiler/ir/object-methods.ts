import { unsupportedFormMessage } from "./builtins/manifest.js";
import { type Lowered, notApplicable, produced, unsupportedIn } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue, JsIrFunctionObjectCapture, JsIrFunctionParameter } from "./bindings.js";
import type { JsIrValueExpression } from "./expressions.js";
import { CLASS_THIS_NAME } from "./class-names.js";
import { parameterValueKind, runtimeParameters } from "./class-info.js";
import { bindFunctionParameter, functionFrameBindings } from "./function-parameters.js";
import { lowerBlockStatements } from "./statement-lists.js";
import { functionReturnKind } from "./binding-updates.js";
import { collectMethodEnclosingCaptureNames, lowerInlineFunctionCaptures } from "./captures.js";

/**
 * The function value an object-literal member contributes.
 *
 * Takes a method or a function declaration because both describe a function body with a name, a
 * parameter list and a body, which is everything read here — an object-literal method and an exported
 * namespace function differ only in the syntax they are written in.
 */
export function lowerObjectMethodFunctionValue(
  context: LoweringContext,
  method: ts.MethodDeclaration | ts.FunctionDeclaration,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  if (method.asteriskToken !== undefined) {
    if (ts.isMethodDeclaration(method) && ts.isObjectLiteralExpression(method.parent)) {
      return unsupportedIn(unsupportedFormMessage("object-literal-generator-method"));
    }
    if (ts.isFunctionDeclaration(method)) {
      return unsupportedIn(unsupportedFormMessage("generator-function"));
    }
    return unsupportedIn(unsupportedFormMessage("class-generator-method"));
  }

  if (method.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) === true) {
    return unsupportedIn(unsupportedFormMessage("async-function"));
  }
  if (method.body === undefined) {
    return notApplicable;
  }
  const parameters: JsIrFunctionParameter[] = [];
  const methodBindings = functionFrameBindings(bindings);
  methodBindings.set(CLASS_THIS_NAME, { kind: "valueVariable", name: CLASS_THIS_NAME });
  if (!bindObjectMethodParameters(method, parameters, methodBindings)) {
    return notApplicable;
  }
  const bodyResult = lowerBlockStatements(context, method.body, methodBindings);
  if (bodyResult.kind === "unsupported") {
    return bodyResult;
  }
  const captures = lowerObjectMethodCaptures(context, method, bindings);
  if (captures === undefined) {
    return notApplicable;
  }
  let displayName = "method";
  const declaredName = method.name;
  if (declaredName !== undefined && ts.isIdentifier(declaredName)) {
    displayName = declaredName.text;
  }
  const codeName = `__tscn_fnobj_${displayName}_${context.nextFunctionObjectId}`.replace(/[^A-Za-z0-9_]/g, "_");
  context.nextFunctionObjectId += 1;
  const body = bodyResult.operation;
  return produced({ kind: "functionObject", definition: { codeName, parameters, functionKind: "ordinary", returnKind: functionReturnKind(body), body,
    ...(captures.length === 0 ? {} : { captures }) } });
}

function bindObjectMethodParameters(
  method: ts.MethodDeclaration | ts.FunctionDeclaration,
  parameters: JsIrFunctionParameter[],
  methodBindings: Map<string, JsIrBindingValue>
): boolean {
  for (const parameter of runtimeParameters(method.parameters)) {
    if (!ts.isIdentifier(parameter.name) || parameter.initializer !== undefined || parameter.dotDotDotToken !== undefined) {
      return false;
    }
    const valueKind = parameterValueKind(parameter);
    parameters.push({ name: parameter.name.text, valueKind });
    bindFunctionParameter(parameter.name.text, valueKind, false, methodBindings);
  }
  return true;
}

/**
 * The environment reads an object-literal method carries, or `undefined` when one of its captures has
 * no cell representation and the method form must be declined.
 */
function lowerObjectMethodCaptures(
  context: LoweringContext,
  method: ts.MethodDeclaration | ts.FunctionDeclaration,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): readonly JsIrFunctionObjectCapture[] | undefined {
  if (method.body === undefined) {
    return [];
  }
  const captureNames = collectMethodEnclosingCaptureNames(context.typeChecker, method, method.body, [...method.parameters], bindings);
  return lowerInlineFunctionCaptures(captureNames, bindings);
}
