import { type LlvmCastOpcode, castFailure, isBitcastCompatible, isCastAllowed } from "./casts.js";
import type { BuiltLlvmBlock } from "./built.js";
import {
  type LlvmBlockLabel,
  type LlvmGepIndex,
  type LlvmPhiIncoming,
  type LlvmSwitchCase,
  assertBlockLabel
} from "./labels.js";
import {
  type LlvmCastInstruction,
  type LlvmFloatingPointBinaryInstruction,
  type LlvmFloatingPointComparisonInstruction,
  type LlvmInstruction,
  type LlvmIntegerBinaryInstruction,
  type LlvmIntegerComparisonInstruction,
  type LlvmPhiIncomingInstruction,
  type LlvmProvenance,
  type LlvmSwitchCaseInstruction,
  llvmInstructionOperands,
  llvmInstructionResult,
  llvmInstructionTargets
} from "./instructions.js";
import type { LlvmGlobalReference } from "./module-items.js";
import { TraceStack } from "./traces.js";
import {
  type LlvmCallArguments,
  type LlvmCallCallee,
  type LlvmCallSignature,
  type LlvmFunctionSpec,
  type LlvmIndirectCallArguments,
  type LlvmOwnedCallable,
  freezeLlvmCallSignature
} from "./signatures.js";
import {
  type LlvmBooleanType,
  type LlvmDoubleType,
  type LlvmIntegerType,
  type LlvmPointerType,
  type LlvmStructElementAt,
  type LlvmStructIndex,
  type LlvmStructType,
  type LlvmType,
  type LlvmValue,
  type LlvmValueType,
  freezeLlvmType,
  llvm,
  llvmIntegerFits,
  renderLlvmDouble,
  renderLlvmType,
  sameLlvmType
} from "./types.js";
import { createLlvmValue, defineLlvmValue, llvmValueData, llvmValueText } from "./values.js";

const llvmNamePattern = /^[A-Za-z$._][\w$.-]*$/;

/** Function-owned services available to a block. Whole-function dominance is checked at finish. */
export interface BlockContext {
  readonly origin: string;
  readonly label: LlvmBlockLabel;
  readonly returnType: LlvmType;
  /** The identity every operand handle must carry to be readable in this function. */
  readonly functionOwner: symbol;
  /** Queries the function's current trace regions, including regions opened after this block. */
  activeTraceIds(): readonly string[];
  /** Reserves an unused SSA name derived from `hint` and returns it with its `%`. */
  allocateName(hint: string): string;
  /** Appends one validated instruction and returns its index in this block. */
  record(instruction: LlvmInstruction): number;
  /** The instructions recorded so far, in emission order. */
  instructions(): readonly LlvmInstruction[];
  /** What the module recorded for a declared spec, rejecting one from another module. */
  callee(spec: LlvmFunctionSpec): LlvmOwnedCallable;
  /** Resolves an owned function address, rejecting foreign or unregistered specs. */
  functionName(spec: LlvmFunctionSpec): string;
  /** The `@name` a global reference resolves to, rejecting a reference from another module. */
  globalName(reference: LlvmGlobalReference): string;
}

/**
 * What a closed block hands back: the public block shape, plus the two edge sets the function-level
 * checks need and the renderer has no use for.
 */
export interface RecordedBlock extends BuiltLlvmBlock {
  /** Block names this block's terminators transfer to. */
  readonly successors: readonly string[];
  /** Block names this block's `phi`s read a value from. */
  readonly phiSources: readonly string[];
}

