import type { LlvmBlockBuilder, LlvmBlockLabel, LlvmPointerType, LlvmValue, LlvmValueType } from "../llvm-ir/index.js";

export interface BlockCursor {
  currentBlock(): LlvmBlockBuilder;
  reserveBlock(hint: string): LlvmBlockLabel;
  openBlock(target: LlvmBlockLabel): void;
  createBlock(hint: string): LlvmBlockLabel;
  entryAllocaArray(type: LlvmValueType, count: bigint, name: string): LlvmValue<LlvmPointerType>;
  uniqueName(hint: string): string;
}
