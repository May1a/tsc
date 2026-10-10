import { describe, expect, test } from "vitest";
import { type GcFunctionFacts, type GcHeapReference, verifyGcLiveness } from "../../src/compiler/gc-liveness/index.js";
import {
  type BuiltLlvmFunction,
  type LlvmFunctionBuilder,
  type LlvmModuleBuilder,
  type LlvmValue,
  createLlvmModule,
  llvm
} from "../../src/compiler/llvm-ir/index.js";

function declareRuntime(module: LlvmModuleBuilder) {
  return {
    newArray: module.declareFunction({ name: "arrayNew", parameters: [{ name: "length", type: llvm.i64 }], returns: llvm.ptr }),
    boxArray: module.declareFunction({ name: "valueBoxArray", parameters: [{ name: "array", type: llvm.ptr }], returns: llvm.i64 }),
    length: module.declareFunction({ name: "arrayLength", parameters: [{ name: "array", type: llvm.ptr }], returns: llvm.i64 }),
    print: module.declareFunction({ name: "valuePrint", parameters: [{ name: "value", type: llvm.i64 }], returns: llvm.void }),
    push: module.declareFunction({ name: "gcRootPush", parameters: [{ name: "value", type: llvm.i64 }], returns: llvm.void }),
    save: module.declareFunction({ name: "gcRootSave", parameters: [], returns: llvm.i64 }),
    restore: module.declareFunction({ name: "gcRootRestore", parameters: [{ name: "frame", type: llvm.i64 }], returns: llvm.void }),
    collect: module.declareFunction({ name: "gcSafepoint", parameters: [], returns: llvm.void }),
    callback: module.declareFunction({ name: "callback", parameters: [{ name: "value", type: llvm.i64 }], returns: llvm.void })
  };
}

function program(build: (fn: LlvmFunctionBuilder, runtime: ReturnType<typeof declareRuntime>) => GcFunctionFacts): {
  readonly fn: BuiltLlvmFunction;
  readonly facts: GcFunctionFacts;
} {
  const module = createLlvmModule({ staticRuntime: [] });
  const runtime = declareRuntime(module);
  let facts: GcFunctionFacts | undefined;
  module.defineFunction({ name: "example", parameters: [{ name: "flag", type: llvm.i1 }], returns: llvm.void }, (fn) => {
    facts = build(fn, runtime);
  });
  const fn = module.build().functions.at(0);
  if (fn === undefined || facts === undefined) {
    throw new Error("Test program did not produce its function and heap facts");
  }
  return { fn, facts };
}

function heap(value: LlvmValue, owner: LlvmValue = value): GcHeapReference {
  return { value, protection: { kind: "value", value: owner } };
}

