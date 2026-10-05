import type { JsIrBindingValue } from "../ir/bindings.js";
import type { JsIrOperation } from "../ir/types.js";
import {
  createCleanupFrame,
  emitCleanupAfterBody,
  emitCleanupFinalDispatch,
  emitGeneratedJsCall,
  emitIteratorCloseBody,
  emitThrowEntryBlock
} from "./completion.js";
import type { EmitContext, NumberValue } from "./context.js";
import { emitRuntimeArrayPointer, emitRuntimeCollectionPointer, emitRuntimeObjectPointer } from "./layout.js";
import { loopItemSlotName, stringLengthPointerName, variablePointerName } from "./names.js";
import { addStringConstant, utf8ByteLength } from "./strings.js";
import { llvmDoubleLiteral } from "./numbers.js";
import { emitLoopBackEdge, emitLoopFrameSave, emitLoopIterationPrologue } from "./loops.js";

/**
 * The loop tier: every statement that repeats a body.
 *
 * `while`, `do`/`while`, the three-clause `for`, and each `for...of` / `for...in` spelling all lower to
 * the same shape — a head block that produces the element, a body block, and a back edge that restores
 * the GC loop frame. The differences are all in the head: an index bound, a runtime iterator, a
 * protocol dispatch — so the tier is one emitter per loop *form* and they share the frame bookkeeping
 * rather than reimplementing it.
 *
 * A loop item's slot is not its identifier. `for (const v of xs)` twice in one function would emit
 * `%v.addr` twice and clang would reject the module, so `loopItemSlotName` qualifies the slot with the
 * loop index while the binding key stays the identifier the body refers to.
 */

