import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Effect } from "effect";
import { expect, test } from "vitest";
import { BindingRegistry, type ResolvedModule, type ResolvedOperation, type ResolvedValueExpression } from "../../src/compiler/binding-resolution/index.js";
import { createLlvmModule, llvm } from "../../src/compiler/llvm-ir/index.js";
import type { BindingAccess } from "../../src/compiler/native-lowering/binding-access.js";
import { ControlFlow } from "../../src/compiler/native-lowering/control-flow.js";
import type { FunctionCapabilities } from "../../src/compiler/native-lowering/function-owner.js";
import { ModuleBindings } from "../../src/compiler/native-lowering/module-bindings.js";
import { NativeModule } from "../../src/compiler/native-lowering/module-owner.js";
import type { OperationCalls } from "../../src/compiler/native-lowering/operation-context.js";
import { createOperationContext } from "../../src/compiler/native-lowering/operation-owner.js";
import type { CompletionFunctionSpec } from "../../src/compiler/native-lowering/completion-calls.js";
import type { BoxedValue } from "../../src/compiler/native-lowering/value-boundary.js";
import { runtimeIrText } from "../../src/compiler/runtime-files.js";
import { captureCommand, commandExecutorLayer, toolExecutable } from "../integration/helpers.js";

interface NativeHelper {
  readonly name: string;
  build(capabilities: FunctionCapabilities, bindings: BindingAccess, module: NativeModule): BoxedValue;
}

const number = (value: number): ResolvedValueExpression => ({ kind: "number", value: { kind: "literal", value } });
const text = (value: string): ResolvedValueExpression => ({ kind: "string", value: { kind: "literal", value } });
const invokeHelper = (symbol: string): ResolvedValueExpression => ({ kind: "inlineCppValue", symbol });
const print = (value: ResolvedValueExpression): ResolvedOperation => ({ kind: "print", expression: { kind: "value", value } });

function unsupportedCall(): never { throw new Error("This aggregate fixture has no source functions or closures"); }

function compile(registry: BindingRegistry, operations: readonly ResolvedOperation[], helpers: readonly NativeHelper[] = []): NativeModule {
  const resolved: ResolvedModule = { entry: "/entry.ts", inlineCppBlocks: [], bindings: registry.table(), modules: [{ fileName: "/entry.ts",
    statementCount: operations.length, loweringMode: "native", operations, functionObjects: [] }] };
  const builder = createLlvmModule({ staticRuntime: [{ origin: "static runtime", text: runtimeIrText() }] });
  const module = new NativeModule(builder);
  const plan = new ModuleBindings(module, resolved);
  const targets = new Map<string, CompletionFunctionSpec>();
  for (const helper of helpers) {
    const spec = { name: helper.name, parameters: [], returnsCompletion: true } as const;
    targets.set(helper.name, module.declareFunction(spec));
    module.defineFunction(spec, (fn) => {
      fn.openEntry();
      const frame = fn.capabilities.roots.save();
      const bindings = plan.allocate(fn.capabilities, "module");
      const result = helper.build(fn.capabilities, bindings, module);
      fn.capabilities.roots.restore(frame);
      fn.capabilities.completion.returnValue(result);
    });
  }
  module.defineFunction({ name: "main", parameters: [], returns: llvm.i32, returnsCompletion: false }, (fn) => {
    fn.openEntry();
    const { cursor, roots, runtime } = fn.capabilities;
    runtime.callVoid("gcInit", []);
    plan.registerGlobalRoots(fn.capabilities);
    const frame = roots.save();
    const bindings = plan.allocate(fn.capabilities, "module");
    const flow = new ControlFlow(fn.capabilities, (_value, threw) => {
      roots.restore(frame);
      cursor.currentBlock().ret(cursor.currentBlock().int(llvm.i32, threw ? 1n : 0n));
    });
    const calls: OperationCalls = {
      direct: unsupportedCall, generated: unsupportedCall, functionObject: unsupportedCall,
      tagged: unsupportedCall, reference: unsupportedCall, closure: unsupportedCall, callback: unsupportedCall, returnedClosure: unsupportedCall,
      inlineCpp: (symbol) => {
        const target = targets.get(symbol);
        if (target === undefined) throw new Error(`Fixture helper ${symbol} is undeclared`);
        return fn.capabilities.completion.direct(target, [], cursor.uniqueName("fixture.call"), flow.exceptionTarget());
      }
    };
    const context = createOperationContext({ capabilities: fn.capabilities, writes: bindings, flow, calls: () => calls,
      stringConstant: (value) => module.stringConstant(value), withTrace: (id, build) => fn.withTrace(id, build) });
    context.operations.operations(operations);
    if (!cursor.currentBlock().terminated) {
      runtime.callVoid("gcCollect", []);
      roots.restore(frame);
      cursor.currentBlock().ret(cursor.currentBlock().int(llvm.i32, 0n));
    }
    flow.finish();
  });
  return module;
}