describe("GC liveness over finished native control flow", () => {
  test.each([false, true])("a loop phi must protect its current incoming value, rooted=%s", (rooted) => {
    const { fn, facts } = program((builder, runtime) => {
      const heapReferences: GcHeapReference[] = [];
      const flag = builder.parameter(0, llvm.i1);
      const entry = builder.label("entry");
      const header = builder.label("header");
      const body = builder.label("body");
      const exit = builder.label("exit");
      let first: LlvmValue<typeof llvm.i64>;
      let next: LlvmValue<typeof llvm.i64>;
      let selected: LlvmValue<typeof llvm.i64>;
      builder.block("entry", (block) => {
        const array = block.call(runtime.newArray, [block.int(llvm.i64, 1n)], "first.array");
        first = block.call(runtime.boxArray, [array], "first");
        heapReferences.push(heap(first));
        block.call(runtime.push, [first]);
        block.br(header);
      });
      builder.block("body", (block) => {
        const array = block.call(runtime.newArray, [block.int(llvm.i64, 1n)], "next.array");
        next = block.call(runtime.boxArray, [array], "next");
        heapReferences.push(heap(next));
        if (rooted) {
          block.call(runtime.push, [next]);
        }
        block.br(header);
      });
      builder.block("header", (block) => {
        selected = block.phi(llvm.i64, [{ value: first, block: entry }, { value: next, block: body }], "selected");
        heapReferences.push(heap(selected));
        block.call(runtime.collect, []);
        block.condBr(flag, body, exit);
      });
      builder.block("exit", (block) => { block.call(runtime.print, [selected]); block.ret(); });
      return { heapReferences, borrowedRoots: [] };
    });
    expect(verifyGcLiveness(fn, facts).map((failure) => failure.value)).toEqual(rooted ? [] : ["%selected"]);
  });

  test.each([false, true])("map output live across callback collection, rooted=%s", (rooted) => {
    const { fn, facts } = program((builder, runtime) => {
      const heapReferences: GcHeapReference[] = [];
      builder.block("entry", (block) => {
        const array = block.call(runtime.newArray, [block.int(llvm.i64, 1n)], "map.output");
        const boxed = block.call(runtime.boxArray, [array], "map.output.root");
        heapReferences.push(heap(array, boxed));
        if (rooted) {
          block.call(runtime.push, [boxed]);
        }
        block.call(runtime.callback, [block.int(llvm.i64, 0n)]);
        block.call(runtime.length, [array], "length");
        block.ret();
      });
      return { heapReferences, borrowedRoots: [] };
    });
    const failures = verifyGcLiveness(fn, facts);
    expect(failures.map((failure) => failure.value)).toEqual(rooted ? [] : ["%map.output"]);
  });

  test("a dead heap value needs no root at a later collecting call", () => {
    const { fn, facts } = program((builder, runtime) => {
      const heapReferences: GcHeapReference[] = [];
      builder.block("entry", (block) => {
        const array = block.call(runtime.newArray, [block.int(llvm.i64, 1n)], "unused");
        heapReferences.push(heap(array));
        block.call(runtime.length, [array], "length");
        block.call(runtime.collect, []);
        block.ret();
      });
      return { heapReferences, borrowedRoots: [] };
    });
    expect(verifyGcLiveness(fn, facts)).toEqual([]);
  });

  test("an unused phi does not keep its incoming heap value alive", () => {
    const { fn, facts } = program((builder, runtime) => {
      const heapReferences: GcHeapReference[] = [];
      const entry = builder.label("entry");
      const join = builder.label("join");
      let boxed: LlvmValue<typeof llvm.i64>;
      builder.block("entry", (block) => {
        const array = block.call(runtime.newArray, [block.int(llvm.i64, 1n)], "array");
        boxed = block.call(runtime.boxArray, [array], "unused");
        heapReferences.push(heap(boxed));
        block.call(runtime.collect, []);
        block.br(join);
      });
      builder.block("join", (block) => {
        block.phi(llvm.i64, [{ value: boxed, block: entry }], "unused.phi");
        block.ret();
      });
      return { heapReferences, borrowedRoots: [] };
    });
    expect(verifyGcLiveness(fn, facts)).toEqual([]);
  });

  test("a collecting call requires its heap arguments to be protected during the call", () => {
    const { fn, facts } = program((builder, runtime) => {
      const heapReferences: GcHeapReference[] = [];
      builder.block("entry", (block) => {
        const array = block.call(runtime.newArray, [block.int(llvm.i64, 1n)], "array");
        const boxed = block.call(runtime.boxArray, [array], "argument");
        heapReferences.push(heap(boxed));
        block.call(runtime.callback, [boxed]);
        block.ret();
      });
      return { heapReferences, borrowedRoots: [] };
    });
    expect(verifyGcLiveness(fn, facts).map((failure) => failure.value)).toEqual(["%argument"]);
  });

  test.each([false, true])("root protection must hold on every incoming branch, both=%s", (both) => {
    const { fn, facts } = program((builder, runtime) => {
      const heapReferences: GcHeapReference[] = [];
      const flag = builder.parameter(0, llvm.i1);
      const left = builder.label("left");
      const right = builder.label("right");
      const join = builder.label("join");
      let array: LlvmValue<typeof llvm.ptr>;
      let boxed: LlvmValue<typeof llvm.i64>;
      builder.block("entry", (block) => {
        array = block.call(runtime.newArray, [block.int(llvm.i64, 1n)], "array");
        boxed = block.call(runtime.boxArray, [array], "boxed");
        heapReferences.push(heap(array, boxed));
        block.condBr(flag, left, right);
      });
      builder.block("left", (block) => { block.call(runtime.push, [boxed]); block.br(join); });
      builder.block("right", (block) => {
        if (both) {
          block.call(runtime.push, [boxed]);
        }
        block.br(join);
      });
      builder.block("join", (block) => {
        block.call(runtime.collect, []);
        block.call(runtime.length, [array], "length");
        block.ret();
      });
      return { heapReferences, borrowedRoots: [] };
    });
    expect(verifyGcLiveness(fn, facts).map((failure) => failure.value)).toEqual(both ? [] : ["%array"]);
  });

  test("root restoration drops references pushed after the saved depth", () => {
    const { fn, facts } = program((builder, runtime) => {
      const heapReferences: GcHeapReference[] = [];
      builder.block("entry", (block) => {
        const frame = block.call(runtime.save, [], "frame");
        const array = block.call(runtime.newArray, [block.int(llvm.i64, 1n)], "array");
        const boxed = block.call(runtime.boxArray, [array], "boxed");
        heapReferences.push(heap(array, boxed));
        block.call(runtime.push, [boxed]);
        block.call(runtime.restore, [frame]);
        block.call(runtime.collect, []);
        block.call(runtime.length, [array], "length");
        block.ret();
      });
      return { heapReferences, borrowedRoots: [] };
    });
    expect(verifyGcLiveness(fn, facts).map((failure) => failure.value)).toEqual(["%array"]);
  });

  test("an inner frame cannot be restored after its outer frame has unwound", () => {
    const { fn, facts } = program((builder, runtime) => {
      builder.block("entry", (block) => {
        const outer = block.call(runtime.save, [], "outer");
        const inner = block.call(runtime.save, [], "inner");
        block.call(runtime.restore, [outer]);
        block.call(runtime.restore, [inner]);
        block.ret();
      });
      return { heapReferences: [], borrowedRoots: [] };
    });
    expect(verifyGcLiveness(fn, facts).map((failure) => failure.message))
      .toEqual(["Root frame %inner is unavailable or has already been unwound"]);
  });

  test.each([false, true])("roots survive a loop only when saved after the root was pushed, savedAfter=%s", (savedAfter) => {
    const { fn, facts } = program((builder, runtime) => {
      const heapReferences: GcHeapReference[] = [];
      const flag = builder.parameter(0, llvm.i1);
      const header = builder.label("header");
      const body = builder.label("body");
      const exit = builder.label("exit");
      let array: LlvmValue<typeof llvm.ptr>;
      let frame: LlvmValue<typeof llvm.i64>;
      builder.block("entry", (block) => {
        if (!savedAfter) {
          frame = block.call(runtime.save, [], "frame");
        }
        array = block.call(runtime.newArray, [block.int(llvm.i64, 1n)], "array");
        const boxed = block.call(runtime.boxArray, [array], "boxed");
        heapReferences.push(heap(array, boxed));
        block.call(runtime.push, [boxed]);
        if (savedAfter) {
          frame = block.call(runtime.save, [], "frame");
        }
        block.br(header);
      });
      builder.block("header", (block) => {
        block.call(runtime.restore, [frame]);
        block.call(runtime.collect, []);
        block.condBr(flag, body, exit);
      });
      builder.block("body", (block) => { block.call(runtime.length, [array], "length"); block.br(header); });
      builder.block("exit", (block) => { block.ret(); });
      return { heapReferences, borrowedRoots: [] };
    });
    expect(verifyGcLiveness(fn, facts).map((failure) => failure.value)).toEqual(savedAfter ? [] : ["%array"]);
  });

  test.each([false, true])("phi inputs remain live across the incoming edge, rooted=%s", (rooted) => {
    const { fn, facts } = program((builder, runtime) => {
      const heapReferences: GcHeapReference[] = [];
      const flag = builder.parameter(0, llvm.i1);
      const left = builder.label("left");
      const right = builder.label("right");
      const join = builder.label("join");
      let first: LlvmValue<typeof llvm.i64>;
      let second: LlvmValue<typeof llvm.i64>;
      builder.block("entry", (block) => { block.condBr(flag, left, right); });
      builder.block("left", (block) => {
        const array = block.call(runtime.newArray, [block.int(llvm.i64, 1n)], "first.array");
        first = block.call(runtime.boxArray, [array], "first");
        heapReferences.push(heap(first));
        if (rooted) {
          block.call(runtime.push, [first]);
        }
        block.call(runtime.collect, []);
        block.br(join);
      });
      builder.block("right", (block) => {
        const array = block.call(runtime.newArray, [block.int(llvm.i64, 1n)], "second.array");
        second = block.call(runtime.boxArray, [array], "second");
        heapReferences.push(heap(second));
        block.call(runtime.push, [second]);
        block.br(join);
      });
      builder.block("join", (block) => {
        const selected = block.phi(llvm.i64, [{ value: first, block: left }, { value: second, block: right }], "selected");
        heapReferences.push(heap(selected));
        block.call(runtime.collect, []);
        block.call(runtime.print, [selected]);
        block.ret();
      });
      return { heapReferences, borrowedRoots: [] };
    });
    expect(verifyGcLiveness(fn, facts).map((failure) => failure.value)).toEqual(rooted ? [] : ["%first", "%selected"]);
  });
});
