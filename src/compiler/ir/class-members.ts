import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import type { JsIrStringExpression } from "./expressions.js";
import { type Produced, produced, unsupportedIn } from "./lowered.js";
import { SYMBOL_ITERATOR_SENTINEL } from "../symbols.js";

// Key of a class member. Literal keys are known at compile time; computed keys
// are evaluated once at class-definition time into a module-level slot and read
// back from there wherever the member is stored.
export type ClassMemberKey =
  | { readonly kind: "literal"; readonly name: string }
  | { readonly kind: "computed"; readonly slotName: string };

export interface ClassFieldInfo {
  readonly key: ClassMemberKey;
  readonly initializer: ts.Expression | undefined;
  /** The `#name` of a private field, which construction adds as a private element under `key`. */
  readonly privateName?: string;
}

export interface ClassComputedKeyInfo {
  readonly slotName: string;
  readonly expression: ts.Expression;
}

export interface ClassMethodEntry {
  readonly name: string;
  readonly declaration: ts.MethodDeclaration;
}

export interface ClassComputedMethodEntry {
  readonly slotName: string;
  readonly declaration: ts.MethodDeclaration;
}

export interface ClassAccessorEntry {
  readonly name: string;
  readonly declaration: ts.AccessorDeclaration;
}

interface ClassComputedAccessorEntry {
  readonly slotName: string;
  readonly declaration: ts.AccessorDeclaration;
  readonly isGetter: boolean;
  readonly isStatic: boolean;
  readonly index: number;
}

export type ClassStaticInitializer =
  | { readonly kind: "field"; readonly field: ClassFieldInfo }
  | { readonly kind: "block"; readonly declaration: ts.ClassStaticBlockDeclaration; readonly index: number };

export interface CollectedClassMembers {
  readonly fields: readonly ClassFieldInfo[];
  readonly staticFields: readonly ClassFieldInfo[];
  readonly staticInitializers: readonly ClassStaticInitializer[];
  readonly computedKeys: readonly ClassComputedKeyInfo[];
  readonly constructorDeclaration: ts.ConstructorDeclaration | undefined;
  readonly methodDeclarations: readonly ClassMethodEntry[];
  readonly staticMethodDeclarations: readonly ClassMethodEntry[];
  readonly computedMethodDeclarations: readonly ClassComputedMethodEntry[];
  readonly computedStaticMethodDeclarations: readonly ClassComputedMethodEntry[];
  readonly getAccessors: readonly ClassAccessorEntry[];
  readonly setAccessors: readonly ClassAccessorEntry[];
  readonly staticGetAccessors: readonly ClassAccessorEntry[];
  readonly staticSetAccessors: readonly ClassAccessorEntry[];
  readonly computedAccessors: readonly ClassComputedAccessorEntry[];
  readonly iteratorMethod: ts.MethodDeclaration | undefined;
  readonly parameterProperties: readonly string[];
  readonly privateFields: ReadonlyMap<string, string>;
  readonly privateMethodDeclarations: readonly ClassMethodEntry[];
  readonly privateGetAccessors: readonly ClassAccessorEntry[];
  readonly privateSetAccessors: readonly ClassAccessorEntry[];
  readonly staticPrivateFields: ReadonlyMap<string, string>;
  readonly staticPrivateMethodDeclarations: readonly ClassMethodEntry[];
  readonly staticPrivateGetAccessors: readonly ClassAccessorEntry[];
  readonly staticPrivateSetAccessors: readonly ClassAccessorEntry[];
}

// Storage key for a private field: mangled with the owning class name behind a
// NUL prefix so it can never collide with a source-level property name. Its
// presence as an own property of an instance doubles as the class brand.
export function classPrivateFieldStorageKey(className: string, fieldName: string): string {
  return `\0private\0${className}\0${fieldName}`;
}

