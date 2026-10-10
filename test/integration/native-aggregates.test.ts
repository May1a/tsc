import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Effect } from "effect";
import { expect, test } from "vitest";
import { resolveBindings } from "../../src/compiler/binding-resolution/index.js";
import type { JsIrOperation } from "../../src/compiler/ir/types.js";
import type { JsIrValueExpression } from "../../src/compiler/ir/expressions.js";
import { createLlvmModule, llvm } from "../../src/compiler/llvm-ir/index.js";
import { ControlFlow } from "../../src/compiler/native-lowering/control-flow.js";
import { NativeModule } from "../../src/compiler/native-lowering/index.js";
import { ModuleBindings } from "../../src/compiler/native-lowering/module-bindings.js";
import { createOperationContext } from "../../src/compiler/native-lowering/operation-owner.js";
import { runtimeIrText } from "../../src/compiler/runtime-files.js";
import { captureCommand, commandExecutorLayer, toolExecutable } from "./helpers.js";

function numeric(value: number): JsIrValueExpression { return { kind: "number", value: { kind: "literal", value } }; }
function text(value: string): JsIrValueExpression { return { kind: "string", value: { kind: "literal", value } }; }
function variable(name: string): JsIrValueExpression { return { kind: "variable", name }; }
function print(value: JsIrValueExpression): JsIrOperation { return { kind: "print", expression: { kind: "value", value } }; }
function json(name: string): JsIrOperation { return print({ kind: "jsonStringify", value: variable(name), indent: 0 }); }
function forbiddenCall(): never { throw new Error("Aggregate fixture declares no callable expressions"); }

function arrayOperations(): readonly JsIrOperation[] {
  return [
    { kind: "arrayLiteral", name: "fixed", elements: [1, 2].map((value) => ({ kind: "literal", value })) },
    { kind: "runtimeArrayLiteral", name: "array", elements: [{ kind: "value", value: numeric(3) }, { kind: "hole" }, { kind: "value", value: numeric(5) }] },
    json("array"),
    { kind: "runtimeArrayLiteral", name: "spread", elements: [{ kind: "spread", arrayName: "array" }, { kind: "spread", arrayName: "fixed" }] },
    json("spread"),
    { kind: "runtimeArrayConcat", name: "concat", leftName: "array", values: [{ kind: "fixedArraySpread", arrayName: "fixed", length: 2 },
      { kind: "value", value: { kind: "runtimeArrayValue", elements: [numeric(7), numeric(8)] } }] }, json("concat"),
    { kind: "runtimeArraySlice", name: "slice", arrayName: "concat", start: { kind: "literal", value: 1 }, end: { kind: "literal", value: 5 } }, json("slice"),
    { kind: "runtimeArraySplice", name: "removed", arrayName: "concat", start: { kind: "literal", value: 1 }, deleteCount: { kind: "literal", value: 2 }, items: [numeric(9)] },
    json("removed"), json("concat"),
    { kind: "runtimeArrayUnshift", arrayName: "concat", values: [numeric(10), numeric(11)] },
    { kind: "runtimeArrayPush", arrayName: "concat", values: [numeric(12), numeric(13)] }, json("concat"),
    { kind: "runtimeArrayMutatorResult", name: "alias", arrayName: "concat", mutation: { kind: "reverse" } }, json("alias"),
    { kind: "runtimeArrayFill", arrayName: "concat", value: numeric(6), start: { kind: "literal", value: 1 }, end: { kind: "literal", value: 3 } },
    { kind: "runtimeArrayCopyWithin", arrayName: "concat", target: { kind: "literal", value: 3 }, start: { kind: "literal", value: 0 }, end: { kind: "literal", value: 2 } }, json("concat"),
    { kind: "runtimeArrayDelete", arrayName: "concat", index: { kind: "literal", value: 0 } },
    { kind: "runtimeArraySetLength", arrayName: "concat", length: { kind: "literal", value: 4 } }, json("concat"),
    { kind: "runtimeStringSplit", name: "split", receiver: { kind: "literal", value: "a,b,c" }, separator: { kind: "literal", value: "," }, limit: { kind: "literal", value: 2 } }, json("split"),
    { kind: "runtimeArrayLiteral", name: "nested", elements: [{ kind: "value", value: { kind: "runtimeArrayValue", elements: [numeric(1), numeric(2)] } }, { kind: "value", value: numeric(3) }] },
    { kind: "runtimeArrayFlat", name: "flat", arrayName: "nested", depth: { kind: "literal", value: 1 } }, json("flat")
  ];
}

