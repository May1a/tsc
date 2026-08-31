import { type JsValueImmediateKind, type JsValueReferenceKind, jsValueLayout } from "./layout.js";
import { type LlvmBlockBuilder, type LlvmDoubleType, type LlvmPointerType, type LlvmValue, llvm } from "../llvm-ir/index.js";

declare const jsValueBrand: unique symbol;
export type LlvmJsValue = LlvmValue<typeof llvm.i64> & { readonly [jsValueBrand]: true };

function asJsValue(value: LlvmValue<typeof llvm.i64>): LlvmJsValue {
  // eslint-disable-next-line typescript/no-unsafe-type-assertion -- Only this ABI-owned adapter may brand boundary i64 values as JSValue.
  return value as LlvmJsValue;
}

export interface LlvmJsValues {
  fromBoundary(value: LlvmValue<typeof llvm.i64>): LlvmJsValue;
  immediate(kind: JsValueImmediateKind): LlvmJsValue;
  arrayHole(): LlvmJsValue;
  boxNumber(value: LlvmValue<LlvmDoubleType>): LlvmJsValue;
  unboxNumber(value: LlvmJsValue): LlvmValue<LlvmDoubleType>;
  boxReference(kind: JsValueReferenceKind, pointer: LlvmValue<LlvmPointerType>): LlvmJsValue;
  unboxReference(value: LlvmJsValue): LlvmValue<LlvmPointerType>;
  isReference(value: LlvmJsValue, kind: JsValueReferenceKind): LlvmValue<typeof llvm.i1>;
  isImmediate(value: LlvmJsValue, kind: JsValueImmediateKind): LlvmValue<typeof llvm.i1>;
  isArrayHole(value: LlvmJsValue): LlvmValue<typeof llvm.i1>;
  isNumber(value: LlvmJsValue): LlvmValue<typeof llvm.i1>;
}

export function llvmJsValues(block: LlvmBlockBuilder): LlvmJsValues {
  return {
    fromBoundary: asJsValue,
    immediate(kind) {
      return asJsValue(block.int(llvm.i64, jsValueLayout.immediates[kind]));
    },
    arrayHole() {
      return asJsValue(block.int(llvm.i64, jsValueLayout.internalSentinels.arrayHole));
    },
    boxNumber(value) {
      return asJsValue(block.bitcast(value, llvm.i64, "number.value"));
    },
    unboxNumber(value) {
      return block.bitcast(value, llvm.double, "number");
    },
    boxReference(kind, pointer) {
      const bits = block.ptrToInt(pointer, llvm.i64, "bits");
      const payload = block.and(bits, block.int(llvm.i64, jsValueLayout.payloadMask), "payload");
      return asJsValue(block.or(payload, block.int(llvm.i64, jsValueLayout.references[kind]), "value"));
    },
    unboxReference(value) {
      const payload = block.and(value, block.int(llvm.i64, jsValueLayout.payloadMask), "payload");
      return block.intToPtr(payload, "pointer");
    },
    isReference(value, kind) {
      const tag = block.and(value, block.int(llvm.i64, jsValueLayout.tagMask), "tag");
      return block.icmp("eq", tag, block.int(llvm.i64, jsValueLayout.references[kind]), `is.${kind}`);
    },
    isImmediate(value, kind) {
      return block.icmp("eq", value, block.int(llvm.i64, jsValueLayout.immediates[kind]), `is.${kind}`);
    },
    isArrayHole(value) {
      return block.icmp("eq", value, block.int(llvm.i64, jsValueLayout.internalSentinels.arrayHole), "is.array.hole");
    },
    isNumber(value) {
      const tag = block.and(value, block.int(llvm.i64, jsValueLayout.tagMask), "number.tag");
      const atOrAboveReserved = block.icmp("uge", tag, block.int(llvm.i64, jsValueLayout.references.object), "number.tag.at.reserved");
      const atOrBelowReserved = block.icmp("ule", tag, block.int(llvm.i64, jsValueLayout.reservedTagMaximum), "number.tag.below.reserved");
      const isReserved = block.and(atOrAboveReserved, atOrBelowReserved, "number.is.reserved");
      return block.xor(isReserved, block.int(llvm.i1, 1n), "is.number");
    }
  };
}
