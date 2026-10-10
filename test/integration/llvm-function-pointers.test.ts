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

const runtimeSource = `define i64 @runtimeTwice(i64 %value) {
entry:
  %doubled = mul i64 %value, 2
  ret i64 %doubled
}
`;

const unaryI64 = { returns: llvm.i64, parameterTypes: [llvm.i64], variadic: false } as const;

let outDir: string;

beforeAll(async () => {
  outDir = await mkdtemp(path.join(tmpdir(), "tscn-function-pointers-"));
});

afterAll(async () => {
  await rm(outDir, { recursive: true, force: true });
});

async function compileAndRun(text: string): Promise<NativeRun> {
  const clang = await toolExecutable("clang");
  if (clang === undefined) {
    return { skipped: true, reason: "clang was not found" };
  }

  const id = crypto.randomUUID();
  const irPath = path.join(outDir, `${id}.ll`);
  const binaryPath = path.join(outDir, id);
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

function moduleWithRuntimeFunction(): string {
  const module = createLlvmModule({ staticRuntime: [{ origin: "static runtime fixture", text: runtimeSource }] });
  const twice = module.registerStaticRuntimeFunction({
    name: "runtimeTwice",
    parameters: [{ name: "value", type: llvm.i64 }],
    returns: llvm.i64
  });
  module.defineFunction({ name: "main", parameters: [], returns: llvm.i32 }, (fn) => {
    fn.block("entry", (block) => {
      const doubled = block.callIndirect(block.functionPointer(twice), unaryI64, [block.int(llvm.i64, 21n)], "doubled");
      block.ret(block.cast("trunc", doubled, llvm.i32, "status"));
    });
  });
  return module.render().text;
}

function moduleWithStoredAddress(): string {
  const module = createLlvmModule({ staticRuntime: [] });
  const doubleSpec = {
    name: "typedDouble",
    parameters: [{ name: "value", type: llvm.i64 }],
    returns: llvm.i64
  } as const;
  const double = module.declareFunction(doubleSpec);

  module.defineFunction({ name: "main", parameters: [], returns: llvm.i32 }, (fn) => {
    const entry = fn.openBlock("entry");
    const slot = entry.alloca(llvm.ptr, "slot");
    entry.store(entry.functionPointer(double), slot);
    entry.br(fn.label("invoke"));
    const invoke = fn.openBlock("invoke");
    const target = invoke.load(llvm.ptr, slot, "target");
    const sum = invoke.callIndirect(target, unaryI64, [invoke.int(llvm.i64, 30n)], "sum");
    invoke.ret(invoke.cast("trunc", sum, llvm.i32, "status"));
  });
  module.defineFunction(doubleSpec, (fn) => {
    fn.block("entry", (block) => {
      block.ret(block.add(fn.parameter(0, llvm.i64), fn.parameter(0, llvm.i64), "sum"));
    });
  });
  return module.render().text;
}

describe("owned function addresses against clang", () => {
  test("calls a static runtime function through the address the builder owns", async () => {
    const text = moduleWithRuntimeFunction();
    expect(text).toContain("%doubled = call i64 @runtimeTwice(i64 21)");
    expect(text).not.toContain("declare i64 @runtimeTwice");

    const result = await compileAndRun(text);
    if (result.skipped) {
      expect(result.reason).toContain("clang was not found");
      return;
    }
    expect(result.stderr).toBe("");
    expect(result.status).toBe(42);
  }, roadmapIntegrationTimeoutMs);

  test("calls a stored, reloaded address of a function this module defines", async () => {
    const text = moduleWithStoredAddress();
    expect(text).toContain("store ptr @typedDouble, ptr %slot");
    expect(text).toContain("%sum = call i64 %target(i64 30)");
    expect(text).not.toContain("declare i64 @typedDouble");

    const result = await compileAndRun(text);
    if (result.skipped) {
      expect(result.reason).toContain("clang was not found");
      return;
    }
    expect(result.stderr).toBe("");
    expect(result.status).toBe(60);
  }, roadmapIntegrationTimeoutMs);
});
