import type { CompilerDiagnostic } from "./diagnostics.js";
import { Data } from "effect";

export class CompilationFailed extends Data.TaggedError("CompilationFailed")<{
  readonly diagnostics: readonly CompilerDiagnostic[];
}> {}

export class InvalidArgs extends Data.TaggedError("InvalidArgs")<{
  readonly message: string;
}> {}

export class HelpRequested extends Data.TaggedError("HelpRequested") {}
