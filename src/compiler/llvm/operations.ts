import type { JsIrOperation } from "../ir/types.js";
import type { EmitContext, OperationOf } from "./context.js";
import { traceEndLine, traceStartLine } from "./trace.js";
import { jsValueUndefined } from "./values.js";
import { emitValueCallExpression } from "./value-calls.js";
import {
  emitArrayLiteralOperation,
  emitRuntimeArrayConcatOperation,
  emitRuntimeArrayLiteralOperation,
  emitRuntimeArrayMutatorResultOperation,
  emitRuntimeArraySliceOperation,
  emitRuntimeArraySpliceOperation,
  emitRuntimeArraySpliceStatementOperation,
  emitRuntimeErrorLiteralOperation,
  emitRuntimeIteratorNewOperation,
  emitRuntimeRegexSplitOperation,
  emitRuntimeStringSplitOperation,
} from "./aggregate-constructors.js";
import {
  emitRuntimeArrayFilterCallbackOperation,
  emitRuntimeArrayFlatMapCallbackOperation,
  emitRuntimeArrayFlatOperation,
  emitRuntimeArrayForEachCallbackOperation,
  emitRuntimeArrayFromFamilyOperation,
  emitRuntimeArrayMapCallbackOperation,
  emitRuntimeArrayMapFunctionObjectOperation,
  emitRuntimeArrayScalarCallbackOperation,
  emitRuntimeArraySortOperation,
} from "./array-callbacks.js";
import {
  emitRuntimeArrayAppendOperation,
  emitRuntimeArrayCopyWithinOperation,
  emitRuntimeArrayDeleteOperation,
  emitRuntimeArrayFillOperation,
  emitRuntimeArrayRemoveOperation,
  emitRuntimeArrayReverseOperation,
  emitRuntimeArraySetLengthOperation,
  emitRuntimeArrayStoreOperation,
} from "./array-mutators.js";
import {
  emitArrayDestructureProtocolOperation,
  emitArrayStoreOperation,
  emitAssignBooleanOperation,
  emitAssignNumberOperation,
  emitAssignStringOperation,
  emitLetBooleanOperation,
  emitLetNumberOperation,
  emitLetStringOperation,
  emitLetValueOperation,
  emitObjectStoreOperation,
  emitPrivateFieldStoreOperation,
  emitValueAggregateDeleteOperation,
  emitValueAggregateStoreOperation,
} from "./bindings.js";
import { emitBreakOperation, emitContinueOperation, emitIfOperation, emitSwitchOperation, emitTryCatchOperation } from "./branches.js";
import {
  emitRuntimeCollectionFromArrayOperation,
  emitRuntimeCollectionFromCollectionOperation,
  emitRuntimeCollectionFromIterableOperation,
  emitRuntimeCollectionMutationOperation,
  emitRuntimeCollectionNewOperation,
  emitRuntimeCollectionResultOperation,
} from "./collections.js";
import { emitNormalGeneratedReturn } from "./completion.js";
import { emitObjectLiteralOperation, emitValueObjectSetPrototypeOperation } from "./known-shape-objects.js";
import {
  emitDoWhileOperation,
  emitForInArrayOperation,
  emitForInObjectOperation,
  emitForOfArrayOperation,
  emitForOfMapOperation,
  emitForOfProtocolOperation,
  emitForOfSetOperation,
  emitForOfStringOperation,
  emitForOperation,
  emitWhileOperation,
} from "./loop-statements.js";
import { operationListTerminates } from "./loops.js";
import {
  emitRuntimeObjectAssignOperation,
  emitRuntimeObjectCreateOperation,
  emitRuntimeObjectDefineDataPropertyOperation,
  emitRuntimeObjectDeleteOperation,
  emitRuntimeObjectEntriesOperation,
  emitRuntimeObjectFromEntriesOperation,
  emitRuntimeObjectGetPrototypeOperation,
  emitRuntimeObjectKeysOperation,
  emitRuntimeObjectLiteralOperation,
  emitRuntimeObjectOwnPropertyDescriptorOperation,
  emitRuntimeObjectOwnPropertyDescriptorsOperation,
  emitRuntimeObjectOwnPropertyNamesOperation,
  emitRuntimeObjectSetPrototypeOperation,
  emitRuntimeObjectStateMutationOperation,
  emitRuntimeObjectStoreOperation,
  emitRuntimeObjectValuesOperation,
} from "./objects.js";
import { emitPrintOperation } from "./print.js";
import {
  emitBindingGroupOperation,
  emitCallOperation,
  emitHoistedFunctionOperation,
  emitNumberReturnOperation,
  emitRuntimeArrayNamedDeleteOperation,
  emitRuntimeArrayNamedStoreOperation,
  emitScopedBlockOperation,
  emitStringReturnOperation,
  emitThrowValueOperation,
  emitValueReturnOperation,
} from "./statements.js";

