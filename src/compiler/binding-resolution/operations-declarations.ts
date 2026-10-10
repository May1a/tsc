import type { OperationHandlers } from "./operations.js";
import {
  declareFromOperation,
  optional,
  resolveArrayMutation,
  resolveClosureValue,
  resolveConcatElement,
  resolveObjectValue,
  resolveRuntimeArrayElement,
  resolveRuntimeObjectValue
} from "./payloads.js";

export const declarationHandlers = {
  requireObjectCoercible: (node, resolver) => ({ ...node, value: resolver.value(node.value) }),

  constNumber: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    value: resolver.number(node.value)
  }),
  constString: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver)
  }),
  constStringExpression: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    value: resolver.string(node.value)
  }),
  constBoolean: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver)
  }),
  constBooleanExpression: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    value: resolver.condition(node.value)
  }),
  constValue: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    value: resolver.value(node.value)
  }),
  letValue: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "let", node, resolver),
    value: resolver.value(node.value)
  }),
  constClosure: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    value: resolveClosureValue(node.value, resolver)
  }),
  letNumber: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "let", node, resolver),
    value: resolver.number(node.value)
  }),
  letString: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "let", node, resolver),
    value: resolver.string(node.value)
  }),
  letBoolean: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "let", node, resolver),
    value: resolver.condition(node.value)
  }),

  arrayLiteral: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    elements: node.elements.map((element) => resolver.number(element))
  }),
  runtimeArrayLiteral: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    elements: node.elements.map((element) => resolveRuntimeArrayElement(element, resolver))
  }),
  objectLiteral: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    value: resolveObjectValue(node.value, resolver)
  }),
  runtimeObjectLiteral: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    value: resolveRuntimeObjectValue(node.value, resolver)
  }),
  runtimeObjectCreate: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    prototypeName: optional(node.prototypeName, resolver.reference)
  }),
  runtimeErrorLiteral: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    message: resolver.value(node.message)
  }),

  runtimeObjectKeys: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    targetName: resolver.reference(node.targetName)
  }),
  runtimeObjectValues: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    targetName: resolver.reference(node.targetName)
  }),
  runtimeObjectEntries: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    targetName: resolver.reference(node.targetName)
  }),
  runtimeObjectFromEntries: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    entriesName: resolver.reference(node.entriesName)
  }),
  runtimeObjectOwnPropertyDescriptor: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    targetName: resolver.reference(node.targetName),
    key: resolver.string(node.key),
    index: optional(node.index, resolver.number)
  }),
  runtimeObjectOwnPropertyNames: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    targetName: resolver.reference(node.targetName)
  }),
  runtimeObjectOwnPropertyDescriptors: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    targetName: resolver.reference(node.targetName)
  }),

  runtimeArraySlice: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    arrayName: resolver.reference(node.arrayName),
    start: resolver.number(node.start),
    end: optional(node.end, resolver.number)
  }),
  runtimeArraySplice: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    arrayName: resolver.reference(node.arrayName),
    start: resolver.number(node.start),
    items: node.items.map((item) => resolver.value(item)),
    deleteCount: optional(node.deleteCount, resolver.number)
  }),
  runtimeArraySpliceStatement: (node, resolver) => ({
    ...node,
    arrayName: resolver.reference(node.arrayName),
    start: resolver.number(node.start),
    items: node.items.map((item) => resolver.value(item)),
    deleteCount: optional(node.deleteCount, resolver.number)
  }),
  runtimeArrayFlat: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    arrayName: resolver.reference(node.arrayName),
    depth: resolver.number(node.depth)
  }),
  runtimeStringSplit: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    receiver: resolver.string(node.receiver),
    separator: resolver.string(node.separator),
    limit: optional(node.limit, resolver.number)
  }),
  runtimeRegexSplit: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    receiver: resolver.string(node.receiver),
    regex: resolver.value(node.regex),
    limit: optional(node.limit, resolver.number)
  }),

  runtimeArrayFrom: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    targetName: resolver.reference(node.targetName)
  }),
  runtimeArrayFromValue: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    source: resolver.value(node.source),
    mapper: optional(node.mapper, resolver.value),
    thisArg: optional(node.thisArg, resolver.value)
  }),
  runtimeArrayFromCollection: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    collectionName: resolver.reference(node.collectionName),
    mapper: optional(node.mapper, resolver.value),
    thisArg: optional(node.thisArg, resolver.value)
  }),
  runtimeArrayConcat: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    leftName: resolver.reference(node.leftName),
    values: node.values.map((element) => resolveConcatElement(element, resolver))
  }),
  runtimeArrayMutatorResult: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    arrayName: resolver.reference(node.arrayName),
    mutation: resolveArrayMutation(node.mutation, resolver)
  }),
  runtimeObjectGetPrototype: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    targetName: resolver.reference(node.targetName)
  })
} satisfies Partial<OperationHandlers>;
