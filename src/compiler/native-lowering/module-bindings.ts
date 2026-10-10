import { type BindingDeclaration, type BindingId, type BindingRef, type FunctionId, type ResolvedModule, type ResolvedObjectValue, type ResolvedOperation, resolvedOperationChildren } from "../binding-resolution/index.js";
import { type LlvmGlobalReference, type LlvmValue, type LlvmValueType, llvm } from "../llvm-ir/index.js";
import { BindingAccess } from "./binding-access.js";
import { allocateBinding, materializeGlobal } from "./binding-allocation.js";
import type { BindingStorage } from "./binding-storage.js";
import type { FunctionCapabilities } from "./function-owner.js";
import type { NativeModule } from "./module-owner.js";

export interface ObjectLayout {
  readonly fields: readonly { readonly key: string; readonly object?: ObjectLayout }[];
  readonly shadowed: boolean;
}

export type GlobalBlueprint =
  | { readonly kind: "number" | "boolean" | "boxed"; readonly global: LlvmGlobalReference }
  | { readonly kind: "string"; readonly bytes: LlvmGlobalReference; readonly length: LlvmGlobalReference; readonly owner: LlvmGlobalReference }
  | { readonly kind: "fixedArray"; readonly global: LlvmGlobalReference; readonly length: number }
  | { readonly kind: "fixedObject"; readonly shadow: LlvmGlobalReference; readonly shadowed: boolean;
      readonly fields: readonly { readonly key: string; readonly storage: GlobalBlueprint }[] };

export interface IncomingCaptures {
  readonly environment: LlvmValue<typeof llvm.ptr>;
  readonly bindings: readonly BindingRef[];
  readonly globalAliases?: readonly { readonly target: BindingRef; readonly source: BindingRef }[];
}

export class ModuleBindings {
  readonly #module: NativeModule;
  readonly #declarations: readonly BindingDeclaration[];
  readonly #layouts = new Map<BindingId, ObjectLayout>();
  readonly #globals = new Map<BindingId, GlobalBlueprint>();
  readonly #roots: LlvmGlobalReference[] = [];

  public constructor(module: NativeModule, resolved: ResolvedModule) {
    this.#module = module;
    this.#declarations = resolved.bindings.declarations;
    for (const source of resolved.modules) {
      this.#collectLayouts(source.operations);
      for (const definition of source.functionObjects) this.#collectLayouts(definition.body ?? []);
    }
    for (const declaration of this.#declarations) {
      if (declaration.storage.location.kind === "moduleScope") {
        this.#globals.set(declaration.id, this.#global(declaration));
      }
    }
  }

  public registerGlobalRoots(capabilities: FunctionCapabilities): void {
    for (const global of this.#roots) {
      capabilities.runtime.callVoid("gcRegisterGlobalRoot", [capabilities.cursor.currentBlock().globalPointer(global)]);
    }
  }

  public allocate(capabilities: FunctionCapabilities, owner: FunctionId | "module", captures?: IncomingCaptures): BindingAccess {
    if (capabilities.cursor.currentBlock().label.name !== "entry") throw new Error("Binding storage must be allocated in the entry block");
    const storage = new Map<BindingId, BindingStorage>();
    for (const [id, global] of this.#globals) storage.set(id, materializeGlobal(global, capabilities));
    for (const declaration of this.#declarations) {
      if (owner === "module" || declaration.owner.kind !== "function" || declaration.owner.function !== owner) continue;
      storage.set(declaration.id, allocateBinding(declaration, this.#layouts.get(declaration.id), capabilities));
    }
    for (const [index, reference] of (captures?.bindings ?? []).entries()) {
      const declaration = this.#declarations.at(reference.binding.ordinal);
      if (declaration?.id !== reference.binding) throw new Error("Capture belongs to another resolution");
      if (declaration.storage.location.kind === "moduleScope") continue;
      if (captures === undefined) throw new Error("Capture has no environment");
      const { cursor, runtime, roots, values } = capabilities;
      const cellValue = runtime.callBoxed("environmentGet", [captures.environment, cursor.currentBlock().int(llvm.i64, BigInt(index))],
        cursor.uniqueName("capture.cell"));
      roots.push(cellValue);
      storage.set(reference.binding, { kind: "environment", owner: cellValue, cell: values.forBlock(cursor.currentBlock()).unboxReference(cellValue) });
    }
    for (const alias of captures?.globalAliases ?? []) {
      const global = storage.get(alias.source.binding);
      if (global === undefined || !this.#globals.has(alias.source.binding)) {
        throw new Error("Capture alias must reference an allocated module binding");
      }
      storage.set(alias.target.binding, global);
    }
    return new BindingAccess(capabilities, storage, (text) => this.#module.stringConstant(text));
  }

  #collectLayouts(operations: readonly ResolvedOperation[]): void {
    for (const operation of operations) {
      if (operation.kind === "objectLiteral") {
        this.#layouts.set(operation.name.binding, objectLayout(operation.value, operation.needsRuntimeShadow));
      }
      this.#collectLayouts(resolvedOperationChildren(operation));
    }
  }

  #global(declaration: BindingDeclaration): GlobalBlueprint {
    const {representation} = declaration.storage;
    const stem = `tscn.binding.${declaration.id.ordinal}`;
    switch (representation.kind) {
      case "number": { return { kind: "number", global: this.#define(stem, llvm.double) };
      }
      case "boolean": { return { kind: "boolean", global: this.#define(stem, llvm.i1) };
      }
      case "string": {
        const owner = this.#define(`${stem}.owner`, llvm.i64);
        this.#roots.push(owner);
        return { kind: "string", bytes: this.#define(`${stem}.bytes`, llvm.ptr), length: this.#define(`${stem}.length`, llvm.i64), owner };
      }
      case "fixedArray": { return { kind: "fixedArray", global: this.#define(stem, llvm.array(llvm.double, representation.length)), length: representation.length };
      }
      case "fixedObject": {
        const layout = this.#layouts.get(declaration.id);
        if (layout === undefined) throw new Error("Fixed object has no resolved initializer layout");
        return this.#objectGlobal(stem, layout);
      }
      default: {
        const global = this.#define(stem, llvm.i64);
        this.#roots.push(global);
        return { kind: "boxed", global };
      }
    }
  }

  #objectGlobal(stem: string, layout: ObjectLayout): GlobalBlueprint {
    const shadow = this.#define(`${stem}.shadow`, llvm.i64);
    if (layout.shadowed) this.#roots.push(shadow);
    return { kind: "fixedObject", shadow, shadowed: layout.shadowed, fields: layout.fields.map((field, index) => ({
      key: field.key,
      storage: field.object === undefined
        ? { kind: "number", global: this.#define(`${stem}.field.${index}`, llvm.double) }
        : this.#objectGlobal(`${stem}.field.${index}`, field.object)
    })) };
  }

  #define(name: string, type: LlvmValueType): LlvmGlobalReference {
    return this.#module.defineGlobal({ name, type, linkage: "internal", constant: false, unnamedAddress: false,
      initializer: { kind: "zeroInitializer", type } });
  }
}

function objectLayout(value: ResolvedObjectValue, shadowed: boolean): ObjectLayout {
  return { shadowed, fields: value.fields.map((field) => field.value.kind === "number"
    ? { key: field.name } : { key: field.name, object: objectLayout(field.value.value, false) }) };
}
