import { test } from "vitest";
import { expectNativeFixtures, roadmapIntegrationTimeoutMs } from "./helpers.js";

test("mutable array rest targets use boxed storage, including nested and captured var targets", async () => {
  await expectNativeFixtures([["mutable-pattern-rest-storage.ts", "1\n3\nnull\n1\n10\n11\n13\n14\n"]]);
}, roadmapIntegrationTimeoutMs);
