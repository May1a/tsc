import { expect } from "vitest";
import { Effect } from "effect";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { TraceMapModule, TraceMapOperation, TraceMapV1 } from "../../src/compiler/trace.js";
import { type ObservedBehavior, nativeBehavior, nodeBehavior, nodeModuleWrapperSource } from "../../src/testing/process-behavior.js";
import {
  type CapturedRun,
  type CompileResult,
  captureCommand,
  commandExecutorLayer,
  compileFixture,
  expectLlvmAsVerificationIfAvailable,
  repoRoot,
  runNativeIfAvailable
} from "./helpers.js";

export interface OracleOptions {
  readonly verifyLlvm?: boolean;
  readonly keepArtifactsOnFailure?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTraceMapModule(value: unknown): value is TraceMapModule {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.fileName === "string" &&
    typeof value.statementCount === "number" &&
    value.loweringMode === "native" &&
    Array.isArray(value.operationIds) &&
    value.operationIds.every((id) => typeof id === "string");
}

function isTraceMapOperation(value: unknown): value is TraceMapOperation {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.moduleId === "string" &&
    typeof value.kind === "string" &&
    (value.origin === "source" || value.origin === "synthesized") &&
    Array.isArray(value.llvmRanges);
}

function parseTraceMap(contents: string): TraceMapV1 {
  const value: unknown = JSON.parse(contents);
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.entry !== "string" ||
    !Array.isArray(value.modules) ||
    !Array.isArray(value.operations)
  ) {
    throw new Error("trace-map.json does not match the TraceMapV1 envelope");
  }
  if (!value.modules.every(isTraceMapModule)) {
    throw new Error("trace-map.json contains an invalid module record");
  }
  if (!value.operations.every(isTraceMapOperation)) {
    throw new Error("trace-map.json contains an invalid operation record");
  }
  return {
    version: 1,
    entry: value.entry,
    modules: value.modules,
    operations: value.operations
  };
}

async function runFixtureWithNode(fixture: string): Promise<CapturedRun> {
  const fixtureUrl = pathToFileURL(path.join(repoRoot, "test/fixtures", fixture)).href;
  return Effect.runPromise(
    captureCommand(process.execPath, ["--input-type=module", "--eval", nodeModuleWrapperSource, fixtureUrl], { cwd: repoRoot }).pipe(
      Effect.provide(commandExecutorLayer)
    )
  );
}

function formatFailure(
  fixture: string,
  outDir: string,
  native: ObservedBehavior | undefined,
  node: ObservedBehavior | undefined
): string {
  const sections = [
    `Correctness oracle failed for ${fixture}`,
    `Native behavior:\n${JSON.stringify(native, undefined, 2)}`,
    `Node behavior:\n${JSON.stringify(node, undefined, 2)}`,
    `main.ll: ${path.join(outDir, "main.ll")}`,
    `trace-map.json: ${path.join(outDir, "trace-map.json")}`
  ];
  return sections.join("\n\n");
}

function compilerIsAvailable(result: CompileResult, failureMessage: string): boolean {
  if (result.status === 0) {
    return true;
  }
  if (result.stderr.includes("clang was not found")) {
    expect(result.stderr).toContain("clang was not found");
    return false;
  }
  throw new Error(failureMessage);
}

export async function expectNativeMatchesNodeIfAvailable(
  fixture: string,
  options: OracleOptions = {}
): Promise<void> {
  const keepArtifactsOnFailure = options.keepArtifactsOnFailure ?? true;
  const result = await compileFixture(fixture, { link: true });
  let succeeded = false;
  let native: ObservedBehavior | undefined;
  let node: ObservedBehavior | undefined;

  try {
    if (!compilerIsAvailable(result, formatFailure(fixture, result.outDir, native, node))) {
      succeeded = true;
      return;
    }

    // Every module must lower natively; the compiler no longer has a
    // compile-time fallback mode, so the trace-map envelope rejects anything
    // but `loweringMode: "native"`.
    parseTraceMap(await result.readArtifact("trace-map.json"));

    const nativeRun = await runNativeIfAvailable(result);
    if (nativeRun.skipped) {
      expect(nativeRun.reason).toContain("ENOENT");
      expect(await result.readArtifact("diagnostics.txt")).toContain("clang was not found");
      succeeded = true;
      return;
    }
    native = nativeBehavior({
      status: nativeRun.status ?? -1,
      stdout: nativeRun.stdout ?? "",
      stderr: nativeRun.stderr ?? ""
    });
    node = nodeBehavior(await runFixtureWithNode(fixture));
    expect(native, formatFailure(fixture, result.outDir, native, node)).toEqual(node);

    if (options.verifyLlvm === true) {
      await expectLlvmAsVerificationIfAvailable(result);
    }
    succeeded = true;
  } finally {
    if (succeeded || !keepArtifactsOnFailure) {
      await result.cleanup();
    }
  }
}
