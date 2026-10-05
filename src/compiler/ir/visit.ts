import type { JsIrOperation } from "./types.js";

/**
 * Walking the operation tree, and the classification that makes the walk total.
 *
 * Separate from the union so that `types.ts` states the IR's shape rather than a traversal over it: every
 * other module here says what an operation *is*, and this one says how to walk a tree of them. The
 * classification travels with the walk because totality is a property of the walk — a new operation kind is
 * a compile error in the switch below until it is either listed there or added to `jsIrLeafOperationKinds`,
 * which is the check that makes "every kind is either a container or a leaf" true by construction.
 */

/**
 * IR operations whose bodies contain nested operations.
 *
 * Every other operation is a leaf: it carries no child operations, so the child walk returns an
 * empty list for it. The split is stated positively rather than inferred from a `default:`
 * branch, because a default that returns `[]` silently asserts "this variant is a leaf" — and a
 * new operation with a nested body would then be invisible to the trace map and to
 * collectRuntimeShadowObjectNames without any compile error.
 */
type JsIrContainerOperationKind =
  | "arrayDestructureProtocol"
  | "runtimeArrayMapFunctionObject"
  | "block"
  | "bindingGroup"
  | "tryCatch"
  | "if"
  | "switch"
  | "while"
  | "doWhile"
  | "forOfArray"
  | "forOfString"
  | "forOfSet"
  | "forOfMap"
  | "forOfProtocol"
  | "forInObject"
  | "forInArray"
  | "function"
  | "returnClosure"
  | "for";

/** Every operation kind that is not a container, keyed so the set is checked for completeness. */
export const jsIrLeafOperationKinds: Readonly<Record<Exclude<JsIrOperation["kind"], JsIrContainerOperationKind>, true>> = {
  "constNumber": true, "constString": true, "constStringExpression": true, "constBoolean": true, "constBooleanExpression": true,
  "constValue": true, "letValue": true, "constClosure": true, "letNumber": true, "letString": true,
  "letBoolean": true, "arrayLiteral": true, "runtimeArrayLiteral": true, "objectLiteral": true, "runtimeObjectLiteral": true,
  "runtimeObjectCreate": true, "runtimeErrorLiteral": true, "runtimeObjectKeys": true, "runtimeObjectValues": true, "runtimeObjectEntries": true,
  "runtimeObjectFromEntries": true, "runtimeObjectOwnPropertyDescriptor": true, "runtimeObjectOwnPropertyNames": true, "runtimeObjectOwnPropertyDescriptors": true, "runtimeArraySlice": true,
  "runtimeArraySplice": true, "runtimeArraySpliceStatement": true, "runtimeArrayFlat": true, "runtimeStringSplit": true, "runtimeRegexSplit": true,
  "runtimeArrayMapCallback": true, "runtimeArrayFlatMapCallback": true, "runtimeArraySort": true, "runtimeArrayFrom": true, "runtimeArrayFromValue": true,
  "runtimeArrayFromCollection": true, "runtimeArrayFilterCallback": true, "runtimeArrayConcat": true, "runtimeArrayMutatorResult": true, "runtimeObjectGetPrototype": true,
  "assignNumber": true, "assignString": true, "assignBoolean": true, "arrayStore": true, "runtimeArrayStore": true,
  "runtimeArrayNamedStore": true, "runtimeArrayDelete": true, "runtimeArrayNamedDelete": true, "runtimeArraySetLength": true, "runtimeArrayPush": true,
  "runtimeArrayUnshift": true, "runtimeArrayFill": true, "runtimeArrayReverse": true, "runtimeArrayForEachCallback": true, "runtimeArrayFindCallback": true,
  "runtimeArrayFindIndexCallback": true, "runtimeArrayReduceCallback": true, "runtimeMapNew": true, "runtimeSetNew": true, "runtimeMapFromArray": true,
  "runtimeSetFromArray": true, "runtimeMapFromIterable": true, "runtimeSetFromIterable": true, "runtimeMapFromCollection": true, "runtimeSetFromCollection": true,
  "runtimeMapSet": true, "runtimeCollectionSetIterator": true, "runtimeSetAdd": true, "runtimeMapSetResult": true, "runtimeSetAddResult": true,
  "runtimeIteratorNew": true, "runtimeArrayCopyWithin": true, "runtimeArrayPop": true, "runtimeArrayShift": true, "objectStore": true,
  "runtimeObjectStore": true, "valueObjectStore": true, "privateFieldStore": true, "valueArrayStore": true, "valueArraySetLength": true,
  "runtimeObjectDelete": true, "valueObjectDelete": true, "valueArrayDelete": true, "runtimeObjectSetPrototype": true, "valueObjectSetPrototype": true,
  "runtimeObjectPreventExtensions": true, "runtimeObjectSeal": true, "runtimeObjectFreeze": true, "runtimeObjectAssign": true, "runtimeObjectDefineDataProperty": true,
  "runtimeObjectDefineDataProperties": true, "print": true, "throwValue": true, "break": true, "continue": true,
  "call": true, "callValue": true, "inlineCpp": true, "returnNumber": true, "returnString": true,
  "returnValue": true
};