function classMemberHasStaticModifier(member: ts.ClassElement): boolean {
  if (!ts.canHaveModifiers(member)) {
    return false;
  }
  return ts.getModifiers(member)?.some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword) ?? false;
}

// Resolves a computed member name that is constant at compile time (a string,
// numeric, or template literal, or a const-bound string), so such members keep
// using the ordinary static machinery.
function resolveConstantComputedMemberName(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): string | undefined {
  if (ts.isStringLiteral(expression) || ts.isNumericLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }
  if (ts.isIdentifier(expression)) {
    const binding = bindings.get(expression.text);
    if (binding?.kind === "string") {
      return binding.value;
    }
  }
  return undefined;
}

// Resolves the key of a class member. Runtime-computed names are recorded in
// `computedKeys` (in definition order) so their evaluation can be emitted once
// at class-definition time. Returns undefined for names this lowering cannot
// handle (private identifiers, symbol keys other than Symbol.iterator).
function classMemberKeyOf(
  name: ts.PropertyName,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  computedKeys: ClassComputedKeyInfo[],
  slotPrefix: string
): ClassMemberKey | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return { kind: "literal", name: name.text };
  }
  if (!ts.isComputedPropertyName(name)) {
    return undefined;
  }
  const constant = resolveConstantComputedMemberName(name.expression, bindings);
  if (constant !== undefined) {
    return { kind: "literal", name: constant };
  }
  const slotName = `${slotPrefix}$computed$${computedKeys.length}`;
  computedKeys.push({ slotName, expression: name.expression });
  return { kind: "computed", slotName };
}

/**
 * True for a constructor parameter that also declares a field — `constructor(readonly v: number)`.
 *
 * Only the modifiers TypeScript treats as declaring the field count. `declare` and `export` on a
 * parameter are errors rather than field declarations, so a parameter carrying one is not this.
 */
export function isParameterProperty(parameter: ts.ParameterDeclaration): boolean {
  const modifiers = ts.getModifiers(parameter);
  return (
    modifiers?.some(
      (modifier) =>
        modifier.kind === ts.SyntaxKind.PublicKeyword ||
        modifier.kind === ts.SyntaxKind.PrivateKeyword ||
        modifier.kind === ts.SyntaxKind.ProtectedKeyword ||
        modifier.kind === ts.SyntaxKind.ReadonlyKeyword ||
        modifier.kind === ts.SyntaxKind.OverrideKeyword
    ) === true
  );
}

/** True for TypeScript's type-only `this: T` parameter (not a runtime argv slot). */
function isTypeOnlyThisParameter(parameter: ts.ParameterDeclaration): boolean {
  return ts.isIdentifier(parameter.name) && parameter.name.text === "this";
}

export function runtimeParameters(parameters: readonly ts.ParameterDeclaration[]): readonly ts.ParameterDeclaration[] {
  return parameters.filter((parameter) => !isTypeOnlyThisParameter(parameter));
}

/**
 * Recognise the well-known `Symbol.iterator` member access as the compiler-owned
 * sentinel key. General `Symbol()` / `Symbol.for` remain unsupported.
 */
export function lowerSymbolIteratorKeyExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrStringExpression | undefined {
  if (!ts.isPropertyAccessExpression(expression) || !ts.isIdentifier(expression.expression)) {
    return undefined;
  }
  if (expression.expression.text !== "Symbol" || bindings.has("Symbol")) {
    return undefined;
  }
  if (expression.name.text !== "iterator") {
    return undefined;
  }
  return { kind: "literal", value: SYMBOL_ITERATOR_SENTINEL };
}

function isSymbolIteratorPropertyName(
  name: ts.PropertyName,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): boolean {
  return ts.isComputedPropertyName(name) && lowerSymbolIteratorKeyExpression(name.expression, bindings) !== undefined;
}

