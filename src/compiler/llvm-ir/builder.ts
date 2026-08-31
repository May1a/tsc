import type { LlvmLineRange } from "../trace.js";
import {
  type LlvmIntegerType,
  type LlvmPointerType,
  type LlvmStructElementType,
  type LlvmStructType,
  type LlvmType,
  type LlvmValue,
  type LlvmValueType,
  renderLlvmType,
  sameLlvmType
} from "./types.js";

interface ValueData {
  readonly owner: symbol;
  readonly block?: symbol;
  readonly text: string;
}

const values = new WeakMap<object, ValueData>();
const functionSpecs = new WeakMap<object, symbol>();
const llvmNamePattern = /^[A-Za-z$._][\w$.-]*$/;
const traceIdPattern = /^[A-Za-z0-9_.:$-]+$/;
const llvmValueBitWidth = 64;

function internalError(message: string): Error {
  return new Error(`Internal compiler error: ${message}`);
}

function assertName(name: string, description: string): void {
  if (!llvmNamePattern.test(name)) {
    throw internalError(`invalid LLVM ${description} ${name}`);
  }
}

function createValue<T extends LlvmValueType>(type: T, owner: symbol, text: string, block?: symbol): LlvmValue<T> {
  const value: LlvmValue<T> = Object.freeze({ type });
  if (block === undefined) {
    values.set(value, { owner, text });
  } else {
    values.set(value, { owner, block, text });
  }
  return value;
}

function valueData(value: LlvmValue): ValueData {
  const data = values.get(value);
  if (data === undefined) {
    throw internalError("LLVM value was not created by this builder");
  }
  return data;
}

interface RenderLine {
  readonly text: string;
  readonly traceIds: readonly string[];
}

interface MutableLlvmLineRange {
  readonly startLine: number;
  endLine: number;
}

export interface LlvmFunctionParameter {
  readonly name: string;
  readonly type: LlvmValueType;
}

export interface LlvmFunctionSpec {
  readonly name: string;
  readonly parameters: readonly LlvmFunctionParameter[];
  readonly returns: LlvmType;
}

export interface LegacyLlvmTraceMarker {
  readonly line: number;
  readonly kind: "start" | "end";
  readonly id: string;
}

export interface LegacyLlvmModuleText {
  readonly origin: string;
  readonly text: string;
  readonly traceMarkers?: readonly LegacyLlvmTraceMarker[];
}

export interface RenderedLlvmModule {
  readonly text: string;
  readonly traceRanges: ReadonlyMap<string, readonly LlvmLineRange[]>;
}

export interface LlvmBlockBuilder {
  int<T extends LlvmIntegerType>(type: T, value: bigint): LlvmValue<T>;
  undef<T extends LlvmValueType>(type: T, name: string): LlvmValue<T>;
  nullPtr(): LlvmValue<LlvmPointerType>;
  ptrToInt<T extends LlvmIntegerType>(value: LlvmValue<LlvmPointerType>, type: T, name: string): LlvmValue<T>;
  intToPtr<T extends LlvmIntegerType>(value: LlvmValue<T>, name: string): LlvmValue<LlvmPointerType>;
  bitcast<T extends LlvmValueType>(value: LlvmValue, type: T, name: string): LlvmValue<T>;
  and<T extends LlvmIntegerType>(left: LlvmValue<T>, right: LlvmValue<T>, name: string): LlvmValue<T>;
  or<T extends LlvmIntegerType>(left: LlvmValue<T>, right: LlvmValue<T>, name: string): LlvmValue<T>;
  xor<T extends LlvmIntegerType>(left: LlvmValue<T>, right: LlvmValue<T>, name: string): LlvmValue<T>;
  icmp<T extends LlvmIntegerType>(predicate: "eq" | "ne" | "ugt" | "uge" | "ult" | "ule" | "sgt" | "sge" | "slt" | "sle", left: LlvmValue<T>, right: LlvmValue<T>, name: string): LlvmValue<{ readonly kind: "integer"; readonly bits: 1 }>;
  select<T extends LlvmValueType>(condition: LlvmValue<{ readonly kind: "integer"; readonly bits: 1 }>, whenTrue: LlvmValue<T>, whenFalse: LlvmValue<T>, name: string): LlvmValue<T>;
  insertValue<T extends LlvmStructType>(aggregate: LlvmValue<T>, element: LlvmValue, index: number, name: string): LlvmValue<T>;
  extractValue<T extends LlvmStructType>(aggregate: LlvmValue<T>, index: number, name: string): LlvmValue<LlvmStructElementType<T>>;
  call(spec: LlvmFunctionSpec, arguments_: readonly LlvmValue[], name?: string): LlvmValue | undefined;
  load<T extends LlvmValueType>(type: T, pointer: LlvmValue<LlvmPointerType>, name: string): LlvmValue<T>;
  store(value: LlvmValue, pointer: LlvmValue<LlvmPointerType>): void;
  gepBytes(pointer: LlvmValue<LlvmPointerType>, offset: LlvmValue<LlvmIntegerType>, name: string): LlvmValue<LlvmPointerType>;
  br(target: string): void;
  condBr(condition: LlvmValue<{ readonly kind: "integer"; readonly bits: 1 }>, whenTrue: string, whenFalse: string): void;
  ret(value?: LlvmValue): void;
  withTrace<A>(traceId: string, build: () => A): A;
}

