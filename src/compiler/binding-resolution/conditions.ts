import type { JsIrCondition, JsIrValueExpression } from "../ir/expressions.js";
import type { ResolvedCondition, ResolvedValueExpression } from "./resolved-types.js";
import { tierHandlers } from "./dispatch.js";
import { optional } from "./payloads.js";

function resolveArrayIsArrayOperand(
  operand: boolean | JsIrValueExpression,
  resolver: { value: (expression: JsIrValueExpression) => ResolvedValueExpression }
): boolean | ResolvedValueExpression {
  return typeof operand === "boolean" ? operand : resolver.value(operand);
}

export const conditionHandlers = tierHandlers<JsIrCondition, ResolvedCondition>({
  boolean: (node) => ({ kind: "boolean", value: node.value }),
  classInstanceOf: (node, resolver) => ({
    kind: "classInstanceOf",
    value: resolver.value(node.value),
    prototypeName: resolver.reference(node.prototypeName)
  }),
  errorInstanceOf: (node, resolver) => ({
    kind: "errorInstanceOf",
    value: resolver.value(node.value),
    errorName: node.errorName
  }),
  regexTest: (node, resolver) => ({
    kind: "regexTest",
    regex: resolver.value(node.regex),
    input: resolver.string(node.input)
  }),
  numberComparison: (node, resolver) => ({
    kind: "numberComparison",
    operator: node.operator,
    left: resolver.number(node.left),
    right: resolver.number(node.right)
  }),
  negate: (node, resolver) => ({ kind: "negate", condition: resolver.condition(node.condition) }),
  and: (node, resolver) => ({
    kind: "and",
    left: resolver.condition(node.left),
    right: resolver.condition(node.right)
  }),
  or: (node, resolver) => ({ kind: "or", left: resolver.condition(node.left), right: resolver.condition(node.right) }),
  booleanVariable: (node, resolver) => ({ kind: "booleanVariable", name: resolver.reference(node.name) }),
  stringComparison: (node, resolver) => ({
    kind: "stringComparison",
    operator: node.operator,
    left: resolver.string(node.left),
    right: resolver.string(node.right)
  }),
  booleanComparison: (node, resolver) => ({
    kind: "booleanComparison",
    operator: node.operator,
    left: resolver.condition(node.left),
    right: resolver.condition(node.right)
  }),
  valueComparison: (node, resolver) => ({
    kind: "valueComparison",
    operator: node.operator,
    left: resolver.value(node.left),
    right: resolver.value(node.right)
  }),

  runtimeObjectHas: (node, resolver) => ({
    ...node,
    kind: "runtimeObjectHas",
    objectName: resolver.reference(node.objectName),
    key: resolver.string(node.key),
    ownOnly: node.ownOnly,
  }),
  runtimeArrayHas: (node, resolver) => ({
    kind: "runtimeArrayHas",
    arrayName: resolver.reference(node.arrayName),
    index: resolver.number(node.index),
    ownOnly: node.ownOnly,
    key: optional(node.key, resolver.string)
  }),
  runtimeObjectPropertyIsEnumerable: (node, resolver) => ({
    kind: "runtimeObjectPropertyIsEnumerable",
    objectName: resolver.reference(node.objectName),
    key: resolver.string(node.key)
  }),
  runtimeArrayIsArray: (node, resolver) => ({
    kind: "runtimeArrayIsArray",
    value: resolveArrayIsArrayOperand(node.value, resolver)
  }),
  runtimeArrayEvery: (node, resolver) => ({
    kind: "runtimeArrayEvery",
    arrayName: resolver.reference(node.arrayName)
  }),
  runtimeArraySome: (node, resolver) => ({
    kind: "runtimeArraySome",
    arrayName: resolver.reference(node.arrayName)
  }),
  objectIs: (node, resolver) => ({
    kind: "objectIs",
    left: resolver.value(node.left),
    right: resolver.value(node.right)
  }),
  runtimeCollectionHas: (node, resolver) => ({
    kind: "runtimeCollectionHas",
    collectionName: resolver.reference(node.collectionName),
    key: resolver.value(node.key)
  }),
  runtimeCollectionDelete: (node, resolver) => ({
    kind: "runtimeCollectionDelete",
    collectionName: resolver.reference(node.collectionName),
    key: resolver.value(node.key)
  }),
  runtimeCollectionIdentity: (node, resolver) => ({
    kind: "runtimeCollectionIdentity",
    operator: node.operator,
    leftName: resolver.reference(node.leftName),
    rightName: resolver.reference(node.rightName)
  }),
  valueTruthy: (node, resolver) => ({ kind: "valueTruthy", value: resolver.value(node.value) }),
  valueLooseComparison: (node, resolver) => ({
    kind: "valueLooseComparison",
    operator: node.operator,
    left: resolver.value(node.left),
    right: resolver.value(node.right)
  }),
  valueRelationalComparison: (node, resolver) => ({
    kind: "valueRelationalComparison",
    operator: node.operator,
    left: resolver.value(node.left),
    right: resolver.value(node.right)
  }),
  numberPredicate: (node, resolver) => ({
    kind: "numberPredicate",
    predicate: node.predicate,
    value: resolver.value(node.value)
  }),
  stringSearch: (node, resolver) => ({
    kind: "stringSearch",
    method: node.method,
    receiver: resolver.string(node.receiver),
    search: resolver.string(node.search)
  }),
  runtimeObjectState: (node, resolver) => ({
    kind: "runtimeObjectState",
    objectName: resolver.reference(node.objectName),
    state: node.state
  })
});
