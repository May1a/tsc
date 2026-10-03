/**
 * The vocabulary a builtin support table is written in.
 *
 * A support table is the compiler's statement of what it supports: one entry per builtin it knows
 * about, with the state it is in. The point is that a program using something the compiler has not
 * written gets a diagnostic naming the builtin, instead of the same message a program gets for
 * calling a method that does not exist.
 *
 * The tables are the single source of truth. The manifest (`supportManifest()`) is derived from
 * them, never written by hand, so it cannot drift from the code; and a table is a `Record` keyed
 * by its owner's builtin union, so deleting a builtin and forgetting the entry does not compile and
 * adding an entry for a name the union does not contain does not compile either.
 */

/** The object whose prototype or namespace a builtin's name lives on. */
export type BuiltinOwner =
  | "array"
  | "collection"
  | "date"
  | "error"
  | "function"
  | "iterator"
  | "json"
  | "math"
  | "number"
  | "object"
  | "regexp"
  | "string";

/**
 * Where the name lives: on the owner's prototype, among its statics, or as a bare global.
 *
 * The globals are here rather than in a table of their own because they are the same thing from a
 * user's point of view — a builtin this build knows the name of — and the diagnostic reads the same
 * either way.
 */
export type BuiltinPlacement = "prototype" | "static" | "global";

/**
 * Whether this build has a lowering for the entry, and whether that lowering agrees with JavaScript.
 *
 * - `"supported"` — the lowering was checked against Node and produces the same answer.
 * - `"stubbed"` — the compiler lowers it, but to something JavaScript does not compute. The runtime
 *   has no locale comparison, so `localeCompare` returns the first character's code point, and
 *   `packages.test.ts` asserts that number. This is the plan's batch-3 case: the shape is not
 *   missing, the answer is wrong, and a two-state table would have to call it supported.
 * - `"planned"` — the compiler recognizes the member and has not written it. This is the state that
 *   produces a diagnostic naming the builtin, which is a far more useful answer than the enclosing
 *   statement's syntax kind.
 */
export type BuiltinState = "supported" | "stubbed" | "planned";

/** The argument count an entry accepts, as a single count or an inclusive range. */
export type BuiltinArity = number | { readonly from: number; readonly to: number };

/** The manifest: every builtin the compiler knows about, with the state it is in. */
export interface SupportManifest {
  readonly builtins: readonly BuiltinEntry[];
}

/** One builtin the compiler knows about. */
export interface BuiltinEntry<Owner extends BuiltinOwner = BuiltinOwner> {
  readonly owner: Owner;
  readonly name: string;
  readonly placement: BuiltinPlacement;
  readonly arity: BuiltinArity;
  readonly state: BuiltinState;
  /**
   * The manifest id a diagnostic quotes and `support-manifest.test.ts` keys a fixture on. Stable
   * across a rename of the TypeScript-facing name, so a test failure points at the same builtin.
   */
  readonly id: string;
  /**
   * Why this build does not implement the entry, for a `"planned"` one whose refusal is narrower
   * than "not written yet" — a shape the compiler recognizes but only lowers in one slice, say.
   * Generated into the diagnostic so the table, not a hand-written string beside the recognizer, is
   * what the user is told.
   */
  readonly reason?: string;
  /**
   * The stem of the fixture that covers this entry, without the `.ts`. The convention is
   * `<owner>-runtime-<stem>`, but a name that is an acronym or already separated (`EPSILON`,
   * `isNaN`) has no mechanical kebab spelling, so the table states the stem rather than the test
   * guessing one and failing on a spelling nobody chose.
   */
  readonly fixture?: string;
}

/**
 * What one entry of an owner's table has to say. The owner and the name are deliberately absent:
 * the owner is fixed by the table it sits in and the name *is* the key, so neither can be stated
 * twice and disagree with the other.
 */
export type BuiltinDeclaration<Owner extends BuiltinOwner> = Omit<BuiltinEntry<Owner>, "owner" | "name" | "placement"> & {
  readonly placement?: BuiltinPlacement;
};

/**
 * The table for one owner, keyed by that owner's builtin union. The `Record` is the completeness
 * check: a name cannot be in the union without a declaration describing it, and a declaration
 * cannot be added for a name the union does not contain.
 */
export type BuiltinSupport<Owner extends BuiltinOwner, Name extends string> = Readonly<Record<Name, BuiltinDeclaration<Owner>>>;

/** Composes the full entry for one key of a table. */
export function builtinEntryFor<Owner extends BuiltinOwner, Name extends string>(
  support: BuiltinSupport<Owner, Name>,
  owner: Owner,
  name: string
): BuiltinEntry<Owner> | undefined {
  // Widened so the key can be looked up by a runtime string. `Name extends string`, so the table
  // is already assignable to the wider record; `Object.hasOwn` is what keeps a miss from reading
  // an inherited member such as `toString`.
  const table: Readonly<Record<string, BuiltinDeclaration<Owner>>> = support;
  if (!Object.hasOwn(table, name)) {
    return undefined;
  }
  const declaration: BuiltinDeclaration<Owner> = table[name];
  return { ...declaration, owner, name, placement: declaration.placement ?? "prototype" };
}

/** The one member of a table with this name, or `undefined` if the name is not one of them. */
export function builtinFor<Owner extends BuiltinOwner, Name extends string>(
  support: BuiltinSupport<Owner, Name>,
  owner: Owner,
  name: string
): BuiltinEntry<Owner> | undefined {
  return builtinEntryFor(support, owner, name);
}

/**
 * Flattens an owner's table into manifest entries, in key order. Derived from the table rather than
 * written out, so a builtin cannot be in one and missing from the other.
 */
export function builtinEntries<Owner extends BuiltinOwner, Name extends string>(
  support: BuiltinSupport<Owner, Name>,
  owner: Owner
): readonly BuiltinEntry[] {
  return Object.keys(support).map((name) => {
    const entry = builtinEntryFor(support, owner, name);
    if (entry === undefined) {
      throw new Error(`Support table for ${owner} lost the key ${name} between keys() and lookup`);
    }
    return entry;
  });
}

/** Renders an entry as the source-level expression a user would have written for it. */
export function builtinDisplay(entry: BuiltinEntry): string {
  const owner = capitalize(entry.owner);
  if (entry.placement === "global") {
    return entry.name;
  }
  if (entry.placement === "static") {
    return `${owner}.${entry.name}`;
  }
  return `${owner}.prototype.${entry.name}`;
}

/**
 * The diagnostic for a builtin the compiler knows about and has not written. It cites the manifest
 * id so the user can look up what the compiler does support for that owner. A `"stubbed"` entry
 * lowers, so this never fires for one; it is in the manifest so the wrong answer is on the record.
 */
export function knownBuiltinMessage(entry: BuiltinEntry): string {
  const known = `${builtinDisplay(entry)} is a known builtin that this build does not implement yet (support id: ${entry.id})`;
  if (entry.reason === undefined) {
    return known;
  }
  return `${known}: ${entry.reason}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
