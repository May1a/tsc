import { describe, expect, test } from "vitest";
import { createLlvmModule, llvm } from "../../src/compiler/llvm-ir/index.js";


const ownedGlobal = {
  name: "owned",
  type: llvm.ptr,
  linkage: "external",
  constant: false,
  unnamedAddress: false,
  initializer: { kind: "null", type: llvm.ptr }
} as const;

const addSpec = {
  name: "runtimeAdd",
  parameters: [{ name: "left", type: llvm.i64 }, { name: "right", type: llvm.i64 }],
  returns: llvm.i64
} as const;

const runtimeBody = "define i64 @runtimeAdd(i64 %left, i64 %right) {\nentry:\n  %sum = add i64 %left, %right\n  ret i64 %sum\n}\n";

describe("LLVM static runtime symbols", () => {
  test("records a runtime function without emitting a second declaration for it", () => {
    const module = createLlvmModule({ staticRuntime: [{ origin: "static runtime", text: runtimeBody }] });
    const add = module.registerStaticRuntimeFunction(addSpec);
    module.defineFunction({ name: "caller", parameters: [{ name: "value", type: llvm.i64 }], returns: llvm.i64 }, (fn) => {
      const value = fn.parameter(0, llvm.i64);
      fn.block("entry", (block) => {
        block.ret(block.call(add, [value, block.int(llvm.i64, 1n)], "sum"));
      });
    });

    const { text } = module.render();
    expect(text).not.toContain("declare i64 @runtimeAdd");
    expect(text.match(/define i64 @runtimeAdd/g)).toHaveLength(1);
    expect(text).toContain("%sum = call i64 @runtimeAdd(i64 %value, i64 1)");
  });

  test("returns the spec it registered, so a call site keeps its declared types", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    const registered = module.registerStaticRuntimeFunction(addSpec);
    expect(registered).toBe(addSpec);
    module.defineFunction({ name: "caller", parameters: [], returns: llvm.i64 }, (fn) => {
      fn.block("entry", (block) => {
        // The result binds as `LlvmValue<typeof llvm.i64>` because the registered type survived, which
        // is what lets it be returned from an `i64` function without a cast.
        block.ret(block.call(registered, [block.int(llvm.i64, 1n), block.int(llvm.i64, 2n)], "sum"));
      });
    });
    expect(module.render().text).toContain("ret i64 %sum");
  });

  test("is idempotent for the same spec and refuses a conflicting one", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    module.registerStaticRuntimeFunction(addSpec);
    const equivalent = module.registerStaticRuntimeFunction({ ...addSpec });
    module.defineFunction({ name: "caller", parameters: [], returns: llvm.i64 }, (fn) => {
      fn.block("entry", (block) => {
        block.ret(block.call(equivalent, [block.int(llvm.i64, 2n), block.int(llvm.i64, 3n)], "sum"));
      });
    });
    expect(() => module.registerStaticRuntimeFunction({
      ...addSpec,
      parameters: [{ name: "left", type: llvm.i32 }, { name: "right", type: llvm.i32 }]
    })).toThrow("conflicting static runtime registration for runtimeAdd");
    expect(module.render().text).toContain("call i64 @runtimeAdd(i64 2, i64 3)");
  });

  test("replaces a matching external declaration when the static runtime provides it", () => {
    const module = createLlvmModule({ staticRuntime: [{ origin: "static runtime", text: runtimeBody }] });
    const originallyDeclared = module.declareFunction(addSpec);
    module.registerStaticRuntimeFunction({ ...addSpec });
    module.defineFunction({ name: "caller", parameters: [], returns: llvm.i64 }, (fn) => {
      fn.block("entry", (block) => {
        block.ret(block.call(originallyDeclared, [block.int(llvm.i64, 2n), block.int(llvm.i64, 3n)], "sum"));
      });
    });
    const { text } = module.render();
    expect(text).not.toContain("declare i64 @runtimeAdd");
    expect(text.match(/define i64 @runtimeAdd/g)).toHaveLength(1);
  });

  test("refuses a symbol the module already defined or declared differently", () => {
    const defined = createLlvmModule({ staticRuntime: [] });
    defined.defineFunction({ ...addSpec }, (fn) => {
      fn.block("entry", (block) => block.ret(block.add(fn.parameter(0, llvm.i64), block.int(llvm.i64, 1n), "sum")));
    });
    expect(() => defined.registerStaticRuntimeFunction(addSpec)).toThrow("duplicate LLVM symbol runtimeAdd");

    const declared = createLlvmModule({ staticRuntime: [] });
    declared.declareFunction({ name: "runtimeAdd", parameters: [{ name: "only", type: llvm.ptr }], returns: llvm.void });
    expect(() => declared.registerStaticRuntimeFunction(addSpec)).toThrow("conflicts with its declaration");
  });

  test("refuses a declaration or definition for a name the static runtime owns", () => {
    const declared = createLlvmModule({ staticRuntime: [] });
    declared.registerStaticRuntimeFunction(addSpec);
    expect(() => declared.declareFunction(addSpec)).toThrow("runtimeAdd is already defined by the static runtime");

    const defined = createLlvmModule({ staticRuntime: [] });
    defined.registerStaticRuntimeFunction(addSpec);
    expect(() => defined.defineFunction(addSpec, (fn) => {
      fn.block("entry", (block) => block.ret(block.add(fn.parameter(0, llvm.i64), fn.parameter(1, llvm.i64), "sum")));
    })).toThrow("runtimeAdd is already defined by the static runtime");
  });

  test("gives a static runtime global an addressable reference and emits nothing for it", () => {
    const module = createLlvmModule({ staticRuntime: [{ origin: "static runtime", text: "@.fmt = private unnamed_addr constant [6 x i8] c\"hello\\00\"\n" }] });
    const format = module.registerStaticRuntimeGlobal(".fmt", llvm.array(llvm.i8, 6));
    module.defineFunction({ name: "format", parameters: [], returns: llvm.ptr }, (fn) => {
      fn.block("entry", (block) => block.ret(block.globalPointer(format)));
    });

    const { text } = module.render();
    expect(text).not.toContain("@.fmt = external global");
    expect(text.match(/@\.fmt = /g)).toHaveLength(1);
    expect(text).toContain("ret ptr @.fmt");
  });

  test("accepts a global initializer that names a static runtime global", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    const format = module.registerStaticRuntimeGlobal(".fmt", llvm.array(llvm.i8, 6));
    module.defineGlobal({
      name: "savedFormat",
      type: llvm.ptr,
      linkage: "external",
      constant: false,
      unnamedAddress: false,
      initializer: { kind: "globalReference", type: llvm.ptr, name: format.name }
    });
    expect(module.render().text).toContain("@savedFormat = global ptr @.fmt");
  });

  test("refuses a duplicate static runtime global and a name the module already used", () => {
    const duplicate = createLlvmModule({ staticRuntime: [] });
    duplicate.registerStaticRuntimeGlobal(".fmt", llvm.array(llvm.i8, 6));
    expect(() => duplicate.registerStaticRuntimeGlobal(".fmt", llvm.array(llvm.i8, 6))).toThrow("duplicate static runtime global .fmt");

    const defined = createLlvmModule({ staticRuntime: [] });
    defined.defineGlobal(ownedGlobal);
    expect(() => defined.registerStaticRuntimeGlobal("owned", llvm.ptr)).toThrow("duplicate LLVM symbol owned");
  });
});

