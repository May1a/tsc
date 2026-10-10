import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Effect } from "effect";
import { expect, test } from "vitest";
import { type BindingRef, BindingRegistry, type ResolvedOperation, type ResolvedValueExpression } from "../../src/compiler/binding-resolution/index.js";
import { type LlvmFunctionSpec, createLlvmModule, llvm } from "../../src/compiler/llvm-ir/index.js";
import { BindingAccess } from "../../src/compiler/native-lowering/binding-access.js";
import { allocateBinding } from "../../src/compiler/native-lowering/binding-allocation.js";
import { ControlFlow } from "../../src/compiler/native-lowering/control-flow.js";
import { type FunctionCapabilities, NativeModule, type NativeParameter } from "../../src/compiler/native-lowering/index.js";
import { createOperationContext } from "../../src/compiler/native-lowering/operation-owner.js";
import { captureCommand, commandExecutorLayer, toolExecutable } from "./helpers.js";
import { runtimeIrText } from "../../src/compiler/runtime-files.js";

interface Names {
  readonly source: BindingRef; readonly item: BindingRef; readonly rest: BindingRef; readonly counter: BindingRef;
  readonly stringItem: BindingRef; readonly collect: BindingRef;
}
interface Scenario {
  readonly name: string;
  readonly body: (names: Names) => readonly ResolvedOperation[];
  readonly nextThrows?: boolean;
  readonly closeThrows?: boolean;
  readonly undefinedItem?: boolean;
}

function number(value: number): Extract<ResolvedOperation, { kind: "returnNumber" }> { return { kind: "returnNumber", expression: { kind: "literal", value } }; }
function print(name: BindingRef): ResolvedOperation { return { kind: "print", expression: { kind: "identifier", name } }; }
function loop(names: Names, body: readonly ResolvedOperation[]): ResolvedOperation {
  return { kind: "forOfProtocol", iterable: { kind: "variable", name: names.source }, itemName: names.item, notIterableMessage: "not iterable", body };
}
function destructure(names: Names, elements: Extract<ResolvedOperation, { kind: "arrayDestructureProtocol" }>["elements"]): ResolvedOperation {
  return { kind: "arrayDestructureProtocol", source: { kind: "value", value: { kind: "variable", name: names.source } }, elements, notIterableMessage: "not iterable" };
}
function forbiddenCall(): never { throw new Error("Protocol fixture contains no generated calls"); }
function numeric(value: number): ResolvedValueExpression { return { kind: "number", value: { kind: "literal", value } }; }
function arrayItem(name: BindingRef, index: number): ResolvedOperation {
  return { kind: "print", expression: { kind: "value", value: { kind: "valueArrayAccess", value: { kind: "variable", name },
    index: { kind: "literal", value: index }, key: { kind: "literal", value: String(index) } } } };
}

function builtins(n: Names): readonly ResolvedOperation[] {
  return [
    { kind: "runtimeArrayLiteral", name: n.source, elements: [numeric(20), numeric(21)].map((value) => ({ kind: "value", value })) },
    { kind: "forOfArray", arrayName: n.source, itemName: n.item, body: [print(n.item)] },
    { kind: "forInArray", arrayName: n.source, itemName: n.item, body: [print(n.item)] },
    { kind: "forOfString", source: { kind: "literal", value: "A🐇B" }, itemName: n.stringItem, body: [print(n.stringItem)] },
    { kind: "call", name: n.collect, arguments: [] }, print(n.stringItem),
    { kind: "forOfProtocol", iterable: { kind: "string", value: { kind: "literal", value: "CD" } },
      itemName: n.item, notIterableMessage: "not iterable", body: [print(n.item)] },
    { kind: "call", name: n.collect, arguments: [] }, print(n.item),
    { kind: "runtimeObjectLiteral", name: n.source, value: { fields: ["first", "second"].map((key) => ({
      kind: "field", key: { kind: "literal", value: key }, value: numeric(0)
    })) } },
    { kind: "forInObject", objectName: n.source, itemName: n.item, body: [print(n.item)] },
    { kind: "runtimeSetNew", name: n.source },
    { kind: "runtimeSetAdd", setName: n.source, value: numeric(22) },
    { kind: "runtimeSetAdd", setName: n.source, value: numeric(23) },
    { kind: "forOfSet", setName: n.source, itemName: n.item, body: [print(n.item)] },
    { kind: "arrayDestructureProtocol", source: { kind: "collection", name: n.source, sourceKind: "set" },
      elements: [{ kind: "binding", name: n.item }], notIterableMessage: "not iterable" },
    print(n.item),
    { kind: "runtimeMapNew", name: n.source },
    { kind: "runtimeMapSet", mapName: n.source, key: numeric(24), value: numeric(25) },
    { kind: "forOfMap", mapName: n.source, itemName: n.item, body: [arrayItem(n.item, 0), arrayItem(n.item, 1)] },
    number(12)
  ];
}

