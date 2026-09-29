import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SYMBOL_ITERATOR_SENTINEL, runtimeIrText } from "../../src/compiler/runtime-ir.js";

const runtimeDir = join(import.meta.dirname, "../../src/compiler/runtime");

const minimumExpectedRuntimeFiles = 12;
const firstPrintableAscii = 32;
const lastPrintableAscii = 126;
const doubleQuote = 34;
const backslash = 92;
const hexRadix = 16;

const topLevelDefinePattern = /^define [^(]*@([A-Za-z0-9_.]+)/gm;
const topLevelGlobalPattern = /^@([A-Za-z0-9_.]+) =/gm;

const topLevelSymbolNames = (text: string): string[] => [
  ...[...text.matchAll(topLevelDefinePattern)].map((match) => match[1]),
  ...[...text.matchAll(topLevelGlobalPattern)].map((match) => match[1])
];

// Mirrors the sentinel-key encoding the compiler bakes into iterators.ll.
const encodedSentinelKey = (): string => {
  const bytes = [...Buffer.from(SYMBOL_ITERATOR_SENTINEL, "utf8"), 0];
  return bytes
    .map((byte) => {
      if (byte >= firstPrintableAscii && byte <= lastPrintableAscii && byte !== doubleQuote && byte !== backslash) {
        return String.fromCharCode(byte);
      }
      return `\\${byte.toString(hexRadix).toUpperCase().padStart(2, "0")}`;
    })
    .join("");
};

describe("runtime IR", () => {
  it("includes the content of every .ll file in the runtime directory", () => {
    const files = readdirSync(runtimeDir).filter((file) => file.endsWith(".ll"));
    expect(files.length).toBeGreaterThanOrEqual(minimumExpectedRuntimeFiles);
    const text = runtimeIrText();
    for (const file of files) {
      expect(text, `runtime IR must embed ${file}`).toContain(readFileSync(join(runtimeDir, file), "utf8"));
    }
  });

  it("declares every runtime symbol at most once", () => {
    const names = topLevelSymbolNames(runtimeIrText());
    expect(new Set(names).size).toBe(names.length);
  });

  it("bakes the Symbol.iterator sentinel key from the compiler-owned constant", () => {
    const pattern = /^@\.symbol\.iterator\.key = private unnamed_addr constant \[\d+ x i8\] c"(.*)"$/m;
    const match = pattern.exec(runtimeIrText());
    expect(match).not.toBeNull();
    if (match === null) {
      return;
    }
    expect(match[1]).toBe(encodedSentinelKey());
  });

  it("emits symbols from every runtime domain", () => {
    const text = runtimeIrText();
    const symbols = [
      "@malloc",
      "@.fmt.number",
      "@gcInit",
      "@valuePrint",
      "@mathAbs",
      "@strConcat",
      "@regexValid",
      "@arrayNew",
      "@objectNew",
      "@collectionNew",
      "@functionObjectNew",
      "@jsonParse",
      "@errorNew",
      "@iteratorClose"
    ];
    for (const symbol of symbols) {
      expect(text, `runtime IR must define or declare ${symbol}`).toContain(symbol);
    }
  });
});
