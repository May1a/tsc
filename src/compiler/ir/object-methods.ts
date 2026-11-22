import { type Lowered, notApplicable, produced } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue, JsIrFunctionParameter } from "./bindings.js";
import type { JsIrValueExpression } from "./expressions.js";
import { CLASS_THIS_NAME } from "./class-names.js";
import { parameterValueKind, runtimeParameters } from "./class-info.js";
import { bindFunctionParameter, functionFrameBindings } from "./function-parameters.js";
import { lowerBlockStatements } from "./statement-lists.js";
import { collectParameterBindingNames, withHoistedVars } from "./var-hoisting.js";
import { functionReturnKind } from "./binding-updates.js";
import { collectMethodEnclosingCaptureNames, lowerInlineFunctionCaptures } from "./captures.js";
import { lowerSuspendableBody, suspendableKindFor } from "./state-machine.js";

/**
 * The function value an object-literal member contributes.
 *
 * Takes a method or a function declaration because both describe a function body with a name, a
 * parameter list and a body, which is everything read here — an object-literal method and an exported
 * namespace function differ only in the syntax they are written in.
 */
type ObjectMethodLike =
  | ts.MethodDeclaration
  | ts.FunctionDeclaration
  | ts.GetAccessorDeclaration
  | ts.SetAccessorDeclaration;

export function lowerObjectMethodFunctionValue(
  context: LoweringContext,
  method: ObjectMethodLike,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  if (method.body === undefined) {
    return notApplicable;
  }
  const suspendKind = suspendableKindFor(method);
  const parameters: JsIrFunctionParameter[] = [];
  const methodBindings = functionFrameBindings(bindings);
  methodBindings.set(CLASS_THIS_NAME, { kind: "valueVariable", name: CLASS_THIS_NAME });
  if (!bindObjectMethodParameters(method, parameters, methodBindings)) {
    return notApplicable;
  }
  const { body: methodBody } = method;
  const captureNames = collectMethodEnclosingCaptureNames(context.typeChecker, method, methodBody, [...method.parameters], bindings);
  const displayName = method.name !== undefined && ts.isIdentifier(method.name) ? method.name.text : "method";
  const bodyResult = suspendKind === undefined
    ? lowerObjectMethodBody(context, methodBody, method.parameters, methodBindings)
    : lowerSuspendableBody(context, {
        kind: suspendKind,
        body: methodBody,
        bindings: methodBindings,
        outerParameterNames: collectParameterBindingNames(method.parameters, [CLASS_THIS_NAME]),
        outerCaptureNames: captureNames,
        nameHint: displayName
      });
  if (bodyResult.kind === "unsupported") {
    return bodyResult;
  }
  const captures = lowerInlineFunctionCaptures(captureNames, bindings);
  if (captures === undefined) {
    return notApplicable;
  }
  const codeName = `__tscn_fnobj_${displayName}_${context.nextFunctionObjectId}`.replace(/[^A-Za-z0-9_]/g, "_");
  context.nextFunctionObjectId += 1;
  const body = bodyResult.operation;
  return produced({ kind: "functionObject", definition: { codeName, parameters, functionKind: "ordinary", returnKind: functionReturnKind(body), body,
    ...(captures.length === 0 ? {} : { captures }) } });
}

function lowerObjectMethodBody(
  context: LoweringContext,
  methodBody: ts.Block,
  parameters: readonly ts.ParameterDeclaration[],
  methodBindings: Map<string, JsIrBindingValue>
) {
  const parameterNames = collectParameterBindingNames(parameters, [CLASS_THIS_NAME]);
  return withHoistedVars(context, methodBody.statements, methodBindings, parameterNames, (preface) => {
    const body = lowerBlockStatements(context, methodBody, methodBindings);
    return body.kind === "unsupported" ? body : { kind: "lowered" as const, operation: [...preface, ...body.operation] };
  });
}

function bindObjectMethodParameters(
  method: ObjectMethodLike,
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
