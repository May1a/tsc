const bindingIdBrand: unique symbol = Symbol("tscn.bindingId");
const functionIdBrand: unique symbol = Symbol("tscn.functionId");

/** One lexical declaration's identity. Opaque; only `BindingRegistry.mint` produces one. */
export interface BindingId {
  readonly ordinal: number;
  readonly [bindingIdBrand]: true;
}

export interface FunctionId {
  readonly ordinal: number;
  readonly [functionIdBrand]: true;
}

export interface BindingRef {
  readonly binding: BindingId;
}

/** What sort of declaration this is. It decides how the slot is allocated, not how it is read. */
export type BindingKind = "const" | "let" | "function" | "parameter" | "loopItem" | "catch" | "destination";

export type BindingRepresentation =
  /** A `double` in a register or an `alloca`. The Number tier's direct form. */
  | { readonly kind: "number" }
  /** A `ptr` plus a length `i64`. The String tier's direct form. */
  | { readonly kind: "string" }
  /** An `i1`. */
  | { readonly kind: "boolean" }
  /** A boxed `i64` JsValue in an `alloca`. */
  | { readonly kind: "value" }
  /** A `ptr` to a fixed-layout array of `length` doubles. */
  | { readonly kind: "fixedArray"; readonly length: number }
  /** A `ptr` to a runtime array object. */
  | { readonly kind: "runtimeArray" }
  /** A fixed-layout object: one `alloca` per field, addressed by field index. */
  | { readonly kind: "fixedObject"; readonly fieldCount: number }
  /** A `ptr` to a runtime object, for property access through the runtime. */
  | { readonly kind: "runtimeObject" }
  /** A `ptr` to a runtime Map. */
  | { readonly kind: "runtimeMap" }
  /** A `ptr` to a runtime Set. */
  | { readonly kind: "runtimeSet" }
  /** A `ptr` to a collection iterator, tagged with what it iterates and how. */
  | {
      readonly kind: "runtimeIterator";
      readonly sourceKind: "map" | "set";
      readonly iterationKind: "keys" | "values" | "entries";
    }
  /** A closure environment plus a code pointer. */
  | { readonly kind: "closure" }
  /** A function's own frame. Its parameters are separate bindings. */
  | { readonly kind: "function" };

export type BindingLocation =
  /** An `alloca` or a register in the frame of the function that declares it. */
  | { readonly kind: "frame" }
  /** A module-level global. Stable-addressed, and shared by every function in the source file. */
  | { readonly kind: "moduleScope" }
  /** A slot in the declaring function's closure environment, because a nested function reads it. */
  | { readonly kind: "environment" };

export type LexicalOwner = { readonly kind: "module" } | { readonly kind: "function"; readonly function: FunctionId };

/** A declaration's representation together with the address that holds it. */
export interface BindingStorage {
  readonly representation: BindingRepresentation;
  readonly location: BindingLocation;
}

/** One declaration, as the table records it. */
export interface BindingDeclaration {
  readonly id: BindingId;
  /** The source spelling, kept for diagnostics and for observable function names. */
  readonly spelling: string;
  readonly kind: BindingKind;
  readonly storage: BindingStorage;
  /** The function whose frame holds it, or the module when it is a module-scope declaration. */
  readonly owner: LexicalOwner;
  /** True when a function other than the owner reads it, which is what forces an environment slot. */
  readonly captured: boolean;
}

export interface BindingTable {
  readonly declarations: readonly BindingDeclaration[];
}

function locationFor(owner: LexicalOwner, captured: boolean): BindingLocation {
  if (owner.kind === "module") {
    return { kind: "moduleScope" };
  }
  return captured ? { kind: "environment" } : { kind: "frame" };
}

/** A declaration as resolution records it, before the table decides where the slot lives. */
interface RecordedBinding {
  readonly id: BindingId;
  readonly spelling: string;
  readonly kind: BindingKind;
  readonly representation: BindingRepresentation;
  readonly owner: LexicalOwner;
  captured: boolean;
}

export class BindingRegistry {
  readonly #recorded: RecordedBinding[] = [];
  #functionCount = 0;

  /** A fresh function identity. Ordinals are dense and allocated in resolution order. */
  public mintFunction(): FunctionId {
    const functionId: FunctionId = { ordinal: this.#functionCount, [functionIdBrand]: true };
    this.#functionCount += 1;
    return functionId;
  }

  /** Declares a binding and returns a reference to it. */
  public mint(
    spelling: string,
    kind: BindingKind,
    representation: BindingRepresentation,
    owner: LexicalOwner
  ): BindingRef {
    const id: BindingId = { ordinal: this.#recorded.length, [bindingIdBrand]: true };
    this.#recorded.push({ id, spelling, kind, representation, owner, captured: false });
    return { binding: id };
  }

  /** The function whose frame holds a declaration, or the module when it is module-scope. */
  public ownerOf(reference: BindingRef): LexicalOwner {
    return this.#require(reference).owner;
  }

  public markCaptured(reference: BindingRef): void {
    this.#require(reference).captured = true;
  }

  /** The finished table. Locations are decided here, once every capture has been seen. */
  public table(): BindingTable {
    return { declarations: this.#recorded.map((record) => this.#finalize(record)) };
  }

  #finalize(record: RecordedBinding): BindingDeclaration {
    return {
      id: record.id,
      spelling: record.spelling,
      kind: record.kind,
      owner: record.owner,
      captured: record.captured,
      storage: { representation: record.representation, location: locationFor(record.owner, record.captured) }
    };
  }

  #require(reference: BindingRef): RecordedBinding {
    const record = this.#recorded.at(reference.binding.ordinal);
    if (record === undefined || record.id !== reference.binding) {
      throw new Error("Binding reference belongs to another resolution");
    }
    return record;
  }
}
