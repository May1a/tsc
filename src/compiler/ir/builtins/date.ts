import {
  type BuiltinSupport,
  builtinEntryFor,
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
type DateBuiltin =
  | "now"
  | "getTime"
  | "valueOf"
  | "toISOString"
  | "toString"
  | "getFullYear";

/** The members, keyed by name so a name cannot be stated twice. */
export const dateBuiltinSupport: BuiltinSupport<"date", DateBuiltin> = {
  "now": { arity: 0, state: "supported", id: "date.now", placement: "static", fixture: "now" },
  "getTime": { arity: 0, state: "supported", id: "date.getTime" },
  "valueOf": { arity: 0, state: "supported", id: "date.valueOf" },
  "toISOString": { arity: 0, state: "supported", id: "date.toISOString", fixture: "to-iso-string" },
  "toString": { arity: 0, state: "supported", id: "date.toString" },
  "getFullYear": { arity: 0, state: "planned", id: "date.getFullYear" },
};


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
