import { type CompileResult, captureCommand, commandExecutorLayer, compileFixture, expectLlvmAsVerificationIfAvailable, expectNativeBehaviorIfAvailable, expectSuccessfulCompile, expectUnsupportedDiagnostic, expectUnsupportedMessage, repoRoot, roadmapIntegrationTimeoutMs, runNativeIfAvailable, toolExecutable } from "./helpers.js";
import { describe, expect, test } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { Effect } from "effect";
import path from "node:path";
import { tmpdir } from "node:os";

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

  test("compiles the simple example through the Bun CLI entrypoint", async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), "tscn-example-"));
    const llvmIr = path.join(outDir, "main.ll");
    const traceMap = path.join(outDir, "trace-map.json");
    const executable = path.join(outDir, "main");
    const readArtifact = async (name: string): Promise<string> => readFile(path.join(outDir, name), "utf8");

    try {
      const run = await Effect.runPromise(
        captureCommand("bun", [
          "src/cli/main.ts",
          "examples/01-simple.ts",
          "--out-dir",
          outDir
        ], { cwd: repoRoot }).pipe(Effect.provide(commandExecutorLayer))
      );
      const clang = await toolExecutable("clang");
      const cliResult: CompileResult = {
        outDir,
        status: run.status,
        stdout: run.stdout,
        stderr: run.stderr,
        readArtifact,
        cleanup: async () => rm(outDir, { recursive: true, force: true })
      };

      expect(run.status, run.stderr).toBe(0);
      expect(run.stderr).not.toContain("TS6059");
      expect(run.stderr).not.toContain("TSCN1002");
      if (clang === undefined || run.stderr.includes("TSCN2001")) {
        expect(run.stderr).toContain("TSCN2001");
      } else {
        expect(run.stderr).toBe("");
        expect(run.stdout).toContain(`Wrote ${executable}`);
      }
      expect(run.stdout).toContain(`Wrote ${llvmIr}`);
      expect(run.stdout).toContain(`Wrote ${traceMap}`);
      expect(await readArtifact("main.ll")).toContain("define i32 @main()");
      await expectNativeBehaviorIfAvailable(cliResult, { status: 0, stdout: `${Array.from({ length: 100 }, (_, i) => i).join("\n")}\n`, stderr: "" });
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  }, roadmapIntegrationTimeoutMs);

  test("verifies emitted LLVM IR when llvm-as is available", async () => {
    const result = await expectSuccessfulCompile("hello.ts");

    try {
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("rejects inline C++ unless -fcpp is enabled", async () => {
    const result = await compileFixture("inline-cpp-number.ts");

    try {
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("error TSCN1003");
      expect(result.stderr).toContain("Inline C++ requires -fcpp");
    } finally {
      await result.cleanup();
    }
  });

  test("emits inline C++ artifacts when -fcpp is enabled", async () => {
    const result = await expectSuccessfulCompile("inline-cpp-number.ts", { fcpp: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      const inlineCpp = await result.readArtifact("inline-cpp.cpp");
      expect(result.stdout).toContain("inline-cpp.cpp");
      expect(llvmIr).toContain("declare i64 @__tscn_cpp_0()");
      expect(llvmIr).toContain("call i64 @__tscn_cpp_0()");
      expect(inlineCpp).toContain("namespace tscn");
      expect(inlineCpp).toContain("extern \"C\" std::uint64_t __tscn_cpp_0()");
      expect(inlineCpp).toContain("return tscn::number(42);");
    } finally {
      await result.cleanup();
    }
  });

  test("rewrites inline C++ tags inside template placeholders", async () => {
    const result = await expectSuccessfulCompile("inline-cpp-template-placeholder.ts", { fcpp: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      const inlineCpp = await result.readArtifact("inline-cpp.cpp");
      expect(result.stderr).not.toContain("TS1109");
      expect(llvmIr).toContain("call i64 @__tscn_cpp_0()");
      expect(inlineCpp).toContain("return tscn::number(42);");
    } finally {
      await result.cleanup();
    }
  });

  test("accepts the documented -fcpp CLI spelling", async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), "tscn-cpp-flag-"));

    try {
      const run = await Effect.runPromise(
        captureCommand("bun", [
          "src/cli/main.ts",
          "test/fixtures/inline-cpp-number.ts",
          "--out-dir",
          outDir,
          "-fcpp"
        ], { cwd: repoRoot }).pipe(Effect.provide(commandExecutorLayer))
      );

      expect(run.status, run.stderr).toBe(0);
      expect(run.stderr).not.toContain("Received unknown argument");
      expect(run.stdout).toContain(`Wrote ${path.join(outDir, "inline-cpp.cpp")}`);
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  }, roadmapIntegrationTimeoutMs);

  test("supports inline C++ expression statements", async () => {
    const result = await expectSuccessfulCompile("inline-cpp-statement.ts", { fcpp: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      const inlineCpp = await result.readArtifact("inline-cpp.cpp");
      expect(llvmIr).toContain("call i64 @__tscn_cpp_0()");
      expect(inlineCpp).toContain(String.raw`std::printf("hi!\n");`);
      expect(inlineCpp).toContain("return tscn::undefined();");
    } finally {
      await result.cleanup();
    }
  });

  test("runs inline C++ through clang++ when available", async () => {
    const result = await compileFixture("inline-cpp-number.ts", { fcpp: true, link: true });

    try {
      const clangxx = await toolExecutable("clang++");
      if (clangxx === undefined || result.stderr.includes("TSCN2004")) {
        expect(result.status).toBe(0);
        expect(result.stderr).toContain("TSCN2004");
        return;
      }
      if (result.stderr.includes("TSCN2003")) {
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain("clang++ failed");
        return;
      }
      expect(result.status, result.stderr).toBe(0);
      const native = await runNativeIfAvailable(result);
      expect(native.skipped, native.reason).toBe(false);
      expect(native.status).toBe(0);
      expect(native.stdout).toBe("42\n");
      expect(native.stderr).toBe("");
    } finally {
      await result.cleanup();
    }
  }, roadmapIntegrationTimeoutMs);

  test("rejects inline C++ interpolation for the first slice", async () => {
    const result = await compileFixture("inline-cpp-interpolation-unsupported.ts", { fcpp: true });

    try {
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("error TSCN1002");
      expect(result.stderr).toContain("Inline C++ interpolation is not supported yet");
    } finally {
      await result.cleanup();
    }
  });

  test("writes a trace map for emitted modules", async () => {
    const result = await expectSuccessfulCompile("hello.ts");

    try {
      const traceMap = JSON.parse(await result.readArtifact("trace-map.json")) as {
        readonly version: number;
        readonly modules: readonly { readonly loweringMode: string }[];
        readonly operations: readonly unknown[];
      };
      expect(traceMap.version).toBe(1);
      expect(traceMap.modules).toHaveLength(1);
      expect(traceMap.modules[0].loweringMode).toBe("native");
      expect(traceMap.operations.length).toBeGreaterThan(0);
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
      expect(diagnostics).toContain("Unsupported statement in the current lowering slice: IfStatement");
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

  test("supports object methods as first-class function values", async () => {
    const result = await expectSuccessfulCompile("object-method.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "1\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
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
