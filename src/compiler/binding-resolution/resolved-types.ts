import type {
  JsIrArrayDestructureElement,
  JsIrArrayIsArrayOperand,
  JsIrClosureValue,
  JsIrCondition,
  JsIrExpression,
  JsIrNumberExpression,
  JsIrObjectAssignSource,
  JsIrObjectFieldValue,
  JsIrObjectValue,
  JsIrRuntimeArrayConcatElement,
  JsIrRuntimeArrayElement,
  JsIrRuntimeDataDescriptor,
  JsIrRuntimeObjectValue,
  JsIrStringExpression,
  JsIrSwitchClause,
  JsIrValueExpression
} from "../ir/expressions.js";
import type {
  JsIrCallArgument,
  JsIrFunctionObjectCapture,
  JsIrFunctionObjectDefinition,
  JsIrFunctionParameter,
  JsIrValueKind
} from "../ir/bindings.js";
import type { JsIrArrayMutation, JsIrDestructureSource, JsIrOperationNode } from "../ir/types.js";
import type { JsIrInlineCppBlock, JsIrLoweringMode, JsIrOperationTrace } from "../ir/module.js";
import type { BindingRef, BindingTable, FunctionId } from "./binding-id.js";
import type { ResolveTier } from "./role-tables.js";
import type { conditionRoles, expressionRoles, numberExpressionRoles, stringExpressionRoles, valueExpressionRoles } from "./expression-roles.js";
import type { operationRoles } from "./operation-roles.js";
import type { jsIrLeafOperationKinds } from "../ir/visit.js";

export type ResolvedLeafOperationKind = keyof typeof jsIrLeafOperationKinds;

export type ResolvedOperation = WithTrace<ResolveTier<JsIrOperationNode, typeof operationRoles>>;

type WithTrace<M> = M extends { readonly kind: "runtimeArrayMapFunctionObject" }
  ? M & { readonly functionId: FunctionId; readonly thisBinding?: BindingRef; readonly trace?: JsIrOperationTrace }
  : M extends { readonly kind: "function" | "returnClosure" }
  ? M & { readonly functionId: FunctionId; readonly trace?: JsIrOperationTrace }
  : M extends unknown ? M & { readonly trace?: JsIrOperationTrace } : never;

export type ResolvedValueExpression = ResolveTier<JsIrValueExpression, typeof valueExpressionRoles>;
export type ResolvedNumberExpression = ResolveTier<JsIrNumberExpression, typeof numberExpressionRoles>;
export type ResolvedStringExpression = ResolveTier<JsIrStringExpression, typeof stringExpressionRoles>;
export type ResolvedCondition = ResolveTier<JsIrCondition, typeof conditionRoles>;
export type ResolvedExpression = ResolveTier<JsIrExpression, typeof expressionRoles>;

/** A call argument, resolved. `valueKind` is a closed enumeration and survives. */
export type ResolvedCallArgument =
  | { readonly valueKind: "number"; readonly value: ResolvedNumberExpression }
  | { readonly valueKind: "string"; readonly value: ResolvedStringExpression }
  | { readonly valueKind: "value"; readonly value: ResolvedValueExpression }
  | { readonly valueKind: "undefined" };

export type ResolvedDestructureElement =
  | { readonly kind: "elision" }
  | { readonly kind: "binding"; readonly name: BindingRef; readonly defaultValue?: ResolvedValueExpression }
  | { readonly kind: "nested"; readonly temporaryName: BindingRef; readonly operations: readonly ResolvedOperation[] }
  | { readonly kind: "rest"; readonly name: BindingRef };

export type ResolvedRuntimeArrayElement =
  | { readonly kind: "hole" }
  | { readonly kind: "value"; readonly value: ResolvedValueExpression }
  | { readonly kind: "spread"; readonly arrayName: BindingRef; readonly sourceKind?: "runtime" | "fixed" }
  | { readonly kind: "iterableSpread"; readonly source: ResolvedValueExpression; readonly notIterableMessage: string };

