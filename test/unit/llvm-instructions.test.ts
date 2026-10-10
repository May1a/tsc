import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  type FunctionBuilder,
  type LlvmBlockBuilder,
  type LlvmBlockLabel,
  type LlvmFunctionSpec,
  type LlvmInstruction,
  type LlvmValue,
  createLlvmModule,
  isCastAllowed,
  llvm,
  renderLlvmInstruction,
  renderLlvmType,
  sameLlvmType
} from "../../src/compiler/llvm-ir/index.js";

/**
 * The instruction layer, exercised through its public surface.
 *
 * Two different things are checked here. The rendering tests pin the exact text of every instruction
 * form, because a wrong opcode or a missing type prefix produces a module `llvm-as` rejects and a
 * debugging session would otherwise be where it is found. The rejection tests pin the guarantees: a
 * mismatched operand, a value owned by another function, a branch to a block that does not exist, and
 * a `phi` reading from something that is not one of its predecessors are all errors here rather than
 * malformed IR. Dominance — the rule that decides which sibling block's values a block may read — has
 * its own file in `llvm-control-flow.test.ts`.
 */

/** Builds a one-block void function and returns the whole rendered module. */
function body(build: (block: LlvmBlockBuilder) => void): string {
  const module = createLlvmModule({ staticRuntime: [] });
  module.defineFunction({ name: "body", parameters: [], returns: llvm.void }, (fn) => {
    fn.block("entry", build);
  });
  return module.render().text;
}

/**
 * The same, for the cases that need to name a block the one-block function has not built.
 *
 * Branch targets and `phi` incomings are owned block handles, so a test that wants to point at a block
 * it never builds has to mint the label from the function builder.
 */
function labelledBody(build: (fn: FunctionBuilder, block: LlvmBlockBuilder) => void): string {
  const module = createLlvmModule({ staticRuntime: [] });
  module.defineFunction({ name: "body", parameters: [], returns: llvm.void }, (fn) => {
    fn.block("entry", (block) => {
      build(fn, block);
    });
  });
  return module.render().text;
}

const integerOpcodes = ["add", "sub", "mul", "sdiv", "udiv", "srem", "urem", "and", "or", "xor", "shl", "lshr", "ashr"] as const;

