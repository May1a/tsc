import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { loadBaseline, loadFilters, loadPin } from "./config.js";
import { verifyCheckout } from "./fetch.js";
import { defaultCacheDir, defaultCheckoutDir } from "./paths.js";
import { buildMachineReport, evaluateBaseline, formatReport, runFilteredSuite } from "./runner.js";
import type { Classification } from "./types.js";

export interface RunArguments {
  readonly pathPrefixes: readonly string[];
  readonly classification?: Classification;
  readonly jsonPath?: string;
  readonly baselinePath?: string;
}

const parseClassification = (value: string | undefined): Classification | undefined => {
  if (value === "pass" || value === "fail" || value === "skip" || value === "coverage-gap") {
    return value;
  }
  return undefined;
};

// eslint-disable-next-line max-statements -- Sequential option parsing keeps missing-value errors local to each flag.
export const parseRunArguments = (argv: readonly string[]): RunArguments => {
  const pathPrefixes: string[] = [];
  let classification: Classification | undefined = undefined;
  let jsonPath: string | undefined = undefined;
  let baselinePath: string | undefined = undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv.at(index);
    const value = argv.at(index + 1);
    if (argument === "--path") {
      if (value === undefined || value.startsWith("--")) {
        throw new Error("--path requires a Test262 path prefix");
      }
      pathPrefixes.push(value.replace(/\/$/, ""));
      index += 1;
      continue;
    }
    if (argument === "--classification") {
      const parsed = parseClassification(value);
      if (parsed === undefined) {
        let display = "missing";
        if (value !== undefined) {
          display = value;
        }
        throw new Error(`invalid --classification: ${display}`);
      }
      classification = parsed;
      index += 1;
      continue;
    }
    if (argument === "--json") {
      if (value === undefined || value.startsWith("--")) {
        throw new Error("--json requires an output path, or '-' for stdout");
      }
      jsonPath = value;
      index += 1;
      continue;
    }
    if (argument === "--baseline") {
      if (value === undefined || value.startsWith("--")) {
        throw new Error("--baseline requires a baseline JSON path");
      }
      baselinePath = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown test262 argument: ${argument ?? "missing"}`);
  }
  if (baselinePath !== undefined && pathPrefixes.length > 0) {
    throw new Error("--baseline cannot be combined with --path because baselines describe the full filtered suite");
  }
  return { pathPrefixes, classification, jsonPath, baselinePath };
};

// eslint-disable-next-line max-statements -- The CLI keeps verification, reporting, and exit-code ordering explicit.
const main = async (): Promise<number> => {
  const args = parseRunArguments(process.argv.slice(2));
  const pin = await loadPin();
  const verification = await verifyCheckout(defaultCacheDir, pin.revision);
  if (verification === "missing") {
    process.stdout.write(
      `SKIP Test262 checkout not found at ${defaultCheckoutDir}; run \`npm run test262:fetch\` to download the pinned suite\n`
    );
    return 0;
  }
  if (verification === "mismatch") {
    process.stderr.write(
      `Test262 checkout at ${defaultCheckoutDir} does not match pinned revision ${pin.revision}; run \`npm run test262:fetch\` to repair it\n`
    );
    return 1;
  }
  const filters = await loadFilters();
  const { baselinePath, classification, jsonPath, pathPrefixes: requestedPathPrefixes } = args;
  let pathPrefixes: readonly string[] | undefined = undefined;
  if (requestedPathPrefixes.length > 0) {
    pathPrefixes = requestedPathPrefixes;
  }
  const run = await runFilteredSuite({
    suiteRoot: defaultCheckoutDir,
    filters,
    pathPrefixes
  });
  if (jsonPath !== "-") {
    process.stdout.write(formatReport(run, { classification }));
  }
  let machineReport: ReturnType<typeof buildMachineReport> | undefined = undefined;
  if (run.kind === "completed") {
    machineReport = buildMachineReport(run, pin.revision);
  }
  if (jsonPath !== undefined && machineReport !== undefined) {
    const json = `${JSON.stringify(machineReport, undefined, 2)}\n`;
    if (jsonPath === "-") {
      process.stdout.write(json);
    } else {
      await writeFile(jsonPath, json);
    }
  }
  if (baselinePath !== undefined && machineReport !== undefined) {
    const baseline = await loadBaseline(baselinePath);
    const regressions = evaluateBaseline(machineReport, baseline);
    if (regressions.length > 0) {
      process.stderr.write(`${regressions.map((regression) => `BASELINE REGRESSION: ${regression}`).join("\n")}\n`);
      return 1;
    }
    process.stdout.write("Baseline: no regressions\n");
    return 0;
  }
  if (run.kind === "completed" && run.summary.fail > 0) {
    return 1;
  }
  return 0;
};

const entryPoint = process.argv.at(1);
const isMainModule = entryPoint !== undefined && import.meta.url === pathToFileURL(entryPoint).href;

if (isMainModule) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      // eslint-disable-next-line unicorn/no-useless-undefined -- init-declarations requires explicit initializer
      let message: string | undefined = undefined;
      if (error instanceof Error) {
        ({ message } = error);
      } else {
        message = String(error);
      }
      process.stderr.write(`test262 run failed: ${message}\n`);
      process.exitCode = 1;
    });
}
