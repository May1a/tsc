import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Effect } from "effect";
import { expect, test } from "vitest";
import { type BindingId, type BindingRef, BindingRegistry, type ResolvedValueExpression } from "../../src/compiler/binding-resolution/index.js";
import { createLlvmModule, llvm } from "../../src/compiler/llvm-ir/index.js";
import { type BindingStorage, type FunctionCapabilities, NativeModule } from "../../src/compiler/native-lowering/index.js";
import { BindingAccess } from "../../src/compiler/native-lowering/binding-access.js";
import { lowerNumber } from "../../src/compiler/native-lowering/numbers.js";
import { lowerCondition } from "../../src/compiler/native-lowering/conditions.js";
import { lowerString } from "../../src/compiler/native-lowering/string-expressions.js";
import { type ExpressionContext, createExpressionContext } from "../../src/compiler/native-lowering/expression-context.js";
import { lowerValueExpression } from "../../src/compiler/native-lowering/value-expressions.js";
import { runtimeIrText } from "../../src/compiler/runtime-files.js";
import { captureCommand, commandExecutorLayer, toolExecutable } from "./helpers.js";

function number(value: number): ResolvedValueExpression { return { kind: "number", value: { kind: "literal", value } }; }
function string(value: string): ResolvedValueExpression { return { kind: "string", value: { kind: "literal", value } }; }
function array(values: readonly number[]): ResolvedValueExpression { return { kind: "runtimeArrayValue", elements: values.map(number) }; }
function forbiddenCall(): never { throw new Error("Value fixture did not declare this callable"); }

