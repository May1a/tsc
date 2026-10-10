import {
  type LlvmType,
  freezeLlvmType,
  isLlvmIntegerType,
  llvmIntegerFits,
  renderLlvmDouble,
  renderLlvmType,
  sameLlvmType
} from "./types.js";

/** Typed global initializer data, validated before rendering. */
export type LlvmConstant =
  | { readonly kind: "integer"; readonly type: LlvmType; readonly value: bigint }
  | { readonly kind: "float"; readonly type: LlvmType; readonly value: number }
  | { readonly kind: "null"; readonly type: LlvmType }
  | { readonly kind: "undef"; readonly type: LlvmType }
  | { readonly kind: "zeroInitializer"; readonly type: LlvmType }
  | { readonly kind: "globalReference"; readonly type: LlvmType; readonly name: string }
  | { readonly kind: "byteString"; readonly length: number; readonly content: string }
  | { readonly kind: "aggregate"; readonly type: LlvmType; readonly elements: readonly LlvmConstant[] };

/** The three linkages the emitter uses. `external` renders bare; the others are named. */
export type LlvmLinkage = "private" | "internal" | "external";

export interface LlvmGlobalSpec {
  readonly name: string;
  readonly type: LlvmType;
  readonly linkage: LlvmLinkage;
  readonly constant: boolean;
  readonly unnamedAddress: boolean;
  readonly initializer: LlvmConstant;
}

export function freezeLlvmConstant(constant: LlvmConstant): LlvmConstant {
  if (constant.kind !== "byteString") {
    freezeLlvmType(constant.type);
  }
  if (constant.kind === "aggregate") {
    for (const element of constant.elements) {
      freezeLlvmConstant(element);
    }
    Object.freeze(constant.elements);
  }
  return Object.freeze(constant);
}

function internalError(message: string): Error {
  return new Error(`Internal compiler error: ${message}`);
}

const doubleQuoteByte = 34;
const backslashByte = 92;
const firstPrintableAsciiByte = 32;
const lastPrintableAsciiByte = 126;
const hexadecimalRadix = 16;
const byteTypeBits = 8;

export function renderLlvmConstant(constant: LlvmConstant): string {
  switch (constant.kind) {
    case "integer": {
      return constant.value.toString();
    }
    case "float": {
      return renderLlvmDouble(constant.value);
    }
    case "null": {
      return "null";
    }
    case "undef": {
      return "undef";
    }
    case "zeroInitializer": {
      return "zeroinitializer";
    }
    case "globalReference": {
      return `@${constant.name}`;
    }
    case "byteString": {
      return `c"${constant.content}"`;
    }
    case "aggregate": {
      return renderAggregate(constant);
    }
    default: {
      return unrenderableConstant(constant);
    }
  }
}

/** Fail if a constant variant has no renderer. */
function unrenderableConstant(constant: { readonly kind?: string }): string {
  const { kind } = constant;
  throw internalError(`no renderer for LLVM constant ${kind ?? "of unknown kind"}`);
}

function renderAggregate(constant: Extract<LlvmConstant, { readonly kind: "aggregate" }>): string {
  if (constant.elements.length === 0) {
    // A zero-length array has no elements to spell; `zeroinitializer` is the only accepted form,
    // where `[]` is a parse error on some LLVM versions.
    return "zeroinitializer";
  }
  const rendered = constant.elements.map((element) => `${renderLlvmType(llvmConstantType(element))} ${renderLlvmConstant(element)}`);
  return constant.type.kind === "struct" ? `{ ${rendered.join(", ")} }` : `[${rendered.join(", ")}]`;
}

/** A byte-string constant derives its [N x i8] type from its byte length. */
export function llvmConstantType(constant: LlvmConstant): LlvmType {
  return constant.kind === "byteString" ? { kind: "integer", bits: 8 } : constant.type;
}

