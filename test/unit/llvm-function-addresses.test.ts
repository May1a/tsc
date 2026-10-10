import { describe, expect, test } from "vitest";
import {
  type LlvmBlockBuilder,
  type LlvmFunctionSpec,
  createLlvmModule,
  llvm
} from "../../src/compiler/llvm-ir/index.js";


const oneToOne = {
  name: "identity",
  parameters: [{ name: "value", type: llvm.i64 }],
  returns: llvm.i64
} as const;

const tripleSpec = {
  name: "triple",
  parameters: [{ name: "value", type: llvm.i64 }],
  returns: llvm.i64
} as const;

const runtimeBody = "define i64 @runtimeIdentity(i64 %value) {\nentry:\n  ret i64 %value\n}\n";

describe("owned function addresses", () => {
  test("renders the address of a declared function this module defines later", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    const identity = module.declareFunction(oneToOne);
    module.defineFunction({ name: "addressOf", parameters: [], returns: llvm.ptr }, (fn) => {
      fn.block("entry", (block) => block.ret(block.functionPointer(identity)));
    });
    module.defineFunction(oneToOne, (fn) => {
      fn.block("entry", (block) => block.ret(fn.parameter(0, llvm.i64)));
    });

    const { text } = module.render();
    // The address resolves while only a declaration exists, and the later definition replaces it rather
    // than sitting beside it as the redefinition clang rejects.
    expect(text).toContain("ret ptr @identity");
    expect(text).not.toContain("declare i64 @identity");
    expect(text.match(/define i64 @identity/g)).toHaveLength(1);
  });

  test("renders the address of a function the static runtime defines", () => {
    const module = createLlvmModule({ staticRuntime: [{ origin: "static runtime", text: runtimeBody }] });
    const registered = module.registerStaticRuntimeFunction({ ...oneToOne, name: "runtimeIdentity" });
    module.defineFunction({ name: "addressOf", parameters: [], returns: llvm.ptr }, (fn) => {
      fn.block("entry", (block) => block.ret(block.functionPointer(registered)));
    });

    const { text } = module.render();
    expect(text).toContain("ret ptr @runtimeIdentity");
    expect(text).not.toContain("declare i64 @runtimeIdentity");
    // Not a global: a function is addressed by its symbol, never by an emitted `@name = global`.
    expect(text).not.toContain("@runtimeIdentity = ");
  });

  test("is one constant, so the same address is usable in every block of the function", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    module.defineFunction(tripleSpec, (fn) => {
      fn.block("entry", (block) => block.ret(fn.parameter(0, llvm.i64)));
    });
    const identity = module.declareFunction(oneToOne);
    const callSignature = { returns: llvm.i64, parameterTypes: [llvm.i64], variadic: false } as const;

    module.defineFunction({ name: "storeThenLoad", parameters: [], returns: llvm.i64 }, (fn) => {
      const entry = fn.openBlock("entry");
      const slot = entry.alloca(llvm.ptr, "slot");
      const address = entry.functionPointer(identity);
      entry.store(address, slot);
      entry.br(fn.label("invoke"));
      const invoke = fn.openBlock("invoke");
      invoke.store(address, slot);
      const target = invoke.load(llvm.ptr, slot, "target");
      invoke.ret(invoke.callIndirect(target, callSignature, [invoke.int(llvm.i64, 7n)], "invoked"));
    });
    module.defineFunction(oneToOne, (fn) => {
      fn.block("entry", (block) => block.ret(fn.parameter(0, llvm.i64)));
    });

    expect(module.render().text).toContain("store ptr @identity, ptr %slot");
    expect(module.render().text).toContain("%invoked = call i64 %target(i64 7)");
  });

  test("refuses a spec this module never recorded and one from another module", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    const foreign = createLlvmModule({ staticRuntime: [] });
    const foreignSpec = foreign.declareFunction({ name: "elsewhere", parameters: [], returns: llvm.void });

    const unregistered: LlvmFunctionSpec = { name: "unregistered", parameters: [], returns: llvm.void };
    expect(() => module.defineFunction({ name: "readsUnregistered", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => {
        block.store(block.functionPointer(unregistered), block.nullPtr());
        block.ret();
      });
    })).toThrow("LLVM body takes the address of unowned function unregistered");

    expect(() => module.defineFunction({ name: "readsForeign", parameters: [], returns: llvm.void }, (fn) => {
      fn.block("entry", (block) => {
        block.store(block.functionPointer(foreignSpec), block.nullPtr());
        block.ret();
      });
    })).toThrow("LLVM body takes the address of unowned function elsewhere");
  });

  test("resolves the module's recorded name, not a name the caller mutated afterwards", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    const mutable = { ...oneToOne, name: "identity" };
    module.declareFunction(mutable);
    mutable.name = "renamed";

    module.defineFunction({ name: "addressOf", parameters: [], returns: llvm.ptr }, (fn) => {
      fn.block("entry", (block) => block.ret(block.functionPointer(mutable)));
    });

    expect(module.render().text).toContain("ret ptr @identity");
  });

  test("stops working once the block is sealed, like every other instruction", () => {
    const module = createLlvmModule({ staticRuntime: [] });
    const declared = module.declareFunction({ ...oneToOne });
    let escaped: LlvmBlockBuilder | undefined;

    module.defineFunction({ name: "escapes", parameters: [], returns: llvm.ptr }, (fn) => {
      fn.block("entry", (block) => {
        escaped = block;
        block.ret(block.functionPointer(declared));
      });
    });

    if (escaped === undefined) {
      throw new Error("test setup: the block should have been captured");
    }
    const sealed = escaped;
    expect(() => sealed.functionPointer(declared)).toThrow("escaped its scope");
  });
});
