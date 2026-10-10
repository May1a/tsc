import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { expect, test } from "vitest";
import { resolveBindings } from "../../src/compiler/binding-resolution/index.js";
import { loadProgram } from "../../src/compiler/frontend.js";
import { type JsIrModule, type JsIrNumberExpression, type JsIrOperation, lowerToJsIr } from "../../src/compiler/ir.js";
import { createLlvmModule } from "../../src/compiler/llvm-ir/index.js";
import { emitNativeModule } from "../../src/compiler/native-lowering/module.js";
import { runtimeIrText } from "../../src/compiler/runtime-files.js";
import { captureCommand, commandExecutorLayer, toolExecutable } from "./helpers.js";

const programs = [
  { name: "mutual recursion and normalized parameters", source: `
    declare function print(value: unknown): void;
    function even(n: number): number { if (n === 0) return 1; return odd(n - 1); }
    function odd(n: number): number { if (n === 0) return 0; return even(n - 1); }
    function add(n: number = 7): number { return n + 1; }
    function total(...items: number[]): number { return items.length; }
    print(even(10)); print(odd(9)); print(add()); print(add(2)); print(total(1, 2, 3));
  `, expected: "1\n1\n8\n3\n3\n" },
  { name: "shared capture cells and function-object calls", source: mutableCaptures(), forceCollection: true, expected: "11\n12\n21\n13\n" },
  { name: "hoisted nested declarations and stable function identities", source: `
    declare function print(value: unknown): void;
    function outer(n: number): number {
      const result = inner();
      function inner(): number { return n + 3; }
      return result;
    }
    function identity(x: number): number { return x; }
    const ref = identity;
    print(outer(4)); print(ref === identity); print(ref(9)); print(ref.name); print(ref.length);
  `, expected: "7\ntrue\n9\nidentity\n1\n" },
  { name: "ordinary receivers and captured string parameters", source: `
    declare function print(value: unknown): void;
    const holder = { base: 4, add(value: number): number { return Number(this.base) + value; } };
    function greeting(prefix: string) { return (name: string): string => prefix + name; }
    const greet = greeting("hello ");
    print(holder.add(3)); print(greet("Ada"));
  `, expected: "7\nhello Ada\n" },
  { name: "tagged-template singleton arrays and rest interpolation parameters", source: `
    declare function print(value: unknown): void;
    const cache: any = {};
    function same(strings: any): boolean {
      if (cache.current === strings) return true;
      cache.current = strings;
      return false;
    }
    function run(): boolean { return same\`same \${0}\`; }
    function tag(strings: any, ...values: any[]): string { return strings[0] + "|" + values[0]; }
    print(run()); print(run()); print(tag\`text \${7} more\`);
  `, expected: "false\ntrue\ntext |7\n" },
  { name: "fresh function identities on factory invocations", source: `
    declare function print(value: unknown): void;
    function factory() { return (): number => 7; }
    const first = factory(); const second = factory();
    print(first === first); print(first === second); print(first()); print(second());
  `, expected: "true\nfalse\n7\n7\n" },
  { name: "value-tier rest arguments preserve nested arrays", source: `
    declare function print(value: unknown): void;
    function first(...args: any[]): any { return args[0]; }
    const values: unknown[] = [1, 2];
    print(first(7, 8)); print(first(values) === values); print(first());
  `, expected: "7\ntrue\nundefined\n" },
  { name: "imported method code names cannot collide", source: `
    declare function print(value: unknown): void;
    import { makeLeft } from "./left.js";
    import { makeRight } from "./right.js";
    const left = makeLeft(); const right = makeRight();
    print(left.read()); print(right.read());
  `, files: { "left.ts": "export function makeLeft() { return { read(): number { return 1; } }; }",
    "right.ts": "export function makeRight() { return { read(): number { return 2; } }; }" }, expected: "1\n2\n" }
];

