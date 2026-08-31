import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { jsValueAbi } from "../../src/compiler/js-value-abi/index.js";
import { type LlvmModuleBuilder, createLlvmModule, llvm } from "../../src/compiler/llvm-ir/index.js";
import type { TargetFacts } from "../../src/compiler/toolchain.js";
import { captureCommand, commandExecutorLayer, toolExecutable } from "./helpers.js";

interface AbiConformanceVector {
  readonly name: string;
  readonly llvmExpression: string;
  readonly cppExpression: string;
  readonly expected: string;
}

const pointerPayload = 4660n;
const abiConformanceVectors: readonly AbiConformanceVector[] = [
  { name: "undefined", llvmExpression: "call i64 @abi_undefined()", cppExpression: "tscn::undefined()", expected: "9222246136947933184" },
  { name: "false", llvmExpression: "call i64 @abi_false()", cppExpression: "tscn::false_value()", expected: "9222246136947933185" },
  { name: "true", llvmExpression: "call i64 @abi_true()", cppExpression: "tscn::true_value()", expected: "9222246136947933186" },
  { name: "null", llvmExpression: "call i64 @abi_null()", cppExpression: "tscn::null()", expected: "9222246136947933187" },
  { name: "object", llvmExpression: `call i64 @abi_object(ptr inttoptr (i64 ${pointerPayload} to ptr))`, cppExpression: `tscn::object(${pointerPayload}ULL)`, expected: "9221120237041095220" },
  { name: "array", llvmExpression: `call i64 @abi_array(ptr inttoptr (i64 ${pointerPayload} to ptr))`, cppExpression: `tscn::array(${pointerPayload}ULL)`, expected: "9221401712017805876" },
  { name: "string", llvmExpression: `call i64 @abi_string(ptr inttoptr (i64 ${pointerPayload} to ptr))`, cppExpression: `tscn::string(${pointerPayload}ULL)`, expected: "9221683186994516532" },
  { name: "function", llvmExpression: `call i64 @abi_function(ptr inttoptr (i64 ${pointerPayload} to ptr))`, cppExpression: `tscn::function(${pointerPayload}ULL)`, expected: "9221964661971227188" },
  { name: "payload", llvmExpression: "call i64 @abi_payload(i64 9221120237041095220)", cppExpression: "tscn::reference_payload(tscn::object(4660ULL))", expected: pointerPayload.toString() },
  { name: "is-object", llvmExpression: "call i64 @abi_is_object(i64 9221120237041095220)", cppExpression: "tscn::is_object(tscn::object(4660ULL))", expected: "1" },
  { name: "is-array", llvmExpression: "call i64 @abi_is_array(i64 9221120237041095220)", cppExpression: "tscn::is_array(tscn::object(4660ULL))", expected: "0" },
  { name: "is-string", llvmExpression: "call i64 @abi_is_string(i64 9221683186994516532)", cppExpression: "tscn::is_string(tscn::string(4660ULL))", expected: "1" },
  { name: "is-function", llvmExpression: "call i64 @abi_is_function(i64 9221964661971227188)", cppExpression: "tscn::is_function(tscn::function(4660ULL))", expected: "1" },
  { name: "is-undefined", llvmExpression: "call i64 @abi_is_undefined(i64 9222246136947933184)", cppExpression: "tscn::is_undefined(tscn::undefined())", expected: "1" },
  { name: "array-hole", llvmExpression: "call i64 @abi_array_hole()", cppExpression: "tscn::array_hole()", expected: "9222246136947933191" },
  { name: "is-array-hole", llvmExpression: "call i64 @abi_is_array_hole(i64 9222246136947933191)", cppExpression: "tscn::is_array_hole(tscn::array_hole())", expected: "1" },
  { name: "number", llvmExpression: "call i64 @abi_number(double 1.500000e+00)", cppExpression: "tscn::number(1.5)", expected: "4609434218613702656" },
  { name: "is-number", llvmExpression: "call i64 @abi_is_number(i64 4609434218613702656)", cppExpression: "tscn::is_number(tscn::number(1.5))", expected: "1" },
  { name: "safe-nan", llvmExpression: "call i64 @abi_number(double 0x7FF5000000000000)", cppExpression: "tscn::number(std::bit_cast<double>(0x7ff5000000000000ULL))", expected: "9220275812110958592" },
  { name: "reserved-nan", llvmExpression: "call i64 @abi_number(double 0x7FF8000000000000)", cppExpression: "tscn::number(std::numeric_limits<double>::quiet_NaN())", expected: "9221120237041090560" }
];

