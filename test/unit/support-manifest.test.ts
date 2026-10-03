import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  arrayBuiltinSupport,
  builtinDisplay,
  mathBuiltinSupport,
  numberBuiltinSupport,
  numberGlobalBuiltinSupport,
  objectBuiltinSupport,
  stringBuiltinSupport,
  supportManifest
} from "../../src/compiler/ir/builtins/index.js";
import { expectUnsupportedMessage } from "../integration/helpers.js";

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

const { builtins } = supportManifest();

describe("support manifest", () => {
  test("derives one entry per declared builtin, keyed by its id", () => {
    const tables = [
      arrayBuiltinSupport,
      objectBuiltinSupport,
      stringBuiltinSupport,
      numberBuiltinSupport,
      numberGlobalBuiltinSupport,
      mathBuiltinSupport
    ] as const;
    const declared = tables.reduce((total, table) => total + Object.keys(table).length, 0);
    expect(builtins.length).toBe(declared);
    expect(new Set(builtins.map((entry) => entry.id)).size).toBe(builtins.length);
  });

  test("lists every owner the tables cover", () => {
    const owners = [...new Set(builtins.map((entry) => entry.owner))].toSorted();
    expect(owners).toEqual(["array", "math", "number", "object", "string"]);
  });

  test("names every entry with the owner it belongs to", () => {
    // The id need not be `<owner>.<name>`: the numeric globals carry `globalIsNaN` so they do not
    // collide with the `Number.isNaN` static of the same name. What must hold is that the id says
    // which owner it came from, and that it is unique, which the first test checks.
    for (const entry of builtins) {
      expect(entry.id.startsWith(`${entry.owner}.`)).toBe(true);
    }
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
