import type { LlvmBlockLabel, LlvmGepIndex } from "./labels.js";
import type { LlvmCallCallee } from "./signatures.js";
import type {
  LlvmBooleanType,
  LlvmDoubleType,
  LlvmIntegerType,
  LlvmPointerType,
  LlvmStructType,
  LlvmType,
  LlvmValue,
  LlvmValueType
} from "./types.js";

/** The closed instruction model. Operand and result types are shared where LLVM requires them;
 * there is no raw instruction text variant. */

/** A recorded switch case uses an owned block label. */
export interface LlvmSwitchCaseInstruction {
  readonly value: bigint;
  readonly target: LlvmBlockLabel;
}

/** One `(value, block)` pair of a recorded `phi`; see `LlvmSwitchCaseInstruction`. */
export interface LlvmPhiIncomingInstruction {
  readonly value: LlvmValue;
  readonly block: LlvmBlockLabel;
}

/** Where a line came from, carried on the instruction so the renderer needs no other state. */
export interface LlvmProvenance {
  readonly origin: string;
  readonly traceIds: readonly string[];
}

interface LlvmInstructionBase {
  readonly provenance: LlvmProvenance;
}

export type LlvmIntegerBinaryOpcode =
  | "add"
  | "sub"
  | "mul"
  | "sdiv"
  | "udiv"
  | "srem"
  | "urem"
  | "and"
  | "or"
  | "xor"
  | "shl"
  | "lshr"
  | "ashr";

export type LlvmFloatingPointBinaryOpcode = "fadd" | "fsub" | "fmul" | "fdiv" | "frem";

export type LlvmIntegerPredicate = "eq" | "ne" | "ugt" | "uge" | "ult" | "ule" | "sgt" | "sge" | "slt" | "sle";

export type LlvmFloatingPointPredicate =
  | "false"
  | "oeq"
  | "ogt"
  | "oge"
  | "olt"
  | "ole"
  | "one"
  | "ord"
  | "ueq"
  | "ugt"
  | "uge"
  | "ult"
  | "ule"
  | "une"
  | "uno"
  | "true";

export type LlvmCastOpcode =
  | "trunc"
  | "zext"
  | "sext"
  | "fptosi"
  | "fptoui"
  | "sitofp"
  | "uitofp"
  | "ptrtoint"
  | "inttoptr"
  | "bitcast";

export interface LlvmIntegerBinaryInstruction<T extends LlvmIntegerType> extends LlvmInstructionBase {
  readonly kind: "integerBinary";
  readonly opcode: LlvmIntegerBinaryOpcode;
  readonly type: T;
  readonly left: LlvmValue<T>;
  readonly right: LlvmValue<T>;
  readonly result: LlvmValue<T>;
}

export interface LlvmFloatingPointBinaryInstruction extends LlvmInstructionBase {
  readonly kind: "floatingPointBinary";
  readonly opcode: LlvmFloatingPointBinaryOpcode;
  readonly type: LlvmDoubleType;
  readonly left: LlvmValue<LlvmDoubleType>;
  readonly right: LlvmValue<LlvmDoubleType>;
  readonly result: LlvmValue<LlvmDoubleType>;
}

export interface LlvmFloatingPointUnaryInstruction extends LlvmInstructionBase {
  readonly kind: "floatingPointUnary";
  readonly opcode: "fneg";
  readonly type: LlvmDoubleType;
  readonly operand: LlvmValue<LlvmDoubleType>;
  readonly result: LlvmValue<LlvmDoubleType>;
}

export interface LlvmIntegerComparisonInstruction<T extends LlvmIntegerType> extends LlvmInstructionBase {
  readonly kind: "integerComparison";
  readonly predicate: LlvmIntegerPredicate;
  readonly type: T;
  readonly left: LlvmValue<T>;
  readonly right: LlvmValue<T>;
  readonly result: LlvmValue<LlvmBooleanType>;
}

export interface LlvmFloatingPointComparisonInstruction extends LlvmInstructionBase {
  readonly kind: "floatingPointComparison";
  readonly predicate: LlvmFloatingPointPredicate;
  readonly type: LlvmDoubleType;
  readonly left: LlvmValue<LlvmDoubleType>;
  readonly right: LlvmValue<LlvmDoubleType>;
  readonly result: LlvmValue<LlvmBooleanType>;
}

/** Cast operand and result types are inferred from the builder call. casts.ts checks opcode compatibility. */
export interface LlvmCastInstruction<S extends LlvmValueType, T extends LlvmValueType> extends LlvmInstructionBase {
  readonly kind: "cast";
  readonly opcode: LlvmCastOpcode;
  readonly sourceType: S;
  readonly targetType: T;
  readonly operand: LlvmValue<S>;
  readonly result: LlvmValue<T>;
}