async function run(module: NativeModule): Promise<string> {
  const clang = await toolExecutable("clang");
  if (clang === undefined) throw new Error("Native aggregate tests require clang");
  const directory = await mkdtemp(path.join(tmpdir(), "tscn-native-aggregates-"));
  try {
    const ir = path.join(directory, "main.ll");
    const binary = path.join(directory, "main");
    await writeFile(ir, module.render().text);
    const compiled = await Effect.runPromise(captureCommand(clang, [ir, "-o", binary]).pipe(Effect.provide(commandExecutorLayer)));
    expect(compiled.status, compiled.stderr).toBe(0);
    const executed = await Effect.runPromise(captureCommand(binary, []).pipe(Effect.provide(commandExecutorLayer)));
    expect(executed.status, executed.stderr).toBe(0);
    return executed.stdout;
  } finally { await rm(directory, { recursive: true, force: true }); }
}

test("array argument evaluation, unshift ordering, spreads, and transformations run against clang", async () => {
  const registry = new BindingRegistry();
  const array = registry.mint("array", "const", { kind: "runtimeArray" }, { kind: "module" });
  const slice = registry.mint("slice", "const", { kind: "runtimeArray" }, { kind: "module" });
  const removed = registry.mint("removed", "const", { kind: "runtimeArray" }, { kind: "module" });
  const spread = registry.mint("spread", "const", { kind: "runtimeArray" }, { kind: "module" });
  const collected = registry.mint("collected", "const", { kind: "runtimeArray" }, { kind: "module" });
  const length: NativeHelper = { name: "length_after_collection", build: ({ cursor, roots, runtime, values }, bindings) => {
    const boxed = bindings.value(array);
    roots.push(boxed);
    const pointer = values.forBlock(cursor.currentBlock()).unboxReference(boxed);
    runtime.callVoid("gcCollect", []);
    const count = runtime.call("arrayLength", [pointer], "length");
    return values.forBlock(cursor.currentBlock()).boxNumber(cursor.currentBlock().cast("uitofp", count, llvm.double, "number"));
  } };
  const operations: ResolvedOperation[] = [
    { kind: "runtimeArrayLiteral", name: array, elements: [10, 20].map((value) => ({ kind: "value", value: number(value) })) },
    { kind: "runtimeArrayPush", arrayName: array, values: [invokeHelper(length.name), invokeHelper(length.name)] },
    { kind: "runtimeArrayLiteral", name: collected, elements: [invokeHelper(length.name), invokeHelper(length.name)].map((value) => ({ kind: "value", value })) },
    print({ kind: "jsonStringify", indent: 0, value: { kind: "arrayRef", name: collected } }),
    { kind: "runtimeArrayUnshift", arrayName: array, values: [number(1), number(2)] },
    print({ kind: "jsonStringify", indent: 0, value: { kind: "arrayRef", name: array } }),
    { kind: "runtimeArraySlice", name: slice, arrayName: array, start: { kind: "literal", value: 2 }, end: { kind: "literal", value: 4 } },
    print({ kind: "jsonStringify", indent: 0, value: { kind: "arrayRef", name: slice } }),
    { kind: "runtimeArraySplice", name: removed, arrayName: array, start: { kind: "literal", value: 1 },
      deleteCount: { kind: "literal", value: 2 }, items: [number(7), number(8)] },
    print({ kind: "jsonStringify", indent: 0, value: { kind: "arrayRef", name: removed } }), print({ kind: "jsonStringify", indent: 0, value: { kind: "arrayRef", name: array } }),
    { kind: "runtimeArrayLiteral", name: spread, elements: [{ kind: "spread", arrayName: slice, sourceKind: "runtime" },
      { kind: "iterableSpread", source: text("ab"), notIterableMessage: "not iterable" }] },
    print({ kind: "jsonStringify", indent: 0, value: { kind: "arrayRef", name: spread } }),
    { kind: "runtimeArrayReverse", arrayName: slice }, print({ kind: "jsonStringify", indent: 0, value: { kind: "arrayRef", name: slice } })
  ];
  expect(await run(compile(registry, operations, [length]))).toBe('[4,4]\n[1,2,10,20,2,2]\n[10,20]\n[2,10]\n[1,7,8,20,2,2]\n[10,20,"a","b"]\n[20,10]\n');
});

