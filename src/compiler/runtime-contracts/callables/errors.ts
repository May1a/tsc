// Generated from Static Runtime IR. Run npm run runtime:contracts to regenerate.
import type { LlvmModuleBuilder } from "../../llvm-ir/index.js";
import { errorsContracts } from "../errors.js";
import { type RuntimeCalleeTable, registerRuntimeContract } from "../register.js";

export function createErrorsCallees(module: LlvmModuleBuilder): RuntimeCalleeTable<typeof errorsContracts> {
  return {
    "errorNew": registerRuntimeContract(module, errorsContracts.errorNew),
    "errorToString": registerRuntimeContract(module, errorsContracts.errorToString),
    "errorConstructorValue": registerRuntimeContract(module, errorsContracts.errorConstructorValue),
    "errorMessageFrom": registerRuntimeContract(module, errorsContracts.errorMessageFrom),
    "errorConstructorCall": registerRuntimeContract(module, errorsContracts.errorConstructorCall),
    "errorConstructorError": registerRuntimeContract(module, errorsContracts.errorConstructorError),
    "errorConstructorTypeError": registerRuntimeContract(module, errorsContracts.errorConstructorTypeError),
    "errorConstructorRangeError": registerRuntimeContract(module, errorsContracts.errorConstructorRangeError),
    "errorConstructorEvalError": registerRuntimeContract(module, errorsContracts.errorConstructorEvalError),
    "errorConstructorURIError": registerRuntimeContract(module, errorsContracts.errorConstructorURIError),
    "errorConstructorSyntaxError": registerRuntimeContract(module, errorsContracts.errorConstructorSyntaxError),
    "errorConstructorReferenceError": registerRuntimeContract(module, errorsContracts.errorConstructorReferenceError),
    "errorInheritedProperty": registerRuntimeContract(module, errorsContracts.errorInheritedProperty),
    "errorToStringMethod": registerRuntimeContract(module, errorsContracts.errorToStringMethod),
    "errorInstallCause": registerRuntimeContract(module, errorsContracts.errorInstallCause),
    "valuePrintUncaught": registerRuntimeContract(module, errorsContracts.valuePrintUncaught),
    "errorThrowReference": registerRuntimeContract(module, errorsContracts.errorThrowReference),
  };
}
