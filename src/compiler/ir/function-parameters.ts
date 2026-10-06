import { type Lowered, notApplicable } from "./lowered.js";
import ts from "typescript";
import type { JsIrBindingValue, JsIrValueKind } from "./bindings.js";
import type { LoweringContext } from "./context.js";
import type { JsIrNumberExpression } from "./expressions.js";

export function declaredFunctionReturnKind(type: ts.TypeNode | undefined): JsIrValueKind | "void" {
  if (type?.kind === ts.SyntaxKind.NumberKeyword) {
    return "number";
  }
  if (type?.kind === ts.SyntaxKind.StringKeyword) {
    return "string";
  }
  if (type?.kind === ts.SyntaxKind.VoidKeyword) {
    return "void";
  }
  return "value";
}

export function lowerNumericDefaultValue(
  context: LoweringContext,
  param: ts.ParameterDeclaration,
  fnBindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrNumberExpression> {
  if (param.initializer === undefined || param.initializer.kind === ts.SyntaxKind.UndefinedKeyword) {
    return notApplicable;
  }
  return context.lowerNumberExpression(context, param.initializer, fnBindings);
}

export function bindFunctionParameter(
  name: string,
  valueKind: JsIrValueKind,
  isRest: boolean,
  fnBindings: Map<string, JsIrBindingValue>
): void {
  if (isRest || valueKind === "value") {
    fnBindings.set(name, { kind: "valueVariable", name });
    return;
  }
  if (valueKind === "string") {
    fnBindings.set(name, { kind: "stringVariable", name });
    return;
  }
  fnBindings.set(name, { kind: "number", value: { kind: "parameter", name } });
}

// parameters.
export function functionFrameBindings(bindings: ReadonlyMap<string, JsIrBindingValue>): Map<string, JsIrBindingValue> {
  const frameBindings = new Map(bindings);
  for (const [name, binding] of frameBindings) {
    if (binding.kind === "stringVariable" || binding.kind === "booleanVariable" || (binding.kind === "number" && binding.value.kind === "variable")) {
      frameBindings.delete(name);
    }
  }
  return frameBindings;
}
