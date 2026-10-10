import { describe, expect, test } from "vitest";
import { type LlvmBlockBuilder, type LlvmValue, createLlvmModule, llvm, renderLlvmType, sameLlvmType } from "../../src/compiler/llvm-ir/index.js";

describe("LLVM IR builder", () => {
  test("rejects a parameter borrowed from another function in the same module", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    let borrowed: LlvmValue<typeof llvm.i64> | undefined;
    module.defineFunction({ name: "first", parameters: [{ name: "input", type: llvm.i64 }], returns: llvm.i64 }, (fn) => {
      borrowed = fn.parameter(0, llvm.i64);
      fn.block("entry", (block) => block.ret(borrowed));
    });
    expect(() => module.defineFunction({ name: "second", parameters: [], returns: llvm.i64 }, (fn) => {
      fn.block("entry", (block) => block.ret(borrowed));
    })).toThrow();
  });

  test("allows an instruction result in a block dominated by its definition", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    module.defineFunction({ name: "dominated", parameters: [{ name: "input", type: llvm.i64 }], returns: llvm.i64 }, (fn) => {
      let value: LlvmValue<typeof llvm.i64> | undefined;
      const input = fn.parameter(0, llvm.i64);
      fn.block("entry", (block) => {
        value = block.add(input, block.int(llvm.i64, 1n), "incremented");
        block.br(fn.label("next"));
      });
      fn.block("next", (block) => block.ret(value));
    });
    expect(module.render().text).toContain("ret i64 %incremented");
  });

  test("supports a zero-length LLVM array", () => {
    expect(renderLlvmType(llvm.array(llvm.double, 0))).toBe("[0 x double]");
  });

  test("preserves negative zero and renders NaN as an LLVM bit pattern", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    module.defineFunction({ name: "negativeZero", parameters: [], returns: llvm.double }, (fn) => {
      fn.block("entry", (block) => block.ret(block.double(-0)));
    });
    module.defineFunction({ name: "notANumber", parameters: [], returns: llvm.double }, (fn) => {
      fn.block("entry", (block) => block.ret(block.double(Number.NaN)));
    });
    const { text } = module.render();
    expect(text).toMatch(/ret double (?:-0\.0|0x8000000000000000)/);
    expect(text).toMatch(/ret double 0x7FF8000000000000/i);
  });

  test("renders typed functions and records trace ranges without scanning markers", () => {
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

  test("composes static runtime and traces only typed instructions", () => {
    const module = createLlvmModule({ staticRuntime: [{ origin: "test fixture", text: "@message = global ptr null\n" }] });
    const puts = module.declareFunction({ name: "puts", parameters: [{ name: "message", type: llvm.ptr }], returns: llvm.i32 });
    module.defineFunction({ name: "main", parameters: [], returns: llvm.i32 }, (fn) => {
      fn.block("entry", (block) => {
        block.withTrace("typed", () => block.call(puts, [block.nullPtr()], "status"));
        block.ret(block.int(llvm.i32, 0n));
      });
    });

    const rendered = module.render();
    expect(rendered.text).toContain("declare i32 @puts(ptr)");
    expect(rendered.text).toContain("%status = call i32 @puts(ptr null)");
    expect(rendered.traceRanges.get("typed")).toEqual([{ startLine: 6, endLine: 6 }]);
    expect(rendered.traceRanges.size).toBe(1);
  });

  test("supports typed memory, comparisons, selection, and control flow", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    module.defineFunction({ name: "choose", parameters: [{ name: "pointer", type: llvm.ptr }], returns: llvm.i64 }, (fn) => {
      const pointer = fn.parameter(0, llvm.ptr);
      const empty = fn.label("empty");
      const present = fn.label("present");
      fn.block("entry", (block) => {
        const bits = block.ptrToInt(pointer, llvm.i64, "bits");
        const isNull = block.icmp("eq", bits, block.int(llvm.i64, 0n), "is.null");
        block.condBr(isNull, empty, present);
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
    expect(() => createLlvmModule({ staticRuntime: [] }).defineFunction({
      name: "duplicateParameters",
      parameters: [{ name: "value", type: llvm.i64 }, { name: "value", type: llvm.i64 }],
      returns: llvm.i64
    }, () => {
      throw new Error("builder callback should not run");
    })).toThrow("duplicate LLVM parameter name");

    const missingTerminator = createLlvmModule({ staticRuntime: [] });
    expect(() => missingTerminator.defineFunction({ name: "missing", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", () => {
        void fn;
      });
    })).toThrow("missing a terminator");

    const escapedModule = createLlvmModule({ staticRuntime: [] });
    let escaped: LlvmBlockBuilder | undefined;
    escapedModule.defineFunction({ name: "escaped", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => {
        escaped = block;
        block.ret();
      });
    });
    expect(() => escaped?.int(llvm.i64, 0n)).toThrow("escaped its scope");

    const unknownBranch = createLlvmModule({ staticRuntime: [] });
    expect(() => unknownBranch.defineFunction({ name: "badBranch", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => block.br(fn.label("missing")));
    })).toThrow("unknown block missing");

    const invalidBitcast = createLlvmModule({ staticRuntime: [] });
    expect(() => invalidBitcast.defineFunction({ name: "invalidBitcast", parameters: [{ name: "value", type: llvm.i32 }], returns: llvm.i64 }, (fn) => {
      const value = fn.parameter(0, llvm.i32);
      fn.block("entry", (block) => block.ret(block.bitcast(value, llvm.i64, "invalid")));
    })).toThrow("invalid LLVM bitcast");

    // Nesting used to be refused while a block's callback was still running, because a block was
    // sealed the moment its callback returned. Blocks are now sealed by the function's `finish`, so a
    // nested region opens, fills and closes inside its parent — which is what a recursive lowering
    // pass needs in order to descend into a nested block and come back.
    const nestedBlocks = createLlvmModule({ staticRuntime: [] });
    nestedBlocks.defineFunction({ name: "nested", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => {
        fn.block("inner", (inner) => inner.ret());
        block.ret();
      });
    });
    expect(nestedBlocks.render().text).toBe("define void @nested() {\nentry:\n  ret void\ninner:\n  ret void\n}\n");

    const duplicateBlock = createLlvmModule({ staticRuntime: [] });
    expect(() => duplicateBlock.defineFunction({ name: "duplicateBlock", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => block.ret());
      fn.block("entry", (block) => block.ret());
    })).toThrow("duplicate LLVM block name entry");

    const unownedCall = createLlvmModule({ staticRuntime: [] });
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
    const module = createLlvmModule({ staticRuntime: [] });
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
    const module = createLlvmModule({ staticRuntime: [] });
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
    const module = createLlvmModule({ staticRuntime: [] });
    expect(() => module.defineFunction({ name: "badInsert", parameters: [], returns: pair }, (fn) => {
      fn.block("entry", (block) => {
        const initial = block.undef(pair, "initial");
        // @ts-expect-error: TS2345 - deliberate: index 2 is not a position of { i64, i1 }, so the static type has no element for it. The test pins the runtime bounds guard that stands behind the compile-time one.
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
        // @ts-expect-error: TS2345 - deliberate: 0.5 is not a position of a tuple, so the static index type rejects it before the runtime bounds check ever sees the value.
        block.insertValue(initial, block.int(llvm.i64, 0n), 0.5, "bad");
        block.ret(initial);
      });
    })).toThrow("insertvalue index 0.5 out of bounds for { i64, i1 }");
  });

  test("rejects insertvalue with mismatched element type and non-struct aggregate", () => {
    const pair = llvm.struct([llvm.i64, llvm.i1]);
    const module = createLlvmModule({ staticRuntime: [] });
    expect(() => module.defineFunction({ name: "wrongElement", parameters: [], returns: pair }, (fn) => {
      fn.block("entry", (block) => {
        const initial = block.undef(pair, "initial");
        // @ts-expect-error: TS2345 - deliberate: position 0 of { i64, i1 } is i64, so an i32 element cannot be spelled. The test pins the runtime element check behind the compile-time one.
        block.insertValue(initial, block.int(llvm.i32, 0n), 0, "bad");
        block.ret(initial);
      });
    })).toThrow("insertvalue element type i32 does not match struct element i64");

    expect(() => module.defineFunction({ name: "wrongSlot", parameters: [], returns: pair }, (fn) => {
      fn.block("entry", (block) => {
        const initial = block.undef(pair, "initial");
        // @ts-expect-error: TS2345 - deliberate: position 1 of { i64, i1 } is i1, so an i64 element cannot be spelled. The runtime check reports the same disagreement.
        block.insertValue(initial, block.int(llvm.i64, 0n), 1, "bad");
        block.ret(initial);
      });
    })).toThrow("insertvalue element type i64 does not match struct element i1");

    expect(() => module.defineFunction({ name: "nonStructAggregate", parameters: [{ name: "v", type: llvm.i64 }], returns: pair }, (fn) => {
      const v = fn.parameter(0, llvm.i64);
      fn.block("entry", (block) => {
        // @ts-expect-error: TS2345 - deliberate: the aggregate is i64, not a struct, so the static type already rejects it. The test pins the runtime guard "expected LLVM struct type, found i64", which is defence in depth behind the compile-time check rather than a hole in it.
        block.insertValue(v, block.int(llvm.i64, 0n), 0, "bad");
        block.ret(block.undef(pair, "fallback"));
      });
    })).toThrow("expected LLVM struct type, found i64");
  });

  test("rejects a value from another function, and one a block does not dominate", () => {
    const module = createLlvmModule({ staticRuntime: [] });

    // Cross-module: a value minted by another module's function is a different SSA name.
    expect(() => {
      const foreign = createLlvmModule({ staticRuntime: [] });
      let external: ReturnType<LlvmBlockBuilder["undef"]> | undefined;
      foreign.defineFunction({ name: "foreign", parameters: [], returns: llvm.void }, (fn) => {
        fn.block("entry", (block) => {
          external = block.undef(llvm.struct([llvm.i64]), "owned");
          block.ret();
        });
      });
      module.defineFunction({ name: "useForeign", parameters: [], returns: llvm.void }, (fn) => {
        fn.block("entry", (block) => {
          if (external === undefined) {
            throw new Error("test setup: external should have been captured");
          }
          // @ts-expect-error: TS2345 - deliberate: the value belongs to another module. Function ownership is a runtime property tracked in a WeakMap, so the static type still looks valid here. The test pins the runtime guard that catches this cross-function use.
          block.insertValue(external, block.int(llvm.i64, 0n), 0, "bad");
          block.ret();
        });
      });
    }).toThrow("incompatible LLVM value");

    // Same function, two blocks: a definition in a branch that does not dominate the join reaches the
    // join on one path only, which is exactly what SSA forbids. See llvm-control-flow.test.ts for the
    // dominance rules; this is the aggregate form of the same check.
    expect(() => module.defineFunction({ name: "join", parameters: [], returns: llvm.i64 }, (fn) => {
      const left = fn.label("left");
      const right = fn.label("right");
      const join = fn.label("join");
      let onlyOnOnePath: ReturnType<LlvmBlockBuilder["add"]> | undefined;
      fn.block("entry", (block) => {
        block.condBr(block.int(llvm.i1, 1n), left, right);
      });
      fn.block("left", (block) => {
        onlyOnOnePath = block.add(block.int(llvm.i64, 1n), block.int(llvm.i64, 1n), "left.only");
        block.br(join);
      });
      fn.block("right", (block) => {
        block.br(join);
      });
      fn.block("join", (block) => {
        if (onlyOnOnePath === undefined) {
          throw new Error("test setup: onlyOnOnePath should have been captured");
        }
        block.ret(onlyOnOnePath);
      });
    })).toThrow("does not dominate its use in join");
  });
});
