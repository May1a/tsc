import { unsupportedFormMessage } from "./builtins/manifest.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue, JsIrFunctionParameter, JsIrValueKind } from "./bindings.js";
import { type Lowered, loweredOperation, loweredPayload, unsupported } from "./lowered.js";
import { unsupportedStatementMessage } from "./diagnostics.js";
import { bindFunctionParameter, declaredFunctionReturnKind, functionFrameBindings, lowerNumericDefaultValue } from "./function-parameters.js";
import type { JsIrOperation } from "./types.js";
import { isPlainObjectReturningConstructor, parameterValueKind, runtimeParameters } from "./class-info.js";
import type { JsIrNumberExpression } from "./expressions.js";
import { type DestructuringSource, lowerArrayProtocolDestructuringFromSource } from "./destructuring.js";
import { updateBindings } from "./binding-updates.js";
import { lowerBlockStatements } from "./statement-lists.js";
import { collectFunctionDeclarationEnclosingCaptureNames } from "./captures.js";

// eslint-disable-next-line complexity, max-statements -- Function declaration lowering covers default initializers, rest parameters, and per-kind binding setup in one place.
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

  const parameters: JsIrFunctionParameter[] = [];
  const fnBindings = functionFrameBindings(bindings);
  const prelude: JsIrOperation[] = [];
  const declaredParameters = runtimeParameters(statement.parameters);
  for (let i = 0; i < declaredParameters.length; i++) {
    const param = declaredParameters[i];
    const isRest = param.dotDotDotToken !== undefined;
    if (isRest && i !== declaredParameters.length - 1) {
      return unsupported(reason);
    }
    const isDestructuring = ts.isObjectBindingPattern(param.name) || ts.isArrayBindingPattern(param.name);
    if (isRest && isDestructuring) {
      return unsupported(reason);
    }
    let valueKind: JsIrValueKind;
    if (isRest || isDestructuring) {
      valueKind = "value";
    } else if (ts.isIdentifier(param.name)) {
      valueKind = parameterValueKind(param);
    } else {
      return unsupported(reason);
    }
    let defaultValue: JsIrNumberExpression | undefined;
    if (!isRest && !isDestructuring) {
      const numericDefaultValueResult = lowerNumericDefaultValue(context, param, fnBindings);
      if (numericDefaultValueResult.kind === "unsupported") {
        return numericDefaultValueResult;
      }
      defaultValue = loweredPayload(numericDefaultValueResult);
    }
    let parameter: JsIrFunctionParameter;
    let paramName: string;
    if (isDestructuring) {
      if (isRest) {
        paramName = "";
      } else {
        paramName = `__param${i}`;
      }
      parameter = { name: paramName, valueKind };
    } else {
      paramName = param.name.text;
      // `x?: T` with no initializer is omittable, which is not the same as having no default: the
      // call site passes `undefined` rather than refusing the shorter call. A rest parameter is never
      // omittable — it is always present, possibly empty — and a default already covers omission.
      const isOptional = param.questionToken !== undefined && defaultValue === undefined && !isRest;
      if (defaultValue === undefined) {
        if (isRest) {
          parameter = { name: paramName, valueKind, isRest: true };
        } else if (isOptional) {
          parameter = { name: paramName, valueKind, isOptional: true };
        } else {
          parameter = { name: paramName, valueKind };
        }
      } else {
        parameter = { name: paramName, valueKind, defaultValue };
      }
    }
    parameters.push(parameter);
    bindFunctionParameter(paramName, valueKind, isRest, fnBindings);
    if (isDestructuring) {
      const destructuringSource: DestructuringSource = {
        name: paramName,
        binding: { kind: "valueVariable", name: paramName }
      };
      const pattern: ts.ArrayBindingPattern | ts.ObjectBindingPattern = param.name;
      const destructuringOperations: JsIrOperation[] = [];
      const destructuringBindings = new Map(fnBindings);
      let loweredDestructuring: boolean;
      if (ts.isArrayBindingPattern(pattern)) {
        const arrayProtocolDestructuringFromSourceResult = lowerArrayProtocolDestructuringFromSource(
          context, pattern,
          { kind: "value", value: { kind: "variable", name: paramName } },
          `${paramName} is not iterable`,
          destructuringBindings,
          destructuringOperations
        );
        if (arrayProtocolDestructuringFromSourceResult.kind === "unsupported") {
          return arrayProtocolDestructuringFromSourceResult;
        }
        loweredDestructuring = arrayProtocolDestructuringFromSourceResult.operation;
      } else {
        const objectDestructuringElementsResult = context.lowerObjectDestructuringElements(context, pattern, destructuringSource, destructuringBindings, destructuringOperations);
        if (objectDestructuringElementsResult.kind === "unsupported") {
          return objectDestructuringElementsResult;
        }
        loweredDestructuring = objectDestructuringElementsResult.operation;
      }
      if (!loweredDestructuring) {
        return unsupported(reason);
      }
      for (const op of destructuringOperations) {
        prelude.push(op);
        updateBindings(op, destructuringBindings);
      }
      for (const [name, value] of destructuringBindings) {
        fnBindings.set(name, value);
      }
    }
  }

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

  let body: readonly JsIrOperation[];
  if (prelude.length === 0) {
    body = bodyStatements;
  } else {
    body = [{ kind: "bindingGroup", operations: [...prelude, ...bodyStatements] }];
  }

  return loweredOperation({
    kind: "function",
    name: statement.name.text,
    parameters,
    body,
    enclosingCaptureNames: collectFunctionDeclarationEnclosingCaptureNames(statement, bindings),
    constructibleByObjectReturn: isPlainObjectReturningConstructor(statement)
  });
}
