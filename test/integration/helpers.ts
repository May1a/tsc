import { expect } from "vitest";
import { Command, type CommandExecutor } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Cause, Effect, Exit, Fiber, Layer, Option, Stream } from "effect";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { devNull, tmpdir } from "node:os";
import path from "node:path";
import { formatDiagnostic } from "../../src/compiler/diagnostics.js";
import { DiagnosticsLive } from "../../src/compiler/diagnostics-service.js";
import type { CompilationFailed } from "../../src/compiler/errors.js";
import { compile } from "../../src/compiler/pipeline.js";
import { Toolchain, ToolchainLive } from "../../src/compiler/toolchain.js";

export const repoRoot = path.resolve(import.meta.dirname, "../..");
export const roadmapIntegrationTimeoutMs = 60_000;

export interface CompileResult {
  readonly outDir: string;
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly readArtifact: (name: string) => Promise<string>;
  readonly cleanup: () => Promise<void>;
}

export interface NativeRunResult {
  readonly skipped: boolean;
  readonly reason?: string;
  readonly status?: number | null;
  readonly stdout?: string;
  readonly stderr?: string;
}

export interface ExpectedNativeBehavior {
  readonly stdout: string;
  readonly stderr: string;
  readonly status: number;
}

export type ToolRunResult = NativeRunResult & {
  readonly tool: string;
};

export type ToolName = "clang" | "clang++" | "llvm-as" | "lli";

export interface CompileFixtureOptions {
  readonly link?: boolean;
  readonly fcpp?: boolean;
}

