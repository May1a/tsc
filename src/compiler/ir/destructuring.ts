import { type Lowered, type Produced, loweredOptional, loweredPayload, notApplicable, produced, withRefusal } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import type { JsIrOperation } from "./types.js";
import { unwrapTypeOnlyExpression } from "./predicates.js";
import { iteratorErrorSubject } from "./iterator-subject.js";
import type { JsIrArrayDestructureElement, JsIrValueExpression } from "./expressions.js";
import { lowerFunctionObjectValue } from "./closures.js";
import { updateBindings } from "./binding-updates.js";

export function lowerDestructuringBinding(
  context: LoweringContext,
  pattern: ts.ArrayBindingPattern | ts.ObjectBindingPattern,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const operations: JsIrOperation[] = [];
  const working = new Map(bindings);
  if (ts.isArrayBindingPattern(pattern)) {
    const protocolResult = lowerArrayProtocolDestructuring(context, pattern, initializer, working, operations);
    if (protocolResult.kind === "unsupported") {
      return protocolResult;
    }
    const protocol = protocolResult.operation;
    if (protocol) {
      return produced({ kind: "bindingGroup", operations });
    }
  }
  const source = resolveDestructuringSource(context, initializer, working, operations, pattern.pos);
  if (source.kind !== "lowered") {
    return source;
  }
  let lowered: boolean;
  if (ts.isArrayBindingPattern(pattern)) {
    const arrayDestructuringElementsResult = lowerArrayDestructuringElements(context, pattern, source.operation, working, operations);
    if (arrayDestructuringElementsResult.kind === "unsupported") {
      return arrayDestructuringElementsResult;
    }
    lowered = arrayDestructuringElementsResult.operation;
  } else {
    const objectDestructuringElementsResult = context.lowerObjectDestructuringElements(context, pattern, source.operation, working, operations);
    if (objectDestructuringElementsResult.kind === "unsupported") {
      return objectDestructuringElementsResult;
    }
    lowered = objectDestructuringElementsResult.operation;
  }
  if (!lowered) {
    return notApplicable;
  }
  return produced({ kind: "bindingGroup", operations });
}

function lowerArrayProtocolDestructuring(
  context: LoweringContext,
  pattern: ts.ArrayBindingPattern,
  initializer: ts.Expression,
  working: Map<string, JsIrBindingValue>,
  operations: JsIrOperation[]
): Produced<boolean> {
  const unwrapped = unwrapTypeOnlyExpression(initializer);
  if (ts.isIdentifier(unwrapped) && working.get(unwrapped.text)?.kind === "array") {
    return produced(false);
  }
  let source: Extract<JsIrOperation, { readonly kind: "arrayDestructureProtocol" }>["source"] | undefined;
  if (ts.isIdentifier(unwrapped)) {
    const binding = working.get(unwrapped.text);
    if (binding?.kind === "runtimeMap" || binding?.kind === "runtimeSet") {
      const sourceKind: "map" | "set" = binding.kind === "runtimeMap" ? "map" : "set";
      source = {
        kind: "collection",
        name: binding.name,
        sourceKind
      };
    }
  }
  if (source === undefined) {
    const iterable = context.lowerValueExpression(context, unwrapped, working);
    if (iterable.kind !== "lowered") {
      return withRefusal(iterable, produced(false));
    }
    source = { kind: "value", value: iterable.operation };
  }

  return lowerArrayProtocolDestructuringFromSource(
    context, pattern,
    source,
    `${iteratorErrorSubject(initializer)} is not iterable`,
    working,
    operations
  );
}

