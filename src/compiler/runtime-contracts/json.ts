// Generated from Static Runtime IR. Run npm run runtime:contracts to regenerate.
import { llvm } from "../llvm-ir/index.js";
import type { RuntimeCallContract } from "./types.js";

export const jsonContracts = {
  "jsonQuote": {
    resultKind: "string",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "jsonQuote", parameters: [llvm.i64, llvm.ptr], returns: llvm.struct([llvm.ptr, llvm.i64]), variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "jsonPad": {
    resultKind: "string",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "jsonPad", parameters: [llvm.i64, llvm.i64], returns: llvm.struct([llvm.ptr, llvm.i64]), variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "jsonFilterHas": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "jsonFilterHas", parameters: [llvm.ptr, llvm.i64, llvm.ptr], returns: llvm.i1, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "jsonStrOk": {
    resultKind: "aggregate",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "jsonStrOk", parameters: [llvm.ptr, llvm.i64], returns: llvm.struct([llvm.ptr, llvm.i64, llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "jsonStrThrow": {
    resultKind: "aggregate",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "jsonStrThrow", parameters: [llvm.i64], returns: llvm.struct([llvm.ptr, llvm.i64, llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "jsonStackHasValue": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "jsonStackHasValue", parameters: [llvm.ptr, llvm.i64], returns: llvm.i1, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "jsonStringifyValue": {
    resultKind: "aggregate",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "jsonStringifyValue", parameters: [llvm.i64, llvm.ptr, llvm.i64, llvm.i64, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.ptr, llvm.i64, llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "none" }
  },
  "jsonStringifyInner": {
    resultKind: "aggregate",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "jsonStringifyInner", parameters: [llvm.i64, llvm.ptr, llvm.i64, llvm.i64, llvm.ptr], returns: llvm.struct([llvm.ptr, llvm.i64, llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "none" }
  },
  "jsonStringifyArray": {
    resultKind: "aggregate",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "jsonStringifyArray", parameters: [llvm.ptr, llvm.ptr, llvm.i64, llvm.i64, llvm.ptr], returns: llvm.struct([llvm.ptr, llvm.i64, llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "none" }
  },
  "jsonStringifyObject": {
    resultKind: "aggregate",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "jsonStringifyObject", parameters: [llvm.ptr, llvm.ptr, llvm.i64, llvm.i64, llvm.ptr], returns: llvm.struct([llvm.ptr, llvm.i64, llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "none" }
  },
  "jsonStringify": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "jsonStringify", parameters: [llvm.i64, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "jsonSkipWhitespace": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "jsonSkipWhitespace", parameters: [llvm.ptr, llvm.i64, llvm.ptr], returns: llvm.void, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "jsonMatchLiteral": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "jsonMatchLiteral", parameters: [llvm.ptr, llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.i1, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "jsonHex4": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "jsonHex4", parameters: [llvm.ptr, llvm.i64], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "jsonParseString": {
    resultKind: "aggregate",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "jsonParseString", parameters: [llvm.ptr, llvm.i64, llvm.ptr], returns: llvm.struct([llvm.ptr, llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "jsonParseNumber": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "jsonParseNumber", parameters: [llvm.ptr, llvm.i64, llvm.ptr], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: false, collects: false, completion: "explicit" }
  },
  "jsonParseValue": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "jsonParseValue", parameters: [llvm.ptr, llvm.i64, llvm.ptr], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "jsonParseObject": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "jsonParseObject", parameters: [llvm.ptr, llvm.i64, llvm.ptr], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "jsonParseArray": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "jsonParseArray", parameters: [llvm.ptr, llvm.i64, llvm.ptr], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "jsonReviverWalk": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "jsonReviverWalk", parameters: [llvm.i64, llvm.i64, llvm.i64, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "jsonParse": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "jsonParse", parameters: [llvm.i64, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
} as const satisfies Readonly<Record<string, RuntimeCallContract>>;