/** One element of an `Array#concat` argument list, resolved. A fixed-array spread names a binding. */
export type ResolvedConcatElement =
  | { readonly kind: "value"; readonly value: ResolvedValueExpression }
  | { readonly kind: "fixedArraySpread"; readonly arrayName: BindingRef; readonly length: number };

/** One source of `Object.assign`, resolved. Every named source is a binding. */
export type ResolvedObjectAssignSource =
  | { readonly kind: "runtimeObject"; readonly name: BindingRef }
  | { readonly kind: "runtimeArray"; readonly name: BindingRef }
  | { readonly kind: "fixedObject"; readonly value: ResolvedObjectValue }
  | { readonly kind: "fixedArray"; readonly name: BindingRef; readonly length: number }
  | { readonly kind: "value"; readonly value: ResolvedValueExpression };

/** A `defineProperty` descriptor, resolved. Its `key` is a string expression. */
export interface ResolvedDataDescriptor {
  readonly key: ResolvedStringExpression;
  readonly value: ResolvedValueExpression;
  readonly writable: boolean;
  readonly enumerable: boolean;
  readonly configurable: boolean;
}

export type ResolvedObjectFieldValue =
  | { readonly kind: "number"; readonly value: ResolvedNumberExpression }
  | { readonly kind: "object"; readonly value: ResolvedObjectValue };

/** One field of a fixed-layout object literal, resolved. `name` is a property key and stays a string. */
export interface ResolvedObjectField {
  readonly name: string;
  readonly value: ResolvedObjectFieldValue;
}

/** A fixed-layout object literal, resolved. */
export interface ResolvedObjectValue {
  readonly fields: readonly ResolvedObjectField[];
}

/** One field of a runtime object literal, resolved. A `spread` source is a binding. */
export type ResolvedRuntimeObjectField =
  | { readonly kind: "field"; readonly key: ResolvedStringExpression; readonly value: ResolvedValueExpression }
  | { readonly kind: "spread"; readonly sourceName: BindingRef };

/** A runtime object literal, resolved. */
export interface ResolvedRuntimeObjectValue {
  readonly fields: readonly ResolvedRuntimeObjectField[];
}

export type ResolvedArrayIsArrayOperand = boolean | ResolvedValueExpression;

/** A switch clause, resolved. One clause list shares one scope, which is what JavaScript does. */
export interface ResolvedSwitchClause {
  readonly test?: ResolvedValueExpression;
  readonly operations: readonly ResolvedOperation[];
}

/** A closure value, resolved. `functionName` is generated; the captures are resolved reads. */
export interface ResolvedClosureValue {
  readonly functionId: FunctionId;
  readonly functionName: string;
  readonly captures: readonly ResolvedNumberExpression[];
}

/** A function parameter, resolved: its name is a declaration in the declaring function's frame. */
export interface ResolvedFunctionParameter {
  readonly name: BindingRef;
  readonly valueKind: JsIrValueKind;
  readonly defaultValue?: ResolvedNumberExpression;
  readonly isRest?: boolean;
  readonly isOptional?: boolean;
}

export interface ResolvedFunctionObjectCapture {
  readonly name: BindingRef;
  readonly sourceBinding?: BindingRef;
  readonly valueKind: JsIrValueKind;
  readonly value: ResolvedValueExpression;
}

interface ResolvedFunctionObjectBase {
  readonly codeName: string;
  readonly parameters: readonly ResolvedFunctionParameter[];
  readonly functionKind: "arrow" | "ordinary";
  readonly returnKind: JsIrValueKind | "void";
  readonly inferredName?: string;
}

export type ResolvedFunctionObject = ResolvedFunctionObjectBase & (
  | {
      readonly functionId: FunctionId;
      readonly body: readonly ResolvedOperation[];
      readonly thisBinding?: BindingRef;
      readonly captures?: readonly ResolvedFunctionObjectCapture[];
      readonly directTarget?: never;
    }
  | {
      readonly directTarget: BindingRef;
      readonly functionId?: never;
      readonly body?: never;
      readonly thisBinding?: never;
      readonly captures?: never;
    }
);

