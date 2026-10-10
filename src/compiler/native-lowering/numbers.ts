import type { ResolvedNumberExpression } from "../binding-resolution/index.js";
import { type VariantHandlers, type VariantOfKind, dispatchKind } from "../dispatch.js";
import { type LlvmBlockBuilder, type LlvmValue, llvm } from "../llvm-ir/index.js";
import type { ExpressionContext } from "./expression-context.js";
import { branchValue } from "./expression-branches.js";

type NumberNode<K extends ResolvedNumberExpression["kind"]> = VariantOfKind<ResolvedNumberExpression, K>;
type NumberVariants = { readonly [K in ResolvedNumberExpression["kind"]]: NumberNode<K> };
type NumberValue = LlvmValue<typeof llvm.double>;

export function numberIndex(expression: ResolvedNumberExpression, context: ExpressionContext): LlvmValue<typeof llvm.i64> {
  const number = context.expressions.number(expression);
  return context.runtime.call("numberToIndex", [number], context.cursor.uniqueName("index"));
}

function binary(expression: NumberNode<"binary">, context: ExpressionContext): NumberValue {
  const left = context.expressions.number(expression.left);
  const right = context.expressions.number(expression.right);
  const block = context.cursor.currentBlock();
  const name = context.cursor.uniqueName("number.binary");
  switch (expression.operator) {
    case "add": { return block.fadd(left, right, name); }
    case "subtract": { return block.fsub(left, right, name); }
    case "multiply": { return block.fmul(left, right, name); }
    case "divide": { return block.fdiv(left, right, name); }
    case "remainder": { return block.frem(left, right, name); }
    case "power": { return context.runtime.call("mathPow", [left, right], name); }
    case "bitAnd": case "bitOr": case "bitXor": case "shiftLeft": case "shiftRight": case "shiftRightUnsigned": {
      const a = context.runtime.call("numberToInt32", [left], context.cursor.uniqueName("integer.left"));
      const b = context.runtime.call("numberToInt32", [right], context.cursor.uniqueName("integer.right"));
      const shift = block.and(b, block.int(llvm.i32, 31n), context.cursor.uniqueName("shift.count"));
      const result = bitwise(expression.operator, a, b, shift, block, name);
      return block.cast(expression.operator === "shiftRightUnsigned" ? "uitofp" : "sitofp", result, llvm.double,
        context.cursor.uniqueName("number.bitwise"));
    }
    default: {
      const exhaustive: never = expression.operator;
      throw new Error(`Unknown number operator ${String(exhaustive)}`);
    }
  }
}

function bitwise(
  operator: "bitAnd" | "bitOr" | "bitXor" | "shiftLeft" | "shiftRight" | "shiftRightUnsigned",
  left: LlvmValue<typeof llvm.i32>, right: LlvmValue<typeof llvm.i32>, shift: LlvmValue<typeof llvm.i32>,
  block: LlvmBlockBuilder, name: string
): LlvmValue<typeof llvm.i32> {
  switch (operator) {
    case "bitAnd": { return block.and(left, right, name); }
    case "bitOr": { return block.or(left, right, name); }
    case "bitXor": { return block.xor(left, right, name); }
    case "shiftLeft": { return block.shiftLeft(left, shift, name); }
    case "shiftRight": { return block.shiftRightArithmetic(left, shift, name); }
    case "shiftRightUnsigned": { return block.shiftRightLogical(left, shift, name); }
    default: {
      const exhaustive: never = operator;
      throw new Error(`Unknown bitwise operator ${String(exhaustive)}`);
    }
  }
}

function unary(expression: NumberNode<"unary">, context: ExpressionContext): NumberValue {
  const value = context.expressions.number(expression.value);
  if (expression.operator === "negate") {
    return context.cursor.currentBlock().fneg(value, context.cursor.uniqueName("number.negate"));
  }
  const integer = context.runtime.call("numberToInt32", [value], context.cursor.uniqueName("integer"));
  const block = context.cursor.currentBlock();
  const inverted = block.xor(integer, block.int(llvm.i32, -1n), context.cursor.uniqueName("integer.not"));
  return block.cast("sitofp", inverted, llvm.double, context.cursor.uniqueName("number.not"));
}

