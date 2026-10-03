import { type BuiltinEntry, type BuiltinSupport, builtinEntryFor, builtinFor, knownBuiltinMessage } from "./support.js";

/**
 * What this build does with `Number`, `Number.prototype`, and the numeric globals.
 *
 * `isFinite` is the one that matters here. The lowering recognized the *global* `isFinite` and
 * emitted a direct call to `@isFinite`, which the runtime does not define, so the compile died in
 * clang with `use of undefined value '@isFinite'` instead of producing a diagnostic. It is
 * `"planned"` so the table turns that into a message naming the builtin; `Number.isFinite` works.
 *
 * `Number.NaN` and `Number.POSITIVE_INFINITY` are deliberately absent. The compiler does not
 * recognize either name, so a table entry for them could never produce its message — the same
 * reasoning that keeps `Array.prototype.toString` out of the array table.
 */

/** The `Number`, `Number.prototype` and global numeric members this build knows about. */
export type NumberBuiltin =
  | "EPSILON"
  | "MAX_SAFE_INTEGER"
  | "MAX_VALUE"
  | "MIN_VALUE"
  | "isFinite"
  | "isInteger"
  | "isNaN"
  | "isSafeInteger"
  | "parseFloat"
  | "parseInt"
  | "toExponential"
  | "toFixed"
  | "toLocaleString"
  | "toPrecision"
  | "toString"
  | "valueOf";

export const numberBuiltinSupport: BuiltinSupport<"number", NumberBuiltin> = {
  // `Number.prototype` methods. Each lowers in an initializer; the argument forms are numeric
  // expressions only.
  toFixed: { arity: 1, state: "supported", id: "number.toFixed" },
  toPrecision: { arity: 1, state: "supported", id: "number.toPrecision" },
  toExponential: { arity: 1, state: "supported", id: "number.toExponential" },
  // `(3.75).toString(16)` is `3`, where JavaScript gives `3.c`: the lowered slice drops the
  // fraction. `(255).toString(16)` is `ff`, so an integer is right. That is the batch-3 case, not a
  // missing method, so the entry is `"stubbed"` rather than either of the other two states.
  toString: {
    arity: { from: 0, to: 1 },
    state: "stubbed",
    id: "number.toString",
    reason: "the base argument is a numeric literal only, and the fraction is dropped: (3.75).toString(16) is 3 where JavaScript gives 3.c"
  },

  // `Number` statics.
  isInteger: { arity: 1, state: "supported", id: "number.isInteger", placement: "static" },
  isSafeInteger: { arity: 1, state: "supported", id: "number.isSafeInteger", placement: "static" },
  isFinite: { arity: 1, state: "supported", id: "number.isFinite", placement: "static" },
  isNaN: {
    arity: 1,
    state: "supported",
    id: "number.isNaN",
    placement: "static",
    fixture: "is-nan",
    reason: "the argument must lower to a number, and `Number.NaN` itself does not"
  },
  parseFloat: { arity: 1, state: "supported", id: "number.parseFloat", placement: "static" },
  parseInt: {
    arity: { from: 1, to: 2 },
    state: "supported",
    id: "number.parseInt",
    placement: "static",
    reason: "the radix is a numeric literal and the base-10 path is the lowered one"
  },
  EPSILON: { arity: 0, state: "supported", id: "number.EPSILON", placement: "static", fixture: "epsilon" },
  MAX_SAFE_INTEGER: { arity: 0, state: "supported", id: "number.MAX_SAFE_INTEGER", placement: "static", fixture: "max-safe-integer" },
  MAX_VALUE: { arity: 0, state: "supported", id: "number.MAX_VALUE", placement: "static", fixture: "max-value" },
  MIN_VALUE: { arity: 0, state: "supported", id: "number.MIN_VALUE", placement: "static", fixture: "min-value" },

  // Recognized but not written.
  toLocaleString: { arity: 0, state: "planned", id: "number.toLocaleString" },
  valueOf: { arity: 0, state: "planned", id: "number.valueOf" }
};

/**
 * The bare numeric globals.
 *
 * A separate table from `Number` because the names collide: `isNaN` is both a global and a
 * `Number` static, and the table is keyed by the source-level name, so one key cannot hold two
 * entries. The manifest ids are what keep them apart.
 */
export type NumberGlobalBuiltin = "isFinite" | "isNaN" | "parseFloat" | "parseInt";

export const numberGlobalBuiltinSupport: BuiltinSupport<"number", NumberGlobalBuiltin> = {
  isNaN: { arity: 1, state: "supported", id: "number.globalIsNaN", placement: "global", fixture: "global-is-nan" },
  parseInt: { arity: { from: 1, to: 2 }, state: "supported", id: "number.globalParseInt", placement: "global", fixture: "global-parse-int" },
  parseFloat: { arity: 1, state: "supported", id: "number.globalParseFloat", placement: "global", fixture: "global-parse-float" },

  // The lowering recognizes the global `isFinite` and emits a direct call to `@isFinite`, which the
  // runtime does not define. The compile therefore dies in clang with `use of undefined value
  // '@isFinite'` instead of producing a diagnostic, which is the worst version of "compiled and
  // miscompiled". `Number.isFinite` is the form that works.
  isFinite: {
    arity: 1,
    state: "planned",
    id: "number.globalIsFinite",
    placement: "global",
    fixture: "global-is-finite",
    reason: "lowered to a call to a runtime function that does not exist, so the compile fails in clang rather than here; Number.isFinite is the form that works"
  }
};

/**
 * The bare global names in this table. The lowering needs the set to tell a global reference from a
 * cross-module function: globals have no `@name` definition behind them, and an unbound reference to
 * one cannot be emitted as a call.
 */
export function numberGlobalNames(): readonly string[] {
  return Object.keys(numberGlobalBuiltinSupport);
}

/** The `Number` member with this name, or `undefined` if the name is not one of them. */
export function numberBuiltinFor(name: string): BuiltinEntry<"number"> | undefined {
  return builtinFor(numberBuiltinSupport, "number", name);
}

/**
 * The diagnostic for a `Number` member or numeric global this build has not written, or `undefined`
 * if the name is not one of them or the compiler has a lowering for it.
 */
export function plannedNumberBuiltinMessage(name: string): string | undefined {
  return plannedEntryMessage(builtinEntryFor(numberBuiltinSupport, "number", name));
}

/**
 * The refusal for a bare numeric global. Only the globals table is consulted: `isNaN` and
 * `isFinite` are both a `Number` static and a global, and a bare `isFinite(...)` must be judged
 * against the global, not against the supported static of the same name.
 */
export function plannedNumberGlobalMessage(name: string): string | undefined {
  return plannedEntryMessage(builtinEntryFor(numberGlobalBuiltinSupport, "number", name));
}

function plannedEntryMessage(entry: BuiltinEntry<"number"> | undefined): string | undefined {
  if (entry === undefined || entry.state === "supported") {
    return undefined;
  }
  return knownBuiltinMessage(entry);
}
