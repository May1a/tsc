import { type CommandExecutor, FileSystem, Path } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import { Effect } from "effect";
import { type CompilerDiagnostic, formatDiagnostic } from "./diagnostics.js";
import { CompilationFailed } from "./errors.js";
import { loadProgram } from "./frontend.js";
import { lowerToJsIr } from "./ir.js";
import { type LinkResult, linkWithClang, linkWithClangxx, linkerErrorToLinkResult } from "./linker.js";
import { emitNativeModule } from "./native-lowering/module.js";
import { emitInlineCppSource } from "./inline-cpp-source.js";
import { resolveBindings } from "./binding-resolution/index.js";
import { createLlvmModule } from "./llvm-ir/index.js";
import { buildTraceMap } from "./trace.js";
import { Toolchain } from "./toolchain.js";
import type { CompileOptions, CompileResult } from "./types.js";
import { jsValueAbi } from "./js-value-abi/index.js";
import { runtimeIrText } from "./runtime-files.js";

const hasError = (diagnostics: readonly CompilerDiagnostic[]): boolean =>
  diagnostics.some((diagnostic) => diagnostic.category === "error");

const failCompilation = (
  fs: FileSystem.FileSystem,
  diagnosticsPath: string,
  diagnostics: readonly CompilerDiagnostic[]
): Effect.Effect<never, CompilationFailed | PlatformError> =>
  Effect.gen(function* failCompilationGen() {
    yield* fs.writeFileString(diagnosticsPath, diagnostics.map(formatDiagnostic).join("\n"));
    return yield* Effect.fail(new CompilationFailed({ diagnostics: [...diagnostics] }));
  });

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

    const diagnostics: CompilerDiagnostic[] = [];

    yield* fs.makeDirectory(options.outDir, { recursive: true });
    const diagnosticsPath = path.join(options.outDir, "diagnostics.txt");
    const hostDiagnostic = jsValueAbi.validateHost(toolchain.target);
    if (hostDiagnostic !== undefined) {
      diagnostics.push(hostDiagnostic);
      return yield* failCompilation(fs, diagnosticsPath, diagnostics);
    }

    const frontend = yield* loadProgram(options.entry, {
      suppressSemanticDiagnostics: options.suppressSemanticDiagnostics
    });
    diagnostics.push(...frontend.diagnostics);
    // Collect unsupported-form diagnostics alongside frontend errors.
    const jsIr = lowerToJsIr(path.resolve(options.entry), frontend.sourceFiles, frontend.program.getTypeChecker(), {
      fcpp: options.fcpp
    });
    diagnostics.push(...jsIr.diagnostics);

    if (hasError(diagnostics)) {
      return yield* failCompilation(fs, diagnosticsPath, diagnostics);
    }

    const llvmIr = path.join(options.outDir, "main.ll");
    const traceMap = path.join(options.outDir, "trace-map.json");
    const executable = path.join(options.outDir, "main");
    let inlineCpp: string | undefined;
    if (jsIr.module.inlineCppBlocks.length > 0) {
      inlineCpp = path.join(options.outDir, "inline-cpp.cpp");
    }

    const resolved = resolveBindings(jsIr.module);
    diagnostics.push(...resolved.diagnostics);
    if (hasError(diagnostics)) {
      return yield* failCompilation(fs, diagnosticsPath, diagnostics);
    }

    const builder = createLlvmModule({ staticRuntime: [{ origin: "static runtime", text: runtimeIrText() }] });
    const emission = emitNativeModule(resolved.module, builder);
    yield* fs.writeFileString(llvmIr, emission.text);
    yield* fs.writeFileString(traceMap, `${JSON.stringify(buildTraceMap(jsIr.module, emission.traceRanges), undefined, 2)}\n`);
    if (inlineCpp !== undefined) {
      yield* fs.writeFileString(inlineCpp, emitInlineCppSource(jsIr.module.inlineCppBlocks));
    }

    let link: LinkResult = { diagnostics: [] };
    if (options.link !== false) {
      let linkEffect = linkWithClang(llvmIr, executable);
      if (inlineCpp !== undefined) {
        linkEffect = linkWithClangxx(llvmIr, inlineCpp, executable);
      }
      link = yield* linkEffect.pipe(Effect.catchAll((error) => Effect.succeed(linkerErrorToLinkResult(error))));
    }
    const allDiagnostics = [...diagnostics, ...link.diagnostics];

    if (hasError(allDiagnostics)) {
      return yield* failCompilation(fs, diagnosticsPath, allDiagnostics);
    }

    yield* fs.writeFileString(diagnosticsPath, allDiagnostics.map(formatDiagnostic).join("\n"));

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
