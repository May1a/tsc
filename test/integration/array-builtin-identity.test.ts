import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Effect } from "effect";
import { createLlvmModule } from "../../src/compiler/llvm-ir/index.js";
import { runtimeIrText } from "../../src/compiler/runtime-files.js";
import { defineStructuredRuntimeHelpers } from "../../src/compiler/runtime-ir.js";
import { expect, test } from "vitest";
import { captureCommand, commandExecutorLayer, expectNativeBehaviorIfAvailable, expectSuccessfulCompile, toolExecutable } from "./helpers.js";

test("array builtin function identity is shared across reads and receivers", async () => {
  const result = await expectSuccessfulCompile("array-builtin-identity.ts", { link: true });
  try {
    await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "true\ntrue\nfalse\n", stderr: "" });
  } finally {
    await result.cleanup();
  }
});

test("array builtins retain identity, names and arities through collection", async () => {
  const clang = await toolExecutable("clang");
  if (clang === undefined) return;
  const directory = await mkdtemp(path.join(tmpdir(), "tscn-array-builtin-identity-"));
  try {
    const module = createLlvmModule({ staticRuntime: [] });
    defineStructuredRuntimeHelpers(module);
    const fixture = await readFile(new URL("../fixtures/runtime-array-builtin-identity.ll", import.meta.url), "utf8");
    const source = path.join(directory, "main.ll");
    const executable = path.join(directory, "main");
    await writeFile(source, [
      "declare i32 @puts(ptr)", "declare i32 @printf(ptr, ...)", "declare void @exit(i32)",
      runtimeIrText(), module.render().text, fixture
    ].join("\n"));
    const compiled = await Effect.runPromise(captureCommand(clang, [source, "-o", executable, "-lm"])
      .pipe(Effect.provide(commandExecutorLayer)));
    expect(compiled.status, compiled.stderr).toBe(0);
    const result = await Effect.runPromise(captureCommand(executable, []).pipe(Effect.provide(commandExecutorLayer)));
    expect(result).toEqual({
      status: 0,
      stderr: "",
      stdout: [
        "values", "0",
        "true\ntrue\ntrue\nat\n1",
        "true\ntrue\ntrue\nconcat\n1",
        "true\ntrue\ntrue\ncopyWithin\n2",
        "true\ntrue\ntrue\nentries\n0",
        "true\ntrue\ntrue\nfill\n1",
        "true\ntrue\ntrue\nfilter\n1",
        "true\ntrue\ntrue\nfind\n1",
        "true\ntrue\ntrue\nfindIndex\n1",
        "true\ntrue\ntrue\nflat\n0",
        "true\ntrue\ntrue\nflatMap\n1",
        "true\ntrue\ntrue\nforEach\n1",
        "true\ntrue\ntrue\nincludes\n1",
        "true\ntrue\ntrue\nindexOf\n1",
        "true\ntrue\ntrue\njoin\n1",
        "true\ntrue\ntrue\nkeys\n0",
        "true\ntrue\ntrue\nlastIndexOf\n1",
        "true\ntrue\ntrue\nmap\n1",
        "true\ntrue\ntrue\npop\n0",
        "true\ntrue\ntrue\npush\n1",
        "true\ntrue\ntrue\nreduce\n1",
        "true\ntrue\ntrue\nreduceRight\n1",
        "true\ntrue\ntrue\nreverse\n0",
        "true\ntrue\ntrue\nshift\n0",
        "true\ntrue\ntrue\nslice\n2",
        "true\ntrue\ntrue\nsort\n1",
        "true\ntrue\ntrue\nsplice\n2",
        "true\ntrue\ntrue\ntoString\n0",
        "true\ntrue\ntrue\nunshift\n1",
        "true\ntrue\ntrue\nvalues\n0",
        "true", "undefined", "42", "map", "false", "1", "0", "false", "42", "true", ""
      ].join("\n")
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
