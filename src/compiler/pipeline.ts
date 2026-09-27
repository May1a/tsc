import { type CommandExecutor, FileSystem, Path } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import { Effect } from "effect";
import { type CompilerDiagnostic, formatDiagnostic } from "./diagnostics.js";
import { CompilationFailed } from "./errors.js";
import { loadProgram } from "./frontend.js";
import { lowerToJsIr } from "./ir.js";
import { type LinkResult, linkWithClang, linkWithClangxx, linkerErrorToLinkResult } from "./linker.js";
import { emitInlineCppSource, emitLlvmModule } from "./llvm.js";
import { Toolchain } from "./toolchain.js";
import type { CompileOptions, CompileResult } from "./types.js";
import { jsValueAbi } from "./js-value-abi/index.js";

export const compile = (
  options: CompileOptions
): Effect.Effect<
  CompileResult,
  CompilationFailed | PlatformError,
  FileSystem.FileSystem | Path.Path | Toolchain | CommandExecutor.CommandExecutor
> =>
  // eslint-disable-next-line max-statements -- Compilation keeps artifact ordering and early diagnostic failure in one Effect transaction.
  Effect.gen(function* compileProgram() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const toolchain = yield* Toolchain;

    // Diagnostics accumulate in a local list rather than an ambient service. The service had one
    // implementation, one consumer and three dead methods, and required the caller to drain it at a
    // fixed point in the pipeline — an ordering invariant that lived nowhere but in this function.
    const diagnostics: CompilerDiagnostic[] = [];

    yield* fs.makeDirectory(options.outDir, { recursive: true });
    const diagnosticsPath = path.join(options.outDir, "diagnostics.txt");
    const hostDiagnostic = jsValueAbi.validateHost(toolchain.target);
    if (hostDiagnostic !== undefined) {
      diagnostics.push(hostDiagnostic);
      yield* fs.writeFileString(diagnosticsPath, diagnostics.map(formatDiagnostic).join("\n"));
      return yield* Effect.fail(new CompilationFailed({ diagnostics }));
    }

    const frontend = yield* loadProgram(options.entry, {
      suppressSemanticDiagnostics: options.suppressSemanticDiagnostics
    });
    diagnostics.push(...frontend.diagnostics);
    const jsIr = lowerToJsIr(path.resolve(options.entry), frontend.sourceFiles, frontend.program.getTypeChecker(), {
      fcpp: options.fcpp
    });

    const llvmIr = path.join(options.outDir, "main.ll");
    const traceMap = path.join(options.outDir, "trace-map.json");
    const executable = path.join(options.outDir, "main");
    let inlineCpp: string | undefined;
    if (jsIr.module.inlineCppBlocks.length > 0) {
      inlineCpp = path.join(options.outDir, "inline-cpp.cpp");
    }

    const emission = emitLlvmModule(jsIr.module);
    yield* fs.writeFileString(llvmIr, emission.llvmIr);
    yield* fs.writeFileString(traceMap, `${JSON.stringify(emission.traceMap, undefined, 2)}\n`);
    if (inlineCpp !== undefined) {
      yield* fs.writeFileString(inlineCpp, emitInlineCppSource(jsIr.module.inlineCppBlocks));
    }

    diagnostics.push(...jsIr.diagnostics);
    diagnostics.push(...emission.diagnostics);
    let link: LinkResult = { diagnostics: [] };
    if (options.link !== false && !diagnostics.some((diagnostic) => diagnostic.category === "error")) {
      let linkEffect = linkWithClang(llvmIr, executable);
      if (inlineCpp !== undefined) {
        linkEffect = linkWithClangxx(llvmIr, inlineCpp, executable);
      }
      link = yield* linkEffect.pipe(Effect.catchAll((error) => Effect.succeed(linkerErrorToLinkResult(error))));
    }
    const allDiagnostics = [...diagnostics, ...link.diagnostics];

    yield* fs.writeFileString(diagnosticsPath, allDiagnostics.map(formatDiagnostic).join("\n"));

    if (allDiagnostics.some((diagnostic) => diagnostic.category === "error")) {
      return yield* Effect.fail(new CompilationFailed({ diagnostics: allDiagnostics }));
    }

    return {
      diagnostics: allDiagnostics,
      artifacts: {
        llvmIr,
        traceMap,
        inlineCpp,
        executable: link.executable
      }
    };
  });
