import { beforeAll, describe, expect, test } from "vitest";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadFilters } from "../../src/test262/config.js";
import { ensureSuiteFetched, FetchError, verifyCheckout } from "../../src/test262/fetch.js";
import { assembleEntry } from "../../src/test262/prelude.js";
import { captureProcessWithTimeout } from "../../src/test262/process.js";
import { buildMachineReport, evaluateBaseline, formatReport, runFilteredSuite, type RunOptions } from "../../src/test262/runner.js";
import { parseRunArguments } from "../../src/test262/run.js";
import type { Classification, HarnessFilters, TestCaseResult } from "../../src/test262/types.js";
import { repoRoot, roadmapIntegrationTimeoutMs, toolExecutable } from "./helpers.js";

const suiteRoot = path.join(repoRoot, "test/fixtures/test262/suite");
const hangTimeoutMs = 3000;
const gitTimeoutMs = 30_000;
const expectedTotalTests = 18;
const expectedPassCount = 4;
const expectedFailCount = 4;
const expectedSkipCount = 8;
const shaHashLength = 40;

let filters: HarnessFilters;

beforeAll(async () => {
  filters = await loadFilters();
});

const runSuite = async (options: Partial<RunOptions> = {}) => runFilteredSuite({ suiteRoot, filters, ...options });

const completedResults = (run: Awaited<ReturnType<typeof runSuite>>): readonly TestCaseResult[] => {
  if (run.kind !== "completed") {
    throw new Error(`expected a completed run, got ${run.kind}`);
  }
  return run.results;
};

// Like the rest of the integration suite, scenarios that need a linked native
// executable tolerate a missing clang toolchain.
const expectClassification = (result: TestCaseResult, classification: Classification, reason?: string): void => {
  if (result.reason === "missing-toolchain") {
    expect(result.detail).toContain("clang was not found");
    return;
  }
  expect(result.classification).toBe(classification);
  if (reason !== undefined) {
    expect(result.reason).toBe(reason);
  }
};

const cleanupArtifacts = async (result: TestCaseResult): Promise<void> => {
  if (result.artifactsDir !== undefined) {
    await rm(path.dirname(result.artifactsDir), { recursive: true, force: true });
  }
};