describe("LLVM module sealing", () => {
  test.each([
    { sources: ["left"], error: "missing an incoming value from right" },
    { sources: ["left", "left", "right"], error: "too many incoming values from left" }
  ])("validates every phi predecessor edge: $error", ({ sources, error }) => {
    const module = createLlvmModule({ staticRuntime: [] });
    expect(() => module.defineFunction({ name: "diamond", parameters: [], returns: llvm.i64 }, (fn) => {
      const entry = fn.openBlock("entry");
      entry.condBr(entry.int(llvm.i1, 1n), fn.label("left"), fn.label("right"));
      fn.openBlock("left").br(fn.label("join"));
      fn.openBlock("right").br(fn.label("join"));
      const join = fn.openBlock("join");
      const value = join.int(llvm.i64, 1n);
      join.ret(join.phi(llvm.i64, sources.map((source) => ({ block: fn.label(source), value })), "result"));
    })).toThrow(error);
  });

  test.each([false, true])("repeated CFG edges require equal phi values, conflicting=%s", (conflicting) => {
    const module = createLlvmModule({ staticRuntime: [] });
    const define = () => module.defineFunction({ name: "repeated", parameters: [], returns: llvm.i64 }, (fn) => {
      const entry = fn.openBlock("entry");
      entry.condBr(entry.int(llvm.i1, 1n), fn.label("join"), fn.label("join"));
      const join = fn.openBlock("join");
      join.ret(join.phi(llvm.i64, [
        { block: entry.label, value: join.int(llvm.i64, 1n) },
        { block: entry.label, value: join.int(llvm.i64, conflicting ? 2n : 1n) }
      ], "result"));
    });
    if (conflicting) {
      expect(define).toThrow("conflicting incoming values from entry");
    } else {
      define();
      expect(module.render().text).toContain("%result = phi i64 [ 1, %entry ], [ 1, %entry ]");
    }
  });

  test("call arguments preserve named struct identity despite equal element layouts", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    const left = module.defineType("Left", [llvm.i64]).type;
    const right = module.defineType("Right", [llvm.i64]).type;
    const callee = module.declareFunction({ name: "acceptLeft", parameters: [{ name: "value", type: left }], returns: llvm.void });
    expect(() => module.defineFunction({ name: "caller", parameters: [{ name: "value", type: right }], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => {
        block.call(callee, [fn.parameter(0, right)]);
        block.ret();
      });
    })).toThrow("expected %Left");
  });

  test("cannot seal the module from inside an unfinished function callback", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    const spec = module.defineFunction({ name: "pending", parameters: [], returns: llvm.void }, (fn) => {
      expect(() => module.build()).toThrow("cannot seal LLVM module while a function is being built");
      fn.block("entry", (block) => block.ret());
    });
    expect(module.build().functions).toEqual([module.finishedFunction(spec)]);
  });

  test("an unfinished definition already reserves its symbol", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    module.defineFunction({ name: "pending", parameters: [], returns: llvm.void }, (fn) => {
      expect(() => module.defineGlobal({ ...ownedGlobal, name: "pending" })).toThrow("duplicate LLVM symbol pending");
      expect(() => module.defineFunction({ name: "pending", parameters: [], returns: llvm.void }, (nested) => {
        nested.block("entry", (block) => block.ret());
      })).toThrow("duplicate LLVM symbol pending");
      fn.block("entry", (block) => block.ret());
    });
    expect(module.build().functions.map((function_) => function_.spec.name)).toEqual(["pending"]);
  });

  test("external function declarations reserve their symbol against globals", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    module.declareFunction({ name: "external", parameters: [], returns: llvm.void });
    expect(() => module.defineGlobal({ ...ownedGlobal, name: "external" })).toThrow("duplicate LLVM symbol external");
    expect(() => module.declareGlobal("external", llvm.ptr)).toThrow("duplicate LLVM symbol external");
    expect(() => module.registerStaticRuntimeGlobal("external", llvm.ptr)).toThrow("duplicate LLVM symbol external");
  });

  test("reads each finished definition while the module remains open", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    const firstSpec = module.defineFunction({ name: "one", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => block.ret());
    });
    const first = module.finishedFunction(firstSpec);
    expect(first.spec.name).toBe("one");
    expect(first.entry.instructions.map((instruction) => instruction.kind)).toEqual(["return"]);
    expect(Object.isFrozen(first)).toBe(true);
    const secondSpec = module.defineFunction({ name: "two", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => block.ret());
    });
    const second = module.finishedFunction(secondSpec);
    const built = module.build();
    expect(built.functions).toEqual([first, second]);
    expect(built.functions[0]).toBe(first);
    expect(built.functions[1]).toBe(second);
    expect(module.finishedFunction(firstSpec)).toBe(first);
    expect(() => module.declareFunction({ name: "late", parameters: [], returns: llvm.void })).toThrow("sealed by build");
  });

  test("refuses unowned specs and owned symbols without a finished definition", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    const foreign = createLlvmModule({ staticRuntime: [] });
    const foreignSpec = foreign.defineFunction({ name: "foreign", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => block.ret());
    });
    expect(() => module.finishedFunction(foreignSpec)).toThrow("references unowned function foreign");
    expect(() => module.finishedFunction({ name: "missing", parameters: [], returns: llvm.void }))
      .toThrow("references unowned function missing");
    const declared = module.declareFunction({ name: "external", parameters: [], returns: llvm.void });
    expect(() => module.finishedFunction(declared)).toThrow("external has no finished definition");
    const runtime = module.registerStaticRuntimeFunction(addSpec);
    expect(() => module.finishedFunction(runtime)).toThrow("runtimeAdd has no finished definition");
  });

  test("resolves a finished definition through the registered identity even after a spec is renamed", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    const mutable = { name: "original", parameters: [], returns: llvm.void };
    module.defineFunction(mutable, (fn) => {
      fn.block("entry", (block) => block.ret());
    });
    mutable.name = "renamed";
    expect(module.finishedFunction(mutable).spec.name).toBe("original");
  });

  test("caches the snapshot, so a second build is the same module", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    module.defineFunction({ name: "one", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => block.ret());
    });
    const first = module.build();
    expect(module.build()).toBe(first);
    expect(module.render().text).toBe("define void @one() {\nentry:\n  ret void\n}\n");
  });

  test("copies static runtime input before construction can observe later mutations", () => {
    const fragment = { origin: "fixed runtime", text: "; original\n" };
    const fragments = [fragment];
    const module = createLlvmModule({ staticRuntime: fragments });
    fragment.origin = "changed";
    fragment.text = "; changed\n";
    fragments.push({ origin: "late", text: "; late\n" });
    module.defineFunction({ name: "typed", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => block.ret());
    });
    const built = module.build();
    expect(built.staticRuntime).toEqual([{ origin: "fixed runtime", text: "; original\n" }]);
    expect(Object.isFrozen(built.staticRuntime)).toBe(true);
    expect(built.staticRuntime.every(Object.isFrozen)).toBe(true);
    expect(module.render().text).toBe("; original\ndefine void @typed() {\nentry:\n  ret void\n}\n");
  });

  test("static runtime comments cannot assign instruction trace regions", () => {
    const module = createLlvmModule({ staticRuntime: [{ origin: "runtime", text: "; tscn-trace-start runtime\n; ordinary comment\n; tscn-trace-end runtime\n" }] });
    module.defineFunction({ name: "typed", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => block.withTrace("typed", () => block.ret()));
    });
    const rendered = module.render();
    expect(rendered.traceRanges.has("runtime")).toBe(false);
    expect(rendered.traceRanges.get("typed")).toEqual([{ startLine: 7, endLine: 7 }]);
  });

  test("refuses static runtime input with no producer origin", () => {
    expect(() => createLlvmModule({ staticRuntime: [{ origin: "", text: "; unknown\n" }] })).toThrow("requires an origin");
  });

  test("refuses every mutation once built", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    module.defineFunction({ name: "sealed", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => block.ret());
    });
    module.build();

    const sealed = "sealed by build";

    expect(() => module.defineFunction({ name: "later", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => block.ret());
    })).toThrow(sealed);
    expect(() => module.declareFunction({ name: "later", parameters: [], returns: llvm.void })).toThrow(sealed);
    expect(() => module.registerStaticRuntimeFunction({ name: "later", parameters: [], returns: llvm.void })).toThrow(sealed);
    expect(() => module.registerStaticRuntimeGlobal(".later", llvm.ptr)).toThrow(sealed);
    expect(() => module.defineType("later", [llvm.i64])).toThrow(sealed);
    expect(() => module.defineGlobal({ ...ownedGlobal, name: "later" })).toThrow(sealed);
    expect(() => module.declareGlobal("later", llvm.ptr)).toThrow(sealed);
    expect(() => module.stringConstant("later")).toThrow(sealed);
  });

  test("renders the verified snapshot, not whatever the builders hold afterwards", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    module.defineFunction({ name: "verified", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => block.ret());
    });
    const built = module.build();
    const before = module.render();

    expect(() => module.defineFunction({ name: "unverified", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => block.ret());
    })).toThrow("sealed by build");

    expect(module.render().text).toBe(before.text);
    expect(module.render().text).not.toContain("unverified");
    expect(module.build()).toBe(built);
    expect(built.functions.map((function_) => function_.spec.name)).toEqual(["verified"]);
  });

  test("freezes instructions, call payloads and provenance in the verified graph", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    const identity = module.declareFunction({ name: "identity", parameters: [{ name: "value", type: llvm.i64 }], returns: llvm.i64 });
    const caller = module.defineFunction({ name: "caller", parameters: [], returns: llvm.i64 }, (fn) => {
      fn.block("entry", (block) => {
        block.ret(block.call(identity, [block.int(llvm.i64, 9n)], "value"));
      });
    });
    const [call, return_] = module.finishedFunction(caller).entry.instructions;
    const before = module.render().text;
    expect(Reflect.set(return_, "value", undefined)).toBe(false);
    expect(Reflect.set(call.provenance, "origin", "different")).toBe(false);
    if (call.kind !== "call") {
      throw new Error("expected the first instruction to be a call");
    }
    expect(Reflect.set(call.arguments, "0", undefined)).toBe(false);
    expect(Reflect.set(call.callee, "name", "unregistered")).toBe(false);
    expect(Reflect.set(call.callee.signature.parameterTypes, "0", llvm.ptr)).toBe(false);
    expect(module.render().text).toBe(before);
  });

  test("still validates every known symbol's global initializers when it seals", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    module.defineGlobal({
      name: "missing",
      type: llvm.ptr,
      linkage: "external",
      constant: false,
      unnamedAddress: false,
      initializer: { kind: "globalReference", type: llvm.ptr, name: "neverDeclared" }
    });
    expect(() => module.build()).toThrow("initializes from undeclared global neverDeclared");
  });
});