test("Object.assign evaluates every source before copying and keeps owners through collection", async () => {
  const registry = new BindingRegistry();
  const target = registry.mint("target", "const", { kind: "runtimeObject" }, { kind: "module" });
  const source = registry.mint("source", "const", { kind: "runtimeObject" }, { kind: "module" });
  const later: NativeHelper = { name: "mutate_source", build: ({ cursor, roots, runtime, values }, bindings, module) => {
    const owner = bindings.value(source);
    roots.push(owner);
    const pointer = values.forBlock(cursor.currentBlock()).unboxReference(owner);
    runtime.callVoid("gcCollect", []);
    runtime.callVoid("objectSet", [pointer, cursor.currentBlock().int(llvm.i64, 1n), cursor.currentBlock().globalPointer(module.stringConstant("x")),
      values.forBlock(cursor.currentBlock()).boxNumber(cursor.currentBlock().double(9))]);
    return values.forBlock(cursor.currentBlock()).immediate("undefined");
  } };
  const operations: ResolvedOperation[] = [
    { kind: "runtimeObjectLiteral", name: target, value: { fields: [] } },
    { kind: "runtimeObjectLiteral", name: source, value: { fields: [{ kind: "field", key: { kind: "literal", value: "x" }, value: number(1) }] } },
    { kind: "runtimeObjectAssign", targetName: target, sources: [{ kind: "runtimeObject", name: source }, { kind: "value", value: invokeHelper(later.name) }] },
    print({ kind: "valueObjectDynamicAccess", value: { kind: "variable", name: target }, key: { kind: "literal", value: "x" } })
  ];
  expect(await run(compile(registry, operations, [later]))).toBe("9\n");
});

test("descriptor lookup captures its receiver before a collecting key expression reassigns the binding", async () => {
  const registry = new BindingRegistry();
  const object = registry.mint("object", "let", { kind: "runtimeObject" }, { kind: "module" });
  const descriptor = registry.mint("descriptor", "const", { kind: "value" }, { kind: "module" });
  const key: NativeHelper = { name: "reassign_object", build: ({ cursor, runtime, roots, values }, bindings, module) => {
    runtime.callVoid("gcCollect", []);
    const replacement = runtime.callPointer("objectNew", [cursor.currentBlock().int(llvm.i64, 1n)], "replacement");
    const boxed = values.forBlock(cursor.currentBlock()).boxReference("object", replacement);
    roots.push(boxed);
    runtime.callVoid("objectSet", [replacement, cursor.currentBlock().int(llvm.i64, 1n), cursor.currentBlock().globalPointer(module.stringConstant("x")),
      values.forBlock(cursor.currentBlock()).boxNumber(cursor.currentBlock().double(99))]);
    bindings.storeValue(object, boxed);
    const result = runtime.callBoxed("valueCopyString", [cursor.currentBlock().globalPointer(module.stringConstant("x")),
      cursor.currentBlock().int(llvm.i64, 1n)], "key");
    roots.push(result);
    return result;
  } };
  const operations: ResolvedOperation[] = [
    { kind: "runtimeObjectLiteral", name: object, value: { fields: [{ kind: "field", key: { kind: "literal", value: "x" }, value: number(7) }] } },
    { kind: "runtimeObjectOwnPropertyDescriptor", name: descriptor, targetName: object, targetKind: "object",
      key: { kind: "stringConversion", value: invokeHelper(key.name) } },
    print({ kind: "valueObjectDynamicAccess", value: { kind: "variable", name: descriptor }, key: { kind: "literal", value: "value" } }),
    print({ kind: "valueObjectDynamicAccess", value: { kind: "variable", name: object }, key: { kind: "literal", value: "x" } })
  ];
  expect(await run(compile(registry, operations, [key]))).toBe("7\n99\n");
});

