import { expect } from "vitest";
import { Effect } from "effect";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { TraceMapV1 } from "../../src/compiler/trace.js";
import {
  captureCommand,
  commandExecutorLayer,
  compileFixture,
  expectLlvmAsVerificationIfAvailable,
  repoRoot,
  runNativeIfAvailable,
  type CapturedRun,
  type CompileResult
} from "./helpers.js";

export type ThrownObservation =
  | {
      readonly kind: "error";
      readonly name: string;
      readonly message: string;
    }
  | {
      readonly kind: "value";
      readonly display: string;
    };

export interface ObservedBehavior {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly thrown?: ThrownObservation;
}

export interface OracleOptions {
  readonly verifyLlvm?: boolean;
  readonly keepArtifactsOnFailure?: boolean;
}

const thrownSentinel = "__TSCN_NODE_THROWN_V1__";
const nodeWrapper = `
globalThis.print = (value) => {
  process.stdout.write(String(value) + "\\n");
};
try {
  await import(process.argv[1]);
} catch (thrown) {
  const payload = thrown instanceof Error
    ? { kind: "error", name: thrown.name, message: thrown.message }
    : { kind: "value", display: String(thrown) };
  process.stderr.write(${JSON.stringify(thrownSentinel)} + JSON.stringify(payload) + "\\n");
  process.exitCode = 1;
}
`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTraceMapModule(value: unknown): boolean {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.fileName === "string" &&
    typeof value.statementCount === "number" &&
    value.loweringMode === "native" &&
    Array.isArray(value.operationIds) &&
    value.operationIds.every((id) => typeof id === "string");
}

function isTraceMapOperation(value: unknown): boolean {
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
  return value as TraceMapV1;
}

async function runFixtureWithNode(fixture: string): Promise<CapturedRun> {
  const fixtureUrl = pathToFileURL(path.join(repoRoot, "test/fixtures", fixture)).href;
  return Effect.runPromise(
    captureCommand(process.execPath, ["--input-type=module", "--eval", nodeWrapper, fixtureUrl], { cwd: repoRoot }).pipe(
      Effect.provide(commandExecutorLayer)
    )
  );
}

function nodeBehavior(run: CapturedRun): ObservedBehavior {
  const terminalRecord = new RegExp(`(?:^|\\n)${thrownSentinel}([^\\n]+)\\n$`);
  const match = terminalRecord.exec(run.stderr);
  if (match === null) {
    return { exitCode: run.status, stdout: run.stdout, stderr: run.stderr };
  }
  const thrown = JSON.parse(match[1]) as ThrownObservation;
  let sentinelStart = match.index;
  if (match[0].startsWith("\n")) {
    sentinelStart += 1;
  }
  return {
    exitCode: run.status,
    stdout: run.stdout,
    stderr: run.stderr.slice(0, sentinelStart),
    thrown
  };
}

function nativeBehavior(run: { readonly status: number; readonly stdout: string; readonly stderr: string }): ObservedBehavior {
  if (run.status !== 1 || !run.stdout.endsWith("\n")) {
    return { exitCode: run.status, stdout: run.stdout, stderr: run.stderr };
  }
  const withoutTerminalNewline = run.stdout.slice(0, -1);
  const previousNewline = withoutTerminalNewline.lastIndexOf("\n");
  const display = withoutTerminalNewline.slice(previousNewline + 1);
  let stdout = "";
  if (previousNewline !== -1) {
    stdout = withoutTerminalNewline.slice(0, previousNewline + 1);
  }
  const error = /^([A-Za-z_$][\w$]*Error|Error):(?: (.*))?$/.exec(display);
  let thrown: ThrownObservation = { kind: "value", display };
  if (error !== null) {
    thrown = { kind: "error", name: error[1], message: error[2] || "" };
  }
  return { exitCode: run.status, stdout, stderr: run.stderr, thrown };
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
  let native: ObservedBehavior | undefined = undefined;
  let node: ObservedBehavior | undefined = undefined;

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