function update(expression: NumberNode<"update">, context: ExpressionContext): NumberValue {
  const current = context.bindings.number(expression.name);
  const block = context.cursor.currentBlock();
  const next = expression.operator === "increment"
    ? block.fadd(current, block.double(1), context.cursor.uniqueName("number.increment"))
    : block.fsub(current, block.double(1), context.cursor.uniqueName("number.decrement"));
  context.bindings.storeNumber(expression.name, next);
  return expression.prefix ? next : current;
}

const unaryMath = {
  abs: "mathAbs", floor: "mathFloor", ceil: "mathCeil", trunc: "mathTrunc", round: "mathRound", sqrt: "mathSqrt",
  cbrt: "mathCbrt", exp: "mathExp", log: "mathLog", log2: "mathLog2", log10: "mathLog10", fround: "mathFround",
  clz32: "mathClz32", sin: "mathSin", cos: "mathCos", tan: "mathTan", sign: "mathSign"
} as const;
const binaryMath = { pow: "mathPow", hypot: "mathHypot2", imul: "mathImul" } as const;

function math(expression: NumberNode<"mathCall">, context: ExpressionContext): NumberValue {
  const args = expression.arguments.map((argument) => context.expressions.number(argument));
  const { method } = expression;
  if (method === "min" || method === "max") {
    const identity = context.cursor.currentBlock().double(method === "min" ? Infinity : -Infinity);
    let result = identity;
    for (const argument of args) {
      result = context.runtime.call(method === "min" ? "mathMin2" : "mathMax2", [result, argument], context.cursor.uniqueName(`math.${method}`));
    }
    return result;
  }
  if (method === "random") return context.runtime.call("mathRandom", [], context.cursor.uniqueName("math.random"));
  const missing = context.cursor.currentBlock().double(Number.NaN);
  if (method === "pow" || method === "hypot" || method === "imul") {
    return context.runtime.call(binaryMath[method], [args.at(0) ?? missing, args.at(1) ?? missing], context.cursor.uniqueName(`math.${method}`));
  }
  return context.runtime.call(unaryMath[method], [args.at(0) ?? missing], context.cursor.uniqueName(`math.${method}`));
}

function rawLength(raw: LlvmValue<typeof llvm.i64>, context: ExpressionContext): NumberValue {
  return context.cursor.currentBlock().cast("uitofp", raw, llvm.double, context.cursor.uniqueName("number.length"));
}

function append(expression: NumberNode<"arrayPush" | "arrayUnshift">, context: ExpressionContext): NumberValue {
  const array = context.bindings.pointer(expression.arrayName);
  const initial = context.runtime.call("arrayLength", [array], context.cursor.uniqueName("array.length"));
  for (const expressionValue of expression.values) {
    const value = context.expressions.value(expressionValue);
    context.runtime.call(expression.kind === "arrayPush" ? "arrayPush" : "arrayUnshift", [array, value],
      context.cursor.uniqueName("array.append"));
  }
  return rawLength(expression.values.length === 0 ? initial
    : context.runtime.call("arrayLength", [array], context.cursor.uniqueName("array.length")), context);
}

function search(expression: NumberNode<"arrayIndexOf">, context: ExpressionContext): NumberValue {
  const array = context.bindings.pointer(expression.arrayName);
  const value = context.expressions.value(expression.value);
  context.roots.push(value);
  const from = expression.fromIndex === undefined
    ? context.cursor.currentBlock().int(llvm.i64, expression.fromEnd ? 9_223_372_036_854_775_807n : 0n)
    : numberIndex(expression.fromIndex, context);
  const index = context.runtime.call(expression.fromEnd ? "arrayLastIndexOf" : "arrayIndexOf", [array, value, from],
    context.cursor.uniqueName("array.index"));
  return context.cursor.currentBlock().cast("sitofp", index, llvm.double, context.cursor.uniqueName("number.index"));
}

function objectLength(expression: NumberNode<"valueObjectLength">, context: ExpressionContext): NumberValue {
  const receiver = context.expressions.value(expression.value);
  context.roots.push(receiver);
  const block = context.cursor.currentBlock();
  const key = block.globalPointer(context.stringConstant("length"));
  const value = context.runtime.callWithCompletion("checkedValuePropertyGet", [receiver, block.int(llvm.i64, 6n), key],
    context.cursor.uniqueName("object.length"), context.exceptionTarget());
  return context.runtime.call("valueToNumber", [value], context.cursor.uniqueName("number.length"));
}

