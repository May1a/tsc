import type { CompilerDiagnostic } from "./diagnostics.js";

export type CompileOptions = {
  readonly entry: string;
  readonly outDir: string;
};

export type BuildArtifacts = {
  readonly llvmIr: string;
  readonly traceMap: string;
};

export type CompileResult = {
  readonly diagnostics: ReadonlyArray<CompilerDiagnostic>;
  readonly artifacts: BuildArtifacts;
};
