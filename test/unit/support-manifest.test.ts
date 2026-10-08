import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import ts from "typescript";
import { lowerToJsIr } from "../../src/compiler/ir.js";
import {
  arrayBuiltinSupport,
  builtinDisplay,
  collectionBuiltinSupport,
  dateBuiltinSupport,
  errorBuiltinSupport,
  functionBuiltinSupport,
  iteratorBuiltinSupport,
  jsonBuiltinSupport,
  mathBuiltinSupport,
  numberBuiltinSupport,
  numberGlobalBuiltinSupport,
  objectBuiltinSupport,
  regexpBuiltinSupport,
  stringBuiltinSupport,
  supportManifest
} from "../../src/compiler/ir/builtins/index.js";
import { expectUnsupportedMessage } from "../integration/helpers.js";
import { oracleFixtures } from "../integration/oracle.js";

/**
 * The support manifest is what the compiler says it supports, derived from the support tables so
 * it cannot drift from them. This test is the part that keeps the *fixtures* honest: a builtin the
 * table claims is supported needs a fixture that runs, and a builtin it admits it has not written
 * needs a fixture that asserts the refusal by name. Deleting an entry therefore has to delete a
 * test with it.
 */

const fixturesDirectory = path.join(import.meta.dirname, "../fixtures");
const fixtureNames: ReadonlySet<string> = new Set(readdirSync(fixturesDirectory).filter((name) => name.endsWith(".ts")));

/**
 * The fixture family a supported builtin is covered by: `array-runtime-at.ts`, or a fixture that
 * narrows one shape of it such as `array-runtime-map-callback.ts`. The convention predates the
 * table — 138 of the fixtures already followed it — so the test reads it rather than imposing it.
 * It does not try to read the other direction: `array-runtime-map-unsupported-callback.ts` is a
 * *passing* program whose callback is not inlined, so a filename cannot say whether a fixture
 * asserts support or a rejection.
 */
function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function fixtureFamily(entry: { readonly owner: string; readonly name: string; readonly fixture?: string }): string {
  return `${entry.owner}-runtime-${entry.fixture ?? kebab(entry.name)}`;
}

function plannedFormFixtureId(fixture: string, formIds: readonly string[]): string | undefined {
  if (!fixture.startsWith("form-planned-") || !fixture.endsWith(".ts")) {
    return undefined;
  }
  const stem = fixture.slice("form-planned-".length, -".ts".length);
  if (formIds.includes(stem)) {
    return stem;
  }
  // The longest known id owns a variant, so a shorter id cannot claim its fixtures.
  let id: string | undefined;
  for (const candidate of formIds) {
    if (stem.startsWith(`${candidate}-`) && (id === undefined || candidate.length > id.length)) {
      id = candidate;
    }
  }
  if (id === undefined || stem.length <= id.length + 1) {
    return undefined;
  }
  return id;
}

const { builtins, forms } = supportManifest();