// eslint-disable-next-line max-statements -- Recursive pattern lowering validates and records elisions, defaults, rest, and nested patterns together.
export function lowerArrayProtocolDestructuringFromSource(
  context: LoweringContext,
  pattern: ts.ArrayBindingPattern,
  source: Extract<JsIrOperation, { readonly kind: "arrayDestructureProtocol" }>["source"],
  notIterableMessage: string,
  working: Map<string, JsIrBindingValue>,
  operations: JsIrOperation[]
): Produced<boolean> {
  const elements: JsIrArrayDestructureElement[] = [];
  for (let index = 0; index < pattern.elements.length; index += 1) {
    const element = pattern.elements[index];
    if (ts.isOmittedExpression(element)) {
      elements.push({ kind: "elision" });
      continue;
    }
    if (element.dotDotDotToken !== undefined) {
      if (index !== pattern.elements.length - 1 || element.initializer !== undefined || !ts.isIdentifier(element.name)) {
        return produced(false);
      }
      elements.push({ kind: "rest", name: element.name.text });
      working.set(element.name.text, { kind: "runtimeArray", name: element.name.text });
      continue;
    }
    if (ts.isIdentifier(element.name)) {
      let defaultValue: JsIrValueExpression | undefined;
      if (element.initializer !== undefined) {
        const functionObjectValueResult = lowerFunctionObjectValue(context, element.initializer, working, element.name.text);
        if (functionObjectValueResult.kind === "unsupported") {
          return functionObjectValueResult;
        }
        const defaultResult = functionObjectValueResult.kind === "lowered"
          ? functionObjectValueResult
          : context.lowerValueExpression(context, element.initializer, working);
        if (defaultResult.kind === "unsupported") {
          return defaultResult;
        }
        defaultValue = loweredPayload(defaultResult);
        if (defaultValue === undefined) {
          return produced(false);
        }
      }
      let destructureElement: JsIrArrayDestructureElement = { kind: "binding", name: element.name.text };
      if (defaultValue !== undefined) {
        destructureElement = { kind: "binding", name: element.name.text, defaultValue };
      }
      elements.push(destructureElement);
      working.set(element.name.text, { kind: "valueVariable", name: element.name.text });
      continue;
    }
    const nestedElement = lowerNestedProtocolDestructuring(context, element, working);
    if (nestedElement.kind === "unsupported") {
      return nestedElement;
    }
    if (nestedElement.kind === "notApplicable") {
      return produced(false);
    }
    elements.push(nestedElement.operation);
  }

  const operation: JsIrOperation = { kind: "arrayDestructureProtocol", source, elements, notIterableMessage };
  operations.push(operation);
  updateBindings(operation, working);
  return produced(true);
}

export interface DestructuringSource {
  readonly name: string;
  readonly binding: JsIrBindingValue;
}

function resolveDestructuringSource(
  context: LoweringContext,
  initializer: ts.Expression,
  working: Map<string, JsIrBindingValue>,
  operations: JsIrOperation[],
  position: number
): Lowered<DestructuringSource> {
  const unwrapped = unwrapTypeOnlyExpression(initializer);
  if (ts.isIdentifier(unwrapped)) {
    const binding = working.get(unwrapped.text);
    if (binding?.kind === "runtimeArray" || binding?.kind === "array" || binding?.kind === "runtimeObject") {
      return produced({ name: binding.name, binding });
    }
    if (binding?.kind === "object") {
      return produced({ name: unwrapped.text, binding });
    }
    return notApplicable;
  }
  const temporaryName = `destructure.source.${position}`;
  const operation = context.lowerConstAggregateBinding(context, temporaryName, unwrapped, working);
  if (operation.kind !== "lowered") {
    return operation;
  }
  operations.push(operation.operation);
  updateBindings(operation.operation, working);
  const binding = working.get(temporaryName);
  if (binding === undefined) {
    return notApplicable;
  }
  return produced({ name: temporaryName, binding });
}

