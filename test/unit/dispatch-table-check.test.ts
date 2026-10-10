import { expect, test } from "vitest";
import { tableKeys, unionKinds } from "../../scripts/check-expression-dispatch.mjs";

test("checks the named table even when another table appears first", () => {
  expect(tableKeys([
    "const other = tierHandlers({ unrelated: emitOther });",
    "const expected = tierHandlers({ left: emitLeft, right: emitRight });"
  ].join("\n"), "expected")).toEqual(["left", "right"]);
});

test("a missing table cannot borrow another table's keys", () => {
  expect(tableKeys("const other = tierHandlers({ unrelated: emitOther });", "expected")).toEqual([]);
});

test("both kinds in a shared IR variant require handlers", () => {
  expect(unionKinds('type Expressions = { kind: "arrayPop" | "arrayShift"; name: string } | { kind: "literal"; value: number };', "Expressions"))
    .toEqual(["arrayPop", "arrayShift", "literal"]);
});


test("checks a typed native handler literal", () => {
  expect(tableKeys("const handlers: VariantHandlers<Variants, Context, Result> = { left: lowerLeft, right: lowerRight };", "handlers"))
    .toEqual(["left", "right"]);
});
