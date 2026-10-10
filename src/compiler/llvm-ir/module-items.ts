import { type LlvmConstant, type LlvmGlobalSpec, renderLlvmConstant } from "./constants.js";
import { type LlvmFunctionSpec, renderLlvmDeclarationParameterList } from "./signatures.js";
import { type LlvmStructType, type LlvmType, renderLlvmStructBody, renderLlvmType } from "./types.js";

/** Structured types, globals, and declarations rendered before function bodies. */

/** `%name = type { i64, i1 }`. Identified so one layout is spelled once and named everywhere else. */
export interface LlvmTypeDefinition {
  readonly name: string;
  readonly type: LlvmStructType;
}

/** A `@name = ... global/constant <type> <initializer>` definition, or a declaration of one. */
export type LlvmGlobalItem =
  | { readonly kind: "definition"; readonly spec: LlvmGlobalSpec }
  | { readonly kind: "declaration"; readonly name: string; readonly type: LlvmType };

/** A global address carries its module owner to reject cross-module references. */
export interface LlvmGlobalReference {
  readonly name: string;
  readonly moduleOwner: symbol;
}

export function renderLlvmTypeDefinition(definition: LlvmTypeDefinition): string {
  return `%${definition.name} = type ${renderLlvmStructBody(definition.type)}`;
}

export function renderLlvmGlobal(item: LlvmGlobalItem): string {
  if (item.kind === "declaration") {
    return `@${item.name} = external global ${renderLlvmType(item.type)}`;
  }
  const attributes = renderGlobalAttributes(item.spec);
  return `@${item.spec.name} = ${attributes}${renderLlvmInitializer(item.spec)}`;
}

export function renderLlvmFunctionDeclaration(spec: LlvmFunctionSpec): string {
  const types = spec.parameters.map((parameter) => parameter.type);
  const parameters = renderLlvmDeclarationParameterList(types, spec.variadic === true);
  return `declare ${renderLlvmType(spec.returns)} @${spec.name}(${parameters})`;
}

function renderGlobalAttributes(spec: LlvmGlobalSpec): string {
  const linkage = spec.linkage === "external" ? "" : `${spec.linkage} `;
  const address = spec.unnamedAddress ? "unnamed_addr " : "";
  return `${linkage}${address}`;
}

function renderLlvmInitializer(spec: LlvmGlobalSpec): string {
  const storage = spec.constant ? "constant " : "global ";
  return `${storage}${renderLlvmType(spec.type)} ${renderLlvmInitializerConstant(spec.initializer)}`;
}

/** A global initializer reference renders as a bare address symbol. */
function renderLlvmInitializerConstant(initializer: LlvmConstant): string {
  return initializer.kind === "globalReference" ? `@${initializer.name}` : renderLlvmConstant(initializer);
}