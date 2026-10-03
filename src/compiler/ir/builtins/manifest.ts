import { arrayBuiltinSupport } from "./array.js";
import { objectBuiltinSupport } from "./object.js";
import { mathBuiltinSupport } from "./math.js";
import { numberBuiltinSupport, numberGlobalBuiltinSupport } from "./number.js";
import { stringBuiltinSupport } from "./string.js";
import {
  type BuiltinDeclaration,
  type BuiltinEntry,
  type BuiltinOwner,
  type SupportManifest,
  builtinEntries
} from "./support.js";

/**
 * Every builtin the compiler knows about, derived from the support tables.
 *
 * This is derived, never written by hand. A manifest written by hand is a list that drifts the
 * first time a builtin is added and nobody updates it, which is worse than no manifest at all
 * because it looks authoritative. Here a builtin cannot be in a table and missing from the
 * manifest, or in the manifest and missing from a table.
 */
interface OwnerTable {
  readonly owner: BuiltinOwner;
  readonly support: Readonly<Record<string, BuiltinDeclaration<BuiltinOwner>>>;
}

/**
 * Every owner's table, in the order the manifest lists them. Adding an owner is one line here and
 * the manifest picks it up; the manifest test asserts the count so a table cannot be left out.
 */
const ownerTables: readonly OwnerTable[] = [
  { owner: "array", support: arrayBuiltinSupport },
  { owner: "object", support: objectBuiltinSupport },
  { owner: "string", support: stringBuiltinSupport },
  { owner: "number", support: numberBuiltinSupport },
  { owner: "number", support: numberGlobalBuiltinSupport },
  { owner: "math", support: mathBuiltinSupport }
];

export function supportManifest(): SupportManifest {
  return { builtins: ownerTables.flatMap((table) => builtinEntries(table.support, table.owner)) };
}

/** The manifest ids of every builtin this build has not written, for the tests to cross-check. */
export function plannedBuiltinIds(): readonly string[] {
  return supportManifest().builtins.filter((entry) => entry.state === "planned").map((entry) => entry.id);
}

/** The manifest ids of every builtin this build lowers to something JavaScript does not compute. */
export function stubbedBuiltinIds(): readonly string[] {
  return supportManifest().builtins.filter((entry) => entry.state === "stubbed").map((entry) => entry.id);
}

/** The manifest entry with this id, or `undefined` if no table declares one. */
export function builtinById(id: string): BuiltinEntry | undefined {
  return supportManifest().builtins.find((entry) => entry.id === id);
}
