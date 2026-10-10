// Generated from Static Runtime IR. Run npm run runtime:contracts to regenerate.
import { llvm } from "../llvm-ir/index.js";
import type { RuntimeCallContract } from "./types.js";

export const stringsContracts = {
  "strConcat": {
    resultKind: "pointer",
    pointerResult: { kind: "external" },
    origin: "staticRuntime",
    name: "strConcat", parameters: [llvm.i64, llvm.ptr, llvm.i64, llvm.ptr], returns: llvm.ptr, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "strEquals": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "strEquals", parameters: [llvm.i64, llvm.ptr, llvm.i64, llvm.ptr], returns: llvm.i1, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "stringIncludes": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringIncludes", parameters: [llvm.i64, llvm.ptr, llvm.i64, llvm.ptr], returns: llvm.i1, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "stringStartsWith": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringStartsWith", parameters: [llvm.i64, llvm.ptr, llvm.i64, llvm.ptr], returns: llvm.i1, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "stringStartsWithAt": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringStartsWithAt", parameters: [llvm.i64, llvm.ptr, llvm.i64, llvm.ptr, llvm.i64], returns: llvm.i1, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "stringEndsWith": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringEndsWith", parameters: [llvm.i64, llvm.ptr, llvm.i64, llvm.ptr], returns: llvm.i1, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "stringAt": {
    resultKind: "string",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringAt", parameters: [llvm.i64, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.ptr, llvm.i64]), variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "stringNormalize": {
    resultKind: "string",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringNormalize", parameters: [llvm.i64, llvm.ptr], returns: llvm.struct([llvm.ptr, llvm.i64]), variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "stringCharCodeAt": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringCharCodeAt", parameters: [llvm.i64, llvm.ptr, llvm.i64], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "stringCharAt": {
    resultKind: "string",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringCharAt", parameters: [llvm.i64, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.ptr, llvm.i64]), variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "stringSlice": {
    resultKind: "string",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringSlice", parameters: [llvm.i64, llvm.ptr, llvm.i64, llvm.i64], returns: llvm.struct([llvm.ptr, llvm.i64]), variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "stringSubstring": {
    resultKind: "string",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringSubstring", parameters: [llvm.i64, llvm.ptr, llvm.i64, llvm.i64], returns: llvm.struct([llvm.ptr, llvm.i64]), variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "stringSubstr": {
    resultKind: "string",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringSubstr", parameters: [llvm.i64, llvm.ptr, llvm.i64, llvm.i64], returns: llvm.struct([llvm.ptr, llvm.i64]), variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "stringFromCharCode": {
    resultKind: "string",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringFromCharCode", parameters: [llvm.ptr, llvm.i64], returns: llvm.struct([llvm.ptr, llvm.i64]), variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "stringIndexOf": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringIndexOf", parameters: [llvm.i64, llvm.ptr, llvm.i64, llvm.ptr, llvm.i64], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "stringLastIndexOf": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringLastIndexOf", parameters: [llvm.i64, llvm.ptr, llvm.i64, llvm.ptr], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "stringIsAsciiWhitespace": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringIsAsciiWhitespace", parameters: [llvm.i8], returns: llvm.i1, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "stringSliceCopy": {
    resultKind: "string",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringSliceCopy", parameters: [llvm.ptr, llvm.i64, llvm.i64], returns: llvm.struct([llvm.ptr, llvm.i64]), variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "stringTrimStartIndex": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringTrimStartIndex", parameters: [llvm.i64, llvm.ptr], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "stringTrimEndIndex": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringTrimEndIndex", parameters: [llvm.i64, llvm.ptr], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "stringTrim": {
    resultKind: "string",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringTrim", parameters: [llvm.i64, llvm.ptr], returns: llvm.struct([llvm.ptr, llvm.i64]), variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "stringTrimStart": {
    resultKind: "string",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringTrimStart", parameters: [llvm.i64, llvm.ptr], returns: llvm.struct([llvm.ptr, llvm.i64]), variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "stringTrimEnd": {
    resultKind: "string",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringTrimEnd", parameters: [llvm.i64, llvm.ptr], returns: llvm.struct([llvm.ptr, llvm.i64]), variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "stringToUpperCase": {
    resultKind: "string",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringToUpperCase", parameters: [llvm.i64, llvm.ptr], returns: llvm.struct([llvm.ptr, llvm.i64]), variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "stringToLowerCase": {
    resultKind: "string",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringToLowerCase", parameters: [llvm.i64, llvm.ptr], returns: llvm.struct([llvm.ptr, llvm.i64]), variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "stringRepeat": {
    resultKind: "string",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringRepeat", parameters: [llvm.i64, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.ptr, llvm.i64]), variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "stringReplace": {
    resultKind: "string",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringReplace", parameters: [llvm.i64, llvm.ptr, llvm.i64, llvm.ptr, llvm.i64, llvm.ptr], returns: llvm.struct([llvm.ptr, llvm.i64]), variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "stringReplaceAll": {
    resultKind: "string",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringReplaceAll", parameters: [llvm.i64, llvm.ptr, llvm.i64, llvm.ptr, llvm.i64, llvm.ptr], returns: llvm.struct([llvm.ptr, llvm.i64]), variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "stringPad": {
    resultKind: "string",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringPad", parameters: [llvm.i64, llvm.ptr, llvm.i64, llvm.i64, llvm.ptr, llvm.i1], returns: llvm.struct([llvm.ptr, llvm.i64]), variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "stringPadStart": {
    resultKind: "string",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringPadStart", parameters: [llvm.i64, llvm.ptr, llvm.i64, llvm.i64, llvm.ptr], returns: llvm.struct([llvm.ptr, llvm.i64]), variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "stringPadEnd": {
    resultKind: "string",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringPadEnd", parameters: [llvm.i64, llvm.ptr, llvm.i64, llvm.i64, llvm.ptr], returns: llvm.struct([llvm.ptr, llvm.i64]), variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "stringSplit": {
    resultKind: "pointer",
    pointerResult: { kind: "heap" },
    origin: "staticRuntime",
    name: "stringSplit", parameters: [llvm.i64, llvm.ptr, llvm.i64, llvm.ptr, llvm.i64], returns: llvm.ptr, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "stringUtf16Length": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringUtf16Length", parameters: [llvm.ptr, llvm.i64], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "stringPropertyGet": {
    resultKind: "boxed",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "stringPropertyGet", parameters: [llvm.i64, llvm.i64, llvm.ptr], returns: llvm.i64, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
} as const satisfies Readonly<Record<string, RuntimeCallContract>>;
