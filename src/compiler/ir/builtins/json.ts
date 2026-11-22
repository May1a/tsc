import {
  type BuiltinSupport,
  builtinEntryFor,
  knownBuiltinMessage
} from "./support.js";

/**
What this build does with `JSON`.

Both members are lowerable only in the shapes the runtime has: `parse` takes a string argument and an
optional reviver that itself lowers to a runtime value, and `stringify` takes a replacer that is a
string-array binding and an indent that is a numeric literal between 0 and 10. Anything else is
refused with that reason, which is more useful than the table's.
 */

/** The JSON members this build knows about, keyed by the name they have in source. */
type JsonBuiltin =
  | "parse"
  | "stringify";

/** The members, keyed by name so a name cannot be stated twice. */
export const jsonBuiltinSupport: BuiltinSupport<"json", JsonBuiltin> = {
  "parse": { arity: { from: 1, to: 2 }, state: "supported", id: "json.parse", fixture: "parse", reason: "the argument must be a string expression and the optional reviver must itself lower to a runtime value" },
  "stringify": { arity: { from: 1, to: 3 }, state: "supported", id: "json.stringify", fixture: "stringify", reason: "the replacer must be a string-array binding and the indent a numeric literal between 0 and 10" },
};


/**
 * The diagnostic for a `JSON` member this build has not written, or `undefined` if the name
 * is not one of them or the compiler has a lowering for it.
 */
export function plannedJsonBuiltinMessage(name: string): string | undefined {
  const entry = builtinEntryFor(jsonBuiltinSupport, "json", name);
  if (entry === undefined || entry.state === "supported") {
    return undefined;
  }
  return knownBuiltinMessage(entry);
}