/** Validates operands and records typed instructions from the closed union. */
export interface LlvmBlockBuilder {
  readonly label: LlvmBlockLabel;
  readonly terminated: boolean;
  int<T extends LlvmIntegerType>(type: T, value: bigint): LlvmValue<T>;
  double(value: number): LlvmValue<LlvmDoubleType>;
  undef<T extends LlvmValueType>(type: T, name: string): LlvmValue<T>;
  nullPtr(): LlvmValue<LlvmPointerType>;
  globalPointer(reference: LlvmGlobalReference): LlvmValue<LlvmPointerType>;
  /** Returns an owned function address constant, usable throughout this function. */
  functionPointer(spec: LlvmFunctionSpec): LlvmValue<LlvmPointerType>;
  ptrToInt<T extends LlvmIntegerType>(value: LlvmValue<LlvmPointerType>, type: T, name: string): LlvmValue<T>;
  intToPtr<T extends LlvmIntegerType>(value: LlvmValue<T>, name: string): LlvmValue<LlvmPointerType>;
  bitcast<S extends LlvmValueType, T extends LlvmValueType>(value: LlvmValue<S>, type: T, name: string): LlvmValue<T>;
  cast<S extends LlvmValueType, T extends LlvmValueType>(
    opcode: LlvmCastOpcode,
    value: LlvmValue<S>,
    type: T,
    name: string
  ): LlvmValue<T>;
  add<T extends LlvmIntegerType>(left: LlvmValue<T>, right: LlvmValue<T>, name: string): LlvmValue<T>;
  subtract<T extends LlvmIntegerType>(left: LlvmValue<T>, right: LlvmValue<T>, name: string): LlvmValue<T>;
  multiply<T extends LlvmIntegerType>(left: LlvmValue<T>, right: LlvmValue<T>, name: string): LlvmValue<T>;
  and<T extends LlvmIntegerType>(left: LlvmValue<T>, right: LlvmValue<T>, name: string): LlvmValue<T>;
  or<T extends LlvmIntegerType>(left: LlvmValue<T>, right: LlvmValue<T>, name: string): LlvmValue<T>;
  xor<T extends LlvmIntegerType>(left: LlvmValue<T>, right: LlvmValue<T>, name: string): LlvmValue<T>;
  shiftLeft<T extends LlvmIntegerType>(left: LlvmValue<T>, right: LlvmValue<T>, name: string): LlvmValue<T>;
  shiftRightArithmetic<T extends LlvmIntegerType>(left: LlvmValue<T>, right: LlvmValue<T>, name: string): LlvmValue<T>;
  shiftRightLogical<T extends LlvmIntegerType>(left: LlvmValue<T>, right: LlvmValue<T>, name: string): LlvmValue<T>;
  divideSigned<T extends LlvmIntegerType>(left: LlvmValue<T>, right: LlvmValue<T>, name: string): LlvmValue<T>;
  divideUnsigned<T extends LlvmIntegerType>(left: LlvmValue<T>, right: LlvmValue<T>, name: string): LlvmValue<T>;
  remainderSigned<T extends LlvmIntegerType>(left: LlvmValue<T>, right: LlvmValue<T>, name: string): LlvmValue<T>;
  remainderUnsigned<T extends LlvmIntegerType>(left: LlvmValue<T>, right: LlvmValue<T>, name: string): LlvmValue<T>;
  fadd(left: LlvmValue<LlvmDoubleType>, right: LlvmValue<LlvmDoubleType>, name: string): LlvmValue<LlvmDoubleType>;
  fsub(left: LlvmValue<LlvmDoubleType>, right: LlvmValue<LlvmDoubleType>, name: string): LlvmValue<LlvmDoubleType>;
  fmul(left: LlvmValue<LlvmDoubleType>, right: LlvmValue<LlvmDoubleType>, name: string): LlvmValue<LlvmDoubleType>;
  fdiv(left: LlvmValue<LlvmDoubleType>, right: LlvmValue<LlvmDoubleType>, name: string): LlvmValue<LlvmDoubleType>;
  frem(left: LlvmValue<LlvmDoubleType>, right: LlvmValue<LlvmDoubleType>, name: string): LlvmValue<LlvmDoubleType>;
  fneg(operand: LlvmValue<LlvmDoubleType>, name: string): LlvmValue<LlvmDoubleType>;
  icmp<T extends LlvmIntegerType>(
    predicate: LlvmIntegerComparisonInstruction<T>["predicate"],
    left: LlvmValue<T>,
    right: LlvmValue<T>,
    name: string
  ): LlvmValue<LlvmBooleanType>;
  fcmp(
    predicate: LlvmFloatingPointComparisonInstruction["predicate"],
    left: LlvmValue<LlvmDoubleType>,
    right: LlvmValue<LlvmDoubleType>,
    name: string
  ): LlvmValue<LlvmBooleanType>;
  select<T extends LlvmValueType>(condition: LlvmValue<LlvmBooleanType>, whenTrue: LlvmValue<T>, whenFalse: LlvmValue<T>, name: string): LlvmValue<T>;
  alloca(type: LlvmValueType, name: string): LlvmValue<LlvmPointerType>;
  allocaArray(type: LlvmValueType, count: LlvmValue<LlvmIntegerType>, name: string): LlvmValue<LlvmPointerType>;
  load<T extends LlvmValueType>(type: T, pointer: LlvmValue<LlvmPointerType>, name: string): LlvmValue<T>;
  store(value: LlvmValue, pointer: LlvmValue<LlvmPointerType>): void;
  gepBytes(pointer: LlvmValue<LlvmPointerType>, offset: LlvmValue<LlvmIntegerType>, name: string): LlvmValue<LlvmPointerType>;
  getElementPtr(sourceType: LlvmValueType, pointer: LlvmValue<LlvmPointerType>, indexes: readonly LlvmGepIndex[], name: string): LlvmValue<LlvmPointerType>;
  insertValue<T extends LlvmStructType, I extends LlvmStructIndex<T>>(
    aggregate: LlvmValue<T>,
    element: LlvmValue<LlvmStructElementAt<T, I>>,
    index: I,
    name: string
  ): LlvmValue<T>;
  extractValue<T extends LlvmStructType, I extends LlvmStructIndex<T>>(
    aggregate: LlvmValue<T>,
    index: I,
    name: string
  ): LlvmValue<LlvmStructElementAt<T, I>>;
  phi<T extends LlvmValueType>(type: T, incoming: readonly LlvmPhiIncoming[], name: string): LlvmValue<T>;
  /**
 * Call arguments retain signature tuple positions. No overload may accept a wider argument list,
   * because overload resolution would bypass the tuple checks.
 */
  call<T extends LlvmValueType, Spec extends LlvmFunctionSpec & { readonly returns: T }>(
    spec: Spec,
    arguments_: LlvmCallArguments<Spec>,
    name: string
  ): LlvmValue<T>;
  call<Spec extends LlvmFunctionSpec>(spec: Spec, arguments_: LlvmCallArguments<Spec>): LlvmValue | undefined;
  callIndirect<T extends LlvmValueType, Signature extends LlvmCallSignature & { readonly returns: T }>(
    pointer: LlvmValue<LlvmPointerType>,
    signature: Signature,
    arguments_: LlvmIndirectCallArguments<Signature>,
    name: string
  ): LlvmValue<T>;
  callIndirect<Signature extends LlvmCallSignature>(
    pointer: LlvmValue<LlvmPointerType>,
    signature: Signature,
    arguments_: LlvmIndirectCallArguments<Signature>
  ): LlvmValue | undefined;
  switchInstruction<T extends LlvmIntegerType>(condition: LlvmValue<T>, cases: readonly LlvmSwitchCase[], defaultTarget: LlvmBlockLabel): void;
  br(target: LlvmBlockLabel): void;
  condBr(condition: LlvmValue<LlvmBooleanType>, whenTrue: LlvmBlockLabel, whenFalse: LlvmBlockLabel): void;
  ret(value?: LlvmValue): void;
  unreachable(): void;
  withTrace<A>(traceId: string, build: () => A): A;
}

