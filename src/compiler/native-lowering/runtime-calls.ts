import type { LlvmBlockBuilder, LlvmFunctionSpec, LlvmValue, LlvmValueType, llvm } from "../llvm-ir/index.js";
import { type RuntimeSymbol, runtimeContracts } from "../runtime-contracts/index.js";
import type { RuntimeCallees } from "../runtime-contracts/callables/index.js";
import { consumeCompletion } from "./completion-calls.js";
import type { ExceptionTarget } from "./completion.js";
export { type ExceptionTarget, completionAggregate } from "./completion.js";
import type { BlockCursor } from "./cursor.js";
import type { HeapFacts } from "./gc.js";
import type { BoxedValue } from "./value-boundary.js";

type ContractOf<S extends RuntimeSymbol> = (typeof runtimeContracts)[S];
type ReturnOf<S extends RuntimeSymbol> = RuntimeCallees[S]["returns"];
export type SymbolsOfKind<Kind extends ContractOf<RuntimeSymbol>["resultKind"]> = {
  [S in RuntimeSymbol]: ContractOf<S>["resultKind"] extends Kind ? S : never;
}[RuntimeSymbol];
export type VoidSymbol = Exclude<SymbolsOfKind<"void">, "gcRootPush" | "gcRootPushSlot" | "gcRootRestore" | "gcRootPop">;
export type PlainSymbol = Exclude<SymbolsOfKind<"scalar" | "aggregate">, "gcRootSave">;
export type BoxedSymbol = SymbolsOfKind<"boxed">;
export type PointerSymbol = SymbolsOfKind<"pointer">;
export type CompletionSymbol = SymbolsOfKind<"completion">;
export type StringSymbol = SymbolsOfKind<"string">;

export interface RuntimeString {
  readonly bytes: LlvmValue<typeof llvm.ptr>;
  readonly length: LlvmValue<typeof llvm.i64>;
}

export interface RuntimeCallCapability {
  call<S extends PlainSymbol>(symbol: S, args: readonly LlvmValue[], name: string): LlvmValue<ReturnOf<S>>;
  callBoxed(symbol: BoxedSymbol, args: readonly LlvmValue[], name: string): BoxedValue;
  callPointer(symbol: PointerSymbol, args: readonly LlvmValue[], name: string): LlvmValue<typeof llvm.ptr>;
  callString(symbol: StringSymbol, args: readonly LlvmValue[], name: string): RuntimeString;
  callVoid(symbol: VoidSymbol, args: readonly LlvmValue[]): void;
  callWithCompletion(
    symbol: CompletionSymbol, args: readonly LlvmValue[], name: string, exception: ExceptionTarget
  ): BoxedValue;
}

function namedCall<T extends LlvmValueType>(
  block: LlvmBlockBuilder, spec: LlvmFunctionSpec & { readonly returns: T }, args: readonly LlvmValue[], name: string
): LlvmValue<T> {
  return block.call<T, LlvmFunctionSpec & { readonly returns: T }>(spec, args, name);
}

export function createRuntimeCalls(cursor: BlockCursor, callees: RuntimeCallees, facts: HeapFacts): RuntimeCallCapability {
  return Object.freeze({
    call<S extends PlainSymbol>(symbol: S, args: readonly LlvmValue[], name: string): LlvmValue<ReturnOf<S>> {
      return namedCall(cursor.currentBlock(), callees[symbol], args, name);
    },
    callBoxed(symbol: BoxedSymbol, args: readonly LlvmValue[], name: string) {
      const value = namedCall(cursor.currentBlock(), callees[symbol], args, name);
      if (symbol !== "valueBoxNumber") { facts.boxed(value); }
      if (symbol === "valueBoxArray" || symbol === "valueBoxObject" || symbol === "valueBoxString") {
        const pointer = args.at(0);
        if (pointer !== undefined) { facts.reference(pointer, value); }
      }
      return value;
    },
    callPointer(symbol: PointerSymbol, args: readonly LlvmValue[], name: string) {
      const pointer = namedCall(cursor.currentBlock(), callees[symbol], args, name);
      const ownership = runtimeContracts[symbol].pointerResult;
      if (ownership.kind === "heap") { facts.unownedPointer(pointer); }
      if (ownership.kind === "borrowed") {
        const source = args.at(ownership.parameter);
        if (source === undefined) { throw new Error(`Borrowed runtime pointer ${symbol} has no owner argument`); }
        facts.borrowedPointer(pointer, source);
      }
      return pointer;
    },
    callString(symbol: StringSymbol, args: readonly LlvmValue[], name: string) {
      const block = cursor.currentBlock();
      const result = namedCall(block, callees[symbol], args, name);
      const bytes = block.extractValue(result, 0, `${name}.bytes`);
      const length = block.extractValue(result, 1, `${name}.length`);
      const owner = namedCall(block, callees.valueCopyString, [bytes, length], `${name}.owner`);
      facts.boxed(owner);
      const ownedBytes = namedCall(block, callees.valueStringPtr, [owner], `${name}.owned.bytes`);
      facts.reference(ownedBytes, owner);
      block.call(callees.gcRootPush, [owner]);
      return Object.freeze({ bytes: ownedBytes, length });
    },
    callVoid(symbol: VoidSymbol, args: readonly LlvmValue[]) {
      cursor.currentBlock().call(callees[symbol], args);
    },
    callWithCompletion(
      symbol: CompletionSymbol, args: readonly LlvmValue[], name: string, exception: ExceptionTarget
    ) {
      const result = namedCall(cursor.currentBlock(), callees[symbol], args, name);
      return consumeCompletion(cursor, facts, result, name, exception);
    }
  });
}
