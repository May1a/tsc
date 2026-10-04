import type { JsIrValueExpression } from "../ir/expressions.js";
import { variablePointerName } from "./names.js";
import {
  emitBoxedMethodCallValueExpression,
  emitBoxedPrimitiveValueExpression,
  emitTaggedTemplateValueExpression
} from "./boxed-values.js";
import { emitGeneratedJsCall, emitRootStackPush } from "./completion.js";
import { functionObjectExpectedArgumentCount, internedFunctionGlobal } from "./function-objects.js";
import { emitRuntimeArrayRemoveValueExpression } from "./array-mutators.js";
import { emitNumberValueExpression, emitRuntimeObjectLiteralStorage, emitRuntimeObjectValueExpression } from "./objects.js";
import { emitValueObjectValueExpression } from "./known-shape-objects.js";
import {
  emitNewInstanceValueExpression,
  emitNullishTest,
  emitPrivateFieldAccessExpression,
  emitRuntimeArrayValueExpression,
  emitValueCallExpression
} from "./value-calls.js";
import { jsValueFalse, jsValueNull, jsValueTrue, jsValueUndefined } from "./values.js";
import { emitArrayIndex } from "./numbers.js";
import { emitStringIndexArgument } from "./string-expressions.js";
import type { EmitContext, JsValue, NumberValue } from "./context.js";
import {
  emitRuntimeArrayPointer,
  emitRuntimeCollectionPointer,
  emitRuntimeObjectPointer
} from "./layout.js";

/**
 * The value tier: one function per `JsIrValueExpression` shape, all returning a `JsValue`.
 *
 * A `JsValue` is a boxed-or-primitive `i64` plus the lines that produced it, and it is the only result
 * type in the emitter that is neither a raw number nor a raw pointer. That is the design: every `number`
 * in this language is a js value, so an expression of any other type has to end up boxed, and the tiers
 * below — numbers, strings, conditions — exist so that a `double` or a `ptr` never has to be boxed
 * speculatively.
 *
 * `emitPrimitiveValueExpression` is the first question every value asks: is this a primitive, and if so
 * which. Everything else here is a compound over that answer. The four short-circuiting shapes (`??`,
 * `&&`, `||`, `?.`) branch rather than mask, so the untaken side is never evaluated; the optional chain
 * is the hard one, because `a?.b.c` must skip the *rest* of the chain and not just `b`.
 */

// eslint-disable-next-line complexity, max-statements -- Transitional JSValue emission remains centralized during aggregate boxing.
/** a name and what it currently holds. */
function emitVariableValueExpression(expression: JsIrValueExpression, context: EmitContext): JsValue | undefined {
  if (expression.kind === "variable") {
    const { name: expressionName } = expression;
    const binding = context.bindings.get(expressionName);
    if (binding?.kind === "valueVariable" && binding.name.startsWith("%")) {
      return { lines: [], value: binding.name };
    }
    if (binding?.kind === "value") {
      return context.emitValue(binding.value);
    }
    let name = expressionName;
    if (binding?.kind === "valueVariable") {
      ({ name } = binding);
    }
    if (!name.startsWith("%")) {
      const value = `%value.${context.numIndex}`;
      context.numIndex += 1;
      let pointer = variablePointerName(name);
      if (context.valueGlobals.has(name)) {
        pointer = `@${name}.value`;
      }
      return { lines: [`  ${value} = load i64, ptr ${pointer}`], value };
    }
    return { lines: [], value: name };
  }
  return undefined;
}

/** reading a field or an element out of something. */
function emitAggregateReadValueExpression(expression: JsIrValueExpression, context: EmitContext): JsValue | undefined {
  if (expression.kind === "arrayAccess") {
    return emitRuntimeArrayValueExpression(expression, context);
  }
  if (expression.kind === "objectDynamicAccess") {
    return emitRuntimeObjectValueExpression(expression, context);
  }
  if (expression.kind === "valueObjectDynamicAccess") {
    return emitValueObjectValueExpression(expression, context);
  }
  if (expression.kind === "privateFieldAccess") {
    return emitPrivateFieldAccessExpression(expression, context);
  }
  if (expression.kind === "valueArrayAccess") {
    return emitValueArrayValueExpression(expression, context);
  }
  return undefined;
}

