import ts from "typescript";
import { describe, expect, test } from "vitest";
import { lowerToJsIr } from "../../src/compiler/ir.js";

/** Lowers `source` with a checker, which is what tells an undeclared name from an unlowered one. */
function lower(source: string): ReturnType<typeof lowerToJsIr> {
  const options: ts.CompilerOptions = { noLib: true, noEmit: true };
  const host = ts.createCompilerHost(options);
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (name, version) => name === "/entry.ts"
    ? ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true)
    : original(name, version);
  const program = ts.createProgram(["/entry.ts"], options, host);
  const file = program.getSourceFile("/entry.ts");
  if (file === undefined) {
    throw new Error("entry missing");
  }
  return lowerToJsIr(file.fileName, [file], program.getTypeChecker());
}

describe("unresolvable references", () => {
  test("a statement reading a name nothing declares throws a ReferenceError", () => {
    const result = lower("function f() { undeclared; }");
    expect(result.diagnostics).toEqual([]);
    expect(JSON.stringify(result.module.modules)).toContain(
      '{"kind":"discardValue","value":{"kind":"unresolvableReference","message":"undeclared is not defined"}'
    );
  });

  test("a declared name that lowering cannot read is still refused", () => {
    const result = lower("function f() { later; } let later = 1;");
    expect(JSON.stringify(result.module.modules)).not.toContain("unresolvableReference");
  });
});
