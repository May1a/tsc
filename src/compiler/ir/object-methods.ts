import { unsupportedFormMessage } from "./builtins/manifest.js";
import { type Lowered, notApplicable, produced, unsupportedIn } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue, JsIrFunctionParameter } from "./bindings.js";
import type { JsIrValueExpression } from "./expressions.js";
import { CLASS_THIS_NAME } from "./class-names.js";
import { parameterValueKind, runtimeParameters } from "./class-info.js";
import { bindFunctionParameter, functionFrameBindings } from "./function-parameters.js";
import { lowerBlockStatements } from "./statement-lists.js";
import { functionReturnKind } from "./binding-updates.js";

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
  for (const parameter of runtimeParameters(method.parameters)) {
    if (!ts.isIdentifier(parameter.name) || parameter.initializer !== undefined || parameter.dotDotDotToken !== undefined) {
      return notApplicable;
    }
    const valueKind = parameterValueKind(parameter);
    parameters.push({ name: parameter.name.text, valueKind });
    bindFunctionParameter(parameter.name.text, valueKind, false, methodBindings);
  }
  const bodyResult = lowerBlockStatements(context, method.body, methodBindings);
  if (bodyResult.kind === "unsupported") {
    return bodyResult;
  }
  const body = bodyResult.operation;
  let displayName = "method";
  const declaredName = method.name;
  if (declaredName !== undefined && ts.isIdentifier(declaredName)) {
    displayName = declaredName.text;
  }
  const codeName = `__tscn_fnobj_${displayName}_${context.nextFunctionObjectId}`.replace(/[^A-Za-z0-9_]/g, "_");
  context.nextFunctionObjectId += 1;
  return produced({ kind: "functionObject", definition: { codeName, parameters, functionKind: "ordinary", returnKind: functionReturnKind(body), body } });
}
