import { arrayBuiltinSupport } from "./array.js";
import { collectionBuiltinSupport } from "./collection.js";
import { dateBuiltinSupport } from "./date.js";
import { errorBuiltinSupport } from "./error.js";
import { functionBuiltinSupport } from "./function.js";
import { iteratorBuiltinSupport } from "./iterator.js";
import { jsonBuiltinSupport } from "./json.js";
import { regexpBuiltinSupport } from "./regexp.js";
import { objectBuiltinSupport } from "./object.js";
import { mathBuiltinSupport } from "./math.js";
import { numberBuiltinSupport, numberGlobalBuiltinSupport } from "./number.js";
import { stringBuiltinSupport } from "./string.js";
import {
  type BuiltinDeclaration,
  type BuiltinEntry,
  type BuiltinOwner,
  type SupportManifest,
  type TypeScriptForm,
  builtinEntries
} from "./support.js";

/**
 * Every builtin the compiler knows about, derived from the support tables.
 *
 * This is derived, never written by hand. A manifest written by hand is a list that drifts the
 * first time a builtin is added and nobody updates it, which is worse than no manifest at all
 * because it looks authoritative. Here a builtin cannot be in a table and missing from the
 * manifest, or in the manifest and missing from a table.
 */
interface OwnerTable {
  readonly owner: BuiltinOwner;
  readonly support: Readonly<Record<string, BuiltinDeclaration<BuiltinOwner>>>;
}

/**
 * Every owner's table, in the order the manifest lists them. Adding an owner is one line here and
 * the manifest picks it up; the manifest test asserts the count so a table cannot be left out.
 */
const ownerTables: readonly OwnerTable[] = [
  { owner: "array", support: arrayBuiltinSupport },
  { owner: "object", support: objectBuiltinSupport },
  { owner: "string", support: stringBuiltinSupport },
  { owner: "number", support: numberBuiltinSupport },
  { owner: "number", support: numberGlobalBuiltinSupport },
  { owner: "math", support: mathBuiltinSupport },
  { owner: "collection", support: collectionBuiltinSupport },
  { owner: "json", support: jsonBuiltinSupport },
  { owner: "regexp", support: regexpBuiltinSupport },
  { owner: "date", support: dateBuiltinSupport },
  { owner: "function", support: functionBuiltinSupport },
  { owner: "error", support: errorBuiltinSupport },
  { owner: "iterator", support: iteratorBuiltinSupport }
];

/**
 * Every TypeScript form the compiler has to answer for, with whether it admits it.
 *
 * This half is written by hand because a form is not derivable from anything: the builtins half can
 * be derived from the tables because a table entry *is* the claim. A form is a claim about syntax the
 * compiler either erases or refuses, and nothing in the source states it, which is why the state here
 * was measured — each entry says whether `tscn` compiles the form and agrees with Node, or refuses
 * it. `form-admitted-*.ts` and `form-planned-*.ts` are the evidence, and the manifest test asserts
 * both directions: an `"admitted"` entry without a passing fixture, or a `"planned"` entry without a
 * reason, fails.
 *
 * The forms are listed in the order of the plan's three batches, so the list reads as the remaining
 * work rather than as an alphabet.
 */