/** the value *is* an aggregate: an array's identity. */
function emitAggregateIdentityValueExpression(expression: JsIrValueExpression, context: EmitContext): JsValue | undefined {
  if (expression.kind === "runtimeArrayValue") {
    const lines: string[] = [];
    const values = expression.elements.map((element) => context.emitValue(element));
    for (const value of values) {
      lines.push(...value.lines);
    }
    const { arrayIndex } = context;
    context.arrayIndex += 1;
    const arrayName = `%rest.array.${arrayIndex}`;
    const lengthValue = expression.elements.length;
    lines.push(`  ${arrayName} = call ptr @arrayNew(i64 ${lengthValue})`);
    for (let i = 0; i < values.length; i++) {
      lines.push(`  call void @arraySet(ptr ${arrayName}, i64 ${i}, i64 ${values[i].value})`);
    }
    const boxIndex = context.numIndex;
    context.numIndex += 1;
    const boxName = `%value.${boxIndex}`;
    lines.push(`  ${boxName} = call i64 @valueBoxArray(ptr ${arrayName})`);
    return { lines, value: boxName };
  }
  return undefined;
}

/** a reference to an object, a fresh literal, or an array. */
function emitReferenceValueExpression(expression: JsIrValueExpression, context: EmitContext): JsValue | undefined {
  if (expression.kind === "objectRef") {
    const object = emitRuntimeObjectPointer(expression.name, context);
    const value = `%value.${context.numIndex}`;
    context.numIndex += 1;
    return { lines: [...object.lines, `  ${value} = call i64 @valueBoxObject(ptr ${object.value})`], value };
  }
  if (expression.kind === "objectLiteralValue") {
    const pointerName = `%obj.value.${context.objectIndex}.addr`;
    const lines = emitRuntimeObjectLiteralStorage(pointerName, expression.value, context);
    const object = `%obj.value.${context.objectIndex}.ptr`;
    const value = `%value.${context.numIndex}`;
    context.numIndex += 1;
    return { lines: [...lines, `  ${object} = load ptr, ptr ${pointerName}`, `  ${value} = call i64 @valueBoxObject(ptr ${object})`], value };
  }
  if (expression.kind === "arrayRef") {
    const array = emitRuntimeArrayPointer(expression.name, context);
    const value = `%value.${context.numIndex}`;
    context.numIndex += 1;
    return { lines: [...array.lines, `  ${value} = call i64 @valueBoxArray(ptr ${array.value})`], value };
  }
  return undefined;
}

/** a plain call, a value call, a constructor, `+`, find and forEach. */
function emitInvocationValueExpression(expression: JsIrValueExpression, context: EmitContext): JsValue | undefined {
  if (expression.kind === "call") {
    const args = context.emitCallArguments(expression.arguments);
    const generated = emitGeneratedJsCall(expression.name, args.values, context);
    return {
      lines: [...args.lines, ...generated.lines],
      value: generated.value
    };
  }
  if (expression.kind === "callValue") {
    return emitValueCallExpression(expression, context);
  }
  if (expression.kind === "newInstance") {
    return emitNewInstanceValueExpression(expression, context);
  }
  if (expression.kind === "valuePlus") {
    const left = context.emitValue(expression.left);
    const right = context.emitValue(expression.right);
    const value = `%value.${context.numIndex}`;
    context.numIndex += 1;
    return {
      lines: [
        ...left.lines,
        ...right.lines,
        `  ${value} = call i64 @valuePlus(i64 ${left.value}, i64 ${right.value})`,
        emitRootStackPush(value, context)
      ],
      value
    };
  }
  if (expression.kind === "arrayFind") {
    const array = emitRuntimeArrayPointer(expression.arrayName, context);
    const value = `%value.${context.numIndex}`;
    context.numIndex += 1;
    return { lines: [...array.lines, `  ${value} = call i64 @arrayFind(ptr ${array.value})`], value };
  }
  if (expression.kind === "arrayForEach") {
    return { lines: [], value: jsValueUndefined };
  }
  return undefined;
}













































































