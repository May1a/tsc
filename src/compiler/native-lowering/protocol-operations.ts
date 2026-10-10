import type { BindingRef, ResolvedOperation } from "../binding-resolution/index.js";
import type { VariantHandlers, VariantOfKind } from "../dispatch.js";
import { type LlvmValue, llvm } from "../llvm-ir/index.js";
import { branchValue } from "./expression-branches.js";
import { boxString } from "./expression-context.js";
import type { OperationContext } from "./operation-context.js";
import type { BoxedValue } from "./value-boundary.js";
import { keep, literalString, stringValue, undefinedValue } from "./value-support.js";

type ProtocolKind = "forOfArray" | "forOfString" | "forOfMap" | "forOfSet" | "forOfProtocol" | "forInObject" | "forInArray" | "arrayDestructureProtocol";
type ProtocolNode<K extends ProtocolKind> = VariantOfKind<ResolvedOperation, K>;
type ProtocolVariants = { readonly [K in ProtocolKind]: ProtocolNode<K> };
type Pending = { readonly kind: "return" | "throw"; readonly value: BoxedValue } | { readonly kind: "jump" };

function iteratorProperty(iterator: BoxedValue, key: "done" | "value", context: OperationContext): BoxedValue {
  const name = literalString(key, context);
  return context.runtime.callBoxed("valuePropertyGet", [iterator, name.length, name.bytes], context.cursor.uniqueName(`iterator.${key}`));
}

function closeIterator(iterator: BoxedValue, context: OperationContext, pending?: Pending): void {
  if (pending?.kind === "throw") { context.runtime.callVoid("iteratorCloseForThrow", [iterator, pending.value]); return; }
  context.runtime.callWithCompletion("iteratorClose", [iterator], context.cursor.uniqueName("iterator.close"), context.exceptionTarget());
}

function collectionIterator(reference: BindingRef, map: boolean, context: OperationContext): BoxedValue {
  const owner = keep(context.bindings.value(reference), context);
  const pointer = context.values.forBlock(context.cursor.currentBlock()).unboxReference(owner);
  const block = context.cursor.currentBlock();
  return keep(context.runtime.callWithCompletion("getCollectionIterator", [pointer, block.int(llvm.i64, map ? 2n : 3n), block.int(llvm.i64, map ? 2n : 1n)],
    context.cursor.uniqueName("collection.iterator"), context.exceptionTarget()), context);
}

function forIterator(iterator: BoxedValue, store: (value: BoxedValue) => void, body: readonly ResolvedOperation[], context: OperationContext): void {
  const { cursor, runtime, roots, flow } = context;
  roots.push(iterator);
  const header = cursor.reserveBlock("iterator.header");
  const bodyBlock = cursor.reserveBlock("iterator.body");
  const step = cursor.reserveBlock("iterator.step");
  const exhausted = cursor.reserveBlock("iterator.exhausted");
  const done = cursor.reserveBlock("iterator.end");
  const depth = flow.cleanupDepth;
  cursor.currentBlock().br(header);
  cursor.openBlock(header);
  const frame = roots.save();
  flow.withCleanup({ run: (pending) => {
    roots.restore(frame);
    if (pending?.kind === "return" || pending?.kind === "throw") roots.push(pending.value);
  } }, () => {
    runtime.callVoid("gcSafepoint", []);
    const result = keep(runtime.callWithCompletion("callIteratorNext", [iterator], cursor.uniqueName("iterator.next"), context.exceptionTarget()), context);
    const completed = runtime.call("valueTruthy", [iteratorProperty(result, "done", context)], cursor.uniqueName("iterator.completed"));
    cursor.currentBlock().condBr(completed, exhausted, bodyBlock);
    cursor.openBlock(bodyBlock);
    store(keep(iteratorProperty(result, "value", context), context));
    flow.withCleanup({ run: (pending) => closeIterator(iterator, context, pending) }, () =>
      flow.withLoop({ breakTarget: { block: done, depth }, continueTarget: { block: step, depth: depth + 2 } },
        () => context.operations.operations(body)));
    if (!cursor.currentBlock().terminated) cursor.currentBlock().br(step);
    cursor.openBlock(step);
    roots.restore(frame);
    cursor.currentBlock().br(header);
    cursor.openBlock(exhausted);
    roots.restore(frame);
    cursor.currentBlock().br(done);
  });
  cursor.openBlock(done);
}

function arrayIterator(value: BoxedValue, context: OperationContext): BoxedValue {
  return keep(context.runtime.callBoxed("createArrayIterator", [keep(value, context)], context.cursor.uniqueName("array.iterator")), context);
}

function forIn(operation: ProtocolNode<"forInArray" | "forInObject">, context: OperationContext): void {
  const array = operation.kind === "forInArray";
  const owner = keep(context.bindings.value(array ? operation.arrayName : operation.objectName), context);
  const pointer = context.values.forBlock(context.cursor.currentBlock()).unboxReference(owner);
  const keys = context.runtime.callPointer(array ? "arrayKeys" : "objectKeys", [pointer], context.cursor.uniqueName("enumeration.keys"));
  const boxed = keep(context.values.forBlock(context.cursor.currentBlock()).boxReference("array", keys), context);
  forIterator(arrayIterator(boxed, context), (value) => storeString(operation.itemName, value, context), operation.body, context);
}

function storeString(reference: BindingRef, value: BoxedValue, context: OperationContext): void {
  const string = context.runtime.callString("valueToString", [value], context.cursor.uniqueName("iterator.string"));
  context.writes.storeString(reference, string);
}

