import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { arrayBuiltinSupport, builtinDisplay, objectBuiltinSupport, supportManifest } from "../../src/compiler/ir/builtins/index.js";
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

function fixtureFamily(owner: string, name: string): string {
  return `${owner}-runtime-${kebab(name)}`;
}

const { builtins } = supportManifest();

describe("support manifest", () => {
  test("derives one entry per declared builtin, keyed by its id", () => {
    const declared = Object.keys(arrayBuiltinSupport).length + Object.keys(objectBuiltinSupport).length;
    expect(builtins.length).toBe(declared);
    expect(new Set(builtins.map((entry) => entry.id)).size).toBe(builtins.length);
  });

  test("lists every owner the tables cover", () => {
    const owners = [...new Set(builtins.map((entry) => entry.owner))].toSorted();
    expect(owners).toEqual(["array", "object"]);
  });

  test("names every entry with the owner and name it sits under", () => {
    for (const entry of builtins) {
      expect(entry.id).toBe(`${entry.owner}.${entry.name}`);
    }
  });

  test("every supported builtin has a fixture that runs", () => {
    const supported = builtins.filter((entry) => entry.state === "supported");
    const covered = (entry: (typeof supported)[number]): boolean => {
      const family = fixtureFamily(entry.owner, entry.name);
      return [...fixtureNames].some((fixture) => fixture === `${family}.ts` || fixture.startsWith(`${family}-`));
    };
    const missing = supported
      .filter((entry) => !covered(entry))
      .map((entry) => `${entry.id} (expected a ${fixtureFamily(entry.owner, entry.name)} fixture)`);
    expect(missing).toEqual([]);
  });
});

describe("planned builtins", () => {
  const planned = builtins.filter((entry) => entry.state === "planned");

  test("there is at least one, or the state is dead weight", () => {
    expect(planned.length).toBeGreaterThan(0);
  });

  test("every planned builtin that claims a narrow reason gets one that is not a placeholder", () => {
    for (const entry of planned) {
      if (entry.reason === undefined) {
        continue;
      }
      expect(entry.reason.length).toBeGreaterThan(0);
    }
  });

  test.each(planned.map((entry) => [entry.id, entry] as const))("%s refuses by name", async (_id, entry) => {
    await expectUnsupportedMessage(`builtin-planned-${entry.owner}-${kebab(entry.name)}.ts`, `${builtinDisplay(entry)} is a known builtin`);
  }, 60_000);
});