export interface LlvmFunctionBuilder {
  parameter<T extends LlvmValueType>(index: number, expectedType: T): LlvmValue<T>;
  block(name: string, build: (block: LlvmBlockBuilder) => void): void;
}

export interface LlvmModuleBuilder {
  declareFunction(spec: LlvmFunctionSpec): LlvmFunctionSpec;
  defineFunction(spec: LlvmFunctionSpec, build: (fn: LlvmFunctionBuilder) => void): LlvmFunctionSpec;
  addLegacyModuleText(fragment: LegacyLlvmModuleText): void;
  render(): RenderedLlvmModule;
}

interface BuiltFunction {
  readonly spec: LlvmFunctionSpec;
  readonly lines: readonly RenderLine[];
}

type ModuleItem =
  | { readonly kind: "function"; readonly value: BuiltFunction }
  | { readonly kind: "legacy"; readonly lines: readonly RenderLine[] };

function copySpec(spec: LlvmFunctionSpec, owner: symbol): LlvmFunctionSpec {
  assertName(spec.name, "symbol");
  const parameterNames = new Set<string>();
  const parameters = spec.parameters.map((parameter) => {
    assertName(parameter.name, "parameter name");
    if (parameterNames.has(parameter.name)) {
      throw internalError(`duplicate LLVM parameter name ${parameter.name}`);
    }
    parameterNames.add(parameter.name);
    return Object.freeze({ name: parameter.name, type: parameter.type });
  });
  const copied = Object.freeze({ name: spec.name, parameters: Object.freeze(parameters), returns: spec.returns });
  functionSpecs.set(copied, owner);
  return copied;
}

function sameFunctionType(left: LlvmFunctionSpec, right: LlvmFunctionSpec): boolean {
  return sameLlvmType(left.returns, right.returns) &&
    left.parameters.length === right.parameters.length &&
    left.parameters.every((parameter, index) => sameLlvmType(parameter.type, right.parameters[index].type));
}

class BlockBuilder implements LlvmBlockBuilder {
  readonly #lines: RenderLine[];
  readonly #names: Set<string>;
  readonly #owner: symbol;
  readonly #returnType: LlvmType;
  readonly #branchTargets: Set<string>;
  readonly #moduleOwner: symbol;
  readonly #blockOwner = Symbol("llvm-block");
  readonly #traceIds: string[] = [];
  #active = true;
  #terminated = false;

  public constructor(lines: RenderLine[], names: Set<string>, owner: symbol, returnType: LlvmType, branchTargets: Set<string>, moduleOwner: symbol) {
    this.#lines = lines;
    this.#names = names;
    this.#owner = owner;
    this.#returnType = returnType;
    this.#branchTargets = branchTargets;
    this.#moduleOwner = moduleOwner;
  }