/** constructing a RegExp. */
function emitRegexCompileValueExpression(expression: JsIrValueExpression, context: EmitContext): JsValue | undefined {
  if (expression.kind === "regexCompile") {
    const pattern = context.emitStringExpression(expression.pattern);
    const flags = context.emitStringExpression(expression.flags);
    const patternValue = `%regex.pattern.${context.callIndex}`;
    const flagsValue = `%regex.flags.${context.callIndex}`;
    const call = emitGeneratedJsCall("regexCompile", [`i64 ${patternValue}`, `i64 ${flagsValue}`], context);
    return {
      lines: [
        ...pattern.lines,
        ...flags.lines,
        `  ${patternValue} = call i64 @valueBoxString(ptr ${pattern.value}, i64 ${pattern.length})`,
        `  call void @gcRootPush(i64 ${patternValue})`,
        `  ${flagsValue} = call i64 @valueBoxString(ptr ${flags.value}, i64 ${flags.length})`,
        `  call void @gcRootPush(i64 ${flagsValue})`,
        ...call.lines
      ],
      value: call.value
    };
  }
  return undefined;
}

/** exec and match. */
function emitRegexMatchValueExpression(expression: JsIrValueExpression, context: EmitContext): JsValue | undefined {
  if (expression.kind === "regexExec" || expression.kind === "regexMatch") {
    const regex = context.emitValue(expression.regex);
    const input = context.emitStringExpression(expression.input);
    const inputValue = `%regex.input.${context.callIndex}`;
    let helper: "regexExec" | "regexMatch" = "regexExec";
    if (expression.kind === "regexMatch") {
      helper = "regexMatch";
    }
    const call = emitGeneratedJsCall(helper, [`i64 ${regex.value}`, `i64 ${inputValue}`], context);
    return {
      lines: [
        ...regex.lines,
        `  call void @gcRootPush(i64 ${regex.value})`,
        ...input.lines,
        `  ${inputValue} = call i64 @valueBoxString(ptr ${input.value}, i64 ${input.length})`,
        `  call void @gcRootPush(i64 ${inputValue})`,
        ...call.lines
      ],
      value: call.value
    };
  }
  return undefined;
}

/** JSON.parse and JSON.stringify. */
function emitJsonValueExpression(expression: JsIrValueExpression, context: EmitContext): JsValue | undefined {
  if (expression.kind === "jsonParse") {
    const text = context.emitValue(expression.text);
    let reviver: JsValue = { lines: [], value: jsValueUndefined };
    if (expression.reviver !== undefined) {
      reviver = context.emitValue(expression.reviver);
    }
    const call = emitGeneratedJsCall("jsonParse", [`i64 ${text.value}`, `i64 ${reviver.value}`], context);
    return {
      lines: [
        ...text.lines,
        emitRootStackPush(text.value, context),
        ...reviver.lines,
        emitRootStackPush(reviver.value, context),
        ...call.lines
      ],
      value: call.value
    };
  }
  if (expression.kind === "jsonStringify") {
    const source = context.emitValue(expression.value);
    const lines = [...source.lines, emitRootStackPush(source.value, context)];
    let filter = "null";
    if (expression.replacerName !== undefined) {
      const filterArray = emitRuntimeArrayPointer(expression.replacerName, context);
      lines.push(...filterArray.lines);
      filter = filterArray.value;
    }
    const call = emitGeneratedJsCall("jsonStringify", [`i64 ${source.value}`, `ptr ${filter}`, `i64 ${expression.indent}`], context);
    lines.push(...call.lines);
    return { lines, value: call.value };
  }
  return undefined;
}

