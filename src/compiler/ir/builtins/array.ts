import { type BuiltinEntry, type BuiltinSupport, builtinEntryFor, builtinFor, knownBuiltinMessage } from "./support.js";

/**
 * What this build does with `Array.prototype` and `Array`.
 *
 * The two states are the point of the table. `"supported"` names a method the compiler lowers, in
 * the shapes it lowers it — every entry says which. `"planned"` names a method the compiler
 * recognizes as part of the array API and has not written; a program calling one gets
 * `Array.prototype.with is a known builtin that this build does not implement yet` and the
 * manifest id to look it up by, instead of the same "unrecognized call target" a typo produces.
 *
 * `ArraySupport` is a `Record` over `ArrayBuiltin`, so a name cannot be in this table without an
 * entry describing it, and a name that is a member of the array API but missing from the union
 * cannot be declared at all. Adding a method to the union without an entry here does not compile.
 *
 * `toString` is deliberately absent. It is not an array member the compiler implements through an
 * array lowering: `arr.toString()` goes through the generic object path, and a table entry claiming
 * the array support for it would be a claim about a lowering that does not exist.
 */

/** The `Array.prototype` and `Array` members this build knows about. */
export type ArrayBuiltin =
  | "at"
  | "concat"
  | "copyWithin"
  | "entries"
  | "every"
  | "fill"
  | "filter"
  | "find"
  | "findIndex"
  | "findLast"
  | "findLastIndex"
  | "flat"
  | "flatMap"
  | "forEach"
  | "from"
  | "group"
  | "includes"
  | "indexOf"
  | "join"
  | "keys"
  | "lastIndexOf"
  | "map"
  | "of"
  | "pop"
  | "push"
  | "reduce"
  | "reduceRight"
  | "reverse"
  | "shift"
  | "slice"
  | "some"
  | "sort"
  | "splice"
  | "toReversed"
  | "toSorted"
  | "toSpliced"
  | "unshift"
  | "values"
  | "with";

export const arrayBuiltinSupport: BuiltinSupport<"array", ArrayBuiltin> = {
  // Mutators. All of these lower on a runtime array in statement position.
  push: { arity: { from: 0, to: 8 }, state: "supported", id: "array.push" },
  pop: { arity: 0, state: "supported", id: "array.pop" },
  shift: { arity: 0, state: "supported", id: "array.shift" },
  unshift: { arity: { from: 0, to: 8 }, state: "supported", id: "array.unshift" },
  splice: { arity: { from: 0, to: 8 }, state: "supported", id: "array.splice" },
  fill: { arity: { from: 1, to: 3 }, state: "supported", id: "array.fill" },
  copyWithin: { arity: { from: 2, to: 3 }, state: "supported", id: "array.copyWithin" },
  reverse: { arity: 0, state: "supported", id: "array.reverse" },

  // Readers that lower in value position.
  slice: { arity: { from: 0, to: 2 }, state: "supported", id: "array.slice" },
  concat: { arity: { from: 0, to: 8 }, state: "supported", id: "array.concat" },
  flat: { arity: { from: 0, to: 1 }, state: "supported", id: "array.flat" },
  at: { arity: 1, state: "supported", id: "array.at" },
  includes: { arity: 1, state: "supported", id: "array.includes" },
  indexOf: { arity: { from: 1, to: 2 }, state: "supported", id: "array.indexOf" },
  lastIndexOf: { arity: { from: 1, to: 2 }, state: "supported", id: "array.lastIndexOf" },
  join: { arity: 1, state: "supported", id: "array.join" },

  // Callback forms. These lower only with an inline callback; a named function of the right shape
  // is lowered through the function-object path and anything else is rejected.
  map: { arity: { from: 1, to: 2 }, state: "supported", id: "array.map" },
  flatMap: { arity: { from: 1, to: 2 }, state: "supported", id: "array.flatMap" },
  filter: { arity: { from: 1, to: 2 }, state: "supported", id: "array.filter" },
  // Also has the same zero-argument slice as `every`/`some`, but its callback form lowers
  // correctly, so the table counts it as supported and the slice is not the entry.
  findIndex: { arity: 1, state: "supported", id: "array.findIndex" },
  find: { arity: 1, state: "supported", id: "array.find" },
  forEach: { arity: { from: 1, to: 2 }, state: "supported", id: "array.forEach" },

  reduce: { arity: { from: 1, to: 2 }, state: "supported", id: "array.reduce" },
  reduceRight: { arity: { from: 1, to: 2 }, state: "supported", id: "array.reduceRight" },
  sort: { arity: { from: 0, to: 1 }, state: "supported", id: "array.sort" },

  // Statics.
  from: { arity: { from: 1, to: 3 }, state: "supported", id: "array.from", placement: "static" },
  of: { arity: { from: 0, to: 8 }, state: "supported", id: "array.of", placement: "static" },

  // `every` and `some` lower only their zero-argument slice, which returns "is the array empty" and
  // `false`. In Node that form throws, so the slice is a non-JavaScript extension rather than a
  // wrong answer, and `runtime.test.ts` asserts its output; the table must not count it as support
  // all the same, because the callback form a user actually writes is not lowered at all.
  every: {
    arity: 1,
    state: "planned",
    id: "array.every",
    reason: "only the zero-argument slice is lowered; the callback form is not"
  },
  some: {
    arity: 1,
    state: "planned",
    id: "array.some",
    reason: "only the zero-argument slice is lowered; the callback form is not"
  },

  // Members of the array API this build has not written. Calling one of these says so by name.
  with: { arity: 2, state: "planned", id: "array.with" },
  findLast: { arity: 1, state: "planned", id: "array.findLast" },
  findLastIndex: { arity: 1, state: "planned", id: "array.findLastIndex" },
  toSorted: { arity: 1, state: "planned", id: "array.toSorted" },
  toReversed: { arity: 0, state: "planned", id: "array.toReversed" },
  toSpliced: { arity: { from: 2, to: 3 }, state: "planned", id: "array.toSpliced" },
  group: { arity: 1, state: "planned", id: "array.group" },
  entries: { arity: 0, state: "planned", id: "array.entries" },
  keys: { arity: 0, state: "planned", id: "array.keys" },
  values: { arity: 0, state: "planned", id: "array.values" }
};

/** The `Array` member with this name, or `undefined` if the name is not one of them. */
export function arrayBuiltinFor(name: string): BuiltinEntry<"array"> | undefined {
  return builtinFor(arrayBuiltinSupport, "array", name);
}

/**
 * The diagnostic for an `Array` member this build has not written, or `undefined` if the name is
 * not a member of `Array` or the compiler has a lowering for it.
 */
export function plannedArrayBuiltinMessage(name: string): string | undefined {
  const entry = builtinEntryFor(arrayBuiltinSupport, "array", name);
  if (entry === undefined || entry.state === "supported") {
    return undefined;
  }
  return knownBuiltinMessage(entry);
}