describe("LLVM instruction rendering", () => {
  test("renders every integer binary opcode from one typed operand pair", () => {
    const emitted = body((block) => {
      const left = block.int(llvm.i64, 3n);
      const right = block.int(llvm.i64, 4n);
      block.add(left, right, "add");
      block.subtract(left, right, "sub");
      block.multiply(left, right, "mul");
      block.divideSigned(left, right, "sdiv");
      block.divideUnsigned(left, right, "udiv");
      block.remainderSigned(left, right, "srem");
      block.remainderUnsigned(left, right, "urem");
      block.and(left, right, "and");
      block.or(left, right, "or");
      block.xor(left, right, "xor");
      block.shiftLeft(left, right, "shl");
      block.shiftRightLogical(left, right, "lshr");
      block.shiftRightArithmetic(left, right, "ashr");
      block.ret();
    });

    for (const opcode of integerOpcodes) {
      expect(emitted, opcode).toContain(`%${opcode} = ${opcode} i64 3, 4`);
    }
  });

  test("renders floating point arithmetic, negation, and comparison", () => {
    const emitted = body((block) => {
      const left = block.double(1.5);
      const right = block.double(2.25);
      block.fadd(left, right, "sum");
      block.fsub(left, right, "difference");
      block.fmul(left, right, "product");
      block.fdiv(left, right, "quotient");
      block.frem(left, right, "remainder");
      block.fneg(left, "negated");
      block.fcmp("oeq", left, right, "same");
      block.fcmp("uno", left, right, "nan");
      block.icmp("slt", block.int(llvm.i64, 1n), block.int(llvm.i64, 2n), "ordered");
      block.unreachable();
    });

    expect(emitted).toContain("%sum = fadd double 1.5, 2.25");
    expect(emitted).toContain("%difference = fsub double 1.5, 2.25");
    expect(emitted).toContain("%product = fmul double 1.5, 2.25");
    expect(emitted).toContain("%quotient = fdiv double 1.5, 2.25");
    expect(emitted).toContain("%remainder = frem double 1.5, 2.25");
    expect(emitted).toContain("%negated = fneg double 1.5");
    expect(emitted).toContain("%same = fcmp oeq double 1.5, 2.25");
    expect(emitted).toContain("%nan = fcmp uno double 1.5, 2.25");
    expect(emitted).toContain("%ordered = icmp slt i64 1, 2");
  });

  test("renders a double literal the way LLVM's parser accepts it", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    module.defineFunction({ name: "literals", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => {
        const slot = block.alloca(llvm.double, "slot");
        block.store(block.double(3), slot);
        block.store(block.double(0.5), slot);
        // -0 and NaN have no decimal spelling LLVM accepts, and both must survive the round trip.
        block.store(block.double(-0), slot);
        block.store(block.double(Number.NaN), slot);
        block.ret();
      });
    });
    const emitted = module.render().text;
    expect(emitted).toContain("store double 3.0, ptr %slot");
    expect(emitted).toContain("store double 0.5, ptr %slot");
    expect(emitted).toContain("store double 0x8000000000000000, ptr %slot");
    expect(emitted).toContain("store double 0x7FF8000000000000, ptr %slot");
  });

  test("renders each cast opcode with its source and target type", () => {
    const emitted = body((block) => {
      const wide = block.int(llvm.i64, 9n);
      const narrow = block.int(llvm.i32, 2n);
      const asDouble = block.double(1.5);
      block.cast("trunc", wide, llvm.i32, "truncated");
      block.cast("zext", narrow, llvm.i64, "zero");
      block.cast("sext", narrow, llvm.i64, "signed");
      block.cast("fptosi", asDouble, llvm.i32, "from.double");
      block.cast("fptoui", asDouble, llvm.i32, "from.double.unsigned");
      block.cast("sitofp", narrow, llvm.double, "to.double");
      block.cast("uitofp", narrow, llvm.double, "to.double.unsigned");
      block.cast("ptrtoint", block.nullPtr(), llvm.i64, "address");
      block.cast("inttoptr", wide, llvm.ptr, "pointer");
      block.cast("bitcast", asDouble, llvm.i64, "reinterpreted");
      block.ret();
    });

    expect(emitted).toContain("%truncated = trunc i64 9 to i32");
    expect(emitted).toContain("%zero = zext i32 2 to i64");
    expect(emitted).toContain("%signed = sext i32 2 to i64");
    expect(emitted).toContain("%from.double = fptosi double 1.5 to i32");
    expect(emitted).toContain("%from.double.unsigned = fptoui double 1.5 to i32");
    expect(emitted).toContain("%to.double = sitofp i32 2 to double");
    expect(emitted).toContain("%to.double.unsigned = uitofp i32 2 to double");
    expect(emitted).toContain("%address = ptrtoint ptr null to i64");
    expect(emitted).toContain("%pointer = inttoptr i64 9 to ptr");
    expect(emitted).toContain("%reinterpreted = bitcast double 1.5 to i64");
  });

  test("decides cast legality from the pair of types rather than the opcode alone", () => {
    expect(isCastAllowed("zext", llvm.i32, llvm.i64)).toBe(true);
    expect(isCastAllowed("zext", llvm.i64, llvm.i32)).toBe(false);
    expect(isCastAllowed("trunc", llvm.i64, llvm.i32)).toBe(true);
    expect(isCastAllowed("trunc", llvm.i32, llvm.i64)).toBe(false);
    expect(isCastAllowed("sitofp", llvm.ptr, llvm.double)).toBe(false);
    expect(isCastAllowed("inttoptr", llvm.double, llvm.ptr)).toBe(false);
    expect(isCastAllowed("bitcast", llvm.i64, llvm.double)).toBe(true);
    expect(isCastAllowed("bitcast", llvm.i32, llvm.i64)).toBe(false);
    expect(isCastAllowed("bitcast", llvm.struct([llvm.i64]), llvm.i64)).toBe(false);
  });

  test("renders allocation, access, and both shapes of getelementptr", () => {
    const pair = llvm.struct([llvm.i64, llvm.i1]);
    const emitted = (() => {
      const module = createLlvmModule({ staticRuntime: [] });
      module.defineFunction({ name: "memory", parameters: [{ name: "pointer", type: llvm.ptr }], returns: llvm.void }, (fn) => {
        const pointer = fn.parameter(0, llvm.ptr);
        fn.block("entry", (block) => {
          const slot = block.alloca(llvm.i64, "slot");
          const buffer = block.allocaArray(llvm.i8, block.int(llvm.i64, 4n), "buffer");
          const loaded = block.load(llvm.i64, slot, "loaded");
          block.store(loaded, slot);
          block.store(block.double(1.5), buffer);
          block.gepBytes(pointer, block.int(llvm.i64, 16n), "byte");
          block.getElementPtr(pair, pointer, [{ type: llvm.i32, value: 0n }, { type: llvm.i32, value: 1n }], "field");
          block.getElementPtr(llvm.i64, pointer, [{ type: llvm.i64, value: block.int(llvm.i64, 2n) }], "element");
          block.ret();
        });
      });
      return module.render().text;
    })();

    expect(emitted).toContain("%slot = alloca i64");
    expect(emitted).toContain("%buffer = alloca i8, i64 4");
    expect(emitted).toContain("%loaded = load i64, ptr %slot");
    expect(emitted).toContain("store i64 %loaded, ptr %slot");
    expect(emitted).toContain("store double 1.5, ptr %buffer");
    expect(emitted).toContain("%byte = getelementptr i8, ptr %pointer, i64 16");
    expect(emitted).toContain("%field = getelementptr { i64, i1 }, ptr %pointer, i32 0, i32 1");
    expect(emitted).toContain("%element = getelementptr i64, ptr %pointer, i64 2");
  });

  test("renders aggregate construction and extraction against an identified type", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    const shape = module.defineType("shape", [llvm.i64, llvm.double]);
    module.defineFunction({ name: "shape", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => {
        const slot = block.alloca(shape.type, "slot");
        const initial = block.load(shape.type, slot, "initial");
        const withValue = block.insertValue(initial, block.int(llvm.i64, 7n), 0, "with.value");
        const withNumber = block.insertValue(withValue, block.double(2.5), 1, "with.number");
        block.store(withNumber, slot);
        block.extractValue(withNumber, 1, "number");
        block.ret();
      });
    });

    const emitted = module.render().text;
    expect(emitted).toContain("%shape = type { i64, double }");
    expect(emitted).toContain("%slot = alloca %shape");
    expect(emitted).toContain("%with.value = insertvalue %shape %initial, i64 7, 0");
    expect(emitted).toContain("%with.number = insertvalue %shape %with.value, double 2.5, 1");
    expect(emitted).toContain("%number = extractvalue %shape %with.number, 1");
  });

  test("renders direct, variadic, and indirect calls with their argument types", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    const printf = module.declareFunction({
      name: "printf",
      parameters: [{ name: "format", type: llvm.ptr }],
      returns: llvm.i32,
      variadic: true
    });
    const malloc = module.declareFunction({ name: "malloc", parameters: [{ name: "size", type: llvm.i64 }], returns: llvm.ptr });
    const format = module.stringConstant("%f\n");
    module.defineFunction({ name: "caller", parameters: [{ name: "callback", type: llvm.ptr }], returns: llvm.void }, (fn) => {
      const callback = fn.parameter(0, llvm.ptr);
      fn.block("entry", (block) => {
        block.call(malloc, [block.int(llvm.i64, 128n)], "buffer");
        block.call(printf, [block.globalPointer(format), block.double(1.5)], "printed");
        block.callIndirect(callback, { returns: llvm.i64, parameterTypes: [llvm.i64], variadic: false }, [block.int(llvm.i64, 1n)], "invoked");
        block.ret();
      });
    });

    const emitted = module.render().text;
    expect(emitted).toContain("declare i32 @printf(ptr, ...)");
    expect(emitted).toContain("declare ptr @malloc(i64)");
    expect(emitted).toContain("%buffer = call ptr @malloc(i64 128)");
    expect(emitted).toContain("%printed = call i32 (ptr, ...) @printf(ptr @.str.0, double 1.5)");
    expect(emitted).toContain("%invoked = call i64 %callback(i64 1)");
  });

  test("checks a call's arguments against the declared parameters, position by position", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    // `as const` keeps the parameter list a tuple, which is what lets `call` require one correctly
    // typed argument per declared position rather than a `readonly LlvmValue[]`.
    const two = module.declareFunction({
      name: "two",
      parameters: [{ name: "count", type: llvm.i64 }, { name: "target", type: llvm.ptr }],
      returns: llvm.i64
    } as const);
    const printer = module.declareFunction({
      name: "printer",
      parameters: [{ name: "format", type: llvm.ptr }],
      returns: llvm.void,
      variadic: true
    } as const);

    module.defineFunction({ name: "caller", parameters: [], returns: llvm.i64 }, (fn) => {
      fn.block("entry", (block) => {
        block.call(two, [block.int(llvm.i64, 1n), block.nullPtr()], "both");
        // A variadic callee keeps its fixed positions and admits typed extras after them.
        block.call(printer, [block.nullPtr(), block.double(1.5), block.int(llvm.i64, 2n)]);
        block.ret(block.int(llvm.i64, 0n));
      });
    });
    expect(module.render().text).toContain("%both = call i64 @two(i64 1, ptr null)");
  });

  test("rejects a call whose arguments disagree with the declared parameters", () => {
    // These bodies exist to be compile errors, so they are declared and never invoked: running one
    // would trip the runtime check instead of proving the static one. Each `@ts-expect-error` fails
    // the typecheck if the call beneath it turns out to typecheck, which is the whole assertion.
    const module = createLlvmModule({ staticRuntime: [] });
    const two = module.declareFunction({
      name: "two",
      parameters: [{ name: "count", type: llvm.i64 }, { name: "target", type: llvm.ptr }],
      returns: llvm.i64
    } as const);

    const tooFew = (block: LlvmBlockBuilder): void => {
      // @ts-expect-error: TS2559 - deliberate: `two` declares two parameters and this passes one, so the static arity check rejects it. Never invoked, so the runtime check never runs.
      block.call(two, [block.int(llvm.i64, 1n)], "tooFew");
    };
    const wrongType = (block: LlvmBlockBuilder): void => {
      // @ts-expect-error: TS2345 - deliberate: position 0 of `two` is an i64 and this passes a ptr, so the static type check rejects it. Never invoked, so the runtime check never runs.
      block.call(two, [block.nullPtr(), block.nullPtr()], "wrongType");
    };
    const tooMany = (block: LlvmBlockBuilder): void => {
      // @ts-expect-error: TS2559 - deliberate: `two` is not variadic, so a third argument is rejected statically. Never invoked, so the runtime check never runs.
      block.call(two, [block.int(llvm.i64, 1n), block.nullPtr(), block.nullPtr()], "tooMany");
    };

    expect([tooFew, wrongType, tooMany].every((rejected) => typeof rejected === "function")).toBe(true);
    expect(module.render().text).toContain("declare i64 @two(i64, ptr)");
  });

  test("falls back to the runtime check for a spec whose parameter length is not a tuple", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    // A spec typed as the widened `LlvmFunctionSpec` has no statically known parameter count, so its
    // argument list is `readonly LlvmValue[]` and the arity and type checks are the dynamic ones.
    const widened: LlvmFunctionSpec = { name: "widened", parameters: [{ name: "target", type: llvm.ptr }], returns: llvm.void };
    module.declareFunction(widened);
    module.defineFunction({ name: "caller", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => {
        block.call(widened, [block.nullPtr()]);
        block.ret();
      });
    });
    expect(module.render().text).toContain("call void @widened(ptr null)");

    // With no statically known arity, a wrong argument type is caught by `#assertCallArguments`
    // rather than by the compiler — the dynamic check the widened form relies on.
    const wrong = createLlvmModule({ staticRuntime: [] });
    const alsoWidened = wrong.declareFunction({ name: "alsoWidened", parameters: [{ name: "target", type: llvm.ptr }], returns: llvm.void });
    expect(() => wrong.defineFunction({ name: "caller", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => {
        block.call(alsoWidened, [block.int(llvm.i64, 1n)]);
        block.ret();
      });
    })).toThrow("incompatible LLVM value 1: expected ptr");
  });

  test("renders a void call without an assignment", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    const puts = module.declareFunction({ name: "puts", parameters: [{ name: "text", type: llvm.ptr }], returns: llvm.void });
    module.defineFunction({ name: "printer", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => {
        expect(block.call(puts, [block.nullPtr()])).toBeUndefined();
        block.ret();
      });
    });
    expect(module.render().text).toContain("  call void @puts(ptr null)");
  });

  test("renders a phi across a back edge, a switch, and select", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    module.defineFunction({ name: "control", parameters: [{ name: "start", type: llvm.i64 }], returns: llvm.i64 }, (fn) => {
      const start = fn.parameter(0, llvm.i64);
      const loop = fn.label("loop");
      const done = fn.label("done");
      const entry = fn.label("entry");
      fn.block("entry", (block) => {
        block.br(loop);
      });
      fn.block("loop", (block) => {
        const total = block.phi(llvm.i64, [
          { value: start, block: entry },
          { value: block.int(llvm.i64, 0n), block: loop }
        ], "total");
        const next = block.add(total, block.int(llvm.i64, 1n), "next");
        block.switchInstruction(next, [
          { value: 1n, target: done },
          { value: 2n, target: done }
        ], loop);
      });
      fn.block("done", (block) => {
        block.ret(block.select(block.icmp("eq", start, block.int(llvm.i64, 0n), "zero"), start, block.int(llvm.i64, 7n), "chosen"));
      });
    });

    const emitted = module.render().text;
    expect(emitted).toContain("%total = phi i64 [ %start, %entry ], [ 0, %loop ]");
    expect(emitted).toContain("switch i64 %next, label %loop [");
    expect(emitted).toContain("    i64 1, label %done");
    expect(emitted).toContain("    i64 2, label %done");
    expect(emitted).toContain("%chosen = select i1 %zero, i64 %start, i64 7");
  });

  test("renders a switch with no cases as the default edge rather than an empty case list", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    module.defineFunction({ name: "fallback", parameters: [{ name: "value", type: llvm.i64 }], returns: llvm.void }, (fn) => {
      const value = fn.parameter(0, llvm.i64);
      const target = fn.label("target");
      fn.block("entry", (block) => {
        block.switchInstruction(value, [], target);
      });
      fn.block("target", (block) => block.ret());
    });
    expect(module.render().text).toContain("  br label %target");
  });

  test("lets a label handle name a forward block from a terminator", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    module.defineFunction({ name: "forward", parameters: [{ name: "flag", type: llvm.i1 }], returns: llvm.void }, (fn) => {
      const flag = fn.parameter(0, llvm.i1);
      const chosen: LlvmBlockLabel = fn.label("chosen");
      const other: LlvmBlockLabel = fn.label("other");
      fn.block("entry", (block) => {
        block.condBr(flag, chosen, other);
      });
      fn.block("chosen", (block) => block.ret());
      fn.block("other", (block) => block.ret());
    });
    expect(module.render().text).toContain("br i1 %flag, label %chosen, label %other");
  });

  test("renders a member of the instruction union directly, with no builder in the way", () => {
    // The renderer is a total function over the union, so it is reachable without a builder. That is
    // the property the renderer case exists for: it takes a value of the union and nothing else.
    const instruction: LlvmInstruction = { kind: "unreachable", provenance: { origin: "test", traceIds: [] } };
    expect(renderLlvmInstruction(instruction)).toEqual(["unreachable"]);
  });

  test("renders array and named struct types structurally", () => {
    expect(renderLlvmType(llvm.array(llvm.double, 4))).toBe("[4 x double]");
    expect(renderLlvmType(llvm.namedStruct("pair", [llvm.i64, llvm.i1]))).toBe("%pair");
    expect(sameLlvmType(llvm.array(llvm.double, 4), llvm.array(llvm.double, 4))).toBe(true);
    expect(sameLlvmType(llvm.array(llvm.double, 4), llvm.array(llvm.double, 5))).toBe(false);
    expect(sameLlvmType(llvm.namedStruct("a", [llvm.i64]), llvm.struct([llvm.i64]))).toBe(false);
    expect(sameLlvmType(llvm.namedStruct("a", [llvm.i64]), llvm.namedStruct("a", [llvm.i64]))).toBe(true);
    expect(sameLlvmType(llvm.namedStruct("a", [llvm.i64]), llvm.namedStruct("b", [llvm.i64]))).toBe(false);
    // A zero-length array is `[0 x i8]`, which is how an empty byte string is spelled.
    expect(renderLlvmType(llvm.array(llvm.i8, 0))).toBe("[0 x i8]");
    expect(() => llvm.array(llvm.i8, -1)).toThrow("non-negative integer");
    // oxlint-disable-next-line no-magic-numbers -- non-integer length
    expect(() => llvm.array(llvm.i8, 1.5)).toThrow("non-negative integer");
    expect(() => llvm.namedStruct("9bad", [llvm.i64])).toThrow("invalid LLVM type name");
  });

  test("renders globals, interned string constants, and definitions above every body", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    const format = module.stringConstant("hello \"world\"\n");
    const sameText = module.stringConstant("hello \"world\"\n");
    module.declareGlobal("stdout", llvm.ptr);
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
    module.defineFunction({ name: "reads", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => {
        block.store(block.double(1.5), block.globalPointer(format));
        block.ret();
      });
    });

    const emitted = module.render().text;
    expect(format.name).toBe(sameText.name);
    expect(emitted).toContain("@stdout = external global ptr");
    expect(emitted).toContain(String.raw`@.str.0 = private unnamed_addr constant [15 x i8] c"hello \22world\22\0A\00"`);
    expect(emitted).toContain("@table = global [2 x double] [double 1.5, double 2.0]");
    expect(emitted.indexOf("@table", 0)).toBeLessThan(emitted.indexOf("define void @reads"));
  });
});

