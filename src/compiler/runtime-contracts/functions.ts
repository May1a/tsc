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
  "functionObjectProperties": {
    resultKind: "pointer",
    pointerResult: { kind: "heap" },
    origin: "staticRuntime",
    name: "functionObjectProperties", parameters: [llvm.i64], returns: llvm.ptr, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "functionObjectSet": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "functionObjectSet", parameters: [llvm.i64, llvm.i64, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "functionObjectAttachProperties": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "functionObjectAttachProperties", parameters: [llvm.i64, llvm.i64], returns: llvm.void, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "functionObjectPropertyGet": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "functionObjectPropertyGet", parameters: [llvm.i64, llvm.i64, llvm.ptr], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "functionObjectOwnPropertyDescriptor": {
    resultKind: "boxed",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "functionObjectOwnPropertyDescriptor", parameters: [llvm.i64, llvm.i64, llvm.ptr], returns: llvm.i64, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "functionPrototypeInit": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "functionPrototypeInit", parameters: [], returns: llvm.void, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "functionPrototypeMethod": {
    resultKind: "boxed",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "functionPrototypeMethod", parameters: [llvm.i64, llvm.ptr], returns: llvm.i64, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "functionProtoReceiverError": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "functionProtoReceiverError", parameters: [], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "functionProtoCall": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "functionProtoCall", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "functionProtoApply": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "functionProtoApply", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "functionBoundTrampoline": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "functionBoundTrampoline", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "functionProtoBind": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "functionProtoBind", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "functionProtoToString": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "functionProtoToString", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
} as const satisfies Readonly<Record<string, RuntimeCallContract>>;