  public int<T extends LlvmIntegerType>(type: T, value: bigint): LlvmValue<T> {
    this.#assertActive();
    const minimum = -(1n << BigInt(type.bits - 1));
    const maximum = (1n << BigInt(type.bits)) - 1n;
    if (value < minimum || value > maximum) {
      throw internalError(`integer constant ${value} does not fit i${type.bits}`);
    }
    return createValue(type, this.#owner, value.toString(), this.#blockOwner);
  }

  public nullPtr(): LlvmValue<LlvmPointerType> {
    this.#assertActive();
    return createValue({ kind: "pointer" }, this.#owner, "null", this.#blockOwner);
  }

  public ptrToInt<T extends LlvmIntegerType>(value: LlvmValue<LlvmPointerType>, type: T, name: string): LlvmValue<T> {
    this.#assertValue(value, { kind: "pointer" });
    const result = this.#namedValue(type, name);
    this.#instruction(`${this.#text(result)} = ptrtoint ptr ${this.#text(value)} to ${renderLlvmType(type)}`);
    return result;
  }

  public intToPtr<T extends LlvmIntegerType>(value: LlvmValue<T>, name: string): LlvmValue<LlvmPointerType> {
    this.#assertValue(value, value.type);
    const result = this.#namedValue({ kind: "pointer" }, name);
    this.#instruction(`${this.#text(result)} = inttoptr ${renderLlvmType(value.type)} ${this.#text(value)} to ptr`);
    return result;
  }

  public bitcast<T extends LlvmValueType>(value: LlvmValue, type: T, name: string): LlvmValue<T> {
    this.#assertOwned(value);
    const sourceIsI64 = value.type.kind === "integer" && value.type.bits === llvmValueBitWidth;
    const targetIsI64 = type.kind === "integer" && type.bits === llvmValueBitWidth;
    const valid = (sourceIsI64 && type.kind === "double") || (value.type.kind === "double" && targetIsI64);
    if (!valid) {
      throw internalError(`invalid LLVM bitcast from ${renderLlvmType(value.type)} to ${renderLlvmType(type)}`);
    }
    const result = this.#namedValue(type, name);
    this.#instruction(`${this.#text(result)} = bitcast ${renderLlvmType(value.type)} ${this.#text(value)} to ${renderLlvmType(type)}`);
    return result;
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

  public icmp<T extends LlvmIntegerType>(predicate: "eq" | "ne" | "ugt" | "uge" | "ult" | "ule" | "sgt" | "sge" | "slt" | "sle", left: LlvmValue<T>, right: LlvmValue<T>, name: string): LlvmValue<{ readonly kind: "integer"; readonly bits: 1 }> {
    this.#assertValue(left, left.type);
    this.#assertValue(right, left.type);
    const type = { kind: "integer", bits: 1 } as const;
    const result = this.#namedValue(type, name);
    this.#instruction(`${this.#text(result)} = icmp ${predicate} ${renderLlvmType(left.type)} ${this.#text(left)}, ${this.#text(right)}`);
    return result;
  }

  public select<T extends LlvmValueType>(condition: LlvmValue<{ readonly kind: "integer"; readonly bits: 1 }>, whenTrue: LlvmValue<T>, whenFalse: LlvmValue<T>, name: string): LlvmValue<T> {
    this.#assertValue(condition, { kind: "integer", bits: 1 });
    this.#assertValue(whenTrue, whenTrue.type);
    this.#assertValue(whenFalse, whenTrue.type);
    const result = this.#namedValue(whenTrue.type, name);
    this.#instruction(`${this.#text(result)} = select i1 ${this.#text(condition)}, ${renderLlvmType(whenTrue.type)} ${this.#text(whenTrue)}, ${renderLlvmType(whenFalse.type)} ${this.#text(whenFalse)}`);
    return result;
  }

  public undef<T extends LlvmValueType>(type: T, name: string): LlvmValue<T> {
    this.#assertActive();
    assertName(name, "SSA name hint");
    let candidate = name;
    let suffix = 1;
    while (this.#names.has(candidate)) {
      candidate = `${name}.${suffix}`;
      suffix += 1;
    }
    this.#names.add(candidate);
    return createValue(type, this.#owner, "undef", this.#blockOwner);
  }

  public insertValue<T extends LlvmStructType>(aggregate: LlvmValue<T>, element: LlvmValue, index: number, name: string): LlvmValue<T> {
    this.#assertActive();
    this.#assertOwned(aggregate);
    this.#assertOwned(element);
    this.#assertStructType(aggregate.type);
    const aggregateText = renderLlvmType(aggregate.type);
    const elementCount = aggregate.type.elements.length;
    const expectedElementType = this.#lookupStructElement(aggregate.type, index, elementCount, "insertvalue", aggregateText);
    if (!sameLlvmType(element.type, expectedElementType)) {
      throw internalError(`insertvalue element type ${renderLlvmType(element.type)} does not match struct element ${renderLlvmType(expectedElementType)}`);
    }
    const result = this.#namedValue(aggregate.type, name);
    this.#instruction(`${this.#text(result)} = insertvalue ${aggregateText} ${this.#text(aggregate)}, ${renderLlvmType(element.type)} ${this.#text(element)}, ${index}`);
    return result;
  }

  public extractValue<T extends LlvmStructType>(aggregate: LlvmValue<T>, index: number, name: string): LlvmValue<LlvmStructElementType<T>> {
    this.#assertActive();
    this.#assertOwned(aggregate);
    this.#assertStructType(aggregate.type);
    const aggregateText = renderLlvmType(aggregate.type);
    const elementCount = aggregate.type.elements.length;
    const elementType = this.#lookupStructElement(aggregate.type, index, elementCount, "extractvalue", aggregateText);
    const result = this.#namedValue(elementType, name);
    this.#instruction(`${this.#text(result)} = extractvalue ${aggregateText} ${this.#text(aggregate)}, ${index}`);
    return result;
  }

  public call(spec: LlvmFunctionSpec, arguments_: readonly LlvmValue[], name?: string): LlvmValue | undefined {
    this.#assertActive();
    if (functionSpecs.get(spec) !== this.#moduleOwner) {
      throw internalError(`LLVM call references unowned function ${spec.name}`);
    }
    if (arguments_.length !== spec.parameters.length) {
      throw internalError(`LLVM call to ${spec.name} has incompatible argument count`);
    }
    const argumentsText = arguments_.map((argument, index) => {
      this.#assertValue(argument, spec.parameters[index].type);
      return `${renderLlvmType(argument.type)} ${this.#text(argument)}`;
    }).join(", ");
    const call = `call ${renderLlvmType(spec.returns)} @${spec.name}(${argumentsText})`;
    if (spec.returns.kind === "void") {
      if (name !== undefined) {
        throw internalError("void LLVM call cannot have an SSA result");
      }
      this.#instruction(call);
      return undefined;
    }
    if (name === undefined) {
      throw internalError("non-void LLVM call requires an SSA name");
    }
    const result = this.#namedValue(spec.returns, name);
    this.#instruction(`${this.#text(result)} = ${call}`);
    return result;
  }

  public load<T extends LlvmValueType>(type: T, pointer: LlvmValue<LlvmPointerType>, name: string): LlvmValue<T> {
    this.#assertValue(pointer, { kind: "pointer" });
    const result = this.#namedValue(type, name);
    this.#instruction(`${this.#text(result)} = load ${renderLlvmType(type)}, ptr ${this.#text(pointer)}`);
    return result;
  }

  public store(value: LlvmValue, pointer: LlvmValue<LlvmPointerType>): void {
    this.#assertOwned(value);
    this.#assertValue(pointer, { kind: "pointer" });
    this.#instruction(`store ${renderLlvmType(value.type)} ${this.#text(value)}, ptr ${this.#text(pointer)}`);
  }

  public gepBytes(pointer: LlvmValue<LlvmPointerType>, offset: LlvmValue<LlvmIntegerType>, name: string): LlvmValue<LlvmPointerType> {
    this.#assertValue(pointer, { kind: "pointer" });
    this.#assertValue(offset, offset.type);
    const result = this.#namedValue({ kind: "pointer" }, name);
    this.#instruction(`${this.#text(result)} = getelementptr i8, ptr ${this.#text(pointer)}, ${renderLlvmType(offset.type)} ${this.#text(offset)}`);
    return result;
  }

  public br(target: string): void {
    this.#recordBranchTarget(target);
    this.#instruction(`br label %${target}`);
    this.#terminated = true;
  }

  public condBr(condition: LlvmValue<{ readonly kind: "integer"; readonly bits: 1 }>, whenTrue: string, whenFalse: string): void {
    this.#assertValue(condition, { kind: "integer", bits: 1 });
    this.#recordBranchTarget(whenTrue);
    this.#recordBranchTarget(whenFalse);
    this.#instruction(`br i1 ${this.#text(condition)}, label %${whenTrue}, label %${whenFalse}`);
    this.#terminated = true;
  }

  public ret(value?: LlvmValue): void {
    this.#assertActive();
    if (this.#returnType.kind === "void") {
      if (value !== undefined) {
        throw internalError("void LLVM function cannot return a value");
      }
      this.#instruction("ret void");
      this.#terminated = true;
      return;
    }
    if (value === undefined) {
      throw internalError("non-void LLVM function must return a value");
    }
    this.#assertValue(value, this.#returnType);
    this.#instruction(`ret ${renderLlvmType(value.type)} ${this.#text(value)}`);
    this.#terminated = true;
  }

  public withTrace<A>(traceId: string, build: () => A): A {
    this.#assertActive();
    if (!traceIdPattern.test(traceId) || this.#traceIds.includes(traceId)) {
      throw internalError(`invalid or repeated LLVM trace ID ${traceId}`);
    }
    this.#lines.push({ text: `; tscn-trace-start ${traceId}`, traceIds: [] });
    this.#traceIds.push(traceId);
    try {
      return build();
    } finally {
      this.#traceIds.pop();
      this.#lines.push({ text: `; tscn-trace-end ${traceId}`, traceIds: [] });
    }
  }

  public finish(validate = true): void {
    this.#active = false;
    if (validate && !this.#terminated) {
      throw internalError("LLVM block is missing a terminator");
    }
  }

  #integerBinary<T extends LlvmIntegerType>(instruction: "and" | "or" | "xor", left: LlvmValue<T>, right: LlvmValue<T>, name: string): LlvmValue<T> {
    this.#assertValue(left, left.type);
    this.#assertValue(right, left.type);
    const result = this.#namedValue(left.type, name);
    this.#instruction(`${this.#text(result)} = ${instruction} ${renderLlvmType(left.type)} ${this.#text(left)}, ${this.#text(right)}`);
    return result;
  }

  #namedValue<T extends LlvmValueType>(type: T, name: string): LlvmValue<T> {
    this.#assertActive();
    assertName(name, "SSA name hint");
    let candidate = name;
    let suffix = 1;
    while (this.#names.has(candidate)) {
      candidate = `${name}.${suffix}`;
      suffix += 1;
    }
    this.#names.add(candidate);
    return createValue(type, this.#owner, `%${candidate}`, this.#blockOwner);
  }

  #instruction(text: string): void {
    this.#assertActive();
    if (this.#terminated) {
      throw internalError("cannot emit LLVM instruction after terminator");
    }
    this.#lines.push({ text: `  ${text}`, traceIds: [...this.#traceIds] });
  }

  #recordBranchTarget(target: string): void {
    assertName(target, "block target");
    this.#branchTargets.add(target);
  }

  #assertValue(value: LlvmValue, expectedType: LlvmType): void {
    this.#assertOwned(value);
    if (!sameLlvmType(value.type, expectedType)) {
      throw internalError("incompatible LLVM value");
    }
  }

