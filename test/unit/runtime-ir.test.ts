import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runtimeIrText } from "../../src/compiler/runtime-files.js";
import { SYMBOL_ITERATOR_SENTINEL } from "../../src/compiler/symbols.js";
import { arrayBuiltinSupport } from "../../src/compiler/ir/builtins/array.js";

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
  const bytes: number[] = [...Buffer.from(SYMBOL_ITERATOR_SENTINEL, "utf8"), 0];
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
    const files: string[] = readdirSync(runtimeDir).filter((file) => file.endsWith(".ll"));
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

describe("Array.prototype method table", () => {
  const text = readFileSync(join(runtimeDir, "prototypes.ll"), "utf8");
  const names = new Map([...text.matchAll(/^@\.array\.method\.name\.(\w+) = private unnamed_addr constant \[(\d+) x i8\] c"(\w+)\\00"$/gm)]
    .map(([, symbol, size, bytes]) => [`.array.method.name.${symbol}`, { symbol, size: Number(size), bytes }]));
  const rows = [...text.matchAll(/\{ i64 (\d+), ptr @([\w.]+), ptr @(\w+) \}/g)]
    .map(([, length, name, method]) => ({ length: Number(length), name, method }));

  it("sizes the table, the lookup bound and every key by its contents", () => {
    expect(text).toContain(`[${rows.length} x { i64, ptr, ptr }]`);
    expect(text).toContain(`%done = icmp eq i64 %index, ${rows.length}`);
    for (const { symbol, size, bytes } of names.values()) {
      expect(bytes).toBe(symbol);
      expect(size).toBe(bytes.length + 1);
    }
    for (const row of rows) {
      const expected = row.name === ".symbol.iterator.key" ? Buffer.byteLength(SYMBOL_ITERATOR_SENTINEL, "utf8") : names.get(row.name)?.bytes.length;
      expect(row.length, row.name).toBe(expected);
    }
  });

  it("reaches every prototype method that a statically lowered call supports", () => {
    const listed = new Set(rows.map((row) => names.get(row.name)?.bytes));
    const supported = Object.entries(arrayBuiltinSupport)
      .filter(([, entry]) => entry.state === "supported" && entry.placement !== "static")
      .map(([name]) => name);
    for (const name of supported) {
      expect(listed.has(name), name).toBe(true);
    }
  });
});
