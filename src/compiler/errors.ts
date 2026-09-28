import { Data } from "effect";
import type { CompilerDiagnostic } from "./diagnostics.js";

/**
 * The only typed failure in the compiler.
 *
 * `InvalidArgs` and `HelpRequested` used to live here. Nothing constructed either: @effect/cli
 * owns argument validation and the help exit, so they were error types with no producers. A
 * failure type that cannot occur is worse than no type — it widens every signature that mentions
 * it and lints as used.
 */
export class CompilationFailed extends Data.TaggedError("CompilationFailed")<{
  readonly diagnostics: readonly CompilerDiagnostic[];
}> {}
