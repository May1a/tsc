import ts from "typescript";
import { describe, expect, test } from "vitest";
import { bindingDeclarations, constWriteRefusal, uninitializedParameterRefusal, uninitializedReadRefusal } from "../../src/compiler/ir/throwing-forms.js";

function program(source: string): { readonly file: ts.SourceFile; readonly checker: ts.TypeChecker } {
  const host = ts.createCompilerHost({ allowJs: true, noLib: true });
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (name, version) => name === "/entry.js"
    ? ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true)
    : original(name, version);
  const built = ts.createProgram(["/entry.js"], { allowJs: true, noLib: true, noEmit: true }, host);
  const file = built.getSourceFile("/entry.js");
  if (file === undefined) {
    throw new Error("entry missing");
  }
  return { file, checker: built.getTypeChecker() };
}

function find<T extends ts.Node>(root: ts.Node, guard: (node: ts.Node) => node is T): readonly T[] {
  const found: T[] = [];
  const visit = (node: ts.Node): void => {
    if (guard(node)) {
      found.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

describe("const writes", () => {
  test("assignments and updates of a const binding are refused, others are not", () => {
    const { file, checker } = program("const c = 1; let l = 1; c = 2; c += 1; c++; --c; l = 2; l++;");
    const writes = find(file, ts.isExpressionStatement).map((statement) => constWriteRefusal(checker, statement.expression) !== undefined);
    expect(writes).toEqual([true, true, true, true, false, false]);
  });

  test("a const loop item and a destructured const are constants", () => {
    const { file, checker } = program("for (const x of [1]) { x++; } const { y } = { y: 1 }; y = 2;");
    const writes = find(file, ts.isExpressionStatement).map((statement) => constWriteRefusal(checker, statement.expression));
    expect(writes.every((refusal) => refusal !== undefined)).toBe(true);
  });
});

describe("reads before initialization", () => {
  test("a default reading its own or a later parameter is refused", () => {
    const { file, checker } = program("function f(a = b, b = a, c = () => c) {}");
    const [{ parameters }] = find(file, ts.isFunctionDeclaration);
    expect(uninitializedParameterRefusal(checker, parameters, 0)).toContain("`b`");
    expect(uninitializedParameterRefusal(checker, parameters, 1)).toBeUndefined();
    // A closure reads the parameter later, once it is initialized.
    expect(uninitializedParameterRefusal(checker, parameters, 2)).toBeUndefined();
  });

  test("a loop source reading the loop's own pattern names is refused", () => {
    const { file, checker } = program("let x = 1; for (let [x, { y }] of [[y]]) {}");
    const [loop] = find(file, ts.isForOfStatement);
    const list = loop.initializer;
    if (!ts.isVariableDeclarationList(list)) {
      throw new Error("declaration list missing");
    }
    const declarations = new Set(bindingDeclarations(list.declarations[0].name));
    expect(uninitializedReadRefusal(checker, loop.expression, declarations)).toContain("`y`");
  });
});
