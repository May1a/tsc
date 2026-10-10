import type { BindingRef, ResolvedOperation } from "../binding-resolution/index.js";
import type { VariantOfKind } from "../dispatch.js";
import { type LlvmValue, llvm } from "../llvm-ir/index.js";
import type { OperationContext } from "./operation-context.js";
import { arrayPointer, keep } from "./value-support.js";
import type { BoxedValue } from "./value-boundary.js";

export type OperationNode<K extends ResolvedOperation["kind"]> = VariantOfKind<ResolvedOperation, K>;
export type OperationHandlers = {
  readonly [K in ResolvedOperation["kind"]]: (operation: OperationNode<K>, context: OperationContext) => void;
};

export interface OwnedAggregate {
  readonly pointer: LlvmValue<typeof llvm.ptr>;
  readonly value: BoxedValue;
}

export function ownAggregate(pointer: LlvmValue<typeof llvm.ptr>, kind: "array" | "object", context: OperationContext): OwnedAggregate {
  const value = keep(context.values.forBlock(context.cursor.currentBlock()).boxReference(kind, pointer), context);
  return { pointer, value };
}

export function initializeAggregate(
  reference: BindingRef, pointer: LlvmValue<typeof llvm.ptr>, kind: "array" | "object", context: OperationContext
): void {
  context.writes.storeValue(reference, ownAggregate(pointer, kind, context).value);
}

export function freshArray(length: number, context: OperationContext): OwnedAggregate {
  const pointer = context.runtime.callPointer("arrayNew", [integer(BigInt(length), context)], context.cursor.uniqueName("array.new"));
  return ownAggregate(pointer, "array", context);
}

export function integer(value: bigint, context: OperationContext): LlvmValue<typeof llvm.i64> {
  return context.cursor.currentBlock().int(llvm.i64, value);
}

export function objectPointer(reference: BindingRef, context: OperationContext): LlvmValue<typeof llvm.ptr> {
  const value = keep(context.bindings.value(reference), context);
  return context.runtime.callPointer("valueObjectPtr", [value], context.cursor.uniqueName("object.pointer"));
}

export { arrayPointer };
