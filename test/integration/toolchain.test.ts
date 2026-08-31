import { Cause, Effect, Exit, Layer, Option } from "effect";
import { Toolchain, type Toolchain as ToolchainService, normalizeHostTargetFacts } from "../../src/compiler/toolchain.js";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import type { CompilationFailed } from "../../src/compiler/errors.js";
import { DiagnosticsLive } from "../../src/compiler/diagnostics-service.js";
import { NodeContext } from "@effect/platform-node";
import { compile } from "../../src/compiler/pipeline.js";
import path from "node:path";
import { tmpdir } from "node:os";

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

  test("does not claim low-48-bit compatibility for unapproved targets", () => {
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
    const layer = Layer.provideMerge(
      Layer.provideMerge(Layer.succeed(Toolchain, incompatible), NodeContext.layer),
      DiagnosticsLive
    );
    try {
      const exit = await Effect.runPromiseExit(
        compile({ entry: "test/fixtures/hello.ts", outDir, link: false }).pipe(Effect.provide(layer))
      );
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const failure = Option.getOrThrow(Cause.failureOption(exit.cause)) as CompilationFailed;
        expect(failure.diagnostics).toHaveLength(1);
        expect(failure.diagnostics[0]?.code).toBe("TSCN2005");
      }
      expect(await readFile(path.join(outDir, "diagnostics.txt"), "utf8")).toContain("error TSCN2005");
      await expect(access(path.join(outDir, "main.ll"))).rejects.toThrow();
      await expect(access(path.join(outDir, "trace-map.json"))).rejects.toThrow();
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });
});
