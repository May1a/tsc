import { FileSystem } from "@effect/platform";
import { Effect } from "effect";
import path from "node:path";
import { formatDiagnostic } from "./diagnostics.js";
import { loadProgram } from "./frontend.js";
import { lowerToJsIr } from "./ir.js";
import { emitLlvmIr, emitTraceMap } from "./llvm.js";
import type { CompileOptions, CompileResult } from "./types.js";

export const compile = (options: CompileOptions): Effect.Effect<CompileResult, Error, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const frontend = loadProgram(options.entry);
    const jsIr = lowerToJsIr(path.resolve(options.entry), frontend.sourceFiles);

    yield* fs.makeDirectory(options.outDir, { recursive: true });

    const llvmIr = path.join(options.outDir, "main.ll");
    const traceMap = path.join(options.outDir, "trace-map.json");
    const diagnosticsPath = path.join(options.outDir, "diagnostics.txt");

    yield* fs.writeFileString(llvmIr, emitLlvmIr(jsIr));
    yield* fs.writeFileString(traceMap, emitTraceMap(jsIr));
    yield* fs.writeFileString(diagnosticsPath, frontend.diagnostics.map(formatDiagnostic).join("\n"));

    return {
      diagnostics: frontend.diagnostics,
      artifacts: {
        llvmIr,
        traceMap
      }
    };
  });
