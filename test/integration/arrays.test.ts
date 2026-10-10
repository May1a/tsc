import { describe, expect, test } from "vitest";
import {
  expectLlvmAsVerificationIfAvailable,
  expectNativeBehaviorIfAvailable,
  expectSuccessfulCompile
} from "./helpers.js";
import { expectNativeMatchesNodeIfAvailable } from "./oracle.js";
import {
  bindingGlobals,
  buildTypedFixture,
  calleeNames,
  callsTo,
  constantGepIndexes,
  floatingPointBinaries,
  loadsFrom,
  mainFunction,
  requireBlock,
  storesTo
} from "./typed-module.js";

/** Fixed arrays retain double elements; runtime arrays use boxed binding storage. */

describe("tscn arrays", () => {
  test("lowers array literals and constant element access", async () => {
    const { module } = await buildTypedFixture("array-element-constant.ts");
    const main = mainFunction(module);

    // One binding of array type, its three elements stored at indexes 0, 1 and 2.
    expect(bindingGlobals(module)).toEqual(["tscn.binding.0"]);
    expect(constantGepIndexes(main)).toEqual([0, 1, 2]);
    expect(calleeNames(main)).toContain("numberToIndex");

    await expectNativeMatchesNodeIfAvailable("array-element-constant.ts");
  });

  test("lowers array access with a mutable numeric index", async () => {
    const { module } = await buildTypedFixture("array-element-variable.ts");
    const main = mainFunction(module);

    // The index is a second binding, converted through `numberToIndex` before it addresses the array.
    expect(bindingGlobals(module)).toEqual(["tscn.binding.0", "tscn.binding.1"]);
    expect(loadsFrom(main, "tscn.binding.1")).toHaveLength(1);
    expect(callsTo(main, "numberToIndex")).toHaveLength(1);

    await expectNativeMatchesNodeIfAvailable("array-element-variable.ts");
  });

  test("lowers fixed array length as a numeric constant", async () => {
    const { module } = await buildTypedFixture("array-length.ts");
    const main = mainFunction(module);

    // The literal has three elements and the printed length is 3 without consulting the storage.
    expect(storesTo(main, "tscn.binding.0")).toHaveLength(0);
    expect(bindingGlobals(module)).toEqual(["tscn.binding.0"]);
    expect(calleeNames(main)).not.toContain("arrayLength");

    await expectNativeMatchesNodeIfAvailable("array-length.ts");
  });

  test("lowers array element mutation", async () => {
    const { module } = await buildTypedFixture("array-mutation.ts");
    const main = mainFunction(module);

    // The mutation is a store through a computed element address, then a load of the same address.
    expect(callsTo(main, "numberToIndex")).toHaveLength(2);
    expect(constantGepIndexes(main)).toEqual([0, 1, 2]);

    await expectNativeMatchesNodeIfAvailable("array-mutation.ts");
  });

  test("lowers for loops over fixed arrays", async () => {
    const { module } = await buildTypedFixture("array-for-loop.ts");
    const main = mainFunction(module);

    expect(calleeNames(requireBlock(main, "loop.body"))).toContain("valuePrint");
    expect(constantGepIndexes(main)).toContain(0);

    await expectNativeMatchesNodeIfAvailable("array-for-loop.ts");
  });

  test("stores evaluated numeric expressions in array initializers", async () => {
    const { module } = await buildTypedFixture("array-expression-initializer.ts");
    const main = mainFunction(module);

    // `base + 1` is an addition stored into element 0, not the constant 0 a zero-initialized array
    // would have held.
    expect(floatingPointBinaries(main)).toEqual([["fadd", "10.0", "1.0"]]);
    expect(storesTo(main, "tscn.binding.1")).toHaveLength(0);

    await expectNativeMatchesNodeIfAvailable("array-expression-initializer.ts");
  });

  test("uses array accesses in conditions and length-bounded while loops", async () => {
    const condition = await buildTypedFixture("array-condition.ts");
    const loop = await buildTypedFixture("array-while-length.ts");

    expect(calleeNames(mainFunction(condition.module))).toContain("valuePrint");
    expect(constantGepIndexes(mainFunction(loop.module))).toEqual([0, 1, 2]);

    await expectNativeMatchesNodeIfAvailable("array-condition.ts");
    await expectNativeMatchesNodeIfAvailable("array-while-length.ts");
  });

  test("keeps multiple array literals deterministic and non-colliding", async () => {
    const { module } = await buildTypedFixture("array-multiple-literals.ts");
    const main = mainFunction(module);

    // Two distinct bindings of array type, so neither literal's storage shadows the other.
    expect(bindingGlobals(module)).toEqual(["tscn.binding.0", "tscn.binding.1"]);
    expect(constantGepIndexes(main)).toEqual([0, 1, 0, 1]);

    await expectNativeMatchesNodeIfAvailable("array-multiple-literals.ts");
  });

  test("lowers mutable fixed arrays and nested numeric indexes", async () => {
    const { module } = await buildTypedFixture("array-let-nested-index.ts");
    const main = mainFunction(module);

    // The element index is `i + 1`, so an addition feeds the address computation.
    expect(floatingPointBinaries(main)).toEqual([["fadd", "load", "1.0"]]);
    expect(callsTo(main, "numberToIndex")).toHaveLength(2);

    await expectNativeMatchesNodeIfAvailable("array-let-nested-index.ts");
  });

  test("stores variables and function-call results in array initializers", async () => {
    const { module } = await buildTypedFixture("array-call-initializer.ts");
    const main = mainFunction(module);

    // Element 0 holds the current value of `x` and element 1 the completion payload of `next()`, so
    // both come from loads rather than from literals.
    expect(floatingPointBinaries(main)).toEqual([]);
    expect(loadsFrom(main, "tscn.binding.1")).toHaveLength(1);
    expect(callsTo(main, "jsCall")).toHaveLength(1);

    await expectNativeMatchesNodeIfAvailable("array-call-initializer.ts");
  });

  test("lowers holes and mixed values through runtime array helpers", async () => {
    const hole = await buildTypedFixture("array-hole.ts");

    // A literal with a hole is not a fixed array: it is built at run time, and the elided element is
    // pushed as the hole sentinel rather than as a zero.
    expect(calleeNames(mainFunction(hole.module))).toContain("arrayPush");
    expect(callsTo(mainFunction(hole.module), "arrayPush")).toHaveLength(3);

    await expectNativeMatchesNodeIfAvailable("array-hole.ts");

    const mixed = await buildTypedFixture("array-non-numeric.ts");

    // A non-numeric literal is also a runtime array: there is no `[n x double]` to put a string in.
    expect(bindingGlobals(mixed.module)).toEqual(["tscn.binding.0"]);
    expect(calleeNames(mainFunction(mixed.module))).toContain("arrayPush");

    await expectNativeMatchesNodeIfAvailable("array-non-numeric.ts");
  });

  test("keeps runtime and fixed array names from colliding", async () => {
    const { module } = await buildTypedFixture("array-runtime-and-fixed.ts");
    const main = mainFunction(module);

    // The fixed literal keeps array storage while the boolean literal becomes a runtime array; both
    // read back correctly because their storages never share a binding.
    expect(bindingGlobals(module)).toEqual(["tscn.binding.0", "tscn.binding.1"]);
    expect(calleeNames(main)).toContain("arrayPush");
    expect(calleeNames(main)).toContain("numberToIndex");

    const result = await expectSuccessfulCompile("array-runtime-and-fixed.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "2\ntrue\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("grows runtime arrays on out-of-bounds writes", async () => {
    const { module } = await buildTypedFixture("array-runtime-growth.ts");
    const main = mainFunction(module);

    // The write goes through `arraySet`, which is the helper that grows the backing store, and the
    // length is read back through `arrayLength` rather than kept in a binding.
    expect(calleeNames(main)).toContain("arraySet");
    expect(calleeNames(main)).toContain("arrayLength");

    const result = await expectSuccessfulCompile("array-runtime-growth.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "6\nundefined\nx\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("deletes runtime array elements as holes without changing length", async () => {
    const { module } = await buildTypedFixture("array-runtime-delete.ts");
    const main = mainFunction(module);

    // Both deletes reach the same helper, including the out-of-range one, which is a no-op, and the
    // length is unchanged because no `arraySetLength` is emitted.
    expect(callsTo(main, "arrayDelete")).toHaveLength(2);
    expect(calleeNames(main)).not.toContain("arraySetLength");

    const result = await expectSuccessfulCompile("array-runtime-delete.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "3\nundefined\nc\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("assigns runtime array length with truncation and holes", async () => {
    const { module } = await buildTypedFixture("array-runtime-length-assignment.ts");
    const main = mainFunction(module);

    // Truncating and extending both go through the one length setter, and truncating writes a hole
    // back into the slot it freed.
    expect(callsTo(main, "arraySetLength")).toHaveLength(2);
    expect(calleeNames(main)).toContain("arraySet");

    const result = await expectSuccessfulCompile("array-runtime-length-assignment.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "1\nundefined\n4\nundefined\nd\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("checks runtime array indexed presence without treating holes as present", async () => {
    const { module } = await buildTypedFixture("array-runtime-presence.ts");
    const main = mainFunction(module);

    // A present index asks the own-index question and a string key asks the general one, so both
    // helpers appear and the hole is never reported as present.
    expect(calleeNames(main)).toContain("arrayHasOwnIndex");
    expect(calleeNames(main)).toContain("arrayHas");

    const result = await expectSuccessfulCompile("array-runtime-presence.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "true\ntrue\nfalse\nfalse\nfalse\nfalse\nfalse\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("falls back from runtime array holes to object prototypes for literal indexes", async () => {
    const { module } = await buildTypedFixture("array-runtime-prototype.ts");
    const main = mainFunction(module);

    // The prototype is an object literal attached to the array, which is how a hole resolves to
    // `zero`, `one` and `three` rather than to `undefined`.
    expect(calleeNames(main)).toContain("arraySetPrototype");
    expect(calleeNames(main)).toContain("objectSet");

    const result = await expectSuccessfulCompile("array-runtime-prototype.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "zero\none\nundefined\nthree\nundefined\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("returns own enumerable runtime array keys", async () => {
    const { module } = await buildTypedFixture("array-runtime-keys.ts");
    const main = mainFunction(module);

    expect(calleeNames(main)).toContain("arrayKeys");

    const result = await expectSuccessfulCompile("array-runtime-keys.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "2\n0\n4\nundefined\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("supports canonical string keys for runtime arrays", async () => {
    const { module } = await buildTypedFixture("array-runtime-string-keys.ts");
    const main = mainFunction(module);

    expect(calleeNames(main)).toContain("arrayHas");

    const result = await expectSuccessfulCompile("array-runtime-string-keys.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "zero\nproto\ntrue\ntrue\nfalse\nfalse\n4\nthree\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("supports runtime array push and pop", async () => {
    const { module } = await buildTypedFixture("array-runtime-push-pop.ts");
    const main = mainFunction(module);

    expect(calleeNames(main)).toContain("arrayPush");
    expect(calleeNames(main)).toContain("arrayPop");

    const result = await expectSuccessfulCompile("array-runtime-push-pop.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "4\n4\nd\nc\nundefined\na\nundefined\n0\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("supports runtime array shift and unshift", async () => {
    const { module } = await buildTypedFixture("array-runtime-shift-unshift.ts");
    const main = mainFunction(module);

    expect(calleeNames(main)).toContain("arrayShift");
    expect(calleeNames(main)).toContain("arrayUnshift");

    const result = await expectSuccessfulCompile("array-runtime-shift-unshift.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "4\na\nundefined\na\n3\nundefined\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("gets runtime array prototypes", async () => {
    const { module } = await buildTypedFixture("array-runtime-get-prototype.ts");
    const main = mainFunction(module);

    expect(calleeNames(main)).toContain("arrayGetPrototype");

    const result = await expectSuccessfulCompile("array-runtime-get-prototype.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "array-proto\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });
});