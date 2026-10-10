import type { LlvmValue, LlvmValueType, llvm } from "../llvm-ir/index.js";
import type { BlockCursor } from "./cursor.js";

export function branchValue<T extends LlvmValueType>(
  cursor: BlockCursor, condition: LlvmValue<typeof llvm.i1>, type: T,
  consequent: () => LlvmValue<T>, alternate: () => LlvmValue<T>, hint: string
): LlvmValue<T> {
  const yes = cursor.reserveBlock(`${hint}.yes`);
  const no = cursor.reserveBlock(`${hint}.no`);
  const join = cursor.reserveBlock(`${hint}.join`);
  cursor.currentBlock().condBr(condition, yes, no);
  cursor.openBlock(yes);
  const positive = consequent();
  const positiveBlock = cursor.currentBlock();
  positiveBlock.br(join);
  cursor.openBlock(no);
  const negative = alternate();
  const negativeBlock = cursor.currentBlock();
  negativeBlock.br(join);
  cursor.openBlock(join);
  return cursor.currentBlock().phi(type, [
    { value: positive, block: positiveBlock.label }, { value: negative, block: negativeBlock.label }
  ], cursor.uniqueName(hint));
}