/** The mutation a `runtimeArrayMutatorResult` applied, resolved. */
export type ResolvedArrayMutation =
  | { readonly kind: "reverse" }
  | {
      readonly kind: "fill";
      readonly value: ResolvedValueExpression;
      readonly start?: ResolvedNumberExpression;
      readonly end?: ResolvedNumberExpression;
    }
  | {
      readonly kind: "copyWithin";
      readonly target: ResolvedNumberExpression;
      readonly start: ResolvedNumberExpression;
      readonly end?: ResolvedNumberExpression;
    };

/** What an array-destructuring protocol reads, resolved. A collection source is a binding. */
export type ResolvedDestructureSource =
  | { readonly kind: "value"; readonly value: ResolvedValueExpression }
  | { readonly kind: "collection"; readonly name: BindingRef; readonly sourceKind: "map" | "set" };

export interface ResolvedSourceModule {
  readonly fileName: string;
  readonly statementCount: number;
  readonly loweringMode: JsIrLoweringMode;
  readonly operations: readonly ResolvedOperation[];
  readonly functionObjects: readonly ResolvedFunctionObject[];
}

export interface ResolvedModule {
  readonly entry: string;
  readonly modules: readonly ResolvedSourceModule[];
  readonly inlineCppBlocks: readonly JsIrInlineCppBlock[];
  readonly bindings: BindingTable;
}

export type ResolveNested<T> =
  [undefined] extends [T]
    ? ResolveNested<Exclude<T, undefined>> | undefined
    : [T] extends [readonly (infer E)[]]
      ? readonly ResolveNestedElement<E>[]
      : ResolveNestedElement<T>;

export type ResolveNestedElement<T> =
  [T] extends [JsIrValueExpression] ? ResolvedValueExpression :
    [T] extends [JsIrNumberExpression] ? ResolvedNumberExpression :
      [T] extends [JsIrStringExpression] ? ResolvedStringExpression :
        [T] extends [JsIrCondition] ? ResolvedCondition :
          [T] extends [JsIrExpression] ? ResolvedExpression :
            [T] extends [JsIrOperationNode] ? ResolvedOperation :
              [T] extends [JsIrRuntimeArrayElement] ? ResolvedRuntimeArrayElement :
                [T] extends [JsIrRuntimeArrayConcatElement] ? ResolvedConcatElement :
                  [T] extends [JsIrObjectAssignSource] ? ResolvedObjectAssignSource :
                    [T] extends [JsIrArrayDestructureElement] ? ResolvedDestructureElement :
                      [T] extends [JsIrFunctionObjectCapture] ? ResolvedFunctionObjectCapture :
                        [T] extends [JsIrCallArgument] ? ResolvedCallArgument :
                          [T] extends [JsIrClosureValue] ? ResolvedClosureValue :
                            [T] extends [JsIrObjectValue] ? ResolvedObjectValue :
                              [T] extends [JsIrRuntimeObjectValue] ? ResolvedRuntimeObjectValue :
                                [T] extends [JsIrSwitchClause] ? ResolvedSwitchClause :
                                  [T] extends [JsIrFunctionObjectDefinition] ? ResolvedFunctionObject :
                                    [T] extends [JsIrFunctionParameter] ? ResolvedFunctionParameter :
                                      [T] extends [JsIrRuntimeDataDescriptor] ? ResolvedDataDescriptor :
                                        [T] extends [JsIrArrayMutation] ? ResolvedArrayMutation :
                                          [T] extends [JsIrDestructureSource] ? ResolvedDestructureSource :
                                            [T] extends [JsIrObjectFieldValue] ? ResolvedObjectFieldValue :
                                              IsExactly<T, JsIrArrayIsArrayOperand> extends true
                                                ? ResolvedArrayIsArrayOperand
                                                : T;

type IsExactly<T, U> = [T] extends [U] ? ([U] extends [T] ? true : false) : false;
