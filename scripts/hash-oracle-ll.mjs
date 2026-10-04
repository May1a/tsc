#!/usr/bin/env node
// Compiles every oracle fixture and prints `sha256  <fixture>` for main.ll, so a refactor of
// the emission dispatch can be proven byte-identical rather than merely green.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// The fixture list moved to `oracle.ts` when it became shared between the oracle test and
// `support-manifest.test.ts`; reading the test file here found nothing and printed an empty report,
// which is the one failure mode a "byte-identical" check must not have.
const oracle = readFileSync(path.join(repoRoot, "test/integration/oracle.ts"), "utf8");
const fixtures = [...oracle.matchAll(/"([^"]+\.ts)"/g)].map((match) => match[1]);
if (fixtures.length === 0) {
  process.stderr.write("no fixtures found: the hash report would be empty, which proves nothing\n");
  process.exit(1);
}
const cli = path.join(repoRoot, "dist/cli/main.js");

const hashes = [];
const scratch = mkdtempSync(path.join(tmpdir(), "tscn-ll-hash-"));
try {
  for (const fixture of fixtures) {
    const outDir = path.join(scratch, fixture.replace(/\.ts$/, ""));
    try {
      execFileSync(process.execPath, [cli, `test/fixtures/${fixture}`, "--out-dir", outDir], { cwd: repoRoot, stdio: "pipe" });
    } catch {
      process.stderr.write(`compile failed: ${fixture}\n`);
      process.exit(1);
    }
    const digest = createHash("sha256").update(readFileSync(path.join(outDir, "main.ll"))).digest("hex");
    hashes.push(`${digest}  ${fixture}`);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
process.stdout.write(`${hashes.join("\n")}\n`);
