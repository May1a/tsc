import type { VariantOfKind } from "../dispatch.js";
import type { JsIrOperationNode } from "../ir/types.js";
import type { FieldRole } from "./field-roles.js";
import type { BindingRef } from "./binding-id.js";
import type { ResolveNested } from "./resolved-types.js";

/** How a text field of `F` is classified. A list field takes list roles; a single one takes not. */
export type RoleFor<F> = NonNullable<F> extends readonly string[] ? ListFieldRole : FieldRole;

export type ListFieldRole = Extract<FieldRole, { readonly role: `${string}List` }>;

export type TextFieldsOf<V> = {
  [F in keyof V]-?: F extends "kind"
    ? never
    : string extends NonNullable<V[F]>
      ? F
      : readonly string[] extends NonNullable<V[F]>
        ? F
        : never;
}[keyof V];

export type VariantRoles<V> = { readonly [F in TextFieldsOf<V>]: RoleFor<V[F]> } &
  Partial<Record<Exclude<keyof V, TextFieldsOf<V> | "kind">, { readonly role: "described" }>>;

/** A role table keyed by a tier's kinds, checked for totality over that tier. */
export type RoleTable<T extends { readonly kind: string }> = {
  readonly [K in T["kind"]]: VariantRoles<VariantOfKind<T, K>>;
};

/** The operations' role table, keyed exactly as `JsIrOperationNode` is. */
export type OperationRoleTable = RoleTable<JsIrOperationNode>;

export type ResolveTier<T extends { readonly kind: string }, Roles extends RoleTable<T>> =
  T extends unknown ? ResolveVariant<T, Roles[T["kind"]]> : never;

type ResolveVariant<V extends { readonly kind: string }, Roles> = {
  [F in keyof V]: ResolveFieldValue<V, F, RoleAt<Roles, F>>;
};

type RoleAt<R, F extends PropertyKey> = F extends keyof R ? R[F] : undefined;

type ResolveFieldValue<V, F extends keyof V, Role> =
  Role extends { readonly role: "declaration" | "reference" } ? BindingRef :
    Role extends { readonly role: "described" } ? V[F] :
    Role extends { readonly role: "optionalDeclaration" } ? BindingRef | undefined :
      Role extends { readonly role: "declarationList" | "referenceList" } ? readonly BindingRef[] :
        Role extends { readonly role: "preserved" | "preservedList" } ? V[F] :
          ResolveNested<V[F]>;