  #assertOwned(value: LlvmValue): void {
    this.#assertActive();
    const data = valueData(value);
    if (data.owner !== this.#owner || (data.block !== undefined && data.block !== this.#blockOwner)) {
      throw internalError("incompatible LLVM value");
    }
  }

  #assertStructType(type: LlvmType): void {
    if (type.kind !== "struct") {
      throw internalError(`expected LLVM struct type, found ${renderLlvmType(type)}`);
    }
  }

  #isBoundedIndex(index: unknown, length: number): index is number {
    return typeof index === "number" && Number.isInteger(index) && index >= 0 && index < length;
  }

  #lookupStructElement<S extends LlvmStructType>(structType: S, index: number, length: number, opcode: "insertvalue" | "extractvalue", renderedType: string): LlvmStructElementType<S> {
    const message = `${opcode} index ${index} out of bounds for ${renderedType}`;
    if (!this.#isBoundedIndex(index, length)) {
      throw internalError(message);
    }
    return structType.elements[index] as LlvmStructElementType<S>;
  }

  #assertActive(): void {
    if (!this.#active) {
      throw internalError("LLVM block builder escaped its scope");
    }
  }

  #text(value: LlvmValue): string {
    return valueData(value).text;
  }
}

class FunctionBuilder implements LlvmFunctionBuilder {
  readonly #owner = Symbol("llvm-function");
  readonly #lines: RenderLine[] = [];
  readonly #names = new Set<string>();
  readonly #parameters: readonly LlvmValue[];
  readonly #spec: LlvmFunctionSpec;
  readonly #blockNames = new Set<string>();
  readonly #branchTargets = new Set<string>();
  readonly #moduleOwner: symbol;
  #active = true;
  #buildingBlock = false;

