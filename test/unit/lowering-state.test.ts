import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, test } from "vitest";
import { lowerToJsIr } from "../../src/compiler/ir.js";
import type { JsIrResult } from "../../src/compiler/ir/module.js";
import { jsIrOperationChildren, visitJsIrOperations } from "../../src/compiler/ir/visit.js";

/**
 * One compilation's state has to belong to that compilation.
 *
 * Every assertion here is written so it would fail if a registry, an id counter or an inline C++ block
 * list outlived the `lowerToJsIr` call that created it: the same program compiled twice must produce
 * the same module, a program compiled between two compilations of it must not disturb either, and a
 * compilation must not see the classes or the C++ of another.
 */

function sourceFile(text: string, fileName = "/entry.ts"): ts.SourceFile {
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
}

function lower(text: string, fcpp = false): JsIrResult {
  const file = sourceFile(text);
  return lowerToJsIr(file.fileName, [file], undefined, { fcpp });
}

/** The ids and kinds `buildTraceMap` would walk, in the order it walks them. */
function walkedOperations(result: JsIrResult): readonly (readonly [string, string])[] {
  const [module] = result.module.modules;
  const walked: (readonly [string, string])[] = [];
  visitJsIrOperations([...module.operations, ...module.functionObjects.flatMap((definition) => definition.body ?? [])], (operation) => {
    walked.push([operation.trace?.id ?? "", operation.kind]);
  });
  return walked;
}

const twoClasses = "class First { m(): number { return 1; } }\nclass Second extends First {}";
const inlineCpp = 'declare function print(value: unknown): void;\nprint(__tscn_inline_cpp`return tscn::number(42);`);';

const fixturesDirectory = path.resolve(import.meta.dirname, "../fixtures");

/**
 * Every operation kind a fixture can lower to that holds other operations.
 *
 * It is the container set of `jsIrOperationChildren` minus `returnClosure`, which no lowering
 * produces, plus nothing else: every other kind is a leaf. Asserting the exact list means a new
 * container kind has to be added here deliberately — which is the point, because trace finalization
 * rebuilds each container's children and a new one would otherwise be reached untested.
 */
const containerKindsLowerableFromSource = [
  "arrayDestructureProtocol", "bindingGroup", "block", "doWhile", "for", "forInArray", "forInObject",
  "forOfArray", "forOfMap", "forOfProtocol", "forOfSet", "forOfString", "function", "if",
  "runtimeArrayMapFunctionObject", "switch", "tryCatch", "while"
] as const;

describe("class state belongs to one compilation", () => {
  test("compiling a class program twice produces the same module", () => {
    expect(JSON.stringify(lower(twoClasses))).toBe(JSON.stringify(lower(twoClasses)));
  });

  test("a class from another compilation does not survive into the next", () => {
    expect(lower("class Base { m(): number { return 1; } }").diagnostics).toEqual([]);
    const derived = lower("class Derived extends Base {}");
    expect(derived.diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      "`extends Base` does not name a class declared in this module"
    ]);
    // The refused compilation registers `Derived` of its own; compiling the base program again must
    // not see that leftover, or the id counter would still have moved.
    expect(JSON.stringify(lower(twoClasses))).toBe(JSON.stringify(lower(twoClasses)));
  });

  test("one compilation's classes are not visible to the next module of another compilation", () => {
    const base = sourceFile("class Base { m(): number { return 1; } }", "/base.ts");
    const derived = sourceFile("class Derived extends Base {}", "/derived.ts");
    const acrossModules = lowerToJsIr("/base.ts", [base, derived]);
    expect(acrossModules.diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      "`extends Base` does not name a class declared in this module"
    ]);
    const inOneModule = lowerToJsIr("/derived.ts", [sourceFile("class Base { m(): number { return 1; } }\nclass Derived extends Base {}")]);
    expect(inOneModule.diagnostics).toEqual([]);
  });
});