const scenarios: readonly Scenario[] = [
  { name: "exhaust", body: (n) => [loop(n, [print(n.item)]), number(1)] },
  { name: "continue", body: (n) => [loop(n, [print(n.item), { kind: "continue" }]), number(2)] },
  { name: "break", body: (n) => [loop(n, [{ kind: "break" }]), number(3)] },
  { name: "return", body: (n) => [loop(n, [number(4)]), number(-1)] },
  { name: "throw", closeThrows: true, body: (n) => [loop(n, [{ kind: "throwValue", value: { kind: "number", value: { kind: "literal", value: 5 } } }]), number(-1)] },
  { name: "return.close.failure", closeThrows: true, body: (n) => [loop(n, [number(6)]), number(-1)] },
  { name: "next.failure", nextThrows: true, body: (n) => [loop(n, [print(n.item)]), number(-1)] },
  { name: "destructure.finite", body: (n) => [destructure(n, [{ kind: "binding", name: n.item }]), print(n.item), number(7)] },
  { name: "destructure.rest", body: (n) => [destructure(n, [{ kind: "elision" }, { kind: "rest", name: n.rest }]), { kind: "print", expression: { kind: "value", value: { kind: "valueArrayAccess", value: { kind: "variable", name: n.rest }, index: { kind: "literal", value: 0 }, key: { kind: "literal", value: "0" } } } }, number(8)] },
  { name: "destructure.next.failure", nextThrows: true, body: (n) => [destructure(n, [{ kind: "binding", name: n.item }]), number(-1)] },
  { name: "destructure.default", undefinedItem: true, body: (n) => [
    { kind: "letNumber", name: n.counter, value: { kind: "literal", value: 0 } },
    destructure(n, [{ kind: "binding", name: n.item, defaultValue: { kind: "number", value: { kind: "update", name: n.counter, operator: "increment", prefix: true } } }]),
    print(n.item), print(n.counter), number(9)
  ] },
  { name: "destructure.default.skipped", body: (n) => [
    { kind: "letNumber", name: n.counter, value: { kind: "literal", value: 0 } },
    destructure(n, [{ kind: "binding", name: n.item, defaultValue: { kind: "number", value: { kind: "update", name: n.counter, operator: "increment", prefix: true } } }]),
    print(n.item), print(n.counter), number(10)
  ] },
  { name: "destructure.default.failure", undefinedItem: true, closeThrows: true, body: (n) => [
    { kind: "tryCatch", hasCatch: true, catchVariable: n.item,
      tryOperations: [destructure(n, [{ kind: "binding", name: n.item, defaultValue: {
        kind: "valueObjectDynamicAccess", value: { kind: "null" }, key: { kind: "literal", value: "missing" }
      } }])],
      catchOperations: [{ kind: "print", expression: { kind: "value", value: { kind: "boolean", value: {
        kind: "errorInstanceOf", value: { kind: "variable", name: n.item }, errorName: "TypeError"
      } } } }], finallyOperations: [] }, number(13)
  ] },
  { name: "destructure.nested.return", body: (n) => [destructure(n, [
    { kind: "nested", temporaryName: n.item, operations: [number(11)] }, { kind: "binding", name: n.rest }
  ]), number(-1)] },
  { name: "builtins", body: builtins }
];

