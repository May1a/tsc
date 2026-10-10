import type { ResolvedRuntimeArrayElement } from "../binding-resolution/index.js";
import { llvm } from "../llvm-ir/index.js";
import { type OperationHandlers, type OperationNode, arrayPointer, freshArray, initializeAggregate, integer } from "./aggregate-support.js";
import { boxString } from "./expression-context.js";
import { numberIndex } from "./numbers.js";
import type { OperationContext } from "./operation-context.js";
import { keep, numericValue, stringValue } from "./value-support.js";

function arrayLiteral(operation: OperationNode<"arrayLiteral">, context: OperationContext): void {
  context.initializeFixedArray(operation.name, operation.elements.map((element) => context.expressions.number(element)));
}

function appendElement(element: ResolvedRuntimeArrayElement, array: ReturnType<typeof freshArray>, context: OperationContext): void {
  switch (element.kind) {
    case "hole": {
      context.runtime.call("arrayPush", [array.pointer, context.values.forBlock(context.cursor.currentBlock()).arrayHole()],
        context.cursor.uniqueName("array.hole"));
      return;
    }
    case "value": {
      const value = keep(context.expressions.value(element.value), context);
      context.runtime.call("arrayPush", [array.pointer, value], context.cursor.uniqueName("array.push"));
      return;
    }
    case "spread": {
      const source = keep(context.bindings.value(element.arrayName), context);
      const message = stringValue("Spread source is not iterable", context);
      context.runtime.callWithCompletion("iterableAppend", [array.pointer, source, message],
        context.cursor.uniqueName("array.spread"), context.exceptionTarget());
      return;
    }
    case "iterableSpread": {
      const source = keep(context.expressions.value(element.source), context);
      const message = stringValue(element.notIterableMessage, context);
      context.runtime.callWithCompletion("iterableAppend", [array.pointer, source, message],
        context.cursor.uniqueName("array.spread"), context.exceptionTarget());
      return;
    }
    default: {
      const exhaustive: never = element;
      throw new Error(`Unknown array literal element ${String(exhaustive)}`);
    }
  }
}

function runtimeLiteral(operation: OperationNode<"runtimeArrayLiteral">, context: OperationContext): void {
  const array = freshArray(0, context);
  for (const element of operation.elements) {
    appendElement(element, array, context);
  }
  context.writes.storeValue(operation.name, array.value);
}

function slice(operation: OperationNode<"runtimeArraySlice">, context: OperationContext): void {
  const array = arrayPointer(operation.arrayName, context);
  const start = numberIndex(operation.start, context);
  const end = operation.end === undefined
    ? context.runtime.call("arrayLength", [array], context.cursor.uniqueName("array.length"))
    : numberIndex(operation.end, context);
  const result = context.runtime.callPointer("arraySlice", [array, start, end], context.cursor.uniqueName("array.slice"));
  initializeAggregate(operation.name, result, "array", context);
}

function splice(operation: OperationNode<"runtimeArraySplice" | "runtimeArraySpliceStatement">, context: OperationContext): void {
  const array = arrayPointer(operation.arrayName, context);
  const start = numberIndex(operation.start, context);
  const deleted = operation.deleteCount === undefined
    ? context.runtime.call("arrayLength", [array], context.cursor.uniqueName("array.length"))
    : numberIndex(operation.deleteCount, context);
  const items = freshArray(operation.items.length, context);
  for (const [index, expression] of operation.items.entries()) {
    const value = keep(context.expressions.value(expression), context);
    context.runtime.callVoid("arraySet", [items.pointer, integer(BigInt(index), context), value]);
  }
  const result = context.runtime.callPointer("arraySplice", [array, start, deleted, integer(BigInt(operation.items.length), context), items.pointer],
    context.cursor.uniqueName("array.splice"));
  if (operation.kind === "runtimeArraySplice") {
    initializeAggregate(operation.name, result, "array", context);
  }
}

function flat(operation: OperationNode<"runtimeArrayFlat">, context: OperationContext): void {
  const array = arrayPointer(operation.arrayName, context);
  const depth = numberIndex(operation.depth, context);
  const result = context.runtime.callPointer("arrayFlat", [array, depth], context.cursor.uniqueName("array.flat"));
  initializeAggregate(operation.name, result, "array", context);
}

