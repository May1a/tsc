export type DiagnosticCategory = "error" | "warning" | "info";

export interface SourceSpan {
  readonly fileName: string;
  readonly line: number;
  readonly column: number;
}

export interface CompilerDiagnostic {
  readonly code: string;
  readonly category: DiagnosticCategory;
  readonly message: string;
  readonly span?: SourceSpan;
}

export const formatDiagnostic = (diagnostic: CompilerDiagnostic): string => {
  let location = "";
  if (diagnostic.span) {
    location = `${diagnostic.span.fileName}:${diagnostic.span.line}:${diagnostic.span.column}: `;
  }

  return `${location}${diagnostic.category} ${diagnostic.code}: ${diagnostic.message}`;
};
