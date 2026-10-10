import type { BindingRef } from "../binding-resolution/index.js";
import { type OperationHandlers, type OperationNode, integer, ownAggregate } from "./aggregate-support.js";
import type { OperationContext } from "./operation-context.js";
import { keep, stringValue } from "./value-support.js";

function collectionPointer(reference: BindingRef, context: OperationContext): ReturnType<OperationContext["bindings"]["pointer"]> {
  keep(context.bindings.value(reference), context);
  return context.bindings.pointer(reference);
}

function create(operation: OperationNode<"runtimeMapNew" | "runtimeSetNew">, context: OperationContext): void {
  const pointer = context.runtime.callPointer("collectionNew", [], context.cursor.uniqueName("collection.new"));
  context.writes.storeValue(operation.name, ownAggregate(pointer, "object", context).value);
}

function fromIterable(operation: OperationNode<"runtimeMapFromIterable" | "runtimeSetFromIterable">, context: OperationContext): void {
  const iterable = keep(context.expressions.value(operation.iterable), context);
  const message = stringValue(operation.notIterableMessage, context);
  const result = context.runtime.callWithCompletion(operation.kind === "runtimeMapFromIterable" ? "mapFromIterable" : "setFromIterable",
    [iterable, message], context.cursor.uniqueName("collection.from.iterable"), context.exceptionTarget());
  context.writes.storeValue(operation.name, result);
}

function fromArray(operation: OperationNode<"runtimeMapFromArray" | "runtimeSetFromArray">, context: OperationContext): void {
  const iterable = keep(context.bindings.value(operation.sourceName), context);
  const message = stringValue("Collection constructor source is not iterable", context);
  const result = context.runtime.callWithCompletion(operation.kind === "runtimeMapFromArray" ? "mapFromIterable" : "setFromIterable",
    [iterable, message], context.cursor.uniqueName("collection.from.array"), context.exceptionTarget());
  context.writes.storeValue(operation.name, result);
}

function fromCollection(operation: OperationNode<"runtimeMapFromCollection" | "runtimeSetFromCollection">, context: OperationContext): void {
  const source = collectionPointer(operation.sourceName, context);
  const sourceKind = integer(operation.sourceKind === "map" ? 2n : 3n, context);
  const iterationKind = integer(operation.sourceKind === "map" ? 2n : 1n, context);
  const acquired = keep(context.runtime.callWithCompletion("getCollectionIterator", [source, sourceKind, iterationKind],
    context.cursor.uniqueName("collection.iterator"), context.exceptionTarget()), context);
  const result = context.runtime.callWithCompletion(operation.kind === "runtimeMapFromCollection" ? "mapFromIterator" : "setFromIterator",
    [acquired], context.cursor.uniqueName("collection.copy"), context.exceptionTarget());
  context.writes.storeValue(operation.name, result);
}

function mapSet(operation: OperationNode<"runtimeMapSet" | "runtimeMapSetResult">, context: OperationContext): void {
  const collection = collectionPointer(operation.mapName, context);
  const key = keep(context.expressions.value(operation.key), context);
  const value = keep(context.expressions.value(operation.value), context);
  context.runtime.callVoid("collectionSet", [collection, key, value]);
  if (operation.kind === "runtimeMapSetResult") {
    context.writes.storeValue(operation.name, context.bindings.value(operation.mapName));
  }
}

function setAdd(operation: OperationNode<"runtimeSetAdd" | "runtimeSetAddResult">, context: OperationContext): void {
  const collection = collectionPointer(operation.setName, context);
  const value = keep(context.expressions.value(operation.value), context);
  const present = context.values.forBlock(context.cursor.currentBlock()).immediate("true");
  context.runtime.callVoid("collectionSet", [collection, value, present]);
  if (operation.kind === "runtimeSetAddResult") {
    context.writes.storeValue(operation.name, context.bindings.value(operation.setName));
  }
}

function setIterator(operation: OperationNode<"runtimeCollectionSetIterator">, context: OperationContext): void {
  const collection = collectionPointer(operation.collectionName, context);
  const value = keep(context.expressions.value(operation.value), context);
  const iteratorMethodOffset = 32n;
  const block = context.cursor.currentBlock();
  const slot = block.gepBytes(collection, integer(iteratorMethodOffset, context), context.cursor.uniqueName("collection.iterator.slot"));
  block.store(value, slot);
}

function iterator(operation: OperationNode<"runtimeIteratorNew">, context: OperationContext): void {
  const collection = collectionPointer(operation.collectionName, context);
  const sourceKind = integer(operation.sourceKind === "map" ? 2n : 3n, context);
  const modes = { keys: 0n, values: 1n, entries: 2n } as const;
  const mode = integer(modes[operation.iterationKind], context);
  const result = operation.observeOverride === true
    ? context.runtime.callWithCompletion("getCollectionIterator", [collection, sourceKind, mode], context.cursor.uniqueName("collection.iterator"),
      context.exceptionTarget())
    : context.runtime.callBoxed("createCollectionIterator", [collection, sourceKind, mode], context.cursor.uniqueName("collection.iterator"));
  context.writes.storeValue(operation.name, result);
}

export const collectionOperationHandlers = {
  runtimeMapNew: create, runtimeSetNew: create, runtimeMapFromIterable: fromIterable, runtimeSetFromIterable: fromIterable,
  runtimeMapFromArray: fromArray, runtimeSetFromArray: fromArray, runtimeMapFromCollection: fromCollection, runtimeSetFromCollection: fromCollection,
  runtimeMapSet: mapSet, runtimeMapSetResult: mapSet, runtimeSetAdd: setAdd, runtimeSetAddResult: setAdd,
  runtimeCollectionSetIterator: setIterator, runtimeIteratorNew: iterator
} satisfies Partial<OperationHandlers>;