// eslint-disable-next-line complexity, max-statements -- Array destructuring routes fixed and runtime sources plus rest and default shapes.
export function lowerArrayDestructuringElements(
  context: LoweringContext,
  pattern: ts.ArrayBindingPattern,
  source: DestructuringSource,
  working: Map<string, JsIrBindingValue>,
  operations: JsIrOperation[],
  lazyDefaults = false
): Produced<boolean> {
  const sourceBinding = source.binding;
  if (sourceBinding.kind !== "runtimeArray" && sourceBinding.kind !== "array" && sourceBinding.kind !== "valueVariable") {
    return produced(false);
  }
  for (let index = 0; index < pattern.elements.length; index += 1) {
    const element = pattern.elements[index];
    if (ts.isOmittedExpression(element)) {
      continue;
    }
    if (!ts.isIdentifier(element.name)) {
      return produced(false);
    }
    const name = element.name.text;
    if (element.dotDotDotToken !== undefined) {
      if (sourceBinding.kind !== "runtimeArray" || index !== pattern.elements.length - 1) {
        return produced(false);
      }
      const operation: JsIrOperation = { kind: "runtimeArraySlice", name, arrayName: source.name, start: { kind: "literal", value: index } };
      operations.push(operation);
      updateBindings(operation, working);
      continue;
    }
    if (sourceBinding.kind === "array") {
      const fixedElementResult = lowerFixedArrayDestructuredElement(context, name, sourceBinding, index, element.initializer, working, operations);
      if (fixedElementResult.kind === "unsupported") {
        return fixedElementResult;
      }
      const fixedElement = fixedElementResult.operation;
      if (!fixedElement) {
        return produced(false);
      }
      continue;
    }
    if (sourceBinding.kind === "valueVariable") {
      const access: JsIrValueExpression = {
        kind: "valueArrayAccess",
        value: { kind: "variable", name: source.name },
        index: { kind: "literal", value: index },
        key: { kind: "literal", value: String(index) }
      };
      const operation = lowerDestructuredValueBinding(context, name, access, element.initializer, working, lazyDefaults);
      if (operation.kind !== "lowered") {
        return withRefusal(operation, produced(false));
      }
      operations.push(operation.operation);
      updateBindings(operation.operation, working);
      continue;
    }
    const access: JsIrValueExpression = {
      kind: "arrayAccess",
      arrayName: source.name,
      index: { kind: "literal", value: index },
      key: { kind: "literal", value: String(index) }
    };
    const operation = lowerDestructuredValueBinding(context, name, access, element.initializer, working, lazyDefaults);
    if (operation.kind !== "lowered") {
      return withRefusal(operation, produced(false));
    }
    operations.push(operation.operation);
    updateBindings(operation.operation, working);
  }
  return produced(true);
}

function lowerFixedArrayDestructuredElement(
  context: LoweringContext,
  name: string,
  sourceBinding: Extract<JsIrBindingValue, { readonly kind: "array" }>,
  index: number,
  defaultInitializer: ts.Expression | undefined,
  working: Map<string, JsIrBindingValue>,
  operations: JsIrOperation[]
): Produced<boolean> {
  const operation = lowerDestructuredFallbackOperation(
    context, name,
    index < sourceBinding.length,
    { kind: "constNumber", name, value: { kind: "arrayAccess", arrayName: sourceBinding.name, index: { kind: "literal", value: index } } },
    defaultInitializer,
    working
  );
  if (operation.kind !== "lowered") {
    return withRefusal(operation, produced(false));
  }
  operations.push(operation.operation);
  updateBindings(operation.operation, working);
  return produced(true);
}

export function lowerDestructuredValueBinding(
  context: LoweringContext,
  name: string,
  access: JsIrValueExpression,
  defaultInitializer: ts.Expression | undefined,
  working: ReadonlyMap<string, JsIrBindingValue>,
  lazyDefault = false
): Lowered {
  let value: JsIrValueExpression = access;
  let defaultIsFunction = false;
  if (defaultInitializer !== undefined) {
    const defaultValueResult = lowerFunctionObjectValue(context, defaultInitializer, working, name);
    if (defaultValueResult.kind === "unsupported") {
      return defaultValueResult;
    }
    let defaultValue = loweredPayload(defaultValueResult);
    if (defaultValue === undefined) {
      const valueExpressionResult2 = context.lowerValueExpression(context, defaultInitializer, working);
      if (valueExpressionResult2.kind === "unsupported") {
        return valueExpressionResult2;
      }
      defaultValue = loweredPayload(valueExpressionResult2);
    }
    if (defaultValue === undefined) {
      return notApplicable;
    }
    defaultIsFunction = defaultValue.kind === "functionObject";
    const defaultIsCall = ts.isCallExpression(unwrapTypeOnlyExpression(defaultInitializer));
    if (lazyDefault || defaultIsFunction || defaultIsCall) {
      value = { kind: "lazyDefault", value: access, defaultValue };
    } else {
      value = {
        kind: "ternary",
        condition: { kind: "valueComparison", operator: "===", left: access, right: { kind: "undefined" } },
        consequent: defaultValue,
        alternate: access
      };
    }
  }
  if (
    (lazyDefault && defaultInitializer !== undefined) ||
    (defaultInitializer !== undefined && ts.isCallExpression(unwrapTypeOnlyExpression(defaultInitializer))) ||
    defaultIsFunction
  ) {
    return produced({ kind: "letValue", name, value });
  }
  return produced({ kind: "constValue", name, value });
}