export interface LlvmSelectInstruction<T extends LlvmValueType> extends LlvmInstructionBase {
  readonly kind: "select";
  readonly type: T;
  readonly condition: LlvmValue<LlvmBooleanType>;
  readonly whenTrue: LlvmValue<T>;
  readonly whenFalse: LlvmValue<T>;
  readonly result: LlvmValue<T>;
}

export interface LlvmAllocaInstruction extends LlvmInstructionBase {
  readonly kind: "alloca";
  readonly allocatedType: LlvmValueType;
  readonly count: LlvmValue<LlvmIntegerType> | undefined;
  readonly alignment: number | undefined;
  readonly result: LlvmValue<LlvmPointerType>;
}

export interface LlvmLoadInstruction<T extends LlvmValueType> extends LlvmInstructionBase {
  readonly kind: "load";
  readonly loadedType: T;
  readonly pointer: LlvmValue<LlvmPointerType>;
  readonly alignment: number | undefined;
  readonly result: LlvmValue<T>;
}

export interface LlvmStoreInstruction extends LlvmInstructionBase {
  readonly kind: "store";
  readonly value: LlvmValue;
  readonly pointer: LlvmValue<LlvmPointerType>;
  readonly alignment: number | undefined;
}

export interface LlvmGetElementPtrInstruction extends LlvmInstructionBase {
  readonly kind: "getElementPtr";
  readonly sourceType: LlvmValueType;
  readonly pointer: LlvmValue<LlvmPointerType>;
  readonly indexes: readonly LlvmGepIndex[];
  readonly result: LlvmValue<LlvmPointerType>;
}

export interface LlvmInsertValueInstruction<T extends LlvmStructType> extends LlvmInstructionBase {
  readonly kind: "insertValue";
  readonly aggregateType: T;
  readonly aggregate: LlvmValue<T>;
  readonly element: LlvmValue;
  readonly index: number;
  readonly result: LlvmValue<T>;
}

export interface LlvmExtractValueInstruction<T extends LlvmStructType> extends LlvmInstructionBase {
  readonly kind: "extractValue";
  readonly aggregateType: T;
  readonly aggregate: LlvmValue<T>;
  readonly index: number;
  readonly result: LlvmValue;
}

/** A `phi` that produces a value; the common case, kept apart so the `phi` cannot be built untyped. */
export interface LlvmPhiInstruction<T extends LlvmValueType> extends LlvmInstructionBase {
  readonly kind: "phi";
  readonly phiType: T;
  readonly incoming: readonly LlvmPhiIncomingInstruction[];
  readonly result: LlvmValue<T>;
}

export interface LlvmCallInstruction extends LlvmInstructionBase {
  readonly kind: "call";
  readonly callee: LlvmCallCallee;
  readonly arguments: readonly LlvmValue[];
  readonly result: LlvmValue | undefined;
}

export interface LlvmSwitchInstruction<T extends LlvmIntegerType> extends LlvmInstructionBase {
  readonly kind: "switch";
  readonly conditionType: T;
  readonly condition: LlvmValue<T>;
  readonly cases: readonly LlvmSwitchCaseInstruction[];
  readonly defaultTarget: LlvmBlockLabel;
}

export interface LlvmReturnInstruction extends LlvmInstructionBase {
  readonly kind: "return";
  readonly returnType: LlvmType;
  readonly value: LlvmValue | undefined;
}

export interface LlvmBranchInstruction extends LlvmInstructionBase {
  readonly kind: "branch";
  readonly target: LlvmBlockLabel;
}

export interface LlvmConditionalBranchInstruction extends LlvmInstructionBase {
  readonly kind: "conditionalBranch";
  readonly condition: LlvmValue<LlvmBooleanType>;
  readonly whenTrue: LlvmBlockLabel;
  readonly whenFalse: LlvmBlockLabel;
}

export interface LlvmUnreachableInstruction extends LlvmInstructionBase {
  readonly kind: "unreachable";
}

/**
 * The union, ordered the way the renderer dispatches it. Terminators are last because every other
 * member produces a value and `isLlvmTerminator` is the single question that separates the two.
 */