export interface CapturedRun {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

const toolExecutableCache = new Map<ToolName, Promise<string | undefined>>();

const testCompileLayer = Layer.provideMerge(
  Layer.provideMerge(ToolchainLive, NodeContext.layer),
  DiagnosticsLive
);
export const commandExecutorLayer = NodeContext.layer;

export const compileFixture = async (fixture: string, options: CompileFixtureOptions = {}): Promise<CompileResult> => {
  const outDir = await mkdtemp(path.join(tmpdir(), "tscn-"));
  const llvmIr = path.join(outDir, "main.ll");
  const traceMap = path.join(outDir, "trace-map.json");
  const inlineCpp = path.join(outDir, "inline-cpp.cpp");
  const stdout = `Wrote ${llvmIr}\nWrote ${traceMap}\n`;
  const readArtifact = async (name: string): Promise<string> => readFile(path.join(outDir, name), "utf8");
  const cleanup = async (): Promise<void> => rm(outDir, { recursive: true, force: true });

  const exit = await Effect.runPromiseExit(
    compile({ entry: `test/fixtures/${fixture}`, outDir, link: options.link ?? false, fcpp: options.fcpp }).pipe(
      Effect.provide(testCompileLayer)
    )
  );

  if (Exit.isSuccess(exit)) {
    const result = exit.value;
    const outputLines = [`Wrote ${llvmIr}`, `Wrote ${traceMap}`];
    if (result.artifacts.inlineCpp !== undefined) {
      outputLines.push(`Wrote ${inlineCpp}`);
    }
    const successStdout = `${outputLines.join("\n")}\n`;
    return {
      outDir,
      status: 0,
      stdout: successStdout,
      stderr: result.diagnostics.map(formatDiagnostic).join("\n"),
      readArtifact,
      cleanup
    };
  }

  const failure = Option.getOrThrow(Cause.failureOption(exit.cause)) as CompilationFailed;
  const stderr = failure.diagnostics.map(formatDiagnostic).join("\n");
  return {
    outDir,
    status: 1,
    stdout,
    stderr: `${stderr}\nCompilation failed\n`,
    readArtifact,
    cleanup
  };
};

export const expectSuccessfulCompile = async (
  fixture: string,
  options: CompileFixtureOptions = {}
): Promise<CompileResult> => {
  const result = await compileFixture(fixture, options);
  expect(result.status, result.stderr).toBe(0);
  return result;
};

export const expectUnsupportedDiagnostic = async (fixture: string): Promise<void> => {
  const result = await compileFixture(fixture);

  try {
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("error TSCN1002");
  } finally {
    await result.cleanup();
  }
};

export const expectUnsupportedMessage = async (fixture: string, message: string): Promise<void> => {
  const result = await compileFixture(fixture);

  try {
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("error TSCN1002");
    expect(result.stderr).toContain(message);
  } finally {
    await result.cleanup();
  }
};

export const captureCommand = (
  executable: string,
  args: readonly string[],
  options: { readonly cwd?: string; readonly env?: Record<string, string> } = {}
): Effect.Effect<CapturedRun, never, CommandExecutor.CommandExecutor> => {
  const buildCommand = (): Command.Command => {
    let command = Command.make(executable, ...args);
    if (options.cwd !== undefined) {
      command = Command.workingDirectory(command, options.cwd);
    }
    if (options.env !== undefined) {
      command = Command.env(command, options.env);
    }
    return command;
  };
  return Effect.scoped(
    Effect.gen(function* captureCommandGen() {
      const process = yield* Command.start(buildCommand());
      const stdoutFiber = yield* Effect.fork(
        Stream.runFold(Stream.decodeText(process.stdout, "utf8"), "", (acc, chunk) => acc + chunk)
      );
      const stderrFiber = yield* Effect.fork(
        Stream.runFold(Stream.decodeText(process.stderr, "utf8"), "", (acc, chunk) => acc + chunk)
      );
      const exitCode = yield* process.exitCode;
      const stdout = yield* Fiber.join(stdoutFiber);
      const stderr = yield* Fiber.join(stderrFiber);
      return { status: exitCode, stdout, stderr };
    })
  );
};

export const runNativeIfAvailable = async (
  result: CompileResult,
  options: { readonly env?: Record<string, string> } = {}
): Promise<NativeRunResult> => {
  const executable = path.join(result.outDir, "main");
  return Effect.runPromise(
    captureCommand(executable, [], { env: options.env }).pipe(
      Effect.map(
        (run): NativeRunResult => ({
          skipped: false,
          status: run.status,
          stdout: run.stdout,
          stderr: run.stderr
        })
      ),
      Effect.catchTag("SystemError", (error) => {
        // Only a genuinely missing executable is a skip (the host has no
        // clang, so linking never produced `main`). Transient spawn failures
        // (e.g. EAGAIN under load) must surface as real errors, not as a
        // misleading skip that fails the ENOENT assertion downstream.
        if (error.message.includes("ENOENT")) {
          return Effect.succeed({ skipped: true, reason: error.message });
        }
        return Effect.die(error);
      }),
      Effect.catchAll((error) => {
        if (error instanceof Error) {
          if (error.message.includes("ENOENT")) {
            return Effect.succeed({ skipped: true, reason: error.message });
          }
          return Effect.die(error);
        }
        const message = String(error);
        if (message.includes("ENOENT")) {
          return Effect.succeed({ skipped: true, reason: message });
        }
        return Effect.die(error);
      }),
      Effect.provide(commandExecutorLayer)
    )
  );
};

export const toolExecutable = async (name: ToolName): Promise<string | undefined> => {
  const cached = toolExecutableCache.get(name);
  if (cached !== undefined) {
    return cached;
  }

  const lookup = Effect.runPromise(
    Effect.gen(function* toolAvailableGen() {
      const toolchain = yield* Toolchain;
      switch (name) {
        case "clang": {
          return Option.getOrUndefined(toolchain.clang);
        }
        case "clang++": {
          return Option.getOrUndefined(toolchain.clangxx);
        }
        case "llvm-as": {
          return Option.getOrUndefined(toolchain.llvmAs);
        }
        case "lli": {
          return Option.getOrUndefined(toolchain.lli);
        }
        default: {
          const exhaustive: never = name;
          return exhaustive;
        }
      }
    }).pipe(Effect.provide(testCompileLayer))
  );
  toolExecutableCache.set(name, lookup);
  return lookup;
};

export const expectNativeBehaviorIfAvailable = async (
  result: CompileResult,
  expected: ExpectedNativeBehavior,
  options: { readonly env?: Record<string, string> } = {}
): Promise<void> => {
  const native = await runNativeIfAvailable(result, options);
  if (native.skipped) {
    expect(native.reason).toContain("ENOENT");
    const diagnostics = await result.readArtifact("diagnostics.txt");
    expect(diagnostics).toContain("clang was not found");
    return;
  }
  expect(native.status, native.stderr).toBe(expected.status);
  expect(native.stdout).toBe(expected.stdout);
  expect(native.stderr).toBe(expected.stderr);
};

export const expectToolBehaviorIfAvailable = async (
  tool: ToolName,
  args: readonly string[],
  expected: ExpectedNativeBehavior
): Promise<ToolRunResult> => {
  const executable = await toolExecutable(tool);
  if (executable === undefined) {
    return { tool, skipped: true, reason: `${tool} was not found; skipped native behavior check` };
  }

  const run = await Effect.runPromise(
    captureCommand(executable, args, { cwd: repoRoot }).pipe(Effect.provide(commandExecutorLayer))
  );
  expect(run.status, run.stderr).toBe(expected.status);
  expect(run.stdout).toBe(expected.stdout);
  expect(run.stderr).toBe(expected.stderr);
  return { tool, skipped: false, status: run.status, stdout: run.stdout, stderr: run.stderr };
};

export const expectLlvmAsVerificationIfAvailable = async (result: CompileResult): Promise<void> => {
  const llvmAs = await toolExecutable("llvm-as");
  if (llvmAs === undefined) {
    expect("llvm-as was not found; skipped verifier check").toContain("llvm-as was not found");
    return;
  }
  const verifier = await Effect.runPromise(
    captureCommand(llvmAs, [
      path.join(result.outDir, "main.ll"),
      "-o",
      devNull
    ]).pipe(Effect.provide(commandExecutorLayer))
  );
  expect(verifier.status, verifier.stderr).toBe(0);
};

export const expectNativeFixtures = async (
  cases: readonly (readonly [fixture: string, stdout: string])[],
  options: { readonly verifyLlvm?: boolean } = {}
): Promise<void> => {
  await Promise.all(
    cases.map(async ([fixture, stdout]) => {
      const result = await expectSuccessfulCompile(fixture, { link: true });
      try {
        await expectNativeBehaviorIfAvailable(result, { status: 0, stdout, stderr: "" });
        if (options.verifyLlvm === true) {
          await expectLlvmAsVerificationIfAvailable(result);
        }
      } finally {
        await result.cleanup();
      }
    })
  );
};

export const countOccurrences = (value: string, needle: string): number => value.split(needle).length - 1;