function objectOperations(): readonly JsIrOperation[] {
  return [
    { kind: "objectLiteral", name: "fixed", needsRuntimeShadow: true, value: { fields: [
      { name: "x", value: { kind: "number", value: { kind: "literal", value: 1 } } },
      { name: "nested", value: { kind: "object", value: { fields: [{ name: "y", value: { kind: "number", value: { kind: "literal", value: 2 } } }] } } }
    ] } }, json("fixed"),
    { kind: "objectStore", objectName: "fixed", path: ["x"], value: { kind: "literal", value: 7 } },
    { kind: "objectStore", objectName: "fixed", path: ["nested", "y"], value: { kind: "literal", value: 8 } }, json("fixed"),
    { kind: "runtimeObjectLiteral", name: "object", value: { fields: [{ kind: "field", key: { kind: "literal", value: "x" }, value: text("rooted") }] } },
    { kind: "runtimeObjectStore", objectName: "object", key: { kind: "literal", value: "z" }, value: numeric(3) },
    { kind: "privateFieldStore", targetName: "object", key: "x", value: text("updated"), message: "wrong brand" }, json("object"),
    { kind: "runtimeObjectDefineDataProperty", objectName: "object", descriptor: { key: { kind: "literal", value: "hidden" }, value: numeric(4), writable: true, enumerable: false, configurable: true } },
    { kind: "runtimeObjectKeys", name: "keys", targetName: "object", targetKind: "object" }, json("keys"),
    { kind: "runtimeObjectOwnPropertyNames", name: "names", targetName: "object", targetKind: "object" }, json("names"),
    { kind: "runtimeObjectOwnPropertyDescriptor", name: "descriptor", targetName: "object", targetKind: "object", key: { kind: "literal", value: "hidden" } }, json("descriptor"),
    { kind: "runtimeObjectCreate", name: "created", prototypeName: "object" },
    print({ kind: "objectDynamicAccess", objectName: "created", key: { kind: "literal", value: "x" } }),
    { kind: "runtimeObjectLiteral", name: "target", value: { fields: [] } },
    { kind: "runtimeObjectAssign", targetName: "target", sources: [{ kind: "runtimeObject", name: "object" }, { kind: "value", value: { kind: "objectLiteralValue", value: { fields: [{ kind: "field", key: { kind: "literal", value: "z" }, value: numeric(9) }] } } }] }, json("target"),
    { kind: "runtimeObjectDelete", objectName: "target", key: { kind: "literal", value: "x" } }, json("target"),
    { kind: "runtimeObjectFreeze", objectName: "target" },
    print({ kind: "boolean", value: { kind: "runtimeObjectState", objectName: "target", state: "isFrozen" } }),
    { kind: "runtimeErrorLiteral", name: "error", errorName: "RangeError", message: text("bad range") },
    print({ kind: "string", value: { kind: "errorToString", objectName: "error" } })
  ];
}

function collectionOperations(): readonly JsIrOperation[] {
  return [
    { kind: "runtimeMapNew", name: "map" },
    { kind: "runtimeMapSet", mapName: "map", key: numeric(1), value: text("one") },
    { kind: "runtimeMapSetResult", name: "alias", mapName: "map", key: numeric(2), value: text("two") },
    print({ kind: "runtimeMapGet", mapName: "alias", key: numeric(2) }),
    { kind: "runtimeMapFromCollection", name: "copy", sourceName: "map", sourceKind: "map" },
    print({ kind: "runtimeMapGet", mapName: "copy", key: numeric(1) }),
    { kind: "runtimeSetNew", name: "set" },
    { kind: "runtimeSetAdd", setName: "set", value: text("a") },
    { kind: "runtimeSetAddResult", name: "setAlias", setName: "set", value: text("b") },
    { kind: "runtimeSetFromCollection", name: "setCopy", sourceName: "setAlias", sourceKind: "set" },
    print({ kind: "boolean", value: { kind: "runtimeCollectionHas", collectionName: "setCopy", key: text("b") } }),
    { kind: "runtimeArrayLiteral", name: "entries", elements: [{ kind: "value", value: { kind: "runtimeArrayValue", elements: [text("k"), numeric(42)] } }] },
    { kind: "runtimeMapFromArray", name: "fromArray", sourceName: "entries" },
    print({ kind: "runtimeMapGet", mapName: "fromArray", key: text("k") }),
    { kind: "runtimeSetFromIterable", name: "letters", iterable: text("aba"), notIterableMessage: "not iterable" },
    print({ kind: "boolean", value: { kind: "runtimeCollectionHas", collectionName: "letters", key: text("a") } }),
    print({ kind: "number", value: { kind: "runtimeCollectionSize", collectionName: "letters" } })
  ];
}