const declaredForms: readonly TypeScriptForm[] = [
  // Batch 1, pure erasure.
  {
    form: "this parameter",
    id: "this-parameter",
    state: "admitted",
    syntax: "this: void"
  },
  {
    form: "readonly modifier on a field",
    id: "readonly-modifier",
    state: "admitted",
    syntax: "readonly x: number = 1"
  },
  {
    form: "public modifier on a field",
    id: "public-modifier",
    state: "admitted",
    syntax: "public x: number = 1"
  },
  {
    form: "private modifier on a field",
    id: "private-modifier",
    state: "admitted",
    syntax: "private x: number = 1"
  },
  {
    form: "override modifier on a method",
    id: "override-modifier",
    state: "admitted",
    syntax: "override m(): number"
  },
  {
    form: "accessor keyword on a field",
    id: "accessor-keyword",
    state: "admitted",
    syntax: "accessor x = 1"
  },
  {
    form: "satisfies operator",
    id: "satisfies-operator",
    state: "admitted",
    syntax: "expr satisfies T"
  },
  {
    form: "optional parameter",
    id: "optional-parameter",
    state: "admitted",
    syntax: "x?: number"
  },
  {
    form: "abstract member",
    id: "abstract-member",
    state: "planned",
    syntax: "abstract m(): void",
    reason: "the class tier refuses on any member it cannot place, and an abstract member has no body to place"
  },
  {
    form: "implements clause",
    id: "implements-clause",
    state: "admitted",
    syntax: "class A implements I"
  },
  {
    form: "declare modifier on a class member",
    id: "declare-member",
    state: "planned",
    syntax: "declare class A { x: number }",
    reason: "a declared field has no initializer to lower, and the class tier requires one"
  },
  {
    form: "type parameters on a class",
    id: "class-type-parameters",
    state: "admitted",
    syntax: "class Box<T>"
  },
  {
    form: "parameter property",
    id: "parameter-property",
    state: "planned",
    syntax: "constructor(readonly v: T)",
    reason: "the class tier declares a field from the modifier, and it writes no field initializer"
  },
  {
    form: "function overload signature",
    id: "function-overload-signature",
    state: "planned",
    syntax: "function f(x: number): number;",
    reason: "a signature without a body is lowered as a declaration, which emits nothing and declares nothing"
  },

  // Batch 2, desugaring to shapes that already work.
  {
    form: "enum declaration",
    id: "enum-declaration",
    state: "planned",
    syntax: "enum E { A }",
    reason: "needs an object literal with the forward and reverse mappings, which the declaration tier does not build"
  },
  {
    form: "namespace declaration",
    id: "namespace-declaration",
    state: "planned",
    syntax: "namespace N { }",
    reason: "needs an object literal plus a hoist, and the module tier refuses the declaration outright"
  },
  {
    form: "labeled statement",
    id: "labeled-statement",
    state: "planned",
    syntax: "outer: for (;;) { break outer; }",
    reason: "`break` and `continue` carry a target depth, and a source label is not a depth"
  },
  {
    form: "comma declarators in a for initializer",
    id: "for-comma-declarators",
    state: "planned",
    syntax: "for (let i = 0, j = 1;;)",
    reason: "`lowerForInitializer` handles one declarator and the rest are silently dropped"
  },
  {
    form: "get or set accessor in an object literal",
    id: "object-literal-accessor",
    state: "planned",
    syntax: "{ get v(): number {} }",
    reason: "the class tier has `lowerClassAccessor` and the object literal path does not"
  },
  {
    form: "new.target",
    id: "new-target",
    state: "planned",
    syntax: "new.target",
    reason: "needs a synthetic binding initialized from a runtime call"
  },

  // Batch 3, narrowing a shape the compiler accepts and lowers wrongly.
  {
    form: "computed method name in an object literal",
    id: "computed-object-method",
    state: "admitted",
    syntax: "{ [key]() {} }"
  },
  {
    form: "iterator method in an object literal",
    id: "object-literal-iterator-method",
    state: "planned",
    syntax: "{ [Symbol.iterator]() {} }",
    reason: "the object path rejects any computed key with a message that names a numeric object, which is a different limitation and a wrong name"
  },
  {
    form: "Date constructor",
    id: "date-constructor",
    state: "planned",
    syntax: "new Date(0)",
    reason: "no date value can exist, so `Date.prototype`'s members are unreachable and their table entries would never fire"
  }
];

export function supportManifest(): SupportManifest {
  return {
    builtins: ownerTables.flatMap((table) => builtinEntries(table.support, table.owner)),
    forms: declaredForms
  };
}

/** The manifest ids of every TypeScript form this build does not admit. */
export function plannedFormIds(): readonly string[] {
  return supportManifest().forms.filter((form) => form.state === "planned").map((form) => form.id);
}

/** The manifest ids of every builtin this build has not written, for the tests to cross-check. */
export function plannedBuiltinIds(): readonly string[] {
  return supportManifest().builtins.filter((entry) => entry.state === "planned").map((entry) => entry.id);
}

/** The manifest ids of every builtin this build lowers to something JavaScript does not compute. */
export function stubbedBuiltinIds(): readonly string[] {
  return supportManifest().builtins.filter((entry) => entry.state === "stubbed").map((entry) => entry.id);
}

/** The manifest entry with this id, or `undefined` if no table declares one. */
export function builtinById(id: string): BuiltinEntry | undefined {
  return supportManifest().builtins.find((entry) => entry.id === id);
}

/**
 * Every owner's entries, keyed by owner then by name.
 *
 * A diagnostic sometimes needs the entry rather than the message — a member read has to ask "is this
 * name in this owner's table at all" before it claims the member is a known builtin, or every
 * unrecognized property read on a known object would be reported as a builtin the compiler has never
 * heard of. Deriving this from the manifest means the answer cannot disagree with the tables.
 */
const entriesByOwner: ReadonlyMap<BuiltinOwner, ReadonlyMap<string, BuiltinEntry>> = new Map(
  ownerTables.map((table) => [
    table.owner,
    new Map(builtinEntries(table.support, table.owner).map((entry) => [entry.name, entry]))
  ])
);

/** The entry for `owner`.`name`, or `undefined` if the owner has no entry by that name. */
export function builtinEntryForOwnerAndName(owner: BuiltinOwner, name: string): BuiltinEntry | undefined {
  return entriesByOwner.get(owner)?.get(name);
}
