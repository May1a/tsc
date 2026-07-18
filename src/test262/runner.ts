import { existsSync } from "node:fs";
import path from "node:path";
import { executeTest } from "./execute.js";
import { selectTests } from "./selection.js";
import type { HarnessFilters, SuiteRun, SuiteSummary, TestCaseResult } from "./types.js";

export type RunOptions = {
  readonly suiteRoot: string;
  readonly filters: HarnessFilters;
  readonly only?: readonly string[];
  readonly concurrency?: number;
  readonly timeoutMs?: number;
  readonly keepArtifactsOnFailure?: boolean;
  readonly workDirRoot?: string;
  readonly onResult?: (result: TestCaseResult) => void;
};

const defaultConcurrency = 4;
const defaultTimeoutMs = 10_000;

const runWithConcurrency = async <T>(items: readonly T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> => {
  let next = 0;
  const lanes = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      // eslint-disable-next-line no-await-in-loop -- Each lane must process items sequentially; lanes run in parallel.
      await worker(items[index]);
    }
  });
  await Promise.all(lanes);
};

const countReasons = (results: readonly TestCaseResult[], classification: "skip" | "fail"): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const result of results) {
    if (result.classification === classification && result.reason !== undefined) {
      counts[result.reason] = (counts[result.reason] ?? 0) + 1;
    }
  }
  return counts;
};

const summarize = (results: readonly TestCaseResult[]): SuiteSummary => ({
  total: results.length,
  pass: results.filter((result) => result.classification === "pass").length,
  fail: results.filter((result) => result.classification === "fail").length,
  skip: results.filter((result) => result.classification === "skip").length,
  coverageGap: results.filter((result) => result.classification === "coverage-gap").length,
  skipReasons: countReasons(results, "skip"),
  failReasons: countReasons(results, "fail")
});

/**
 * Runs the filtered Test262 suite: enumerates the checkout's language tree,
 * classifies every test, executes the selected ones through the real
 * compile-and-run pipeline, and aggregates a summary. A missing checkout is a
 * skip-level outcome, never a failure, so CI stays stable without the suite.
 */
export const runFilteredSuite = async (options: RunOptions): Promise<SuiteRun> => {
  const checkoutTestDir = path.join(options.suiteRoot, "test");
  if (!existsSync(checkoutTestDir)) {
    return {
      kind: "missing-checkout",
      message: `Test262 checkout not found at ${options.suiteRoot}; run \`npm run test262:fetch\` to download the pinned suite`
    };
  }
  const { selected, skipped } = await selectTests(options.suiteRoot, options.filters);
  const { only } = options;
  let selectedToRun: typeof selected;
  if (only === undefined) {
    selectedToRun = selected;
  } else {
    selectedToRun = selected.filter((test) => only.includes(test.id));
  }
  let skippedToReport: typeof skipped;
  if (only === undefined) {
    skippedToReport = skipped;
  } else {
    skippedToReport = skipped.filter((result) => only.includes(result.id));
  }
  const executed: TestCaseResult[] = [];
  await runWithConcurrency(selectedToRun, options.concurrency ?? defaultConcurrency, async (test) => {
    const result = await executeTest(test, {
      timeoutMs: options.timeoutMs ?? defaultTimeoutMs,
      keepArtifactsOnFailure: options.keepArtifactsOnFailure ?? true,
      workDirRoot: options.workDirRoot
    });
    executed.push(result);
    options.onResult?.(result);
  });
  const results = [...skippedToReport, ...executed].toSorted((left, right) => left.id.localeCompare(right.id));
  return { kind: "completed", results, summary: summarize(results) };
};

const formatResultLine = (result: TestCaseResult): string => {
  let label: string;
  if (result.classification === "coverage-gap") {
    label = "COVERAGE-GAP";
  } else {
    label = result.classification.toUpperCase();
  }
  let reason: string;
  if (result.reason === undefined) {
    reason = "";
  } else {
    reason = ` [${result.reason}]`;
  }
  return `${label} ${result.id}${reason}`;
};

const formatDetail = (result: TestCaseResult): readonly string[] => {
  if (result.detail === undefined) {
    return [];
  }
  return result.detail.split("\n").map((line) => `  ${line}`);
};

/**
 * Renders a human-readable report: one line per executed or meaningfully
 * skipped test (filtered-out tests appear in the aggregate counts only),
 * followed by the summary with counts by classification and by reason.
 */
export const formatReport = (run: SuiteRun): string => {
  if (run.kind === "missing-checkout") {
    return `SKIP ${run.message}`;
  }
  const lines: string[] = [];
  for (const result of run.results) {
    if (result.reason === "filtered-out") {
      continue;
    }
    lines.push(formatResultLine(result));
    lines.push(...formatDetail(result));
  }
  const { summary } = run;
  lines.push("");
  lines.push(
    `Summary: ${summary.pass} pass, ${summary.fail} fail, ${summary.coverageGap} coverage-gap, ${summary.skip} skip (${summary.total} total)`
  );
  for (const [reason, count] of Object.entries(summary.skipReasons).toSorted((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`  skip ${reason}: ${count}`);
  }
  for (const [reason, count] of Object.entries(summary.failReasons).toSorted((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`  fail ${reason}: ${count}`);
  }
  return `${lines.join("\n")}\n`;
};
