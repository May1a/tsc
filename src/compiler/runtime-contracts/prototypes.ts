// Generated from Static Runtime IR. Run npm run runtime:contracts to regenerate.
import { llvm } from "../llvm-ir/index.js";
import type { RuntimeCallContract } from "./types.js";

export const prototypesContracts = {
  "arrayPrototypeMethod": {
    resultKind: "pointer",
    pointerResult: { kind: "external" },
    origin: "staticRuntime",
    name: "arrayPrototypeMethod", parameters: [llvm.i64, llvm.ptr], returns: llvm.ptr, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "arrayMethodReceiverError": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayMethodReceiverError", parameters: [], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "arrayMethodResult": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayMethodResult", parameters: [llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: false, collects: false, completion: "explicit" }
  },
  "arrayMethodArgument": {
    resultKind: "boxed",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayMethodArgument", parameters: [llvm.i64, llvm.ptr, llvm.i64], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "arrayMethodPosition": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayMethodPosition", parameters: [llvm.i64, llvm.ptr, llvm.i64, llvm.i64], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "arrayJoinMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayJoinMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "arrayToStringMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayToStringMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "arrayPushMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayPushMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "arrayUnshiftMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayUnshiftMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "arrayPopMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayPopMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "arrayShiftMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayShiftMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "arrayReverseMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayReverseMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "arraySliceMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arraySliceMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "arraySpliceMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arraySpliceMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "arrayConcatMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayConcatMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "arrayFlatMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayFlatMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "arrayAtMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayAtMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "arrayIncludesMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayIncludesMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "arrayIndexOfMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayIndexOfMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "arrayLastIndexOfMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayLastIndexOfMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "arrayFillMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayFillMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "arrayCopyWithinMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayCopyWithinMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "arrayMapMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayMapMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "arrayFilterMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayFilterMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "arrayFlatMapMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayFlatMapMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "arrayForEachMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayForEachMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "arrayFindMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayFindMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "arrayFindIndexMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayFindIndexMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "arrayReduceMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayReduceMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "arrayReduceRightMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arrayReduceRightMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "arraySortMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "arraySortMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
} as const satisfies Readonly<Record<string, RuntimeCallContract>>;
