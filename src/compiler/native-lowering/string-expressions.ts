import type { ResolvedStringExpression } from "../binding-resolution/index.js";
import { type VariantHandlers, type VariantOfKind, dispatchKind } from "../dispatch.js";
import { type LlvmValue, llvm } from "../llvm-ir/index.js";
import { branchValue } from "./expression-branches.js";
import { type ExpressionContext, type NativeString, boxString } from "./expression-context.js";
import { numberIndex } from "./numbers.js";

type StringNode<K extends ResolvedStringExpression["kind"]> = VariantOfKind<ResolvedStringExpression, K>;
type StringVariants = { readonly [K in ResolvedStringExpression["kind"]]: StringNode<K> };
const unaryHelpers = {
  trim: "stringTrim", trimStart: "stringTrimStart", trimEnd: "stringTrimEnd", toUpperCase: "stringToUpperCase",
  toLowerCase: "stringToLowerCase", normalize: "stringNormalize"
} as const;
const formatHelpers = { toFixed: "numberToFixed", toPrecision: "numberToPrecision", toExponential: "numberToExponential", toString: "numberToStringRadix" } as const;
const formatDefaults = { toFixed: 0, toPrecision: 6, toExponential: 6, toString: 10 } as const;

function literal(value: string, context: ExpressionContext): NativeString {
  const block = context.cursor.currentBlock();
  return {
    bytes: block.globalPointer(context.stringConstant(value)),
    length: block.int(llvm.i64, BigInt(new TextEncoder().encode(value).length))
  };
}

export function stringFromValue(value: LlvmValue<typeof llvm.i64>, context: ExpressionContext): NativeString {
  context.roots.push(value);
  const bytes = context.runtime.callPointer("valueStringPtr", [value], context.cursor.uniqueName("string.bytes"));
  const length = context.runtime.call("valueStringLength", [value], context.cursor.uniqueName("string.length"));
  return { bytes, length };
}

function stringMethod(expression: StringNode<"stringMethod">, context: ExpressionContext): NativeString {
  const receiver = context.expressions.string(expression.receiver);
  boxString(receiver, context);
  const prefix = [receiver.length, receiver.bytes];
  const { method } = expression;
  const name = context.cursor.uniqueName(`string.${method}`);
  switch (method) {
    case "trim": case "trimStart": case "trimEnd": case "toUpperCase": case "toLowerCase": case "normalize": {
      return context.runtime.callString(unaryHelpers[method], prefix, name);
    }
    case "repeat": {
      const count = numberIndex(expression.count ?? { kind: "literal", value: 0 }, context);
      return context.runtime.callString("stringRepeat", [...prefix, count], name);
    }
    case "replace": case "replaceAll": {
      return replace(expression, prefix, context, name);
    }
    case "padStart": case "padEnd": {
      return pad(expression, prefix, context, name);
    }
    case "at": case "charAt": {
      const position = numberIndex(expression.position ?? { kind: "literal", value: 0 }, context);
      return context.runtime.callString(method === "at" ? "stringAt" : "stringCharAt", [...prefix, position], name);
    }
    case "slice": case "substring": case "substr": {
      return range(expression, prefix, context, name);
    }
    default: {
      const exhaustive: never = method;
      throw new Error(`Unknown string method ${String(exhaustive)}`);
    }
  }
}

function replace(expression: StringNode<"stringMethod">, prefix: readonly LlvmValue[], context: ExpressionContext, name: string): NativeString {
  const search = context.expressions.string(expression.search ?? { kind: "literal", value: "" });
  boxString(search, context);
  const replacement = context.expressions.string(expression.replacement ?? { kind: "literal", value: "" });
  return context.runtime.callString(expression.method === "replace" ? "stringReplace" : "stringReplaceAll",
    [...prefix, search.length, search.bytes, replacement.length, replacement.bytes], name);
}

function pad(expression: StringNode<"stringMethod">, prefix: readonly LlvmValue[], context: ExpressionContext, name: string): NativeString {
  const length = numberIndex(expression.targetLength ?? { kind: "literal", value: 0 }, context);
  const padding = context.expressions.string(expression.padString ?? { kind: "literal", value: " " });
  return context.runtime.callString(expression.method === "padStart" ? "stringPadStart" : "stringPadEnd",
    [...prefix, length, padding.length, padding.bytes], name);
}

