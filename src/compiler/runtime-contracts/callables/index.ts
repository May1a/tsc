// Generated from Static Runtime IR. Run npm run runtime:contracts to regenerate.
import type { LlvmModuleBuilder } from "../../llvm-ir/index.js";
import { entryRuntimeContracts, structuredRuntimeContracts } from "../structured.js";
import { type RuntimeCalleeTable, registerRuntimeContract } from "../register.js";
import type { runtimeContracts } from "../index.js";
import { createArraysCallees } from "./arrays.js";
import { createCallbacksCallees } from "./callbacks.js";
import { createCollectionsCallees } from "./collections.js";
import { createDeclaresCallees } from "./declares.js";
import { createErrorsCallees } from "./errors.js";
import { createFunctionsCallees } from "./functions.js";
import { createGcCallees } from "./gc.js";
import { createIteratorsCallees } from "./iterators.js";
import { createJsonCallees } from "./json.js";
import { createNumbersCallees } from "./numbers.js";
import { createObjectsCallees } from "./objects.js";
import { createRegexCallees } from "./regex.js";
import { createStringsCallees } from "./strings.js";
import { createValuesCallees } from "./values.js";

export function createRuntimeCallees(module: LlvmModuleBuilder): RuntimeCallees {
  return {
    ...createArraysCallees(module),
    ...createCallbacksCallees(module),
    ...createCollectionsCallees(module),
    ...createDeclaresCallees(module),
    ...createErrorsCallees(module),
    ...createFunctionsCallees(module),
    ...createGcCallees(module),
    ...createIteratorsCallees(module),
    ...createJsonCallees(module),
    ...createNumbersCallees(module),
    ...createObjectsCallees(module),
    ...createRegexCallees(module),
    ...createStringsCallees(module),
    ...createValuesCallees(module),
    valueBoxObject: registerRuntimeContract(module, structuredRuntimeContracts.valueBoxObject),
    valueBoxNumber: registerRuntimeContract(module, structuredRuntimeContracts.valueBoxNumber),
    valueNumber: registerRuntimeContract(module, structuredRuntimeContracts.valueNumber),
    puts: registerRuntimeContract(module, entryRuntimeContracts.puts),
    printf: registerRuntimeContract(module, entryRuntimeContracts.printf),
    exit: registerRuntimeContract(module, entryRuntimeContracts.exit),
  };
}

export type RuntimeCallees = RuntimeCalleeTable<typeof runtimeContracts>;
