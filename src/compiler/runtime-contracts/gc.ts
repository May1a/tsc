// Generated from Static Runtime IR. Run npm run runtime:contracts to regenerate.
import { llvm } from "../llvm-ir/index.js";
import type { RuntimeCallContract } from "./types.js";

export const gcContracts = {
  "gcInit": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "gcInit", parameters: [], returns: llvm.void, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "gcRootPush": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "gcRootPush", parameters: [llvm.i64], returns: llvm.void, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "gcRootPushSlot": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "gcRootPushSlot", parameters: [llvm.ptr], returns: llvm.void, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "gcRegisterGlobalRoot": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "gcRegisterGlobalRoot", parameters: [llvm.ptr], returns: llvm.void, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "gcRootPop": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "gcRootPop", parameters: [], returns: llvm.void, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "gcRootSave": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "gcRootSave", parameters: [], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "gcRootRestore": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "gcRootRestore", parameters: [llvm.i64], returns: llvm.void, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "gcSafepoint": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "gcSafepoint", parameters: [], returns: llvm.void, variadic: false,
    effects: { allocates: false, collects: true, completion: "none" }
  },
  "gcMarkValue": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "gcMarkValue", parameters: [llvm.i64], returns: llvm.void, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "gcMarkPayloadPtr": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "gcMarkPayloadPtr", parameters: [llvm.ptr], returns: llvm.void, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "gcMarkObject": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "gcMarkObject", parameters: [llvm.ptr], returns: llvm.void, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "gcSweep": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "gcSweep", parameters: [], returns: llvm.void, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "gcCollect": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "gcCollect", parameters: [], returns: llvm.void, variadic: false,
    effects: { allocates: false, collects: true, completion: "none" }
  },
  "gcAlloc": {
    resultKind: "pointer",
    pointerResult: { kind: "heap" },
    origin: "staticRuntime",
    name: "gcAlloc", parameters: [llvm.i64, llvm.i64], returns: llvm.ptr, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "gcStatsLiveBytes": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "gcStatsLiveBytes", parameters: [], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "gcStatsCollections": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "gcStatsCollections", parameters: [], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
} as const satisfies Readonly<Record<string, RuntimeCallContract>>;
