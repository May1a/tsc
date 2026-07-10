import type { SourceSpan } from "./diagnostics.js";
import {
  type JsIrLoweringMode,
  type JsIrModule,
  type JsIrOperation,
  type JsIrTraceOrigin,
  visitJsIrOperations
} from "./ir.js";

export type LlvmLineRange = {
  readonly startLine: number;
  readonly endLine: number;
};

export type TraceMapOperation = {
  readonly id: string;
  readonly moduleId: string;
  readonly kind: JsIrOperation["kind"];
  readonly source: SourceSpan | null;
  readonly origin: JsIrTraceOrigin;
  readonly llvmRanges: readonly LlvmLineRange[];
};

export type TraceMapModule = {
  readonly id: string;
  readonly fileName: string;
  readonly statementCount: number;
  readonly loweringMode: JsIrLoweringMode;
  readonly operationIds: readonly string[];
};

export type TraceMapV1 = {
  readonly version: 1;
  readonly entry: string;
  readonly modules: readonly TraceMapModule[];
  readonly operations: readonly TraceMapOperation[];
};

export function traceOperationId(operation: JsIrOperation): string {
  if (operation.trace === undefined || operation.trace.id.length === 0) {
    throw new Error(`Internal compiler error: missing finalized trace metadata for ${operation.kind}`);
  }
  return operation.trace.id;
}

export function buildTraceMap(
  module: JsIrModule,
  llvmRanges: ReadonlyMap<string, readonly LlvmLineRange[]>
): TraceMapV1 {
  const modules: TraceMapModule[] = [];
  const operations: TraceMapOperation[] = [];
  const seenIds = new Set<string>();

  for (let moduleIndex = 0; moduleIndex < module.modules.length; moduleIndex += 1) {
    const sourceModule = module.modules[moduleIndex];
    const moduleId = `m${moduleIndex}`;
    const operationIds: string[] = [];
    visitJsIrOperations(sourceModule.operations, (operation) => {
      const id = traceOperationId(operation);
      if (seenIds.has(id)) {
        throw new Error(`Internal compiler error: duplicate trace ID ${id}`);
      }
      seenIds.add(id);
      operationIds.push(id);
      operations.push({
        id,
        moduleId,
        kind: operation.kind,
        // V1 deliberately uses JSON null when an operation has no source location.
        // eslint-disable-next-line unicorn/no-null
        source: operation.trace?.source ?? null,
        origin: operation.trace?.origin ?? "synthesized",
        llvmRanges: llvmRanges.get(id) ?? []
      });
    });
    modules.push({
      id: moduleId,
      fileName: sourceModule.fileName,
      statementCount: sourceModule.statementCount,
      loweringMode: sourceModule.loweringMode,
      operationIds
    });
  }

  for (const id of llvmRanges.keys()) {
    if (!seenIds.has(id)) {
      throw new Error(`Internal compiler error: LLVM ranges reference unknown trace ID ${id}`);
    }
  }

  return { version: 1, entry: module.entry, modules, operations };
}