function split(operation: OperationNode<"runtimeStringSplit">, context: OperationContext): void {
  const receiver = context.expressions.string(operation.receiver);
  boxString(receiver, context);
  const separator = context.expressions.string(operation.separator);
  boxString(separator, context);
  const limit = operation.limit === undefined ? integer(-1n, context) : numberIndex(operation.limit, context);
  const result = context.runtime.callPointer("stringSplit", [receiver.length, receiver.bytes, separator.length, separator.bytes, limit],
    context.cursor.uniqueName("string.split"));
  initializeAggregate(operation.name, result, "array", context);
}

function regexSplit(operation: OperationNode<"runtimeRegexSplit">, context: OperationContext): void {
  const receiver = boxString(context.expressions.string(operation.receiver), context);
  const regex = keep(context.expressions.value(operation.regex), context);
  const limit = operation.limit === undefined ? integer(-1n, context) : numberIndex(operation.limit, context);
  const result = context.runtime.callPointer("regexSplit", [regex, receiver, limit], context.cursor.uniqueName("regex.split"));
  initializeAggregate(operation.name, result, "array", context);
}

function concat(operation: OperationNode<"runtimeArrayConcat">, context: OperationContext): void {
  const left = arrayPointer(operation.leftName, context);
  const argumentsArray = freshArray(0, context);
  for (const element of operation.values) {
    if (element.kind === "value") {
      const value = keep(context.expressions.value(element.value), context);
      context.runtime.call("arrayPush", [argumentsArray.pointer, value], context.cursor.uniqueName("concat.argument"));
    } else {
      for (let index = 0; index < element.length; index += 1) {
        const slot = context.bindings.arrayElement(element.arrayName, integer(BigInt(index), context));
        const number = context.cursor.currentBlock().load(llvm.double, slot, context.cursor.uniqueName("concat.number"));
        context.runtime.call("arrayPush", [argumentsArray.pointer, numericValue(number, context)], context.cursor.uniqueName("concat.argument"));
      }
    }
  }
  const result = context.runtime.callPointer("arrayConcat", [left, argumentsArray.pointer], context.cursor.uniqueName("array.concat"));
  initializeAggregate(operation.name, result, "array", context);
}

function fill(operation: OperationNode<"runtimeArrayFill">, context: OperationContext): void {
  const array = arrayPointer(operation.arrayName, context);
  const value = keep(context.expressions.value(operation.value), context);
  const start = operation.start === undefined ? integer(0n, context) : numberIndex(operation.start, context);
  const end = operation.end === undefined
    ? context.runtime.call("arrayLength", [array], context.cursor.uniqueName("array.length"))
    : numberIndex(operation.end, context);
  context.runtime.callVoid("arrayFill", [array, value, start, end]);
}

function copyWithin(operation: OperationNode<"runtimeArrayCopyWithin">, context: OperationContext): void {
  const array = arrayPointer(operation.arrayName, context);
  const target = numberIndex(operation.target, context);
  const start = numberIndex(operation.start, context);
  const end = operation.end === undefined
    ? context.runtime.call("arrayLength", [array], context.cursor.uniqueName("array.length"))
    : numberIndex(operation.end, context);
  context.runtime.callVoid("arrayCopyWithin", [array, target, start, end]);
}

function mutatorResult(operation: OperationNode<"runtimeArrayMutatorResult">, context: OperationContext): void {
  const { mutation, arrayName } = operation;
  switch (mutation.kind) {
    case "reverse": { reverse({ kind: "runtimeArrayReverse", arrayName }, context); break; }
    case "fill": { fill({ kind: "runtimeArrayFill", arrayName, value: mutation.value, start: mutation.start, end: mutation.end }, context); break; }
    case "copyWithin": {
      copyWithin({ kind: "runtimeArrayCopyWithin", arrayName, target: mutation.target, start: mutation.start, end: mutation.end }, context);
      break;
    }
    default: {
      const exhaustive: never = mutation;
      throw new Error(`Unknown array mutation ${String(exhaustive)}`);
    }
  }
  context.writes.storeValue(operation.name, context.bindings.value(arrayName));
}

function reverse(operation: OperationNode<"runtimeArrayReverse">, context: OperationContext): void {
  context.runtime.callVoid("arrayReverse", [arrayPointer(operation.arrayName, context)]);
}