/**
 * The operation table, and the statement loop that walks it.
 *
 * `operationEmitters` is what makes the table total rather than merely checked. Its parameter type is a
 * mapped type over the keys, so adding a kind to `JsIrOperation` without an entry here is a compile
 * error, and each handler is typed against `OperationOf<K>` — the one variant its key selects — so a
 * handler cannot read a field its kind does not have. That is what replaced the twelve predicates the
 * `if` chain used, and keeping the chain alongside the table would have left two dispatchers with the
 * chain still running whenever a key was missing at runtime.
 *
 * `operationEmitterFor` holds the emitter's one type assertion. Indexing a `Record` by a union key yields
 * a union of function types whose parameters intersect to `never`, so TypeScript will not accept the
 * operation it just indexed with. The lookup is sound because the table's totality is checked at its
 * declaration and every entry is checked against its own kind; the assertion only re-associates the two.
 *
 * `emitOperations` is the loop over a statement list, and it is the only place the table is indexed.
 * Everything above it reaches a nested statement list through `context.emitOperations`, so no handler has
 * to import this module — the cycle that made the emitter undecomposable was the *recursion*, and the
 * table is downstream of it rather than part of it.
 *
 * Several keys share a handler on purpose — `runtimeMapSet` and `runtimeSetAdd` are the same runtime
 * object, `push` and `unshift` differ only in a starting index — and a few entries are inline arrows
 * because the operation is a binding-map write with no code to emit.
 */

export function emitOperations(operations: readonly JsIrOperation[], context: EmitContext): string[] {
  const lines: string[] = [];

  for (const operation of operations) {
    const emitted = context.emitOperation(operation);
    if (context.suppressTrace === true) {
      lines.push(...emitted);
    } else {
      lines.push(traceStartLine(operation, context), ...emitted, traceEndLine(operation, context));
    }
    if (operationListTerminates([operation])) {
      break;
    }
  }

  return lines;
}
/**
 * Emits one operation kind. The narrowed parameter means a handler cannot read a field its
 * kind does not have, which is what lets a single handler serve several kinds.
 */
type OperationEmitter<T extends JsIrOperation["kind"]> = (operation: OperationOf<T>, context: EmitContext) => string[];
/**
 * Builds the emitter table, proving at compile time that it routes every kind it is given.
 * A new operation kind is a compile error here until something emits it, which is the
 * closed-world property the `if` chain could not state: a kind that matched no branch used
 * to emit nothing and say so nowhere.
 */
