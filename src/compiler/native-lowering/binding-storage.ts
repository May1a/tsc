import type { LlvmDoubleType, LlvmGlobalReference, LlvmPointerType, LlvmValue, llvm } from "../llvm-ir/index.js";

export type BindingStorage =
  | EnvironmentStorage
  | NumberSlotStorage
  | NumberRegisterStorage
  | StringSlotStorage
  | StringRegisterStorage
  | BooleanSlotStorage
  | BooleanRegisterStorage
  | BoxedSlotStorage
  | BoxedRegisterStorage
  | BoxedGlobalStorage
  | FixedArrayStorage
  | FixedObjectStorage
  | RuntimeArrayStorage
  | RuntimeObjectStorage
  | CollectionStorage
  | ClosureStorage
  | FunctionStorage;

export interface NumberSlotStorage {
  readonly kind: "numberSlot";
  readonly slot: LlvmValue<LlvmPointerType>;
}

export interface NumberRegisterStorage {
  readonly kind: "numberRegister";
  readonly value: LlvmValue<LlvmDoubleType>;
}

export interface StringSlotStorage {
  readonly kind: "stringSlot";
  readonly slot: LlvmValue<LlvmPointerType>;
  readonly lengthSlot: LlvmValue<LlvmPointerType>;
  readonly ownerSlot: LlvmValue<LlvmPointerType>;
}

export interface StringRegisterStorage {
  readonly kind: "stringRegister";
  readonly bytes: LlvmValue<LlvmPointerType>;
  readonly length: LlvmValue<typeof llvm.i64>;
}

export interface BooleanSlotStorage {
  readonly kind: "booleanSlot";
  readonly slot: LlvmValue<LlvmPointerType>;
}

export interface BooleanRegisterStorage {
  readonly kind: "booleanRegister";
  readonly value: LlvmValue<typeof llvm.i1>;
}

export interface BoxedSlotStorage {
  readonly kind: "boxedSlot";
  readonly slot: LlvmValue<LlvmPointerType>;
}

export interface BoxedRegisterStorage {
  readonly kind: "boxedRegister";
  readonly value: LlvmValue<typeof llvm.i64>;
}

export interface BoxedGlobalStorage {
  readonly kind: "boxedGlobal";
  readonly global: LlvmGlobalReference;
}

export interface FixedArrayStorage {
  readonly kind: "fixedArray";
  readonly length: number;
  readonly slot: LlvmValue<LlvmPointerType>;
}

export interface FixedObjectStorage {
  readonly kind: "fixedObject";
  readonly shadowed: boolean;
  readonly shadowSlot: LlvmValue<LlvmPointerType>;
  readonly fields: readonly {
    readonly key: string;
    readonly storage: NumberSlotStorage | FixedObjectStorage;
  }[];
}

export interface RuntimeArrayStorage {
  readonly kind: "runtimeArray";
  readonly slot: LlvmValue<LlvmPointerType>;
  readonly owner: LlvmValue<typeof llvm.i64>;
}

export interface RuntimeObjectStorage {
  readonly kind: "runtimeObject";
  readonly slot: LlvmValue<LlvmPointerType>;
  readonly owner: LlvmValue<typeof llvm.i64>;
}

export interface CollectionStorage {
  readonly kind: "collection";
  readonly collection: "map" | "set";
  readonly slot: LlvmValue<LlvmPointerType>;
  readonly owner: LlvmValue<typeof llvm.i64>;
}

export interface ClosureStorage {
  readonly kind: "closure";
  readonly code: LlvmValue<LlvmPointerType>;
  readonly environment: LlvmValue<LlvmPointerType>;
  readonly value: LlvmValue<typeof llvm.i64>;
}

export interface FunctionStorage {
  readonly kind: "function";
  readonly code: LlvmValue<LlvmPointerType>;
  readonly value: LlvmValue<typeof llvm.i64>;
}

export interface EnvironmentStorage {
  readonly kind: "environment";
  readonly cell: LlvmValue<LlvmPointerType>;
  readonly owner: LlvmValue<typeof llvm.i64>;
}
