import { test } from "vitest";
import { expectNativeFixtures, expectUnsupportedMessage, roadmapIntegrationTimeoutMs } from "./helpers.js";

test("nested declarations capture later mutable bindings by identity", async () => {
  await expectNativeFixtures([["forward-capture-storage.ts", "null\ntrue\n2\nnull\ntrue\n3\nnull\n4\ntrue\n1\n2\nnull\nundefined\nnull\ntrue\n9\n10\n"]]);
}, roadmapIntegrationTimeoutMs);

test("refuses forward loop captures until cells can be allocated at scope entry", async () => {
  await expectUnsupportedMessage("forward-capture-loop-unsupported.ts",
    "Forward lexical capture inside a loop requires scope-entry cell allocation");
});

test("refuses forward const captures that could bypass lexical reads through constant folding", async () => {
  await expectUnsupportedMessage("forward-capture-const-unsupported.ts",
    "Forward const capture requires a non-folded lexical read");
});

test("refuses forward pattern captures until resolution predeclares pattern destinations", async () => {
  await expectUnsupportedMessage("forward-capture-pattern-unsupported.ts",
    "Forward destructuring capture requires predeclared pattern bindings");
});
