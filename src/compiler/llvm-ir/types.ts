/**
 * Opaque pointers carry no pointee type. Named structs retain nominal identity;
 * literal structs compare their element types.
 */

const booleanBitWidth = 1;
const byteBitWidth = 8;
const integerBitWidth = 32;
const valueBitWidth = 64;
const doubleBits = 64;
const identifierPattern = /^[A-Za-z$._][\w$.-]*$/;
const exponentPattern = /e/i;
const unsignedExponentPattern = /^[+-]?\d+e[+-]?\d+$/i;
const integerTextPattern = /^[+-]?\d+$/;
const positiveInfinityBits = "0x7FF0000000000000";
const negativeInfinityBits = "0xFFF0000000000000";
const negativeZeroBits = "0x8000000000000000";
/** The quiet NaN IEEE-754 binary64 spells as; JS has one NaN, LLVM needs the bits. */
const quietNaNBits = "0x7FF8000000000000";

export type LlvmIntegerBitWidth =
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

export interface LlvmArrayType {
  readonly kind: "array";
  readonly element: LlvmValueType;
  readonly length: number;
}

/** Const element tuples retain positions, so extracting one element returns its precise type. */
export interface LlvmStructType<E extends readonly LlvmValueType[] = readonly LlvmValueType[]> {
  readonly kind: "struct";
  /** Present only for an identified struct; see `llvm.namedStruct`. */
  readonly name?: string;
  readonly elements: E;
}

/** The literal positions a struct's elements can be addressed by. */
export type LlvmStructIndex<T extends LlvmStructType> = keyof T["elements"] & number;

/** Tuple positions resolve to one element type; widened lists retain runtime position checks. */
export type LlvmStructElementAt<T extends LlvmStructType, I extends LlvmStructIndex<T>> = T["elements"][I];

export interface LlvmFunctionType {
  readonly kind: "function";
  readonly parameters: readonly LlvmValueType[];
  readonly returns: LlvmType;
  readonly variadic: boolean;
}

export type LlvmType = LlvmVoidType | LlvmValueType | LlvmFunctionType;

/** Types become immutable when the builder accepts them, including nested aggregate elements. */
export function freezeLlvmType<T extends LlvmType>(type: T): T {
  switch (type.kind) {
    case "array": {
      freezeLlvmType(type.element);
      break;
    }
    case "struct": {
      for (const element of type.elements) {
        freezeLlvmType(element);
      }
      Object.freeze(type.elements);
      break;
    }
    case "function": {
      for (const parameter of type.parameters) {
        freezeLlvmType(parameter);
      }
      Object.freeze(type.parameters);
      freezeLlvmType(type.returns);
      break;
    }
    case "void":
    case "integer":
    case "double":
    case "pointer": {
      break;
    }
    default: {
      const exhaustive: never = type;
      return exhaustive;
    }
  }
  Object.freeze(type);
  return type;
}

/** Void and function types are not first-class values. Function addresses use opaque pointers. */
export type LlvmValueType = LlvmIntegerType | LlvmDoubleType | LlvmPointerType | LlvmArrayType | LlvmStructType;
/** The types an instruction or constant operand may have. */
export type LlvmNumericType = LlvmIntegerType | LlvmDoubleType;

export interface LlvmValue<T extends LlvmValueType = LlvmValueType> {
  readonly type: T;
}

function internalError(message: string): Error {
  return new Error(`Internal compiler error: ${message}`);
}

/** Satisfies preserves literal integer widths required by i1 and other operand constraints. */
export const llvm = {
  void: { kind: "void" } satisfies LlvmVoidType,
  i1: { kind: "integer", bits: booleanBitWidth } satisfies LlvmIntegerType,
  i8: { kind: "integer", bits: byteBitWidth } satisfies LlvmIntegerType,
  i32: { kind: "integer", bits: integerBitWidth } satisfies LlvmIntegerType,
  i64: { kind: "integer", bits: valueBitWidth } satisfies LlvmIntegerType,
  double: { kind: "double" } satisfies LlvmDoubleType,
  ptr: { kind: "pointer" } satisfies LlvmPointerType,
  struct<const E extends readonly LlvmValueType[]>(elements: E): LlvmStructType<E> {
    return Object.freeze({ kind: "struct", elements: frozenStructElements(elements) });
  },
  namedStruct<const E extends readonly LlvmValueType[]>(name: string, elements: E): LlvmStructType<E> {
    if (!identifierPattern.test(name)) {
      throw internalError(`invalid LLVM type name ${name}`);
    }
    return Object.freeze({ kind: "struct", name, elements: frozenStructElements(elements) });
  },
  array(element: LlvmValueType, length: number): LlvmArrayType {
    // Zero is a real length: `[0 x i8]` is how an empty byte string and a zero-sized buffer are
    // spelled, and refusing it would push callers into an in-band sentinel they cannot emit anyway.
    if (!Number.isInteger(length) || length < 0) {
      throw internalError(`LLVM array length must be a non-negative integer, found ${length}`);
    }
    return Object.freeze({ kind: "array", element, length });
  },
  function(parameters: readonly LlvmValueType[], returns: LlvmType, variadic = false): LlvmFunctionType {
    return Object.freeze({ kind: "function", parameters: Object.freeze([...parameters]), returns, variadic });
  }
} as const;

