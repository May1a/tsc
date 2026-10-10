import type { JsIrStringExpression } from "../ir/expressions.js";
import type { ResolvedStringExpression } from "./resolved-types.js";
import { tierHandlers } from "./dispatch.js";
import { optional, resolveCallArguments } from "./payloads.js";

export const stringHandlers = tierHandlers<JsIrStringExpression, ResolvedStringExpression>({
  literal: (node) => ({ kind: "literal", value: node.value }),
  variable: (node, resolver) => ({ kind: "variable", name: resolver.reference(node.name) }),
  ternary: (node, resolver) => ({
    kind: "ternary",
    condition: resolver.condition(node.condition),
    consequent: resolver.string(node.consequent),
    alternate: resolver.string(node.alternate)
  }),
  concat: (node, resolver) => ({
    kind: "concat",
    left: resolver.string(node.left),
    right: resolver.string(node.right)
  }),
  call: (node, resolver) => ({
    kind: "call",
    name: resolver.reference(node.name),
    arguments: resolveCallArguments(node.arguments, resolver)
  }),
  arrayJoin: (node, resolver) => ({
    kind: "arrayJoin",
    arrayName: resolver.reference(node.arrayName),
    separator: resolver.string(node.separator)
  }),
  // The name of a type the source asked about, not a binding.
  typeof: (node) => ({ kind: "typeof", value: node.value }),
  stringConversion: (node, resolver) => ({ kind: "stringConversion", value: resolver.value(node.value) }),
  stringMethod: (node, resolver) => ({
    kind: "stringMethod",
    method: node.method,
    receiver: resolver.string(node.receiver),
    count: optional(node.count, resolver.number),
    search: optional(node.search, resolver.string),
    replacement: optional(node.replacement, resolver.string),
    targetLength: optional(node.targetLength, resolver.number),
    padString: optional(node.padString, resolver.string),
    position: optional(node.position, resolver.number),
    start: optional(node.start, resolver.number),
    end: optional(node.end, resolver.number)
  }),
  stringFromCharCode: (node, resolver) => ({
    kind: "stringFromCharCode",
    codes: node.codes.map((code) => resolver.number(code))
  }),
  // The tag is the binding the source called; the template text around the holes is data.
  taggedTemplate: (node, resolver) => ({
    kind: "taggedTemplate",
    tag: resolver.reference(node.tag),
    head: node.head,
    middleTexts: node.middleTexts,
    expressions: node.expressions.map((expression) => resolver.value(expression))
  }),
  numberFormat: (node, resolver) => ({
    kind: "numberFormat",
    method: node.method,
    receiver: resolver.number(node.receiver),
    argument: optional(node.argument, resolver.number)
  }),
  errorToString: (node, resolver) => ({
    kind: "errorToString",
    objectName: resolver.reference(node.objectName)
  }),
  regexReplace: (node, resolver) => ({
    kind: "regexReplace",
    receiver: resolver.string(node.receiver),
    regex: resolver.value(node.regex),
    replacement: resolver.string(node.replacement)
  })
});
