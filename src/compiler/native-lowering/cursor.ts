import type { LlvmBlockBuilder, LlvmBlockLabel } from "../llvm-ir/index.js";

export interface BlockCursor {
  currentBlock(): LlvmBlockBuilder;
  reserveBlock(hint: string): LlvmBlockLabel;
  openBlock(target: LlvmBlockLabel): void;
  createBlock(hint: string): LlvmBlockLabel;
  uniqueName(hint: string): string;
}
