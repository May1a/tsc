import { type CommandExecutor, FileSystem, Path } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import { Effect } from "effect";
import { formatDiagnostic } from "./diagnostics.js";
import { Diagnostics } from "./diagnostics-service.js";
import { CompilationFailed } from "./errors.js";
import { loadProgram } from "./frontend.js";
import { lowerToJsIr } from "./ir.js";
import { linkerErrorToLinkResult, linkWithClang, type LinkResult } from "./linker.js";
import { emitLlvmIr, emitTraceMap } from "./llvm.js";
import type { Toolchain } from "./toolchain.js";
import type { CompileOptions, CompileResult } from "./types.js";

export const compile = (
  options: CompileOptions
): Effect.Effect<
  CompileResult,
  CompilationFailed | PlatformError,
  FileSystem.FileSystem | Path.Path | Toolchain | CommandExecutor.CommandExecutor | Diagnostics
> =>
  Effect.gen(function* compileProgram() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const diagnostics = yield* Diagnostics;

    const frontend = yield* loadProgram(options.entry);
    const jsIr = yield* lowerToJsIr(path.resolve(options.entry), frontend.sourceFiles, frontend.program.getTypeChecker());

    yield* fs.makeDirectory(options.outDir, { recursive: true });

    const llvmIr = path.join(options.outDir, "main.ll");
    const traceMap = path.join(options.outDir, "trace-map.json");
    const diagnosticsPath = path.join(options.outDir, "diagnostics.txt");
    const executable = path.join(options.outDir, "main");

    yield* fs.writeFileString(llvmIr, emitLlvmIr(jsIr.module));
    yield* fs.writeFileString(traceMap, emitTraceMap(jsIr.module));

    const frontendAndIrDiagnostics = yield* diagnostics.drain();
    let link: LinkResult = { diagnostics: [] };
    if (options.link !== false && !frontendAndIrDiagnostics.some((diagnostic) => diagnostic.category === "error")) {
      link = yield* linkWithClang(llvmIr, executable).pipe(Effect.catchAll((error) => Effect.succeed(linkerErrorToLinkResult(error))));
    }
    const allDiagnostics = [...frontendAndIrDiagnostics, ...link.diagnostics];

    yield* fs.writeFileString(diagnosticsPath, allDiagnostics.map(formatDiagnostic).join("\n"));

    if (allDiagnostics.some((diagnostic) => diagnostic.category === "error")) {
      return yield* Effect.fail(new CompilationFailed({ diagnostics: allDiagnostics }));
    }

    return {
      diagnostics: allDiagnostics,
      artifacts: {
        llvmIr,
        traceMap,
        executable: link.executable
      }
    };
  });

