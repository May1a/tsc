// Copies the runtime .ll sources into dist so the compiled compiler in dist/
// can load them relative to its own module URL.
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(repoRoot, "src/compiler/runtime");
const targetDir = join(repoRoot, "dist/compiler/runtime");

if (!existsSync(join(repoRoot, "dist/compiler"))) {
  throw new Error("dist/compiler does not exist; run `tsc -p tsconfig.json` before copying runtime IR");
}
rmSync(targetDir, { recursive: true, force: true });
cpSync(sourceDir, targetDir, { recursive: true });
