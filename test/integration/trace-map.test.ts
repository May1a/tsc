import { describe, expect, test } from "vitest";
import type { TraceMapOperation, TraceMapV1 } from "../../src/compiler/trace.js";
import { expectLlvmAsVerificationIfAvailable, expectSuccessfulCompile, roadmapIntegrationTimeoutMs } from "./helpers.js";
import { expectNativeMatchesNodeIfAvailable } from "./oracle.js";

const functionDeclarationLine = 4;
const functionBodyPrintLine = 5;
const destructuringChildEndOffset = 3;

async function readTraceMap(result: Awaited<ReturnType<typeof expectSuccessfulCompile>>): Promise<TraceMapV1> {
  return JSON.parse(await result.readArtifact("trace-map.json")) as TraceMapV1;
}

type MarkerInterval = { readonly start: number; readonly end: number };

function collectMarkerIntervals(lines: readonly string[]): ReadonlyMap<string, readonly MarkerInterval[]> {
  const markerIntervals = new Map<string, MarkerInterval[]>();
  const stack: { readonly id: string; readonly start: number }[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const start = /^; tscn-trace-start (\S+) /.exec(lines[index]);
    if (start !== null) {
      stack.push({ id: start[1], start: index + 1 });
      continue;
    }
    const end = /^; tscn-trace-end (\S+)$/.exec(lines[index]);
    if (end === null) {
      continue;
    }
    const open = stack.pop();
    expect(open?.id).toBe(end[1]);
    if (open !== undefined) {
      const intervals = markerIntervals.get(end[1]) ?? [];
      intervals.push({ start: open.start, end: index + 1 });
      markerIntervals.set(end[1], intervals);
    }
  }
  expect(stack).toEqual([]);
  return markerIntervals;
}

function expectOperationRangesMatchMarkers(
  operation: TraceMapOperation,
  lines: readonly string[],
  intervals: ReadonlyMap<string, readonly MarkerInterval[]>
): void {
  for (const range of operation.llvmRanges) {
    expect(range.startLine).toBeGreaterThan(0);
    expect(range.endLine).toBeGreaterThanOrEqual(range.startLine);
    expect(lines[range.startLine - 1]).not.toMatch(/^; tscn-trace-/);
    expect(lines[range.endLine - 1]).not.toMatch(/^; tscn-trace-/);
    expect(intervals.get(operation.id)?.some((interval) => range.startLine > interval.start && range.endLine < interval.end)).toBe(true);
  }
}

