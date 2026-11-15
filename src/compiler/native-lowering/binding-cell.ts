import { llvm } from "../llvm-ir/index.js";
import type { BindingStorage } from "./binding-storage.js";
import type { FunctionCapabilities } from "./function-owner.js";
import type { BoxedValue } from "./value-boundary.js";

/** Cell payload and lexical initialization state travel together through closure environments. */
export function createBindingCell(
  capabilities: Pick<FunctionCapabilities, "cursor" | "runtime" | "values" | "roots">, value: BoxedValue, initialized: boolean, name: string
): Extract<BindingStorage, { readonly kind: "environment" }> {
  const { cursor, runtime, values, roots } = capabilities;
  roots.push(value);
  const block = cursor.currentBlock();
  const cell = runtime.callPointer("environmentNew", [block.int(llvm.i64, 2n)], name);
  const owner = values.forBlock(block).boxReference("object", cell);
  roots.push(owner);
  runtime.callVoid("environmentSet", [cell, block.int(llvm.i64, 0n), value]);
  runtime.callVoid("environmentSet", [cell, block.int(llvm.i64, 1n), values.forBlock(block).immediate(initialized ? "true" : "false")]);
  return { kind: "environment", cell, owner };
}
