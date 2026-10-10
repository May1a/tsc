import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Effect } from "effect";
import { expect, test } from "vitest";
import { type BindingRef, BindingRegistry, type ResolvedNumberExpression, type ResolvedOperation } from "../../src/compiler/binding-resolution/index.js";
import { dispatchKind } from "../../src/compiler/dispatch.js";
import { createLlvmModule, llvm } from "../../src/compiler/llvm-ir/index.js";
import { BindingAccess } from "../../src/compiler/native-lowering/binding-access.js";
import { allocateBinding } from "../../src/compiler/native-lowering/binding-allocation.js";
import { ControlFlow } from "../../src/compiler/native-lowering/control-flow.js";
import { createExpressionContext } from "../../src/compiler/native-lowering/expression-context.js";
import { NativeModule } from "../../src/compiler/native-lowering/index.js";
import { lowerCondition } from "../../src/compiler/native-lowering/conditions.js";
import { lowerNumber } from "../../src/compiler/native-lowering/numbers.js";
import type { OperationContext } from "../../src/compiler/native-lowering/operation-context.js";
import { scalarOperationHandlers } from "../../src/compiler/native-lowering/scalar-operations.js";
import { lowerString } from "../../src/compiler/native-lowering/string-expressions.js";
import { lowerValueExpression } from "../../src/compiler/native-lowering/value-expressions.js";
import { runtimeIrText } from "../../src/compiler/runtime-files.js";
import { captureCommand, commandExecutorLayer, toolExecutable } from "./helpers.js";

function lowerFixture(operation: ResolvedOperation, context: OperationContext): void {
  switch (operation.kind) {
    case "print": case "returnNumber": case "returnValue": case "throwValue": case "tryCatch": case "while":
    case "assignNumber": case "letNumber": case "break": case "continue": case "if": case "returnString": case "call":
    case "for": case "doWhile": case "switch": {
      dispatchKind(scalarOperationHandlers, operation, context);
      return;
    }
    default: { throw new Error(`Control fixture does not declare ${operation.kind}`); }
  }
}

function forbiddenCall(): never { throw new Error("Control fixture declares no callable expressions"); }
function number(value: number): ResolvedNumberExpression { return { kind: "literal", value }; }
function print(value: string): ResolvedOperation { return { kind: "print", expression: { kind: "string", value } }; }
function returning(value: number): ResolvedOperation { return { kind: "returnNumber", expression: number(value) }; }

