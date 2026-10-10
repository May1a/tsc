import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Effect } from "effect";
import { expect, test } from "vitest";
import { BindingRegistry, type ResolvedModule } from "../../src/compiler/binding-resolution/index.js";
import { createLlvmModule, llvm } from "../../src/compiler/llvm-ir/index.js";
import { ModuleBindings } from "../../src/compiler/native-lowering/module-bindings.js";
import { NativeModule } from "../../src/compiler/native-lowering/module-owner.js";
import { runtimeIrText } from "../../src/compiler/runtime-files.js";
import { captureCommand, commandExecutorLayer, toolExecutable } from "../integration/helpers.js";

function nativeModule(): NativeModule {
  const builder = createLlvmModule({ staticRuntime: [{ origin: "static runtime", text: runtimeIrText() }] });
  return new NativeModule(builder);
}

function resolved(registry: BindingRegistry): ResolvedModule {
  return { entry: "/entry.ts", modules: [], inlineCppBlocks: [], bindings: registry.table() };
}

async function run(module: NativeModule): Promise<string> {
  const clang = await toolExecutable("clang");
  if (clang === undefined) throw new Error("Native binding tests require clang");
  const directory = await mkdtemp(path.join(tmpdir(), "tscn-binding-storage-"));
  try {
    const ir = path.join(directory, "main.ll");
    const binary = path.join(directory, "main");
    await writeFile(ir, module.render().text);
    const compiled = await Effect.runPromise(captureCommand(clang, [ir, "-o", binary]).pipe(Effect.provide(commandExecutorLayer)));
    expect(compiled.status, compiled.stderr).toBe(0);
    const executed = await Effect.runPromise(captureCommand(binary, []).pipe(Effect.provide(commandExecutorLayer)));
    expect(executed.status, executed.stderr).toBe(0);
    return executed.stdout;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("shadowed scalar slots, shared captures, and persistent String globals survive native collection", async () => {
  const registry = new BindingRegistry();
  const mainOwner = registry.mintFunction();
  const childOwner = registry.mintFunction();
  const global = registry.mint("same", "let", { kind: "number" }, { kind: "module" });
  const local = registry.mint("same", "let", { kind: "number" }, { kind: "function", function: mainOwner });
  const captured = registry.mint("captured", "let", { kind: "number" }, { kind: "function", function: mainOwner });
  registry.markCaptured(captured);
  const text = registry.mint("text", "let", { kind: "string" }, { kind: "module" });
  const module = nativeModule();
  const plan = new ModuleBindings(module, resolved(registry));
  const mutate = module.declareFunction({ name: "mutate", parameters: [{ name: "env", type: llvm.ptr }], returns: llvm.void, returnsCompletion: false });
  module.defineFunction({ name: "mutate", parameters: [{ name: "env", type: llvm.ptr }], returns: llvm.void, returnsCompletion: false }, (fn) => {
    fn.openEntry();
    const { roots, cursor } = fn.capabilities;
    const frame = roots.save();
    const bindings = plan.allocate(fn.capabilities, childOwner, { environment: fn.parameter(0, llvm.ptr), bindings: [captured] });
    bindings.storeNumber(captured, cursor.currentBlock().fadd(bindings.number(captured), cursor.currentBlock().double(1), "incremented"));
    roots.restore(frame);
    cursor.currentBlock().ret();
  });
  const initStringSpec = { name: "initialize_string", parameters: [], returns: llvm.void, returnsCompletion: false } as const;
  const initString = module.declareFunction(initStringSpec);
  module.defineFunction(initStringSpec, (fn) => {
    fn.openEntry();
    const { roots, cursor } = fn.capabilities;
    const frame = roots.save();
    const bindings = plan.allocate(fn.capabilities, "module");
    bindings.storeString(text, { bytes: cursor.currentBlock().globalPointer(module.stringConstant("kept")), length: cursor.currentBlock().int(llvm.i64, 4n) });
    roots.restore(frame);
    cursor.currentBlock().ret();
  });
  module.defineFunction({ name: "main", parameters: [], returns: llvm.i32, returnsCompletion: false }, (fn) => {
    fn.openEntry();
    const { cursor, runtime, roots, values } = fn.capabilities;
    runtime.callVoid("gcInit", []);
    plan.registerGlobalRoots(fn.capabilities);
    const frame = roots.save();
    const bindings = plan.allocate(fn.capabilities, mainOwner);
    bindings.storeNumber(global, cursor.currentBlock().double(10));
    bindings.storeNumber(local, cursor.currentBlock().double(20));
    bindings.storeNumber(captured, cursor.currentBlock().double(41));
    runtime.callVoid("valuePrint", [bindings.value(global)]);
    runtime.callVoid("valuePrint", [bindings.value(local)]);
    runtime.callVoid("valuePrint", [bindings.value(captured)]);
    const env = runtime.callPointer("environmentNew", [cursor.currentBlock().int(llvm.i64, 1n)], "closure.env");
    const owner = values.forBlock(cursor.currentBlock()).boxReference("object", env);
    roots.push(owner);
    runtime.callVoid("environmentSet", [env, cursor.currentBlock().int(llvm.i64, 0n), bindings.captureCell(captured)]);
    cursor.currentBlock().call(mutate, [env]);
    runtime.callVoid("valuePrint", [bindings.value(captured)]);
    cursor.currentBlock().call(initString, []);
    runtime.callVoid("gcCollect", []);
    runtime.callVoid("valuePrint", [bindings.value(text)]);
    roots.restore(frame);
    cursor.currentBlock().ret(cursor.currentBlock().int(llvm.i32, 0n));
  });
  expect(await run(module)).toBe("10\n20\n41\n42\nkept\n");
});

test("fixed array elements and fixed object shadows share initialized entry allocation", async () => {
  const registry = new BindingRegistry();
  const array = registry.mint("array", "const", { kind: "fixedArray", length: 2 }, { kind: "module" });
  const object = registry.mint("object", "const", { kind: "fixedObject", fieldCount: 1 }, { kind: "module" });
  const resolvedModule = resolved(registry);
  const withObject: ResolvedModule = { ...resolvedModule, modules: [{ fileName: "/entry.ts", statementCount: 1, loweringMode: "native", functionObjects: [],
    operations: [{ kind: "objectLiteral", name: object, needsRuntimeShadow: true,
      value: { fields: [{ name: "x", value: { kind: "number", value: { kind: "literal", value: 1 } } }] } }] }] };
  const module = nativeModule();
  const plan = new ModuleBindings(module, withObject);
  module.defineFunction({ name: "main", parameters: [], returns: llvm.i32, returnsCompletion: false }, (fn) => {
    fn.openEntry();
    const { cursor, runtime, roots, values } = fn.capabilities;
    runtime.callVoid("gcInit", []);
    plan.registerGlobalRoots(fn.capabilities);
    const frame = roots.save();
    const bindings = plan.allocate(fn.capabilities, "module");
    bindings.initializeFixedArray(array, [cursor.currentBlock().double(3), cursor.currentBlock().double(4)]);
    runtime.callVoid("valuePrint", [values.forBlock(cursor.currentBlock()).boxNumber(cursor.currentBlock().load(llvm.double,
      bindings.arrayElement(array, cursor.currentBlock().int(llvm.i64, 1n)), "array.read"))]);
    cursor.currentBlock().store(cursor.currentBlock().double(1), bindings.objectField(object, ["x"]));
    bindings.initializeObjectShadow(object);
    const first = bindings.value(object);
    const second = bindings.value(object);
    const equal = cursor.currentBlock().icmp("eq", first, second, "same.identity");
    const boundary = values.forBlock(cursor.currentBlock());
    runtime.callVoid("valuePrint", [cursor.currentBlock().select(equal, boundary.immediate("true"), boundary.immediate("false"), "identity")]);
    bindings.storeObjectNumber(object, ["x"], cursor.currentBlock().double(7));
    const key = cursor.currentBlock().globalPointer(module.stringConstant("x"));
    const shadowValue = runtime.callBoxed("objectGet", [bindings.pointer(object), cursor.currentBlock().int(llvm.i64, 1n), key], "shadow.value");
    runtime.callVoid("valuePrint", [shadowValue]);
    roots.restore(frame);
    cursor.currentBlock().ret(cursor.currentBlock().int(llvm.i32, 0n));
  });
  expect(await run(module)).toBe("4\ntrue\n7\n");
});
