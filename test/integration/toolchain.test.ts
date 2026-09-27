import { describe, expect, test } from "vitest";
import { Cause, Effect, Exit, Layer, Option } from "effect";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CompilationFailed } from "../../src/compiler/errors.js";
import { compilerLiveLayer } from "../../src/compiler/live-layer.js";
import { compile } from "../../src/compiler/pipeline.js";
import { Toolchain, type Toolchain as ToolchainService, normalizeHostTargetFacts } from "../../src/compiler/toolchain.js";

describe("toolchain target facts", () => {
  test("normalizes supported x86-64 hosts", () => {
    expect(normalizeHostTargetFacts("x64", "linux")).toEqual({
      triple: "x86_64-linux",
      architecture: "x86_64",
      pointerWidthBits: 64,
      doubleFormat: "ieee754-binary64",
      pointerAddressBits: 48
    });
  });

  test("approves the current arm64 Darwin host without approving other AArch64 targets", () => {
    // FIXME(arm64-darwin): This locks in a narrow host exception, not general
    // AArch64 support. Replace it when target capabilities become explicit.
    expect(normalizeHostTargetFacts("arm64", "darwin")).toEqual({
      triple: "aarch64-darwin",
      architecture: "aarch64",
      pointerWidthBits: 64,
      doubleFormat: "ieee754-binary64",
      pointerAddressBits: 47
    });
    expect(normalizeHostTargetFacts("arm64", "linux")).toMatchObject({
      architecture: "aarch64",
      pointerWidthBits: 64,
      pointerAddressBits: undefined
    });
    expect(normalizeHostTargetFacts("ia32", "linux")).toMatchObject({
      architecture: "x86",
      pointerWidthBits: 32,
      pointerAddressBits: undefined
    });
  });

  test("fails before frontend and LLVM emission on an incompatible host", async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), "tscn-host-"));
    const incompatible: ToolchainService = {
      clang: Option.none(),
      clangxx: Option.none(),
      llvmAs: Option.none(),
      lli: Option.none(),
      target: {
        triple: "x86-linux",
        architecture: "x86",
        pointerWidthBits: 32,
        doubleFormat: "ieee754-binary64",
        pointerAddressBits: undefined
      }
    };
    const layer = Layer.merge(compilerLiveLayer, Layer.succeed(Toolchain, incompatible));
    try {
      const exit = await Effect.runPromiseExit(
        compile({ entry: "test/fixtures/hello.ts", outDir, link: false }).pipe(Effect.provide(layer))
      );
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        // Narrowed, not asserted: see the note in helpers.ts. Reading `.diagnostics` off an
        // un-narrowed cause would pass vacuously if the failure were a PlatformError.
        const failure = Cause.failureOption(exit.cause);
        if (!Option.isSome(failure) || !(failure.value instanceof CompilationFailed)) {
          throw new Error(`Expected CompilationFailed but the cause was: ${Cause.pretty(exit.cause)}`);
        }
        const { diagnostics } = failure.value;
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.code).toBe("TSCN2005");
      }
      expect(await readFile(path.join(outDir, "diagnostics.txt"), "utf8")).toContain("error TSCN2005");
      await expect(access(path.join(outDir, "main.ll"))).rejects.toThrow();
      await expect(access(path.join(outDir, "trace-map.json"))).rejects.toThrow();
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });
});