/**
 * The whole instruction surface in one module, assembled by a real LLVM parser.
 *
 * A `toContain` assertion pins the spelling this layer intends to produce; it cannot tell whether
 * that spelling is one LLVM accepts. Two of the checks above — the `phi` label and the comma before
 * an `alloca` element count — look right as strings and are rejected by the parser, so this test
 * exists to keep that class of mistake from coming back. It skips when there is no `clang` on the
 * path rather than failing, because the unit suite must stay runnable without a toolchain.
 */
function assembleWithClang(text: string): { readonly status: number | null; readonly diagnostics: string } {
  const directory = mkdtempSync(path.join(tmpdir(), "tscn-llvm-ir-"));
  const source = path.join(directory, "module.ll");
  writeFileSync(source, text);
  try {
    const result = spawnSync("clang", ["-x", "ir", source, "-c", "-o", path.join(directory, "module.o")], { encoding: "utf8" });
    return { status: result.status, diagnostics: result.error === undefined ? result.stderr : result.error.message };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("LLVM instruction assembly", () => {
  test("assembles a module that uses every instruction form", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    declareAssemblySurface(module);
    defineArithmeticFunction(module);
    defineMemoryFunction(module);
    defineControlFlowFunction(module);

    const { status, diagnostics } = assembleWithClang(module.render().text);
    if (status === null && diagnostics.includes("ENOENT")) {
      return;
    }
    // clang warns about the target triple on an IR-only compile; only the exit status is the verdict.
    expect(status, `${module.render().text}\n${diagnostics}`).toBe(0);
  });
});

/** Declarations, an identified type, two globals, and an interned string: the module-scope half. */
function declareAssemblySurface(module: ReturnType<typeof createLlvmModule>): void {
  module.declareFunction({
    name: "printf",
    parameters: [{ name: "format", type: llvm.ptr }],
    returns: llvm.i32,
    variadic: true
  });
  module.declareFunction({ name: "malloc", parameters: [{ name: "size", type: llvm.i64 }], returns: llvm.ptr });
  module.stringConstant("%f %p\n");
  module.defineType("shape", [llvm.i64, llvm.double]);
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
  module.defineGlobal({
    name: "words",
    type: llvm.array(llvm.i8, 4),
    linkage: "internal",
    constant: true,
    unnamedAddress: true,
    initializer: { kind: "byteString", length: 4, content: String.raw`ab\00\00` }
  });
}

function defineArithmeticFunction(module: ReturnType<typeof createLlvmModule>): void {
  const printf = module.declareFunction({
    name: "printf",
    parameters: [{ name: "format", type: llvm.ptr }],
    returns: llvm.i32,
    variadic: true
  });
  const format = module.stringConstant("%f %p\n");
  module.defineFunction(
    { name: "arithmetic", parameters: [{ name: "seed", type: llvm.i64 }, { name: "fp", type: llvm.double }], returns: llvm.void },
    (fn) => {
      const seed = fn.parameter(0, llvm.i64);
      const fp = fn.parameter(1, llvm.double);
      fn.block("entry", (block) => {
        const wide = block.add(seed, block.int(llvm.i64, 1n), "wide");
        const again = block.cast("zext", block.cast("trunc", wide, llvm.i32, "narrow"), llvm.i64, "again");
        const anded = block.and(again, block.int(llvm.i64, 255n), "anded");
        const ored = block.or(anded, block.int(llvm.i64, 2n), "ored");
        const exored = block.xor(ored, block.int(llvm.i64, 3n), "exored");
        const shifted = block.shiftLeft(exored, block.int(llvm.i64, 2n), "shifted");
        const logical = block.shiftRightLogical(shifted, block.int(llvm.i64, 1n), "logical");
        const arithmetic = block.shiftRightArithmetic(logical, block.int(llvm.i64, 1n), "arithmetic");
        const product = block.multiply(arithmetic, block.int(llvm.i64, 7n), "product");
        const signed = block.divideSigned(product, block.int(llvm.i64, 3n), "signed");
        const unsigned = block.divideUnsigned(signed, block.int(llvm.i64, 5n), "unsigned");
        const remainder = block.remainderSigned(unsigned, block.int(llvm.i64, 4n), "remainder");
        block.remainderUnsigned(remainder, block.int(llvm.i64, 2n), "unsigned.remainder");
        const asDouble = block.cast("uitofp", remainder, llvm.double, "as.double");
        block.cast("sitofp", remainder, llvm.double, "as.double.signed");
        const rounded = block.fadd(asDouble, fp, "rounded");
        const subbed = block.fsub(rounded, fp, "subbed");
        const multiplied = block.fmul(subbed, block.double(2), "multiplied");
        const divided = block.fdiv(multiplied, block.double(4), "divided");
        const floatingRemainder = block.frem(divided, block.double(3), "floating.remainder");
        const negated = block.fneg(floatingRemainder, "negated");
        const compared = block.or(
          block.fcmp("oeq", negated, block.double(0), "equal"),
          block.fcmp("uno", negated, block.double(0), "unordered"),
          "compared"
        );
        block.store(compared, block.alloca(llvm.i1, "flag"));
        block.call(printf, [block.globalPointer(format), block.double(2.5)], "printed");
        block.ret();
      });
    }
  );
}

function defineMemoryFunction(module: ReturnType<typeof createLlvmModule>): void {
  const pair = llvm.struct([llvm.i64, llvm.double]);
  const table = llvm.array(llvm.double, 2);
  // The identified type was defined once on the module; a body names it directly rather than
  // re-declaring it, which is exactly the property `defineType` is for.
  const shape = llvm.namedStruct("shape", [llvm.i64, llvm.double]);
  const malloc = module.declareFunction({ name: "malloc", parameters: [{ name: "size", type: llvm.i64 }], returns: llvm.ptr });
  const format = module.stringConstant("%f %p\n");
  module.defineFunction(
    { name: "memory", parameters: [{ name: "callback", type: llvm.ptr }], returns: llvm.void },
    (fn) => {
      const callback = fn.parameter(0, llvm.ptr);
      fn.block("entry", (block) => {
        const slot = block.alloca(llvm.i64, "slot");
        const array = block.allocaArray(llvm.i8, block.int(llvm.i64, 8n), "array");
        const object = block.alloca(shape, "object");
        block.store(block.int(llvm.i64, 1n), slot);
        const loaded = block.load(llvm.i64, slot, "loaded");
        block.store(
          block.select(block.icmp("sgt", loaded, block.int(llvm.i64, 0n), "positive"), loaded, block.int(llvm.i64, 1n), "zeroed"),
          slot
        );
        block.gepBytes(array, block.int(llvm.i64, 4n), "byte");
        block.getElementPtr(table, block.globalPointer(format), [{ type: llvm.i64, value: 0n }, { type: llvm.i64, value: 1n }], "element");
        block.getElementPtr(pair, object, [{ type: llvm.i32, value: 0n }, { type: llvm.i32, value: 1n }], "field");
        const initial = block.undef(pair, "initial");
        block.insertValue(block.insertValue(initial, block.double(1.5), 1, "built"), block.int(llvm.i64, 9n), 0, "final");
        block.extractValue(block.undef(pair, "pair"), 1, "extracted");
        const pointer = block.call(malloc, [block.int(llvm.i64, 64n)], "pointer");
        block.callIndirect(callback, { returns: llvm.i64, parameterTypes: [llvm.i64], variadic: false }, [loaded], "invoked");
        const roundTrip = block.cast("inttoptr", block.cast("ptrtoint", pointer, llvm.i64, "address"), llvm.ptr, "round.trip");
        block.load(llvm.i8, roundTrip, "byte.value");
        block.ret();
      });
    }
  );
}

function defineControlFlowFunction(module: ReturnType<typeof createLlvmModule>): void {
  module.defineFunction({ name: "control", parameters: [{ name: "start", type: llvm.i64 }], returns: llvm.void }, (fn) => {
    const start = fn.parameter(0, llvm.i64);
    const loop = fn.label("loop");
    const done = fn.label("done");
    const entry = fn.label("entry");
    fn.block("entry", (block) => {
      block.br(loop);
    });
    fn.block("loop", (block) => {
      const carried = block.phi(llvm.i64, [
        { value: start, block: entry },
        { value: block.int(llvm.i64, 1n), block: loop }
      ], "carried");
      block.switchInstruction(carried, [{ value: 1n, target: done }, { value: 2n, target: done }], loop);
    });
    fn.block("done", (block) => {
      block.ret();
    });
  });
  module.defineFunction({ name: "abrupt", parameters: [], returns: llvm.void }, (fn) => {
    fn.block("entry", (block) => {
      block.unreachable();
    });
  });
}


describe("LLVM instruction rejection", () => {
  test("refuses an operand whose type does not match the instruction", () => {
    expect(() => body((block) => {
      // @ts-expect-error TS2345 -- deliberate: `add` takes two operands of one integer type, so an i64/i32 pair cannot be spelled at all. The runtime guard below is what an operand whose type came from elsewhere would hit; this pins that the static type really does reject it.
      block.add(block.int(llvm.i64, 1n), block.int(llvm.i32, 2n), "bad");
    })).toThrow("incompatible LLVM value");

    expect(() => body((block) => {
      // @ts-expect-error TS2345 -- deliberate: `select`'s condition is an i1, so an i8 does not bind. The check exists because `LlvmValue<typeof llvm.i8>` and `LlvmValue<LlvmBooleanType>` are structurally comparable integers of different widths, and only the parameter type rejects them.
      block.select(block.int(llvm.i8, 1n), block.int(llvm.i64, 1n), block.int(llvm.i64, 2n), "bad");
    })).toThrow("incompatible LLVM value");

    expect(() => body((block) => {
      // @ts-expect-error TS2345 -- deliberate: the two `icmp` operands share one integer width, and the generic parameter is what ties them together. This pins that a differently-sized operand is a compile error rather than a malformed instruction.
      block.icmp("eq", block.int(llvm.i64, 1n), block.int(llvm.i32, 1n), "bad");
    })).toThrow("incompatible LLVM value");
  });

  test("refuses a cast whose two types cannot be related by that opcode", () => {
    expect(() => body((block) => {
      block.cast("zext", block.int(llvm.i64, 1n), llvm.i32, "bad");
    })).toThrow("invalid LLVM zext from i64 to i32");


    expect(() => body((block) => {
      block.bitcast(block.int(llvm.i32, 1n), llvm.i64, "bad");
    })).toThrow("invalid LLVM bitcast from i32 to i64");
  });

  test("refuses an aggregate operand that is not the element type at that index", () => {
    expect(() => body((block) => {
      const pair = llvm.struct([llvm.i64, llvm.i1]);
      const initial = block.undef(pair, "initial");
      // @ts-expect-error TS2345 -- deliberate: position 0 of { i64, i1 } is i64, so an i32 element cannot be spelled at all. The runtime element guard below is defence in depth behind it.
      block.insertValue(initial, block.int(llvm.i32, 1n), 0, "bad");
    })).toThrow("insertvalue element type i32 does not match struct element i64");

    expect(() => body((block) => {
      const pair = llvm.struct([llvm.i64, llvm.i1]);
      block.extractValue(block.undef(pair, "pair"), 5, "bad");
    })).toThrow("extractvalue index 5 out of bounds for { i64, i1 }");
  });

  test("refuses a call whose arguments do not match the declared signature", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    const takes = module.declareFunction({ name: "takes", parameters: [{ name: "value", type: llvm.i64 }], returns: llvm.void });
    expect(() => module.defineFunction({ name: "wrongType", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => {
        block.call(takes, [block.int(llvm.i32, 1n)]);
        block.ret();
      });
    })).toThrow("incompatible LLVM value");

    expect(() => module.defineFunction({ name: "wrongCount", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => {
        block.call(takes, []);
        block.ret();
      });
    })).toThrow("LLVM call takes 1 argument(s), found 0");
  });

  test("allows extra arguments only to a variadic declaration", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    const fixed = module.declareFunction({ name: "fixed", parameters: [{ name: "value", type: llvm.i64 }], returns: llvm.void });
    const variadic = module.declareFunction({
      name: "variadic",
      parameters: [{ name: "format", type: llvm.ptr }],
      returns: llvm.void,
      variadic: true
    });
    expect(() => module.defineFunction({ name: "tooMany", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => {
        block.call(fixed, [block.int(llvm.i64, 1n), block.int(llvm.i64, 2n)]);
        block.ret();
      });
    })).toThrow("LLVM call takes 1 argument(s), found 2");

    module.defineFunction({ name: "enough", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => {
        block.call(variadic, [block.nullPtr(), block.int(llvm.i64, 1n), block.double(2.5)]);
        block.ret();
      });
    });
    // LLVM requires a call to a variadic function to spell the whole callable type, `void` included.
    expect(module.render().text).toContain("call void (ptr, ...) @variadic(ptr null, i64 1, double 2.5)");
  });

  test("refuses a phi whose incoming value disagrees with the phi's own type", () => {
    expect(() => labelledBody((fn, block) => block.ret(block.phi(llvm.i64, [
      { value: block.double(1.5), block: fn.label("entry") }
    ], "total")))).toThrow("phi incoming value does not match phi type i64");
  });

  test("refuses a return that disagrees with the function's declared return type", () => {
    expect(() => body((block) => block.ret(block.int(llvm.i64, 1n)))).toThrow("void LLVM function cannot return a value");

    const module = createLlvmModule({ staticRuntime: [] });
    expect(() => module.defineFunction({ name: "missing", parameters: [], returns: llvm.i64 }, (fn) => {
      fn.block("entry", (block) => block.ret());
    })).toThrow("non-void LLVM function must return a value");

    expect(() => module.defineFunction({ name: "mismatched", parameters: [], returns: llvm.i64 }, (fn) => {
      fn.block("entry", (block) => block.ret(block.int(llvm.i32, 1n)));
    })).toThrow("incompatible LLVM value");
  });

  test("refuses a branch to a block the function never builds", () => {
    expect(() => labelledBody((fn, block) => block.br(fn.label("absent")))).toThrow("LLVM branch references unknown block absent");
  });

  test("refuses a label no block ever claims", () => {
    expect(() => labelledBody((fn, block) => {
      fn.label("neverBuilt");
      block.ret();
    })).toThrow("LLVM label neverBuilt is never claimed by a block");
  });

  test("refuses a phi reading from a block that is not one of its predecessors", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    expect(() => module.defineFunction({ name: "badPhi", parameters: [], returns: llvm.i64 }, (fn) => {
      fn.block("entry", (block) => {
        block.ret(block.phi(llvm.i64, [{ value: block.int(llvm.i64, 1n), block: fn.label("elsewhere") }], "total"));
      });
      fn.block("elsewhere", (block) => block.ret(block.int(llvm.i64, 2n)));
    })).toThrow("phi in entry reads from elsewhere, which is not one of its predecessors");
  });

  test("refuses instructions after a terminator, and a block with none", () => {
    expect(() => body((block) => {
      block.ret();
      block.store(block.int(llvm.i64, 1n), block.nullPtr());
    })).toThrow("cannot emit LLVM instruction after terminator");

    expect(() => body(() => { /* deliberately leaves the block without a terminator */ })).toThrow("LLVM block entry is missing a terminator");
  });

  test("refuses a value owned by another module", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    const foreign = createLlvmModule({ staticRuntime: [] });
    let external: ReturnType<LlvmBlockBuilder["nullPtr"]> | undefined;
    foreign.defineFunction({ name: "foreign", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => {
        external = block.nullPtr();
        block.ret();
      });
    });
    expect(() => module.defineFunction({ name: "uses", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => {
        if (external === undefined) {
          throw new Error("test setup: the pointer should have been captured");
        }
        block.store(block.int(llvm.i64, 1n), external);
        block.ret();
      });
    })).toThrow("incompatible LLVM value");
  });

  test("refuses a value another function owns, even in the same module", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    let parameter: LlvmValue<typeof llvm.i64> | undefined;
    module.defineFunction({ name: "producer", parameters: [{ name: "input", type: llvm.i64 }], returns: llvm.void }, (fn) => {
      parameter = fn.parameter(0, llvm.i64);
      fn.block("entry", (block) => block.ret());
    });
    expect(() => module.defineFunction({ name: "consumer", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => {
        if (parameter === undefined) {
          throw new Error("test setup: the parameter should have been captured");
        }
        block.store(parameter, block.nullPtr());
        block.ret();
      });
    })).toThrow("incompatible LLVM value");
  });

  test("refuses a literal read from a sibling block only when nothing defines it", () => {
    // A literal is not an SSA name: `int`/`double`/`null`/`undef` are readable wherever the name is
    // visible, including from another block. What a sibling may *not* lend is a computed value, and
    // the rule for that is dominance — see llvm-control-flow.test.ts.
    const module = createLlvmModule({ staticRuntime: [] });
    module.defineFunction({ name: "literals", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => {
        block.br(fn.label("next"));
      });
      fn.block("next", (block) => {
        block.store(block.int(llvm.i64, 1n), block.nullPtr());
        block.ret();
      });
    });
    expect(module.render().text).toContain("store i64 1, ptr null");
  });

  test("refuses a global reference or a callee this module never declared", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    const foreign = createLlvmModule({ staticRuntime: [] });
    const foreignGlobal = foreign.stringConstant("elsewhere");
    expect(() => module.defineFunction({ name: "readsForeign", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => {
        block.store(block.double(1), block.globalPointer(foreignGlobal));
        block.ret();
      });
    })).toThrow("LLVM body references unowned global");

    const unowned: LlvmFunctionSpec = { name: "unowned", parameters: [], returns: llvm.void };
    expect(() => body((block) => {
      block.call(unowned, []);
      block.ret();
    })).toThrow("LLVM call references unowned function unowned");
  });

  test("refuses a duplicate module symbol and a duplicate block name", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    module.defineFunction({ name: "duplicate", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => block.ret());
    });
    expect(() => module.defineFunction({ name: "duplicate", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => block.ret());
    })).toThrow("duplicate LLVM symbol duplicate");

    expect(() => body((block) => {
      block.ret();
      block.ret();
    })).toThrow("cannot emit LLVM instruction after terminator");
  });

  test("refuses a block builder that escaped its scope", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    let escaped: LlvmBlockBuilder | undefined;
    module.defineFunction({ name: "escaped", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => {
        escaped = block;
        block.ret();
      });
    });
    expect(() => escaped?.int(llvm.i64, 0n)).toThrow("escaped its scope");
  });
});
