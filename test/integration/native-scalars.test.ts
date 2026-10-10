import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Effect } from "effect";
import { expect, test } from "vitest";
import { type BindingRef, BindingRegistry, type ResolvedCondition, type ResolvedNumberExpression, type ResolvedStringExpression, type ResolvedValueExpression } from "../../src/compiler/binding-resolution/index.js";
import { createLlvmModule, llvm } from "../../src/compiler/llvm-ir/index.js";
import { NativeModule } from "../../src/compiler/native-lowering/index.js";
import { BindingAccess } from "../../src/compiler/native-lowering/binding-access.js";
import { lowerNumber } from "../../src/compiler/native-lowering/numbers.js";
import { lowerCondition } from "../../src/compiler/native-lowering/conditions.js";
import { lowerString } from "../../src/compiler/native-lowering/string-expressions.js";
import { type ExpressionContext, boxBoolean, boxString, createExpressionContext } from "../../src/compiler/native-lowering/expression-context.js";
import { runtimeIrText } from "../../src/compiler/runtime-files.js";
import { captureCommand, commandExecutorLayer, toolExecutable } from "./helpers.js";

function fixtureValue(expression: ResolvedValueExpression, context: ExpressionContext) {
  switch (expression.kind) {
    case "number": {
      const scalar = lowerNumber(expression.value, context);
      return context.values.forBlock(context.cursor.currentBlock()).boxNumber(scalar);
    }
    case "boolean": { return boxBoolean(lowerCondition(expression.value, context), context); }
    case "string": { return boxString(lowerString(expression.value, context), context); }
    case "variable": { return context.bindings.value(expression.name); }
    case "null": case "undefined": { return context.values.forBlock(context.cursor.currentBlock()).immediate(expression.kind); }
    default: { throw new Error(`Scalar fixture cannot construct ${expression.kind}`); }
  }
}

function number(value: number): ResolvedNumberExpression { return { kind: "literal", value }; }
function string(value: string): ResolvedStringExpression { return { kind: "literal", value }; }
function forbiddenCall(): never { throw new Error("Scalar fixture declares no callable functions"); }

function numericSamples(counter: BindingRef): readonly ResolvedNumberExpression[] {
  return [
    { kind: "binary", operator: "add", left: number(7), right: number(6) },
    { kind: "binary", operator: "bitOr", left: { kind: "nan" }, right: number(0) },
    { kind: "binary", operator: "shiftLeft", left: number(1), right: number(33) },
    { kind: "binary", operator: "bitOr", left: number(Infinity), right: number(1) },
    { kind: "binary", operator: "bitOr", left: number(4_294_967_297), right: number(0) },
    { kind: "unary", operator: "bitNot", value: { kind: "nan" } },
    { kind: "mathCall", method: "abs", arguments: [] },
    { kind: "mathCall", method: "min", arguments: [] },
    { kind: "mathCall", method: "max", arguments: [number(-2), number(7), number(3)] },
    { kind: "ternary", condition: { kind: "boolean", value: false },
      consequent: { kind: "update", name: counter, operator: "increment", prefix: true }, alternate: number(10) },
    { kind: "variable", name: counter }
  ];
}

function conditionSamples(counter: BindingRef): readonly ResolvedCondition[] {
  const changed: ResolvedCondition = { kind: "valueTruthy", value: {
    kind: "number", value: { kind: "update", name: counter, operator: "increment", prefix: true }
  } };
  return [
    { kind: "and", left: { kind: "boolean", value: false }, right: changed },
    { kind: "or", left: { kind: "boolean", value: true }, right: changed },
    { kind: "numberComparison", operator: "!==", left: { kind: "nan" }, right: number(1) },
    { kind: "numberComparison", operator: "===", left: { kind: "nan" }, right: { kind: "nan" } },
    { kind: "numberComparison", operator: "===", left: { kind: "binary", operator: "shiftRightUnsigned", left: number(-1), right: number(0) },
      right: number(4_294_967_295) }
  ];
}

const stringSamples: readonly ResolvedStringExpression[] = [
  { kind: "stringMethod", method: "trim", receiver: string("  bunny  ") },
  { kind: "stringMethod", method: "replaceAll", receiver: string("a-a"), search: string("a"), replacement: string("b") },
  { kind: "stringMethod", method: "slice", receiver: string("abcdef"), start: number(-3) },
  { kind: "stringMethod", method: "charAt", receiver: string("abc"), position: { kind: "nan" } },
  { kind: "stringFromCharCode", codes: [number(65), number(66)] },
  { kind: "ternary", condition: { kind: "boolean", value: false }, consequent: string("wrong"), alternate: string("right") }
];

