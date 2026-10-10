import { type Lowered, notApplicable, produced } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue, JsIrCallArgument, JsIrFunctionParameter } from "./bindings.js";
import type { JsIrValueExpression } from "./expressions.js";

export function lowerCallArguments(
  context: LoweringContext,
  name: string,
  args: ts.NodeArray<ts.Expression>,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<readonly JsIrCallArgument[]> {
  const callee = bindings.get(name);
  if (callee?.kind === "function") {
    return context.lowerTypedCallArguments(context, callee.parameters, args, bindings);
  }

  const lowered: JsIrCallArgument[] = [];
  for (const arg of args) {
    const value = context.lowerNumberExpression(context, arg, bindings);
    if (value.kind !== "lowered") {
      return value;
    }
    lowered.push({ valueKind: "number", value: value.operation });
  }
  return produced(lowered);
}

export function lowerValueCallArguments(
  context: LoweringContext,
  args: readonly ts.Expression[],
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<readonly JsIrCallArgument[]> {
  const lowered: JsIrCallArgument[] = [];
  for (const argument of args) {
    const value = context.lowerValueExpression(context, argument, bindings);
    if (value.kind !== "lowered") {
      return value;
    }
    lowered.push({ valueKind: "value", value: value.operation });
  }
  return produced(lowered);
}

export function lowerTypedCallArguments(
  context: LoweringContext,
  parameters: readonly JsIrFunctionParameter[],
  args: ts.NodeArray<ts.Expression>,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<readonly JsIrCallArgument[]> {
  const restParameter = parameters.find((parameter) => parameter.isRest === true);
  if (restParameter !== undefined) {
    return lowerTypedCallArgumentsWithRest(context, parameters, restParameter, args, bindings);
  }
  if (args.length > parameters.length) {
    return notApplicable;
  }
  const lowered: JsIrCallArgument[] = [];
  for (let i = 0; i < parameters.length; i++) {
    const parameter = parameters[i];
    if (i < args.length) {
      const value = lowerTypedCallArgument(context, parameter, args[i], bindings);
      if (value.kind !== "lowered") {
        return value;
      }
      lowered.push(value.operation);
      continue;
    }
    const omitted = omittedParameterArgument(parameter);
    if (omitted === undefined) {
      return notApplicable;
    }
    lowered.push(omitted);
  }
  return produced(lowered);
}

// The callee applies defaults to undefined arguments. Optional parameters retain boxed storage.
function omittedParameterArgument(parameter: JsIrFunctionParameter): JsIrCallArgument | undefined {
  if (parameter.defaultValue !== undefined && parameter.valueKind === "number") {
    return { valueKind: "undefined" };
  }
  if (parameter.isOptional === true) {
    return { valueKind: "undefined" };
  }
  return undefined;
}

function lowerTypedCallArgumentsWithRest(
  context: LoweringContext,
  parameters: readonly JsIrFunctionParameter[],
  restParameter: JsIrFunctionParameter,
  args: ts.NodeArray<ts.Expression>,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<readonly JsIrCallArgument[]> {
  const restIndex = parameters.indexOf(restParameter);
  const lowered: JsIrCallArgument[] = [];
  for (let i = 0; i < parameters.length; i++) {
    const parameter = parameters[i];
    if (parameter.isRest === true) {
      continue;
    }
    if (i < args.length && i < restIndex) {
      const value = lowerTypedCallArgument(context, parameter, args[i], bindings);
      if (value.kind !== "lowered") {
        return value;
      }
      lowered.push(value.operation);
      continue;
    }
    const omitted = omittedParameterArgument(parameter);
    if (omitted === undefined) {
      return notApplicable;
    }
    lowered.push(omitted);
  }
  const restValues = lowerRestCallValues(context, restIndex, args, bindings);
  if (restValues.kind !== "lowered") {
    return restValues;
  }
  return produced([...lowered, ...restValues.operation.map((value): JsIrCallArgument => ({ valueKind: "value", value }))]);
}

/**
 * The arguments after the fixed parameters. A fixed-array spread expands to its elements.
 * The native function constructs its rest array from these ordinary call arguments.
 */
function lowerRestCallValues(
  context: LoweringContext,
  restIndex: number,
  args: ts.NodeArray<ts.Expression>,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<readonly JsIrValueExpression[]> {
  const restValues: JsIrValueExpression[] = [];
  for (let i = restIndex; i < args.length; i++) {
    const arg = args[i];
    if (ts.isSpreadElement(arg)) {
      const spreadValues = lowerSpreadElementValues(arg, bindings);
      if (spreadValues === undefined) {
        return notApplicable;
      }
      restValues.push(...spreadValues);
      continue;
    }
    const value = context.lowerValueExpression(context, arg, bindings);
    if (value.kind !== "lowered") {
      return value;
    }
    restValues.push(value.operation);
  }
  return produced(restValues);
}

function lowerSpreadElementValues(
  element: ts.SpreadElement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): readonly JsIrValueExpression[] | undefined {
  if (!ts.isIdentifier(element.expression)) {
    return undefined;
  }
  const binding = bindings.get(element.expression.text);
  if (binding?.kind === "array") {
    const values: JsIrValueExpression[] = [];
    for (let i = 0; i < binding.length; i++) {
      values.push({ kind: "number", value: { kind: "arrayAccess", arrayName: binding.name, index: { kind: "literal", value: i } } });
    }
    return values;
  }
  if (binding?.kind === "runtimeArray") {
    return undefined;
  }
  return undefined;
}

export function lowerTypedCallArgument(
  context: LoweringContext,
  parameter: JsIrFunctionParameter,
  arg: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrCallArgument> {
  // `f(undefined)` is the same call as `f()` on an optional parameter, so it lowers to the same
  // argument rather than failing the parameter's value kind. Tested before the kind dispatch because
  // `undefined` is a value rather than a number or a string, whichever slot it is passed into.
  if (arg.kind === ts.SyntaxKind.UndefinedKeyword || (ts.isIdentifier(arg) && arg.text === "undefined")) {
    return produced({ valueKind: "undefined" });
  }
  if (parameter.valueKind === "string") {
    const value = context.lowerStringRuntimeExpression(context, arg, bindings);
    if (value.kind !== "lowered") {
      return value;
    }
    return produced({ valueKind: "string", value: value.operation });
  }
  if (parameter.valueKind === "value") {
    const value = context.lowerValueExpression(context, arg, bindings);
    if (value.kind !== "lowered") {
      return value;
    }
    return produced({ valueKind: "value", value: value.operation });
  }
  const value = context.lowerNumberExpression(context, arg, bindings);
  if (value.kind !== "lowered") {
    return value;
  }
  return produced({ valueKind: "number", value: value.operation });
}