/** startsWith and endsWith. */
function emitStringPredicateValueExpression(expression: JsIrValueExpression, context: EmitContext): JsValue | undefined {
  if (expression.kind === "stringStartsWith" || expression.kind === "stringEndsWith") {
    const receiver = context.emitStringExpression(expression.receiver);
    const search = context.emitStringExpression(expression.search);
    let helper: "stringStartsWith" | "stringStartsWithAt" | "stringEndsWith" = "stringEndsWith";
    if (expression.kind === "stringStartsWith") {
      helper = "stringStartsWith";
    }
    if (expression.position !== undefined && expression.kind === "stringStartsWith") {
      helper = "stringStartsWithAt";
    }
    const cmp = context.cmpIndex;
    context.cmpIndex += 1;
    const name = `%cmp.${cmp}`;
    const value = `%value.${context.numIndex}`;
    context.numIndex += 1;
    const positionLines: string[] = [];
    let callArgs = `i64 ${receiver.length}, ptr ${receiver.value}, i64 ${search.length}, ptr ${search.value}`;
    if (expression.position !== undefined) {
      const positionValue = emitArrayIndex(expression.position, context);
      positionLines.push(...positionValue.lines);
      callArgs = `${callArgs}, i64 ${positionValue.value}`;
    }
    return {
      lines: [...receiver.lines, ...search.lines, ...positionLines, `  ${name} = call i1 @${helper}(${callArgs})`, `  ${value} = select i1 ${name}, i64 ${jsValueTrue}, i64 ${jsValueFalse}`],
      value
    };
  }
  return undefined;
}

/** charCodeAt, codePointAt, localeCompare, indexOf and lastIndexOf. */
function emitStringScalarValueExpression(expression: JsIrValueExpression, context: EmitContext): JsValue | undefined {
  if (expression.kind === "stringCharCodeAt" || expression.kind === "stringCodePointAt" || expression.kind === "stringLocaleCompare") {
    const receiver = context.emitStringExpression(expression.receiver);
    const index = emitArrayIndex(expression.index, context);
    const doubleValue = `%num.${context.numIndex}`;
    context.numIndex += 1;
    const value = `%value.${context.numIndex}`;
    context.numIndex += 1;
    const lines: string[] = [
      ...receiver.lines,
      ...index.lines,
      `  ${doubleValue} = call double @stringCharCodeAt(i64 ${receiver.length}, ptr ${receiver.value}, i64 ${index.value})`,
      `  ${value} = call i64 @valueBoxNumber(double ${doubleValue})`
    ];
    return { lines, value };
  }
  if (expression.kind === "stringIndexOf" || expression.kind === "stringLastIndexOf") {
    const receiver = context.emitStringExpression(expression.receiver);
    const search = context.emitStringExpression(expression.search);
    const doubleValue = `%num.${context.numIndex}`;
    context.numIndex += 1;
    const value = `%value.${context.numIndex}`;
    context.numIndex += 1;
    if (expression.kind === "stringLastIndexOf") {
      return {
        lines: [
          ...receiver.lines,
          ...search.lines,
          `  ${doubleValue} = call double @stringLastIndexOf(i64 ${receiver.length}, ptr ${receiver.value}, i64 ${search.length}, ptr ${search.value})`,
          `  ${value} = call i64 @valueBoxNumber(double ${doubleValue})`
        ],
        value
      };
    }
    const position = emitStringIndexArgument(expression.position ?? { kind: "literal", value: 0 }, context);
    return {
      lines: [
        ...receiver.lines,
        ...search.lines,
        ...position.lines,
        `  ${doubleValue} = call double @stringIndexOf(i64 ${receiver.length}, ptr ${receiver.value}, i64 ${search.length}, ptr ${search.value}, i64 ${position.value})`,
        `  ${value} = call i64 @valueBoxNumber(double ${doubleValue})`
      ],
      value
    };
  }
  return undefined;
}

/** ternary, lazy default, logical and nullish. */
function emitBranchValueExpression(expression: JsIrValueExpression, context: EmitContext): JsValue | undefined {
  if (expression.kind === "ternary") {
    return emitTernaryValueExpression(expression, context);
  }
  if (expression.kind === "lazyDefault") {
    return emitLazyDefaultValueExpression(expression, context);
  }
  if (expression.kind === "logicalValue") {
    return emitLogicalValueExpression(expression, context);
  }
  if (expression.kind === "nullishCoalesce") {
    return emitNullishCoalesceValueExpression(expression, context);
  }
  return undefined;
}

