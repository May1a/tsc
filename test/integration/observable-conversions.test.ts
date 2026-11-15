import { describe, test } from "vitest";
import { expectNativeFixtures, roadmapIntegrationTimeoutMs } from "./helpers.js";

describe("observable conversion completions", () => {
  test("adds numeric conversion results and propagates abrupt completion", async () => {
    await expectNativeFixtures([["conversion-addition-completions.ts", "valueOf\nvalueOf\n8\nrhs\nTypeError\nrhs\nleft failure\n"]]);
  }, roadmapIntegrationTimeoutMs);
  test("preserves inherited accessor writes and descriptor attributes", async () => {
    await expectNativeFixtures([["conversion-accessor-descriptors.ts", "9\ntrue\ntrue\nfalse\ntrue\nfalse\nfalse\n"]]);
  }, roadmapIntegrationTimeoutMs);
  test("converts error name and message in order and propagates throws", async () => {
    await expectNativeFixtures([["error-tostring-observable.ts", "name\nmessage\ncustom\nname\nerror string failure\n"]]);
  }, roadmapIntegrationTimeoutMs);
  test("preserves builtin and function conversions", async () => {
    await expectNativeFixtures([["conversion-builtins-preserved.ts", "1,2\na1,2\n7\nn7\ntext\nfalse\nTypeError: bad\nfunction\n"]]);
  }, roadmapIntegrationTimeoutMs);
  test("reads inherited cause getters and propagates their exceptions", async () => {
    await expectNativeFixtures([["error-inherited-cause.ts", "cause\n42\ncause failure\n"]]);
  }, roadmapIntegrationTimeoutMs);
  test("observes inherited conversion getters and their exceptions", async () => {
    await expectNativeFixtures([["conversion-inherited-getters.ts", "get\ninherited\nlookup failure\n"]]);
  }, roadmapIntegrationTimeoutMs);
  test("evaluates addition operands before converting either", async () => {
    await expectNativeFixtures([["conversion-evaluation-order.ts", "1!\n"]]);
  }, roadmapIntegrationTimeoutMs);
  test("uses inherited conversion methods with the requested hint", async () => {
    await expectNativeFixtures([["conversion-inherited-defaults.ts", "[object Object]\nx7\n"]]);
  }, roadmapIntegrationTimeoutMs);
  test("refuses a null-prototype object without conversion methods", async () => {
    await expectNativeFixtures([["conversion-null-prototype.ts", "TypeError\n"]]);
  }, roadmapIntegrationTimeoutMs);
  test("converts error messages observably and propagates throws", async () => {
    await expectNativeFixtures([["error-observable-message.ts", "convert\ncustom\nmessage failure\n"]]);
  }, roadmapIntegrationTimeoutMs);
});
