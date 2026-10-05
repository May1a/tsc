import { Args, Command, HelpDoc, Options } from "@effect/cli";
import type { CommandExecutor, FileSystem, Path } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import { Console, Effect } from "effect";
import { formatDiagnostic } from "../compiler/diagnostics.js";
import { CompilationFailed } from "../compiler/errors.js";
import { compile } from "../compiler/pipeline.js";
import type { Toolchain } from "../compiler/toolchain.js";

interface CliConfig {
  readonly entry: string;
  readonly outDir: string;
  readonly fcpp: boolean;
}

const rejectFlagLikeEntry = (value: string): string => {
  if (value.startsWith("-")) {
    throw new Error(`Unknown option: ${value}`);
  }
  return value;
};

const flagLikeEntryHelp = (error: unknown): HelpDoc.HelpDoc => {
  if (error instanceof Error) {
    return HelpDoc.p(error.message);
  }
  return HelpDoc.p(String(error));
};

const describeError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

/**
 * A distinct code so this cannot be mistaken for a complaint about the source.
 *
 * `TSCN1001` is "NPM package imports are not supported yet" and `TSCN1002` is every diagnostic about a
 * program. An internal error is neither: nothing about the program is wrong, and a user who sees
 * `TSCN1001` here would go looking for an import.
 */
const internalErrorCode = "TSCN1000";

/** A defect arrives wrapped in a `Cause`, so the message has to be dug out rather than read off the top. */
const describeDefect = (defect: unknown): string => describeError(defect);

export const tscnCommand = Command.make(
  "tscn",
  {
    entry: Args.text({ name: "entry" }).pipe(Args.mapTryCatch(rejectFlagLikeEntry, flagLikeEntryHelp)),
    outDir: Options.text("out-dir").pipe(Options.withDefault("build")),
    fcpp: Options.boolean("fcpp")
  },
  (config: CliConfig): Effect.Effect<
    void,
    CompilationFailed | PlatformError,
    FileSystem.FileSystem | Path.Path | Toolchain | CommandExecutor.CommandExecutor
  > =>
    Effect.gen(function* runHandler() {
      const result = yield* compile(config);

      yield* Console.log(`Wrote ${result.artifacts.llvmIr}`);
      yield* Console.log(`Wrote ${result.artifacts.traceMap}`);
      if (result.artifacts.inlineCpp) {
        yield* Console.log(`Wrote ${result.artifacts.inlineCpp}`);
      }
      if (result.artifacts.executable) {
        yield* Console.log(`Wrote ${result.artifacts.executable}`);
      }

      for (const diagnostic of result.diagnostics) {
        yield* Console.error(formatDiagnostic(diagnostic));
      }
    }).pipe(
      Effect.catchTag("CompilationFailed", (error) =>
        Effect.gen(function* printFailure() {
          for (const diagnostic of error.diagnostics) {
            yield* Console.error(formatDiagnostic(diagnostic));
          }
          return yield* Effect.fail(error);
        })
      ),
      Effect.catchAll((error) =>
        Effect.gen(function* printUnexpectedFailure() {
          if (error instanceof CompilationFailed) {
            return yield* Effect.fail(error);
          }
          yield* Console.error(`error: ${describeError(error)}`);
          return yield* Effect.fail(error);
        })
      ),
      // A *defect* — an exception thrown rather than a typed failure — is what the compiler does when
      // lowering admits a shape the emitter cannot back, and `runMain` is configured with error
      // reporting off. Without this it left the process with nothing to say: exit status 1 and no output
      // at all, which is the one failure a user cannot act on and which hides the fact that the compiler
      // produced an internal error rather than a diagnostic.
      Effect.catchAllDefect((defect) =>
        Effect.gen(function* reportDefect() {
          const message = describeDefect(defect);
          yield* Console.error(`error: ${message}`);
          // Failing rather than returning is what makes the exit status non-zero. Reporting alone left
          // the process exiting 0 on an internal error, which is worse than the silence it replaced: a
          // build step would treat a compiler crash as a success.
          return yield* Effect.fail(
            new CompilationFailed({
              diagnostics: [{ code: internalErrorCode, category: "error", message: `internal compiler error: ${message}` }]
            })
          );
        })
      )
    )
);
