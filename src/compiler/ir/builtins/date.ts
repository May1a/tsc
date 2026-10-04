import {
  type BuiltinEntry,
  type BuiltinSupport,
  builtinEntryFor,
  builtinFor,
  knownBuiltinMessage
} from "./support.js";

/**
What this build does with `Date`.

Only `now` is here. `Date.prototype`'s members are deliberately absent, and the reason is that no
date value can exist: `new Date(0)` does not lower, so a program with a date never reaches the member
call and the diagnostic it gets is about the `const`, naming no builtin at all. A table entry whose
message can never fire would be a claim the compiler cannot keep, and it is worse than silence because
the manifest would read as though `toISOString` were merely unwritten.

So `new Date(...)` is recorded where the truth is: as an erasure form this build does not admit, in
the manifest's `forms` half, not as eleven prototype members that cannot be reached.
 */

/** The Date members this build knows about, keyed by the name they have in source. */
export type DateBuiltin =
  | "now";

/** The members, keyed by name so a name cannot be stated twice. */
export const dateBuiltinSupport: BuiltinSupport<"date", DateBuiltin> = {
  "now": { arity: 0, state: "stubbed", id: "date.now", placement: "static", fixture: "now", reason: "lowered to 0, which is not the current time" },
};

/** The `Date` member with this name, or `undefined` if the name is not one of them. */
export function dateBuiltinFor(name: string): BuiltinEntry<"date"> | undefined {
  return builtinFor(dateBuiltinSupport, "date", name);
}

/**
 * The diagnostic for a `Date` member this build has not written, or `undefined` if the name
 * is not one of them or the compiler has a lowering for it.
 */
export function plannedDateBuiltinMessage(name: string): string | undefined {
  const entry = builtinEntryFor(dateBuiltinSupport, "date", name);
  if (entry === undefined || entry.state === "supported") {
    return undefined;
  }
  return knownBuiltinMessage(entry);
}