function scalarModule(): NativeModule {
  const builder = createLlvmModule({ staticRuntime: [{ origin: "static runtime", text: runtimeIrText() }] });
  const module = new NativeModule(builder);
  module.defineFunction({ name: "main", parameters: [], returnsCompletion: false, returns: llvm.i32 }, (fn) => {
    fn.openEntry();
    const { cursor, runtime, roots, values } = fn.capabilities;
    runtime.callVoid("gcInit", []);
    const frame = roots.save();
    const registry = new BindingRegistry();
    const counter = registry.mint("counter", "let", { kind: "number" }, { kind: "function", function: registry.mintFunction() });
    const slot = cursor.currentBlock().alloca(llvm.double, "counter");
    cursor.currentBlock().store(cursor.currentBlock().double(0), slot);
    const bindings = new BindingAccess(fn.capabilities, new Map([[counter.binding, { kind: "numberSlot", slot }]]), (text) => module.stringConstant(text));
    const exception = { block: cursor.reserveBlock("failed"), payloadSlot: cursor.currentBlock().alloca(llvm.i64, "exception") };
    const context = createExpressionContext({
      capabilities: fn.capabilities, bindings,
      calls: {
        direct: forbiddenCall, generated: forbiddenCall, inlineCpp: forbiddenCall,
        functionObject: forbiddenCall, tagged: forbiddenCall
      },
      stringConstant: (text) => module.stringConstant(text), exceptionTarget: () => exception,
      handlers: { number: lowerNumber, string: lowerString, condition: lowerCondition, value: fixtureValue }
    });
    const printNumber = (expression: ResolvedNumberExpression) => {
      const result = lowerNumber(expression, context);
      runtime.callVoid("valuePrint", [values.forBlock(cursor.currentBlock()).boxNumber(result)]);
    };
    const printCondition = (condition: ResolvedCondition) => runtime.callVoid("valuePrint", [boxBoolean(lowerCondition(condition, context), context)]);
    const printString = (expression: ResolvedStringExpression) => runtime.callVoid("valuePrint", [boxString(lowerString(expression, context), context)]);
    for (const expression of numericSamples(counter)) printNumber(expression);
    for (const condition of conditionSamples(counter)) printCondition(condition);
    printNumber({ kind: "variable", name: counter });
    for (const expression of stringSamples) printString(expression);
    const owned = runtime.callString("stringTrim", [cursor.currentBlock().int(llvm.i64, 7n), cursor.currentBlock().globalPointer(module.stringConstant(" owned "))],
      cursor.uniqueName("owned.string"));
    runtime.callVoid("gcCollect", []);
    runtime.callVoid("valuePrint", [boxString(owned, context)]);
    roots.restore(frame);
    cursor.currentBlock().ret(cursor.currentBlock().int(llvm.i32, 0n));
    cursor.openBlock(exception.block);
    roots.restore(frame);
    cursor.currentBlock().ret(cursor.currentBlock().int(llvm.i32, 1n));
  });
  return module;
}

test("typed scalar tiers execute JavaScript integer conversions and skip untaken operands", async () => {
  const clang = await toolExecutable("clang");
  if (clang === undefined) return;
  const directory = await mkdtemp(path.join(tmpdir(), "tscn-native-scalars-"));
  try {
    const source = path.join(directory, "main.ll");
    const executable = path.join(directory, "main");
    await writeFile(source, scalarModule().render().text);
    const compiled = await Effect.runPromise(captureCommand(clang, [source, "-o", executable]).pipe(Effect.provide(commandExecutorLayer)));
    expect(compiled.status, compiled.stderr).toBe(0);
    const result = await Effect.runPromise(captureCommand(executable, []).pipe(Effect.provide(commandExecutorLayer)));
    expect(result).toEqual({ status: 0, stderr: "", stdout: [
      "13", "0", "2", "1", "1", "-1", "NaN", "Infinity", "7", "10", "0",
      "false", "true", "true", "false", "true", "0", "bunny", "b-b", "def", "a", "AB", "right", "owned", ""
    ].join("\n") });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