function pull(iterator: BoxedValue, done: LlvmValue<typeof llvm.ptr>, read: boolean, context: OperationContext): BoxedValue {
  const { cursor, runtime } = context;
  const alreadyDone = cursor.currentBlock().load(llvm.i1, done, cursor.uniqueName("destructure.done"));
  const value = branchValue(cursor, alreadyDone, llvm.i64, () => undefinedValue(context), () => {
    cursor.currentBlock().store(cursor.currentBlock().int(llvm.i1, 1n), done);
    const step = keep(runtime.callWithCompletion("callIteratorNext", [iterator], cursor.uniqueName("destructure.next"), context.exceptionTarget()), context);
    const finished = runtime.call("valueTruthy", [iteratorProperty(step, "done", context)], cursor.uniqueName("destructure.finished"));
    cursor.currentBlock().store(finished, done);
    if (!read) return undefinedValue(context);
    return branchValue(cursor, finished, llvm.i64, () => undefinedValue(context), () => iteratorProperty(step, "value", context), "destructure.value");
  }, "destructure.pull");
  return keep(context.values.forBlock(cursor.currentBlock()).fromBoundary(value), context);
}

function rest(iterator: BoxedValue, done: LlvmValue<typeof llvm.ptr>, context: OperationContext): BoxedValue {
  const { cursor, runtime, values } = context;
  const finished = cursor.currentBlock().load(llvm.i1, done, cursor.uniqueName("destructure.rest.done"));
  const result = branchValue(cursor, finished, llvm.i64, () => {
    const empty = runtime.callPointer("arrayNew", [cursor.currentBlock().int(llvm.i64, 0n)], cursor.uniqueName("destructure.empty"));
    return values.forBlock(cursor.currentBlock()).boxReference("array", empty);
  }, () => {
    cursor.currentBlock().store(cursor.currentBlock().int(llvm.i1, 1n), done);
    return runtime.callWithCompletion("arrayFromIterator", [iterator], cursor.uniqueName("destructure.rest"), context.exceptionTarget());
  }, "destructure.rest.value");
  cursor.currentBlock().store(cursor.currentBlock().int(llvm.i1, 1n), done);
  return keep(values.forBlock(cursor.currentBlock()).fromBoundary(result), context);
}

function destructure(operation: ProtocolNode<"arrayDestructureProtocol">, context: OperationContext): void {
  const { cursor, runtime, flow } = context;
  const { source } = operation;
  const iterator = source.kind === "collection" ? collectionIterator(source.name, source.sourceKind === "map", context)
    : keep(runtime.callWithCompletion("getIteratorValue", [keep(context.expressions.value(source.value), context), stringValue(operation.notIterableMessage, context)],
      cursor.uniqueName("destructure.iterator"), context.exceptionTarget()), context);
  const done = cursor.currentBlock().alloca(llvm.i1, cursor.uniqueName("destructure.done.slot"));
  cursor.currentBlock().store(cursor.currentBlock().int(llvm.i1, 0n), done);
  const cleanup = { run: (pending?: Pending) => {
    const finished = cursor.currentBlock().load(llvm.i1, done, cursor.uniqueName("destructure.close.done"));
    const skip = cursor.reserveBlock("destructure.closed");
    const close = cursor.reserveBlock("destructure.close");
    cursor.currentBlock().condBr(finished, skip, close);
    cursor.openBlock(close);
    closeIterator(iterator, context, pending);
    cursor.currentBlock().br(skip);
    cursor.openBlock(skip);
  } };
  flow.withCleanup(cleanup, () => {
    for (const element of operation.elements) {
      if (cursor.currentBlock().terminated) break;
      if (element.kind === "rest") { context.writes.storeValue(element.name, rest(iterator, done, context)); continue; }
      const value = pull(iterator, done, element.kind !== "elision", context);
      if (element.kind === "elision") continue;
      if (element.kind === "nested") {
        context.writes.storeValue(element.temporaryName, value);
        context.operations.operations(element.operations);
        continue;
      }
      context.writes.storeValue(element.name, value);
      if (element.defaultValue !== undefined) {
        const stored = context.expressions.value({ kind: "lazyDefault", value: { kind: "variable", name: element.name }, defaultValue: element.defaultValue });
        context.writes.storeValue(element.name, stored);
      }
    }
  });
  if (!cursor.currentBlock().terminated) cleanup.run();
}

export const protocolOperationHandlers: VariantHandlers<ProtocolVariants, OperationContext, void> = {
  forOfArray: (operation, context) => forIterator(arrayIterator(context.bindings.value(operation.arrayName), context),
    (value) => context.writes.storeValue(operation.itemName, value), operation.body, context),
  forOfString: (operation, context) => {
    const source = boxString(context.expressions.string(operation.source), context);
    const iterator = keep(context.runtime.callBoxed("createStringIterator", [source], context.cursor.uniqueName("string.iterator")), context);
    forIterator(iterator, (value) => storeString(operation.itemName, value, context), operation.body, context);
  },
  forOfMap: (operation, context) => forIterator(collectionIterator(operation.mapName, true, context),
    (value) => context.writes.storeValue(operation.itemName, value), operation.body, context),
  forOfSet: (operation, context) => forIterator(collectionIterator(operation.setName, false, context),
    (value) => context.writes.storeValue(operation.itemName, value), operation.body, context),
  forOfProtocol: (operation, context) => {
    const source = keep(context.expressions.value(operation.iterable), context);
    const message = stringValue(operation.notIterableMessage, context);
    const iterator = keep(context.runtime.callWithCompletion("getIteratorValue", [source, message], context.cursor.uniqueName("protocol.iterator"), context.exceptionTarget()), context);
    forIterator(iterator, (value) => context.writes.storeValue(operation.itemName, value), operation.body, context);
  },
  forInObject: forIn,
  forInArray: forIn,
  arrayDestructureProtocol: destructure
};