describe("filtered Test262 harness", () => {
  test("executes a passing test through the compile-and-run pipeline", async () => {
    const results = completedResults(await runSuite({ only: ["language/statements/while/pass-count-down.js"] }));
    expect(results).toHaveLength(1);
    expectClassification(results[0], "pass");
  }, roadmapIntegrationTimeoutMs);

  test("reports a behavioral mismatch with native and Node behavior shown", async () => {
    const results = completedResults(await runSuite({ only: ["language/statements/expression/mismatch-number-format.js"] }));
    expect(results).toHaveLength(1);
    const [result] = results;
    expectClassification(result, "fail", "behavior-mismatch");
    if (result.reason === "missing-toolchain") {
      return;
    }
    expect(result.detail).toContain("Native behavior");
    expect(result.detail).toContain("Node behavior");
    expect(result.artifactsDir).toBeDefined();
    expect(existsSync(path.join(result.artifactsDir ?? "", "main.ll"))).toBe(true);
    expect(existsSync(path.join(result.artifactsDir ?? "", "trace-map.json"))).toBe(true);
    expect(existsSync(path.join(result.artifactsDir ?? "", "diagnostics.txt"))).toBe(true);
    await cleanupArtifacts(result);
  }, roadmapIntegrationTimeoutMs);

  test("verifies a runtime negative expecting a thrown error class", async () => {
    const results = completedResults(await runSuite({ only: ["language/statements/throw/runtime-negative-type-error.js"] }));
    expect(results).toHaveLength(1);
    expectClassification(results[0], "pass");
  }, roadmapIntegrationTimeoutMs);

  test("fails runtime negatives that throw the wrong class or do not throw", async () => {
    const results = completedResults(
      await runSuite({
        only: [
          "language/statements/throw/runtime-negative-missing-throw.js",
          "language/statements/throw/runtime-negative-wrong-error.js"
        ]
      })
    );
    const byId = new Map(results.map((result) => [result.id, result]));
    expectClassification(
      byId.get("language/statements/throw/runtime-negative-missing-throw.js") ?? results[0],
      "fail",
      "runtime-negative-missing-throw"
    );
    expectClassification(
      byId.get("language/statements/throw/runtime-negative-wrong-error.js") ?? results[0],
      "fail",
      "runtime-negative-wrong-error"
    );
    await Promise.all(results.map(cleanupArtifacts));
  }, roadmapIntegrationTimeoutMs);

  test("expects compile-time rejection for parse negatives", async () => {
    const results = completedResults(await runSuite({ only: ["language/statements/variable/parse-negative.js"] }));
    expect(results).toHaveLength(1);
    expectClassification(results[0], "pass");
  }, roadmapIntegrationTimeoutMs);

  test("reports unsupported constructs as coverage gaps, not behavioral failures", async () => {
    const results = completedResults(await runSuite({ only: ["language/statements/for-in/for-in-coverage-gap.js"] }));
    expect(results).toHaveLength(1);
    expectClassification(results[0], "coverage-gap", "compiler-unsupported");
    expect(results[0].detail).toContain("TSCN1002");
  }, roadmapIntegrationTimeoutMs);

  test("skips unsupported flags, features, and includes with reasons", async () => {
    const results = completedResults(
      await runSuite({
        only: [
          "language/statements/try/async-flagged.js",
          "language/statements/while/bigint-feature.js",
          "language/statements/while/extra-include.js",
          "language/statements/while/only-strict.js"
        ]
      })
    );
    const byId = new Map(results.map((result) => [result.id, result]));
    expectClassification(byId.get("language/statements/try/async-flagged.js") ?? results[0], "skip", "unsupported-flag:async");
    expectClassification(byId.get("language/statements/while/bigint-feature.js") ?? results[0], "skip", "unsupported-feature:BigInt");
    expectClassification(byId.get("language/statements/while/extra-include.js") ?? results[0], "skip", "unsupported-include:propertyHelper.js");
    expectClassification(byId.get("language/statements/while/only-strict.js") ?? results[0], "skip", "unsupported-flag:onlyStrict");
  }, roadmapIntegrationTimeoutMs);

  test("skips decorators when Node cannot serve as the oracle", async () => {
    const results = completedResults(
      await runSuite({ only: ["language/statements/class/decorator-feature.js"] })
    );
    expect(results).toHaveLength(1);
    expectClassification(results[0], "skip", "unsupported-feature:decorators");
  }, roadmapIntegrationTimeoutMs);

  test("executes the minimal Test262 assertion methods", async () => {
    const results = completedResults(
      await runSuite({ only: ["language/statements/while/assert-methods.js"] })
    );
    expect(results).toHaveLength(1);
    expectClassification(results[0], "pass");
  }, roadmapIntegrationTimeoutMs);

  test("reports leaked unsupported class lowering as a coverage gap", async () => {
    const results = completedResults(
      await runSuite({ only: ["language/statements/class/unsupported-static-block.js"] })
    );
    expect(results).toHaveLength(1);
    expectClassification(results[0], "coverage-gap", "compiler-unsupported");
  }, roadmapIntegrationTimeoutMs);

  test("skips out-of-filter and fixture files", async () => {
    const results = completedResults(
      await runSuite({
        only: [
          "language/expressions/addition/plain-addition.js",
          "language/statements/with/with-statement.js",
          "language/statements/try/helper_FIXTURE.js"
        ]
      })
    );
    const byId = new Map(results.map((result) => [result.id, result]));
    expectClassification(byId.get("language/expressions/addition/plain-addition.js") ?? results[0], "skip", "filtered-out");
    expectClassification(byId.get("language/statements/with/with-statement.js") ?? results[0], "skip", "filtered-out");
    expectClassification(byId.get("language/statements/try/helper_FIXTURE.js") ?? results[0], "skip", "fixture-file");
  }, roadmapIntegrationTimeoutMs);

  test("reports a runaway test as a timeout failure", async () => {
    const results = completedResults(
      await runSuite({ only: ["language/statements/while/hangs-forever.js"], timeoutMs: hangTimeoutMs })
    );
    expect(results).toHaveLength(1);
    const [result] = results;
    expectClassification(result, "fail", "timeout");
    await cleanupArtifacts(result);
  }, roadmapIntegrationTimeoutMs);

  test("reports a missing checkout as a skip, never a failure", async () => {
    const run = await runFilteredSuite({ suiteRoot: path.join(tmpdir(), "t262-missing-checkout"), filters });
    expect(run.kind).toBe("missing-checkout");
    const report = formatReport(run);
    expect(report).toContain("SKIP");
    expect(report).toContain("test262:fetch");
  }, roadmapIntegrationTimeoutMs);

  test("runs the full synthetic suite and summarizes by classification and reason", async () => {
    const clang = await toolExecutable("clang");
    const run = await runSuite({ timeoutMs: hangTimeoutMs });
    if (run.kind !== "completed") {
      throw new Error("expected a completed run");
    }
    const { summary, results } = run;
    expect(summary.total).toBe(expectedTotalTests);
    if (clang === undefined) {
      expect(summary.fail).toBe(0);
      for (const result of results) {
        expect(result.classification).not.toBe("fail");
      }
      return;
    }
    expect(summary.pass).toBe(expectedPassCount);
    expect(summary.fail).toBe(expectedFailCount);
    expect(summary.coverageGap).toBe(2);
    expect(summary.skip).toBe(expectedSkipCount);
    expect(summary.skipReasons["filtered-out"]).toBe(2);
    expect(summary.failReasons["behavior-mismatch"]).toBe(1);
    expect(summary.failReasons["runtime-negative-missing-throw"]).toBe(1);
    expect(summary.failReasons["runtime-negative-wrong-error"]).toBe(1);
    expect(summary.failReasons.timeout).toBe(1);
    const report = formatReport(run);
    expect(report).toContain("PASS language/statements/while/pass-count-down.js");
    expect(report).toContain("COVERAGE-GAP language/statements/for-in/for-in-coverage-gap.js [compiler-unsupported]");
    expect(report).toContain("Summary: 4 pass, 4 fail, 2 coverage-gap, 8 skip (18 total)");
    expect(report).not.toContain("plain-addition");
    await Promise.all(results.map(cleanupArtifacts));
  }, roadmapIntegrationTimeoutMs);
});