for (const program of programs) {
  test(`generated completion functions execute ${program.name}`, async () => {
    const clang = await toolExecutable("clang");
    if (clang === undefined) { return; }
    const directory = await mkdtemp(path.join(tmpdir(), "tscn-native-functions-"));
    try {
      const entry = path.join(directory, "entry.ts");
      if ("files" in program) {
        await Promise.all(Object.entries(program.files ?? {}).map(async ([name, source]) => writeFile(path.join(directory, name), source)));
      }
      const module = typeof program.source === "string" ? await lowerSource(entry, program.source) : irModule(entry, program.source);
      const resolved = resolveBindings(module);
      expect(resolved.diagnostics).toEqual([]);
      const builder = createLlvmModule({ staticRuntime: [{ origin: "static runtime", text: runtimeIrText() }] });
      const rendered = emitNativeModule(resolved.module, builder);
      const source = path.join(directory, "main.ll");
      const executable = path.join(directory, "main");
      await writeFile(source, rendered.text);
      const collectSource = path.join(directory, "collect.c");
      const inputs = "forceCollection" in program && program.forceCollection ? [source, collectSource] : [source];
      if (inputs.length > 1) {
        await writeFile(collectSource, "extern void gcCollect(void); unsigned long long forceCollect(void) { gcCollect(); return 9222246136947933184ULL; }");
      }
      const compiled = await Effect.runPromise(captureCommand(clang, [...inputs, "-o", executable]).pipe(Effect.provide(commandExecutorLayer)));
      expect(compiled.status, compiled.stderr).toBe(0);
      const result = await Effect.runPromise(captureCommand(executable, []).pipe(Effect.provide(commandExecutorLayer)));
      expect(result).toEqual({ status: 0, stdout: program.expected, stderr: "" });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

async function lowerSource(entry: string, source: string): Promise<JsIrModule> {
  await writeFile(entry, source);
  const frontend = await Effect.runPromise(loadProgram(entry).pipe(Effect.provide(NodeContext.layer)));
  const result = lowerToJsIr(entry, frontend.sourceFiles, frontend.program.getTypeChecker());
  expect(result.diagnostics, JSON.stringify(result.diagnostics)).toEqual([]);
  return result.module;
}

function irModule(entry: string, operations: readonly JsIrOperation[]): JsIrModule {
  return { entry, inlineCppBlocks: operations.some((operation) => operation.kind === "inlineCpp") ? [{ symbol: "forceCollect", code: "" }] : [], modules: [{ fileName: entry, operations, functionObjects: [], loweringMode: "native", statementCount: operations.length }] };
}

function mutableCaptures(): readonly JsIrOperation[] {
  return [
    { kind: "function", name: "counter", parameters: [{ name: "start", valueKind: "number" }], body: [
      { kind: "letNumber", name: "count", value: variable("start") },
      { kind: "returnValue", expression: { kind: "functionObject", definition: {
        codeName: "counter.inner", functionKind: "arrow", returnKind: "number", parameters: [], captures: [
          { name: "count", valueKind: "number", value: { kind: "variable", name: "count" } }
        ], body: [
          { kind: "assignNumber", name: "count", value: { kind: "binary", operator: "add", left: variable("count"), right: { kind: "literal", value: 1 } } },
          { kind: "returnNumber", expression: variable("count") }
        ]
      } } }
    ] },
    { kind: "constValue", name: "first", value: { kind: "call", name: "counter", arguments: [{ valueKind: "number", value: { kind: "literal", value: 10 } }] } },
    { kind: "constValue", name: "second", value: { kind: "call", name: "counter", arguments: [{ valueKind: "number", value: { kind: "literal", value: 20 } }] } },
    { kind: "inlineCpp", symbol: "forceCollect" }, call("first"), { kind: "inlineCpp", symbol: "forceCollect" },
    call("first"), call("second"), call("first")
  ];
}

function variable(name: string): JsIrNumberExpression { return { kind: "variable", name }; }

function call(name: string): JsIrOperation {
  return { kind: "print", expression: { kind: "value", value: { kind: "callValue", callee: { kind: "variable", name }, arguments: [] } } };
}
