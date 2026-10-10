// Generated from Static Runtime IR. Run npm run runtime:contracts to regenerate.
import type { LlvmModuleBuilder } from "../../llvm-ir/index.js";
import { callbacksContracts } from "../callbacks.js";
import { type RuntimeCalleeTable, registerRuntimeContract } from "../register.js";

export function createCallbacksCallees(module: LlvmModuleBuilder): RuntimeCalleeTable<typeof callbacksContracts> {
  return {
    "arraySortCallback": registerRuntimeContract(module, callbacksContracts.arraySortCallback),
    "arrayVisitCallback": registerRuntimeContract(module, callbacksContracts.arrayVisitCallback),
    "arrayMapCallback": registerRuntimeContract(module, callbacksContracts.arrayMapCallback),
    "arrayFilterCallback": registerRuntimeContract(module, callbacksContracts.arrayFilterCallback),
    "arrayFlatMapCallback": registerRuntimeContract(module, callbacksContracts.arrayFlatMapCallback),
    "arrayForEachCallback": registerRuntimeContract(module, callbacksContracts.arrayForEachCallback),
    "arrayFindCallback": registerRuntimeContract(module, callbacksContracts.arrayFindCallback),
    "arrayFindIndexCallback": registerRuntimeContract(module, callbacksContracts.arrayFindIndexCallback),
    "arrayFoldCallback": registerRuntimeContract(module, callbacksContracts.arrayFoldCallback),
    "arrayReduceCallback": registerRuntimeContract(module, callbacksContracts.arrayReduceCallback),
    "arrayReduceRightCallback": registerRuntimeContract(module, callbacksContracts.arrayReduceRightCallback),
  };
}
