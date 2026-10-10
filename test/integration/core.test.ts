import { describe, expect, test } from "vitest";
import {
  countOccurrences,
  expectLlvmAsVerificationIfAvailable,
  expectNativeBehaviorIfAvailable,
  expectSuccessfulCompile,
  expectUnsupportedDiagnostic
} from "./helpers.js";
import { expectNativeMatchesNodeIfAvailable } from "./oracle.js";
import {
  argumentCounts,
  bindingGlobals,
  blockNames,
  buildTypedFixture,
  calleeNames,
  callsTo,
  declaredNames,
  floatingPointBinaries,
  floatingPointComparisons,
  floatingPointNegations,
  foldedComparisons,
  generatedFunctions,
  integerBinaries,
  loadsFrom,
  mainFunction,
  phiCount,
  requireBlock,
  shortCircuitBlocks,
  soleGeneratedFunction,
  storesTo,
  successorsOf,
  ternaryJoins
} from "./typed-module.js";

/** Check native results against Node and structural properties against the typed graph. */

describe("tscn numeric conditions and bindings", () => {
  test("lowers numeric strict equality in if conditions", async () => {
    const { module } = await buildTypedFixture("if-number-strict-equality.ts");
    const main = mainFunction(module);

    expect(foldedComparisons(main)).toEqual([["oeq", "3.0", "3.0"]]);
    expect(blockNames(main)).toEqual(["entry", "if.then", "if.else", "if.end"]);

    await expectNativeMatchesNodeIfAvailable("if-number-strict-equality.ts");
  });

  test("preserves numeric expression shape in strict equality conditions", async () => {
    const { module } = await buildTypedFixture("if-number-expression-strict-equality.ts");
    const main = mainFunction(module);

    // `1 + 2 === 3`: the addition is its own instruction feeding the comparison, not folded into it.
    expect(floatingPointBinaries(main)).toEqual([["fadd", "1.0", "2.0"]]);
    expect(floatingPointComparisons(main)).toEqual([["oeq", "floatingPointBinary", "3.0"]]);

    await expectNativeMatchesNodeIfAvailable("if-number-expression-strict-equality.ts");
  });

  test("crosses unified binding model through const expression, condition, and print", async () => {
    const { module } = await buildTypedFixture("const-number-expression-if-print.ts");
    const main = mainFunction(module);

    // One binding holds `n`. It is written by the initializer and read by the comparison, and both
    // arms print through the same boxed value path.
    expect(loadsFrom(main, "tscn.binding.0")).toHaveLength(1);
    // The initializer and the compared value are both the addition, and neither operand of the
    // comparison is a literal, so nothing was folded into `3` before the branch.
    expect(floatingPointBinaries(main)).toEqual([["fadd", "1.0", "2.0"], ["fadd", "1.0", "2.0"]]);
    expect(foldedComparisons(main)).toEqual([]);
    expect(floatingPointComparisons(main)).toEqual([["oeq", "floatingPointBinary", "3.0"]]);
    expect(calleeNames(requireBlock(main, "if.then"))).toContain("valuePrint");
    expect(calleeNames(requireBlock(main, "if.else"))).toContain("valuePrint");

    await expectNativeMatchesNodeIfAvailable("const-number-expression-if-print.ts");
  });

  test("lowers numeric strict inequality (!==) in if conditions", async () => {
    const { module } = await buildTypedFixture("if-number-not-strict-equality.ts");

    expect(foldedComparisons(mainFunction(module))).toEqual([["une", "1.0", "2.0"]]);

    await expectNativeMatchesNodeIfAvailable("if-number-not-strict-equality.ts");
  });

  test("lowers numeric less-than (<) in if conditions", async () => {
    const { module } = await buildTypedFixture("if-number-less-than.ts");

    expect(foldedComparisons(mainFunction(module))).toEqual([["olt", "1.0", "2.0"]]);

    await expectNativeMatchesNodeIfAvailable("if-number-less-than.ts");
  });

  test("lowers numeric less-than-or-equal (<=) in if conditions", async () => {
    const { module } = await buildTypedFixture("if-number-less-than-or-equal.ts");

    expect(foldedComparisons(mainFunction(module))).toEqual([["ole", "2.0", "2.0"]]);

    await expectNativeMatchesNodeIfAvailable("if-number-less-than-or-equal.ts");
  });

  test("lowers numeric greater-than (>) in if conditions", async () => {
    const { module } = await buildTypedFixture("if-number-greater-than.ts");

    expect(foldedComparisons(mainFunction(module))).toEqual([["ogt", "2.0", "1.0"]]);

    await expectNativeMatchesNodeIfAvailable("if-number-greater-than.ts");
  });

  test("lowers numeric greater-than-or-equal (>=) in if conditions", async () => {
    const { module } = await buildTypedFixture("if-number-greater-than-or-equal.ts");

    expect(foldedComparisons(mainFunction(module))).toEqual([["oge", "2.0", "2.0"]]);

    await expectNativeMatchesNodeIfAvailable("if-number-greater-than-or-equal.ts");
  });

  test("preserves unary negation shape in print calls", async () => {
    const { module } = await buildTypedFixture("number-unary-negation-print.ts");

    expect(floatingPointNegations(mainFunction(module))).toEqual(["42.0"]);

    await expectNativeMatchesNodeIfAvailable("number-unary-negation-print.ts");
  });

  test("preserves unary negation shape for const number bindings used by print", async () => {
    const { module } = await buildTypedFixture("const-number-unary-negation-print.ts");

    // `const value = 3` resolves to the literal, but the negation is still its own instruction rather
    // than a `-3.0` folded into the print.
    expect(floatingPointNegations(mainFunction(module))).toEqual(["3.0"]);

    await expectNativeMatchesNodeIfAvailable("const-number-unary-negation-print.ts");
  });
});

