// Generated from Static Runtime IR. Run npm run runtime:contracts to regenerate.
import { llvm } from "../llvm-ir/index.js";
import type { RuntimeCallContract } from "./types.js";

export const arraysContracts = {
  "valueArrayPtr": {
    resultKind: "pointer",
    pointerResult: { kind: "borrowed", parameter: 0 },
    origin: "staticRuntime",
    name: "valueArrayPtr", parameters: [llvm.i64], returns: llvm.ptr, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "arrayValidateMapper": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayValidateMapper", parameters: [llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "arrayFromCollection": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayFromCollection", parameters: [llvm.ptr, llvm.i64, llvm.i64, llvm.i64, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "arrayFromIteratorMapped": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayFromIteratorMapped", parameters: [llvm.i64, llvm.i64, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "arrayFromValue": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayFromValue", parameters: [llvm.i64, llvm.i64, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "valueArrayGet": {
    resultKind: "boxed",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "valueArrayGet", parameters: [llvm.i64, llvm.i64, llvm.i64, llvm.ptr], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "valueArrayLength": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "valueArrayLength", parameters: [llvm.i64], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "valueArraySet": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "valueArraySet", parameters: [llvm.i64, llvm.i64, llvm.i64], returns: llvm.void, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "valueArraySetLength": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "valueArraySetLength", parameters: [llvm.i64, llvm.i64], returns: llvm.void, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "valueArrayDelete": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "valueArrayDelete", parameters: [llvm.i64, llvm.i64], returns: llvm.void, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "arrayNew": {
    resultKind: "pointer",
    pointerResult: { kind: "heap" },
    origin: "staticRuntime",
    name: "arrayNew", parameters: [llvm.i64], returns: llvm.ptr, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "arrayFromFixed": {
    resultKind: "pointer",
    pointerResult: { kind: "heap" },
    origin: "staticRuntime",
    name: "arrayFromFixed", parameters: [llvm.i64, llvm.ptr], returns: llvm.ptr, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "arrayLength": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayLength", parameters: [llvm.ptr], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "arrayGet": {
    resultKind: "boxed",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayGet", parameters: [llvm.ptr, llvm.i64], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "arrayGetWithKey": {
    resultKind: "boxed",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayGetWithKey", parameters: [llvm.ptr, llvm.i64, llvm.i64, llvm.ptr], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "arraySetNamed": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arraySetNamed", parameters: [llvm.ptr, llvm.i64, llvm.ptr, llvm.i64], returns: llvm.void, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "arrayDeleteNamed": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayDeleteNamed", parameters: [llvm.ptr, llvm.i64, llvm.ptr], returns: llvm.void, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "arrayHasOwnIndex": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayHasOwnIndex", parameters: [llvm.ptr, llvm.i64], returns: llvm.i1, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "arraySet": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arraySet", parameters: [llvm.ptr, llvm.i64, llvm.i64], returns: llvm.void, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "arrayDelete": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayDelete", parameters: [llvm.ptr, llvm.i64], returns: llvm.void, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "arraySetLength": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arraySetLength", parameters: [llvm.ptr, llvm.i64], returns: llvm.void, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "arrayHas": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayHas", parameters: [llvm.ptr, llvm.i64, llvm.i64, llvm.ptr], returns: llvm.i1, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "arrayKeys": {
    resultKind: "pointer",
    pointerResult: { kind: "heap" },
    origin: "staticRuntime",
    name: "arrayKeys", parameters: [llvm.ptr], returns: llvm.ptr, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "arrayValues": {
    resultKind: "pointer",
    pointerResult: { kind: "heap" },
    origin: "staticRuntime",
    name: "arrayValues", parameters: [llvm.ptr], returns: llvm.ptr, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "arrayEntries": {
    resultKind: "pointer",
    pointerResult: { kind: "heap" },
    origin: "staticRuntime",
    name: "arrayEntries", parameters: [llvm.ptr], returns: llvm.ptr, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "arrayOwnPropertyDescriptor": {
    resultKind: "boxed",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayOwnPropertyDescriptor", parameters: [llvm.ptr, llvm.i64, llvm.ptr, llvm.i64], returns: llvm.i64, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "arrayLengthPropertyDescriptor": {
    resultKind: "boxed",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayLengthPropertyDescriptor", parameters: [llvm.ptr], returns: llvm.i64, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "arrayOwnPropertyDescriptors": {
    resultKind: "pointer",
    pointerResult: { kind: "heap" },
    origin: "staticRuntime",
    name: "arrayOwnPropertyDescriptors", parameters: [llvm.ptr], returns: llvm.ptr, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "arrayIncludes": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayIncludes", parameters: [llvm.ptr, llvm.i64], returns: llvm.i1, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "arrayIndexOf": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayIndexOf", parameters: [llvm.ptr, llvm.i64, llvm.i64], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "arrayLastIndexOf": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayLastIndexOf", parameters: [llvm.ptr, llvm.i64, llvm.i64], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "arrayFind": {
    resultKind: "boxed",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayFind", parameters: [llvm.ptr], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "arrayFindIndex": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayFindIndex", parameters: [llvm.ptr], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "arrayAt": {
    resultKind: "boxed",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayAt", parameters: [llvm.ptr, llvm.i64], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "arrayCopyWithin": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayCopyWithin", parameters: [llvm.ptr, llvm.i64, llvm.i64, llvm.i64], returns: llvm.void, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "arraySlice": {
    resultKind: "pointer",
    pointerResult: { kind: "heap" },
    origin: "staticRuntime",
    name: "arraySlice", parameters: [llvm.ptr, llvm.i64, llvm.i64], returns: llvm.ptr, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "arraySplice": {
    resultKind: "pointer",
    pointerResult: { kind: "heap" },
    origin: "staticRuntime",
    name: "arraySplice", parameters: [llvm.ptr, llvm.i64, llvm.i64, llvm.i64, llvm.ptr], returns: llvm.ptr, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "arrayFlat": {
    resultKind: "pointer",
    pointerResult: { kind: "heap" },
    origin: "staticRuntime",
    name: "arrayFlat", parameters: [llvm.ptr, llvm.i64], returns: llvm.ptr, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "arrayConcat": {
    resultKind: "pointer",
    pointerResult: { kind: "heap" },
    origin: "staticRuntime",
    name: "arrayConcat", parameters: [llvm.ptr, llvm.ptr], returns: llvm.ptr, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "arrayFill": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayFill", parameters: [llvm.ptr, llvm.i64, llvm.i64, llvm.i64], returns: llvm.void, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "arrayReverse": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayReverse", parameters: [llvm.ptr], returns: llvm.void, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "arrayFromArray": {
    resultKind: "pointer",
    pointerResult: { kind: "heap" },
    origin: "staticRuntime",
    name: "arrayFromArray", parameters: [llvm.ptr], returns: llvm.ptr, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "arrayFromArgv": {
    resultKind: "pointer",
    pointerResult: { kind: "heap" },
    origin: "staticRuntime",
    name: "arrayFromArgv", parameters: [llvm.i64, llvm.ptr, llvm.i64], returns: llvm.ptr, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "arrayFromObject": {
    resultKind: "pointer",
    pointerResult: { kind: "heap" },
    origin: "staticRuntime",
    name: "arrayFromObject", parameters: [llvm.ptr], returns: llvm.ptr, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "arraySortDefault": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arraySortDefault", parameters: [llvm.ptr], returns: llvm.void, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "arrayJoin": {
    resultKind: "pointer",
    pointerResult: { kind: "external" },
    origin: "staticRuntime",
    name: "arrayJoin", parameters: [llvm.ptr, llvm.i64, llvm.ptr], returns: llvm.ptr, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "arrayPush": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayPush", parameters: [llvm.ptr, llvm.i64], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "arrayPop": {
    resultKind: "boxed",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayPop", parameters: [llvm.ptr], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "arrayUnshift": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayUnshift", parameters: [llvm.ptr, llvm.i64], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "arrayShift": {
    resultKind: "boxed",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayShift", parameters: [llvm.ptr], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "arraySetPrototype": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arraySetPrototype", parameters: [llvm.ptr, llvm.ptr], returns: llvm.void, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "arrayGetPrototype": {
    resultKind: "pointer",
    pointerResult: { kind: "borrowed", parameter: 0 },
    origin: "staticRuntime",
    name: "arrayGetPrototype", parameters: [llvm.ptr], returns: llvm.ptr, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "arrayOwnPropertyNames": {
    resultKind: "pointer",
    pointerResult: { kind: "heap" },
    origin: "staticRuntime",
    name: "arrayOwnPropertyNames", parameters: [llvm.ptr], returns: llvm.ptr, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "arrayAppendElements": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayAppendElements", parameters: [llvm.ptr, llvm.ptr], returns: llvm.void, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
} as const satisfies Readonly<Record<string, RuntimeCallContract>>;
