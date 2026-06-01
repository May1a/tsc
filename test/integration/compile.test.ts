import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const cli = path.join(repoRoot, "dist/cli/main.js");

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

const compileFixture = async (fixture: string): Promise<CompileResult> => {
  const outDir = await mkdtemp(path.join(tmpdir(), "tscn-"));
  const result = spawnSync(
    process.execPath,
    [cli, `test/fixtures/${fixture}`, "--out-dir", outDir],
    { cwd: repoRoot, encoding: "utf8" }
  );

  return {
    outDir,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    readArtifact: (name) => readFile(path.join(outDir, name), "utf8"),
    cleanup: () => rm(outDir, { recursive: true, force: true })
  };
};

const expectSuccessfulCompile = async (fixture: string): Promise<CompileResult> => {
  const result = await compileFixture(fixture);
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

const runNativeIfAvailable = (result: CompileResult): NativeRunResult => {
  const executable = path.join(result.outDir, "main");
  const native = spawnSync(executable, [], { encoding: "utf8" });
  if (native.error !== undefined) {
    return { skipped: true, reason: native.error.message };
  }
  return { skipped: false, status: native.status, stdout: native.stdout, stderr: native.stderr };
};

const countOccurrences = (value: string, needle: string): number => value.split(needle).length - 1;

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
    const result = await expectSuccessfulCompile("hello.ts");

    try {
      const native = runNativeIfAvailable(result);
      if (native.skipped) {
        expect(native.reason).toContain("ENOENT");
        const diagnostics = await result.readArtifact("diagnostics.txt");
        expect(diagnostics).toContain("clang was not found");
        return;
      }
      expect(native.status, native.stderr).toBe(0);
      expect(native.stdout).toBe("hello from tscn\n");
      expect(native.stderr).toBe("");
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
      expect(llvmIr).toContain("call i32 (ptr, ...) @printf(ptr @.fmt.number, double 42)");
    } finally {
      await result.cleanup();
    }
  });

  test("preserves numeric expression shape in print calls", async () => {
    const result = await expectSuccessfulCompile("number-expression-print.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%num.0 = fadd double 1, 2");
      expect(llvmIr).toContain("call i32 (ptr, ...) @printf(ptr @.fmt.number, double %num.0)");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers top-level const number bindings used by print", async () => {
    const result = await expectSuccessfulCompile("const-number.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("call i32 (ptr, ...) @printf(ptr @.fmt.number, double 42)");
    } finally {
      await result.cleanup();
    }
  });

  test("preserves numeric expression shape in const number bindings used by print", async () => {
    const result = await expectSuccessfulCompile("const-number-addition.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%num.0 = fadd double 40, 2");
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
      expect(llvmIr.indexOf("call i32 (ptr, ...) @printf(ptr @.fmt.number, double 3)")).toBeLessThan(
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

  test("rejects unsupported array runtime boundaries", async () => {
    const fixtures = ["array-hole.ts", "array-spread.ts", "array-non-numeric.ts"];

    await Promise.all(fixtures.map(async (fixture) => expectUnsupportedDiagnostic(fixture)));
  });

  test("explains unsupported array runtime boundaries precisely", async () => {
    const expectations = new Map([
      ["array-hole.ts", "Array holes are not supported"],
      ["array-spread.ts", "Array spread elements are not supported"],
      ["array-non-numeric.ts", "fixed numeric arrays only store numbers"]
    ]);

    await Promise.all([...expectations].map(async ([fixture, message]) => expectUnsupportedMessage(fixture, message)));
  });

  test("rejects unsupported object runtime boundaries", async () => {
    const fixtures = ["object-spread.ts", "object-shorthand.ts", "object-method.ts", "object-dynamic-key.ts", "object-non-numeric-field.ts"];

    await Promise.all(fixtures.map(async (fixture) => expectUnsupportedDiagnostic(fixture)));
  });

  test("explains unsupported object runtime boundaries precisely", async () => {
    const expectations = new Map([
      ["object-spread.ts", "Object spread properties are not supported"],
      ["object-shorthand.ts", "Object shorthand properties are not supported"],
      ["object-method.ts", "Object methods are not supported"],
      ["object-dynamic-key.ts", "Dynamic computed object keys are not supported"],
      ["object-non-numeric-field.ts", "Non-number object fields are not supported"]
    ]);

    await Promise.all([...expectations].map(async ([fixture, message]) => expectUnsupportedMessage(fixture, message)));
  });
});

describe("tscn numeric conditions and bindings", () => {
  test("lowers numeric strict equality in if conditions", async () => {
    const result = await expectSuccessfulCompile("if-number-strict-equality.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%cmp.0 = fcmp oeq double 3, 3");
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
      expect(llvmIr).toContain("%num.0 = fadd double 1, 2");
      expect(llvmIr).toContain("%cmp.0 = fcmp oeq double %num.0, 3");
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
      expect(llvmIr).toContain("%num.0 = fadd double 1, 2");
      expect(llvmIr).toContain("%cmp.0 = fcmp oeq double %num.0, 3");
      expect(llvmIr).toContain("br i1 %cmp.0, label %if.then.0, label %if.else.0");
      expect(llvmIr).toContain("if.then.0:");
      expect(llvmIr).toContain("%num.1 = fadd double 1, 2");
      expect(llvmIr).toContain("call i32 (ptr, ...) @printf(ptr @.fmt.number, double %num.1)");
      expect(llvmIr).toContain("if.else.0:");
      expect(llvmIr).toContain("call i32 (ptr, ...) @printf(ptr @.fmt.number, double 0)");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers numeric strict inequality (!==) in if conditions", async () => {
    const result = await expectSuccessfulCompile("if-number-not-strict-equality.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%cmp.0 = fcmp one double 1, 2");
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
      expect(llvmIr).toContain("%cmp.0 = fcmp olt double 1, 2");
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
      expect(llvmIr).toContain("%cmp.0 = fcmp ole double 2, 2");
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
      expect(llvmIr).toContain("%cmp.0 = fcmp ogt double 2, 1");
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
      expect(llvmIr).toContain("%cmp.0 = fcmp oge double 2, 2");
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
      expect(llvmIr).toContain("%num.0 = fneg double 42");
      expect(llvmIr).toContain("call i32 (ptr, ...) @printf(ptr @.fmt.number, double %num.0)");
    } finally {
      await result.cleanup();
    }
  });

  test("preserves unary negation shape for const number bindings used by print", async () => {
    const result = await expectSuccessfulCompile("const-number-unary-negation-print.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%num.0 = fneg double 3");
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
      expect(llvmIr).toContain("call void @add(double 1, double 2)");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers return statements and captures call results in expressions", async () => {
    const result = await expectSuccessfulCompile("function-return.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define double @double(double %p0)");
      expect(llvmIr).toContain("call double @double(double 3)");
      expect(llvmIr).toContain("ret double %");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers recursive functions with forward declarations", async () => {
    const result = await expectSuccessfulCompile("function-recursive.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("declare double @fib(double)");
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
      expect(llvmIr).toContain("call i32 (ptr, ...) @printf(ptr @.fmt.number, double 42)");
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
      expect(llvmIr).toContain("%call.0 = call double @add(double 1, double 2)");
      expect(llvmIr).toContain("call i32 (ptr, ...) @printf(ptr @.fmt.number, double %call.0)");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers mutual recursion across imported modules with forward declarations", async () => {
    const result = await expectSuccessfulCompile("import-mutual-recursion.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("declare double @isEven(double)");
      expect(llvmIr).toContain("declare double @isOdd(double)");
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
      expect(llvmIr).toContain("%call.0 = call double @adder(double 3, double 5)");
      expect(llvmIr).toContain("call i32 (ptr, ...) @printf(ptr @.fmt.number, double %call.0)");
    } finally {
      await result.cleanup();
    }
  });

  test("rejects string function parameters with an ABI diagnostic", async () => {
    await expectUnsupportedMessage("function-string-param.ts", "String parameters in function declarations are not supported");
  });

  test("rejects string function returns with an ABI diagnostic", async () => {
    await expectUnsupportedMessage("function-string-return.ts", "String returns from functions are not supported");
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
      expect(llvmIr).toContain("store double 0, ptr %i.addr");
      expect(llvmIr).toContain("store double %num.");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers for loops with initializer, condition, and increment", async () => {
    const result = await expectSuccessfulCompile("for-loop.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("store double 0, ptr %i.addr");
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
      expect(llvmIr).toContain("%cmp.0 = fcmp ogt double 12, 10");
      expect(llvmIr).toContain("select i1 %cmp.0, double 12, double 10");
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
      expect(llvmIr).toContain("@arr.0 = global [3 x double] [double 10, double 20, double 30]");
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
      expect(llvmIr).toContain("call i32 (ptr, ...) @printf(ptr @.fmt.number, double 3)");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers array element mutation", async () => {
    const result = await expectSuccessfulCompile("array-mutation.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("store double 99, ptr %arr.gep.");
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
      expect(llvmIr).toContain("%num.0 = fadd double 10, 1");
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
      expect(llvmIr).toContain("fcmp olt double %num.0, 3");
      expect(llvmIr).toContain("getelementptr [3 x double], ptr @arr.0");
    } finally {
      await loop.cleanup();
    }
  });

  test("keeps multiple array literals deterministic and non-colliding", async () => {
    const result = await expectSuccessfulCompile("array-multiple-literals.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("@arr.0 = global [2 x double] [double 1, double 2]");
      expect(llvmIr).toContain("@arr.1 = global [2 x double] [double 3, double 4]");
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
      expect(llvmIr).toContain("@arr.0 = global [3 x double] [double 1, double 2, double 3]");
      expect(llvmIr).toContain("store double 3, ptr %arr.gep.");
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
});

describe("tscn objects", () => {
  test("lowers object literals and dot access", async () => {
    const result = await expectSuccessfulCompile("object-dot-access.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%obj.0 = type { double, double }");
      expect(llvmIr).toContain("%obj.addr = alloca %obj.0");
      expect(llvmIr).toContain("load double, ptr %obj.gep.");
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
      expect(llvmIr).toContain("store double 99, ptr %obj.gep.");
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
      expect(llvmIr).toContain("store double 99, ptr %obj.gep.");
      expect(llvmIr).toContain("load double, ptr %obj.gep.");
    } finally {
      await result.cleanup();
    }
  });

  test("preserves numeric expression fields and nested object mutation", async () => {
    const expression = await expectSuccessfulCompile("object-expression-field.ts");

    try {
      const llvmIr = await expression.readArtifact("main.ll");
      expect(llvmIr).toContain("%num.0 = fadd double 40, 2");
      expect(llvmIr).toContain("store double %num.0, ptr %obj.gep.");
    } finally {
      await expression.cleanup();
    }

    const nested = await expectSuccessfulCompile("object-nested-mutation.ts");

    try {
      const llvmIr = await nested.readArtifact("main.ll");
      expect(llvmIr).toContain("getelementptr %obj.0, ptr %obj.addr, i32 0, i32 0, i32 0");
      expect(llvmIr).toContain("store double 42, ptr %obj.gep.");
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
