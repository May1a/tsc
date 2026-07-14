const booleanBitWidth = 1;
const byteBitWidth = 8;
const integerBitWidth = 32;
const valueBitWidth = 64;

type LlvmIntegerBitWidth =
  | typeof booleanBitWidth
  | typeof byteBitWidth
  | typeof integerBitWidth
  | typeof valueBitWidth;

export type LlvmVoidType = {
  readonly kind: "void";
};

export type LlvmIntegerType = {
  readonly kind: "integer";
  readonly bits: LlvmIntegerBitWidth;
};

export type LlvmDoubleType = {
  readonly kind: "double";
};

export type LlvmPointerType = {
  readonly kind: "pointer";
};

export type LlvmType = LlvmVoidType | LlvmIntegerType | LlvmDoubleType | LlvmPointerType;
export type LlvmValueType = Exclude<LlvmType, LlvmVoidType>;

export type LlvmValue<T extends LlvmValueType = LlvmValueType> = {
  readonly type: T;
};

export const llvm = {
  void: { kind: "void" } as LlvmVoidType,
  i1: { kind: "integer", bits: booleanBitWidth } as LlvmIntegerType,
  i8: { kind: "integer", bits: byteBitWidth } as LlvmIntegerType,
  i32: { kind: "integer", bits: integerBitWidth } as LlvmIntegerType,
  i64: { kind: "integer", bits: valueBitWidth } as LlvmIntegerType,
  double: { kind: "double" } as LlvmDoubleType,
  ptr: { kind: "pointer" } as LlvmPointerType
} as const;

export function renderLlvmType(type: LlvmType): string {
  if (type.kind === "integer") {
    return `i${type.bits}`;
  }
  if (type.kind === "pointer") {
    return "ptr";
  }
  return type.kind;
}

export function sameLlvmType(left: LlvmType, right: LlvmType): boolean {
  return left.kind === right.kind && (left.kind !== "integer" || (right.kind === "integer" && left.bits === right.bits));
}
