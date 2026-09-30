import { type BuiltinEntry, type BuiltinSupport, builtinEntryFor, builtinFor, knownBuiltinMessage } from "./support.js";

/**
 * What this build does with `Object` and `Object.prototype`.
 *
 * The two states are the point of the table. `"supported"` names a member the compiler lowers, in
 * the shapes it lowers it. `"planned"` names a member the compiler recognizes as part of the object
 * API and has not written, so a program calling one is told which builtin is missing rather than
 * being handed the receiver and a `TypeError` at run time.
 *
 * The prototype entries are narrower than they look. `hasOwnProperty` and `propertyIsEnumerable`
 * lower in the *condition* tier only, because that is where the runtime has the operations for
 * them; written as a statement they compile to a call on a function the runtime does not have.
 */

/** The `Object` and `Object.prototype` members this build knows about. */
export type ObjectBuiltin =
  | "assign"
  | "create"
  | "defineProperties"
  | "defineProperty"
  | "entries"
  | "freeze"
  | "fromEntries"
  | "getOwnPropertyDescriptor"
  | "getOwnPropertyDescriptors"
  | "getOwnPropertyNames"
  | "getOwnPropertySymbols"
  | "getPrototypeOf"
  | "groupBy"
  | "hasOwn"
  | "hasOwnProperty"
  | "is"
  | "isExtensible"
  | "isFrozen"
  | "isPrototypeOf"
  | "isSealed"
  | "keys"
  | "preventExtensions"
  | "propertyIsEnumerable"
  | "seal"
  | "setPrototypeOf"
  | "toString"
  | "valueOf"
  | "values";

export const objectBuiltinSupport: BuiltinSupport<"object", ObjectBuiltin> = {
  // Statics. Each is lowerable on a runtime object; several need a runtime-object argument.
  assign: { arity: { from: 1, to: 8 }, state: "supported", id: "object.assign", placement: "static" },
  create: { arity: 1, state: "supported", id: "object.create", placement: "static" },
  defineProperty: { arity: 3, state: "supported", id: "object.defineProperty", placement: "static" },
  defineProperties: { arity: 2, state: "supported", id: "object.defineProperties", placement: "static" },
  entries: { arity: 1, state: "supported", id: "object.entries", placement: "static" },
  freeze: { arity: 1, state: "supported", id: "object.freeze", placement: "static" },
  fromEntries: { arity: 1, state: "supported", id: "object.fromEntries", placement: "static" },
  getOwnPropertyDescriptor: { arity: 2, state: "supported", id: "object.getOwnPropertyDescriptor", placement: "static" },
  getOwnPropertyDescriptors: { arity: 1, state: "supported", id: "object.getOwnPropertyDescriptors", placement: "static" },
  getOwnPropertyNames: { arity: 1, state: "supported", id: "object.getOwnPropertyNames", placement: "static" },
  getPrototypeOf: { arity: 1, state: "supported", id: "object.getPrototypeOf", placement: "static" },
  hasOwn: { arity: 2, state: "supported", id: "object.hasOwn", placement: "static" },
  // The lowered slice is a numeric pair; a `NaN` operand is not in it.
  is: { arity: 2, state: "supported", id: "object.is", placement: "static" },
  isExtensible: { arity: 1, state: "supported", id: "object.isExtensible", placement: "static" },
  isFrozen: { arity: 1, state: "supported", id: "object.isFrozen", placement: "static" },
  isSealed: { arity: 1, state: "supported", id: "object.isSealed", placement: "static" },
  keys: { arity: 1, state: "supported", id: "object.keys", placement: "static" },
  preventExtensions: { arity: 1, state: "supported", id: "object.preventExtensions", placement: "static" },
  seal: { arity: 1, state: "supported", id: "object.seal", placement: "static" },
  setPrototypeOf: { arity: 2, state: "supported", id: "object.setPrototypeOf", placement: "static" },
  values: { arity: 1, state: "supported", id: "object.values", placement: "static" },

  // Lowered in the condition tier, where the runtime has the own-property and enumerability
  // operations. Written as a statement they are not lowered at all.
  hasOwnProperty: { arity: 1, state: "supported", id: "object.hasOwnProperty" },
  propertyIsEnumerable: { arity: 1, state: "supported", id: "object.propertyIsEnumerable" },

  // Members of the object API this build has not written.
  getOwnPropertySymbols: { arity: 1, state: "planned", id: "object.getOwnPropertySymbols", placement: "static" },
  groupBy: { arity: 2, state: "planned", id: "object.groupBy", placement: "static" },
  isPrototypeOf: {
    arity: 1,
    state: "planned",
    id: "object.isPrototypeOf",
    reason: "the runtime has no prototype-chain query to answer it with"
  },
  toString: {
    arity: 0,
    state: "planned",
    id: "object.toString",
    reason: "only the boxed-primitive receiver is lowered, and a plain object would have to return \"[object Object]\""
  },
  valueOf: {
    arity: 0,
    state: "planned",
    id: "object.valueOf",
    reason: "only the boxed-primitive receiver is lowered, and a plain object would have to return the object itself"
  }
};

/** The `Object` member with this name, or `undefined` if the name is not one of them. */
export function objectBuiltinFor(name: string): BuiltinEntry<"object"> | undefined {
  return builtinFor(objectBuiltinSupport, "object", name);
}

/**
 * The diagnostic for an `Object` member this build has not written, or `undefined` if the name is
 * not a member of `Object` or the compiler has a lowering for it.
 */
export function plannedObjectBuiltinMessage(name: string): string | undefined {
  const entry = builtinEntryFor(objectBuiltinSupport, "object", name);
  if (entry === undefined || entry.state === "supported") {
    return undefined;
  }
  return knownBuiltinMessage(entry);
}