export type LlvmInstruction =
  | LlvmIntegerBinaryInstruction<LlvmIntegerType>
  | LlvmFloatingPointBinaryInstruction
  | LlvmFloatingPointUnaryInstruction
  | LlvmIntegerComparisonInstruction<LlvmIntegerType>
  | LlvmFloatingPointComparisonInstruction
  | LlvmCastInstruction<LlvmValueType, LlvmValueType>
  | LlvmSelectInstruction<LlvmValueType>
  | LlvmAllocaInstruction
  | LlvmLoadInstruction<LlvmValueType>
  | LlvmStoreInstruction
  | LlvmGetElementPtrInstruction
  | LlvmInsertValueInstruction<LlvmStructType>
  | LlvmExtractValueInstruction<LlvmStructType>
  | LlvmPhiInstruction<LlvmValueType>
  | LlvmCallInstruction
  | LlvmSwitchInstruction<LlvmIntegerType>
  | LlvmReturnInstruction
  | LlvmBranchInstruction
  | LlvmConditionalBranchInstruction
  | LlvmUnreachableInstruction;

export type LlvmInstructionKind = LlvmInstruction["kind"];

/** The SSA value defined by this instruction, if any. */
export function llvmInstructionResult(instruction: LlvmInstruction): LlvmValue | undefined {
  if (isLlvmTerminator(instruction)) {
    return undefined;
  }
  return "result" in instruction ? instruction.result : undefined;
}

/** Instructions that terminate a block. */
export type LlvmTerminator =
  | LlvmSwitchInstruction<LlvmIntegerType>
  | LlvmReturnInstruction
  | LlvmBranchInstruction
  | LlvmConditionalBranchInstruction
  | LlvmUnreachableInstruction;

export function isLlvmTerminator(instruction: LlvmInstruction): instruction is LlvmTerminator {
  return instruction.kind === "switch" ||
    instruction.kind === "return" ||
    instruction.kind === "branch" ||
    instruction.kind === "conditionalBranch" ||
    instruction.kind === "unreachable";
}

/** Operands in source order. Phi operands are read on incoming edges for dominance and liveness. */
export function llvmInstructionOperands(instruction: LlvmInstruction): readonly LlvmValue[] {
  return isLlvmTerminator(instruction) ? terminatorOperands(instruction) : valueOperands(instruction);
}

function valueOperands(instruction: LlvmInstruction): readonly LlvmValue[] {
  switch (instruction.kind) {
    case "integerBinary":
    case "floatingPointBinary":
    case "integerComparison":
    case "floatingPointComparison": {
      return [instruction.left, instruction.right];
    }
    case "floatingPointUnary":
    case "cast": {
      return [instruction.operand];
    }
    case "select": {
      return [instruction.condition, instruction.whenTrue, instruction.whenFalse];
    }
    case "alloca": {
      return instruction.count === undefined ? [] : [instruction.count];
    }
    case "load": {
      return [instruction.pointer];
    }
    case "store": {
      return [instruction.value, instruction.pointer];
    }
    case "getElementPtr": {
      return [instruction.pointer, ...instruction.indexes.flatMap(llvmGepOperands)];
    }
    case "insertValue": {
      return [instruction.aggregate, instruction.element];
    }
    case "extractValue": {
      return [instruction.aggregate];
    }
    case "phi": {
      return instruction.incoming.map((entry) => entry.value);
    }
    case "call": {
      const { callee, arguments: callArguments } = instruction;
      return callee.kind === "pointer" ? [callee.pointer, ...callArguments] : callArguments;
    }
    default: {
      return terminatorOperands(instruction);
    }
  }
}

function terminatorOperands(instruction: LlvmTerminator): readonly LlvmValue[] {
  switch (instruction.kind) {
    case "switch": {
      return [instruction.condition];
    }
    case "return": {
      return instruction.value === undefined ? [] : [instruction.value];
    }
    case "conditionalBranch": {
      return [instruction.condition];
    }
    case "branch":
    case "unreachable": {
      return [];
    }
    default: {
      return unlistedInstruction(instruction);
    }
  }
}

function unlistedInstruction(instruction: { readonly kind?: string }): readonly LlvmValue[] {
  const { kind } = instruction;
  throw new Error(`Internal compiler error: no operand list for LLVM instruction ${kind ?? "of unknown kind"}`);
}

/** A `getelementptr` index is an operand only when it is a register; a literal is part of the text. */
function llvmGepOperands(index: LlvmGepIndex): readonly LlvmValue[] {
  return typeof index.value === "bigint" ? [] : [index.value];
}

/** Includes repeated CFG edges, needed to validate phi incoming multiplicity. */
export function llvmInstructionTargets(instruction: LlvmInstruction): readonly LlvmBlockLabel[] {
  switch (instruction.kind) {
    case "branch": {
      return [instruction.target];
    }
    case "conditionalBranch": {
      return [instruction.whenTrue, instruction.whenFalse];
    }
    case "switch": {
      return [instruction.defaultTarget, ...instruction.cases.map((entry) => entry.target)];
    }
    default: {
      return [];
    }
  }
}
