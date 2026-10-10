// Generated from Static Runtime IR. Run npm run runtime:contracts to regenerate.
import type { LlvmModuleBuilder } from "../../llvm-ir/index.js";
import { gcContracts } from "../gc.js";
import { type RuntimeCalleeTable, registerRuntimeContract } from "../register.js";

export function createGcCallees(module: LlvmModuleBuilder): RuntimeCalleeTable<typeof gcContracts> {
  return {
    "gcInit": registerRuntimeContract(module, gcContracts.gcInit),
    "gcRootPush": registerRuntimeContract(module, gcContracts.gcRootPush),
    "gcRootPushSlot": registerRuntimeContract(module, gcContracts.gcRootPushSlot),
    "gcRegisterGlobalRoot": registerRuntimeContract(module, gcContracts.gcRegisterGlobalRoot),
    "gcRootPop": registerRuntimeContract(module, gcContracts.gcRootPop),
    "gcRootSave": registerRuntimeContract(module, gcContracts.gcRootSave),
    "gcRootRestore": registerRuntimeContract(module, gcContracts.gcRootRestore),
    "gcSafepoint": registerRuntimeContract(module, gcContracts.gcSafepoint),
    "gcMarkValue": registerRuntimeContract(module, gcContracts.gcMarkValue),
    "gcMarkPayloadPtr": registerRuntimeContract(module, gcContracts.gcMarkPayloadPtr),
    "gcMarkObject": registerRuntimeContract(module, gcContracts.gcMarkObject),
    "gcSweep": registerRuntimeContract(module, gcContracts.gcSweep),
    "gcCollect": registerRuntimeContract(module, gcContracts.gcCollect),
    "gcAlloc": registerRuntimeContract(module, gcContracts.gcAlloc),
    "gcStatsLiveBytes": registerRuntimeContract(module, gcContracts.gcStatsLiveBytes),
    "gcStatsCollections": registerRuntimeContract(module, gcContracts.gcStatsCollections),
  };
}
