import { expect, test } from "vitest";
import { compileFixture, runNativeIfAvailable } from "./helpers.js";

test("shortest number strings execute decimal loop backedges in a native executable", async () => {
  const compiled = await compileFixture("number-shortest-decimal-backedge.ts", { link: true });
  try {
    expect(compiled.status, compiled.stderr).toBe(0);
    const run = await runNativeIfAvailable(compiled);
    expect(run.skipped, run.reason).toBe(false);
    expect(run.status, run.stderr).toBe(0);
    expect(run.stderr).toBe("");
    expect(run.stdout).toBe("42\n-42\n1.25\n-1.25\n0.000001\n-0.000001\n1e-7\n100000000000000000000\n1e+21\n0\n0\n");
  } finally {
    await compiled.cleanup();
  }
});
