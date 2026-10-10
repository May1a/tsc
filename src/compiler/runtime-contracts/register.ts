import type { LlvmFunctionParameter, LlvmModuleBuilder } from "../llvm-ir/index.js";
import type { RuntimeCallContract } from "./types.js";

export interface RuntimeCallee<Contract extends RuntimeCallContract> {
  readonly name: Contract["name"];
  readonly parameters: readonly LlvmFunctionParameter[];
  readonly returns: Contract["returns"];
  readonly variadic: Contract["variadic"];
}

export type RuntimeCalleeTable<Contracts extends Readonly<Record<string, RuntimeCallContract>>> = {
  readonly [Key in keyof Contracts]: RuntimeCallee<Contracts[Key]>;
};

export function registerRuntimeContract<const Contract extends RuntimeCallContract>(
  module: LlvmModuleBuilder,
  contract: Contract
): RuntimeCallee<Contract> {
  const spec: RuntimeCallee<Contract> = {
    name: contract.name,
    parameters: contract.parameters.map((type, index) => ({ name: `arg${index}`, type })),
    returns: contract.returns,
    variadic: contract.variadic
  };
  return contract.origin === "staticRuntime"
    ? module.registerStaticRuntimeFunction(spec)
    : module.declareFunction(spec);
}