export function lowerDestructuredFallbackOperation(
  context: LoweringContext,
  name: string,
  hasValue: boolean,
  accessOperation: JsIrOperation,
  defaultInitializer: ts.Expression | undefined,
  working: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (hasValue) {
    return produced(accessOperation);
  }
  if (defaultInitializer !== undefined) {
    const fallbackResult = context.lowerConstVariableBinding(context, name, defaultInitializer, working);
    if (fallbackResult.kind === "unsupported") {
      return fallbackResult;
    }
    const fallback = loweredPayload(fallbackResult);
    if (fallback?.kind === "constValue" && ts.isCallExpression(unwrapTypeOnlyExpression(defaultInitializer))) {
      return produced({ kind: "letValue", name, value: fallback.value });
    }
    return loweredOptional(fallback);
  }
  return produced({ kind: "constValue", name, value: { kind: "undefined" } });
}

function lowerNestedProtocolDestructuring(
  context: LoweringContext,
  element: ts.BindingElement,
  working: Map<string, JsIrBindingValue>
): Lowered<JsIrArrayDestructureElement> {
  const temporaryName = `destructure.nested.${element.pos}`;
  const nestedWorking = new Map(working);
  nestedWorking.set(temporaryName, { kind: "valueVariable", name: temporaryName });
  const nestedOperations: JsIrOperation[] = [];
  const bindingName = element.initializer === undefined ? temporaryName : `${temporaryName}.default`;
  const nestedResult = lowerNestedBindingFromValue(
    context, element, bindingName, { kind: "variable", name: temporaryName }, nestedWorking, nestedOperations
  );
  if (nestedResult.kind === "unsupported") {
    return nestedResult;
  }
  const lowered = nestedResult.operation;
  if (!lowered) {
    return notApplicable;
  }
  const nestedElement: JsIrArrayDestructureElement = { kind: "nested", temporaryName, operations: nestedOperations };
  for (const [name, value] of nestedWorking) {
    working.set(name, value);
  }
  return produced(nestedElement);
}

/** Materialize an extracted value once, apply its lazy default, then recurse through the binding name. */
export function lowerNestedBindingFromValue(
  context: LoweringContext,
  element: ts.BindingElement,
  temporaryName: string,
  value: JsIrValueExpression,
  working: Map<string, JsIrBindingValue>,
  operations: JsIrOperation[]
): Produced<boolean> {
  // Protocol elements already have a stable incoming slot. Only property extraction or a default
  // needs another binding operation before recursion.
  if (value.kind !== "variable" || value.name !== temporaryName || element.initializer !== undefined) {
    const binding = lowerDestructuredValueBinding(
      context, temporaryName, value, element.initializer, working, element.initializer !== undefined
    );
    if (binding.kind !== "lowered") {
      return withRefusal(binding, produced(false));
    }
    operations.push(binding.operation);
    updateBindings(binding.operation, working);
  }
  if (ts.isArrayBindingPattern(element.name)) {
    return lowerArrayProtocolDestructuringFromSource(
      context, element.name, { kind: "value", value: { kind: "variable", name: temporaryName } },
      "Nested destructuring value is not iterable", working, operations
    );
  }
  if (ts.isObjectBindingPattern(element.name)) {
    return context.lowerObjectDestructuringElements(
      context, element.name, { name: temporaryName, binding: { kind: "valueVariable", name: temporaryName } },
      working, operations, true
    );
  }
  return produced(false);
}