function samples(counter: BindingRef, numbers: BindingRef, object: BindingRef, collection: BindingRef, callback: BindingRef, fixed: BindingRef): readonly ResolvedValueExpression[] {
  const update: ResolvedValueExpression = { kind: "number", value: { kind: "update", name: counter, operator: "increment", prefix: true } };
  return [
    { kind: "undefined" }, { kind: "null" }, number(12), { kind: "boolean", value: { kind: "boolean", value: true } }, string("native"),
    { kind: "valuePlus", left: string("a"), right: number(2) },
    { kind: "ternary", condition: { kind: "boolean", value: false }, consequent: update, alternate: number(9) },
    { kind: "lazyDefault", value: { kind: "undefined" }, defaultValue: number(7) },
    { kind: "lazyDefault", value: { kind: "null" }, defaultValue: update },
    { kind: "logicalValue", operator: "&&", left: number(0), right: update },
    { kind: "logicalValue", operator: "||", left: number(1), right: update },
    { kind: "nullishCoalesce", left: number(0), right: update },
    { kind: "optionalChain", guard: { kind: "null" }, access: update },
    { kind: "optionalChain", guard: number(42), access: { kind: "optionalTarget" } },
    { kind: "callValue", callee: { kind: "undefined" }, optionalCallee: true, arguments: [{ valueKind: "value", value: update }] },
    { kind: "variable", name: counter },
    { kind: "sequence", left: update, right: number(5) },
    { kind: "void", expression: update }, { kind: "variable", name: counter },
    { kind: "arrayRef", name: numbers },
    { kind: "arrayAccess", arrayName: numbers, index: { kind: "literal", value: 1 } },
    { kind: "arrayAt", arrayName: numbers, index: { kind: "literal", value: -1 } },
    { kind: "arrayIncludes", arrayName: numbers, value: number(2) },
    { kind: "arrayFind", arrayName: numbers },
    { kind: "arrayPop", arrayName: numbers }, { kind: "arrayShift", arrayName: numbers },
    { kind: "arrayForEach", arrayName: numbers },
    { kind: "objectRef", name: object },
    { kind: "valueObjectDynamicAccess", value: { kind: "objectLiteralValue", value: { fields: [{ kind: "spread", sourceName: object }] } }, key: { kind: "literal", value: "x" } },
    { kind: "objectDynamicAccess", objectName: object, key: { kind: "literal", value: "x" } },
    { kind: "valueObjectDynamicAccess", value: { kind: "objectRef", name: object }, key: { kind: "literal", value: "x" } },
    { kind: "valueArrayAccess", value: array([7, 8]), index: { kind: "literal", value: 1 }, key: { kind: "literal", value: "1" } },
    { kind: "privateFieldAccess", receiver: { kind: "objectRef", name: object }, key: "x", message: "wrong brand" },
    { kind: "boxedMethodCall", receiver: { kind: "boxedPrimitive", inner: number(8) }, method: "valueOf" },
    { kind: "boxedMethodCall", receiver: { kind: "boxedPrimitive", inner: string("wrapped"), storeLength: true }, method: "toString" },
    { kind: "runtimeMapGet", mapName: collection, key: number(1) },
    { kind: "stringStartsWith", receiver: { kind: "literal", value: "abc" }, search: { kind: "literal", value: "b" }, position: { kind: "literal", value: 1 } },
    { kind: "stringEndsWith", receiver: { kind: "literal", value: "abc" }, search: { kind: "literal", value: "c" } },
    { kind: "stringCharCodeAt", receiver: { kind: "literal", value: "A" }, index: { kind: "literal", value: 0 } },
    { kind: "stringCodePointAt", receiver: { kind: "literal", value: "B" }, index: { kind: "literal", value: 0 } },
    { kind: "stringLocaleCompare", receiver: { kind: "literal", value: "C" }, index: { kind: "literal", value: 0 } },
    { kind: "stringIndexOf", receiver: { kind: "literal", value: "ababa" }, search: { kind: "literal", value: "ba" }, position: { kind: "literal", value: 2 } },
    { kind: "stringLastIndexOf", receiver: { kind: "literal", value: "ababa" }, search: { kind: "literal", value: "ba" } },
    { kind: "jsonStringify", value: array([1, 2]), indent: 0 },
    { kind: "valueObjectDynamicAccess", value: { kind: "jsonParse", text: string('{"x":17}') }, key: { kind: "literal", value: "x" } },
    { kind: "valueArrayAccess", value: { kind: "regexExec", regex: { kind: "regexCompile", pattern: { kind: "literal", value: "b+" }, flags: { kind: "literal", value: "" } }, input: { kind: "literal", value: "abbc" } },
      index: { kind: "literal", value: 0 }, key: { kind: "literal", value: "0" } },
    { kind: "regexMatch", regex: { kind: "regexCompile", pattern: { kind: "literal", value: "z" }, flags: { kind: "literal", value: "" } }, input: { kind: "literal", value: "abc" } },
    { kind: "callValue", callee: { kind: "variable", name: callback }, arguments: [{ valueKind: "value", value: array([11, 12]) }] },
    { kind: "callValue", callee: { kind: "variable", name: callback }, arguments: [], spreadArguments: [{ kind: "iterableSpread", source: array([13, 14]), notIterableMessage: "not iterable" }] },
    { kind: "valuePlus", left: string("before"), right: { kind: "callValue", callee: { kind: "variable", name: callback }, arguments: [{ valueKind: "value", value: number(2) }] } },
    { kind: "jsonStringify", indent: 0, value: { kind: "runtimeArrayValue", elements: [number(12), {
      kind: "callValue", callee: { kind: "variable", name: callback }, arguments: [{ valueKind: "value", value: number(7) }]
    }] } },
    { kind: "valueArrayAccess", value: { kind: "callValue", callee: { kind: "variable", name: callback },
      arguments: [{ valueKind: "value", value: array([11, 12]) }] }, index: { kind: "literal", value: 1 }, key: { kind: "literal", value: "1" } },
    { kind: "arrayAccess", arrayName: fixed, index: { kind: "literal", value: 1 } },
    { kind: "arrayAccess", arrayName: fixed, index: { kind: "literal", value: -1 } },
    { kind: "arrayAccess", arrayName: fixed, index: { kind: "literal", value: 100 } },
    { kind: "arrayAccess", arrayName: fixed, index: { kind: "literal", value: 1.5 } },
    { kind: "arrayAccess", arrayName: fixed, index: { kind: "nan" } }

  ];
}

function physicalBindings(capabilities: FunctionCapabilities, registry: BindingRegistry, counter: BindingRef,
  boxed: readonly BindingRef[], module: NativeModule): { readonly bindings: BindingAccess; readonly fixed: BindingRef } {
  const { cursor } = capabilities;
  const block = cursor.currentBlock();
  const counterSlot = block.alloca(llvm.double, "counter");
  block.store(block.double(0), counterSlot);
  const storage = new Map<BindingId, BindingStorage>(boxed.map((reference): readonly [BindingId, BindingStorage] =>
    [reference.binding, { kind: "boxedSlot", slot: block.alloca(llvm.i64, cursor.uniqueName("boxed.slot")) }]));
  storage.set(counter.binding, { kind: "numberSlot", slot: counterSlot });
  const fixed = registry.mint("fixed", "let", { kind: "fixedArray", length: 3 }, { kind: "module" });
  storage.set(fixed.binding, { kind: "fixedArray", length: 3, slot: block.allocaArray(llvm.double, block.int(llvm.i64, 3n), "fixed.array") });
  const bindings = new BindingAccess(capabilities, storage, (text) => module.stringConstant(text));
  bindings.initializeFixedArray(fixed, [1, 2, 3].map((value) => block.double(value)));
  return { bindings, fixed };
}

