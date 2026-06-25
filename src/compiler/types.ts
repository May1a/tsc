import type { CompilerDiagnostic } from "./diagnostics.js";

export type CompileOptions = {
  readonly entry: string;
  readonly outDir: string;
  readonly link?: boolean;
  readonly fcpp?: boolean;
};

export type BuildArtifacts = {
  readonly llvmIr: string;
  readonly traceMap: string;
  readonly inlineCpp?: string;
  readonly executable?: string;
};

export type CompileResult = {
  /**
   * Success-channel diagnostics. Only `warning` and `info` categories are
   * present here; error-category diagnostics are surfaced as a typed
   * `CompilationFailed` failure rather than being smuggled through this field.
   */
  readonly diagnostics: readonly CompilerDiagnostic[];
  readonly artifacts: BuildArtifacts;
};