/** the optional chain and its target, void, and a sequence. */
function emitTailValueExpression(expression: JsIrValueExpression, context: EmitContext): JsValue | undefined {
  if (expression.kind === "optionalChain") {
    return emitOptionalChainValueExpression(expression, context);
  }
  if (expression.kind === "optionalTarget") {
    const target = context.optionalTargets.at(-1);
    if (target === undefined) {
      throw new Error("Optional chain target referenced outside an optional chain");
    }
    return { lines: [], value: target };
  }
  if (expression.kind === "void") {
    const inner = context.emitValue(expression.expression);
    return { lines: inner.lines, value: jsValueUndefined };
  }
  if (expression.kind === "sequence") {
    const left = context.emitValue(expression.left);
    const right = context.emitValue(expression.right);
    return { lines: [...left.lines, ...right.lines], value: right.value };
  }
  return undefined;
}

/** pop, shift, includes and at. */
function emitArrayElementValueExpression(expression: JsIrValueExpression, context: EmitContext): JsValue | undefined {
  if (expression.kind === "arrayPop" || expression.kind === "arrayShift") {
    return emitRuntimeArrayRemoveValueExpression(expression, context);
  }
  if (expression.kind === "arrayIncludes") {
    const condition = emitRuntimeArrayIncludesCondition(expression, context);
    const index = context.numIndex;
    context.numIndex += 1;
    const value = `%value.${index}`;
    return { lines: [...condition.lines, `  ${value} = select i1 ${condition.value}, i64 ${jsValueTrue}, i64 ${jsValueFalse}`], value };
  }
  if (expression.kind === "arrayAt") {
    const array = emitRuntimeArrayPointer(expression.arrayName, context);
    const atIndex = emitArrayIndex(expression.index, context);
    const value = `%value.${context.numIndex}`;
    context.numIndex += 1;
    return { lines: [...array.lines, ...atIndex.lines, `  ${value} = call i64 @arrayAt(ptr ${array.value}, i64 ${atIndex.value})`], value };
  }
  return undefined;
}

/** a function object. */
function emitFunctionObjectValueExpression(expression: JsIrValueExpression, context: EmitContext): JsValue | undefined {
  if (expression.kind === "functionObject") {
    const index = context.callIndex;
    context.callIndex += 1;
    const value = `%fnobj.${index}`;
    if (expression.definition.directTarget !== undefined && (expression.definition.captures?.length ?? 0) === 0) {
      return {
        lines: [`  ${value} = load i64, ptr @${internedFunctionGlobal(expression.definition.directTarget)}`],
        value
      };
    }
    const captures = expression.definition.captures ?? [];
    const lines: string[] = [];
    let functionName = jsValueUndefined;
    if (expression.definition.inferredName !== undefined) {
      const name = context.emitStringExpression({ kind: "literal", value: expression.definition.inferredName });
      functionName = `%fnobj.name.${index}`;
      lines.push(
        ...name.lines,
        `  ${functionName} = call i64 @valueBoxString(ptr ${name.value}, i64 ${name.length})`,
        emitRootStackPush(functionName, context)
      );
    }
    let environment = "null";
    if (captures.length > 0) {
      const emittedCaptures = captures.map((capture) => context.emitValue(capture.value));
      for (const capture of emittedCaptures) {
        lines.push(...capture.lines, `  call void @gcRootPush(i64 ${capture.value})`);
      }
      environment = `%fnobj.env.${index}`;
      lines.push(`  ${environment} = call ptr @environmentNew(i64 ${captures.length})`);
      for (let captureIndex = 0; captureIndex < emittedCaptures.length; captureIndex += 1) {
        lines.push(`  call void @environmentSet(ptr ${environment}, i64 ${captureIndex}, i64 ${emittedCaptures[captureIndex].value})`);
      }
    }
    lines.push(`  ${value} = call i64 @functionObjectNew(ptr @${expression.definition.codeName}, ptr ${environment}, i64 ${jsValueUndefined}, i64 ${functionName}, i64 ${functionObjectExpectedArgumentCount(expression.definition.parameters)})`, emitRootStackPush(value, context));
    return { lines, value };
  }
  return undefined;
}

