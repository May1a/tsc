import { readFileSync } from "node:fs";

// Runtime LLVM IR lives in per-domain .ll files next to this module. Every
// file is emitted into every compiled module; the LLVM module is one unit, so
// unused definitions are inert.
const runtimeIrFiles = [
  "declares.ll",
  "globals.ll",
  "gc.ll",
  "values.ll",
  "numbers.ll",
  "strings.ll",
  "regex.ll",
  "arrays.ll",
  "objects.ll",
  "collections.ll",
  "functions.ll",
  "callbacks.ll",
  "json.ll",
  "errors.ll",
  "iterators.ll"
] as const;

let cachedRuntimeIr: string | undefined;

export function runtimeIrText(): string {
  cachedRuntimeIr ??= runtimeIrFiles
    .map((file) => readFileSync(new URL(`runtime/${file}`, import.meta.url), "utf8"))
    .join("\n");
  return cachedRuntimeIr;
}
