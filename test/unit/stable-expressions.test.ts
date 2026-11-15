import ts from "typescript";
import { describe, expect, test } from "vitest";
import { lowerToJsIr } from "../../src/compiler/ir.js";
import { isStableExpression } from "../../src/compiler/ir/stable-expressions.js";

function lower(source: string) {
  const file = ts.createSourceFile("/entry.ts", source, ts.ScriptTarget.Latest, true);
  return lowerToJsIr(file.fileName, [file]);
}

/** The expression the `return` of the module's single function lowered to. */
function returned(source: string): unknown {
  const declaration = lower(source).module.modules.at(0)?.operations.at(0);
  if (declaration?.kind !== "function") {
    throw new Error("Expected one function declaration");
  }
  const last = declaration.body.at(-1);
  if (last?.kind !== "returnNumber") {
    throw new Error("Expected a numeric return");
  }
  return last.expression;
}

describe("stable const initializers", () => {
  test("constants, parameters and pure operators over them are stable", () => {
    expect(isStableExpression({ kind: "literal", value: 1 })).toBe(true);
    expect(isStableExpression({ kind: "binary", operator: "add", left: { kind: "parameter", name: "p" }, right: { kind: "nan" } })).toBe(true);
    expect(isStableExpression({ kind: "string", value: { kind: "concat", left: { kind: "literal", value: "a" }, right: { kind: "literal", value: "b" } } })).toBe(true);
  });

  test("a read of a mutable binding, a call or an update is not stable", () => {
    expect(isStableExpression({ kind: "variable", name: "n" })).toBe(false);
    expect(isStableExpression({ kind: "binary", operator: "add", left: { kind: "variable", name: "n" }, right: { kind: "literal", value: 1 } })).toBe(false);
    expect(isStableExpression({ kind: "call", name: "f", arguments: [] })).toBe(false);
    expect(isStableExpression({ kind: "update", name: "i", operator: "increment", prefix: true })).toBe(false);
  });

  test("a const over a literal is folded into its reads", () => {
    expect(returned("function f() { const k = 2 * 3; return k + 1; }")).toEqual({
      kind: "binary",
      operator: "add",
      left: { kind: "binary", operator: "multiply", left: { kind: "literal", value: 2 }, right: { kind: "literal", value: 3 } },
      right: { kind: "literal", value: 1 }
    });
  });

  test("a const over a mutable binding is read from its own slot", () => {
    expect(returned("function f() { let n = 1; const m = n * 10; n = 2; return m; }")).toEqual({ kind: "parameter", name: "m" });
  });
});
