// Generated from Static Runtime IR. Run npm run runtime:contracts to regenerate.
import type { LlvmModuleBuilder } from "../../llvm-ir/index.js";
import { collectionsContracts } from "../collections.js";
import { type RuntimeCalleeTable, registerRuntimeContract } from "../register.js";

export function createCollectionsCallees(module: LlvmModuleBuilder): RuntimeCalleeTable<typeof collectionsContracts> {
  return {
    "getCollectionIterator": registerRuntimeContract(module, collectionsContracts.getCollectionIterator),
    "mapFromIterable": registerRuntimeContract(module, collectionsContracts.mapFromIterable),
    "setFromIterable": registerRuntimeContract(module, collectionsContracts.setFromIterable),
    "collectionFromIterable": registerRuntimeContract(module, collectionsContracts.collectionFromIterable),
    "collectionFromIterator": registerRuntimeContract(module, collectionsContracts.collectionFromIterator),
    "mapFromIterator": registerRuntimeContract(module, collectionsContracts.mapFromIterator),
    "setFromIterator": registerRuntimeContract(module, collectionsContracts.setFromIterator),
    "collectionNew": registerRuntimeContract(module, collectionsContracts.collectionNew),
    "collectionSize": registerRuntimeContract(module, collectionsContracts.collectionSize),
    "collectionFind": registerRuntimeContract(module, collectionsContracts.collectionFind),
    "collectionSet": registerRuntimeContract(module, collectionsContracts.collectionSet),
    "collectionGet": registerRuntimeContract(module, collectionsContracts.collectionGet),
    "collectionHas": registerRuntimeContract(module, collectionsContracts.collectionHas),
    "collectionDelete": registerRuntimeContract(module, collectionsContracts.collectionDelete),
  };
}