/** a value produced by an inline C++ block. */
function emitInlineCppValueExpression(expression: JsIrValueExpression, context: EmitContext): JsValue | undefined {
  if (expression.kind === "inlineCppValue") {
    const index = context.callIndex;
    context.callIndex += 1;
    const value = `%cpp.${index}`;
    return {
      lines: [`  ${value} = call i64 @${expression.symbol}()`, emitRootStackPush(value, context)],
      value
    };
  }
  return undefined;
}

/** Map.get. */
function emitMapGetValueExpression(expression: JsIrValueExpression, context: EmitContext): JsValue | undefined {
  if (expression.kind === "runtimeMapGet") {
    const collection = emitRuntimeCollectionPointer(expression.mapName, context);
    const key = context.emitValue(expression.key);
    const value = `%value.${context.numIndex}`;
    context.numIndex += 1;
    return { lines: [...collection.lines, ...key.lines, `  ${value} = call i64 @collectionGet(ptr ${collection.value}, i64 ${key.value})`], value };
  }
  return undefined;
}

type ValueRecognizer = (
  expression: JsIrValueExpression,
  context: EmitContext
) => JsValue | undefined;

/**
 * The value tier's recognizer chain, in order.
 *
 * Every entry may decline by returning `undefined`, and the first that does not wins. It is a list
 * rather than an `??` chain because nineteen operands is a complexity of 21 — over this repo's limit
 * of 20 — and because a list can be read, reordered and reasoned about the way the lowering side's
 * `Lowered` chain already is.
 */
const valueRecognizers: readonly ValueRecognizer[] = [
  emitVariableValueExpression,
  emitAggregateReadValueExpression,
  emitAggregateIdentityValueExpression,
  emitReferenceValueExpression,
  emitInvocationValueExpression,
  emitBoxedMethodCallValueExpression,
  emitBoxedPrimitiveValueExpression,
  emitTaggedTemplateValueExpression,
  emitRegexCompileValueExpression,
  emitRegexMatchValueExpression,
  emitJsonValueExpression,
  emitStringPredicateValueExpression,
  emitStringScalarValueExpression,
  emitBranchValueExpression,
  emitTailValueExpression,
  emitArrayElementValueExpression,
  emitFunctionObjectValueExpression,
  emitInlineCppValueExpression,
  emitMapGetValueExpression,
];

export function emitValueExpression(expression: JsIrValueExpression, context: EmitContext): JsValue {
  const primitive = emitPrimitiveValueExpression(expression, context);
  if (primitive !== undefined) {
    return primitive;
  }
  for (const recognize of valueRecognizers) {
    const recognized = recognize(expression, context);
    if (recognized !== undefined) {
      return recognized;
    }
  }
  throw new Error(`Unhandled JsIrValueExpression variant: ${expression.kind}`);
}

