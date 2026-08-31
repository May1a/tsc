import { describe, expect, test } from "vitest";
import { createLlvmModule, llvm, renderLlvmType, sameLlvmType, type LlvmBlockBuilder } from "../../src/compiler/llvm-ir/index.js";

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
    // eslint-disable-next-line unicorn/no-useless-undefined -- init-declarations requires explicit initializer
    let escaped: LlvmBlockBuilder | undefined = undefined;
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
      // eslint-disable-next-line unicorn/no-useless-undefined -- init-declarations requires explicit initializer
      let siblingValue: ReturnType<LlvmBlockBuilder["int"]> | undefined = undefined;
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

  test("builds literal struct types, renders them, and compares them structurally", () => {
    const pair = llvm.struct([llvm.i64, llvm.i1]);
    expect(pair).toEqual({ kind: "struct", elements: [llvm.i64, llvm.i1] });
    expect(renderLlvmType(pair)).toBe("{ i64, i1 }");
    expect(sameLlvmType(pair, llvm.struct([llvm.i64, llvm.i1]))).toBe(true);
    expect(sameLlvmType(pair, llvm.struct([llvm.i1, llvm.i64]))).toBe(false);
    expect(sameLlvmType(pair, llvm.struct([llvm.i64, llvm.i1, llvm.i64]))).toBe(false);
    expect(sameLlvmType(pair, llvm.struct([llvm.i64]))).toBe(false);
    expect(sameLlvmType(pair, llvm.i64)).toBe(false);
    expect(renderLlvmType(llvm.struct([llvm.struct([llvm.ptr, llvm.i64]), llvm.double]))).toBe("{ { ptr, i64 }, double }");
  });

  test("rejects malformed struct type construction", () => {
    expect(() => llvm.struct([])).toThrow("at least one element");
  });

  test("uses struct types in function declarations, calls, and returns", () => {
    const pair = llvm.struct([llvm.i64, llvm.i1]);
    const module = createLlvmModule();
    const producer = module.declareFunction({
      name: "producePair",
      parameters: [{ name: "tag", type: llvm.i1 }],
      returns: pair
    });
    module.defineFunction({ name: "consumePair", parameters: [], returns: llvm.i64 }, (fn) => {
      fn.block("entry", (block) => {
        const got = block.call(producer, [block.int(llvm.i1, 1n)], "got");
        expect(got).toBeDefined();
        block.ret(block.int(llvm.i64, 7n));
      });
    });

    const rendered = module.render().text;
    expect(rendered).toContain("declare { i64, i1 } @producePair(i1)");
    expect(rendered).toContain("  %got = call { i64, i1 } @producePair(i1 1)");
  });

  test("emits insertvalue and extractvalue instructions for building struct aggregates", () => {
    const pair = llvm.struct([llvm.i64, llvm.i1]);
    const module = createLlvmModule();
    module.defineFunction({ name: "makePair", parameters: [{ name: "value", type: llvm.i64 }], returns: pair }, (fn) => {
      const value = fn.parameter(0, llvm.i64);
      fn.block("entry", (block) => {
        const initial = block.undef(pair, "initial");
        const withValue = block.insertValue(initial, value, 0, "with.value");
        const flag = block.icmp("eq", value, block.int(llvm.i64, 0n), "flag");
        const pairValue = block.insertValue(withValue, flag, 1, "pair");
        const extractedFlag = block.extractValue(pairValue, 1, "extracted.flag");
        const final = block.select(extractedFlag, pairValue, pairValue, "final");
        block.ret(final);
      });
    });

    const rendered = module.render().text;
    expect(rendered).toContain("define { i64, i1 } @makePair(i64 %value)");
    expect(rendered).toContain("  %with.value = insertvalue { i64, i1 } undef, i64 %value, 0");
    expect(rendered).toContain("  %pair = insertvalue { i64, i1 } %with.value, i1 %flag, 1");
    expect(rendered).toContain("  %extracted.flag = extractvalue { i64, i1 } %pair, 1");
    expect(rendered).toContain("  ret { i64, i1 } %final");
  });

  test("rejects out-of-bounds insertvalue and extractvalue indices", () => {
    const pair = llvm.struct([llvm.i64, llvm.i1]);
    const module = createLlvmModule();
    expect(() => module.defineFunction({ name: "badInsert", parameters: [], returns: pair }, (fn) => {
      fn.block("entry", (block) => {
        const initial = block.undef(pair, "initial");
        block.insertValue(initial, block.int(llvm.i64, 0n), 2, "bad");
        block.ret(initial);
      });
    })).toThrow("insertvalue index 2 out of bounds for { i64, i1 }");

    expect(() => module.defineFunction({ name: "badExtract", parameters: [], returns: llvm.i64 }, (fn) => {
      fn.block("entry", (block) => {
        const pairValue = block.undef(pair, "pair");
        // oxlint-disable-next-line no-magic-numbers -- intentionally out of bounds for { i64, i1 }
        block.extractValue(pairValue, 5, "bad");
        block.ret(block.int(llvm.i64, 0n));
      });
    })).toThrow("extractvalue index 5 out of bounds for { i64, i1 }");

    expect(() => module.defineFunction({ name: "negativeIndex", parameters: [], returns: pair }, (fn) => {
      fn.block("entry", (block) => {
        const initial = block.undef(pair, "initial");
        block.insertValue(initial, block.int(llvm.i64, 0n), -1, "bad");
        block.ret(initial);
      });
    })).toThrow("insertvalue index -1 out of bounds for { i64, i1 }");

    expect(() => module.defineFunction({ name: "fractionalIndex", parameters: [], returns: pair }, (fn) => {
      fn.block("entry", (block) => {
        const initial = block.undef(pair, "initial");
        // oxlint-disable-next-line no-magic-numbers -- non-integer index triggers the bounds check
        block.insertValue(initial, block.int(llvm.i64, 0n), 0.5, "bad");
        block.ret(initial);
      });
    })).toThrow("insertvalue index 0.5 out of bounds for { i64, i1 }");
  });

  test("rejects insertvalue with mismatched element type and non-struct aggregate", () => {
    const pair = llvm.struct([llvm.i64, llvm.i1]);
    const module = createLlvmModule();
    expect(() => module.defineFunction({ name: "wrongElement", parameters: [], returns: pair }, (fn) => {
      fn.block("entry", (block) => {
        const initial = block.undef(pair, "initial");
        block.insertValue(initial, block.int(llvm.i32, 0n), 0, "bad");
        block.ret(initial);
      });
    })).toThrow("insertvalue element type i32 does not match struct element i64");

    expect(() => module.defineFunction({ name: "wrongSlot", parameters: [], returns: pair }, (fn) => {
      fn.block("entry", (block) => {
        const initial = block.undef(pair, "initial");
        block.insertValue(initial, block.int(llvm.i64, 0n), 1, "bad");
        block.ret(initial);
      });
    })).toThrow("insertvalue element type i64 does not match struct element i1");

    expect(() => module.defineFunction({ name: "nonStructAggregate", parameters: [{ name: "v", type: llvm.i64 }], returns: pair }, (fn) => {
      const v = fn.parameter(0, llvm.i64);
      fn.block("entry", (block) => {
        block.insertValue(v, block.int(llvm.i64, 0n), 0, "bad");
        block.ret(block.undef(pair, "fallback"));
      });
    })).toThrow("expected LLVM struct type, found i64");
  });

  test("rejects unowned values used as insertvalue aggregates or elements", () => {
    const module = createLlvmModule();
    // Cross-block: a value created in one block cannot be used in another
    expect(() => module.defineFunction({ name: "crossBlock", parameters: [], returns: llvm.i64 }, (fn) => {
      // eslint-disable-next-line unicorn/no-useless-undefined -- init-declarations requires explicit initializer
      let sibling: ReturnType<LlvmBlockBuilder["undef"]> | undefined = undefined;
      fn.block("entry", (block) => {
        sibling = block.undef(llvm.struct([llvm.i64]), "owned");
        block.br("next");
      });
      fn.block("next", (block) => {
        if (sibling === undefined) {
          throw new Error("test setup: sibling should be captured");
        }
        block.insertValue(sibling, block.int(llvm.i64, 0n), 0, "bad");
        block.ret(block.int(llvm.i64, 0n));
      });
    })).toThrow("incompatible LLVM value");

    // Cross-module: a value from another module cannot be used here
    expect(() => {
      const foreign = createLlvmModule();
      // eslint-disable-next-line unicorn/no-useless-undefined -- init-declarations requires explicit initializer
      let external: ReturnType<LlvmBlockBuilder["undef"]> | undefined = undefined;
      foreign.defineFunction({ name: "foreign", parameters: [], returns: llvm.void }, (fn) => {
        fn.block("entry", (block) => {
          external = block.undef(llvm.struct([llvm.i64]), "owned");
          block.ret();
        });
      });
      module.defineFunction({ name: "useForeign", parameters: [], returns: llvm.void }, (fn) => {
        fn.block("entry", (block) => {
          if (external === undefined) {
            throw new Error("test setup: external should be captured");
          }
          block.insertValue(external, block.int(llvm.i64, 0n), 0, "bad");
          block.ret();
        });
      });
    }).toThrow("incompatible LLVM value");
  });
});
