import { describe, expect, test } from "vitest";
import path from "node:path";
import {
  compileFixture,
  countOccurrences,
  expectLlvmAsVerificationIfAvailable,
  expectNativeBehaviorIfAvailable,
  expectSuccessfulCompile,
  expectToolBehaviorIfAvailable,
  expectUnsupportedDiagnostic
} from "./helpers.js";
import { expectNativeMatchesNodeIfAvailable } from "./oracle.js";
import {
  bindingGlobals,
  buildTypedFixture,
  calleeNames,
  callsTo,
  constantGepIndexes,
  floatingPointBinaries,
  floatingPointComparisons,
  integerComparisons,
  loadsFrom,
  mainFunction,
  soleGeneratedFunction,
  storesTo,
  ternaryJoins
} from "./typed-module.js";

/** Fixed objects retain numeric field slots and a runtime shadow; general objects use runtime helpers. */

describe("tscn objects", () => {
  test("lowers object literals and dot access", async () => {
    const { module } = await buildTypedFixture("object-dot-access.ts");

    // Two numeric fields, each its own slot, behind one shadow pointer.
    expect(bindingGlobals(module)).toEqual([
      "tscn.binding.0.shadow",
      "tscn.binding.0.field.0",
      "tscn.binding.0.field.1"
    ]);
    expect(storesTo(mainFunction(module), "tscn.binding.0.field.0")).toEqual(["10.0"]);

    await expectNativeMatchesNodeIfAvailable("object-dot-access.ts");
  });

  test("lowers object bracket access with const string keys", async () => {
    const { module } = await buildTypedFixture("object-bracket-access.ts");

    // A bracket access with a literal key is the same field access as the dot form.
    expect(bindingGlobals(module)).toEqual([
      "tscn.binding.0.shadow",
      "tscn.binding.0.field.0",
      "tscn.binding.0.field.1"
    ]);

    await expectNativeMatchesNodeIfAvailable("object-bracket-access.ts");
  });

  test("lowers object property mutation", async () => {
    const { module } = await buildTypedFixture("object-mutation.ts");
    const main = mainFunction(module);

    // The field is written once by the literal and once by the assignment, and the second write is
    // the value the print reads back.
    expect(storesTo(main, "tscn.binding.0.field.0")).toEqual(["1.0", "99.0"]);
    expect(loadsFrom(main, "tscn.binding.0.field.0")).toHaveLength(1);

    await expectNativeMatchesNodeIfAvailable("object-mutation.ts");
  });

  test("lowers nested object property access", async () => {
    const { module } = await buildTypedFixture("object-nested.ts");

    // Nesting is visible in the global names: the inner object is a field of the outer one.
    expect(bindingGlobals(module)).toEqual([
      "tscn.binding.0.shadow",
      "tscn.binding.0.field.0.shadow",
      "tscn.binding.0.field.0.field.0"
    ]);

    await expectNativeMatchesNodeIfAvailable("object-nested.ts");
  });

  test("lowers object bracket mutation", async () => {
    const { module } = await buildTypedFixture("object-bracket-mutation.ts");
    const main = mainFunction(module);

    expect(storesTo(main, "tscn.binding.0.field.0")).toEqual(["1.0", "99.0"]);

    await expectNativeMatchesNodeIfAvailable("object-bracket-mutation.ts");
  });

  test("preserves numeric expression fields and nested object mutation", async () => {
    const expression = await buildTypedFixture("object-expression-field.ts");

    // `base + 2` is an addition stored into the field, not the constant a zero-initializer left there.
    expect(floatingPointBinaries(mainFunction(expression.module))).toEqual([["fadd", "40.0", "2.0"]]);
    expect(bindingGlobals(expression.module)).toContain("tscn.binding.1.field.0");

    await expectNativeMatchesNodeIfAvailable("object-expression-field.ts");

    const nested = await buildTypedFixture("object-nested-mutation.ts");

    // The nested mutation writes the inner field, not the outer one.
    expect(storesTo(mainFunction(nested.module), "tscn.binding.0.field.0.field.0")).toEqual(["1.0", "42.0"]);

    await expectNativeMatchesNodeIfAvailable("object-nested-mutation.ts");
  });

  test("uses object properties in numeric comparisons", async () => {
    const { module } = await buildTypedFixture("object-condition.ts");
    const main = mainFunction(module);

    // The compared operand is loaded from the field, so the comparison is against the object's value.
    expect(loadsFrom(main, "tscn.binding.0.field.0")).toHaveLength(1);
    expect(floatingPointComparisons(main)).toHaveLength(1);

    await expectNativeMatchesNodeIfAvailable("object-condition.ts");
  });

  test("lowers string-key object literal fields", async () => {
    const { module } = await buildTypedFixture("object-string-key.ts");

    expect(bindingGlobals(module)).toEqual(["tscn.binding.0.shadow", "tscn.binding.0.field.0"]);

    await expectNativeMatchesNodeIfAvailable("object-string-key.ts");
  });

  test("stores function-call results in object fields", async () => {
    const { module } = await buildTypedFixture("object-call-field.ts");
    const main = mainFunction(module);

    // The field holds the completion payload rather than a literal, so the object is only complete
    // after the call returns.
    expect(callsTo(main, "jsCall")).toHaveLength(1);
    expect(storesTo(main, "tscn.binding.1.field.0")).toHaveLength(1);

    await expectNativeMatchesNodeIfAvailable("object-call-field.ts");
  });

  test("lowers dynamic string-key object reads through runtime helpers", async () => {
    const { module } = await buildTypedFixture("object-dynamic-key.ts");
    const main = mainFunction(module);

    // The computed key makes the target a dictionary, so both the known-shape field and the runtime
    // object are present, and a dynamic read goes through the checked getter.
    expect(calleeNames(main)).toContain("checkedValuePropertyGet");
    expect(calleeNames(main)).toContain("objectSet");
    expect(bindingGlobals(module)).toContain("tscn.binding.0.owner");

    const result = await expectSuccessfulCompile("object-dynamic-key.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "1\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("keeps known-shape object runtime shadows synchronized after mutation", async () => {
    const { module } = await buildTypedFixture("object-fixed-shadow-mutation.ts");
    const main = mainFunction(module);

    // The numeric store and the dictionary store both happen: the shadow is what keeps a known-shape
    // object's value readable through the runtime helpers.
    expect(callsTo(main, "objectSet")).toHaveLength(2);
    expect(calleeNames(main)).toContain("checkedValuePropertyGet");

    const result = await expectSuccessfulCompile("object-fixed-shadow-mutation.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "2\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("lowers dynamic object stores with dictionary growth", async () => {
    const { module } = await buildTypedFixture("object-runtime-dynamic-store.ts");
    const main = mainFunction(module);

    // A key that is not in the literal's shape is added through the runtime setter, which is what
    // grows the dictionary.
    expect(callsTo(main, "objectSet")).toHaveLength(2);
    expect(calleeNames(main)).toContain("objectNew");

    const result = await expectSuccessfulCompile("object-runtime-dynamic-store.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "new\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("rejects nested known-shape object dynamic lookup explicitly", async () => {
    const result = await compileFixture("object-nested-dynamic-key.ts");

    try {
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("error TSCN1002");
      expect(result.stderr).toContain("Dynamic computed object keys on nested known-shape objects are not supported yet");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers runtime-only object value fields through dictionary objects", async () => {
    const { module } = await buildTypedFixture("object-non-numeric-field.ts");
    const main = mainFunction(module);

    // A string field has no numeric slot, so the literal gets no `.field.N` global at all and the
    // value goes into a dictionary object instead.
    expect(bindingGlobals(module)).toEqual(["tscn.binding.0"]);
    expect(calleeNames(main)).toContain("objectSet");
    expect(calleeNames(main)).toContain("valuePrint");

    const result = await expectSuccessfulCompile("object-non-numeric-field.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "value\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("keeps runtime and known-shape object names from colliding", async () => {
    const { module } = await buildTypedFixture("object-runtime-and-fixed.ts");
    const main = mainFunction(module);

    // The known-shape object keeps its field slots and the string-keyed one gets a dictionary, and
    // neither borrows the other's binding.
    expect(bindingGlobals(module)).toEqual(["tscn.binding.0.shadow", "tscn.binding.0.field.0", "tscn.binding.1"]);
    expect(calleeNames(main)).toContain("checkedValuePropertyGet");
    expect(calleeNames(main)).toContain("objectSet");

    const result = await expectSuccessfulCompile("object-runtime-and-fixed.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "3\nruntime\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("deletes runtime object properties from dictionary objects", async () => {
    const { module } = await buildTypedFixture("object-runtime-delete.ts");
    const main = mainFunction(module);

    // Both deletes reach the same helper, including the one for a key the object never had.
    expect(callsTo(main, "valueObjectDelete")).toHaveLength(2);

    const result = await expectSuccessfulCompile("object-runtime-delete.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "undefined\nundefined\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("falls back through runtime object prototypes created with Object.create", async () => {
    const { module } = await buildTypedFixture("object-runtime-prototype.ts");
    const main = mainFunction(module);

    // A missing own key resolves against the prototype, which is a second dictionary the literal
    // writes into, and the resolution goes through the checked getter.
    expect(calleeNames(main)).toContain("objectCreate");
    expect(calleeNames(main)).toContain("checkedValuePropertyGet");

    const result = await expectSuccessfulCompile("object-runtime-prototype.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, {
        status: 0,
        stdout: "proto\nown\nundefined\nproto\nundefined\n",
        stderr: ""
      });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("checks runtime object property presence through own and prototype lookups", async () => {
    const { module } = await buildTypedFixture("object-runtime-presence.ts");
    const main = mainFunction(module);

    // Presence walks the prototype chain, so it goes through `objectHas` rather than an own-key test.
    expect(calleeNames(main)).toContain("objectHas");
    expect(calleeNames(main)).toContain("objectCreate");

    const result = await expectSuccessfulCompile("object-runtime-presence.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "true\ntrue\ntrue\nfalse\ntrue\nfalse\nfalse\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("mutates runtime object prototypes with Object.setPrototypeOf", async () => {
    const { module } = await buildTypedFixture("object-runtime-set-prototype.ts");
    const main = mainFunction(module);

    expect(calleeNames(main)).toContain("objectSetPrototype");

    const result = await expectSuccessfulCompile("object-runtime-set-prototype.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "first\nundefined\nsecond\nundefined\nundefined\nfalse\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("defines runtime data property descriptors and observes writable/configurable bits", async () => {
    const { module } = await buildTypedFixture("object-runtime-define-property.ts");
    const main = mainFunction(module);

    // The descriptor is defined once and then read back, which is why both the setter and the getter
    // helpers appear.
    expect(callsTo(main, "objectDefineDataProperty")).toHaveLength(2);
    expect(calleeNames(main)).toContain("objectSet");

    const result = await expectSuccessfulCompile("object-runtime-define-property.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "fixed\nundefined\nnormal\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("returns own enumerable runtime object keys in insertion order", async () => {
    const { module } = await buildTypedFixture("object-runtime-keys.ts");
    const main = mainFunction(module);

    // A non-enumerable property is defined through the descriptor helper and then omitted from the
    // key list, which is the ordering claim's only real evidence.
    expect(calleeNames(main)).toContain("objectKeys");
    expect(calleeNames(main)).toContain("objectDefineDataProperty");

    const result = await expectSuccessfulCompile("object-runtime-keys.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "1\nvisible\nundefined\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("supports runtime object extensibility", async () => {
    const { module } = await buildTypedFixture("object-runtime-extensible.ts");
    const main = mainFunction(module);

    expect(calleeNames(main)).toContain("objectPreventExtensions");
    expect(calleeNames(main)).toContain("objectIsExtensible");

    const result = await expectSuccessfulCompile("object-runtime-extensible.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "true\nfalse\nnew\nundefined\nundefined\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("supports runtime object seal and freeze", async () => {
    const { module } = await buildTypedFixture("object-runtime-seal-freeze.ts");
    const main = mainFunction(module);

    expect(calleeNames(main)).toContain("objectSeal");
    expect(calleeNames(main)).toContain("objectFreeze");

    const result = await expectSuccessfulCompile("object-runtime-seal-freeze.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "true\nnew\nkeep\nundefined\ntrue\nnew\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("copies runtime object enumerable own properties", async () => {
    const { module } = await buildTypedFixture("object-runtime-assign.ts");
    const main = mainFunction(module);

    expect(calleeNames(main)).toContain("valueObjectAssign");

    const result = await expectSuccessfulCompile("object-runtime-assign.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "override\nb\nundefined\nundefined\nundefined\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("gets runtime object prototypes and guards cycles", async () => {
    const { module } = await buildTypedFixture("object-runtime-get-prototype-cycle.ts");
    const main = mainFunction(module);

    expect(calleeNames(main)).toContain("objectGetPrototype");
    // The cycle guard lives inside the prototype setter, so attaching the second object is one call.
    expect(calleeNames(main)).toContain("objectSetPrototype");

    const result = await expectSuccessfulCompile("object-runtime-get-prototype-cycle.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "root\na\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });
});

describe("tscn runtime comparisons", () => {
  test("lowers runtime string strict equality as content comparison", async () => {
    // This fixture prints nothing: it compares two runtime strings and records nothing, so the graph
    // is the only place the comparison is visible.
    const { module } = await buildTypedFixture("runtime-string-equality.ts");
    const main = mainFunction(module);

    // Two runtime strings compare by content, never by pointer identity.
    expect(calleeNames(main)).toContain("strEquals");
    expect(callsTo(main, "strEquals")).toHaveLength(1);

    await expectNativeMatchesNodeIfAvailable("runtime-string-equality.ts");
  });

  test("uses string equality helper for content equality and inequality", async () => {
    const equality = await buildTypedFixture("runtime-string-content-equality.ts");
    const inequality = await buildTypedFixture("runtime-string-content-inequality.ts");

    // `===` is the helper's result; `!==` is the same call with the branches swapped.
    expect(calleeNames(mainFunction(equality.module))).toContain("strEquals");
    expect(calleeNames(mainFunction(inequality.module))).toContain("strEquals");

    await expectNativeMatchesNodeIfAvailable("runtime-string-content-equality.ts");
    await expectNativeMatchesNodeIfAvailable("runtime-string-content-inequality.ts");
  });

  test("lowers mutable boolean strict equality", async () => {
    const { module } = await buildTypedFixture("boolean-comparison.ts");
    const main = mainFunction(module);

    // Booleans are one-bit bindings, so the comparison is an integer comparison of two loads.
    expect(bindingGlobals(module)).toEqual(["tscn.binding.0", "tscn.binding.1"]);
    expect(integerComparisons(main).map(([predicate]) => predicate)).toEqual(["eq"]);

    await expectNativeMatchesNodeIfAvailable("boolean-comparison.ts");
  });
});

describe("tscn JSValue ABI", () => {
  test("supports null as a first-class JSValue", async () => {
    const result = await expectSuccessfulCompile("value-null.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "null\nnull\ntrue\ntrue\nfalse\nfalse\ntrue\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("lowers boxed print values through the value print helper", async () => {
    const { module } = await buildTypedFixture("value-print.ts");
    const main = mainFunction(module);

    // Every value reaches the one print helper, and a string arrives as a copied value rather than a
    // raw pointer, so no per-kind print path exists.
    expect(calleeNames(main)).toContain("valuePrint");
    expect(calleeNames(main)).toContain("valueCopyString");

    const result = await expectSuccessfulCompile("value-print.ts", { link: true });

    try {
      const expected = { status: 0, stdout: "42\ntrue\nundefined\nboxed string\n", stderr: "" };
      await expectNativeBehaviorIfAvailable(result, expected);
      // The print helper is Static Runtime IR defined once; emitting it twice would be a duplicate
      // symbol, so linking at all is the uniqueness check.
      expect(countOccurrences(await result.readArtifact("main.ll"), "define void @valuePrint")).toBe(1);
      const lli = await expectToolBehaviorIfAvailable("lli", [path.join(result.outDir, "main.ll")], expected);
      if (lli.skipped) {
        expect(lli.reason).toContain("lli was not found");
      }
    } finally {
      await result.cleanup();
    }
  });

  test("keeps boxed string tags distinct from fractional number values", async () => {
    const result = await expectSuccessfulCompile("value-print-fraction.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "0.3\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("lowers value strict equality through a deterministic helper", async () => {
    const { module } = await buildTypedFixture("value-strict-equality.ts");
    const main = mainFunction(module);

    expect(callsTo(main, "valueStrictEquals")).toHaveLength(4);

    const result = await expectSuccessfulCompile("value-strict-equality.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, {
        status: 0,
        stdout: "numbers equal\nbooleans differ\nundefined equal\nstrings compare by content\n",
        stderr: ""
      });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("compares boxed string JSValues by content", async () => {
    await expectNativeMatchesNodeIfAvailable("value-string-strict-equality-content.ts");
  });

  test("returns number or boolean through the same value-shaped ABI", async () => {
    const { module } = await buildTypedFixture("value-return-union.ts");
    const choose = soleGeneratedFunction(module);

    // Both arms produce a boxed value and the join picks one, so the return type is the completion
    // pair whatever the arms are, there is no union return type to declare.
    expect(ternaryJoins(choose)).toEqual(["value.ternary.join"]);
    expect(choose.spec.returns).toEqual({ kind: "struct", elements: [{ kind: "integer", bits: 64 }, { kind: "integer", bits: 1 }] });
    expect(constantGepIndexes(choose)).toEqual([]);

    await expectNativeMatchesNodeIfAvailable("value-return-union.ts");
  });
});

describe("object method function frames", () => {
  test.each([
    "object-method-capture-let-number-unsupported.ts",
    "object-method-capture-let-string-unsupported.ts",
    "object-method-capture-let-boolean-unsupported.ts",
    "object-method-capture-var-number-unsupported.ts",
    "object-method-capture-var-string-unsupported.ts",
    "object-method-capture-var-boolean-unsupported.ts",
    "object-method-read-number-unsupported.ts",
    "object-method-read-string-unsupported.ts",
    "object-method-read-boolean-unsupported.ts"
  ])("rejects an enclosing mutable binding in %s", async (fixture) => {
    await expectUnsupportedDiagnostic(fixture);
  });
});