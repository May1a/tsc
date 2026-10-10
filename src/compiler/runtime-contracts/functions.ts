// Generated from Static Runtime IR. Run npm run runtime:contracts to regenerate.
import { llvm } from "../llvm-ir/index.js";
import type { RuntimeCallContract } from "./types.js";

export const functionsContracts = {
  "valueBoxFunction": {
    resultKind: "boxed",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "valueBoxFunction", parameters: [llvm.ptr], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "valueFunctionPtr": {
    resultKind: "pointer",
    pointerResult: { kind: "borrowed", parameter: 0 },
    origin: "staticRuntime",
    name: "valueFunctionPtr", parameters: [llvm.i64], returns: llvm.ptr, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "functionObjectNew": {
    resultKind: "boxed",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "functionObjectNew", parameters: [llvm.ptr, llvm.ptr, llvm.i64, llvm.i64, llvm.i64], returns: llvm.i64, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "jsCall": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "jsCall", parameters: [llvm.i64, llvm.i64, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "functionObjectGet": {
    resultKind: "boxed",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "functionObjectGet", parameters: [llvm.i64, llvm.i64, llvm.ptr], returns: llvm.i64, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "functionObjectHasOwn": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "functionObjectHasOwn", parameters: [llvm.i64, llvm.i64, llvm.ptr], returns: llvm.i1, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "functionObjectDelete": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "functionObjectDelete", parameters: [llvm.i64, llvm.i64, llvm.ptr], returns: llvm.void, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "functionObjectOwnPropertyDescriptor": {
    resultKind: "boxed",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "functionObjectOwnPropertyDescriptor", parameters: [llvm.i64, llvm.i64, llvm.ptr], returns: llvm.i64, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
} as const satisfies Readonly<Record<string, RuntimeCallContract>>;
