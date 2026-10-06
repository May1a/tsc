import { type Lowered, notApplicable, produced } from "../lowered.js";
import ts from "typescript";
import type { JsIrBindingValue } from "../bindings.js";
import type {
  JsIrCondition,
  JsIrObjectValue,
  JsIrRuntimeDataDescriptor,
  JsIrRuntimeObjectValue,
  JsIrStringExpression,
  JsIrValueExpression
} from "../expressions.js";

/**
 * The `Object` and `Object.prototype` lowering producers.
 *
 * These sit with the support table rather than in `ir.ts` because a table entry that names a builtin
 * and a producer that lowers it are one fact, and keeping them apart is how a `"supported"` state
 * comes to mean nothing. `objectBuiltinSupport` above says `keys` is supported; the function below is
 * what makes that true.
 *
 * Two shapes need explaining. `lowerUnaryObjectAggregateCall` is the shared body of `keys`, `values`
 * and `entries` — one runtime shape with three answers, so one producer takes the member name. And
 * `lowerObjectAccessPath` / `objectPathExists` are the *static* half of a dynamic access: a known-shape
 * object can be read at compile time, so `o.a.b` is a path of layout indexes rather than three loads,
 * and `objectPathExists` is how the compiler decides which it is.
 *
 * The `getOwnPropertyDescriptor` family is here too, and it is the one member of `Object` whose
 * lowering is a *value* rather than an operation — it builds a descriptor object literal, which is why
 * `descriptorObjectLiteralForExpression` and `literalBooleanValue` are its helpers.
 */

