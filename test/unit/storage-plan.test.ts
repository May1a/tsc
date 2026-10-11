import ts from "typescript";
import { describe, expect, test } from "vitest";
import { type StorageWriteKind, classifyStorageWrite, collectStoragePlan } from "../../src/compiler/ir/storage-plan.js";

function sourceFile(source: string): ts.SourceFile {
  return ts.createSourceFile("/entry.ts", source, ts.ScriptTarget.Latest, true);
}

function classifyOf(expression: string): StorageWriteKind {
  const statement = sourceFile(`x = ${expression};`).statements.at(0);
  if (statement === undefined || !ts.isExpressionStatement(statement) || !ts.isBinaryExpression(statement.expression)) {
    throw new Error("Expected an assignment statement");
  }
  return classifyStorageWrite(statement.expression.right);
}

/** Whether each `let`/`var` declarator named `name` is boxed, in source order. */
function boxed(source: string, name: string): readonly boolean[] {
  const file = sourceFile(source);
  const plan = collectStoragePlan(file);
  const found: boolean[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      found.push(plan.boxed.has(node));
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

describe("storage write classification", () => {
  test.each([
    ["1", "number"],
    ["-2.5", "number"],
    ['"s"', "string"],
    [`\`t\${1}\``, "string"],
    ["typeof y", "string"],
    ["true", "boolean"],
    ["null", "nullish"],
    ["undefined", "nullish"],
    ["void 0", "nullish"],
    ["({ a: 1 })", "nonScalar"],
    ["[1]", "nonScalar"],
    ["new C()", "nonScalar"],
    ["() => 1", "nonScalar"],
    ["/a/", "nonScalar"],
    ["f()", "unknown"],
    ["y", "unknown"]
  ] as const)("classifies %s as %s", (expression, kind) => {
    expect(classifyOf(expression)).toBe(kind);
  });
});

describe("storage plan", () => {
  test("a binding written only by its initializer keeps its representation, whatever the initializer", () => {
    expect(boxed("let a = 1; let o = { x: 1 }; let n = null;", "a")).toEqual([false]);
    expect(boxed("let a = 1; let o = { x: 1 }; let n = null;", "o")).toEqual([false]);
    expect(boxed("let a = 1; let o = { x: 1 }; let n = null;", "n")).toEqual([false]);
  });

  test("a declaration without an initializer is boxed", () => {
    expect(boxed("let a; a = 1;", "a")).toEqual([true]);
  });

  test("writes of one scalar kind keep the binding unboxed", () => {
    expect(boxed("let a = 1; a = 2; a += 3; a++;", "a")).toEqual([false]);
    expect(boxed('let s = "a"; s = "b"; s += "c";', "s")).toEqual([false]);
  });

  test("a nullish or non-scalar write, or two scalar kinds, box the binding", () => {
    expect(boxed("let a = 1; a = null;", "a")).toEqual([true]);
    expect(boxed("let a = 1; a = { x: 1 };", "a")).toEqual([true]);
    expect(boxed('let a = 1; a = "s";', "a")).toEqual([true]);
  });

  test("an undecided write changes nothing", () => {
    expect(boxed("let a = 1; a = f();", "a")).toEqual([false]);
  });

  test("a write from a nested function counts", () => {
    expect(boxed("let a = 1; function g() { a = null; }", "a")).toEqual([true]);
    expect(boxed("let a = 1; const g = () => { a = null; };", "a")).toEqual([true]);
  });

  test("a shadowing declaration takes the writes in its scope", () => {
    expect(boxed('let x = 1; { let x = 2; x = "s"; } x = 3;', "x")).toEqual([false, true]);
    expect(boxed("let x = 1; function g(x: any) { x = null; }", "x")).toEqual([false]);
    expect(boxed("let x = 1; try {} catch (x) { x = null; }", "x")).toEqual([false, false]);
    expect(boxed("let x = 1; for (const x of [1]) { print(x); } x = 2;", "x")).toEqual([false, false]);
  });

  test("a var is one binding per function, across blocks and redeclarations", () => {
    expect(boxed("var v = 1; { v = null; }", "v")).toEqual([true]);
    expect(boxed('function g() { { var v = 1; } v = "s"; }', "v")).toEqual([true]);
    expect(boxed('var v = 1; var v = "s";', "v")).toEqual([true, false]);
  });
});
