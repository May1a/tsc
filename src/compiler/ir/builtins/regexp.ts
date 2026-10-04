import {
  type BuiltinEntry,
  type BuiltinSupport,
  builtinEntryFor,
  builtinFor,
  knownBuiltinMessage
} from "./support.js";

/**
What this build does with `RegExp`.

A regular expression lowers to a runtime value carrying its source, its flags and `lastIndex`, so the
three members that read those are supported, and `test` and `exec` run it. `toString` is not written.
 */

/** The RegExp members this build knows about, keyed by the name they have in source. */
export type RegexpBuiltin =
  | "exec"
  | "flags"
  | "lastIndex"
  | "source"
  | "test"
  | "toString";

/** The members, keyed by name so a name cannot be stated twice. */
export const regexpBuiltinSupport: BuiltinSupport<"regexp", RegexpBuiltin> = {
  "exec": { arity: 1, state: "supported", id: "regexp.exec" },
  "flags": { arity: 0, state: "supported", id: "regexp.flags" },
  "lastIndex": { arity: 0, state: "supported", id: "regexp.lastIndex" },
  "source": { arity: 0, state: "supported", id: "regexp.source" },
  "test": { arity: 1, state: "supported", id: "regexp.test" },
  "toString": { arity: 0, state: "planned", id: "regexp.toString" },
};

/** The `RegExp` member with this name, or `undefined` if the name is not one of them. */
export function regexpBuiltinFor(name: string): BuiltinEntry<"regexp"> | undefined {
  return builtinFor(regexpBuiltinSupport, "regexp", name);
}

/**
 * The diagnostic for a `RegExp` member this build has not written, or `undefined` if the name
 * is not one of them or the compiler has a lowering for it.
 */
export function plannedRegexpBuiltinMessage(name: string): string | undefined {
  const entry = builtinEntryFor(regexpBuiltinSupport, "regexp", name);
  if (entry === undefined || entry.state === "supported") {
    return undefined;
  }
  return knownBuiltinMessage(entry);
}