/** Checks operand ownership and types immediately. Dominance and phi incoming edges are checked at function finish. */
export class BlockBuilder implements LlvmBlockBuilder {
  readonly #context: BlockContext;
  readonly #blockOwner: symbol;
  readonly #successors: Set<string> = new Set<string>();
  readonly #phiSources: Set<string> = new Set<string>();
  /** Trace regions local to this block; the function's own regions are read from the context. */
  readonly #localTraces = new TraceStack();
  #active = true;
  #terminated = false;

  public get terminated(): boolean { return this.#terminated; }

  public constructor(context: BlockContext, blockOwner: symbol) {
    this.#context = context;
    this.#blockOwner = blockOwner;
  }

  public get label(): LlvmBlockLabel {
    return this.#context.label;
  }

  public int<T extends LlvmIntegerType>(type: T, value: bigint): LlvmValue<T> {
    this.#assertActive();
    assertIntegerFits(type, value);
    return this.#constant(type, value.toString());
  }

  public double(value: number): LlvmValue<LlvmDoubleType> {
    this.#assertActive();
    return this.#constant(llvm.double, renderLlvmDouble(value));
  }

  /** Undef is a literal with no instruction. Its requested name is reserved for later construction. */
  public undef<T extends LlvmValueType>(type: T, name: string): LlvmValue<T> {
    this.#assertActive();
    this.#context.allocateName(assertNameHint(name));
    return this.#constant(type, "undef");
  }

  public nullPtr(): LlvmValue<LlvmPointerType> {
    this.#assertActive();
    return this.#constant(llvm.ptr, "null");
  }

  public globalPointer(reference: LlvmGlobalReference): LlvmValue<LlvmPointerType> {
    this.#assertActive();
    return this.#constant(llvm.ptr, `@${this.#context.globalName(reference)}`);
  }

  public functionPointer(spec: LlvmFunctionSpec): LlvmValue<LlvmPointerType> {
    this.#assertActive();
    return this.#constant(llvm.ptr, `@${this.#context.functionName(spec)}`);
  }

  public ptrToInt<T extends LlvmIntegerType>(value: LlvmValue<LlvmPointerType>, type: T, name: string): LlvmValue<T> {
    this.#assertOperand(value, llvm.ptr);
    const result = this.#named(type, name);
    this.#emit(this.#cast("ptrtoint", llvm.ptr, value, type, result));
    return result;
  }

  public intToPtr<T extends LlvmIntegerType>(value: LlvmValue<T>, name: string): LlvmValue<LlvmPointerType> {
    this.#assertOperand(value, value.type);
    const result = this.#named(llvm.ptr, name);
    this.#emit(this.#cast("inttoptr", value.type, value, llvm.ptr, result));
    return result;
  }

  public bitcast<S extends LlvmValueType, T extends LlvmValueType>(value: LlvmValue<S>, type: T, name: string): LlvmValue<T> {
    this.#assertOperand(value, value.type);
    if (!isBitcastCompatible(value.type, type)) {
      throw llvmError(castFailure("bitcast", value.type, type));
    }
    const result = this.#named(type, name);
    this.#emit(this.#cast("bitcast", value.type, value, type, result));
    return result;
  }

  public cast<S extends LlvmValueType, T extends LlvmValueType>(opcode: LlvmCastOpcode, value: LlvmValue<S>, type: T, name: string): LlvmValue<T> {
    this.#assertOperand(value, value.type);
    if (!isCastAllowed(opcode, value.type, type)) {
      throw llvmError(castFailure(opcode, value.type, type));
    }
    const result = this.#named(type, name);
    this.#emit(this.#cast(opcode, value.type, value, type, result));
    return result;
  }

  public add<T extends LlvmIntegerType>(left: LlvmValue<T>, right: LlvmValue<T>, name: string): LlvmValue<T> {
    return this.#integerBinary("add", left, right, name);
  }

  public subtract<T extends LlvmIntegerType>(left: LlvmValue<T>, right: LlvmValue<T>, name: string): LlvmValue<T> {
    return this.#integerBinary("sub", left, right, name);
  }

  public multiply<T extends LlvmIntegerType>(left: LlvmValue<T>, right: LlvmValue<T>, name: string): LlvmValue<T> {
    return this.#integerBinary("mul", left, right, name);
  }

  public and<T extends LlvmIntegerType>(left: LlvmValue<T>, right: LlvmValue<T>, name: string): LlvmValue<T> {
    return this.#integerBinary("and", left, right, name);
  }

  public or<T extends LlvmIntegerType>(left: LlvmValue<T>, right: LlvmValue<T>, name: string): LlvmValue<T> {
    return this.#integerBinary("or", left, right, name);
  }

  public xor<T extends LlvmIntegerType>(left: LlvmValue<T>, right: LlvmValue<T>, name: string): LlvmValue<T> {
    return this.#integerBinary("xor", left, right, name);
  }

  public shiftLeft<T extends LlvmIntegerType>(left: LlvmValue<T>, right: LlvmValue<T>, name: string): LlvmValue<T> {
    return this.#integerBinary("shl", left, right, name);
  }

  public shiftRightArithmetic<T extends LlvmIntegerType>(left: LlvmValue<T>, right: LlvmValue<T>, name: string): LlvmValue<T> {
    return this.#integerBinary("ashr", left, right, name);
  }

  public shiftRightLogical<T extends LlvmIntegerType>(left: LlvmValue<T>, right: LlvmValue<T>, name: string): LlvmValue<T> {
    return this.#integerBinary("lshr", left, right, name);
  }

  public divideSigned<T extends LlvmIntegerType>(left: LlvmValue<T>, right: LlvmValue<T>, name: string): LlvmValue<T> {
    return this.#integerBinary("sdiv", left, right, name);
  }

  public divideUnsigned<T extends LlvmIntegerType>(left: LlvmValue<T>, right: LlvmValue<T>, name: string): LlvmValue<T> {
    return this.#integerBinary("udiv", left, right, name);
  }

  public remainderSigned<T extends LlvmIntegerType>(left: LlvmValue<T>, right: LlvmValue<T>, name: string): LlvmValue<T> {
    return this.#integerBinary("srem", left, right, name);
  }

  public remainderUnsigned<T extends LlvmIntegerType>(left: LlvmValue<T>, right: LlvmValue<T>, name: string): LlvmValue<T> {
    return this.#integerBinary("urem", left, right, name);
  }

  public fadd(left: LlvmValue<LlvmDoubleType>, right: LlvmValue<LlvmDoubleType>, name: string): LlvmValue<LlvmDoubleType> {
    return this.#floatBinary("fadd", left, right, name);
  }

  public fsub(left: LlvmValue<LlvmDoubleType>, right: LlvmValue<LlvmDoubleType>, name: string): LlvmValue<LlvmDoubleType> {
    return this.#floatBinary("fsub", left, right, name);
  }

  public fmul(left: LlvmValue<LlvmDoubleType>, right: LlvmValue<LlvmDoubleType>, name: string): LlvmValue<LlvmDoubleType> {
    return this.#floatBinary("fmul", left, right, name);
  }

  public fdiv(left: LlvmValue<LlvmDoubleType>, right: LlvmValue<LlvmDoubleType>, name: string): LlvmValue<LlvmDoubleType> {
    return this.#floatBinary("fdiv", left, right, name);
  }

  public frem(left: LlvmValue<LlvmDoubleType>, right: LlvmValue<LlvmDoubleType>, name: string): LlvmValue<LlvmDoubleType> {
    return this.#floatBinary("frem", left, right, name);
  }

  public fneg(operand: LlvmValue<LlvmDoubleType>, name: string): LlvmValue<LlvmDoubleType> {
    this.#assertOperand(operand, llvm.double);
    const result = this.#named(llvm.double, name);
    this.#emit({
      kind: "floatingPointUnary",
      opcode: "fneg",
      type: llvm.double,
      operand,
      result,
      provenance: this.#provenance()
    });
    return result;
  }

  public icmp<T extends LlvmIntegerType>(
    predicate: LlvmIntegerComparisonInstruction<T>["predicate"],
    left: LlvmValue<T>,
    right: LlvmValue<T>,
    name: string
  ): LlvmValue<LlvmBooleanType> {
    this.#assertOperand(left, left.type);
    this.#assertOperand(right, left.type);
    const result = this.#named(llvm.i1, name);
    this.#emit({ kind: "integerComparison", predicate, type: left.type, left, right, result, provenance: this.#provenance() });
    return result;
  }

  public fcmp(
    predicate: LlvmFloatingPointComparisonInstruction["predicate"],
    left: LlvmValue<LlvmDoubleType>,
    right: LlvmValue<LlvmDoubleType>,
    name: string
  ): LlvmValue<LlvmBooleanType> {
    this.#assertOperand(left, llvm.double);
    this.#assertOperand(right, llvm.double);
    const result = this.#named(llvm.i1, name);
    this.#emit({ kind: "floatingPointComparison", predicate, type: llvm.double, left, right, result, provenance: this.#provenance() });
    return result;
  }

  public select<T extends LlvmValueType>(
    condition: LlvmValue<LlvmBooleanType>,
    whenTrue: LlvmValue<T>,
    whenFalse: LlvmValue<T>,
    name: string
  ): LlvmValue<T> {
    this.#assertOperand(condition, llvm.i1);
    this.#assertOperand(whenTrue, whenTrue.type);
    this.#assertOperand(whenFalse, whenTrue.type);
    const result = this.#named(whenTrue.type, name);
    this.#emit({
      kind: "select",
      type: whenTrue.type,
      condition,
      whenTrue,
      whenFalse,
      result,
      provenance: this.#provenance()
    });
    return result;
  }

  public alloca(type: LlvmValueType, name: string): LlvmValue<LlvmPointerType> {
    return this.#allocate(type, undefined, name);
  }

  public allocaArray(type: LlvmValueType, count: LlvmValue<LlvmIntegerType>, name: string): LlvmValue<LlvmPointerType> {
    this.#assertOperand(count, count.type);
    return this.#allocate(type, count, name);
  }

  public load<T extends LlvmValueType>(type: T, pointer: LlvmValue<LlvmPointerType>, name: string): LlvmValue<T> {
    this.#assertOperand(pointer, llvm.ptr);
    const result = this.#named(type, name);
    this.#emit({ kind: "load", loadedType: type, pointer, alignment: undefined, result, provenance: this.#provenance() });
    return result;
  }

  public store(value: LlvmValue, pointer: LlvmValue<LlvmPointerType>): void {
    this.#assertOperand(value, value.type);
    this.#assertOperand(pointer, llvm.ptr);
    this.#emit({ kind: "store", value, pointer, alignment: undefined, provenance: this.#provenance() });
  }

  public gepBytes(pointer: LlvmValue<LlvmPointerType>, offset: LlvmValue<LlvmIntegerType>, name: string): LlvmValue<LlvmPointerType> {
    return this.getElementPtr(llvm.i8, pointer, [{ type: llvm.i64, value: offset }], name);
  }

  public getElementPtr(
    sourceType: LlvmValueType,
    pointer: LlvmValue<LlvmPointerType>,
    indexes: readonly LlvmGepIndex[],
    name: string
  ): LlvmValue<LlvmPointerType> {
    this.#assertOperand(pointer, llvm.ptr);
    const result = this.#named(llvm.ptr, name);
    this.#emit({
      kind: "getElementPtr",
      sourceType: freezeLlvmType(sourceType),
      pointer,
      indexes: Object.freeze(indexes.map((index) => this.#gepIndex(index))),
      result,
      provenance: this.#provenance()
    });
    return result;
  }

  public insertValue<T extends LlvmStructType, I extends LlvmStructIndex<T>>(
    aggregate: LlvmValue<T>,
    element: LlvmValue<LlvmStructElementAt<T, I>>,
    index: I,
    name: string
  ): LlvmValue<T> {
    this.#assertOperand(aggregate, aggregate.type);
    this.#assertOperand(element, element.type);
    const expected = structElementAt(aggregate.type, index, "insertvalue");
    if (!sameLlvmType(element.type, expected)) {
      throw llvmError(
        `insertvalue element type ${renderLlvmType(element.type)} does not match struct element ${renderLlvmType(expected)}`
      );
    }
    const result = this.#named(aggregate.type, name);
    this.#emit({
      kind: "insertValue",
      aggregateType: aggregate.type,
      aggregate,
      element,
      index,
      result,
      provenance: this.#provenance()
    });
    return result;
  }

  public extractValue<T extends LlvmStructType, I extends LlvmStructIndex<T>>(
    aggregate: LlvmValue<T>,
    index: I,
    name: string
  ): LlvmValue<LlvmStructElementAt<T, I>> {
    this.#assertOperand(aggregate, aggregate.type);
    const elementType = structElementAt(aggregate.type, index, "extractvalue");
    const result = this.#named(elementType, name);
    this.#emit({
      kind: "extractValue",
      aggregateType: aggregate.type,
      aggregate,
      index,
      result,
      provenance: this.#provenance()
    });
    return result;
  }

  /** Phi operands are checked on predecessor edges; all inputs must match the explicit result type. */
  public phi<T extends LlvmValueType>(type: T, incoming: readonly LlvmPhiIncoming[], name: string): LlvmValue<T> {
    this.#assertActive();
    if (incoming.length === 0) {
      throw llvmError("phi requires at least one incoming value");
    }
    const entries = incoming.map((entry) => this.#phiEntry(entry, type));
    const result = this.#named(type, name);
    this.#emit({ kind: "phi", phiType: type, incoming: Object.freeze(entries), result, provenance: this.#provenance() });
    return result;
  }

  public call<T extends LlvmValueType, Spec extends LlvmFunctionSpec & { readonly returns: T }>(
    spec: Spec,
    arguments_: LlvmCallArguments<Spec>,
    name: string
  ): LlvmValue<T>;
  public call<Spec extends LlvmFunctionSpec>(spec: Spec, arguments_: LlvmCallArguments<Spec>): LlvmValue | undefined;
  public call(spec: LlvmFunctionSpec, arguments_: readonly LlvmValue[], name?: string): LlvmValue | undefined {
    const declared = this.#context.callee(spec);
    return this.#emitCall({ kind: "symbol", signature: declared.signature, name: declared.name }, spec.returns, arguments_, name);
  }

  public callIndirect<T extends LlvmValueType, Signature extends LlvmCallSignature & { readonly returns: T }>(
    pointer: LlvmValue<LlvmPointerType>,
    signature: Signature,
    arguments_: LlvmIndirectCallArguments<Signature>,
    name: string
  ): LlvmValue<T>;
  public callIndirect<Signature extends LlvmCallSignature>(
    pointer: LlvmValue<LlvmPointerType>,
    signature: Signature,
    arguments_: LlvmIndirectCallArguments<Signature>
  ): LlvmValue | undefined;
  public callIndirect(
    pointer: LlvmValue<LlvmPointerType>,
    signature: LlvmCallSignature,
    arguments_: readonly LlvmValue[],
    name?: string
  ): LlvmValue | undefined {
    this.#assertOperand(pointer, llvm.ptr);
    return this.#emitCall({ kind: "pointer", pointer, signature }, signature.returns, arguments_, name);
  }

  public switchInstruction<T extends LlvmIntegerType>(
    condition: LlvmValue<T>,
    cases: readonly LlvmSwitchCase[],
    defaultTarget: LlvmBlockLabel
  ): void {
    this.#assertOperand(condition, condition.type);
    const entries = cases.map((entry): LlvmSwitchCaseInstruction => {
      const target = this.#target(entry.target);
      assertIntegerFits(condition.type, entry.value);
      return Object.freeze({ value: entry.value, target });
    });
    this.#emit({
      kind: "switch",
      conditionType: condition.type,
      condition,
      cases: Object.freeze(entries),
      defaultTarget: this.#target(defaultTarget),
      provenance: this.#provenance()
    });
  }

  public br(target: LlvmBlockLabel): void {
    this.#emit({ kind: "branch", target: this.#target(target), provenance: this.#provenance() });
  }

  public condBr(condition: LlvmValue<LlvmBooleanType>, whenTrue: LlvmBlockLabel, whenFalse: LlvmBlockLabel): void {
    this.#assertOperand(condition, llvm.i1);
    this.#emit({
      kind: "conditionalBranch",
      condition,
      whenTrue: this.#target(whenTrue),
      whenFalse: this.#target(whenFalse),
      provenance: this.#provenance()
    });
  }

  #target(target: LlvmBlockLabel): LlvmBlockLabel {
    this.#assertActive();
    assertBlockLabel(target, this.#context.functionOwner);
    return target;
  }

  /**
   * The return type is checked against the function's, not merely against "is there a value": a `void`
   * function returning one and a non-void function returning none are both rejected here.
   */
  public ret(value?: LlvmValue): void {
    this.#assertActive();
    const { returnType } = this.#context;
    if (returnType.kind === "void") {
      if (value !== undefined) {
        throw llvmError("void LLVM function cannot return a value");
      }
      this.#emit({ kind: "return", returnType, value: undefined, provenance: this.#provenance() });
      return;
    }
    if (value === undefined) {
      throw llvmError("non-void LLVM function must return a value");
    }
    this.#assertOperand(value, returnType);
    this.#emit({ kind: "return", returnType, value, provenance: this.#provenance() });
  }

  public unreachable(): void {
    this.#emit({ kind: "unreachable", provenance: this.#provenance() });
  }

  /** Block trace regions nest inside function regions. An id cannot be active at both levels. */
  public withTrace<A>(traceId: string, build: () => A): A {
    this.#assertActive();
    return this.#localTraces.run(traceId, this.#context.activeTraceIds(), build);
  }

  /** Seal the block and require a terminator. */
  public finish(): RecordedBlock {
    this.#active = false;
    if (!this.#terminated) {
      throw llvmError(`LLVM block ${this.#context.label.name} is missing a terminator`);
    }
    return this.#recorded();
  }

  /** Seal the block and require a terminator. */
  public discard(): void {
    this.#active = false;
  }

  #recorded(): RecordedBlock {
    return Object.freeze({
      label: this.#context.label,
      instructions: this.#context.instructions(),
      successors: Object.freeze([...this.#successors]),
      phiSources: Object.freeze([...this.#phiSources])
    });
  }

  #allocate(type: LlvmValueType, count: LlvmValue<LlvmIntegerType> | undefined, name: string): LlvmValue<LlvmPointerType> {
    const result = this.#named(llvm.ptr, name);
    this.#emit({
      kind: "alloca",
      allocatedType: freezeLlvmType(type),
      count,
      alignment: undefined,
      result,
      provenance: this.#provenance()
    });
    return result;
  }

  #emitCall(
    callee: LlvmCallCallee,
    returnType: LlvmType,
    arguments_: readonly LlvmValue[],
    name: string | undefined
  ): LlvmValue | undefined {
    this.#assertActive();
    freezeLlvmCallSignature(callee.signature);
    Object.freeze(callee);
    if (returnType.kind === "void") {
      if (name !== undefined) {
        throw llvmError("void LLVM call cannot have an SSA result");
      }
      this.#assertCallArguments(callee.signature, arguments_);
      this.#emit({ kind: "call", callee, arguments: Object.freeze([...arguments_]), result: undefined, provenance: this.#provenance() });
      return undefined;
    }
    if (returnType.kind === "function") {
      throw llvmError("LLVM call cannot return a function type");
    }
    if (name === undefined) {
      throw llvmError("non-void LLVM call requires an SSA name");
    }
    this.#assertCallArguments(callee.signature, arguments_);
    const result = this.#named(returnType, name);
    this.#emit({ kind: "call", callee, arguments: Object.freeze([...arguments_]), result, provenance: this.#provenance() });
    return result;
  }

  #assertCallArguments(signature: LlvmCallSignature, arguments_: readonly LlvmValue[]): void {
    const fixed = signature.parameterTypes.length;
    if (arguments_.length < fixed || (!signature.variadic && arguments_.length > fixed)) {
      const expected = signature.variadic ? `${fixed} or more` : `${fixed}`;
      throw llvmError(`LLVM call takes ${expected} argument(s), found ${arguments_.length}`);
    }
    for (let index = 0; index < arguments_.length; index += 1) {
      const argument = arguments_[index];
      this.#assertOperand(argument, signature.parameterTypes[index] ?? argument.type);
    }
  }

  #integerBinary<T extends LlvmIntegerType>(
    opcode: LlvmIntegerBinaryInstruction<T>["opcode"],
    left: LlvmValue<T>,
    right: LlvmValue<T>,
    name: string
  ): LlvmValue<T> {
    this.#assertOperand(left, left.type);
    this.#assertOperand(right, left.type);
    const result = this.#named(left.type, name);
    this.#emit({
      kind: "integerBinary",
      opcode,
      type: left.type,
      left,
      right,
      result,
      provenance: this.#provenance()
    });
    return result;
  }

  #floatBinary(
    opcode: LlvmFloatingPointBinaryInstruction["opcode"],
    left: LlvmValue<LlvmDoubleType>,
    right: LlvmValue<LlvmDoubleType>,
    name: string
  ): LlvmValue<LlvmDoubleType> {
    this.#assertOperand(left, llvm.double);
    this.#assertOperand(right, llvm.double);
    const result = this.#named(llvm.double, name);
    this.#emit({
      kind: "floatingPointBinary",
      opcode,
      type: llvm.double,
      left,
      right,
      result,
      provenance: this.#provenance()
    });
    return result;
  }

  #cast<S extends LlvmValueType, T extends LlvmValueType>(
    opcode: LlvmCastOpcode,
    sourceType: S,
    operand: LlvmValue<S>,
    targetType: T,
    result: LlvmValue<T>
  ): LlvmCastInstruction<S, T> {
    return { kind: "cast", opcode, sourceType, targetType, operand, result, provenance: this.#provenance() };
  }

  #gepIndex(index: LlvmGepIndex): LlvmGepIndex {
    if (typeof index.value === "bigint") {
      return Object.freeze({ type: freezeLlvmType(index.type), value: index.value });
    }
    this.#assertOperand(index.value, index.type);
    return Object.freeze({ type: freezeLlvmType(index.type), value: index.value });
  }

  #phiEntry(entry: LlvmPhiIncoming, type: LlvmValueType): LlvmPhiIncomingInstruction {
    const { value } = entry;
    const block = this.#target(entry.block);
    this.#phiSources.add(block.name);
    if (!sameLlvmType(value.type, type)) {
      throw llvmError(`phi incoming value does not match phi type ${renderLlvmType(type)}`);
    }
    this.#assertOwnedByFunction(value);
    return Object.freeze({ value, block });
  }

  #constant<T extends LlvmValueType>(type: T, text: string): LlvmValue<T> {
    return createLlvmValue(type, this.#context.functionOwner, text);
  }

  #named<T extends LlvmValueType>(type: T, name: string): LlvmValue<T> {
    this.#assertActive();
    return createLlvmValue(type, this.#context.functionOwner, this.#context.allocateName(assertNameHint(name)));
  }

  #emit(instruction: LlvmInstruction): void {
    this.#assertActive();
    if (this.#terminated) {
      throw llvmError("cannot emit LLVM instruction after terminator");
    }
    if (instruction.kind !== "phi") {
      for (const operand of llvmInstructionOperands(instruction)) {
        this.#assertOperand(operand, operand.type);
      }
    }
    for (const target of llvmInstructionTargets(instruction)) {
      this.#successors.add(target.name);
    }
    this.#terminated = isTerminatorKind(instruction.kind);
    const index = this.#context.record(Object.freeze(instruction));
    const result = llvmInstructionResult(instruction);
    if (result !== undefined) {
      defineLlvmValue(result, this.#blockOwner, index);
    }
  }

  /** Combines function and block trace regions in nesting order. */
  #provenance(): LlvmProvenance {
    return Object.freeze({
      origin: this.#context.origin,
      traceIds: Object.freeze([...this.#context.activeTraceIds(), ...this.#localTraces.active()])
    });
  }

  /** Checks function ownership and operand type. Whole-function dominance is checked later. */
  #assertOperand(value: LlvmValue, expectedType: LlvmType): void {
    this.#assertActive();
    this.#assertOwnedByFunction(value);
    if (!sameLlvmType(value.type, expectedType)) {
      throw llvmError(`incompatible LLVM value ${llvmValueText(value)}: expected ${renderLlvmType(expectedType)}`);
    }
  }

  #assertOwnedByFunction(value: LlvmValue): void {
    if (llvmValueData(value).functionOwner !== this.#context.functionOwner) {
      throw llvmError(`incompatible LLVM value ${llvmValueText(value)}`);
    }
  }

  #assertActive(): void {
    if (!this.#active) {
      throw llvmError("LLVM block builder escaped its scope");
    }
  }
}

