import { describe, expect, test } from "vitest";
import {
  type BuiltLlvmFunction,
  type BuiltLlvmModule,
  type LlvmBlockBuilder,
  type LlvmValue,
  createLlvmModule,
  llvm
} from "../../src/compiler/llvm-ir/index.js";

/**
 * Control flow: dominance, `phi` edges, the finished IR a later pass walks, and global initializers.
 *
 * The rule under test is SSA's: a value may be read exactly where its definition has been computed on
 * every path. It cannot be decided while a block is being built, because a block that branches to a
 * sibling may be written after it — so it is settled when the function closes, against the real edge
 * set. The tests below pin each way that answer can come out: a definition that reaches the use, one
 * that reaches it only on some paths, and one that reaches it only through a `phi` that names the
 * back edge.
 */

describe("LLVM dominance", () => {
  test("reads a value from a block that dominates the use", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    module.defineFunction({ name: "forward", parameters: [], returns: llvm.i64 }, (fn) => {
      const next = fn.label("next");
      let sum: LlvmValue<typeof llvm.i64> | undefined;
      fn.block("entry", (block) => {
        sum = block.add(block.int(llvm.i64, 1n), block.int(llvm.i64, 2n), "sum");
        block.br(next);
      });
      fn.block("next", (block) => {
        if (sum === undefined) {
          throw new Error("test setup: the entry value should have been captured");
        }
        block.ret(block.multiply(sum, block.int(llvm.i64, 3n), "scaled"));
      });
    });
    expect(module.render().text).toContain("ret i64 %scaled");
  });

  test("refuses a value defined on only one arm of a branch", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    expect(() => module.defineFunction({ name: "diamond", parameters: [{ name: "flag", type: llvm.i1 }], returns: llvm.i64 }, (fn) => {
      const left = fn.label("left");
      const right = fn.label("right");
      const join = fn.label("join");
      let onlyOnTheLeft: LlvmValue<typeof llvm.i64> | undefined;
      fn.block("entry", (block) => {
        block.condBr(block.int(llvm.i1, 1n), left, right);
      });
      fn.block("left", (block) => {
        onlyOnTheLeft = block.add(block.int(llvm.i64, 1n), block.int(llvm.i64, 1n), "left.only");
        block.br(join);
      });
      fn.block("right", (block) => {
        block.br(join);
      });
      fn.block("join", (block) => {
        if (onlyOnTheLeft === undefined) {
          throw new Error("test setup: the left-arm value should have been captured");
        }
        block.ret(onlyOnTheLeft);
      });
    })).toThrow("is defined in left, which does not dominate its use in join");
  });

  test("refuses a value from one predecessor at a join both of them reach", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    expect(() => module.defineFunction({ name: "join", parameters: [{ name: "flag", type: llvm.i1 }], returns: llvm.i64 }, (fn) => {
      const left = fn.label("left");
      const right = fn.label("right");
      const join = fn.label("join");
      let computed: LlvmValue<typeof llvm.i64> | undefined;
      fn.block("entry", (block) => {
        block.condBr(block.int(llvm.i1, 1n), left, right);
      });
      fn.block("left", (block) => {
        computed = block.add(block.int(llvm.i64, 1n), block.int(llvm.i64, 1n), "computed");
        block.br(join);
      });
      fn.block("right", (block) => {
        block.br(join);
      });
      fn.block("join", (block) => {
        if (computed === undefined) {
          throw new Error("test setup: the computed value should have been captured");
        }
        block.ret(computed);
      });
    })).toThrow("does not dominate its use in join");
  });

  test("carries a loop-carried value across the back edge through a phi", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    module.defineFunction({ name: "countdown", parameters: [{ name: "start", type: llvm.i64 }], returns: llvm.void }, (fn) => {
      const start = fn.parameter(0, llvm.i64);
      const entry = fn.label("entry");
      const header = fn.label("header");
      const exit = fn.label("exit");
      fn.block("entry", (block) => {
        block.br(header);
      });
      fn.block("header", (block) => {
        // The value on the back edge is computed *below* the phi, in this same block: a phi is read on
        // its edge, so later-in-block is exactly what an incoming operand is allowed to be.
        const carried = block.phi(llvm.i64, [
          { value: start, block: entry },
          { value: block.add(block.int(llvm.i64, 0n), block.int(llvm.i64, 1n), "next"), block: header }
        ], "counter");
        block.switchInstruction(carried, [{ value: 7n, target: exit }], header);
      });
      fn.block("exit", (block) => {
        block.ret();
      });
    });
    const emitted = module.render().text;
    expect(emitted).toContain("%counter = phi i64 [ %start, %entry ], [ %next, %header ]");
    expect(emitted).toContain("%next = add i64 0, 1");
  });

  test("refuses a phi whose incoming value is not available on the edge it names", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    expect(() => module.defineFunction({ name: "badEdge", parameters: [], returns: llvm.i64 }, (fn) => {
      const left = fn.label("left");
      const right = fn.label("right");
      const join = fn.label("join");
      let computed: LlvmValue<typeof llvm.i64> | undefined;
      fn.block("entry", (block) => {
        block.condBr(block.int(llvm.i1, 1n), left, right);
      });
      fn.block("left", (block) => {
        computed = block.add(block.int(llvm.i64, 1n), block.int(llvm.i64, 1n), "computed");
        block.br(join);
      });
      fn.block("right", (block) => {
        block.br(join);
      });
      fn.block("join", (block) => {
        // `computed` is only defined on the path through `left`, so it cannot arrive on the edge from
        // `right`; naming it there is the mistake a phi makes most easily, and it is not the
        // predecessor check's job to catch — the edge exists, the value does not.
        block.ret(block.phi(llvm.i64, [
          { value: computed ?? block.int(llvm.i64, 0n), block: right },
          { value: block.int(llvm.i64, 0n), block: left }
        ], "carried"));
      });
    })).toThrow("is defined in left, which does not dominate its use in right");
  });

  test("skips blocks the entry cannot reach, as LLVM's own verifier does", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    module.defineFunction({ name: "unreachableTail", parameters: [], returns: llvm.void }, (fn) => {
      const done = fn.label("done");
      const stranger = fn.label("stranger");
      let inTheOrphan: LlvmValue<typeof llvm.i64> | undefined;
      fn.block("entry", (block) => {
        block.br(done);
      });
      fn.block("orphan", (block) => {
        inTheOrphan = block.add(block.int(llvm.i64, 1n), block.int(llvm.i64, 1n), "orphan.only");
        block.br(stranger);
      });
      fn.block("stranger", (block) => {
        if (inTheOrphan === undefined) {
          throw new Error("test setup: the orphan value should have been captured");
        }
        // Neither `orphan` nor `stranger` is reachable from `entry`, so nothing about the path to them
        // is provable and dominance is not claimed there — LLVM's own exemption, and the reason this
        // build does not invent a dominator set that would make the check vacuous.
        block.store(inTheOrphan, block.nullPtr());
        block.ret();
      });
      fn.block("done", (block) => {
        block.ret();
      });
    });
    expect(module.render().text).toContain("store i64 %orphan.only, ptr null");
  });
});

