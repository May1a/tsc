import { test } from "vitest";
import { expectNativeFixtures, expectUnsupportedMessage, roadmapIntegrationTimeoutMs } from "./helpers.js";

test("nested declarations capture later mutable bindings by identity", async () => {
  await expectNativeFixtures([["forward-capture-storage.ts", "null\ntrue\n2\nnull\ntrue\n3\nnull\n4\ntrue\n1\n2\nnull\nundefined\nnull\ntrue\n9\n10\n"]]);
}, roadmapIntegrationTimeoutMs);

test("typeof preserves lexical TDZ checks and reads hoisted values", async () => {
  await expectNativeFixtures([["forward-capture-typeof.ts",
    "true\nnumber\nundefined\nnumber\nstring\nboolean\nobject\nundefined\nobject\nnumber\nfunction\n"]]);
}, roadmapIntegrationTimeoutMs);

test("refuses forward loop captures until cells can be allocated at scope entry", async () => {
  await expectUnsupportedMessage("forward-capture-loop-unsupported.ts",
    "Forward lexical capture inside a loop requires scope-entry cell allocation");
});

test("forward const captures throw before initialization and read the value after it", async () => {
  await expectNativeFixtures([["forward-capture-const.ts", "true\n1\n"]]);
}, roadmapIntegrationTimeoutMs);

test("refuses forward pattern captures until resolution predeclares pattern destinations", async () => {
  await expectUnsupportedMessage("forward-capture-pattern-unsupported.ts",
    "Forward destructuring capture requires predeclared pattern bindings");
});
