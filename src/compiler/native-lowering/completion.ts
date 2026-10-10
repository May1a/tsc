import { type LlvmBlockLabel, type LlvmValue, llvm } from "../llvm-ir/index.js";

export const completionAggregate = llvm.struct([llvm.i64, llvm.i1]);

export interface ExceptionTarget {
  readonly block: LlvmBlockLabel;
  readonly payloadSlot: LlvmValue<typeof llvm.ptr>;
}
