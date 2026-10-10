import { describe, expect, test } from "vitest";
import { type BuiltLlvmFunction, type LlvmValue, createLlvmModule, llvm } from "../../src/compiler/llvm-ir/index.js";


const input = { name: "input", type: llvm.i64 } as const;

function buildTracedOperation(): BuiltLlvmFunction {
  const module = createLlvmModule({ staticRuntime: [] });
  module.defineFunction({ name: "branching", parameters: [input], returns: llvm.i64 }, (fn) => {
    const argument = fn.parameter(0, llvm.i64);
    const positive = fn.label("positive");
    const negative = fn.label("negative");
    const join = fn.label("join");
    let bumped: LlvmValue<typeof llvm.i64> | undefined;
    let reduced: LlvmValue<typeof llvm.i64> | undefined;
    fn.withTrace("m2:o000000", () => {
      fn.block("entry", (block) => {
        block.condBr(block.icmp("sgt", argument, block.int(llvm.i64, 0n), "isPositive"), positive, negative);
      });
      fn.block("positive", (block) => {
        bumped = block.withTrace("m2:o000001", () => block.add(argument, block.int(llvm.i64, 1n), "bumped"));
        block.br(join);
      });
      fn.block("negative", (block) => {
        reduced = block.subtract(argument, block.int(llvm.i64, 1n), "reduced");
        block.br(join);
      });
      fn.block("join", (block) => {
        if (bumped === undefined || reduced === undefined) {
          throw new Error("test setup: both arms should have produced a value");
        }
        const merged = block.phi(llvm.i64, [
          { value: bumped, block: positive },
          { value: reduced, block: negative }
        ], "merged");
        block.ret(merged);
      });
    });
  });
  // Annotated rather than narrowed: `functions` is a readonly array, so the annotation is how the
  // fixture states that the module holds exactly the one function it just defined.
  const [built]: readonly BuiltLlvmFunction[] = module.build().functions;
  return built;
}

function tracesOf(function_: BuiltLlvmFunction): readonly (readonly (readonly string[])[])[] {
  return function_.blocks.map((block) => block.instructions.map((instruction) => instruction.provenance.traceIds));
}

describe("LLVM trace provenance", () => {
  test("covers the blocks an operation opened after its trace began", () => {
    expect(tracesOf(buildTracedOperation())).toEqual([
      [["m2:o000000"], ["m2:o000000"]],
      [["m2:o000000", "m2:o000001"], ["m2:o000000"]],
      [["m2:o000000"], ["m2:o000000"]],
      [["m2:o000000"], ["m2:o000000"]]
    ]);
  });

  test("closes the operation's region where it closed, and renders one range per block", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    module.defineFunction({ name: "branching", parameters: [input], returns: llvm.i64 }, (fn) => {
      const positive = fn.label("positive");
      const negative = fn.label("negative");
      const join = fn.label("join");
      const argument = fn.parameter(0, llvm.i64);
      fn.withTrace("m3:o000000", () => {
        fn.block("entry", (block) => {
          block.condBr(block.icmp("sgt", argument, block.int(llvm.i64, 0n), "isPositive"), positive, negative);
        });
        fn.block("positive", (block) => block.br(join));
        fn.block("negative", (block) => block.br(join));
        fn.block("join", (block) => block.ret(argument));
      });
    });

    const rendered = module.render();
    expect(rendered.text).toBe(`define i64 @branching(i64 %input) {
entry:
; tscn-trace-start m3:o000000
  %isPositive = icmp sgt i64 %input, 0
  br i1 %isPositive, label %positive, label %negative
; tscn-trace-end m3:o000000
positive:
; tscn-trace-start m3:o000000
  br label %join
; tscn-trace-end m3:o000000
negative:
; tscn-trace-start m3:o000000
  br label %join
; tscn-trace-end m3:o000000
join:
; tscn-trace-start m3:o000000
  ret i64 %input
; tscn-trace-end m3:o000000
}
`);
    // One range per block: the marker lines and the block label between them carry no trace id of their
    // own, so each block's instructions are the contiguous run the debugger highlights.
    expect(rendered.traceRanges.get("m3:o000000")).toEqual([
      { startLine: 4, endLine: 5 },
      { startLine: 9, endLine: 9 },
      { startLine: 13, endLine: 13 },
      { startLine: 17, endLine: 17 }
    ]);
  });

  test("nests a block's helper region inside the operation's, in marker order", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    module.defineFunction({ name: "nested", parameters: [], returns: llvm.i64 }, (fn) => {
      fn.withTrace("m4:outer", () => {
        fn.block("entry", (block) => {
          block.withTrace("m4:inner", () => {
            block.store(block.int(llvm.i64, 1n), block.alloca(llvm.i64, "slot"));
          });
          block.ret(block.int(llvm.i64, 0n));
        });
      });
    });

    expect(module.render().text).toBe(`define i64 @nested() {
entry:
; tscn-trace-start m4:outer
; tscn-trace-start m4:inner
  %slot = alloca i64
  store i64 1, ptr %slot
; tscn-trace-end m4:inner
  ret i64 0
; tscn-trace-end m4:outer
}
`);
  });

  test("refuses the same id at both levels and at one level twice", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    expect(() => module.defineFunction({ name: "crossLevel", parameters: [], returns: llvm.void }, (fn) => {
      fn.withTrace("m5:op", () => {
        fn.block("entry", (block) => {
          block.withTrace("m5:op", () => block.ret());
        });
      });
    })).toThrow("invalid or repeated LLVM trace ID m5:op");

    expect(() => module.defineFunction({ name: "sameLevel", parameters: [], returns: llvm.void }, (fn) => {
      fn.withTrace("m5:op", () => {
        fn.withTrace("m5:op", () => {
          fn.block("entry", (block) => block.ret());
        });
      });
    })).toThrow("invalid or repeated LLVM trace ID m5:op");

    expect(() => module.defineFunction({ name: "blockTwice", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => {
        block.withTrace("m5:op", () => {
          block.withTrace("m5:op", () => block.ret());
        });
      });
    })).toThrow("invalid or repeated LLVM trace ID m5:op");
  });

  test("closes the function's region even when the traced callback throws", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    expect(() => module.defineFunction({ name: "throws", parameters: [], returns: llvm.void }, (fn) => {
      fn.withTrace("m6:op", () => {
        throw new Error("lowering failed");
      });
    })).toThrow("lowering failed");

    // The next function is unaffected, which is what the `finally` is for: a leaked id would make the
    // next operation's own region a repeat.
    module.defineFunction({ name: "afterFailure", parameters: [], returns: llvm.void }, (fn) => {
      fn.withTrace("m6:op", () => {
        fn.block("entry", (block) => block.ret());
      });
    });
    expect(module.render().text).toContain("define void @afterFailure()");
  });

  test("refuses a function trace after the function is sealed", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    let sealed: (() => void) | undefined;
    module.defineFunction({ name: "sealed", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => block.ret());
      sealed = () => {
      fn.withTrace("m7:late", () => {
        throw new Error("the callback must not run");
      });
    };
    });
    expect(sealed).toBeDefined();
    expect(() => sealed?.()).toThrow("escaped its scope");
  });
});