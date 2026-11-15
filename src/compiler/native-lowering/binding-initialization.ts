import { type LlvmGlobalReference, type LlvmValue, llvm } from "../llvm-ir/index.js";
import type { BindingAccess } from "./binding-access.js";
import type { BindingReads } from "./expression-context.js";
import type { FunctionCapabilities } from "./function-owner.js";
import type { ExceptionTarget } from "./runtime-calls.js";

/** Captured lexical cells reserve index 1 for their initialization flag. */
export function checkCellInitialized(
  cell: LlvmValue<typeof llvm.ptr>, name: string, capabilities: FunctionCapabilities,
  constant: (text: string) => LlvmGlobalReference, exception: ExceptionTarget
): void {
  const { cursor, runtime, values, roots } = capabilities;
  const flag = runtime.callBoxed("environmentGet", [cell, cursor.currentBlock().int(llvm.i64, 1n)], cursor.uniqueName("binding.initialized"));
  const initialized = values.forBlock(cursor.currentBlock()).isImmediate(flag, "true");
  const ready = cursor.reserveBlock("binding.ready");
  const missing = cursor.reserveBlock("binding.uninitialized");
  cursor.currentBlock().condBr(initialized, ready, missing);
  cursor.openBlock(missing);
  const message = `Cannot access '${name}' before initialization`;
  const block = cursor.currentBlock();
  const text = runtime.callBoxed("valueCopyString", [block.globalPointer(constant(message)),
    block.int(llvm.i64, BigInt(new TextEncoder().encode(message).length))], cursor.uniqueName("binding.error.message"));
  roots.push(text);
  runtime.callWithCompletion("errorThrowReference", [text], cursor.uniqueName("binding.error"), exception);
  cursor.currentBlock().br(ready);
  cursor.openBlock(ready);
}

/** Reads check the captured cell; initialization stores and closure creation do not read it. */
export function checkedBindingReads(writes: BindingAccess, exception: () => ExceptionTarget): BindingReads {
  return {
    number: (reference) => { writes.checkInitialized(reference, exception); return writes.number(reference); },
    string: (reference) => { writes.checkInitialized(reference, exception); return writes.string(reference); },
    boolean: (reference) => { writes.checkInitialized(reference, exception); return writes.boolean(reference); },
    value: (reference) => { writes.checkInitialized(reference, exception); return writes.value(reference); },
    pointer: (reference) => { writes.checkInitialized(reference, exception); return writes.pointer(reference); },
    holdsPrimitive: (reference) => writes.holdsPrimitive(reference),
    fixedArrayLength: (reference) => writes.fixedArrayLength(reference),
    arrayElement: (reference, index) => writes.arrayElement(reference, index),
    objectField: (reference, path) => writes.objectField(reference, path),
    storeNumber: (reference, value) => { writes.checkInitialized(reference, exception); writes.storeNumber(reference, value); }
  };
}