/**
 * `openBlock`: the same block machinery the callback form uses, without its two restrictions.
 *
 * `block(name, build)` used to seal the block when its callback returned, which forced every
 * callback to terminate its block immediately and refused a nested `block` call. A recursive
 * lowering pass needs neither restriction: it opens a region, descends into nested regions, and
 * closes them when the region ends. `openBlock` removes the seal from the callback and moves it to
 * the function's `finish`, where the whole-graph checks already lived.
 */
describe("LLVM open blocks", () => {
  test("fills blocks in arbitrary order, appending across owned blocks", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    module.defineFunction({ name: "interleaved", parameters: [], returns: llvm.i64 }, (fn) => {
      const entry = fn.openBlock("entry");
      const then = fn.openBlock("then");
      const otherwise = fn.openBlock("otherwise");
      const join = fn.openBlock("join");

      // Opened in source order above, but written in execution order: the point of the API is that
      // construction order and control-flow order need not agree. A branch target is a label, so each
      // block mints its own and the builders address instructions.
      const thenLabel = then.label;
      const otherwiseLabel = otherwise.label;
      const joinLabel = join.label;
      entry.condBr(entry.icmp("eq", entry.int(llvm.i64, 0n), entry.int(llvm.i64, 0n), "flag"), thenLabel, otherwiseLabel);
      then.br(joinLabel);
      otherwise.br(joinLabel);
      join.ret(join.add(join.int(llvm.i64, 1n), join.int(llvm.i64, 2n), "sum"));
    });

    const { text } = module.render();
    expect(text).toBe(`define i64 @interleaved() {
entry:
  %flag = icmp eq i64 0, 0
  br i1 %flag, label %then, label %otherwise
then:
  br label %join
otherwise:
  br label %join
join:
  %sum = add i64 1, 2
  ret i64 %sum
}
`);
  });

  test("carries a loop-carried value across the back edge through a phi written out of order", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    module.defineFunction({ name: "countdown", parameters: [{ name: "start", type: llvm.i64 }], returns: llvm.void }, (fn) => {
      const start = fn.parameter(0, llvm.i64);
      const entry = fn.openBlock("entry");
      const header = fn.openBlock("header");
      const exit = fn.openBlock("exit");

      entry.br(fn.label("header"));

      // The body's `next` is computed *after* the phi that consumes it. That is not a forward
      // reference: a phi's operands are read on the incoming edge, not inside the block, so a value
      // defined later in the same block is exactly what a back edge may carry. It is only reachable
      // because the block is no longer sealed at the point the phi is written.
      const headerLabel = header.label;
      const carried = header.phi(llvm.i64, [
        { value: start, block: fn.label("entry") },
        { value: header.add(header.int(llvm.i64, 0n), header.int(llvm.i64, 1n), "next"), block: headerLabel }
      ], "counter");
      header.switchInstruction(carried, [{ value: 7n, target: exit.label }], headerLabel);
      exit.ret();
    });

    const { text } = module.render();
    expect(text).toContain("%counter = phi i64 [ %start, %entry ], [ %next, %header ]");
    expect(text).toContain("%next = add i64 0, 1");
    expect(text).toMatch(/switch i64 %counter, label %header \[\s+i64 7, label %exit\s+\]/);
  });

  test("nests an open block inside a callback and keeps both handles usable afterwards", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    module.defineFunction({ name: "nested", parameters: [], returns: llvm.void }, (fn) => {
      let inner: ReturnType<typeof fn.openBlock> | undefined;
      fn.block("entry", (block) => {
        inner = fn.openBlock("inner");
        block.br(inner.label);
      });
      if (inner === undefined) {
        throw new Error("test setup: the nested block should have been captured");
      }
      // The parent callback returned before this. Under the callback-only API `inner` would already
      // be sealed, because a block was closed the moment its callback ended.
      inner.ret();
    });
    expect(module.render().text).toContain("  ret void\n}\n");
  });

  test("reads a parameter and a literal from any owned block", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    module.defineFunction({ name: "shared", parameters: [{ name: "input", type: llvm.i64 }], returns: llvm.i64 }, (fn) => {
      const input = fn.parameter(0, llvm.i64);
      const first = fn.openBlock("first");
      const second = fn.openBlock("second");
      // Neither a parameter nor a literal is an SSA name with a single defining instruction, so both
      // are readable wherever the name is visible — including from a sibling, and across two blocks
      // that were never related by a value at all.
      first.br(second.label);
      second.ret(second.add(input, second.int(llvm.i64, 10n), "shifted"));
    });
    expect(module.render().text).toContain("ret i64 %shifted");
  });

  test("still refuses a cross-block value that no definition dominates", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    expect(() => module.defineFunction({ name: "nonDominating", parameters: [], returns: llvm.i64 }, (fn) => {
      const entry = fn.openBlock("entry");
      const left = fn.openBlock("left");
      const right = fn.openBlock("right");
      const join = fn.openBlock("join");
      entry.condBr(entry.icmp("eq", entry.int(llvm.i64, 1n), entry.int(llvm.i64, 1n), "flag"), left.label, right.label);
      const onlyOnTheLeft = left.add(left.int(llvm.i64, 1n), left.int(llvm.i64, 1n), "left.only");
      const joinLabel = join.label;
      left.br(joinLabel);
      right.br(joinLabel);
      join.ret(onlyOnTheLeft);
    })).toThrow("is defined in left, which does not dominate its use in join");
  });

  test("seals every block at finish, so no handle outlives it", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    const retained: LlvmBlockBuilder[] = [];
    module.defineFunction({ name: "sealed", parameters: [], returns: llvm.void }, (fn) => {
      const entry = fn.openBlock("entry");
      const tail = fn.openBlock("tail");
      retained.push(entry, tail);
      entry.br(tail.label);
      tail.ret();
    });
    for (const block of retained) {
      expect(() => block.ret()).toThrow("escaped its scope");
      expect(() => block.int(llvm.i64, 0n)).toThrow("escaped its scope");
    }
  });

  test("reports the block that never terminated, and refuses a branch to a block never opened", () => {
    const unterminated = createLlvmModule({ staticRuntime: [] });
    const retained: LlvmBlockBuilder[] = [];
    expect(() => unterminated.defineFunction({ name: "unterminated", parameters: [], returns: llvm.void }, (fn) => {
      const entry = fn.openBlock("entry");
      const tail = fn.openBlock("tail");
      retained.push(entry, tail);
      entry.br(tail.label);
      // `tail` is left open: `finish` is the first point at which that is decidable.
    })).toThrow("LLVM block tail is missing a terminator");
    // The failure must not leave `tail` — or any block after it — still accepting instructions.
    for (const block of retained) {
      expect(() => block.ret()).toThrow("escaped its scope");
    }

    const unknownTarget = createLlvmModule({ staticRuntime: [] });
    expect(() => unknownTarget.defineFunction({ name: "unknownTarget", parameters: [], returns: llvm.void }, (fn) => {
      const entry = fn.openBlock("entry");
      // `br` is itself the terminator, so the target is checked against the blocks this function
      // eventually owns — which is only known once `finish` has sealed them all.
      entry.br(fn.label("neverOpened"));
    })).toThrow("unknown block neverOpened");
  });
});

