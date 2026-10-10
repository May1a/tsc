// Generated from Static Runtime IR. Run npm run runtime:contracts to regenerate.
import { llvm } from "../llvm-ir/index.js";
import type { RuntimeCallContract } from "./types.js";

export const regexContracts = {
  "regexValid": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "regexValid", parameters: [llvm.ptr, llvm.i64, llvm.ptr, llvm.i64], returns: llvm.i1, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "regexCompile": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "regexCompile", parameters: [llvm.i64, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "regexAtomEnd": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "regexAtomEnd", parameters: [llvm.ptr, llvm.i64, llvm.i64], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "regexDecodeUtf8": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "regexDecodeUtf8", parameters: [llvm.ptr, llvm.i64], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "regexAtomMatches": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "regexAtomMatches", parameters: [llvm.ptr, llvm.i64, llvm.i64, llvm.ptr, llvm.i64, llvm.i64], returns: llvm.i1, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "regexAtomStep": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "regexAtomStep", parameters: [llvm.ptr, llvm.i64, llvm.ptr, llvm.i64, llvm.i64], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "regexQuantifierInfo": {
    resultKind: "aggregate",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "regexQuantifierInfo", parameters: [llvm.ptr, llvm.i64, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i64, llvm.i64, llvm.i1, llvm.i1]), variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "regexCaptureIndex": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "regexCaptureIndex", parameters: [llvm.ptr, llvm.i64, llvm.i8], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "regexIsWordAt": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "regexIsWordAt", parameters: [llvm.ptr, llvm.i64, llvm.i64], returns: llvm.i1, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "regexGroupEnd": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "regexGroupEnd", parameters: [llvm.ptr, llvm.i64, llvm.i64], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "regexMatchHere": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "regexMatchHere", parameters: [llvm.ptr, llvm.i64, llvm.i64, llvm.ptr, llvm.i64, llvm.i64, llvm.i64], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "regexMatchAlternatives": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "regexMatchAlternatives", parameters: [llvm.ptr, llvm.i64, llvm.ptr, llvm.i64, llvm.i64, llvm.i64], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "regexByteOffset": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "regexByteOffset", parameters: [llvm.ptr, llvm.i64, llvm.i64], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "regexFind": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "regexFind", parameters: [llvm.i64, llvm.i64], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "regexSlice": {
    resultKind: "boxed",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "regexSlice", parameters: [llvm.i64, llvm.i64, llvm.i64], returns: llvm.i64, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "regexTest": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "regexTest", parameters: [llvm.i64, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: false, collects: false, completion: "explicit" }
  },
  "regexExec": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "regexExec", parameters: [llvm.i64, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "regexMatch": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "regexMatch", parameters: [llvm.i64, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "regexSearch": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "regexSearch", parameters: [llvm.i64, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: false, collects: false, completion: "explicit" }
  },
  "regexSplit": {
    resultKind: "pointer",
    pointerResult: { kind: "heap" },
    origin: "staticRuntime",
    name: "regexSplit", parameters: [llvm.i64, llvm.i64, llvm.i64], returns: llvm.ptr, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "regexExpandReplacement": {
    resultKind: "boxed",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "regexExpandReplacement", parameters: [llvm.i64, llvm.i64, llvm.i64, llvm.i64], returns: llvm.i64, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "regexReplace": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "regexReplace", parameters: [llvm.i64, llvm.i64, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
} as const satisfies Readonly<Record<string, RuntimeCallContract>>;
