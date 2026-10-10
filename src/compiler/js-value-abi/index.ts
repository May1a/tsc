import { type LlvmBlockBuilder, llvm } from "../llvm-ir/index.js";
import { emitInlineCppJsValueSupport } from "./inline-cpp.js";
import { validateJsValueHost } from "./host.js";
import { type LlvmJsValues, llvmJsValues } from "./llvm.js";
import type { CompilerDiagnostic } from "../diagnostics.js";
import type { TargetFacts } from "../target.js";

export interface JsValueAbi {
  readonly llvmBoundaryType: typeof llvm.i64;
  forLlvm(block: LlvmBlockBuilder): LlvmJsValues;
  emitInlineCppSupport(): string;
  validateHost(target: TargetFacts): CompilerDiagnostic | undefined;
}

export const jsValueAbi: JsValueAbi = Object.freeze({
  llvmBoundaryType: llvm.i64,
  forLlvm: llvmJsValues,
  emitInlineCppSupport: emitInlineCppJsValueSupport,
  validateHost: validateJsValueHost
});
