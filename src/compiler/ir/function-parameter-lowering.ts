import ts from "typescript";
import type { LoweringContext } from "./context.js";
import type { JsIrBindingValue, JsIrFunctionParameter } from "./bindings.js";
import type { JsIrOperation } from "./types.js";
import { type Produced, produced, unsupportedIn, withRefusal } from "./lowered.js";
import type { JsIrValueExpression } from "./expressions.js";
import { lowerFunctionObjectValue } from "./closures.js";
import { expressionSnippet } from "./diagnostics.js";
import { parameterSlotName, parameterValueKind, runtimeParameters } from "./class-info.js";
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
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<LoweredParameters> {
  const parameters: JsIrFunctionParameter[] = [];
  const fnBindings = functionFrameBindings(bindings);
  const prelude: (readonly JsIrOperation[])[] = [];
  const declaredParameters = runtimeParameters(declarations);
  for (const [index, declaration] of declaredParameters.entries()) {
    if (declaration.dotDotDotToken !== undefined && index !== declaredParameters.length - 1) {
      return unsupportedIn("A rest parameter must be the last parameter in a function declaration");
    }
    const result = lowerFunctionParameter(context, declaration, index, fnBindings);
    if (result.kind === "unsupported") {
      return result;
    }
    const parameter = result.operation;
    parameters.push(parameter);
    bindFunctionParameter(parameter.name, parameter.isOptional === true ? "value" : parameter.valueKind, parameter.isRest === true, fnBindings);
    const destructured = lowerParameterDestructuring(context, declaration.name, parameter.name, fnBindings);
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
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrFunctionParameter> {
  const isRest = declaration.dotDotDotToken !== undefined;
  const isPattern = ts.isObjectBindingPattern(declaration.name) || ts.isArrayBindingPattern(declaration.name);
  if (isPattern && isRest) {
    return unsupportedIn("A rest parameter with a destructuring pattern is not supported in a function declaration yet");
  }
  if (!isPattern && !ts.isIdentifier(declaration.name)) {
    return unsupportedIn("Function parameters must be identifiers or destructuring patterns");
  }
  const name = parameterSlotName(declaration, index);
  if (isRest) {
    return produced({ name, valueKind: "value", isRest: true });
  }
  const valueKind = isPattern ? "value" : parameterValueKind(declaration);
  const defaultResult = lowerParameterDefault(context, declaration.initializer, name, bindings);
  if (defaultResult.kind !== "lowered") {
    return defaultResult;
  }
  const defaultValue = defaultResult.operation;
  if (defaultValue !== undefined) {
    return produced({ name, valueKind, defaultValue });
  }
  // `= undefined` is no default, but it still makes the parameter omittable, like `x?`.
  if (declaration.questionToken !== undefined || declaration.initializer !== undefined) {
    return produced({ name, valueKind: "value", isOptional: true });
  }
  return produced({ name, valueKind });
}

/**
 * A parameter's default, lowered against the parameters before it. `= undefined` is no default at
 * all. A default this build cannot evaluate refuses the parameter rather than being dropped.
 */
export function lowerParameterDefault(
  context: LoweringContext,
  initializer: ts.Expression | undefined,
  name: string,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrValueExpression | undefined> {
  if (initializer === undefined || initializer.kind === ts.SyntaxKind.UndefinedKeyword) {
    return produced(undefined);
  }
  const refusal: Produced<JsIrValueExpression | undefined> = unsupportedIn(`The default value \`${expressionSnippet(initializer)}\` of \`${name}\` is not an expression this build can evaluate`);
  const functionValue = lowerFunctionObjectValue(context, initializer, bindings, name);
  if (functionValue.kind === "lowered") {
    return produced(functionValue.operation);
  }
  if (functionValue.kind === "unsupported") {
    return withRefusal(functionValue, refusal);
  }
  const value = context.lowerValueExpression(context, initializer, bindings);
  return value.kind === "lowered" ? produced(value.operation) : withRefusal(value, refusal);
}

function lowerParameterDestructuring(
  context: LoweringContext,
  pattern: ts.BindingName,
  name: string,
  bindings: Map<string, JsIrBindingValue>
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
    return unsupportedIn("Unsupported destructuring pattern in a function parameter");
  }
  for (const operation of operations) {
    updateBindings(operation, working);
  }
  for (const [bindingName, binding] of working) {
    bindings.set(bindingName, binding);
  }
  return produced(operations);
}
