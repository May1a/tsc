import { NodeContext } from "@effect/platform-node";
import { Cause, Effect, Exit, Layer, Option } from "effect";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { formatDiagnostic } from "../compiler/diagnostics.js";
import { DiagnosticsLive } from "../compiler/diagnostics-service.js";
import { CompilationFailed } from "../compiler/errors.js";
import { compile } from "../compiler/pipeline.js";
import { ToolchainLive } from "../compiler/toolchain.js";
import {
  type ObservedBehavior,
  behaviorsEqual,
  nativeBehavior,
  nodeBehavior,
  nodeScriptWrapperSource,
  nodeWrapperSource
} from "./behavior.js";
import { repoRoot } from "./paths.js";
import { assembleEntry, assembledTsConfig, missingThrowMarker, unexpectedThrowMarker } from "./prelude.js";
import { type CapturedProcess, captureProcessWithTimeout } from "./process.js";
import type { Classification, SelectedTest, TestCaseResult } from "./types.js";

const compileLayer = Layer.provideMerge(
  Layer.provideMerge(ToolchainLive, NodeContext.layer),
  DiagnosticsLive
);

const unsupportedFeatureCode = "TSCN1002";
const missingClangMarker = "clang was not found";

export interface ExecuteTestOptions {
  readonly timeoutMs: number;
  readonly keepArtifactsOnFailure: boolean;
  readonly workDirRoot?: string;
}

type CompileOutcome =
  | { readonly kind: "compiled"; readonly executable?: string; readonly diagnostics: string }
  | { readonly kind: "failed"; readonly diagnostics: string };

const runCompile = async (entry: string, outDir: string, suppressSemanticDiagnostics: boolean): Promise<CompileOutcome> => {
  const exit = await Effect.runPromiseExit(
    compile({ entry, outDir, link: true, suppressSemanticDiagnostics }).pipe(Effect.provide(compileLayer))
  );
  if (Exit.isSuccess(exit)) {
    return {
      kind: "compiled",
      executable: exit.value.artifacts.executable,
      diagnostics: exit.value.diagnostics.map(formatDiagnostic).join("\n")
    };
  }
  const failure = Cause.failureOption(exit.cause);
  if (Option.isSome(failure) && failure.value instanceof CompilationFailed) {
    return { kind: "failed", diagnostics: failure.value.diagnostics.map(formatDiagnostic).join("\n") };
  }
  return { kind: "failed", diagnostics: Cause.pretty(exit.cause) };
};

interface OutcomeContext {
  readonly test: SelectedTest;
  readonly workDir: string;
  readonly outDir: string;
  readonly options: ExecuteTestOptions;
}

const conclude = async (context: OutcomeContext, result: TestCaseResult): Promise<TestCaseResult> => {
  if (result.classification === "fail" && context.options.keepArtifactsOnFailure) {
    return { ...result, artifactsDir: context.outDir };
  }
  await rm(context.workDir, { recursive: true, force: true });
  return result;
};

const result = (test: SelectedTest, classification: Classification, reason?: string, detail?: string): TestCaseResult => ({
  id: test.id,
  classification,
  reason,
  detail
});

const mismatchDetail = (outDir: string, native: ObservedBehavior, node: ObservedBehavior, nativeRun: CapturedProcess): string => {
  const sections = [
    `Native behavior: ${JSON.stringify(native)}`,
    `Node behavior: ${JSON.stringify(node)}`
  ];
  if (nativeRun.termination !== undefined) {
    sections.push(`Native termination: ${nativeRun.termination}`);
  }
  sections.push(`Artifacts: ${outDir}`);
  return sections.join("\n");
};

const hasOutputLine = (behavior: ObservedBehavior, line: string): boolean => behavior.stdout.split("\n").includes(line);

