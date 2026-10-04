import type { EmitContext, JsValue } from "./context.js";
import { variablePointerName } from "./names.js";
import { emitObjectIndexedPointer } from "./paths.js";
import type { JsIrObjectValue, JsIrValueExpression } from "../ir/expressions.js";
import type { JsIrOperation } from "../ir/types.js";
import { emitNamedValueBinding } from "./conditions.js";
import { emitRuntimeObjectLiteralStorage, knownShapeObjectToRuntimeValue } from "./objects.js";

/**
 * The known-shape object tier: an object whose fields the compiler knows at compile time.
 *
 * This is not a runtime object with a smaller cost. A known-shape object is a bare allocation of `i64`
 * slots in a declared order — no prototype, no property table, no `Object.keys` — and the whole reason
 * `llvm/objects.ts` needs a `knownShapeObjectToRuntimeValue` at all is that this representation cannot
 * answer a dynamic question about itself.
 *
 * `defineObjectType` is where the layout is fixed. It is called once per distinct shape and emits a
 * named LLVM struct, so every object of that shape shares one GEP chain and `objectPathToIndexes` can
 * turn `a.b.c` into compile-time indexes. A property added to the object literal after that point is a
 * different type, which is why the layout is derived from the literal rather than accumulated.
 *
 * `emitObjectFieldStores` writes the initialisers, and its one interesting decision is the order: fields
 * are stored in layout order, not source order, so that two literals with the same fields produce the
 * same code regardless of how they were written.
 */

export function emitObjectLiteralOperation(
  operation: Extract<JsIrOperation, { readonly kind: "objectLiteral" }>,
  context: EmitContext
): string[] {
  const typeName = defineObjectType(operation.value, context);
  const pointerName = variablePointerName(operation.name);
  let runtimePointerName: string | undefined;
  if (operation.needsRuntimeShadow) {
    runtimePointerName = `%${operation.name}.obj.addr`;
  }
  context.objectLayouts.set(operation.name, { typeName, pointerName, runtimePointerName, value: operation.value });
  context.bindings.set(operation.name, { kind: "object", value: operation.value });
  const lines = [
    `  ${pointerName} = alloca ${typeName}`,
    ...emitObjectFieldStores(typeName, pointerName, operation.value, [], context)
  ];
  if (runtimePointerName !== undefined) {
    const runtimeValue = knownShapeObjectToRuntimeValue(operation.value);
    lines.push(...emitRuntimeObjectLiteralStorage(runtimePointerName, runtimeValue, context));
  }
  return lines;
}
export function emitValueObjectSetPrototypeOperation(
  operation: Extract<JsIrOperation, { readonly kind: "valueObjectSetPrototype" }>,
  context: EmitContext
): string[] {
  const target = emitNamedValueBinding(operation.targetName, context);
  const prototype = emitNamedValueBinding(operation.prototypeName, context);
  const targetPointer = `%class.prototype.target.${context.objectIndex}`;
  const prototypePointer = `%class.prototype.base.${context.objectIndex}`;
  context.objectIndex += 1;
  return [
    ...target.lines,
    ...prototype.lines,
    `  ${targetPointer} = call ptr @valueObjectPtr(i64 ${target.value})`,
    `  ${prototypePointer} = call ptr @valueObjectPtr(i64 ${prototype.value})`,
    `  call void @objectSetPrototype(ptr ${targetPointer}, ptr ${prototypePointer})`
  ];
}
export function emitValueObjectValueExpression(
  expression: Extract<JsIrValueExpression, { readonly kind: "valueObjectDynamicAccess" }>,
  context: EmitContext
): JsValue {
  const receiver = context.emitValue(expression.value);
  const key = context.emitStringExpression(expression.key);
  const valueIndex = context.numIndex;
  context.numIndex += 1;
  const value = `%value.${valueIndex}`;
  return {
    lines: [...receiver.lines, ...key.lines, `  ${value} = call i64 @valueObjectGet(i64 ${receiver.value}, i64 ${key.length}, ptr ${key.value})`],
    value
  };
}
export function defineObjectType(value: JsIrObjectValue, context: EmitContext): string {
  const typeName = `%obj.${context.objectIndex}`;
  context.objectIndex += 1;
  const fieldTypes = value.fields
    .map((field) => {
      if (field.value.kind === "number") {
        return "double";
      }
      return defineObjectType(field.value.value, context);
    })
    .join(", ");
  context.objectTypes.push(`${typeName} = type { ${fieldTypes} }`);
  return typeName;
}
export function emitObjectFieldStores(
  rootType: string,
  rootPointer: string,
  value: JsIrObjectValue,
  path: readonly number[],
  context: EmitContext
): string[] {
  const lines: string[] = [];
  for (let i = 0; i < value.fields.length; i++) {
    const field = value.fields[i];
    const nextPath = [...path, i];
    if (field.value.kind === "object") {
      lines.push(...emitObjectFieldStores(rootType, rootPointer, field.value.value, nextPath, context));
      continue;
    }
    const pointer = emitObjectIndexedPointer(rootType, rootPointer, nextPath, context);
    const number = context.emitNumberExpression(field.value.value);
    lines.push(...pointer.lines, ...number.lines, `  store double ${number.value}, ptr ${pointer.value}`);
  }
  return lines;
}
