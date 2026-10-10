import type { SourceSpan } from "../diagnostics.js";
import type { JsIrModule } from "../ir/module.js";
import { visitJsIrOperations } from "../ir/visit.js";

export function resolvedTraceSpans(module: JsIrModule): ReadonlyMap<string, SourceSpan> {
  const spans = new Map<string, SourceSpan>();
  for (const sourceModule of module.modules) {
    visitJsIrOperations(sourceModule.operations, (operation) => {
      const source = operation.trace?.source;
      if (source !== undefined) {
        spans.set(operation.trace?.id ?? "", source);
      }
    });
  }
  return spans;
}
