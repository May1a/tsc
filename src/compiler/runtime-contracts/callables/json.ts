// Generated from Static Runtime IR. Run npm run runtime:contracts to regenerate.
import type { LlvmModuleBuilder } from "../../llvm-ir/index.js";
import { jsonContracts } from "../json.js";
import { type RuntimeCalleeTable, registerRuntimeContract } from "../register.js";

export function createJsonCallees(module: LlvmModuleBuilder): RuntimeCalleeTable<typeof jsonContracts> {
  return {
    "jsonQuote": registerRuntimeContract(module, jsonContracts.jsonQuote),
    "jsonPad": registerRuntimeContract(module, jsonContracts.jsonPad),
    "jsonFilterHas": registerRuntimeContract(module, jsonContracts.jsonFilterHas),
    "jsonStrOk": registerRuntimeContract(module, jsonContracts.jsonStrOk),
    "jsonStrThrow": registerRuntimeContract(module, jsonContracts.jsonStrThrow),
    "jsonStackHasValue": registerRuntimeContract(module, jsonContracts.jsonStackHasValue),
    "jsonStringifyValue": registerRuntimeContract(module, jsonContracts.jsonStringifyValue),
    "jsonStringifyInner": registerRuntimeContract(module, jsonContracts.jsonStringifyInner),
    "jsonStringifyArray": registerRuntimeContract(module, jsonContracts.jsonStringifyArray),
    "jsonStringifyObject": registerRuntimeContract(module, jsonContracts.jsonStringifyObject),
    "jsonStringify": registerRuntimeContract(module, jsonContracts.jsonStringify),
    "jsonSkipWhitespace": registerRuntimeContract(module, jsonContracts.jsonSkipWhitespace),
    "jsonMatchLiteral": registerRuntimeContract(module, jsonContracts.jsonMatchLiteral),
    "jsonHex4": registerRuntimeContract(module, jsonContracts.jsonHex4),
    "jsonParseString": registerRuntimeContract(module, jsonContracts.jsonParseString),
    "jsonParseNumber": registerRuntimeContract(module, jsonContracts.jsonParseNumber),
    "jsonParseValue": registerRuntimeContract(module, jsonContracts.jsonParseValue),
    "jsonParseObject": registerRuntimeContract(module, jsonContracts.jsonParseObject),
    "jsonParseArray": registerRuntimeContract(module, jsonContracts.jsonParseArray),
    "jsonReviverWalk": registerRuntimeContract(module, jsonContracts.jsonReviverWalk),
    "jsonParse": registerRuntimeContract(module, jsonContracts.jsonParse),
  };
}
