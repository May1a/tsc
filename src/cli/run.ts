import { Args, Command, HelpDoc, Options } from "@effect/cli";
import type { CommandExecutor, FileSystem, Path } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import { Console, Effect } from "effect";
import { formatDiagnostic } from "../compiler/diagnostics.js";
import type { Diagnostics } from "../compiler/diagnostics-service.js";
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
    FileSystem.FileSystem | Path.Path | Toolchain | CommandExecutor.CommandExecutor | Diagnostics
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
      )
    )
);
