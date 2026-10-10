import type { JsIrNumberExpression } from "../ir/expressions.js";
import type { ResolvedNumberExpression } from "./resolved-types.js";
import { tierHandlers } from "./dispatch.js";
import { optional } from "./payloads.js";

export const numberHandlers = tierHandlers<JsIrNumberExpression, ResolvedNumberExpression>({
  regexSearch: (node, resolver) => ({
    kind: "regexSearch",
    regex: resolver.value(node.regex),
    input: resolver.string(node.input)
  }),
  literal: (node) => ({ kind: "literal", value: node.value }),
  nan: () => ({ kind: "nan" }),
  negatedZero: () => ({ kind: "negatedZero" }),

  unary: (node, resolver) => ({
    kind: "unary",
    operator: node.operator,
    value: resolver.number(node.value)
  }),
  // `update` is a reference that also assigns, so it resolves to the same identity a read would.
  update: (node, resolver) => ({
    kind: "update",
    name: resolver.reference(node.name),
    operator: node.operator,
    prefix: node.prefix
  }),
  binary: (node, resolver) => ({
    kind: "binary",
    operator: node.operator,
    left: resolver.number(node.left),
    right: resolver.number(node.right)
  }),
  // A parameter slot belongs to the function's own frame, so it is a binding like any other.
  parameter: (node, resolver) => ({ kind: "parameter", name: resolver.reference(node.name) }),
  variable: (node, resolver) => ({ kind: "variable", name: resolver.reference(node.name) }),
  call: (node, resolver) => ({
    kind: "call",
    name: resolver.reference(node.name),
    arguments: node.arguments.map((argument) => resolver.number(argument))
  }),
  ternary: (node, resolver) => ({
    kind: "ternary",
    condition: resolver.condition(node.condition),
    consequent: resolver.number(node.consequent),
    alternate: resolver.number(node.alternate)
  }),

  arrayAccess: (node, resolver) => ({
    kind: "arrayAccess",
    arrayName: resolver.reference(node.arrayName),
    index: resolver.number(node.index)
  }),
  arrayLength: (node, resolver) => ({ kind: "arrayLength", arrayName: resolver.reference(node.arrayName) }),
  valueArrayLength: (node, resolver) => ({ kind: "valueArrayLength", value: resolver.value(node.value) }),
  valueLength: (node, resolver) => ({ kind: "valueLength", value: resolver.value(node.value) }),
  valueObjectLength: (node, resolver) => ({ kind: "valueObjectLength", value: resolver.value(node.value) }),
  arrayPush: (node, resolver) => ({
    kind: "arrayPush",
    arrayName: resolver.reference(node.arrayName),
    values: node.values.map((value) => resolver.value(value))
  }),
  arrayUnshift: (node, resolver) => ({
    kind: "arrayUnshift",
    arrayName: resolver.reference(node.arrayName),
    values: node.values.map((value) => resolver.value(value))
  }),
  arrayIndexOf: (node, resolver) => ({
    ...node,
    kind: "arrayIndexOf",
    arrayName: resolver.reference(node.arrayName),
    value: resolver.value(node.value),
    fromIndex: optional(node.fromIndex, resolver.number)
  }),
  arrayFindIndex: (node, resolver) => ({
    kind: "arrayFindIndex",
    arrayName: resolver.reference(node.arrayName)
  }),
  runtimeCollectionSize: (node, resolver) => ({
    kind: "runtimeCollectionSize",
    collectionName: resolver.reference(node.collectionName)
  }),
  // `path` is a fixed field path into a fixed-layout object: observable property names, not bindings.
  objectAccess: (node, resolver) => ({
    kind: "objectAccess",
    objectName: resolver.reference(node.objectName),
    path: node.path
  }),
  valueToNumber: (node, resolver) => ({ kind: "valueToNumber", value: resolver.value(node.value) }),
  mathCall: (node, resolver) => ({
    kind: "mathCall",
    method: node.method,
    arguments: node.arguments.map((argument) => resolver.number(argument))
  }),
  parseInt: (node, resolver) => ({ kind: "parseInt", value: resolver.string(node.value) }),
  parseFloat: (node, resolver) => ({ kind: "parseFloat", value: resolver.string(node.value) })
});
