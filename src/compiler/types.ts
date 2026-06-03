import type { CompilerDiagnostic } from "./diagnostics.js";

export type CompileOptions = {
  readonly entry: string;
  readonly outDir: string;
  readonly link?: boolean;
};

export type BuildArtifacts = {
  readonly llvmIr: string;
  readonly traceMap: string;
  readonly executable?: string;
};

export type CompileResult = {
  readonly diagnostics: readonly CompilerDiagnostic[];
  readonly artifacts: BuildArtifacts;
};