export function lowerRuntimeDataDescriptorMapValue(
  value: JsIrRuntimeObjectValue,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): readonly JsIrRuntimeDataDescriptor[] | undefined {
  const descriptors: JsIrRuntimeDataDescriptor[] = [];
  for (const field of value.fields) {
    if (field.kind === "spread" || field.key.kind !== "literal") {
      return undefined;
    }
    const descriptor = lowerRuntimeDataDescriptorValue(field.key, field.value, bindings);
    if (descriptor === undefined) {
      return undefined;
    }
    descriptors.push(descriptor);
  }
  return descriptors;
}
export function lowerRuntimeDataDescriptorValue(
  key: JsIrStringExpression,
  expression: JsIrValueExpression,
  _bindings: ReadonlyMap<string, JsIrBindingValue>,
  literalObject?: JsIrRuntimeObjectValue
): JsIrRuntimeDataDescriptor | undefined {
  const value = literalObject ?? descriptorObjectLiteralForExpression(expression, _bindings);
  if (value === undefined) {
    return undefined;
  }
  let descriptorValue: JsIrValueExpression | undefined;
  let writable = false;
  let enumerable = false;
  let configurable = false;
  for (const field of value.fields) {
    if (field.kind === "spread" || field.key.kind !== "literal") {
      return undefined;
    }
    if (field.key.value === "value") {
      descriptorValue = field.value;
      continue;
    }
    const booleanValue = literalBooleanValue(field.value, _bindings);
    if (booleanValue === undefined) {
      return undefined;
    }
    if (field.key.value === "writable") {
      writable = booleanValue;
      continue;
    }
    if (field.key.value === "enumerable") {
      enumerable = booleanValue;
      continue;
    }
    if (field.key.value === "configurable") {
      configurable = booleanValue;
      continue;
    }
    return undefined;
  }
  if (descriptorValue === undefined) {
    return undefined;
  }
  return { key, value: descriptorValue, writable, enumerable, configurable };
}
export function descriptorObjectLiteralForExpression(
  expression: JsIrValueExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrRuntimeObjectValue | undefined {
  if (expression.kind === "objectLiteralValue") {
    return expression.value;
  }
  if (expression.kind !== "objectRef") {
    return undefined;
  }
  const binding = bindings.get(expression.name);
  if (binding?.kind !== "runtimeObject") {
    return undefined;
  }
  return binding.value;
}
export function literalBooleanValue(expression: JsIrValueExpression, bindings: ReadonlyMap<string, JsIrBindingValue>): boolean | undefined {
  if (expression.kind === "boolean" && expression.value.kind === "boolean") {
    return expression.value.value;
  }
  if (expression.kind === "variable") {
    const binding = bindings.get(expression.name);
    if (binding?.kind === "booleanVariable") {
      return binding.initialValue;
    }
  }
  return undefined;
}
export function lowerRuntimeObjectKeysBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const target = lowerUnaryObjectAggregateCall(initializer, bindings, "keys");
  if (target === undefined) {
    return notApplicable;
  }
  return produced({ kind: "runtimeObjectKeys", name, targetName: target.name, targetKind: target.kind });
}
export function lowerRuntimeObjectValuesBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const target = lowerUnaryObjectAggregateCall(initializer, bindings, "values");
  if (target === undefined) {
    return notApplicable;
  }
  return produced({ kind: "runtimeObjectValues", name, targetName: target.name, targetKind: target.kind });
}
export function lowerRuntimeObjectEntriesBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const target = lowerUnaryObjectAggregateCall(initializer, bindings, "entries");
  if (target === undefined) {
    return notApplicable;
  }
  return produced({ kind: "runtimeObjectEntries", name, targetName: target.name, targetKind: target.kind });
}
export function lowerRuntimeObjectFromEntriesBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!ts.isCallExpression(initializer) || initializer.arguments.length !== 1) {
    return notApplicable;
  }
  const callee = initializer.expression;
  if (!ts.isPropertyAccessExpression(callee) || !ts.isIdentifier(callee.expression) || callee.expression.text !== "Object" || callee.name.text !== "fromEntries") {
    return notApplicable;
  }
  const [entries] = initializer.arguments;
  if (!ts.isIdentifier(entries) || bindings.get(entries.text)?.kind !== "runtimeArray") {
    return notApplicable;
  }
  return produced({ kind: "runtimeObjectFromEntries", name, entriesName: entries.text });
}
export function lowerRuntimeObjectOwnPropertyNamesBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const target = lowerUnaryObjectAggregateCall(initializer, bindings, "getOwnPropertyNames");
  if (target === undefined) {
    return notApplicable;
  }
  return produced({ kind: "runtimeObjectOwnPropertyNames", name, targetName: target.name, targetKind: target.kind });
}
export function lowerRuntimeObjectOwnPropertyDescriptorsBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const target = lowerUnaryObjectAggregateCall(initializer, bindings, "getOwnPropertyDescriptors");
  if (target === undefined) {
    return notApplicable;
  }
  return produced({ kind: "runtimeObjectOwnPropertyDescriptors", name, targetName: target.name, targetKind: target.kind });
}
export function lowerUnaryObjectAggregateCall(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  method: string
): { readonly name: string; readonly kind: "object" | "array" | "value" } | undefined {
  if (!ts.isCallExpression(expression) || expression.arguments.length !== 1) {
    return undefined;
  }
  const callee = expression.expression;
  if (!ts.isPropertyAccessExpression(callee) || !ts.isIdentifier(callee.expression) || callee.expression.text !== "Object" || callee.name.text !== method) {
    return undefined;
  }
  const [target] = expression.arguments;
  if (!ts.isIdentifier(target)) {
    return undefined;
  }
  const binding = bindings.get(target.text);
  if (binding?.kind === "runtimeObject" || (binding?.kind === "object" && !objectHasNestedFields(binding.value))) {
    return { name: target.text, kind: "object" };
  }
  if (binding?.kind === "runtimeArray") {
    return { name: target.text, kind: "array" };
  }
  if (isBoxedAggregateCandidateBinding(binding)) {
    return { name: target.text, kind: "value" };
  }
  return undefined;
}
export function lowerRuntimeObjectGetPrototypeBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!ts.isCallExpression(initializer) || initializer.arguments.length !== 1) {
    return notApplicable;
  }
  const callee = initializer.expression;
  if (!ts.isPropertyAccessExpression(callee) || !ts.isIdentifier(callee.expression) || callee.expression.text !== "Object" || callee.name.text !== "getPrototypeOf") {
    return notApplicable;
  }
  const [target] = initializer.arguments;
  if (!ts.isIdentifier(target)) {
    return notApplicable;
  }
  const binding = bindings.get(target.text);
  if (binding?.kind === "runtimeObject") {
    return produced({ kind: "runtimeObjectGetPrototype", name, targetName: target.text, targetKind: "object" });
  }
  if (binding?.kind === "runtimeArray") {
    return produced({ kind: "runtimeObjectGetPrototype", name, targetName: target.text, targetKind: "array" });
  }
  return notApplicable;
}
export function lowerRuntimeObjectCreateBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!ts.isCallExpression(initializer) || initializer.arguments.length !== 1) {
    return notApplicable;
  }
  const callee = initializer.expression;
  if (!ts.isPropertyAccessExpression(callee) || !ts.isIdentifier(callee.expression) || callee.expression.text !== "Object" || callee.name.text !== "create") {
    return notApplicable;
  }
  const [prototype] = initializer.arguments;
  if (prototype.kind === ts.SyntaxKind.NullKeyword) {
    return produced({ kind: "runtimeObjectCreate", name });
  }
  if (!ts.isIdentifier(prototype)) {
    return notApplicable;
  }
  const binding = bindings.get(prototype.text);
  if (binding?.kind !== "runtimeObject") {
    return notApplicable;
  }
  return produced({ kind: "runtimeObjectCreate", name, prototypeName: prototype.text });
}
export function lowerRuntimeObjectStateCondition(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {
  if (!ts.isCallExpression(expression) || expression.arguments.length !== 1) {
    return undefined;
  }
  const callee = expression.expression;
  if (!ts.isPropertyAccessExpression(callee) || !ts.isIdentifier(callee.expression) || callee.expression.text !== "Object") {
    return undefined;
  }
  const stateByName = new Map<string, "isExtensible" | "isSealed" | "isFrozen">([
    ["isExtensible", "isExtensible"],
    ["isSealed", "isSealed"],
    ["isFrozen", "isFrozen"]
  ]);
  const state = stateByName.get(callee.name.text);
  const [target] = expression.arguments;
  if (state === undefined || !ts.isIdentifier(target) || bindings.get(target.text)?.kind !== "runtimeObject") {
    return undefined;
  }
  return { kind: "runtimeObjectState", objectName: target.text, state };
}
export function isBoxedAggregateCandidateBinding(binding: JsIrBindingValue | undefined): boolean {
  if (binding?.kind === "valueVariable") {
    return true;
  }
  if (binding?.kind !== "value") {
    return false;
  }
  return binding.value.kind === "objectRef" || binding.value.kind === "arrayRef" || binding.value.kind === "objectDynamicAccess" || binding.value.kind === "arrayAccess" || binding.value.kind === "valueObjectDynamicAccess" || binding.value.kind === "valueArrayAccess" || binding.value.kind === "boxedPrimitive";
}
export function lowerObjectAccessPath(
  expression: ts.PropertyAccessExpression | ts.ElementAccessExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): { readonly objectName: string; readonly path: readonly string[] } | undefined {
  const names: string[] = [];
  let current: ts.Expression = expression;
  while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    if (ts.isPropertyAccessExpression(current)) {
      names.unshift(current.name.text);
      current = current.expression;
      continue;
    }
    if (!ts.isStringLiteral(current.argumentExpression)) {
      return undefined;
    }
    names.unshift(current.argumentExpression.text);
    current = current.expression;
  }

  if (!ts.isIdentifier(current)) {
    return undefined;
  }

  const binding = bindings.get(current.text);
  if (binding?.kind !== "object" || !objectPathExists(binding.value, names)) {
    return undefined;
  }

  return { objectName: current.text, path: names };
}
export function objectPathExists(value: JsIrObjectValue, path: readonly string[]): boolean {
  let current: JsIrObjectValue = value;
  for (let i = 0; i < path.length; i++) {
    const field = current.fields.find((item) => item.name === path[i]);
    if (field === undefined) {
      return false;
    }
    if (i === path.length - 1) {
      return field.value.kind === "number";
    }
    if (field.value.kind !== "object") {
      return false;
    }
    current = field.value.value;
  }
  return false;
}
export function objectHasNestedFields(value: JsIrObjectValue): boolean {
  return value.fields.some((field) => field.value.kind === "object");
}
