import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Effect } from "effect";
import { NodeContext } from "@effect/platform-node";
import { describe, expect, test } from "vitest";
import { loadProgram } from "../../src/compiler/frontend.js";

describe("frontend standalone defaults", () => {
  test("compiles a standalone file outside the repo without loading ambient @types from cwd", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "tscn-standalone-"));
    const entry = path.join(dir, "standalone.ts");
    writeFileSync(entry, "const x: number = 1 + 2;\nconsole.log(x);\n", "utf8");
    try {
      const result = await Effect.runPromise(loadProgram(entry).pipe(Effect.provide(NodeContext.layer)));
      expect(result.diagnostics).toEqual([]);
      expect(result.sourceFiles.map((file) => path.resolve(file.fileName))).toContain(path.resolve(entry));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
