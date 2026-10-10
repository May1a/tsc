import ts from "typescript";
import type { JsIrBindingValue, JsIrValueKind } from "./bindings.js";

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

// Mutable scalar slots belong to the enclosing function frame. Until they have a capture
// representation, omit them so references in a new frame are refused during lowering.
export function functionFrameBindings(bindings: ReadonlyMap<string, JsIrBindingValue>): Map<string, JsIrBindingValue> {
  const frameBindings = new Map(bindings);
  for (const [name, binding] of frameBindings) {
    if (binding.kind === "stringVariable" || binding.kind === "booleanVariable" || (binding.kind === "number" && binding.value.kind === "variable")) {
      frameBindings.delete(name);
    }
  }
  return frameBindings;
}
