import type { JsIrOperation } from "../ir/types.js";
import type { JsIrRuntimeArrayElement } from "../ir/expressions.js";
import type { ArrayValue, EmitContext, JsValue, NumberValue, RuntimeArrayValue } from "./context.js";
import { emitRuntimeArrayCopyWithinOperation, emitRuntimeArrayFillOperation } from "./array-mutators.js";
import { jsValueUndefined } from "./values.js";
import { emitGeneratedJsCall } from "./completion.js";
import { emitRuntimeArrayPointer, emitRuntimeCollectionPointer } from "./layout.js";
import { runtimeIteratorKindCode, variablePointerName } from "./names.js";
import { emitIterableAppend } from "./value-calls.js";
import { errorClassIds } from "./error-ids.js";
import { emitArrayElementPointer, emitArrayIndex, llvmDoubleBitcastOperand } from "./numbers.js";
import { addStringConstant, utf8ByteLength } from "./strings.js";

/**
 * The aggregate constructors and the non-callback array/string operations: an array literal, an iterator
 * object, a `slice`/`splice`/`flat`, a `split`, a `concat`, and the boxed `undefined` an array hole
 * holds.
 *
 * These are the array operations that do not take a callback, and the reason they are one module rather
 * than two is that they all allocate a runtime array and then write into it. `slice` and `splice` differ
 * in whether they return a fresh array or reuse the receiver; `concat` differs in that it allocates.
 *
 * `runtimeArrayLiteralInitialLength` is the one non-obvious piece. An array literal's length is known
 * from its element count unless it has a hole or a spread, so the allocation is exact for the common
 * case and grows for the rest — and a hole stores the boxed `undefined` rather than a null pointer,
 * which is why `in` can distinguish it from a missing index.
 */