describe("LLVM finished IR", () => {
  test("exposes module, functions, blocks and instructions as data before any text exists", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    module.declareFunction({ name: "external", parameters: [{ name: "p", type: llvm.ptr }], returns: llvm.void });
    module.defineType("shape", [llvm.i64, llvm.double]);
    const string = module.stringConstant("data");
    module.defineFunction({ name: "body", parameters: [], returns: llvm.i64 }, (fn) => {
      const second = fn.label("second");
      fn.block("entry", (block) => {
        block.br(second);
      });
      fn.block("second", (block) => {
        block.withTrace("t:op", () => {
          block.store(block.int(llvm.i64, 1n), block.alloca(llvm.i64, "slot"));
        });
        block.ret(block.int(llvm.i64, 0n));
      });
    });

    const built = module.build();
    expect(Object.isFrozen(built)).toBe(true);
    expect(built.types.map((definition) => definition.name)).toEqual(["shape"]);
    expect(built.globals.map((global) => global.kind === "definition" ? global.spec.name : global.name)).toEqual([string.name]);
    expect(built.declarations.map((declaration) => declaration.name)).toEqual(["external"]);
    expect(built.staticRuntime).toEqual([]);

    expect(built.functions).toHaveLength(1);
    const [typed] = built.functions;
    const typedFunction: BuiltLlvmFunction = typed;
    expect(typedFunction.spec.name).toBe("body");
    const [entryBlock, secondBlock] = typedFunction.blocks;
    expect(typedFunction.blocks.map(({ label }) => label.name)).toEqual(["entry", "second"]);
    expect(typedFunction.entry).toBe(entryBlock);
    expect(secondBlock.instructions.map((instruction) => instruction.kind)).toEqual(["alloca", "store", "return"]);
    expect(secondBlock.instructions[1].provenance.traceIds).toEqual(["t:op"]);
    expect(entryBlock.instructions[0].provenance.traceIds).toEqual([]);
    expect(Object.isFrozen(secondBlock.instructions)).toBe(true);

    // Rendering is a separate step over the same data, and the marker comments are derived from the
    // trace ids recorded on the instructions rather than from anything the builder emitted as text.
    const rendered = module.render();
    expect(rendered.text).toContain("; tscn-trace-start t:op");
    expect(rendered.text).toContain("; tscn-trace-end t:op");
    expect(rendered.traceRanges.get("t:op")).toEqual([{ startLine: 9, endLine: 10 }]);
  });

  test("keeps static runtime fragments beside typed items", () => {
    const module = createLlvmModule({ staticRuntime: [{ origin: "test", text: "; static runtime\n" }] });
    module.defineFunction({ name: "typed", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => block.ret());
    });
    const built: BuiltLlvmModule = module.build();
    expect(built.staticRuntime.map((fragment) => fragment.origin)).toEqual(["test"]);
    expect(module.render().text).toBe("; static runtime\ndefine void @typed() {\nentry:\n  ret void\n}\n");
  });
});

