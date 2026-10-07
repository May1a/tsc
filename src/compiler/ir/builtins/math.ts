import { type BuiltinEntry, type BuiltinSupport, builtinEntryFor, builtinFor, knownBuiltinMessage } from "./support.js";

/**
 * What this build does with `Math`.
 *
 * Every entry is a static: `Math` has no prototype worth naming. The transcendental and log
 * functions that are present agree with Node on the *value* — `Math.sqrt(2)` is the same double —
 * but this compiler's `print` renders a number with six significant digits, so the two print
 * differently for values like that. That is a `print` limitation, not a `Math` one, and it is why
 * the fixtures here assert values that print identically.
 */

/** The `Math` members this build knows about. */
export type MathBuiltin =
  | "abs"
  | "acos"
  | "asin"
  | "atan"
  | "atan2"
  | "cbrt"
  | "ceil"
  | "clz32"
  | "cos"
  | "exp"
  | "floor"
  | "fround"
  | "hypot"
  | "imul"
  | "log"
  | "log2"
  | "log10"
  | "max"
  | "min"
  | "pow"
  | "random"
  | "round"
  | "sign"
  | "sin"
  | "sqrt"
  | "tan"
  | "trunc";

export const mathBuiltinSupport: BuiltinSupport<"math", MathBuiltin> = {
  // Arithmetic and rounding. Each lowers through the number tier with numeric arguments only.
  abs: { arity: 1, state: "supported", placement: "static", id: "math.abs" },
  ceil: { arity: 1, state: "supported", placement: "static", id: "math.ceil" },
  floor: { arity: 1, state: "supported", placement: "static", id: "math.floor" },
  round: { arity: 1, state: "supported", placement: "static", id: "math.round" },
  trunc: { arity: 1, state: "supported", placement: "static", id: "math.trunc" },
  sign: { arity: 1, state: "supported", placement: "static", id: "math.sign" },
  min: { arity: { from: 1, to: 8 }, state: "supported", id: "math.min" },
  max: { arity: { from: 1, to: 8 }, state: "supported", id: "math.max" },
  hypot: { arity: { from: 1, to: 8 }, state: "supported", id: "math.hypot" },
  pow: { arity: 2, state: "supported", placement: "static", id: "math.pow" },
  imul: { arity: 2, state: "supported", placement: "static", id: "math.imul" },
  clz32: { arity: 1, state: "supported", id: "math.clz32" },
  fround: { arity: 1, state: "supported", placement: "static", id: "math.fround" },

  // Roots, logs and the transcendentals. The values agree with Node; only `print`'s six
  // significant digits differ, so the fixtures assert values that print identically.
  sqrt: { arity: 1, state: "supported", placement: "static", id: "math.sqrt" },
  cbrt: { arity: 1, state: "supported", placement: "static", id: "math.cbrt" },
  exp: { arity: 1, state: "supported", placement: "static", id: "math.exp" },
  log: { arity: 1, state: "supported", placement: "static", id: "math.log" },
  log2: { arity: 1, state: "supported", id: "math.log2" },
  log10: { arity: 1, state: "supported", id: "math.log10" },
  sin: { arity: 1, state: "supported", placement: "static", id: "math.sin" },
  cos: { arity: 1, state: "supported", placement: "static", id: "math.cos" },
  tan: { arity: 1, state: "supported", placement: "static", id: "math.tan" },

  // Recognized but not written.
  asin: { arity: 1, state: "planned", placement: "static", id: "math.asin" },
  acos: { arity: 1, state: "planned", placement: "static", id: "math.acos" },
  atan: { arity: 1, state: "planned", placement: "static", id: "math.atan" },
  atan2: { arity: 2, state: "planned", id: "math.atan2", placement: "static" },
  // Not random: each call site gets a fixed value chosen at compile time, and two runs of the same
  // program produce the same sequence. That is the batch-3 case, so the entry is `"stubbed"`.
  random: {
    arity: 0,
    state: "stubbed",
    id: "math.random",
    placement: "static",
    reason: "each call site is given a fixed value at compile time, so the sequence is identical on every run"
  }
};

/** The `Math` member with this name, or `undefined` if the name is not one of them. */
export function mathBuiltinFor(name: string): BuiltinEntry<"math"> | undefined {
  return builtinFor(mathBuiltinSupport, "math", name);
}

/**
 * The diagnostic for a `Math` member this build has not written, or `undefined` if the name is not
 * one of them or the compiler has a lowering for it.
 */
export function plannedMathBuiltinMessage(name: string): string | undefined {
  const entry = builtinEntryFor(mathBuiltinSupport, "math", name);
  if (entry === undefined || entry.state === "supported") {
    return undefined;
  }
  return knownBuiltinMessage(entry);
}