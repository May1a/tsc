import type { EmitContext, NumberValue } from "./context.js";
import { bindingSlotName, variablePointerName } from "./names.js";

/**
 * Loading the `ptr` out of the slot that holds a runtime array, collection or object.
 *
 * The three differ in one respect and it is the interesting one: an object may have a *layout*, in
 * which case its pointer is a field of that layout rather than the slot itself, while an array and a
 * collection are always just their slot. `context.objectLayouts` is what distinguishes a
 * known-shape object from an opaque one, so this is where the difference becomes an emitted `load`.
 *
 * They live together because that is the whole operation — a name in, a pointer out — and because
 * all three were inline at their call sites, each re-deriving `bindingSlotName` from the binding map.
 */

export function emitRuntimeArrayPointer(arrayName: string, context: EmitContext): NumberValue {
  const slotName = bindingSlotName(arrayName, context.bindings.get(arrayName));
  const index = context.arrayIndex;
  context.arrayIndex += 1;
  const value = `%arr.ptr.${index}`;
  return { lines: [`  ${value} = load ptr, ptr ${variablePointerName(slotName)}`], value };
}
export function emitRuntimeCollectionPointer(collectionName: string, context: EmitContext): NumberValue {
  const index = context.objectIndex;
  context.objectIndex += 1;
  const value = `%collection.ptr.${index}`;
  return { lines: [`  ${value} = load ptr, ptr ${variablePointerName(collectionName)}`], value };
}
export function emitRuntimeObjectPointer(objectName: string, context: EmitContext): NumberValue {
  const layout = context.objectLayouts.get(objectName);
  const slotName = bindingSlotName(objectName, context.bindings.get(objectName));
  const pointerName = layout?.runtimePointerName ?? variablePointerName(slotName);
  const index = context.objectIndex;
  context.objectIndex += 1;
  const value = `%obj.ptr.${index}`;
  return { lines: [`  ${value} = load ptr, ptr ${pointerName}`], value };
}
