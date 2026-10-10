// Generated from Static Runtime IR. Run npm run runtime:contracts to regenerate.
import type { LlvmModuleBuilder } from "../../llvm-ir/index.js";
import { iteratorsContracts } from "../iterators.js";
import { type RuntimeCalleeTable, registerRuntimeContract } from "../register.js";

export function createIteratorsCallees(module: LlvmModuleBuilder): RuntimeCalleeTable<typeof iteratorsContracts> {
  return {
    "iteratorTypeError": registerRuntimeContract(module, iteratorsContracts.iteratorTypeError),
    "iteratorResultObject": registerRuntimeContract(module, iteratorsContracts.iteratorResultObject),
    "createIteratorObject": registerRuntimeContract(module, iteratorsContracts.createIteratorObject),
    "iteratorSelfMethod": registerRuntimeContract(module, iteratorsContracts.iteratorSelfMethod),
    "createArrayIterator": registerRuntimeContract(module, iteratorsContracts.createArrayIterator),
    "createStringIterator": registerRuntimeContract(module, iteratorsContracts.createStringIterator),
    "createCollectionIterator": registerRuntimeContract(module, iteratorsContracts.createCollectionIterator),
    "arrayIteratorMethod": registerRuntimeContract(module, iteratorsContracts.arrayIteratorMethod),
    "arrayKeysMethod": registerRuntimeContract(module, iteratorsContracts.arrayKeysMethod),
    "arrayValuesMethod": registerRuntimeContract(module, iteratorsContracts.arrayValuesMethod),
    "arrayEntriesMethod": registerRuntimeContract(module, iteratorsContracts.arrayEntriesMethod),
    "stringIteratorMethod": registerRuntimeContract(module, iteratorsContracts.stringIteratorMethod),
    "builtinIteratorNext": registerRuntimeContract(module, iteratorsContracts.builtinIteratorNext),
    "getIteratorValue": registerRuntimeContract(module, iteratorsContracts.getIteratorValue),
    "iteratorNotCallableMessage": registerRuntimeContract(module, iteratorsContracts.iteratorNotCallableMessage),
    "iteratorResultNotObjectMessage": registerRuntimeContract(module, iteratorsContracts.iteratorResultNotObjectMessage),
    "iteratorEntryNotObjectMessage": registerRuntimeContract(module, iteratorsContracts.iteratorEntryNotObjectMessage),
    "callIteratorNext": registerRuntimeContract(module, iteratorsContracts.callIteratorNext),
    "iterableAppend": registerRuntimeContract(module, iteratorsContracts.iterableAppend),
    "arrayFromIterator": registerRuntimeContract(module, iteratorsContracts.arrayFromIterator),
    "iteratorAppend": registerRuntimeContract(module, iteratorsContracts.iteratorAppend),
    "iteratorCloseForThrow": registerRuntimeContract(module, iteratorsContracts.iteratorCloseForThrow),
    "iteratorClose": registerRuntimeContract(module, iteratorsContracts.iteratorClose),
  };
}
