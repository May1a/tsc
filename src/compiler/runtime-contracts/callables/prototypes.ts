// Generated from Static Runtime IR. Run npm run runtime:contracts to regenerate.
import type { LlvmModuleBuilder } from "../../llvm-ir/index.js";
import { prototypesContracts } from "../prototypes.js";
import { type RuntimeCalleeTable, registerRuntimeContract } from "../register.js";

export function createPrototypesCallees(module: LlvmModuleBuilder): RuntimeCalleeTable<typeof prototypesContracts> {
  return {
    "arrayPrototypeMethod": registerRuntimeContract(module, prototypesContracts.arrayPrototypeMethod),
    "arrayMethodReceiverError": registerRuntimeContract(module, prototypesContracts.arrayMethodReceiverError),
    "arrayMethodResult": registerRuntimeContract(module, prototypesContracts.arrayMethodResult),
    "arrayMethodArgument": registerRuntimeContract(module, prototypesContracts.arrayMethodArgument),
    "arrayMethodPosition": registerRuntimeContract(module, prototypesContracts.arrayMethodPosition),
    "arrayJoinMethod": registerRuntimeContract(module, prototypesContracts.arrayJoinMethod),
    "arrayToStringMethod": registerRuntimeContract(module, prototypesContracts.arrayToStringMethod),
    "arrayPushMethod": registerRuntimeContract(module, prototypesContracts.arrayPushMethod),
    "arrayUnshiftMethod": registerRuntimeContract(module, prototypesContracts.arrayUnshiftMethod),
    "arrayPopMethod": registerRuntimeContract(module, prototypesContracts.arrayPopMethod),
    "arrayShiftMethod": registerRuntimeContract(module, prototypesContracts.arrayShiftMethod),
    "arrayReverseMethod": registerRuntimeContract(module, prototypesContracts.arrayReverseMethod),
    "arraySliceMethod": registerRuntimeContract(module, prototypesContracts.arraySliceMethod),
    "arraySpliceMethod": registerRuntimeContract(module, prototypesContracts.arraySpliceMethod),
    "arrayConcatMethod": registerRuntimeContract(module, prototypesContracts.arrayConcatMethod),
    "arrayFlatMethod": registerRuntimeContract(module, prototypesContracts.arrayFlatMethod),
    "arrayAtMethod": registerRuntimeContract(module, prototypesContracts.arrayAtMethod),
    "arrayIncludesMethod": registerRuntimeContract(module, prototypesContracts.arrayIncludesMethod),
    "arrayIndexOfMethod": registerRuntimeContract(module, prototypesContracts.arrayIndexOfMethod),
    "arrayLastIndexOfMethod": registerRuntimeContract(module, prototypesContracts.arrayLastIndexOfMethod),
    "arrayFillMethod": registerRuntimeContract(module, prototypesContracts.arrayFillMethod),
    "arrayCopyWithinMethod": registerRuntimeContract(module, prototypesContracts.arrayCopyWithinMethod),
    "arrayMapMethod": registerRuntimeContract(module, prototypesContracts.arrayMapMethod),
    "arrayFilterMethod": registerRuntimeContract(module, prototypesContracts.arrayFilterMethod),
    "arrayFlatMapMethod": registerRuntimeContract(module, prototypesContracts.arrayFlatMapMethod),
    "arrayForEachMethod": registerRuntimeContract(module, prototypesContracts.arrayForEachMethod),
    "arrayFindMethod": registerRuntimeContract(module, prototypesContracts.arrayFindMethod),
    "arrayFindIndexMethod": registerRuntimeContract(module, prototypesContracts.arrayFindIndexMethod),
    "arrayReduceMethod": registerRuntimeContract(module, prototypesContracts.arrayReduceMethod),
    "arrayReduceRightMethod": registerRuntimeContract(module, prototypesContracts.arrayReduceRightMethod),
    "arraySortMethod": registerRuntimeContract(module, prototypesContracts.arraySortMethod),
  };
}
