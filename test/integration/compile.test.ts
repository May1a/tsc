import { describe, expect, test } from "bun:test";
import { Command, type CommandExecutor } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Cause, Effect, Exit, Fiber, Layer, Option, Stream } from "effect";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { formatDiagnostic } from "../../src/compiler/diagnostics.js";
import { DiagnosticsLive } from "../../src/compiler/diagnostics-service.js";
import type { CompilationFailed } from "../../src/compiler/errors.js";
import { compile } from "../../src/compiler/pipeline.js";
import { Toolchain, ToolchainLive } from "../../src/compiler/toolchain.js";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const roadmapIntegrationTimeoutMs = 60_000;

type CompileResult = {
  readonly outDir: string;
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly readArtifact: (name: string) => Promise<string>;
  readonly cleanup: () => Promise<void>;
};

type NativeRunResult = {
  readonly skipped: boolean;
  readonly reason?: string;
  readonly status?: number | null;
  readonly stdout?: string;
  readonly stderr?: string;
};

type ExpectedNativeBehavior = {
  readonly stdout: string;
  readonly stderr: string;
  readonly status: number;
};

type ToolRunResult = NativeRunResult & {
  readonly tool: string;
};

type ToolName = "clang" | "llvm-as" | "lli";

type CompileFixtureOptions = {
  readonly link?: boolean;
};

const testCompileLayer = Layer.provideMerge(
  Layer.provideMerge(ToolchainLive, NodeContext.layer),
  DiagnosticsLive
);

