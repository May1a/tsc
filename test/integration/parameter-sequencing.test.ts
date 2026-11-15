import { test } from "vitest";
import { expectNativeFixtures } from "./helpers.js";

test.each([
  ["parameter-sequencing-order.ts", "1\n2\n"],
  ["parameter-sequencing-reference.ts", "7\n"],
  ["parameter-sequencing-members.ts", "1\n2\n9\n3\n4\n11\n"],
  ["parameter-sequencing-array.ts", "1\n2\n0\n7\n3\n2\n12\n"],
  ["parameter-sequencing-iterator.ts", "next\nclose\nlater\n7\n9\n"],
  ["parameter-sequencing-completion.ts", "default failed\n0\nnullish failed\n0\n17\n17\n"]
])("initializes parameters in order for %s", async (fixture, stdout) => {
  await expectNativeFixtures([[fixture, stdout]]);
});
