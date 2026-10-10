import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Effect } from "effect";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createLlvmModule, llvm } from "../../src/compiler/llvm-ir/index.js";
import { captureCommand, commandExecutorLayer, roadmapIntegrationTimeoutMs, toolExecutable } from "./helpers.js";


interface NativeRun {
  readonly skipped: boolean;
  readonly reason?: string;
  readonly status?: number | null;
  readonly stderr?: string;
}

const runtimeSource = `define i64 @runtimeAdd(i64 %left, i64 %right) {
entry:
  %sum = add i64 %left, %right
  ret i64 %sum
}

@runtimeResult = internal global i64 0
`;

let outDir: string;

beforeAll(async () => {
  outDir = await mkdtemp(path.join(tmpdir(), "tscn-static-runtime-"));
});

afterAll(async () => {
  await rm(outDir, { recursive: true, force: true });
});

async function compileAndRun(): Promise<NativeRun> {
  const clang = await toolExecutable("clang");
  if (clang === undefined) {
    return { skipped: true, reason: "clang was not found" };
  }

  const module = createLlvmModule({ staticRuntime: [{ origin: "static runtime fixture", text: runtimeSource }] });
  const add = module.registerStaticRuntimeFunction({
    name: "runtimeAdd",
    parameters: [{ name: "left", type: llvm.i64 }, { name: "right", type: llvm.i64 }],
    returns: llvm.i64
  });
  const result = module.registerStaticRuntimeGlobal("runtimeResult", llvm.i64);

  // `run` calls the blob's function and writes through the blob's global. Neither produces a second
  // definition, and both stay typed: the call result is an `i64` and the store's operand is an `i64`.
  const run = module.defineFunction({ name: "run", parameters: [], returns: llvm.void }, (fn) => {
    fn.block("entry", (block) => {
      const sum = block.call(add, [block.int(llvm.i64, 20n), block.int(llvm.i64, 22n)], "sum");
      block.store(sum, block.globalPointer(result));
      block.ret();
    });
  });

  // `main` exits with what the blob's global then holds, truncated to a process status. A wrong value is
  // a non-zero status, so running the binary is the assertion.
  module.defineFunction({ name: "main", parameters: [], returns: llvm.i32 }, (fn) => {
    fn.block("entry", (block) => {
      block.call(run, []);
      const loaded = block.load(llvm.i64, block.globalPointer(result), "loaded");
      block.ret(block.cast("trunc", loaded, llvm.i32, "status"));
    });
  });

  const { text } = module.render();
  expect(text).not.toContain("declare i64 @runtimeAdd");
  expect(text.match(/define i64 @runtimeAdd/g)).toHaveLength(1);
  expect(text).toContain("%sum = call i64 @runtimeAdd(i64 20, i64 22)");
  expect(text).toContain("store i64 %sum, ptr @runtimeResult");

  const irPath = path.join(outDir, "main.ll");
  const binaryPath = path.join(outDir, "main");
  await writeFile(irPath, text, "utf8");

  const compiled = await Effect.runPromise(
    captureCommand(clang, [irPath, "-o", binaryPath]).pipe(Effect.provide(commandExecutorLayer))
  );
  expect(compiled.status, compiled.stderr).toBe(0);

  const executed = await Effect.runPromise(
    captureCommand(binaryPath, []).pipe(Effect.provide(commandExecutorLayer))
  );
  return { skipped: false, status: executed.status, stderr: executed.stderr };
}

describe("static runtime symbol registration", () => {
  test("links one definition against a typed call, and the call's result survives the round trip", async () => {
    const result = await compileAndRun();
    if (result.skipped) {
      expect(result.reason).toContain("clang was not found");
      return;
    }
    expect(result.stderr).toBe("");
    expect(result.status).toBe(42);
  }, roadmapIntegrationTimeoutMs);
});