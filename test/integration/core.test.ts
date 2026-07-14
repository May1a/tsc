import { describe, expect, test } from "vitest";
import {
  expectSuccessfulCompile,
  expectNativeBehaviorIfAvailable,
  countOccurrences
} from "./helpers.js";

describe("tscn numeric conditions and bindings", () => {
  test("lowers numeric strict equality in if conditions", async () => {
    const result = await expectSuccessfulCompile("if-number-strict-equality.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%cmp.0 = fcmp oeq double 3.0, 3.0");
      expect(llvmIr).toContain("br i1 %cmp.0, label %if.then.0, label %if.end.0");
      expect(llvmIr).toContain(String.raw`c"yes\00"`);
    } finally {
      await result.cleanup();
    }
  });

  test("preserves numeric expression shape in strict equality conditions", async () => {
    const result = await expectSuccessfulCompile("if-number-expression-strict-equality.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%num.0 = fadd double 1.0, 2.0");
      expect(llvmIr).toContain("%cmp.0 = fcmp oeq double %num.0, 3.0");
      expect(llvmIr).toContain("br i1 %cmp.0, label %if.then.0, label %if.else.0");
      expect(llvmIr).toContain(String.raw`c"yes\00"`);
      expect(llvmIr).toContain(String.raw`c"no\00"`);
    } finally {
      await result.cleanup();
    }
  });

  test("crosses unified binding model through const expression, condition, and print", async () => {
    const result = await expectSuccessfulCompile("const-number-expression-if-print.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%num.0 = fadd double 1.0, 2.0");
      expect(llvmIr).toContain("%cmp.0 = fcmp oeq double %num.0, 3.0");
      expect(llvmIr).toContain("br i1 %cmp.0, label %if.then.0, label %if.else.0");
      expect(llvmIr).toContain("if.then.0:");
      expect(llvmIr).toContain("%num.1 = fadd double 1.0, 2.0");
      expect(llvmIr).toContain("call i32 (ptr, ...) @printf(ptr @.fmt.number, double %num.1)");
      expect(llvmIr).toContain("if.else.0:");
      expect(llvmIr).toContain("call i32 (ptr, ...) @printf(ptr @.fmt.number, double 0.0)");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers numeric strict inequality (!==) in if conditions", async () => {
    const result = await expectSuccessfulCompile("if-number-not-strict-equality.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%cmp.0 = fcmp one double 1.0, 2.0");
      expect(llvmIr).toContain("br i1 %cmp.0, label %if.then.0, label %if.end.0");
      expect(llvmIr).toContain(String.raw`c"different\00"`);
    } finally {
      await result.cleanup();
    }
  });

  test("lowers numeric less-than (<) in if conditions", async () => {
    const result = await expectSuccessfulCompile("if-number-less-than.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%cmp.0 = fcmp olt double 1.0, 2.0");
      expect(llvmIr).toContain("br i1 %cmp.0, label %if.then.0, label %if.end.0");
      expect(llvmIr).toContain(String.raw`c"less\00"`);
    } finally {
      await result.cleanup();
    }
  });

  test("lowers numeric less-than-or-equal (<=) in if conditions", async () => {
    const result = await expectSuccessfulCompile("if-number-less-than-or-equal.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%cmp.0 = fcmp ole double 2.0, 2.0");
      expect(llvmIr).toContain("br i1 %cmp.0, label %if.then.0, label %if.end.0");
      expect(llvmIr).toContain(String.raw`c"less or equal\00"`);
    } finally {
      await result.cleanup();
    }
  });

  test("lowers numeric greater-than (>) in if conditions", async () => {
    const result = await expectSuccessfulCompile("if-number-greater-than.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%cmp.0 = fcmp ogt double 2.0, 1.0");
      expect(llvmIr).toContain("br i1 %cmp.0, label %if.then.0, label %if.end.0");
      expect(llvmIr).toContain(String.raw`c"greater\00"`);
    } finally {
      await result.cleanup();
    }
  });

  test("lowers numeric greater-than-or-equal (>=) in if conditions", async () => {
    const result = await expectSuccessfulCompile("if-number-greater-than-or-equal.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%cmp.0 = fcmp oge double 2.0, 2.0");
      expect(llvmIr).toContain("br i1 %cmp.0, label %if.then.0, label %if.end.0");
      expect(llvmIr).toContain(String.raw`c"greater or equal\00"`);
    } finally {
      await result.cleanup();
    }
  });

  test("preserves unary negation shape in print calls", async () => {
    const result = await expectSuccessfulCompile("number-unary-negation-print.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%num.0 = fneg double 42.0");
      expect(llvmIr).toContain("call i32 (ptr, ...) @printf(ptr @.fmt.number, double %num.0)");
    } finally {
      await result.cleanup();
    }
  });

  test("preserves unary negation shape for const number bindings used by print", async () => {
    const result = await expectSuccessfulCompile("const-number-unary-negation-print.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%num.0 = fneg double 3.0");
      expect(llvmIr).toContain("call i32 (ptr, ...) @printf(ptr @.fmt.number, double %num.0)");
    } finally {
      await result.cleanup();
    }
  });
});

