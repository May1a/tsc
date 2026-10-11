import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { compileFixture, repoRoot, roadmapIntegrationTimeoutMs } from "./helpers.js";

/**
 * A `-unsupported.ts` fixture is always refused: the suffix is the claim that the compiler says
 * no, so a fixture that compiles under that name is a lie about what it exercises. Several
 * fixtures outgrew the name as forms were admitted (a class expression, a getter, a private
 * field, a computed field), and each was renamed to say what it tests instead.
 */
const unsupportedFixtures: readonly string[] = readdirSync(path.join(repoRoot, "test/fixtures"))
  .filter((name) => name.endsWith("-unsupported.ts"))
  .toSorted();

describe("fixture names match outcomes", () => {
  test.each(unsupportedFixtures)("%s is refused with TSCN1002", async (fixture) => {
    // Without linking: refusal happens before emission, so there is nothing to link. The inline
    // C++ fixture needs its flag to reach its own refusal: without `--fcpp` it stops earlier with
    // TSCN1003, which is a missing flag rather than the unsupported interpolation.
    const result = await compileFixture(fixture, { fcpp: fixture.startsWith("inline-cpp-") });
    try {
      expect(result.status, `${fixture} compiled but is named -unsupported:\n${result.stderr}`).not.toBe(0);
      expect(result.stderr, fixture).toContain("error TSCN1002");
    } finally {
      await result.cleanup();
    }
  }, roadmapIntegrationTimeoutMs);
});
