import { existsSync } from "node:fs";
import path from "node:path";
import { executeTest } from "./execute.js";
import { selectTests } from "./selection.js";
import type {
  Classification,
  HarnessFilters,
  SuiteRun,
  SuiteSummary,
  Test262Baseline,
  Test262MachineReport,
  TestCaseResult,
  TestFamilySummary
} from "./types.js";

export interface RunOptions {
  readonly suiteRoot: string;
  readonly filters: HarnessFilters;
  readonly only?: readonly string[];
  readonly pathPrefixes?: readonly string[];
  readonly concurrency?: number;
  readonly timeoutMs?: number;
  readonly keepArtifactsOnFailure?: boolean;
  readonly workDirRoot?: string;
  readonly onResult?: (result: TestCaseResult) => void;
}

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

const summarize = (results: readonly TestCaseResult[], selected: number): SuiteSummary => ({
  total: results.length,
  selected,
  pass: results.filter((result) => result.classification === "pass").length,
  fail: results.filter((result) => result.classification === "fail").length,
  skip: results.filter((result) => result.classification === "skip").length,
  coverageGap: results.filter((result) => result.classification === "coverage-gap").length,
  skipReasons: countReasons(results, "skip"),
  failReasons: countReasons(results, "fail")
});

const matchesPathPrefix = (id: string, prefix: string): boolean => id === prefix || id.startsWith(`${prefix}/`);

const includedByOptions = (id: string, options: RunOptions): boolean => {
  if (options.only !== undefined && !options.only.includes(id)) {
    return false;
  }
  return options.pathPrefixes === undefined || options.pathPrefixes.length === 0 || options.pathPrefixes.some((prefix) => matchesPathPrefix(id, prefix));
};

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
  const selectedToRun = selected.filter((test) => includedByOptions(test.id, options));
  const skippedToReport = skipped.filter((result) => includedByOptions(result.id, options));
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
  return { kind: "completed", results, summary: summarize(results, selectedToRun.length) };
};

const formatResultLine = (result: TestCaseResult): string => {
  let label: string | undefined = undefined;
  if (result.classification === "coverage-gap") {
    label = "COVERAGE-GAP";
  } else {
    label = result.classification.toUpperCase();
  }
  let reason: string | undefined = undefined;
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
export const formatReport = (run: SuiteRun, options: { readonly classification?: Classification } = {}): string => {
  if (run.kind === "missing-checkout") {
    return `SKIP ${run.message}`;
  }
  const lines: string[] = [];
  for (const result of run.results) {
    if (result.reason === "filtered-out" || (options.classification !== undefined && result.classification !== options.classification)) {
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

const statementFamily = (id: string): string | undefined => {
  const parts = id.split("/");
  const [language, statements] = parts;
  const family = parts.at(2);
  if (language !== "language" || statements !== "statements" || family === undefined) {
    return undefined;
  }
  return family;
};

const summarizeFamily = (family: string, results: readonly TestCaseResult[]): TestFamilySummary => {
  const familyResults = results.filter((result) => statementFamily(result.id) === family);
  return {
    family,
    total: familyResults.length,
    pass: familyResults.filter((result) => result.classification === "pass").length,
    fail: familyResults.filter((result) => result.classification === "fail").length,
    skip: familyResults.filter((result) => result.classification === "skip").length,
    coverageGap: familyResults.filter((result) => result.classification === "coverage-gap").length
  };
};

export const buildMachineReport = (run: Extract<SuiteRun, { readonly kind: "completed" }>, pinRevision: string): Test262MachineReport => {
  const families = new Set<string>();
  for (const result of run.results) {
    const family = statementFamily(result.id);
    if (family !== undefined) {
      families.add(family);
    }
  }
  return {
    pinRevision,
    nodeVersion: process.version,
    selected: run.summary.selected,
    summary: run.summary,
    families: [...families].toSorted().map((family) => summarizeFamily(family, run.results))
  };
};

export const evaluateBaseline = (report: Test262MachineReport, baseline: Test262Baseline): readonly string[] => {
  const regressions: string[] = [];
  if (report.pinRevision !== baseline.pinRevision) {
    regressions.push(`pin revision ${report.pinRevision} does not match baseline ${baseline.pinRevision}`);
  }
  if (report.summary.pass < baseline.minimumPass) {
    regressions.push(`pass count ${report.summary.pass} is below baseline minimum ${baseline.minimumPass}`);
  }
  if (report.summary.fail > baseline.maximumFail) {
    regressions.push(`failure count ${report.summary.fail} exceeds baseline maximum ${baseline.maximumFail}`);
  }
  const behaviorMismatch = report.summary.failReasons["behavior-mismatch"] ?? 0;
  if (behaviorMismatch > baseline.maximumBehaviorMismatch) {
    regressions.push(`behavior mismatch count ${behaviorMismatch} exceeds baseline maximum ${baseline.maximumBehaviorMismatch}`);
  }
  return regressions;
};
