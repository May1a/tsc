import type { LlvmValue } from "../llvm-ir/index.js";

export interface GcProtection {
  readonly kind: "value";
  readonly value: LlvmValue;
}

export interface GcHeapReference {
  readonly value: LlvmValue;
  readonly protection: GcProtection;
}

export interface GcFunctionFacts {
  readonly heapReferences: readonly GcHeapReference[];
  /** Parameters and globals whose callers guarantee protection for the whole invocation. */
  readonly borrowedRoots: readonly GcProtection[];
}

export interface GcViolation {
  readonly functionName: string;
  readonly blockName: string;
  readonly instructionIndex: number;
  readonly value: string;
  readonly message: string;
}