function bodies(counter: BindingRef, caught: BindingRef, collect: BindingRef): readonly (readonly ResolvedOperation[])[] {
  const variable: ResolvedNumberExpression = { kind: "variable", name: counter };
  return [
    [{ kind: "tryCatch", hasCatch: false, catchVariable: undefined, tryOperations: [returning(7)], catchOperations: [], finallyOperations: [print("finally")] }],
    [{ kind: "tryCatch", hasCatch: false, catchVariable: undefined, tryOperations: [returning(8)], catchOperations: [], finallyOperations: [returning(9)] }],
    [{ kind: "tryCatch", hasCatch: true, catchVariable: caught,
      tryOperations: [{ kind: "throwValue", value: { kind: "number", value: number(11) } }],
      catchOperations: [{ kind: "print", expression: { kind: "identifier", name: caught } }], finallyOperations: [print("caught.finally")] }, returning(12)],
    [{ kind: "letNumber", name: counter, value: number(0) },
      { kind: "while", condition: { kind: "numberComparison", operator: "<", left: variable, right: number(4) }, body: [
        { kind: "assignNumber", name: counter, value: { kind: "binary", operator: "add", left: variable, right: number(1) } },
        { kind: "tryCatch", hasCatch: false, catchVariable: undefined, catchOperations: [], tryOperations: [
          { kind: "if", condition: { kind: "numberComparison", operator: "<", left: variable, right: number(3) },
            thenOperations: [{ kind: "continue" }], elseOperations: [{ kind: "break" }] }
        ], finallyOperations: [{ kind: "print", expression: { kind: "number", value: variable } }] }
      ] }, { kind: "returnNumber", expression: variable }],
    [{ kind: "tryCatch", hasCatch: false, catchVariable: undefined, catchOperations: [],
      tryOperations: [{ kind: "returnString", expression: { kind: "literal", value: "retained" } }],
      finallyOperations: [{ kind: "call", name: collect, arguments: [] }, print("collected.finally")] }],
    [{ kind: "tryCatch", hasCatch: true, catchVariable: caught, catchOperations: [print("outer.catch"), printCaught(caught)],
      tryOperations: [{ kind: "tryCatch", hasCatch: false, catchVariable: undefined, catchOperations: [],
        tryOperations: [returning(13)], finallyOperations: [{ kind: "throwValue", value: { kind: "number", value: number(14) } }] }],
      finallyOperations: [print("outer.finally")] }, returning(15)],
    [{ kind: "tryCatch", hasCatch: true, catchVariable: caught, catchOperations: [print("outer.catch.throw"), printCaught(caught)],
      tryOperations: [{ kind: "tryCatch", hasCatch: true, catchVariable: caught,
        tryOperations: [{ kind: "throwValue", value: { kind: "number", value: number(16) } }],
        catchOperations: [{ kind: "throwValue", value: { kind: "number", value: number(17) } }],
        finallyOperations: [{ kind: "call", name: collect, arguments: [] }, print("inner.finally")] }],
      finallyOperations: [print("outer.finally.throw")] }, returning(18)],
    [{ kind: "letNumber", name: counter, value: number(0) },
      { kind: "doWhile", condition: { kind: "numberComparison", operator: "<", left: variable, right: number(0) },
        body: [{ kind: "assignNumber", name: counter, value: number(1) }, printCaught(counter)] }, returning(19)],
    [{ kind: "for", initializer: [{ kind: "letNumber", name: counter, value: number(0) }],
      condition: { kind: "numberComparison", operator: "<", left: variable, right: number(3) },
      increment: { kind: "assignNumber", name: counter, value: { kind: "binary", operator: "add", left: variable, right: number(1) } },
      body: [{ kind: "tryCatch", hasCatch: false, catchVariable: undefined, catchOperations: [],
        tryOperations: [{ kind: "continue" }], finallyOperations: [printCaught(counter)] }] }, { kind: "returnNumber", expression: variable }],
    [{ kind: "switch", expression: { kind: "number", value: number(1) }, clauses: [
      { test: { kind: "number", value: number(1) }, operations: [print("first.case")] },
      { operations: [print("middle.default")] },
      { test: { kind: "number", value: number(2) }, operations: [print("last.case"), { kind: "break" }] }
    ] }, returning(20)]
  ];
}

function printCaught(name: BindingRef): ResolvedOperation { return { kind: "print", expression: { kind: "identifier", name } }; }

