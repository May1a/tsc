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
 * A local name that has not been used yet in the function being emitted.
 *
 * The preferred name is returned unchanged the first time, so output is unchanged for every program
 * whose slot names do not repeat. Only a repeat is suffixed, with the lowest free ordinal, which is what
 * keeps the collision fix from rewriting every emitted name in the corpus.
 * This helper reserves the supplied string itself; callers naming value slots use
 * `uniqueValueSlotName` to reserve the emitted pointer while retaining the binding slot name.
 */
export function uniqueLocalName(preferred: string, context: { readonly declaredLocals: Set<string> }): string {
  if (!context.declaredLocals.has(preferred)) {
    context.declaredLocals.add(preferred);
    return preferred;
  }
  let ordinal = 1;
  while (context.declaredLocals.has(`${preferred}.${ordinal}`)) {
    ordinal += 1;
  }
  const unique = `${preferred}.${ordinal}`;
  context.declaredLocals.add(unique);
  return unique;
}
/**
 * Reserve a value slot by its emitted LLVM pointer name, returning the unsuffixed binding name
 * unless that pointer is already reserved. Unlike `uniqueLocalName`, this returns a slot name
 * for `bindingSlotName` and reserves `variablePointerName(slotName)`, not the bare name.
 * Runtime object loads in `layout.ts` derive pointers without registering bare names, so checking
 * a bare name would miss a pointer reserved by another emitter.
 */
export function uniqueValueSlotName(name: string, context: { readonly declaredLocals: Set<string> }): string {
  let slotName = name;
  let ordinal = 0;
  while (context.declaredLocals.has(variablePointerName(slotName))) {
    ordinal += 1;
    slotName = `${name}.${ordinal}`;
  }
  context.declaredLocals.add(variablePointerName(slotName));
  return slotName;
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
