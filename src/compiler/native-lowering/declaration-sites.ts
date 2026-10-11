import type { BindingRef, ResolvedOperation } from "../binding-resolution/index.js";
import { operationRoles } from "../binding-resolution/operation-roles.js";

/**
 * The binding a resolved operation declares when it executes, if any.
 *
 * The answer comes from the same role table that makes the name a declaration during resolution,
 * so the two can never disagree about which operations declare. Only `name` declarations count:
 * loop-item bindings (`itemName`), catch bindings (`catchVariable`), and destructuring destinations
 * renew at their own emission sites, while `function` names are hoisted references whose objects
 * refresh through `functionDeclaration` instead.
 */
export function declaredBinding(operation: ResolvedOperation): BindingRef | undefined {
  const roles = operationRoles[operation.kind];
  if (!("name" in roles) || roles.name.role !== "declaration") {
    return undefined;
  }
  if (!("name" in operation)) {
    return undefined;
  }
  return operation.name;
}
