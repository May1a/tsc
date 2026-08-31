import { type CommandExecutor, FileSystem, Path } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import { Effect } from "effect";
import { formatDiagnostic } from "./diagnostics.js";
import { Diagnostics } from "./diagnostics-service.js";
import { CompilationFailed } from "./errors.js";
import { loadProgram } from "./frontend.js";
import { lowerToJsIr } from "./ir.js";
import { linkerErrorToLinkResult, linkWithClang, linkWithClangxx, type LinkResult } from "./linker.js";
import { emitInlineCppSource, emitLlvmModule } from "./llvm.js";
import { Toolchain } from "./toolchain.js";
import type { CompileOptions, CompileResult } from "./types.js";
import { jsValueAbi } from "./js-value-abi/index.js";

export const compile = (
  options: CompileOptions
): Effect.Effect<
  CompileResult,
  CompilationFailed | PlatformError,
  FileSystem.FileSystem | Path.Path | Toolchain | CommandExecutor.CommandExecutor | Diagnostics
> =>
  // eslint-disable-next-line max-statements -- Compilation keeps artifact ordering and early diagnostic failure in one Effect transaction.
  Effect.gen(function* compileProgram() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const diagnostics = yield* Diagnostics;
    const toolchain = yield* Toolchain;

    yield* fs.makeDirectory(options.outDir, { recursive: true });
    const diagnosticsPath = path.join(options.outDir, "diagnostics.txt");
    const hostDiagnostic = jsValueAbi.validateHost(toolchain.target);
    if (hostDiagnostic !== undefined) {
      yield* diagnostics.add(hostDiagnostic);
      const hostDiagnostics = yield* diagnostics.drain();
      yield* fs.writeFileString(diagnosticsPath, hostDiagnostics.map(formatDiagnostic).join("\n"));
      return yield* Effect.fail(new CompilationFailed({ diagnostics: hostDiagnostics }));
    }

    const frontend = yield* loadProgram(options.entry, {
      suppressSemanticDiagnostics: options.suppressSemanticDiagnostics
    });
    const jsIr = yield* lowerToJsIr(path.resolve(options.entry), frontend.sourceFiles, frontend.program.getTypeChecker(), {
      fcpp: options.fcpp
    });

    const llvmIr = path.join(options.outDir, "main.ll");
    const traceMap = path.join(options.outDir, "trace-map.json");
    const executable = path.join(options.outDir, "main");
    // eslint-disable-next-line unicorn/no-useless-undefined -- init-declarations requires explicit initializer
    let inlineCpp: string | undefined = undefined;
    if (jsIr.module.inlineCppBlocks.length > 0) {
      inlineCpp = path.join(options.outDir, "inline-cpp.cpp");
    }

    const emission = emitLlvmModule(jsIr.module);
    yield* fs.writeFileString(llvmIr, emission.llvmIr);
    yield* fs.writeFileString(traceMap, `${JSON.stringify(emission.traceMap, undefined, 2)}\n`);
    if (inlineCpp !== undefined) {
      yield* fs.writeFileString(inlineCpp, emitInlineCppSource(jsIr.module.inlineCppBlocks));
    }

    for (const diagnostic of emission.diagnostics) {
      yield* diagnostics.add(diagnostic);
    }
    const frontendAndIrDiagnostics = yield* diagnostics.drain();
    let link: LinkResult = { diagnostics: [] };
    if (options.link !== false && !frontendAndIrDiagnostics.some((diagnostic) => diagnostic.category === "error")) {
      let linkEffect = linkWithClang(llvmIr, executable);
      if (inlineCpp !== undefined) {
        linkEffect = linkWithClangxx(llvmIr, inlineCpp, executable);
      }
      link = yield* linkEffect.pipe(Effect.catchAll((error) => Effect.succeed(linkerErrorToLinkResult(error))));
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
        inlineCpp,
        executable: link.executable
      }
    };
  });
