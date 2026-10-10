/** Why a `string` field in the IR is not a lexical binding. */
export type PreservedKind =
  /** A property key or a field path. Observable as a JavaScript property name. */
  | "propertyKey"
  /** A string literal's contents. Pure data. */
  | "stringData"
  /** A `name`-observable function name: `Function.prototype.name` in JavaScript. */
  | "functionName"
  /** A compiler-generated code name (`C$prototype`, `__tscn_fnobj_f_0`). Never source-visible. */
  | "generatedSymbol"
  /** An error class name (`TypeError`, `RangeError`). Observable via `error.name`. */
  | "errorName"
  /** A class-private field's mangled storage key, which doubles as the class brand. */
  | "privateKey"
  /** Template-literal segment text. */
  | "templateText"
  /** A diagnostic or TypeError message. */
  | "message"
  /** A `typeof` operand name, as the string tier records it. */
  | "typeofOperand";

export type FieldRole =
  | { readonly role: "declaration" }
  | { readonly role: "optionalDeclaration" }
  | { readonly role: "reference" }
  | { readonly role: "described" }
  | { readonly role: "preserved"; readonly as: PreservedKind }
  | { readonly role: "declarationList" }
  | { readonly role: "referenceList" }
  | { readonly role: "preservedList"; readonly as: PreservedKind };

export const preserved = <K extends PreservedKind>(as: K) => ({ role: "preserved", as }) as const;

/** A preserved list of names, all of one kind. */
export const preservedList = <K extends PreservedKind>(as: K) => ({ role: "preservedList", as }) as const;

/** A single name that reads a binding the current scope can see. */
export const reference = { role: "reference" } as const satisfies FieldRole;

/** A field that describes another function's frame rather than declaring one of its own. */
export const described = { role: "described" } as const satisfies FieldRole;

/** A single name that introduces a binding in the current scope. */
export const declaration = { role: "declaration" } as const satisfies FieldRole;

/** A single name that introduces a binding only when the IR spells one. */
export const optionalDeclaration = { role: "optionalDeclaration" } as const satisfies FieldRole;

/** A list of names that each read a binding the current scope can see. */
export const referenceList = { role: "referenceList" } as const satisfies FieldRole;

/** A list of names that each introduce a binding in the current scope. */
export const declarationList = { role: "declarationList" } as const satisfies FieldRole;
