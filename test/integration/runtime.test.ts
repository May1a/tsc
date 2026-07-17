import { describe, expect, test } from "vitest";
import {
  compileFixture,
  expectSuccessfulCompile,
  expectUnsupportedDiagnostic,
  expectUnsupportedMessage,
  expectNativeBehaviorIfAvailable,
  expectLlvmAsVerificationIfAvailable,
  expectNativeFixtures,
  countOccurrences,
  roadmapIntegrationTimeoutMs
} from "./helpers.js";

// eslint-disable-next-line max-statements -- Expanded runtime roadmap coverage intentionally groups many vertical fixtures.
describe("tscn expanded runtime roadmap", () => {
  test("materializes multi-digit runtime array keys", async () => {
    const result = await expectSuccessfulCompile("array-runtime-keys-multi-digit.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "5\n0\n9\n10\n12\n123\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("classifies runtime arrays with Array.isArray", async () => {
    const result = await expectSuccessfulCompile("array-is-array.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "true\nfalse\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("returns runtime Object.values for objects and arrays", async () => {
    const object = await expectSuccessfulCompile("object-runtime-values.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(object, { status: 0, stdout: "2\na\nundefined\nundefined\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(object);
    } finally {
      await object.cleanup();
    }

    const array = await expectSuccessfulCompile("array-runtime-values.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(array, { status: 0, stdout: "2\nundefined\ny\nundefined\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(array);
    } finally {
      await array.cleanup();
    }
  });

  test("returns runtime data descriptors", async () => {
    const object = await expectSuccessfulCompile("object-runtime-get-own-property-descriptor.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(object, { status: 0, stdout: "value\nfalse\ntrue\nfalse\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(object);
    } finally {
      await object.cleanup();
    }

    const array = await expectSuccessfulCompile("array-runtime-get-own-property-descriptor.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(array, { status: 0, stdout: "zero\ntrue\ntrue\ntrue\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(array);
    } finally {
      await array.cleanup();
    }
  });

  test("returns safe nullable descriptors and array length descriptors", async () => {
    const objectMissing = await expectSuccessfulCompile("object-runtime-get-own-property-descriptor-missing.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(objectMissing, { status: 0, stdout: "true\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(objectMissing);
    } finally {
      await objectMissing.cleanup();
    }

    const arrayMissing = await expectSuccessfulCompile("array-runtime-get-own-property-descriptor-missing.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(arrayMissing, { status: 0, stdout: "true\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(arrayMissing);
    } finally {
      await arrayMissing.cleanup();
    }

    const arrayLength = await expectSuccessfulCompile("array-runtime-get-own-property-descriptor-length.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(arrayLength, { status: 0, stdout: "3\ntrue\nfalse\nfalse\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(arrayLength);
    } finally {
      await arrayLength.cleanup();
    }
  });

  test("defines multiple runtime data properties", async () => {
    const result = await expectSuccessfulCompile("object-runtime-define-properties.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "a\nhidden\nlocked\n2\na\nlocked\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("converts narrow runtime object property keys", async () => {
    const result = await expectSuccessfulCompile("object-runtime-property-key-conversion.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "zero\nten\nyes\nvalue\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("lowers object and array method-call sugar", async () => {
    const object = await expectSuccessfulCompile("object-runtime-method-sugar.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(object, { status: 0, stdout: "true\nfalse\ntrue\nfalse\n", stderr: "" });
    } finally {
      await object.cleanup();
    }

    const array = await expectSuccessfulCompile("array-runtime-method-sugar.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(array, { status: 0, stdout: "false\ntrue\ntrue\n", stderr: "" });
    } finally {
      await array.cleanup();
    }
  });

  test("supports runtime array includes, indexOf, slice, and join", async () => {
    const search = await expectSuccessfulCompile("array-runtime-includes-index-of.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(search, { status: 0, stdout: "true\ntrue\n3\n-1\n", stderr: "" });
    } finally {
      await search.cleanup();
    }

    const slice = await expectSuccessfulCompile("array-runtime-slice.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(slice, { status: 0, stdout: "3\nundefined\nc\nd\n", stderr: "" });
    } finally {
      await slice.cleanup();
    }

    const join = await expectSuccessfulCompile("array-runtime-join.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(join, { status: 0, stdout: "a---d\n", stderr: "" });
    } finally {
      await join.cleanup();
    }
  });

  test("carries boxed string length and supports typeof, truthiness, and aggregate refs", async () => {
    const boxed = await expectSuccessfulCompile("value-boxed-string-length.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(boxed, { status: 0, stdout: "hello\ntrue\n", stderr: "" });
    } finally {
      await boxed.cleanup();
    }

    const typeOf = await expectSuccessfulCompile("typeof-supported-values.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(typeOf, { status: 0, stdout: "undefined\nobject\nboolean\nnumber\nstring\n", stderr: "" });
    } finally {
      await typeOf.cleanup();
    }

    const truthiness = await expectSuccessfulCompile("value-truthiness.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(truthiness, { status: 0, stdout: "text\nzero\none\nundefined\nnull\n", stderr: "" });
    } finally {
      await truthiness.cleanup();
    }

    const refs = await expectSuccessfulCompile("value-runtime-aggregate-references.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(refs, { status: 0, stdout: "true\ntrue\ntrue\n[object Object]\n[object Array]\n", stderr: "" });
    } finally {
      await refs.cleanup();
    }
  });

  test("uses boxed aggregate JSValues as built-in receivers", async () => {
    const result = await expectSuccessfulCompile("value-runtime-aggregate-builtins.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "true\ntrue\nfalse\ntrue\nvalue\narray\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("returns boxed aggregate object keys and values", async () => {
    const result = await expectSuccessfulCompile("value-runtime-aggregate-object-keys-values.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "1\n1\nvalue\nobject\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("returns boxed aggregate array keys and values", async () => {
    const result = await expectSuccessfulCompile("value-runtime-aggregate-array-keys-values.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "3\n3\n0\n1\n2\na\nb\nc\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("reads properties and elements through boxed aggregate JSValues", async () => {
    const result = await expectSuccessfulCompile("value-runtime-aggregate-property-access.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "object\nobject\narray\n1\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("returns runtime Object.entries for objects and arrays", async () => {
    const object = await expectSuccessfulCompile("object-runtime-entries.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(object, { status: 0, stdout: "2\na\nvalue\nb\nundefined\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(object);
    } finally {
      await object.cleanup();
    }

    const array = await expectSuccessfulCompile("array-runtime-entries.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(array, { status: 0, stdout: "2\n0\nzero\n3\nthree\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(array);
    } finally {
      await array.cleanup();
    }
  });

  test("creates runtime objects from entries", async () => {
    const result = await expectSuccessfulCompile("object-runtime-from-entries.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "a\nundefined\ntrue\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }

    const holes = await expectSuccessfulCompile("object-runtime-from-entries-holes.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(holes, { status: 0, stdout: "1\na\nfalse\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(holes);
    } finally {
      await holes.cleanup();
    }
  });

  test("supports runtime array concat, fill, and reverse", async () => {
    const concat = await expectSuccessfulCompile("array-runtime-concat.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(concat, { status: 0, stdout: "5\na\nundefined\nc\nd\ntail\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(concat);
    } finally {
      await concat.cleanup();
    }

    const fill = await expectSuccessfulCompile("array-runtime-fill.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(fill, { status: 0, stdout: "a\nx\nx\nd\nz\nz\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(fill);
    } finally {
      await fill.cleanup();
    }

    const reverse = await expectSuccessfulCompile("array-runtime-reverse.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(reverse, { status: 0, stdout: "c\nb\na\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(reverse);
    } finally {
      await reverse.cleanup();
    }

    const reverseHoles = await expectSuccessfulCompile("array-runtime-reverse-holes.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(reverseHoles, { status: 0, stdout: "c\nundefined\na\nfalse\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(reverseHoles);
    } finally {
      await reverseHoles.cleanup();
    }
  });

  test("normalizes negative runtime array ranges", async () => {
    const sliceStart = await expectSuccessfulCompile("array-runtime-slice-negative-start.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(sliceStart, { status: 0, stdout: "1\nx\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(sliceStart);
    } finally {
      await sliceStart.cleanup();
    }

    const sliceRange = await expectSuccessfulCompile("array-runtime-slice-negative-range.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(sliceRange, { status: 0, stdout: "1\nb\n", stderr: "" });
    } finally {
      await sliceRange.cleanup();
    }

    const fillStart = await expectSuccessfulCompile("array-runtime-fill-negative-start.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(fillStart, { status: 0, stdout: "x\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(fillStart);
    } finally {
      await fillStart.cleanup();
    }

    const fillRange = await expectSuccessfulCompile("array-runtime-fill-negative-range.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(fillRange, { status: 0, stdout: "a\nx\nc\n", stderr: "" });
    } finally {
      await fillRange.cleanup();
    }

    const copyTarget = await expectSuccessfulCompile("array-runtime-copy-within-negative-target.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(copyTarget, { status: 0, stdout: "a\na\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(copyTarget);
    } finally {
      await copyTarget.cleanup();
    }

    const copyRange = await expectSuccessfulCompile("array-runtime-copy-within-negative-range.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(copyRange, { status: 0, stdout: "a\nb\na\nb\n", stderr: "" });
    } finally {
      await copyRange.cleanup();
    }
  });

  test("converts supported JSValues to strings and joins mixed values", async () => {
    const conversion = await expectSuccessfulCompile("value-string-conversion.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(conversion, { status: 0, stdout: "undefined\nnull\ntrue\nfalse\n42\n[object Object]\nx\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(conversion);
    } finally {
      await conversion.cleanup();
    }

    const join = await expectSuccessfulCompile("array-runtime-join-mixed-values.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(join, { status: 0, stdout: "a||true|null|[object Object]\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(join);
    } finally {
      await join.cleanup();
    }
  });

  test("mutates and deletes through boxed aggregate JSValues", async () => {
    const mutation = await expectSuccessfulCompile("value-runtime-aggregate-mutation.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(mutation, { status: 0, stdout: "next\n42\nzero\nnext\n2\nundefined\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(mutation);
    } finally {
      await mutation.cleanup();
    }

    const deletion = await expectSuccessfulCompile("value-runtime-aggregate-delete.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(deletion, { status: 0, stdout: "undefined\nundefined\none\n0\n1\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(deletion);
    } finally {
      await deletion.cleanup();
    }
  });

  test("introspects boxed aggregate descriptors and entries", async () => {
    const descriptors = await expectSuccessfulCompile("value-runtime-aggregate-descriptors.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(descriptors, { status: 0, stdout: "object\ntrue\nzero\ntrue\n2\nfalse\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(descriptors);
    } finally {
      await descriptors.cleanup();
    }

    const entries = await expectSuccessfulCompile("value-runtime-aggregate-entries.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(entries, { status: 0, stdout: "2\na\nvalue\n3\n0\n1\nundefined\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(entries);
    } finally {
      await entries.cleanup();
    }
  });

  test("safely introspects primitive Object receivers", async () => {
    const cases = [
      ["object-keys-unknown-primitive.ts", "0\n"],
      ["object-values-unknown-primitive.ts", "0\n"],
      ["object-entries-unknown-primitive.ts", "0\n"],
      ["object-get-own-property-descriptor-unknown-primitive.ts", "undefined\n"],
      ["object-get-own-property-names-unknown-primitive.ts", "0\n"],
      ["object-get-own-property-descriptors-primitive.ts", "0\n"],
      ["object-values-boolean-primitive.ts", "0\n"],
      ["object-get-own-property-names-boolean-primitive.ts", "0\n"],
      ["object-get-own-property-descriptors-number-empty.ts", "0\n"]
    ] as const;

    await Promise.all(cases.map(async ([fixture, stdout]) => {
      const result = await expectSuccessfulCompile(fixture, { link: true });
      try {
        await expectNativeBehaviorIfAvailable(result, { status: 0, stdout, stderr: "" });
        await expectLlvmAsVerificationIfAvailable(result);
      } finally {
        await result.cleanup();
      }
    }));
  });

  test("introspects boxed aggregate own property names and descriptors", async () => {
    const names = await expectSuccessfulCompile("value-runtime-aggregate-own-property-names.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(names, { status: 0, stdout: "2\nvisible\nhidden\n3\n0\n2\nlength\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(names);
    } finally {
      await names.cleanup();
    }

    const descriptors = await expectSuccessfulCompile("value-runtime-aggregate-own-property-descriptors.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(descriptors, { status: 0, stdout: "yes\ntrue\ntrue\ntrue\nsecret\nfalse\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(descriptors);
    } finally {
      await descriptors.cleanup();
    }
  });

  test("returns own property names and descriptor maps", async () => {
    const objectNames = await expectSuccessfulCompile("object-runtime-get-own-property-names.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(objectNames, { status: 0, stdout: "2\nhidden\nb\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(objectNames);
    } finally {
      await objectNames.cleanup();
    }

    const arrayNames = await expectSuccessfulCompile("array-runtime-get-own-property-names.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(arrayNames, { status: 0, stdout: "3\n0\n2\nlength\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(arrayNames);
    } finally {
      await arrayNames.cleanup();
    }

    const descriptors = await expectSuccessfulCompile("object-runtime-get-own-property-descriptors.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(descriptors, { status: 0, stdout: "a\ntrue\nhidden\nfalse\n2\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(descriptors);
    } finally {
      await descriptors.cleanup();
    }
  });

  test("supports runtime object literal shorthand and spread", async () => {
    const shorthand = await expectSuccessfulCompile("object-shorthand.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(shorthand, { status: 0, stdout: "1\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(shorthand);
    } finally {
      await shorthand.cleanup();
    }

    const spread = await expectSuccessfulCompile("object-spread.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(spread, { status: 0, stdout: "2\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(spread);
    } finally {
      await spread.cleanup();
    }

    const runtimeShorthand = await expectSuccessfulCompile("object-runtime-shorthand.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(runtimeShorthand, { status: 0, stdout: "x\n", stderr: "" });
    } finally {
      await runtimeShorthand.cleanup();
    }

    const overwrite = await expectSuccessfulCompile("object-runtime-spread-overwrite.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(overwrite, { status: 0, stdout: "new\n", stderr: "" });
    } finally {
      await overwrite.cleanup();
    }

    const nonenumerable = await expectSuccessfulCompile("object-runtime-spread-nonenumerable.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(nonenumerable, { status: 0, stdout: "1\nyes\nundefined\n", stderr: "" });
    } finally {
      await nonenumerable.cleanup();
    }
  });

  test("supports more callback-free runtime array methods", async () => {
    const at = await expectSuccessfulCompile("array-runtime-at.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(at, { status: 0, stdout: "a\nc\nundefined\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(at);
    } finally {
      await at.cleanup();
    }

    const lastIndexOf = await expectSuccessfulCompile("array-runtime-last-index-of.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(lastIndexOf, { status: 0, stdout: "2\n-1\n3\n", stderr: "" });
    } finally {
      await lastIndexOf.cleanup();
    }

    const copyWithin = await expectSuccessfulCompile("array-runtime-copy-within.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(copyWithin, { status: 0, stdout: "5\na\nc\nundefined\ne\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(copyWithin);
    } finally {
      await copyWithin.cleanup();
    }
  });

  test("supports variadic concat and boxed array concat arguments", async () => {
    const variadic = await expectSuccessfulCompile("array-runtime-concat-variadic.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(variadic, { status: 0, stdout: "7\na\nb\nundefined\nd\ntail\n1\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(variadic);
    } finally {
      await variadic.cleanup();
    }

    const boxed = await expectSuccessfulCompile("array-runtime-concat-boxed-array.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(boxed, { status: 0, stdout: "4\na\nb\nc\ntail\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(boxed);
    } finally {
      await boxed.cleanup();
    }
  });

  test("supports runtime array splice with removal, insertion, and negative start", async () => {
    const remove = await expectSuccessfulCompile("array-runtime-splice-remove.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(remove, { status: 0, stdout: "2\nb\nc\n2\na\nd\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(remove);
    } finally {
      await remove.cleanup();
    }

    const insert = await expectSuccessfulCompile("array-runtime-splice-insert.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(insert, { status: 0, stdout: "4\na\nx\ny\nb\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(insert);
    } finally {
      await insert.cleanup();
    }

    const negative = await expectSuccessfulCompile("array-runtime-splice-negative-start.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(negative, { status: 0, stdout: "1\nb\n2\na\nc\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(negative);
    } finally {
      await negative.cleanup();
    }
  });

  test("filters non-enumerable properties from runtime object introspection", async () => {
    const hasOwn = await expectSuccessfulCompile("object-runtime-has-own-property.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(hasOwn, { status: 0, stdout: "true\ntrue\nfalse\nfalse\n1\n1\n1\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(hasOwn);
    } finally {
      await hasOwn.cleanup();
    }

    const filtering = await expectSuccessfulCompile("object-runtime-non-enumerable-filtering.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(filtering, { status: 0, stdout: "1\n1\n1\nvisible\nv\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(filtering);
    } finally {
      await filtering.cleanup();
    }
  });

  test("supports callback-free every and some on runtime arrays", async () => {
    const result = await expectSuccessfulCompile("array-runtime-every-some.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "true\nfalse\nfalse\nfalse\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("supports Object.is with NaN, -0, +0, and value identity", async () => {
    const nanZero = await expectSuccessfulCompile("object-is-nan-zero.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(nanZero, { status: 0, stdout: "true\nfalse\nfalse\ntrue\nfalse\ntrue\nfalse\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(nanZero);
    } finally {
      await nanZero.cleanup();
    }
  });

  test("supports runtime array flat with default and zero depth", async () => {
    const flat = await expectSuccessfulCompile("array-runtime-flat.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(flat, { status: 0, stdout: "5\n1\n2\n3\n[object Array]\n[object Array]\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(flat);
    } finally {
      await flat.cleanup();
    }

    const depthZero = await expectSuccessfulCompile("array-runtime-flat-depth-zero.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(depthZero, { status: 0, stdout: "3\n1\n2\n3\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(depthZero);
    } finally {
      await depthZero.cleanup();
    }
  });

  test("converts runtime aggregates to strings", async () => {
    const cases = [
      ["string-conversion-object.ts", "[object Object]\n"],
      ["string-conversion-array.ts", "a,b,c\n"],
      ["string-conversion-nested-array.ts", "a,1,2,true\n"]
    ] as const;

    await expectNativeFixtures(cases);
  });

  test("supports Object.freeze, Object.seal, and Object.isExtensible predicates", async () => {
    const freeze = await expectSuccessfulCompile("object-runtime-freeze.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(freeze, { status: 0, stdout: "true\ntrue\nfalse\nfalse\ntrue\nfalse\nfalse\nfalse\ntrue\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(freeze);
    } finally {
      await freeze.cleanup();
    }

    const seal = await expectSuccessfulCompile("object-runtime-seal.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(seal, { status: 0, stdout: "true\nx\nnew\nfalse\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(seal);
    } finally {
      await seal.cleanup();
    }
  });

  test("supports runtime array literal spread", async () => {
    const spread = await expectSuccessfulCompile("array-runtime-spread.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(spread, { status: 0, stdout: "2\na\nb\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(spread);
    } finally {
      await spread.cleanup();
    }

    const holes = await expectSuccessfulCompile("array-runtime-spread-holes.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(holes, { status: 0, stdout: "4\nundefined\n3\n", stderr: "" });
    } finally {
      await holes.cleanup();
    }

    const mixed = await expectSuccessfulCompile("array-runtime-spread-mixed.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(mixed, { status: 0, stdout: "5\n0\na\nb\ntail\nc\n", stderr: "" });
    } finally {
      await mixed.cleanup();
    }
  });

  test("supports package V runtime array slice ranges", async () => {
    const cases = [
      ["array-runtime-slice-range.ts", "2\nb\nc\n4\na\n"],
      ["array-runtime-slice-holes.ts", "3\nundefined\nc\n"],
      ["array-runtime-slice-negative.ts", "2\nb\nb\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  });

  test("supports package W variadic runtime array concat", async () => {
    const cases = [
      ["array-runtime-concat-multiple-runtime.ts", "6\n1\n2\n3\n4\n5\n6\n"],
      ["array-runtime-concat-mixed-fixed-runtime.ts", "5\n1\n7\n9\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  });

  test("supports package X runtime array indexOf and lastIndexOf", async () => {
    const cases = [
      ["array-runtime-index-of.ts", "1\n-1\n3\n4\n5\n"],
      ["array-runtime-index-of-from-index.ts", "3\n-1\n1\n3\n"],
      ["array-runtime-index-of-holes.ts", "-1\n-1\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  });

  test("supports package Y and Z callback-free runtime array methods", async () => {
    const cases = [
      ["array-runtime-find.ts", "first\nundefined\n"],
      ["array-runtime-find-index.ts", "1\n-1\n"],
      ["array-runtime-for-each.ts", "undefined\n3\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
    await expectUnsupportedDiagnostic("array-runtime-find-unsupported-callback.ts");
    await expectUnsupportedDiagnostic("array-runtime-for-each-unsupported-callback.ts");
  });

  test("supports package BO callback-driven runtime array methods", async () => {
    const cases = [
      ["array-runtime-map-callback.ts", "3\n2\n4\n6\n"],
      ["array-runtime-map-unsupported-callback.ts", "2\n1\n2\n"],
      ["array-runtime-filter-callback.ts", "2\n2\n4\n"],
      ["array-runtime-filter-unsupported-callback.ts", "2\n1\n2\n"],
      ["array-runtime-for-each-callback.ts", "2\n5\n8\ndone\n"],
      ["array-runtime-for-each-arrow-callback.ts", "1\n2\ndone\n"],
      ["array-runtime-find-callback.ts", "2\nundefined\n"],
      ["array-runtime-find-arrow-callback.ts", "2\nundefined\n"],
      ["array-runtime-find-index-callback.ts", "1\n-1\n"],
      ["array-runtime-find-index-arrow-callback.ts", "1\n-1\n"],
      ["array-runtime-reduce-callback.ts", "16\n"],
      ["array-runtime-reduce-unsupported-callback.ts", "1\n"],
      ["array-runtime-flat-map-arrow-callback.ts", "4\n1\n11\n2\n12\n"],
      ["array-runtime-reduce-no-initial.ts", "6\n"],
      ["array-runtime-map-thisarg.ts", "2\n3\n6\n"],
      ["array-runtime-reduce-initial-not-thisarg.ts", "true\ntrue\n13\n"],
      ["array-runtime-reduce-right-initial-not-thisarg.ts", "true\ntrue\n13\n"],
      ["array-runtime-callback-thisarg-methods.ts", "6\n2\n2\n2\n2\n11\n12\n13\n6\n21\n23\n"],
      ["array-runtime-arrow-thisarg-evaluation.ts", "receiver\n2\n"],
      ["array-runtime-thisarg-strict-values.ts", "true\ntrue\ntrue\n"],
      ["array-runtime-map-thisarg-in-function.ts", "8\n"],
      ["array-runtime-map-function-value-thisarg.ts", "2\n2\n4\n"],
      ["array-runtime-for-each-function-value-thisarg.ts", "1\n2\n"],
      ["array-runtime-property-thisarg.ts", "2\n"],
      ["array-runtime-arrow-lexical-this.ts", "6\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  });

  test("supports package BP minimal Date builtin", async () => {
    const cases = [
      ["date-now-basic.ts", "true\n"],
      ["date-constructor-get-time.ts", "1234\n"],
      ["date-value-of.ts", "5678\n"],
      ["date-to-iso-string-epoch.ts", "1970-01-01T00:00:00.000Z\n"],
      ["date-parse-iso-literal.ts", "0\nNaN\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
    await expectUnsupportedDiagnostic("date-local-getters-unsupported.ts");
  });

  test("supports package BQ minimal Map and Set", async () => {
    const cases = [
      ["map-basic-set-get.ts", "0\ntrue\n1\n42\nundefined\n"],
      ["map-size-delete-has.ts", "2\ntrue\n3\ntrue\nfalse\n1\nfalse\n"],
      ["map-same-value-zero.ts", "nan\nzero\n2\nnegzero\n"],
      ["map-object-identity-keys.ts", "object\nfalse\narray\n"],
      ["map-constructor-iterable.ts", "1\n1\n"],
      ["map-constructor-user-iterable.ts", "2\n1\n2\n"],
      ["map-constructor-from-map.ts", "1\n42\n"],
      ["map-constructor-malformed-entry.ts", "TypeError\nIterator value 1 is not an entry object\n"],
      ["map-set-default-iterator.ts", "key\n42\nfalse\nvalue\nfalse\n"],
      ["collection-iterator-override.ts", "1\n9\n1\ntrue\n1\noverride\n"],
      ["gc-map-from-iterable.ts", "6000\n1\n6000\n"],
      ["set-basic-add-has.ts", "0\ntrue\n2\ntrue\nfalse\n"],
      ["set-size-delete.ts", "2\ntrue\ntrue\ntrue\nfalse\n1\n"],
      ["set-object-identity-values.ts", "true\nfalse\ntrue\n"],
      ["set-constructor-iterable.ts", "2\ntrue\nfalse\n"],
      ["set-constructor-user-iterable.ts", "2\ntrue\ntrue\nfalse\n"],
      ["set-constructor-from-set.ts", "2\ntrue\ntrue\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
    await expectUnsupportedDiagnostic("weak-map-unsupported.ts");
    await expectUnsupportedDiagnostic("weak-set-unsupported.ts");
  });

  test("supports package BR iteration and for...of", async () => {
    const cases = [
      ["for-of-array.ts", "1\n2\n3\n"],
      ["for-of-array-break-continue.ts", "1\n3\ndone\n"],
      ["for-of-runtime-array.ts", "10\n20\n30\n"],
      ["for-of-runtime-array-override.ts", "100\n101\n"],
      ["for-of-string.ts", "a\nb\nc\n"],
      ["for-of-string-unicode.ts", "a\n😀\nb\n"],
      ["for-of-set.ts", "true\nfirst\nthird\nfourth\n"],
      ["for-of-map.ts", "true\nfirst\n1\nthird\n3\nfourth\n4\n"],
      ["for-of-user-iterator.ts", "1\n2\n"],
      ["for-of-iterator-assigned.ts", "1\n2\n"],
      ["for-of-iterator-sum.ts", "15\n"],
      ["for-of-iterator-done-truthiness.ts", "10\n20\n"],
      ["for-of-class-iterator.ts", "1\n"],
      ["for-of-iterator-nested-break.ts", "1\n"],
      ["for-of-iterator-caught-throw.ts", "1\n"],
      ["for-of-iterator-missing.ts", "TypeError\niterable is not iterable\n"],
      ["for-of-iterator-non-callable.ts", "TypeError\niterable is not iterable\n"],
      ["for-of-iterator-method-primitive.ts", "TypeError\nResult of the Symbol.iterator method is not an object\n"],
      ["for-of-iterator-next-non-callable.ts", "TypeError\nnumber 1 is not a function\n"],
      ["for-of-iterator-result-primitive.ts", "TypeError\nIterator result 1 is not an object\n"],
      ["for-of-iterator-throws.ts", "from-iterator\n"],
      ["for-of-iterator-next-throws.ts", "from-next\n"],
      ["gc-for-of-user-iterator.ts", "1275\n"],
      ["gc-for-of-runtime-array.ts", "1225\n"],
      ["iterator-next-basic.ts", "only\nfalse\nundefined\ntrue\n"],
      ["builtin-array-iterator-next.ts", "1\nfalse\nundefined\nfalse\n3\nfalse\nundefined\ntrue\ntrue\n"],
      ["map-keys-values-entries.ts", "a\nfalse\nb\nfalse\ntrue\n1\nfalse\n2\nfalse\na\n1\nfalse\nb\n2\nfalse\ntrue\n"],
      ["set-keys-values-entries.ts", "x\nfalse\ny\nfalse\ntrue\nx\nfalse\ny\nfalse\nx\nx\nfalse\ny\ny\nfalse\ntrue\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
    await expectUnsupportedMessage(
      "for-of-iterator-propagated-throw-unsupported.ts",
      "Generic for...of abrupt completion requires IteratorClose, which is not supported yet"
    );
  });

  test("supports package BS string method expansion", async () => {
    const cases = [
      ["string-upper-lower-case.ts", "MIXED\nmixed\n"],
      ["string-repeat.ts", "hahaha\n\n"],
      ["string-replace-literal.ts", "1 two one\none two one\n"],
      ["string-replace-all-literal.ts", "1 two 1\n"],
      ["string-split-literal.ts", "3\na\nb\nc\n"],
      ["string-split-limit.ts", "2\na\nb\n"],
      ["string-split-empty-separator.ts", "3\na\nb\nc\n"],
      ["string-pad-start.ts", "007\na7\n"],
      ["string-pad-end.ts", "700\n7aba\n"],
      ["string-trim-start-end.ts", "hi  \n  hi\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
    await expectUnsupportedDiagnostic("string-repeat-negative-unsupported.ts");
    await expectUnsupportedDiagnostic("string-replace-regex-unsupported.ts");
  }, roadmapIntegrationTimeoutMs);

  test("supports package BT math function expansion", async () => {
    const cases = [
      ["math-log-exp.ts", "3\n1\n3\n2\n3\n"],
      ["math-hypot.ts", "5\n"],
      ["math-random.ts", "true\ntrue\n"],
      ["math-trig.ts", "1\n1\n1\n"],
      ["math-bitwise-float.ts", "1.5\n31\n-6\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
    await expectUnsupportedDiagnostic("math-unsupported-advanced.ts");
  }, roadmapIntegrationTimeoutMs);

  test("supports package AA boxed string single-character methods", async () => {
    const cases = [
      ["string-boxed-char-at.ts", "h\no\n\n"],
      ["string-boxed-char-code-at.ts", "104\n111\nNaN\n"],
      ["string-boxed-code-point-at.ts", "104\n111\nundefined\n"],
      ["string-boxed-at.ts", "h\no\nundefined\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  });

  test("supports package AB boxed string range and search methods", async () => {
    const cases = [
      ["string-boxed-slice.ts", "hello\nworld\nworld\n"],
      ["string-boxed-substring.ts", "world\nworld\nhello\n"],
      ["string-boxed-substr.ts", "world\nworld\n\n"],
      ["string-boxed-includes.ts", "true\nfalse\ntrue\n"],
      ["string-boxed-index-of.ts", "4\n7\n-1\n11\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  });

  test("supports package AC Number coercion edge cases", async () => {
    const cases = [
      ["number-coercion-empty-string.ts", "0\n"],
      ["number-coercion-whitespace.ts", "0\n3\n3.14\n"],
      ["number-coercion-radix-prefixes.ts", "31\n2\n7\n"],
      ["number-coercion-infinity-nan-string.ts", "Infinity\n-Infinity\nNaN\nNaN\n"],
      ["number-coercion-primitives.ts", "0\nNaN\n1\n0\n0\nNaN\nInfinity\n"],
      ["number-coercion-aggregates.ts", "NaN\n0\n1\nNaN\n"],
      ["number-coercion-signed-zero.ts", "-0\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  });

  test("hardens Object.fromEntries malformed entries", async () => {
    const duplicates = await expectSuccessfulCompile("object-runtime-from-entries-duplicate-keys.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(duplicates, { status: 0, stdout: "second\n1\n", stderr: "" });
    } finally {
      await duplicates.cleanup();
    }

    const malformed = await expectSuccessfulCompile("object-runtime-from-entries-malformed.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(malformed, { status: 0, stdout: "1\nyes\nundefined\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(malformed);
    } finally {
      await malformed.cleanup();
    }
  });

  test("converts runtime arrays to strings and documents scoped number edges", async () => {
    const array = await expectSuccessfulCompile("value-string-conversion-array.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(array, { status: 0, stdout: "a,,true\na,,true\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(array);
    } finally {
      await array.cleanup();
    }

    const numbers = await expectSuccessfulCompile("value-string-conversion-number-edge.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(numbers, { status: 0, stdout: "-0\ninf\n", stderr: "" });
    } finally {
      await numbers.cleanup();
    }
  });

  test("supports runtime aggregate truthiness and Array.isArray classification", async () => {
    const cases = [
      ["runtime-object-truthiness.ts", "object\n"],
      ["runtime-array-truthiness.ts", "empty array\nfilled array\n"],
      ["runtime-aggregate-negated-truthiness.ts", "done\n"],
      ["array-is-array-number.ts", "false\n"],
      ["array-is-array-string.ts", "false\n"],
      ["array-is-array-fixed.ts", "true\n"],
      ["array-is-array-literals.ts", "false\nfalse\nfalse\nfalse\n"],
      ["array-is-array-runtime-and-fixed.ts", "true\ntrue\n"]
    ] as const;

    await expectNativeFixtures(cases);
  });

  test("bridges fixed objects and descriptor maps into runtime helpers", async () => {
    const cases = [
      ["object-keys-fixed.ts", ""],
      ["object-values-fixed.ts", "1\n"],
      ["object-fixed-keys-values-entries.ts", "2\na\nb\n1\n2\n2\na\n1\n"],
      ["object-fixed-own-property-descriptor.ts", "1\ntrue\ntrue\ntrue\nundefined\n"],
      ["object-define-properties-shorthand.ts", ""],
      ["object-define-properties-spread.ts", ""],
      ["object-define-properties-spread-overwrite.ts", "new\n"],
      ["object-define-properties-shorthand-observable.ts", "x\n1\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  });

  test("supports defaulted array ranges and fixed-array materialization bridges", async () => {
    const cases = [
      ["array-runtime-reverse-extra-arg.ts", "a\n"],
      ["array-runtime-noarg-extra-arguments.ts", "c\na\n2\nc\n1\n"],
      ["array-runtime-defaulted-ranges.ts", "3\nundefined\n2\na\nx\nx\na\na\nb\nc\n"],
      ["array-spread.ts", "1\n"],
      ["array-fixed-spread-multiple.ts", "5\n0\n1\n2\n3\n4\n"],
      ["array-runtime-concat-fixed.ts", "4\n"],
      ["array-runtime-concat-fixed-values.ts", "4\na\n1\n2\ntail\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  });

  test("supports runtime array named string properties", async () => {
    const cases = [
      ["array-runtime-string-key-leading-zero.ts", "undefined\n"],
      ["array-runtime-string-key-negative.ts", "undefined\n"],
      ["array-runtime-string-key-fraction.ts", "undefined\n"],
      ["array-runtime-named-string-properties.ts", "1\nzero\nleading\nnegative\nfraction\ntrue\nfalse\nundefined\n"],
      ["array-runtime-named-string-keys-order.ts", "3\n2\nname\n01\n"],
      ["array-runtime-named-string-values-entries.ts", "4\nzero\ntwo\nnamed\nleading\n4\n0\nzero\n2\ntwo\nname\nnamed\n01\nleading\n"],
      ["array-runtime-named-string-descriptors.ts", "5\n0\n2\nlength\nname\n01\nnamed\ntrue\ntrue\ntrue\nnamed\nleading\n"],
      ["array-runtime-named-string-delete-introspection.ts", "2\nzero\nkept\n2\nkeep\n3\n0\nlength\nkeep\nundefined\nfalse\ntrue\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  });

  test("bridges Object.assign sources into runtime object targets", async () => {
    const cases = [
      ["object-assign-runtime-from-fixed.ts", "1\nb\n"],
      ["object-assign-runtime-from-array.ts", "zero\nnamed\nfalse\n"],
      ["object-assign-runtime-from-boxed-aggregates.ts", "object\nzero\narray\n"],
      ["object-assign-runtime-source-order.ts", "2\nfirst-b\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  });

  test("promotes fixed aggregate mutation targets", async () => {
    const cases = [
      ["array-fixed-push.ts", "2\n2\n"],
      ["array-fixed-promoted-unshift.ts", "2\n0\n1\n"],
      ["object-assign-fixed.ts", "1\n2\n"],
      ["object-fixed-promoted-assign-overwrite.ts", "3\n2\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  });

  test("supports descriptor boolean identifiers", async () => {
    const cases = [
      ["object-define-property-dynamic-boolean.ts", "true\n"],
      ["object-define-properties-dynamic-boolean.ts", "1\nvalue\n"],
      ["object-define-property-boolean-identifiers.ts", "1\n1\nfalse\ntrue\nfalse\n"],
      ["object-define-properties-boolean-identifiers.ts", "1\n1\nfalse\ntrue\nfalse\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  });

  test("supports array mutation expression return values", async () => {
    const cases = [
      ["array-runtime-push-unshift-return-values.ts", "2\n3\nb\nz\n1\n"],
      ["array-runtime-mutator-chain-return-array.ts", "c\nc\nx\nx\n"],
      ["array-runtime-pop-shift-return-extra-args.ts", "b\na\n0\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  });

  test("handles prototype edges for named runtime array properties", async () => {
    const cases = [
      ["array-runtime-named-string-prototype-fallback.ts", "proto\nfalse\nown\ntrue\nproto\nfalse\n"],
      ["array-runtime-named-string-prototype-introspection.ts", "1\n1\n2\nname\n2\nown\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  });

  test("supports scoped JSValue coercion, comparisons, Math, parsing, and runtime string methods", async () => {
    const cases = [
      ["value-plus-string-coercion.ts", "a1\ntrue!\nnullx\nundefinedx\n"],
      ["value-plus-number-coercion.ts", "3\n1\n0\nNaN\n"],
      ["value-plus-aggregate-coercion.ts", "a,b!\n[object Object]!\n"],
      ["value-loose-equality-primitives.ts", "true\nfalse\ntrue\ntrue\nfalse\n"],
      ["value-loose-equality-string-number.ts", "true\ntrue\nfalse\n"],
      ["value-relational-string-number.ts", "true\ntrue\nfalse\nfalse\n"],
      ["value-relational-string-lexicographic.ts", "true\ntrue\nfalse\n"],
      ["boolean-coercion-supported-values.ts", "false\nfalse\nfalse\nfalse\nfalse\nfalse\ntrue\ntrue\ntrue\ntrue\ntrue\n"],
      ["logical-and-or-value-results.ts", "fallback\nvalue\n0\nright\n"],
      ["math-basic-number-functions.ts", "3\n2\n3\n2\n3\n4\n8\n-1\n"],
      ["math-min-max-variadic.ts", "2\n1\n3\n4\nInfinity\n-Infinity\n"],
      ["math-constants.ts", "true\ntrue\n"],
      ["number-is-nan-finite.ts", "true\nfalse\ntrue\nfalse\nfalse\nfalse\n"],
      ["global-is-nan-coercion.ts", "true\nfalse\ntrue\nfalse\n"],
      ["parse-int-decimal.ts", "-42\n17\n5\n"],
      ["parse-float-decimal.ts", "-4.5\n3.25\n"],
      ["number-to-fixed.ts", "3.14\n3\n"],
      ["number-to-precision.ts", "12.35\n12\n"],
      ["number-to-exponential.ts", "1.23e+1\n1.234500e+1\n"],
      ["number-to-string-radix.ts", "255\nff\n11111111\n"],
      ["number-parse-int-float.ts", "42\n3.5\n"],
      ["number-is-integer-safe.ts", "true\nfalse\ntrue\nfalse\nfalse\n"],
      ["number-constants.ts", "9007199254740991\n-9007199254740991\ntrue\ntrue\ntrue\n"],
      ["string-runtime-search-methods.ts", "true\ntrue\ntrue\n4\n-1\n"],
      ["string-runtime-trim-methods.ts", "hi\nhi  \n  hi\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  }, roadmapIntegrationTimeoutMs);

  test("preserves unsupported roadmap diagnostics", async () => {
    await Promise.all([
      "number-to-fixed-range-error-unsupported.ts",
      "number-to-locale-string-unsupported.ts",
      "parse-int-radix-unsupported.ts",
      "array-runtime-map-noarg-unsupported.ts",
      "error-constructor-unsupported.ts",
      "try-finally-unsupported.ts"
    ].map(async (fixture) => expectUnsupportedDiagnostic(fixture)));
  });

  test("supports throw across function boundaries via aggregate ABI", async () => {
    const result = await expectSuccessfulCompile("throw-across-function-unsupported.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(result, { status: 1, stdout: "message\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("supports switch statements with fall-through and break", async () => {
    const cases = [
      ["switch-basic.ts", "20\n"],
      ["switch-fall-through.ts", "3\n"],
      ["switch-default.ts", "30\n"],
      ["switch-no-match.ts", "7\n"],
      ["switch-default-not-last.ts", "5\n"],
      ["switch-break.ts", "1\n"],
      ["switch-nested.ts", "12\n"],
      ["switch-expression-cases.ts", "31\n"],
      ["switch-empty-case.ts", "2\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  }, roadmapIntegrationTimeoutMs);

  test("supports bitwise operators, updates, and compound assignments", async () => {
    const cases = [
      ["bitwise-and-or-xor.ts", "2\n5\n4\n"],
      ["bitwise-not.ts", "-1\n-6\n"],
      ["bitwise-shift-left-right.ts", "12\n-4\n"],
      ["bitwise-unsigned-right-shift.ts", "4.29497e+09\n2.14748e+09\n"],
      ["increment-prefix-postfix.ts", "1\n2\n3\n3\n"],
      ["decrement-prefix-postfix.ts", "3\n2\n1\n1\n"],
      ["compound-assign-bitwise.ts", "2\n6\n7\n28\n14\n7\n"],
      ["compound-assign-arithmetic.ts", "15\n12\n24\n6\n2\n"],
      ["increment-in-expression.ts", "4\n3\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  }, roadmapIntegrationTimeoutMs);

  test("supports expanded runtime array factories and callbacks", async () => {
    const cases = [
      ["array-sort-default.ts", "3\n1\n10\n2\n"],
      ["array-sort-comparator.ts", "3\n2\n1\n"],
      ["array-flat-map.ts", "4\n1\n1\n2\n2\n"],
      ["array-from-array-like.ts", "2\na\nb\n"],
      ["array-from-array-like-map.ts", "2\n6\n8\n"],
      ["array-from-symbol-iterator.ts", "2\n0\n1\n"],
      ["array-from-prefers-iterator.ts", "2\nv0\nv1\n"],
      ["array-from-iterable-map-thisarg.ts", "2\n3\n7\n"],
      ["gc-array-from-iterable.ts", "12000\n0\n11999\n"],
      ["array-from-errors.ts", "undefined is not iterable (cannot read property Symbol(Symbol.iterator))\nobject null is not iterable (cannot read property Symbol(Symbol.iterator))\nnumber 1 is not a function\n"],
      ["array-of.ts", "3\na\n1\ntrue\n"],
      ["array-reduce-right.ts", "cba\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  }, roadmapIntegrationTimeoutMs);

  test("supports first explicit throw and catch groundwork", async () => {
    const caught = await expectSuccessfulCompile("try-catch-throw-primitives.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(caught, { status: 0, stdout: "message\n42\ntrue\nnull\nundefined\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(caught);
    } finally {
      await caught.cleanup();
    }

    const thrown = await expectSuccessfulCompile("throw-string-top-level.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(thrown, { status: 1, stdout: "message\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(thrown);
    } finally {
      await thrown.cleanup();
    }
  });

  test("supports Error constructor objects with message, name, and toString", async () => {
    const cases = [
      ["error-constructor-message.ts", "boom\nError\ncall form\nError\n\nError\n"],
      ["error-constructor-nonstring-message.ts", "42\nnull\ntrue\n"],
      ["error-to-string.ts", "Error: boom\n"],
      ["error-to-string-empty-message.ts", "Error\n"],
      ["error-throw-and-recatch.ts", "boom\nError\nError: boom\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  }, roadmapIntegrationTimeoutMs);

  test("supports instanceof for runtime error objects", async () => {
    const cases = [
      ["instanceof-error-positive.ts", "true\ntrue\n"],
      ["instanceof-error-negative.ts", "false\nfalse\nfalse\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });

    await Promise.all([
      expectUnsupportedMessage("instanceof-primitive-unsupported.ts", "instanceof on primitive values is not supported"),
      expectUnsupportedMessage("instanceof-non-constructor-unsupported.ts", "instanceof right-hand sides are only supported for built-in error constructors")
    ]);
  }, roadmapIntegrationTimeoutMs);

  test("supports typeof for bound identifiers across supported value kinds", async () => {
    const cases = [
      ["typeof-primitives.ts", "undefined\nboolean\nnumber\nstring\nfunction\nobject\n"],
      ["typeof-runtime-aggregates.ts", "object\nobject\nobject\nobject\nobject\n"],
      ["typeof-function.ts", "function\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  }, roadmapIntegrationTimeoutMs);

  test("supports optional chaining and nullish coalescing", async () => {
    const cases = [
      ["nullish-coalesce.ts", "fallback\n7\n0\ndefault\n"],
      ["nullish-coalesce-lazy.ts", "value\nevaluated\nfb\n"],
      ["optional-chain-member.ts", "x\nundefined\nundefined\n"],
      ["optional-chain-short-circuit.ts", "undefined\ndeep\nundefined\n"],
      ["optional-chain-element.ts", "a\nundefined\nv\n"],
      ["optional-chain-call.ts", "undefined\nError: boom\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });

    const write = await compileFixture("optional-chain-write-unsupported.ts");
    try {
      expect(write.status).not.toBe(0);
      expect(write.stderr).toContain("error TS");
    } finally {
      await write.cleanup();
    }
  }, roadmapIntegrationTimeoutMs);

  test("supports computed property names and dynamic object keys", async () => {
    const cases = [
      ["object-computed-key-literal.ts", "v1\nv2\n"],
      ["object-computed-key-expression.ts", "v1\nv2\nv3\n"],
      ["object-bracket-assign-dynamic.ts", "v1\nv2\nfilled\norig\nten\n"],
      ["object-bracket-delete-dynamic.ts", "undefined\n2\n"],
      ["object-define-property-dynamic-key.ts", "dv\ndv2\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });
  }, roadmapIntegrationTimeoutMs);

  test("supports array and object destructuring patterns", async () => {
    const cases = [
      ["destructure-array-literal.ts", "a\nb\nc\ndirect\n10\n20\n"],
      ["destructure-object-literal.ts", "ex\nwhy\n1\n2\n"],
      ["destructure-array-rest.ts", "a\n3\nb\nd\n"],
      ["destructure-object-rest.ts", "1\n2\n2\n3\n"],
      ["destructure-defaults.ts", "1\nhello\n7\nset\nused\n"],
      ["destructure-rename.ts", "val\no\n"],
      ["destructure-nested.ts", "deep\nt\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });

    await expectUnsupportedDiagnostic("destructure-computed-key-unsupported.ts");
  }, roadmapIntegrationTimeoutMs);

  test("supports built-in error subclass constructors", async () => {
    const cases = [
      ["error-type-error.ts", "wrong type\nTypeError\nTypeError: wrong type\n"],
      ["error-range-error.ts", "out of range\nRangeError\nEvalError\nURIError\n"],
      ["error-instanceof-subclass.ts", "true\ntrue\nfalse\nfalse\ntrue\n"],
      ["error-subclass-throw-catch.ts", "true\ntrue\nnope\nTypeError: nope\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });

    await expectUnsupportedDiagnostic("error-stack-unsupported.ts");
  }, roadmapIntegrationTimeoutMs);

  test("supports JSON.stringify for primitives, arrays, and objects", async () => {
    const cases = [
      ["json-stringify-primitives.ts", '"a"\n1\ntrue\nnull\nnull\nnull\nundefined\n'],
      ["json-stringify-array.ts", '[1,"two",true,null]\n[]\n["a",null,"c"]\n'],
      [
        "json-stringify-object.ts",
        '{"a":1,"b":"x","c":true,"d":null}\n{"inner":{"k":"v"},"num":2}\n{"k":"v"}\n{}\n{"text":"say \\"hi\\"\\n"}\n'
      ],
      ["json-stringify-replacer-array.ts", '{"keep":"yes","n":1}\n'],
      ["json-stringify-indent.ts", '{\n  "a": 1,\n  "c": {\n    "d": "v"\n  }\n}\n[\n  1,\n  "x"\n]\n']
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });

    const cycle = await expectSuccessfulCompile("json-stringify-cycle-throws.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(cycle, {
        status: 1,
        stdout: "TypeError: Converting circular structure to JSON\n",
        stderr: ""
      });
    } finally {
      await cycle.cleanup();
    }
  }, roadmapIntegrationTimeoutMs);

  test("supports JSON.parse for compile-time string inputs", async () => {
    const cases = [
      ["json-parse-primitives.ts", "text\n42\n-1.5\ntrue\nnull\n"],
      ["json-parse-array.ts", "4\na\n2\nfalse\nnull\n"],
      ["json-parse-object.ts", "v\n7\ntrue\ntwo\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });

    const malformed = await expectSuccessfulCompile("json-parse-malformed-throws.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(malformed, {
        status: 1,
        stdout: "SyntaxError: Unexpected token in JSON\n",
        stderr: ""
      });
    } finally {
      await malformed.cleanup();
    }

    const dynamic = await expectSuccessfulCompile("json-parse-dynamic-unsupported.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(dynamic, { status: 0, stdout: "[object Object]\n", stderr: "" });
    } finally {
      await dynamic.cleanup();
    }
  }, roadmapIntegrationTimeoutMs);

  test("supports RegExp literals and literal-only RegExp construction", async () => {
    const cases = [
      ["regex-literal-test.ts", "true\nfalse\ntrue\n"],
      ["regex-literal-exec.ts", "a-b\n2\ntrue\n"],
      ["regex-literal-global-last-index.ts", "true\n2\ntrue\n4\n"],
      ["regex-string-match.ts", "123\n"],
      ["regex-flags-and-source.ts", "foo\ngi\ntrue\ntrue\nfalse\nfalse\n0\n"],
      ["regex-constructor-literal.ts", "true\nfoo\ni\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });

    await Promise.all([
      expectUnsupportedMessage("regex-constructor-dynamic-unsupported.ts", "Dynamic RegExp constructor arguments are not supported"),
      expectUnsupportedMessage("regex-nonascii-unsupported.ts", "RegExp support is limited to ASCII")
    ]);
  }, roadmapIntegrationTimeoutMs);

  test("supports minimal class declarations, prototype identity, fields, and accessors", async () => {
    const cases = [
      ["class-basic-method.ts", "42\n"],
      ["class-constructor.ts", "7\n"],
      ["class-instance-method-call.ts", "7\nhi\n"],
      ["class-static-method.ts", "hi\n"],
      ["class-extends-super-constructor.ts", "9\n"],
      ["class-instanceof-basic.ts", "true\n"],
      ["class-instanceof-inheritance.ts", "true\ntrue\nfalse\n"],
      ["class-prototype-method-lookup.ts", "5\nfalse\n"],
      ["class-prototype-identity.ts", "true\ntrue\n"],
      ["class-instanceof-plain-object.ts", "false\nfalse\nfalse\n"],
      ["class-public-field.ts", "3\n"],
      ["class-field-order.ts", "ab\n"],
      ["class-static-field.ts", "4\n"],
      ["class-getter-setter.ts", "3\n8\n"],
      ["class-accessor-prototype-lookup.ts", "6\n"]
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });

    await Promise.all([
      expectUnsupportedMessage("class-expression-unsupported.ts", "Class expressions are not supported"),
      expectUnsupportedMessage("class-private-field-unsupported.ts", "Private class fields are not supported"),
      expectUnsupportedMessage("class-computed-field-unsupported.ts", "Computed class members are not supported")
    ]);

    const nonConstructor = await expectSuccessfulCompile("class-instanceof-non-constructor-unsupported.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(nonConstructor, { status: 1, stdout: "TypeError: notConstructor is not a function. (evaluating 'new C() instanceof notConstructor')\n", stderr: "" });
    } finally {
      await nonConstructor.cleanup();
    }
  }, roadmapIntegrationTimeoutMs);

  test("supports runtime JSON parse, catchable JSON errors, and toJSON", async () => {
    const cases = [
      ["json-parse-runtime-string.ts", "tsc\n"],
      ["json-parse-runtime-object.ts", "1\ntrue\n"],
      ["json-parse-runtime-array.ts", "1\ntwo\nnull\n"],
      ["json-parse-runtime-malformed-catch.ts", "SyntaxError\ntrue\n"],
      ["json-stringify-cycle-catch.ts", "TypeError\ntrue\n"],
      ["json-stringify-to-json.ts", '{"x":2}\n']
    ] as const;

    await expectNativeFixtures(cases, { verifyLlvm: true });

    await expectUnsupportedMessage("json-parse-reviver-unsupported.ts", "JSON.parse reviver functions are not supported");
  }, roadmapIntegrationTimeoutMs);

  test("emits nested runtime helper dependencies once", async () => {
    const result = await expectSuccessfulCompile("value-string-conversion-array.ts");
    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(countOccurrences(llvmIr, "define ptr @arrayJoin")).toBe(1);
      expect(countOccurrences(llvmIr, "define ptr @objectEntries")).toBe(0);
      expect(countOccurrences(llvmIr, "define { ptr, i64 } @valueToString")).toBe(1);
      expect(countOccurrences(llvmIr, "declare ptr @malloc(i64)")).toBe(1);
    } finally {
      await result.cleanup();
    }

    const entries = await expectSuccessfulCompile("object-runtime-from-entries.ts");
    try {
      const llvmIr = await entries.readArtifact("main.ll");
      expect(countOccurrences(llvmIr, "define ptr @objectEntries")).toBe(1);
      expect(countOccurrences(llvmIr, "define ptr @objectFromEntries")).toBe(1);
    } finally {
      await entries.cleanup();
    }
  });
});
