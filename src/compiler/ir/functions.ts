import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import { type Lowered, loweredOperation, unsupported } from "./lowered.js";
import { declaredFunctionReturnKind } from "./function-parameters.js";
import { lowerFunctionParameters } from "./function-parameter-lowering.js";
import { containsLexicalArguments, isPlainObjectReturningConstructor } from "./class-info.js";
import { lowerBlockStatements } from "./statement-lists.js";
import { collectParameterBindingNames, withHoistedVars } from "./var-hoisting.js";
import { collectFunctionDeclarationEnclosingCaptureNames } from "./captures.js";
import { CLASS_THIS_NAME } from "./class-names.js";
import { lowerSuspendableBody, suspendableKindFor } from "./state-machine.js";

export function lowerFunctionDeclaration(
  context: LoweringContext,
  statement: ts.FunctionDeclaration,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!statement.name || !statement.body || !ts.isBlock(statement.body)) {
    return unsupported("A function declaration must have a name and a body");
  }

  const suspendKind = suspendableKindFor(statement);
  const loweredParameters = lowerFunctionParameters(context, statement.parameters, bindings);
  if (loweredParameters.kind === "unsupported") {
    return loweredParameters;
  }
  const { parameters, bindings: fnBindings } = loweredParameters.operation;

  // Every ordinary function receives its own dynamic `this` binding from the uniform ABI.
  fnBindings.set(CLASS_THIS_NAME, { kind: "valueVariable", name: CLASS_THIS_NAME });
  fnBindings.set(statement.name.text, {
    kind: "functionReference",
    parameters,
    returnKind: suspendKind === undefined ? declaredFunctionReturnKind(statement.type) : "value"
  });

  const { body: statementBody } = statement;
  const parameterNames = collectParameterBindingNames(statement.parameters, [CLASS_THIS_NAME]);
  const usesArguments = !parameterNames.has("arguments") && containsLexicalArguments(statementBody);
  if (usesArguments) {
    fnBindings.set("arguments", { kind: "valueVariable", name: "arguments" });
    parameterNames.add("arguments");
  }
  const enclosingCaptureNames = collectFunctionDeclarationEnclosingCaptureNames(context.typeChecker, statement, bindings)
    .filter((name) => !usesArguments || name !== "arguments");
  const loweredBody = suspendKind === undefined
    ? withHoistedVars(context, statementBody.statements, fnBindings, parameterNames, (preface) => {
        const body = lowerBlockStatements(context, statementBody, fnBindings);
        return body.kind === "unsupported" ? body : { kind: "lowered" as const, operation: [...preface, ...body.operation] };
      })
    : lowerSuspendableBody(context, {
        kind: suspendKind,
        body: statementBody,
        bindings: fnBindings,
        outerParameterNames: parameterNames,
        outerCaptureNames: enclosingCaptureNames,
        nameHint: statement.name.text
      });
  if (loweredBody.kind === "unsupported") {
    return loweredBody;
  }
  const bodyStatements = loweredBody.operation;

  return loweredOperation({
    kind: "function",
    name: statement.name.text,
    parameters,
    body: bodyStatements,
    enclosingCaptureNames,
    constructibleByObjectReturn: suspendKind === undefined && isPlainObjectReturningConstructor(statement),
    ...(usesArguments ? { usesArguments: true } : {})
  });
}
