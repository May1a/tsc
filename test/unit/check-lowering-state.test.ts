import { describe, expect, test } from "vitest";
import { scanLoweringState } from "../../scripts/check-lowering-state.mjs";

describe("Lowering state ownership", () => {
  test.each([
    "let nextId = 1;",
    "const state = { nextId: 1 }; function lower() { state.nextId++; }",
    "const state = { enabled: false }; function lower() { state.enabled = true; }",
    "const blocks: string[] = []; function lower() { blocks.push('code'); }",
    "const registry = new Map(); function lower() { registry.clear(); }",
    "const state = { nextId: 1 }; function lower() { const alias = state; alias.nextId += 1; }"
  ])("rejects compilation state shared by invocations: %s", (source) => {
    expect(scanLoweringState({ "state.ts": source }).map((finding) => finding.rule)).toEqual(["no-shared-lowering-state"]);
  });

  test("rejects the previous class-registry protocol through an imported alias", () => {
    const findings = scanLoweringState({
      "class-state.ts": "export const classLoweringState = { registry: undefined };",
      "source-module.ts": "import { classLoweringState as state } from './class-state.js'; function lower() { state.registry = new Map(); }"
    });
    expect(findings.map((finding) => finding.rule)).toEqual(["no-shared-lowering-state"]);
  });

  test.each([
    "function lower() { const state = { nextId: 1 }; state.nextId++; return state; }",
    "const state = { nextId: 1 }; function lower(state: { nextId: number }) { state.nextId++; }",
    "const state = { nextId: 1 }; function lower() { const state = { nextId: 0 }; state.nextId++; }",
    "const kinds = new Set(['number']); function lower(kind: string) { return kinds.has(kind); }",
    "const names = (() => { const result = new Map(); result.set(1, 'one'); return result; })();"
  ])("allows compilation-owned mutation and read-only tables: %s", (source) => {
    expect(scanLoweringState({ "state.ts": source })).toEqual([]);
  });
});