describe("support manifest", () => {
  test("derives one entry per declared builtin, keyed by its id", () => {
    const tables = [
      arrayBuiltinSupport,
      objectBuiltinSupport,
      stringBuiltinSupport,
      numberBuiltinSupport,
      numberGlobalBuiltinSupport,
      mathBuiltinSupport,
      collectionBuiltinSupport,
      jsonBuiltinSupport,
      regexpBuiltinSupport,
      dateBuiltinSupport,
      functionBuiltinSupport,
      errorBuiltinSupport,
      iteratorBuiltinSupport
    ] as const;
    const declared = tables.reduce((total, table) => total + Object.keys(table).length, 0);
    expect(builtins.length).toBe(declared);
    expect(new Set(builtins.map((entry) => entry.id)).size).toBe(builtins.length);
  });

  test("lists every owner the tables cover", () => {
    const owners = [...new Set(builtins.map((entry) => entry.owner))].toSorted();
    expect(owners).toEqual([
      "array",
      "collection",
      "date",
      "error",
      "function",
      "iterator",
      "json",
      "math",
      "number",
      "object",
      "regexp",
      "string"
    ]);
  });

  test("names every entry with the owner it belongs to", () => {
    // The id need not be `<owner>.<name>`: the numeric globals carry `globalIsNaN` so they do not
    // collide with the `Number.isNaN` static of the same name. What must hold is that the id says
    // which owner it came from, and that it is unique, which the first test checks.
    for (const entry of builtins) {
      expect(entry.id.startsWith(`${entry.owner}.`)).toBe(true);
    }
  });

  test("every supported builtin added with a table is compared against Node", () => {
    // The manifest claiming a builtin works is a claim about output, so the evidence has to be an
    // output comparison. `oracleFixtures` is that list, and it moved into `oracle.ts` for this
    // assertion to be possible at all.
    //
    // This covers the owners whose tables carry the entries added after the array table, and only
    // those. Most of the older fixtures are deliberately not Node-equivalent — `array-runtime-
    // find-index.ts` calls `findIndex()` with no callback, which throws in Node, and exists to pin a
    // refusal rather than a result — so demanding oracle coverage for every entry would be asking
    // for a match the compiler does not claim. Those owners' fixtures are checked by the tests that
    // assert them, and an entry that is genuinely divergent is a `"stubbed"` entry with the
    // divergence written down rather than a `"supported"` one.
    const ownersWithNodeCheckedFixtures = new Set(["collection", "json", "regexp", "error", "iterator"]);
    const missing = builtins
      .filter((entry) => entry.state === "supported")
      .filter((entry) => ownersWithNodeCheckedFixtures.has(entry.owner))
      .filter((entry) => !oracleFixtures.includes(`${fixtureFamily(entry)}.ts`))
      .map((entry) => entry.id);
    expect(missing).toEqual([]);
  });

  test("every supported builtin has a fixture that runs", () => {
    const supported = builtins.filter((entry) => entry.state === "supported");
    const covered = (entry: (typeof supported)[number]): boolean => {
      const family = fixtureFamily(entry);
      return [...fixtureNames].some((fixture) => fixture === `${family}.ts` || fixture.startsWith(`${family}-`));
    };
    const missing = supported
      .filter((entry) => !covered(entry))
      .map((entry) => `${entry.id} (expected a ${fixtureFamily(entry)} fixture)`);
    expect(missing).toEqual([]);
  });
});

describe("stubbed builtins", () => {
  const stubbed = builtins.filter((entry) => entry.state === "stubbed");

  test("every one names what it returns instead", () => {
    // A stub lowers, so no diagnostic fires for it. The reason is the only place the user or the
    // next reader finds out what it actually returns, so a stub without one is an undocumented
    // wrong answer.
    for (const entry of stubbed) {
      expect(entry.reason, `${entry.id} is stubbed but does not say what it returns instead`).toBeDefined();
    }
  });
});

describe("planned builtins", () => {
  const planned = builtins.filter((entry) => entry.state === "planned");

  test("there is at least one, or the state is dead weight", () => {
    expect(planned.length).toBeGreaterThan(0);
  });

  test("every entry that claims a narrow reason gives one that is not a placeholder", () => {
    for (const entry of builtins) {
      if (entry.reason === undefined) {
        continue;
      }
      expect(entry.reason.length).toBeGreaterThan(0);
    }
  });

  test.each(planned.map((entry) => [entry.id, entry] as const))("%s refuses by name", async (_id, entry) => {
    // A `"planned"` entry's fixture is `builtin-planned-<owner>-<name>`, stated by the table for the
    // same reason the supported one is: a name that is an acronym has no mechanical kebab spelling.
    const stem = entry.fixture ?? kebab(entry.name);
    const fixture = `builtin-planned-${entry.owner}-${stem}.ts`;
    await expectUnsupportedMessage(fixture, `${builtinDisplay(entry)} is a known builtin`);
  }, 60_000);
});