function append(operation: OperationNode<"runtimeArrayPush" | "runtimeArrayUnshift">, context: OperationContext): void {
  const array = arrayPointer(operation.arrayName, context);
  const values = operation.values.map((expression) => keep(context.expressions.value(expression), context));
  const ordered = operation.kind === "runtimeArrayUnshift" ? values.toReversed() : values;
  for (const value of ordered) {
    context.runtime.call(operation.kind === "runtimeArrayPush" ? "arrayPush" : "arrayUnshift", [array, value],
      context.cursor.uniqueName("array.append"));
  }
}

function remove(operation: OperationNode<"runtimeArrayPop" | "runtimeArrayShift">, context: OperationContext): void {
  context.runtime.callBoxed(operation.kind === "runtimeArrayPop" ? "arrayPop" : "arrayShift", [arrayPointer(operation.arrayName, context)],
    context.cursor.uniqueName("array.remove"));
}

function fixedStore(operation: OperationNode<"arrayStore">, context: OperationContext): void {
  const index = numberIndex(operation.index, context);
  const value = context.expressions.number(operation.value);
  const slot = context.bindings.arrayElement(operation.arrayName, index);
  context.cursor.currentBlock().store(value, slot);
}

function arrayStore(operation: OperationNode<"runtimeArrayStore">, context: OperationContext): void {
  const array = arrayPointer(operation.arrayName, context);
  const index = numberIndex(operation.index, context);
  const value = keep(context.expressions.value(operation.value), context);
  context.runtime.callVoid("arraySet", [array, index, value]);
}

function namedStore(operation: OperationNode<"runtimeArrayNamedStore">, context: OperationContext): void {
  const array = arrayPointer(operation.arrayName, context);
  const key = context.expressions.string(operation.key);
  boxString(key, context);
  const value = keep(context.expressions.value(operation.value), context);
  context.runtime.callVoid("arraySetNamed", [array, key.length, key.bytes, value]);
}

function arrayDelete(operation: OperationNode<"runtimeArrayDelete">, context: OperationContext): void {
  const array = arrayPointer(operation.arrayName, context);
  context.runtime.callVoid("arrayDelete", [array, numberIndex(operation.index, context)]);
}

function namedDelete(operation: OperationNode<"runtimeArrayNamedDelete">, context: OperationContext): void {
  const array = arrayPointer(operation.arrayName, context);
  const key = context.expressions.string(operation.key);
  context.runtime.callVoid("arrayDeleteNamed", [array, key.length, key.bytes]);
}

function setLength(operation: OperationNode<"runtimeArraySetLength">, context: OperationContext): void {
  const array = arrayPointer(operation.arrayName, context);
  context.runtime.callVoid("arraySetLength", [array, numberIndex(operation.length, context)]);
}

function valueStore(operation: OperationNode<"valueArrayStore">, context: OperationContext): void {
  const array = keep(context.bindings.value(operation.targetName), context);
  const index = numberIndex(operation.index, context);
  const value = keep(context.expressions.value(operation.value), context);
  context.runtime.callVoid("valueArraySet", [array, index, value]);
}

function valueDelete(operation: OperationNode<"valueArrayDelete">, context: OperationContext): void {
  const array = keep(context.bindings.value(operation.targetName), context);
  context.runtime.callVoid("valueArrayDelete", [array, numberIndex(operation.index, context)]);
}

function valueLength(operation: OperationNode<"valueArraySetLength">, context: OperationContext): void {
  const array = keep(context.bindings.value(operation.targetName), context);
  context.runtime.callVoid("valueArraySetLength", [array, numberIndex(operation.length, context)]);
}

export const arrayOperationHandlers = {
  arrayLiteral, runtimeArrayLiteral: runtimeLiteral, runtimeArraySlice: slice, runtimeArraySplice: splice,
  runtimeArraySpliceStatement: splice, runtimeArrayFlat: flat, runtimeStringSplit: split, runtimeRegexSplit: regexSplit,
  runtimeArrayConcat: concat, runtimeArrayMutatorResult: mutatorResult, arrayStore: fixedStore, runtimeArrayStore: arrayStore,
  runtimeArrayNamedStore: namedStore, runtimeArrayDelete: arrayDelete, runtimeArrayNamedDelete: namedDelete,
  runtimeArraySetLength: setLength, runtimeArrayPush: append, runtimeArrayUnshift: append, runtimeArrayFill: fill,
  runtimeArrayReverse: reverse, runtimeArrayCopyWithin: copyWithin, runtimeArrayPop: remove, runtimeArrayShift: remove,
  valueArrayStore: valueStore, valueArrayDelete: valueDelete, valueArraySetLength: valueLength
} satisfies Partial<OperationHandlers>;