function bindCollection(context: ExpressionContext, bindings: BindingAccess, collection: BindingRef): void {
  const { cursor, runtime, roots, values } = context;
  const map = runtime.callPointer("collectionNew", [], "map");
  const mapValue = values.forBlock(cursor.currentBlock()).boxReference("object", map);
  roots.push(mapValue);
  runtime.callVoid("collectionSet", [map, values.forBlock(cursor.currentBlock()).boxNumber(cursor.currentBlock().double(1)),
    values.forBlock(cursor.currentBlock()).boxNumber(cursor.currentBlock().double(18))]);
  bindings.storeValue(collection, mapValue);
}

function valueModule(): NativeModule {
  const builder = createLlvmModule({ staticRuntime: [{ origin: "static runtime", text: runtimeIrText() }] });
  const module = new NativeModule(builder);
  const callbackSpec = {
    name: "identity", returnsCompletion: true,
    parameters: [{ name: "argc", type: llvm.i64 }, { name: "argv", type: llvm.ptr }, { name: "environment", type: llvm.ptr },
      { name: "thisValue", type: llvm.i64, representation: "boxed", protection: "borrowed" }]
  } as const;
  const callbackSpecHandle = module.declareFunction(callbackSpec);
  module.defineFunction(callbackSpec, (fn) => {
    fn.openEntry();
    const { cursor, runtime, values, completion } = fn.capabilities;
    const argv = fn.parameter(1, llvm.ptr);
    runtime.callVoid("gcCollect", []);
    const argument = values.forBlock(cursor.currentBlock()).fromBoundary(cursor.currentBlock().load(llvm.i64, argv, "argument"));
    completion.returnValue(argument);
  });
  module.defineFunction({ name: "main", parameters: [], returnsCompletion: false, returns: llvm.i32 }, (fn) => {
    fn.openEntry();
    const { cursor, runtime, roots, values } = fn.capabilities;
    runtime.callVoid("gcInit", []);
    const frame = roots.save();
    const registry = new BindingRegistry();
    const owner = { kind: "function", function: registry.mintFunction() } as const;
    const counter = registry.mint("counter", "let", { kind: "number" }, owner);
    const numbers = registry.mint("numbers", "let", { kind: "value" }, owner);
    const object = registry.mint("object", "let", { kind: "value" }, owner);
    const collection = registry.mint("map", "let", { kind: "value" }, owner);
    const callback = registry.mint("callback", "let", { kind: "value" }, owner);
    const { bindings, fixed } = physicalBindings(fn.capabilities, registry, counter, [numbers, object, collection, callback], module);
    const exception = { block: cursor.reserveBlock("failed"), payloadSlot: cursor.currentBlock().alloca(llvm.i64, "exception") };
    const context = createExpressionContext({
      capabilities: fn.capabilities, bindings,
      calls: { direct: forbiddenCall, generated: forbiddenCall, generatedSymbol: forbiddenCall, inlineCpp: forbiddenCall, functionObject: forbiddenCall, tagged: forbiddenCall },
      stringConstant: (text) => module.stringConstant(text), exceptionTarget: () => exception,
      handlers: { number: lowerNumber, string: lowerString, condition: lowerCondition, value: lowerValueExpression }
    });
    bindings.storeValue(numbers, lowerValueExpression(array([1, 2, 3]), context));
    bindings.storeValue(object, lowerValueExpression({ kind: "objectLiteralValue", value: { fields: [
      { kind: "field", key: { kind: "literal", value: "x" }, value: number(16) }
    ] } }, context));
    bindCollection(context, bindings, collection);
    const fnValue = runtime.callBoxed("functionObjectNew", [cursor.currentBlock().functionPointer(callbackSpecHandle), cursor.currentBlock().nullPtr(),
      values.forBlock(cursor.currentBlock()).immediate("undefined"), values.forBlock(cursor.currentBlock()).immediate("undefined"),
      cursor.currentBlock().int(llvm.i64, 1n)], "callback");
    roots.push(fnValue);
    bindings.storeValue(callback, fnValue);
    for (const expression of samples(counter, numbers, object, collection, callback, fixed)) {
      runtime.callVoid("valuePrint", [lowerValueExpression(expression, context)]);
    }
    roots.restore(frame);
    cursor.currentBlock().ret(cursor.currentBlock().int(llvm.i32, 0n));
    cursor.openBlock(exception.block);
    roots.restore(frame);
    cursor.currentBlock().ret(cursor.currentBlock().int(llvm.i32, 1n));
  });
  return module;
}