describe("tscn function declarations and calls", () => {
  test("lowers function declarations and calls (no params, no return)", async () => {
    const { module } = await buildTypedFixture("function-call.ts");

    expect(generatedFunctions(module)).toHaveLength(1);
    expect(argumentCounts(mainFunction(module), "jsCall")).toEqual(["0"]);
    expect(calleeNames(soleGeneratedFunction(module))).toContain("valuePrint");

    await expectNativeMatchesNodeIfAvailable("function-call.ts");
  });

  test("lowers function parameters and calls with arguments", async () => {
    const { module } = await buildTypedFixture("function-params.ts");

    // Both arguments cross the boundary boxed, and the callee restores the number from its boxed form
    // rather than receiving a double.
    expect(argumentCounts(mainFunction(module), "jsCall")).toEqual(["2"]);
    // Each parameter is presence-checked against `argc` and read out of `argv`, then converted back to
    // a number, the stored binding is a double, so the restore is what turns a boxed value into one.
    expect(calleeNames(soleGeneratedFunction(module))).toContain("valueToNumber");
    expect(blockNames(soleGeneratedFunction(module)).filter((name) => name.startsWith("parameter.join"))).toHaveLength(2);

    await expectNativeMatchesNodeIfAvailable("function-params.ts");
  });

  test("lowers return statements and captures call results in expressions", async () => {
    const { module } = await buildTypedFixture("function-return.ts");

    // The callee completes with a payload rather than returning it directly, so the print belongs to
    // `main` and not to the callee.
    expect(calleeNames(soleGeneratedFunction(module))).not.toContain("valuePrint");
    expect(calleeNames(mainFunction(module))).toContain("valuePrint");

    await expectNativeMatchesNodeIfAvailable("function-return.ts");
  });

  test("lowers bare return statements as undefined in function declarations", async () => {
    const result = await expectSuccessfulCompile("function-bare-return.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "positive\nnot positive\nundefined\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("lowers bare return statements as undefined in class methods", async () => {
    const result = await expectSuccessfulCompile("class-method-bare-return.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "positive\nundefined\nnot positive\nundefined\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("lowers recursive functions without a separate declaration", async () => {
    const { module } = await buildTypedFixture("function-recursive.ts");

    // Recursion re-enters through the callable, so `fib` is one generated function that reaches itself
    // twice, `fib(n - 1)` and `fib(n - 2)`, rather than a declaration plus a separate definition.
    const fib = soleGeneratedFunction(module);
    expect(argumentCounts(fib, "jsCall")).toEqual(["1", "1"]);
    expect(declaredNames(module).filter((name) => name.startsWith("tscn."))).toEqual([]);

    await expectNativeMatchesNodeIfAvailable("function-recursive.ts");
  });

  test("lowers function references to top-level const bindings", async () => {
    const { module } = await buildTypedFixture("function-captures-top-level-const.ts");

    // The call supplies no arguments, so `42` can only reach `getX` as a module global.
    expect(argumentCounts(mainFunction(module), "jsCall")).toEqual(["0"]);
    expect(loadsFrom(soleGeneratedFunction(module), "tscn.binding.0")).toHaveLength(1);

    await expectNativeMatchesNodeIfAvailable("function-captures-top-level-const.ts");
  });

  test("emits definitions for nested function declarations", async () => {
    const { module } = await buildTypedFixture("nested-function-declaration.ts");

    // `outer` and its nested `identity` are two generated functions, and the outer one reaches the
    // inner one through a callable rather than a direct call.
    expect(generatedFunctions(module)).toHaveLength(2);
    expect(calleeNames(generatedFunctions(module)[0])).toContain("jsCall");

    await expectNativeMatchesNodeIfAvailable("nested-function-declaration.ts");
  });

  test("resolves a nested declaration's binding to the nearest enclosing scope", async () => {
    // This fixture used to be rejected outright with "captures unsupported enclosing bindings".
    // Closures are lowered now, so what it asserts is the scoping that made the diagnostic
    // unreachable: `captured` prints its own shadowing `value`, then returns the parameter.
    const result = await expectSuccessfulCompile("nested-function-capture.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "shadowed\n42\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("gives each nested function its own body when two declare the same name", async () => {
    // This fixture used to be reported as a duplicate definition. Two `sameName` declarations in
    // sibling functions are distinct in JavaScript, so each is lowered into its own generated
    // function and `first()` prints 1 while `second()` prints 2.
    const result = await expectSuccessfulCompile("nested-function-duplicate.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "1\n2\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("emits nested functions declared beside try/catch", async () => {
    const { module } = await buildTypedFixture("nested-function-in-try.ts");

    // Three enclosing functions, each with one nested declaration: `f`/`innerf`, `g`/`fromTry`, and
    // `h`/`fromOuter`.
    expect(generatedFunctions(module)).toHaveLength(6);

    await expectNativeMatchesNodeIfAvailable("nested-function-in-try.ts");
  });

  test("lowers calls to exported functions from imported modules", async () => {
    // Not in the Node oracle: Node resolves `./exported-function.js` to a file that does not exist,
    // so there is no Node run to compare against and the expected output is the one the exported
    // function's own source prints.
    const { module } = await buildTypedFixture("import-function-call.ts");

    expect(generatedFunctions(module)).toHaveLength(1);
    expect(calleeNames(soleGeneratedFunction(module))).toContain("valuePrint");

    const result = await expectSuccessfulCompile("import-function-call.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "from exported function\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("lowers imported function calls used as print expressions", async () => {
    // Not in the Node oracle for the same reason as the export above: the import does not resolve.
    const { module } = await buildTypedFixture("import-function-expression.ts");

    // Two boxed arguments go in, and the completion payload is unwrapped and printed by `main`.
    expect(argumentCounts(mainFunction(module), "jsCall")).toEqual(["2"]);
    expect(calleeNames(mainFunction(module))).toContain("valuePrint");

    const result = await expectSuccessfulCompile("import-function-expression.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "3\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("lowers mutual recursion across imported modules", async () => {
    // Not in the Node oracle: the import does not resolve.
    const { module } = await buildTypedFixture("import-mutual-recursion.ts");

    // Both halves of the recursion are defined in the module and each reaches the other through a
    // callable, so neither is left as a bare declaration.
    expect(generatedFunctions(module)).toHaveLength(2);
    for (const fn of generatedFunctions(module)) {
      expect(calleeNames(fn)).toContain("jsCall");
    }

    const result = await expectSuccessfulCompile("import-mutual-recursion.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "1\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("lowers returned closures with captured numeric parameters", async () => {
    const { module } = await buildTypedFixture("returning-closure.ts");
    const main = mainFunction(module);

    // `n` leaves its frame with the closure: the factory writes it into a new environment and the
    // adder reads it back through the `env` parameter it was called with.
    const [factory, adder] = generatedFunctions(module);
    expect(calleeNames(factory)).toContain("environmentNew");
    expect(calleeNames(adder)).toContain("environmentGet");
    expect(calleeNames(main)).toContain("jsCall");

    const result = await expectSuccessfulCompile("returning-closure.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "8\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("calls named functions through first-class values", async () => {
    const { module } = await buildTypedFixture("function-value-variable-call.ts");
    const main = mainFunction(module);

    expect(calleeNames(main)).toContain("functionObjectNew");
    expect(calleeNames(main)).toContain("jsCall");

    const result = await expectSuccessfulCompile("function-value-variable-call.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "5\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("calls arrow functions through first-class values", async () => {
    const { module } = await buildTypedFixture("function-value-arrow-call.ts");
    const main = mainFunction(module);

    // An arrow function is lowered to a generated thunk with no declaration a call site could name,
    // so it is reached through its callable.
    expect(generatedFunctions(module)).toHaveLength(1);
    expect(calleeNames(main)).toContain("jsCall");

    await expectNativeMatchesNodeIfAvailable("function-value-arrow-call.ts");
  });

  test("passes and calls first-class function arguments", async () => {
    await expectNativeMatchesNodeIfAvailable("function-value-argument-call.ts");
  });

  test("stores and calls function values through object properties", async () => {
    await expectNativeMatchesNodeIfAvailable("function-value-property-call.ts");
  });

  test("captures strings in returned function values", async () => {
    await expectNativeMatchesNodeIfAvailable("function-value-string-closure.ts");
  });

  test("keeps closure environments independent between factory calls", async () => {
    await expectNativeMatchesNodeIfAvailable("function-value-independent-closures.ts");
  });

  test("passes the receiver as this for function-valued property calls", async () => {
    await expectNativeMatchesNodeIfAvailable("function-value-method-this.ts");
  });

  test("materializes stable function identity", async () => {
    await expectNativeMatchesNodeIfAvailable("function-value-identity.ts");
  });

  test("constructs plain functions only when they unconditionally return an object", async () => {
    const result = await expectSuccessfulCompile("function-constructor-object-return.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "7\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
    await expectUnsupportedDiagnostic("function-constructor-this-unsupported.ts");
    await expectUnsupportedDiagnostic("function-constructor-mutable-return-unsupported.ts");
  });

  test("rejects unsupported catch binding patterns", async () => {
    await expectUnsupportedDiagnostic("catch-destructure-unsupported.ts");
  });

  test("lowers string function parameters through the boxed ABI", async () => {
    const { module } = await buildTypedFixture("function-string-param.ts");
    const greet = soleGeneratedFunction(module);

    // The string crosses the boundary boxed and is restored into a byte pointer plus a length.
    expect(argumentCounts(mainFunction(module), "jsCall")).toEqual(["1"]);
    expect(calleeNames(greet)).toContain("valueStringPtr");
    expect(calleeNames(greet)).toContain("strConcat");

    const result = await expectSuccessfulCompile("function-string-param.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "hello Ada\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("lowers string function returns through a completion payload", async () => {
    const { module } = await buildTypedFixture("function-string-return.ts");

    // `suffix` completes with a boxed string; `main` concatenates it onto the accumulator.
    expect(calleeNames(soleGeneratedFunction(module))).toContain("valueCopyString");
    expect(calleeNames(mainFunction(module))).toContain("strConcat");

    const result = await expectSuccessfulCompile("function-string-return.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "hi!\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("lowers branches inside string function bodies", async () => {
    const { module } = await buildTypedFixture("function-string-branch.ts");
    const greet = soleGeneratedFunction(module);

    // A string comparison in a branch goes through the content helper, not a pointer comparison.
    expect(calleeNames(greet)).toContain("strEquals");
    expect(blockNames(greet)).toContain("if.then");

    const result = await expectSuccessfulCompile("function-string-branch.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "hello Ada\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("pads default numeric parameters at the call site", async () => {
    const { module } = await buildTypedFixture("param-default-basic.ts");

    // `add(1)` and `add(3, 4)` both supply two arguments: the default is evaluated at the call site.
    expect(argumentCounts(mainFunction(module), "jsCall")).toEqual(["2", "2"]);

    const result = await expectSuccessfulCompile("param-default-basic.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "11\n7\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("pads trailing defaults independently of the prefix arguments", async () => {
    const result = await expectSuccessfulCompile("param-default-multiple.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "51\n33\n6\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });
});

describe("tscn loops", () => {
  /**
   * A lowered loop is a fixed group of blocks: `loop.header` tests the condition, `loop.body` runs the
   * body, `loop.step` runs the update, `loop.exhausted` restores the frame, and `loop.end` is the
   * exit. Nested loops repeat the group with a numeric suffix, which is what makes `break` and
   * `continue` targets observable without reading the emitter's temporary names.
   */
  const loweredLoop = ["loop.header", "loop.body", "loop.step", "loop.exhausted", "loop.end"];

  test("lowers while loops with mutable numeric bindings", async () => {
    const { module } = await buildTypedFixture("while-loop.ts");
    const main = mainFunction(module);

    expect(blockNames(main)).toEqual(["entry", ...loweredLoop]);
    expect(floatingPointComparisons(main, "loop.header")).toEqual([["olt", "load", "5.0"]]);
    // The counter is one binding, read by the condition, by the print, and by the update.
    expect(loadsFrom(main, "tscn.binding.0")).toHaveLength(3);

    await expectNativeMatchesNodeIfAvailable("while-loop.ts");
  });

  test("lowers unbraced while loop bodies with update expressions", async () => {
    const result = await expectSuccessfulCompile("while-unbraced-increment.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "3\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("lowers for loops with initializer, condition, and increment", async () => {
    const { module } = await buildTypedFixture("for-loop.ts");
    const main = mainFunction(module);

    expect(blockNames(main)).toEqual(["entry", ...loweredLoop]);
    // The increment is written back in `loop.step`, so the counter is stored exactly twice: the
    // initializer and the increment.
    expect(storesTo(requireBlock(main, "loop.step"), "tscn.binding.0")).toHaveLength(1);
    expect(storesTo(requireBlock(main, "entry"), "tscn.binding.0")).toHaveLength(1);

    await expectNativeMatchesNodeIfAvailable("for-loop.ts");
  });

  test("lowers unbraced for loop bodies", async () => {
    const result = await expectSuccessfulCompile("for-single-statement-body.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "0\n1\n2\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("lowers unbraced for-of loop bodies", async () => {
    await expectNativeMatchesNodeIfAvailable("for-of-single-statement-body.ts");
  });

  test("lowers unbraced for-in loop bodies", async () => {
    await expectNativeMatchesNodeIfAvailable("for-in-single-statement-body.ts");
  });

  test("lowers break statements to the current loop exit", async () => {
    const { module } = await buildTypedFixture("while-break.ts");
    const main = mainFunction(module);

    // The `break` sits two blocks deep inside `if.then`; the edge still lands on the loop exit rather
    // than on the enclosing `if.end`.
    expect(successorsOf(requireBlock(main, "if.then"))).toEqual(["loop.end"]);

    await expectNativeMatchesNodeIfAvailable("while-break.ts");
  });

  test("lowers continue statements to the current for-loop increment", async () => {
    const { module } = await buildTypedFixture("for-continue.ts");
    const main = mainFunction(module);

    // `continue` skips the body and lands on the increment, so the counter still advances.
    expect(successorsOf(requireBlock(main, "if.then"))).toEqual(["loop.step"]);

    await expectNativeMatchesNodeIfAvailable("for-continue.ts");
  });
});

describe("tscn var declarations and unbraced if bodies", () => {
  test("lowers simple var declarations through the let path", async () => {
    const result = await expectSuccessfulCompile("var-declaration.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "2\nhello\ntrue\n0\n1\n2\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("merges same-scope var redeclarations into assignments", async () => {
    const result = await expectSuccessfulCompile("var-redeclaration.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "false\ntrue\nsecond\n2\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("never matches NaN in switch cases and compares -0 as equal to 0", async () => {
    const result = await expectSuccessfulCompile("switch-nan-strict-equality.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "default\nfalse\ntrue\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("lowers unbraced if and else bodies", async () => {
    const { module } = await buildTypedFixture("if-single-statement-body.ts");
    const main = mainFunction(module);

    // An unbraced `if`/`else` pair still produces both arms. The trailing unbraced `if` has no else,
    // so its else arm is empty and still joins at `if.end.1`.
    expect(blockNames(main)).toEqual(["entry", "if.then", "if.else", "if.end", "if.then.1", "if.else.1", "if.end.1"]);
    expect(calleeNames(requireBlock(main, "if.then"))).toContain("valuePrint");
    expect(calleeNames(requireBlock(main, "if.else.1"))).not.toContain("valuePrint");

    const result = await expectSuccessfulCompile("if-single-statement-body.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "greater\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });
});

describe("tscn logical operators", () => {
  const shortCircuit = ["condition.logical.yes", "condition.logical.no", "condition.logical.join"];

  test("lowers logical not in if conditions", async () => {
    const { module } = await buildTypedFixture("if-not-condition.ts");
    const main = mainFunction(module);

    // `!flag` is a comparison of the loaded bit against zero, and it introduces no blocks of its own.
    expect(integerBinaries(main)).toEqual([["xor", "0", "1"]]);
    expect(blockNames(main)).toEqual(["entry", "if.then", "if.else", "if.end"]);

    await expectNativeMatchesNodeIfAvailable("if-not-condition.ts");
  });

  test("lowers logical and in if conditions with short-circuit blocks", async () => {
    const { module } = await buildTypedFixture("if-and-condition.ts");
    const main = mainFunction(module);

    // `&&` tests the left operand first; the right one is reached only from the true edge.
    expect(shortCircuitBlocks(main)).toEqual(shortCircuit);
    expect(floatingPointComparisons(main)).toEqual([["olt", "7.0", "10.0"], ["ogt", "9.0", "5.0"]]);
    expect(floatingPointComparisons(main, "condition.logical.yes")).toEqual([["ogt", "9.0", "5.0"]]);
    expect(floatingPointComparisons(main, "condition.logical.no")).toEqual([]);

    await expectNativeMatchesNodeIfAvailable("if-and-condition.ts");
  });

  test("lowers logical or in if conditions with short-circuit blocks", async () => {
    const { module } = await buildTypedFixture("if-or-condition.ts");
    const main = mainFunction(module);

    // `||` is the mirror: the right operand is reached only from the false edge.
    expect(shortCircuitBlocks(main)).toEqual(shortCircuit);
    expect(floatingPointComparisons(main)).toEqual([["oeq", "1.0", "0.0"], ["oeq", "0.0", "0.0"]]);
    expect(floatingPointComparisons(main, "condition.logical.yes")).toEqual([]);
    expect(floatingPointComparisons(main, "condition.logical.no")).toEqual([["oeq", "0.0", "0.0"]]);

    await expectNativeMatchesNodeIfAvailable("if-or-condition.ts");
  });

  test("prints const bindings initialized from logical expressions", async () => {
    const { module } = await buildTypedFixture("const-logical-expression.ts");
    const main = mainFunction(module);

    // The result is materialized into its own binding so it can be printed as a boolean, which is
    // why a third binding exists beyond the two operands.
    expect(shortCircuitBlocks(main)).toEqual(shortCircuit);
    expect(loadsFrom(main, "tscn.binding.2")).toHaveLength(1);
    expect(calleeNames(main)).toContain("valuePrint");

    await expectNativeMatchesNodeIfAvailable("const-logical-expression.ts");
  });
});

describe("tscn rich expressions", () => {
  test("lowers numeric ternary expressions to a joined value", async () => {
    const { module } = await buildTypedFixture("numeric-ternary.ts");
    const main = mainFunction(module);

    // A numeric ternary is a conditional branch into a join block that carries one phi of the arms.
    expect(ternaryJoins(main)).toEqual(["number.ternary.join"]);
    expect(phiCount(requireBlock(main, "number.ternary.join"))).toBe(1);
    expect(floatingPointComparisons(main)).toEqual([["ogt", "12.0", "10.0"]]);

    await expectNativeMatchesNodeIfAvailable("numeric-ternary.ts");
  });

  test("lowers string ternary expressions through branch-selected values", async () => {
    const { module } = await buildTypedFixture("string-ternary.ts");
    const main = mainFunction(module);

    // Both arms materialize their string and the join picks one before it reaches the binding, which
    // is why that binding needs an owner registered as a GC root.
    expect(ternaryJoins(main)).toEqual(["string.ternary.join"]);
    expect(phiCount(requireBlock(main, "string.ternary.join"))).toBe(1);
    expect(calleeNames(requireBlock(main, "string.ternary.yes"))).toContain("valueCopyString");
    expect(calleeNames(requireBlock(main, "string.ternary.no"))).toContain("valueCopyString");

    await expectNativeMatchesNodeIfAvailable("string-ternary.ts");
  });

  test("preserves runtime string ternary output", async () => {
    await expectNativeMatchesNodeIfAvailable("runtime-string-ternary.ts", { verifyLlvm: true });
  });

  test("folds const string strict equality in if conditions", async () => {
    const { module } = await buildTypedFixture("if-string-strict-equality.ts");
    const main = mainFunction(module);

    // Two byte-identical literals need no content comparison at run time.
    expect(calleeNames(main)).not.toContain("strEquals");
    expect(calleeNames(requireBlock(main, "if.then"))).toContain("valuePrint");

    await expectNativeMatchesNodeIfAvailable("if-string-strict-equality.ts");
  });

  test("folds const string strict inequality in if conditions", async () => {
    const { module } = await buildTypedFixture("if-string-not-strict-equality.ts");
    const main = mainFunction(module);

    expect(calleeNames(main)).not.toContain("strEquals");
    expect(calleeNames(requireBlock(main, "if.then"))).toContain("valuePrint");

    await expectNativeMatchesNodeIfAvailable("if-string-not-strict-equality.ts");
  });
});

describe("tscn string mutation", () => {
  test("lowers mutable string bindings and literal reassignment", async () => {
    const { module } = await buildTypedFixture("let-string-reassignment.ts");
    const main = mainFunction(module);

    // One string binding, stored as a byte pointer, a length, and a GC owner that is registered as a
    // module root so the value survives its writer.
    expect(bindingGlobals(module)).toEqual(["tscn.binding.0.owner", "tscn.binding.0.bytes", "tscn.binding.0.length"]);
    expect(calleeNames(main)).toContain("gcRegisterGlobalRoot");

    await expectNativeMatchesNodeIfAvailable("let-string-reassignment.ts");
  });

  test("carries mutable string bindings through for-loop assignment", async () => {
    const { module } = await buildTypedFixture("let-string-loop.ts");
    const main = mainFunction(module);

    // The binding is written inside `loop.body` and read again after `loop.end`.
    expect(storesTo(requireBlock(main, "loop.body"), "tscn.binding.0.bytes")).toHaveLength(1);
    expect(loadsFrom(main, "tscn.binding.0.owner").length).toBeGreaterThan(0);

    await expectNativeMatchesNodeIfAvailable("let-string-loop.ts");
  });
});

describe("tscn nested loop control", () => {
  test("targets inner for-loop exit for nested break", async () => {
    const { module } = await buildTypedFixture("nested-for-inner-break.ts");
    const main = mainFunction(module);

    // Two nested loops, so the inner group carries a suffix; `break` must target `loop.end.1`.
    expect(successorsOf(requireBlock(main, "if.then"))).toEqual(["loop.end.1"]);
    expect(blockNames(main)).toContain("loop.step.1");

    await expectNativeMatchesNodeIfAvailable("nested-for-inner-break.ts");
  });

  test("targets the inner loop's increment for nested continue", async () => {
    const { module } = await buildTypedFixture("nested-while-inner-continue.ts");
    const main = mainFunction(module);

    // The inner loop carries its own increment block, so `continue` targets `loop.step.1`.
    expect(successorsOf(requireBlock(main, "if.then"))).toEqual(["loop.step.1"]);

    await expectNativeMatchesNodeIfAvailable("nested-while-inner-continue.ts");
  });

  test("lowers break inside if inside for to the for-loop exit", async () => {
    const { module } = await buildTypedFixture("for-if-break.ts");

    expect(successorsOf(requireBlock(mainFunction(module), "if.then"))).toEqual(["loop.end"]);

    await expectNativeMatchesNodeIfAvailable("for-if-break.ts");
  });
});

describe("tscn do while loops", () => {
  test("lowers do-while loops with body before condition", async () => {
    const { module } = await buildTypedFixture("do-while-loop.ts");
    const main = mainFunction(module);

    // A do-while enters the body directly: there is no condition on the way in, so the header falls
    // straight through to `loop.body`.
    expect(successorsOf(requireBlock(main, "loop.header"))).toEqual(["loop.body"]);
    // The condition is tested after the update and branches back to the header.
    expect(successorsOf(requireBlock(main, "loop.step"))).toEqual(["loop.header", "loop.end"]);
    expect(floatingPointComparisons(main, "loop.step")).toEqual([["olt", "load", "3.0"]]);

    await expectNativeMatchesNodeIfAvailable("do-while-loop.ts");
  });
});

describe("tscn boolean mutation", () => {
  test("lowers mutable boolean bindings and reassignment", async () => {
    const { module } = await buildTypedFixture("let-boolean-reassignment.ts");
    const main = mainFunction(module);

    // The binding is one slot, written true then false and read back for each print.
    expect(bindingGlobals(module)).toEqual(["tscn.binding.0"]);
    expect(loadsFrom(main, "tscn.binding.0")).toHaveLength(2);

    await expectNativeMatchesNodeIfAvailable("let-boolean-reassignment.ts");
  });

  test("uses mutable boolean bindings in if conditions", async () => {
    const { module } = await buildTypedFixture("let-boolean-if.ts");
    const main = mainFunction(module);

    // The branch condition is the loaded bit: one load, and no comparison against anything.
    expect(loadsFrom(main, "tscn.binding.0")).toHaveLength(1);
    expect(blockNames(main)).toEqual(["entry", "if.then", "if.else", "if.end"]);

    await expectNativeMatchesNodeIfAvailable("let-boolean-if.ts");
  });
});

describe("tscn runtime strings", () => {
  test("lowers string concat assignment to a runtime helper call", async () => {
    const { module } = await buildTypedFixture("string-concat-assign.ts");
    const main = mainFunction(module);

    // Concatenation goes through the runtime helper and writes all three string slots back.
    expect(calleeNames(main)).toContain("strConcat");
    expect(bindingGlobals(module)).toEqual(["tscn.binding.0.owner", "tscn.binding.0.bytes", "tscn.binding.0.length"]);

    await expectNativeMatchesNodeIfAvailable("string-concat-assign.ts");
  });

  test("passes runtime string lengths through variables and repeated concat", async () => {
    const prefix = await buildTypedFixture("string-concat-prefix.ts");
    const repeated = await buildTypedFixture("string-concat-repeated.ts");

    // Each concatenation loads the live length rather than re-deriving it from the byte pointer.
    expect(callsTo(mainFunction(prefix.module), "strConcat")).toHaveLength(1);
    expect(callsTo(mainFunction(repeated.module), "strConcat")).toHaveLength(2);
    expect(storesTo(mainFunction(repeated.module), "tscn.binding.0.length")).toHaveLength(3);

    await expectNativeMatchesNodeIfAvailable("string-concat-prefix.ts");
    await expectNativeMatchesNodeIfAvailable("string-concat-repeated.ts");
  });

  test("carries string concat assignment through loops", async () => {
    const { module } = await buildTypedFixture("string-concat-loop.ts");
    const main = mainFunction(module);

    expect(calleeNames(requireBlock(main, "loop.body"))).toContain("strConcat");
    expect(storesTo(requireBlock(main, "loop.body"), "tscn.binding.0.bytes")).toHaveLength(1);

    await expectNativeMatchesNodeIfAvailable("string-concat-loop.ts");
  });

  test("emits each runtime helper exactly once, ahead of the generated functions", async () => {
    // The helpers are Static Runtime IR, a stable artifact the module copies verbatim rather than
    // generated naming, so their count and relative order are asserted on the emitted text.
    const result = await expectSuccessfulCompile("string-helper-ordering.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(countOccurrences(llvmIr, "declare ptr @malloc(i64)")).toBe(1);
      expect(countOccurrences(llvmIr, "define ptr @strConcat")).toBe(1);
      expect(countOccurrences(llvmIr, "define i1 @strEquals")).toBe(1);
      expect(llvmIr.indexOf("declare ptr @malloc(i64)")).toBeLessThan(llvmIr.indexOf("define ptr @strConcat"));
      expect(llvmIr.indexOf("define ptr @strConcat")).toBeLessThan(llvmIr.indexOf("define i1 @strEquals"));

      // The fixture declares exactly one function, and it runs, so the helpers precede the only
      // generated body. Verifying the module is what makes the ordering above load-bearing: a use
      // before its definition would not assemble.
      const { module } = await buildTypedFixture("string-helper-ordering.ts");
      expect(generatedFunctions(module)).toHaveLength(1);
      await expectLlvmAsVerificationIfAvailable(result);
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "ab\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });
});

describe("tscn call targets", () => {
  test("throws a TypeError instead of dereferencing a non-function property", async () => {
    const result = await expectSuccessfulCompile("call-non-function-property-throws.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, {
        status: 1,
        stdout: "TypeError: value is not a function\n",
        stderr: ""
      });
    } finally {
      await result.cleanup();
    }
  });
});

describe("tscn erasure forms", () => {
  test("lowers an accessor field to a readable value", async () => {
    // Not in the Node oracle: Node 22's type stripper rejects the `accessor` keyword with a
    // `SyntaxError` before running anything, so there is no Node output to compare against. The
    // expected value is what the specification says the field reads back as, and the manifest test
    // still asserts the form is admitted, this is the check that backs it.
    const result = await expectSuccessfulCompile("form-admitted-accessor-keyword.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "1\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("lowers a namespace to the object of its exports", async () => {
    // Not in the Node oracle for the same reason as `accessor`: Node's strip-only mode rejects a
    // `namespace` declaration outright, so there is no Node output to compare against. The expected
    // values are the ones an equivalent object literal produces under Node, which is exactly what the
    // desugaring claims to be, and the manifest test still asserts the form is admitted.
    const result = await expectSuccessfulCompile("form-admitted-namespace-declaration.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "1\ntext\n42\n3\n15\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("lowers an enum to the object holding both mappings", async () => {
    // Not in the Node oracle: its strip-only mode rejects an `enum` with a SyntaxError before running
    // anything, since an enum is a construct rather than an erasure. The expected values were produced by
    // compiling this fixture with tsc and running the result under Node, so they are what TypeScript's own
    // emit produces, including the reverse mappings, the negative value and the shared-value quirk.
    const result = await expectSuccessfulCompile("form-admitted-enum-declaration.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, {
        status: 0,
        stdout: "0\nA\n2\nC\n5\nX\n6\nY\ns\ns\n5\nB\n6\nC\n-1\nDown\n1\n0.5\nHalf\n1\nSecond\n3\na-b\n",
        stderr: ""
      });
    } finally {
      await result.cleanup();
    }
  });

  test("stores a constructor parameter property onto the instance", async () => {
    // Not in the Node oracle: its strip-only mode rejects a parameter property with a SyntaxError before
    // running anything, since declaring a field from a parameter needs transformation. The expected values
    // are what the equivalent hand-written constructor produces under Node, which is the desugaring.
    const result = await expectSuccessfulCompile("form-admitted-parameter-property.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "7\n1xtrue\n7\n8\n101\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });
});