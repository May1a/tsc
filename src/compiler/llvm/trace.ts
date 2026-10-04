import type { JsIrOperation } from "../ir/types.js";
import { traceOperationId } from "../trace.js";
import type { EmitContext } from "./context.js";

/**
 * The `; tscn-trace-*` comment markers that bracket each operation, and the registry that maps them
 * back to operation ids so a trace map can be built from the emitted text.
 *
 * `trace.ts` at the parent level builds the map; this writes the markers. The split is the useful
 * one: the markers have to be emitted between the lines they bracket, so they cannot be produced by
 * whatever builds the map, and the two disagree in detail enough that keeping them together would
 * mean reading one to understand the other.
 *
 * A `start` marker carries the source location and a `synthesized` origin when an operation was
 * invented by lowering rather than written; both end up in the trace map, and a missing marker is a
 * silently shorter trace rather than an error, so the `context.traceMarkers` write is the only
 * record of what was emitted.
 */

export function traceStartLine(operation: JsIrOperation, context: EmitContext): string {
  const { trace } = operation;
  const id = traceOperationId(operation);
  const source = trace?.source;
  let location = "-";
  if (source !== undefined) {
    location = `${source.fileName}:${source.line}:${source.column}`;
  }
  const line = `; tscn-trace-start ${id} ${operation.kind} ${location} ${trace?.origin ?? "synthesized"}`;
  context.traceMarkers.set(line, { id, kind: "start" });
  return line;
}

export function traceEndLine(operation: JsIrOperation, context: EmitContext): string {
  const id = traceOperationId(operation);
  const line = `; tscn-trace-end ${id}`;
  context.traceMarkers.set(line, { id, kind: "end" });
  return line;
}

export function wrapFunctionTrace(operation: JsIrOperation, lines: readonly string[], context: EmitContext): string[] {
  let content = lines;
  if (lines.at(-1) === "") {
    content = lines.slice(0, -1);
  }
  return [traceStartLine(operation, context), ...content, traceEndLine(operation, context), ""];
}
