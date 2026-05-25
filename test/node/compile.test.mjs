import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const cli = path.join(repoRoot, "dist/cli/main.js");

test("lowers top-level print string calls to LLVM IR", async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), "tscn-print-"));

  try {
    const result = spawnSync(
      process.execPath,
      [cli, "test/fixtures/hello.ts", "--out-dir", outDir],
      { cwd: repoRoot, encoding: "utf8" }
    );

    assert.equal(result.status, 0, result.stderr);

    const llvmIr = await readFile(path.join(outDir, "main.ll"), "utf8");
    assert.match(llvmIr, /declare i32 @puts\(ptr\)/);
    assert.match(llvmIr, /c"hello from tscn\\00"/);
    assert.match(llvmIr, /call i32 @puts\(ptr @\.str\.0\)/);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test("loads project-local ES module imports without treating imports as executable statements", async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), "tscn-import-"));

  try {
    const result = spawnSync(
      process.execPath,
      [cli, "test/fixtures/entry-with-import.ts", "--out-dir", outDir],
      { cwd: repoRoot, encoding: "utf8" }
    );

    assert.equal(result.status, 0, result.stderr);

    const llvmIr = await readFile(path.join(outDir, "main.ll"), "utf8");
    assert.match(llvmIr, /c"from imported module\\00"/);
    assert.match(llvmIr, /c"from entry module\\00"/);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test("lowers top-level const string bindings used by print", async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), "tscn-const-string-"));

  try {
    const result = spawnSync(
      process.execPath,
      [cli, "test/fixtures/const-string.ts", "--out-dir", outDir],
      { cwd: repoRoot, encoding: "utf8" }
    );

    assert.equal(result.status, 0, result.stderr);

    const llvmIr = await readFile(path.join(outDir, "main.ll"), "utf8");
    assert.match(llvmIr, /c"from const string\\00"/);
    assert.match(llvmIr, /call i32 @puts\(ptr @\.str\.0\)/);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test("rejects unsupported executable statements with a slice diagnostic", async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), "tscn-unsupported-"));

  try {
    const result = spawnSync(
      process.execPath,
      [cli, "test/fixtures/unsupported.ts", "--out-dir", outDir],
      { cwd: repoRoot, encoding: "utf8" }
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /error TSCN1002/);

    const diagnostics = await readFile(path.join(outDir, "diagnostics.txt"), "utf8");
    assert.match(diagnostics, /Only top-level const string bindings and print calls are supported/);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
