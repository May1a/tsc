import ts from "typescript";
import type { JsIrBindingValue, JsIrFunctionParameter, JsIrValueKind } from "./bindings.js";
import { parameterSlotName, parameterValueKind, runtimeParameters } from "./class-info.js";

export function functionReferenceBinding(
  declaration: ts.FunctionDeclaration
): Extract<JsIrBindingValue, { readonly kind: "functionReference" }> {
  const isSuspendable =
    declaration.asteriskToken !== undefined ||
    declaration.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) === true;
  const parameters: JsIrFunctionParameter[] = runtimeParameters(declaration.parameters).map((param, index) => {
    const isRest = param.dotDotDotToken !== undefined;
    const isPattern = ts.isObjectBindingPattern(param.name) || ts.isArrayBindingPattern(param.name);
    const isOptional = param.questionToken !== undefined || param.initializer !== undefined;
    const base: JsIrFunctionParameter = {
      name: parameterSlotName(param, index),
      valueKind: isRest || isPattern || isOptional ? "value" : parameterValueKind(param)
    };
    if (isRest && isOptional) {
      return { name: base.name, valueKind: base.valueKind, isRest: true, isOptional: true };
    }
    if (isRest) {
      return { name: base.name, valueKind: base.valueKind, isRest: true };
    }
    if (isOptional) {
      return { name: base.name, valueKind: base.valueKind, isOptional: true };
    }
    return base;
  });
  return {
    kind: "functionReference",
    parameters,
    returnKind: isSuspendable ? "value" : declaredFunctionReturnKind(declaration.type)
  };
}

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
