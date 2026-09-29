import { readFileSync } from "node:fs";

import { jsValueAbi } from "./js-value-abi/index.js";
import { type LlvmModuleBuilder, llvm } from "./llvm-ir/index.js";

/**
 * Compiler-owned private-use property key for well-known `Symbol.iterator`.
 * Starts with U+F8FF (BMP private-use) so ordinary user-authored keys are
 * vanishingly unlikely to collide; general Symbol values remain out of scope.
 */
export const SYMBOL_ITERATOR_SENTINEL = "\uF8FFSymbol.iterator";

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

// Boxed-JSValue boundary helpers built through the structured module builder.
// Every compiled module emits them; unused definitions are inert.
export function defineStructuredRuntimeHelpers(module: LlvmModuleBuilder): void {
  module.defineFunction(
    {
      name: "valueBoxObject",
      parameters: [{ name: "object", type: llvm.ptr }],
      returns: jsValueAbi.llvmBoundaryType
    },
    (fn) => {
      const object = fn.parameter(0, llvm.ptr);
      fn.block("entry", (block) => {
        block.ret(jsValueAbi.forLlvm(block).boxReference("object", object));
      });
    }
  );
  module.defineFunction(
    { name: "valueBoxNumber", parameters: [{ name: "number", type: llvm.double }], returns: jsValueAbi.llvmBoundaryType },
    (fn) => {
      const number = fn.parameter(0, llvm.double);
      fn.block("entry", (block) => block.ret(jsValueAbi.forLlvm(block).boxNumber(number)));
    }
  );
  module.defineFunction(
    { name: "valueNumber", parameters: [{ name: "value", type: jsValueAbi.llvmBoundaryType }], returns: llvm.double },
    (fn) => {
      const value = fn.parameter(0, llvm.i64);
      fn.block("entry", (block) => {
        const values = jsValueAbi.forLlvm(block);
        block.ret(values.unboxNumber(values.fromBoundary(value)));
      });
    }
  );
}
