// Generated from Static Runtime IR. Run npm run runtime:contracts to regenerate.
import type { LlvmModuleBuilder } from "../../llvm-ir/index.js";
import { promisesContracts } from "../promises.js";
import { type RuntimeCalleeTable, registerRuntimeContract } from "../register.js";

export function createPromisesCallees(module: LlvmModuleBuilder): RuntimeCalleeTable<typeof promisesContracts> {
  return {
    "microtaskEnqueue": registerRuntimeContract(module, promisesContracts.microtaskEnqueue),
    "microtaskDrain": registerRuntimeContract(module, promisesContracts.microtaskDrain),
    "promisePrivateTable": registerRuntimeContract(module, promisesContracts.promisePrivateTable),
    "promiseState": registerRuntimeContract(module, promisesContracts.promiseState),
    "promisePrototype": registerRuntimeContract(module, promisesContracts.promisePrototype),
    "promiseCreate": registerRuntimeContract(module, promisesContracts.promiseCreate),
    "promiseReactionJob": registerRuntimeContract(module, promisesContracts.promiseReactionJob),
    "promiseEnqueueReaction": registerRuntimeContract(module, promisesContracts.promiseEnqueueReaction),
    "promiseSettleDirect": registerRuntimeContract(module, promisesContracts.promiseSettleDirect),
    "promiseReject": registerRuntimeContract(module, promisesContracts.promiseReject),
    "promiseResolveFn": registerRuntimeContract(module, promisesContracts.promiseResolveFn),
    "promiseRejectFn": registerRuntimeContract(module, promisesContracts.promiseRejectFn),
    "promiseCreateResolvingFunctions": registerRuntimeContract(module, promisesContracts.promiseCreateResolvingFunctions),
    "promiseAdoptThenableJob": registerRuntimeContract(module, promisesContracts.promiseAdoptThenableJob),
    "promiseResolve": registerRuntimeContract(module, promisesContracts.promiseResolve),
    "promiseNew": registerRuntimeContract(module, promisesContracts.promiseNew),
    "promiseThenAttach": registerRuntimeContract(module, promisesContracts.promiseThenAttach),
    "promiseThenMethod": registerRuntimeContract(module, promisesContracts.promiseThenMethod),
    "promiseCatchMethod": registerRuntimeContract(module, promisesContracts.promiseCatchMethod),
    "promiseFinallyPassThunk": registerRuntimeContract(module, promisesContracts.promiseFinallyPassThunk),
    "promiseFinallyHandler": registerRuntimeContract(module, promisesContracts.promiseFinallyHandler),
    "promiseFinallyMethod": registerRuntimeContract(module, promisesContracts.promiseFinallyMethod),
    "promiseResolveStatic": registerRuntimeContract(module, promisesContracts.promiseResolveStatic),
    "promiseRejectStatic": registerRuntimeContract(module, promisesContracts.promiseRejectStatic),
    "promiseCollectIterable": registerRuntimeContract(module, promisesContracts.promiseCollectIterable),
    "promiseAllFulfill": registerRuntimeContract(module, promisesContracts.promiseAllFulfill),
    "promiseSimpleReject": registerRuntimeContract(module, promisesContracts.promiseSimpleReject),
    "promiseSimpleResolve": registerRuntimeContract(module, promisesContracts.promiseSimpleResolve),
    "promiseAll": registerRuntimeContract(module, promisesContracts.promiseAll),
    "promiseRace": registerRuntimeContract(module, promisesContracts.promiseRace),
    "promiseAllSettledItem": registerRuntimeContract(module, promisesContracts.promiseAllSettledItem),
    "promiseAllSettled": registerRuntimeContract(module, promisesContracts.promiseAllSettled),
    "promiseAnyReject": registerRuntimeContract(module, promisesContracts.promiseAnyReject),
    "promiseAny": registerRuntimeContract(module, promisesContracts.promiseAny),
    "asyncResumeOk": registerRuntimeContract(module, promisesContracts.asyncResumeOk),
    "asyncResumeErr": registerRuntimeContract(module, promisesContracts.asyncResumeErr),
    "asyncDrive": registerRuntimeContract(module, promisesContracts.asyncDrive),
    "asyncStart": registerRuntimeContract(module, promisesContracts.asyncStart),
  };
}
