import { type Lowered, loweredPayload, notApplicable, produced } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import { lowerRuntimeObjectEntriesBinding, lowerRuntimeObjectFromEntriesBinding } from "./builtins/object-producers.js";
import { lowerRuntimeArrayConcatBinding, lowerRuntimeArrayFlatBinding, lowerRuntimeArrayMutatorResultBinding, lowerRuntimeArraySliceBinding, lowerRuntimeArraySpliceBinding } from "./array-bindings.js";
import { lowerArrayCallbackBinding, lowerRuntimeArrayCallbackBinding } from "./array-callbacks.js";
import type { JsIrNumberExpression, JsIrRuntimeArrayElement, JsIrStringExpression, JsIrValueExpression } from "./expressions.js";
import { isRegexExpression } from "./regex-predicates.js";

const sortCallbackArgumentCount = 2;

const arrayFromArgumentCount = 3;

// eslint-disable-next-line max-statements -- Runtime aggregate built-in routing is centralized during roadmap expansion.
export function lowerRuntimeAggregateExpansionBinding(
  context: LoweringContext,
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const objectEntries = lowerRuntimeObjectEntriesBinding(name, initializer, bindings);
  if (objectEntries.kind !== "notApplicable") {
    return objectEntries;
  }
  const fromEntries = lowerRuntimeObjectFromEntriesBinding(name, initializer, bindings);
  if (fromEntries.kind !== "notApplicable") {
    return fromEntries;
  }
  const slice = lowerRuntimeArraySliceBinding(context, name, initializer, bindings);
  if (slice.kind !== "notApplicable") {
    return slice;
  }
  const concat = lowerRuntimeArrayConcatBinding(context, name, initializer, bindings);
  if (concat.kind !== "notApplicable") {
    return concat;
  }
  const splice = lowerRuntimeArraySpliceBinding(context, name, initializer, bindings);
  if (splice.kind !== "notApplicable") {
    return splice;
  }
  const flat = lowerRuntimeArrayFlatBinding(context, name, initializer, bindings);
  if (flat.kind !== "notApplicable") {
    return flat;
  }
  const arrayStatic = lowerRuntimeArrayStaticBinding(context, name, initializer, bindings);
  if (arrayStatic.kind !== "notApplicable") {
    return arrayStatic;
  }
  const split = lowerRuntimeStringSplitBinding(context, name, initializer, bindings);
  if (split.kind !== "notApplicable") {
    return split;
  }
  const callback = lowerRuntimeArrayCallbackBinding(context, name, initializer, bindings);
  if (callback.kind !== "notApplicable") {
    return callback;
  }
  const mutator = lowerRuntimeArrayMutatorResultBinding(context, name, initializer, bindings);
  if (mutator.kind !== "notApplicable") {
    return mutator;
  }
  const sort = lowerRuntimeArraySortBinding(name, initializer, bindings);
  if (sort.kind !== "notApplicable") {
    return sort;
  }
  return notApplicable;
}

// eslint-disable-next-line complexity, max-statements -- Array static routing distinguishes value, aggregate, and collection source representations.
function lowerRuntimeArrayStaticBinding(
  context: LoweringContext,
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!ts.isCallExpression(initializer) || !ts.isPropertyAccessExpression(initializer.expression) || !ts.isIdentifier(initializer.expression.expression) || initializer.expression.expression.text !== "Array") {
    return notApplicable;
  }
  const method = initializer.expression.name.text;
  if (method === "of") {
    const elements: JsIrRuntimeArrayElement[] = [];
    for (const argument of initializer.arguments) {
      const value = context.lowerValueExpression(context, argument, bindings);
      if (value.kind !== "lowered") {
        return value;
      }
      elements.push({ kind: "value", value: value.operation });
    }
    return produced({ kind: "runtimeArrayLiteral", name, elements });
  }
  if (method !== "from" || initializer.arguments.length === 0 || initializer.arguments.length > arrayFromArgumentCount) {
    return notApplicable;
  }
  const [sourceExpression] = initializer.arguments;
  const callbacks = lowerArrayFromCallbacks(context, initializer.arguments, bindings);
  if (callbacks.kind !== "lowered") {
    return callbacks;
  }
  const { mapper, thisArg } = callbacks.operation;
  // Prefer the protocol path for every supported value so Symbol.iterator overrides
  // are observed before any array-like fallback inside the runtime helper.
  const source = context.lowerValueExpression(context, sourceExpression, bindings);
  if (source.kind === "unsupported") {
    return source;
  }
  if (source.kind === "lowered") {
    return produced({ kind: "runtimeArrayFromValue", name, source: source.operation, mapper, thisArg });
  }
  if (!ts.isIdentifier(sourceExpression)) {
    return notApplicable;
  }
  const targetName = sourceExpression.text;
  const target = bindings.get(targetName);
  if (target?.kind === "runtimeArray") {
    return produced({ kind: "runtimeArrayFrom", name, targetName, targetKind: "array" });
  }
  if (target?.kind === "runtimeObject") {
    return produced({ kind: "runtimeArrayFrom", name, targetName, targetKind: "object" });
  }
  if (target?.kind === "runtimeMap") {
    return produced({ kind: "runtimeArrayFromCollection", name, collectionName: target.name, sourceKind: "map", iterationKind: "entries", mapper, thisArg });
  }
  if (target?.kind === "runtimeSet") {
    return produced({ kind: "runtimeArrayFromCollection", name, collectionName: target.name, sourceKind: "set", iterationKind: "values", mapper, thisArg });
  }
  return notApplicable;
}

