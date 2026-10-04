import type { JsIrObjectValue } from "../ir/expressions.js";
import type { EmitContext } from "./context.js";

/**
 * Walking a static object layout to an SSA pointer.
 *
 * A known-shape object has a layout with its fields in a fixed order, so `a.b.c` is not three
 * dynamic lookups — it is a single `getelementptr` with the indexes those names occupy in the
 * layout. `objectPathToIndexes` turns the path into that index sequence, refusing a name the layout
 * does not have, and `emitObjectIndexedPointer` emits the GEP.
 *
 * `emitObjectFieldPointer` is the composition and the one that can fail: both halves return
 * `undefined` for an object with no layout or a path that leaves the layout, and the caller is
 * expected to treat that as "this is an opaque object" rather than as an error. A path that
 * continues past a non-object field resolves to the last object reached, which is the best a static
 * layout can say about it.
 */

export function emitObjectFieldPointer(
  objectName: string,
  path: readonly string[],
  context: EmitContext
): { readonly lines: string[]; readonly value: string } | undefined {
  const layout = context.objectLayouts.get(objectName);
  if (layout === undefined) {
    return undefined;
  }
  const indexes = objectPathToIndexes(layout.value, path);
  if (indexes === undefined) {
    return undefined;
  }
  return emitObjectIndexedPointer(layout.typeName, layout.pointerName, indexes, context);
}
export function emitObjectIndexedPointer(
  rootType: string,
  rootPointer: string,
  indexes: readonly number[],
  context: EmitContext
): { readonly lines: string[]; readonly value: string } {
  const index = context.objectIndex;
  context.objectIndex += 1;
  const name = `%obj.gep.${index}`;
  const gepIndexes = indexes.map((item) => `i32 ${item}`).join(", ");
  return { lines: [`  ${name} = getelementptr ${rootType}, ptr ${rootPointer}, i32 0, ${gepIndexes}`], value: name };
}
function objectPathToIndexes(value: JsIrObjectValue, path: readonly string[]): readonly number[] | undefined {
  const indexes: number[] = [];
  let current = value;
  for (const segment of path) {
    const index = current.fields.findIndex((field) => field.name === segment);
    if (index === -1) {
      return undefined;
    }
    indexes.push(index);
    const field = current.fields[index];
    if (field.value.kind === "object") {
      current = field.value.value;
    }
  }
  return indexes;
}
