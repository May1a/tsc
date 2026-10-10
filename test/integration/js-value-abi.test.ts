import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { jsValueAbi } from "../../src/compiler/js-value-abi/index.js";
import { type LlvmBlockBuilder, type LlvmFunctionSpec, type LlvmModuleBuilder, createLlvmModule, llvm } from "../../src/compiler/llvm-ir/index.js";
import type { TargetFacts } from "../../src/compiler/target.js";
import { captureCommand, commandExecutorLayer, toolExecutable } from "./helpers.js";

interface AbiConformanceVector {
  readonly name: string;
  readonly symbol: string;
  readonly arguments: readonly AbiArgument[];
  readonly cppExpression: string;
  readonly expected: string;
}

type AbiArgument =
  | { readonly kind: "pointer" | "word" | "doubleBits"; readonly value: bigint }
  | { readonly kind: "double"; readonly value: number };

type AbiFunction = LlvmFunctionSpec & { readonly returns: typeof llvm.i64 };

const pointerPayload = 4660n;
const abiConformanceVectors: readonly AbiConformanceVector[] = [
  { name: "undefined", symbol: "abi_undefined", arguments: [], cppExpression: "tscn::undefined()", expected: "9222246136947933184" },
  { name: "false", symbol: "abi_false", arguments: [], cppExpression: "tscn::false_value()", expected: "9222246136947933185" },
  { name: "true", symbol: "abi_true", arguments: [], cppExpression: "tscn::true_value()", expected: "9222246136947933186" },
  { name: "null", symbol: "abi_null", arguments: [], cppExpression: "tscn::null()", expected: "9222246136947933187" },
  { name: "object", symbol: "abi_object", arguments: [{ kind: "pointer", value: pointerPayload }], cppExpression: `tscn::object(${pointerPayload}ULL)`, expected: "9221120237041095220" },
  { name: "array", symbol: "abi_array", arguments: [{ kind: "pointer", value: pointerPayload }], cppExpression: `tscn::array(${pointerPayload}ULL)`, expected: "9221401712017805876" },
  { name: "string", symbol: "abi_string", arguments: [{ kind: "pointer", value: pointerPayload }], cppExpression: `tscn::string(${pointerPayload}ULL)`, expected: "9221683186994516532" },
  { name: "function", symbol: "abi_function", arguments: [{ kind: "pointer", value: pointerPayload }], cppExpression: `tscn::function(${pointerPayload}ULL)`, expected: "9221964661971227188" },
  { name: "payload", symbol: "abi_payload", arguments: [{ kind: "word", value: 9_221_120_237_041_095_220n }], cppExpression: "tscn::reference_payload(tscn::object(4660ULL))", expected: pointerPayload.toString() },
  { name: "is-object", symbol: "abi_is_object", arguments: [{ kind: "word", value: 9_221_120_237_041_095_220n }], cppExpression: "tscn::is_object(tscn::object(4660ULL))", expected: "1" },
  { name: "is-array", symbol: "abi_is_array", arguments: [{ kind: "word", value: 9_221_120_237_041_095_220n }], cppExpression: "tscn::is_array(tscn::object(4660ULL))", expected: "0" },
  { name: "is-string", symbol: "abi_is_string", arguments: [{ kind: "word", value: 9_221_683_186_994_516_532n }], cppExpression: "tscn::is_string(tscn::string(4660ULL))", expected: "1" },
  { name: "is-function", symbol: "abi_is_function", arguments: [{ kind: "word", value: 9_221_964_661_971_227_188n }], cppExpression: "tscn::is_function(tscn::function(4660ULL))", expected: "1" },
  { name: "is-undefined", symbol: "abi_is_undefined", arguments: [{ kind: "word", value: 9_222_246_136_947_933_184n }], cppExpression: "tscn::is_undefined(tscn::undefined())", expected: "1" },
  { name: "array-hole", symbol: "abi_array_hole", arguments: [], cppExpression: "tscn::array_hole()", expected: "9222246136947933191" },
  { name: "is-array-hole", symbol: "abi_is_array_hole", arguments: [{ kind: "word", value: 9_222_246_136_947_933_191n }], cppExpression: "tscn::is_array_hole(tscn::array_hole())", expected: "1" },
  { name: "number", symbol: "abi_number", arguments: [{ kind: "double", value: 1.5 }], cppExpression: "tscn::number(1.5)", expected: "4609434218613702656" },
  { name: "is-number", symbol: "abi_is_number", arguments: [{ kind: "word", value: 4_609_434_218_613_702_656n }], cppExpression: "tscn::is_number(tscn::number(1.5))", expected: "1" },
  // FIXME(arm64-darwin): These vectors document canonicalization as a stopgap.
  // Remove the exact-bit assertion when NaNs cannot overlap tags by design.
  { name: "signaling-nan", symbol: "abi_number", arguments: [{ kind: "doubleBits", value: 0x7F_F5_00_00_00_00_00_00n }], cppExpression: "tscn::number(std::bit_cast<double>(0x7ff5000000000000ULL))", expected: "9220275812110958592" },
  { name: "reserved-quiet-nan", symbol: "abi_number", arguments: [{ kind: "doubleBits", value: 0x7F_F8_00_00_00_00_00_00n }], cppExpression: "tscn::number(std::numeric_limits<double>::quiet_NaN())", expected: "18444492273895866368" }
];

