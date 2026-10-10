import type { OperationHandlers } from "./operations.js";
import { declareFromOperation, optional, resolveDataDescriptor, resolveObjectAssignSource } from "./payloads.js";

export const aggregateHandlers = {
  // An assignment names an existing binding, so it references rather than declaring.
  assignNumber: (node, resolver) => ({ ...node, name: resolver.reference(node.name), value: resolver.number(node.value) }),
  assignString: (node, resolver) => ({ ...node, name: resolver.reference(node.name), value: resolver.string(node.value) }),
  assignBoolean: (node, resolver) => ({
    ...node,
    name: resolver.reference(node.name),
    value: resolver.condition(node.value)
  }),

  arrayStore: (node, resolver) => ({
    ...node,
    arrayName: resolver.reference(node.arrayName),
    index: resolver.number(node.index),
    value: resolver.number(node.value)
  }),
  runtimeArrayStore: (node, resolver) => ({
    ...node,
    arrayName: resolver.reference(node.arrayName),
    index: resolver.number(node.index),
    value: resolver.value(node.value)
  }),
  runtimeArrayNamedStore: (node, resolver) => ({
    ...node,
    arrayName: resolver.reference(node.arrayName),
    key: resolver.string(node.key),
    value: resolver.value(node.value)
  }),
  runtimeArrayDelete: (node, resolver) => ({
    ...node,
    arrayName: resolver.reference(node.arrayName),
    index: resolver.number(node.index)
  }),
  runtimeArrayNamedDelete: (node, resolver) => ({
    ...node,
    arrayName: resolver.reference(node.arrayName),
    key: resolver.string(node.key)
  }),
  runtimeArraySetLength: (node, resolver) => ({
    ...node,
    arrayName: resolver.reference(node.arrayName),
    length: resolver.number(node.length)
  }),
  runtimeArrayPush: (node, resolver) => ({
    ...node,
    arrayName: resolver.reference(node.arrayName),
    values: node.values.map((value) => resolver.value(value))
  }),
  runtimeArrayUnshift: (node, resolver) => ({
    ...node,
    arrayName: resolver.reference(node.arrayName),
    values: node.values.map((value) => resolver.value(value))
  }),
  runtimeArrayFill: (node, resolver) => ({
    ...node,
    arrayName: resolver.reference(node.arrayName),
    value: resolver.value(node.value),
    start: optional(node.start, resolver.number),
    end: optional(node.end, resolver.number)
  }),
  runtimeArrayReverse: (node, resolver) => ({
    ...node,
    arrayName: resolver.reference(node.arrayName)
  }),
  runtimeArrayCopyWithin: (node, resolver) => ({
    ...node,
    arrayName: resolver.reference(node.arrayName),
    target: resolver.number(node.target),
    start: resolver.number(node.start),
    end: optional(node.end, resolver.number)
  }),
  runtimeArrayPop: (node, resolver) => ({
    ...node,
    arrayName: resolver.reference(node.arrayName)
  }),
  runtimeArrayShift: (node, resolver) => ({
    ...node,
    arrayName: resolver.reference(node.arrayName)
  }),

  runtimeMapNew: (node, resolver) => ({ ...node, name: declareFromOperation(node.name, "const", node, resolver) }),
  runtimeSetNew: (node, resolver) => ({ ...node, name: declareFromOperation(node.name, "const", node, resolver) }),
  runtimeMapFromArray: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    sourceName: resolver.reference(node.sourceName)
  }),
  runtimeSetFromArray: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    sourceName: resolver.reference(node.sourceName)
  }),
  runtimeMapFromIterable: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    iterable: resolver.value(node.iterable)
  }),
  runtimeSetFromIterable: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    iterable: resolver.value(node.iterable)
  }),
  runtimeMapFromCollection: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    sourceName: resolver.reference(node.sourceName)
  }),
  runtimeSetFromCollection: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    sourceName: resolver.reference(node.sourceName)
  }),
  runtimeMapSet: (node, resolver) => ({
    ...node,
    mapName: resolver.reference(node.mapName),
    key: resolver.value(node.key),
    value: resolver.value(node.value)
  }),
  runtimeCollectionSetIterator: (node, resolver) => ({
    ...node,
    collectionName: resolver.reference(node.collectionName),
    value: resolver.value(node.value)
  }),
  runtimeSetAdd: (node, resolver) => ({
    ...node,
    setName: resolver.reference(node.setName),
    value: resolver.value(node.value)
  }),
  runtimeMapSetResult: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    mapName: resolver.reference(node.mapName),
    key: resolver.value(node.key),
    value: resolver.value(node.value)
  }),
  runtimeSetAddResult: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    setName: resolver.reference(node.setName),
    value: resolver.value(node.value)
  }),
  runtimeIteratorNew: (node, resolver) => ({
    ...node,
    name: declareFromOperation(node.name, "const", node, resolver),
    collectionName: resolver.reference(node.collectionName)
  }),

  // `path` is a fixed field path into the object: observable property names, not bindings.
  objectStore: (node, resolver) => ({
    ...node,
    objectName: resolver.reference(node.objectName),
    value: resolver.number(node.value)
  }),
  runtimeObjectStore: (node, resolver) => ({
    ...node,
    objectName: resolver.reference(node.objectName),
    key: resolver.string(node.key),
    value: resolver.value(node.value)
  }),
  valueObjectStore: (node, resolver) => ({
    ...node,
    targetName: resolver.reference(node.targetName),
    key: resolver.string(node.key),
    value: resolver.value(node.value)
  }),
  // `key` is the class-mangled private field name and `message` the TypeError text.
  privateFieldStore: (node, resolver) => ({
    ...node,
    targetName: resolver.reference(node.targetName),
    value: resolver.value(node.value)
  }),
  valueArrayStore: (node, resolver) => ({
    ...node,
    targetName: resolver.reference(node.targetName),
    index: resolver.number(node.index),
    value: resolver.value(node.value)
  }),
  valueArraySetLength: (node, resolver) => ({
    ...node,
    targetName: resolver.reference(node.targetName),
    length: resolver.number(node.length)
  }),
  runtimeObjectDelete: (node, resolver) => ({
    ...node,
    objectName: resolver.reference(node.objectName),
    key: resolver.string(node.key)
  }),
  valueObjectDelete: (node, resolver) => ({
    ...node,
    targetName: resolver.reference(node.targetName),
    key: resolver.string(node.key)
  }),
  valueArrayDelete: (node, resolver) => ({
    ...node,
    targetName: resolver.reference(node.targetName),
    index: resolver.number(node.index)
  }),
  // The prototype is a binding the class declared, so `Object.setPrototypeOf` reads it.
  runtimeObjectSetPrototype: (node, resolver) => ({
    ...node,
    targetName: resolver.reference(node.targetName),
    prototypeName: optional(node.prototypeName, resolver.reference)
  }),
  valueObjectSetPrototype: (node, resolver) => ({
    ...node,
    targetName: resolver.reference(node.targetName),
    prototypeName: resolver.reference(node.prototypeName)
  }),
  runtimeObjectPreventExtensions: (node, resolver) => ({
    ...node,
    objectName: resolver.reference(node.objectName)
  }),
  runtimeObjectSeal: (node, resolver) => ({ ...node, objectName: resolver.reference(node.objectName) }),
  runtimeObjectFreeze: (node, resolver) => ({ ...node, objectName: resolver.reference(node.objectName) }),
  runtimeObjectAssign: (node, resolver) => ({
    ...node,
    targetName: resolver.reference(node.targetName),
    sources: node.sources.map((source) => resolveObjectAssignSource(source, resolver))
  }),
  runtimeObjectDefineDataProperty: (node, resolver) => ({
    ...node,
    objectName: resolver.reference(node.objectName),
    descriptor: resolveDataDescriptor(node.descriptor, resolver)
  }),
  runtimeObjectDefineDataProperties: (node, resolver) => ({
    ...node,
    objectName: resolver.reference(node.objectName),
    descriptors: node.descriptors.map((descriptor) => resolveDataDescriptor(descriptor, resolver))
  })
} satisfies Partial<OperationHandlers>;