describe("tscn function declarations and calls", () => {
  test("lowers function declarations and calls (no params, no return)", async () => {
    const result = await expectSuccessfulCompile("function-call.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define void @greet()");
      expect(llvmIr).toContain("call void @greet()");
      expect(llvmIr).toContain(String.raw`c"hello from function\00"`);
    } finally {
      await result.cleanup();
    }
  });

  test("lowers function parameters and calls with arguments", async () => {
    const result = await expectSuccessfulCompile("function-params.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define void @add(i64 %p0, i64 %p1)");
      expect(llvmIr).toContain("%p0.num = call double @valueNumber(i64 %p0)");
      expect(llvmIr).toContain("%num.0 = fadd double %p0.num, %p1.num");
      expect(llvmIr).toContain("%arg.num.0 = call i64 @valueBoxNumber(double 1.0)");
      expect(llvmIr).toContain("call void @add(i64 %arg.num.0, i64 %arg.num.1)");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers return statements and captures call results in expressions", async () => {
    const result = await expectSuccessfulCompile("function-return.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define i64 @double(i64 %p0)");
      expect(llvmIr).toContain("%arg.num.0 = call i64 @valueBoxNumber(double 3.0)");
      expect(llvmIr).toContain("%call.0 = call i64 @double(i64 %arg.num.0)");
      expect(llvmIr).toContain("ret i64 %ret.num.");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers recursive functions with forward declarations", async () => {
    const result = await expectSuccessfulCompile("function-recursive.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).not.toContain("declare i64 @fib(i64)");
      expect(llvmIr).toContain("define i64 @fib(i64 %p0)");
      expect(llvmIr).toContain("call i64 @fib(i64 %arg.num.");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers function references to top-level const bindings", async () => {
    const result = await expectSuccessfulCompile("function-captures-top-level-const.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define void @getX()");
      expect(llvmIr).toContain("call i32 (ptr, ...) @printf(ptr @.fmt.number, double 42.0)");
      expect(llvmIr).toContain("call void @getX()");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers calls to exported functions from imported modules", async () => {
    const result = await expectSuccessfulCompile("import-function-call.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define void @foo()");
      expect(llvmIr).toContain(String.raw`c"from exported function\00"`);
      expect(llvmIr).toContain("call void @foo()");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers imported function calls used as print expressions", async () => {
    const result = await expectSuccessfulCompile("import-function-expression.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define i64 @add(i64 %p0, i64 %p1)");
      expect(llvmIr).toContain("%call.0 = call i64 @add(i64 %arg.num.0, i64 %arg.num.1)");
      expect(llvmIr).toContain("call i32 (ptr, ...) @printf(ptr @.fmt.number, double %call.0.num)");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers mutual recursion across imported modules with forward declarations", async () => {
    const result = await expectSuccessfulCompile("import-mutual-recursion.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).not.toContain("declare i64 @isEven(i64)");
      expect(llvmIr).not.toContain("declare i64 @isOdd(i64)");
      expect(llvmIr).toContain("define i64 @isEven(i64 %p0)");
      expect(llvmIr).toContain("define i64 @isOdd(i64 %p0)");
      expect(llvmIr).toContain("call i64 @isOdd(i64 %arg.num.");
      expect(llvmIr).toContain("call i64 @isEven(i64 %arg.num.");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers returned closures with captured numeric parameters", async () => {
    const result = await expectSuccessfulCompile("returning-closure.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("call ptr @environmentNew(i64 1)");
      expect(llvmIr).toContain("call i64 @environmentGet(ptr %env, i64 0)");
      expect(llvmIr).toContain("call i64 @jsCall(");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "8\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("calls named functions through first-class values", async () => {
    const result = await expectSuccessfulCompile("function-value-variable-call.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("call i64 @functionObjectNew(");
      expect(llvmIr).toContain("call i64 @jsCall(");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "5\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("calls arrow functions through first-class values", async () => {
    const result = await expectSuccessfulCompile("function-value-arrow-call.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define i64 @__tscn_fnobj_");
      expect(llvmIr).toContain("call i64 @jsCall(");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "12\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("passes and calls first-class function arguments", async () => {
    const result = await expectSuccessfulCompile("function-value-argument-call.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "5\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("stores and calls function values through object properties", async () => {
    const result = await expectSuccessfulCompile("function-value-property-call.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "7\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("captures strings in returned function values", async () => {
    const result = await expectSuccessfulCompile("function-value-string-closure.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "hello Ada\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("keeps closure environments independent between factory calls", async () => {
    const result = await expectSuccessfulCompile("function-value-independent-closures.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "3\n12\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("passes the receiver as this for function-valued property calls", async () => {
    const result = await expectSuccessfulCompile("function-value-method-this.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "7\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("materializes stable function identity", async () => {
    const result = await expectSuccessfulCompile("function-value-identity.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "true\nfunction\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("lowers string function parameters through pointer and length arguments", async () => {
    const result = await expectSuccessfulCompile("function-string-param.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define void @greet(i64 %p0)");
      expect(llvmIr).toContain("%p0.ptr = call ptr @valueStringPtr(i64 %p0)");
      expect(llvmIr).toContain("%arg.str.0 = call i64 @valueBoxString(ptr @.str.2, i64 3)");
      expect(llvmIr).toContain("call void @greet(i64 %arg.str.0)");
      expect(llvmIr).toContain("call ptr @strConcat(i64 6, ptr @.str.");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers string function returns through a string pair result", async () => {
    const result = await expectSuccessfulCompile("function-string-return.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define i64 @suffix()");
      expect(llvmIr).toContain("%call.0 = call i64 @suffix()");
      expect(llvmIr).toContain("%call.0.ptr = call ptr @valueStringPtr(i64 %call.0)");
      expect(llvmIr).toContain("ret i64 %ret.str.");
      expect(llvmIr).toContain("call ptr @strConcat");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers branches inside string function bodies", async () => {
    const result = await expectSuccessfulCompile("function-string-branch.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define void @greet(i64 %p0)");
      expect(llvmIr).toContain("%p0.ptr = call ptr @valueStringPtr(i64 %p0)");
      expect(llvmIr).toContain("call i1 @strEquals(i64 %str.len.");
      expect(llvmIr).toContain("br i1 %cmp.0, label %if.then.0, label %if.else.0");
    } finally {
      await result.cleanup();
    }
  });

  test("pads default numeric parameters at the call site", async () => {
    const result = await expectSuccessfulCompile("param-default-basic.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define void @add(i64 %p0, i64 %p1)");
      expect(llvmIr).toContain("call void @add(i64 %arg.num.0, i64 %arg.num.1)");
      expect(llvmIr).toContain("call void @add(i64 %arg.num.2, i64 %arg.num.3)");
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
  test("lowers while loops with mutable numeric bindings", async () => {
    const result = await expectSuccessfulCompile("while-loop.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("br label %while.cond.0");
      expect(llvmIr).toContain("while.cond.0:");
      expect(llvmIr).toContain("while.body.0:");
      expect(llvmIr).toContain("while.end.0:");
      expect(llvmIr).toContain("store double 0.0, ptr %i.addr");
      expect(llvmIr).toContain("store double %num.");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers unbraced while loop bodies with update expressions", async () => {
    const result = await expectSuccessfulCompile("while-unbraced-increment.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("br label %while.cond.0");
      expect(llvmIr).toContain("while.body.0:");
      expect(llvmIr).toContain("store double %num.");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "3\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("lowers for loops with initializer, condition, and increment", async () => {
    const result = await expectSuccessfulCompile("for-loop.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("store double 0.0, ptr %i.addr");
      expect(llvmIr).toContain("br label %for.cond.0");
      expect(llvmIr).toContain("for.body.0:");
      expect(llvmIr).toContain("for.step.0:");
      expect(llvmIr).toContain("for.end.0:");
      expect(llvmIr).toContain("store double %num.");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers break statements to the current loop exit", async () => {
    const result = await expectSuccessfulCompile("while-break.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("br label %while.end.0");
      expect(llvmIr).toContain("while.end.0:");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers continue statements to the current for-loop increment", async () => {
    const result = await expectSuccessfulCompile("for-continue.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("br label %for.step.0");
      expect(llvmIr).toContain("for.step.0:");
      expect(llvmIr).toContain("br label %for.cond.0");
    } finally {
      await result.cleanup();
    }
  });
});

describe("tscn logical operators", () => {
  test("lowers logical not in if conditions", async () => {
    const result = await expectSuccessfulCompile("if-not-condition.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%cmp.0 = xor i1 false, true");
      expect(llvmIr).toContain("br i1 %cmp.0, label %if.then.0, label %if.end.0");
      expect(llvmIr).toContain(String.raw`c"false branch\00"`);
    } finally {
      await result.cleanup();
    }
  });

  test("lowers logical and in if conditions with short-circuit blocks", async () => {
    const result = await expectSuccessfulCompile("if-and-condition.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("logic.rhs.0:");
      expect(llvmIr).toContain("logic.end.0:");
      expect(llvmIr).toContain("phi i1 [ false");
      expect(llvmIr).toContain(String.raw`c"both\00"`);
    } finally {
      await result.cleanup();
    }
  });

  test("lowers logical or in if conditions with short-circuit blocks", async () => {
    const result = await expectSuccessfulCompile("if-or-condition.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("logic.rhs.0:");
      expect(llvmIr).toContain("logic.end.0:");
      expect(llvmIr).toContain("phi i1 [ true");
      expect(llvmIr).toContain(String.raw`c"zero\00"`);
    } finally {
      await result.cleanup();
    }
  });

  test("prints const bindings initialized from logical expressions", async () => {
    const result = await expectSuccessfulCompile("const-logical-expression.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("logic.rhs.0:");
      expect(llvmIr).toContain("bool.true.0:");
      expect(llvmIr).toContain("bool.false.0:");
      expect(llvmIr).toContain(String.raw`c"true\00"`);
      expect(llvmIr).toContain(String.raw`c"false\00"`);
    } finally {
      await result.cleanup();
    }
  });
});

describe("tscn rich expressions", () => {
  test("lowers numeric ternary expressions to LLVM select", async () => {
    const result = await expectSuccessfulCompile("numeric-ternary.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%cmp.0 = fcmp ogt double 12.0, 10.0");
      expect(llvmIr).toContain("select i1 %cmp.0, double 12.0, double 10.0");
      expect(llvmIr).toContain("call i32 (ptr, ...) @printf(ptr @.fmt.number, double %num.");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers string ternary expressions through branch-selected pointers", async () => {
    const result = await expectSuccessfulCompile("string-ternary.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("br i1 true, label %str.then.0, label %str.else.0");
      expect(llvmIr).toContain("%str.0 = phi ptr");
      expect(llvmIr).toContain(String.raw`c"yes\00"`);
      expect(llvmIr).toContain(String.raw`c"no\00"`);
    } finally {
      await result.cleanup();
    }
  });

  test("lowers runtime string ternary expressions through pointer and length phis", async () => {
    const result = await expectSuccessfulCompile("runtime-string-ternary.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("phi ptr [ %str.2, %str.then.0 ], [ @.str.2, %str.else.0 ]");
      expect(llvmIr).toContain("phi i64 [ %str.len.2, %str.then.0 ], [ 7, %str.else.0 ]");
      expect(llvmIr).toContain("call i32 @puts(ptr %str.0)");
    } finally {
      await result.cleanup();
    }
  });

  test("folds const string strict equality in if conditions", async () => {
    const result = await expectSuccessfulCompile("if-string-strict-equality.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("br i1 true, label %if.then.0, label %if.end.0");
      expect(llvmIr).toContain(String.raw`c"equal\00"`);
    } finally {
      await result.cleanup();
    }
  });

  test("folds const string strict inequality in if conditions", async () => {
    const result = await expectSuccessfulCompile("if-string-not-strict-equality.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("br i1 true, label %if.then.0, label %if.end.0");
      expect(llvmIr).toContain(String.raw`c"different\00"`);
    } finally {
      await result.cleanup();
    }
  });
});

describe("tscn string mutation", () => {
  test("lowers mutable string bindings and literal reassignment", async () => {
    const result = await expectSuccessfulCompile("let-string-reassignment.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%msg.addr = alloca ptr");
      expect(llvmIr).toContain("store ptr @.str.0, ptr %msg.addr");
      expect(llvmIr).toContain("store ptr @.str.2, ptr %msg.addr");
      expect(llvmIr).toContain("load ptr, ptr %msg.addr");
    } finally {
      await result.cleanup();
    }
  });

  test("carries mutable string bindings through for-loop assignment", async () => {
    const result = await expectSuccessfulCompile("let-string-loop.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%s.addr = alloca ptr");
      expect(llvmIr).toContain("for.body.0:");
      expect(llvmIr).toContain("store ptr @.str.1, ptr %s.addr");
    } finally {
      await result.cleanup();
    }
  });
});

describe("tscn nested loop control", () => {
  test("targets inner for-loop exit for nested break", async () => {
    const result = await expectSuccessfulCompile("nested-for-inner-break.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("for.end.0:");
      expect(llvmIr).toContain("for.end.1:");
      expect(llvmIr).toContain("br label %for.end.1");
    } finally {
      await result.cleanup();
    }
  });

  test("targets inner while-loop condition for nested continue", async () => {
    const result = await expectSuccessfulCompile("nested-while-inner-continue.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("while.cond.0:");
      expect(llvmIr).toContain("while.cond.1:");
      expect(llvmIr).toContain("br label %while.cond.1");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers break inside if inside for to the for-loop exit", async () => {
    const result = await expectSuccessfulCompile("for-if-break.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("for.end.0:");
      expect(llvmIr).toContain("br label %for.end.0");
    } finally {
      await result.cleanup();
    }
  });
});

describe("tscn do while loops", () => {
  test("lowers do-while loops with body before condition", async () => {
    const result = await expectSuccessfulCompile("do-while-loop.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("br label %do.body.0");
      expect(llvmIr).toContain("do.body.0:");
      expect(llvmIr).toContain("do.cond.0:");
      expect(llvmIr).toContain("do.end.0:");
      expect(llvmIr).toContain("br i1 %cmp.0, label %do.body.0, label %do.end.0");
    } finally {
      await result.cleanup();
    }
  });
});

describe("tscn boolean mutation", () => {
  test("lowers mutable boolean bindings and reassignment", async () => {
    const result = await expectSuccessfulCompile("let-boolean-reassignment.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%flag.addr = alloca i1");
      expect(llvmIr).toContain("store i1 true, ptr %flag.addr");
      expect(llvmIr).toContain("store i1 false, ptr %flag.addr");
      expect(llvmIr).toContain("load i1, ptr %flag.addr");
    } finally {
      await result.cleanup();
    }
  });

  test("uses mutable boolean bindings in if conditions", async () => {
    const result = await expectSuccessfulCompile("let-boolean-if.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%active.addr = alloca i1");
      expect(llvmIr).toContain("load i1, ptr %active.addr");
      expect(llvmIr).toContain("br i1 %bool.");
    } finally {
      await result.cleanup();
    }
  });
});

describe("tscn runtime strings", () => {
  test("lowers string concat assignment to a runtime helper call", async () => {
    const result = await expectSuccessfulCompile("string-concat-assign.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define ptr @strConcat(i64 %left.len, ptr %left.ptr, i64 %right.len, ptr %right.ptr)");
      expect(llvmIr).toContain("call ptr @strConcat");
      expect(llvmIr).toContain("call ptr @malloc(i64 %alloc.size)");
      expect(llvmIr).toContain("store ptr %str.");
      expect(llvmIr).toContain("call ptr @strConcat(i64 %str.len.0, ptr %str.0, i64 6, ptr @.str.1)");
    } finally {
      await result.cleanup();
    }
  });

  test("passes runtime string lengths through variables and repeated concat", async () => {
    const prefix = await expectSuccessfulCompile("string-concat-prefix.ts");

    try {
      const llvmIr = await prefix.readArtifact("main.ll");
      expect(llvmIr).toContain("%prefix.len.addr = alloca i64");
      expect(llvmIr).toContain("%str.len.0 = load i64, ptr %prefix.len.addr");
      expect(llvmIr).toContain("call ptr @strConcat(i64 %str.len.0, ptr %str.0, i64 3, ptr @.str.1)");
    } finally {
      await prefix.cleanup();
    }

    const repeated = await expectSuccessfulCompile("string-concat-repeated.ts");

    try {
      const llvmIr = await repeated.readArtifact("main.ll");
      expect(llvmIr).toContain("store i64 %str.len.1, ptr %s.len.addr");
      expect(llvmIr).toContain("call ptr @strConcat(i64 %str.len.2, ptr %str.2, i64 1, ptr @.str.2)");
    } finally {
      await repeated.cleanup();
    }
  });

  test("carries string concat assignment through loops", async () => {
    const result = await expectSuccessfulCompile("string-concat-loop.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("for.body.0:");
      expect(llvmIr).toContain("call ptr @strConcat");
      expect(llvmIr).toContain("store ptr %str.");
    } finally {
      await result.cleanup();
    }
  });

  test("emits runtime helper declarations and definitions once before user functions", async () => {
    const result = await expectSuccessfulCompile("string-helper-ordering.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(countOccurrences(llvmIr, "declare ptr @malloc(i64)")).toBe(1);
      expect(countOccurrences(llvmIr, "define ptr @strConcat")).toBe(1);
      expect(countOccurrences(llvmIr, "define i1 @strEquals")).toBe(1);
      expect(llvmIr.indexOf("declare ptr @malloc(i64)")).toBeLessThan(llvmIr.indexOf("define ptr @strConcat"));
      expect(llvmIr.indexOf("define ptr @strConcat")).toBeLessThan(llvmIr.indexOf("define void @check"));
    } finally {
      await result.cleanup();
    }
  });
});