function isTerminatorKind(kind: LlvmInstruction["kind"]): boolean {
  return kind === "switch" || kind === "return" || kind === "branch" || kind === "conditionalBranch" || kind === "unreachable";
}

/** Check the aggregate and position before reading a struct element type. */
function structElementAt<T extends LlvmStructType>(
  type: T,
  index: number,
  opcode: "insertvalue" | "extractvalue"
): LlvmStructElementAt<T, LlvmStructIndex<T>> {
  // oxlint-disable typescript/no-unnecessary-condition -- `T extends LlvmStructType` already excludes the non-struct case, so a typed caller cannot write this. The guard stays for the runtime path, and it reports the aggregate type found rather than a property name on undefined.
  if (type.kind !== "struct") {
    throw llvmError(`expected LLVM struct type, found ${renderLlvmType(type)}`);
  }
  const element = type.elements[index];
  if (element === undefined) {
    throw llvmError(`${opcode} index ${index} out of bounds for ${renderLlvmType(type)}`);
  }
  return element;
}

function assertIntegerFits(type: LlvmIntegerType, value: bigint): void {
  if (!llvmIntegerFits(type, value)) {
    throw llvmError(`integer constant ${value} does not fit i${type.bits}`);
  }
}

function assertNameHint(name: string): string {
  return assertLlvmName(name, "SSA name hint");
}

function assertLlvmName(name: string, description: string): string {
  if (!llvmNamePattern.test(name)) {
    throw llvmError(`invalid LLVM ${description} ${name}`);
  }
  return name;
}

function llvmError(message: string): Error {
  return new Error(`Internal compiler error: ${message}`);
}
