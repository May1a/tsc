import type { LlvmCastInstruction } from "./instructions.js";
import { type LlvmIntegerType, type LlvmValueType, llvmTypeBitWidth, renderLlvmType } from "./types.js";

export type LlvmCastOpcode = LlvmCastInstruction<LlvmValueType, LlvmValueType>["opcode"];

export function isCastAllowed(opcode: LlvmCastOpcode, source: LlvmValueType, target: LlvmValueType): boolean {
  if (opcode === "bitcast") {
    return isBitcastCompatible(source, target);
  }
  if (isInteger(source) && isInteger(target)) {
    return isIntegerCastAllowed(opcode, source, target);
  }
  if (source.kind === "double" && isInteger(target)) {
    return opcode === "fptosi" || opcode === "fptoui";
  }
  if (isInteger(source) && target.kind === "double") {
    return opcode === "sitofp" || opcode === "uitofp";
  }
  if (source.kind === "pointer" && isInteger(target)) {
    return opcode === "ptrtoint";
  }
  return isInteger(source) && target.kind === "pointer" && opcode === "inttoptr";
}

function isIntegerCastAllowed(opcode: LlvmCastOpcode, source: LlvmIntegerType, target: LlvmIntegerType): boolean {
  if (opcode === "trunc") {
    return target.bits < source.bits;
  }
  if (opcode === "zext" || opcode === "sext") {
    return target.bits > source.bits;
  }
  return false;
}

// A bitcast preserves width. Integer widening requires zext or sext.
export function isBitcastCompatible(source: LlvmValueType, target: LlvmValueType): boolean {
  if (source.kind === "struct" || target.kind === "struct" || source.kind === "array" || target.kind === "array") {
    return false;
  }
  return llvmTypeBitWidth(source) === llvmTypeBitWidth(target);
}

export function castFailure(opcode: LlvmCastOpcode, source: LlvmValueType, target: LlvmValueType): string {
  return `invalid LLVM ${opcode} from ${renderLlvmType(source)} to ${renderLlvmType(target)}`;
}

function isInteger(type: LlvmValueType): type is LlvmIntegerType {
  return type.kind === "integer";
}