describe("Test262 assembly and reporting", () => {
  test("rewrites supported assertion calls without changing strings or comments", () => {
    const source = `// assert.sameValue(0, 1)\nconst text = "assert.throws";\nassert.sameValue(1, 1);\nassert.notSameValue(0, -0);\nassert.throws(TypeError, callback);`;
    const entry = assembleEntry(source, { kind: "positive" });
    expect(entry).toContain("// assert.sameValue(0, 1)");
    expect(entry).toContain('"assert.throws"');
    expect(entry).toContain("__t262SameValue(1, 1)");
    expect(entry).toContain("__t262NotSameValue(0, -0)");
    expect(entry).toContain("__t262Throws(TypeError, callback)");
  });

  test("parses focused runner arguments", () => {
    expect(
      parseRunArguments([
        "--path",
        "language/statements/for-of",
        "--classification",
        "coverage-gap",
        "--json",
        "report.json"
      ])
    ).toEqual({
      pathPrefixes: ["language/statements/for-of"],
      classification: "coverage-gap",
      jsonPath: "report.json",
      baselinePath: undefined
    });
    expect(() => parseRunArguments(["--classification", "unknown"])).toThrow("invalid --classification");
    expect(() => parseRunArguments(["--path", "language/statements/for-of", "--baseline", "baseline.json"])).toThrow(
      "--baseline cannot be combined with --path"
    );
  });

  test("builds a machine-readable report with statement-family rollups", async () => {
    const run = await runSuite({ pathPrefixes: ["language/statements/while"] });
    if (run.kind !== "completed") {
      throw new Error("expected a completed run");
    }
    const revision = "a".repeat(shaHashLength);
    const report = buildMachineReport(run, revision);
    expect(report.pinRevision).toBe(revision);
    expect(report.nodeVersion).toBe(process.version);
    expect(report.selected).toBeGreaterThan(0);
    expect(report.families).toEqual([
      expect.objectContaining({ family: "while", total: run.summary.total })
    ]);
    expect(report.summary).toEqual(run.summary);
    expect(
      evaluateBaseline(report, {
        pinRevision: revision,
        minimumPass: report.summary.pass,
        maximumFail: report.summary.fail,
        maximumBehaviorMismatch: report.summary.failReasons["behavior-mismatch"] ?? 0
      })
    ).toEqual([]);
    expect(
      evaluateBaseline(report, {
        pinRevision: revision,
        minimumPass: report.summary.pass + 1,
        maximumFail: report.summary.fail,
        maximumBehaviorMismatch: report.summary.failReasons["behavior-mismatch"] ?? 0
      })
    ).toEqual([expect.stringContaining("pass count")]);
  }, roadmapIntegrationTimeoutMs);

  test("filters text details by classification without changing the summary", async () => {
    const run = await runSuite({ pathPrefixes: ["language/statements/while"] });
    const report = formatReport(run, { classification: "pass" });
    expect(report).toContain("PASS language/statements/while/pass-count-down.js");
    expect(report).not.toContain("SKIP language/statements/while/bigint-feature.js");
    expect(report).toContain("Summary:");
  }, roadmapIntegrationTimeoutMs);
});

