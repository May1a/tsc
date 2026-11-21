import { unsupportedFormMessage } from "./builtins/manifest.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import { type Lowered, loweredOperation, unsupported } from "./lowered.js";
import { declaredFunctionReturnKind } from "./function-parameters.js";
import { lowerFunctionParameters } from "./function-parameter-lowering.js";
import { isPlainObjectReturningConstructor } from "./class-info.js";
import { lowerBlockStatements } from "./statement-lists.js";
import { collectParameterBindingNames, withHoistedVars } from "./var-hoisting.js";
import { collectFunctionDeclarationEnclosingCaptureNames } from "./captures.js";
import { CLASS_THIS_NAME } from "./class-names.js";

export function lowerFunctionDeclaration(
  context: LoweringContext,
  statement: ts.FunctionDeclaration,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) === true) {
    return unsupported(unsupportedFormMessage("async-function"));
  }
  if (statement.asteriskToken !== undefined) {
    return unsupported(unsupportedFormMessage("generator-function"));
  }
  if (!statement.name || !statement.body || !ts.isBlock(statement.body)) {
    return unsupported("A function declaration must have a name and a body");
  }

  const loweredParameters = lowerFunctionParameters(context, statement.parameters, bindings);
  if (loweredParameters.kind === "unsupported") {
    return loweredParameters;
  }
  const { parameters, bindings: fnBindings } = loweredParameters.operation;

  // A nested `function` declaration has its own dynamic `this`: it must not read the enclosing
  // frame's through the bindings, or uses of `this` inside it would capture an environment cell
  // the callee never fills. Without a binding the uses are refused instead of miscompiled.
  fnBindings.delete(CLASS_THIS_NAME);
  fnBindings.set(statement.name.text, {
    kind: "functionReference",
    parameters,
    returnKind: declaredFunctionReturnKind(statement.type)
  });

  const { body: statementBody } = statement;
  const parameterNames = collectParameterBindingNames(statement.parameters);
  const loweredBody = withHoistedVars(context, statementBody.statements, fnBindings, parameterNames, (preface) => {
    const body = lowerBlockStatements(context, statementBody, fnBindings);
    return body.kind === "unsupported" ? body : { kind: "lowered" as const, operation: [...preface, ...body.operation] };
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
    enclosingCaptureNames: collectFunctionDeclarationEnclosingCaptureNames(context.typeChecker, statement, bindings),
    constructibleByObjectReturn: isPlainObjectReturningConstructor(statement)
  });
}