function protocolModule(): NativeModule {
  const builder = createLlvmModule({ staticRuntime: [{ origin: "static runtime", text: runtimeIrText() }] });
  const module = new NativeModule(builder);
  const step = module.defineGlobal({ name: "fixture.step", type: llvm.i64, linkage: "internal", constant: false, unnamedAddress: false,
    initializer: { kind: "zeroInitializer", type: llvm.i64 } });
  const callbacks = scenarios.map((scenario) => {
    const { next, close } = iteratorCallbacks(module, step, scenario);
    return { scenario, next, close };
  });
  const registry = new BindingRegistry();
  const owner = { kind: "function", function: registry.mintFunction() } as const;
  const names: Names = {
    source: registry.mint("source", "let", { kind: "value" }, owner), item: registry.mint("item", "let", { kind: "value" }, owner),
    rest: registry.mint("rest", "let", { kind: "value" }, owner), counter: registry.mint("counter", "let", { kind: "number" }, owner),
    stringItem: registry.mint("stringItem", "let", { kind: "string" }, owner), collect: registry.mint("collect", "function", { kind: "value" }, owner)
  };
  const specs = callbacks.map(({ scenario, next, close }) => {
    const spec = module.declareFunction({ name: `fixture.${scenario.name}`, parameters: [], returnsCompletion: true });
    module.defineFunction({ name: spec.name, parameters: [], returnsCompletion: true }, (fn) => {
      fn.openEntry();
      const { cursor, roots, completion } = fn.capabilities;
      const frame = roots.save();
      cursor.currentBlock().store(cursor.currentBlock().int(llvm.i64, 0n), cursor.currentBlock().globalPointer(step));
      const writes = new BindingAccess(fn.capabilities, new Map(registry.table().declarations.map((declaration) =>
        [declaration.id, allocateBinding(declaration, undefined, fn.capabilities)] as const)), (text) => module.stringConstant(text));
      writes.storeValue(names.source, makeIterator(fn.capabilities, module, next, close));
      const flow = new ControlFlow(fn.capabilities, (value, threw) => {
        roots.restore(frame);
        if (threw) completion.throwValue(value); else completion.returnValue(value);
      });
      const context = createOperationContext({ capabilities: fn.capabilities, writes, flow, withTrace: (id, build) => fn.withTrace(id, build),
        stringConstant: (text) => module.stringConstant(text), calls: () => ({
          direct: (call) => {
            if (call.name.binding !== names.collect.binding) throw new Error("Protocol fixture contains an undeclared call");
            fn.capabilities.runtime.callVoid("gcCollect", []);
            return fn.capabilities.values.forBlock(cursor.currentBlock()).immediate("undefined");
          }, generated: forbiddenCall, inlineCpp: forbiddenCall, functionObject: forbiddenCall, tagged: forbiddenCall,
          reference: forbiddenCall, closure: forbiddenCall, callback: forbiddenCall, returnedClosure: forbiddenCall
        }) });
      context.operations.operations(scenario.body(names));
      if (!cursor.currentBlock().terminated) flow.returnValue(fn.capabilities.values.forBlock(cursor.currentBlock()).immediate("undefined"));
      flow.finish();
    });
    return spec;
  });
  module.defineFunction({ name: "main", parameters: [], returnsCompletion: false, returns: llvm.i32 }, (fn) => {
    fn.openEntry();
    const { cursor, runtime, roots, values, completion } = fn.capabilities;
    runtime.callVoid("gcInit", []);
    const frame = roots.save();
    for (const spec of specs) {
      const failed = { block: cursor.reserveBlock("failed"), payloadSlot: cursor.currentBlock().alloca(llvm.i64, cursor.uniqueName("exception")) };
      const done = cursor.reserveBlock("done");
      const value = completion.direct(spec, [], cursor.uniqueName("result"), failed);
      roots.push(value);
      runtime.callVoid("valuePrint", [value]);
      cursor.currentBlock().br(done);
      cursor.openBlock(failed.block);
      const error = values.forBlock(cursor.currentBlock()).fromBoundary(cursor.currentBlock().load(llvm.i64, failed.payloadSlot, cursor.uniqueName("caught")));
      roots.push(error);
      runtime.callVoid("valuePrint", [error]);
      cursor.currentBlock().br(done);
      cursor.openBlock(done);
    }
    runtime.callVoid("gcCollect", []);
    const liveBytes = runtime.call("gcStatsLiveBytes", [], "remaining.bytes");
    runtime.callVoid("valuePrint", [values.forBlock(cursor.currentBlock()).boxNumber(
      cursor.currentBlock().cast("uitofp", liveBytes, llvm.double, "remaining.number"))]);
    roots.restore(frame);
    cursor.currentBlock().ret(cursor.currentBlock().int(llvm.i32, 0n));
  });
  return module;
}

const parameters: readonly NativeParameter[] = [
  { name: "argc", type: llvm.i64 }, { name: "argv", type: llvm.ptr }, { name: "env", type: llvm.ptr },
  { name: "this", type: llvm.i64, representation: "boxed", protection: "borrowed" }
];

