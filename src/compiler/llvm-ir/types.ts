const booleanBitWidth = 1;
const byteBitWidth = 8;
const integerBitWidth = 32;
const valueBitWidth = 64;

type LlvmIntegerBitWidth =
  | typeof booleanBitWidth
  | typeof byteBitWidth
  | typeof integerBitWidth
  | typeof valueBitWidth;

export interface LlvmVoidType {
  readonly kind: "void";
}

export interface LlvmIntegerType {
  readonly kind: "integer";
  readonly bits: LlvmIntegerBitWidth;
}

export interface LlvmDoubleType {
  readonly kind: "double";
}

export interface LlvmPointerType {
  readonly kind: "pointer";
}

export interface LlvmStructType {
  readonly kind: "struct";
  readonly elements: readonly LlvmValueType[];
}

export type LlvmType = LlvmVoidType | LlvmIntegerType | LlvmDoubleType | LlvmPointerType | LlvmStructType;
export type LlvmValueType = Exclude<LlvmType, LlvmVoidType>;
export type LlvmStructElementType<T extends LlvmStructType> = T["elements"][number];

export interface LlvmValue<T extends LlvmValueType = LlvmValueType> {
  readonly type: T;
}

// The integer constants use `satisfies`, not `as`. Widening them to
// `LlvmIntegerType` would erase the literal bit width, so `LlvmValue<typeof llvm.i1>`
// would mean "any integer" and `select`/`icmp`'s i1 constraint would stop binding.
export const llvm = {
  void: { kind: "void" } satisfies LlvmVoidType,
  i1: { kind: "integer", bits: booleanBitWidth } satisfies LlvmIntegerType,
  i8: { kind: "integer", bits: byteBitWidth } satisfies LlvmIntegerType,
  i32: { kind: "integer", bits: integerBitWidth } satisfies LlvmIntegerType,
  i64: { kind: "integer", bits: valueBitWidth } satisfies LlvmIntegerType,
  double: { kind: "double" } satisfies LlvmDoubleType,
  ptr: { kind: "pointer" } satisfies LlvmPointerType,
  struct(elements: readonly LlvmValueType[]): LlvmStructType {
    if (elements.length === 0) {
      throw new Error("Internal compiler error: LLVM struct type requires at least one element");
    }
    return Object.freeze({ kind: "struct", elements: Object.freeze([...elements]) });
  }
} as const;

/** The precise LLVM `i1` type. Aliases the literal shape so callers need not repeat it. */
export interface LlvmBooleanType {
  readonly kind: "integer";
  readonly bits: 1;
}

export function renderLlvmType(type: LlvmType): string {
  if (type.kind === "integer") {
    return `i${type.bits}`;
  }
  if (type.kind === "pointer") {
    return "ptr";
  }
  if (type.kind === "struct") {
    if (type.elements.length === 0) {
      return "{}";
    }
    return `{ ${type.elements.map(renderLlvmType).join(", ")} }`;
  }
  return type.kind;
}

export function sameLlvmType(left: LlvmType, right: LlvmType): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  if (left.kind === "integer") {
    return right.kind === "integer" && left.bits === right.bits;
  }
  if (left.kind === "struct") {
    if (right.kind !== "struct") {
      return false;
    }
    if (left.elements.length !== right.elements.length) {
      return false;
    }
    for (let index = 0; index < left.elements.length; index += 1) {
      if (!sameLlvmType(left.elements[index], right.elements[index])) {
        return false;
      }
    }
    return true;
  }
  return true;
}