describe("erasure forms", () => {
  const admitted = forms.filter((form) => form.state === "admitted");
  const planned = forms.filter((form) => form.state === "planned");
  const plannedIds = planned.map((form) => form.id);

  test.each(["", "async "])("erases %soverload signatures before checking runtime forms", (modifier) => {
    const source = ts.createSourceFile(
      "overload.ts",
      `declare function print(value: unknown): void;
       class C { ${modifier}m(): void; m(): void { print(1); } }
       new C().m();`,
      ts.ScriptTarget.Latest,
      true
    );
    const result = lowerToJsIr(source.fileName, [source]);
    expect(result.diagnostics).toEqual([]);
  });

  test.each([
    "constructor(@d value: number) { print(value); }",
    "method(@d value: number) { print(value); }",
    "static method(@d value: number) { print(value); }",
    "set value(@d value: number) { print(value); }"
  ])("refuses legacy parameter decorators on %s", (member) => {
    const source = ts.createSourceFile(
      "parameter-decorator.ts",
      `declare function print(value: unknown): void;
       declare function d(...args: unknown[]): void;
       class C { ${member} }`,
      ts.ScriptTarget.Latest,
      true
    );
    const result = lowerToJsIr(source.fileName, [source]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      "decorator on a class or class member is not supported yet [support: decorator]"
    ]);
  });

  test("every one has a unique id and a syntax to search for", () => {
    // The id is what a diagnostic would quote and what a fixture is keyed on, so a duplicate would
    // let one form's fixture stand in for another's.
    expect(new Set(forms.map((form) => form.id)).size).toBe(forms.length);
    for (const form of forms) {
      expect(form.syntax, `${form.id} states no syntax`).toBeDefined();
    }
  });

  test("there is at least one of each, or a state is dead weight", () => {
    expect(admitted.length).toBeGreaterThan(0);
    expect(planned.length).toBeGreaterThan(0);
  });

  test("every planned form says why, and admits something specific", () => {
    // "Not implemented" is what the compiler already says everywhere; the value of the list is a
    // reason that names the shape and where the work is.
    for (const form of planned) {
      expect(form.reason, `${form.id} is planned without a reason`).toBeDefined();
      expect(form.reason).not.toMatch(/^not (yet )?implemented$/i);
    }
  });

  /**
   * The forms the Node oracle cannot check, because Node cannot run the fixture at all.
   *
   * `accessor` is a stage-3 proposal keyword and Node 22's type stripper rejects it with a
   * `SyntaxError` before executing anything, so there is no Node output to compare. Its native
   * output is asserted in `core.test.ts` instead. The set is stated here rather than inferred from a
   * filename so that adding an admitted form cannot silently skip both checks.
   */
  // Node 22's type stripper rejects all four of these before running anything, because none of them is
  // valid JavaScript and each needs transformation rather than erasure: `accessor` is not a keyword, and
  // an enum, a namespace and a parameter property are all constructs. Each is asserted by its native
  // value in `core.test.ts` instead, which is what backs the manifest's claim that the form works — a
  // form listed here that nothing else checked would only be claiming its own existence.
  const notRunnableUnderNode = new Set([
    "accessor-keyword",
    "enum-declaration",
    "namespace-declaration",
    "parameter-property"
  ]);

  test.each(admitted.map((form) => [form.id, form] as const))(
    "%s is checked somewhere real, not merely present as a file",
    (_id, form) => {
      // Existence is not evidence. Either the oracle compares the fixture's native output with
      // Node's, or Node cannot run it and another test asserts the value — and the manifest still
      // says the form works.
      const fixture = `form-admitted-${form.id}.ts`;
      expect(fixtureNames.has(fixture), `expected ${fixture} to exist`).toBe(true);
      if (notRunnableUnderNode.has(form.id)) {
        expect(oracleFixtures, `${fixture} should not be in the oracle: Node cannot parse it`).not.toContain(fixture);
        return;
      }
      expect(oracleFixtures, `${fixture} is not compared against Node`).toContain(fixture);
    },
    60_000
  );

  test("planned fixtures and manifest entries cover each other", () => {
    for (const form of planned) {
      expect(fixtureNames.has(`form-planned-${form.id}.ts`)).toBe(true);
    }
    for (const fixture of fixtureNames) {
      if (!fixture.startsWith("form-planned-")) {
        continue;
      }
      const matches = planned.filter((form) => form.id === plannedFormFixtureId(fixture, plannedIds));
      expect(matches.length, `${fixture} must name one planned form`).toBe(1);
    }
  });

  test.each([
    ["form-planned-async.ts", "async"],
    ["form-planned-async-function.ts", "async-function"],
    ["form-planned-async-function-arrow.ts", "async-function"],
    ["form-planned-decorator-legacy.ts", "decorator-legacy"],
    ["form-planned-decorator-legacy-member.ts", "decorator-legacy"],
    ["form-planned-async-.ts", undefined],
    ["form-planned-async-function-.ts", undefined],
    ["form-planned-unknown.ts", undefined]
  ] as const)("%s resolves to one form even when ids share prefixes", (fixture, expected) => {
    expect(plannedFormFixtureId(fixture, ["async", "async-function", "decorator", "decorator-legacy"])).toBe(expected);
  });

  test.each(planned.flatMap((form) => [...fixtureNames]
    .filter((fixture) => form.id === plannedFormFixtureId(fixture, plannedIds))
    .map((fixture) => [fixture, form] as const)))(
    "%s has a fixture the compiler refuses today",
    async (fixture, form) => {
      await expectUnsupportedMessage(
        fixture,
        `${form.form} is not supported yet [support: ${form.id}]`
      );
    },
    60_000
  );
});
