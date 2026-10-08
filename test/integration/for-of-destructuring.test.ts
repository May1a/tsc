import { describe, test } from "vitest";
import { expectUnsupportedMessage } from "./helpers.js";
import { expectNativeMatchesNodeIfAvailable } from "./oracle.js";

describe("for-of destructuring", () => {
  test.each([
    "for-of-destructure-map.ts",
    "for-of-destructure-patterns.ts",
    "for-of-destructure-scope-defaults.ts",
    "for-of-destructure-close.ts",
    "for-of-destructure-object-array.ts",
    "for-of-destructure-array-object.ts",
    "for-of-destructure-nested-array-default.ts",
    "for-of-destructure-nested-object-default.ts",
    "for-of-destructure-slot-collisions.ts",
    "for-of-array.ts",
    "for-of-string.ts",
    "for-of-set.ts",
    "for-of-map.ts"
  ])("matches Node for %s", async (fixture) => {
    await expectNativeMatchesNodeIfAvailable(fixture);
  });

  test("refuses destructuring heads over strings by name", async () => {
    await expectUnsupportedMessage(
      "for-of-destructure-string-unsupported.ts",
      "destructuring for-of binding over a string source is not supported yet [support: for-of-string-destructuring]"
    );
  });
});
