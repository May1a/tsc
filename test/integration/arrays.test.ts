import { describe, expect, test } from "vitest";
import {
  expectSuccessfulCompile,
  expectNativeBehaviorIfAvailable,
  expectLlvmAsVerificationIfAvailable
} from "./helpers.js";

describe("tscn arrays", () => {
  test("lowers array literals and constant element access", async () => {
    const result = await expectSuccessfulCompile("array-element-constant.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("@arr.0 = global [3 x double] [double 10.0, double 20.0, double 30.0]");
      expect(llvmIr).toContain("getelementptr [3 x double], ptr @arr.0, i64 0, i64 0");
      expect(llvmIr).toContain("load double, ptr %arr.gep.");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers array access with a mutable numeric index", async () => {
    const result = await expectSuccessfulCompile("array-element-variable.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("load double, ptr %i.addr");
      expect(llvmIr).toContain("fptosi double %num.");
      expect(llvmIr).toContain("getelementptr [3 x double], ptr @arr.0");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers fixed array length as a numeric constant", async () => {
    const result = await expectSuccessfulCompile("array-length.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("call i32 (ptr, ...) @printf(ptr @.fmt.number, double 3.0)");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers array element mutation", async () => {
    const result = await expectSuccessfulCompile("array-mutation.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("store double 99.0, ptr %arr.gep.");
      expect(llvmIr).toContain("load double, ptr %arr.gep.");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers for loops over fixed arrays", async () => {
    const result = await expectSuccessfulCompile("array-for-loop.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("for.body.0:");
      expect(llvmIr).toContain("getelementptr [3 x double], ptr @arr.0");
    } finally {
      await result.cleanup();
    }
  });

  test("stores evaluated numeric expressions in array initializers", async () => {
    const result = await expectSuccessfulCompile("array-expression-initializer.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%arr.addr = alloca [2 x double]");
      expect(llvmIr).toContain("%num.0 = fadd double 10.0, 1.0");
      expect(llvmIr).toContain("store double %num.0, ptr %arr.gep.");
      expect(llvmIr).not.toContain("[double 0");
    } finally {
      await result.cleanup();
    }
  });

  test("uses array accesses in conditions and length-bounded while loops", async () => {
    const condition = await expectSuccessfulCompile("array-condition.ts");

    try {
      const llvmIr = await condition.readArtifact("main.ll");
      expect(llvmIr).toContain("load double, ptr %arr.gep.");
      expect(llvmIr).toContain("fcmp oeq double %num.");
    } finally {
      await condition.cleanup();
    }

    const loop = await expectSuccessfulCompile("array-while-length.ts");

    try {
      const llvmIr = await loop.readArtifact("main.ll");
      expect(llvmIr).toContain("while.cond.0:");
      expect(llvmIr).toContain("fcmp olt double %num.0, 3.0");
      expect(llvmIr).toContain("getelementptr [3 x double], ptr @arr.0");
    } finally {
      await loop.cleanup();
    }
  });

  test("keeps multiple array literals deterministic and non-colliding", async () => {
    const result = await expectSuccessfulCompile("array-multiple-literals.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("@arr.0 = global [2 x double] [double 1.0, double 2.0]");
      expect(llvmIr).toContain("@arr.1 = global [2 x double] [double 3.0, double 4.0]");
      expect(llvmIr).toContain("getelementptr [2 x double], ptr @arr.0, i64 0, i64 0");
      expect(llvmIr).toContain("getelementptr [2 x double], ptr @arr.1, i64 0, i64 1");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers mutable fixed arrays and nested numeric indexes", async () => {
    const result = await expectSuccessfulCompile("array-let-nested-index.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("@arr.0 = global [3 x double] [double 1.0, double 2.0, double 3.0]");
      expect(llvmIr).toContain("store double 3.0, ptr %arr.gep.");
      expect(llvmIr).toContain("fadd double %num.");
      expect(llvmIr).toContain("fptosi double %num.");
    } finally {
      await result.cleanup();
    }
  });

  test("stores variables and function-call results in array initializers", async () => {
    const result = await expectSuccessfulCompile("array-call-initializer.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("call { i64, i1 } @next()");
      expect(llvmIr).toContain("load double, ptr %x.addr");
      expect(llvmIr).toMatch(/store double %call\.\d+\.num, ptr %arr\.gep\./);
    } finally {
      await result.cleanup();
    }
  });

  test("lowers holes and mixed values through runtime array helpers", async () => {
    const hole = await expectSuccessfulCompile("array-hole.ts", { link: true });

    try {
      const llvmIr = await hole.readArtifact("main.ll");
      expect(llvmIr).toContain("define ptr @arrayNew(i64 %length)");
      expect(llvmIr).toContain("define i64 @arrayGetWithKey(ptr %array, i64 %index, i64 %key.len, ptr %key.ptr)");
      expect(llvmIr).toContain("store i64 9222246136947933191, ptr %slot");
      expect(llvmIr).toContain("%is.hole = icmp eq i64 %value, 9222246136947933191");
      expect(llvmIr).not.toContain("call void @arraySet(ptr %arr.arr, i64 1, i64 9222246136947933184)");
      expect(llvmIr).toContain("call i64 @arrayGetWithKey(ptr %arr.ptr.");
      await expectNativeBehaviorIfAvailable(hole, { status: 0, stdout: "1\nundefined\n", stderr: "" });
    } finally {
      await hole.cleanup();
    }

    const mixed = await expectSuccessfulCompile("array-non-numeric.ts", { link: true });

    try {
      const llvmIr = await mixed.readArtifact("main.ll");
      expect(llvmIr).toContain("call void @arraySet(ptr %arr.arr, i64 0, i64 %value.");
      expect(llvmIr).toContain("call void @valuePrint(i64 %value.");
      await expectNativeBehaviorIfAvailable(mixed, { status: 0, stdout: "x\n", stderr: "" });
    } finally {
      await mixed.cleanup();
    }
  });

  test("keeps runtime and fixed array names from colliding", async () => {
    const result = await expectSuccessfulCompile("array-runtime-and-fixed.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("@arr.0 = global [2 x double] [double 1.0, double 2.0]");
      expect(llvmIr).toContain("%mixed.arr = call ptr @arrayNew(i64 2)");
      expect(llvmIr).toContain("getelementptr [2 x double], ptr @arr.0");
      expect(llvmIr).toContain("call i64 @arrayGetWithKey(ptr %arr.ptr.");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "2\ntrue\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("grows runtime arrays on out-of-bounds writes", async () => {
    const result = await expectSuccessfulCompile("array-runtime-growth.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%capacity.slot = getelementptr i8, ptr %array, i64 8");
      expect(llvmIr).toContain("%elements.slot = getelementptr i8, ptr %array, i64 16");
      expect(llvmIr).toContain("%new.elements = call ptr @malloc(i64 %new.elements.bytes)");
      expect(llvmIr).toContain("call ptr @memcpy(ptr %new.elements, ptr %elements, i64 %old.elements.bytes)");
      expect(llvmIr).toContain("store i64 %next.length, ptr %array");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "6\nundefined\nx\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("deletes runtime array elements as holes without changing length", async () => {
    const result = await expectSuccessfulCompile("array-runtime-delete.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define void @arrayDelete(ptr %array, i64 %index)");
      expect(llvmIr).toContain("call void @arrayDelete(ptr %arr.ptr.");
      expect(llvmIr).toContain("store i64 9222246136947933191, ptr %slot");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "3\nundefined\nc\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("assigns runtime array length with truncation and holes", async () => {
    const result = await expectSuccessfulCompile("array-runtime-length-assignment.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define void @arraySetLength(ptr %array, i64 %new.length)");
      expect(llvmIr).toContain("call void @arraySetLength(ptr %arr.ptr.");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "1\nundefined\n4\nundefined\nd\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("checks runtime array indexed presence without treating holes as present", async () => {
    const result = await expectSuccessfulCompile("array-runtime-presence.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define i1 @arrayHasOwnIndex(ptr %array, i64 %index)");
      expect(llvmIr).toContain("call i1 @arrayHasOwnIndex(ptr %arr.ptr.");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "true\ntrue\nfalse\nfalse\nfalse\nfalse\nfalse\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("falls back from runtime array holes to object prototypes for literal indexes", async () => {
    const result = await expectSuccessfulCompile("array-runtime-prototype.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define i64 @arrayGetWithKey(ptr %array, i64 %index, i64 %key.len, ptr %key.ptr)");
      expect(llvmIr).toContain("%prototype.slot = getelementptr i8, ptr %array, i64 24");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "zero\none\nundefined\nthree\nundefined\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("returns own enumerable runtime array keys", async () => {
    const result = await expectSuccessfulCompile("array-runtime-keys.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define ptr @arrayKeys(ptr %array)");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "2\n0\n4\nundefined\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("supports canonical string keys for runtime arrays", async () => {
    const result = await expectSuccessfulCompile("array-runtime-string-keys.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define i1 @arrayHas(ptr %array, i64 %index, i64 %key.len, ptr %key.ptr)");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "zero\nproto\ntrue\ntrue\nfalse\nfalse\n4\nthree\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("supports runtime array push and pop", async () => {
    const result = await expectSuccessfulCompile("array-runtime-push-pop.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define i64 @arrayPush(ptr %array, i64 %value)");
      expect(llvmIr).toContain("define i64 @arrayPop(ptr %array)");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "4\n4\nd\nc\nundefined\na\nundefined\n0\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("supports runtime array shift and unshift", async () => {
    const result = await expectSuccessfulCompile("array-runtime-shift-unshift.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define i64 @arrayUnshift(ptr %array, i64 %value)");
      expect(llvmIr).toContain("define i64 @arrayShift(ptr %array)");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "4\na\nundefined\na\n3\nundefined\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("gets runtime array prototypes", async () => {
    const result = await expectSuccessfulCompile("array-runtime-get-prototype.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define ptr @arrayGetPrototype(ptr %array)");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "array-proto\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });
});