function iteratorCallbacks(module: NativeModule, step: ReturnType<NativeModule["defineGlobal"]>, scenario: Scenario) {
  const next = module.declareFunction({ name: `next.${scenario.name}`, parameters, returnsCompletion: true });
  const close = module.declareFunction({ name: `close.${scenario.name}`, parameters, returnsCompletion: true });
  module.defineFunction({ name: next.name, parameters, returnsCompletion: true }, (fn) => {
    fn.openEntry();
    const { cursor, runtime, values, completion } = fn.capabilities;
    runtime.callVoid("gcCollect", []);
    const block = cursor.currentBlock();
    if (scenario.nextThrows) { completion.throwValue(values.forBlock(block).boxNumber(block.double(77))); return; }
    const slot = block.globalPointer(step);
    const index = block.load(llvm.i64, slot, "index");
    block.store(block.add(index, block.int(llvm.i64, 1n), "increment"), slot);
    const done = block.icmp("sge", index, block.int(llvm.i64, 2n), "done");
    const item = scenario.undefinedItem ? values.forBlock(block).immediate("undefined")
      : values.forBlock(block).boxNumber(block.cast("sitofp", index, llvm.double, "item"));
    const result = runtime.callBoxed("iteratorResultObject", [item, done], "result");
    completion.returnValue(result);
  });
  module.defineFunction({ name: close.name, parameters, returnsCompletion: true }, (fn) => {
    fn.openEntry();
    const { cursor, runtime, values, roots, completion } = fn.capabilities;
    const frame = roots.save();
    runtime.callVoid("gcCollect", []);
    const block = cursor.currentBlock();
    const marker = runtime.callBoxed("valueCopyString", [block.globalPointer(module.stringConstant("closed")), block.int(llvm.i64, 6n)], "marker");
    roots.push(marker);
    runtime.callVoid("valuePrint", [marker]);
    roots.restore(frame);
    if (scenario.closeThrows) { completion.throwValue(values.forBlock(block).boxNumber(block.double(99))); }
    else { completion.returnValue(fn.boxedParameter(3)); }
  });
  return { next, close };
}

function makeIterator(capabilities: FunctionCapabilities, module: NativeModule, next: LlvmFunctionSpec, close: LlvmFunctionSpec) {
  const { cursor, runtime, values, roots } = capabilities;
  const block = cursor.currentBlock();
  const object = runtime.callPointer("objectNew", [block.int(llvm.i64, 3n)], "iterator.object");
  const owner = values.forBlock(block).boxReference("object", object);
  roots.push(owner);
  for (const [key, spec] of [["next", next], ["return", close], ["\uF8FFSymbol.iterator", module.callees.iteratorSelfMethod]] as const) {
    const fn = runtime.callBoxed("functionObjectNew", [block.functionPointer(spec), block.nullPtr(), values.forBlock(block).immediate("undefined"),
      values.forBlock(block).immediate("undefined"), block.int(llvm.i64, 0n)], cursor.uniqueName("method"));
    roots.push(fn);
    runtime.callVoid("objectSet", [object, block.int(llvm.i64, BigInt(new TextEncoder().encode(key).length)), block.globalPointer(module.stringConstant(key)), fn]);
  }
  return owner;
}

test("typed iterator cleanup preserves completion and mutable bindings across collection, then releases their roots", async () => {
  const clang = await toolExecutable("clang");
  if (clang === undefined) return;
  const directory = await mkdtemp(path.join(tmpdir(), "tscn-native-protocol-"));
  try {
    const source = path.join(directory, "main.ll");
    const executable = path.join(directory, "main");
    await writeFile(source, protocolModule().render().text);
    const compiled = await Effect.runPromise(captureCommand(clang, [source, "-o", executable]).pipe(Effect.provide(commandExecutorLayer)));
    expect(compiled.status, compiled.stderr).toBe(0);
    const result = await Effect.runPromise(captureCommand(executable, []).pipe(Effect.provide(commandExecutorLayer)));
    expect(result).toEqual({ status: 0, stderr: "", stdout: "0\n1\n1\n0\n1\n2\nclosed\n3\nclosed\n4\nclosed\n5\nclosed\n99\n77\nclosed\n0\n7\n1\n8\n77\nclosed\n1\n1\n9\nclosed\n0\n0\n10\nclosed\ntrue\n13\nclosed\n11\n20\n21\n0\n1\nA\n🐇\nB\nB\nC\nD\nD\nfirst\nsecond\n22\n23\n22\n24\n25\n12\n0\n" });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