describe("inline C++ state belongs to one compilation", () => {
  test("each compilation collects only its own blocks, numbered from zero", () => {
    const first = lower(inlineCpp, true);
    const second = lower(inlineCpp, true);
    expect(first.module.inlineCppBlocks.map((block) => block.symbol)).toEqual(["__tscn_cpp_0"]);
    expect(second.module.inlineCppBlocks.map((block) => block.symbol)).toEqual(["__tscn_cpp_0"]);
    expect(first.module.inlineCppBlocks[0]?.code).toBe("return tscn::number(42);");
    expect(second.module.inlineCppBlocks[0]?.code).toBe("return tscn::number(42);");
  });

  test("a compilation without -fcpp reports the block rather than lowering it", () => {
    const enabled = lower(inlineCpp, true);
    expect(enabled.diagnostics).toEqual([]);
    const disabled = lower(inlineCpp);
    expect(disabled.diagnostics.map((diagnostic) => diagnostic.message)).toEqual(["Inline C++ requires -fcpp"]);
    expect(disabled.module.inlineCppBlocks).toEqual([]);
  });

  test("interleaving compilations leaves each one's blocks and classes alone", () => {
    const first = lower(`${twoClasses}\n${inlineCpp}`, true);
    lower("const unrelated = 1;");
    const second = lower(`${twoClasses}\n${inlineCpp}`, true);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(first.module.inlineCppBlocks).toHaveLength(1);
  });
});

describe("trace finalization", () => {
  test("numbers a module's operations in walk order", () => {
    const walked = walkedOperations(lower(twoClasses));
    expect(walked.length).toBeGreaterThan(2);
    const ids = walked.map(([id]) => id);
    for (const [index, id] of ids.entries()) {
      expect(id).toBe(`m0:o${index.toString().padStart(6, "0")}`);
    }
    // `traceOperationId` throws on an operation with no id, so an operation the rebuild dropped its
    // trace from is a hard failure at emission time rather than a warning.
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("a rebuild that left a nested body behind would drop its children", () => {
    const kinds = walkedOperations(lower("const value = 1;\nif (value > 0) { print(value); } else { print(-value); }"))
      .map(([, kind]) => kind);
    expect(kinds).toEqual(["constNumber", "if", "print", "print"]);
  });

  test("finalizes function-object bodies in the module's trace catalog", () => {
    const result = lower("const holder = { method(): number { return 7; } }; print(holder.method());");
    expect(result.diagnostics).toEqual([]);
    const walked = walkedOperations(result);
    expect(walked.map(([, kind]) => kind)).toContain("returnNumber");
    expect(walked.map(([id]) => id)).toEqual(walked.map((_, index) => `m0:o${index.toString().padStart(6, "0")}`));
  });

  /**
   * Every container kind, over the whole fixture corpus.
   *
   * Trace finalization walks the same containers `visit.ts` classifies and rebuilds each one's
   * children, so a case that returned its operation untouched would leave those children without an
   * id — which is what the assertion below reports, per operation. Reading the fixtures rather than a
   * handful of inline sources is what covers the shapes inline sources do not reach: the nested
   * destructuring protocol, `switch` clauses, each `for…of` collection kind, and `finally`.
   */
  test("numbers every operation of every fixture, and reaches every container kind", () => {
    const containers = new Set<string>();
    let lowered = 0;
    for (const entry of readdirSync(fixturesDirectory, { encoding: "utf8" })) {
      if (!entry.endsWith(".ts")) {
        continue;
      }
      const fileName: string = path.join(fixturesDirectory, entry);
      const text: string = readFileSync(fileName, "utf8");
      const file: ts.SourceFile = sourceFile(text, fileName);
      const result = lowerToJsIr(fileName, [file]);
      if (result.diagnostics.length > 0) {
        continue;
      }
      lowered += 1;
      for (const [index, [id]] of walkedOperations(result).entries()) {
        expect(id).toBe(`m0:o${index.toString().padStart(6, "0")}`);
      }
      visitJsIrOperations(result.module.modules[0]?.operations ?? [], (operation) => {
        if (jsIrOperationChildren(operation).length > 0) {
          containers.add(operation.kind);
        }
      });
    }
    expect(lowered).toBeGreaterThan(100);
    // `returnClosure` is the one container kind no source lowers to, so it is the only one absent.
    expect([...containers].toSorted()).toEqual(containerKindsLowerableFromSource);
  });
});
