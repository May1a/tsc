import { describe, test } from "vitest";
import { roadmapIntegrationTimeoutMs } from "./helpers.js";
import { expectNativeMatchesNodeIfAvailable } from "./oracle.js";

const oracleFixtures = [
  "hello.ts",
  "multiple-prints.ts",
  "while-loop.ts",
  "const-number-addition.ts",
  "boolean-coercion-supported-values.ts",
  "function-call.ts",
  "array-runtime-push-pop.ts",
  "object-runtime-dynamic-store.ts",
  "map-basic-set-get.ts",
  "set-basic-add-has.ts",
  "string-runtime-trim-methods.ts",
  "math-basic-number-functions.ts",
  "number-coercion-primitives.ts",
  "json-parse-primitives.ts",
  "destructure-nested.ts",
  "array-runtime-map-thisarg.ts",
  "array-runtime-callback-thisarg-methods.ts",
  "array-runtime-arrow-thisarg-evaluation.ts",
  "array-runtime-reduce-initial-not-thisarg.ts",
  "array-runtime-reduce-right-initial-not-thisarg.ts",
  "array-runtime-thisarg-strict-values.ts",
  "array-runtime-map-thisarg-in-function.ts",
  "class-basic-method.ts",
  "gc-retain-live.ts",
  "throw-string-top-level.ts"
] as const;

describe("Node correctness oracle", () => {
  test.each(oracleFixtures)("matches Node for %s", async (fixture) => {
    await expectNativeMatchesNodeIfAvailable(fixture);
  }, roadmapIntegrationTimeoutMs);
});
