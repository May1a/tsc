import { type Lowered, loweredPayload, notApplicable, produced } from "./lowered.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import type { JsIrOperation } from "./types.js";
import { lowerSymbolIteratorKeyExpression } from "./class-info.js";
import type { LoweringContext } from "./context.js";
import { iteratorErrorSubject } from "./iterator-subject.js";

export function lowerRuntimeIteratorBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const defaultIterator = lowerRuntimeCollectionDefaultIteratorBinding(name, initializer, bindings);
  if (defaultIterator.kind !== "notApplicable") {
    return defaultIterator;
  }
  if (!ts.isCallExpression(initializer) || initializer.arguments.length > 0 || !ts.isPropertyAccessExpression(initializer.expression) || !ts.isIdentifier(initializer.expression.expression)) {
    return notApplicable;
  }
  const receiver = initializer.expression.expression.text;
  const binding = bindings.get(receiver);
  const method = initializer.expression.name.text;
  if (method !== "keys" && method !== "values" && method !== "entries") {
    return notApplicable;
  }
  if (binding?.kind === "runtimeMap") {
    return produced({ kind: "runtimeIteratorNew", name, collectionName: binding.name, sourceKind: "map", iterationKind: method });
  }
  if (binding?.kind === "runtimeSet") {
    return produced({ kind: "runtimeIteratorNew", name, collectionName: binding.name, sourceKind: "set", iterationKind: method });
  }
  return notApplicable;
}

function lowerRuntimeCollectionDefaultIteratorBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (
    ts.isCallExpression(initializer) &&
    initializer.arguments.length === 0 &&
    ts.isElementAccessExpression(initializer.expression) &&
    ts.isIdentifier(initializer.expression.expression) &&
    lowerSymbolIteratorKeyExpression(initializer.expression.argumentExpression, bindings) !== undefined
  ) {
    const receiver = initializer.expression.expression.text;
    const binding = bindings.get(receiver);
    if (binding?.kind === "runtimeMap") {
      return produced({ kind: "runtimeIteratorNew", name, collectionName: binding.name, sourceKind: "map", iterationKind: "entries", observeOverride: true });
    }
    if (binding?.kind === "runtimeSet") {
      return produced({ kind: "runtimeIteratorNew", name, collectionName: binding.name, sourceKind: "set", iterationKind: "values", observeOverride: true });
    }
  }
  return notApplicable;
}

export function lowerRuntimeCollectionBinding(
  context: LoweringContext,
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const constructed = lowerRuntimeCollectionConstructorBinding(context, name, initializer, bindings);
  if (constructed.kind !== "notApplicable") {
    return constructed;
  }
  if (!ts.isCallExpression(initializer) || !ts.isPropertyAccessExpression(initializer.expression) || !ts.isIdentifier(initializer.expression.expression)) {
    return notApplicable;
  }
  const receiver = initializer.expression.expression.text;
  const binding = bindings.get(receiver);
  const method = initializer.expression.name.text;
  if (binding?.kind === "runtimeMap" && method === "set" && initializer.arguments.length === 2) {
    const keyResult = context.lowerValueExpression(context, initializer.arguments[0], bindings);
    if (keyResult.kind === "unsupported") {
      return keyResult;
    }
    const key = loweredPayload(keyResult);
    const valueResult = context.lowerValueExpression(context, initializer.arguments[1], bindings);
    if (valueResult.kind === "unsupported") {
      return valueResult;
    }
    const value = loweredPayload(valueResult);
    if (key !== undefined && value !== undefined) {
      return produced({ kind: "runtimeMapSetResult", name, mapName: binding.name, key, value });
    }
  }
  if (binding?.kind === "runtimeSet" && method === "add" && initializer.arguments.length === 1) {
    const value = context.lowerValueExpression(context, initializer.arguments[0], bindings);
    if (value.kind === "unsupported") {
      return value;
    }
    if (value.kind === "lowered") {
      return produced({ kind: "runtimeSetAddResult", name, setName: binding.name, value: value.operation });
    }
  }
  return notApplicable;
}

function lowerRuntimeCollectionConstructorBinding(
  context: LoweringContext,
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!ts.isNewExpression(initializer) || !ts.isIdentifier(initializer.expression)) {
    return notApplicable;
  }
  const argumentCount = initializer.arguments?.length ?? 0;
  if (argumentCount === 0 && initializer.expression.text === "Map" && !bindings.has("Map")) {
    return produced({ kind: "runtimeMapNew", name });
  }
  if (argumentCount === 0 && initializer.expression.text === "Set" && !bindings.has("Set")) {
    return produced({ kind: "runtimeSetNew", name });
  }
  if (argumentCount !== 1 || initializer.arguments === undefined) {
    return notApplicable;
  }
  const [sourceExpression] = initializer.arguments;
  const isMap = initializer.expression.text === "Map" && !bindings.has("Map");
  const isSet = initializer.expression.text === "Set" && !bindings.has("Set");
  if (!isMap && !isSet) {
    return notApplicable;
  }
  const fromCollection = lowerRuntimeCollectionCopyConstructor(name, sourceExpression, isMap, bindings);
  if (fromCollection !== undefined) {
    return produced(fromCollection);
  }
  const iterable = context.lowerValueExpression(context, sourceExpression, bindings);
  if (iterable.kind !== "lowered") {
    return iterable;
  }
  const notIterableMessage = `${iteratorErrorSubject(sourceExpression)} is not iterable`;
  if (isMap) {
    return produced({ kind: "runtimeMapFromIterable", name, iterable: iterable.operation, notIterableMessage });
  }
  return produced({ kind: "runtimeSetFromIterable", name, iterable: iterable.operation, notIterableMessage });
}

// Map/Set values to be boxed as JSValues.
function lowerRuntimeCollectionCopyConstructor(
  name: string,
  sourceExpression: ts.Expression,
  isMap: boolean,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isIdentifier(sourceExpression)) {
    return undefined;
  }
  const source = bindings.get(sourceExpression.text);
  if (source?.kind === "runtimeMap") {
    if (isMap) {
      return { kind: "runtimeMapFromCollection", name, sourceName: source.name, sourceKind: "map" };
    }
    return { kind: "runtimeSetFromCollection", name, sourceName: source.name, sourceKind: "map" };
  }
  if (source?.kind === "runtimeSet") {
    if (isMap) {
      return { kind: "runtimeMapFromCollection", name, sourceName: source.name, sourceKind: "set" };
    }
    return { kind: "runtimeSetFromCollection", name, sourceName: source.name, sourceKind: "set" };
  }
  return undefined;
}
