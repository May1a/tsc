import type { BindingDeclaration } from "../binding-resolution/index.js";
import { type LlvmValue, llvm } from "../llvm-ir/index.js";
import type { BindingStorage, FixedObjectStorage } from "./binding-storage.js";
import type { FunctionCapabilities } from "./function-owner.js";
import type { GlobalBlueprint, ObjectLayout } from "./module-bindings.js";

export function allocateBinding(declaration: BindingDeclaration, layout: ObjectLayout | undefined, capabilities: FunctionCapabilities): BindingStorage {
  const { cursor, runtime, values, roots } = capabilities;
  const block = cursor.currentBlock();
  const name = `binding.${declaration.id.ordinal}`;
  if (declaration.storage.location.kind === "environment") {
    const cell = runtime.callPointer("environmentNew", [block.int(llvm.i64, 1n)], `${name}.cell`);
    const owner = values.forBlock(block).boxReference("object", cell);
    roots.push(owner);
    runtime.callVoid("environmentSet", [cell, block.int(llvm.i64, 0n), values.forBlock(block).immediate("undefined")]);
    return { kind: "environment", cell, owner };
  }
  const {representation} = declaration.storage;
  switch (representation.kind) {
    case "number": { return { kind: "numberSlot", slot: block.alloca(llvm.double, name) };
    }
    case "boolean": { return { kind: "booleanSlot", slot: block.alloca(llvm.i1, name) };
    }
    case "string": {
      const slot = block.alloca(llvm.ptr, `${name}.bytes`);
      const lengthSlot = block.alloca(llvm.i64, `${name}.length`);
      block.store(block.nullPtr(), slot);
      block.store(block.int(llvm.i64, 0n), lengthSlot);
      return { kind: "stringSlot", slot, lengthSlot, ownerSlot: allocateRootSlot(`${name}.owner`, capabilities) };
    }
    case "fixedArray": { return { kind: "fixedArray", length: representation.length,
      slot: block.alloca(llvm.array(llvm.double, representation.length), name) };
    }
    case "fixedObject": {
      if (layout === undefined) throw new Error("Fixed object has no resolved initializer layout");
      return allocateObject(layout, name, capabilities);
    }
    default: { return { kind: "boxedSlot", slot: allocateRootSlot(name, capabilities) };
    }
  }
}

function allocateObject(layout: ObjectLayout, name: string, capabilities: FunctionCapabilities): FixedObjectStorage {
  const block = capabilities.cursor.currentBlock();
  return { kind: "fixedObject", shadowed: layout.shadowed, shadowSlot: allocateRootSlot(`${name}.shadow`, capabilities),
    fields: layout.fields.map((field, index) => ({ key: field.key, storage: field.object === undefined
      ? { kind: "numberSlot", slot: block.alloca(llvm.double, `${name}.field.${index}`) }
      : allocateObject(field.object, `${name}.field.${index}`, capabilities) })) };
}

function allocateRootSlot(name: string, capabilities: FunctionCapabilities): LlvmValue<typeof llvm.ptr> {
  const block = capabilities.cursor.currentBlock();
  const slot = block.alloca(llvm.i64, name);
  block.store(capabilities.values.forBlock(block).immediate("undefined"), slot);
  return slot;
}

export function materializeGlobal(global: GlobalBlueprint, capabilities: FunctionCapabilities): BindingStorage {
  const block = capabilities.cursor.currentBlock();
  switch (global.kind) {
    case "number": { return { kind: "numberSlot", slot: block.globalPointer(global.global) };
    }
    case "boolean": { return { kind: "booleanSlot", slot: block.globalPointer(global.global) };
    }
    case "boxed": { return { kind: "boxedGlobal", global: global.global };
    }
    case "string": { return { kind: "stringSlot", slot: block.globalPointer(global.bytes),
      lengthSlot: block.globalPointer(global.length), ownerSlot: block.globalPointer(global.owner) };
    }
    case "fixedArray": { return { kind: "fixedArray", slot: block.globalPointer(global.global), length: global.length };
    }
    case "fixedObject": { return { kind: "fixedObject", shadowed: global.shadowed, shadowSlot: block.globalPointer(global.shadow),
      fields: global.fields.map((field) => {
        const storage = materializeGlobal(field.storage, capabilities);
        if (storage.kind !== "numberSlot" && storage.kind !== "fixedObject") throw new Error("Fixed object has a nonnumeric field allocation");
        return { key: field.key, storage };
      }) };
    }
    default: {
      const exhaustive: never = global;
      throw new Error(`Unknown global allocation ${String(exhaustive)}`);
    }
  }
}
