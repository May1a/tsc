import type { HeapFacts } from "./gc.js";
import { type JsValueAbi, jsValueAbi } from "../js-value-abi/index.js";
import type { LlvmBlockBuilder, LlvmDoubleType, LlvmPointerType, LlvmValue, llvm } from "../llvm-ir/index.js";

export type BoxedValue = LlvmValue<typeof llvm.i64>;

export type ReferenceKind = Parameters<ReturnType<JsValueAbi["forLlvm"]>["boxReference"]>[0];

export type ImmediateKind = Parameters<ReturnType<JsValueAbi["forLlvm"]>["immediate"]>[0];

export interface BlockValueBoundary {
  fromBoundary(value: BoxedValue): BoxedValue;
  boxNumber(value: LlvmValue<LlvmDoubleType>): BoxedValue;
  unboxNumber(value: BoxedValue): LlvmValue<LlvmDoubleType>;
  boxReference(kind: ReferenceKind, pointer: LlvmValue<LlvmPointerType>): BoxedValue;
  unboxReference(value: BoxedValue): LlvmValue<LlvmPointerType>;
  immediate(kind: ImmediateKind): BoxedValue;
  arrayHole(): BoxedValue;
  isNumber(value: BoxedValue): LlvmValue<typeof llvm.i1>;
  isImmediate(value: BoxedValue, kind: ImmediateKind): LlvmValue<typeof llvm.i1>;
  isReference(value: BoxedValue, kind: ReferenceKind): LlvmValue<typeof llvm.i1>;
  isArrayHole(value: BoxedValue): LlvmValue<typeof llvm.i1>;
}

export interface ValueBoundary {
  readonly boundaryType: typeof llvm.i64;
  forBlock(block: LlvmBlockBuilder): BlockValueBoundary;
}

class BoundValues implements BlockValueBoundary {
  readonly #values: ReturnType<JsValueAbi["forLlvm"]>;
  readonly #facts: HeapFacts;

  public constructor(block: LlvmBlockBuilder, facts: HeapFacts) {
    this.#values = jsValueAbi.forLlvm(block);
    this.#facts = facts;
  }

  public fromBoundary(value: BoxedValue): BoxedValue {
    this.#facts.boxed(value);
    return this.#values.fromBoundary(value);
  }

  public boxNumber(value: LlvmValue<LlvmDoubleType>): BoxedValue {
    return this.#values.boxNumber(value);
  }

  public unboxNumber(value: BoxedValue): LlvmValue<LlvmDoubleType> {
    return this.#values.unboxNumber(this.#values.fromBoundary(value));
  }

  public boxReference(kind: ReferenceKind, pointer: LlvmValue<LlvmPointerType>): BoxedValue {
    const value = this.#values.boxReference(kind, pointer);
    this.#facts.boxed(value);
    this.#facts.reference(pointer, value);
    return value;
  }

  public unboxReference(value: BoxedValue): LlvmValue<LlvmPointerType> {
    const pointer = this.#values.unboxReference(this.#values.fromBoundary(value));
    this.#facts.reference(pointer, value);
    return pointer;
  }

  public immediate(kind: ImmediateKind): BoxedValue {
    return this.#values.immediate(kind);
  }

  public arrayHole(): BoxedValue {
    return this.#values.arrayHole();
  }

  public isNumber(value: BoxedValue): LlvmValue<typeof llvm.i1> {
    return this.#values.isNumber(this.#values.fromBoundary(value));
  }

  public isImmediate(value: BoxedValue, kind: ImmediateKind): LlvmValue<typeof llvm.i1> {
    return this.#values.isImmediate(this.#values.fromBoundary(value), kind);
  }

  public isReference(value: BoxedValue, kind: ReferenceKind): LlvmValue<typeof llvm.i1> {
    return this.#values.isReference(this.#values.fromBoundary(value), kind);
  }

  public isArrayHole(value: BoxedValue): LlvmValue<typeof llvm.i1> {
    return this.#values.isArrayHole(this.#values.fromBoundary(value));
  }
}

export function createValueBoundary(facts: HeapFacts): ValueBoundary {
  return Object.freeze({
    boundaryType: jsValueAbi.llvmBoundaryType,
    forBlock: (block: LlvmBlockBuilder) => new BoundValues(block, facts)
  });
}