const compileFixture = async (fixture: string, options: CompileFixtureOptions = {}): Promise<CompileResult> => {
  const outDir = await mkdtemp(path.join(tmpdir(), "tscn-"));
  const llvmIr = path.join(outDir, "main.ll");
  const traceMap = path.join(outDir, "trace-map.json");
  const stdout = `Wrote ${llvmIr}\nWrote ${traceMap}\n`;
  const readArtifact = async (name: string): Promise<string> => readFile(path.join(outDir, name), "utf8");
  const cleanup = async (): Promise<void> => rm(outDir, { recursive: true, force: true });

  const exit = await Effect.runPromiseExit(
    compile({ entry: `test/fixtures/${fixture}`, outDir, link: options.link ?? false }).pipe(
      Effect.provide(testCompileLayer)
    )
  );

  if (Exit.isSuccess(exit)) {
    const result = exit.value;
    return {
      outDir,
      status: 0,
      stdout,
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

const expectSuccessfulCompile = async (
  fixture: string,
  options: CompileFixtureOptions = {}
): Promise<CompileResult> => {
  const result = await compileFixture(fixture, options);
  expect(result.status, result.stderr).toBe(0);
  return result;
};

const expectUnsupportedDiagnostic = async (fixture: string): Promise<void> => {
  const result = await compileFixture(fixture);

  try {
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("error TSCN1002");
  } finally {
    await result.cleanup();
  }
};

const expectUnsupportedMessage = async (fixture: string, message: string): Promise<void> => {
  const result = await compileFixture(fixture);

  try {
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("error TSCN1002");
    expect(result.stderr).toContain(message);
  } finally {
    await result.cleanup();
  }
};

type CapturedRun = {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
};

const captureCommand = (
  executable: string,
  args: readonly string[],
  options: { readonly cwd?: string } = {}
): Effect.Effect<CapturedRun, never, CommandExecutor.CommandExecutor> => {
  const buildCommand = (): Command.Command => {
    if (options.cwd === undefined) {
      return Command.make(executable, ...args);
    }
    return Command.workingDirectory(Command.make(executable, ...args), options.cwd);
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

const runNativeIfAvailable = async (result: CompileResult): Promise<NativeRunResult> => {
  const executable = path.join(result.outDir, "main");
  return Effect.runPromise(
    captureCommand(executable, []).pipe(
      Effect.map(
        (run): NativeRunResult => ({
          skipped: false,
          status: run.status,
          stdout: run.stdout,
          stderr: run.stderr
        })
      ),
      Effect.catchTag("SystemError", (error) =>
        Effect.succeed({ skipped: true, reason: error.message })
      ),
      Effect.catchAll((error) => {
        if (error instanceof Error) {
          return Effect.succeed({ skipped: true, reason: error.message });
        }
        return Effect.succeed({ skipped: true, reason: String(error) });
      }),
      Effect.provide(testCompileLayer)
    )
  );
};

const toolExecutable = async (name: ToolName): Promise<string | undefined> =>
  Effect.runPromise(
    Effect.gen(function* toolAvailableGen() {
      const toolchain = yield* Toolchain;
      switch (name) {
        case "clang": {
          return Option.getOrUndefined(toolchain.clang);
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

const expectNativeBehaviorIfAvailable = async (
  result: CompileResult,
  expected: ExpectedNativeBehavior
): Promise<void> => {
  const native = await runNativeIfAvailable(result);
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

const expectToolBehaviorIfAvailable = async (
  tool: ToolName,
  args: readonly string[],
  expected: ExpectedNativeBehavior
): Promise<ToolRunResult> => {
  const executable = await toolExecutable(tool);
  if (executable === undefined) {
    return { tool, skipped: true, reason: `${tool} was not found; skipped native behavior check` };
  }

  const run = await Effect.runPromise(
    captureCommand(executable, args, { cwd: repoRoot }).pipe(Effect.provide(testCompileLayer))
  );
  expect(run.status, run.stderr).toBe(expected.status);
  expect(run.stdout).toBe(expected.stdout);
  expect(run.stderr).toBe(expected.stderr);
  return { tool, skipped: false, status: run.status, stdout: run.stdout, stderr: run.stderr };
};

const expectLlvmAsVerificationIfAvailable = async (result: CompileResult): Promise<void> => {
  const llvmAs = await toolExecutable("llvm-as");
  if (llvmAs === undefined) {
    expect("llvm-as was not found; skipped verifier check").toContain("llvm-as was not found");
    return;
  }
  const verifier = await Effect.runPromise(
    captureCommand(llvmAs, [
      path.join(result.outDir, "main.ll"),
      "-o",
      path.join(result.outDir, "main.bc")
    ]).pipe(Effect.provide(testCompileLayer))
  );
  expect(verifier.status, verifier.stderr).toBe(0);
};

const expectNativeFixtures = async (
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

const countOccurrences = (value: string, needle: string): number => value.split(needle).length - 1;

// eslint-disable-next-line max-statements -- CLI coverage intentionally groups diagnostics and smoke tests.
describe("tscn CLI", () => {
  test("lowers top-level print string calls to LLVM IR", async () => {
    const result = await expectSuccessfulCompile("hello.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("declare i32 @puts(ptr)");
      expect(llvmIr).toContain(String.raw`c"hello from tscn\00"`);
      expect(llvmIr).toContain("call i32 @puts(ptr @.str.0)");
    } finally {
      await result.cleanup();
    }
  });

  test("runs emitted native executable when clang is available", async () => {
    const result = await expectSuccessfulCompile("hello.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "hello from tscn\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("verifies emitted LLVM IR when llvm-as is available", async () => {
    const result = await expectSuccessfulCompile("hello.ts");

    try {
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("writes a trace map for emitted modules", async () => {
    const result = await expectSuccessfulCompile("hello.ts");

    try {
      const traceMap = JSON.parse(await result.readArtifact("trace-map.json")) as { readonly modules: readonly unknown[] };
      expect(traceMap.modules).toHaveLength(1);
    } finally {
      await result.cleanup();
    }
  });

  test("loads project-local ES module imports as one native bundle", async () => {
    const result = await expectSuccessfulCompile("entry-with-import.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain(String.raw`c"from imported module\00"`);
      expect(llvmIr).toContain(String.raw`c"from entry module\00"`);
    } finally {
      await result.cleanup();
    }
  });

  test("ignores type-only declarations while lowering executable statements", async () => {
    const result = await expectSuccessfulCompile("entry-with-import.ts");

    try {
      const diagnostics = await result.readArtifact("diagnostics.txt");
      expect(diagnostics).not.toContain("TSCN1002");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers top-level const string bindings used by print", async () => {
    const result = await expectSuccessfulCompile("const-string.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain(String.raw`c"from const string\00"`);
      expect(llvmIr).toContain("call i32 @puts(ptr @.str.0)");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers no-substitution template literals as strings", async () => {
    const result = await expectSuccessfulCompile("const-template.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain(String.raw`c"from template literal\00"`);
    } finally {
      await result.cleanup();
    }
  });

  test("lowers number literals used by print", async () => {
    const result = await expectSuccessfulCompile("number-literal.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("declare i32 @printf(ptr, ...)");
      expect(llvmIr).toContain(String.raw`c"%g\0A\00"`);
      expect(llvmIr).toContain("call i32 (ptr, ...) @printf(ptr @.fmt.number, double 42.0)");
    } finally {
      await result.cleanup();
    }
  });

  test("preserves numeric expression shape in print calls", async () => {
    const result = await expectSuccessfulCompile("number-expression-print.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%num.0 = fadd double 1.0, 2.0");
      expect(llvmIr).toContain("call i32 (ptr, ...) @printf(ptr @.fmt.number, double %num.0)");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers top-level const number bindings used by print", async () => {
    const result = await expectSuccessfulCompile("const-number.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("call i32 (ptr, ...) @printf(ptr @.fmt.number, double 42.0)");
    } finally {
      await result.cleanup();
    }
  });

  test("preserves numeric expression shape in const number bindings used by print", async () => {
    const result = await expectSuccessfulCompile("const-number-addition.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%num.0 = fadd double 40.0, 2.0");
      expect(llvmIr).toContain("call i32 (ptr, ...) @printf(ptr @.fmt.number, double %num.0)");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers boolean literals used by print", async () => {
    const result = await expectSuccessfulCompile("boolean-literal.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain(String.raw`c"true\00"`);
      expect(llvmIr).toContain("call i32 @puts(ptr @.str.0)");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers top-level const boolean bindings used by print", async () => {
    const result = await expectSuccessfulCompile("const-boolean.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain(String.raw`c"false\00"`);
      expect(llvmIr).toContain("call i32 @puts(ptr @.str.0)");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers string concatenation in top-level const bindings used by print", async () => {
    const result = await expectSuccessfulCompile("const-string-concat.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain(String.raw`c"hello, world\00"`);
      expect(llvmIr).toContain("call i32 @puts(ptr @.str.0)");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers top-level if statements with const boolean conditions", async () => {
    const result = await expectSuccessfulCompile("if-const-true.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("br i1 true, label %if.then.0, label %if.end.0");
      expect(llvmIr).toContain("if.then.0:");
      expect(llvmIr).toContain(String.raw`c"enabled\00"`);
      expect(llvmIr).toContain("call i32 @puts(ptr @.str.0)");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers top-level if else statements with const boolean conditions", async () => {
    const result = await expectSuccessfulCompile("if-const-false-else.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("br i1 false, label %if.then.0, label %if.else.0");
      expect(llvmIr).toContain("if.then.0:");
      expect(llvmIr).toContain("if.else.0:");
      expect(llvmIr).toContain(String.raw`c"enabled\00"`);
      expect(llvmIr).toContain(String.raw`c"disabled\00"`);
    } finally {
      await result.cleanup();
    }
  });

  test("preserves statement order inside supported if blocks", async () => {
    const result = await expectSuccessfulCompile("if-multiple-prints.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("br i1 true, label %if.then.0, label %if.end.0");
      expect(llvmIr.indexOf("call i32 (ptr, ...) @printf(ptr @.fmt.number, double 3.0)")).toBeLessThan(
        llvmIr.indexOf("call i32 @puts(ptr @.str.1)")
      );
      expect(llvmIr).toContain(String.raw`c"done\00"`);
    } finally {
      await result.cleanup();
    }
  });

  test("rejects unsupported if conditions with a slice diagnostic", async () => {
    const result = await compileFixture("if-unsupported-condition.ts");

    try {
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("error TSCN1002");
    } finally {
      await result.cleanup();
    }
  });

  test("rejects unsupported statements inside supported if blocks", async () => {
    const result = await compileFixture("if-unsupported-body.ts");

    try {
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("error TSCN1002");
    } finally {
      await result.cleanup();
    }
  });

  test("preserves print order for literals and const bindings", async () => {
    const result = await expectSuccessfulCompile("multiple-prints.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr.indexOf(String.raw`c"first literal\00"`)).toBeLessThan(llvmIr.indexOf(String.raw`c"first const\00"`));
      expect(llvmIr.indexOf(String.raw`c"first const\00"`)).toBeLessThan(llvmIr.indexOf(String.raw`c"second literal\00"`));
    } finally {
      await result.cleanup();
    }
  });

  test("escapes string bytes for textual LLVM IR", async () => {
    const result = await expectSuccessfulCompile("escaped-string.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain(String.raw`quote: \22 slash: \5C newline:\0A\00`);
    } finally {
      await result.cleanup();
    }
  });

  test("rejects unsupported executable statements with a slice diagnostic", async () => {
    const result = await compileFixture("unsupported.ts");

    try {
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("error TSCN1002");

      const diagnostics = await result.readArtifact("diagnostics.txt");
      expect(diagnostics).toContain("Only top-level const string, number, or boolean bindings, print calls, and if statements are supported");
    } finally {
      await result.cleanup();
    }
  });

  test("rejects package imports during the native CLI subset milestone", async () => {
    const result = await compileFixture("package-import.ts");

    try {
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("error TSCN1001");
      expect(result.stderr).toContain("NPM package imports are not supported yet: effect");
    } finally {
      await result.cleanup();
    }
  });

  test("rejects print identifiers without a supported const binding", async () => {
    const result = await compileFixture("unknown-identifier.ts");

    try {
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("error TSCN1002");
    } finally {
      await result.cleanup();
    }
  });

  test("rejects unsupported object runtime boundaries", async () => {
    const fixtures = ["object-method.ts"];

    await Promise.all(fixtures.map(async (fixture) => expectUnsupportedDiagnostic(fixture)));
  });

  test("explains unsupported object runtime boundaries precisely", async () => {
    const expectations = new Map([
      ["object-method.ts", "Object methods are not supported"]
    ]);

    await Promise.all([...expectations].map(async ([fixture, message]) => expectUnsupportedMessage(fixture, message)));
  });

  test("explains unsupported new runtime built-in boundaries precisely", async () => {
    const expectations = new Map([
      ["object-define-property-accessor.ts", "Object.defineProperty accessor descriptors are not supported yet"]
    ]);

    await Promise.all([...expectations].map(async ([fixture, message]) => expectUnsupportedMessage(fixture, message)));
  });

  test("rejects unsupported expanded runtime roadmap boundaries", async () => {
    const fixtures = [
      "object-define-properties-accessor.ts",
      "object-define-properties-method.ts"
    ];

    await Promise.all(fixtures.map(async (fixture) => expectUnsupportedDiagnostic(fixture)));
  });

  test("rejects unsupported aggregate expansion boundaries", async () => {
    const fixtures = [
      "object-from-entries-non-array.ts",
      "object-from-entries-entry-non-array.ts"
    ];

    await Promise.all(fixtures.map(async (fixture) => expectUnsupportedDiagnostic(fixture)));
  });
});

describe("tscn numeric conditions and bindings", () => {
  test("lowers numeric strict equality in if conditions", async () => {
    const result = await expectSuccessfulCompile("if-number-strict-equality.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%cmp.0 = fcmp oeq double 3.0, 3.0");
      expect(llvmIr).toContain("br i1 %cmp.0, label %if.then.0, label %if.end.0");
      expect(llvmIr).toContain(String.raw`c"yes\00"`);
    } finally {
      await result.cleanup();
    }
  });

  test("preserves numeric expression shape in strict equality conditions", async () => {
    const result = await expectSuccessfulCompile("if-number-expression-strict-equality.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%num.0 = fadd double 1.0, 2.0");
      expect(llvmIr).toContain("%cmp.0 = fcmp oeq double %num.0, 3.0");
      expect(llvmIr).toContain("br i1 %cmp.0, label %if.then.0, label %if.else.0");
      expect(llvmIr).toContain(String.raw`c"yes\00"`);
      expect(llvmIr).toContain(String.raw`c"no\00"`);
    } finally {
      await result.cleanup();
    }
  });

  test("crosses unified binding model through const expression, condition, and print", async () => {
    const result = await expectSuccessfulCompile("const-number-expression-if-print.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%num.0 = fadd double 1.0, 2.0");
      expect(llvmIr).toContain("%cmp.0 = fcmp oeq double %num.0, 3.0");
      expect(llvmIr).toContain("br i1 %cmp.0, label %if.then.0, label %if.else.0");
      expect(llvmIr).toContain("if.then.0:");
      expect(llvmIr).toContain("%num.1 = fadd double 1.0, 2.0");
      expect(llvmIr).toContain("call i32 (ptr, ...) @printf(ptr @.fmt.number, double %num.1)");
      expect(llvmIr).toContain("if.else.0:");
      expect(llvmIr).toContain("call i32 (ptr, ...) @printf(ptr @.fmt.number, double 0.0)");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers numeric strict inequality (!==) in if conditions", async () => {
    const result = await expectSuccessfulCompile("if-number-not-strict-equality.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%cmp.0 = fcmp one double 1.0, 2.0");
      expect(llvmIr).toContain("br i1 %cmp.0, label %if.then.0, label %if.end.0");
      expect(llvmIr).toContain(String.raw`c"different\00"`);
    } finally {
      await result.cleanup();
    }
  });

  test("lowers numeric less-than (<) in if conditions", async () => {
    const result = await expectSuccessfulCompile("if-number-less-than.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%cmp.0 = fcmp olt double 1.0, 2.0");
      expect(llvmIr).toContain("br i1 %cmp.0, label %if.then.0, label %if.end.0");
      expect(llvmIr).toContain(String.raw`c"less\00"`);
    } finally {
      await result.cleanup();
    }
  });

  test("lowers numeric less-than-or-equal (<=) in if conditions", async () => {
    const result = await expectSuccessfulCompile("if-number-less-than-or-equal.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%cmp.0 = fcmp ole double 2.0, 2.0");
      expect(llvmIr).toContain("br i1 %cmp.0, label %if.then.0, label %if.end.0");
      expect(llvmIr).toContain(String.raw`c"less or equal\00"`);
    } finally {
      await result.cleanup();
    }
  });

  test("lowers numeric greater-than (>) in if conditions", async () => {
    const result = await expectSuccessfulCompile("if-number-greater-than.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%cmp.0 = fcmp ogt double 2.0, 1.0");
      expect(llvmIr).toContain("br i1 %cmp.0, label %if.then.0, label %if.end.0");
      expect(llvmIr).toContain(String.raw`c"greater\00"`);
    } finally {
      await result.cleanup();
    }
  });

  test("lowers numeric greater-than-or-equal (>=) in if conditions", async () => {
    const result = await expectSuccessfulCompile("if-number-greater-than-or-equal.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%cmp.0 = fcmp oge double 2.0, 2.0");
      expect(llvmIr).toContain("br i1 %cmp.0, label %if.then.0, label %if.end.0");
      expect(llvmIr).toContain(String.raw`c"greater or equal\00"`);
    } finally {
      await result.cleanup();
    }
  });

  test("preserves unary negation shape in print calls", async () => {
    const result = await expectSuccessfulCompile("number-unary-negation-print.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%num.0 = fneg double 42.0");
      expect(llvmIr).toContain("call i32 (ptr, ...) @printf(ptr @.fmt.number, double %num.0)");
    } finally {
      await result.cleanup();
    }
  });

  test("preserves unary negation shape for const number bindings used by print", async () => {
    const result = await expectSuccessfulCompile("const-number-unary-negation-print.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%num.0 = fneg double 3.0");
      expect(llvmIr).toContain("call i32 (ptr, ...) @printf(ptr @.fmt.number, double %num.0)");
    } finally {
      await result.cleanup();
    }
  });
});

describe("tscn function declarations and calls", () => {
  test("lowers function declarations and calls (no params, no return)", async () => {
    const result = await expectSuccessfulCompile("function-call.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define void @greet()");
      expect(llvmIr).toContain("call void @greet()");
      expect(llvmIr).toContain(String.raw`c"hello from function\00"`);
    } finally {
      await result.cleanup();
    }
  });

  test("lowers function parameters and calls with arguments", async () => {
    const result = await expectSuccessfulCompile("function-params.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define void @add(double %p0, double %p1)");
      expect(llvmIr).toContain("%num.0 = fadd double %p0, %p1");
      expect(llvmIr).toContain("call void @add(double 1.0, double 2.0)");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers return statements and captures call results in expressions", async () => {
    const result = await expectSuccessfulCompile("function-return.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define double @double(double %p0)");
      expect(llvmIr).toContain("call double @double(double 3.0)");
      expect(llvmIr).toContain("ret double %");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers recursive functions with forward declarations", async () => {
    const result = await expectSuccessfulCompile("function-recursive.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).not.toContain("declare double @fib(double)");
      expect(llvmIr).toContain("define double @fib(double %p0)");
      expect(llvmIr).toContain("call double @fib(double");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers function references to top-level const bindings", async () => {
    const result = await expectSuccessfulCompile("function-captures-top-level-const.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define void @getX()");
      expect(llvmIr).toContain("call i32 (ptr, ...) @printf(ptr @.fmt.number, double 42.0)");
      expect(llvmIr).toContain("call void @getX()");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers calls to exported functions from imported modules", async () => {
    const result = await expectSuccessfulCompile("import-function-call.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define void @foo()");
      expect(llvmIr).toContain(String.raw`c"from exported function\00"`);
      expect(llvmIr).toContain("call void @foo()");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers imported function calls used as print expressions", async () => {
    const result = await expectSuccessfulCompile("import-function-expression.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define double @add(double %p0, double %p1)");
      expect(llvmIr).toContain("%call.0 = call double @add(double 1.0, double 2.0)");
      expect(llvmIr).toContain("call i32 (ptr, ...) @printf(ptr @.fmt.number, double %call.0)");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers mutual recursion across imported modules with forward declarations", async () => {
    const result = await expectSuccessfulCompile("import-mutual-recursion.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).not.toContain("declare double @isEven(double)");
      expect(llvmIr).not.toContain("declare double @isOdd(double)");
      expect(llvmIr).toContain("define double @isEven(double %p0)");
      expect(llvmIr).toContain("define double @isOdd(double %p0)");
      expect(llvmIr).toContain("call double @isOdd(double");
      expect(llvmIr).toContain("call double @isEven(double");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers returned closures with captured numeric parameters", async () => {
    const result = await expectSuccessfulCompile("returning-closure.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define double @adder(double %p0, double %p1)");
      expect(llvmIr).toContain("%num.0 = fadd double %p0, %p1");
      expect(llvmIr).toContain("%call.0 = call double @adder(double 3.0, double 5.0)");
      expect(llvmIr).toContain("call i32 (ptr, ...) @printf(ptr @.fmt.number, double %call.0)");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers string function parameters through pointer and length arguments", async () => {
    const result = await expectSuccessfulCompile("function-string-param.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define void @greet(i64 %p0.len, ptr %p0.ptr)");
      expect(llvmIr).toContain("call void @greet(i64 3, ptr @.str.");
      expect(llvmIr).toContain("call ptr @strConcat(i64 6, ptr @.str.");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers string function returns through a string pair result", async () => {
    const result = await expectSuccessfulCompile("function-string-return.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define { ptr, i64 } @suffix()");
      expect(llvmIr).toContain("%call.0 = call { ptr, i64 } @suffix()");
      expect(llvmIr).toContain("extractvalue { ptr, i64 } %call.0, 0");
      expect(llvmIr).toContain("call ptr @strConcat");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers branches inside string function bodies", async () => {
    const result = await expectSuccessfulCompile("function-string-branch.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define void @greet(i64 %p0.len, ptr %p0.ptr)");
      expect(llvmIr).toContain("call i1 @strEquals(i64 %str.len.");
      expect(llvmIr).toContain("br i1 %cmp.0, label %if.then.0, label %if.else.0");
    } finally {
      await result.cleanup();
    }
  });
});

describe("tscn loops", () => {
  test("lowers while loops with mutable numeric bindings", async () => {
    const result = await expectSuccessfulCompile("while-loop.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("br label %while.cond.0");
      expect(llvmIr).toContain("while.cond.0:");
      expect(llvmIr).toContain("while.body.0:");
      expect(llvmIr).toContain("while.end.0:");
      expect(llvmIr).toContain("store double 0.0, ptr %i.addr");
      expect(llvmIr).toContain("store double %num.");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers for loops with initializer, condition, and increment", async () => {
    const result = await expectSuccessfulCompile("for-loop.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("store double 0.0, ptr %i.addr");
      expect(llvmIr).toContain("br label %for.cond.0");
      expect(llvmIr).toContain("for.body.0:");
      expect(llvmIr).toContain("for.step.0:");
      expect(llvmIr).toContain("for.end.0:");
      expect(llvmIr).toContain("store double %num.");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers break statements to the current loop exit", async () => {
    const result = await expectSuccessfulCompile("while-break.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("br label %while.end.0");
      expect(llvmIr).toContain("while.end.0:");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers continue statements to the current for-loop increment", async () => {
    const result = await expectSuccessfulCompile("for-continue.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("br label %for.step.0");
      expect(llvmIr).toContain("for.step.0:");
      expect(llvmIr).toContain("br label %for.cond.0");
    } finally {
      await result.cleanup();
    }
  });
});

describe("tscn logical operators", () => {
  test("lowers logical not in if conditions", async () => {
    const result = await expectSuccessfulCompile("if-not-condition.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%cmp.0 = xor i1 false, true");
      expect(llvmIr).toContain("br i1 %cmp.0, label %if.then.0, label %if.end.0");
      expect(llvmIr).toContain(String.raw`c"false branch\00"`);
    } finally {
      await result.cleanup();
    }
  });

  test("lowers logical and in if conditions with short-circuit blocks", async () => {
    const result = await expectSuccessfulCompile("if-and-condition.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("logic.rhs.0:");
      expect(llvmIr).toContain("logic.end.0:");
      expect(llvmIr).toContain("phi i1 [ false");
      expect(llvmIr).toContain(String.raw`c"both\00"`);
    } finally {
      await result.cleanup();
    }
  });

  test("lowers logical or in if conditions with short-circuit blocks", async () => {
    const result = await expectSuccessfulCompile("if-or-condition.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("logic.rhs.0:");
      expect(llvmIr).toContain("logic.end.0:");
      expect(llvmIr).toContain("phi i1 [ true");
      expect(llvmIr).toContain(String.raw`c"zero\00"`);
    } finally {
      await result.cleanup();
    }
  });

  test("prints const bindings initialized from logical expressions", async () => {
    const result = await expectSuccessfulCompile("const-logical-expression.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("logic.rhs.0:");
      expect(llvmIr).toContain("bool.true.0:");
      expect(llvmIr).toContain("bool.false.0:");
      expect(llvmIr).toContain(String.raw`c"true\00"`);
      expect(llvmIr).toContain(String.raw`c"false\00"`);
    } finally {
      await result.cleanup();
    }
  });
});

describe("tscn rich expressions", () => {
  test("lowers numeric ternary expressions to LLVM select", async () => {
    const result = await expectSuccessfulCompile("numeric-ternary.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%cmp.0 = fcmp ogt double 12.0, 10.0");
      expect(llvmIr).toContain("select i1 %cmp.0, double 12.0, double 10.0");
      expect(llvmIr).toContain("call i32 (ptr, ...) @printf(ptr @.fmt.number, double %num.");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers string ternary expressions through branch-selected pointers", async () => {
    const result = await expectSuccessfulCompile("string-ternary.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("br i1 true, label %str.then.0, label %str.else.0");
      expect(llvmIr).toContain("%str.0 = phi ptr");
      expect(llvmIr).toContain(String.raw`c"yes\00"`);
      expect(llvmIr).toContain(String.raw`c"no\00"`);
    } finally {
      await result.cleanup();
    }
  });

  test("lowers runtime string ternary expressions through pointer and length phis", async () => {
    const result = await expectSuccessfulCompile("runtime-string-ternary.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("phi ptr [ %str.2, %str.then.0 ], [ @.str.2, %str.else.0 ]");
      expect(llvmIr).toContain("phi i64 [ %str.len.2, %str.then.0 ], [ 7, %str.else.0 ]");
      expect(llvmIr).toContain("call i32 @puts(ptr %str.0)");
    } finally {
      await result.cleanup();
    }
  });

  test("folds const string strict equality in if conditions", async () => {
    const result = await expectSuccessfulCompile("if-string-strict-equality.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("br i1 true, label %if.then.0, label %if.end.0");
      expect(llvmIr).toContain(String.raw`c"equal\00"`);
    } finally {
      await result.cleanup();
    }
  });

  test("folds const string strict inequality in if conditions", async () => {
    const result = await expectSuccessfulCompile("if-string-not-strict-equality.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("br i1 true, label %if.then.0, label %if.end.0");
      expect(llvmIr).toContain(String.raw`c"different\00"`);
    } finally {
      await result.cleanup();
    }
  });
});

describe("tscn string mutation", () => {
  test("lowers mutable string bindings and literal reassignment", async () => {
    const result = await expectSuccessfulCompile("let-string-reassignment.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%msg.addr = alloca ptr");
      expect(llvmIr).toContain("store ptr @.str.0, ptr %msg.addr");
      expect(llvmIr).toContain("store ptr @.str.2, ptr %msg.addr");
      expect(llvmIr).toContain("load ptr, ptr %msg.addr");
    } finally {
      await result.cleanup();
    }
  });

  test("carries mutable string bindings through for-loop assignment", async () => {
    const result = await expectSuccessfulCompile("let-string-loop.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%s.addr = alloca ptr");
      expect(llvmIr).toContain("for.body.0:");
      expect(llvmIr).toContain("store ptr @.str.1, ptr %s.addr");
    } finally {
      await result.cleanup();
    }
  });
});

describe("tscn nested loop control", () => {
  test("targets inner for-loop exit for nested break", async () => {
    const result = await expectSuccessfulCompile("nested-for-inner-break.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("for.end.0:");
      expect(llvmIr).toContain("for.end.1:");
      expect(llvmIr).toContain("br label %for.end.1");
    } finally {
      await result.cleanup();
    }
  });

  test("targets inner while-loop condition for nested continue", async () => {
    const result = await expectSuccessfulCompile("nested-while-inner-continue.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("while.cond.0:");
      expect(llvmIr).toContain("while.cond.1:");
      expect(llvmIr).toContain("br label %while.cond.1");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers break inside if inside for to the for-loop exit", async () => {
    const result = await expectSuccessfulCompile("for-if-break.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("for.end.0:");
      expect(llvmIr).toContain("br label %for.end.0");
    } finally {
      await result.cleanup();
    }
  });
});

describe("tscn do while loops", () => {
  test("lowers do-while loops with body before condition", async () => {
    const result = await expectSuccessfulCompile("do-while-loop.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("br label %do.body.0");
      expect(llvmIr).toContain("do.body.0:");
      expect(llvmIr).toContain("do.cond.0:");
      expect(llvmIr).toContain("do.end.0:");
      expect(llvmIr).toContain("br i1 %cmp.0, label %do.body.0, label %do.end.0");
    } finally {
      await result.cleanup();
    }
  });
});

describe("tscn boolean mutation", () => {
  test("lowers mutable boolean bindings and reassignment", async () => {
    const result = await expectSuccessfulCompile("let-boolean-reassignment.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%flag.addr = alloca i1");
      expect(llvmIr).toContain("store i1 true, ptr %flag.addr");
      expect(llvmIr).toContain("store i1 false, ptr %flag.addr");
      expect(llvmIr).toContain("load i1, ptr %flag.addr");
    } finally {
      await result.cleanup();
    }
  });

  test("uses mutable boolean bindings in if conditions", async () => {
    const result = await expectSuccessfulCompile("let-boolean-if.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%active.addr = alloca i1");
      expect(llvmIr).toContain("load i1, ptr %active.addr");
      expect(llvmIr).toContain("br i1 %bool.");
    } finally {
      await result.cleanup();
    }
  });
});

describe("tscn runtime strings", () => {
  test("lowers string concat assignment to a runtime helper call", async () => {
    const result = await expectSuccessfulCompile("string-concat-assign.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define ptr @strConcat(i64 %left.len, ptr %left.ptr, i64 %right.len, ptr %right.ptr)");
      expect(llvmIr).toContain("call ptr @strConcat");
      expect(llvmIr).toContain("call ptr @malloc(i64 %alloc.size)");
      expect(llvmIr).toContain("store ptr %str.");
      expect(llvmIr).toContain("call ptr @strConcat(i64 %str.len.0, ptr %str.0, i64 6, ptr @.str.1)");
    } finally {
      await result.cleanup();
    }
  });

  test("passes runtime string lengths through variables and repeated concat", async () => {
    const prefix = await expectSuccessfulCompile("string-concat-prefix.ts");

    try {
      const llvmIr = await prefix.readArtifact("main.ll");
      expect(llvmIr).toContain("%prefix.len.addr = alloca i64");
      expect(llvmIr).toContain("%str.len.0 = load i64, ptr %prefix.len.addr");
      expect(llvmIr).toContain("call ptr @strConcat(i64 %str.len.0, ptr %str.0, i64 3, ptr @.str.1)");
    } finally {
      await prefix.cleanup();
    }

    const repeated = await expectSuccessfulCompile("string-concat-repeated.ts");

    try {
      const llvmIr = await repeated.readArtifact("main.ll");
      expect(llvmIr).toContain("store i64 %str.len.1, ptr %s.len.addr");
      expect(llvmIr).toContain("call ptr @strConcat(i64 %str.len.2, ptr %str.2, i64 1, ptr @.str.2)");
    } finally {
      await repeated.cleanup();
    }
  });

  test("carries string concat assignment through loops", async () => {
    const result = await expectSuccessfulCompile("string-concat-loop.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("for.body.0:");
      expect(llvmIr).toContain("call ptr @strConcat");
      expect(llvmIr).toContain("store ptr %str.");
    } finally {
      await result.cleanup();
    }
  });

  test("emits runtime helper declarations and definitions once before user functions", async () => {
    const result = await expectSuccessfulCompile("string-helper-ordering.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(countOccurrences(llvmIr, "declare ptr @malloc(i64)")).toBe(1);
      expect(countOccurrences(llvmIr, "define ptr @strConcat")).toBe(1);
      expect(countOccurrences(llvmIr, "define i1 @strEquals")).toBe(1);
      expect(llvmIr.indexOf("declare ptr @malloc(i64)")).toBeLessThan(llvmIr.indexOf("define ptr @strConcat"));
      expect(llvmIr.indexOf("define ptr @strConcat")).toBeLessThan(llvmIr.indexOf("define void @check"));
    } finally {
      await result.cleanup();
    }
  });
});

describe("tscn arrays", () => {
  test("lowers array literals and constant element access", async () => {
    const result = await expectSuccessfulCompile("array-element-constant.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("@arr.0 = global [3 x double] [double 10.0, double 20.0, double 30.0]");
      expect(llvmIr).toContain("getelementptr [3 x double], ptr @arr.0, i64 0, i64 0");
      expect(llvmIr).toContain("load double, ptr %arr.gep.");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers array access with a mutable numeric index", async () => {
    const result = await expectSuccessfulCompile("array-element-variable.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("load double, ptr %i.addr");
      expect(llvmIr).toContain("fptosi double %num.");
      expect(llvmIr).toContain("getelementptr [3 x double], ptr @arr.0");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers fixed array length as a numeric constant", async () => {
    const result = await expectSuccessfulCompile("array-length.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("call i32 (ptr, ...) @printf(ptr @.fmt.number, double 3.0)");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers array element mutation", async () => {
    const result = await expectSuccessfulCompile("array-mutation.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("store double 99.0, ptr %arr.gep.");
      expect(llvmIr).toContain("load double, ptr %arr.gep.");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers for loops over fixed arrays", async () => {
    const result = await expectSuccessfulCompile("array-for-loop.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("for.body.0:");
      expect(llvmIr).toContain("getelementptr [3 x double], ptr @arr.0");
    } finally {
      await result.cleanup();
    }
  });

  test("stores evaluated numeric expressions in array initializers", async () => {
    const result = await expectSuccessfulCompile("array-expression-initializer.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%arr.addr = alloca [2 x double]");
      expect(llvmIr).toContain("%num.0 = fadd double 10.0, 1.0");
      expect(llvmIr).toContain("store double %num.0, ptr %arr.gep.");
      expect(llvmIr).not.toContain("[double 0");
    } finally {
      await result.cleanup();
    }
  });

  test("uses array accesses in conditions and length-bounded while loops", async () => {
    const condition = await expectSuccessfulCompile("array-condition.ts");

    try {
      const llvmIr = await condition.readArtifact("main.ll");
      expect(llvmIr).toContain("load double, ptr %arr.gep.");
      expect(llvmIr).toContain("fcmp oeq double %num.");
    } finally {
      await condition.cleanup();
    }

    const loop = await expectSuccessfulCompile("array-while-length.ts");

    try {
      const llvmIr = await loop.readArtifact("main.ll");
      expect(llvmIr).toContain("while.cond.0:");
      expect(llvmIr).toContain("fcmp olt double %num.0, 3.0");
      expect(llvmIr).toContain("getelementptr [3 x double], ptr @arr.0");
    } finally {
      await loop.cleanup();
    }
  });

  test("keeps multiple array literals deterministic and non-colliding", async () => {
    const result = await expectSuccessfulCompile("array-multiple-literals.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("@arr.0 = global [2 x double] [double 1.0, double 2.0]");
      expect(llvmIr).toContain("@arr.1 = global [2 x double] [double 3.0, double 4.0]");
      expect(llvmIr).toContain("getelementptr [2 x double], ptr @arr.0, i64 0, i64 0");
      expect(llvmIr).toContain("getelementptr [2 x double], ptr @arr.1, i64 0, i64 1");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers mutable fixed arrays and nested numeric indexes", async () => {
    const result = await expectSuccessfulCompile("array-let-nested-index.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("@arr.0 = global [3 x double] [double 1.0, double 2.0, double 3.0]");
      expect(llvmIr).toContain("store double 3.0, ptr %arr.gep.");
      expect(llvmIr).toContain("fadd double %num.");
      expect(llvmIr).toContain("fptosi double %num.");
    } finally {
      await result.cleanup();
    }
  });

  test("stores variables and function-call results in array initializers", async () => {
    const result = await expectSuccessfulCompile("array-call-initializer.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%call.0 = call double @next()");
      expect(llvmIr).toContain("load double, ptr %x.addr");
      expect(llvmIr).toContain("store double %call.0, ptr %arr.gep.");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers holes and mixed values through runtime array helpers", async () => {
    const hole = await expectSuccessfulCompile("array-hole.ts", { link: true });

    try {
      const llvmIr = await hole.readArtifact("main.ll");
      expect(llvmIr).toContain("define ptr @arrayNew(i64 %length)");
      expect(llvmIr).toContain("define i64 @arrayGetWithKey(ptr %array, i64 %index, i64 %key.len, ptr %key.ptr)");
      expect(llvmIr).toContain("store i64 9222246136947933191, ptr %slot");
      expect(llvmIr).toContain("%is.hole = icmp eq i64 %value, 9222246136947933191");
      expect(llvmIr).not.toContain("call void @arraySet(ptr %arr.arr, i64 1, i64 9222246136947933184)");
      expect(llvmIr).toContain("call i64 @arrayGetWithKey(ptr %arr.ptr.");
      await expectNativeBehaviorIfAvailable(hole, { status: 0, stdout: "1\nundefined\n", stderr: "" });
    } finally {
      await hole.cleanup();
    }

    const mixed = await expectSuccessfulCompile("array-non-numeric.ts", { link: true });

    try {
      const llvmIr = await mixed.readArtifact("main.ll");
      expect(llvmIr).toContain("call void @arraySet(ptr %arr.arr, i64 0, i64 %value.");
      expect(llvmIr).toContain("call void @valuePrint(i64 %value.");
      await expectNativeBehaviorIfAvailable(mixed, { status: 0, stdout: "x\n", stderr: "" });
    } finally {
      await mixed.cleanup();
    }
  });

  test("keeps runtime and fixed array names from colliding", async () => {
    const result = await expectSuccessfulCompile("array-runtime-and-fixed.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("@arr.0 = global [2 x double] [double 1.0, double 2.0]");
      expect(llvmIr).toContain("%mixed.arr = call ptr @arrayNew(i64 2)");
      expect(llvmIr).toContain("getelementptr [2 x double], ptr @arr.0");
      expect(llvmIr).toContain("call i64 @arrayGetWithKey(ptr %arr.ptr.");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "2\ntrue\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("grows runtime arrays on out-of-bounds writes", async () => {
    const result = await expectSuccessfulCompile("array-runtime-growth.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%capacity.slot = getelementptr i8, ptr %array, i64 8");
      expect(llvmIr).toContain("%elements.slot = getelementptr i8, ptr %array, i64 16");
      expect(llvmIr).toContain("%new.elements = call ptr @malloc(i64 %new.elements.bytes)");
      expect(llvmIr).toContain("call ptr @memcpy(ptr %new.elements, ptr %elements, i64 %old.elements.bytes)");
      expect(llvmIr).toContain("store i64 %next.length, ptr %array");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "6\nundefined\nx\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("deletes runtime array elements as holes without changing length", async () => {
    const result = await expectSuccessfulCompile("array-runtime-delete.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define void @arrayDelete(ptr %array, i64 %index)");
      expect(llvmIr).toContain("call void @arrayDelete(ptr %arr.ptr.");
      expect(llvmIr).toContain("store i64 9222246136947933191, ptr %slot");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "3\nundefined\nc\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("assigns runtime array length with truncation and holes", async () => {
    const result = await expectSuccessfulCompile("array-runtime-length-assignment.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define void @arraySetLength(ptr %array, i64 %new.length)");
      expect(llvmIr).toContain("call void @arraySetLength(ptr %arr.ptr.");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "1\nundefined\n4\nundefined\nd\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("checks runtime array indexed presence without treating holes as present", async () => {
    const result = await expectSuccessfulCompile("array-runtime-presence.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define i1 @arrayHasOwnIndex(ptr %array, i64 %index)");
      expect(llvmIr).toContain("call i1 @arrayHasOwnIndex(ptr %arr.ptr.");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "true\ntrue\nfalse\nfalse\nfalse\nfalse\nfalse\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("falls back from runtime array holes to object prototypes for literal indexes", async () => {
    const result = await expectSuccessfulCompile("array-runtime-prototype.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define i64 @arrayGetWithKey(ptr %array, i64 %index, i64 %key.len, ptr %key.ptr)");
      expect(llvmIr).toContain("%prototype.slot = getelementptr i8, ptr %array, i64 24");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "zero\none\nundefined\nthree\nundefined\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("returns own enumerable runtime array keys", async () => {
    const result = await expectSuccessfulCompile("array-runtime-keys.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define ptr @arrayKeys(ptr %array)");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "2\n0\n4\nundefined\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("supports canonical string keys for runtime arrays", async () => {
    const result = await expectSuccessfulCompile("array-runtime-string-keys.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define i1 @arrayHas(ptr %array, i64 %index, i64 %key.len, ptr %key.ptr)");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "zero\nproto\ntrue\ntrue\nfalse\nfalse\n4\nthree\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("supports runtime array push and pop", async () => {
    const result = await expectSuccessfulCompile("array-runtime-push-pop.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define i64 @arrayPush(ptr %array, i64 %value)");
      expect(llvmIr).toContain("define i64 @arrayPop(ptr %array)");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "4\n4\nd\nc\nundefined\na\nundefined\n0\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("supports runtime array shift and unshift", async () => {
    const result = await expectSuccessfulCompile("array-runtime-shift-unshift.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define i64 @arrayUnshift(ptr %array, i64 %value)");
      expect(llvmIr).toContain("define i64 @arrayShift(ptr %array)");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "4\na\nundefined\na\n3\nundefined\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("gets runtime array prototypes", async () => {
    const result = await expectSuccessfulCompile("array-runtime-get-prototype.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define ptr @arrayGetPrototype(ptr %array)");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "array-proto\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });
});

describe("tscn objects", () => {
  test("lowers object literals and dot access", async () => {
    const result = await expectSuccessfulCompile("object-dot-access.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%obj.0 = type { double, double }");
      expect(llvmIr).toContain("%obj.addr = alloca %obj.0");
      expect(llvmIr).toContain("load double, ptr %obj.gep.");
      expect(llvmIr).not.toContain("define ptr @objectNew(i64 %capacity)");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers object bracket access with const string keys", async () => {
    const result = await expectSuccessfulCompile("object-bracket-access.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("getelementptr %obj.0, ptr %obj.addr, i32 0, i32 0");
      expect(llvmIr).toContain("load double, ptr %obj.gep.");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers object property mutation", async () => {
    const result = await expectSuccessfulCompile("object-mutation.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("store double 99.0, ptr %obj.gep.");
      expect(llvmIr).toContain("load double, ptr %obj.gep.");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers nested object property access", async () => {
    const result = await expectSuccessfulCompile("object-nested.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%obj.1 = type { double }");
      expect(llvmIr).toContain("%obj.0 = type { %obj.1 }");
      expect(llvmIr).toContain("getelementptr %obj.0, ptr %obj.addr, i32 0, i32 0, i32 0");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers object bracket mutation", async () => {
    const result = await expectSuccessfulCompile("object-bracket-mutation.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("store double 99.0, ptr %obj.gep.");
      expect(llvmIr).toContain("load double, ptr %obj.gep.");
    } finally {
      await result.cleanup();
    }
  });

  test("preserves numeric expression fields and nested object mutation", async () => {
    const expression = await expectSuccessfulCompile("object-expression-field.ts");

    try {
      const llvmIr = await expression.readArtifact("main.ll");
      expect(llvmIr).toContain("%num.0 = fadd double 40.0, 2.0");
      expect(llvmIr).toContain("store double %num.0, ptr %obj.gep.");
    } finally {
      await expression.cleanup();
    }

    const nested = await expectSuccessfulCompile("object-nested-mutation.ts");

    try {
      const llvmIr = await nested.readArtifact("main.ll");
      expect(llvmIr).toContain("getelementptr %obj.0, ptr %obj.addr, i32 0, i32 0, i32 0");
      expect(llvmIr).toContain("store double 42.0, ptr %obj.gep.");
    } finally {
      await nested.cleanup();
    }
  });

  test("uses object properties in numeric comparisons", async () => {
    const result = await expectSuccessfulCompile("object-condition.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("load double, ptr %obj.gep.");
      expect(llvmIr).toContain("fcmp oeq double %num.");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers string-key object literal fields", async () => {
    const result = await expectSuccessfulCompile("object-string-key.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%obj.0 = type { double }");
      expect(llvmIr).toContain("getelementptr %obj.0, ptr %obj.addr, i32 0, i32 0");
    } finally {
      await result.cleanup();
    }
  });

  test("stores function-call results in object fields", async () => {
    const result = await expectSuccessfulCompile("object-call-field.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%call.0 = call double @value()");
      expect(llvmIr).toContain("store double %call.0, ptr %obj.gep.");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers dynamic string-key object reads through runtime helpers", async () => {
    const result = await expectSuccessfulCompile("object-dynamic-key.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%obj.0 = type { double }");
      expect(llvmIr).toContain("define ptr @objectNew(i64 %capacity)");
      expect(llvmIr).toContain("define i64 @objectGet(ptr %object, i64 %key.len, ptr %key.ptr)");
      expect(llvmIr).toContain("call void @objectSet(ptr %obj.rt.");
      expect(llvmIr).toContain("call i64 @objectGet(ptr %obj.ptr.");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "1\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("keeps known-shape object runtime shadows synchronized after mutation", async () => {
    const result = await expectSuccessfulCompile("object-fixed-shadow-mutation.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("store double 2.0, ptr %obj.gep.");
      expect(llvmIr).toContain("call void @objectSet(ptr %obj.ptr.");
      expect(llvmIr).toContain("call i64 @objectGet(ptr %obj.ptr.");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "2\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("lowers dynamic object stores with dictionary growth", async () => {
    const result = await expectSuccessfulCompile("object-runtime-dynamic-store.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%capacity.slot = getelementptr i8, ptr %object, i64 8");
      expect(llvmIr).toContain("%new.entries = call ptr @malloc(i64 %new.entries.bytes)");
      expect(llvmIr).toContain("%shape.version.slot = getelementptr i8, ptr %object, i64 24");
      expect(llvmIr).toContain("%append.descriptor.slot = getelementptr i8, ptr %append.ptr, i64 24");
      expect(llvmIr).toContain("store i64 7, ptr %append.descriptor.slot");
      expect(llvmIr).toContain("store i64 %next.shape.version, ptr %shape.version.slot");
      expect(llvmIr).toContain("call void @objectSet(ptr %obj.ptr.");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "new\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("rejects nested known-shape object dynamic lookup explicitly", async () => {
    const result = await compileFixture("object-nested-dynamic-key.ts");

    try {
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("error TSCN1002");
      expect(result.stderr).toContain("Dynamic computed object keys on nested known-shape objects are not supported yet");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers runtime-only object value fields through dictionary objects", async () => {
    const result = await expectSuccessfulCompile("object-non-numeric-field.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).not.toContain("%obj.0 = type { double }");
      expect(llvmIr).toContain("call void @objectSet(ptr %obj.rt.");
      expect(llvmIr).toContain("call void @valuePrint(i64 %value.");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "value\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("keeps runtime and known-shape object names from colliding", async () => {
    const result = await expectSuccessfulCompile("object-runtime-and-fixed.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%obj.0 = type { double }");
      expect(llvmIr).toContain("%dynamic.addr = alloca ptr");
      expect(llvmIr).toContain("getelementptr %obj.0, ptr %fixed.addr");
      expect(llvmIr).toContain("call i64 @objectGet(ptr %obj.ptr.");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "3\nruntime\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("deletes runtime object properties from dictionary objects", async () => {
    const result = await expectSuccessfulCompile("object-runtime-delete.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define void @objectDelete(ptr %object, i64 %key.len, ptr %key.ptr)");
      expect(llvmIr).toContain("call void @objectDelete(ptr %obj.ptr.");
      expect(llvmIr).toContain("store i64 -1, ptr %entry.ptr");
      expect(llvmIr).toContain("%next.shape.version = add i64 %shape.version, 1");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "undefined\nundefined\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("falls back through runtime object prototypes created with Object.create", async () => {
    const result = await expectSuccessfulCompile("object-runtime-prototype.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define ptr @objectCreate(ptr %prototype)");
      expect(llvmIr).toContain("define { i64, i64 } @objectGetOwn(ptr %object, i64 %key.len, ptr %key.ptr)");
      expect(llvmIr).toContain("%prototype.slot = getelementptr i8, ptr %object, i64 32");
      expect(llvmIr).toContain("call ptr @objectCreate(ptr %obj.ptr.");
      await expectNativeBehaviorIfAvailable(result, {
        status: 0,
        stdout: "proto\nown\nundefined\nproto\nundefined\n",
        stderr: ""
      });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("checks runtime object property presence through own and prototype lookups", async () => {
    const result = await expectSuccessfulCompile("object-runtime-presence.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define i1 @objectHasOwn(ptr %object, i64 %key.len, ptr %key.ptr)");
      expect(llvmIr).toContain("define i1 @objectHas(ptr %object, i64 %key.len, ptr %key.ptr)");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "true\ntrue\ntrue\nfalse\ntrue\nfalse\nfalse\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("mutates runtime object prototypes with Object.setPrototypeOf", async () => {
    const result = await expectSuccessfulCompile("object-runtime-set-prototype.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define void @objectSetPrototype(ptr %object, ptr %prototype)");
      expect(llvmIr).toContain("call void @objectSetPrototype(ptr %obj.ptr.");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "first\nundefined\nsecond\nundefined\nundefined\nfalse\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("defines runtime data property descriptors and observes writable/configurable bits", async () => {
    const result = await expectSuccessfulCompile("object-runtime-define-property.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define void @objectDefineDataProperty(ptr %object, i64 %key.len, ptr %key.ptr, i64 %value, i64 %flags)");
      expect(llvmIr).toContain("%is.writable = icmp ne i64 %writable.bit, 0");
      expect(llvmIr).toContain("%is.configurable = icmp ne i64 %configurable.bit, 0");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "fixed\nundefined\nnormal\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("returns own enumerable runtime object keys in insertion order", async () => {
    const result = await expectSuccessfulCompile("object-runtime-keys.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define ptr @objectKeys(ptr %object)");
      expect(llvmIr).toContain("call ptr @objectKeys(ptr %obj.ptr.");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "1\nvisible\nundefined\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("supports runtime object extensibility", async () => {
    const result = await expectSuccessfulCompile("object-runtime-extensible.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define void @objectPreventExtensions(ptr %object)");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "true\nfalse\nnew\nundefined\nundefined\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("supports runtime object seal and freeze", async () => {
    const result = await expectSuccessfulCompile("object-runtime-seal-freeze.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define void @objectSeal(ptr %object)");
      expect(llvmIr).toContain("define void @objectFreeze(ptr %object)");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "true\nnew\nkeep\nundefined\ntrue\nnew\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("copies runtime object enumerable own properties", async () => {
    const result = await expectSuccessfulCompile("object-runtime-assign.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define void @objectAssign(ptr %target, ptr %source)");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "override\nb\nundefined\nundefined\nundefined\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("gets runtime object prototypes and guards cycles", async () => {
    const result = await expectSuccessfulCompile("object-runtime-get-prototype-cycle.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define ptr @objectGetPrototype(ptr %object)");
      expect(llvmIr).toContain("define i1 @objectWouldCreateCycle(ptr %object, ptr %prototype)");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "root\na\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });
});

describe("tscn runtime comparisons", () => {
  test("lowers runtime string strict equality as content comparison", async () => {
    const result = await expectSuccessfulCompile("runtime-string-equality.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define i1 @strEquals(i64 %left.len, ptr %left.ptr, i64 %right.len, ptr %right.ptr)");
      expect(llvmIr).toContain("call i32 @memcmp(ptr %left.ptr, ptr %right.ptr, i64 %left.len)");
      expect(llvmIr).toContain("call i1 @strEquals(i64 %str.len.");
      expect(llvmIr).toContain("br i1 %cmp.0, label %if.then.0, label %if.end.0");
    } finally {
      await result.cleanup();
    }
  });

  test("uses string equality helper for content equality and inequality", async () => {
    const equality = await expectSuccessfulCompile("runtime-string-content-equality.ts");

    try {
      const llvmIr = await equality.readArtifact("main.ll");
      expect(llvmIr).toContain("call i1 @strEquals");
      expect(llvmIr).toContain("%cmp.0 = icmp eq i1 %str.eq.0, true");
    } finally {
      await equality.cleanup();
    }

    const inequality = await expectSuccessfulCompile("runtime-string-content-inequality.ts");

    try {
      const llvmIr = await inequality.readArtifact("main.ll");
      expect(llvmIr).toContain("call i1 @strEquals");
      expect(llvmIr).toContain("%cmp.0 = icmp ne i1 %str.eq.0, true");
    } finally {
      await inequality.cleanup();
    }
  });

  test("lowers mutable boolean strict equality", async () => {
    const result = await expectSuccessfulCompile("boolean-comparison.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("icmp eq i1 %bool.");
      expect(llvmIr).toContain("br i1 %cmp.0, label %if.then.0, label %if.end.0");
    } finally {
      await result.cleanup();
    }
  });
});

describe("tscn JSValue ABI", () => {
  test("supports null as a first-class JSValue", async () => {
    const result = await expectSuccessfulCompile("value-null.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("9222246136947933187");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "null\nnull\ntrue\ntrue\nfalse\nfalse\ntrue\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("lowers boxed print values through the value print helper", async () => {
    const result = await expectSuccessfulCompile("value-print.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define void @valuePrint(i64 %value)");
      expect(llvmIr).toContain("bitcast double 42.0 to i64");
      expect(llvmIr).toContain("select i1 true, i64 9222246136947933186, i64 9222246136947933185");
      expect(llvmIr).toContain("i64 9222246136947933184");
      expect(llvmIr).toContain("define i64 @valueBoxString(ptr %string.ptr, i64 %string.len)");
      expect(llvmIr).toContain("call i64 @valueBoxString(ptr @.str.");
      expect(countOccurrences(llvmIr, "define void @valuePrint")).toBe(1);
      await expectNativeBehaviorIfAvailable(result, {
        status: 0,
        stdout: "42\ntrue\nundefined\nboxed string\n",
        stderr: ""
      });
      const lli = await expectToolBehaviorIfAvailable("lli", [path.join(result.outDir, "main.ll")], {
        status: 0,
        stdout: "42\ntrue\nundefined\nboxed string\n",
        stderr: ""
      });
      if (lli.skipped) {
        expect(lli.reason).toContain("lli was not found");
      }
    } finally {
      await result.cleanup();
    }
  });

  test("keeps boxed string tags distinct from fractional number values", async () => {
    const result = await expectSuccessfulCompile("value-print-fraction.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%tagged = and i64 %value, -281474976710656");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "0.3\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("lowers value strict equality through a deterministic helper", async () => {
    const result = await expectSuccessfulCompile("value-strict-equality.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define i1 @valueStrictEquals(i64 %left, i64 %right)");
      expect(llvmIr).toContain("call i1 @valueStrictEquals(i64");
      expect(countOccurrences(llvmIr, "define i1 @valueStrictEquals")).toBe(1);
      expect(llvmIr.indexOf("define i1 @valueStrictEquals")).toBeLessThan(llvmIr.indexOf("define i32 @main"));
      await expectNativeBehaviorIfAvailable(result, {
        status: 0,
        stdout: "numbers equal\nbooleans differ\nundefined equal\nstrings compare by content\n",
        stderr: ""
      });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("compares boxed string JSValues by content", async () => {
    const result = await expectSuccessfulCompile("value-string-strict-equality-content.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "true\ntrue\ntrue\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("returns number or boolean through the same value-shaped ABI", async () => {
    const result = await expectSuccessfulCompile("value-return-union.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).not.toContain("declare i64 @choose(double)");
      expect(llvmIr).toContain("define i64 @choose(double %p0)");
      expect(llvmIr).toContain("select i1 %cmp.0, i64 %value.");
      expect(llvmIr).toContain("%call.0 = call i64 @choose(double 0.0)");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "true\n7\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });
});

// eslint-disable-next-line max-statements -- Expanded runtime roadmap coverage intentionally groups many vertical fixtures.
describe("tscn expanded runtime roadmap", () => {
  test("materializes multi-digit runtime array keys", async () => {
    const result = await expectSuccessfulCompile("array-runtime-keys-multi-digit.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "5\n0\n9\n10\n12\n123\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("classifies runtime arrays with Array.isArray", async () => {
    const result = await expectSuccessfulCompile("array-is-array.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "true\nfalse\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("returns runtime Object.values for objects and arrays", async () => {
    const object = await expectSuccessfulCompile("object-runtime-values.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(object, { status: 0, stdout: "2\na\nundefined\nundefined\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(object);
    } finally {
      await object.cleanup();
    }

    const array = await expectSuccessfulCompile("array-runtime-values.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(array, { status: 0, stdout: "2\nundefined\ny\nundefined\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(array);
    } finally {
      await array.cleanup();
    }
  });

  test("returns runtime data descriptors", async () => {
    const object = await expectSuccessfulCompile("object-runtime-get-own-property-descriptor.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(object, { status: 0, stdout: "value\nfalse\ntrue\nfalse\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(object);
    } finally {
      await object.cleanup();
    }

    const array = await expectSuccessfulCompile("array-runtime-get-own-property-descriptor.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(array, { status: 0, stdout: "zero\ntrue\ntrue\ntrue\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(array);
    } finally {
      await array.cleanup();
    }
  });

  test("returns safe nullable descriptors and array length descriptors", async () => {
    const objectMissing = await expectSuccessfulCompile("object-runtime-get-own-property-descriptor-missing.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(objectMissing, { status: 0, stdout: "true\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(objectMissing);
    } finally {
      await objectMissing.cleanup();
    }

    const arrayMissing = await expectSuccessfulCompile("array-runtime-get-own-property-descriptor-missing.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(arrayMissing, { status: 0, stdout: "true\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(arrayMissing);
    } finally {
      await arrayMissing.cleanup();
    }

    const arrayLength = await expectSuccessfulCompile("array-runtime-get-own-property-descriptor-length.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(arrayLength, { status: 0, stdout: "3\ntrue\nfalse\nfalse\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(arrayLength);
    } finally {
      await arrayLength.cleanup();
    }
  });

  test("defines multiple runtime data properties", async () => {
    const result = await expectSuccessfulCompile("object-runtime-define-properties.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "a\nhidden\nlocked\n2\na\nlocked\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("converts narrow runtime object property keys", async () => {
    const result = await expectSuccessfulCompile("object-runtime-property-key-conversion.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "zero\nten\nyes\nvalue\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("lowers object and array method-call sugar", async () => {
    const object = await expectSuccessfulCompile("object-runtime-method-sugar.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(object, { status: 0, stdout: "true\nfalse\ntrue\nfalse\n", stderr: "" });
    } finally {
      await object.cleanup();
    }

    const array = await expectSuccessfulCompile("array-runtime-method-sugar.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(array, { status: 0, stdout: "false\ntrue\ntrue\n", stderr: "" });
    } finally {
      await array.cleanup();
    }
  });

  test("supports runtime array includes, indexOf, slice, and join", async () => {
    const search = await expectSuccessfulCompile("array-runtime-includes-index-of.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(search, { status: 0, stdout: "true\ntrue\n3\n-1\n", stderr: "" });
    } finally {
      await search.cleanup();
    }

    const slice = await expectSuccessfulCompile("array-runtime-slice.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(slice, { status: 0, stdout: "3\nundefined\nc\nd\n", stderr: "" });
    } finally {
      await slice.cleanup();
    }

    const join = await expectSuccessfulCompile("array-runtime-join.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(join, { status: 0, stdout: "a---d\n", stderr: "" });
    } finally {
      await join.cleanup();
    }
  });

  test("carries boxed string length and supports typeof, truthiness, and aggregate refs", async () => {
    const boxed = await expectSuccessfulCompile("value-boxed-string-length.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(boxed, { status: 0, stdout: "hello\ntrue\n", stderr: "" });
    } finally {
      await boxed.cleanup();
    }

    const typeOf = await expectSuccessfulCompile("typeof-supported-values.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(typeOf, { status: 0, stdout: "undefined\nobject\nboolean\nnumber\nstring\n", stderr: "" });
    } finally {
      await typeOf.cleanup();
    }

    const truthiness = await expectSuccessfulCompile("value-truthiness.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(truthiness, { status: 0, stdout: "text\nzero\none\nundefined\nnull\n", stderr: "" });
    } finally {
      await truthiness.cleanup();
    }

    const refs = await expectSuccessfulCompile("value-runtime-aggregate-references.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(refs, { status: 0, stdout: "true\ntrue\ntrue\n[object Object]\n[object Array]\n", stderr: "" });
    } finally {
      await refs.cleanup();
    }
  });

  test("uses boxed aggregate JSValues as built-in receivers", async () => {
    const result = await expectSuccessfulCompile("value-runtime-aggregate-builtins.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "true\ntrue\nfalse\ntrue\nvalue\narray\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("returns boxed aggregate object keys and values", async () => {
    const result = await expectSuccessfulCompile("value-runtime-aggregate-object-keys-values.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "1\n1\nvalue\nobject\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("returns boxed aggregate array keys and values", async () => {
    const result = await expectSuccessfulCompile("value-runtime-aggregate-array-keys-values.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "3\n3\n0\n1\n2\na\nb\nc\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("reads properties and elements through boxed aggregate JSValues", async () => {
    const result = await expectSuccessfulCompile("value-runtime-aggregate-property-access.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "object\nobject\narray\n1\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("returns runtime Object.entries for objects and arrays", async () => {
    const object = await expectSuccessfulCompile("object-runtime-entries.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(object, { status: 0, stdout: "2\na\nvalue\nb\nundefined\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(object);
    } finally {
      await object.cleanup();
    }

    const array = await expectSuccessfulCompile("array-runtime-entries.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(array, { status: 0, stdout: "2\n0\nzero\n3\nthree\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(array);
    } finally {
      await array.cleanup();
    }
  });

  test("creates runtime objects from entries", async () => {
    const result = await expectSuccessfulCompile("object-runtime-from-entries.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "a\nundefined\ntrue\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }

    const holes = await expectSuccessfulCompile("object-runtime-from-entries-holes.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(holes, { status: 0, stdout: "1\na\nfalse\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(holes);
    } finally {
      await holes.cleanup();
    }
  });

  test("supports runtime array concat, fill, and reverse", async () => {
    const concat = await expectSuccessfulCompile("array-runtime-concat.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(concat, { status: 0, stdout: "5\na\nundefined\nc\nd\ntail\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(concat);
    } finally {
      await concat.cleanup();
    }

    const fill = await expectSuccessfulCompile("array-runtime-fill.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(fill, { status: 0, stdout: "a\nx\nx\nd\nz\nz\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(fill);
    } finally {
      await fill.cleanup();
    }

    const reverse = await expectSuccessfulCompile("array-runtime-reverse.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(reverse, { status: 0, stdout: "c\nb\na\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(reverse);
    } finally {
      await reverse.cleanup();
    }

    const reverseHoles = await expectSuccessfulCompile("array-runtime-reverse-holes.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(reverseHoles, { status: 0, stdout: "c\nundefined\na\nfalse\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(reverseHoles);
    } finally {
      await reverseHoles.cleanup();
    }
  });

  test("normalizes negative runtime array ranges", async () => {
    const sliceStart = await expectSuccessfulCompile("array-runtime-slice-negative-start.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(sliceStart, { status: 0, stdout: "1\nx\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(sliceStart);
    } finally {
      await sliceStart.cleanup();
    }

    const sliceRange = await expectSuccessfulCompile("array-runtime-slice-negative-range.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(sliceRange, { status: 0, stdout: "1\nb\n", stderr: "" });
    } finally {
      await sliceRange.cleanup();
    }

    const fillStart = await expectSuccessfulCompile("array-runtime-fill-negative-start.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(fillStart, { status: 0, stdout: "x\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(fillStart);
    } finally {
      await fillStart.cleanup();
    }

    const fillRange = await expectSuccessfulCompile("array-runtime-fill-negative-range.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(fillRange, { status: 0, stdout: "a\nx\nc\n", stderr: "" });
    } finally {
      await fillRange.cleanup();
    }

    const copyTarget = await expectSuccessfulCompile("array-runtime-copy-within-negative-target.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(copyTarget, { status: 0, stdout: "a\na\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(copyTarget);
    } finally {
      await copyTarget.cleanup();
    }

    const copyRange = await expectSuccessfulCompile("array-runtime-copy-within-negative-range.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(copyRange, { status: 0, stdout: "a\nb\na\nb\n", stderr: "" });
    } finally {
      await copyRange.cleanup();
    }
  });

  test("converts supported JSValues to strings and joins mixed values", async () => {
    const conversion = await expectSuccessfulCompile("value-string-conversion.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(conversion, { status: 0, stdout: "undefined\nnull\ntrue\nfalse\n42\n[object Object]\nx\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(conversion);
    } finally {
      await conversion.cleanup();
    }

    const join = await expectSuccessfulCompile("array-runtime-join-mixed-values.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(join, { status: 0, stdout: "a||true|null|[object Object]\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(join);
    } finally {
      await join.cleanup();
    }
  });

  test("mutates and deletes through boxed aggregate JSValues", async () => {
    const mutation = await expectSuccessfulCompile("value-runtime-aggregate-mutation.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(mutation, { status: 0, stdout: "next\n42\nzero\nnext\n2\nundefined\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(mutation);
    } finally {
      await mutation.cleanup();
    }

    const deletion = await expectSuccessfulCompile("value-runtime-aggregate-delete.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(deletion, { status: 0, stdout: "undefined\nundefined\none\n0\n1\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(deletion);
    } finally {
      await deletion.cleanup();
    }
  });

  test("introspects boxed aggregate descriptors and entries", async () => {
    const descriptors = await expectSuccessfulCompile("value-runtime-aggregate-descriptors.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(descriptors, { status: 0, stdout: "object\ntrue\nzero\ntrue\n2\nfalse\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(descriptors);
    } finally {
      await descriptors.cleanup();
    }

    const entries = await expectSuccessfulCompile("value-runtime-aggregate-entries.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(entries, { status: 0, stdout: "2\na\nvalue\n3\n0\n1\nundefined\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(entries);
    } finally {
      await entries.cleanup();
    }
  });

  test("safely introspects primitive Object receivers", async () => {
    const cases = [
      ["object-keys-unknown-primitive.ts", "0\n"],
      ["object-values-unknown-primitive.ts", "0\n"],
      ["object-entries-unknown-primitive.ts", "0\n"],
      ["object-get-own-property-descriptor-unknown-primitive.ts", "undefined\n"],
      ["object-get-own-property-names-unknown-primitive.ts", "0\n"],
      ["object-get-own-property-descriptors-primitive.ts", "0\n"],
      ["object-values-boolean-primitive.ts", "0\n"],
      ["object-get-own-property-names-boolean-primitive.ts", "0\n"],
      ["object-get-own-property-descriptors-number-empty.ts", "0\n"]
    ] as const;

    await Promise.all(cases.map(async ([fixture, stdout]) => {
      const result = await expectSuccessfulCompile(fixture, { link: true });
      try {
        await expectNativeBehaviorIfAvailable(result, { status: 0, stdout, stderr: "" });
        await expectLlvmAsVerificationIfAvailable(result);
      } finally {
        await result.cleanup();
      }
    }));
  });

  test("introspects boxed aggregate own property names and descriptors", async () => {
    const names = await expectSuccessfulCompile("value-runtime-aggregate-own-property-names.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(names, { status: 0, stdout: "2\nvisible\nhidden\n3\n0\n2\nlength\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(names);
    } finally {
      await names.cleanup();
    }

    const descriptors = await expectSuccessfulCompile("value-runtime-aggregate-own-property-descriptors.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(descriptors, { status: 0, stdout: "yes\ntrue\ntrue\ntrue\nsecret\nfalse\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(descriptors);
    } finally {
      await descriptors.cleanup();
    }
  });

  test("returns own property names and descriptor maps", async () => {
    const objectNames = await expectSuccessfulCompile("object-runtime-get-own-property-names.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(objectNames, { status: 0, stdout: "2\nhidden\nb\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(objectNames);
    } finally {
      await objectNames.cleanup();
    }

    const arrayNames = await expectSuccessfulCompile("array-runtime-get-own-property-names.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(arrayNames, { status: 0, stdout: "3\n0\n2\nlength\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(arrayNames);
    } finally {
      await arrayNames.cleanup();
    }

    const descriptors = await expectSuccessfulCompile("object-runtime-get-own-property-descriptors.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(descriptors, { status: 0, stdout: "a\ntrue\nhidden\nfalse\n2\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(descriptors);
    } finally {
      await descriptors.cleanup();
    }
  });

  test("supports runtime object literal shorthand and spread", async () => {
    const shorthand = await expectSuccessfulCompile("object-shorthand.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(shorthand, { status: 0, stdout: "1\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(shorthand);
    } finally {
      await shorthand.cleanup();
    }

    const spread = await expectSuccessfulCompile("object-spread.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(spread, { status: 0, stdout: "2\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(spread);
    } finally {
      await spread.cleanup();
    }

    const runtimeShorthand = await expectSuccessfulCompile("object-runtime-shorthand.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(runtimeShorthand, { status: 0, stdout: "x\n", stderr: "" });
    } finally {
      await runtimeShorthand.cleanup();
    }

    const overwrite = await expectSuccessfulCompile("object-runtime-spread-overwrite.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(overwrite, { status: 0, stdout: "new\n", stderr: "" });
    } finally {
      await overwrite.cleanup();
    }

    const nonenumerable = await expectSuccessfulCompile("object-runtime-spread-nonenumerable.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(nonenumerable, { status: 0, stdout: "1\nyes\nundefined\n", stderr: "" });
    } finally {
      await nonenumerable.cleanup();
    }
  });

  test("supports more callback-free runtime array methods", async () => {
    const at = await expectSuccessfulCompile("array-runtime-at.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(at, { status: 0, stdout: "a\nc\nundefined\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(at);
    } finally {
      await at.cleanup();
    }

    const lastIndexOf = await expectSuccessfulCompile("array-runtime-last-index-of.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(lastIndexOf, { status: 0, stdout: "2\n-1\n3\n", stderr: "" });
    } finally {
      await lastIndexOf.cleanup();
    }

    const copyWithin = await expectSuccessfulCompile("array-runtime-copy-within.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(copyWithin, { status: 0, stdout: "5\na\nc\nundefined\ne\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(copyWithin);
    } finally {
      await copyWithin.cleanup();
    }
  });

  test("supports variadic concat and boxed array concat arguments", async () => {
    const variadic = await expectSuccessfulCompile("array-runtime-concat-variadic.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(variadic, { status: 0, stdout: "7\na\nb\nundefined\nd\ntail\n1\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(variadic);
    } finally {
      await variadic.cleanup();
    }

    const boxed = await expectSuccessfulCompile("array-runtime-concat-boxed-array.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(boxed, { status: 0, stdout: "4\na\nb\nc\ntail\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(boxed);
    } finally {
      await boxed.cleanup();
    }
  });

  test("supports runtime array splice with removal, insertion, and negative start", async () => {
    const remove = await expectSuccessfulCompile("array-runtime-splice-remove.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(remove, { status: 0, stdout: "2\nb\nc\n2\na\nd\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(remove);
    } finally {
      await remove.cleanup();
    }

    const insert = await expectSuccessfulCompile("array-runtime-splice-insert.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(insert, { status: 0, stdout: "4\na\nx\ny\nb\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(insert);
    } finally {
      await insert.cleanup();
    }

    const negative = await expectSuccessfulCompile("array-runtime-splice-negative-start.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(negative, { status: 0, stdout: "1\nb\n2\na\nc\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(negative);
    } finally {
      await negative.cleanup();
    }
  });

  test("filters non-enumerable properties from runtime object introspection", async () => {
    const hasOwn = await expectSuccessfulCompile("object-runtime-has-own-property.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(hasOwn, { status: 0, stdout: "true\ntrue\nfalse\nfalse\n1\n1\n1\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(hasOwn);
    } finally {
      await hasOwn.cleanup();
    }

    const filtering = await expectSuccessfulCompile("object-runtime-non-enumerable-filtering.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(filtering, { status: 0, stdout: "1\n1\n1\nvisible\nv\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(filtering);
    } finally {
      await filtering.cleanup();
    }
  });

  test("supports callback-free every and some on runtime arrays", async () => {
    const result = await expectSuccessfulCompile("array-runtime-every-some.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "true\nfalse\nfalse\nfalse\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("supports Object.is with NaN, -0, +0, and value identity", async () => {
    const nanZero = await expectSuccessfulCompile("object-is-nan-zero.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(nanZero, { status: 0, stdout: "true\nfalse\nfalse\ntrue\nfalse\ntrue\nfalse\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(nanZero);
    } finally {
      await nanZero.cleanup();
    }
  });

  test("supports runtime array flat with default and zero depth", async () => {
    const flat = await expectSuccessfulCompile("array-runtime-flat.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(flat, { status: 0, stdout: "5\n1\n2\n3\n[object Array]\n[object Array]\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(flat);
    } finally {
      await flat.cleanup();
    }

    const depthZero = await expectSuccessfulCompile("array-runtime-flat-depth-zero.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(depthZero, { status: 0, stdout: "3\n1\n2\n3\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(depthZero);
    } finally {
      await depthZero.cleanup();
    }
  });

  test("converts runtime aggregates to strings", async () => {
    const cases = [
      ["string-conversion-object.ts", "[object Object]\n"],
      ["string-conversion-array.ts", "a,b,c\n"],
      ["string-conversion-nested-array.ts", "a,1,2,true\n"]
    ] as const;

    await expectNativeFixtures(cases);
  });

  test("supports Object.freeze, Object.seal, and Object.isExtensible predicates", async () => {
    const freeze = await expectSuccessfulCompile("object-runtime-freeze.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(freeze, { status: 0, stdout: "true\ntrue\nfalse\nfalse\ntrue\nfalse\nfalse\nfalse\ntrue\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(freeze);
    } finally {
      await freeze.cleanup();
    }

    const seal = await expectSuccessfulCompile("object-runtime-seal.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(seal, { status: 0, stdout: "true\nx\nnew\nfalse\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(seal);
    } finally {
      await seal.cleanup();
    }
  });

  test("supports runtime array literal spread", async () => {
    const spread = await expectSuccessfulCompile("array-runtime-spread.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(spread, { status: 0, stdout: "2\na\nb\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(spread);
    } finally {
      await spread.cleanup();
    }

    const holes = await expectSuccessfulCompile("array-runtime-spread-holes.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(holes, { status: 0, stdout: "4\nundefined\n3\n", stderr: "" });
    } finally {
      await holes.cleanup();
    }

    const mixed = await expectSuccessfulCompile("array-runtime-spread-mixed.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(mixed, { status: 0, stdout: "5\n0\na\nb\ntail\nc\n", stderr: "" });
    } finally {
      await mixed.cleanup();
    }
  });

  test("supports package V runtime array slice ranges", async () => {
    const cases = [
      ["array-runtime-slice-range.ts", "2\nb\nc\n4\na\n"],
      ["array-runtime-slice-holes.ts", "3\nundefined\nc\n"],
      ["array-runtime-slice-negative.ts", "2\nb\nb\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  });

  test("supports package W variadic runtime array concat", async () => {
    const cases = [
      ["array-runtime-concat-multiple-runtime.ts", "6\n1\n2\n3\n4\n5\n6\n"],
      ["array-runtime-concat-mixed-fixed-runtime.ts", "5\n1\n7\n9\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
    await expectUnsupportedDiagnostic("for-of-user-iterator-unsupported.ts");
  });

  test("supports package X runtime array indexOf and lastIndexOf", async () => {
    const cases = [
      ["array-runtime-index-of.ts", "1\n-1\n3\n4\n5\n"],
      ["array-runtime-index-of-from-index.ts", "3\n-1\n1\n3\n"],
      ["array-runtime-index-of-holes.ts", "-1\n-1\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  });

  test("supports package Y and Z callback-free runtime array methods", async () => {
    const cases = [
      ["array-runtime-find.ts", "first\nundefined\n"],
      ["array-runtime-find-index.ts", "1\n-1\n"],
      ["array-runtime-for-each.ts", "undefined\n3\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
    await expectUnsupportedDiagnostic("array-runtime-find-unsupported-callback.ts");
    await expectUnsupportedDiagnostic("array-runtime-for-each-unsupported-callback.ts");
  });

  test("supports package BO callback-driven runtime array methods", async () => {
    const cases = [
      ["array-runtime-map-callback.ts", "3\n2\n4\n6\n"],
      ["array-runtime-filter-callback.ts", "2\n2\n4\n"],
      ["array-runtime-for-each-callback.ts", "2\n5\n8\ndone\n"],
      ["array-runtime-find-callback.ts", "2\nundefined\n"],
      ["array-runtime-find-index-callback.ts", "1\n-1\n"],
      ["array-runtime-reduce-callback.ts", "16\n"],
      ["array-runtime-reduce-no-initial.ts", "6\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
    await expectUnsupportedDiagnostic("array-runtime-map-thisarg-unsupported.ts");
  });

  test("supports package BP minimal Date builtin", async () => {
    const cases = [
      ["date-now-basic.ts", "true\n"],
      ["date-constructor-get-time.ts", "1234\n"],
      ["date-value-of.ts", "5678\n"],
      ["date-to-iso-string-epoch.ts", "1970-01-01T00:00:00.000Z\n"],
      ["date-parse-iso-literal.ts", "0\nnan\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
    await expectUnsupportedDiagnostic("date-local-getters-unsupported.ts");
  });

  test("supports package BQ minimal Map and Set", async () => {
    const cases = [
      ["map-basic-set-get.ts", "0\ntrue\n1\n42\nundefined\n"],
      ["map-size-delete-has.ts", "2\ntrue\n3\ntrue\nfalse\n1\nfalse\n"],
      ["map-same-value-zero.ts", "nan\nzero\n2\nnegzero\n"],
      ["map-object-identity-keys.ts", "object\nfalse\narray\n"],
      ["set-basic-add-has.ts", "0\ntrue\n2\ntrue\nfalse\n"],
      ["set-size-delete.ts", "2\ntrue\ntrue\ntrue\nfalse\n1\n"],
      ["set-object-identity-values.ts", "true\nfalse\ntrue\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
    await expectUnsupportedDiagnostic("map-constructor-iterable-unsupported.ts");
    await expectUnsupportedDiagnostic("weak-map-unsupported.ts");
    await expectUnsupportedDiagnostic("weak-set-unsupported.ts");
  });

  test("supports package BR iteration and for...of", async () => {
    const cases = [
      ["for-of-array.ts", "1\n2\n3\n"],
      ["for-of-array-break-continue.ts", "1\n3\ndone\n"],
      ["for-of-string.ts", "a\nb\nc\n"],
      ["for-of-set.ts", "true\nfirst\nthird\nfourth\n"],
      ["for-of-map.ts", "true\nfirst\n1\nthird\n3\nfourth\n4\n"],
      ["iterator-next-basic.ts", "only\nfalse\nundefined\ntrue\n"],
      ["map-keys-values-entries.ts", "a\nfalse\nb\nfalse\ntrue\n1\nfalse\n2\nfalse\na\n1\nfalse\nb\n2\nfalse\ntrue\n"],
      ["set-keys-values-entries.ts", "x\nfalse\ny\nfalse\ntrue\nx\nfalse\ny\nfalse\nx\nx\nfalse\ny\ny\nfalse\ntrue\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  });

  test("supports package BS string method expansion", async () => {
    const cases = [
      ["string-upper-lower-case.ts", "MIXED\nmixed\n"],
      ["string-repeat.ts", "hahaha\n\n"],
      ["string-replace-literal.ts", "1 two one\none two one\n"],
      ["string-replace-all-literal.ts", "1 two 1\n"],
      ["string-split-literal.ts", "3\na\nb\nc\n"],
      ["string-split-limit.ts", "2\na\nb\n"],
      ["string-split-empty-separator.ts", "3\na\nb\nc\n"],
      ["string-pad-start.ts", "007\na7\n"],
      ["string-pad-end.ts", "700\n7aba\n"],
      ["string-trim-start-end.ts", "hi  \n  hi\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
    await expectUnsupportedDiagnostic("string-repeat-negative-unsupported.ts");
    await expectUnsupportedDiagnostic("string-replace-regex-unsupported.ts");
  }, roadmapIntegrationTimeoutMs);

  test("supports package BT math function expansion", async () => {
    const cases = [
      ["math-log-exp.ts", "3\n1\n3\n2\n3\n"],
      ["math-hypot.ts", "5\n"],
      ["math-random.ts", "true\ntrue\n"],
      ["math-trig.ts", "1\n1\n1\n"],
      ["math-bitwise-float.ts", "1.5\n31\n-6\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
    await expectUnsupportedDiagnostic("math-unsupported-advanced.ts");
  }, roadmapIntegrationTimeoutMs);

  test("supports package AA boxed string single-character methods", async () => {
    const cases = [
      ["string-boxed-char-at.ts", "h\no\n\n"],
      ["string-boxed-char-code-at.ts", "104\n111\nnan\n"],
      ["string-boxed-code-point-at.ts", "104\n111\nundefined\n"],
      ["string-boxed-at.ts", "h\no\nundefined\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  });

  test("supports package AB boxed string range and search methods", async () => {
    const cases = [
      ["string-boxed-slice.ts", "hello\nworld\nworld\n"],
      ["string-boxed-substring.ts", "world\nworld\nhello\n"],
      ["string-boxed-substr.ts", "world\nworld\n\n"],
      ["string-boxed-includes.ts", "true\nfalse\ntrue\n"],
      ["string-boxed-index-of.ts", "4\n7\n-1\n11\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  });

  test("supports package AC Number coercion edge cases", async () => {
    const cases = [
      ["number-coercion-empty-string.ts", "0\n"],
      ["number-coercion-whitespace.ts", "0\n3\n3.14\n"],
      ["number-coercion-radix-prefixes.ts", "31\n2\n7\n"],
      ["number-coercion-infinity-nan-string.ts", "inf\n-inf\nnan\nnan\n"],
      ["number-coercion-primitives.ts", "0\nnan\n1\n0\n0\nnan\ninf\n"],
      ["number-coercion-aggregates.ts", "nan\n0\n1\nnan\n"],
      ["number-coercion-signed-zero.ts", "-0\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  });

  test("hardens Object.fromEntries malformed entries", async () => {
    const duplicates = await expectSuccessfulCompile("object-runtime-from-entries-duplicate-keys.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(duplicates, { status: 0, stdout: "second\n1\n", stderr: "" });
    } finally {
      await duplicates.cleanup();
    }

    const malformed = await expectSuccessfulCompile("object-runtime-from-entries-malformed.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(malformed, { status: 0, stdout: "1\nyes\nundefined\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(malformed);
    } finally {
      await malformed.cleanup();
    }
  });

  test("converts runtime arrays to strings and documents scoped number edges", async () => {
    const array = await expectSuccessfulCompile("value-string-conversion-array.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(array, { status: 0, stdout: "a,,true\na,,true\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(array);
    } finally {
      await array.cleanup();
    }

    const numbers = await expectSuccessfulCompile("value-string-conversion-number-edge.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(numbers, { status: 0, stdout: "-0\ninf\n", stderr: "" });
    } finally {
      await numbers.cleanup();
    }
  });

  test("supports runtime aggregate truthiness and Array.isArray classification", async () => {
    const cases = [
      ["runtime-object-truthiness.ts", "object\n"],
      ["runtime-array-truthiness.ts", "empty array\nfilled array\n"],
      ["runtime-aggregate-negated-truthiness.ts", "done\n"],
      ["array-is-array-number.ts", "false\n"],
      ["array-is-array-string.ts", "false\n"],
      ["array-is-array-fixed.ts", "true\n"],
      ["array-is-array-literals.ts", "false\nfalse\nfalse\nfalse\n"],
      ["array-is-array-runtime-and-fixed.ts", "true\ntrue\n"]
    ] as const;

    await expectNativeFixtures(cases);
  });

  test("bridges fixed objects and descriptor maps into runtime helpers", async () => {
    const cases = [
      ["object-keys-fixed.ts", ""],
      ["object-values-fixed.ts", "1\n"],
      ["object-fixed-keys-values-entries.ts", "2\na\nb\n1\n2\n2\na\n1\n"],
      ["object-fixed-own-property-descriptor.ts", "1\ntrue\ntrue\ntrue\nundefined\n"],
      ["object-define-properties-shorthand.ts", ""],
      ["object-define-properties-spread.ts", ""],
      ["object-define-properties-spread-overwrite.ts", "new\n"],
      ["object-define-properties-shorthand-observable.ts", "x\n1\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  });

  test("supports defaulted array ranges and fixed-array materialization bridges", async () => {
    const cases = [
      ["array-runtime-reverse-extra-arg.ts", "a\n"],
      ["array-runtime-noarg-extra-arguments.ts", "c\na\n2\nc\n1\n"],
      ["array-runtime-defaulted-ranges.ts", "3\nundefined\n2\na\nx\nx\na\na\nb\nc\n"],
      ["array-spread.ts", "1\n"],
      ["array-fixed-spread-multiple.ts", "5\n0\n1\n2\n3\n4\n"],
      ["array-runtime-concat-fixed.ts", "4\n"],
      ["array-runtime-concat-fixed-values.ts", "4\na\n1\n2\ntail\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  });

  test("supports runtime array named string properties", async () => {
    const cases = [
      ["array-runtime-string-key-leading-zero.ts", "undefined\n"],
      ["array-runtime-string-key-negative.ts", "undefined\n"],
      ["array-runtime-string-key-fraction.ts", "undefined\n"],
      ["array-runtime-named-string-properties.ts", "1\nzero\nleading\nnegative\nfraction\ntrue\nfalse\nundefined\n"],
      ["array-runtime-named-string-keys-order.ts", "3\n2\nname\n01\n"],
      ["array-runtime-named-string-values-entries.ts", "4\nzero\ntwo\nnamed\nleading\n4\n0\nzero\n2\ntwo\nname\nnamed\n01\nleading\n"],
      ["array-runtime-named-string-descriptors.ts", "5\n0\n2\nlength\nname\n01\nnamed\ntrue\ntrue\ntrue\nnamed\nleading\n"],
      ["array-runtime-named-string-delete-introspection.ts", "2\nzero\nkept\n2\nkeep\n3\n0\nlength\nkeep\nundefined\nfalse\ntrue\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  });

  test("bridges Object.assign sources into runtime object targets", async () => {
    const cases = [
      ["object-assign-runtime-from-fixed.ts", "1\nb\n"],
      ["object-assign-runtime-from-array.ts", "zero\nnamed\nfalse\n"],
      ["object-assign-runtime-from-boxed-aggregates.ts", "object\nzero\narray\n"],
      ["object-assign-runtime-source-order.ts", "2\nfirst-b\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  });

  test("promotes fixed aggregate mutation targets", async () => {
    const cases = [
      ["array-fixed-push.ts", "2\n2\n"],
      ["array-fixed-promoted-unshift.ts", "2\n0\n1\n"],
      ["object-assign-fixed.ts", "1\n2\n"],
      ["object-fixed-promoted-assign-overwrite.ts", "3\n2\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  });

  test("supports descriptor boolean identifiers", async () => {
    const cases = [
      ["object-define-property-dynamic-boolean.ts", "true\n"],
      ["object-define-properties-dynamic-boolean.ts", "1\nvalue\n"],
      ["object-define-property-boolean-identifiers.ts", "1\n1\nfalse\ntrue\nfalse\n"],
      ["object-define-properties-boolean-identifiers.ts", "1\n1\nfalse\ntrue\nfalse\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  });

  test("supports array mutation expression return values", async () => {
    const cases = [
      ["array-runtime-push-unshift-return-values.ts", "2\n3\nb\nz\n1\n"],
      ["array-runtime-mutator-chain-return-array.ts", "c\nc\nx\nx\n"],
      ["array-runtime-pop-shift-return-extra-args.ts", "b\na\n0\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  });

  test("handles prototype edges for named runtime array properties", async () => {
    const cases = [
      ["array-runtime-named-string-prototype-fallback.ts", "proto\nfalse\nown\ntrue\nproto\nfalse\n"],
      ["array-runtime-named-string-prototype-introspection.ts", "1\n1\n2\nname\n2\nown\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  });

  test("supports scoped JSValue coercion, comparisons, Math, parsing, and runtime string methods", async () => {
    const cases = [
      ["value-plus-string-coercion.ts", "a1\ntrue!\nnullx\nundefinedx\n"],
      ["value-plus-number-coercion.ts", "3\n1\n0\nnan\n"],
      ["value-plus-aggregate-coercion.ts", "a,b!\n[object Object]!\n"],
      ["value-loose-equality-primitives.ts", "true\nfalse\ntrue\ntrue\nfalse\n"],
      ["value-loose-equality-string-number.ts", "true\ntrue\nfalse\n"],
      ["value-relational-string-number.ts", "true\ntrue\nfalse\nfalse\n"],
      ["value-relational-string-lexicographic.ts", "true\ntrue\nfalse\n"],
      ["boolean-coercion-supported-values.ts", "false\nfalse\nfalse\nfalse\nfalse\nfalse\ntrue\ntrue\ntrue\ntrue\ntrue\n"],
      ["logical-and-or-value-results.ts", "fallback\nvalue\n0\nright\n"],
      ["math-basic-number-functions.ts", "3\n2\n3\n2\n3\n4\n8\n-1\n"],
      ["math-min-max-variadic.ts", "2\n1\n3\n4\ninf\n-inf\n"],
      ["math-constants.ts", "true\ntrue\n"],
      ["number-is-nan-finite.ts", "true\nfalse\ntrue\nfalse\nfalse\nfalse\n"],
      ["global-is-nan-coercion.ts", "true\nfalse\ntrue\nfalse\n"],
      ["parse-int-decimal.ts", "-42\n17\n5\n"],
      ["parse-float-decimal.ts", "-4.5\n3.25\n"],
      ["number-to-fixed.ts", "3.14\n3\n"],
      ["number-to-precision.ts", "12.35\n12\n"],
      ["number-to-exponential.ts", "1.23e+1\n1.234500e+1\n"],
      ["number-to-string-radix.ts", "255\nff\n11111111\n"],
      ["number-parse-int-float.ts", "42\n3.5\n"],
      ["number-is-integer-safe.ts", "true\nfalse\ntrue\nfalse\nfalse\n"],
      ["number-constants.ts", "9007199254740991\n-9007199254740991\ntrue\ntrue\ntrue\n"],
      ["string-runtime-search-methods.ts", "true\ntrue\ntrue\n4\n-1\n"],
      ["string-runtime-trim-methods.ts", "hi\nhi  \n  hi\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  }, roadmapIntegrationTimeoutMs);

  test("preserves unsupported roadmap diagnostics", async () => {
    await Promise.all([
      "boolean-constructor-unsupported.ts",
      "number-to-fixed-range-error-unsupported.ts",
      "number-to-locale-string-unsupported.ts",
      "parse-int-radix-unsupported.ts",
      "array-runtime-map-unsupported-callback.ts",
      "array-runtime-filter-unsupported-callback.ts",
      "array-runtime-reduce-unsupported-callback.ts",
      "array-runtime-map-noarg-unsupported.ts",
      "error-constructor-unsupported.ts",
      "try-finally-unsupported.ts",
      "throw-across-function-unsupported.ts"
    ].map(async (fixture) => expectUnsupportedDiagnostic(fixture)));
  });

  test("supports first explicit throw and catch groundwork", async () => {
    const caught = await expectSuccessfulCompile("try-catch-throw-primitives.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(caught, { status: 0, stdout: "message\n42\ntrue\nnull\nundefined\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(caught);
    } finally {
      await caught.cleanup();
    }

    const thrown = await expectSuccessfulCompile("throw-string-top-level.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(thrown, { status: 1, stdout: "message\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(thrown);
    } finally {
      await thrown.cleanup();
    }
  });

  test("supports Error constructor objects with message, name, and toString", async () => {
    const cases = [
      ["error-constructor-message.ts", "boom\nError\ncall form\nError\n\nError\n"],
      ["error-constructor-nonstring-message.ts", "42\nnull\ntrue\n"],
      ["error-to-string.ts", "Error: boom\n"],
      ["error-to-string-empty-message.ts", "Error\n"],
      ["error-throw-and-recatch.ts", "boom\nError\nError: boom\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  }, roadmapIntegrationTimeoutMs);

  test("supports instanceof for runtime error objects", async () => {
    const cases = [
      ["instanceof-error-positive.ts", "true\ntrue\n"],
      ["instanceof-error-negative.ts", "false\nfalse\nfalse\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });

    await Promise.all([
      expectUnsupportedMessage("instanceof-primitive-unsupported.ts", "instanceof on primitive values is not supported"),
      expectUnsupportedMessage("instanceof-non-constructor-unsupported.ts", "instanceof right-hand sides are only supported for built-in error constructors")
    ]);
  }, roadmapIntegrationTimeoutMs);

  test("supports typeof for bound identifiers across supported value kinds", async () => {
    const cases = [
      ["typeof-primitives.ts", "undefined\nboolean\nnumber\nstring\nfunction\nobject\n"],
      ["typeof-runtime-aggregates.ts", "object\nobject\nobject\nobject\nobject\n"],
      ["typeof-function.ts", "function\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  }, roadmapIntegrationTimeoutMs);

  test("supports optional chaining and nullish coalescing", async () => {
    const cases = [
      ["nullish-coalesce.ts", "fallback\n7\n0\ndefault\n"],
      ["nullish-coalesce-lazy.ts", "value\nevaluated\nfb\n"],
      ["optional-chain-member.ts", "x\nundefined\nundefined\n"],
      ["optional-chain-short-circuit.ts", "undefined\ndeep\nundefined\n"],
      ["optional-chain-element.ts", "a\nundefined\nv\n"],
      ["optional-chain-call.ts", "undefined\nError: boom\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });

    const write = await compileFixture("optional-chain-write-unsupported.ts");
    try {
      expect(write.status).not.toBe(0);
      expect(write.stderr).toContain("error TS");
    } finally {
      await write.cleanup();
    }
  }, roadmapIntegrationTimeoutMs);

  test("supports computed property names and dynamic object keys", async () => {
    const cases = [
      ["object-computed-key-literal.ts", "v1\nv2\n"],
      ["object-computed-key-expression.ts", "v1\nv2\nv3\n"],
      ["object-bracket-assign-dynamic.ts", "v1\nv2\nfilled\norig\nten\n"],
      ["object-bracket-delete-dynamic.ts", "undefined\n2\n"],
      ["object-define-property-dynamic-key.ts", "dv\ndv2\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  }, roadmapIntegrationTimeoutMs);

  test("supports array and object destructuring patterns", async () => {
    const cases = [
      ["destructure-array-literal.ts", "a\nb\nc\ndirect\n10\n20\n"],
      ["destructure-object-literal.ts", "ex\nwhy\n1\n2\n"],
      ["destructure-array-rest.ts", "a\n3\nb\nd\n"],
      ["destructure-object-rest.ts", "1\n2\n2\n3\n"],
      ["destructure-defaults.ts", "1\nhello\n7\nset\nused\n"],
      ["destructure-rename.ts", "val\no\n"],
      ["destructure-nested.ts", "deep\nt\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });

    await expectUnsupportedDiagnostic("destructure-computed-key-unsupported.ts");
  }, roadmapIntegrationTimeoutMs);

  test("supports built-in error subclass constructors", async () => {
    const cases = [
      ["error-type-error.ts", "wrong type\nTypeError\nTypeError: wrong type\n"],
      ["error-range-error.ts", "out of range\nRangeError\nEvalError\nURIError\n"],
      ["error-instanceof-subclass.ts", "true\ntrue\nfalse\nfalse\ntrue\n"],
      ["error-subclass-throw-catch.ts", "true\ntrue\nnope\nTypeError: nope\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });

    await expectUnsupportedDiagnostic("error-stack-unsupported.ts");
  }, roadmapIntegrationTimeoutMs);

  test("supports JSON.stringify for primitives, arrays, and objects", async () => {
    const cases = [
      ["json-stringify-primitives.ts", '"a"\n1\ntrue\nnull\nnull\nnull\nundefined\n'],
      ["json-stringify-array.ts", '[1,"two",true,null]\n[]\n["a",null,"c"]\n'],
      [
        "json-stringify-object.ts",
        '{"a":1,"b":"x","c":true,"d":null}\n{"inner":{"k":"v"},"num":2}\n{"k":"v"}\n{}\n{"text":"say \\"hi\\"\\n"}\n'
      ],
      ["json-stringify-replacer-array.ts", '{"keep":"yes","n":1}\n'],
      ["json-stringify-indent.ts", '{\n  "a": 1,\n  "c": {\n    "d": "v"\n  }\n}\n[\n  1,\n  "x"\n]\n']
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });

    const cycle = await expectSuccessfulCompile("json-stringify-cycle-throws.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(cycle, {
        status: 1,
        stdout: "TypeError: Converting circular structure to JSON\n",
        stderr: ""
      });
    } finally {
      await cycle.cleanup();
    }
  }, roadmapIntegrationTimeoutMs);

  test("supports JSON.parse for compile-time string inputs", async () => {
    const cases = [
      ["json-parse-primitives.ts", "text\n42\n-1.5\ntrue\nnull\n"],
      ["json-parse-array.ts", "4\na\n2\nfalse\nnull\n"],
      ["json-parse-object.ts", "v\n7\ntrue\ntwo\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });

    const malformed = await expectSuccessfulCompile("json-parse-malformed-throws.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(malformed, {
        status: 1,
        stdout: "SyntaxError: Unexpected token in JSON\n",
        stderr: ""
      });
    } finally {
      await malformed.cleanup();
    }

    const dynamic = await expectSuccessfulCompile("json-parse-dynamic-unsupported.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(dynamic, { status: 0, stdout: "[object Object]\n", stderr: "" });
    } finally {
      await dynamic.cleanup();
    }
  }, roadmapIntegrationTimeoutMs);

  test("supports RegExp literals and literal-only RegExp construction", async () => {
    const cases = [
      ["regex-literal-test.ts", "true\nfalse\ntrue\n"],
      ["regex-literal-exec.ts", "a-b\n2\ntrue\n"],
      ["regex-literal-global-last-index.ts", "true\n2\ntrue\n4\n"],
      ["regex-string-match.ts", "123\n"],
      ["regex-flags-and-source.ts", "foo\ngi\ntrue\ntrue\nfalse\nfalse\n0\n"],
      ["regex-constructor-literal.ts", "true\nfoo\ni\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });

    await Promise.all([
      expectUnsupportedMessage("regex-constructor-dynamic-unsupported.ts", "Dynamic RegExp constructor arguments are not supported"),
      expectUnsupportedMessage("regex-nonascii-unsupported.ts", "RegExp support is limited to ASCII")
    ]);
  }, roadmapIntegrationTimeoutMs);

  test("supports minimal class declarations, prototype identity, fields, and accessors", async () => {
    const cases = [
      ["class-basic-method.ts", "42\n"],
      ["class-constructor.ts", "7\n"],
      ["class-instance-method-call.ts", "7\nhi\n"],
      ["class-static-method.ts", "hi\n"],
      ["class-extends-super-constructor.ts", "9\n"],
      ["class-instanceof-basic.ts", "true\n"],
      ["class-instanceof-inheritance.ts", "true\ntrue\nfalse\n"],
      ["class-prototype-method-lookup.ts", "5\nfalse\n"],
      ["class-prototype-identity.ts", "true\ntrue\n"],
      ["class-instanceof-plain-object.ts", "false\nfalse\nfalse\n"],
      ["class-public-field.ts", "3\n"],
      ["class-field-order.ts", "ab\n"],
      ["class-static-field.ts", "4\n"],
      ["class-getter-setter.ts", "3\n8\n"],
      ["class-accessor-prototype-lookup.ts", "6\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });

    await Promise.all([
      expectUnsupportedMessage("class-expression-unsupported.ts", "Class expressions are not supported"),
      expectUnsupportedMessage("class-private-field-unsupported.ts", "Private class fields are not supported"),
      expectUnsupportedMessage("class-computed-field-unsupported.ts", "Computed class members are not supported")
    ]);

    const nonConstructor = await expectSuccessfulCompile("class-instanceof-non-constructor-unsupported.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(nonConstructor, { status: 1, stdout: "TypeError: notConstructor is not a function. (evaluating 'new C() instanceof notConstructor')\n", stderr: "" });
    } finally {
      await nonConstructor.cleanup();
    }
  }, roadmapIntegrationTimeoutMs);

  test("supports runtime JSON parse, catchable JSON errors, and toJSON", async () => {
    const cases = [
      ["json-parse-runtime-string.ts", "tsc\n"],
      ["json-parse-runtime-object.ts", "1\ntrue\n"],
      ["json-parse-runtime-array.ts", "1\ntwo\nnull\n"],
      ["json-parse-runtime-malformed-catch.ts", "SyntaxError\ntrue\n"],
      ["json-stringify-cycle-catch.ts", "TypeError\ntrue\n"],
      ["json-stringify-to-json.ts", '{"x":2}\n']
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });

    await expectUnsupportedMessage("json-parse-reviver-unsupported.ts", "JSON.parse reviver functions are not supported");
  }, roadmapIntegrationTimeoutMs);

  test("emits nested runtime helper dependencies once", async () => {
    const result = await expectSuccessfulCompile("value-string-conversion-array.ts");
    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(countOccurrences(llvmIr, "define ptr @arrayJoin")).toBe(1);
      expect(countOccurrences(llvmIr, "define ptr @objectEntries")).toBe(0);
      expect(countOccurrences(llvmIr, "define { ptr, i64 } @valueToString")).toBe(1);
      expect(countOccurrences(llvmIr, "declare ptr @malloc(i64)")).toBe(1);
    } finally {
      await result.cleanup();
    }

    const entries = await expectSuccessfulCompile("object-runtime-from-entries.ts");
    try {
      const llvmIr = await entries.readArtifact("main.ll");
      expect(countOccurrences(llvmIr, "define ptr @objectEntries")).toBe(1);
      expect(countOccurrences(llvmIr, "define ptr @objectFromEntries")).toBe(1);
    } finally {
      await entries.cleanup();
    }
  });
});
