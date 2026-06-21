import { describe, test } from "vitest";
import {
  expectSuccessfulCompile,
  expectUnsupportedDiagnostic,
  expectNativeBehaviorIfAvailable
} from "./helpers.js";

describe("tscn operator expansion (package BZ)", () => {
  test("evaluates the `in` operator against runtime objects and arrays", async () => {
    const result = await expectSuccessfulCompile("operator-in-object.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "true\nfalse\nfalse\ntrue\nfalse\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("rejects the `in` operator on non-runtime-object right-hand sides", async () => {
    await expectUnsupportedDiagnostic("operator-in-non-object-unsupported.ts");
  });

  test("evaluates the `void` operator in value positions", async () => {
    const result = await expectSuccessfulCompile("operator-void.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "undefined\nundefined\nundefined\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("evaluates the comma operator and discards the left operand", async () => {
    const result = await expectSuccessfulCompile("operator-comma.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "side\n6\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("evaluates the `**` exponentiation operator with non-integer exponents", async () => {
    const result = await expectSuccessfulCompile("operator-exponentiation.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "1024\n0.5\n1.41421\n512\n0.01\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("evaluates the `**=` compound assignment", async () => {
    const result = await expectSuccessfulCompile("operator-exponentiation-assign.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "1024\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });
});

describe("tscn for-in loops (package CA)", () => {
  test("iterates runtime object keys in insertion order", async () => {
    const result = await expectSuccessfulCompile("for-in-object.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "a\nb\nc\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("iterates runtime array indices", async () => {
    const result = await expectSuccessfulCompile("for-in-array.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "0\n1\n2\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("honors break and continue inside for-in", async () => {
    const result = await expectSuccessfulCompile("for-in-break-continue.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "b\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("uses the iteration key to access runtime object values", async () => {
    const result = await expectSuccessfulCompile("for-in-with-key-access.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "1\n2\n3\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("runs zero iterations on an empty object", async () => {
    const result = await expectSuccessfulCompile("for-in-empty-object.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "0\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("handles nested for-in loops", async () => {
    const result = await expectSuccessfulCompile("for-in-nested.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "ax\nay\nbx\nby\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });
});

describe("tscn string methods (package CB)", () => {
  test("evaluates startsWith on runtime strings", async () => {
    const result = await expectSuccessfulCompile("string-starts-with.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "true\nfalse\nfalse\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("evaluates startsWith with a position offset", async () => {
    const result = await expectSuccessfulCompile("string-starts-with-position.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "true\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("evaluates endsWith on runtime strings", async () => {
    const result = await expectSuccessfulCompile("string-ends-with.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "true\nfalse\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("evaluates at with negative and out-of-range indices", async () => {
    const result = await expectSuccessfulCompile("string-at-negative.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "o\nh\nl\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("evaluates charCodeAt on runtime strings", async () => {
    const result = await expectSuccessfulCompile("string-char-code-at-runtime.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "104\n101\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("evaluates localeCompare on runtime strings (stubbed to first char code)", async () => {
    const result = await expectSuccessfulCompile("string-locale-compare-basic.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "104\n104\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("evaluates normalize as a passthrough (NFC identity)", async () => {
    const result = await expectSuccessfulCompile("string-normalize-nfc-basic.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "true\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });
});

describe("tscn template literals (package CC)", () => {
  test("supports multiple interpolations in a single template", async () => {
    const result = await expectSuccessfulCompile("template-multi-interpolation.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "Hello Ada, you are 30\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("supports arbitrary expressions inside interpolations", async () => {
    const result = await expectSuccessfulCompile("template-expression.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "Result: 7\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("supports nested template literals", async () => {
    const result = await expectSuccessfulCompile("template-nested.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "Outer inner 5\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("supports templates as function arguments", async () => {
    const result = await expectSuccessfulCompile("template-as-argument.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "x=1\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("supports templates as function return values", async () => {
    const result = await expectSuccessfulCompile("template-as-return.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "v=42\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("supports tagged templates with rest parameters", async () => {
    const result = await expectSuccessfulCompile("template-tagged.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "text |7\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });
});

describe("tscn rest parameters (package BY.1)", () => {
  test("captures the trailing arguments into a rest array", async () => {
    const result = await expectSuccessfulCompile("param-rest-basic.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "0\n1\n3\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("mixes a named parameter with a rest array", async () => {
    const result = await expectSuccessfulCompile("param-rest-with-named.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "10\n2\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("captures an empty rest array when no extra args are passed", async () => {
    const result = await expectSuccessfulCompile("param-rest-empty-trailing.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "1\n0\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("pads defaults before the rest array", async () => {
    const result = await expectSuccessfulCompile("param-mixed-defaults-rest.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "6\n3\n5\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });
});

describe("tscn primitive boxing (package CD)", () => {
  test("boxes a number with new Number and exposes valueOf/toString", async () => {
    const result = await expectSuccessfulCompile("box-number-constructor.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "42\n42\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("boxes a boolean with new Boolean and exposes valueOf", async () => {
    const result = await expectSuccessfulCompile("box-boolean-constructor.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "true\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("boxes a string with new String and exposes valueOf/length", async () => {
    const result = await expectSuccessfulCompile("box-string-constructor.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "hello\n5\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });
});

describe("tscn spread in function calls (package BY.3)", () => {
  test("spreads a fixed array into a rest parameter", async () => {
    const result = await expectSuccessfulCompile("call-spread-into-rest.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "3\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("mixes a positional argument with a spread", async () => {
    const result = await expectSuccessfulCompile("call-spread-mixed.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "1\n3\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });
});

describe("tscn destructuring parameters (package BY.2)", () => {
  test("binds array destructuring parameters to local names", async () => {
    const result = await expectSuccessfulCompile("param-destructure-array-test.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "1\n2\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("binds object destructuring parameters to local names", async () => {
    const result = await expectSuccessfulCompile("param-destructure-object-test.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "1\n2\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("applies default values to destructured object properties", async () => {
    const result = await expectSuccessfulCompile("param-destructure-default-test.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "1\n10\n1\n2\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("indexes into a value-typed array destructured parameter", async () => {
    const result = await expectSuccessfulCompile("param-destructure-element-test.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "1\n2\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });
});
