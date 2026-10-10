// Generated from Static Runtime IR. Run npm run runtime:contracts to regenerate.
import { llvm } from "../llvm-ir/index.js";
import type { RuntimeCallContract } from "./types.js";

export const collectionsContracts = {
  "getCollectionIterator": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "getCollectionIterator", parameters: [llvm.ptr, llvm.i64, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "mapFromIterable": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "mapFromIterable", parameters: [llvm.i64, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "setFromIterable": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "setFromIterable", parameters: [llvm.i64, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "collectionFromIterable": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "collectionFromIterable", parameters: [llvm.i64, llvm.i64, llvm.i1], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "collectionFromIterator": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "collectionFromIterator", parameters: [llvm.i64, llvm.i1], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "mapFromIterator": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "mapFromIterator", parameters: [llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "setFromIterator": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "setFromIterator", parameters: [llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "collectionNew": {
    resultKind: "pointer",
    pointerResult: { kind: "heap" },
    origin: "staticRuntime",
    name: "collectionNew", parameters: [], returns: llvm.ptr, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "collectionSize": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "collectionSize", parameters: [llvm.ptr], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "collectionFind": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "collectionFind", parameters: [llvm.ptr, llvm.i64], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "collectionSet": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "collectionSet", parameters: [llvm.ptr, llvm.i64, llvm.i64], returns: llvm.void, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "collectionGet": {
    resultKind: "boxed",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "collectionGet", parameters: [llvm.ptr, llvm.i64], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "collectionHas": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "collectionHas", parameters: [llvm.ptr, llvm.i64], returns: llvm.i1, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "collectionDelete": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "collectionDelete", parameters: [llvm.ptr, llvm.i64], returns: llvm.i1, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
} as const satisfies Readonly<Record<string, RuntimeCallContract>>;
