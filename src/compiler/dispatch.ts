export type VariantHandlers<Variants, Context, Result> = {
  readonly [Kind in keyof Variants]: (variant: Variants[Kind], context: Context) => Result;
};

export function dispatchKind<Variants, Kind extends keyof Variants, Context, Result>(
  handlers: VariantHandlers<Variants, Context, Result>,
  variant: Variants[Kind] & { readonly kind: Kind },
  context: Context
): Result {
  return handlers[variant.kind](variant, context);
}
// Includes variants whose kind property contains more than one literal.
export type VariantOfKind<T extends { readonly kind: string }, Kind extends T["kind"]> = T extends unknown
  ? Kind extends T["kind"] ? T : never
  : never;
