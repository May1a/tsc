import { describe, expect, test } from "vitest";
import { buildTypedFixture, callsTo, functionInstructions } from "./typed-module.js";
import {
  countOccurrences,
  expectLlvmAsVerificationIfAvailable,
  expectNativeBehaviorIfAvailable,
  expectSuccessfulCompile
} from "./helpers.js";

describe("GC initialization", () => {
  test("emits the gcInit definition and a single call from @main", async () => {
    const result = await expectSuccessfulCompile("hello.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      // gcInit ships only as a define — the same-module redefinition would
      // fail llvm-as. The call from @main links against the local definition.
      expect(countOccurrences(llvmIr, "define void @gcInit()")).toBe(1);
      expect(countOccurrences(llvmIr, "call void @gcInit()")).toBe(1);
      expect(llvmIr).not.toContain("declare void @gcInit()");
      // gcInit must be the first call in @main's entry block, before any
      // user statement would land a runtime helper call.
      const mainMatch = /define i32 @main\(\) \{\s*entry:\s*([\s\S]*?)\n\}/m.exec(llvmIr);
      expect(mainMatch, "expected @main definition in emitted IR").not.toBeNull();
      const mainBody = mainMatch?.[1] ?? "";
      const firstCallIndex = mainBody.indexOf("call ");
      expect(firstCallIndex).toBeGreaterThanOrEqual(0);
      const firstCallLine = mainBody.slice(firstCallIndex, mainBody.indexOf("\n", firstCallIndex));
      expect(firstCallLine).toContain("@gcInit");
      // Phase B: the full GC helper set is always emitted so allocations through
      // @gcAlloc link without re-traversing the dependency graph at every call site.
      expect(llvmIr).toMatch(/^define void @gcInit\(\) \{/m);
      expect(llvmIr).toMatch(/^define ptr @gcAlloc\(i64 [^,]+, i64 [^)]+\) \{/m);
      expect(llvmIr).toMatch(/^define void @gcRootPush\(i64 [^)]+\) \{/m);
      expect(llvmIr).toMatch(/^define void @gcRootPop\(\) \{/m);
      // Root balancing is now depth-based: every function/loop captures the
      // root-stack depth with gcRootSave and resets to it with gcRootRestore
      // (replacing the old static pop counting), and collection only runs at
      // gcSafepoint boundaries.
      expect(llvmIr).toMatch(/^define i64 @gcRootSave\(\) \{/m);
      expect(llvmIr).toMatch(/^define void @gcRootRestore\(i64 [^)]+\) \{/m);
      expect(llvmIr).toMatch(/^define void @gcSafepoint\(\) \{/m);
      expect(llvmIr).toMatch(/^define void @gcMarkValue\(i64 [^)]+\) \{/m);
      expect(llvmIr).toMatch(/^define void @gcSweep\(\) \{/m);
      expect(llvmIr).toMatch(/^define void @gcCollect\(\) \{/m);
      expect(mainBody).not.toMatch(/call.+@gcAlloc/);
      expect(mainBody).toContain("call i64 @gcRootSave()");
      expect(mainBody).toContain("call void @gcRootRestore(");
    } finally {
      await result.cleanup();
    }
  });

  test("verifies emitted LLVM IR when llvm-as is available", async () => {
    const result = await expectSuccessfulCompile("hello.ts");

    try {
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("runs hello.ts end-to-end with the gcInit call in place", async () => {
    const result = await expectSuccessfulCompile("hello.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "hello from tscn\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });
});

describe("GC strings", () => {
  test("emits depth-based root instrumentation and boxes strings through gcAlloc", async () => {
    const result = await expectSuccessfulCompile("gc-stress-strings.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      // Roots are pinned (gcRootPush) and released by frame restore, not by a
      // matching static pop. Both the save and restore primitives must appear.
      expect(countOccurrences(llvmIr, "call void @gcRootPush("), "expected at least one gcRootPush").toBeGreaterThan(0);
      expect(countOccurrences(llvmIr, "call i64 @gcRootSave("), "expected gcRootSave frames").toBeGreaterThan(0);
      expect(countOccurrences(llvmIr, "call void @gcRootRestore("), "expected gcRootRestore frame resets").toBeGreaterThan(0);
      // The concat loop must carry a safepoint so collection can actually fire
      // mid-program (gcAlloc itself never collects).
      expect(countOccurrences(llvmIr, "call void @gcSafepoint("), "expected a gcSafepoint in the loop").toBeGreaterThan(0);
      const boxStringCalls = llvmIr.match(/= call i64 @valueBoxString\(/g) ?? [];
      expect(boxStringCalls.length, "expected at least one valueBoxString call").toBeGreaterThan(0);
    } finally {
      await result.cleanup();
    }
  });

  test("instruments the loop body with a per-iteration restore and safepoint", async () => {
    const result = await expectSuccessfulCompile("gc-stress-strings.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      // gcAlloc must never collect inline; it only flags a pending collection.
      const allocMatch = /define ptr @gcAlloc\([\s\S]*?\n\}/.exec(llvmIr);
      expect(allocMatch, "expected @gcAlloc definition").not.toBeNull();
      expect(allocMatch?.[0] ?? "", "gcAlloc must not call gcCollect inline").not.toMatch(/call void @gcCollect\(/);
      expect(allocMatch?.[0] ?? "", "gcAlloc must flag a pending collection").toMatch(/@gcCollectPending/);
      const { module } = await buildTypedFixture("gc-stress-strings.ts");
      const safepointBlocks = module.functions.flatMap((fn) => fn.blocks.filter((block) =>
        block.instructions.some((instruction) => instruction.kind === "call" && instruction.callee.kind === "symbol" &&
          instruction.callee.name === "gcSafepoint")));
      expect(safepointBlocks.length).toBeGreaterThan(0);
      for (const block of safepointBlocks) {
        const safepoint = block.instructions.findIndex((instruction) => instruction.kind === "call" &&
          instruction.callee.kind === "symbol" && instruction.callee.name === "gcSafepoint");
        const restore = block.instructions.findIndex((instruction) => instruction.kind === "call" &&
          instruction.callee.kind === "symbol" && instruction.callee.name === "gcRootRestore");
        expect(restore).toBeGreaterThan(safepoint);
        expect(block.instructions.at(-1)?.kind).toBe("branch");
      }
    } finally {
      await result.cleanup();
    }
  });

  test("verifies gc-stress-strings LLVM IR with llvm-as", async () => {
    const result = await expectSuccessfulCompile("gc-stress-strings.ts");

    try {
      await expectLlvmAsVerificationIfAvailable(result);
    } finally {
      await result.cleanup();
    }
  });

  test("runs gc-stress-strings through 70,000 concatenations", async () => {
    const result = await expectSuccessfulCompile("gc-stress-strings.ts", { link: true });

    try {
      // The fixture builds s = "x" + 70_000 dots and prints it via puts(), which
      // appends a newline. 1 + 70_000 chars + newline = 70_002 bytes of stdout.
      const dotCount = 70_000;
      const expectedStdout = `x${".".repeat(dotCount)}\n`;
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: expectedStdout, stderr: "" });
    } finally {
      await result.cleanup();
    }
  });
});

describe("GC aggregates", () => {
  // Per-fixture shape assertions: every fixture should compile, verify with
  // llvm-as, allocate at least one non-string GC cell, and balance
  // gcRootPush/gcRootPop. The fixtures are listed together so a single failing
  // case localizes the regression to one input.
  const aggregateFixtures = ["gc-stress-objects.ts", "gc-class-fields.ts", "gc-drop-and-reuse.ts"] as const;

  for (const fixture of aggregateFixtures) {
    test(`${fixture} emits balanced root-stack instrumentation and uses gcAlloc`, async () => {
      const result = await expectSuccessfulCompile(fixture);

      try {
        const llvmIr = await result.readArtifact("main.ll");
        // Depth-based rooting: pushes are pinned and released by frame restore.
        expect(countOccurrences(llvmIr, "call void @gcRootPush("), `${fixture}: expected at least one gcRootPush`).toBeGreaterThan(0);
        expect(countOccurrences(llvmIr, "call i64 @gcRootSave("), `${fixture}: expected gcRootSave frames`).toBeGreaterThan(0);
        expect(countOccurrences(llvmIr, "call void @gcRootRestore("), `${fixture}: expected gcRootRestore frame resets`).toBeGreaterThan(0);
        // Every aggregate fixture allocates at least one object cell
        // (GC_TAG_OBJECT = 2), and the class-field / drop-and-reuse fixtures
        // additionally exercise string boxes (GC_TAG_STRING = 1).
        const objectAllocs = (llvmIr.match(/@gcAlloc\(i64 2,/g) ?? []).length;
        const stringAllocs = (llvmIr.match(/@gcAlloc\(i64 1,/g) ?? []).length;
        expect(objectAllocs, `${fixture}: expected at least one gcAlloc(GC_TAG_OBJECT, ...)`).toBeGreaterThan(0);
        expect(stringAllocs, `${fixture}: expected at least one gcAlloc(GC_TAG_STRING, ...)`).toBeGreaterThan(0);
        // The fixture emits a verifiable module.
        await expectLlvmAsVerificationIfAvailable(result);
      } finally {
        await result.cleanup();
      }
    });
  }

  test("gc-stress-objects.ts runs through 25k object allocations", async () => {
    const result = await expectSuccessfulCompile("gc-stress-objects.ts", { link: true });

    try {
      // 25_000 iterations: loop(n) returns the last tick(i) value, which is n-1.
      // 25_000 - 1 = 24_999, printed via puts() (newline appended).
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "24999\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("gc-class-fields.ts runs a constructor + instance method end-to-end", async () => {
    const result = await expectSuccessfulCompile("gc-class-fields.ts", { link: true });

    try {
      // new Greeter("hello", "gc").greet() returns "hello gc", printed with newline.
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "hello gc\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("gc-drop-and-reuse.ts runs two consecutive object allocations", async () => {
    const result = await expectSuccessfulCompile("gc-drop-and-reuse.ts", { link: true });

    try {
      // combine() returns "alpha" + "beta", printed with newline.
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "alphabeta\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("gc-retain-live.ts keeps a rooted object alive across a real collection", async () => {
    // run() holds one Box (`keep`) in a local across a 25k-iteration allocation
    // loop that crosses the 1 MiB threshold, so a gcCollect cycle runs mid-loop.
    // `keep` is pinned on the function's root frame and its field must read back
    // 7 afterwards; the 25k transient Boxes are reclaimed. A regression in root
    // marking, the object-field walk, the per-iteration frame restore, or the
    // safepoint would either crash or print a value other than 7. The transient
    // allocation sits inside an `if`, which the old static push/pop counter could
    // not balance across the branch.
    const result = await expectSuccessfulCompile("gc-retain-live.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "7\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("keeps catch destructuring exceptions alive across collection", async () => {
    const result = await expectSuccessfulCompile("gc-catch-destructure-default.ts", { link: true });

    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "7\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("roots new class instances before publishing constructor arguments", async () => {
    const { module } = await buildTypedFixture("gc-class-fields.ts");
    const constructions = module.functions.flatMap((fn) => callsTo(fn, "objectNew").map((allocation) => ({
      instructions: functionInstructions(fn), allocation
    })));
    const instances = constructions.filter(({ instructions, allocation }) => {
      const bits = instructions.find((instruction) => instruction.kind === "cast" && instruction.opcode === "ptrtoint" &&
        instruction.operand === allocation.result);
      if (bits?.kind !== "cast") return false;
      const payload = instructions.find((instruction) => instruction.kind === "integerBinary" && instruction.opcode === "and" &&
        instruction.left === bits.result);
      if (payload?.kind !== "integerBinary") return false;
      const boxed = instructions.find((instruction) => instruction.kind === "integerBinary" && instruction.opcode === "or" &&
        instruction.left === payload.result);
      if (boxed?.kind !== "integerBinary") return false;
      const publication = instructions.findIndex((instruction) => instruction.kind === "store" && instruction.value === boxed.result);
      if (publication === -1) return false;
      const root = instructions.findIndex((instruction) => instruction.kind === "call" && instruction.callee.kind === "symbol" &&
        instruction.callee.name === "gcRootPush" && instruction.arguments[0] === boxed.result);
      expect(root).toBeGreaterThanOrEqual(0);
      expect(root).toBeLessThan(publication);
      return true;
    });
    expect(instances.length).toBeGreaterThan(0);
  });

  test("keeps a map source, result and callback receiver alive across collection", async () => {
    const result = await expectSuccessfulCompile("gc-function-thisarg.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      const { module } = await buildTypedFixture("gc-function-thisarg.ts");
      const invocations = module.functions.flatMap((fn) => callsTo(fn, "arrayMapCallback").map((call) => ({ fn, call })));
      expect(invocations.length).toBe(1);
      for (const { fn, call } of invocations) {
        const instructions = functionInstructions(fn);
        const invocation = instructions.indexOf(call);
        for (const argument of call.arguments) {
          expect(instructions.slice(0, invocation).some((instruction) => instruction.kind === "call" &&
            instruction.callee.kind === "symbol" && instruction.callee.name === "gcRootPush" &&
            instruction.arguments[0] === argument)).toBe(true);
        }
      }
      expect(llvmIr).toContain("call void @gcMarkValue(i64 %fn.this)");
      await expectLlvmAsVerificationIfAvailable(result);
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "7\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("traces captured values through function environments", async () => {
    const result = await expectSuccessfulCompile("gc-function-closure-environment.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("walk.environment:");
      expect(llvmIr).toContain("call void @gcMarkValue(i64 %evalue)");
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "7\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("keeps function object names alive across collection", async () => {
    const result = await expectSuccessfulCompile("gc-function-object-name.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      expect(llvmIr).toContain("%name.slot = getelementptr i8, ptr %payload, i64 32");
      expect(llvmIr).toContain("call void @gcMarkValue(i64 %fn.name)");
      await expectLlvmAsVerificationIfAvailable(result);
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "retained\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("evaluates an arrow callback's thisArg expression", async () => {
    const result = await expectSuccessfulCompile("array-runtime-arrow-thisarg-evaluation.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "receiver\n2\n", stderr: "" });
    } finally { await result.cleanup(); }
  });

  test("keeps lexical this in an arrow callback despite its thisArg", async () => {
    const result = await expectSuccessfulCompile("array-runtime-arrow-lexical-this.ts", { link: true });
    try {
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "6\n", stderr: "" });
    } finally { await result.cleanup(); }
  });
});

describe("completion cleanup rooting", () => {
  test("restores cleanup frames while preserving IteratorClose and finally order", async () => {
    const result = await expectSuccessfulCompile("for-of-iterator-close-order.ts", { link: true });
    try {
      const { module } = await buildTypedFixture("for-of-iterator-close-order.ts");
      const frames = module.functions.flatMap((fn) => callsTo(fn, "gcRootSave"));
      const restored = new Set(module.functions.flatMap((fn) => callsTo(fn, "gcRootRestore")).map((call) => call.arguments[0]));
      expect(frames.length).toBeGreaterThan(0);
      expect(frames.every((frame) => frame.result !== undefined && restored.has(frame.result))).toBe(true);
      await expectLlvmAsVerificationIfAvailable(result);
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "1\nclose\nfinally\n1\ninner-finally\nclose\n", stderr: "" });
    } finally { await result.cleanup(); }
  });
});

// Constrained-heap stress coverage prescribed by the iterator-destructuring,
// iterator-spread, and regexp-engine plans. Every fixture allocates several
// MiB of transient cells, so running with TSCN_GC_HEAP_SIZE=2097152 (2 MiB,
// above the 1 MiB collection threshold but below the total allocation) forces
// repeated gcCollect cycles; without working collection the binaries exit 1
// on arena exhaustion. Rooting regressions surface as crashes or wrong output.
const constrainedHeapEnv = { TSCN_GC_HEAP_SIZE: "2097152" } as const;

describe("tscn GC constrained heap", () => {
  test("keeps a pending thrown payload rooted across allocating IteratorClose cleanup", async () => {
    // gc-destructure-close-stress.ts: the array-binding default throws a
    // Payload, so the thrown object is the pending completion while
    // IteratorClose runs a return() that allocates ~3 MiB of transient cells.
    // Under the constrained heap two collections fire mid-cleanup; the catch
    // must still read back "pending".
    const result = await expectSuccessfulCompile("gc-destructure-close-stress.ts", { link: true });

    try {
      await expectLlvmAsVerificationIfAvailable(result);
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "pending\n", stderr: "" }, { env: constrainedHeapEnv });
    } finally {
      await result.cleanup();
    }
  });

  test("roots the rest array across a long consumption loop under a constrained heap", async () => {
    // gc-destructure-rest-stress.ts: a 25k-element rest pattern. The rest
    // array must be boxed and rooted before the loop so the per-iteration
    // safepoint cannot sweep it.
    const result = await expectSuccessfulCompile("gc-destructure-rest-stress.ts", { link: true });

    try {
      const { module } = await buildTypedFixture("gc-destructure-rest-stress.ts");
      expect(module.functions.flatMap((fn) => callsTo(fn, "arrayFromIterator")).length).toBeGreaterThan(0);
      await expectLlvmAsVerificationIfAvailable(result);
      await expectNativeBehaviorIfAvailable(
        result,
        { status: 0, stdout: "0\n1\n24998\n2\n24999\n", stderr: "" },
        { env: constrainedHeapEnv }
      );
    } finally {
      await result.cleanup();
    }
  });

  test("keeps spread consumption loops over a generic iterable alive under a constrained heap", async () => {
    // gc-spread-iterable-stress.ts: 4000 rounds of array spread over a generic
    // iterable plus one destination array held across the whole loop. Three
    // collections fire under the constrained heap; the held array must read
    // back intact.
    const result = await expectSuccessfulCompile("gc-spread-iterable-stress.ts", { link: true });

    try {
      await expectLlvmAsVerificationIfAvailable(result);
      await expectNativeBehaviorIfAvailable(
        result,
        { status: 0, stdout: "40000\n10\n1\n10\n", stderr: "" },
        { env: constrainedHeapEnv }
      );
    } finally {
      await result.cleanup();
    }
  });

  test("keeps compiled regexps and match results alive across collection cycles", async () => {
    // gc-regexp-stress.ts: 20k fresh pattern compilations and match results,
    // with one pattern and one match held across the whole loop. Seven
    // collections fire under the constrained heap; the held values must read
    // back intact.
    const result = await expectSuccessfulCompile("gc-regexp-stress.ts", { link: true });

    try {
      await expectLlvmAsVerificationIfAvailable(result);
      await expectNativeBehaviorIfAvailable(
        result,
        { status: 0, stdout: "20000\ntrue\nword-42\nword\n42\n", stderr: "" },
        { env: constrainedHeapEnv }
      );
    } finally {
      await result.cleanup();
    }
  });
});
