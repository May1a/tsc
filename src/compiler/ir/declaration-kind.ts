import ts from "typescript";

/** The declaration form a binding comes from. */
export type DeclarationKind = "const" | "let" | "var";

/**
 * Which scope a `let`-path declaration binds in. A `var` marks its operation `functionScoped`, so
 * resolution keeps one binding per function frame instead of a fresh one per loop iteration.
 */
export interface DeclarationScope {
  readonly functionScoped?: true;
}

const blockScope: DeclarationScope = {};
const functionScope: DeclarationScope = { functionScoped: true };

export function declarationScope(kind: DeclarationKind): DeclarationScope {
  return kind === "var" ? functionScope : blockScope;
}

export function declarationKindOf(list: ts.VariableDeclarationList): DeclarationKind {
  if ((list.flags & ts.NodeFlags.Const) !== 0) {
    return "const";
  }
  return (list.flags & ts.NodeFlags.Let) === 0 ? "var" : "let";
}
