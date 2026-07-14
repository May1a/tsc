import { describe, expect, test } from "vitest";
import {
  countOccurrences,
  expectLlvmAsVerificationIfAvailable,
  expectNativeBehaviorIfAvailable,
  expectSuccessfulCompile
} from "./helpers.js";

// Phase A coverage for the GC scaffolding. The test confirms that:
//   - the runtime helpers emit the gcInit definition
//   - @main's entry block calls gcInit exactly once
//   - the gcInit call lands before any user statement
//   - the LLVM IR still verifies with llvm-as when present
//   - hello.ts continues to run end-to-end through the GC initializer
//
// Phase B extends this with:
//   - the valueBoxString -> gcAlloc migration + 8-byte header offset
//   - balanced gcRootPush/gcRootPop at every allocating call site
//   - a 100-iteration string concat stress fixture that runs end-to-end
describe("tscn GC scaffolding (phase A)", () => {
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
      // hello.ts only calls @gcInit, never @gcAlloc or @gcRootPush.
      expect(llvmIr).not.toMatch(/call.+@gcAlloc/);
      expect(llvmIr).not.toMatch(/call.+@gcRootPush/);
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

// Phase B coverage: valueBoxString now allocates through @gcAlloc (8-byte
// header + 16-byte payload), roots are pinned with gcRootPush and released by
// the depth-based gcRootSave/gcRootRestore protocol, collection only runs at
// gcSafepoint boundaries, and the GC survives a 70k-iteration string
// concatenation loop that crosses the initial collection threshold.
describe("tscn GC strings (phase B)", () => {
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
      // Each loop body opens with a frame restore immediately followed by a
      // safepoint, so prior-iteration temporaries are dropped and collected.
      expect(llvmIr).toMatch(/call void @gcRootRestore\(i64 %gc\.loop\.\d+\)\n\s*call void @gcSafepoint\(\)/);
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

  test("runs gc-stress-strings through 100 concatenations", async () => {
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

// Phase C coverage: object/array/collection/error helpers now allocate through
// gcAlloc (8-byte header + payload at +8), the class-instance call site is
// bracketed by gcRootPush/gcRootPop, and every other allocating helper
// (objectSet's entries-buffer grow path, arraySet's element grow path, the
// spread into arrayConcat) is similarly bracketed. The three new stress
// fixtures exercise the end-to-end instrumentation on real-shape programs.
describe("tscn GC objects/arrays/collections (phase C)", () => {
  // Per-fixture shape assertions: every fixture should compile, verify with
  // llvm-as, allocate at least one non-string GC cell, and balance
  // gcRootPush/gcRootPop. The fixtures are listed together so a single failing
  // case localizes the regression to one input.
  const phaseCFixtures = ["gc-stress-objects.ts", "gc-class-fields.ts", "gc-drop-and-reuse.ts"] as const;

  for (const fixture of phaseCFixtures) {
    test(`${fixture} emits balanced root-stack instrumentation and uses gcAlloc`, async () => {
      const result = await expectSuccessfulCompile(fixture);

      try {
        const llvmIr = await result.readArtifact("main.ll");
        // Depth-based rooting: pushes are pinned and released by frame restore.
        expect(countOccurrences(llvmIr, "call void @gcRootPush("), `${fixture}: expected at least one gcRootPush`).toBeGreaterThan(0);
        expect(countOccurrences(llvmIr, "call i64 @gcRootSave("), `${fixture}: expected gcRootSave frames`).toBeGreaterThan(0);
        expect(countOccurrences(llvmIr, "call void @gcRootRestore("), `${fixture}: expected gcRootRestore frame resets`).toBeGreaterThan(0);
        // Every Phase C fixture allocates at least one object cell
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

  test("valueBoxObject call site pins the new instance with gcRootPush before the constructor", async () => {
    // The class-field fixture exercises newInstance: a valueBoxObject call
    // followed by the constructor call inside `build()`. The instance cell is
    // gcAlloc-managed, so we expect a gcRootPush between valueBoxObject and the
    // constructor call. The instance stays pinned on the frame afterwards (no
    // immediate pop) and is released by the function's gcRootRestore, so a later
    // allocation in the consumer cannot collect the freshly-built object. We look
    // for this pattern specifically inside @build (where `new Greeter(...)`
    // lowers to) and skip the prototype construction in @main.
    const result = await expectSuccessfulCompile("gc-class-fields.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      const buildDef = /define .* @build\(/.exec(llvmIr);
      expect(buildDef, "expected @build definition in emitted IR").not.toBeNull();
      const buildDefStart = buildDef?.index ?? 0;
      // Find @build's terminator (the next closing brace at column 0).
      let buildEnd = llvmIr.length;
      const linesAfterBuild = llvmIr.slice(buildDefStart);
      const retMatch = /\n\}/.exec(linesAfterBuild);
      if (retMatch !== null) {
        buildEnd = buildDefStart + retMatch.index + 2;
      }
      const buildSlice = llvmIr.slice(buildDefStart, buildEnd);
      const buildLines = buildSlice.split("\n");
      const boxObjectIndices: number[] = [];
      for (let i = 0; i < buildLines.length; i += 1) {
        if (buildLines[i]?.includes("= call i64 @valueBoxObject(")) {
          boxObjectIndices.push(i);
        }
      }
      expect(boxObjectIndices.length, "expected a valueBoxObject call inside @build").toBe(1);
      const callIndex = boxObjectIndices[0] ?? -1;
      if (callIndex < 0) {
        throw new Error("expected valueBoxObject call index to be defined");
      }
      const windowRadius = 6;
      const window = buildLines.slice(callIndex, callIndex + windowRadius).join("\n");
      expect(
        window,
        `valueBoxObject at @build line ${callIndex + 1} not followed by a constructor call within ${windowRadius} lines`
      ).toMatch(/call void @Greeter\$constructor\(/);
      const pushWindowRadius = 3;
      const pushWindow = buildLines.slice(callIndex, callIndex + pushWindowRadius).join("\n");
      expect(
        pushWindow,
        `valueBoxObject at @build line ${callIndex + 1} not followed by a gcRootPush within ${pushWindowRadius} lines`
      ).toMatch(/call void @gcRootPush\(/);
    } finally {
      await result.cleanup();
    }
  });

  test("keeps an array callback receiver alive across collection", async () => {
    const result = await expectSuccessfulCompile("gc-function-thisarg.ts", { link: true });

    try {
      const llvmIr = await result.readArtifact("main.ll");
      const callback = /define i64 @__tscn_fnobj_[^(]+\([^)]*i64 %this\.value\) \{[\s\S]*?\n\}/.exec(llvmIr)?.[0] ?? "";
      expect(callback, "expected an emitted function-object callback").not.toBe("");
      expect(callback).toContain("call void @gcRootPush(i64 %this.value)");
      expect(llvmIr).toContain("call void @gcMarkValue(i64 %fn.this)");
      expect(llvmIr).toMatch(/call i64 @functionObjectNew\([^\n]+\)\n\s*call void @gcRootRestore\([^\n]+\)\n\s*call void @gcRootPush\(/);
      await expectLlvmAsVerificationIfAvailable(result);
      await expectNativeBehaviorIfAvailable(result, { status: 0, stdout: "7\n", stderr: "" });
    } finally {
      await result.cleanup();
    }
  });

  test("evaluates but does not bind thisArg for an arrow callback", async () => {
    const result = await expectSuccessfulCompile("array-runtime-arrow-thisarg-evaluation.ts");

    try {
      const llvmIr = await result.readArtifact("main.ll");
      const receiverCall = llvmIr.indexOf("call i64 @receiver(");
      const functionObjectCall = llvmIr.indexOf("call i64 @functionObjectNew(");
      expect(receiverCall).toBeGreaterThanOrEqual(0);
      expect(functionObjectCall).toBeGreaterThan(receiverCall);
      expect(llvmIr).toMatch(/call i64 @functionObjectNew\(ptr @[^,]+, ptr null, i64 9222246136947933184\)/);
    } finally {
      await result.cleanup();
    }
  });
});
