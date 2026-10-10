import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import ts from "typescript";
import { afterAll, describe, expect, test } from "vitest";
import {
  type BindingDeclaration,
  BindingRegistry,
  type ResolvedModule,
  type ResolvedOperation,
  resolveBindings
} from "../../src/compiler/binding-resolution/index.js";
import { loadProgram } from "../../src/compiler/frontend.js";
import { type JsIrModule, type JsIrOperation, lowerToJsIr } from "../../src/compiler/ir.js";

const scratch = mkdtempSync(path.join(tmpdir(), "tscn-binding-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

/** A short stable name for a source string, so two cases with the same source share a temp file. */
function hash(source: string): string {
  let accumulator = 0;
  for (const character of source) {
    accumulator = (accumulator * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  }
  return accumulator.toString(36);
}

/** The lowered module for a source, with the real checker behind it. */
async function lower(source: string): Promise<JsIrModule> {
  const entry = path.join(scratch, `entry-${hash(source)}.ts`);
  writeFileSync(entry, source, "utf8");
  const frontend = await Effect.runPromise(
    loadProgram(entry).pipe(Effect.provide(NodeContext.layer))
  );
  const lowered = lowerToJsIr(entry, frontend.sourceFiles, frontend.program.getTypeChecker());
  expect(lowered.diagnostics).toEqual([]);
  return lowered.module;
}

/** The resolved module for a source, with the resolution diagnostics asserted empty. */
async function resolve(source: string): Promise<ResolvedModule> {
  const result = resolveBindings(await lower(source));
  expect(result.diagnostics).toEqual([]);
  return result.module;
}

/** A resolved module for an IR module this test built, together with whatever it reported. */
function resolveModule(module: JsIrModule) {
  return resolveBindings(module);
}

/** Every declaration a resolution minted, in minting order. */
function declarations(module: ResolvedModule): readonly BindingDeclaration[] {
  return module.bindings.declarations;
}

/** The declarations a resolution minted for one spelling, in minting order. */
function declarationsNamed(module: ResolvedModule, spelling: string): readonly BindingDeclaration[] {
  return declarations(module).filter((entry) => entry.spelling === spelling);
}

/** The one declaration for a spelling, failing the test when there is not exactly one. */
function declaration(module: ResolvedModule, spelling: string): BindingDeclaration {
  const found = declarationsNamed(module, spelling);
  expect(found).toHaveLength(1);
  return onlyEntry(found, `exactly one declaration named '${spelling}'`);
}

/** The single entry of a list, failing the test when the list does not hold exactly one. */
function onlyEntry<T>(entries: readonly T[], what: string): T {
  const [first] = entries;
  if (first === undefined) {
    throw new Error(`Expected ${what}`);
  }
  return first;
}

/** The module's operations, which is where a reference's identity is readable. */
function operations(module: ResolvedModule): readonly ResolvedOperation[] {
  return module.modules.at(0)?.operations ?? [];
}

function printsOf(list: readonly ResolvedOperation[]): readonly number[] {
  const printed: number[] = [];
  for (const operation of list) {
    if (operation.kind === "print" && operation.expression.kind === "identifier") {
      printed.push(operation.expression.name.binding.ordinal);
    }
    printed.push(...printsOf(nestedOperations(operation)));
  }
  return printed;
}

/** The operations an operation contains, for the container kinds these cases use. */
function nestedOperations(operation: ResolvedOperation): readonly ResolvedOperation[] {
  switch (operation.kind) {
    case "block":
    case "bindingGroup": {
      return operation.operations;
    }
    case "function":
    case "forOfArray": {
      return operation.body;
    }
    case "if": {
      return [...operation.thenOperations, ...operation.elseOperations];
    }
    default: {
      return [];
    }
  }
}

/** The ordinals every `print` in the module reads, in order. */
async function printedBindings(source: string): Promise<readonly number[]> {
  return printsOf(operations(await resolve(source)));
}

function arrayAccessBinding(operation: ResolvedOperation | undefined): number | undefined {
  if (operation?.kind !== "returnValue" || operation.expression.kind !== "number") {
    return undefined;
  }
  const { value } = operation.expression;
  return value.kind === "arrayAccess" ? value.arrayName.binding.ordinal : undefined;
}

/** The prototype binding a `letValue` constructs through, or `undefined` for any other shape. */
function constructedPrototype(operation: ResolvedOperation | undefined): { className: string; prototype: number } | undefined {
  if (operation?.kind !== "letValue" || operation.value.kind !== "newInstance") {
    return undefined;
  }
  return { className: operation.value.className, prototype: operation.value.prototypeName.binding.ordinal };
}

/** A minimal module wrapping one operation list, for the cases lowering will not produce. */
function moduleOf(list: readonly JsIrOperation[]): JsIrModule {
  return {
    entry: "/entry.ts",
    modules: [
      {
        fileName: "/entry.ts",
        statementCount: list.length,
        loweringMode: "native",
        operations: list,
        functionObjects: []
      }
    ],
    inlineCppBlocks: []
  };
}

describe("binding identity", () => {
  test("the first declaration a module makes is the first identity", async () => {
    const module = await resolve("const first = 1;\nconst second = 2;\nprint(first);\nprint(second);");
    expect(declarations(module).map((entry) => [entry.id.ordinal, entry.spelling])).toEqual([
      [0, "first"],
      [1, "second"]
    ]);
  });

  test("a declaration records the kind, the representation and where the slot lives", async () => {
    const module = await resolve("const value = 1;\nprint(value);");
    expect(declaration(module, "value").kind).toBe("const");
    expect(declaration(module, "value").storage).toEqual({
      representation: { kind: "number" },
      location: { kind: "moduleScope" }
    });
  });

  test("a function-local declaration lives in its own frame, not in the module", async () => {
    const module = await resolve("function read() { const local = 1; print(local); }");
    expect(declaration(module, "local").storage).toEqual({
      representation: { kind: "number" },
      location: { kind: "frame" }
    });
  });

  test("a runtime aggregate records the representation the IR model classified", async () => {
    const module = await resolve("const values = [1, 2, 3];\nprint(values.length);");
    expect(declaration(module, "values").storage.representation).toEqual({ kind: "fixedArray", length: 3 });
  });
});

describe("shadowing", () => {
  const shadowed = "const value = 1;\nif (true) { const value = 2; print(value); }\nprint(value);";

  test("an inner declaration hides an outer one for the length of its block", async () => {
    const module = await resolve(shadowed);
    const [first, second] = declarationsNamed(module, "value");
    expect(first.id.ordinal).toBe(0);
    expect(second.id.ordinal).toBe(1);
  });

  test("a read inside the block finds the inner declaration and the one after it the outer", async () => {
    expect(await printedBindings(shadowed)).toEqual([1, 0]);
  });

  const shadowedParameter = "const value = 1;\nfunction read(value: number) { print(value); }";

  test("a function parameter shadows a module binding of the same name", async () => {
    const module = await resolve(shadowedParameter);
    const [outer, parameter] = declarationsNamed(module, "value");
    expect(outer.storage.location.kind).toBe("moduleScope");
    expect(parameter.kind).toBe("parameter");
    expect(parameter.storage.location.kind).toBe("frame");
    expect(parameter.owner.kind).toBe("function");
  });

  test("the read inside the function finds the parameter, not the module binding", async () => {
    const module = await resolve(shadowedParameter);
    expect(await printedBindings(shadowedParameter)).toEqual([declarationsNamed(module, "value").at(1)?.id.ordinal]);
  });

  test("two declarations of one name are two identities, and both survive", async () => {
    const module = await resolve("const value = 1;\nfunction read() { const value = 2; return value; }");
    expect(new Set(declarationsNamed(module, "value").map((entry) => entry.id.ordinal)).size).toBe(2);
  });
});

describe("capture", () => {
  test("a nested function's read of an outer binding marks it captured", async () => {
    const module = await resolve("const outer = [1, 2];\nfunction read() { print(outer[0]); }");
    expect(declaration(module, "outer").captured).toBe(true);
  });

  test("a function's own local is not a capture of itself", async () => {
    const module = await resolve("function read() { const own = 1; print(own); }");
    expect(declaration(module, "own").captured).toBe(false);
    expect(declaration(module, "own").storage.location.kind).toBe("frame");
  });

  test("a parameter read by its own function is not a capture", async () => {
    const module = await resolve("function read(value: number) { print(value); }");
    expect(declaration(module, "value").captured).toBe(false);
  });

  test("a local of one function read by another is not a capture of that local", async () => {
    const module = await resolve(
      "function first() { const shared = 1; return shared; }\nfunction second() { const shared = 2; return shared; }"
    );
    expect(declarationsNamed(module, "shared").map((entry) => entry.captured)).toEqual([false, false]);
  });

  const capturedThenLocal =
    "function outer() { const shared = 1; function inner() { print(shared); } inner(); }\n" +
    "function later() { const shared = 2; print(shared); }";

  test("a local captured by a nested function moves to an environment", async () => {
    const module = await resolve(capturedThenLocal);
    const [shared] = declarationsNamed(module, "shared");
    expect(shared.captured).toBe(true);
    expect(shared.storage.location.kind).toBe("environment");
    expect(shared.owner.kind).toBe("function");
  });

  test("a function's depth is restored when it closes, so the next function starts fresh", async () => {
    const module = await resolve(capturedThenLocal);
    expect(declarationsNamed(module, "shared").map((entry) => entry.captured)).toEqual([true, false]);
  });

  test("a function object's body resolves the outer binding it reads", async () => {
    const module = await resolve("const outer = [1];\nconst inner = () => outer[0];\nprint(inner);");
    const definition = module.modules.at(0)?.functionObjects.at(0);
    const [returned] = definition?.body ?? [];
    expect(definition?.codeName).toBe("__tscn_fnobj_inner_0");
    expect(declaration(module, "outer").captured).toBe(true);
    expect(arrayAccessBinding(returned)).toBe(declaration(module, "outer").id.ordinal);
  });
});

describe("hoisting", () => {
  test("a function declaration is visible before its own statement", async () => {
    const module = await resolve("later();\nfunction later() { return 1; }");
    const call = operations(module).find((operation) => operation.kind === "call");
    expect(call?.kind === "call" ? call.name.binding.ordinal : undefined).toBe(declaration(module, "later").id.ordinal);
  });

  test("a hoisted declaration is bound once, so a recursive reference is the same identity", async () => {
    const module = await resolve("function fact(n: number) { return n <= 1 ? 1 : n * fact(n - 1); }");
    expect(declarationsNamed(module, "fact")).toHaveLength(1);
  });

  test("a function body resolves a lexical declaration written after the function", () => {
    const result = resolveBindings(moduleOf([
      { kind: "function", name: "read", parameters: [], body: [
        { kind: "returnNumber", expression: { kind: "parameter", name: "later" } }
      ] },
      { kind: "constNumber", name: "later", value: { kind: "literal", value: 7 } }
    ]));
    expect(result.diagnostics).toEqual([]);
    const [read, later] = result.module.modules[0].operations;
    const returned = read.kind === "function" ? read.body[0] : undefined;
    expect(returned?.kind === "returnNumber" && returned.expression.kind === "parameter"
      ? returned.expression.name.binding : undefined).toBe(later.kind === "constNumber" ? later.name.binding : undefined);
    expect(result.module.bindings.declarations.map((entry) => [entry.spelling, entry.captured])).toEqual([
      ["read", false], ["later", true]
    ]);
  });

  test("hoisting reaches inside a block, and stops at the block that owns it", () => {
    const insideBlock = resolveModule(
      moduleOf([
        {
          kind: "block",
          operations: [
            { kind: "print", expression: { kind: "identifier", name: "inner" } },
            { kind: "function", name: "inner", parameters: [], body: [] }
          ]
        }
      ])
    );
    expect(insideBlock.diagnostics).toEqual([]);
    const block = insideBlock.module.modules.at(0)?.operations.at(0);
    const printed = block?.kind === "block" ? block.operations.at(0) : undefined;
    const read = printed?.kind === "print" ? printed.expression : undefined;
    expect(read?.kind === "identifier" ? read.name.binding.ordinal : undefined).toBe(0);

    const outsideBlock = resolveModule(
      moduleOf([
        { kind: "print", expression: { kind: "identifier", name: "inner" } },
        { kind: "block", operations: [{ kind: "function", name: "inner", parameters: [], body: [] }] }
      ])
    );
    expect(outsideBlock.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["TSCN2006"]);
  });
});

describe("loops, catch and destructuring", () => {
  test("a loop item is declared in the loop's own scope", async () => {
    const source = "const values = [1, 2];\nfor (const item of values) { print(item); }";
    const module = await resolve(source);
    const item = declaration(module, "item");
    expect(item.kind).toBe("loopItem");
    expect(await printedBindings(source)).toEqual([item.id.ordinal]);
  });

  test("a loop item does not escape its loop", () => {
    const escaping = resolveModule(
      moduleOf([
        { kind: "arrayLiteral", name: "values", elements: [{ kind: "literal", value: 1 }] },
        {
          kind: "forOfArray",
          itemName: "item",
          arrayName: "values",
          body: [{ kind: "print", expression: { kind: "identifier", name: "item" } }]
        },
        { kind: "print", expression: { kind: "identifier", name: "item" } }
      ])
    );
    expect(escaping.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["TSCN2006"]);
    expect(escaping.diagnostics[0]?.message).toContain("'item'");
  });

  test("a catch parameter the operation declares is a declaration, and its body reads it", () => {
    const result = resolveModule(
      moduleOf([
        {
          kind: "tryCatch",
          hasCatch: true,
          catchVariable: "error",
          tryOperations: [{ kind: "throwValue", value: { kind: "number", value: { kind: "literal", value: 1 } } }],
          catchOperations: [{ kind: "print", expression: { kind: "identifier", name: "error" } }]
        }
      ])
    );
    expect(result.diagnostics).toEqual([]);
    const source = onlyEntry(result.module.modules, "the resolved source module");
    const operation = onlyEntry(source.operations, "the resolved tryCatch");
    expect(operation.kind === "tryCatch" ? operation.catchVariable?.binding.ordinal : undefined).toBe(0);
    expect(result.module.bindings.declarations.at(0)?.kind).toBe("catch");
  });

  test("a `try` with no catch clause declares nothing for one", () => {
    const result = resolveModule(
      moduleOf([
        {
          kind: "tryCatch",
          hasCatch: false,
          catchVariable: "",
          tryOperations: [{ kind: "print", expression: { kind: "number", value: { kind: "literal", value: 1 } } }],
          catchOperations: []
        }
      ])
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.module.bindings.declarations).toEqual([]);
  });

  test("a destructuring pattern's names are visible to the statements after it", async () => {
    const source = "const [first, second] = [1, 2];\nprint(first);\nprint(second);";
    const module = await resolve(source);
    expect(declarationsNamed(module, "first")[0]?.kind).toBe("destination");
    expect(await printedBindings(source)).toEqual([0, 1]);
  });
});

describe("what is not a binding", () => {
  test("a property path stays a list of strings", async () => {
    const module = await resolve("const point = { x: 1 };\npoint.x = 2;\n");
    const store = operations(module).find((operation) => operation.kind === "objectStore");
    expect(store?.kind === "objectStore" ? store.path : undefined).toEqual(["x"]);
  });

  test("a generated class code name is not a binding, but its prototype is", async () => {
    const module = await resolve("class Point { x = 1; }\nconst made = new Point();\n");
    const construction = operations(module)
      .map(constructedPrototype)
      .find((entry) => entry !== undefined);
    expect(construction?.className).toBe("Point");
    expect(construction?.prototype).toBe(declarationsNamed(module, "Point$prototype").at(0)?.id.ordinal);
  });

  test("an external C++ symbol is not a binding", () => {
    const result = resolveModule(moduleOf([{ kind: "inlineCpp", symbol: "cppAdd" }]));
    expect(result.diagnostics).toEqual([]);
    expect(result.module.bindings.declarations).toEqual([]);
  });
});

describe("metadata", () => {
  test("an operation's trace survives resolution", async () => {
    const module = await resolve("const value = 1;\nprint(value);");
    expect(operations(module).find((operation) => operation.kind === "print")?.trace).toBeDefined();
  });

  test("the module envelope keeps the lowering's own fields", async () => {
    const module = await resolve("const value = 1;");
    expect(module.modules.at(0)?.loweringMode).toBe("native");
    expect(module.modules.at(0)?.statementCount).toBe(1);
    expect(module.entry).toContain("entry-");
  });

  test("two resolutions do not see each other's identities", async () => {
    expect(declarations(await resolve("const value = 1;")).map((entry) => entry.spelling)).toEqual(["value"]);
    expect(declarations(await resolve("const other = 2;")).map((entry) => entry.spelling)).toEqual(["other"]);
  });

  test("the module envelope lists the function objects its sites declared", async () => {
    const module = await resolve("const read = (n: number) => n + 1;\nprint(read);");
    expect(module.modules.at(0)?.functionObjects.map((entry) => entry.codeName)).toHaveLength(1);
  });
});

describe("function metadata and isolation", () => {
  test("empty sibling function bodies still carry distinct owners", () => {
    const result = resolveBindings(moduleOf([
      { kind: "function", name: "first", parameters: [], body: [] },
      { kind: "function", name: "second", parameters: [], body: [] }
    ]));
    expect(result.diagnostics).toEqual([]);
    expect(result.module.modules[0].operations.map((operation) =>
      operation.kind === "function" ? operation.functionId.ordinal : undefined)).toEqual([0, 1]);
  });

  test("capture values resolve in the enclosing scope before parameter shadowing", () => {
    const result = resolveBindings(moduleOf([
      { kind: "constNumber", name: "outer", value: { kind: "literal", value: 1 } },
      { kind: "constValue", name: "callback", value: {
        kind: "functionObject",
        definition: {
          codeName: "generated_callback", inferredName: "visibleName",
          functionKind: "arrow", returnKind: "number",
          parameters: [{ name: "outer", valueKind: "number" }],
          captures: [{ name: "outer", valueKind: "number", value: { kind: "number", value: { kind: "parameter", name: "outer" } } }],
          body: [{ kind: "returnNumber", expression: { kind: "parameter", name: "outer" } }]
        }
      } }
    ]));
    expect(result.diagnostics).toEqual([]);
    const [definition] = result.module.modules[0].functionObjects;
    const captured = definition.captures?.[0];
    expect(definition.inferredName).toBe("visibleName");
    expect(definition.functionId?.ordinal).toBe(0);
    expect(captured?.name.binding.ordinal).toBe(0);
    expect(captured?.value.kind === "number" && captured.value.value.kind === "parameter"
      ? captured.value.value.name.binding.ordinal : undefined).toBe(0);
    expect(definition.parameters[0].name.binding.ordinal).toBe(2);
    expect(result.module.bindings.declarations.map((entry) => entry.captured)).toEqual([true, false, false]);
  });

  test("registries reject handles minted by another resolution", () => {
    const first = new BindingRegistry();
    const second = new BindingRegistry();
    const foreign = first.mint("foreign", "const", { kind: "number" }, { kind: "module" });
    second.mint("local", "const", { kind: "number" }, { kind: "module" });
    expect(() => second.markCaptured(foreign)).toThrow("Binding reference belongs to another resolution");
  });

  test("inline callbacks carry explicit this identity and captured source cells", () => {
    const result = resolveBindings(moduleOf([{ kind: "function", name: "outer", parameters: [], body: [
      { kind: "letNumber", name: "counter", value: { kind: "literal", value: 1 } },
      { kind: "runtimeArrayLiteral", name: "source", elements: [] },
      { kind: "runtimeArrayMapFunctionObject", method: "map", name: "mapped", arrayName: "source", callbackName: "generated_callback",
        callbackParameters: [], callbackReturnKind: "value", callbackKind: "ordinary",
        captures: [{ name: "generated_counter", valueKind: "number", value: { kind: "number", value: { kind: "variable", name: "counter" } } }],
        callbackBody: [{ kind: "returnValue", expression: { kind: "variable", name: "this" } }] }
    ] }]));
    expect(result.diagnostics).toEqual([]);
    const [outer] = result.module.modules[0].operations;
    const callback = outer.kind === "function" ? outer.body[2] : undefined;
    if (callback?.kind !== "runtimeArrayMapFunctionObject") throw new Error("Expected inline callback");
    const counter = declaration(result.module, "counter");
    expect(counter.storage.location.kind).toBe("environment");
    expect(callback.captures?.[0].sourceBinding?.binding).toBe(counter.id);
    const [returned] = callback.callbackBody;
    expect(returned.kind === "returnValue" && returned.expression.kind === "variable" ? returned.expression.name : undefined).toBe(callback.thisBinding);
    expect(callback.thisBinding?.binding).toBe(declaration(result.module, "this").id);
  });

  test("explicit closure capture lists promote outer locals even without body reads", () => {
    const result = resolveBindings(moduleOf([{ kind: "function", name: "outer", parameters: [], body: [
      { kind: "letNumber", name: "counter", value: { kind: "literal", value: 1 } },
      { kind: "function", name: "named", enclosingCaptureNames: ["counter"], parameters: [], body: [] },
      { kind: "returnClosure", functionName: "returned_code", captures: ["counter"], parameters: [], body: [] }
    ] }]));
    expect(result.diagnostics).toEqual([]);
    expect(declaration(result.module, "counter").captured).toBe(true);
    expect(declaration(result.module, "counter").storage.location.kind).toBe("environment");
  });

  test("source modules cannot resolve each other's declarations", () => {
    const first = moduleOf([{ kind: "constNumber", name: "onlyFirst", value: { kind: "literal", value: 1 } }]);
    const second = moduleOf([{ kind: "print", expression: { kind: "identifier", name: "onlyFirst" } }]);
    const result = resolveBindings({ ...first, modules: [first.modules[0], { ...second.modules[0], fileName: "/second.ts" }] });
    expect(result.module.modules.map((module) => module.fileName)).toEqual(["/entry.ts"]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      "/second.ts: Unresolved binding 'onlyFirst'. Visible scopes: module."
    ]);
  });

  test("cross-module mutual recursion resolves both calls to the declared identities", async () => {
    const entry = path.resolve(import.meta.dirname, "../fixtures/import-mutual-recursion.ts");
    const frontend = await Effect.runPromise(loadProgram(entry).pipe(Effect.provide(NodeContext.layer)));
    const lowered = lowerToJsIr(entry, frontend.sourceFiles, frontend.program.getTypeChecker());
    expect(lowered.diagnostics).toEqual([]);
    const result = resolveBindings(lowered.module);
    expect(result.diagnostics).toEqual([]);
    const moduleFunctions = result.module.modules.flatMap((module) => module.operations.filter((operation) => operation.kind === "function"));
    const calls = moduleFunctions.map((operation) => {
      const returned = operation.body.at(-1);
      return returned?.kind === "returnNumber" && returned.expression.kind === "call"
        ? returned.expression.name.binding.ordinal : undefined;
    });
    expect(calls.toSorted((left, right) => (left ?? -1) - (right ?? -1))).toEqual([
      declaration(result.module, "isEven").id.ordinal,
      declaration(result.module, "isOdd").id.ordinal
    ].toSorted((left, right) => left - right));
  });

  test("a diagnostic after a nested function uses its enclosing operation trace", () => {
    const span = { fileName: "/entry.ts", line: 8, column: 2 };
    const result = resolveBindings(moduleOf([
      { kind: "constNumber", name: "seed", value: { kind: "literal", value: 1 } },
      { kind: "constValue", name: "callback", trace: { id: "outer", origin: "source", source: span }, value: {
        kind: "functionObject", definition: {
          codeName: "outer_callback", functionKind: "arrow", returnKind: "void", parameters: [], body: [],
          captures: [
            { name: "seed", valueKind: "value", value: { kind: "functionObject", definition: {
              codeName: "nested_callback", functionKind: "arrow", returnKind: "number", parameters: [],
              body: [{ kind: "returnNumber", expression: { kind: "literal", value: 1 }, trace: { id: "nested", origin: "source" } }]
            } } },
            { name: "seed", valueKind: "number", value: { kind: "number", value: { kind: "parameter", name: "missing" } } }
          ]
        }
      } }
    ]));
    expect(result.diagnostics[0]?.span).toEqual(span);
  });
});

describe("an unresolved name", () => {
  test("is reported as a diagnostic against the operation that referenced it", () => {
    const result = resolveModule(moduleOf([{ kind: "print", expression: { kind: "identifier", name: "missing" } }]));
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.category).toBe("error");
    expect(result.diagnostics[0]?.message).toContain("Unresolved binding 'missing'");
    expect(result.diagnostics[0]?.message).toContain("Visible scopes: module");
  });

  test("does not throw out of the pass", () => {
    expect(() => resolveModule(moduleOf([{ kind: "print", expression: { kind: "identifier", name: "missing" } }]))).not.toThrow();
  });

  test("leaves the source module out rather than emitting a half-resolved tree", () => {
    const result = resolveModule(moduleOf([
      { kind: "constNumber", name: "value", value: { kind: "literal", value: 1 } },
      { kind: "print", expression: { kind: "identifier", name: "missing" } }
    ]));
    expect(result.module.modules).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
  });

  test("names the file the reference was in", () => {
    const result = resolveModule(moduleOf([{ kind: "print", expression: { kind: "identifier", name: "missing" } }]));
    expect(result.diagnostics[0]?.message).toContain("/entry.ts");
  });
});

const fixtureDirectory = path.resolve(import.meta.dirname, "../fixtures");
const fixtureNames: readonly string[] = readdirSync(fixtureDirectory, "utf8");
const fixtures: readonly string[] = fixtureNames.filter((name) => name.endsWith(".ts")).toSorted();
const fixturePaths: readonly string[] = fixtures.map((name) => path.join(fixtureDirectory, name));

describe("every fixture", () => {

  const importsAnotherModule = new Set(
    fixtures.filter((name) => /^\s*(import|export)\b/m.test(readFileSync(path.join(fixtureDirectory, name), "utf8")))
  );

  const program = ts.createProgram(fixturePaths, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true
  });
  const checker = program.getTypeChecker();

  test("the fixture directory is populated", () => {
    expect(fixtures.length).toBeGreaterThan(100);
  });

  test("every fixture that lowers cleanly resolves without an unresolved binding", async () => {
    const importedPrograms = new Map(await Promise.all([...importsAnotherModule].map(async (name) => [
      name,
      await Effect.runPromise(loadProgram(path.join(fixtureDirectory, name)).pipe(Effect.provide(NodeContext.layer)))
    ] as const)));
    const unresolved: string[] = [];
    let resolved = 0;
    let skipped = 0;
    for (const name of fixtures) {
      const sourceFile = program.getSourceFile(path.join(fixtureDirectory, name));
      if (sourceFile === undefined) {
        continue;
      }
      const importedFrontend = importedPrograms.get(name);
      const lowered = importedFrontend === undefined
        ? lowerToJsIr(sourceFile.fileName, [sourceFile], checker)
        : lowerToJsIr(sourceFile.fileName, importedFrontend.sourceFiles, importedFrontend.program.getTypeChecker());
      if (lowered.diagnostics.length > 0) {
        skipped += 1;
        continue;
      }
      const result = resolveBindings(lowered.module);
      const loweredDefinitions = lowered.module.modules.flatMap((module) => module.functionObjects.map((definition) => definition.codeName));
      const resolvedDefinitions = result.module.modules.flatMap((module) => module.functionObjects.map((definition) => definition.codeName));
      expect(resolvedDefinitions.toSorted(), name).toEqual(loweredDefinitions.toSorted());
      if (result.diagnostics.length > 0) {
        unresolved.push(`${name}: ${result.diagnostics.map((diagnostic) => diagnostic.message).join("; ")}`);
      } else {
        resolved += 1;
      }
    }
    expect(resolved).toBeGreaterThan(100);
    expect(skipped).toBeGreaterThan(0);
    expect(unresolved).toEqual([]);
  });

  test("a fixture with bindings resolves them", () => {
    const fileName = path.join(fixtureDirectory, "nested-function-declaration.ts");
    const sourceFile = onlyEntry(
      [program.getSourceFile(fileName)].filter((file) => file !== undefined),
      "the fixture to be in the program"
    );
    const result = resolveBindings(lowerToJsIr(fileName, [sourceFile], checker).module);
    expect(result.diagnostics).toEqual([]);
    expect(result.module.bindings.declarations.length).toBeGreaterThan(0);
  });
});