function lowerArrayFromCallbacks(
  context: LoweringContext,
  arguments_: ts.NodeArray<ts.Expression>,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<{ readonly mapper?: JsIrValueExpression; readonly thisArg?: JsIrValueExpression }> {
  const mapperExpression = arguments_.at(1);
  const thisArgExpression = arguments_.at(2);
  let mapper: JsIrValueExpression | undefined;
  if (mapperExpression !== undefined) {
    const valueExpressionResult = context.lowerValueExpression(context, mapperExpression, bindings);
    if (valueExpressionResult.kind === "unsupported") {
      return valueExpressionResult;
    }
    mapper = loweredPayload(valueExpressionResult);
  }
  if (mapperExpression !== undefined && mapper === undefined) {
    return notApplicable;
  }
  let thisArg: JsIrValueExpression | undefined;
  if (thisArgExpression !== undefined) {
    const valueExpressionResult2 = context.lowerValueExpression(context, thisArgExpression, bindings);
    if (valueExpressionResult2.kind === "unsupported") {
      return valueExpressionResult2;
    }
    thisArg = loweredPayload(valueExpressionResult2);
  }
  if (thisArgExpression !== undefined && thisArg === undefined) {
    return notApplicable;
  }
  return produced({ mapper, thisArg });
}

function lowerRuntimeArraySortBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!ts.isCallExpression(initializer) || !ts.isPropertyAccessExpression(initializer.expression) || !ts.isIdentifier(initializer.expression.expression)) {
    return notApplicable;
  }
  const arrayName = initializer.expression.expression.text;
  if (initializer.expression.name.text !== "sort" || bindings.get(arrayName)?.kind !== "runtimeArray" || initializer.arguments.length > 1) {
    return notApplicable;
  }
  if (initializer.arguments.length === 0) {
    return produced({ kind: "runtimeArraySort", name, arrayName });
  }
  const [callback] = initializer.arguments;
  if (!ts.isIdentifier(callback)) {
    return notApplicable;
  }
  const callbackBindingResult = lowerArrayCallbackBinding(callback.text, bindings, sortCallbackArgumentCount);
  if (callbackBindingResult.kind === "unsupported") {
    return callbackBindingResult;
  }
  const callbackBinding = loweredPayload(callbackBindingResult);
  if (callbackBinding === undefined || callbackBinding.returnKind === "void") {
    return notApplicable;
  }
  return produced({ kind: "runtimeArraySort", name, arrayName, callbackName: callback.text, callbackParameters: callbackBinding.parameters, callbackReturnKind: callbackBinding.returnKind });
}

function lowerRuntimeStringSplitBinding(
  context: LoweringContext,
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!ts.isCallExpression(initializer) || !ts.isPropertyAccessExpression(initializer.expression) || initializer.expression.name.text !== "split") {
    return notApplicable;
  }
  if (initializer.arguments.length !== 1 && initializer.arguments.length !== 2) {
    return notApplicable;
  }
  const receiverResult = context.lowerStringRuntimeExpression(context, initializer.expression.expression, bindings);
  if (receiverResult.kind === "unsupported") {
    return receiverResult;
  }
  const receiver = loweredPayload(receiverResult);
  if (receiver !== undefined && isRegexExpression(initializer.arguments[0], bindings)) {
    return lowerRegexSplitBinding(context, name, receiver, initializer, bindings);
  }
  const separatorResult = context.lowerStringRuntimeExpression(context, initializer.arguments[0], bindings);
  if (separatorResult.kind === "unsupported") {
    return separatorResult;
  }
  const separator = loweredPayload(separatorResult);
  if (receiver === undefined || separator === undefined) {
    return notApplicable;
  }
  let limit: JsIrNumberExpression | undefined;
  if (initializer.arguments.length === 2) {
    const numberExpressionResult = context.lowerNumberExpression(context, initializer.arguments[1], bindings);
    if (numberExpressionResult.kind === "unsupported") {
      return numberExpressionResult;
    }
    limit = loweredPayload(numberExpressionResult);
    if (limit === undefined) {
      return notApplicable;
    }
  }
  return produced({ kind: "runtimeStringSplit", name, receiver, separator, limit });
}

function lowerRegexSplitBinding(
  context: LoweringContext,
  name: string,
  receiver: JsIrStringExpression,
  initializer: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const regex = context.lowerValueExpression(context, initializer.arguments[0], bindings);
  if (regex.kind !== "lowered") {
    return regex;
  }
  let limit: JsIrNumberExpression | undefined;
  if (initializer.arguments.length === 2) {
    const numberExpressionResult2 = context.lowerNumberExpression(context, initializer.arguments[1], bindings);
    if (numberExpressionResult2.kind === "unsupported") {
      return numberExpressionResult2;
    }
    limit = loweredPayload(numberExpressionResult2);
    if (limit === undefined) {
      return notApplicable;
    }
  }
  if (limit === undefined) {
    return produced({ kind: "runtimeRegexSplit", name, receiver, regex: regex.operation });
  }
  return produced({ kind: "runtimeRegexSplit", name, receiver, regex: regex.operation, limit });
}
