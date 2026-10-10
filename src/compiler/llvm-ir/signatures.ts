import { type LlvmPointerType, type LlvmType, type LlvmValue, type LlvmValueType, freezeLlvmType, renderLlvmType, sameLlvmType } from "./types.js";

/** Function signatures validate call arguments. Opaque pointers require explicit indirect-call signatures. */
export interface LlvmFunctionParameter {
  readonly name: string;
  readonly type: LlvmValueType;
}

/** Tuple parameter lists preserve each call argument's type. Unknown-length lists are checked at runtime. */
export interface LlvmFunctionSpec<Parameters extends readonly LlvmFunctionParameter[] = readonly LlvmFunctionParameter[]> {
  readonly name: string;
  readonly parameters: Parameters;
  readonly returns: LlvmType;
  /** `@printf(ptr, ...)`. A variadic declaration renders its ellipsis; a variadic call site
   * additionally has to spell the whole callable type, because that is what LLVM's parser requires. */
  readonly variadic?: boolean;
}

/** The call-site spelling of a signature: return type plus fixed parameter types. */
export interface LlvmCallSignature {
  readonly returns: LlvmType;
  readonly parameterTypes: readonly LlvmValueType[];
  readonly variadic: boolean;
}

/** Module-owned names and signatures are snapshots shared by calls and function addresses. */
export interface LlvmOwnedCallable {
  readonly name: string;
  readonly signature: LlvmCallSignature;
}

export function callSignatureOf(spec: LlvmFunctionSpec): LlvmCallSignature {
  return freezeLlvmCallSignature({
    returns: spec.returns,
    parameterTypes: spec.parameters.map((parameter) => parameter.type),
    variadic: spec.variadic === true
  });
}

export function freezeLlvmCallSignature(signature: LlvmCallSignature): LlvmCallSignature {
  freezeLlvmType(signature.returns);
  for (const parameter of signature.parameterTypes) {
    freezeLlvmType(parameter);
  }
  Object.freeze(signature.parameterTypes);
  return Object.freeze(signature);
}

/** `i32 (ptr, ...)`, the type a variadic call site must spell instead of a bare `i32`. */
export function renderLlvmCallReturnType(signature: LlvmCallSignature): string {
  if (!signature.variadic) {
    return renderLlvmType(signature.returns);
  }
  const parameters = signature.parameterTypes.map(renderLlvmType);
  const list = [...parameters, "..."].join(", ");
  return `${renderLlvmType(signature.returns)} (${list})`;
}

/**
 * A definition's parameter list, with names, because the body refers to them by name. A declaration's
 * list is types only (`declare i32 @puts(ptr)`): it has no body, so names would bind nothing.
 */
export function renderLlvmParameterList(parameters: readonly LlvmFunctionParameter[], variadic: boolean): string {
  const rendered = parameters.map((parameter) => `${renderLlvmType(parameter.type)} %${parameter.name}`);
  return variadic ? [...rendered, "..."].join(", ") : rendered.join(", ");
}

export function renderLlvmDeclarationParameterList(types: readonly LlvmValueType[], variadic: boolean): string {
  const rendered = types.map(renderLlvmType);
  return variadic ? [...rendered, "..."].join(", ") : rendered.join(", ");
}

export function sameLlvmFunctionSpec(left: LlvmFunctionSpec, right: LlvmFunctionSpec): boolean {
  if (isVariadic(left) !== isVariadic(right) ||
    left.parameters.length !== right.parameters.length ||
    !sameLlvmType(left.returns, right.returns)) {
    return false;
  }
  for (let index = 0; index < left.parameters.length; index += 1) {
    if (!sameLlvmType(left.parameters[index].type, right.parameters[index].type)) {
      return false;
    }
  }
  return true;
}

function isVariadic(spec: LlvmFunctionSpec): boolean {
  return spec.variadic === true;
}

/** The typed callee forms a `call` may take; see `labels.ts` for why they are separate. */
export type LlvmCallCallee =
  | { readonly kind: "symbol"; readonly signature: LlvmCallSignature; readonly name: string }
  | { readonly kind: "pointer"; readonly pointer: LlvmValue<LlvmPointerType>; readonly signature: LlvmCallSignature };

/** One `LlvmValue` per declared parameter type, in order. */
export type LlvmArgumentTuple<Types extends readonly LlvmValueType[]> = {
  readonly [Index in keyof Types]: LlvmValue<Types[Index]>;
};

/**
 * Fixes an argument list to one typed value per declared parameter, admitting extras when variadic.
 * `Variadic` is threaded separately because `call` and `callIndirect` carry it in different fields.
 */
type LlvmFixedArguments<Types extends readonly LlvmValueType[], Variadic extends boolean> = Variadic extends true
  ? readonly [...LlvmArgumentTuple<Types>, ...LlvmValue[]]
  : LlvmArgumentTuple<Types>;

/** Tuple parameter lists require one correctly typed value per fixed parameter, plus variadic extras.
 * Unknown-length lists retain runtime arity and type checks. */
export type LlvmCallArguments<Spec extends LlvmFunctionSpec> = number extends Spec["parameters"]["length"]
  ? readonly LlvmValue[]
  : LlvmFixedArguments<ParameterTypesOf<Spec["parameters"]>, Spec["variadic"] extends true ? true : false>;

/** The same rule for an indirect callee, whose signature states parameter types directly. */
export type LlvmIndirectCallArguments<Signature extends LlvmCallSignature> = number extends Signature["parameterTypes"]["length"]
  ? readonly LlvmValue[]
  : LlvmFixedArguments<Signature["parameterTypes"], Signature["variadic"]>;

/** The declared parameter types of a parameter list, in order. */
type ParameterTypesOf<Parameters extends readonly LlvmFunctionParameter[]> = {
  readonly [Index in keyof Parameters]: Parameters[Index] extends LlvmFunctionParameter ? Parameters[Index]["type"] : LlvmValueType;
};
