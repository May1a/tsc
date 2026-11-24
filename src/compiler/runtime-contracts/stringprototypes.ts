// Generated from Static Runtime IR. Run npm run runtime:contracts to regenerate.
import { llvm } from "../llvm-ir/index.js";
import type { RuntimeCallContract } from "./types.js";

export const stringprototypesContracts = {
  "stringPrototypeInit": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringPrototypeInit", parameters: [], returns: llvm.void, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "builtinCacheInit": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "builtinCacheInit", parameters: [llvm.ptr, llvm.i64], returns: llvm.void, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "stringPrototypeMethod": {
    resultKind: "boxed",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringPrototypeMethod", parameters: [llvm.i64, llvm.ptr], returns: llvm.i64, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "builtinMethod": {
    resultKind: "boxed",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "builtinMethod", parameters: [llvm.ptr, llvm.ptr, llvm.i64, llvm.i64, llvm.ptr], returns: llvm.i64, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "scalarPropertyGet": {
    resultKind: "boxed",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "scalarPropertyGet", parameters: [llvm.i64, llvm.i64, llvm.ptr], returns: llvm.i64, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "valueIsBoolean": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "valueIsBoolean", parameters: [llvm.i64], returns: llvm.i1, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "primitiveMethodReceiverError": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "primitiveMethodReceiverError", parameters: [], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "numberToFixedMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "numberToFixedMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "numberToPrecisionMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "numberToPrecisionMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "numberToExponentialMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "numberToExponentialMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "numberToStringMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "numberToStringMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "numberValueOfMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "numberValueOfMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "booleanValueOfMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "booleanValueOfMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "booleanToStringMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "booleanToStringMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "stringMethodReceiver": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringMethodReceiver", parameters: [llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "stringMethodText": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringMethodText", parameters: [llvm.i64, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "stringAtMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringAtMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "stringCharAtMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringCharAtMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "stringCharCodeAtMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringCharCodeAtMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "stringConcatMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringConcatMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "stringEndsWithMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringEndsWithMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "stringIncludesMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringIncludesMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "stringIndexOfMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringIndexOfMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "stringLastIndexOfMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringLastIndexOfMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "stringLocaleCompareMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringLocaleCompareMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "stringMatchMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringMatchMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "stringNormalizeMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringNormalizeMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "stringPadEndMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringPadEndMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "stringPadStartMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringPadStartMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "stringRepeatMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringRepeatMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "stringReplaceMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringReplaceMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "stringReplaceAllMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringReplaceAllMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "stringSearchMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringSearchMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "stringSliceMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringSliceMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "stringSplitMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringSplitMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "stringStartsWithMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringStartsWithMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "stringSubstrMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringSubstrMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "stringSubstringMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringSubstringMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "stringToLowerCaseMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringToLowerCaseMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "stringToStringMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringToStringMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "stringToUpperCaseMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringToUpperCaseMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "stringTrimMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringTrimMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "stringTrimEndMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringTrimEndMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "stringTrimStartMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringTrimStartMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "stringValueOfMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringValueOfMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
} as const satisfies Readonly<Record<string, RuntimeCallContract>>;
