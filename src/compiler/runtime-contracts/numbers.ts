// Generated from Static Runtime IR. Run npm run runtime:contracts to regenerate.
import { llvm } from "../llvm-ir/index.js";
import type { RuntimeCallContract } from "./types.js";

export const numbersContracts = {
  "globalIsNaN": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "globalIsNaN", parameters: [llvm.i64], returns: llvm.i1, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "numberIsNaN": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "numberIsNaN", parameters: [llvm.i64], returns: llvm.i1, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "numberIsFinite": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "numberIsFinite", parameters: [llvm.i64], returns: llvm.i1, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "numberIsInteger": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "numberIsInteger", parameters: [llvm.i64], returns: llvm.i1, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "numberIsSafeInteger": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "numberIsSafeInteger", parameters: [llvm.i64], returns: llvm.i1, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "numberToFixed": {
    resultKind: "string",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "numberToFixed", parameters: [llvm.double, llvm.double], returns: llvm.struct([llvm.ptr, llvm.i64]), variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "numberToPrecision": {
    resultKind: "string",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "numberToPrecision", parameters: [llvm.double, llvm.double], returns: llvm.struct([llvm.ptr, llvm.i64]), variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "numberToExponential": {
    resultKind: "string",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "numberToExponential", parameters: [llvm.double, llvm.double], returns: llvm.struct([llvm.ptr, llvm.i64]), variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "numberToStringRadix": {
    resultKind: "string",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "numberToStringRadix", parameters: [llvm.double, llvm.double], returns: llvm.struct([llvm.ptr, llvm.i64]), variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "parseInt": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "parseInt", parameters: [llvm.i64, llvm.ptr], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "parseFloat": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "parseFloat", parameters: [llvm.i64, llvm.ptr], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "mathAbs": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "mathAbs", parameters: [llvm.double], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "mathFloor": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "mathFloor", parameters: [llvm.double], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "mathCeil": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "mathCeil", parameters: [llvm.double], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "mathTrunc": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "mathTrunc", parameters: [llvm.double], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "mathRound": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "mathRound", parameters: [llvm.double], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "mathSqrt": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "mathSqrt", parameters: [llvm.double], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "mathPow": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "mathPow", parameters: [llvm.double, llvm.double], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "mathCbrt": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "mathCbrt", parameters: [llvm.double], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "mathExp": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "mathExp", parameters: [llvm.double], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "mathLog": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "mathLog", parameters: [llvm.double], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "mathLog2": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "mathLog2", parameters: [llvm.double], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "mathLog10": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "mathLog10", parameters: [llvm.double], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "mathHypot2": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "mathHypot2", parameters: [llvm.double, llvm.double], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "mathMin2": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "mathMin2", parameters: [llvm.double, llvm.double], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "mathMax2": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "mathMax2", parameters: [llvm.double, llvm.double], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "mathSign": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "mathSign", parameters: [llvm.double], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "mathRandom": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "mathRandom", parameters: [], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "mathFround": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "mathFround", parameters: [llvm.double], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "mathClz32": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "mathClz32", parameters: [llvm.double], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "mathImul": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "mathImul", parameters: [llvm.double, llvm.double], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "mathSin": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "mathSin", parameters: [llvm.double], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "mathCos": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "mathCos", parameters: [llvm.double], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "mathTan": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "mathTan", parameters: [llvm.double], returns: llvm.double, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "numberToInt32": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "numberToInt32", parameters: [llvm.double], returns: llvm.i32, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "numberToIndex": {
    resultKind: "scalar",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "numberToIndex", parameters: [llvm.double], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
} as const satisfies Readonly<Record<string, RuntimeCallContract>>;
