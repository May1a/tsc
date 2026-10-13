import type { BindingId, BindingRef } from "../binding-resolution/index.js";
import { type LlvmGlobalReference, type LlvmValue, llvm } from "../llvm-ir/index.js";
import type { BindingStorage, FixedObjectStorage } from "./binding-storage.js";
import type { BindingReads, NativeString } from "./expression-context.js";
import type { FunctionCapabilities } from "./function-owner.js";
import type { BoxedValue } from "./value-boundary.js";
import { type VariantHandlers, type VariantOfKind, dispatchKind } from "../dispatch.js";

const primitiveStorageKinds: ReadonlySet<BindingStorage["kind"]> = new Set([
  "numberSlot", "numberRegister", "stringSlot", "stringRegister", "booleanSlot", "booleanRegister"
]);

export class BindingAccess implements BindingReads {
  readonly #storage: ReadonlyMap<BindingId, BindingStorage>;
  readonly #capabilities: FunctionCapabilities;
  readonly #constant: (text: string) => LlvmGlobalReference;

  public constructor(
    capabilities: FunctionCapabilities, storage: ReadonlyMap<BindingId, BindingStorage>,
    stringConstant: (text: string) => LlvmGlobalReference
  ) {
    this.#capabilities = capabilities;
    this.#storage = new Map(storage);
    this.#constant = stringConstant;
    if (capabilities.cursor.currentBlock().label.name !== "entry") {
      throw new Error("Binding roots must be registered in the function entry block");
    }
    for (const binding of this.#storage.values()) this.#rootStorage(binding);
  }

  public number(reference: BindingRef): LlvmValue<typeof llvm.double> {
    const storage = this.#require(reference);
    const { cursor, runtime } = this.#capabilities;
    switch (storage.kind) {
      case "numberRegister": { return storage.value; }
      case "numberSlot": { return cursor.currentBlock().load(llvm.double, storage.slot, cursor.uniqueName("binding.number")); }
      default: { return runtime.call("valueToNumber", [this.value(reference)], cursor.uniqueName("binding.number")); }
    }
  }

  #rootStorage(storage: BindingStorage): void {
    rootStorage(storage, this.#capabilities);
  }

  public string(reference: BindingRef): NativeString {
    const storage = this.#require(reference);
    const { cursor, runtime } = this.#capabilities;
    if (storage.kind === "stringRegister") return { bytes: storage.bytes, length: storage.length };
    if (storage.kind === "stringSlot") {
      const owner = this.#loaded(storage.ownerSlot);
      return {
        bytes: runtime.callPointer("valueStringPtr", [owner], cursor.uniqueName("binding.bytes")),
        length: cursor.currentBlock().load(llvm.i64, storage.lengthSlot, cursor.uniqueName("binding.length"))
      };
    }
    const value = this.value(reference);
    return runtime.callString("valueToString", [value], cursor.uniqueName("binding.string"));
  }

  public boolean(reference: BindingRef): LlvmValue<typeof llvm.i1> {
    const storage = this.#require(reference);
    const { cursor, runtime } = this.#capabilities;
    switch (storage.kind) {
      case "booleanRegister": { return storage.value; }
      case "booleanSlot": { return cursor.currentBlock().load(llvm.i1, storage.slot, cursor.uniqueName("binding.boolean")); }
      default: { return runtime.call("valueTruthy", [this.value(reference)], cursor.uniqueName("binding.boolean")); }
    }
  }

  public holdsPrimitive(reference: BindingRef): boolean {
    return primitiveStorageKinds.has(this.#require(reference).kind);
  }

  public value(reference: BindingRef): BoxedValue {
    const storage = this.#require(reference);
    const { cursor, runtime, values, roots } = this.#capabilities;
    const boundary = values.forBlock(cursor.currentBlock());
    switch (storage.kind) {
      case "numberRegister": { return boundary.boxNumber(storage.value); }
      case "numberSlot": { return boundary.boxNumber(this.number(reference)); }
      case "booleanRegister": case "booleanSlot": {
        return cursor.currentBlock().select(this.boolean(reference), boundary.immediate("true"), boundary.immediate("false"),
          cursor.uniqueName("binding.boolean.value"));
      }
      case "stringSlot": { return this.#loaded(storage.ownerSlot); }
      case "stringRegister": {
        const string = this.string(reference);
        const boxed = runtime.callBoxed("valueCopyString", [string.bytes, string.length], cursor.uniqueName("binding.string.value"));
        roots.push(boxed);
        return boxed;
      }
      case "environment": {
        return this.#environmentValue(storage);
      }
      case "environmentSlot": {
        return this.#environmentValue(this.#resolveSlot(storage));
      }
      case "boxedSlot": { return this.#loaded(storage.slot); }
      case "boxedGlobal": { return this.#loaded(cursor.currentBlock().globalPointer(storage.global)); }
      case "boxedRegister": case "closure": case "function": {
        const value = boundary.fromBoundary(storage.value);
        roots.push(value);
        return value;
      }
      case "runtimeArray": case "runtimeObject": case "collection": {
        const value = boundary.fromBoundary(storage.owner);
        roots.push(value);
        return value;
      }
      case "fixedArray": {
        const pointer = runtime.callPointer("arrayFromFixed", [cursor.currentBlock().int(llvm.i64, BigInt(storage.length)), storage.slot],
          cursor.uniqueName("binding.array"));
        const value = values.forBlock(cursor.currentBlock()).boxReference("array", pointer);
        roots.push(value);
        return value;
      }
      case "fixedObject": { return storage.shadowed ? this.#loaded(storage.shadowSlot) : this.#boxObject(storage); }
      default: {
        const exhaustive: never = storage;
        throw new Error(`Unknown binding storage ${String(exhaustive)}`);
      }
    }
  }

  public pointer(reference: BindingRef): LlvmValue<typeof llvm.ptr> {
    const storage = this.#require(reference);
    const { cursor, values } = this.#capabilities;
    switch (storage.kind) {
      case "runtimeArray": case "runtimeObject": case "collection": {
        this.value(reference);
        return cursor.currentBlock().load(llvm.ptr, storage.slot, cursor.uniqueName("binding.pointer"));
      }
      case "fixedArray": { return storage.slot; }
      case "closure": case "function": { return storage.code; }
      default: {
        const value = this.value(reference);
        return values.forBlock(cursor.currentBlock()).unboxReference(value);
      }
    }
  }

  public fixedArrayLength(reference: BindingRef): number | undefined {
    const storage = this.#require(reference);
    return storage.kind === "fixedArray" ? storage.length : undefined;
  }

  public arrayElement(reference: BindingRef, index: LlvmValue<typeof llvm.i64>): LlvmValue<typeof llvm.ptr> {
    const storage = this.#require(reference);
    if (storage.kind !== "fixedArray") throw new Error("Numeric array access requires fixed-array storage");
    const { cursor } = this.#capabilities;
    const block = cursor.currentBlock();
    return block.getElementPtr(llvm.array(llvm.double, storage.length), storage.slot, [{ type: llvm.i64, value: 0n }, { type: llvm.i64, value: index }],
      cursor.uniqueName("binding.element"));
  }

  public objectField(reference: BindingRef, path: readonly string[]): LlvmValue<typeof llvm.ptr> {
    const storage = this.#require(reference);
    if (storage.kind !== "fixedObject") throw new Error("Numeric field access requires fixed-object storage");
    return this.#field(storage, path);
  }

  public storeNumber(reference: BindingRef, value: LlvmValue<typeof llvm.double>): void {
    const storage = this.#require(reference);
    if (storage.kind === "numberSlot") {
      this.#capabilities.cursor.currentBlock().store(value, storage.slot);
      return;
    }
    this.storeValue(reference, this.#capabilities.values.forBlock(this.#capabilities.cursor.currentBlock()).boxNumber(value));
  }

  public storeBoolean(reference: BindingRef, value: LlvmValue<typeof llvm.i1>): void {
    const storage = this.#require(reference);
    const { cursor, values } = this.#capabilities;
    if (storage.kind === "booleanSlot") { cursor.currentBlock().store(value, storage.slot); return; }
    const boundary = values.forBlock(cursor.currentBlock());
    this.storeValue(reference, cursor.currentBlock().select(value, boundary.immediate("true"), boundary.immediate("false"),
      cursor.uniqueName("binding.boolean.value")));
  }

  public storeString(reference: BindingRef, value: NativeString): void {
    const storage = this.#require(reference);
    const { cursor, runtime, roots } = this.#capabilities;
    const boxed = runtime.callBoxed("valueCopyString", [value.bytes, value.length], cursor.uniqueName("binding.string.owner"));
    roots.push(boxed);
    if (storage.kind === "stringSlot") {
      cursor.currentBlock().store(runtime.callPointer("valueStringPtr", [boxed], cursor.uniqueName("binding.string.bytes")), storage.slot);
      cursor.currentBlock().store(value.length, storage.lengthSlot);
      cursor.currentBlock().store(boxed, storage.ownerSlot);
      return;
    }
    this.storeValue(reference, boxed);
  }

  public storeValue(reference: BindingRef, value: BoxedValue): void {
    const storage = this.#require(reference);
    const { cursor, roots, runtime } = this.#capabilities;
    roots.push(value);
    switch (storage.kind) {
      case "numberSlot": {
        cursor.currentBlock().store(runtime.call("valueToNumber", [value], cursor.uniqueName("binding.number")), storage.slot);
        return;
      }
      case "booleanSlot": {
        cursor.currentBlock().store(runtime.call("valueTruthy", [value], cursor.uniqueName("binding.boolean")), storage.slot);
        return;
      }
      case "stringSlot": {
        this.storeString(reference, runtime.callString("valueToString", [value], cursor.uniqueName("binding.string")));
        return;
      }
      case "environment": {
        roots.push(storage.owner);
        this.#capabilities.runtime.callVoid("environmentSet", [storage.cell, cursor.currentBlock().int(llvm.i64, 0n), value]);
        return;
      }
      case "environmentSlot": {
        const current = this.#resolveSlot(storage);
        roots.push(current.owner);
        this.#capabilities.runtime.callVoid("environmentSet", [current.cell, cursor.currentBlock().int(llvm.i64, 0n), value]);
        return;
      }
      case "boxedSlot": { cursor.currentBlock().store(value, storage.slot); return; }
      case "boxedGlobal": { cursor.currentBlock().store(value, cursor.currentBlock().globalPointer(storage.global)); return; }
      default: { throw new Error(`Boxed assignment requires a boxed slot, received ${storage.kind}`); }
    }
  }

  public captureCell(reference: BindingRef): BoxedValue {
    const storage = this.#require(reference);
    if (storage.kind === "environmentSlot") {
      return this.#captureCellValue(this.#resolveSlot(storage));
    }
    if (storage.kind !== "environment") throw new Error("Only environment bindings have capture cells");
    return this.#captureCellValue(storage);
  }

  /**
   * Renews a per-iteration binding's cell before its declaration stores the initial value.
   *
   * Every execution of a `let`/`const` declaration inside a loop is a fresh binding, so the
   * declaration first replaces the current cell with a new one holding `undefined`; closures
   * created earlier keep the previous cell, and closures created afterwards capture the new one.
   * Bindings without slot storage (declared outside loops, never captured, or `var`-shared) keep
   * their single cell, so this is a no-op for them. The caller is always a declaration handler or
   * a loop-item store, never an assignment: renewing on assignment would detach closures that must
   * observe the write.
   */
  public renewCell(reference: BindingRef): void {
    const storage = this.#require(reference);
    if (storage.kind !== "environmentSlot") {
      return;
    }
    const { cursor, runtime, values, roots } = this.#capabilities;
    const block = cursor.currentBlock();
    const cell = runtime.callPointer("environmentNew", [block.int(llvm.i64, 1n)], cursor.uniqueName("binding.cell"));
    const owner = values.forBlock(block).boxReference("object", cell);
    roots.push(owner);
    runtime.callVoid("environmentSet", [cell, block.int(llvm.i64, 0n), values.forBlock(block).immediate("undefined")]);
    block.store(cell, storage.cellSlot);
    block.store(owner, storage.ownerSlot);
  }

  /**
   * Copies a C-style `for` header binding's value into a fresh per-iteration cell.
   *
   * Per ECMA-262 the header `let` is a fresh binding on every iteration, initialized by copying the
   * previous iteration's value; the increment then updates the new cell, and closures created in
   * the body capture it. Emission calls this before each body. A `var` header is one shared binding
   * and is never rotated; anything without slot storage is a no-op.
   */
  public rotateCell(reference: BindingRef): void {
    const storage = this.#require(reference);
    if (storage.kind !== "environmentSlot") {
      return;
    }
    const { cursor, runtime, values, roots } = this.#capabilities;
    const block = cursor.currentBlock();
    const current = this.#resolveSlot(storage);
    const carried = runtime.callBoxed("environmentGet", [current.cell, block.int(llvm.i64, 0n)], cursor.uniqueName("binding.carried"));
    roots.push(carried);
    const cell = runtime.callPointer("environmentNew", [block.int(llvm.i64, 1n)], cursor.uniqueName("binding.cell"));
    const owner = values.forBlock(block).boxReference("object", cell);
    roots.push(owner);
    runtime.callVoid("environmentSet", [cell, block.int(llvm.i64, 0n), carried]);
    block.store(cell, storage.cellSlot);
    block.store(owner, storage.ownerSlot);
  }

  public initializeFixedArray(reference: BindingRef, elements: readonly LlvmValue<typeof llvm.double>[]): void {
    const length = this.fixedArrayLength(reference);
    if (length !== elements.length) throw new Error("Fixed-array initializer disagrees with its allocation");
    const block = this.#capabilities.cursor.currentBlock();
    for (const [index, element] of elements.entries()) {
      block.store(element, this.arrayElement(reference, block.int(llvm.i64, BigInt(index))));
    }
  }

  public initializeObjectShadow(reference: BindingRef): void {
    const storage = this.#require(reference);
    if (storage.kind !== "fixedObject") throw new Error("Object shadow requires fixed-object storage");
    if (storage.shadowed) this.#capabilities.cursor.currentBlock().store(this.#boxObject(storage), storage.shadowSlot);
  }

  public storeObjectNumber(reference: BindingRef, path: readonly string[], value: LlvmValue<typeof llvm.double>): void {
    const storage = this.#require(reference);
    if (storage.kind !== "fixedObject") throw new Error("Numeric object assignment requires fixed-object storage");
    const { cursor, values, runtime, roots } = this.#capabilities;
    cursor.currentBlock().store(value, this.#field(storage, path));
    if (!storage.shadowed) return;
    const boxed = this.#loaded(storage.shadowSlot);
    let pointer = values.forBlock(cursor.currentBlock()).unboxReference(boxed);
    const final = path.at(-1);
    if (final === undefined) throw new Error("Object assignment requires a field path");
    for (const key of path.slice(0, -1)) {
      const string = this.#stringConstant(key);
      const nested = runtime.callBoxed("objectGet", [pointer, string.length, string.bytes], cursor.uniqueName("binding.nested"));
      roots.push(nested);
      pointer = values.forBlock(cursor.currentBlock()).unboxReference(nested);
    }
    const key = this.#stringConstant(final);
    runtime.callVoid("objectSet", [pointer, key.length, key.bytes, values.forBlock(cursor.currentBlock()).boxNumber(value)]);
  }

  #environmentValue(storage: Extract<BindingStorage, { readonly kind: "environment" }>): BoxedValue {
    const { cursor, roots, runtime, values } = this.#capabilities;
    roots.push(values.forBlock(cursor.currentBlock()).fromBoundary(storage.owner));
    const value = runtime.callBoxed("environmentGet", [storage.cell, cursor.currentBlock().int(llvm.i64, 0n)],
      cursor.uniqueName("binding.environment.value"));
    roots.push(value);
    return value;
  }

  /** The cell a slot currently points at, with its owner rooted for the collecting calls below. */
  #resolveSlot(storage: Extract<BindingStorage, { readonly kind: "environmentSlot" }>): Extract<BindingStorage, { readonly kind: "environment" }> {
    const { cursor, values, roots } = this.#capabilities;
    const block = cursor.currentBlock();
    const cell = block.load(llvm.ptr, storage.cellSlot, cursor.uniqueName("binding.cell"));
    const owner = values.forBlock(block).fromBoundary(block.load(llvm.i64, storage.ownerSlot, cursor.uniqueName("binding.owner")));
    roots.push(owner);
    return { kind: "environment", cell, owner };
  }

  #captureCellValue(storage: Extract<BindingStorage, { readonly kind: "environment" }>): BoxedValue {
    const { cursor, values, roots } = this.#capabilities;
    const value = values.forBlock(cursor.currentBlock()).fromBoundary(storage.owner);
    roots.push(value);
    return value;
  }

  #loaded(slot: LlvmValue<typeof llvm.ptr>): BoxedValue {
    const { cursor, values, roots } = this.#capabilities;
    const value = values.forBlock(cursor.currentBlock()).fromBoundary(cursor.currentBlock().load(llvm.i64, slot, cursor.uniqueName("binding.value")));
    roots.push(value);
    return value;
  }

  #field(storage: FixedObjectStorage, path: readonly string[]): LlvmValue<typeof llvm.ptr> {
    const [key, ...remaining] = path;
    const field = storage.fields.find((entry) => entry.key === key);
    if (field === undefined) throw new Error(`Fixed object has no field ${key}`);
    if (remaining.length > 0 && field.storage.kind === "fixedObject") return this.#field(field.storage, remaining);
    if (remaining.length === 0 && field.storage.kind === "numberSlot") return field.storage.slot;
    throw new Error("Numeric object access ends at an object field");
  }

  #boxObject(storage: FixedObjectStorage): BoxedValue {
    const { cursor, runtime, roots, values } = this.#capabilities;
    const pointer = runtime.callPointer("objectNew", [cursor.currentBlock().int(llvm.i64, BigInt(storage.fields.length))],
      cursor.uniqueName("binding.object"));
    const boxed = values.forBlock(cursor.currentBlock()).boxReference("object", pointer);
    roots.push(boxed);
    for (const field of storage.fields) {
      const key = this.#stringConstant(field.key);
      const value = field.storage.kind === "fixedObject" ? this.#boxObject(field.storage)
        : values.forBlock(cursor.currentBlock()).boxNumber(cursor.currentBlock().load(llvm.double, field.storage.slot, cursor.uniqueName("field.number")));
      runtime.callVoid("objectSet", [pointer, key.length, key.bytes, value]);
    }
    return boxed;
  }

  #stringConstant(value: string): NativeString {
    const block = this.#capabilities.cursor.currentBlock();
    return { bytes: block.globalPointer(this.#constant(value)), length: block.int(llvm.i64, BigInt(new TextEncoder().encode(value).length)) };
  }

  #require(reference: BindingRef): BindingStorage {
    const storage = this.#storage.get(reference.binding);
    if (storage === undefined) throw new Error(`No allocated storage for binding ${reference.binding.ordinal}`);
    return storage;
  }
}

type StorageVariants = { readonly [Kind in BindingStorage["kind"]]: VariantOfKind<BindingStorage, Kind> };

const unrooted = (): void => undefined;

/**
 * What keeps each storage form's heap owner reachable for the collector.
 *
 * A slot is rooted by address, so whatever it holds later stays reachable; a register or a fixed
 * owner is rooted by value. Boxed globals are registered as module roots, and the other `unrooted`
 * forms hold no owner for this access to root.
 */
const storageRooting: VariantHandlers<StorageVariants, FunctionCapabilities, void> = {
  boxedSlot: (storage, { roots }) => { roots.pushSlot(storage.slot); },
  stringSlot: (storage, { roots }) => { roots.pushSlot(storage.ownerSlot); },
  environmentSlot: (storage, { roots }) => { roots.pushSlot(storage.ownerSlot); },
  fixedObject: (storage, capabilities) => {
    if (storage.shadowed) capabilities.roots.pushSlot(storage.shadowSlot);
    for (const field of storage.fields) rootStorage(field.storage, capabilities);
  },
  environment: (storage, capabilities) => { rootOwner(storage.owner, capabilities); },
  runtimeArray: (storage, capabilities) => { rootOwner(storage.owner, capabilities); },
  runtimeObject: (storage, capabilities) => { rootOwner(storage.owner, capabilities); },
  collection: (storage, capabilities) => { rootOwner(storage.owner, capabilities); },
  boxedRegister: (storage, capabilities) => { rootOwner(storage.value, capabilities); },
  closure: (storage, capabilities) => { rootOwner(storage.value, capabilities); },
  function: (storage, capabilities) => { rootOwner(storage.value, capabilities); },
  numberSlot: unrooted,
  numberRegister: unrooted,
  booleanSlot: unrooted,
  booleanRegister: unrooted,
  stringRegister: unrooted,
  boxedGlobal: unrooted,
  fixedArray: unrooted
};

function rootStorage(storage: BindingStorage, capabilities: FunctionCapabilities): void {
  dispatchKind(storageRooting, storage, capabilities);
}

function rootOwner(owner: LlvmValue<typeof llvm.i64>, { roots, values, cursor }: FunctionCapabilities): void {
  roots.push(values.forBlock(cursor.currentBlock()).fromBoundary(owner));
}
