import { Chunk, Context, Effect, Layer, Ref } from "effect";
import type { CompilerDiagnostic, DiagnosticCategory, SourceSpan } from "./diagnostics.js";

export type DiagnosticsErrorInput = {
  readonly code: string;
  readonly message: string;
  readonly span?: SourceSpan;
};

export type Diagnostics = {
  readonly error: (input: DiagnosticsErrorInput) => Effect.Effect<void>;
  readonly warning: (input: DiagnosticsErrorInput) => Effect.Effect<void>;
  readonly info: (input: DiagnosticsErrorInput) => Effect.Effect<void>;
  readonly add: (diagnostic: CompilerDiagnostic) => Effect.Effect<void>;
  readonly drain: () => Effect.Effect<readonly CompilerDiagnostic[]>;
};

export const Diagnostics = Context.GenericTag<Diagnostics>("tscn/Diagnostics");

const categoryFor = (category: DiagnosticCategory) => (input: DiagnosticsErrorInput): CompilerDiagnostic => {
  const diagnostic: { code: string; category: DiagnosticCategory; message: string; span?: SourceSpan } = {
    code: input.code,
    category,
    message: input.message
  };
  if (input.span) {
    return { ...diagnostic, span: input.span };
  }
  return diagnostic;
};

const refToService = (ref: Ref.Ref<Chunk.Chunk<CompilerDiagnostic>>): Diagnostics => ({
  error: (input) => Ref.update(ref, Chunk.append(categoryFor("error")(input))),
  warning: (input) => Ref.update(ref, Chunk.append(categoryFor("warning")(input))),
  info: (input) => Ref.update(ref, Chunk.append(categoryFor("info")(input))),
  add: (diagnostic) => Ref.update(ref, Chunk.append(diagnostic)),
  drain: () => Effect.map(Ref.getAndSet(ref, Chunk.empty()), Chunk.toReadonlyArray)
});

export const DiagnosticsLive: Layer.Layer<Diagnostics> = Layer.effect(
  Diagnostics,
  Effect.map(Ref.make(Chunk.empty<CompilerDiagnostic>()), refToService)
);
