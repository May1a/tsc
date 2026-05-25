import type { FileSystem } from "@effect/platform";
import { Console, Effect } from "effect";
import { formatDiagnostic } from "../compiler/diagnostics.js";
import { compile } from "../compiler/pipeline.js";

type CliOptions = {
  readonly entry: string;
  readonly outDir: string;
};

const usage = `Usage: tscn <entry.ts> [--out-dir <dir>]

Compiles a project-local TypeScript ES module graph to native build artifacts.`;

const parseArgs = (args: readonly string[]): Effect.Effect<CliOptions, Error> =>
  Effect.sync(() => {
    let entry: string | undefined;
    let outDir = "build";

    for (let index = 0; index < args.length; index += 1) {
      const arg = args[index];

      if (arg === "--out-dir") {
        const value = args[index + 1];
        if (!value) {
          throw new Error("Missing value for --out-dir");
        }
        outDir = value;
        index += 1;
        continue;
      }

      if (arg === "--help" || arg === "-h") {
        throw new Error(usage);
      }

      if (arg.startsWith("-")) {
        throw new Error(`Unknown option: ${arg}`);
      }

      if (entry) {
        throw new Error(`Unexpected extra argument: ${arg}`);
      }

      entry = arg;
    }

    if (!entry) {
      throw new Error(usage);
    }

    return { entry, outDir };
  });

export const runCli = (args: readonly string[]): Effect.Effect<void, Error, FileSystem.FileSystem> =>
  Effect.gen(function* runCliEffect() {
    const options = yield* parseArgs(args);
    const result = yield* compile(options);

    for (const diagnostic of result.diagnostics) {
      yield* Console.error(formatDiagnostic(diagnostic));
    }

    if (result.diagnostics.some((diagnostic) => diagnostic.category === "error")) {
      yield* Effect.fail(new Error("Compilation failed"));
    }

    yield* Console.log(`Wrote ${result.artifacts.llvmIr}`);
    yield* Console.log(`Wrote ${result.artifacts.traceMap}`);
    if (result.artifacts.executable) {
      yield* Console.log(`Wrote ${result.artifacts.executable}`);
    }

    yield* Effect.void;
  }).pipe(
    Effect.catchAll((error) => Console.error(error.message).pipe(Effect.zipRight(Effect.fail(error))))
  );
