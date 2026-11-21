// Generated from Static Runtime IR. Run npm run runtime:contracts to regenerate.
import { llvm } from "../llvm-ir/index.js";
import type { RuntimeCallContract } from "./types.js";

export const promisesContracts = {
  "microtaskEnqueue": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "microtaskEnqueue", parameters: [llvm.i64], returns: llvm.void, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "microtaskDrain": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "microtaskDrain", parameters: [], returns: llvm.void, variadic: false,
    effects: { allocates: true, collects: true, completion: "none" }
  },
  "promisePrivateTable": {
    resultKind: "pointer",
    pointerResult: { kind: "heap" },
    origin: "staticRuntime",
    name: "promisePrivateTable", parameters: [llvm.i64], returns: llvm.ptr, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "promiseState": {
    resultKind: "boxed",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "promiseState", parameters: [llvm.ptr], returns: llvm.i64, variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  },
  "promisePrototype": {
    resultKind: "pointer",
    pointerResult: { kind: "heap" },
    origin: "staticRuntime",
    name: "promisePrototype", parameters: [], returns: llvm.ptr, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "promiseCreate": {
    resultKind: "boxed",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "promiseCreate", parameters: [], returns: llvm.i64, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "promiseReactionJob": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "promiseReactionJob", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "promiseEnqueueReaction": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "promiseEnqueueReaction", parameters: [llvm.i64, llvm.i64, llvm.i64, llvm.double, llvm.i64], returns: llvm.void, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "promiseSettleDirect": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "promiseSettleDirect", parameters: [llvm.i64, llvm.double, llvm.i64], returns: llvm.void, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "promiseReject": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "promiseReject", parameters: [llvm.i64, llvm.i64], returns: llvm.void, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "promiseResolveFn": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "promiseResolveFn", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "promiseRejectFn": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "promiseRejectFn", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "promiseCreateResolvingFunctions": {
    resultKind: "aggregate",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "promiseCreateResolvingFunctions", parameters: [llvm.i64], returns: llvm.struct([llvm.i64, llvm.i64]), variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "promiseAdoptThenableJob": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "promiseAdoptThenableJob", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "promiseResolve": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "promiseResolve", parameters: [llvm.i64, llvm.i64], returns: llvm.void, variadic: false,
    effects: { allocates: true, collects: true, completion: "none" }
  },
  "promiseNew": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "promiseNew", parameters: [llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "promiseThenAttach": {
    resultKind: "boxed",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "promiseThenAttach", parameters: [llvm.i64, llvm.i64, llvm.i64], returns: llvm.i64, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "promiseThenMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "promiseThenMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "promiseCatchMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "promiseCatchMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "promiseFinallyPassThunk": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "promiseFinallyPassThunk", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: false, collects: false, completion: "explicit" }
  },
  "promiseFinallyHandler": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "promiseFinallyHandler", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "promiseFinallyMethod": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "promiseFinallyMethod", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "promiseResolveStatic": {
    resultKind: "boxed",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "promiseResolveStatic", parameters: [llvm.i64], returns: llvm.i64, variadic: false,
    effects: { allocates: true, collects: true, completion: "none" }
  },
  "promiseRejectStatic": {
    resultKind: "boxed",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "promiseRejectStatic", parameters: [llvm.i64], returns: llvm.i64, variadic: false,
    effects: { allocates: true, collects: false, completion: "none" }
  },
  "promiseCollectIterable": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "promiseCollectIterable", parameters: [llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "promiseAllFulfill": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "promiseAllFulfill", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "promiseSimpleReject": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "promiseSimpleReject", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "promiseSimpleResolve": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "promiseSimpleResolve", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "promiseAll": {
    resultKind: "boxed",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "promiseAll", parameters: [llvm.i64], returns: llvm.i64, variadic: false,
    effects: { allocates: true, collects: true, completion: "none" }
  },
  "promiseRace": {
    resultKind: "boxed",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "promiseRace", parameters: [llvm.i64], returns: llvm.i64, variadic: false,
    effects: { allocates: true, collects: true, completion: "none" }
  },
  "promiseAllSettledItem": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "promiseAllSettledItem", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "promiseAllSettled": {
    resultKind: "boxed",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "promiseAllSettled", parameters: [llvm.i64], returns: llvm.i64, variadic: false,
    effects: { allocates: true, collects: true, completion: "none" }
  },
  "promiseAnyReject": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "promiseAnyReject", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: false, completion: "explicit" }
  },
  "promiseAny": {
    resultKind: "boxed",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "promiseAny", parameters: [llvm.i64], returns: llvm.i64, variadic: false,
    effects: { allocates: true, collects: true, completion: "none" }
  },
  "asyncResumeOk": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "asyncResumeOk", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "asyncResumeErr": {
    resultKind: "completion",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "asyncResumeErr", parameters: [llvm.i64, llvm.ptr, llvm.ptr, llvm.i64], returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,
    effects: { allocates: true, collects: true, completion: "explicit" }
  },
  "asyncDrive": {
    resultKind: "void",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "asyncDrive", parameters: [llvm.i64, llvm.i64, llvm.double, llvm.i64], returns: llvm.void, variadic: false,
    effects: { allocates: true, collects: true, completion: "none" }
  },
  "asyncStart": {
    resultKind: "boxed",
    pointerResult: { kind: "none" },
    origin: "staticRuntime",
    name: "asyncStart", parameters: [llvm.i64], returns: llvm.i64, variadic: false,
    effects: { allocates: true, collects: true, completion: "none" }
  },
} as const satisfies Readonly<Record<string, RuntimeCallContract>>;