/** Check initializer type, element count, integer range, and referenced globals before rendering. */
export function assertLlvmConstantFitsType(initializer: LlvmConstant, type: LlvmType, context: string): void {
  if (type.kind === "void" || type.kind === "function") {
    throw internalError(`${context} has type ${renderLlvmType(type)}, which is not a value type`);
  }
  switch (initializer.kind) {
    case "integer": {
      if (!isLlvmIntegerType(type) || !isLlvmIntegerType(initializer.type) || type.bits !== initializer.type.bits) {
        throw internalError(
          `${context} is an ${renderLlvmType(type)} but is initialized with an integer of type ${renderLlvmType(initializer.type)}`
        );
      }
      if (!llvmIntegerFits(type, initializer.value)) {
        throw internalError(`${context} is an ${renderLlvmType(type)} but is initialized with ${initializer.value}`);
      }
      return;
    }
    case "float": {
      if (!sameLlvmType(type, initializer.type) || type.kind !== "double") {
        throw internalError(
          `${context} is an ${renderLlvmType(type)} but is initialized with a float of type ${renderLlvmType(initializer.type)}`
        );
      }
      return;
    }
    case "null":
    case "globalReference": {
      if (type.kind !== "pointer") {
        throw internalError(`${context} is an ${renderLlvmType(type)} but is initialized with an address`);
      }
      return;
    }
    case "byteString": {
      const byteStringType: LlvmType = { kind: "array", element: { kind: "integer", bits: byteTypeBits }, length: initializer.length };
      if (!sameLlvmType(type, byteStringType)) {
        throw internalError(`${context} is an ${renderLlvmType(type)} but is initialized with a ${initializer.length}-byte string`);
      }
      return;
    }
    case "aggregate": {
      assertAggregateFits(initializer, type, context);
      return;
    }
    case "undef":
    case "zeroInitializer": {
      return;
    }
    default: {
      return uncheckableConstant(initializer);
    }
  }
}

function assertAggregateFits(
  initializer: Extract<LlvmConstant, { readonly kind: "aggregate" }>,
  type: LlvmType,
  context: string
): void {
  if (type.kind === "array") {
    if (initializer.type.kind !== "array") {
      throw internalError(`${context} is an array but is initialized with a struct`);
    }
    if (initializer.elements.length !== type.length) {
      throw internalError(
        `${context} is an ${renderLlvmType(type)} but is initialized with ${initializer.elements.length} element(s)`
      );
    }
    for (const [index, element] of initializer.elements.entries()) {
      assertLlvmConstantFitsType(element, type.element, `${context} element ${index}`);
    }
    return;
  }
  if (type.kind === "struct") {
    if (initializer.type.kind !== "struct") {
      throw internalError(`${context} is a struct but is initialized with an array`);
    }
    // The lengths are equal, so `at` returns a type for every index; the `undefined` case is the
    // defence-in-depth one, where the report names the aggregate rather than an absent position.
    if (initializer.elements.length !== type.elements.length) {
      throw internalError(
        `${context} is a ${renderLlvmType(type)} but is initialized with ${initializer.elements.length} element(s)`
      );
    }
    for (const [index, element] of initializer.elements.entries()) {
      assertLlvmConstantFitsType(element, type.elements.at(index) ?? type.elements[0], `${context} element ${index}`);
    }
    return;
  }
  throw internalError(`${context} is an ${renderLlvmType(type)} but is initialized with an aggregate`);
}

function uncheckableConstant(constant: { readonly kind?: string }): never {
  const { kind } = constant;
  throw internalError(`no type check for LLVM constant ${kind ?? "of unknown kind"}`);
}

/** Escape an LLVM byte-string literal and include its terminator in the byte length. */
export function encodeLlvmByteString(value: string): { readonly content: string; readonly length: number } {
  const bytes = [...Buffer.from(value, "utf8"), 0];
  const content = bytes.map((byte) => renderByte(byte)).join("");
  return { content, length: bytes.length };
}

function renderByte(byte: number): string {
  if (byte === doubleQuoteByte) {
    return String.raw`\22`;
  }
  if (byte === backslashByte) {
    return String.raw`\5C`;
  }
  if (byte >= firstPrintableAsciiByte && byte <= lastPrintableAsciiByte) {
    return String.fromCharCode(byte);
  }
  return `\\${byte.toString(hexadecimalRadix).toUpperCase().padStart(2, "0")}`;
}
