import type { JsIrValueExpression } from "../ir/expressions.js";
import type { ResolvedValueExpression } from "./resolved-types.js";
import { tierHandlers } from "./dispatch.js";
import { optional, resolveCallArguments, resolveFunctionObject, resolveRuntimeArrayElement, resolveRuntimeObjectValue } from "./payloads.js";

export const valueHandlers = tierHandlers<JsIrValueExpression, ResolvedValueExpression>({
  number: (node, resolver) => ({ kind: "number", value: resolver.number(node.value) }),
  boolean: (node, resolver) => ({ kind: "boolean", value: resolver.condition(node.value) }),
  undefined: () => ({ kind: "undefined" }),
  null: () => ({ kind: "null" }),
  string: (node, resolver) => ({ kind: "string", value: resolver.string(node.value) }),

  variable: (node, resolver) => ({ kind: "variable", name: resolver.reference(node.name) }),
  call: (node, resolver) => ({
    kind: "call",
    name: resolver.reference(node.name),
    arguments: resolveCallArguments(node.arguments, resolver)
  }),
  callValue: (node, resolver) => ({
    kind: "callValue",
    callee: resolver.value(node.callee),
    arguments: resolveCallArguments(node.arguments, resolver),
    thisValue: optional(node.thisValue, resolver.value),
    methodReceiver: optional(node.methodReceiver, resolver.value),
    methodKey: optional(node.methodKey, resolver.string),
    ...(node.optionalCallee === undefined ? {} : { optionalCallee: node.optionalCallee }),
    ...(node.spreadArguments === undefined
      ? {}
      : { spreadArguments: node.spreadArguments.map((element) => resolveRuntimeArrayElement(element, resolver)) }),
  }),
  functionObject: (node, resolver) => {
    const definition = resolveFunctionObject(resolver.state.functionDefinition(node.definition), resolver);
    // The definition is recorded here, at the site that owns it, so the module's list carries
    // definitions resolved in the scopes they were written in. A second resolution of the same
    // definitions at module scope would have no scope to resolve their captures against.
    resolver.state.recordFunctionObject(definition);
    return { kind: "functionObject", definition };
  },
  regexCompile: (node, resolver) => ({
    kind: "regexCompile",
    pattern: resolver.string(node.pattern),
    flags: resolver.string(node.flags)
  }),
  regexExec: (node, resolver) => ({
    kind: "regexExec",
    regex: resolver.value(node.regex),
    input: resolver.string(node.input)
  }),
  regexMatch: (node, resolver) => ({
    kind: "regexMatch",
    regex: resolver.value(node.regex),
    input: resolver.string(node.input)
  }),
  // An external C++ symbol: a generated code name, not a binding.
  inlineCppValue: (node) => ({ kind: "inlineCppValue", symbol: node.symbol }),

  ternary: (node, resolver) => ({
    kind: "ternary",
    condition: resolver.condition(node.condition),
    consequent: resolver.value(node.consequent),
    alternate: resolver.value(node.alternate)
  }),
  lazyDefault: (node, resolver) => ({
    kind: "lazyDefault",
    value: resolver.value(node.value),
    defaultValue: resolver.value(node.defaultValue)
  }),

  arrayAccess: (node, resolver) => ({
    kind: "arrayAccess",
    arrayName: resolver.reference(node.arrayName),
    index: resolver.number(node.index),
    key: optional(node.key, resolver.string)
  }),
  arrayPop: (node, resolver) => ({ kind: "arrayPop", arrayName: resolver.reference(node.arrayName) }),
  arrayShift: (node, resolver) => ({ kind: "arrayShift", arrayName: resolver.reference(node.arrayName) }),
  arrayIncludes: (node, resolver) => ({
    kind: "arrayIncludes",
    arrayName: resolver.reference(node.arrayName),
    value: resolver.value(node.value)
  }),
  arrayAt: (node, resolver) => ({
    kind: "arrayAt",
    arrayName: resolver.reference(node.arrayName),
    index: resolver.number(node.index)
  }),
  valuePlus: (node, resolver) => ({
    kind: "valuePlus",
    left: resolver.value(node.left),
    right: resolver.value(node.right)
  }),
  logicalValue: (node, resolver) => ({
    kind: "logicalValue",
    operator: node.operator,
    left: resolver.value(node.left),
    right: resolver.value(node.right)
  }),
  arrayFind: (node, resolver) => ({ kind: "arrayFind", arrayName: resolver.reference(node.arrayName) }),
  arrayForEach: (node, resolver) => ({ kind: "arrayForEach", arrayName: resolver.reference(node.arrayName) }),

  objectRef: (node, resolver) => ({ kind: "objectRef", name: resolver.reference(node.name) }),
  arrayRef: (node, resolver) => ({ kind: "arrayRef", name: resolver.reference(node.name) }),
  objectLiteralValue: (node, resolver) => ({
    kind: "objectLiteralValue",
    value: resolveRuntimeObjectValue(node.value, resolver)
  }),
  objectDynamicAccess: (node, resolver) => ({
    kind: "objectDynamicAccess",
    objectName: resolver.reference(node.objectName),
    key: resolver.string(node.key)
  }),
  valueObjectDynamicAccess: (node, resolver) => ({
    kind: "valueObjectDynamicAccess",
    value: resolver.value(node.value),
    key: resolver.string(node.key)
  }),
  // `key` is a class-mangled private field name and `message` the TypeError text; neither is a binding.
  privateFieldAccess: (node, resolver) => ({
    kind: "privateFieldAccess",
    key: node.key,
    message: node.message,
    receiver: resolver.value(node.receiver)
  }),
  valueArrayAccess: (node, resolver) => ({
    kind: "valueArrayAccess",
    value: resolver.value(node.value),
    index: resolver.number(node.index),
    key: resolver.string(node.key)
  }),
  nullishCoalesce: (node, resolver) => ({
    kind: "nullishCoalesce",
    left: resolver.value(node.left),
    right: resolver.value(node.right)
  }),

  jsonStringify: (node, resolver) => ({
    kind: "jsonStringify",
    value: resolver.value(node.value),
    indent: node.indent,
    // The replacer is a binding the source named, not a property key on JSON.
    replacerName: optional(node.replacerName, resolver.reference)
  }),
  jsonParse: (node, resolver) => ({
    kind: "jsonParse",
    text: resolver.value(node.text),
    reviver: optional(node.reviver, resolver.value)
  }),
  runtimeMapGet: (node, resolver) => ({
    kind: "runtimeMapGet",
    mapName: resolver.reference(node.mapName),
    key: resolver.value(node.key)
  }),

  optionalChain: (node, resolver) => ({
    kind: "optionalChain",
    guard: resolver.value(node.guard),
    access: resolver.value(node.access)
  }),
  optionalTarget: () => ({ kind: "optionalTarget" }),
  void: (node, resolver) => ({ kind: "void", expression: resolver.value(node.expression) }),
  sequence: (node, resolver) => ({
    kind: "sequence",
    left: resolver.value(node.left),
    right: resolver.value(node.right)
  }),

  stringStartsWith: (node, resolver) => ({
    kind: "stringStartsWith",
    receiver: resolver.string(node.receiver),
    search: resolver.string(node.search),
    position: optional(node.position, resolver.number)
  }),
  stringEndsWith: (node, resolver) => ({
    kind: "stringEndsWith",
    receiver: resolver.string(node.receiver),
    search: resolver.string(node.search),
    position: optional(node.position, resolver.number)
  }),
  stringIndexOf: (node, resolver) => ({
    kind: "stringIndexOf",
    receiver: resolver.string(node.receiver),
    search: resolver.string(node.search),
    position: optional(node.position, resolver.number)
  }),
  stringLastIndexOf: (node, resolver) => ({
    kind: "stringLastIndexOf",
    receiver: resolver.string(node.receiver),
    search: resolver.string(node.search),
    position: optional(node.position, resolver.number)
  }),
  stringCharCodeAt: (node, resolver) => ({
    kind: "stringCharCodeAt",
    receiver: resolver.string(node.receiver),
    index: resolver.number(node.index),
    other: optional(node.other, resolver.string)
  }),
  stringCodePointAt: (node, resolver) => ({
    kind: "stringCodePointAt",
    receiver: resolver.string(node.receiver),
    index: resolver.number(node.index),
    other: optional(node.other, resolver.string)
  }),
  stringLocaleCompare: (node, resolver) => ({
    kind: "stringLocaleCompare",
    receiver: resolver.string(node.receiver),
    index: resolver.number(node.index),
    other: optional(node.other, resolver.string)
  }),

  runtimeArrayValue: (node, resolver) => ({
    kind: "runtimeArrayValue",
    elements: node.elements.map((element) => resolver.value(element))
  }),
  taggedTemplateValue: (node, resolver) => ({
    kind: "taggedTemplateValue",
    tag: resolver.reference(node.tag),
    head: node.head,
    middleTexts: node.middleTexts,
    expressions: node.expressions.map((expression) => resolver.value(expression))
  }),
  boxedPrimitive: (node, resolver) => ({
    ...node,
    kind: "boxedPrimitive",
    inner: resolver.value(node.inner),
  }),
  boxedMethodCall: (node, resolver) => ({
    kind: "boxedMethodCall",
    method: node.method,
    receiver: resolver.value(node.receiver)
  }),
  // `className` and `constructorName` are generated code names. `prototypeName` is a binding: the class
  // declared its prototype object, and construction and `instanceof` have to read it.
  newInstance: (node, resolver) => ({
    kind: "newInstance",
    className: node.className,
    constructorName: resolver.reference(node.constructorName),
    fieldCount: node.fieldCount,
    prototypeName: resolver.reference(node.prototypeName),
    arguments: resolveCallArguments(node.arguments, resolver)
  })
});