function controlModule(): NativeModule {
  const builder = createLlvmModule({ staticRuntime: [{ origin: "static runtime", text: runtimeIrText() }] });
  const module = new NativeModule(builder);
  const registry = new BindingRegistry();
  const owner = { kind: "function", function: registry.mintFunction() } as const;
  const counter = registry.mint("counter", "let", { kind: "number" }, owner);
  const caught = registry.mint("caught", "catch", { kind: "value" }, owner);
  const collect = registry.mint("collect", "function", { kind: "value" }, owner);
  const specs = bodies(counter, caught, collect).map((body, index) => ({
    body, spec: module.declareFunction({ name: `case.${index}`, parameters: [], returnsCompletion: true })
  }));
  for (const { body, spec } of specs) {
    module.defineFunction({ name: spec.name, parameters: [], returnsCompletion: true }, (fn) => {
      fn.openEntry();
      const { cursor, roots, completion } = fn.capabilities;
      const frame = roots.save();
      const writes = new BindingAccess(fn.capabilities, new Map(registry.table().declarations.map((declaration) =>
        [declaration.id, allocateBinding(declaration, undefined, fn.capabilities)] as const)), (text) => module.stringConstant(text));
      const flow = new ControlFlow(fn.capabilities, (value, threw) => {
        roots.restore(frame);
        if (threw) completion.throwValue(value); else completion.returnValue(value);
      });
      const expression = createExpressionContext({
        capabilities: fn.capabilities, bindings: writes,
        calls: { direct: (call) => {
          if (call.name.binding !== collect.binding) throw new Error("Control fixture contains an undeclared call");
          fn.capabilities.runtime.callVoid("gcCollect", []);
          return fn.capabilities.values.forBlock(cursor.currentBlock()).immediate("undefined");
        }, generated: forbiddenCall, inlineCpp: forbiddenCall,
          functionObject: forbiddenCall, tagged: forbiddenCall },
        stringConstant: (text) => module.stringConstant(text), exceptionTarget: () => flow.exceptionTarget(),
        handlers: { number: lowerNumber, string: lowerString, condition: lowerCondition, value: lowerValueExpression }
      });
      const context: OperationContext = {
        ...expression, writes, flow, initializeFixedArray: (reference, values) => writes.initializeFixedArray(reference, values),
        calls: { ...expression.calls, reference: forbiddenCall, closure: forbiddenCall, callback: forbiddenCall, returnedClosure: forbiddenCall },
        returnValue: (value) => flow.returnValue(value), throwValue: (value) => flow.throwValue(value),
        operations: {
          operation: (operation) => lowerFixture(operation, context),
          operations: (operations) => {
            for (const operation of operations) {
              if (cursor.currentBlock().terminated) break;
              lowerFixture(operation, context);
            }
          }
        }
      };
      context.operations.operations(body);
      if (!cursor.currentBlock().terminated) flow.returnValue(expression.values.forBlock(cursor.currentBlock()).immediate("undefined"));
      flow.finish();
    });
  }
  module.defineFunction({ name: "main", parameters: [], returnsCompletion: false, returns: llvm.i32 }, (fn) => {
    fn.openEntry();
    const { cursor, runtime, roots, completion } = fn.capabilities;
    runtime.callVoid("gcInit", []);
    const frame = roots.save();
    const failed = { block: cursor.reserveBlock("failed"), payloadSlot: cursor.currentBlock().alloca(llvm.i64, "exception") };
    for (const { spec } of specs) {
      const value = completion.direct(spec, [], cursor.uniqueName("case.result"), failed);
      roots.push(value);
      runtime.callVoid("valuePrint", [value]);
    }
    roots.restore(frame);
    cursor.currentBlock().ret(cursor.currentBlock().int(llvm.i32, 0n));
    cursor.openBlock(failed.block);
    roots.restore(frame);
    cursor.currentBlock().ret(cursor.currentBlock().int(llvm.i32, 1n));
  });
  return module;
}

test("typed cleanup paths run finally on return, throw, break and continue, and allow override", async () => {
  const clang = await toolExecutable("clang");
  if (clang === undefined) return;
  const directory = await mkdtemp(path.join(tmpdir(), "tscn-native-control-"));
  try {
    const source = path.join(directory, "main.ll");
    const executable = path.join(directory, "main");
    await writeFile(source, controlModule().render().text);
    const compiled = await Effect.runPromise(captureCommand(clang, [source, "-o", executable]).pipe(Effect.provide(commandExecutorLayer)));
    expect(compiled.status, compiled.stderr).toBe(0);
    const result = await Effect.runPromise(captureCommand(executable, []).pipe(Effect.provide(commandExecutorLayer)));
    expect(result).toEqual({ status: 0, stderr: "", stdout: "finally\n7\n9\n11\ncaught.finally\n12\n1\n2\n3\n3\ncollected.finally\nretained\nouter.catch\n14\nouter.finally\n15\ninner.finally\nouter.catch.throw\n17\nouter.finally.throw\n18\n1\n19\n0\n1\n2\n3\nfirst.case\nmiddle.default\nlast.case\n20\n" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
