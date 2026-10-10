import type {
  JsIrArrayDestructureElement,
  JsIrClosureValue,
  JsIrObjectAssignSource,
  JsIrObjectField,
  JsIrObjectValue,
  JsIrRuntimeArrayConcatElement,
  JsIrRuntimeArrayElement,
  JsIrRuntimeDataDescriptor,
  JsIrRuntimeObjectField,
  JsIrRuntimeObjectValue,
  JsIrSwitchClause
} from "../ir/expressions.js";
import type { JsIrCallArgument, JsIrFunctionObjectDefinition, JsIrFunctionParameter } from "../ir/bindings.js";
import type { JsIrArrayMutation, JsIrDestructureSource, JsIrOperationNode } from "../ir/types.js";
import type { Resolver } from "./resolver.js";
import type {
  ResolvedArrayMutation,
  ResolvedCallArgument,
  ResolvedClosureValue,
  ResolvedConcatElement,
  ResolvedDataDescriptor,
  ResolvedDestructureElement,
  ResolvedDestructureSource,
  ResolvedFunctionObject,
  ResolvedFunctionParameter,
  ResolvedObjectAssignSource,
  ResolvedObjectField,
  ResolvedObjectValue,
  ResolvedRuntimeArrayElement,
  ResolvedRuntimeObjectField,
  ResolvedRuntimeObjectValue,
  ResolvedSwitchClause
} from "./resolved-types.js";
import type { BindingKind, BindingRef } from "./binding-id.js";
import { representationFor } from "./storage.js";

export function optional<In, Out>(value: In | undefined, resolve: (present: In) => Out): Out | undefined {
  if (value === undefined) {
    return undefined;
  }
  return resolve(value);
}

/** A parameter's representation follows the value kind the IR declared for it. */
function parameterRepresentation(valueKind: JsIrFunctionParameter["valueKind"]) {
  switch (valueKind) {
    case "number": {
      return { kind: "number" } as const;
    }
    case "string": {
      return { kind: "string" } as const;
    }
    default: {
      return { kind: "value" } as const;
    }
  }
}

export function resolveFunctionParameters(
  parameters: readonly JsIrFunctionParameter[],
  resolver: Resolver
): readonly ResolvedFunctionParameter[] {
  return parameters.map((parameter) => ({
    ...parameter,
    name: resolver.state.declare(parameter.name, "parameter", parameter.isOptional === true && parameter.defaultValue === undefined
      ? { kind: "value" } : parameterRepresentation(parameter.valueKind)),
    defaultValue: optional(parameter.defaultValue, resolver.number)
  }));
}

export function resolveFunctionObject(definition: JsIrFunctionObjectDefinition, resolver: Resolver): ResolvedFunctionObject {
  const { state } = resolver;
  const { directTarget } = definition;
  if (directTarget !== undefined) {
    return {
      codeName: definition.codeName,
      functionKind: definition.functionKind,
      returnKind: definition.returnKind,
      parameters: [],
      inferredName: definition.inferredName,
      directTarget: state.reference(directTarget),
    };
  }
  const captures = optional(definition.captures, (entries) => entries.map((capture) => ({
    valueKind: capture.valueKind,
    name: state.reference(capture.name),
    value: resolver.value(capture.value)
  })));
  return state.inFunction((functionId) => {
    const parameters = resolveFunctionParameters(definition.parameters, resolver);
    const thisBinding = definition.functionKind === "ordinary"
      ? state.declare("this", "parameter", { kind: "value" })
      : undefined;
    for (const capture of captures ?? []) {
      state.capture(capture.name);
    }
    return {
      codeName: definition.codeName,
      functionId,
      thisBinding,
      functionKind: definition.functionKind,
      returnKind: definition.returnKind,
      inferredName: definition.inferredName,
      parameters,
      captures,
      body: definition.body === undefined ? [] : resolver.operations(definition.body)
    };
  });
}

/** A call argument carries one typed expression, or nothing at all for an omitted optional parameter. */
export function resolveCallArgument(argument: JsIrCallArgument, resolver: Resolver): ResolvedCallArgument {
  switch (argument.valueKind) {
    case "number": {
      return { valueKind: "number", value: resolver.number(argument.value) };
    }
    case "string": {
      return { valueKind: "string", value: resolver.string(argument.value) };
    }
    case "value": {
      return { valueKind: "value", value: resolver.value(argument.value) };
    }
    default: {
      return { valueKind: "undefined" };
    }
  }
}

/** Resolve call arguments in source order. */
export function resolveCallArguments(
  arguments_: readonly JsIrCallArgument[],
  resolver: Resolver
): readonly ResolvedCallArgument[] {
  return arguments_.map((argument) => resolveCallArgument(argument, resolver));
}

export function resolveDestructureElement(
  element: JsIrArrayDestructureElement,
  resolver: Resolver
): ResolvedDestructureElement {
  const { state } = resolver;
  switch (element.kind) {
    case "elision": {
      return { kind: "elision" };
    }
    case "binding": {
      const { name } = element;
      return {
        kind: "binding",
        name: state.declare(name, "destination", { kind: "value" }),
        defaultValue: optional(element.defaultValue, resolver.value)
      };
    }
    case "rest": {
      return { kind: "rest", name: state.declare(element.name, "destination", { kind: "runtimeArray" }) };
    }
    default: {
      return {
        kind: "nested",
        temporaryName: state.declare(element.temporaryName, "destination", { kind: "value" }),
        operations: resolver.operations(element.operations)
      };
    }
  }
}

