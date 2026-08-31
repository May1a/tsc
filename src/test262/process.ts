import { Effect, Fiber, Stream } from "effect";
import { Command } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";

export interface CapturedProcess {
  readonly timedOut: boolean;
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly termination?: string;
}

type ExitObservation =
  | { readonly kind: "exited"; readonly code: number }
  | { readonly kind: "terminated"; readonly message: string }
  | { readonly kind: "timed-out" };

const collectText = <Error, Requirements>(
  stream: Stream.Stream<Uint8Array, Error, Requirements>
): Effect.Effect<string, Error, Requirements> =>
  Stream.runFold(Stream.decodeText(stream, "utf8"), "", (accumulated, chunk) => accumulated + chunk);

/**
 * Runs a process to completion, capturing stdout and stderr. When the process
 * exceeds `timeoutMs` it is killed and reported with `timedOut: true`. Death
 * by signal is captured as a `termination` note instead of an exception so a
 * crashing native binary reads as ordinary (mismatched) observed behavior.
 */
export const captureProcessWithTimeout = async (
  executable: string,
  args: readonly string[],
  options: { readonly cwd?: string; readonly env?: Record<string, string>; readonly timeoutMs: number }
): Promise<CapturedProcess> =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* captureProcessGen() {
        let command = Command.make(executable, ...args);
        if (options.cwd !== undefined) {
          command = Command.workingDirectory(command, options.cwd);
        }
        if (options.env !== undefined) {
          command = Command.env(command, options.env);
        }
        const process = yield* Command.start(command);
        const stdoutFiber = yield* Effect.fork(collectText(process.stdout));
        const stderrFiber = yield* Effect.fork(collectText(process.stderr));
        const waitExit = process.exitCode.pipe(
          Effect.map((code): ExitObservation => ({ kind: "exited", code })),
          Effect.catchAll((error) => Effect.succeed<ExitObservation>({ kind: "terminated", message: String(error) }))
        );
        const timeout = Effect.sleep(options.timeoutMs).pipe(Effect.map((): ExitObservation => ({ kind: "timed-out" })));
        const observation = yield* Effect.race(waitExit, timeout);
        if (observation.kind === "timed-out") {
          yield* process.kill().pipe(Effect.ignore);
        }
        const stdout = yield* Fiber.join(stdoutFiber);
        const stderr = yield* Fiber.join(stderrFiber);
        if (observation.kind === "timed-out") {
          return { timedOut: true, status: -1, stdout, stderr };
        }
        if (observation.kind === "terminated") {
          return { timedOut: false, status: -1, stdout, stderr, termination: observation.message };
        }
        return { timedOut: false, status: observation.code, stdout, stderr };
      })
    ).pipe(Effect.provide(NodeContext.layer))
  );
