import { describe, expect, test } from "vitest";
import { checkLayerImport, scanLayerImports } from "../../scripts/check-compiler-boundaries.mjs";

describe("compiler abstraction boundaries", () => {
  test("rejects a binding resolver importing the Lowering barrel", () => {
    expect(scanLayerImports("src/compiler/binding-resolution/index.ts", [
      'import { aggregateBindingForOperation } from "../ir.js";',
      'import { aggregateBindingForOperation } from "../ir/operation-bindings.js";'
    ].join("\n"))).toEqual([{
      file: "src/compiler/binding-resolution/index.ts", line: 1, column: 46, rule: "no-layer-mixing",
      message: "Binding resolution must import IR model modules directly. ir.ts also exports the Lowering entry point."
    }]);
  });

  test("rejects the old dependency from the Lowered result type to AST diagnostics", () => {
    expect(checkLayerImport("src/compiler/ir/lowered.ts", "./diagnostics.js")).toBe(
      "IR model must not import Lowering. Move shared IR classification into the IR model."
    );
  });

  test.each([
    ["src/compiler/ir/statements.ts", "../llvm/operations.js"],
    ["src/compiler/ir/statements.ts", "../llvm-ir/index.js"],
    ["src/compiler/ir/types.ts", "./context.js"],
    ["src/compiler/native-lowering/value-expressions.ts", "../ir/value-expressions.js"],
    ["src/compiler/llvm-ir/types.ts", "../ir/types.js"],
    ["src/compiler/js-value-abi/llvm.ts", "../llvm/values.js"],
    ["src/compiler/js-value-abi/host.ts", "../toolchain.js"],
    ["src/compiler/native-lowering/module.ts", "../llvm/../../compiler/ir/functions.js"],
    ["src/compiler/ir/types.ts", "typescript"],
    ["src/compiler/native-lowering/numbers.ts", "typescript/lib/typescript.js"],
    ["src/compiler/ir/statements.ts", "node:fs"],
    ["src/compiler/ir/statements.ts", "child_process"],
    ["src/compiler/llvm-ir/module-builder.ts", "effect/Effect"],
    ["src/compiler/llvm-ir/module-builder.ts", "@effect/platform-node"],
    ["src/compiler/binding-resolution/resolve.ts", "../llvm/module.js"],
    ["src/compiler/native-lowering/values.ts", "../ir/expressions.js"],
    ["src/compiler/native-lowering/module.ts", "../ir/source-module.js"],
    ["src/compiler/runtime-contracts/values.ts", "../native-lowering/values.js"],
    ["src/compiler/gc-liveness/roots.ts", "../ir/types.js"],
    ["src/compiler/gc-liveness/roots.ts", "../native-lowering/capabilities.js"],
    ["src/compiler/gc-liveness/roots.ts", "node:fs"],
    ["src/compiler/native-lowering/module.ts", "../runtime-files.js"],
    ["src/compiler/runtime-ir.ts", "node:fs"],
    ["src/compiler/ir/class-info.ts", "../runtime-ir.js"],
    ["src/compiler/symbols.ts", "node:fs"],
    ["src/compiler/dispatch.ts", "effect"],
    ["src/compiler/diagnostics.ts", "./ir/statements.js"],
    ["src/compiler/native-lowering/operations.ts", "../live-layer.js"],
    ["src/compiler/binding-resolution/index.ts", "../errors.js"],
    ["src/compiler/trace.ts", "./ir.js"]
  ])("rejects %s importing %s", (file, specifier) => {
    expect(checkLayerImport(file, specifier)).toBeTypeOf("string");
  });

  test.each([
    ["src/compiler/binding-resolution/operations.ts", "../ir/operation-bindings.js"],
    ["src/compiler/native-lowering/module.ts", "../binding-resolution/resolved-types.js"],
    ["src/compiler/ir/statements.ts", "./lowered.js"],
    ["src/compiler/ir/builtins/types.ts", "../context.js"],
    ["src/compiler/ir/operation-bindings.ts", "./types.js"],
    ["src/compiler/ir/statements.ts", "typescript"],
    ["src/compiler/native-lowering/module.ts", "../runtime-ir.js"],
    ["src/compiler/native-lowering/module.ts", "../llvm-ir/index.js"],
    ["src/compiler/js-value-abi/llvm.ts", "../llvm-ir/index.js"],
    ["src/compiler/js-value-abi/host.ts", "../target.js"],
    ["src/compiler/pipeline.ts", "./ir.js"],
    ["src/compiler/binding-resolution/resolve.ts", "../ir/types.js"],
    ["src/compiler/native-lowering/values.ts", "../binding-resolution/model.js"],
    ["src/compiler/native-lowering/calls.ts", "../runtime-contracts/index.js"],
    ["src/compiler/native-lowering/calls.ts", "../gc-liveness/index.js"],
    ["src/compiler/gc-liveness/roots.ts", "../llvm-ir/index.js"],
    ["src/compiler/gc-liveness/index.ts", "../runtime-contracts/index.js"],
    ["src/compiler/native-lowering/module.ts", "../runtime-ir.js"],
    ["src/compiler/runtime-ir.ts", "./llvm-ir/index.js"],
    ["src/compiler/pipeline.ts", "./runtime-files.js"],
    ["src/compiler/ir/class-info.ts", "../symbols.js"],
    ["src/compiler/native-lowering/operations.ts", "../dispatch.js"],
    ["src/compiler/native-lowering/index.ts", "../trace.js"],
    ["src/compiler/trace.ts", "./ir/module.js"]
  ])("allows %s importing %s", (file, specifier) => {
    expect(checkLayerImport(file, specifier)).toBeUndefined();
  });

  test.each([
    'export { lowerStatement } from "../ir/statements.js";',
    'export * from "../ir.js";',
    'import type { LoweringContext } from "../ir/context.js";',
    'type Context = import("../ir/context.js").LoweringContext;',
    'async function load() { return import("../ir/statements.js"); }',
    'async function load() { return import("node:fs"); }'
  ])("checks re-exports, type dependencies, and dynamic imports: %s", (source) => {
    expect(scanLayerImports("src/compiler/native-lowering/module.ts", source).map((finding) => finding.rule)).toEqual(["no-layer-mixing"]);
  });

  test("erases type-only platform imports while keeping runtime work at boundaries", () => {
    expect(scanLayerImports("src/compiler/ir/statements.ts", [
      'import type { Stats } from "node:fs";',
      'import { type Stats as Metadata } from "node:fs";',
      'export { type Stats } from "node:fs";',
      'import { type Stats, readFileSync } from "node:fs";'
    ].join("\n"))).toMatchObject([{ line: 4, rule: "no-layer-mixing" }]);
  });
});
