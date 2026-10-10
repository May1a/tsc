import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Effect } from "effect";
import { describe, expect, test } from "vitest";
import { createLlvmModule, llvm } from "../../src/compiler/llvm-ir/index.js";
import { type NativeFunctionSpec, NativeModule } from "../../src/compiler/native-lowering/index.js";
import { runtimeIrText } from "../../src/compiler/runtime-files.js";
import { captureCommand, commandExecutorLayer, toolExecutable } from "../integration/helpers.js";

function nativeModule(): NativeModule {
  const module = createLlvmModule({ staticRuntime: [{ origin: "static runtime", text: runtimeIrText() }] });
  return new NativeModule(module);
}

const scalarSpec: NativeFunctionSpec = { name: "scalar", parameters: [], returns: llvm.i64, returnsCompletion: false };
const borrowedSpec: NativeFunctionSpec = {
  name: "borrowed", parameters: [{ name: "value", type: llvm.i64, representation: "boxed", protection: "borrowed" }],
  returns: llvm.i64, returnsCompletion: false
};

function arrayAcrossCollection(rooted: boolean): NativeModule {
  const module = nativeModule();
  module.defineFunction(scalarSpec, (fn) => {
    fn.openEntry();
    const { cursor, runtime, values, roots } = fn.capabilities;
    const frame = roots.save();
    const array = runtime.callPointer("arrayNew", [cursor.currentBlock().int(llvm.i64, 0n)], "array");
    const boxed = values.forBlock(cursor.currentBlock()).boxReference("array", array);
    if (rooted) { roots.push(boxed); }
    runtime.callVoid("gcSafepoint", []);
    runtime.callVoid("valuePrint", [boxed]);
    roots.restore(frame);
    cursor.currentBlock().ret(cursor.currentBlock().int(llvm.i64, 0n));
  });
  return module;
}