/**
 * The nested operations of `operation`, in evaluation order.
 *
 * Total over the IR union: a new operation kind is a compile error here until it is classified
 * as a container or added to `jsIrLeafOperationKinds`.
 */
// eslint-disable-next-line complexity -- One case per container operation kind; the residual is the leaf set.
export function jsIrOperationChildren(operation: JsIrOperation): readonly JsIrOperation[] {
  switch (operation.kind) {
    case "arrayDestructureProtocol": {
      return operation.elements.flatMap((element) => {
        if (element.kind === "nested") {
          return element.operations;
        }
        return [];
      });
    }
    case "runtimeArrayMapFunctionObject": {
      return operation.callbackBody;
    }
    case "block":
    case "bindingGroup": {
      return operation.operations;
    }
    case "tryCatch": {
      const children = [...operation.tryOperations];
      if (operation.hasCatch) {
        children.push(...operation.catchOperations);
      }
      if (operation.finallyOperations !== undefined) {
        children.push(...operation.finallyOperations);
      }
      return children;
    }
    case "if": {
      return [...operation.thenOperations, ...operation.elseOperations];
    }
    case "switch": {
      return operation.clauses.flatMap((clause) => clause.operations);
    }
    case "while":
    case "doWhile":
    case "forOfArray":
    case "forOfString":
    case "forOfSet":
    case "forOfMap":
    case "forOfProtocol":
    case "forInObject":
    case "forInArray":
    case "function":
    case "returnClosure": {
      return operation.body;
    }
    case "for": {
      return [...operation.initializer, ...operation.body, operation.increment];
    }
    default: {
      // The residual is exactly the leaf set. Indexing jsIrLeafOperationKinds is total by
      // construction — its type is keyed by every non-container kind — so the test below always
      // holds and the throw is unreachable. The lint warning it draws is the proof of that, so it
      // is suppressed here rather than worked around.
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- totality of the Record is the invariant
      if (!jsIrLeafOperationKinds[operation.kind]) {
        throw new Error(`Unclassified JsIrOperation leaf: ${operation.kind}`);
      }
      return [];
    }
  }
}

export function visitJsIrOperations(
  operations: readonly JsIrOperation[],
  visitor: (operation: JsIrOperation, parent: JsIrOperation | undefined) => void
): void {
  const visit = (operation: JsIrOperation, parent: JsIrOperation | undefined): void => {
    visitor(operation, parent);
    for (const child of jsIrOperationChildren(operation)) {
      visit(child, operation);
    }
  };
  for (const operation of operations) {
    visit(operation, undefined);
  }
}
