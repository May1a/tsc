import { unsupportedFormMessage } from "./builtins/manifest.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import { type Lowered, loweredOperation, unsupported } from "./lowered.js";
import { unsupportedStatementMessage } from "./diagnostics.js";
import { declaredFunctionReturnKind } from "./function-parameters.js";
import { lowerFunctionParameters } from "./function-parameter-lowering.js";
import type { JsIrOperation } from "./types.js";
import { isPlainObjectReturningConstructor } from "./class-info.js";
import { lowerBlockStatements } from "./statement-lists.js";
import { collectFunctionDeclarationEnclosingCaptureNames } from "./captures.js";

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
  const reason = unsupportedStatementMessage(statement, bindings);
  if (!statement.name || !statement.body || !ts.isBlock(statement.body)) {
    return unsupported(reason);
  }

  const loweredParameters = lowerFunctionParameters(context, statement.parameters, bindings, reason);
  if (loweredParameters.kind === "unsupported") {
    return loweredParameters;
  }
  const { parameters, bindings: fnBindings, prelude } = loweredParameters.operation;

  fnBindings.set(statement.name.text, {
    kind: "functionReference",
    parameters,
    returnKind: declaredFunctionReturnKind(statement.type)
  });

  const loweredBody = lowerBlockStatements(context, statement.body, fnBindings);
  if (loweredBody.kind === "unsupported") {
    return loweredBody;
  }
  const bodyStatements = loweredBody.operation;

  const body: readonly JsIrOperation[] = prelude.length === 0
    ? bodyStatements
    : [{ kind: "bindingGroup", operations: [...prelude, ...bodyStatements] }];

  return loweredOperation({
    kind: "function",
    name: statement.name.text,
    parameters,
    body,
    enclosingCaptureNames: collectFunctionDeclarationEnclosingCaptureNames(context.typeChecker, statement, bindings),
    constructibleByObjectReturn: isPlainObjectReturningConstructor(statement)
  });
}
