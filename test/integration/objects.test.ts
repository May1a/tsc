import { describe, expect, test } from "vitest";
import path from "node:path";
import {
  compileFixture,
  expectSuccessfulCompile,
  expectNativeBehaviorIfAvailable,
  expectToolBehaviorIfAvailable,
  expectLlvmAsVerificationIfAvailable,
  countOccurrences
} from "./helpers.js";

describe("tscn objects", () => {
  test("lowers object literals and dot access", async () => {
    const result = await expectSuccessfulCompile("object-dot-access.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%obj.0 = type { double, double }");
      expect(llvmIr).toContain("%obj.addr = alloca %obj.0");
      expect(llvmIr).toContain("load double, ptr %obj.gep.");
      expect(llvmIr).not.toContain("define ptr @objectNew(i64 %capacity)");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers object bracket access with const string keys", async () => {
    const result = await expectSuccessfulCompile("object-bracket-access.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("getelementptr %obj.0, ptr %obj.addr, i32 0, i32 0");
      expect(llvmIr).toContain("load double, ptr %obj.gep.");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers object property mutation", async () => {
    const result = await expectSuccessfulCompile("object-mutation.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("store double 99.0, ptr %obj.gep.");
      expect(llvmIr).toContain("load double, ptr %obj.gep.");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers nested object property access", async () => {
    const result = await expectSuccessfulCompile("object-nested.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%obj.1 = type { double }");
      expect(llvmIr).toContain("%obj.0 = type { %obj.1 }");
      expect(llvmIr).toContain("getelementptr %obj.0, ptr %obj.addr, i32 0, i32 0, i32 0");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers object bracket mutation", async () => {
    const result = await expectSuccessfulCompile("object-bracket-mutation.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("store double 99.0, ptr %obj.gep.");
      expect(llvmIr).toContain("load double, ptr %obj.gep.");
    } finally {
      await result.cleanup();
    }
  });

  test("preserves numeric expression fields and nested object mutation", async () => {
    const expression = await expectSuccessfulCompile("object-expression-field.ts");

    try {
      const llvmIr = await expression.readArtifact("main.ll");
      expect(llvmIr).toContain("%num.0 = fadd double 40.0, 2.0");
      expect(llvmIr).toContain("store double %num.0, ptr %obj.gep.");
    } finally {
      await expression.cleanup();
    }

    const nested = await expectSuccessfulCompile("object-nested-mutation.ts");

    try {
      const llvmIr = await nested.readArtifact("main.ll");
      expect(llvmIr).toContain("getelementptr %obj.0, ptr %obj.addr, i32 0, i32 0, i32 0");
      expect(llvmIr).toContain("store double 42.0, ptr %obj.gep.");
    } finally {
      await nested.cleanup();
    }
  });

  test("uses object properties in numeric comparisons", async () => {
    const result = await expectSuccessfulCompile("object-condition.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("load double, ptr %obj.gep.");
      expect(llvmIr).toContain("fcmp oeq double %num.");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers string-key object literal fields", async () => {
    const result = await expectSuccessfulCompile("object-string-key.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%obj.0 = type { double }");
      expect(llvmIr).toContain("getelementptr %obj.0, ptr %obj.addr, i32 0, i32 0");
    } finally {
      await result.cleanup();
    }
  });

  test("stores function-call results in object fields", async () => {
    const result = await expectSuccessfulCompile("object-call-field.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("call { i64, i1 } @value()");
      expect(llvmIr).toContain("store double %call.0.num, ptr %obj.gep.");
    } finally {
      await result.cleanup();
    }
  });

  test("lowers dynamic string-key object reads through runtime helpers", async () => {
    const result = await expectSuccessfulCompile("object-dynamic-key.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%obj.0 = type { double }");
      expect(llvmIr).toContain("define ptr @objectNew(i64 %capacity)");
      expect(llvmIr).toContain("define i64 @objectGet(ptr %object, i64 %key.len, ptr %key.ptr)");
      expect(llvmIr).toContain("call void @objectSet(ptr %obj.rt.");
      expect(llvmIr).toContain("call i64 @objectGet(ptr %obj.ptr.");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "1\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("keeps known-shape object runtime shadows synchronized after mutation", async () => {
    const result = await expectSuccessfulCompile("object-fixed-shadow-mutation.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("store double 2.0, ptr %obj.gep.");
      expect(llvmIr).toContain("call void @objectSet(ptr %obj.ptr.");
      expect(llvmIr).toContain("call i64 @objectGet(ptr %obj.ptr.");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "2\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("lowers dynamic object stores with dictionary growth", async () => {
    const result = await expectSuccessfulCompile("object-runtime-dynamic-store.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%capacity.slot = getelementptr i8, ptr %object, i64 8");
      expect(llvmIr).toContain("%new.entries = call ptr @malloc(i64 %new.entries.bytes)");
      expect(llvmIr).toContain("%shape.version.slot = getelementptr i8, ptr %object, i64 24");
      expect(llvmIr).toContain("%append.descriptor.slot = getelementptr i8, ptr %append.ptr, i64 24");
      expect(llvmIr).toContain("store i64 7, ptr %append.descriptor.slot");
      expect(llvmIr).toContain("store i64 %next.shape.version, ptr %shape.version.slot");
      expect(llvmIr).toContain("call void @objectSet(ptr %obj.ptr.");
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
    const result = await expectSuccessfulCompile("object-non-numeric-field.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).not.toContain("%obj.0 = type { double }");
      expect(llvmIr).toContain("call void @objectSet(ptr %obj.rt.");
      expect(llvmIr).toContain("call void @valuePrint(i64 %value.");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "value\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("keeps runtime and known-shape object names from colliding", async () => {
    const result = await expectSuccessfulCompile("object-runtime-and-fixed.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%obj.0 = type { double }");
      expect(llvmIr).toContain("%dynamic.addr = alloca ptr");
      expect(llvmIr).toContain("getelementptr %obj.0, ptr %fixed.addr");
      expect(llvmIr).toContain("call i64 @objectGet(ptr %obj.ptr.");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "3\nruntime\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("deletes runtime object properties from dictionary objects", async () => {
    const result = await expectSuccessfulCompile("object-runtime-delete.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define void @objectDelete(ptr %object, i64 %key.len, ptr %key.ptr)");
      expect(llvmIr).toContain("call void @objectDelete(ptr %obj.ptr.");
      expect(llvmIr).toContain("store i64 -1, ptr %entry.ptr");
      expect(llvmIr).toContain("%next.shape.version = add i64 %shape.version, 1");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "undefined\nundefined\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("falls back through runtime object prototypes created with Object.create", async () => {
    const result = await expectSuccessfulCompile("object-runtime-prototype.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define ptr @objectCreate(ptr %prototype)");
      expect(llvmIr).toContain("define { i64, i64 } @objectGetOwn(ptr %object, i64 %key.len, ptr %key.ptr)");
      expect(llvmIr).toContain("%prototype.slot = getelementptr i8, ptr %object, i64 32");
      expect(llvmIr).toContain("call ptr @objectCreate(ptr %obj.ptr.");
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
    const result = await expectSuccessfulCompile("object-runtime-presence.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define i1 @objectHasOwn(ptr %object, i64 %key.len, ptr %key.ptr)");
      expect(llvmIr).toContain("define i1 @objectHas(ptr %object, i64 %key.len, ptr %key.ptr)");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "true\ntrue\ntrue\nfalse\ntrue\nfalse\nfalse\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("mutates runtime object prototypes with Object.setPrototypeOf", async () => {
    const result = await expectSuccessfulCompile("object-runtime-set-prototype.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define void @objectSetPrototype(ptr %object, ptr %prototype)");
      expect(llvmIr).toContain("call void @objectSetPrototype(ptr %obj.ptr.");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "first\nundefined\nsecond\nundefined\nundefined\nfalse\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("defines runtime data property descriptors and observes writable/configurable bits", async () => {
    const result = await expectSuccessfulCompile("object-runtime-define-property.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define void @objectDefineDataProperty(ptr %object, i64 %key.len, ptr %key.ptr, i64 %value, i64 %flags)");
      expect(llvmIr).toContain("%is.writable = icmp ne i64 %writable.bit, 0");
      expect(llvmIr).toContain("%is.configurable = icmp ne i64 %configurable.bit, 0");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "fixed\nundefined\nnormal\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("returns own enumerable runtime object keys in insertion order", async () => {
    const result = await expectSuccessfulCompile("object-runtime-keys.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define ptr @objectKeys(ptr %object)");
      expect(llvmIr).toContain("call ptr @objectKeys(ptr %obj.ptr.");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "1\nvisible\nundefined\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("supports runtime object extensibility", async () => {
    const result = await expectSuccessfulCompile("object-runtime-extensible.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define void @objectPreventExtensions(ptr %object)");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "true\nfalse\nnew\nundefined\nundefined\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("supports runtime object seal and freeze", async () => {
    const result = await expectSuccessfulCompile("object-runtime-seal-freeze.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define void @objectSeal(ptr %object)");
      expect(llvmIr).toContain("define void @objectFreeze(ptr %object)");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "true\nnew\nkeep\nundefined\ntrue\nnew\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("copies runtime object enumerable own properties", async () => {
    const result = await expectSuccessfulCompile("object-runtime-assign.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define void @objectAssign(ptr %target, ptr %source)");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "override\nb\nundefined\nundefined\nundefined\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("gets runtime object prototypes and guards cycles", async () => {
    const result = await expectSuccessfulCompile("object-runtime-get-prototype-cycle.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define ptr @objectGetPrototype(ptr %object)");
      expect(llvmIr).toContain("define i1 @objectWouldCreateCycle(ptr %object, ptr %prototype)");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "root\na\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });
});

describe("tscn runtime comparisons", () => {
  test("lowers runtime string strict equality as content comparison", async () => {
    const result = await expectSuccessfulCompile("runtime-string-equality.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define i1 @strEquals(i64 %left.len, ptr %left.ptr, i64 %right.len, ptr %right.ptr)");
      expect(llvmIr).toContain("call i32 @memcmp(ptr %left.ptr, ptr %right.ptr, i64 %left.len)");
      expect(llvmIr).toContain("call i1 @strEquals(i64 %str.len.");
      expect(llvmIr).toContain("br i1 %cmp.0, label %if.then.0, label %if.end.0");
    } finally {
      await result.cleanup();
    }
  });

  test("uses string equality helper for content equality and inequality", async () => {
    const equality = await expectSuccessfulCompile("runtime-string-content-equality.ts");

    try {
      const llvmIr = await equality.readArtifact("main.ll");
      expect(llvmIr).toContain("call i1 @strEquals");
      expect(llvmIr).toContain("%cmp.0 = icmp eq i1 %str.eq.0, true");
    } finally {
      await equality.cleanup();
    }

    const inequality = await expectSuccessfulCompile("runtime-string-content-inequality.ts");

    try {
      const llvmIr = await inequality.readArtifact("main.ll");
      expect(llvmIr).toContain("call i1 @strEquals");
      expect(llvmIr).toContain("%cmp.0 = icmp ne i1 %str.eq.0, true");
    } finally {
      await inequality.cleanup();
    }
  });

  test("lowers mutable boolean strict equality", async () => {
    const result = await expectSuccessfulCompile("boolean-comparison.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("icmp eq i1 %bool.");
      expect(llvmIr).toContain("br i1 %cmp.0, label %if.then.0, label %if.end.0");
    } finally {
      await result.cleanup();
    }
  });
});

describe("tscn JSValue ABI", () => {
  test("supports null as a first-class JSValue", async () => {
    const result = await expectSuccessfulCompile("value-null.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("9222246136947933187");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "null\nnull\ntrue\ntrue\nfalse\nfalse\ntrue\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("lowers boxed print values through the value print helper", async () => {
    const result = await expectSuccessfulCompile("value-print.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define void @valuePrint(i64 %value)");
      expect(llvmIr).toContain("call i64 @valueBoxNumber(double 42.0)");
      expect(llvmIr).toContain("select i1 true, i64 9222246136947933186, i64 9222246136947933185");
      expect(llvmIr).toContain("i64 9222246136947933184");
      expect(llvmIr).toContain("define i64 @valueBoxString(ptr %string.ptr, i64 %string.len)");
      expect(llvmIr).toContain("call i64 @valueBoxString(ptr @.str.");
      expect(countOccurrences(llvmIr, "define void @valuePrint")).toBe(1);
      await expectNativeBehaviorIfAvailable(result, {
        status: 0,
        stdout: "42\ntrue\nundefined\nboxed string\n",
        stderr: ""
      });
      const lli = await expectToolBehaviorIfAvailable("lli", [path.join(result.outDir, "main.ll")], {
        status: 0,
        stdout: "42\ntrue\nundefined\nboxed string\n",
        stderr: ""
      });
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
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%tagged = and i64 %value, -281474976710656");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "0.3\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("lowers value strict equality through a deterministic helper", async () => {
    const result = await expectSuccessfulCompile("value-strict-equality.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("define i1 @valueStrictEquals(i64 %left, i64 %right)");
      expect(llvmIr).toContain("call i1 @valueStrictEquals(i64");
      expect(countOccurrences(llvmIr, "define i1 @valueStrictEquals")).toBe(1);
      expect(llvmIr.indexOf("define i1 @valueStrictEquals")).toBeLessThan(llvmIr.indexOf("define i32 @main"));
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
    const result = await expectSuccessfulCompile("value-string-strict-equality-content.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "true\ntrue\ntrue\n", stderr: "" });
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("returns number or boolean through the same value-shaped ABI", async () => {
    const result = await expectSuccessfulCompile("value-return-union.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).not.toContain("declare { i64, i1 } @choose(i64)");
      expect(llvmIr).toContain("define { i64, i1 } @choose(i64 %p0)");
      expect(llvmIr).toContain("select i1 %cmp.0, i64 %value.");
      expect(llvmIr).toContain("call { i64, i1 } @choose(i64 %arg.num.0)");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "true\n7\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });
});
