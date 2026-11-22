// Generated from Static Runtime IR. Run npm run runtime:contracts to regenerate.
import type { LlvmModuleBuilder } from "../../llvm-ir/index.js";
import { functionsContracts } from "../functions.js";
import { type RuntimeCalleeTable, registerRuntimeContract } from "../register.js";

export function createFunctionsCallees(module: LlvmModuleBuilder): RuntimeCalleeTable<typeof functionsContracts> {
  return {
    "valueBoxFunction": registerRuntimeContract(module, functionsContracts.valueBoxFunction),
    "valueFunctionPtr": registerRuntimeContract(module, functionsContracts.valueFunctionPtr),
    "functionObjectNew": registerRuntimeContract(module, functionsContracts.functionObjectNew),
    "jsCall": registerRuntimeContract(module, functionsContracts.jsCall),
    "functionObjectGet": registerRuntimeContract(module, functionsContracts.functionObjectGet),
    "functionObjectHasOwn": registerRuntimeContract(module, functionsContracts.functionObjectHasOwn),
    "functionObjectDelete": registerRuntimeContract(module, functionsContracts.functionObjectDelete),
    "functionObjectProperties": registerRuntimeContract(module, functionsContracts.functionObjectProperties),
    "functionObjectSet": registerRuntimeContract(module, functionsContracts.functionObjectSet),
    "functionObjectAttachProperties": registerRuntimeContract(module, functionsContracts.functionObjectAttachProperties),
    "functionObjectPropertyGet": registerRuntimeContract(module, functionsContracts.functionObjectPropertyGet),
    "functionObjectOwnPropertyDescriptor": registerRuntimeContract(module, functionsContracts.functionObjectOwnPropertyDescriptor),
    "functionPrototypeInit": registerRuntimeContract(module, functionsContracts.functionPrototypeInit),
    "functionPrototypeMethod": registerRuntimeContract(module, functionsContracts.functionPrototypeMethod),
    "functionProtoReceiverError": registerRuntimeContract(module, functionsContracts.functionProtoReceiverError),
    "functionProtoCall": registerRuntimeContract(module, functionsContracts.functionProtoCall),
    "functionProtoApply": registerRuntimeContract(module, functionsContracts.functionProtoApply),
    "functionBoundTrampoline": registerRuntimeContract(module, functionsContracts.functionBoundTrampoline),
    "functionProtoBind": registerRuntimeContract(module, functionsContracts.functionProtoBind),
    "functionProtoToString": registerRuntimeContract(module, functionsContracts.functionProtoToString),
  };
}
