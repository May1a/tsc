import { describe, test } from "vitest";
import { roadmapIntegrationTimeoutMs } from "./helpers.js";
import { expectNativeMatchesNodeIfAvailable, oracleFixtures } from "./oracle.js";

describe("Node correctness oracle", () => {
  test.each(oracleFixtures)("matches Node for %s", async (fixture) => {
    await expectNativeMatchesNodeIfAvailable(fixture);
  }, roadmapIntegrationTimeoutMs);
});