function throwingOperations(): readonly JsIrOperation[] {
  const catching = (tryOperations: readonly JsIrOperation[], name: string): JsIrOperation => ({
    kind: "tryCatch", hasCatch: true, catchVariable: name, tryOperations,
    catchOperations: [print({ kind: "valueObjectDynamicAccess", value: variable(name), key: { kind: "literal", value: "message" } })],
    finallyOperations: []
  });
  return [
    { kind: "runtimeObjectLiteral", name: "object", value: { fields: [] } },
    catching([{ kind: "privateFieldStore", targetName: "object", key: "private", value: numeric(3), message: "wrong private brand" }], "privateError"),
    catching([{ kind: "runtimeArrayLiteral", name: "spread", elements: [{ kind: "iterableSpread", source: numeric(1), notIterableMessage: "spread source is not iterable" }] }], "spreadError"),
    catching([{ kind: "runtimeMapFromIterable", name: "map", iterable: numeric(1), notIterableMessage: "map source is not iterable" }], "mapError")
  ];
}

function aggregateModule(operations: readonly JsIrOperation[]): NativeModule {
  const resolved = resolveBindings({ entry: "aggregate.ts", inlineCppBlocks: [], modules: [{
    fileName: "aggregate.ts", statementCount: operations.length, loweringMode: "native", functionObjects: [], operations
  }] });
  expect(resolved.diagnostics).toEqual([]);
  const builder = createLlvmModule({ staticRuntime: [{ origin: "static runtime", text: runtimeIrText() }] });
  const module = new NativeModule(builder);
  const bindings = new ModuleBindings(module, resolved.module);
  module.defineFunction({ name: "main", parameters: [], returnsCompletion: false, returns: llvm.i32 }, (fn) => {
    fn.openEntry();
    const { cursor, runtime, roots, values } = fn.capabilities;
    runtime.callVoid("gcInit", []);
    const frame = roots.save();
    bindings.registerGlobalRoots(fn.capabilities);
    const writes = bindings.allocate(fn.capabilities, "module");
    const flow = new ControlFlow(fn.capabilities, (_value, threw) => {
      roots.restore(frame);
      cursor.currentBlock().ret(cursor.currentBlock().int(llvm.i32, threw ? 1n : 0n));
    });
    const context = createOperationContext({ capabilities: fn.capabilities, writes, flow,
      calls: () => ({ direct: forbiddenCall, generated: forbiddenCall, inlineCpp: forbiddenCall,
        functionObject: forbiddenCall, tagged: forbiddenCall, reference: forbiddenCall, closure: forbiddenCall,
        callback: forbiddenCall, returnedClosure: forbiddenCall }),
      stringConstant: (value) => module.stringConstant(value), withTrace: (id, build) => fn.withTrace(id, build)
    });
    for (const source of resolved.module.modules) {
      for (const operation of source.operations) {
        const temporary = roots.save();
        context.operations.operation(operation);
        roots.restore(temporary);
        runtime.callVoid("gcCollect", []);
      }
    }
    flow.returnValue(values.forBlock(cursor.currentBlock()).immediate("undefined"));
    flow.finish();
  });
  return module;
}

test.each([
  { name: "arrays and holes", operations: arrayOperations, expected: ["[3,null,5]", "[3,null,5,1,2]", "[3,null,5,1,2,7,8]", "[null,5,1,2]", "[null,5]", "[3,9,1,2,7,8]",
    "[10,11,3,9,1,2,7,8,12,13]", "[13,12,8,7,2,1,9,3,11,10]", "[13,6,6,13,6,1,9,3,11,10]", "[null,6,6,13]", '["a","b"]', "[1,2,3]"] },
  { name: "objects and fixed shadows", operations: objectOperations, expected: ['{"x":1,"nested":{"y":2}}', '{"x":7,"nested":{"y":8}}', '{"x":"updated","z":3}', '["x","z"]', '["x","z","hidden"]',
    '{"value":4,"writable":true,"enumerable":false,"configurable":true}', "updated", '{"x":"updated","z":9}', '{"z":9}', "true", "RangeError: bad range"] },
  { name: "collections and iterable construction", operations: collectionOperations, expected: ["two", "one", "true", "42", "true", "2"] },
  { name: "private brands and invalid iterables", operations: throwingOperations, expected: ["wrong private brand", "spread source is not iterable", "map source is not iterable"] }
])("typed $name survive collections between operations", async ({ operations, expected }) => {
  const clang = await toolExecutable("clang");
  expect(clang).toBeDefined();
  if (clang === undefined) return;
  const directory = await mkdtemp(path.join(tmpdir(), "tscn-native-aggregates-"));
  try {
    const source = path.join(directory, "main.ll");
    const executable = path.join(directory, "main");
    await writeFile(source, aggregateModule(operations()).render().text);
    const compiled = await Effect.runPromise(captureCommand(clang, [source, "-o", executable]).pipe(Effect.provide(commandExecutorLayer)));
    expect(compiled.status, compiled.stderr).toBe(0);
    const result = await Effect.runPromise(captureCommand(executable, []).pipe(Effect.provide(commandExecutorLayer)));
    expect(result).toEqual({ status: 0, stderr: "", stdout: `${expected.join("\n")}\n` });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