describe("LLVM global initializers", () => {
  test("refuses an initializer whose type is not the global's type", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    expect(() => module.defineGlobal({
      name: "address",
      type: llvm.double,
      linkage: "private",
      constant: true,
      unnamedAddress: false,
      initializer: { kind: "null", type: llvm.ptr }
    })).toThrow("LLVM global address is an double but is initialized with an address");

    expect(() => module.defineGlobal({
      name: "voidGlobal",
      type: llvm.void,
      linkage: "private",
      constant: true,
      unnamedAddress: false,
      initializer: { kind: "undef", type: llvm.void }
    })).toThrow("is not a value type");
  });

  test("refuses an integer literal that does not fit the global's width", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    expect(() => module.defineGlobal({
      name: "wide",
      type: llvm.i8,
      linkage: "private",
      constant: true,
      unnamedAddress: false,
      initializer: { kind: "integer", type: llvm.i8, value: 256n }
    })).toThrow("LLVM global wide is an i8 but is initialized with 256");
  });

  test("refuses an aggregate with the wrong shape or the wrong element types", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    const table = llvm.array(llvm.double, 2);
    expect(() => module.defineGlobal({
      name: "short",
      type: table,
      linkage: "private",
      constant: true,
      unnamedAddress: false,
      initializer: { kind: "aggregate", type: table, elements: [{ kind: "float", type: llvm.double, value: 1.5 }] }
    })).toThrow("LLVM global short is an [2 x double] but is initialized with 1 element(s)");

    const pair = llvm.struct([llvm.i64, llvm.i1]);
    expect(() => module.defineGlobal({
      name: "mismatched",
      type: pair,
      linkage: "private",
      constant: true,
      unnamedAddress: false,
      initializer: {
        kind: "aggregate",
        type: pair,
        elements: [
          { kind: "integer", type: llvm.i64, value: 1n },
          { kind: "integer", type: llvm.i64, value: 2n }
        ]
      }
    })).toThrow("LLVM global mismatched element 1 is an i1 but is initialized with an integer of type i64");
  });

  test("refuses a byte string that does not match the array it fills", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    expect(() => module.defineGlobal({
      name: "words",
      type: llvm.array(llvm.i8, 8),
      linkage: "internal",
      constant: true,
      unnamedAddress: false,
      initializer: { kind: "byteString", length: 4, content: String.raw`ab\00\00` }
    })).toThrow("LLVM global words is an [8 x i8] but is initialized with a 4-byte string");
  });

  test("refuses an initializer that names a global the module never declared", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    module.defineGlobal({
      name: "alias",
      type: llvm.ptr,
      linkage: "private",
      constant: true,
      unnamedAddress: false,
      initializer: { kind: "globalReference", type: llvm.ptr, name: "missing" }
    });
    expect(() => module.build()).toThrow("LLVM global alias initializes from undeclared global missing");
  });

  test("accepts a well-formed aggregate and renders it", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    const table = llvm.array(llvm.double, 2);
    module.defineGlobal({
      name: "table",
      type: table,
      linkage: "external",
      constant: false,
      unnamedAddress: false,
      initializer: {
        kind: "aggregate",
        type: table,
        elements: [
          { kind: "float", type: llvm.double, value: 1.5 },
          { kind: "float", type: llvm.double, value: 2 }
        ]
      }
    });
    expect(module.render().text).toContain("@table = global [2 x double] [double 1.5, double 2.0]");
  });
});
