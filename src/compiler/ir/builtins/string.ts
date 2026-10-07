import { type BuiltinEntry, type BuiltinSupport, builtinEntryFor, builtinFor, knownBuiltinMessage } from "./support.js";

/**
 * What this build does with `String` and `String.prototype`.
 *
 * Several entries carry a `reason` because the compiler recognizes the member and lowers *a* slice
 * of it, which is narrower than the API. `localeCompare` is the clearest: the runtime has no locale
 * comparison, so it returns the first character's code point, and `packages.test.ts` asserts that
 * number. The table must not count it as support, and the reason is what the user is told.
 */

/** The `String` and `String.prototype` members this build knows about. */
export type StringBuiltin =
  | "at"
  | "charAt"
  | "charCodeAt"
  | "codePointAt"
  | "concat"
  | "endsWith"
  | "fromCharCode"
  | "fromCodePoint"
  | "includes"
  | "indexOf"
  | "isWellFormed"
  | "lastIndexOf"
  | "localeCompare"
  | "match"
  | "matchAll"
  | "normalize"
  | "padEnd"
  | "padStart"
  | "raw"
  | "repeat"
  | "replace"
  | "replaceAll"
  | "search"
  | "slice"
  | "split"
  | "startsWith"
  | "substr"
  | "substring"
  | "toLowerCase"
  | "toString"
  | "toUpperCase"
  | "toWellFormed"
  | "trim"
  | "trimEnd"
  | "trimStart"
  | "valueOf";

export const stringBuiltinSupport: BuiltinSupport<"string", StringBuiltin> = {
  // Search.
  at: { arity: 1, state: "supported", id: "string.at" },
  includes: { arity: { from: 1, to: 2 }, state: "supported", id: "string.includes" },
  indexOf: { arity: { from: 1, to: 2 }, state: "supported", id: "string.indexOf" },
  lastIndexOf: { arity: { from: 1, to: 2 }, state: "supported", id: "string.lastIndexOf" },
  startsWith: { arity: { from: 1, to: 2 }, state: "supported", id: "string.startsWith" },
  endsWith: { arity: { from: 1, to: 2 }, state: "supported", id: "string.endsWith" },

  // Slicing.
  slice: { arity: { from: 0, to: 2 }, state: "supported", id: "string.slice" },
  substring: { arity: { from: 1, to: 2 }, state: "supported", id: "string.substring" },
  substr: { arity: { from: 1, to: 2 }, state: "supported", id: "string.substr" },
  charAt: { arity: 1, state: "supported", id: "string.charAt" },
  charCodeAt: { arity: 1, state: "supported", id: "string.charCodeAt" },
  codePointAt: {
    arity: 1,
    state: "supported",
    id: "string.codePointAt",
    reason: "the lowered slice is a single code unit, so an astral character is not distinguished from its first surrogate"
  },

  // Case and whitespace.
  toLowerCase: { arity: 0, state: "supported", id: "string.toLowerCase" },
  toUpperCase: { arity: 0, state: "supported", id: "string.toUpperCase" },
  trim: { arity: 0, state: "supported", id: "string.trim" },
  trimStart: { arity: 0, state: "supported", id: "string.trimStart" },
  trimEnd: { arity: 0, state: "supported", id: "string.trimEnd" },

  // Construction and padding.
  repeat: { arity: 1, state: "supported", id: "string.repeat" },
  padStart: { arity: { from: 1, to: 2 }, state: "supported", id: "string.padStart" },
  padEnd: { arity: { from: 1, to: 2 }, state: "supported", id: "string.padEnd" },
  normalize: {
    arity: 0,
    state: "supported",
    id: "string.normalize",
    reason: "only the NFC identity case is lowered; `packages.test.ts` asserts the passthrough"
  },
  split: { arity: { from: 1, to: 2 }, state: "supported", id: "string.split" },
  replace: { arity: 2, state: "supported", id: "string.replace" },
  replaceAll: { arity: 2, state: "supported", id: "string.replaceAll" },
  match: {
    arity: 1,
    state: "supported",
    id: "string.match",
    reason: "only a regular-expression argument is lowered; a string argument is not"
  },

  // Statics.
  fromCharCode: { arity: { from: 1, to: 8 }, state: "supported", id: "string.fromCharCode", placement: "static" },

  // Recognized but not written. `localeCompare` is below: the compiler *does* lower it, to the
  // first character's code point rather than a comparison, so it is `"stubbed"` rather than either
  // of the two states above.
  localeCompare: {
    arity: { from: 1, to: 2 },
    state: "stubbed",
    id: "string.localeCompare",
    reason: "lowered to the first character's code point rather than a comparison, which is not what JavaScript computes"
  },

  concat: { arity: { from: 1, to: 8 }, state: "planned", id: "string.concat" },
  matchAll: { arity: 1, state: "planned", id: "string.matchAll" },
  search: { arity: { from: 1, to: 2 }, state: "planned", id: "string.search" },
  valueOf: { arity: 0, state: "planned", id: "string.valueOf" },
  toString: { arity: 0, state: "planned", id: "string.toString" },
  isWellFormed: { arity: 0, state: "planned", id: "string.isWellFormed" },
  toWellFormed: { arity: 0, state: "planned", id: "string.toWellFormed" },
  fromCodePoint: { arity: { from: 1, to: 8 }, state: "planned", id: "string.fromCodePoint", placement: "static" },
  raw: { arity: { from: 1, to: 8 }, state: "planned", id: "string.raw", placement: "static" }
};

/** The `String` member with this name, or `undefined` if the name is not one of them. */
export function stringBuiltinFor(name: string): BuiltinEntry<"string"> | undefined {
  return builtinFor(stringBuiltinSupport, "string", name);
}

/**
 * The diagnostic for a `String` member this build has not written, or `undefined` if the name is
 * not a member of `String` or the compiler has a lowering for it.
 */
export function plannedStringBuiltinMessage(name: string): string | undefined {
  const entry = builtinEntryFor(stringBuiltinSupport, "string", name);
  if (entry === undefined || entry.state === "supported") {
    return undefined;
  }
  return knownBuiltinMessage(entry);
}