const runtimeNegativeFailure = (
  test: SelectedTest,
  outDir: string,
  native: ObservedBehavior,
  node: ObservedBehavior
): TestCaseResult | undefined => {
  if (test.expectation.kind !== "negative-runtime") {
    return undefined;
  }
  const detail = `Expected a runtime ${test.expectation.errorName}\nNative behavior: ${JSON.stringify(native)}\nNode behavior: ${JSON.stringify(node)}\nArtifacts: ${outDir}`;
  if (hasOutputLine(native, missingThrowMarker) || hasOutputLine(node, missingThrowMarker)) {
    return result(test, "fail", "runtime-negative-missing-throw", detail);
  }
  if (hasOutputLine(native, unexpectedThrowMarker) || hasOutputLine(node, unexpectedThrowMarker)) {
    return result(test, "fail", "runtime-negative-wrong-error", detail);
  }
  return undefined;
};

const runAndCompare = async (context: OutcomeContext, executable: string): Promise<TestCaseResult> => {
  const { test, outDir, options } = context;
  const entry = path.join(context.workDir, "entry.ts");
  const nativeRun = await captureProcessWithTimeout(executable, [], { timeoutMs: options.timeoutMs });
  if (nativeRun.timedOut) {
    return result(test, "fail", "timeout", `Native execution exceeded ${options.timeoutMs}ms and was killed\nArtifacts: ${outDir}`);
  }
  let nodeArguments = ["--input-type=commonjs", "--eval", nodeScriptWrapperSource, entry];
  if (test.parseGoal === "module") {
    nodeArguments = ["--input-type=module", "--eval", nodeWrapperSource, pathToFileURL(entry).href];
  }
  const nodeRun = await captureProcessWithTimeout(
    process.execPath,
    nodeArguments,
    { cwd: repoRoot, timeoutMs: options.timeoutMs }
  );
  if (nodeRun.timedOut) {
    return result(test, "fail", "timeout", `Node oracle execution exceeded ${options.timeoutMs}ms and was killed\nArtifacts: ${outDir}`);
  }
  const native = nativeBehavior(nativeRun);
  const node = nodeBehavior(nodeRun);
  const negativeFailure = runtimeNegativeFailure(test, outDir, native, node);
  if (negativeFailure !== undefined) {
    return negativeFailure;
  }
  if (!behaviorsEqual(native, node)) {
    return result(test, "fail", "behavior-mismatch", mismatchDetail(outDir, native, node, nativeRun));
  }
  return result(test, "pass");
};

const classifyCompileFailure = (test: SelectedTest, diagnostics: string): TestCaseResult => {
  if (test.expectation.kind === "negative-compile") {
    return result(test, "pass");
  }
  if (diagnostics.includes(unsupportedFeatureCode)) {
    return result(test, "coverage-gap", "compiler-unsupported", `Compiler rejected the test as unsupported:\n${diagnostics}`);
  }
  return result(test, "fail", "compile-failure", `Unexpected compile failure:\n${diagnostics}`);
};

/**
 * Executes one selected test through the real compile-and-run pipeline and
 * classifies the outcome. Positive and runtime-negative tests compare observed
 * behavior against Node; parse/early negatives expect a compile-time
 * rejection. Failing tests keep their build directory for debugging.
 */
export const executeTest = async (test: SelectedTest, options: ExecuteTestOptions): Promise<TestCaseResult> => {
  const workDir = await mkdtemp(path.join(options.workDirRoot ?? tmpdir(), "tscn-t262-"));
  const outDir = path.join(workDir, "out");
  const context: OutcomeContext = { test, workDir, outDir, options };
  const entry = path.join(workDir, "entry.ts");
  await writeFile(entry, assembleEntry(test.source, test.expectation));
  await writeFile(path.join(workDir, "tsconfig.json"), assembledTsConfig);
  const outcome = await runCompile(entry, outDir, test.expectation.kind !== "negative-compile");
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "diagnostics.txt"), outcome.diagnostics);
  if (outcome.kind === "failed") {
    return conclude(context, classifyCompileFailure(test, outcome.diagnostics));
  }
  if (test.expectation.kind === "negative-compile") {
    return conclude(
      context,
      result(test, "fail", "expected-rejection-missing", "Expected a compile-time rejection but the test compiled successfully")
    );
  }
  if (outcome.executable === undefined || outcome.diagnostics.includes(missingClangMarker)) {
    return conclude(context, result(test, "skip", "missing-toolchain", "clang was not found; native execution skipped"));
  }
  return conclude(context, await runAndCompare(context, outcome.executable));
};
