import { type LegacyLlvmJsValues, legacyLlvmJsValues } from "./legacy-llvm.js";
import { type LlvmBlockBuilder, llvm } from "../llvm-ir/index.js";
import { type LlvmJsValues, llvmJsValues } from "./llvm.js";
import type { CompilerDiagnostic } from "../diagnostics.js";
import type { TargetFacts } from "../toolchain.js";
import { emitInlineCppJsValueSupport } from "./inline-cpp.js";
import { validateJsValueHost } from "./host.js";

export interface JsValueAbi {
  readonly llvmBoundaryType: typeof llvm.i64;
  forLlvm(block: LlvmBlockBuilder): LlvmJsValues;
  forLegacyLlvm(): LegacyLlvmJsValues;
  emitInlineCppSupport(): string;
  validateHost(target: TargetFacts): CompilerDiagnostic | undefined;
}

export const jsValueAbi: JsValueAbi = Object.freeze({
  llvmBoundaryType: llvm.i64,
  forLlvm: llvmJsValues,
  forLegacyLlvm: () => legacyLlvmJsValues,
  emitInlineCppSupport: emitInlineCppJsValueSupport,
  validateHost: validateJsValueHost
});