function defineAbiConformanceFunctions(module: LlvmModuleBuilder): ReadonlyMap<string, AbiFunction> {
  const functions = new Map<string, AbiFunction>();
  const define = (spec: AbiFunction, build: Parameters<LlvmModuleBuilder["defineFunction"]>[1]): void => {
    functions.set(spec.name, module.defineFunction(spec, build));
  };
  for (const kind of ["undefined", "false", "true", "null"] as const) {
    define({ name: `abi_${kind}`, parameters: [], returns: llvm.i64 }, (fn) => {
      fn.block("entry", (block) => block.ret(jsValueAbi.forLlvm(block).immediate(kind)));
    });
  }
  for (const kind of ["object", "array", "string", "function"] as const) {
    define({ name: `abi_${kind}`, parameters: [{ name: "pointer", type: llvm.ptr }], returns: llvm.i64 }, (fn) => {
      const pointer = fn.parameter(0, llvm.ptr);
      fn.block("entry", (block) => block.ret(jsValueAbi.forLlvm(block).boxReference(kind, pointer)));
    });
  }
  define({ name: "abi_payload", parameters: [{ name: "value", type: llvm.i64 }], returns: llvm.i64 }, (fn) => {
    const value = fn.parameter(0, llvm.i64);
    fn.block("entry", (block) => {
      const pointer = jsValueAbi.forLlvm(block).unboxReference(jsValueAbi.forLlvm(block).fromBoundary(value));
      block.ret(block.ptrToInt(pointer, llvm.i64, "payload.bits"));
    });
  });
  for (const kind of ["object", "array", "string", "function"] as const) {
    define({ name: `abi_is_${kind}`, parameters: [{ name: "value", type: llvm.i64 }], returns: llvm.i64 }, (fn) => {
      const value = fn.parameter(0, llvm.i64);
      fn.block("entry", (block) => {
        const values = jsValueAbi.forLlvm(block);
        const matches = values.isReference(values.fromBoundary(value), kind);
        block.ret(block.select(matches, block.int(llvm.i64, 1n), block.int(llvm.i64, 0n), "result"));
      });
    });
  }
  define({ name: "abi_array_hole", parameters: [], returns: llvm.i64 }, (fn) => {
    fn.block("entry", (block) => block.ret(jsValueAbi.forLlvm(block).arrayHole()));
  });
  define({ name: "abi_is_array_hole", parameters: [{ name: "value", type: llvm.i64 }], returns: llvm.i64 }, (fn) => {
    const value = fn.parameter(0, llvm.i64);
    fn.block("entry", (block) => {
      const values = jsValueAbi.forLlvm(block);
      const matches = values.isArrayHole(values.fromBoundary(value));
      block.ret(block.select(matches, block.int(llvm.i64, 1n), block.int(llvm.i64, 0n), "result"));
    });
  });
  define({ name: "abi_is_undefined", parameters: [{ name: "value", type: llvm.i64 }], returns: llvm.i64 }, (fn) => {
    const value = fn.parameter(0, llvm.i64);
    fn.block("entry", (block) => {
      const values = jsValueAbi.forLlvm(block);
      const matches = values.isImmediate(values.fromBoundary(value), "undefined");
      block.ret(block.select(matches, block.int(llvm.i64, 1n), block.int(llvm.i64, 0n), "result"));
    });
  });
  define({ name: "abi_is_number", parameters: [{ name: "value", type: llvm.i64 }], returns: llvm.i64 }, (fn) => {
    const value = fn.parameter(0, llvm.i64);
    fn.block("entry", (block) => {
      const values = jsValueAbi.forLlvm(block);
      const matches = values.isNumber(values.fromBoundary(value));
      block.ret(block.select(matches, block.int(llvm.i64, 1n), block.int(llvm.i64, 0n), "result"));
    });
  });
  define({ name: "abi_number", parameters: [{ name: "value", type: llvm.double }], returns: llvm.i64 }, (fn) => {
    const value = fn.parameter(0, llvm.double);
    fn.block("entry", (block) => block.ret(jsValueAbi.forLlvm(block).boxNumber(value)));
  });
  return functions;
}

function abiArgument(argument: AbiArgument, block: LlvmBlockBuilder) {
  switch (argument.kind) {
    case "pointer": { return block.intToPtr(block.int(llvm.i64, argument.value), "argument.pointer"); }
    case "word": { return block.int(llvm.i64, argument.value); }
    case "doubleBits": { return block.bitcast(block.int(llvm.i64, argument.value), llvm.double, "argument.double"); }
    case "double": { return block.double(argument.value); }
    default: {
      const exhaustive: never = argument;
      throw new Error(`Unknown ABI argument ${String(exhaustive)}`);
    }
  }
}

function llvmConformanceSource(): string {
  const module = createLlvmModule({ staticRuntime: [] });
  const functions = defineAbiConformanceFunctions(module);
  const printf = module.declareFunction({ name: "printf", parameters: [{ name: "format", type: llvm.ptr }], returns: llvm.i32, variadic: true });
  const format = module.stringConstant("%llu\n");
  module.defineFunction({ name: "main", parameters: [], returns: llvm.i32 }, (fn) => {
    fn.block("entry", (block) => {
      for (const vector of abiConformanceVectors) {
        const target = functions.get(vector.symbol);
        if (target === undefined) throw new Error(`ABI vector references undeclared function ${vector.symbol}`);
        const args = vector.arguments.map((argument) => abiArgument(argument, block));
        const value = block.call(target, args, "vector.value");
        block.call(printf, [block.globalPointer(format), value], "vector.print");
      }
      block.ret(block.int(llvm.i32, 0n));
    });
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
    const module = createLlvmModule({ staticRuntime: [] });
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
    expect(cpp).toContain("const auto bits = std::bit_cast<std::uint64_t>(value);");
    expect(cpp).toContain("return is_arm64_nan ? 18444492273895866368ULL : bits;");
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
    const module = createLlvmModule({ staticRuntime: [] });
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
