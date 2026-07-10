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
  "class-basic-method.ts",
  "gc-retain-live.ts",
  "throw-string-top-level.ts"
] as const;

describe("Node correctness oracle", () => {
  test.each(oracleFixtures)("matches Node for %s", async (fixture) => {
    await expectNativeMatchesNodeIfAvailable(fixture);
  }, roadmapIntegrationTimeoutMs);
});
