import {
  type BuiltinSupport,
  builtinEntryFor,
  knownBuiltinMessage
} from "./support.js";

/**
What this build does with the iterator protocol.

`for...of` over an array, a string, a `Map`, a `Set`, or a user object with a `[Symbol.iterator]`
method all lower, so the protocol itself is supported. The array's own `entries`, `keys` and `values`
are separate members and are recorded as `"planned"` in the array table, not here.
 */

/** The Symbol members this build knows about, keyed by the name they have in source. */
type IteratorBuiltin =
  | "Symbol.iterator";

/** The members, keyed by name so a name cannot be stated twice. */
export const iteratorBuiltinSupport: BuiltinSupport<"iterator", IteratorBuiltin> = {
  "Symbol.iterator": { arity: 0, state: "supported", id: "iterator.Symbol.iterator", placement: "static", fixture: "symbol-iterator", reason: "`for...of` over an array, string, Map, Set or a user object with the method" },
};


/**
 * The diagnostic for a `Symbol` member this build has not written, or `undefined` if the name
 * is not one of them or the compiler has a lowering for it.
 */
export function plannedIteratorBuiltinMessage(name: string): string | undefined {
  const entry = builtinEntryFor(iteratorBuiltinSupport, "iterator", name);
  if (entry === undefined || entry.state === "supported") {
    return undefined;
  }
  return knownBuiltinMessage(entry);
}
