import type { JsIrCallArgument, JsIrFunctionObjectDefinition, JsIrFunctionParameter, JsIrValueKind } from "./bindings.js";
import type {
  JsIrArrayDestructureElement,
  JsIrClosureValue,
  JsIrCondition,
  JsIrExpression,
  JsIrNumberExpression,
  JsIrObjectAssignSource,
  JsIrObjectValue,
  JsIrRuntimeArrayConcatElement,
  JsIrRuntimeArrayElement,
  JsIrRuntimeDataDescriptor,
  JsIrRuntimeObjectValue,
  JsIrStringExpression,
  JsIrSwitchClause,
  JsIrValueExpression
} from "./expressions.js";
import type { JsIrOperationTrace } from "./module.js";

/**
 * The IR's operation union, and the two traversals that enumerate it.
 *
 * Every union in `ir/` is meant to enumerate every form the lowering pass can produce, so emission
 * can be total. This file is where that is checked for operations: `jsIrLeafOperationKinds` splits
 * the container operations from the leaves, and `jsIrOperationChildren` is total over the union, so
 * a new operation is a compile error in both until it is classified and walked. The emitter table in
 * `llvm.ts` is the third enumeration point.
 */
export type JsIrOperationNode =
  | {
      readonly kind: "constNumber";
      readonly name: string;
      readonly value: JsIrNumberExpression;
    }
  | {
      readonly kind: "constString";
      readonly name: string;
      readonly value: string;
    }
  | {
      readonly kind: "constStringExpression";
      readonly name: string;
      readonly value: JsIrStringExpression;
    }
  | {
      readonly kind: "constBoolean";
      readonly name: string;
      readonly value: boolean;
    }
  | {
      readonly kind: "constBooleanExpression";
      readonly name: string;
      readonly value: JsIrCondition;
    }
  | {
      readonly kind: "constValue";
      readonly name: string;
      readonly value: JsIrValueExpression;
    }
  | {
      readonly kind: "letValue";
      readonly name: string;
      readonly value: JsIrValueExpression;
      readonly moduleGlobal?: boolean;
    }
  | {
      readonly kind: "constClosure";
      readonly name: string;
      readonly value: JsIrClosureValue;
    }
  | {
      readonly kind: "letNumber";
      readonly name: string;
      readonly value: JsIrNumberExpression;
    }
  | {
      readonly kind: "letString";
      readonly name: string;
      readonly value: JsIrStringExpression;
    }
  | {
      readonly kind: "letBoolean";
      readonly name: string;
      readonly value: JsIrCondition;
    }
  | {
      readonly kind: "arrayLiteral";
      readonly name: string;
      readonly elements: readonly JsIrNumberExpression[];
    }
  | {
      readonly kind: "runtimeArrayLiteral";
      readonly name: string;
      readonly elements: readonly JsIrRuntimeArrayElement[];
    }
  | {
      readonly kind: "objectLiteral";
      readonly name: string;
      readonly value: JsIrObjectValue;
      readonly needsRuntimeShadow: boolean;
    }
  | {
      readonly kind: "runtimeObjectLiteral";
      readonly name: string;
      readonly value: JsIrRuntimeObjectValue;
    }
  | {
      readonly kind: "runtimeObjectCreate";
      readonly name: string;
      readonly prototypeName?: string;
    }
  | {
      readonly kind: "runtimeErrorLiteral";
      readonly name: string;
      readonly errorName: string;
      readonly message: JsIrValueExpression;
    }
  | {
      readonly kind: "runtimeObjectKeys";
      readonly name: string;
      readonly targetName: string;
      readonly targetKind: "object" | "array" | "value";
    }
  | {
      readonly kind: "runtimeObjectValues";
      readonly name: string;
      readonly targetName: string;
      readonly targetKind: "object" | "array" | "value";
    }
  | {
      readonly kind: "runtimeObjectEntries";
      readonly name: string;
      readonly targetName: string;
      readonly targetKind: "object" | "array" | "value";
    }
  | {
      readonly kind: "runtimeObjectFromEntries";
      readonly name: string;
      readonly entriesName: string;
    }
  | {
      readonly kind: "runtimeObjectOwnPropertyDescriptor";
      readonly name: string;
      readonly targetName: string;
      readonly targetKind: "object" | "array" | "value";
      readonly key: JsIrStringExpression;
      readonly index?: JsIrNumberExpression;
      readonly isLength?: boolean;
    }
  | {
      readonly kind: "runtimeObjectOwnPropertyNames";
      readonly name: string;
      readonly targetName: string;
      readonly targetKind: "object" | "array" | "value";
    }
  | {
      readonly kind: "runtimeObjectOwnPropertyDescriptors";
      readonly name: string;
      readonly targetName: string;
      readonly targetKind: "object" | "array" | "value";
    }
  | {
      readonly kind: "runtimeArraySlice";
      readonly name: string;
      readonly arrayName: string;
      readonly start: JsIrNumberExpression;
      readonly end?: JsIrNumberExpression;
    }
  | {
      readonly kind: "runtimeArraySplice";
      readonly name: string;
      readonly arrayName: string;
      readonly start: JsIrNumberExpression;
      readonly deleteCount?: JsIrNumberExpression;
      readonly items: readonly JsIrValueExpression[];
    }
  | {
      readonly kind: "runtimeArraySpliceStatement";
      readonly arrayName: string;
      readonly start: JsIrNumberExpression;
      readonly deleteCount?: JsIrNumberExpression;
      readonly items: readonly JsIrValueExpression[];
    }
  | {
      readonly kind: "runtimeArrayFlat";
      readonly name: string;
      readonly arrayName: string;
      readonly depth: JsIrNumberExpression;
    }
  | {
      readonly kind: "runtimeStringSplit";
      readonly name: string;
      readonly receiver: JsIrStringExpression;
      readonly separator: JsIrStringExpression;
      readonly limit?: JsIrNumberExpression;
    }
  | {
      readonly kind: "runtimeRegexSplit";
      readonly name: string;
      readonly receiver: JsIrStringExpression;
      readonly regex: JsIrValueExpression;
      readonly limit?: JsIrNumberExpression;
    }
  | {
      readonly kind: "runtimeArrayMapCallback";
      readonly name: string;
      readonly arrayName: string;
      readonly callbackName: string;
      readonly callbackParameters: readonly JsIrFunctionParameter[];
      readonly callbackReturnKind: JsIrValueKind;
    }
  | {
      readonly kind: "runtimeArrayMapFunctionObject";
      readonly method: "map" | "flatMap" | "filter" | "find" | "findIndex" | "reduce" | "reduceRight" | "forEach";
      readonly name: string;
      readonly arrayName: string;
      readonly callbackName: string;
      readonly callbackParameters: readonly JsIrFunctionParameter[];
      readonly callbackReturnKind: JsIrValueKind | "void";
      readonly callbackBody: readonly JsIrOperation[];
      readonly callbackKind: "arrow" | "ordinary";
      readonly captures?: JsIrFunctionObjectDefinition["captures"];
      readonly initialValue?: JsIrValueExpression;
      readonly direction?: "left" | "right";
      readonly thisArg?: JsIrValueExpression;
    }
  | {
      readonly kind: "runtimeArrayFlatMapCallback";
      readonly name: string;
      readonly arrayName: string;
      readonly callbackName: string;
      readonly callbackParameters: readonly JsIrFunctionParameter[];
      readonly callbackReturnKind: JsIrValueKind;
    }
  | {
      readonly kind: "runtimeArraySort";
      readonly name: string;
      readonly arrayName: string;
      readonly callbackName?: string;
      readonly callbackParameters?: readonly JsIrFunctionParameter[];
      readonly callbackReturnKind?: JsIrValueKind;
    }
  | {
      readonly kind: "runtimeArrayFrom";
      readonly name: string;
      readonly targetName: string;
      readonly targetKind: "array" | "object";
    }
  | {
      readonly kind: "runtimeArrayFromValue";
      readonly name: string;
      readonly source: JsIrValueExpression;
      readonly mapper?: JsIrValueExpression;
      readonly thisArg?: JsIrValueExpression;
    }
  | {
      readonly kind: "runtimeArrayFromCollection";
      readonly name: string;
      readonly collectionName: string;
      readonly sourceKind: "map" | "set";
      readonly iterationKind: "keys" | "values" | "entries";
      readonly mapper?: JsIrValueExpression;
      readonly thisArg?: JsIrValueExpression;
    }
  | {
      readonly kind: "runtimeArrayFilterCallback";
      readonly name: string;
      readonly arrayName: string;
      readonly callbackName: string;
      readonly callbackParameters: readonly JsIrFunctionParameter[];
      readonly callbackReturnKind: JsIrValueKind;
    }
  | {
      readonly kind: "runtimeArrayConcat";
      readonly name: string;
      readonly leftName: string;
      readonly values: readonly JsIrRuntimeArrayConcatElement[];
    }
  | {
      readonly kind: "runtimeArrayMutatorResult";
      readonly name: string;
      readonly arrayName: string;
      readonly mutation:
        | { readonly kind: "reverse" }
        | { readonly kind: "fill"; readonly value: JsIrValueExpression; readonly start?: JsIrNumberExpression; readonly end?: JsIrNumberExpression }
        | { readonly kind: "copyWithin"; readonly target: JsIrNumberExpression; readonly start: JsIrNumberExpression; readonly end?: JsIrNumberExpression };
    }
  | {
      readonly kind: "runtimeObjectGetPrototype";
      readonly name: string;
      readonly targetName: string;
      readonly targetKind: "object" | "array";
    }
  | {
      readonly kind: "assignNumber";
      readonly name: string;
      readonly value: JsIrNumberExpression;
    }
  | {
      readonly kind: "assignString";
      readonly name: string;
      readonly value: JsIrStringExpression;
    }
  | {
      readonly kind: "assignBoolean";
      readonly name: string;
      readonly value: JsIrCondition;
    }
  | {
      readonly kind: "arrayStore";
      readonly arrayName: string;
      readonly index: JsIrNumberExpression;
      readonly value: JsIrNumberExpression;
    }
  | {
      readonly kind: "runtimeArrayStore";
      readonly arrayName: string;
      readonly index: JsIrNumberExpression;
      readonly value: JsIrValueExpression;
    }
  | {
      readonly kind: "runtimeArrayNamedStore";
      readonly arrayName: string;
      readonly key: JsIrStringExpression;
      readonly value: JsIrValueExpression;
    }
  | {
      readonly kind: "runtimeArrayDelete";
      readonly arrayName: string;
      readonly index: JsIrNumberExpression;
    }
  | {
      readonly kind: "runtimeArrayNamedDelete";
      readonly arrayName: string;
      readonly key: JsIrStringExpression;
    }
  | {
      readonly kind: "runtimeArraySetLength";
      readonly arrayName: string;
      readonly length: JsIrNumberExpression;
    }
  | {
      readonly kind: "runtimeArrayPush" | "runtimeArrayUnshift";
      readonly arrayName: string;
      readonly values: readonly JsIrValueExpression[];
    }
  | {
      readonly kind: "runtimeArrayFill";
      readonly arrayName: string;
      readonly value: JsIrValueExpression;
      readonly start?: JsIrNumberExpression;
      readonly end?: JsIrNumberExpression;
    }
  | {
      readonly kind: "runtimeArrayReverse";
      readonly arrayName: string;
    }
  | {
      readonly kind: "runtimeArrayForEachCallback";
      readonly arrayName: string;
      readonly callbackName: string;
      readonly callbackParameters: readonly JsIrFunctionParameter[];
      readonly callbackReturnKind: JsIrValueKind | "void";
    }
  | {
      readonly kind: "runtimeArrayFindCallback";
      readonly name: string;
      readonly arrayName: string;
      readonly callbackName: string;
      readonly callbackParameters: readonly JsIrFunctionParameter[];
      readonly callbackReturnKind: JsIrValueKind;
    }
  | {
      readonly kind: "runtimeArrayFindIndexCallback";
      readonly name: string;
      readonly arrayName: string;
      readonly callbackName: string;
      readonly callbackParameters: readonly JsIrFunctionParameter[];
      readonly callbackReturnKind: JsIrValueKind;
    }
  | {
      readonly kind: "runtimeArrayReduceCallback";
      readonly name: string;
      readonly arrayName: string;
      readonly callbackName: string;
      readonly callbackParameters: readonly JsIrFunctionParameter[];
      readonly callbackReturnKind: JsIrValueKind;
      readonly initialValue?: JsIrValueExpression;
      readonly direction: "left" | "right";
    }
  | {
      readonly kind: "runtimeMapNew" | "runtimeSetNew";
      readonly name: string;
    }
  | {
      readonly kind: "runtimeMapFromArray" | "runtimeSetFromArray";
      readonly name: string;
      readonly sourceName: string;
    }
  | {
      readonly kind: "runtimeMapFromIterable" | "runtimeSetFromIterable";
      readonly name: string;
      readonly iterable: JsIrValueExpression;
      readonly notIterableMessage: string;
    }
  | {
      readonly kind: "runtimeMapFromCollection" | "runtimeSetFromCollection";
      readonly name: string;
      readonly sourceName: string;
      readonly sourceKind: "map" | "set";
    }
  | {
      readonly kind: "runtimeMapSet";
      readonly mapName: string;
      readonly key: JsIrValueExpression;
      readonly value: JsIrValueExpression;
    }
  | {
      readonly kind: "runtimeCollectionSetIterator";
      readonly collectionName: string;
      readonly value: JsIrValueExpression;
    }
  | {
      readonly kind: "runtimeSetAdd";
      readonly setName: string;
      readonly value: JsIrValueExpression;
    }
  | {
      readonly kind: "runtimeMapSetResult";
      readonly name: string;
      readonly mapName: string;
      readonly key: JsIrValueExpression;
      readonly value: JsIrValueExpression;
    }
  | {
      readonly kind: "runtimeSetAddResult";
      readonly name: string;
      readonly setName: string;
      readonly value: JsIrValueExpression;
    }
  | {
      readonly kind: "runtimeIteratorNew";
      readonly name: string;
      readonly collectionName: string;
      readonly sourceKind: "map" | "set";
      readonly iterationKind: "keys" | "values" | "entries";
      readonly observeOverride?: boolean;
    }
  | {
      readonly kind: "runtimeArrayCopyWithin";
      readonly arrayName: string;
      readonly target: JsIrNumberExpression;
      readonly start: JsIrNumberExpression;
      readonly end?: JsIrNumberExpression;
    }
  | {
      readonly kind: "runtimeArrayPop" | "runtimeArrayShift";
      readonly arrayName: string;
    }
  | {
      readonly kind: "objectStore";
      readonly objectName: string;
      readonly path: readonly string[];
      readonly value: JsIrNumberExpression;
    }
  | {
      readonly kind: "runtimeObjectStore";
      readonly objectName: string;
      readonly key: JsIrStringExpression;
      readonly value: JsIrValueExpression;
    }
  | {
      readonly kind: "valueObjectStore";
      readonly targetName: string;
      readonly key: JsIrStringExpression;
      readonly value: JsIrValueExpression;
    }
  | {
      // Write to a private class field (`recv.#x = v`): brand-checks the
      // receiver's own properties for the class-mangled storage key and throws
      // the given TypeError message when the brand is absent.
      readonly kind: "privateFieldStore";
      readonly targetName: string;
      readonly key: string;
      readonly value: JsIrValueExpression;
      readonly message: string;
    }
  | {
      readonly kind: "valueArrayStore";
      readonly targetName: string;
      readonly index: JsIrNumberExpression;
      readonly value: JsIrValueExpression;
    }
  | {
      readonly kind: "valueArraySetLength";
      readonly targetName: string;
      readonly length: JsIrNumberExpression;
    }
  | {
      readonly kind: "runtimeObjectDelete";
      readonly objectName: string;
      readonly key: JsIrStringExpression;
    }
  | {
      readonly kind: "valueObjectDelete";
      readonly targetName: string;
      readonly key: JsIrStringExpression;
    }
  | {
      readonly kind: "valueArrayDelete";
      readonly targetName: string;
      readonly index: JsIrNumberExpression;
    }
  | {
      readonly kind: "runtimeObjectSetPrototype";
      readonly targetName: string;
      readonly targetKind: "object" | "array";
      readonly prototypeName?: string;
    }
  | {
      readonly kind: "valueObjectSetPrototype";
      readonly targetName: string;
      readonly prototypeName: string;
    }
  | {
      readonly kind: "runtimeObjectPreventExtensions" | "runtimeObjectSeal" | "runtimeObjectFreeze";
      readonly objectName: string;
    }
  | {
      readonly kind: "runtimeObjectAssign";
      readonly targetName: string;
      readonly sources: readonly JsIrObjectAssignSource[];
    }
  | {
      readonly kind: "runtimeObjectDefineDataProperty";
      readonly objectName: string;
      readonly descriptor: JsIrRuntimeDataDescriptor;
    }
  | {
      readonly kind: "runtimeObjectDefineDataProperties";
      readonly objectName: string;
      readonly descriptors: readonly JsIrRuntimeDataDescriptor[];
    }
  | {
      readonly kind: "print";
      readonly expression: JsIrExpression;
    }
  | {
      readonly kind: "throwValue";
      readonly value: JsIrValueExpression;
    }
  | {
      readonly kind: "block";
      readonly operations: readonly JsIrOperation[];
    }
  | {
      readonly kind: "tryCatch";
      readonly tryOperations: readonly JsIrOperation[];
      readonly catchVariable: string;
      readonly catchOperations: readonly JsIrOperation[];
      readonly hasCatch: boolean;
      readonly finallyOperations?: readonly JsIrOperation[];
    }
  | {
      readonly kind: "bindingGroup";
      readonly operations: readonly JsIrOperation[];
    }
  | {
      readonly kind: "if";
      readonly condition: JsIrCondition;
      readonly thenOperations: readonly JsIrOperation[];
      readonly elseOperations: readonly JsIrOperation[];
    }
  | {
      readonly kind: "switch";
      readonly expression: JsIrValueExpression;
      readonly clauses: readonly JsIrSwitchClause[];
    }
  | {
      readonly kind: "while";
      readonly condition: JsIrCondition;
      readonly body: readonly JsIrOperation[];
    }
  | {
      readonly kind: "doWhile";
      readonly condition: JsIrCondition;
      readonly body: readonly JsIrOperation[];
    }
  | {
      readonly kind: "for";
      /**
       * The `for` initializer's declarations, in source order. A list because the initializer is a
       * declaration list: `for (let i = 0, j = 1;;)` declares two bindings, and dropping all but the
       * first would change which names the condition and body can see.
       */
      readonly initializer: readonly JsIrOperation[];
      readonly condition: JsIrCondition;
      readonly increment: JsIrOperation;
      readonly body: readonly JsIrOperation[];
    }
  | {
      readonly kind: "forOfArray";
      readonly itemName: string;
      readonly arrayName: string;
      readonly body: readonly JsIrOperation[];
    }
  | {
      readonly kind: "forOfString";
      readonly itemName: string;
      readonly source: JsIrStringExpression;
      readonly body: readonly JsIrOperation[];
    }
  | {
      readonly kind: "forOfSet";
      readonly itemName: string;
      readonly setName: string;
      readonly body: readonly JsIrOperation[];
    }
  | {
      readonly kind: "forOfMap";
      readonly itemName: string;
      readonly mapName: string;
      readonly body: readonly JsIrOperation[];
    }
  | {
      readonly kind: "forOfProtocol";
      readonly itemName: string;
      readonly iterable: JsIrValueExpression;
      readonly notIterableMessage: string;
      readonly body: readonly JsIrOperation[];
    }
  | {
      readonly kind: "arrayDestructureProtocol";
      readonly source:
        | { readonly kind: "value"; readonly value: JsIrValueExpression }
        | { readonly kind: "collection"; readonly name: string; readonly sourceKind: "map" | "set" };
      readonly elements: readonly JsIrArrayDestructureElement[];
      readonly notIterableMessage: string;
    }
  | {
      readonly kind: "forInObject";
      readonly itemName: string;
      readonly objectName: string;
      readonly body: readonly JsIrOperation[];
    }
  | {
      readonly kind: "forInArray";
      readonly itemName: string;
      readonly arrayName: string;
      readonly body: readonly JsIrOperation[];
    }
  | {
      readonly kind: "break";
    }
  | {
      readonly kind: "continue";
    }
  | {
      readonly kind: "function";
      readonly name: string;
      readonly parameters: readonly JsIrFunctionParameter[];
      readonly body: readonly JsIrOperation[];
      readonly enclosingCaptureNames?: readonly string[];
      readonly constructibleByObjectReturn?: boolean;
    }
  | {
      readonly kind: "call";
      readonly name: string;
      readonly arguments: readonly JsIrCallArgument[];
    }
  | {
      readonly kind: "callValue";
      readonly callee: JsIrValueExpression;
      readonly arguments: readonly JsIrCallArgument[];
      readonly thisValue?: JsIrValueExpression;
      /** An ECMAScript optional call, `callee?.(...)`. See the value-expression form. */
      readonly optionalCallee?: true;
    }
  | {
      readonly kind: "inlineCpp";
      readonly symbol: string;
    }
  | {
      readonly kind: "returnNumber";
      readonly expression: JsIrNumberExpression;
    }
  | {
      readonly kind: "returnString";
      readonly expression: JsIrStringExpression;
    }
  | {
      readonly kind: "returnValue";
      readonly expression: JsIrValueExpression;
    }
  | {
      readonly kind: "returnClosure";
      readonly functionName: string;
      readonly parameters: readonly string[];
      readonly captures: readonly string[];
      readonly body: readonly JsIrOperation[];
    };

export type JsIrOperation = JsIrOperationNode & {
  readonly trace?: JsIrOperationTrace;
};

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
const jsIrLeafOperationKinds: Readonly<Record<Exclude<JsIrOperation["kind"], JsIrContainerOperationKind>, true>> = {
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
