import type { VariantOfKind } from "../dispatch.js";
import type { Resolver } from "./resolver.js";

export type { VariantOfKind } from "../dispatch.js";

export type TierHandlers<T extends { readonly kind: string }, Out extends { readonly kind: string }> = {
  readonly [Kind in T["kind"]]: (
    expression: VariantOfKind<T, Kind>,
    resolver: Resolver
  ) => VariantOfKind<Out, Kind>;
};

export function tierHandlers<T extends { readonly kind: string }, Out extends { readonly kind: string }>(
  handlers: TierHandlers<T, Out>
): TierHandlers<T, Out> {
  return handlers;
}
