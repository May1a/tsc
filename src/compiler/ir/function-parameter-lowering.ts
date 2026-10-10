import ts from "typescript";
import type { LoweringContext } from "./context.js";
import type { JsIrBindingValue, JsIrFunctionParameter } from "./bindings.js";
import type { JsIrOperation } from "./types.js";
import { type Produced, loweredPayload, notApplicable, produced, unsupportedIn } from "./lowered.js";
import { parameterValueKind, runtimeParameters } from "./class-info.js";
import { lowerArrayProtocolDestructuringFromSource } from "./destructuring.js";
import { updateBindings } from "./binding-updates.js";
import { bindFunctionParameter, functionFrameBindings } from "./function-parameters.js";

interface LoweredParameters {
  readonly parameters: readonly JsIrFunctionParameter[];
  readonly bindings: Map<string, JsIrBindingValue>;
  readonly prelude: readonly JsIrOperation[];
}

export function lowerFunctionParameters(
  context: LoweringContext,
  declarations: readonly ts.ParameterDeclaration[],
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  reason: string
): Produced<LoweredParameters> {
  const parameters: JsIrFunctionParameter[] = [];
  const fnBindings = functionFrameBindings(bindings);
  const prelude: (readonly JsIrOperation[])[] = [];
  const declaredParameters = runtimeParameters(declarations);
  for (const [index, declaration] of declaredParameters.entries()) {
    if (declaration.dotDotDotToken !== undefined && index !== declaredParameters.length - 1) {
      return unsupportedIn(reason);
    }
    const result = lowerFunctionParameter(context, declaration, index, fnBindings, reason);
    if (result.kind === "unsupported") {
      return result;
    }
    const parameter = result.operation;
    parameters.push(parameter);
    bindFunctionParameter(parameter.name, parameter.isOptional === true ? "value" : parameter.valueKind, parameter.isRest === true, fnBindings);
    const destructured = lowerParameterDestructuring(context, declaration.name, parameter.name, fnBindings, reason);
    if (destructured.kind === "unsupported") {
      return destructured;
    }
    prelude.push(destructured.operation);
  }
  return produced({ parameters, bindings: fnBindings, prelude: prelude.flat() });
}

function lowerFunctionParameter(
  context: LoweringContext,
  declaration: ts.ParameterDeclaration,
  index: number,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  reason: string
): Produced<JsIrFunctionParameter> {
  const isRest = declaration.dotDotDotToken !== undefined;
  if (ts.isObjectBindingPattern(declaration.name) || ts.isArrayBindingPattern(declaration.name)) {
    return isRest
      ? unsupportedIn(reason)
      : produced({ name: `__param${index}`, valueKind: "value" });
  }
  if (!ts.isIdentifier(declaration.name)) {
    return unsupportedIn(reason);
  }
  const name = declaration.name.text;
  const valueKind = isRest ? "value" : parameterValueKind(declaration);
  if (isRest) {
    return produced({ name, valueKind, isRest: true });
  }
  const defaultResult = declaration.initializer === undefined || declaration.initializer.kind === ts.SyntaxKind.UndefinedKeyword
    ? notApplicable
    : context.lowerNumberExpression(context, declaration.initializer, bindings);
  if (defaultResult.kind === "unsupported") {
    return defaultResult;
  }
  const defaultValue = loweredPayload(defaultResult);
  if (defaultValue !== undefined) {
    return produced({ name, valueKind, defaultValue });
  }
  if (declaration.questionToken !== undefined) {
    return produced({ name, valueKind, isOptional: true });
  }
  return produced({ name, valueKind });
}

function lowerParameterDestructuring(
  context: LoweringContext,
  pattern: ts.BindingName,
  name: string,
  bindings: Map<string, JsIrBindingValue>,
  reason: string
): Produced<readonly JsIrOperation[]> {
  if (ts.isIdentifier(pattern)) {
    return produced([]);
  }
  const operations: JsIrOperation[] = [];
  const working = new Map(bindings);
  const result = ts.isArrayBindingPattern(pattern)
    ? lowerArrayProtocolDestructuringFromSource(
      context, pattern, { kind: "value", value: { kind: "variable", name } },
      `${name} is not iterable`, working, operations
    )
    : context.lowerObjectDestructuringElements(
      context, pattern, { name, binding: { kind: "valueVariable", name } }, working, operations
    );
  if (result.kind === "unsupported") {
    return result;
  }
  if (!result.operation) {
    return unsupportedIn(reason);
  }
  for (const operation of operations) {
    updateBindings(operation, working);
  }
  for (const [bindingName, binding] of working) {
    bindings.set(bindingName, binding);
  }
  return produced(operations);
}