function frozenStructElements<const E extends readonly LlvmValueType[]>(elements: E): E {
  if (elements.length === 0) {
    throw internalError("LLVM struct type requires at least one element");
  }
  // Freezing the caller's array rather than a copy: the elements are already the frozen `llvm.*`
  // constants or types this module produced, so a copy would only duplicate the same objects, and
  // freezing means a caller cannot mutate a struct's shape after handing it over.
  return Object.freeze(elements);
}

/** The precise LLVM `i1` type. Aliases the literal shape so callers need not repeat it. */
export interface LlvmBooleanType {
  readonly kind: "integer";
  readonly bits: 1;
}

export function isLlvmBooleanType(type: LlvmType): type is LlvmBooleanType {
  return type.kind === "integer" && type.bits === booleanBitWidth;
}

export function isLlvmIntegerType(type: LlvmType): type is LlvmIntegerType {
  return type.kind === "integer";
}

export function isLlvmDoubleType(type: LlvmType): type is LlvmDoubleType {
  return type.kind === "double";
}

export function isLlvmStructType(type: LlvmType): type is LlvmStructType {
  return type.kind === "struct";
}

/** Value width for bitcasts. Host validation requires 64-bit pointers. */
const pointerBitWidth = 64;

/** Accept LLVM's signed and unsigned spellings within the declared integer width. */
export function llvmIntegerFits(type: LlvmIntegerType, value: bigint): boolean {
  const minimum = -(1n << BigInt(type.bits - 1));
  const maximum = (1n << BigInt(type.bits)) - 1n;
  return value >= minimum && value <= maximum;
}

export function llvmTypeBitWidth(type: LlvmValueType): number {
  if (type.kind === "integer") {
    return type.bits;
  }
  if (type.kind === "double") {
    return doubleBits;
  }
  if (type.kind === "pointer") {
    return pointerBitWidth;
  }
  if (type.kind === "array") {
    return llvmTypeBitWidth(type.element) * type.length;
  }
  return type.elements.reduce((total, element) => total + llvmTypeBitWidth(element), 0);
}

/** Render infinities, NaN, and negative zero as IEEE-754 bits to preserve their exact values. */
export function renderLlvmDouble(value: number): string {
  if (Number.isNaN(value)) {
    return quietNaNBits;
  }
  if (value === Number.POSITIVE_INFINITY) {
    return positiveInfinityBits;
  }
  if (value === Number.NEGATIVE_INFINITY) {
    return negativeInfinityBits;
  }
  if (Object.is(value, -0)) {
    return negativeZeroBits;
  }
  const text = String(value);
  if (integerTextPattern.test(text)) {
    return `${text}.0`;
  }
  if (unsignedExponentPattern.test(text)) {
    return text.replace(exponentPattern, ".0e");
  }
  return text;
}

export function renderLlvmType(type: LlvmType): string {
  if (type.kind === "integer") {
    return `i${type.bits}`;
  }
  if (type.kind === "pointer") {
    return "ptr";
  }
  if (type.kind === "array") {
    return `[${type.length} x ${renderLlvmType(type.element)}]`;
  }
  if (type.kind === "function") {
    return renderLlvmCallableType(type);
  }
  if (type.kind === "struct") {
    return type.name === undefined ? renderLlvmStructBody(type) : `%${type.name}`;
  }
  return type.kind;
}

/** Render an identified struct's body only in its definition; references render its name. */
export function renderLlvmStructBody(type: LlvmStructType): string {
  if (type.elements.length === 0) {
    return "{}";
  }
  return `{ ${type.elements.map(renderLlvmType).join(", ")} }`;
}

/** `i32 (ptr, ...)`, the spelling a variadic call site and its declaration both need. */
export function renderLlvmCallableType(type: LlvmFunctionType): string {
  const fixed = type.parameters.map(renderLlvmType);
  const parameters = type.variadic ? [...fixed, "..."] : fixed;
  return `${renderLlvmType(type.returns)} (${parameters.join(", ")})`;
}

export function sameLlvmType(left: LlvmType, right: LlvmType): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  if (left.kind === "integer") {
    return right.kind === "integer" && left.bits === right.bits;
  }
  if (left.kind === "array") {
    return right.kind === "array" && left.length === right.length && sameLlvmType(left.element, right.element);
  }
  if (left.kind === "function") {
    if (right.kind !== "function" ||
      left.variadic !== right.variadic ||
      left.parameters.length !== right.parameters.length ||
      !sameLlvmType(left.returns, right.returns)) {
      return false;
    }
    for (let index = 0; index < left.parameters.length; index += 1) {
      if (!sameLlvmType(left.parameters[index], right.parameters[index])) {
        return false;
      }
    }
    return true;
  }
  if (left.kind === "struct") {
    if (right.kind !== "struct" || left.name !== right.name || left.elements.length !== right.elements.length) {
      return false;
    }
    return left.elements.every((element, index) => sameLlvmType(element, right.elements[index]));
  }
  return true;
}