// eslint-disable-next-line complexity, max-statements -- Class member classification keeps mutually exclusive syntax forms in declaration order.
export function collectClassMembers(
  statement: ts.ClassDeclaration | ts.ClassExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  slotPrefix: string
): Produced<CollectedClassMembers> {
  const fields: ClassFieldInfo[] = [];
  const staticFields: ClassFieldInfo[] = [];
  const staticInitializers: ClassStaticInitializer[] = [];
  const computedKeys: ClassComputedKeyInfo[] = [];
  const methodDeclarations: ClassMethodEntry[] = [];
  const staticMethodDeclarations: ClassMethodEntry[] = [];
  const computedMethodDeclarations: ClassComputedMethodEntry[] = [];
  const computedStaticMethodDeclarations: ClassComputedMethodEntry[] = [];
  const getAccessors: ClassAccessorEntry[] = [];
  const setAccessors: ClassAccessorEntry[] = [];
  const staticGetAccessors: ClassAccessorEntry[] = [];
  const staticSetAccessors: ClassAccessorEntry[] = [];
  const computedAccessors: ClassComputedAccessorEntry[] = [];
  const privateFields = new Map<string, string>();
  const privateMethodDeclarations: ClassMethodEntry[] = [];
  const privateGetAccessors: ClassAccessorEntry[] = [];
  const privateSetAccessors: ClassAccessorEntry[] = [];
  const staticPrivateFields = new Map<string, string>();
  const staticPrivateMethodDeclarations: ClassMethodEntry[] = [];
  const staticPrivateGetAccessors: ClassAccessorEntry[] = [];
  const staticPrivateSetAccessors: ClassAccessorEntry[] = [];
  let constructorDeclaration: ts.ConstructorDeclaration | undefined;
  const parameterProperties: string[] = [];
  let iteratorMethod: ts.MethodDeclaration | undefined;
  let staticBlockIndex = 0;
  for (const member of statement.members) {
    if (ts.isMethodDeclaration(member) && member.body === undefined) {
      continue;
    }
    if (ts.isSemicolonClassElement(member) || ts.isIndexSignatureDeclaration(member)) {
      continue;
    }
    if (ts.isClassStaticBlockDeclaration(member)) {
      staticInitializers.push({ kind: "block", declaration: member, index: staticBlockIndex });
      staticBlockIndex += 1;
    } else if (ts.isPropertyDeclaration(member) && ts.isPrivateIdentifier(member.name)) {
      const isStatic = classMemberHasStaticModifier(member);
      const storageKey = classPrivateFieldStorageKey(slotPrefix, isStatic ? `static$${member.name.text}` : member.name.text);
      const fieldInfo: ClassFieldInfo = { key: { kind: "literal", name: storageKey }, initializer: member.initializer, privateName: member.name.text };
      if (isStatic) {
        staticPrivateFields.set(member.name.text, storageKey);
        staticInitializers.push({ kind: "field", field: fieldInfo });
      } else {
        privateFields.set(member.name.text, storageKey);
        fields.push(fieldInfo);
      }
    } else if (ts.isPropertyDeclaration(member)) {
      const key = classMemberKeyOf(member.name, bindings, computedKeys, slotPrefix);
      if (key === undefined) {
        return unsupportedIn("Class field names must be identifiers, string literals, or computable from constants");
      }
      const fieldInfo: ClassFieldInfo = { key, initializer: member.initializer };
      if (classMemberHasStaticModifier(member)) {
        staticFields.push(fieldInfo);
        staticInitializers.push({ kind: "field", field: fieldInfo });
      } else {
        fields.push(fieldInfo);
      }
    } else if (ts.isConstructorDeclaration(member)) {
      constructorDeclaration = member;
      for (const parameter of runtimeParameters(member.parameters)) {
        if (ts.isIdentifier(parameter.name) && isParameterProperty(parameter)) {
          parameterProperties.push(parameter.name.text);
        }
      }
    } else if ((ts.isMethodDeclaration(member) || ts.isAccessor(member)) && ts.isPrivateIdentifier(member.name)) {
      if (member.body === undefined) {
        return unsupportedIn("A private accessor without a body is not supported");
      }
      const isStatic = classMemberHasStaticModifier(member);
      const entry = { name: member.name.text, declaration: member };
      if (ts.isGetAccessorDeclaration(member)) {
        (isStatic ? staticPrivateGetAccessors : privateGetAccessors).push({ name: entry.name, declaration: member });
      } else if (ts.isSetAccessorDeclaration(member)) {
        (isStatic ? staticPrivateSetAccessors : privateSetAccessors).push({ name: entry.name, declaration: member });
      } else {
        (isStatic ? staticPrivateMethodDeclarations : privateMethodDeclarations).push({ name: entry.name, declaration: member });
      }
    } else if (ts.isMethodDeclaration(member) && member.body !== undefined && isSymbolIteratorPropertyName(member.name, bindings)) {
      if (classMemberHasStaticModifier(member)) {
        return unsupportedIn("A static [Symbol.iterator] method is not supported yet");
      }
      if (iteratorMethod !== undefined) {
        return unsupportedIn("A class may declare at most one [Symbol.iterator] method");
      }
      iteratorMethod = member;
    } else if (ts.isMethodDeclaration(member) && member.body !== undefined) {
      const key = classMemberKeyOf(member.name, bindings, computedKeys, slotPrefix);
      if (key === undefined) {
        return unsupportedIn("Method names must be identifiers, string literals, or computable from constants");
      }
      const isStatic = classMemberHasStaticModifier(member);
      if (key.kind === "literal") {
        (isStatic ? staticMethodDeclarations : methodDeclarations).push({ name: key.name, declaration: member });
      } else {
        (isStatic ? computedStaticMethodDeclarations : computedMethodDeclarations).push({ slotName: key.slotName, declaration: member });
      }
    } else if ((ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member)) && member.body !== undefined) {
      const key = classMemberKeyOf(member.name, bindings, computedKeys, slotPrefix);
      if (key === undefined) {
        return unsupportedIn("Accessor names must be identifiers, string literals, or computable from constants");
      }
      const isGetter = ts.isGetAccessorDeclaration(member);
      const isStatic = classMemberHasStaticModifier(member);
      if (key.kind === "literal") {
        const entry = { name: key.name, declaration: member };
        if (isStatic) {
          (isGetter ? staticGetAccessors : staticSetAccessors).push(entry);
        } else {
          (isGetter ? getAccessors : setAccessors).push(entry);
        }
      } else {
        computedAccessors.push({ slotName: key.slotName, declaration: member, isGetter, isStatic, index: computedAccessors.length });
      }
    } else {
      return unsupportedIn(classMemberRefusalReason(member));
    }
  }
  return produced({
    fields,
    staticFields,
    staticInitializers,
    computedKeys,
    constructorDeclaration,
    methodDeclarations,
    staticMethodDeclarations,
    computedMethodDeclarations,
    computedStaticMethodDeclarations,
    getAccessors,
    setAccessors,
    staticGetAccessors,
    staticSetAccessors,
    computedAccessors,
    iteratorMethod,
    parameterProperties,
    privateFields,
    privateMethodDeclarations,
    privateGetAccessors,
    privateSetAccessors,
    staticPrivateFields,
    staticPrivateMethodDeclarations,
    staticPrivateGetAccessors,
    staticPrivateSetAccessors
  });
}

/**
 * Why a member reached the end of `collectClassMembers` unclassified.
 *
 * Every branch above claims the members it can place, so whatever is left is one of the forms the
 * class tier does not lower.
 */
function classMemberRefusalReason(member: ts.ClassElement): string {
  if (ts.isConstructorDeclaration(member)) {
    return "An overloaded constructor is not supported yet; only the implementation is lowered";
  }
  return "This class member form is not supported yet";
}
