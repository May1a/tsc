import { llvm, type LlvmBlockBuilder } from "../llvm-ir/index.js";
import { emitInlineCppJsValueSupport } from "./inline-cpp.js";
import { validateJsValueHost } from "./host.js";
import { llvmJsValues, type LlvmJsValues } from "./llvm.js";
import { legacyLlvmJsValues, type LegacyLlvmJsValues } from "./legacy-llvm.js";
import type { CompilerDiagnostic } from "../diagnostics.js";
import type { TargetFacts } from "../toolchain.js";

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