function operationEmitters<T extends JsIrOperation["kind"]>(handlers: {
  readonly [K in T]: OperationEmitter<K>;
}): { readonly [K in T]: OperationEmitter<K> } {
  return handlers;
}
const operationEmittersByKind = operationEmitters({
  // Bindings. A `const` has no runtime effect; it only records how later operations read the name.
  constNumber: (operation, context) => {
    context.bindings.set(operation.name, { kind: "number", value: operation.value });
    return [];
  },
  constBoolean: (operation, context) => {
    context.bindings.set(operation.name, { kind: "boolean", value: operation.value });
    return [];
  },
  constBooleanExpression: (operation, context) => {
    context.bindings.set(operation.name, { kind: "booleanExpression", value: operation.value });
    return [];
  },
  constValue: (operation, context) => {
    context.bindings.set(operation.name, { kind: "value", value: operation.value });
    return [];
  },
  letValue: emitLetValueOperation,
  constClosure: (operation, context) => {
    context.bindings.set(operation.name, { kind: "closure", value: operation.value });
    return [];
  },
  constString: (operation, context) => {
    context.bindings.set(operation.name, { kind: "string", value: operation.value });
    return [];
  },
  constStringExpression: (operation, context) => {
    context.bindings.set(operation.name, { kind: "stringExpression", value: operation.value });
    return [];
  },
  letNumber: emitLetNumberOperation,
  letString: emitLetStringOperation,
  letBoolean: emitLetBooleanOperation,

  // Aggregate literals and the runtime shapes they build.
  arrayLiteral: emitArrayLiteralOperation,
  runtimeArrayLiteral: emitRuntimeArrayLiteralOperation,
  objectLiteral: emitObjectLiteralOperation,
  runtimeObjectLiteral: emitRuntimeObjectLiteralOperation,
  runtimeObjectCreate: emitRuntimeObjectCreateOperation,
  runtimeErrorLiteral: emitRuntimeErrorLiteralOperation,
  runtimeMapNew: emitRuntimeCollectionNewOperation,
  runtimeSetNew: emitRuntimeCollectionNewOperation,
  runtimeMapFromArray: emitRuntimeCollectionFromArrayOperation,
  runtimeSetFromArray: emitRuntimeCollectionFromArrayOperation,
  runtimeMapFromIterable: emitRuntimeCollectionFromIterableOperation,
  runtimeSetFromIterable: emitRuntimeCollectionFromIterableOperation,
  runtimeMapFromCollection: emitRuntimeCollectionFromCollectionOperation,
  runtimeSetFromCollection: emitRuntimeCollectionFromCollectionOperation,
  runtimeObjectKeys: emitRuntimeObjectKeysOperation,
  runtimeObjectValues: emitRuntimeObjectValuesOperation,
  runtimeObjectEntries: emitRuntimeObjectEntriesOperation,
  runtimeObjectFromEntries: emitRuntimeObjectFromEntriesOperation,
  runtimeObjectOwnPropertyDescriptor: emitRuntimeObjectOwnPropertyDescriptorOperation,
  runtimeObjectOwnPropertyNames: emitRuntimeObjectOwnPropertyNamesOperation,
  runtimeObjectOwnPropertyDescriptors: emitRuntimeObjectOwnPropertyDescriptorsOperation,
  runtimeIteratorNew: emitRuntimeIteratorNewOperation,

  // Array- and string-producing operations.
  runtimeArraySlice: emitRuntimeArraySliceOperation,
  runtimeArraySplice: emitRuntimeArraySpliceOperation,
  runtimeArraySpliceStatement: emitRuntimeArraySpliceStatementOperation,
  runtimeArrayFlat: emitRuntimeArrayFlatOperation,
  runtimeStringSplit: emitRuntimeStringSplitOperation,
  runtimeRegexSplit: emitRuntimeRegexSplitOperation,
  runtimeArrayMapCallback: emitRuntimeArrayMapCallbackOperation,
  runtimeArrayMapFunctionObject: emitRuntimeArrayMapFunctionObjectOperation,
  runtimeArrayFlatMapCallback: emitRuntimeArrayFlatMapCallbackOperation,
  runtimeArrayFilterCallback: emitRuntimeArrayFilterCallbackOperation,
  runtimeArrayConcat: emitRuntimeArrayConcatOperation,
  runtimeArrayMutatorResult: emitRuntimeArrayMutatorResultOperation,
  runtimeArraySort: emitRuntimeArraySortOperation,
  runtimeArrayFrom: emitRuntimeArrayFromFamilyOperation,
  runtimeArrayFromValue: emitRuntimeArrayFromFamilyOperation,
  runtimeArrayFromCollection: emitRuntimeArrayFromFamilyOperation,
  runtimeArrayFindCallback: emitRuntimeArrayScalarCallbackOperation,
  runtimeArrayFindIndexCallback: emitRuntimeArrayScalarCallbackOperation,
  runtimeArrayReduceCallback: emitRuntimeArrayScalarCallbackOperation,
  runtimeObjectGetPrototype: emitRuntimeObjectGetPrototypeOperation,

  // Assignments and stores.
  assignNumber: emitAssignNumberOperation,
  assignString: emitAssignStringOperation,
  assignBoolean: emitAssignBooleanOperation,
  arrayStore: emitArrayStoreOperation,
  runtimeArrayStore: emitRuntimeArrayStoreOperation,
  runtimeArrayNamedStore: emitRuntimeArrayNamedStoreOperation,
  runtimeArrayDelete: emitRuntimeArrayDeleteOperation,
  runtimeArrayNamedDelete: emitRuntimeArrayNamedDeleteOperation,
  runtimeArraySetLength: emitRuntimeArraySetLengthOperation,
  runtimeArrayPush: emitRuntimeArrayAppendOperation,
  runtimeArrayUnshift: emitRuntimeArrayAppendOperation,
  runtimeArrayPop: emitRuntimeArrayRemoveOperation,
  runtimeArrayShift: emitRuntimeArrayRemoveOperation,
  runtimeArrayFill: emitRuntimeArrayFillOperation,
  runtimeArrayReverse: emitRuntimeArrayReverseOperation,
  runtimeArrayForEachCallback: emitRuntimeArrayForEachCallbackOperation,
  runtimeArrayCopyWithin: emitRuntimeArrayCopyWithinOperation,
  objectStore: emitObjectStoreOperation,
  runtimeObjectStore: emitRuntimeObjectStoreOperation,
  runtimeObjectDelete: emitRuntimeObjectDeleteOperation,
  valueObjectStore: emitValueAggregateStoreOperation,
  valueArrayStore: emitValueAggregateStoreOperation,
  valueArraySetLength: emitValueAggregateStoreOperation,
  privateFieldStore: emitPrivateFieldStoreOperation,
  valueObjectDelete: emitValueAggregateDeleteOperation,
  valueArrayDelete: emitValueAggregateDeleteOperation,
  runtimeObjectSetPrototype: emitRuntimeObjectSetPrototypeOperation,
  valueObjectSetPrototype: emitValueObjectSetPrototypeOperation,
  runtimeObjectPreventExtensions: emitRuntimeObjectStateMutationOperation,
  runtimeObjectSeal: emitRuntimeObjectStateMutationOperation,
  runtimeObjectFreeze: emitRuntimeObjectStateMutationOperation,
  runtimeObjectAssign: emitRuntimeObjectAssignOperation,
  runtimeObjectDefineDataProperty: emitRuntimeObjectDefineDataPropertyOperation,
  runtimeObjectDefineDataProperties: (operation, context) =>
    operation.descriptors.flatMap((descriptor) =>
      emitRuntimeObjectDefineDataPropertyOperation(
        { kind: "runtimeObjectDefineDataProperty", objectName: operation.objectName, descriptor },
        context
      )
    ),

  // Collection mutation.
  runtimeCollectionSetIterator: emitRuntimeCollectionMutationOperation,
  runtimeMapSet: emitRuntimeCollectionMutationOperation,
  runtimeSetAdd: emitRuntimeCollectionMutationOperation,
  runtimeMapSetResult: emitRuntimeCollectionResultOperation,
  runtimeSetAddResult: emitRuntimeCollectionResultOperation,

  // Control flow and loop control.
  switch: emitSwitchOperation,
  while: emitWhileOperation,
  doWhile: emitDoWhileOperation,
  for: emitForOperation,
  forOfArray: emitForOfArrayOperation,
  forOfString: emitForOfStringOperation,
  forOfSet: emitForOfSetOperation,
  forOfMap: emitForOfMapOperation,
  forOfProtocol: emitForOfProtocolOperation,
  arrayDestructureProtocol: emitArrayDestructureProtocolOperation,
  forInObject: emitForInObjectOperation,
  forInArray: emitForInArrayOperation,
  break: emitBreakOperation,
  continue: emitContinueOperation,
  block: emitScopedBlockOperation,
  bindingGroup: emitBindingGroupOperation,
  if: emitIfOperation,
  tryCatch: emitTryCatchOperation,

  /**
   * A function body is emitted as its own `define`, hoisted out of the statement list by
   * `emitLlvmModule`, so the statement itself contributes no lines.
   */
  function: emitHoistedFunctionOperation,

  // Calls, effects and returns.
  print: emitPrintOperation,
  throwValue: emitThrowValueOperation,
  call: emitCallOperation,
  callValue: (operation, context) => [...emitValueCallExpression(operation, context).lines],
  inlineCpp: (operation) => [`  call i64 @${operation.symbol}()`],
  returnNumber: emitNumberReturnOperation,
  returnString: emitStringReturnOperation,
  returnValue: emitValueReturnOperation,
  returnClosure: (_operation, context) => emitNormalGeneratedReturn(jsValueUndefined, context)
});
/**
 * The handler for an operation's kind.
 *
 * This is the one assertion in the emitter, and the reason is a limitation in the correlation
 * between a union-typed discriminant and the per-variant handler it selects: indexing a `Record`
 * by a union key yields a union of function types, and the parameters of that union intersect to
 * `never`, so the compiler will not accept the operation it just indexed with. What makes the
 * lookup safe is upstream of the cast — the table is checked for totality at its declaration and
 * every entry is checked against its own kind — so the (kind, handler) pair is sound by
 * construction and the assertion only re-associates the two. Widening each handler's parameter
 * to the whole union to avoid it would cost every handler the narrowed operation type, which is
 * the property that stops a handler reading a field its kind does not have.
 */
function operationEmitterFor(operation: JsIrOperation): OperationEmitter<JsIrOperation["kind"]> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- totality of the table and per-kind handler types are both checked above
  return operationEmittersByKind[operation.kind] as OperationEmitter<JsIrOperation["kind"]>;
}
export function emitOperation(operation: JsIrOperation, context: EmitContext): string[] {
  return operationEmitterFor(operation)(operation, context);
}
