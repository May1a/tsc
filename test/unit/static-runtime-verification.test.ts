import { expect, test } from "vitest";
import { verifyStaticRuntime } from "../../scripts/verify-static-runtime.mjs";
import { createLlvmModule } from "../../src/compiler/llvm-ir/index.js";
import { NativeModule } from "../../src/compiler/native-lowering/module-owner.js";
import { runtimeIrText } from "../../src/compiler/runtime-files.js";

function runtimeModule(text: string): string {
  const module = new NativeModule(createLlvmModule({ staticRuntime: [{ origin: "static runtime", text }] }));
  return module.render().text;
}

test("LLVM verifies the complete production Static Runtime IR", () => {
  expect(() => verifyStaticRuntime({ ir: runtimeModule(runtimeIrText()) })).not.toThrow();
});

test("LLVM rejects the original runtime with all four decimal backedges missing", () => {
  const broken = runtimeIrText().replaceAll(/, \[ %decimal\.(point|pointed|base|length), %decimal\.body \]/g, "");
  expect(() => verifyStaticRuntime({ ir: runtimeModule(broken) }))
    .toThrow("PHINode should have one entry for each predecessor of its parent basic block!");
});

test.each(["point", "pointed", "base", "length"])("LLVM rejects the original missing decimal.%s backedge", (name) => {
  const fixed = runtimeIrText();
  const broken = fixed.replace(`, [ %decimal.${name}, %decimal.body ]`, "");
  expect(broken).not.toBe(fixed);
  expect(() => verifyStaticRuntime({ ir: runtimeModule(broken) }))
    .toThrow("PHINode should have one entry for each predecessor of its parent basic block!");
});

test("the Static Runtime IR gate fails when its LLVM verifier is unavailable", () => {
  expect(() => verifyStaticRuntime({ ir: "", llvmAs: "/nonexistent/tscn/llvm-as" }))
    .toThrow("Install LLVM and put llvm-as on PATH or set LLVM_AS to its executable path.");
});