function defineAbiConformanceFunctions(module: LlvmModuleBuilder): void {
  for (const kind of ["undefined", "false", "true", "null"] as const) {
    module.defineFunction({ name: `abi_${kind}`, parameters: [], returns: llvm.i64 }, (fn) => {
      fn.block("entry", (block) => block.ret(jsValueAbi.forLlvm(block).immediate(kind)));
    });
  }
  for (const kind of ["object", "array", "string", "function"] as const) {
    module.defineFunction({ name: `abi_${kind}`, parameters: [{ name: "pointer", type: llvm.ptr }], returns: llvm.i64 }, (fn) => {
      const pointer = fn.parameter(0, llvm.ptr);
      fn.block("entry", (block) => block.ret(jsValueAbi.forLlvm(block).boxReference(kind, pointer)));
    });
  }
  module.defineFunction({ name: "abi_payload", parameters: [{ name: "value", type: llvm.i64 }], returns: llvm.i64 }, (fn) => {
    const value = fn.parameter(0, llvm.i64);
    fn.block("entry", (block) => {
      const pointer = jsValueAbi.forLlvm(block).unboxReference(jsValueAbi.forLlvm(block).fromBoundary(value));
      block.ret(block.ptrToInt(pointer, llvm.i64, "payload.bits"));
    });
  });
  for (const kind of ["object", "array", "string", "function"] as const) {
    module.defineFunction({ name: `abi_is_${kind}`, parameters: [{ name: "value", type: llvm.i64 }], returns: llvm.i64 }, (fn) => {
      const value = fn.parameter(0, llvm.i64);
      fn.block("entry", (block) => {
        const values = jsValueAbi.forLlvm(block);
        const matches = values.isReference(values.fromBoundary(value), kind);
        block.ret(block.select(matches, block.int(llvm.i64, 1n), block.int(llvm.i64, 0n), "result"));
      });
    });
  }
  module.defineFunction({ name: "abi_array_hole", parameters: [], returns: llvm.i64 }, (fn) => {
    fn.block("entry", (block) => block.ret(jsValueAbi.forLlvm(block).arrayHole()));
  });
  module.defineFunction({ name: "abi_is_array_hole", parameters: [{ name: "value", type: llvm.i64 }], returns: llvm.i64 }, (fn) => {
    const value = fn.parameter(0, llvm.i64);
    fn.block("entry", (block) => {
      const values = jsValueAbi.forLlvm(block);
      const matches = values.isArrayHole(values.fromBoundary(value));
      block.ret(block.select(matches, block.int(llvm.i64, 1n), block.int(llvm.i64, 0n), "result"));
    });
  });
  module.defineFunction({ name: "abi_is_undefined", parameters: [{ name: "value", type: llvm.i64 }], returns: llvm.i64 }, (fn) => {
    const value = fn.parameter(0, llvm.i64);
    fn.block("entry", (block) => {
      const values = jsValueAbi.forLlvm(block);
      const matches = values.isImmediate(values.fromBoundary(value), "undefined");
      block.ret(block.select(matches, block.int(llvm.i64, 1n), block.int(llvm.i64, 0n), "result"));
    });
  });
  module.defineFunction({ name: "abi_is_number", parameters: [{ name: "value", type: llvm.i64 }], returns: llvm.i64 }, (fn) => {
    const value = fn.parameter(0, llvm.i64);
    fn.block("entry", (block) => {
      const values = jsValueAbi.forLlvm(block);
      const matches = values.isNumber(values.fromBoundary(value));
      block.ret(block.select(matches, block.int(llvm.i64, 1n), block.int(llvm.i64, 0n), "result"));
    });
  });
  module.defineFunction({ name: "abi_number", parameters: [{ name: "value", type: llvm.double }], returns: llvm.i64 }, (fn) => {
    const value = fn.parameter(0, llvm.double);
    fn.block("entry", (block) => block.ret(jsValueAbi.forLlvm(block).boxNumber(value)));
  });
}