test("typed value handlers preserve lazy evaluation, heap operands, and completion results", async () => {
  const clang = await toolExecutable("clang");
  expect(clang).toBeDefined();
  if (clang === undefined) { return; }
  const directory = await mkdtemp(path.join(tmpdir(), "tscn-native-values-"));
  try {
    const source = path.join(directory, "main.ll");
    const executable = path.join(directory, "main");
    await writeFile(source, valueModule().render().text);
    const compiled = await Effect.runPromise(captureCommand(clang, [source, "-o", executable]).pipe(Effect.provide(commandExecutorLayer)));
    expect(compiled.status, compiled.stderr).toBe(0);
    const result = await Effect.runPromise(captureCommand(executable, []).pipe(Effect.provide(commandExecutorLayer)));
    expect(result).toEqual({ status: 0, stderr: "", stdout: [
      "undefined", "null", "12", "true", "native", "a2", "9", "7", "null", "0", "1", "0", "undefined", "42", "undefined", "0",
      "5", "undefined", "2", "[object Array]", "2", "3", "true", "1", "3", "1", "undefined", "[object Object]", "16", "16", "16", "8", "16", "8", "wrapped", "18",
      "true", "true", "65", "66", "67", "3", "3", "[1,2]", "17", "bb", "null", "[object Array]", "13", "before2", "[12,7]", "12", "2", "undefined", "undefined", "undefined", "undefined", ""
    ].join("\n") });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

function throwingModule(expression: ResolvedValueExpression): NativeModule {
  const builder = createLlvmModule({ staticRuntime: [{ origin: "static runtime", text: runtimeIrText() }] });
  const module = new NativeModule(builder);
  module.defineFunction({ name: "main", parameters: [], returnsCompletion: false, returns: llvm.i32 }, (fn) => {
    fn.openEntry();
    const { cursor, runtime, roots, values } = fn.capabilities;
    runtime.callVoid("gcInit", []);
    const frame = roots.save();
    const exception = { block: cursor.reserveBlock("failed"), payloadSlot: cursor.currentBlock().alloca(llvm.i64, "exception") };
    const bindings = new BindingAccess(fn.capabilities, new Map(), (text) => module.stringConstant(text));
    const context = createExpressionContext({
      capabilities: fn.capabilities, bindings,
      calls: { direct: forbiddenCall, generated: forbiddenCall, generatedSymbol: forbiddenCall, inlineCpp: forbiddenCall, functionObject: forbiddenCall, tagged: forbiddenCall },
      stringConstant: (text) => module.stringConstant(text), exceptionTarget: () => exception,
      handlers: { number: lowerNumber, string: lowerString, condition: lowerCondition, value: lowerValueExpression }
    });
    lowerValueExpression(expression, context);
    roots.restore(frame);
    cursor.currentBlock().ret(cursor.currentBlock().int(llvm.i32, 1n));
    cursor.openBlock(exception.block);
    const error = values.forBlock(cursor.currentBlock()).fromBoundary(cursor.currentBlock().load(llvm.i64, exception.payloadSlot, "error"));
    roots.push(error);
    const message = runtime.callBoxed("valuePropertyGet", [error, cursor.currentBlock().int(llvm.i64, 7n),
      cursor.currentBlock().globalPointer(module.stringConstant("message"))], "message");
    runtime.callVoid("valuePrint", [message]);
    roots.restore(frame);
    cursor.currentBlock().ret(cursor.currentBlock().int(llvm.i32, 0n));
  });
  return module;
}

test.each([
  { name: "nullish property receiver", expression: { kind: "valueObjectDynamicAccess", value: { kind: "null" }, key: { kind: "literal", value: "x" } } satisfies ResolvedValueExpression,
    expected: "Cannot convert undefined or null to object\n" },
  { name: "private brand mismatch", expression: { kind: "privateFieldAccess", receiver: { kind: "objectLiteralValue", value: { fields: [] } }, key: "private", message: "wrong brand" } satisfies ResolvedValueExpression,
    expected: "wrong brand\n" }
])("$name preserves its thrown payload", async ({ expression, expected }) => {
  const clang = await toolExecutable("clang");
  expect(clang).toBeDefined();
  if (clang === undefined) { return; }
  const directory = await mkdtemp(path.join(tmpdir(), "tscn-native-value-throw-"));
  try {
    const source = path.join(directory, "main.ll");
    const executable = path.join(directory, "main");
    await writeFile(source, throwingModule(expression).render().text);
    const compiled = await Effect.runPromise(captureCommand(clang, [source, "-o", executable]).pipe(Effect.provide(commandExecutorLayer)));
    expect(compiled.status, compiled.stderr).toBe(0);
    const result = await Effect.runPromise(captureCommand(executable, []).pipe(Effect.provide(commandExecutorLayer)));
    expect(result).toEqual({ status: 0, stderr: "", stdout: expected });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
