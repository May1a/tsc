import { describe, expect, test } from "vitest";
import { analyzeRuntime, generatedContracts } from "../../scripts/generate-runtime-contracts.mjs";
import { runtimeContracts } from "../../src/compiler/runtime-contracts/index.js";
import { createRuntimeCallees } from "../../src/compiler/runtime-contracts/callables/index.js";
import { createLlvmModule, llvm } from "../../src/compiler/llvm-ir/index.js";
import { defineStructuredRuntimeHelpers } from "../../src/compiler/runtime-ir.js";

describe("Static Runtime IR contracts", () => {
  test("distinguishes boxed results from raw words and explicit completion", () => {
    expect(runtimeContracts.arrayGet.resultKind).toBe("boxed");
    expect(runtimeContracts.objectGet.resultKind).toBe("boxed");
    expect(runtimeContracts.functionObjectNew.resultKind).toBe("boxed");
    expect(runtimeContracts.valueLength.resultKind).toBe("scalar");
    expect(runtimeContracts.gcRootSave.resultKind).toBe("scalar");
    expect(runtimeContracts.arrayMapCallback.resultKind).toBe("completion");
    expect(runtimeContracts.valueToString.resultKind).toBe("string");
    expect(runtimeContracts.valueNumber.resultKind).toBe("scalar");
    expect(generatedContracts({ "foreign.ll": "declare i64 @foreignValue()" }).get("foreign.ts"))
      .toContain('resultKind: "boxed"');
  });
  test("registers typed callees with one declaration per entry symbol and no static runtime duplicates", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    const callees = createRuntimeCallees(module);
    defineStructuredRuntimeHelpers(module);
    module.defineFunction({ name: "catalogUser", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => {
        const array = block.call(callees.arrayNew, [block.int(llvm.i64, 0n)], "array");
        block.call(callees.valueBoxArray, [array], "boxed");
        block.ret();
      });
    });
    const built = module.build();
    expect(built.declarations.map((spec) => spec.name)).toEqual(["puts", "printf", "exit"]);
    expect(built.functions.map((fn) => fn.spec.name)).toEqual(["valueBoxObject", "valueBoxNumber", "valueNumber", "catalogUser"]);
    expect(callees.arrayNew.returns).toEqual({ kind: "pointer" });
    expect(callees.valueBoxNumber.returns).toEqual({ kind: "integer", bits: 64 });
    expect(callees.arrayMapCallback.returns).toEqual({
      kind: "struct", elements: [{ kind: "integer", bits: 64 }, { kind: "integer", bits: 1 }]
    });
  });
  test("distinguishes symbols already emitted by static files from typed helpers and entry declarations", () => {
    expect(runtimeContracts.arrayNew.origin).toBe("staticRuntime");
    expect(runtimeContracts.malloc.origin).toBe("staticRuntime");
    expect(runtimeContracts.valueBoxNumber.origin).toBe("structuredRuntime");
    expect(runtimeContracts.printf.origin).toBe("entryDeclaration");
    const generated = generatedContracts({ "runtime.ll": "declare void @foreignCallback()" }).get("runtime.ts");
    expect(generated).toContain('origin: "staticRuntime"');
  });
  test("propagates GC allocation and collection through recursive call graphs", () => {
    const contracts = analyzeRuntime({ "gc.ll": [
      "define ptr @gcAlloc(i64 %tag, i64 %size) {", "  ret ptr null", "}",
      "define void @gcCollect() {", "  ret void", "}",
      "define void @first() {", "  call void @second()", "  ret void", "}",
      "define void @second() {", "  call void @first()", "  call ptr @gcAlloc(i64 1, i64 16)", "  call void @gcCollect()", "  ret void", "}"
    ].join("\n") });
    expect(contracts.get("first")).toMatchObject({ allocates: true, collects: true });
    expect(contracts.get("second")).toMatchObject({ allocates: true, collects: true });
  });

  test("treats indirect JavaScript calls as possible GC safepoints", () => {
    const contracts = analyzeRuntime({ "functions.ll": "define { i64, i1 } @jsCall(ptr %code) {\n  %result = call { i64, i1 } %code()\n  ret { i64, i1 } %result\n}" });
    expect(contracts.get("jsCall")).toMatchObject({ allocates: true, collects: true });
  });

  test("propagates unknown foreign effects and refuses undeclared callees", () => {
    const contracts = analyzeRuntime({ "foreign.ll": [
      "declare void @foreignCallback()",
      "define void @invoke() {", "  call void @foreignCallback()", "  ret void", "}"
    ].join("\n") });
    expect(contracts.get("invoke")).toMatchObject({ allocates: true, collects: true });
    expect(() => analyzeRuntime({ "bad.ll": "define void @invoke() {\n  call void @missing()\n  ret void\n}" }))
      .toThrow("calls missing without a contract or declaration");
  });

  test("derives the explicit completion ABI without confusing boolean fields with exceptions", () => {
    const generated = generatedContracts({ "objects.ll": [
      "declare { i64, i1 } @checkedValuePropertyGet(i64, i64, ptr)",
      "declare { i64, i64, i64, i1, i1 } @objectDescriptor(ptr, i64, ptr)",
      "declare i32 @printf(ptr, ...)"
    ].join("\n") }).get("objects.ts");
    expect(generated).toContain('returns: llvm.struct([llvm.i64, llvm.i1]), variadic: false,\n    effects: { allocates: true, collects: true, completion: "explicit" }');
    expect(generated).toContain('returns: llvm.struct([llvm.i64, llvm.i64, llvm.i64, llvm.i1, llvm.i1]), variadic: false,\n    effects: { allocates: true, collects: true, completion: "none" }');
    expect(generated).toContain('name: "printf", parameters: [llvm.ptr], returns: llvm.i32, variadic: true');
  });

  test("refuses unsupported signatures and duplicate definitions", () => {
    expect(() => generatedContracts({ "values.ll": "declare i128 @bad()" })).toThrow("Unsupported runtime ABI type i128");
    expect(() => analyzeRuntime({ "first.ll": "declare void @same()", "second.ll": "declare void @same()" })).toThrow("Duplicate runtime symbol same");
    expect(() => analyzeRuntime({ "values.ll": "declare void @attributed() nounwind" })).toThrow("Cannot derive every runtime signature");
  });
});
