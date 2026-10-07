import ts from "typescript";
import { describe, expect, test } from "vitest";
import { lowerToJsIr } from "../../src/compiler/ir.js";

function lower(source: string) {
  const file = ts.createSourceFile("/entry.ts", source, ts.ScriptTarget.Latest, true);
  return lowerToJsIr(file.fileName, [file]);
}

/**
 * The generated function-object names of a result, in order.
 *
 * A name carries the id it was allocated (`__tscn_fnobj_<name>_<id>`), so this reads the counter's
 * observable effect rather than the counter's declaration — which is what makes it a test of the
 * isolation instead of a test of where the field is written. A name appears both where the function
 * object is defined and where it is referenced, so each one is reported once.
 */
function functionObjectNames(result: ReturnType<typeof lower>): readonly string[] {
  const names = [...JSON.stringify(result.module.modules).matchAll(/__tscn_fnobj_\w+_\d+/g)].map((match) => match[0]);
  return [...new Set(names)];
}

/**
 * The same, per source module — so a compilation of several files keeps each file's ids visible instead
 * of collapsing them together, which is the only way the per-file reset is observable at all.
 */
function functionObjectNamesPerModule(result: ReturnType<typeof lower>): readonly (readonly string[])[] {
  return result.module.modules.map((module) => [
    ...new Set([...JSON.stringify(module.operations).matchAll(/__tscn_fnobj_\w+_\d+/g)].map((match) => match[0]))
  ]);
}

/** Two function objects in one file, so a counter that carried over would show in the second id. */
const twoFunctionObjects = "const f = () => 1;\nconst g = () => 2;";

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

  // The assertion below is on the ids, not on two results being equal. `lowerStatements` resets the
  // counter at the start of every source file, so comparing two whole results passes whether the counter
  // lives on the per-call context or at module scope — which is what made the previous form of this test
  // unable to fail. Reading the ids shows a counter that carried over: the second compilation's first
  // function object would be numbered after the first one's, and each file's ids would not restart at 0.
  test("a later compilation restarts the function-object ids rather than continuing them", () => {
    expect(functionObjectNames(lower(twoFunctionObjects))).toEqual(["__tscn_fnobj_f_0", "__tscn_fnobj_g_1"]);
    expect(functionObjectNames(lower(twoFunctionObjects))).toEqual(["__tscn_fnobj_f_0", "__tscn_fnobj_g_1"]);
  });

  test("each source file in one compilation numbers its function objects from zero", () => {
    const first = ts.createSourceFile("/first.ts", twoFunctionObjects, ts.ScriptTarget.Latest, true);
    const second = ts.createSourceFile("/second.ts", twoFunctionObjects, ts.ScriptTarget.Latest, true);
    const result = lowerToJsIr(first.fileName, [first, second]);
    expect(functionObjectNamesPerModule(result)).toEqual([
      ["__tscn_fnobj_f_0", "__tscn_fnobj_g_1"],
      ["__tscn_fnobj_f_0", "__tscn_fnobj_g_1"]
    ]);
  });
});
