import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const scratch = mkdtempSync(path.join(tmpdir(), "tscn-procedural-lint-"));
const configuration = path.join(scratch, "oxlint.json");
const sourceFile = path.join(scratch, "input.ts");

beforeAll(() => {
  writeFileSync(configuration, JSON.stringify({
    categories: { correctness: "off" },
    jsPlugins: [{ name: "tscn", specifier: path.join(repoRoot, "scripts/procedural-style-plugin.mjs") }],
    rules: {
      "tscn/prefer-const-initialization": "error",
      "tscn/prefer-array-transform": "error",
      "tscn/no-shadowed-global-type-parameter": "error",
      "tscn/no-assertion-on-error-cause": "error"
    }
  }));
});

afterAll(() => { rmSync(scratch, { recursive: true, force: true }); });

function lint(source: string) {
  writeFileSync(sourceFile, source);
  return spawnSync(process.execPath, [
    path.join(repoRoot, "node_modules/oxlint/bin/oxlint"), "-c", configuration, "-f", "json", sourceFile
  ], { encoding: "utf8" });
}

describe("procedural style rules through Oxlint", () => {
  test.each([
    ["prefer-const-initialization", 'let capacity = 1; if (expression.storeLength === true) { capacity = 2; } use(capacity);'],
    ["prefer-const-initialization", 'let body: readonly Operation[]; if (prelude.length === 0) { body = statements; } else { body = [group]; } use(body);'],
    ["prefer-const-initialization", 'let name; if (flag) name = left; else name = right; use(name);'],
    ["prefer-array-transform", 'const lines: string[] = []; const values = expressions.map(emit); for (const value of values) { lines.push(...value.lines); } use(lines);'],
    ["prefer-array-transform", 'const names: string[] = []; for (const item of items) { names.push(item.name); } use(names);'],
    ["prefer-array-transform", 'const names = []; for (const [key, value] of pairs) names.push(key, value); use(names);'],
    ["no-shadowed-global-type-parameter", 'function failure<Error>(error: Error): Error { return error; }'],
    ["no-shadowed-global-type-parameter", 'interface Collection<Array> { values: Array }'],
    ["no-shadowed-global-type-parameter", 'const collectText = <Error, Requirements>(stream: Stream.Stream<Uint8Array, Error, Requirements>): Effect.Effect<string, Error, Requirements> => Stream.runFold(stream, "", concat);'],
    ["no-assertion-on-error-cause", 'const error = Option.getOrThrow(Cause.failureOption(exit.cause)) as CompilationFailed;'],
    ["no-assertion-on-error-cause", 'const failure = Option.getOrThrow(Cause.failureOption(exit.cause)); const alias = failure; use(alias as CompilationFailed);'],
    ["no-assertion-on-error-cause", 'const failure = exit.cause; use(<CompilationFailed>failure);']
  ])("rejects %s in %s", (rule, source) => {
    const result = lint(source);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(`tscn(${rule})`);
  });

  test.each([
    'const capacity = expression.storeLength === true ? 2 : 1; use(capacity);',
    'let capacity = 1; if (flag) capacity = 2; capacity++; use(capacity);',
    'let capacity = 1; if (capacity > 0) capacity = 2; use(capacity);',
    'let capacity = 1; if (flag) capacity = capacity + 1; use(capacity);',
    'let capacity = allocate(); if (flag) capacity = other; use(capacity);',
    'let name; if (flag) { observe(); name = left; } else name = right; use(name);',
    'let name; if (flag) { let name; name = left; } else name = right; use(name);',
    'let capacity = 1; if (read()) capacity = 2; function read() { return capacity; } use(capacity);',
    'let capacity = 1; if (flag) capacity = 2; function read() { return capacity; } read();',
    'for (let index = 0; index < size; index++) { use(index); }',
    'const names = items.map((item) => item.name); use(names);',
    'const lines = values.flatMap((value) => value.lines); use(lines);',
    'const names = []; for (const item of items) { observe(item); names.push(item.name); } use(names);',
    'const names = []; for (const item of items) { if (item.ready) names.push(item.name); } use(names);',
    'const names = []; for (const item of items) { names.push(names.length); } use(names);',
    'const names = []; for (const item of names) names.push(item); use(names);',
    'const names = []; initialize(names); for (const item of items) names.push(item); use(names);',
    'const names = [first]; for (const item of items) names.push(item); use(names);',
    'const names = []; async function fill() { for await (const item of items) names.push(item); } fill();',
    'const names = []; for (const item of items) { const names = other; names.push(item); } use(names);',
    'const queue = createQueue(); for (const item of items) queue.push(item);',
    'async function build() { const names = []; for (const item of items) names.push(await name(item)); return names; }',
    'function* build() { const names = []; for (const item of items) names.push(yield item); return names; }',
    'const names = []; for (const item of items) names.push(read()); function read() { return names.length; }',
    'function failure<TFailure extends Error>(error: TFailure): TFailure { return error; }',
    'interface Collection<TElement> { values: Array<TElement> }',
    'const failure = Option.getOrThrow(Cause.failureOption(exit.cause)); if (failure instanceof CompilationFailed) use(failure.diagnostics);',
    'const failure = exit.cause; if (failure.kind === "compilationFailed") use(failure.diagnostics);',
    'const failure = exit.cause; function separate() { const failure = input; use(failure as Other); }',
    'const descriptor = { cause: "literal property key" } as const;'
  ])("allows expressions and necessary state: %s", (source) => {
    const result = lint(source);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"diagnostics": []');
  });
});