describe("pinned Test262 fetch", () => {
  const makeStandInSuite = async (): Promise<{ readonly repoDir: string; readonly revision: string }> => {
    const repoDir = await mkdtemp(path.join(tmpdir(), "t262-standin-"));
    const git = async (args: readonly string[]) => captureProcessWithTimeout("git", args, { cwd: repoDir, timeoutMs: gitTimeoutMs });
    await git(["init", "-q", "-b", "main"]);
    await git(["config", "uploadpack.allowAnySHA1InWant", "true"]);
    await mkdir(path.join(repoDir, "test", "language", "statements", "while"), { recursive: true });
    await writeFile(
      path.join(repoDir, "test", "language", "statements", "while", "stand-in.js"),
      "/*---\nflags: [generated]\n---*/\nassert(true);\n"
    );
    await git(["add", "."]);
    await git(["-c", "user.email=t262@example.com", "-c", "user.name=t262", "commit", "-q", "-m", "initial"]);
    const head = await git(["rev-parse", "HEAD"]);
    return { repoDir, revision: head.stdout.trim() };
  };

  test("fetches and verifies the pinned revision reproducibly against a local stand-in", async () => {
    const standIn = await makeStandInSuite();
    const cacheDir = await mkdtemp(path.join(tmpdir(), "t262-cache-"));
    try {
      const pin = { repository: standIn.repoDir, revision: standIn.revision };
      const first = await ensureSuiteFetched(pin, cacheDir);
      expect(first.status).toBe("fetched");
      expect(first.revision).toBe(standIn.revision);
      expect(existsSync(path.join(first.checkoutDir, "test", "language", "statements", "while", "stand-in.js"))).toBe(true);
      const second = await ensureSuiteFetched(pin, cacheDir);
      expect(second.status).toBe("already-present");
      expect(await verifyCheckout(cacheDir, standIn.revision)).toBe("ok");
    } finally {
      await rm(standIn.repoDir, { recursive: true, force: true });
      await rm(cacheDir, { recursive: true, force: true });
    }
  }, roadmapIntegrationTimeoutMs);

  test("detects a checkout that does not match the pinned revision", async () => {
    const standIn = await makeStandInSuite();
    const cacheDir = await mkdtemp(path.join(tmpdir(), "t262-cache-"));
    try {
      await ensureSuiteFetched({ repository: standIn.repoDir, revision: standIn.revision }, cacheDir);
      expect(await verifyCheckout(cacheDir, "0".repeat(shaHashLength))).toBe("mismatch");
    } finally {
      await rm(standIn.repoDir, { recursive: true, force: true });
      await rm(cacheDir, { recursive: true, force: true });
    }
  }, roadmapIntegrationTimeoutMs);

  test("reports an unreachable repository as a fetch error", async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), "t262-cache-"));
    try {
      await expect(
        ensureSuiteFetched({ repository: path.join(tmpdir(), "t262-no-such-repo"), revision: "0".repeat(shaHashLength) }, cacheDir)
      ).rejects.toBeInstanceOf(FetchError);
    } finally {
      await rm(cacheDir, { recursive: true, force: true });
    }
  }, roadmapIntegrationTimeoutMs);
});
