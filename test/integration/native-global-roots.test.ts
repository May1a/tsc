import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Effect } from "effect";
import { expect, test } from "vitest";
import { createLlvmModule, llvm } from "../../src/compiler/llvm-ir/index.js";
import { NativeModule } from "../../src/compiler/native-lowering/index.js";
import { runtimeIrText } from "../../src/compiler/runtime-files.js";
import { captureCommand, commandExecutorLayer, toolExecutable } from "./helpers.js";

function globalRootModule(): NativeModule {
  const builder = createLlvmModule({ staticRuntime: [{ origin: "static runtime", text: runtimeIrText() }] });
  const module = new NativeModule(builder);
  const global = module.defineGlobal({
    name: "retained", type: llvm.i64, linkage: "internal", constant: false, unnamedAddress: false,
    initializer: { kind: "integer", type: llvm.i64, value: 9_222_246_136_947_933_184n }
  });
  const writer = module.declareFunction({ name: "writeGlobal", parameters: [], returnsCompletion: true });
  module.defineFunction({ name: "writeGlobal", parameters: [], returnsCompletion: true }, (fn) => {
    fn.openEntry();
    const { cursor, runtime, roots, values, completion } = fn.capabilities;
    const frame = roots.save();
    const block = cursor.currentBlock();
    const value = runtime.callBoxed("valueCopyString", [block.globalPointer(module.stringConstant("retained")), block.int(llvm.i64, 8n)], "retained.value");
    roots.push(value);
    block.store(value, block.globalPointer(global));
    roots.restore(frame);
    completion.returnValue(values.forBlock(block).immediate("undefined"));
  });
  module.defineFunction({ name: "main", parameters: [], returnsCompletion: false, returns: llvm.i32 }, (fn) => {
    fn.openEntry();
    const { cursor, runtime, roots, values, completion } = fn.capabilities;
    runtime.callVoid("gcInit", []);
    const frame = roots.save();
    const address = cursor.currentBlock().globalPointer(global);
    runtime.callVoid("gcRegisterGlobalRoot", [address]);
    runtime.callVoid("gcRegisterGlobalRoot", [address]);
    const failed = { block: cursor.reserveBlock("failed"), payloadSlot: cursor.currentBlock().alloca(llvm.i64, "exception") };
    completion.direct(writer, [], "write", failed);
    runtime.callVoid("gcCollect", []);
    const value = values.forBlock(cursor.currentBlock()).fromBoundary(cursor.currentBlock().load(llvm.i64, address, "retained.loaded"));
    roots.push(value);
    runtime.callVoid("valuePrint", [value]);
    cursor.currentBlock().store(values.forBlock(cursor.currentBlock()).immediate("undefined"), address);
    roots.restore(frame);
    runtime.callVoid("gcCollect", []);
    const bytes = runtime.call("gcStatsLiveBytes", [], "live.bytes");
    const empty = cursor.currentBlock().icmp("eq", bytes, cursor.currentBlock().int(llvm.i64, 0n), "all.released");
    const status = cursor.currentBlock().select(empty, cursor.currentBlock().int(llvm.i32, 0n), cursor.currentBlock().int(llvm.i32, 2n), "status");
    cursor.currentBlock().ret(status);
    cursor.openBlock(failed.block);
    roots.restore(frame);
    cursor.currentBlock().ret(cursor.currentBlock().int(llvm.i32, 1n));
  });
  return module;
}

test("global roots retain a value after its writer returns and release overwritten values", async () => {
  const clang = await toolExecutable("clang");
  if (clang === undefined) return;
  const directory = await mkdtemp(path.join(tmpdir(), "tscn-native-global-roots-"));
  try {
    const source = path.join(directory, "main.ll");
    const executable = path.join(directory, "main");
    await writeFile(source, globalRootModule().render().text);
    const compiled = await Effect.runPromise(captureCommand(clang, [source, "-o", executable]).pipe(Effect.provide(commandExecutorLayer)));
    expect(compiled.status, compiled.stderr).toBe(0);
    const result = await Effect.runPromise(captureCommand(executable, []).pipe(Effect.provide(commandExecutorLayer)));
    expect(result).toEqual({ status: 0, stderr: "", stdout: "retained\n" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
