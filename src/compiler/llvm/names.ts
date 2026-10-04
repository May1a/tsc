import type { JsIrBindingValue } from "../ir/bindings.js";

/**
 * How the emitter names an SSA slot.
 *
 * Every `%name.addr`, `%name.len.addr` and `%gc.loop.N` in the output comes from one of these, so a
 * module that needs a slot imports the rule instead of writing the suffix. Two of them are not a
 * suffix and exist because of a bug: `loopItemSlotName`, because a function may hold two loops over
 * one identifier and would otherwise emit the same local twice, and `bindingSlotName`, because a
 * binding's slot name and its identifier stopped being the same string at that point.
 *
 * Nothing here reads or writes emission state, which is what puts it below the recursion: every
 * other module in `llvm/` depends on this one and none of them depends on it back.
 */

export function variablePointerName(name: string): string {
  return `%${name}.addr`;
}
export function stringLengthPointerName(name: string): string {
  return `%${name}.len.addr`;
}
/**
 * The slot a loop keeps its current item in.
 *
 * A loop item's binding key is the source identifier — the body refers to it by that name — but the
 * slot it lives in cannot be, because a function may hold two loops over `value` and both would
 * allocate `%value.addr`. clang then rejects the module with `multiple definition of local value named
 * 'value.addr'`, so the program does not build at all. The binding carries the slot name in its `name`
 * field, which is what the resolvers below read; the key stays the identifier so the body still
 * resolves.
 */
export function loopItemSlotName(itemName: string, loopIndex: number): string {
  return `${itemName}.loop.${loopIndex}`;
}
/**
 * The slot a binding lives in.
 *
 * Every kind whose slot is allocated from its `name` resolves through here rather than through the
 * identifier the expression names. The two are the same for a plain declaration, which is why this
 * was not needed until a loop could bind one identifier to two slots.
 */
export function bindingSlotName(name: string, binding: JsIrBindingValue | undefined): string {
  // Only these three name a slot directly. `number` carries its slot inside `value`, `value` carries
  // no slot at all, and the rest either name one (`array`, `runtimeObject`, ...) or have no slot to
  // name. Reading `binding.name` off the union would need a case per kind to say the same thing.
  if (binding?.kind === "stringVariable" || binding?.kind === "runtimeArray" || binding?.kind === "runtimeObject" || binding?.kind === "runtimeMap" || binding?.kind === "runtimeSet" || binding?.kind === "runtimeIterator" || binding?.kind === "valueVariable") {
    return binding.name;
  }
  return name;
}
export function runtimeIteratorKindCode(kind: "keys" | "values" | "entries"): number {
  if (kind === "keys") {
    return 0;
  }
  if (kind === "values") {
    return 1;
  }
  return 2;
}
// GC loop frame: name of the root-stack baseline captured immediately before a loop.
export function loopFrameName(loopIndex: number): string {
  return `%gc.loop.${loopIndex}`;
}