describe("operation trace maps", () => {
  test("emits the exact V1 envelope with deterministic, source-based operation records", async () => {
    const first = await expectSuccessfulCompile("const-number.ts");
    const second = await expectSuccessfulCompile("const-number.ts");
    try {
      const firstContents = await first.readArtifact("trace-map.json");
      const secondContents = await second.readArtifact("trace-map.json");
      const traceMap = JSON.parse(firstContents) as TraceMapV1;
      expect(firstContents).toBe(secondContents);
      expect(firstContents.endsWith("\n")).toBe(true);
      expect(Object.keys(traceMap)).toEqual(["version", "entry", "modules", "operations"]);
      expect(traceMap.version).toBe(1);
      expect(traceMap.modules).toHaveLength(1);
      expect(Object.keys(traceMap.modules[0])).toEqual([
        "id",
        "fileName",
        "statementCount",
        "loweringMode",
        "operationIds"
      ]);
      expect(traceMap.modules[0].loweringMode).toBe("native");
      expect(traceMap.modules[0].operationIds).toEqual(traceMap.operations.map((operation) => operation.id));
      expect(new Set(traceMap.operations.map((operation) => operation.id)).size).toBe(traceMap.operations.length);
      expect(traceMap.operations.map((operation) => operation.id)).toEqual(["m0:o000000", "m0:o000001"]);
      for (const operation of traceMap.operations) {
        expect(Object.keys(operation)).toEqual(["id", "moduleId", "kind", "source", "origin", "llvmRanges"]);
        expect(operation.source?.line).toBeGreaterThan(0);
        expect(operation.source?.column).toBeGreaterThan(0);
      }
      expect(traceMap.operations.map((operation) => operation.kind)).toEqual(["constNumber", "print"]);
      expect(firstContents).not.toContain('"expression"');
      expect(firstContents).not.toContain('"value"');
    } finally {
      await Promise.all([first.cleanup(), second.cleanup()]);
    }
  });

  test("traces function declarations and their body operations", async () => {
    const result = await expectSuccessfulCompile("function-call.ts");
    try {
      const traceMap = await readTraceMap(result);
      const functionOperation = traceMap.operations.find((operation) => operation.kind === "function");
      const bodyPrint = traceMap.operations.find((operation) => operation.kind === "print");
      expect(functionOperation?.source?.line).toBe(functionDeclarationLine);
      expect(functionOperation?.llvmRanges.length).toBeGreaterThan(0);
      expect(bodyPrint?.source?.line).toBe(functionBodyPrintLine);
      expect(bodyPrint?.llvmRanges.length).toBeGreaterThan(0);
    } finally {
      await result.cleanup();
    }
  });

  test("traces conditionals, loops, throws, and nested statement bodies", async () => {
    const fixtures = ["if-number-less-than-or-equal.ts", "while-loop.ts", "throw-string-top-level.ts"] as const;
    const results = await Promise.all(fixtures.map(async (fixture) => expectSuccessfulCompile(fixture)));
    try {
      const [conditional, loop, thrown] = await Promise.all(results.map(readTraceMap));
      expect(conditional.operations.map((operation) => operation.kind)).toEqual(["if", "print"]);
      expect(loop.operations.map((operation) => operation.kind)).toEqual(["letNumber", "while", "print", "assignNumber"]);
      expect(thrown.operations.map((operation) => operation.kind)).toEqual(["throwValue"]);
      for (const operation of [...conditional.operations, ...loop.operations, ...thrown.operations]) {
        expect(operation.source?.line).toBeGreaterThan(0);
        expect(operation.llvmRanges.length).toBeGreaterThan(0);
      }
    } finally {
      await Promise.all(results.map(async (result) => result.cleanup()));
    }
  });

  test("marks generated destructuring children as synthesized", async () => {
    const result = await expectSuccessfulCompile("destructure-nested.ts");
    try {
      const traceMap = await readTraceMap(result);
      const groupIndex = traceMap.operations.findIndex((operation) => operation.kind === "bindingGroup");
      expect(groupIndex).toBeGreaterThanOrEqual(0);
      const group = traceMap.operations[groupIndex];
      const children = traceMap.operations.slice(groupIndex + 1, groupIndex + destructuringChildEndOffset);
      expect(group.origin).toBe("source");
      expect(children.map((operation) => operation.kind)).toEqual(["constValue", "constValue"]);
      expect(children.every((operation) => operation.origin === "synthesized")).toBe(true);
      expect(children.every((operation) => operation.source?.line === group.source?.line)).toBe(true);
    } finally {
      await result.cleanup();
    }
  });

  test("records multiple modules and compile-time fallback provenance", async () => {
    const imported = await expectSuccessfulCompile("entry-with-import.ts");
    const fallback = await expectSuccessfulCompile("class-prototype-method-lookup.ts");
    try {
      const importedMap = await readTraceMap(imported);
      const fallbackMap = await readTraceMap(fallback);
      expect(importedMap.modules).toHaveLength(2);
      expect(importedMap.modules.map((module) => module.id)).toEqual(["m0", "m1"]);
      expect(importedMap.modules.every((module) => module.loweringMode === "native")).toBe(true);
      expect(importedMap.operations.map((operation) => operation.id)).toEqual(["m0:o000000", "m1:o000000"]);
      expect(fallbackMap.modules[0].loweringMode).toBe("compileTimeFallback");
    } finally {
      await Promise.all([imported.cleanup(), fallback.cleanup()]);
    }
  });

  test("derives empty and repeated LLVM ranges from explicit marker pairs", async () => {
    const emptyResult = await expectSuccessfulCompile("const-number.ts");
    const repeatedResult = await expectSuccessfulCompile("array-runtime-map-unsupported-callback.ts");
    try {
      const emptyMap = await readTraceMap(emptyResult);
      const repeatedMap = await readTraceMap(repeatedResult);
      expect(emptyMap.operations.find((operation) => operation.kind === "constNumber")?.llvmRanges).toEqual([]);
      const callback = repeatedMap.operations.find((operation) => operation.kind === "runtimeArrayMapFunctionObject");
      expect(callback?.llvmRanges.length).toBeGreaterThan(1);

      const llvm = await repeatedResult.readArtifact("main.ll");
      const lines = llvm.split("\n");
      const markerIntervals = collectMarkerIntervals(lines);
      for (const operation of repeatedMap.operations) {
        expect(llvm).toContain(`; tscn-trace-start ${operation.id} ${operation.kind} `);
        expect(llvm).toContain(`; tscn-trace-end ${operation.id}`);
        expectOperationRangesMatchMarkers(operation, lines, markerIntervals);
      }
      await expectLlvmAsVerificationIfAvailable(repeatedResult);
    } finally {
      await Promise.all([emptyResult.cleanup(), repeatedResult.cleanup()]);
    }
  }, roadmapIntegrationTimeoutMs);

  test("rejects compile-time fallback modules from the Node oracle", async () => {
    await expect(
      expectNativeMatchesNodeIfAvailable("class-prototype-method-lookup.ts", { keepArtifactsOnFailure: false })
    ).rejects.toThrow(/Compile-time fallback modules/);
  }, roadmapIntegrationTimeoutMs);

  test("keeps this-before-super constructors on the compile-time fallback", async () => {
    // Issue #24 acceptance: accessing `this` before `super()` must keep the
    // existing compile-time fallback rather than being silently mis-lowered
    // to native code with partial TDZ semantics.
    const result = await expectSuccessfulCompile("class-this-before-super.ts");
    try {
      const traceMap = await readTraceMap(result);
      expect(traceMap.modules[0].loweringMode).toBe("compileTimeFallback");
    } finally {
      await result.cleanup();
    }
  });
});
