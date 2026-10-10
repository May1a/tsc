import { describe, expect, test } from "vitest";
import { type VariantHandlers, type VariantOfKind, dispatchKind } from "../../src/compiler/dispatch.js";

type Expression =
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "left" | "right"; readonly name: string };

type Variants = { readonly [Kind in Expression["kind"]]: VariantOfKind<Expression, Kind> };

interface Context {
  readonly prefix: string;
}

const handlers: VariantHandlers<Variants, Context, string> = {
  text: (expression, context) => context.prefix + expression.value.toUpperCase(),
  number: (expression, context) => context.prefix + expression.value.toFixed(1),
  left: (expression, context) => context.prefix + expression.name,
  right: (expression, context) => context.prefix + expression.name
};

const cases: readonly (readonly [Expression, string])[] = [
  [{ kind: "text", value: "value" }, "result:VALUE"],
  [{ kind: "number", value: 2 }, "result:2.0"],
  [{ kind: "left", name: "first" }, "result:first"],
  [{ kind: "right", name: "second" }, "result:second"]
];

describe("atomic kind dispatch", () => {
  test.each(cases)("matches its argument to the selected handler: %j", (expression, expected) => {
    expect(dispatchKind(handlers, expression, { prefix: "result:" })).toBe(expected);
  });
});

type Assert<Valid extends true> = Valid;
type AcceptedExpression = Parameters<typeof dispatchKind<Variants, keyof Variants, Context, string>>[1];
export type RejectMismatchedKind = Assert<{ readonly kind: "number"; readonly value: string } extends AcceptedExpression ? false : true>;
export type AcceptSharedKinds = Assert<{ readonly kind: "left" | "right"; readonly name: string } extends AcceptedExpression ? true : false>;
