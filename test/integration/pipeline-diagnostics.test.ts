import { describe, expect, test } from "vitest";
import { Effect, Exit, Layer, Option } from "effect";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { compilerLiveLayer } from "../../src/compiler/live-layer.js";
import { compile } from "../../src/compiler/pipeline.js";
import { Toolchain, type Toolchain as ToolchainService } from "../../src/compiler/toolchain.js";
import { normalizeHostTargetFacts } from "../../src/compiler/target.js";
import process from "node:process";
import { compileFixture, expectSuccessfulCompile, roadmapIntegrationTimeoutMs } from "./helpers.js";

describe("diagnostics block native emission", () => {
  test("stops before emission when the frontend and Lowering both rejected the program", async () => {
    const result = await compileFixture("for-head-lhs-detached-break.ts");

    try {
      expect(result.status, result.stderr).not.toBe(0);
      expect(result.stderr).toContain("error TS1134");
      expect(result.stderr).toContain("error TSCN1002");
      expect(result.stderr).not.toContain("break has no resolved loop target");
      expect(await result.readArtifact("diagnostics.txt")).toContain("error TSCN1002");
      await expect(access(path.join(result.outDir, "main.ll"))).rejects.toThrow();
      await expect(access(path.join(result.outDir, "trace-map.json"))).rejects.toThrow();
    } finally {
      await result.cleanup();
    }
  }, roadmapIntegrationTimeoutMs);

  test("stops before emission when only the frontend rejected the program", async () => {
    const result = await compileFixture("frontend-error-lowered-cleanly.ts");

    try {
      expect(result.status, result.stderr).not.toBe(0);
      expect(result.stderr).toContain("error TS2451");
      expect(result.stderr).not.toContain("TSCN1002");
      await expect(access(path.join(result.outDir, "main.ll"))).rejects.toThrow();
    } finally {
      await result.cleanup();
    }
  }, roadmapIntegrationTimeoutMs);

  test("still writes diagnostics.txt beside the artifacts of a successful compilation", async () => {
    const result = await expectSuccessfulCompile("hello.ts");

    try {
      expect(await readFile(path.join(result.outDir, "main.ll"), "utf8")).toContain("define i32 @main()");
      await expect(access(path.join(result.outDir, "trace-map.json"))).resolves.toBeUndefined();
      expect(await readFile(path.join(result.outDir, "diagnostics.txt"), "utf8")).toBe("");
    } finally {
      await result.cleanup();
    }
  }, roadmapIntegrationTimeoutMs);

  test("still writes diagnostics.txt for a warning-only compilation", async () => {
    const withoutClang: ToolchainService = {
      clang: Option.none(),
      clangxx: Option.none(),
      llvmAs: Option.none(),
      lli: Option.none(),
      target: normalizeHostTargetFacts(process.arch, process.platform)
    };
    const layer = Layer.merge(compilerLiveLayer, Layer.succeed(Toolchain, withoutClang));
    const outDir = await mkdtemp(path.join(tmpdir(), "tscn-warning-"));
    try {
      const exit = await Effect.runPromiseExit(
        compile({ entry: "test/fixtures/hello.ts", outDir, link: true }).pipe(Effect.provide(layer))
      );
      expect(Exit.isSuccess(exit)).toBe(true);
      expect(await readFile(path.join(outDir, "diagnostics.txt"), "utf8")).toContain("warning TSCN2001");
      await expect(access(path.join(outDir, "main.ll"))).resolves.toBeUndefined();
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  }, roadmapIntegrationTimeoutMs);
});