test("fixed object shadows, descriptors, deletion and frozen properties retain observable state", async () => {
  const registry = new BindingRegistry();
  const object = registry.mint("object", "const", { kind: "fixedObject", fieldCount: 1 }, { kind: "module" });
  const descriptor = registry.mint("descriptor", "const", { kind: "value" }, { kind: "module" });
  const keys = registry.mint("keys", "const", { kind: "runtimeArray" }, { kind: "module" });
  const operations: ResolvedOperation[] = [
    { kind: "objectLiteral", name: object, needsRuntimeShadow: true, value: { fields: [{ name: "x", value: { kind: "number", value: { kind: "literal", value: 1 } } }] } },
    { kind: "objectStore", objectName: object, path: ["x"], value: { kind: "literal", value: 7 } },
    { kind: "runtimeObjectDefineDataProperty", objectName: object,
      descriptor: { key: { kind: "literal", value: "y" }, value: number(8), writable: false, enumerable: true, configurable: true } },
    { kind: "runtimeObjectOwnPropertyDescriptor", name: descriptor, targetName: object, targetKind: "object", key: { kind: "literal", value: "y" } },
    print({ kind: "valueObjectDynamicAccess", value: { kind: "variable", name: descriptor }, key: { kind: "literal", value: "writable" } }),
    { kind: "runtimeObjectStore", objectName: object, key: { kind: "literal", value: "y" }, value: number(99) },
    print({ kind: "valueObjectDynamicAccess", value: { kind: "variable", name: object }, key: { kind: "literal", value: "y" } }),
    { kind: "runtimeObjectDelete", objectName: object, key: { kind: "literal", value: "y" } },
    { kind: "runtimeObjectKeys", name: keys, targetName: object, targetKind: "object" }, print({ kind: "jsonStringify", indent: 0, value: { kind: "arrayRef", name: keys } }),
    { kind: "runtimeObjectFreeze", objectName: object },
    { kind: "runtimeObjectStore", objectName: object, key: { kind: "literal", value: "x" }, value: number(99) },
    print({ kind: "valueObjectDynamicAccess", value: { kind: "variable", name: object }, key: { kind: "literal", value: "x" } })
  ];
  expect(await run(compile(registry, operations))).toBe('false\n8\n["x"]\n7\n');
});

test("collection constructors copy arrays and acquired iterators without changing mutation result identity", async () => {
  const registry = new BindingRegistry();
  const array = registry.mint("array", "const", { kind: "runtimeArray" }, { kind: "module" });
  const set = registry.mint("set", "const", { kind: "runtimeSet" }, { kind: "module" });
  const copy = registry.mint("copy", "const", { kind: "runtimeSet" }, { kind: "module" });
  const result = registry.mint("result", "const", { kind: "runtimeSet" }, { kind: "module" });
  const map = registry.mint("map", "const", { kind: "runtimeMap" }, { kind: "module" });
  const mapCopy = registry.mint("mapCopy", "const", { kind: "runtimeMap" }, { kind: "module" });
  const operations: ResolvedOperation[] = [
    { kind: "runtimeArrayLiteral", name: array, elements: [1, 2, 2].map((value) => ({ kind: "value", value: number(value) })) },
    { kind: "runtimeSetFromArray", name: set, sourceName: array },
    { kind: "runtimeSetAddResult", name: result, setName: set, value: number(3) },
    { kind: "runtimeSetFromCollection", name: copy, sourceName: set, sourceKind: "set" },
    print({ kind: "boolean", value: { kind: "runtimeCollectionIdentity", operator: "===", leftName: set, rightName: result } }),
    print({ kind: "boolean", value: { kind: "runtimeCollectionHas", collectionName: copy, key: number(3) } }),
    { kind: "runtimeMapNew", name: map }, { kind: "runtimeMapSet", mapName: map, key: text("k"), value: text("v") },
    { kind: "runtimeMapFromCollection", name: mapCopy, sourceName: map, sourceKind: "map" },
    print({ kind: "boolean", value: { kind: "runtimeCollectionHas", collectionName: mapCopy, key: text("k") } })
  ];
  expect(await run(compile(registry, operations))).toBe("true\ntrue\ntrue\n");
});
