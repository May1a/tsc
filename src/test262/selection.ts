import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parseFrontmatter } from "./frontmatter.js";
import type { Expectation, HarnessFilters, ParseGoal, SelectedTest, TestCaseResult, Test262Frontmatter } from "./types.js";

// Flags Test262 uses that do not change how the harness assembles a test.
const benignFlags = new Set(["noStrict", "onlyStrict", "generated", "CanBlockIsFalse", "CanBlockIsTrue"]);
const recognizedFlags = new Set([...benignFlags, "module"]);

// Negative phases that must be rejected while compiling, before any execution.
const compileTimeNegativePhases = new Set(["parse", "early", "resolution"]);

const errorNamePattern = /^[A-Za-z][A-Za-z0-9]*$/;
const fixtureFileSuffix = "_FIXTURE.js";
const testTreeRoot = "language";

const matchesPrefix = (id: string, prefix: string): boolean => id === prefix || id.startsWith(`${prefix}/`);

const matchesGroup = (id: string, group: { readonly include: readonly string[]; readonly exclude: readonly string[] }): boolean =>
  group.include.some((include) => matchesPrefix(id, include)) && !group.exclude.some((exclude) => matchesPrefix(id, exclude));

const isSelected = (id: string, filters: HarnessFilters): boolean => filters.groups.some((group) => matchesGroup(id, group));

const walkTestFiles = async (directory: string, prefix: string): Promise<readonly string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  const directoryPromises: Promise<readonly string[]>[] = [];
  for (const entry of entries) {
    let relative: string;
    if (prefix === "") {
      relative = entry.name;
    } else {
      relative = `${prefix}/${entry.name}`;
    }
    if (entry.isDirectory()) {
      directoryPromises.push(walkTestFiles(path.join(directory, entry.name), relative));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(relative);
    }
  }
  const nested = await Promise.all(directoryPromises);
  for (const result of nested) {
    files.push(...result);
  }
  return files;
};

const classifyFlags = (flags: readonly string[], filters: HarnessFilters): string | undefined => {
  for (const flag of flags) {
    if (filters.unsupportedFlags.includes(flag) || !recognizedFlags.has(flag)) {
      return `unsupported-flag:${flag}`;
    }
  }
  return undefined;
};

const classifyNegative = (negative: Test262Frontmatter["negative"]): Expectation | string => {
  if (negative === undefined) {
    return { kind: "positive" };
  }
  if (compileTimeNegativePhases.has(negative.phase)) {
    return { kind: "negative-compile" };
  }
  if (negative.phase === "runtime") {
    if (!errorNamePattern.test(negative.type)) {
      return "invalid-frontmatter";
    }
    return { kind: "negative-runtime", errorName: negative.type };
  }
  return `unsupported-negative-phase:${negative.phase}`;
};

type Classification =
  | { readonly kind: "selected"; readonly expectation: Expectation; readonly parseGoal: ParseGoal }
  | { readonly kind: "skipped"; readonly reason: string };

const classifyTest = (id: string, source: string, filters: HarnessFilters): Classification => {
  if (id.endsWith(fixtureFileSuffix)) {
    return { kind: "skipped", reason: "fixture-file" };
  }
  if (!isSelected(id, filters)) {
    return { kind: "skipped", reason: "filtered-out" };
  }
  const frontmatter = parseFrontmatter(source);
  if (frontmatter === undefined) {
    return { kind: "skipped", reason: "invalid-frontmatter" };
  }
  let parseGoal: ParseGoal = "script";
  if (frontmatter.flags.includes("module")) {
    parseGoal = "module";
  }
  const flagReason = classifyFlags(frontmatter.flags, filters);
  if (flagReason !== undefined) {
    return { kind: "skipped", reason: flagReason };
  }
  const unsupportedFeature = frontmatter.features.find((feature) => filters.unsupportedFeatures.includes(feature));
  if (unsupportedFeature !== undefined) {
    return { kind: "skipped", reason: `unsupported-feature:${unsupportedFeature}` };
  }
  const unsupportedInclude = frontmatter.includes.find((include) => !filters.supportedIncludes.includes(include));
  if (unsupportedInclude !== undefined) {
    return { kind: "skipped", reason: `unsupported-include:${unsupportedInclude}` };
  }
  const expectation = classifyNegative(frontmatter.negative);
  if (typeof expectation === "string") {
    return { kind: "skipped", reason: expectation };
  }
  return { kind: "selected", expectation, parseGoal };
};

export type Selection = {
  readonly selected: readonly SelectedTest[];
  readonly skipped: readonly TestCaseResult[];
};

/**
 * Walks `suiteRoot/test/language` and classifies every test file against the
 * declarative filters: selected tests carry their expectation forward, and
 * every other file is recorded as a skip with a machine-stable reason.
 */
export const selectTests = async (suiteRoot: string, filters: HarnessFilters): Promise<Selection> => {
  const languageRoot = path.join(suiteRoot, "test", testTreeRoot);
  const unsortedFiles = await walkTestFiles(languageRoot, testTreeRoot);
  const files = unsortedFiles.toSorted();
  const selected: SelectedTest[] = [];
  const skipped: TestCaseResult[] = [];
  const sources = await Promise.all(
    files.map(async (id) => {
      const filePath = path.join(suiteRoot, "test", ...id.split("/"));
      const source = await readFile(filePath, "utf8");
      return { id, filePath, source };
    })
  );
  for (const { id, filePath, source } of sources) {
    const classification = classifyTest(id, source, filters);
    if (classification.kind === "selected") {
      selected.push({
        id,
        filePath,
        source,
        expectation: classification.expectation,
        parseGoal: classification.parseGoal
      });
      continue;
    }
    skipped.push({ id, classification: "skip", reason: classification.reason });
  }
  return { selected, skipped };
};
