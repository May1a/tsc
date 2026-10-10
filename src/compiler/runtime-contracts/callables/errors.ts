// Generated from Static Runtime IR. Run npm run runtime:contracts to regenerate.
import type { LlvmModuleBuilder } from "../../llvm-ir/index.js";
import { errorsContracts } from "../errors.js";
import { type RuntimeCalleeTable, registerRuntimeContract } from "../register.js";

export function createErrorsCallees(module: LlvmModuleBuilder): RuntimeCalleeTable<typeof errorsContracts> {
  return {
    "errorNew": registerRuntimeContract(module, errorsContracts.errorNew),
    "errorToString": registerRuntimeContract(module, errorsContracts.errorToString),
  };
}
