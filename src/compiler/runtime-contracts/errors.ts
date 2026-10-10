// Generated from Static Runtime IR. Run npm run runtime:contracts to regenerate.
import { llvm } from "../llvm-ir/index.js";
import type { RuntimeCallContract } from "./types.js";

export const errorsContracts = {
  "errorNew": {
    resultKind: "pointer",
    pointerResult: { kind: "heap" },
    origin: "staticRuntime",
    name: "errorNew", parameters: [llvm.i64, llvm.i64, llvm.ptr, llvm.i64], returns: llvm.ptr, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "errorToString": {
    resultKind: "string",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "errorToString", parameters: [llvm.ptr], returns: llvm.struct([llvm.ptr, llvm.i64]), variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
} as const satisfies Readonly<Record<string, RuntimeCallContract>>;