export function emitValueArrayValueExpression(
  expression: Extract<JsIrValueExpression, { readonly kind: "valueArrayAccess" }>,
  context: EmitContext
): JsValue {
  const receiver = context.emitValue(expression.value);
  const index = emitArrayIndex(expression.index, context);
  const key = context.emitStringExpression(expression.key);
  const valueIndex = context.numIndex;
  context.numIndex += 1;
  const value = `%value.${valueIndex}`;
  // Prefer valuePropertyGet for named keys so built-in iterator methods resolve.
  // Numeric index access still uses valueArrayGet for correct hole/index semantics.
  if (expression.index.kind === "literal" && expression.index.value < 0) {
    return {
      lines: [...receiver.lines, ...index.lines, ...key.lines, `  ${value} = call i64 @valuePropertyGet(i64 ${receiver.value}, i64 ${key.length}, ptr ${key.value})`],
      value
    };
  }
  return {
    lines: [...receiver.lines, ...index.lines, ...key.lines, `  ${value} = call i64 @valueArrayGet(i64 ${receiver.value}, i64 ${index.value}, i64 ${key.length}, ptr ${key.value})`],
    value
  };
}
export function emitPrimitiveValueExpression(expression: JsIrValueExpression, context: EmitContext): JsValue | undefined {
  if (expression.kind === "undefined") {
    return { lines: [], value: jsValueUndefined };
  }

  if (expression.kind === "null") {
    return { lines: [], value: jsValueNull };
  }

  if (expression.kind === "number") {
    return emitNumberValueExpression(expression, context);
  }

  if (expression.kind === "boolean") {
    return emitBooleanValueExpression(expression, context);
  }

  if (expression.kind === "string") {
    return emitStringValueExpression(expression, context);
  }

  return undefined;
}
export function emitBooleanValueExpression(expression: Extract<JsIrValueExpression, { readonly kind: "boolean" }>, context: EmitContext): JsValue {
  const condition = context.emitCondition(expression.value);
  const index = context.numIndex;
  context.numIndex += 1;
  const value = `%value.${index}`;
  return { lines: [...condition.lines, `  ${value} = select i1 ${condition.value}, i64 ${jsValueTrue}, i64 ${jsValueFalse}`], value };
}
export function emitStringValueExpression(expression: Extract<JsIrValueExpression, { readonly kind: "string" }>, context: EmitContext): JsValue {
  const string = context.emitStringExpression(expression.value);
  const index = context.numIndex;
  context.numIndex += 1;
  const value = `%value.${index}`;
  return {
    lines: [
      ...string.lines,
      `  ${value} = call i64 @valueBoxString(ptr ${string.value}, i64 ${string.length})`,
      emitRootStackPush(value, context)
    ],
    value
  };
}
export function emitTernaryValueExpression(
  expression: Extract<JsIrValueExpression, { readonly kind: "ternary" }>,
  context: EmitContext
): JsValue {
  const condition = context.emitCondition(expression.condition);
  const consequent = context.emitValue(expression.consequent);
  const alternate = context.emitValue(expression.alternate);
  const index = context.numIndex;
  context.numIndex += 1;
  const value = `%value.${index}`;
  return {
    lines: [
      ...condition.lines,
      ...consequent.lines,
      ...alternate.lines,
      `  ${value} = select i1 ${condition.value}, i64 ${consequent.value}, i64 ${alternate.value}`
    ],
    value
  };
}
export function emitLazyDefaultValueExpression(
  expression: Extract<JsIrValueExpression, { readonly kind: "lazyDefault" }>,
  context: EmitContext
): JsValue {
  const index = context.logicIndex;
  context.logicIndex += 1;
  const checkLabel = `default.check.${index}`;
  const defaultLabel = `default.value.${index}`;
  const defaultJoinLabel = `default.join.${index}`;
  const endLabel = `default.end.${index}`;
  const current = context.emitValue(expression.value);
  const fallback = context.emitValue(expression.defaultValue);
  const isUndefined = `%cmp.${context.cmpIndex}`;
  context.cmpIndex += 1;
  const value = `%value.${context.numIndex}`;
  context.numIndex += 1;
  return {
    lines: [
      ...current.lines,
      `  br label %${checkLabel}`,
      `${checkLabel}:`,
      `  ${isUndefined} = icmp eq i64 ${current.value}, ${jsValueUndefined}`,
      `  br i1 ${isUndefined}, label %${defaultLabel}, label %${endLabel}`,
      `${defaultLabel}:`,
      ...fallback.lines,
      `  br label %${defaultJoinLabel}`,
      `${defaultJoinLabel}:`,
      `  br label %${endLabel}`,
      `${endLabel}:`,
      `  ${value} = phi i64 [ ${current.value}, %${checkLabel} ], [ ${fallback.value}, %${defaultJoinLabel} ]`
    ],
    value
  };
}
export function emitLogicalValueExpression(
  expression: Extract<JsIrValueExpression, { readonly kind: "logicalValue" }>,
  context: EmitContext
): JsValue {
  const index = context.logicIndex;
  context.logicIndex += 1;
  const leftLabel = `value.logic.left.${index}`;
  const rhsLabel = `value.logic.rhs.${index}`;
  const endLabel = `value.logic.end.${index}`;
  const left = context.emitValue(expression.left);
  const leftTruthy = `%cmp.${context.cmpIndex}`;
  context.cmpIndex += 1;
  const right = context.emitValue(expression.right);
  const value = `%value.${context.numIndex}`;
  context.numIndex += 1;
  let leftTrueLabel = endLabel;
  let leftFalseLabel = rhsLabel;
  if (expression.operator === "&&") {
    leftTrueLabel = rhsLabel;
    leftFalseLabel = endLabel;
  }
  return {
    lines: [
      `  br label %${leftLabel}`,
      `${leftLabel}:`,
      ...left.lines,
      `  ${leftTruthy} = call i1 @valueTruthy(i64 ${left.value})`,
      `  br i1 ${leftTruthy}, label %${leftTrueLabel}, label %${leftFalseLabel}`,
      `${rhsLabel}:`,
      ...right.lines,
      `  br label %${endLabel}`,
      `${endLabel}:`,
      `  ${value} = phi i64 [ ${left.value}, %${leftLabel} ], [ ${right.value}, %${rhsLabel} ]`
    ],
    value
  };
}
export function emitNullishCoalesceValueExpression(
  expression: Extract<JsIrValueExpression, { readonly kind: "nullishCoalesce" }>,
  context: EmitContext
): JsValue {
  const index = context.logicIndex;
  context.logicIndex += 1;
  const leftLabel = `nullish.left.${index}`;
  const checkLabel = `nullish.check.${index}`;
  const rightLabel = `nullish.right.${index}`;
  const joinLabel = `nullish.join.${index}`;
  const endLabel = `nullish.end.${index}`;
  const left = context.emitValue(expression.left);
  const nullish = emitNullishTest(left.value, context);
  const right = context.emitValue(expression.right);
  const value = `%value.${context.numIndex}`;
  context.numIndex += 1;
  return {
    lines: [
      `  br label %${leftLabel}`,
      `${leftLabel}:`,
      ...left.lines,
      `  br label %${checkLabel}`,
      `${checkLabel}:`,
      ...nullish.lines,
      `  br i1 ${nullish.value}, label %${rightLabel}, label %${endLabel}`,
      `${rightLabel}:`,
      ...right.lines,
      `  br label %${joinLabel}`,
      `${joinLabel}:`,
      `  br label %${endLabel}`,
      `${endLabel}:`,
      `  ${value} = phi i64 [ ${left.value}, %${checkLabel} ], [ ${right.value}, %${joinLabel} ]`
    ],
    value
  };
}
export function emitOptionalChainValueExpression(
  expression: Extract<JsIrValueExpression, { readonly kind: "optionalChain" }>,
  context: EmitContext
): JsValue {
  const index = context.logicIndex;
  context.logicIndex += 1;
  const guardLabel = `optional.guard.${index}`;
  const checkLabel = `optional.check.${index}`;
  const accessLabel = `optional.access.${index}`;
  const joinLabel = `optional.join.${index}`;
  const endLabel = `optional.end.${index}`;
  const guard = context.emitValue(expression.guard);
  const nullish = emitNullishTest(guard.value, context);
  context.optionalTargets.push(guard.value);
  const access = context.emitValue(expression.access);
  context.optionalTargets.pop();
  const value = `%value.${context.numIndex}`;
  context.numIndex += 1;
  return {
    lines: [
      `  br label %${guardLabel}`,
      `${guardLabel}:`,
      ...guard.lines,
      `  br label %${checkLabel}`,
      `${checkLabel}:`,
      ...nullish.lines,
      `  br i1 ${nullish.value}, label %${endLabel}, label %${accessLabel}`,
      `${accessLabel}:`,
      ...access.lines,
      `  br label %${joinLabel}`,
      `${joinLabel}:`,
      `  br label %${endLabel}`,
      `${endLabel}:`,
      `  ${value} = phi i64 [ ${jsValueUndefined}, %${checkLabel} ], [ ${access.value}, %${joinLabel} ]`
    ],
    value
  };
}
export function emitRuntimeArrayIncludesCondition(
  expression: Extract<JsIrValueExpression, { readonly kind: "arrayIncludes" }>,
  context: EmitContext
): NumberValue {
  const array = emitRuntimeArrayPointer(expression.arrayName, context);
  const value = context.emitValue(expression.value);
  const name = `%cmp.${context.cmpIndex}`;
  context.cmpIndex += 1;
  return { lines: [...array.lines, ...value.lines, `  ${name} = call i1 @arrayIncludes(ptr ${array.value}, i64 ${value.value})`], value: name };
}


















































































































