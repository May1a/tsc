import type { LlvmIntegerType, LlvmValue } from "./types.js";

/** A block handle belongs to one function and may be referenced before its block is built. */
export interface LlvmBlockLabel {
  readonly name: string;
  readonly functionOwner: symbol;
}

/** A `switch` case as the caller states it: one integer value and the block it transfers to. */
export interface LlvmSwitchCase {
  readonly value: bigint;
  readonly target: LlvmBlockLabel;
}

/** One `(value, block)` pair of a `phi`, as the caller states it. */
export interface LlvmPhiIncoming {
  readonly value: LlvmValue;
  readonly block: LlvmBlockLabel;
}

/** The first getelementptr index steps over whole source elements; later indices select within them. */
export interface LlvmGepIndex {
  readonly type: LlvmIntegerType;
  readonly value: bigint | LlvmValue;
}

const labelsByBlock = new WeakMap<object, LlvmBlockLabel>();

function internalError(message: string): Error {
  return new Error(`Internal compiler error: ${message}`);
}

export function createLlvmBlockLabel(name: string, functionOwner: symbol): LlvmBlockLabel {
  const label: LlvmBlockLabel = Object.freeze({ name, functionOwner });
  labelsByBlock.set(label, label);
  return label;
}

/** Narrows a branch target to a label this function minted, rejecting a handle from another one. */
export function assertBlockLabel(label: LlvmBlockLabel, functionOwner: symbol): void {
  if (!labelsByBlock.has(label)) {
    throw internalError("LLVM branch target is not a block label");
  }
  if (label.functionOwner !== functionOwner) {
    throw internalError(`LLVM branch target ${label.name} belongs to another function`);
  }
}

/** Renders the `label %name` operand every terminator and switch case ends with. */
export function renderLlvmBlockLabel(label: LlvmBlockLabel): string {
  return `label %${label.name}`;
}