function llvmConformanceSource(): string {
  const module = createLlvmModule();
  defineAbiConformanceFunctions(module);
  const calls = abiConformanceVectors.flatMap((vector, index) => [
    `  %value.${index} = ${vector.llvmExpression}`,
    `  %print.${index} = call i32 (ptr, ...) @printf(ptr @.fmt, i64 %value.${index})`
  ]).join("\n");
  module.addLegacyModuleText({
    origin: "ABI conformance harness",
    text: `@.fmt = private unnamed_addr constant [6 x i8] c"%llu\\0A\\00"\ndeclare i32 @printf(ptr, ...)\ndefine i32 @main() {\nentry:\n${calls}\n  ret i32 0\n}\n`
  });
  return module.render().text;
}

function cppConformanceSource(): string {
  const prints = abiConformanceVectors
    .map((vector) => `  std::printf("%llu\\n", static_cast<unsigned long long>(${vector.cppExpression}));`)
    .join("\n");
  return `#include <bit>\n#include <cstdint>\n#include <cstdio>\n#include <limits>\n\n${jsValueAbi.emitInlineCppSupport()}\n\nint main() {\n${prints}\n  return 0;\n}\n`;
}

const expectedConformanceOutput = `${abiConformanceVectors.map((vector) => vector.expected).join("\n")}\n`;