  public constructor(spec: LlvmFunctionSpec, moduleOwner: symbol) {
    this.#spec = spec;
    this.#moduleOwner = moduleOwner;
    this.#parameters = spec.parameters.map((parameter) => {
      this.#names.add(parameter.name);
      return createValue(parameter.type, this.#owner, `%${parameter.name}`);
    });
  }

  public parameter<T extends LlvmValueType>(index: number, expectedType: T): LlvmValue<T> {
    this.#assertActive();
    const parameter = this.#parameters.at(index);
    if (parameter === undefined || !sameLlvmType(parameter.type, expectedType)) {
      throw internalError(`incompatible LLVM parameter ${index}`);
    }
    return createValue(expectedType, this.#owner, valueData(parameter).text);
  }

  public block(name: string, build: (block: LlvmBlockBuilder) => void): void {
    this.#assertActive();
    if (this.#buildingBlock) {
      throw internalError("cannot construct an LLVM block while another block is active");
    }
    assertName(name, "block name");
    if (this.#blockNames.has(name) || this.#names.has(name)) {
      throw internalError(`duplicate LLVM block name ${name}`);
    }
    this.#blockNames.add(name);
    this.#lines.push({ text: `${name}:`, traceIds: [] });
    const block = new BlockBuilder(this.#lines, this.#names, this.#owner, this.#spec.returns, this.#branchTargets, this.#moduleOwner);
    this.#buildingBlock = true;
    try {
      build(block);
      block.finish();
    } catch (error) {
      block.finish(false);
      throw error;
    } finally {
      this.#buildingBlock = false;
    }
  }

  public finish(): BuiltFunction {
    this.#active = false;
    if (this.#blockNames.size === 0) {
      throw internalError(`LLVM function ${this.#spec.name} has no blocks`);
    }
    for (const target of this.#branchTargets) {
      if (!this.#blockNames.has(target)) {
        throw internalError(`LLVM branch references unknown block ${target}`);
      }
    }
    return { spec: this.#spec, lines: this.#lines };
  }

  public abort(): void {
    this.#active = false;
  }

  #assertActive(): void {
    if (!this.#active) {
      throw internalError("LLVM function builder escaped its scope");
    }
  }
}

function legacyLines(fragment: LegacyLlvmModuleText): readonly RenderLine[] {
  if (fragment.origin.length === 0) {
    throw internalError("legacy LLVM module text requires an origin");
  }
  let textLines = fragment.text.split("\n");
  if (fragment.text.endsWith("\n")) {
    textLines = fragment.text.slice(0, -1).split("\n");
  }
  const markers = new Map<number, LegacyLlvmTraceMarker>();
  for (const marker of fragment.traceMarkers ?? []) {
    if (marker.line < 1 || marker.line > textLines.length || markers.has(marker.line) || !traceIdPattern.test(marker.id)) {
      throw internalError(`invalid tracked legacy LLVM marker at line ${marker.line}`);
    }
    markers.set(marker.line, marker);
  }
  const traceIds: string[] = [];
  const lines = textLines.map((text, index) => {
    const marker = markers.get(index + 1);
    if (marker?.kind === "start") {
      if (traceIds.includes(marker.id)) {
        throw internalError(`repeated tracked legacy LLVM trace ${marker.id}`);
      }
      traceIds.push(marker.id);
      return { text, traceIds: [] };
    }
    if (marker?.kind === "end") {
      if (traceIds.pop() !== marker.id) {
        throw internalError(`misnested tracked legacy LLVM trace ${marker.id}`);
      }
      return { text, traceIds: [] };
    }
    let activeTraceIds: readonly string[] = [...traceIds];
    if (text.length === 0) {
      activeTraceIds = [];
    }
    return { text, traceIds: activeTraceIds };
  });
  const unclosedTrace = traceIds.at(-1);
  if (unclosedTrace !== undefined) {
    throw internalError(`unclosed tracked legacy LLVM trace ${unclosedTrace}`);
  }
  return lines;
}

class ModuleBuilder implements LlvmModuleBuilder {
  readonly #items: ModuleItem[] = [];
  readonly #declarations = new Map<string, LlvmFunctionSpec>();
  readonly #definitions = new Set<string>();
  readonly #owner = Symbol("llvm-module");

  public declareFunction(spec: LlvmFunctionSpec): LlvmFunctionSpec {
    const copied = copySpec(spec, this.#owner);
    const existing = this.#declarations.get(copied.name);
    if (existing !== undefined && !sameFunctionType(existing, copied)) {
      throw internalError(`conflicting LLVM declaration ${copied.name}`);
    }
    if (this.#definitions.has(copied.name)) {
      throw internalError(`LLVM symbol ${copied.name} is already defined`);
    }
    this.#declarations.set(copied.name, copied);
    return copied;
  }

  public defineFunction(spec: LlvmFunctionSpec, build: (fn: LlvmFunctionBuilder) => void): LlvmFunctionSpec {
    const copied = copySpec(spec, this.#owner);
    if (this.#definitions.has(copied.name)) {
      throw internalError(`duplicate LLVM symbol ${copied.name}`);
    }
    const declaration = this.#declarations.get(copied.name);
    if (declaration !== undefined && !sameFunctionType(declaration, copied)) {
      throw internalError(`LLVM definition conflicts with declaration ${copied.name}`);
    }
    const fn = new FunctionBuilder(copied, this.#owner);
    let built: BuiltFunction;
    try {
      build(fn);
      built = fn.finish();
    } catch (error) {
      fn.abort();
      throw error;
    }
    this.#definitions.add(copied.name);
    this.#items.push({ kind: "function", value: built });
    return copied;
  }

  public addLegacyModuleText(fragment: LegacyLlvmModuleText): void {
    this.#items.push({ kind: "legacy", lines: legacyLines(fragment) });
  }

  public render(): RenderedLlvmModule {
    const lines: RenderLine[] = [];
    for (const declaration of this.#declarations.values()) {
      if (this.#definitions.has(declaration.name)) {
        continue;
      }
      const parameters = declaration.parameters.map((parameter) => renderLlvmType(parameter.type)).join(", ");
      lines.push({ text: `declare ${renderLlvmType(declaration.returns)} @${declaration.name}(${parameters})`, traceIds: [] });
    }
    for (const item of this.#items) {
      if (item.kind === "legacy") {
        lines.push(...item.lines);
        continue;
      }
      const { spec } = item.value;
      const parameters = spec.parameters.map((parameter) => `${renderLlvmType(parameter.type)} %${parameter.name}`).join(", ");
      lines.push(
        { text: `define ${renderLlvmType(spec.returns)} @${spec.name}(${parameters}) {`, traceIds: [] },
        ...item.value.lines,
        { text: "}", traceIds: [] }
      );
    }
    const ranges = new Map<string, MutableLlvmLineRange[]>();
    for (let index = 0; index < lines.length; index += 1) {
      const lineNumber = index + 1;
      for (const traceId of lines[index].traceIds) {
        const traceRanges = ranges.get(traceId) ?? [];
        const previous = traceRanges.at(-1);
        if (previous?.endLine === lineNumber - 1) {
          previous.endLine = lineNumber;
        } else {
          traceRanges.push({ startLine: lineNumber, endLine: lineNumber });
        }
        ranges.set(traceId, traceRanges);
      }
    }
    return { text: `${lines.map((line) => line.text).join("\n")}\n`, traceRanges: ranges };
  }
}

export const createLlvmModule = (): LlvmModuleBuilder => new ModuleBuilder();
