import {
  type BuiltinEntry,
  type BuiltinSupport,
  builtinEntryFor,
  builtinFor,
  knownBuiltinMessage
} from "./support.js";

/**
What this build does with `Map` and `Set`.

The two share one table because the runtime has one collection object and a tag on it decides which
operations apply, so the lowering does too, and the names overlap: `has`, `delete` and `size` mean
the same thing on both. Each entry's `ownerLabel` says which object a diagnostic is about, because
`Collection` is not a thing and `Collection.prototype.size` names nothing a user wrote.

`for (const entry of map)` is supported through the collection itself rather than through
`entries()`, and `entries()`, `keys()` and `values()` are not written.
 */

/** The Map members this build knows about, keyed by the name they have in source. */
export type CollectionBuiltin =
  | "add"
  | "clear"
  | "delete"
  | "entries"
  | "forEach"
  | "get"
  | "has"
  | "keys"
  | "set"
  | "size"
  | "values";

/** The members, keyed by name so a name cannot be stated twice. */
export const collectionBuiltinSupport: BuiltinSupport<"collection", CollectionBuiltin> = {
  "add": { arity: 1, state: "supported", id: "collection.add", ownerLabel: "Set" },
  "clear": { arity: 0, state: "planned", id: "collection.clear", ownerLabel: "Map / Set" },
  "delete": { arity: 1, state: "supported", id: "collection.delete", ownerLabel: "Map / Set" },
  "entries": { arity: 0, state: "planned", id: "collection.entries", ownerLabel: "Map / Set" },
  "forEach": { arity: 1, state: "planned", id: "collection.forEach", ownerLabel: "Map / Set" },
  "get": { arity: 1, state: "supported", id: "collection.get", ownerLabel: "Map" },
  "has": { arity: 1, state: "supported", id: "collection.has", ownerLabel: "Map / Set" },
  "keys": { arity: 0, state: "planned", id: "collection.keys", ownerLabel: "Map / Set" },
  "set": { arity: { from: 1, to: 2 }, state: "supported", id: "collection.set", ownerLabel: "Map" },
  "size": { arity: 0, state: "supported", id: "collection.size", ownerLabel: "Map / Set" },
  "values": { arity: 0, state: "planned", id: "collection.values", ownerLabel: "Map / Set" },
};

/** The `Map` member with this name, or `undefined` if the name is not one of them. */
export function collectionBuiltinFor(name: string): BuiltinEntry<"collection"> | undefined {
  return builtinFor(collectionBuiltinSupport, "collection", name);
}

/**
 * The diagnostic for a `Map` member this build has not written, or `undefined` if the name
 * is not one of them or the compiler has a lowering for it.
 */
export function plannedCollectionBuiltinMessage(name: string): string | undefined {
  const entry = builtinEntryFor(collectionBuiltinSupport, "collection", name);
  if (entry === undefined || entry.state === "supported") {
    return undefined;
  }
  return knownBuiltinMessage(entry);
}
