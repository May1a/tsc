// Generated from Static Runtime IR. Run npm run runtime:contracts to regenerate.
import { llvm } from "../llvm-ir/index.js";
import type { RuntimeCallContract } from "./types.js";

export const declaresContracts = {
  "malloc": {
    resultKind: "pointer",
    pointerResult: { kind: "external" },
    origin: "staticRuntime",
    name: "malloc", parameters: [llvm.i64], returns: llvm.ptr, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "memcpy": {
    resultKind: "pointer",
    pointerResult: { kind: "external" },
    origin: "staticRuntime",
    name: "memcpy", parameters: [llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.ptr, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "memcmp": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "memcmp", parameters: [llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.i32, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "sprintf": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "sprintf", parameters: [llvm.ptr, llvm.ptr], returns: llvm.i32, variadic: true,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "getenv": {
    resultKind: "pointer",
    pointerResult: { kind: "external" },
    origin: "staticRuntime",
    name: "getenv", parameters: [llvm.ptr], returns: llvm.ptr, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "strtol": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "strtol", parameters: [llvm.ptr, llvm.ptr, llvm.i32], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "free": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "free", parameters: [llvm.ptr], returns: llvm.void, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "llvm.fabs.f64": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "llvm.fabs.f64", parameters: [llvm.double], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "llvm.floor.f64": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "llvm.floor.f64", parameters: [llvm.double], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "llvm.ceil.f64": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "llvm.ceil.f64", parameters: [llvm.double], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "llvm.trunc.f64": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "llvm.trunc.f64", parameters: [llvm.double], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "llvm.round.f64": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "llvm.round.f64", parameters: [llvm.double], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "llvm.sqrt.f64": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "llvm.sqrt.f64", parameters: [llvm.double], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "llvm.pow.f64": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "llvm.pow.f64", parameters: [llvm.double, llvm.double], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "llvm.exp.f64": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "llvm.exp.f64", parameters: [llvm.double], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "llvm.log.f64": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "llvm.log.f64", parameters: [llvm.double], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "llvm.log2.f64": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "llvm.log2.f64", parameters: [llvm.double], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "llvm.log10.f64": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "llvm.log10.f64", parameters: [llvm.double], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "llvm.sin.f64": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "llvm.sin.f64", parameters: [llvm.double], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "llvm.cos.f64": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "llvm.cos.f64", parameters: [llvm.double], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "llvm.ctlz.i32": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "llvm.ctlz.i32", parameters: [llvm.i32, llvm.i1], returns: llvm.i32, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "strtod": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "strtod", parameters: [llvm.ptr, llvm.ptr], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "strlen": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "strlen", parameters: [llvm.ptr], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
} as const satisfies Readonly<Record<string, RuntimeCallContract>>;
