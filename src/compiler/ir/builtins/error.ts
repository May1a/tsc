import {
  type BuiltinEntry,
  type BuiltinSupport,
  builtinEntryFor,
  builtinFor,
  knownBuiltinMessage
} from "./support.js";

/**
What this build does with `Error.prototype`.

An error lowers to a runtime object carrying its name and message, and `toString` is composed from
them, so the three are supported and agree with Node. `cause` is supported for the narrower reason
that the runtime error object has no `cause` field at all, so reading one yields `undefined` — which
is JavaScript's answer when the error was constructed without options. Constructing an error *with*
options is not supported, so the two halves are not in conflict: a program can read a `cause` but
cannot set one. `stack` is not supported at all.
 */

/** The Error members this build knows about, keyed by the name they have in source. */
export type ErrorBuiltin =
  | "cause"
  | "message"
  | "name"
  | "stack"
  | "toString";

/** The members, keyed by name so a name cannot be stated twice. */
export const errorBuiltinSupport: BuiltinSupport<"error", ErrorBuiltin> = {
  "cause": {
    arity: 1,
    state: "supported",
    id: "error.cause",
    reason: "the runtime error object carries no `cause`, so a read of it is `undefined` — which is what JavaScript returns when the error was constructed without options",
    fixture: "cause"
  },
  "message": { arity: 0, state: "supported", id: "error.message" },
  "name": { arity: 0, state: "supported", id: "error.name" },
  "stack": { arity: 0, state: "planned", id: "error.stack" },
  "toString": { arity: 0, state: "supported", id: "error.toString" },
};

/** The `Error` member with this name, or `undefined` if the name is not one of them. */
export function errorBuiltinFor(name: string): BuiltinEntry<"error"> | undefined {
  return builtinFor(errorBuiltinSupport, "error", name);
}

/**
 * The diagnostic for a `Error` member this build has not written, or `undefined` if the name
 * is not one of them or the compiler has a lowering for it.
 */
export function plannedErrorBuiltinMessage(name: string): string | undefined {
  const entry = builtinEntryFor(errorBuiltinSupport, "error", name);
  if (entry === undefined || entry.state === "supported") {
    return undefined;
  }
  return knownBuiltinMessage(entry);
}
