import { type Lowered, notApplicable, produced } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import type { JsIrValueExpression } from "./expressions.js";
import { CLASS_THIS_NAME } from "./class-names.js";
import { containsLexicalArguments } from "./class-info.js";
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
  const loweredParams = context.lowerFunctionParameters(context, method.parameters, bindings);
  if (loweredParams.kind === "unsupported") {
    return loweredParams;
  }
  const { parameters, bindings: methodBindings } = loweredParams.operation;
  methodBindings.set(CLASS_THIS_NAME, { kind: "valueVariable", name: CLASS_THIS_NAME });
  const { body: methodBody } = method;
  const parameterNames = collectParameterBindingNames(method.parameters, [CLASS_THIS_NAME]);
  const usesArguments = !parameterNames.has("arguments") && containsLexicalArguments(methodBody);
  if (usesArguments) {
    methodBindings.set("arguments", { kind: "valueVariable", name: "arguments" });
    parameterNames.add("arguments");
  }
  const captureNames = collectMethodEnclosingCaptureNames(context.typeChecker, method, methodBody, [...method.parameters], bindings)
    .filter((name) => !usesArguments || name !== "arguments");
  const displayName = method.name !== undefined && ts.isIdentifier(method.name) ? method.name.text : "method";
  const bodyResult = suspendKind === undefined
    ? lowerObjectMethodBody(context, methodBody, parameterNames, methodBindings)
    : lowerSuspendableBody(context, {
        kind: suspendKind,
        body: methodBody,
        bindings: methodBindings,
        outerParameterNames: parameterNames,
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
    ...(captures.length === 0 ? {} : { captures }), ...(usesArguments ? { usesArguments: true } : {}) } });
}

function lowerObjectMethodBody(
  context: LoweringContext,
  methodBody: ts.Block,
  parameterNames: ReadonlySet<string>,
  methodBindings: Map<string, JsIrBindingValue>
) {
  return withHoistedVars(context, methodBody.statements, methodBindings, parameterNames, (preface) => {
    const body = lowerBlockStatements(context, methodBody, methodBindings);
    return body.kind === "unsupported" ? body : { kind: "lowered" as const, operation: [...preface, ...body.operation] };
  });
}
