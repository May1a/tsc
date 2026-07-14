import { describe, expect, test } from "vitest";
import { createLlvmModule, llvm, type LlvmBlockBuilder } from "../../src/compiler/llvm-ir/index.js";

describe("LLVM IR builder", () => {
  test("renders typed functions and records trace ranges without scanning markers", () => {
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
          const boxed = block.withTrace("m0:o000000", () => {
            const bits = block.ptrToInt(object, llvm.i64, "bits");
            const payload = block.and(bits, block.int(llvm.i64, 281_474_976_710_655n), "payload");
            return block.or(payload, block.int(llvm.i64, 9_221_120_237_041_090_560n), "value");
          });
          block.ret(boxed);
        });
      }
    );

    const rendered = module.render();

    expect(rendered.text).toBe(`define i64 @valueBoxObject(ptr %object) {
entry:
; tscn-trace-start m0:o000000
  %bits = ptrtoint ptr %object to i64
  %payload = and i64 %bits, 281474976710655
  %value = or i64 %payload, 9221120237041090560
; tscn-trace-end m0:o000000
  ret i64 %value
}
`);
    expect(rendered.traceRanges).toEqual(new Map([
      ["m0:o000000", [{ startLine: 4, endLine: 6 }]]
    ]));
  });

  test("composes declarations, tracked legacy text, and structured functions deterministically", () => {
    const module = createLlvmModule();
    const puts = module.declareFunction({ name: "puts", parameters: [{ name: "message", type: llvm.ptr }], returns: llvm.i32 });
    module.addLegacyModuleText({
      origin: "test fixture",
      text: "; tscn-trace-start legacy\n@message = global ptr null\n; tscn-trace-end legacy\n",
      traceMarkers: [
        { line: 1, kind: "start", id: "legacy" },
        { line: 3, kind: "end", id: "legacy" }
      ]
    });
    module.defineFunction({ name: "main", parameters: [], returns: llvm.i32 }, (fn) => {
      fn.block("entry", (block) => {
        block.call(puts, [block.nullPtr()], "status");
        block.ret(block.int(llvm.i32, 0n));
      });
    });

    const rendered = module.render();
    expect(rendered.text).toContain("declare i32 @puts(ptr)");
    expect(rendered.text).toContain("%status = call i32 @puts(ptr null)");
    expect(rendered.traceRanges.get("legacy")).toEqual([{ startLine: 3, endLine: 3 }]);
  });

  test("supports typed memory, comparisons, selection, and control flow", () => {
    const module = createLlvmModule();
    module.defineFunction({ name: "choose", parameters: [{ name: "pointer", type: llvm.ptr }], returns: llvm.i64 }, (fn) => {
      const pointer = fn.parameter(0, llvm.ptr);
      fn.block("entry", (block) => {
        const bits = block.ptrToInt(pointer, llvm.i64, "bits");
        const isNull = block.icmp("eq", bits, block.int(llvm.i64, 0n), "is.null");
        block.condBr(isNull, "empty", "present");
      });
      fn.block("empty", (block) => {
        block.ret(block.int(llvm.i64, 0n));
      });
      fn.block("present", (block) => {
        const loaded = block.load(llvm.i64, pointer, "loaded");
        const selected = block.select(block.icmp("ne", loaded, block.int(llvm.i64, 0n), "nonzero"), loaded, block.int(llvm.i64, 1n), "selected");
        block.ret(selected);
      });
    });
    expect(module.render().text).toContain("br i1 %is.null, label %empty, label %present");
  });

  test("rejects structural misuse and escaped scoped builders", () => {
    expect(() => createLlvmModule().defineFunction({
      name: "duplicateParameters",
      parameters: [{ name: "value", type: llvm.i64 }, { name: "value", type: llvm.i64 }],
      returns: llvm.i64
    }, () => {
      throw new Error("builder callback should not run");
    })).toThrow("duplicate LLVM parameter name");

    const missingTerminator = createLlvmModule();
    expect(() => missingTerminator.defineFunction({ name: "missing", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", () => {
        void fn;
      });
    })).toThrow("missing a terminator");

    const escapedModule = createLlvmModule();
    let escaped: LlvmBlockBuilder | undefined;
    escapedModule.defineFunction({ name: "escaped", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => {
        escaped = block;
        block.ret();
      });
    });
    expect(() => escaped?.int(llvm.i64, 0n)).toThrow("escaped its scope");

    const unknownBranch = createLlvmModule();
    expect(() => unknownBranch.defineFunction({ name: "badBranch", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => block.br("missing"));
    })).toThrow("unknown block missing");

    const crossBlockValue = createLlvmModule();
    expect(() => crossBlockValue.defineFunction({ name: "crossBlock", parameters: [], returns: llvm.i64 }, (fn) => {
      let siblingValue: ReturnType<LlvmBlockBuilder["int"]> | undefined;
      fn.block("entry", (block) => {
        siblingValue = block.int(llvm.i64, 1n);
        block.br("next");
      });
      fn.block("next", (block) => block.ret(siblingValue));
    })).toThrow("incompatible LLVM value");

    const invalidBitcast = createLlvmModule();
    expect(() => invalidBitcast.defineFunction({ name: "invalidBitcast", parameters: [{ name: "value", type: llvm.i32 }], returns: llvm.i64 }, (fn) => {
      const value = fn.parameter(0, llvm.i32);
      fn.block("entry", (block) => block.ret(block.bitcast(value, llvm.i64, "invalid")));
    })).toThrow("invalid LLVM bitcast");

    const reentrantBlock = createLlvmModule();
    expect(() => reentrantBlock.defineFunction({ name: "reentrant", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => {
        fn.block("nested", (nested) => nested.ret());
        block.ret();
      });
    })).toThrow("another block is active");

    const unownedCall = createLlvmModule();
    expect(() => unownedCall.defineFunction({ name: "caller", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => {
        block.call({ name: "missing", parameters: [], returns: llvm.void }, []);
        block.ret();
      });
    })).toThrow("unowned function missing");
  });
});
