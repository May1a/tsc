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

// Mutable scalar slots are shared with nested frames through boxed environment cells: binding
// resolution marks a binding captured when a nested function reads it, and native lowering
// allocates an environment cell both frames address. Keep every binding visible so references in
// a new frame lower, and let the capture lists name what the environment must carry.
export function functionFrameBindings(bindings: ReadonlyMap<string, JsIrBindingValue>): Map<string, JsIrBindingValue> {
  return new Map(bindings);
}
