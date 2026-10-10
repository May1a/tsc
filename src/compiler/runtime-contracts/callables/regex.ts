// Generated from Static Runtime IR. Run npm run runtime:contracts to regenerate.
import type { LlvmModuleBuilder } from "../../llvm-ir/index.js";
import { regexContracts } from "../regex.js";
import { type RuntimeCalleeTable, registerRuntimeContract } from "../register.js";

export function createRegexCallees(module: LlvmModuleBuilder): RuntimeCalleeTable<typeof regexContracts> {
  return {
    "regexValid": registerRuntimeContract(module, regexContracts.regexValid),
    "regexCompile": registerRuntimeContract(module, regexContracts.regexCompile),
    "regexAtomEnd": registerRuntimeContract(module, regexContracts.regexAtomEnd),
    "regexDecodeUtf8": registerRuntimeContract(module, regexContracts.regexDecodeUtf8),
    "regexAtomMatches": registerRuntimeContract(module, regexContracts.regexAtomMatches),
    "regexAtomStep": registerRuntimeContract(module, regexContracts.regexAtomStep),
    "regexQuantifierInfo": registerRuntimeContract(module, regexContracts.regexQuantifierInfo),
    "regexCaptureIndex": registerRuntimeContract(module, regexContracts.regexCaptureIndex),
    "regexIsWordAt": registerRuntimeContract(module, regexContracts.regexIsWordAt),
    "regexGroupEnd": registerRuntimeContract(module, regexContracts.regexGroupEnd),
    "regexMatchHere": registerRuntimeContract(module, regexContracts.regexMatchHere),
    "regexMatchAlternatives": registerRuntimeContract(module, regexContracts.regexMatchAlternatives),
    "regexByteOffset": registerRuntimeContract(module, regexContracts.regexByteOffset),
    "regexFind": registerRuntimeContract(module, regexContracts.regexFind),
    "regexSlice": registerRuntimeContract(module, regexContracts.regexSlice),
    "regexTest": registerRuntimeContract(module, regexContracts.regexTest),
    "regexExec": registerRuntimeContract(module, regexContracts.regexExec),
    "regexMatch": registerRuntimeContract(module, regexContracts.regexMatch),
    "regexSearch": registerRuntimeContract(module, regexContracts.regexSearch),
    "regexSplit": registerRuntimeContract(module, regexContracts.regexSplit),
    "regexExpandReplacement": registerRuntimeContract(module, regexContracts.regexExpandReplacement),
    "regexReplace": registerRuntimeContract(module, regexContracts.regexReplace),
  };
}
