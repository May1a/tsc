import { Command, type CommandExecutor } from "@effect/platform";
import { SystemError } from "@effect/platform/Error";
import { Data, Effect, Fiber, Option, Stream } from "effect";
import type { CompilerDiagnostic } from "./diagnostics.js";
import { Toolchain } from "./toolchain.js";

export interface LinkResult {
  readonly executable?: string;
  readonly diagnostics: readonly CompilerDiagnostic[];
}

export class LinkerLaunchFailed extends Data.TaggedError("LinkerLaunchFailed")<{
  readonly message: string;
}> {}

export class LinkerExitFailed extends Data.TaggedError("LinkerExitFailed")<{
  readonly toolName: string;
  readonly exitCode: number;
  readonly stderr: string;
}> {}

export type LinkerError = LinkerLaunchFailed | LinkerExitFailed;

const missingClangDiagnostic: CompilerDiagnostic = {
  code: "TSCN2001",
  category: "warning",
  message: "compatible clang was not found during toolchain discovery; LLVM IR was emitted but no native executable was linked"
};

const missingClangxxDiagnostic: CompilerDiagnostic = {
  code: "TSCN2004",
  category: "warning",
  message: "compatible clang++ was not found during toolchain discovery; LLVM IR and inline C++ were emitted but no native executable was linked"
};

const linkFailureDiagnostic = (message: string): CompilerDiagnostic => ({
  code: "TSCN2002",
  category: "error",
  message
});

const linkExitFailureDiagnostic = (toolName: string, exitCode: number, stderr: string): CompilerDiagnostic => {
  const exitLabel = String(exitCode);
  let stderrLabel = "";
  if (stderr) {
    stderrLabel = `: ${stderr.trim()}`;
  }
  return {
    code: "TSCN2003",
    category: "error",
    message: `${toolName} failed with exit code ${exitLabel}${stderrLabel}`
  };
};

const runClang = (
  clangPath: string,
  args: readonly string[],
  executable: string,
  missingToolDiagnostic: CompilerDiagnostic,
  toolName: string
): Effect.Effect<LinkResult, LinkerError, CommandExecutor.CommandExecutor> => {
  const command = Command.make(clangPath, ...args);
  return Effect.scoped(
    Effect.gen(function* runClangScoped() {
      const process = yield* Command.start(command);
      const stderrFiber = yield* Effect.fork(
        Stream.runFold(Stream.decodeText(process.stderr, "utf8"), "", (acc, chunk) => acc + chunk)
      );
      const exitCode = yield* process.exitCode;
      const stderr = yield* Fiber.join(stderrFiber);
      if (exitCode === 0) {
        return { executable, diagnostics: [] };
      }
      return yield* Effect.fail(new LinkerExitFailed({ toolName, exitCode, stderr }));
    })
  ).pipe(
    Effect.catchAll((error) => {
      if (error instanceof SystemError && error.reason === "NotFound") {
        return Effect.succeed({ diagnostics: [missingToolDiagnostic] });
      }
      if (error instanceof LinkerExitFailed) {
        return Effect.fail(error);
      }
      // eslint-disable-next-line unicorn/no-useless-undefined -- init-declarations requires explicit initializer
      let description: string | undefined = undefined;
      if (error instanceof Error) {
        description = error.message;
      } else {
        description = String(error);
      }
      return Effect.succeed({ diagnostics: [linkFailureDiagnostic(`Failed to start ${clangPath}: ${description}`)] });
    })
  );
};

export const linkWithClang = (
  llvmIr: string,
  executable: string
): Effect.Effect<LinkResult, LinkerError, Toolchain | CommandExecutor.CommandExecutor> =>
  Effect.gen(function* linkWithDiscoveredClang() {
    const toolchain = yield* Toolchain;
    if (Option.isNone(toolchain.clang)) {
      return { diagnostics: [missingClangDiagnostic] };
    }
    return yield* runClang(
      toolchain.clang.value,
      [llvmIr, "-o", executable, "-lm"],
      executable,
      missingClangDiagnostic,
      "clang"
    );
  });

export const linkWithClangxx = (
  llvmIr: string,
  inlineCpp: string,
  executable: string
): Effect.Effect<LinkResult, LinkerError, Toolchain | CommandExecutor.CommandExecutor> =>
  Effect.gen(function* linkWithDiscoveredClangxx() {
    const toolchain = yield* Toolchain;
    if (Option.isNone(toolchain.clangxx)) {
      return { diagnostics: [missingClangxxDiagnostic] };
    }
    return yield* runClang(
      toolchain.clangxx.value,
      ["-std=c++20", llvmIr, inlineCpp, "-o", executable, "-lm"],
      executable,
      missingClangxxDiagnostic,
      "clang++"
    );
  });

export const linkerErrorToLinkResult = (error: LinkerError): LinkResult => {
  if (error instanceof LinkerExitFailed) {
    return { diagnostics: [linkExitFailureDiagnostic(error.toolName, error.exitCode, error.stderr)] };
  }
  return { diagnostics: [linkFailureDiagnostic(error.message)] };
};
