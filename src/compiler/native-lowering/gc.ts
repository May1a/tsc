import { type GcFunctionFacts, type GcHeapReference, type GcProtection, verifyGcLiveness } from "../gc-liveness/index.js";
import { type BuiltLlvmFunction, type LlvmValue, type llvm, llvmValueText } from "../llvm-ir/index.js";
import type { RuntimeCallees } from "../runtime-contracts/callables/index.js";
import type { BlockCursor } from "./cursor.js";
import { verifyRootFrames } from "./root-frame-verification.js";
import type { BoxedValue } from "./value-boundary.js";

class RootFrame {
  readonly #depth: LlvmValue<typeof llvm.i64>;
  public constructor(depth: LlvmValue<typeof llvm.i64>) { this.#depth = depth; }
  public depth(): LlvmValue<typeof llvm.i64> { return this.#depth; }
}

export interface RootCapability {
  save(): RootFrame;
  push(value: BoxedValue): void;
  pushSlot(slot: LlvmValue<typeof llvm.ptr>): void;
  restore(frame: RootFrame): void;
}

export class HeapFacts {
  readonly #references = new Map<LlvmValue, GcHeapReference>();
  /** The first reference recorded under each operand text, which a borrowed pointer inherits its owner from. */
  readonly #owners = new Map<string, GcHeapReference>();
  readonly #borrowed: GcProtection[] = [];

  public boxed(value: BoxedValue): void { this.reference(value, value); }
  public reference(value: LlvmValue, owner: LlvmValue): void {
    this.#record({ value, protection: { kind: "value", value: owner } });
  }
  public unownedPointer(value: LlvmValue<typeof llvm.ptr>): void {
    this.#record({ value, protection: { kind: "value", value } });
  }
  public borrowedPointer(pointer: LlvmValue<typeof llvm.ptr>, source: LlvmValue): void {
    const owner = this.#owners.get(llvmValueText(source));
    this.reference(pointer, owner?.protection.value ?? source);
  }
  public parameter(value: BoxedValue, borrowed: boolean): void {
    this.boxed(value);
    if (borrowed) { this.#borrowed.push({ kind: "value", value }); }
  }
  #record(reference: GcHeapReference): void {
    const text = llvmValueText(reference.value);
    const first = this.#owners.get(text);
    if (first === undefined || first.value === reference.value) { this.#owners.set(text, reference); }
    this.#references.set(reference.value, reference);
  }
  public finish(): GcFunctionFacts {
    return Object.freeze({ heapReferences: Object.freeze([...this.#references.values()]), borrowedRoots: Object.freeze([...this.#borrowed]) });
  }
}

export function createRootCapability(cursor: BlockCursor, callees: RuntimeCallees): RootCapability {
  const owned = new Set<RootFrame>();
  return Object.freeze({
    save() {
      const frame = new RootFrame(cursor.currentBlock().call(callees.gcRootSave, [], "gc.frame"));
      owned.add(frame);
      return frame;
    },
    push(value: BoxedValue) { cursor.currentBlock().call(callees.gcRootPush, [value]); },
    pushSlot(slot: LlvmValue<typeof llvm.ptr>) { cursor.currentBlock().call(callees.gcRootPushSlot, [slot]); },
    restore(frame: RootFrame) {
      if (!owned.has(frame)) { throw new Error("GC frame belongs to another function"); }
      cursor.currentBlock().call(callees.gcRootRestore, [frame.depth()]);
    }
  });
}

// Root frames must be restored on every reachable return, including alternate exits.
export function verifyFunctionGc(fn: BuiltLlvmFunction, facts: GcFunctionFacts): void {
  verifyRootFrames(fn);
  const violations = verifyGcLiveness(fn, facts);
  if (violations.length > 0) {
    throw new Error(violations.map((violation) => violation.message).join("\n"));
  }
}
