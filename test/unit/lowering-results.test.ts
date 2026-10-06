import ts from "typescript";
import { describe, expect, test } from "vitest";
import { lowerToJsIr } from "../../src/compiler/ir.js";

function lower(source: string) {
  const file = ts.createSourceFile("/entry.ts", source, ts.ScriptTarget.Latest, true);
  return lowerToJsIr(file.fileName, [file]);
}

const nestedRefusals = [
  ["function body", "function f() { return new.target; }"],
  ["branch", "function f() { if (true) { return new.target; } }"],
  ["loop", "function f() { while (false) { return new.target; } }"],
  ["catch", "function f() { try { throw 1; } catch { return new.target; } }"],
  ["finally", "function f() { try { return 1; } finally { return new.target; } }"],
  ["object method", "const o = { m() { return new.target; } };"],
  ["arrow body", "function f() { const g = () => { return new.target; }; return g(); }"],
] as const;

describe("lowering results", () => {
  test.each(nestedRefusals)("preserves a refusal inside a %s", (_name, source) => {
    const result = lower(`${source}\nconst after = 42;`);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      "new.target is not supported yet [support: new-target]",
    ]);
    expect(result.module.modules[0]?.operations).toContainEqual(
      expect.objectContaining({ kind: "constNumber", name: "after" })
    );
  });

  test("a refused expression does not leave a reason for the next statement", () => {
    const result = lower("const o = { get value() { return 1; } }; function f() { return new.target; }");
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      "get or set accessor in an object literal is not supported yet [support: object-literal-accessor]",
      "new.target is not supported yet [support: new-target]",
    ]);
  });

  test("a later compilation has its own function-object ids", () => {
    const source = "const f = () => 1;";
    expect(lower(source)).toEqual(lower(source));
  });
});