export function emitWhileOperation(operation: Extract<JsIrOperation, { readonly kind: "while" }>, context: EmitContext): string[] {
  const { loopIndex } = context;
  context.loopIndex += 1;
  const condLabel = `while.cond.${loopIndex}`;
  const bodyLabel = `while.body.${loopIndex}`;
  const endLabel = `while.end.${loopIndex}`;
  const emittedCondition = context.emitCondition(operation.condition);
  context.loopLabels.push({ breakLabel: endLabel, continueLabel: condLabel , cleanupDepth: context.cleanupStack.length });
  const bodyLines = context.emitOperations(operation.body);
  context.loopLabels.pop();

  return [
    emitLoopFrameSave(loopIndex),
    `  br label %${condLabel}`,
    `${condLabel}:`,
    ...emittedCondition.lines,
    `  br i1 ${emittedCondition.value}, label %${bodyLabel}, label %${endLabel}`,
    `${bodyLabel}:`,
    ...emitLoopIterationPrologue(loopIndex),
    ...bodyLines,
    ...emitLoopBackEdge(condLabel, operation.body),
    `${endLabel}:`
  ];
}
export function emitDoWhileOperation(operation: Extract<JsIrOperation, { readonly kind: "doWhile" }>, context: EmitContext): string[] {
  const { loopIndex } = context;
  context.loopIndex += 1;
  const bodyLabel = `do.body.${loopIndex}`;
  const condLabel = `do.cond.${loopIndex}`;
  const endLabel = `do.end.${loopIndex}`;
  context.loopLabels.push({ breakLabel: endLabel, continueLabel: condLabel , cleanupDepth: context.cleanupStack.length });
  const bodyLines = context.emitOperations(operation.body);
  context.loopLabels.pop();
  const emittedCondition = context.emitCondition(operation.condition);

  return [
    emitLoopFrameSave(loopIndex),
    `  br label %${bodyLabel}`,
    `${bodyLabel}:`,
    ...emitLoopIterationPrologue(loopIndex),
    ...bodyLines,
    ...emitLoopBackEdge(condLabel, operation.body),
    `${condLabel}:`,
    ...emittedCondition.lines,
    `  br i1 ${emittedCondition.value}, label %${bodyLabel}, label %${endLabel}`,
    `${endLabel}:`
  ];
}
export function emitForOperation(operation: Extract<JsIrOperation, { readonly kind: "for" }>, context: EmitContext): string[] {
  const { loopIndex } = context;
  context.loopIndex += 1;
  const condLabel = `for.cond.${loopIndex}`;
  const bodyLabel = `for.body.${loopIndex}`;
  const stepLabel = `for.step.${loopIndex}`;
  const endLabel = `for.end.${loopIndex}`;
  const initializerLines = context.emitOperations(operation.initializer);
  const emittedCondition = context.emitCondition(operation.condition);
  context.loopLabels.push({ breakLabel: endLabel, continueLabel: stepLabel , cleanupDepth: context.cleanupStack.length });
  const bodyLines = context.emitOperations(operation.body);
  context.loopLabels.pop();
  const incrementLines = context.emitOperations([operation.increment]);

  return [
    ...initializerLines,
    emitLoopFrameSave(loopIndex),
    `  br label %${condLabel}`,
    `${condLabel}:`,
    ...emittedCondition.lines,
    `  br i1 ${emittedCondition.value}, label %${bodyLabel}, label %${endLabel}`,
    `${bodyLabel}:`,
    ...emitLoopIterationPrologue(loopIndex),
    ...bodyLines,
    ...emitLoopBackEdge(stepLabel, operation.body),
    `${stepLabel}:`,
    ...incrementLines,
    `  br label %${condLabel}`,
    `${endLabel}:`
  ];
}
export function emitForOfArrayOperation(operation: Extract<JsIrOperation, { readonly kind: "forOfArray" }>, context: EmitContext): string[] {
  const { loopIndex } = context;
  context.loopIndex += 1;
  const itemSlot = loopItemSlotName(operation.itemName, loopIndex);
  const condLabel = `for.of.cond.${loopIndex}`;
  const bodyLabel = `for.of.body.${loopIndex}`;
  const stepLabel = `for.of.step.${loopIndex}`;
  const endLabel = `for.of.end.${loopIndex}`;
  const indexPointer = `%for.of.index.${loopIndex}.addr`;
  const itemPointer = variablePointerName(itemSlot);
  const bodyBindings = new Map(context.bindings);
  bodyBindings.set(operation.itemName, { kind: "number", value: { kind: "variable", name: itemPointer } });
  const previousBindings = new Map(context.bindings);
  const arrayBinding = context.bindings.get(operation.arrayName);
  let arrayLength = 0;
  if (arrayBinding?.kind === "array") {
    arrayLength = arrayBinding.length;
  }
  context.bindings.clear();
  for (const [name, value] of bodyBindings) {
    context.bindings.set(name, value);
  }
  context.loopLabels.push({ breakLabel: endLabel, continueLabel: stepLabel , cleanupDepth: context.cleanupStack.length });
  const bodyLines = context.emitOperations(operation.body);
  context.loopLabels.pop();
  context.bindings.clear();
  for (const [name, value] of previousBindings) {
    context.bindings.set(name, value);
  }
  const currentIndex = `%for.of.index.${loopIndex}`;
  const inRange = `%for.of.in.range.${loopIndex}`;
  const element = context.emitNumberExpression({ kind: "arrayAccess", arrayName: operation.arrayName, index: { kind: "variable", name: indexPointer } });
  const nextIndex = `%for.of.next.${loopIndex}`;

  return [
    `  ${indexPointer} = alloca double`,
    `  ${itemPointer} = alloca double`,
    `  store double 0.0, ptr ${indexPointer}`,
    emitLoopFrameSave(loopIndex),
    `  br label %${condLabel}`,
    `${condLabel}:`,
    `  ${currentIndex} = load double, ptr ${indexPointer}`,
    `  ${inRange} = fcmp olt double ${currentIndex}, ${llvmDoubleLiteral(arrayLength)}`,
    `  br i1 ${inRange}, label %${bodyLabel}, label %${endLabel}`,
    `${bodyLabel}:`,
    ...emitLoopIterationPrologue(loopIndex),
    ...element.lines,
     `  store double ${element.value}, ptr ${itemPointer}`,
     ...bodyLines,
     ...emitLoopBackEdge(stepLabel, operation.body),
     `${stepLabel}:`,
    `  ${nextIndex} = fadd double ${currentIndex}, 1.0`,
    `  store double ${nextIndex}, ptr ${indexPointer}`,
    `  br label %${condLabel}`,
    `${endLabel}:`
  ];
}
// eslint-disable-next-line max-statements -- String for...of emission walks UTF-8 code points and materializes scoped loop bindings.
export function emitForOfStringOperation(operation: Extract<JsIrOperation, { readonly kind: "forOfString" }>, context: EmitContext): string[] {
  const { loopIndex } = context;
  context.loopIndex += 1;
  const condLabel = `for.of.cond.${loopIndex}`;
  const bodyLabel = `for.of.body.${loopIndex}`;
  const asciiLabel = `for.of.ascii.${loopIndex}`;
  const multiLabel = `for.of.multi.${loopIndex}`;
  const multi2Label = `for.of.multi2.${loopIndex}`;
  const multi3Label = `for.of.multi3.${loopIndex}`;
  const multi4Label = `for.of.multi4.${loopIndex}`;
  const copyLabel = `for.of.copy.${loopIndex}`;
  const afterCopyLabel = `for.of.after.copy.${loopIndex}`;
  const stepLabel = `for.of.step.${loopIndex}`;
  const endLabel = `for.of.end.${loopIndex}`;
  const indexPointer = `%for.of.index.${loopIndex}.addr`;
  const itemPointer = variablePointerName(operation.itemName);
  const itemLengthPointer = stringLengthPointerName(operation.itemName);
  const source = context.emitStringExpression(operation.source);
  const bodyBindings = new Map(context.bindings);
  bodyBindings.set(operation.itemName, { kind: "stringVariable", name: operation.itemName });
  const previousBindings = new Map(context.bindings);
  context.bindings.clear();
  for (const [name, value] of bodyBindings) {
    context.bindings.set(name, value);
  }
  context.loopLabels.push({ breakLabel: endLabel, continueLabel: stepLabel , cleanupDepth: context.cleanupStack.length });
  const bodyLines = context.emitOperations(operation.body);
  context.loopLabels.pop();
  context.bindings.clear();
  for (const [name, value] of previousBindings) {
    context.bindings.set(name, value);
  }
  const currentIndex = `%for.of.index.${loopIndex}`;
  const inRange = `%for.of.in.range.${loopIndex}`;
  const charSource = `%for.of.char.src.${loopIndex}`;
  const charValue = `%for.of.char.${loopIndex}`;
  const isAscii = `%for.of.is.ascii.${loopIndex}`;
  const is2 = `%for.of.is2.${loopIndex}`;
  const is3 = `%for.of.is3.${loopIndex}`;
  const seqLen = `%for.of.seq.len.${loopIndex}`;
  const remain = `%for.of.remain.${loopIndex}`;
  const fits = `%for.of.fits.${loopIndex}`;
  const copyLen = `%for.of.copy.len.${loopIndex}`;
  const allocSize = `%for.of.alloc.${loopIndex}`;
  const charString = `%for.of.char.string.${loopIndex}`;
  const charStringNul = `%for.of.char.string.nul.${loopIndex}`;
  const nextIndex = `%for.of.next.${loopIndex}`;

  return [
    ...source.lines,
    `  ${indexPointer} = alloca i64`,
    `  ${itemPointer} = alloca ptr`,
    `  ${itemLengthPointer} = alloca i64`,
    `  store i64 0, ptr ${indexPointer}`,
    emitLoopFrameSave(loopIndex),
    `  br label %${condLabel}`,
    `${condLabel}:`,
    `  ${currentIndex} = load i64, ptr ${indexPointer}`,
    `  ${inRange} = icmp ult i64 ${currentIndex}, ${source.length}`,
    `  br i1 ${inRange}, label %${bodyLabel}, label %${endLabel}`,
    `${bodyLabel}:`,
    ...emitLoopIterationPrologue(loopIndex),
    `  ${charSource} = getelementptr i8, ptr ${source.value}, i64 ${currentIndex}`,
    `  ${charValue} = load i8, ptr ${charSource}`,
    `  ${isAscii} = icmp ult i8 ${charValue}, 128`,
    `  br i1 ${isAscii}, label %${asciiLabel}, label %${multiLabel}`,
    `${asciiLabel}:`,
    `  ${charString}.a = call ptr @malloc(i64 2)`,
    `  store i8 ${charValue}, ptr ${charString}.a`,
    `  ${charStringNul}.a = getelementptr i8, ptr ${charString}.a, i64 1`,
    `  store i8 0, ptr ${charStringNul}.a`,
    `  store ptr ${charString}.a, ptr ${itemPointer}`,
    `  store i64 1, ptr ${itemLengthPointer}`,
    `  ${nextIndex}.a = add i64 ${currentIndex}, 1`,
    `  store i64 ${nextIndex}.a, ptr ${indexPointer}`,
    `  br label %${afterCopyLabel}`,
    `${multiLabel}:`,
    `  ${is2} = icmp ult i8 ${charValue}, 224`,
    `  br i1 ${is2}, label %${multi2Label}, label %${multi3Label}`,
    `${multi2Label}:`,
    `  br label %${copyLabel}`,
    `${multi3Label}:`,
    `  ${is3} = icmp ult i8 ${charValue}, 240`,
    `  br i1 ${is3}, label %${multi4Label}.pre3, label %${multi4Label}`,
    `${multi4Label}.pre3:`,
    `  br label %${copyLabel}`,
    `${multi4Label}:`,
    `  br label %${copyLabel}`,
    `${copyLabel}:`,
    `  ${seqLen} = phi i64 [ 2, %${multi2Label} ], [ 3, %${multi4Label}.pre3 ], [ 4, %${multi4Label} ]`,
    `  ${remain} = sub i64 ${source.length}, ${currentIndex}`,
    `  ${fits} = icmp ule i64 ${seqLen}, ${remain}`,
    `  ${copyLen} = select i1 ${fits}, i64 ${seqLen}, i64 1`,
    `  ${allocSize} = add i64 ${copyLen}, 1`,
    `  ${charString} = call ptr @malloc(i64 ${allocSize})`,
    `  call ptr @memcpy(ptr ${charString}, ptr ${charSource}, i64 ${copyLen})`,
    `  ${charStringNul} = getelementptr i8, ptr ${charString}, i64 ${copyLen}`,
    `  store i8 0, ptr ${charStringNul}`,
    `  store ptr ${charString}, ptr ${itemPointer}`,
    `  store i64 ${copyLen}, ptr ${itemLengthPointer}`,
    `  ${nextIndex}.m = add i64 ${currentIndex}, ${copyLen}`,
    `  store i64 ${nextIndex}.m, ptr ${indexPointer}`,
    `  br label %${afterCopyLabel}`,
    `${afterCopyLabel}:`,
    ...bodyLines,
    ...emitLoopBackEdge(stepLabel, operation.body),
    `${stepLabel}:`,
    `  br label %${condLabel}`,
    `${endLabel}:`
  ];
}
export function emitForOfSetOperation(operation: Extract<JsIrOperation, { readonly kind: "forOfSet" }>, context: EmitContext): string[] {
  return emitForOfCollectionValueOperation(operation.setName, operation.itemName, "i64", operation.body, context, (entryPointer, itemPointer, itemSlot) => {
    const valueSlot = `%for.of.collection.value.slot.${context.objectIndex}`;
    const value = `%for.of.collection.value.${context.objectIndex}`;
    context.objectIndex += 1;
    return {
      lines: [`  ${valueSlot} = getelementptr i8, ptr ${entryPointer}, i64 8`, `  ${value} = load i64, ptr ${valueSlot}`, `  store i64 ${value}, ptr ${itemPointer}`],
      binding: { kind: "valueVariable", name: itemSlot }
    };
  });
}
// eslint-disable-next-line max-statements -- Protocol for-of installs IteratorClose cleanup and drives next()/body/close.
export function emitForOfProtocolOperation(operation: Extract<JsIrOperation, { readonly kind: "forOfProtocol" }>, context: EmitContext): string[] {
  const { loopIndex } = context;
  context.loopIndex += 1;
  const itemSlot = loopItemSlotName(operation.itemName, loopIndex);
  const condLabel = `for.of.proto.cond.${loopIndex}`;
  const bodyLabel = `for.of.proto.body.${loopIndex}`;
  const stepLabel = `for.of.proto.step.${loopIndex}`;
  const endLabel = `for.of.proto.end.${loopIndex}`;
  const itemPointer = variablePointerName(itemSlot);
  const iteratorSlot = `%for.of.proto.iter.${loopIndex}.addr`;

  const iterable = context.emitValue(operation.iterable);
  const notIterableMessageConstant = addStringConstant(operation.notIterableMessage, context);
  const notIterableMessage = `%for.of.proto.not.iterable.${loopIndex}`;
  const getIterator = emitGeneratedJsCall("getIteratorValue", [`i64 ${iterable.value}`, `i64 ${notIterableMessage}`], context);

  const bodyBindings = new Map(context.bindings);
  bodyBindings.set(operation.itemName, { kind: "valueVariable", name: itemSlot });
  const previousBindings = new Map(context.bindings);
  context.bindings.clear();
  for (const [name, value] of bodyBindings) {
    context.bindings.set(name, value);
  }

  // Install loop labels before the IteratorClose frame so cleanupDepth points at the frame index.
  const cleanupDepth = context.cleanupStack.length;
  context.loopLabels.push({ breakLabel: endLabel, continueLabel: condLabel, cleanupDepth });
  const closeFrame = createCleanupFrame(context, "iteratorClose", {
    skipContinueLabel: condLabel,
    iteratorSlot
  });
  context.cleanupStack.push(closeFrame);
  const outerException = context.exceptionTarget;
  // Escaping throws close the iterator before propagating.
  context.exceptionTarget = closeFrame.throwEntryLabel;
  const bodyLines = context.emitOperations(operation.body);
  context.exceptionTarget = outerException;
  context.cleanupStack.pop();
  context.loopLabels.pop();
  context.bindings.clear();
  for (const [name, value] of previousBindings) {
    context.bindings.set(name, value);
  }

  // Call next after the per-iteration root restore so the iterator result and
  // item stay live across body allocations (same shape as specialized for-of).
  const iteratorLoad = `%for.of.proto.iter.${loopIndex}`;
  const nextCall = emitGeneratedJsCall("callIteratorNext", [`i64 ${iteratorLoad}`], context);
  const doneKey = addStringConstant("done", context);
  const valueKey = addStringConstant("value", context);
  const doneValue = `%for.of.proto.done.${loopIndex}`;
  const isDone = `%for.of.proto.is.done.${loopIndex}`;
  const itemValue = `%for.of.proto.item.${loopIndex}`;

  return [
    ...iterable.lines,
    `  call void @gcRootPush(i64 ${iterable.value})`,
    `  ${notIterableMessage} = call i64 @valueBoxString(ptr ${notIterableMessageConstant}, i64 ${utf8ByteLength(operation.notIterableMessage)})`,
    ...getIterator.lines,
    `  ${iteratorSlot} = alloca i64`,
    `  store i64 ${getIterator.value}, ptr ${iteratorSlot}`,
    `  call void @gcRootPush(i64 ${getIterator.value})`,
    `  ${itemPointer} = alloca i64`,
    emitLoopFrameSave(loopIndex),
    `  br label %${condLabel}`,
    `${condLabel}:`,
    `  br label %${bodyLabel}`,
    `${bodyLabel}:`,
    ...emitLoopIterationPrologue(loopIndex),
    `  ${iteratorLoad} = load i64, ptr ${iteratorSlot}`,
    `  call void @gcRootPush(i64 ${iteratorLoad})`,
    ...nextCall.lines,
    `  ${doneValue} = call i64 @valueObjectGet(i64 ${nextCall.value}, i64 4, ptr ${doneKey})`,
    `  ${isDone} = call i1 @valueTruthy(i64 ${doneValue})`,
    // Normal exhaustion does not call IteratorClose.
    `  br i1 ${isDone}, label %${endLabel}, label %${stepLabel}`,
    `${stepLabel}:`,
    `  ${itemValue} = call i64 @valueObjectGet(i64 ${nextCall.value}, i64 5, ptr ${valueKey})`,
    `  store i64 ${itemValue}, ptr ${itemPointer}`,
    `  call void @gcRootPush(i64 ${itemValue})`,
    ...bodyLines,
    ...emitLoopBackEdge(condLabel, operation.body),
    // IteratorClose cleanup region (abrupt exits only).
    `${closeFrame.entryLabel}:`,
    `  ${closeFrame.rootFrameName} = call i64 @gcRootSave()`,
    ...emitIteratorCloseBody(context, closeFrame),
    ...emitCleanupAfterBody(context, closeFrame),
    ...emitThrowEntryBlock(context, closeFrame),
    ...emitCleanupFinalDispatch(context, closeFrame),
    // IteratorClose is only entered on abrupt exits; NORMAL is unreachable here.
    // Break resumes via dest switch to endLabel; keep join as a safe fallback.
    `${closeFrame.joinLabel}:`,
    `  br label %${endLabel}`,
    `${endLabel}:`
  ];
}
export function emitForOfMapOperation(operation: Extract<JsIrOperation, { readonly kind: "forOfMap" }>, context: EmitContext): string[] {
  return emitForOfCollectionValueOperation(operation.mapName, operation.itemName, "ptr", operation.body, context, (entryPointer, itemPointer, itemSlot) => {
    const index = context.objectIndex;
    context.objectIndex += 1;
    const keySlot = `%for.of.map.key.slot.${index}`;
    const key = `%for.of.map.key.${index}`;
    const valueSlot = `%for.of.map.value.slot.${index}`;
    const value = `%for.of.map.value.${index}`;
    const pair = `%for.of.map.pair.${index}`;
    return {
      lines: [
        `  ${keySlot} = getelementptr i8, ptr ${entryPointer}, i64 8`,
        `  ${key} = load i64, ptr ${keySlot}`,
        `  ${valueSlot} = getelementptr i8, ptr ${entryPointer}, i64 16`,
        `  ${value} = load i64, ptr ${valueSlot}`,
        `  ${pair} = call ptr @arrayNew(i64 2)`,
        `  call void @arraySet(ptr ${pair}, i64 0, i64 ${key})`,
        `  call void @arraySet(ptr ${pair}, i64 1, i64 ${value})`,
        `  store ptr ${pair}, ptr ${itemPointer}`
      ],
      binding: { kind: "runtimeArray", name: itemSlot }
    };
  });
}
// eslint-disable-next-line max-statements -- for...in emission walks the runtime object/array key array and binds a scoped string variable.
export function emitForInObjectOperation(operation: Extract<JsIrOperation, { readonly kind: "forInObject" }>, context: EmitContext): string[] {
  return emitForInKeyIteration(operation.itemName, "objectKeys", operation.objectName, emitRuntimeObjectPointer, operation.body, context);
}
// eslint-disable-next-line max-statements -- for...in over runtime arrays reuses the same key-iteration pattern as runtime objects.
export function emitForInArrayOperation(operation: Extract<JsIrOperation, { readonly kind: "forInArray" }>, context: EmitContext): string[] {
  return emitForInKeyIteration(operation.itemName, "arrayKeys", operation.arrayName, emitRuntimeArrayPointer, operation.body, context);
}
// eslint-disable-next-line max-statements -- for...in body binding is set up before allocating the key pointers so the body's loops can see the key string.
export function emitForInKeyIteration(
  itemName: string,
  helper: "objectKeys" | "arrayKeys",
  sourceName: string,
  emitSourcePointer: (name: string, context: EmitContext) => NumberValue,
  body: readonly JsIrOperation[],
  context: EmitContext
): string[] {
  const { loopIndex } = context;
  context.loopIndex += 1;
  const itemSlot = loopItemSlotName(itemName, loopIndex);
  const condLabel = `for.in.cond.${loopIndex}`;
  const bodyLabel = `for.in.body.${loopIndex}`;
  const stepLabel = `for.in.step.${loopIndex}`;
  const endLabel = `for.in.end.${loopIndex}`;
  const indexPointer = `%for.in.index.${loopIndex}.addr`;
  const itemPointer = variablePointerName(itemSlot);
  const itemLengthPointer = stringLengthPointerName(itemSlot);
  const bodyBindings = new Map(context.bindings);
  bodyBindings.set(itemName, { kind: "stringVariable", name: itemSlot });
  const previousBindings = new Map(context.bindings);
  context.bindings.clear();
  for (const [name, value] of bodyBindings) {
    context.bindings.set(name, value);
  }
  context.loopLabels.push({ breakLabel: endLabel, continueLabel: stepLabel , cleanupDepth: context.cleanupStack.length });
  const bodyLines = context.emitOperations(body);
  context.loopLabels.pop();
  context.bindings.clear();
  for (const [name, value] of previousBindings) {
    context.bindings.set(name, value);
  }
  const source = emitSourcePointer(sourceName, context);
  const currentIndex = `%for.in.index.${loopIndex}`;
  const inRange = `%for.in.in.range.${loopIndex}`;
  const keysPointer = `%for.in.keys.${loopIndex}`;
  const keysLength = `%for.in.keys.length.${loopIndex}`;
  const keyElement = `%for.in.key.${loopIndex}`;
  const keyPtr = `%for.in.key.ptr.${loopIndex}`;
  const keyLen = `%for.in.key.len.${loopIndex}`;
  const nextIndex = `%for.in.next.${loopIndex}`;

  return [
    ...source.lines,
    `  ${indexPointer} = alloca i64`,
    `  ${itemPointer} = alloca ptr`,
    `  ${itemLengthPointer} = alloca i64`,
    `  store i64 0, ptr ${indexPointer}`,
    `  ${keysPointer} = call ptr @${helper}(ptr ${source.value})`,
    `  ${keysLength} = call i64 @arrayLength(ptr ${keysPointer})`,
    emitLoopFrameSave(loopIndex),
    `  br label %${condLabel}`,
    `${condLabel}:`,
    `  ${currentIndex} = load i64, ptr ${indexPointer}`,
    `  ${inRange} = icmp ult i64 ${currentIndex}, ${keysLength}`,
    `  br i1 ${inRange}, label %${bodyLabel}, label %${endLabel}`,
    `${bodyLabel}:`,
    ...emitLoopIterationPrologue(loopIndex),
    `  ${keyElement} = call i64 @arrayGet(ptr ${keysPointer}, i64 ${currentIndex})`,
    `  ${keyPtr} = call ptr @valueStringPtr(i64 ${keyElement})`,
    `  ${keyLen} = call i64 @valueStringLength(i64 ${keyElement})`,
    `  store ptr ${keyPtr}, ptr ${itemPointer}`,
    `  store i64 ${keyLen}, ptr ${itemLengthPointer}`,
     ...bodyLines,
     ...emitLoopBackEdge(stepLabel, body),
     `${stepLabel}:`,
    `  ${nextIndex} = add i64 ${currentIndex}, 1`,
    `  store i64 ${nextIndex}, ptr ${indexPointer}`,
    `  br label %${condLabel}`,
    `${endLabel}:`
  ];
}
// eslint-disable-next-line max-statements -- Collection for...of emission owns the active-slot scan and loop-control labels.
export function emitForOfCollectionValueOperation(
  collectionName: string,
  itemName: string,
  itemPointerType: "i64" | "ptr",
  body: readonly JsIrOperation[],
  context: EmitContext,
  emitItemStore: (
    entryPointer: string,
    itemPointer: string,
    itemSlot: string
  ) => { readonly lines: readonly string[]; readonly binding: JsIrBindingValue }
): string[] {
  const { loopIndex } = context;
  context.loopIndex += 1;
  const itemSlot = loopItemSlotName(itemName, loopIndex);
  const itemPointer = variablePointerName(itemSlot);
  const condLabel = `for.of.cond.${loopIndex}`;
  const checkLabel = `for.of.check.${loopIndex}`;
  const bodyLabel = `for.of.body.${loopIndex}`;
  const stepLabel = `for.of.step.${loopIndex}`;
  const endLabel = `for.of.end.${loopIndex}`;
  const indexPointer = `%for.of.index.${loopIndex}.addr`;
  const collection = emitRuntimeCollectionPointer(collectionName, context);
  const bodyBindings = new Map(context.bindings);
  const previousBindings = new Map(context.bindings);
  const currentIndex = `%for.of.index.${loopIndex}`;
  const usedSlot = `%for.of.collection.used.slot.${loopIndex}`;
  const used = `%for.of.collection.used.${loopIndex}`;
  const inRange = `%for.of.in.range.${loopIndex}`;
  const entriesSlot = `%for.of.collection.entries.slot.${loopIndex}`;
  const entries = `%for.of.collection.entries.${loopIndex}`;
  const entryBytes = `%for.of.collection.entry.bytes.${loopIndex}`;
  const entryPointer = `%for.of.collection.entry.${loopIndex}`;
  const active = `%for.of.collection.active.${loopIndex}`;
  const isActive = `%for.of.collection.is.active.${loopIndex}`;
  const item = emitItemStore(entryPointer, itemPointer, itemSlot);
  bodyBindings.set(itemName, item.binding);
  context.bindings.clear();
  for (const [name, value] of bodyBindings) {
    context.bindings.set(name, value);
  }
  context.loopLabels.push({ breakLabel: endLabel, continueLabel: stepLabel , cleanupDepth: context.cleanupStack.length });
  const bodyLines = context.emitOperations(body);
  context.loopLabels.pop();
  context.bindings.clear();
  for (const [name, value] of previousBindings) {
    context.bindings.set(name, value);
  }
  const nextIndex = `%for.of.next.${loopIndex}`;

  return [
    ...collection.lines,
    `  ${indexPointer} = alloca i64`,
    `  ${itemPointer} = alloca ${itemPointerType}`,
    `  store i64 0, ptr ${indexPointer}`,
    emitLoopFrameSave(loopIndex),
    `  br label %${condLabel}`,
    `${condLabel}:`,
    `  ${currentIndex} = load i64, ptr ${indexPointer}`,
    `  ${usedSlot} = getelementptr i8, ptr ${collection.value}, i64 8`,
    `  ${used} = load i64, ptr ${usedSlot}`,
    `  ${inRange} = icmp ult i64 ${currentIndex}, ${used}`,
    `  br i1 ${inRange}, label %${checkLabel}, label %${endLabel}`,
    `${checkLabel}:`,
    `  ${entriesSlot} = getelementptr i8, ptr ${collection.value}, i64 24`,
    `  ${entries} = load ptr, ptr ${entriesSlot}`,
    `  ${entryBytes} = mul i64 ${currentIndex}, 24`,
    `  ${entryPointer} = getelementptr i8, ptr ${entries}, i64 ${entryBytes}`,
    `  ${active} = load i64, ptr ${entryPointer}`,
    `  ${isActive} = icmp ne i64 ${active}, 0`,
    `  br i1 ${isActive}, label %${bodyLabel}, label %${stepLabel}`,
    `${bodyLabel}:`,
    ...emitLoopIterationPrologue(loopIndex),
    ...item.lines,
     ...bodyLines,
     ...emitLoopBackEdge(stepLabel, body),
     `${stepLabel}:`,
    `  ${nextIndex} = add i64 ${currentIndex}, 1`,
    `  store i64 ${nextIndex}, ptr ${indexPointer}`,
    `  br label %${condLabel}`,
    `${endLabel}:`
  ];
}
