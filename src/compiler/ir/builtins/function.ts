import {
  type BuiltinSupport,
  builtinEntryFor,
  knownBuiltinMessage
} from "./support.js";

/**
What this build does with `Function.prototype`.

Nothing is lowered here. The runtime has no reflection over its own function objects, so every member
is `"planned"` and a program that uses one is told which builtin is missing rather than being handed
the receiver and a `TypeError` at run time.
 */

/** The Function members this build knows about, keyed by the name they have in source. */
type FunctionBuiltin =
  | "apply"
  | "bind"
  | "call"
  | "length"
  | "name"
  | "toString";

/** The members, keyed by name so a name cannot be stated twice. */
export const functionBuiltinSupport: BuiltinSupport<"function", FunctionBuiltin> = {
  "apply": { arity: { from: 0, to: 8 }, state: "supported", id: "function.apply" },
  "bind": { arity: { from: 0, to: 8 }, state: "supported", id: "function.bind" },
  "call": { arity: { from: 0, to: 8 }, state: "supported", id: "function.call" },
  "length": { arity: 0, state: "supported", id: "function.length" },
  "name": { arity: 0, state: "supported", id: "function.name" },
  "toString": { arity: 0, state: "supported", id: "function.toString" },
};


/**
 * The diagnostic for a `Function` member this build has not written, or `undefined` if the name
 * is not one of them or the compiler has a lowering for it.
 */
export function plannedFunctionBuiltinMessage(name: string): string | undefined {
  const entry = builtinEntryFor(functionBuiltinSupport, "function", name);
  if (entry === undefined || entry.state === "supported") {
    return undefined;
  }
  return knownBuiltinMessage(entry);
}
