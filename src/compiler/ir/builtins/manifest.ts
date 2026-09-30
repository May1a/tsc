import { arrayBuiltinSupport } from "./array.js";
import { type BuiltinEntry, type SupportManifest, builtinEntries } from "./support.js";

/**
 * Every builtin the compiler knows about, derived from the support tables.
 *
 * This is derived, never written by hand. A manifest written by hand is a list that drifts the
 * first time a builtin is added and nobody updates it, which is worse than no manifest at all
 * because it looks authoritative. Here a builtin cannot be in a table and missing from the
 * manifest, or in the manifest and missing from a table.
 */
export function supportManifest(): SupportManifest {
  return { builtins: [...builtinEntries(arrayBuiltinSupport, "array")] };
}

/** The manifest ids of every builtin this build has not written, for the tests to cross-check. */
export function plannedBuiltinIds(): readonly string[] {
  return supportManifest().builtins.filter((entry) => entry.state === "planned").map((entry) => entry.id);
}

/** The manifest entry with this id, or `undefined` if no table declares one. */
export function builtinById(id: string): BuiltinEntry | undefined {
  return supportManifest().builtins.find((entry) => entry.id === id);
}