describe("native module ownership", () => {
  test("defines multiple functions before sealing", () => {
    const module = nativeModule();
    for (const name of ["first", "second"]) {
      module.defineFunction({ ...scalarSpec, name }, (fn) => {
        fn.openEntry();
        const block = fn.capabilities.cursor.currentBlock();
        block.ret(block.int(llvm.i64, name === "first" ? 1n : 2n));
      });
    }
    expect(module.functions.map((fn) => fn.function.spec.name)).toEqual(["first", "second"]);
    expect(module.build()).toBe(module.build());
    expect(() => module.defineFunction({ ...scalarSpec, name: "third" }, () => { throw new Error("unreachable"); })).toThrow("sealed");
  });

  test("static runtime definitions are not duplicated by declarations", () => {
    const { text } = nativeModule().render();
    expect(text.match(/define ptr @arrayNew\(/g)).toHaveLength(1);
    expect(text).not.toContain("declare ptr @arrayNew(");
    expect(text.match(/define i64 @valueBoxObject\(/g)).toHaveLength(1);
  });

  test("a failed function prevents rendering even when its error is caught", () => {
    const module = nativeModule();
    expect(() => module.defineFunction(scalarSpec, (fn) => {
      fn.openEntry();
      fn.capabilities.roots.save();
      const block = fn.capabilities.cursor.currentBlock();
      block.ret(block.int(llvm.i64, 0n));
    })).toThrow("remain active at return");
    expect(() => module.render()).toThrow("failed function");
  });
});

describe("native GC metadata", () => {
  test("boxing a live array records its GC obligation without manual facts", () => {
    expect(() => arrayAcrossCollection(false)).toThrow("without a root");
  });

  test("pushing the boxed array fulfills the obligation", () => {
    expect(arrayAcrossCollection(true).functions).toHaveLength(1);
  });

  test("a collection between allocation and boxing is rejected", () => {
    const module = nativeModule();
    expect(() => module.defineFunction(scalarSpec, (fn) => {
      fn.openEntry();
      const { cursor, runtime, values } = fn.capabilities;
      const array = runtime.callPointer("arrayNew", [cursor.currentBlock().int(llvm.i64, 0n)], "array");
      runtime.callVoid("gcSafepoint", []);
      const boxed = values.forBlock(cursor.currentBlock()).boxReference("array", array);
      cursor.currentBlock().ret(boxed);
    })).toThrow("without a root");
  });

  test("numeric and immediate boxes need no heap roots", () => {
    const module = nativeModule();
    module.defineFunction(scalarSpec, (fn) => {
      fn.openEntry();
      const { cursor, runtime, values } = fn.capabilities;
      const boxed = values.forBlock(cursor.currentBlock()).boxNumber(cursor.currentBlock().double(42));
      const nothing = values.forBlock(cursor.currentBlock()).immediate("undefined");
      runtime.callVoid("gcSafepoint", []);
      runtime.callVoid("valuePrint", [nothing]);
      cursor.currentBlock().ret(boxed);
    });
    expect(module.functions[0]?.facts.heapReferences).toEqual([]);
  });

  test("a boxed load is tracked at the ABI boundary", () => {
    const module = nativeModule();
    expect(() => module.defineFunction(scalarSpec, (fn) => {
      fn.openEntry();
      const { cursor, runtime, values } = fn.capabilities;
      const slot = cursor.currentBlock().alloca(llvm.i64, "slot");
      cursor.currentBlock().store(cursor.currentBlock().int(llvm.i64, 0n), slot);
      const loaded = values.forBlock(cursor.currentBlock()).fromBoundary(cursor.currentBlock().load(llvm.i64, slot, "loaded"));
      runtime.callVoid("gcSafepoint", []);
      cursor.currentBlock().ret(loaded);
    })).toThrow("without a root");
  });

  test("unboxing a borrowed parameter associates its pointer with its owner", () => {
    const module = nativeModule();
    module.defineFunction(borrowedSpec, (fn) => {
      fn.openEntry();
      const { cursor, runtime, values } = fn.capabilities;
      const boxed = fn.boxedParameter(0);
      const array = values.forBlock(cursor.currentBlock()).unboxReference(boxed);
      runtime.callVoid("gcSafepoint", []);
      cursor.currentBlock().ret(runtime.call("arrayLength", [array], "length"));
    });
    expect(module.functions[0]?.facts.heapReferences).toHaveLength(2);
  });
});

describe("native CFG exits and provenance", () => {
  test("one saved frame can be restored on both return branches", () => {
    const module = nativeModule();
    module.defineFunction({ ...scalarSpec, parameters: [{ name: "flag", type: llvm.i1 }] }, (fn) => {
      fn.openEntry();
      const { cursor, roots } = fn.capabilities;
      const frame = roots.save();
      const left = cursor.reserveBlock("left");
      const right = cursor.reserveBlock("right");
      cursor.currentBlock().condBr(fn.parameter(0, llvm.i1), left, right);
      for (const target of [left, right]) {
        cursor.openBlock(target);
        roots.restore(frame);
        cursor.currentBlock().ret(cursor.currentBlock().int(llvm.i64, 0n));
      }
    });
    expect(module.functions[0]?.function.blocks.map((block) => block.label.name)).toEqual(["entry", "left", "right"]);
  });

  test("an omitted restore on one branch prevents rendering", () => {
    const module = nativeModule();
    expect(() => module.defineFunction({ ...scalarSpec, parameters: [{ name: "flag", type: llvm.i1 }] }, (fn) => {
      fn.openEntry();
      const { cursor, roots } = fn.capabilities;
      const frame = roots.save();
      const left = cursor.reserveBlock("left");
      const right = cursor.reserveBlock("right");
      cursor.currentBlock().condBr(fn.parameter(0, llvm.i1), left, right);
      cursor.openBlock(left);
      roots.restore(frame);
      cursor.currentBlock().ret(cursor.currentBlock().int(llvm.i64, 0n));
      cursor.openBlock(right);
      cursor.currentBlock().ret(cursor.currentBlock().int(llvm.i64, 0n));
    })).toThrow("remain active at return");
  });

  test("trace provenance covers blocks opened inside the operation", () => {
    const module = nativeModule();
    const finished = module.defineFunction(scalarSpec, (fn) => {
      fn.openEntry();
      fn.withTrace("operation", () => {
        const { cursor } = fn.capabilities;
        const arm = cursor.reserveBlock("arm");
        const join = cursor.reserveBlock("join");
        cursor.currentBlock().br(arm);
        cursor.openBlock(arm);
        cursor.currentBlock().br(join);
        cursor.openBlock(join);
        cursor.currentBlock().ret(cursor.currentBlock().int(llvm.i64, 0n));
      });
    });
    expect(finished.function.blocks.flatMap((block) => block.instructions.map((instruction) => instruction.provenance.traceIds)))
      .toEqual([["operation"], ["operation"], ["operation"]]);
    expect([...module.render().traceRanges.keys()]).toEqual(["operation"]);
  });

  test("same-hint nested loop targets remain distinct owned labels", () => {
    const module = nativeModule();
    module.defineFunction(scalarSpec, (fn) => {
      fn.openEntry();
      const { cursor } = fn.capabilities;
      const outer = cursor.reserveBlock("loop");
      const inner = cursor.reserveBlock("loop");
      expect(inner).not.toBe(outer);
      cursor.currentBlock().br(outer);
      cursor.openBlock(outer);
      cursor.currentBlock().br(inner);
      cursor.openBlock(inner);
      cursor.currentBlock().br(outer);
    });
    expect(module.functions[0]?.function.blocks.map((block) => block.label.name)).toEqual(["entry", "loop", "loop.1"]);
  });
});

test("native runtime calls, variadic printf and completion payloads run against clang", async () => {
  const clang = await toolExecutable("clang");
  expect(clang).toBeDefined();
  if (clang === undefined) { return; }
  const directory = await mkdtemp(path.join(tmpdir(), "tscn-native-core-"));
  try {
    const module = nativeModule();
    const format = module.stringConstant("%.0f\n");
    module.defineFunction({ name: "main", parameters: [], returns: llvm.i32, returnsCompletion: false }, (fn) => {
      fn.openEntry();
      const { cursor, runtime, values } = fn.capabilities;
      runtime.callVoid("gcInit", []);
      const payload = cursor.currentBlock().alloca(llvm.i64, "exception");
      const failed = cursor.reserveBlock("failed");
      runtime.callWithCompletion("requireObjectCoercible", [values.forBlock(cursor.currentBlock()).immediate("undefined")], "coercible", {
        block: failed, payloadSlot: payload
      });
      cursor.currentBlock().ret(cursor.currentBlock().int(llvm.i32, 1n));
      cursor.openBlock(failed);
      const thrown = cursor.currentBlock().load(llvm.i64, payload, "thrown");
      const number = runtime.call("valueNumber", [thrown], "number");
      runtime.call("printf", [cursor.currentBlock().globalPointer(format), number], "printed");
      cursor.currentBlock().ret(cursor.currentBlock().int(llvm.i32, 0n));
    });
    const ir = path.join(directory, "main.ll");
    const binary = path.join(directory, "main");
    await writeFile(ir, module.render().text);
    const compiled = await Effect.runPromise(captureCommand(clang, [ir, "-o", binary]).pipe(Effect.provide(commandExecutorLayer)));
    expect(compiled.status, compiled.stderr).toBe(0);
    const executed = await Effect.runPromise(captureCommand(binary, []).pipe(Effect.provide(commandExecutorLayer)));
    expect(executed.status, executed.stderr).toBe(0);
    expect(executed.stdout).toBe("nan\n");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