export function emitArrayLiteralOperation(
  operation: Extract<JsIrOperation, { readonly kind: "arrayLiteral" }>,
  context: EmitContext
): string[] {
  const index = context.arrayIndex;
  context.arrayIndex += 1;
  if (operation.elements.every((element) => element.kind === "literal")) {
    const globalName = `@arr.${index}`;
    const values = operation.elements.map((element) => `double ${llvmDoubleBitcastOperand(String(element.value))}`).join(", ");
    const arrayValue: ArrayValue = { name: globalName, length: operation.elements.length, storageKind: "global" };
    context.arrayGlobals.push(`${globalName} = global [${operation.elements.length} x double] [${values}]`);
    context.bindings.set(operation.name, { kind: "array", name: arrayValue.name, length: arrayValue.length });
    return [];
  }

  const pointerName = variablePointerName(operation.name);
  const arrayValue: ArrayValue = { name: pointerName, length: operation.elements.length, storageKind: "stack" };
  context.bindings.set(operation.name, { kind: "array", name: arrayValue.name, length: arrayValue.length });
  const lines = [`  ${pointerName} = alloca [${operation.elements.length} x double]`];
  for (let i = 0; i < operation.elements.length; i++) {
    const pointer = emitArrayElementPointer(operation.name, { kind: "literal", value: i }, context);
    const value = context.emitNumberExpression(operation.elements[i]);
    lines.push(...pointer.lines, ...value.lines, `  store double ${value.value}, ptr ${pointer.value}`);
  }
  return lines;
}
// eslint-disable-next-line max-statements -- Runtime array literal emission handles holes, values, and spread materialization together.
export function emitRuntimeArrayLiteralOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayLiteral" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  const arrayValue: RuntimeArrayValue = { pointerName };
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  const lines = [
    `  ${pointerName} = alloca ptr`,
    `  %${operation.name}.arr = call ptr @arrayNew(i64 ${runtimeArrayLiteralInitialLength(operation.elements)})`,
    `  store ptr %${operation.name}.arr, ptr ${arrayValue.pointerName}`
  ];
  let fixedIndex = 0;
  for (let i = 0; i < operation.elements.length; i++) {
    const element = operation.elements[i];
    // The loop bound guarantees this index; the guard keeps the element non-optional so the
    // `kind` narrowing below stays total. Without it a future bounds change would silently
    // dereference undefined here.
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- live once noUncheckedIndexedAccess is enabled
    if (element === undefined) {
      throw new Error(`Runtime array literal element ${i} is missing`);
    }
    if (element.kind === "hole") {
      if (operation.elements.some((candidate) => candidate.kind === "spread" || candidate.kind === "iterableSpread")) {
        const current = `%${operation.name}.hole.current.${i}`;
        lines.push(`  ${current} = load ptr, ptr ${arrayValue.pointerName}`, `  call i64 @arrayPush(ptr ${current}, i64 ${jsValueUndefined})`);
      } else {
        fixedIndex += 1;
      }
      continue;
    }
    if (element.kind === "iterableSpread") {
      const current = `%${operation.name}.iterable.current.${i}`;
      lines.push(
        `  ${current} = load ptr, ptr ${arrayValue.pointerName}`,
        ...emitIterableAppend(element.source, element.notIterableMessage, current, `${operation.name}.${i}`, context)
      );
      continue;
    }
    if (element.kind === "spread") {
      if (element.sourceKind === "fixed") {
        const binding = context.bindings.get(element.arrayName);
        if (binding?.kind !== "array") {
          throw new Error("Expected fixed array spread binding");
        }
        for (let spreadIndex = 0; spreadIndex < binding.length; spreadIndex++) {
          const value = context.emitValue({ kind: "number", value: { kind: "arrayAccess", arrayName: element.arrayName, index: { kind: "literal", value: spreadIndex } } });
          const current = `%${operation.name}.fixed.spread.current.${i}.${spreadIndex}`;
          lines.push(...value.lines, `  ${current} = load ptr, ptr ${arrayValue.pointerName}`, `  call i64 @arrayPush(ptr ${current}, i64 ${value.value})`);
        }
        continue;
      }
      const current = `%${operation.name}.spread.current.${i}`;
      const source = emitRuntimeArrayPointer(element.arrayName, context);
      const boxed = `%${operation.name}.spread.boxed.${i}`;
      const args = `%${operation.name}.spread.args.${i}`;
      const next = `%${operation.name}.spread.next.${i}`;
      lines.push(
        ...source.lines,
        `  ${current} = load ptr, ptr ${arrayValue.pointerName}`,
        `  ${boxed} = call i64 @valueBoxArray(ptr ${source.value})`,
        `  call void @gcRootPush(i64 ${boxed})`,
        `  ${args} = call ptr @arrayNew(i64 1)`,
        `  call void @arraySet(ptr ${args}, i64 0, i64 ${boxed})`,
        `  ${next} = call ptr @arrayConcat(ptr ${current}, ptr ${args})`,
        `  call void @gcRootPop()`,
        `  store ptr ${next}, ptr ${arrayValue.pointerName}`
      );
      continue;
    }
    const value = context.emitValue(element.value);
    if (operation.elements.some((candidate) => candidate.kind === "spread" || candidate.kind === "iterableSpread")) {
      const current = `%${operation.name}.value.current.${i}`;
      lines.push(...value.lines, `  ${current} = load ptr, ptr ${arrayValue.pointerName}`, `  call i64 @arrayPush(ptr ${current}, i64 ${value.value})`);
    } else {
      lines.push(...value.lines, `  call void @arraySet(ptr %${operation.name}.arr, i64 ${fixedIndex}, i64 ${value.value})`);
      fixedIndex += 1;
    }
  }
  return lines;
}
export function emitRuntimeIteratorNewOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeIteratorNew" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  const collection = emitRuntimeCollectionPointer(operation.collectionName, context);
  const modeCode = runtimeIteratorKindCode(operation.iterationKind);
  let sourceCode = 3;
  if (operation.sourceKind === "map") {
    sourceCode = 2;
  }
  const iteratorValue = `%${operation.name}.iterator.value`;
  context.bindings.set(operation.name, { kind: "valueVariable", name: operation.name });
  if (operation.observeOverride === true) {
    const acquired = emitGeneratedJsCall("getCollectionIterator", [`ptr ${collection.value}`, `i64 ${sourceCode}`, `i64 ${modeCode}`], context);
    return [
      `  ${pointerName} = alloca i64`,
      ...collection.lines,
      ...acquired.lines,
      `  store i64 ${acquired.value}, ptr ${pointerName}`,
      `  call void @gcRootPush(i64 ${acquired.value})`
    ];
  }
  return [
    `  ${pointerName} = alloca i64`,
    ...collection.lines,
    `  ${iteratorValue} = call i64 @createCollectionIterator(ptr ${collection.value}, i64 ${sourceCode}, i64 ${modeCode})`,
    `  store i64 ${iteratorValue}, ptr ${pointerName}`,
    `  call void @gcRootPush(i64 ${iteratorValue})`
  ];
}
export function runtimeArrayLiteralInitialLength(elements: readonly JsIrRuntimeArrayElement[]): number {
  if (elements.some((element) => element.kind === "spread" || element.kind === "iterableSpread")) {
    return 0;
  }
  return elements.length;
}
export function emitRuntimeErrorLiteralOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeErrorLiteral" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeObject", name: operation.name, errorName: operation.errorName });
  const classId = errorClassIds.get(operation.errorName) ?? 0;
  const nameConstant = addStringConstant(operation.errorName, context);
  const nameLength = utf8ByteLength(operation.errorName);
  const message = context.emitValue(operation.message);
  const objectName = `%obj.rt.${context.objectIndex}`;
  context.objectIndex += 1;
  return [
    `  ${pointerName} = alloca ptr`,
    ...message.lines,
    `  ${objectName} = call ptr @errorNew(i64 ${classId}, i64 ${nameLength}, ptr ${nameConstant}, i64 ${message.value})`,
    `  store ptr ${objectName}, ptr ${pointerName}`
  ];
}
export function emitRuntimeArraySliceOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArraySlice" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  const array = emitRuntimeArrayPointer(operation.arrayName, context);
  const start = emitArrayIndex(operation.start, context);
  let end: NumberValue;
  if (operation.end === undefined) {
    const length = `%arr.len.${context.numIndex}`;
    context.numIndex += 1;
    end = { lines: [`  ${length} = call i64 @arrayLength(ptr ${array.value})`], value: length };
  } else {
    end = emitArrayIndex(operation.end, context);
  }
  const result = `%arr.rt.${context.arrayIndex}`;
  context.arrayIndex += 1;
  return [`  ${pointerName} = alloca ptr`, ...array.lines, ...start.lines, ...end.lines, `  ${result} = call ptr @arraySlice(ptr ${array.value}, i64 ${start.value}, i64 ${end.value})`, `  store ptr ${result}, ptr ${pointerName}`];
}
export function emitRuntimeArraySpliceOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArraySplice" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  const array = emitRuntimeArrayPointer(operation.arrayName, context);
  const start = emitArrayIndex(operation.start, context);
  const lines = [`  ${pointerName} = alloca ptr`, ...array.lines, ...start.lines];
  let deleteCountArg: string;
  if (operation.deleteCount === undefined) {
    const length = `%arr.len.${context.numIndex}`;
    context.numIndex += 1;
    lines.push(`  ${length} = call i64 @arrayLength(ptr ${array.value})`);
    deleteCountArg = length;
  } else {
    const deleteCount = emitArrayIndex(operation.deleteCount, context);
    lines.push(...deleteCount.lines);
    deleteCountArg = deleteCount.value;
  }
  const items = operation.items.map((item) => context.emitValue(item));
  const itemsName = `%arr.splice.items.${context.arrayIndex}`;
  context.arrayIndex += 1;
  lines.push(`  ${itemsName} = call ptr @arrayNew(i64 ${items.length})`);
  for (let index = 0; index < items.length; index += 1) {
    const value = items[index];
    lines.push(...value.lines, `  call void @arraySet(ptr ${itemsName}, i64 ${index}, i64 ${value.value})`);
  }
  const result = `%arr.rt.${context.arrayIndex}`;
  context.arrayIndex += 1;
  return [
    ...lines,
    `  ${result} = call ptr @arraySplice(ptr ${array.value}, i64 ${start.value}, i64 ${deleteCountArg}, i64 ${items.length}, ptr ${itemsName})`,
    `  store ptr ${result}, ptr ${pointerName}`
  ];
}
export function emitRuntimeArraySpliceStatementOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArraySpliceStatement" }>,
  context: EmitContext
): string[] {
  const array = emitRuntimeArrayPointer(operation.arrayName, context);
  const start = emitArrayIndex(operation.start, context);
  const lines = [...array.lines, ...start.lines];
  let deleteCountArg: string;
  if (operation.deleteCount === undefined) {
    const length = `%arr.len.${context.numIndex}`;
    context.numIndex += 1;
    lines.push(`  ${length} = call i64 @arrayLength(ptr ${array.value})`);
    deleteCountArg = length;
  } else {
    const deleteCount = emitArrayIndex(operation.deleteCount, context);
    lines.push(...deleteCount.lines);
    deleteCountArg = deleteCount.value;
  }
  const items = operation.items.map((item) => context.emitValue(item));
  const itemsName = `%arr.splice.items.${context.arrayIndex}`;
  context.arrayIndex += 1;
  lines.push(`  ${itemsName} = call ptr @arrayNew(i64 ${items.length})`);
  for (let index = 0; index < items.length; index += 1) {
    const value = items[index];
    lines.push(...value.lines, `  call void @arraySet(ptr ${itemsName}, i64 ${index}, i64 ${value.value})`);
  }
  return [...lines, `  call ptr @arraySplice(ptr ${array.value}, i64 ${start.value}, i64 ${deleteCountArg}, i64 ${items.length}, ptr ${itemsName})`];
}
export function emitRuntimeStringSplitOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeStringSplit" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  const receiver = context.emitStringExpression(operation.receiver);
  const separator = context.emitStringExpression(operation.separator);
  const result = `%arr.rt.${context.arrayIndex}`;
  context.arrayIndex += 1;
  let limitLines: readonly string[] = [];
  let limitValue = "-1";
  if (operation.limit !== undefined) {
    const limit = emitArrayIndex(operation.limit, context);
    limitLines = limit.lines;
    limitValue = limit.value;
  }
  return [
    `  ${pointerName} = alloca ptr`,
    ...receiver.lines,
    ...separator.lines,
    ...limitLines,
    `  ${result} = call ptr @stringSplit(i64 ${receiver.length}, ptr ${receiver.value}, i64 ${separator.length}, ptr ${separator.value}, i64 ${limitValue})`,
    `  store ptr ${result}, ptr ${pointerName}`
  ];
}
export function emitRuntimeRegexSplitOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeRegexSplit" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  const receiver = context.emitStringExpression(operation.receiver);
  const regex = context.emitValue(operation.regex);
  const inputValue = `%regex.split.input.${context.callIndex}`;
  const result = `%regex.split.result.${context.arrayIndex}`;
  context.arrayIndex += 1;
  let limitLines: readonly string[] = [];
  let limitValue = "-1";
  if (operation.limit !== undefined) {
    const limit = emitArrayIndex(operation.limit, context);
    limitLines = limit.lines;
    limitValue = limit.value;
  }
  return [
    `  ${pointerName} = alloca ptr`,
    ...regex.lines,
    `  call void @gcRootPush(i64 ${regex.value})`,
    ...receiver.lines,
    `  ${inputValue} = call i64 @valueBoxString(ptr ${receiver.value}, i64 ${receiver.length})`,
    ...limitLines,
    `  ${result} = call ptr @regexSplit(i64 ${regex.value}, i64 ${inputValue}, i64 ${limitValue})`,
    `  store ptr ${result}, ptr ${pointerName}`
  ];
}
export function emitRuntimeArrayConcatOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayConcat" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  const left = emitRuntimeArrayPointer(operation.leftName, context);
  const values = operation.values.flatMap((value) => {
    if (value.kind === "value") {
      return [context.emitValue(value.value)];
    }
    const elements: JsValue[] = [];
    for (let index = 0; index < value.length; index += 1) {
      elements.push(context.emitValue({ kind: "number", value: { kind: "arrayAccess", arrayName: value.arrayName, index: { kind: "literal", value: index } } }));
    }
    return elements;
  });
  const argsName = `%arr.concat.args.${context.arrayIndex}`;
  context.arrayIndex += 1;
  const result = `%arr.rt.${context.arrayIndex}`;
  context.arrayIndex += 1;
  const lines = [`  ${pointerName} = alloca ptr`, ...left.lines, `  ${argsName} = call ptr @arrayNew(i64 ${values.length})`];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    lines.push(...value.lines, `  call void @arraySet(ptr ${argsName}, i64 ${index}, i64 ${value.value})`);
  }
  return [...lines, `  ${result} = call ptr @arrayConcat(ptr ${left.value}, ptr ${argsName})`, `  store ptr ${result}, ptr ${pointerName}`];
}
export function emitRuntimeArrayMutatorResultOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayMutatorResult" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  const array = emitRuntimeArrayPointer(operation.arrayName, context);
  const lines = [`  ${pointerName} = alloca ptr`, ...array.lines];
  if (operation.mutation.kind === "reverse") {
    lines.push(`  call void @arrayReverse(ptr ${array.value})`);
  } else if (operation.mutation.kind === "fill") {
    const mutationLines = emitRuntimeArrayFillOperation({ kind: "runtimeArrayFill", arrayName: operation.arrayName, value: operation.mutation.value, start: operation.mutation.start, end: operation.mutation.end }, context);
    lines.push(...mutationLines);
  } else {
    const mutationLines = emitRuntimeArrayCopyWithinOperation({ kind: "runtimeArrayCopyWithin", arrayName: operation.arrayName, target: operation.mutation.target, start: operation.mutation.start, end: operation.mutation.end }, context);
    lines.push(...mutationLines);
  }
  lines.push(`  store ptr ${array.value}, ptr ${pointerName}`);
  return lines;
}
