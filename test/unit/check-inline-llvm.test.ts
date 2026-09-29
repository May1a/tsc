import { sep } from "node:path";
import { describe, expect, it } from "vitest";
import { isExemptPath, scanSource } from "../../scripts/check-inline-llvm.mjs";

// The snippets below are TypeScript *source text* fed to scanSource, so escape
// sequences like \n are intentional content, not newlines.
const templateBlob = `const defined = \`define ptr @helper(ptr %v) {
entry:
  ret ptr %v
}\`;`;
const declaredLiteral = String.raw`const declared = "declare ptr @external(i64 %n)\n";`;
const constantGlobal = String.raw`const global = "@g.0 = private unnamed_addr constant [4 x i8] c\"test\00\"";`;
const moduleHeader = String.raw`const header = "target datalayout = \"e\"\ntarget triple = \"x86_64\"";`;

// Composed so the snippet contains a literal ${...} placeholder without any
// string literal in this test file containing one.
const dollarSign = "$";
const placeholder = `${dollarSign}{returnType}`;
const dynamicDefine = `const dynamic = \`define ${placeholder} @\${name}(\${params}) {\`;`;

describe("check-inline-llvm", () => {
  it("flags static IR in plain strings, template literals, globals, and module headers", () => {
    const source = [templateBlob, declaredLiteral, constantGlobal, moduleHeader].join("\n");
    const findings = scanSource(source);
    expect(findings.map((finding) => finding.description)).toEqual([
      "a define/declare with a literal symbol",
      "a define/declare with a literal symbol",
      "a module-scope constant global",
      "a module header",
      "a module header"
    ]);
    expect(findings.map((finding) => finding.line)).toEqual([1, 5, 6, 7, 7]);
  });

  it("ignores interpolated emission, prose, and TypeScript declare keywords", () => {
    const source = [
      dynamicDefine,
      "const prose = \"please declare your variables and define the terms\";",
      "declare const brand: unique symbol;",
      'const tsPrelude = "declare function print(value: unknown): void;";'
    ].join("\n");
    expect(scanSource(source)).toEqual([]);
  });

  it("honors an inline-llvm-ir-allowed marker on the preceding line", () => {
    const probe = String.raw`const probe = "define i32 @main() {\nentry:\n  ret i32 0\n}";`;
    const suppressed = ["// inline-llvm-ir-allowed: toolchain self-probe.", probe].join("\n");
    expect(scanSource(suppressed)).toEqual([]);

    expect(scanSource(probe).length).toBe(1);
  });

  it("exempts only the IR emitter modules", () => {
    expect(isExemptPath(`compiler${sep}llvm.ts`)).toBe(true);
    expect(isExemptPath(`compiler${sep}llvm-ir${sep}builder.ts`)).toBe(true);
    expect(isExemptPath(`compiler${sep}js-value-abi${sep}llvm.ts`)).toBe(true);
    expect(isExemptPath(`compiler${sep}runtime-ir.ts`)).toBe(false);
    expect(isExemptPath(`compiler${sep}toolchain.ts`)).toBe(false);
  });
});
