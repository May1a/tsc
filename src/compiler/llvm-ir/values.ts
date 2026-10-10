import { type LlvmValue, type LlvmValueType, freezeLlvmType } from "./types.js";

/** Instruction results record their block and position. Parameters and literals have no definition. */
export interface LlvmValueDefinition {
  /** The block that produced the value. */
  readonly block: symbol;
  /** Index of the producing instruction in its block. */
  readonly index: number;
}

/** Private handle metadata used to check function ownership and SSA dominance. */
export interface LlvmValueData {
  /** The function that minted the handle; one per `defineFunction`, not one per module. */
  readonly functionOwner: symbol;
  /** The already-substituted operand text: `%name`, `123`, `null`, `@global`. */
  readonly text: string;
  /** Absent for parameters and literal constants. */
  readonly definition: LlvmValueDefinition | undefined;
}

interface MutableValueData {
  readonly functionOwner: symbol;
  readonly text: string;
  definition: LlvmValueDefinition | undefined;
}

const valueDataByValue = new WeakMap<object, MutableValueData>();

function internalError(message: string): Error {
  return new Error(`Internal compiler error: ${message}`);
}

export function createLlvmValue<T extends LlvmValueType>(type: T, functionOwner: symbol, text: string): LlvmValue<T> {
  const value: LlvmValue<T> = Object.freeze({ type: freezeLlvmType(type) });
  valueDataByValue.set(value, { functionOwner, text, definition: undefined });
  return value;
}

/** Records a result's single definition after its instruction has been appended. */
export function defineLlvmValue(value: LlvmValue, block: symbol, index: number): void {
  const data = valueDataByValue.get(value);
  if (data === undefined) {
    throw internalError(`LLVM value ${llvmValueText(value)} was not created by this builder`);
  }
  if (data.definition !== undefined) {
    throw internalError(`LLVM value ${llvmValueText(value)} has more than one definition`);
  }
  data.definition = { block, index };
}

export function llvmValueData(value: LlvmValue): LlvmValueData {
  const data = valueDataByValue.get(value);
  if (data === undefined) {
    throw internalError("LLVM value was not created by this builder");
  }
  return data;
}

export function llvmValueText(value: LlvmValue): string {
  return llvmValueData(value).text;
}

/** Whether `value` is a handle this process minted, as opposed to a look-alike `{ type }` object. */
export function isLlvmValue(value: unknown): value is LlvmValue {
  return typeof value === "object" && value !== null && valueDataByValue.has(value);
}
