import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Effect } from "effect";
import { expect, test } from "vitest";
import { createLlvmModule } from "../../src/compiler/llvm-ir/index.js";
import { runtimeIrText } from "../../src/compiler/runtime-files.js";
import { defineStructuredRuntimeHelpers } from "../../src/compiler/runtime-ir.js";
import { captureCommand, commandExecutorLayer, toolExecutable } from "./helpers.js";

test("shared array callbacks preserve results, receiver and throws during forced collection", async () => {
  const clang = await toolExecutable("clang");
  if (clang === undefined) {
    return;
  }
  const directory = await mkdtemp(path.join(tmpdir(), "tscn-runtime-callbacks-"));
  try {
    const module = createLlvmModule({ staticRuntime: [] });
    defineStructuredRuntimeHelpers(module);
    const fixture = await readFile(new URL("../fixtures/runtime-callbacks.ll", import.meta.url), "utf8");
    const source = path.join(directory, "main.ll");
    const executable = path.join(directory, "main");
    await writeFile(source, [
      "declare i32 @puts(ptr)",
      "declare i32 @printf(ptr, ...)",
      "declare void @exit(i32)",
      runtimeIrText(), module.render().text, fixture
    ].join("\n"));
    const compiled = await Effect.runPromise(captureCommand(clang, [source, "-o", executable])
      .pipe(Effect.provide(commandExecutorLayer)));
    expect(compiled.status, compiled.stderr).toBe(0);
    const result = await Effect.runPromise(captureCommand(executable, []).pipe(Effect.provide(commandExecutorLayer)));
    expect(result).toEqual({
      status: 0,
      stdout: [
        "false", "3", "8", "9", "10",
        "false", "2", "2", "3",
        "false", "6", "1", "1", "2", "2", "3", "3",
        "false", "undefined", "false", "2", "false", "1", "true", "42",
        "false", "13", "false", "6", "false", "13", "false", "6", "false", "7",
        "true", "TypeError: Reduce of empty array with no initial value", ""
      ].join("\n"),
      stderr: ""
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