describe("JSValue ABI", () => {
  test("drives textual LLVM and inline C++ from the accepted bit layout", () => {
    const module = createLlvmModule();
    module.defineFunction(
      {
        name: "valueBoxObject",
        parameters: [{ name: "object", type: llvm.ptr }],
        returns: llvm.i64
      },
      (fn) => {
        const object = fn.parameter(0, llvm.ptr);
        fn.block("entry", (block) => {
          block.ret(jsValueAbi.forLlvm(block).boxReference("object", object));
        });
      }
    );

    expect(module.render().text).toContain("%value = or i64 %payload, 9221120237041090560");

    const cpp = jsValueAbi.emitInlineCppSupport();
    expect(cpp).toContain("return std::bit_cast<std::uint64_t>(value);");
    expect(cpp).toContain("return 9222246136947933184ULL;");
    expect(cpp).toContain("return 9222246136947933185ULL;");
    expect(cpp).toContain("return 9222246136947933186ULL;");
    expect(cpp).toContain("return 9222246136947933187ULL;");
  });

  test("validates normalized host facts and fails closed", () => {
    const compatible: TargetFacts = {
      triple: "x86_64-linux",
      architecture: "x86_64",
      pointerWidthBits: 64,
      doubleFormat: "ieee754-binary64",
      pointerAddressBits: 48
    };
    expect(jsValueAbi.validateHost(compatible)).toBeUndefined();
    expect(jsValueAbi.validateHost({ ...compatible, pointerAddressBits: 47 })).toBeUndefined();

    const incompatible = jsValueAbi.validateHost({
      triple: "unknown-target",
      architecture: "unknown",
      pointerWidthBits: undefined,
      doubleFormat: "unknown",
      pointerAddressBits: undefined
    });
    expect(incompatible).toEqual({
      code: "TSCN2005",
      category: "error",
      message: "Host target is incompatible with the JSValue ABI: requires 64-bit pointers, IEEE-754 binary64 doubles, and pointers representable in 48 bits; detected unknown-target with unknown-bit pointers, unknown doubles, and unknown-bit pointer addresses"
    });
    expect(jsValueAbi.validateHost({ ...compatible, pointerWidthBits: 32 })).toBeDefined();
    expect(jsValueAbi.validateHost({ ...compatible, doubleFormat: "other" })).toBeDefined();
    expect(jsValueAbi.validateHost({ ...compatible, pointerAddressBits: 49 })).toBeDefined();
  });

  test("executes shared behavioral vectors through LLVM and inline C++ adapters", async () => {
    const clang = await toolExecutable("clang");
    const clangxx = await toolExecutable("clang++");
    if (clang === undefined || clangxx === undefined) {
      return;
    }
    const directory = await mkdtemp(path.join(tmpdir(), "tscn-abi-"));
    const llvmSource = path.join(directory, "abi.ll");
    const llvmExecutable = path.join(directory, "abi-llvm");
    const cppSource = path.join(directory, "abi.cpp");
    const cppExecutable = path.join(directory, "abi-cpp");
    try {
      await writeFile(llvmSource, llvmConformanceSource());
      await writeFile(cppSource, cppConformanceSource());
      const compileLlvm = await Effect.runPromise(captureCommand(clang, [llvmSource, "-o", llvmExecutable]).pipe(Effect.provide(commandExecutorLayer)));
      expect(compileLlvm.status, compileLlvm.stderr).toBe(0);
      const compileCpp = await Effect.runPromise(captureCommand(clangxx, ["-std=c++20", cppSource, "-o", cppExecutable]).pipe(Effect.provide(commandExecutorLayer)));
      expect(compileCpp.status, compileCpp.stderr).toBe(0);
      const llvmRun = await Effect.runPromise(captureCommand(llvmExecutable, []).pipe(Effect.provide(commandExecutorLayer)));
      const cppRun = await Effect.runPromise(captureCommand(cppExecutable, []).pipe(Effect.provide(commandExecutorLayer)));
      expect(llvmRun).toEqual({ status: 0, stdout: expectedConformanceOutput, stderr: "" });
      expect(cppRun).toEqual(llvmRun);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("keeps ABI and LLVM builder internals behind directory entrypoints", async () => {
    const compilerDirectory = path.resolve(import.meta.dirname, "../../src/compiler");
    const entries = await readdir(compilerDirectory, { recursive: true });
    const sourceFiles = entries.filter((entry) => entry.endsWith(".ts") && !entry.startsWith("js-value-abi/") && !entry.startsWith("llvm-ir/"));
    const sources = await Promise.all(sourceFiles.map(async (entry) => ({
      entry,
      source: await readFile(path.join(compilerDirectory, entry), "utf8")
    })));
    for (const { entry, source } of sources) {
      expect(source, entry).not.toMatch(/from ["'][^"']*js-value-abi\/(?!index\.js)[^"']+["']/);
      expect(source, entry).not.toMatch(/from ["'][^"']*llvm-ir\/(?!index\.js)[^"']+["']/);
    }
  });

  test("allocates collision-free LLVM names for repeated ABI operations", () => {
    const module = createLlvmModule();
    module.defineFunction(
      {
        name: "boxSecondObject",
        parameters: [
          { name: "first", type: llvm.ptr },
          { name: "second", type: llvm.ptr }
        ],
        returns: llvm.i64
      },
      (fn) => {
        const first = fn.parameter(0, llvm.ptr);
        const second = fn.parameter(1, llvm.ptr);
        fn.block("entry", (block) => {
          const values = jsValueAbi.forLlvm(block);
          values.boxReference("object", first);
          block.ret(values.boxReference("object", second));
        });
      }
    );

    const llvmIr = module.render().text;
    expect(llvmIr).toContain("%bits.1 = ptrtoint ptr %second to i64");
    expect(llvmIr).toContain("%payload.1 = and i64 %bits.1, 281474976710655");
    expect(llvmIr).toContain("%value.1 = or i64 %payload.1, 9221120237041090560");
  });
});
