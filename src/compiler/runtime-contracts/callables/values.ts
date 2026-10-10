// Generated from Static Runtime IR. Run npm run runtime:contracts to regenerate.
import type { LlvmModuleBuilder } from "../../llvm-ir/index.js";
import { valuesContracts } from "../values.js";
import { type RuntimeCalleeTable, registerRuntimeContract } from "../register.js";

export function createValuesCallees(module: LlvmModuleBuilder): RuntimeCalleeTable<typeof valuesContracts> {
  return {
    "valueStrictEquals": registerRuntimeContract(module, valuesContracts.valueStrictEquals),
    "valueIsNumberForSameValueZero": registerRuntimeContract(module, valuesContracts.valueIsNumberForSameValueZero),
    "valueSameValueZero": registerRuntimeContract(module, valuesContracts.valueSameValueZero),
    "valueToNumber": registerRuntimeContract(module, valuesContracts.valueToNumber),
    "valueLooseEquals": registerRuntimeContract(module, valuesContracts.valueLooseEquals),
    "valueRelationalCompare": registerRuntimeContract(module, valuesContracts.valueRelationalCompare),
    "valuePlus": registerRuntimeContract(module, valuesContracts.valuePlus),
    "valueBoxString": registerRuntimeContract(module, valuesContracts.valueBoxString),
    "valueCopyString": registerRuntimeContract(module, valuesContracts.valueCopyString),
    "valueStringPtr": registerRuntimeContract(module, valuesContracts.valueStringPtr),
    "valueStringLength": registerRuntimeContract(module, valuesContracts.valueStringLength),
    "valueBoxArray": registerRuntimeContract(module, valuesContracts.valueBoxArray),
    "valueObjectPtr": registerRuntimeContract(module, valuesContracts.valueObjectPtr),
    "valueIsObject": registerRuntimeContract(module, valuesContracts.valueIsObject),
    "valueIsArray": registerRuntimeContract(module, valuesContracts.valueIsArray),
    "valueIsFunction": registerRuntimeContract(module, valuesContracts.valueIsFunction),
    "valueIsString": registerRuntimeContract(module, valuesContracts.valueIsString),
    "valuePropertyGet": registerRuntimeContract(module, valuesContracts.valuePropertyGet),
    "valueLength": registerRuntimeContract(module, valuesContracts.valueLength),
    "valueTruthy": registerRuntimeContract(module, valuesContracts.valueTruthy),
    "valuePrint": registerRuntimeContract(module, valuesContracts.valuePrint),
    "valueToString": registerRuntimeContract(module, valuesContracts.valueToString),
    "indexToString": registerRuntimeContract(module, valuesContracts.indexToString),
    "jsInstanceOf": registerRuntimeContract(module, valuesContracts.jsInstanceOf),
    "boxedValueOf": registerRuntimeContract(module, valuesContracts.boxedValueOf),
    "boxedToString": registerRuntimeContract(module, valuesContracts.boxedToString),
    "requireObjectCoercible": registerRuntimeContract(module, valuesContracts.requireObjectCoercible),
    "checkedValuePropertyGet": registerRuntimeContract(module, valuesContracts.checkedValuePropertyGet),
    "propertyKeyIndex": registerRuntimeContract(module, valuesContracts.propertyKeyIndex),
  };
}
