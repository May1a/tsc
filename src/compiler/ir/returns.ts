import { unsupportedFormMessage } from "./builtins/manifest.js";
import { type Lowered, notApplicable, produced, unsupportedIn } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue, JsIrFunctionParameter, JsIrValueKind } from "./bindings.js";
import { parameterValueKind, runtimeParameters } from "./class-info.js";
import { bindFunctionParameter } from "./function-parameters.js";
import { collectFunctionExpressionCaptureNames, lowerCapturedBindingValue } from "./captures.js";
import { lowerInlineFunctionBody } from "./array-callbacks.js";
import type { JsIrValueExpression } from "./expressions.js";
import { functionReturnKind } from "./binding-updates.js";

export function lowerReturnStatement(
  context: LoweringContext,
  statement: ts.ReturnStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!statement.expression) {
    // Bare `return;` yields undefined, matching the class method normalization
    // in lowerClassMethodBody.
    return produced({
      kind: "returnValue",
      expression: { kind: "undefined" }
    });
  }

  const closure = lowerReturnedFunctionExpression(context, statement.expression, bindings);
  if (closure.kind !== "notApplicable") {
    return closure;
  }

  const stringExpression = context.lowerStringRuntimeExpression(context, statement.expression, bindings);
  if (stringExpression.kind === "unsupported") {
    return stringExpression;
  }
  if (stringExpression.kind === "lowered") {
    return produced({
      kind: "returnString",
      expression: stringExpression.operation
    });
  }

  const expression = context.lowerNumberExpression(context, statement.expression, bindings);
  if (expression.kind === "unsupported") {
    return expression;
  }
  if (expression.kind === "lowered") {
    return produced({
      kind: "returnNumber",
      expression: expression.operation
    });
  }

  const valueExpression = context.lowerValueExpression(context, statement.expression, bindings);
  if (valueExpression.kind !== "lowered") {
    return valueExpression;
  }

  return produced({
    kind: "returnValue",
    expression: valueExpression.operation
  });
}

// eslint-disable-next-line complexity, max-statements -- Closure lowering validates syntax, captures, parameters, and body atomically.
function lowerReturnedFunctionExpression(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!ts.isFunctionExpression(expression) && !ts.isArrowFunction(expression)) {
    return notApplicable;
  }

  if (expression.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) === true) {
    return unsupportedIn(unsupportedFormMessage("async-function"));
  }
  if (ts.isFunctionExpression(expression) && expression.asteriskToken !== undefined) {
    return unsupportedIn(unsupportedFormMessage("generator-function"));
  }

  const parameters: JsIrFunctionParameter[] = [];
  const nestedBindings = new Map(bindings);
  const localNames = new Set<string>();
  for (const param of runtimeParameters(expression.parameters)) {
    if (!ts.isIdentifier(param.name)) {
      return notApplicable;
    }
    const valueKind = parameterValueKind(param);
    parameters.push({ name: param.name.text, valueKind });
    localNames.add(param.name.text);
    bindFunctionParameter(param.name.text, valueKind, false, nestedBindings);
  }

  const captureNames = collectFunctionExpressionCaptureNames(expression, localNames, bindings);
  for (const name of captureNames) {
    const binding = bindings.get(name);
    if (binding?.kind === "number") {
      nestedBindings.set(name, { kind: "number", value: { kind: "parameter", name } });
    } else if (binding?.kind === "string" || binding?.kind === "stringExpression" || binding?.kind === "stringVariable") {
      nestedBindings.set(name, { kind: "stringVariable", name });
    } else {
      nestedBindings.set(name, { kind: "valueVariable", name });
    }
  }

  const body = lowerInlineFunctionBody(context, expression.body, nestedBindings);
  if (body.kind !== "lowered") {
    return body;
  }
  const captures: { name: string; valueKind: JsIrValueKind; value: JsIrValueExpression }[] = [];
  for (const name of captureNames) {
    const binding = bindings.get(name);
    const capture = lowerCapturedBindingValue(binding);
    if (capture === undefined) {
      return notApplicable;
    }
    captures.push({ name, ...capture });
  }
  let displayName = "arrow";
  if (ts.isFunctionExpression(expression)) {
    displayName = expression.name?.text ?? "anonymous";
  }
  const codeName = `__tscn_fnobj_${displayName}_${context.nextFunctionObjectId}`.replace(/[^A-Za-z0-9_]/g, "_");
  context.nextFunctionObjectId += 1;
  return produced({
    kind: "returnValue",
    expression: {
      kind: "functionObject",
      definition: {
        codeName,
        parameters,
        functionKind: functionExpressionKind(expression),
        returnKind: functionReturnKind(body.operation),
        body: body.operation,
        captures
      }
    }
  });
}

export function functionExpressionKind(expression: ts.ArrowFunction | ts.FunctionExpression): "arrow" | "ordinary" {
  if (ts.isArrowFunction(expression)) {
    return "arrow";
  }
  return "ordinary";
}
