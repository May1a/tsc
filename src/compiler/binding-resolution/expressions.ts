import type { JsIrExpression } from "../ir/expressions.js";
import type { ResolvedExpression } from "./resolved-types.js";
import { tierHandlers } from "./dispatch.js";
import { resolveCallArguments } from "./payloads.js";

export const expressionHandlers = tierHandlers<JsIrExpression, ResolvedExpression>({
  string: (node) => ({ kind: "string", value: node.value }),
  stringExpression: (node, resolver) => ({ kind: "stringExpression", value: resolver.string(node.value) }),
  number: (node, resolver) => ({ kind: "number", value: resolver.number(node.value) }),
  boolean: (node) => ({ kind: "boolean", value: node.value }),
  identifier: (node, resolver) => ({ kind: "identifier", name: resolver.reference(node.name) }),
  call: (node, resolver) => ({
    kind: "call",
    name: resolver.reference(node.name),
    arguments: resolveCallArguments(node.arguments, resolver)
  }),
  value: (node, resolver) => ({ kind: "value", value: resolver.value(node.value) })
});