function range(expression: StringNode<"stringMethod">, prefix: readonly LlvmValue[], context: ExpressionContext, name: string): NativeString {
  const start = numberIndex(expression.start ?? { kind: "literal", value: 0 }, context);
  const end = numberIndex(expression.end ?? { kind: "literal", value: Number.MAX_SAFE_INTEGER }, context);
  const remainderHelper = expression.method === "substring" ? "stringSubstring" : "stringSubstr";
  const helper = expression.method === "slice" ? "stringSlice" : remainderHelper;
  return context.runtime.callString(helper, [...prefix, start, end], name);
}

function fromCharCode(expression: StringNode<"stringFromCharCode">, context: ExpressionContext): NativeString {
  const block = context.cursor.currentBlock();
  const count = block.int(llvm.i64, BigInt(expression.codes.length));
  const codes = block.allocaArray(llvm.i64, count, context.cursor.uniqueName("string.codes"));
  for (const [index, code] of expression.codes.entries()) {
    const number = context.expressions.number(code);
    const integer = context.runtime.call("numberToInt32", [number], context.cursor.uniqueName("code.integer"));
    const current = context.cursor.currentBlock();
    const utf16 = current.and(integer, current.int(llvm.i32, 65_535n), context.cursor.uniqueName("code.utf16"));
    const widened = current.cast("zext", utf16, llvm.i64, context.cursor.uniqueName("code.word"));
    const slot = current.getElementPtr(llvm.i64, codes, [{ type: llvm.i64, value: BigInt(index) }], context.cursor.uniqueName("code.slot"));
    current.store(widened, slot);
  }
  return context.runtime.callString("stringFromCharCode", [codes, count], context.cursor.uniqueName("string.from.codes"));
}

function regexReplace(expression: StringNode<"regexReplace">, context: ExpressionContext): NativeString {
  const receiver = boxString(context.expressions.string(expression.receiver), context);
  const regex = context.expressions.value(expression.regex);
  context.roots.push(regex);
  const replacement = boxString(context.expressions.string(expression.replacement), context);
  const result = context.runtime.callWithCompletion("regexReplace", [regex, receiver, replacement],
    context.cursor.uniqueName("regex.replace"), context.exceptionTarget());
  return stringFromValue(result, context);
}

const handlers: VariantHandlers<StringVariants, ExpressionContext, NativeString> = {
  literal: (expression, context) => literal(expression.value, context),
  typeof: (expression, context) => literal(expression.value, context),
  variable: (expression, context) => context.bindings.string(expression.name),
  call: (expression, context) => stringFromValue(context.calls.direct(expression), context),
  taggedTemplate: (expression, context) => stringFromValue(context.calls.tagged(expression), context),
  ternary: (expression, context) => {
    const condition = context.expressions.condition(expression.condition);
    const result = branchValue(context.cursor, condition, llvm.i64,
      () => boxString(context.expressions.string(expression.consequent), context),
      () => boxString(context.expressions.string(expression.alternate), context), "string.ternary");
    const value = context.values.forBlock(context.cursor.currentBlock()).fromBoundary(result);
    return stringFromValue(value, context);
  },
  concat: (expression, context) => {
    const left = context.expressions.string(expression.left);
    boxString(left, context);
    const right = context.expressions.string(expression.right);
    const bytes = context.runtime.callPointer("strConcat", [left.length, left.bytes, right.length, right.bytes], context.cursor.uniqueName("string.concat"));
    const length = context.cursor.currentBlock().add(left.length, right.length, context.cursor.uniqueName("string.length"));
    return { bytes, length };
  },
  arrayJoin: (expression, context) => {
    const array = context.bindings.pointer(expression.arrayName);
    const separator = context.expressions.string(expression.separator);
    const bytes = context.runtime.callPointer("arrayJoin", [array, separator.length, separator.bytes], context.cursor.uniqueName("array.join"));
    const length = context.runtime.call("strlen", [bytes], context.cursor.uniqueName("string.length"));
    return { bytes, length };
  },
  stringConversion: (expression, context) => context.runtime.callString("valueToString",
    [context.expressions.value(expression.value)], context.cursor.uniqueName("string.coerce")),
  stringMethod, stringFromCharCode: fromCharCode, regexReplace,
  numberFormat: (expression, context) => {
    const receiver = context.expressions.number(expression.receiver);
    const argument = context.expressions.number(expression.argument ?? { kind: "literal", value: formatDefaults[expression.method] });
    return context.runtime.callString(formatHelpers[expression.method], [receiver, argument], context.cursor.uniqueName("number.format"));
  },
  errorToString: (expression, context) => context.runtime.callString("errorToString", [context.bindings.pointer(expression.objectName)],
    context.cursor.uniqueName("error.string"))
};

export function lowerString(expression: ResolvedStringExpression, context: ExpressionContext): NativeString {
  return dispatchKind(handlers, expression, context);
}
