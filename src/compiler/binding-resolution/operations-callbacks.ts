import type { BindingRef } from "./binding-id.js";
import type { ResolvedValueExpression } from "./resolved-types.js";
import type { OperationHandlers } from "./operations.js";
import { declareFromOperation, optional, resolveDestructureElement, resolveDestructureSource, resolveFunctionParameters } from "./payloads.js";

export const callbackHandlers = {
  runtimeArrayMapCallback: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    arrayName: resolver.reference(node.arrayName),
    callbackName: resolver.reference(node.callbackName)
  }),
  runtimeArrayFlatMapCallback: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    arrayName: resolver.reference(node.arrayName),
    callbackName: resolver.reference(node.callbackName)
  }),
  runtimeArrayFilterCallback: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    arrayName: resolver.reference(node.arrayName),
    callbackName: resolver.reference(node.callbackName)
  }),
  runtimeArrayFindCallback: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    arrayName: resolver.reference(node.arrayName),
    callbackName: resolver.reference(node.callbackName)
  }),
  runtimeArrayFindIndexCallback: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    arrayName: resolver.reference(node.arrayName),
    callbackName: resolver.reference(node.callbackName)
  }),
  runtimeArrayReduceCallback: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    arrayName: resolver.reference(node.arrayName),
    callbackName: resolver.reference(node.callbackName),
    initialValue: optional(node.initialValue, resolver.value)
  }),
  runtimeArrayForEachCallback: (node, resolver) => ({
    ...node,
    arrayName: resolver.reference(node.arrayName),
    callbackName: resolver.reference(node.callbackName)
  }),
  runtimeArraySort: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    arrayName: resolver.reference(node.arrayName),
    callbackName: optional(node.callbackName, resolver.reference)
  }),

  runtimeArrayMapFunctionObject: (node, resolver) => {
    const { state } = resolver;
    const name = declareFromOperation(node.name, "const", node, resolver);
    const arrayName = resolver.reference(node.arrayName);
    const capturedValues = (node.captures ?? []).map((capture) => {
      const value = resolver.value(capture.value);
      return { capture, value, sourceBinding: directCaptureBinding(value) };
    });
    const thisArg = optional(node.thisArg, resolver.value);
    const initialValue = optional(node.initialValue, resolver.value);
    const frame = state.inFunction((functionId) => {
      const parameters = resolveFunctionParameters(node.callbackParameters, resolver);
      const thisBinding = node.callbackKind === "ordinary"
        ? state.declare("this", "parameter", { kind: "value" }) : undefined;
      const captures = capturedValues.map(({ capture, value, sourceBinding }) => {
        if (sourceBinding !== undefined) state.capture(sourceBinding);
        return { valueKind: capture.valueKind, value, sourceBinding,
          name: state.declare(capture.name, "parameter", { kind: "value" }) };
      });
      return { functionId, thisBinding, parameters, captures, body: resolver.operations(node.callbackBody) };
    });
    return {
      ...node,
      name,
      arrayName,
      functionId: frame.functionId,
      thisBinding: frame.thisBinding,
      callbackParameters: frame.parameters,
      callbackBody: frame.body,
      captures: node.captures === undefined ? undefined : frame.captures,
      thisArg,
      initialValue
    };
  },

  arrayDestructureProtocol: (node, resolver) => ({
    ...node,
    source: resolveDestructureSource(node.source, resolver),
    elements: node.elements.map((element) => resolveDestructureElement(element, resolver))
  })
} satisfies Partial<OperationHandlers>;

function directCaptureBinding(value: ResolvedValueExpression): BindingRef | undefined {
  switch (value.kind) {
    case "variable": case "arrayRef": case "objectRef": { return value.name; }
    case "number": {
      return value.value.kind === "parameter" || value.value.kind === "variable" ? value.value.name : undefined;
    }
    case "string": { return value.value.kind === "variable" ? value.value.name : undefined; }
    case "boolean": { return value.value.kind === "booleanVariable" ? value.value.name : undefined; }
    default: { return undefined; }
  }
}