/** One element of a runtime array literal. A `spread` names the array being spread. */
export function resolveRuntimeArrayElement(
  element: JsIrRuntimeArrayElement,
  resolver: Resolver
): ResolvedRuntimeArrayElement {
  switch (element.kind) {
    case "hole": {
      return { kind: "hole" };
    }
    case "value": {
      return { kind: "value", value: resolver.value(element.value) };
    }
    case "spread": {
      return {
        kind: "spread",
        arrayName: resolver.reference(element.arrayName),
      };
    }
    default: {
      return {
        kind: "iterableSpread",
        source: resolver.value(element.source),
        notIterableMessage: element.notIterableMessage
      };
    }
  }
}

/** One element of an `Array#concat` argument list. A fixed-array spread names a binding. */
export function resolveConcatElement(
  element: JsIrRuntimeArrayConcatElement,
  resolver: Resolver
): ResolvedConcatElement {
  if (element.kind !== "fixedArraySpread") {
    return { kind: "value", value: resolver.value(element.value) };
  }
  return {
    kind: "fixedArraySpread",
    arrayName: resolver.reference(element.arrayName),
    length: element.length
  };
}

/** One source of `Object.assign`. Every named source but a literal is a binding. */
export function resolveObjectAssignSource(
  source: JsIrObjectAssignSource,
  resolver: Resolver
): ResolvedObjectAssignSource {
  switch (source.kind) {
    case "fixedObject": {
      return { kind: "fixedObject", value: resolveObjectValue(source.value, resolver) };
    }
    case "value": {
      return { kind: "value", value: resolver.value(source.value) };
    }
    case "runtimeObject": {
      return { kind: "runtimeObject", name: resolver.reference(source.name) };
    }
    case "runtimeArray": {
      return { kind: "runtimeArray", name: resolver.reference(source.name) };
    }
    default: {
      return {
        kind: "fixedArray",
        length: source.length,
        name: resolver.reference(source.name)
      };
    }
  }
}

export function resolveObjectField(field: JsIrObjectField, resolver: Resolver): ResolvedObjectField {
  const { value } = field;
  return value.kind === "number"
    ? { name: field.name, value: { kind: "number", value: resolver.number(value.value) } }
    : { name: field.name, value: { kind: "object", value: resolveObjectValue(value.value, resolver) } };
}

/** A fixed-layout object literal, resolved. Nested objects recurse; the field order is the layout. */
export function resolveObjectValue(value: JsIrObjectValue, resolver: Resolver): ResolvedObjectValue {
  return { fields: value.fields.map((field) => resolveObjectField(field, resolver)) };
}

/** One field of a runtime object literal: a keyed field, or a spread of a binding. */
function resolveRuntimeObjectField(field: JsIrRuntimeObjectField, resolver: Resolver): ResolvedRuntimeObjectField {
  if (field.kind === "spread") {
    return { kind: "spread", sourceName: resolver.reference(field.sourceName) };
  }
  return { kind: "field", key: resolver.string(field.key), value: resolver.value(field.value) };
}

/** A runtime object literal, resolved. */
export function resolveRuntimeObjectValue(
  value: JsIrRuntimeObjectValue,
  resolver: Resolver
): ResolvedRuntimeObjectValue {
  return { fields: value.fields.map((field) => resolveRuntimeObjectField(field, resolver)) };
}

/** A `defineProperty` descriptor. Its `key` is a string expression and stays one. */
export function resolveDataDescriptor(descriptor: JsIrRuntimeDataDescriptor, resolver: Resolver): ResolvedDataDescriptor {
  return {
    writable: descriptor.writable,
    enumerable: descriptor.enumerable,
    configurable: descriptor.configurable,
    key: resolver.string(descriptor.key),
    value: resolver.value(descriptor.value)
  };
}

/** A switch clause. `test` is absent for the `default` clause, which is not a failure. */
export function resolveSwitchClause(clause: JsIrSwitchClause, resolver: Resolver): ResolvedSwitchClause {
  return {
    test: optional(clause.test, resolver.value),
    operations: resolver.operations(clause.operations)
  };
}

/** A closure value. Its own name is generated; each capture is a number expression read from outside. */
export function resolveClosureValue(closure: JsIrClosureValue, resolver: Resolver): ResolvedClosureValue {
  return {
    functionName: closure.functionName,
    functionId: resolver.state.closureFunction(closure.functionName),
    captures: closure.captures.map((capture) => resolver.number(capture))
  };
}

/** The mutation a `runtimeArrayMutatorResult` applied. Its numeric bounds are number expressions. */
export function resolveArrayMutation(mutation: JsIrArrayMutation, resolver: Resolver): ResolvedArrayMutation {
  switch (mutation.kind) {
    case "reverse": {
      return { kind: "reverse" };
    }
    case "fill": {
      return {
        kind: "fill",
        value: resolver.value(mutation.value),
        start: optional(mutation.start, resolver.number),
        end: optional(mutation.end, resolver.number)
      };
    }
    default: {
      return {
        kind: "copyWithin",
        target: resolver.number(mutation.target),
        start: resolver.number(mutation.start),
        end: optional(mutation.end, resolver.number)
      };
    }
  }
}

/** What an array-destructuring protocol reads. A collection source is a binding the scope declared. */
export function resolveDestructureSource(source: JsIrDestructureSource, resolver: Resolver): ResolvedDestructureSource {
  if (source.kind === "value") {
    return { kind: "value", value: resolver.value(source.value) };
  }
  return {
    kind: "collection",
    sourceKind: source.sourceKind,
    name: resolver.reference(source.name)
  };
}

export function declareFromOperation(name: string, kind: BindingKind, operation: JsIrOperationNode, resolver: Resolver): BindingRef {
  const representation = representationFor(operation);
  if (representation === undefined) {
    throw new Error(`Internal compiler error: '${operation.kind}' declares '${name}' with no representation`);
  }
  return resolver.state.declareSite(operation, name, kind, representation);
}