function regexSearch(expression: NumberNode<"regexSearch">, context: ExpressionContext): NumberValue {
  const regex = context.expressions.value(expression.regex);
  context.roots.push(regex);
  const input = context.expressions.string(expression.input);
  const boxed = context.runtime.callBoxed("valueBoxString", [input.bytes, input.length], context.cursor.uniqueName("search.input"));
  context.roots.push(boxed);
  const result = context.runtime.callWithCompletion("regexSearch", [regex, boxed], context.cursor.uniqueName("regex.search"), context.exceptionTarget());
  return context.runtime.call("valueToNumber", [result], context.cursor.uniqueName("number.search"));
}

const handlers: VariantHandlers<NumberVariants, ExpressionContext, NumberValue> = {
  literal: (expression, context) => context.cursor.currentBlock().double(expression.value),
  nan: (_expression, context) => context.cursor.currentBlock().double(Number.NaN),
  negatedZero: (_expression, context) => context.cursor.currentBlock().double(-0),
  parameter: (expression, context) => context.bindings.number(expression.name),
  variable: (expression, context) => context.bindings.number(expression.name),
  unary, binary, update, mathCall: math,
  ternary: (expression, context) => branchValue(context.cursor, context.expressions.condition(expression.condition), llvm.double,
    () => context.expressions.number(expression.consequent), () => context.expressions.number(expression.alternate), "number.ternary"),
  call: (expression, context) => {
    const result = context.calls.direct(expression);
    return context.values.forBlock(context.cursor.currentBlock()).unboxNumber(result);
  },
  arrayAccess: (expression, context) => {
    const index = numberIndex(expression.index, context);
    const pointer = context.bindings.arrayElement(expression.arrayName, index);
    return context.cursor.currentBlock().load(llvm.double, pointer, context.cursor.uniqueName("array.element"));
  },
  arrayLength: (expression, context) => {
    const fixed = context.bindings.fixedArrayLength(expression.arrayName);
    return fixed === undefined
      ? rawLength(context.runtime.call("arrayLength", [context.bindings.pointer(expression.arrayName)], context.cursor.uniqueName("array.length")), context)
      : context.cursor.currentBlock().double(fixed);
  },
  valueArrayLength: (expression, context) => rawLength(context.runtime.call("valueArrayLength",
    [context.expressions.value(expression.value)], context.cursor.uniqueName("array.length")), context),
  valueLength: (expression, context) => rawLength(context.runtime.call("valueLength",
    [context.expressions.value(expression.value)], context.cursor.uniqueName("value.length")), context),
  valueObjectLength: objectLength,
  objectAccess: (expression, context) => context.cursor.currentBlock().load(llvm.double,
    context.bindings.objectField(expression.objectName, expression.path), context.cursor.uniqueName("object.field")),
  arrayPush: append, arrayUnshift: append, arrayIndexOf: search,
  arrayFindIndex: (expression, context) => {
    const index = context.runtime.call("arrayFindIndex", [context.bindings.pointer(expression.arrayName)], context.cursor.uniqueName("array.index"));
    return context.cursor.currentBlock().cast("sitofp", index, llvm.double, context.cursor.uniqueName("number.index"));
  },
  runtimeCollectionSize: (expression, context) => rawLength(context.runtime.call("collectionSize",
    [context.bindings.pointer(expression.collectionName)], context.cursor.uniqueName("collection.size")), context),
  valueToNumber: (expression, context) => context.runtime.call("valueToNumber", [context.expressions.value(expression.value)],
    context.cursor.uniqueName("number.coerce")),
  parseInt: (expression, context) => {
    const value = context.expressions.string(expression.value);
    return context.runtime.call("parseInt", [value.length, value.bytes], context.cursor.uniqueName("number.parse"));
  },
  parseFloat: (expression, context) => {
    const value = context.expressions.string(expression.value);
    return context.runtime.call("parseFloat", [value.length, value.bytes], context.cursor.uniqueName("number.parse"));
  },
  regexSearch
};

export function lowerNumber(expression: ResolvedNumberExpression, context: ExpressionContext): NumberValue {
  return dispatchKind(handlers, expression, context);
}
