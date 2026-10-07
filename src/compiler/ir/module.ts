import type { CompilerDiagnostic, SourceSpan } from "../diagnostics.js";
import type { JsIrFunctionObjectDefinition } from "./bindings.js";
import type { JsIrOperation } from "./types.js";

/**
 * The envelope one compilation produces: the modules it lowered, the trace map's subject, and the
 * result `lowerToJsIr` hands back. Nothing here describes a form the compiler can emit — these are
 * the types that hold a set of them.
 */
export interface JsIrInlineCppBlock {
  readonly symbol: string;
  readonly code: string;
}

export interface JsIrModule {
  readonly entry: string;
  readonly modules: readonly JsIrSourceModule[];
  readonly inlineCppBlocks: readonly JsIrInlineCppBlock[];
}

export type JsIrLoweringMode = "native";

export type JsIrTraceOrigin = "source" | "synthesized";

export interface JsIrOperationTrace {
  readonly id: string;
  readonly source?: SourceSpan;
  readonly origin: JsIrTraceOrigin;
}

export interface JsIrSourceModule {
  readonly fileName: string;
  readonly statementCount: number;
  readonly loweringMode: JsIrLoweringMode;
  readonly operations: readonly JsIrOperation[];
  readonly functionObjects: readonly JsIrFunctionObjectDefinition[];
}


export interface JsIrResult {
  readonly module: JsIrModule;
  readonly diagnostics: readonly CompilerDiagnostic[];
}

export interface JsIrLowerOptions {
  readonly fcpp?: boolean;
}
