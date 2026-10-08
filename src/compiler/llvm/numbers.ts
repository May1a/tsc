import type { JsIrNumberExpression, JsIrNumberOperator } from "../ir/expressions.js";
import { emitRuntimeArrayPointer, emitRuntimeCollectionPointer } from "./layout.js";
import type { EmitContext, NumberValue } from "./context.js";
import { emitGeneratedJsCall } from "./completion.js";
import { emitObjectFieldPointer } from "./paths.js";
import { addStringConstant } from "./strings.js";
import { variablePointerName } from "./names.js";

/**
 * The number expression tier: one function per `JsIrNumberExpression` shape, all returning a
 * `NumberValue`.
 *
 * A `NumberValue` is a `double` in an SSA register plus the lines that produced it, and it is
 * deliberately *not* the value ABI — most numbers here are arithmetic on primitives, and boxing one
 * only to unbox it at the next operation is how the emitter ended up with an `i64` and a `double`
 * for the same program. The exceptions are the ones that already hold a js value: a `Math` call and
 * an index into a runtime array both produce an `i64`, and they convert explicitly.
 *
 * `emitCallArguments` needs the raw `double` for the same reason — it boxes the argument itself, and
 * a `JsValue` would have nothing left to box. That is the reason this tier is reached through
 * `context.emitNumberExpression` rather than called directly, and the reason the scalar tiers could
 * be separated at all.
 */

export function llvmDoubleBitcastOperand(value: string): string {
  if (/^-?\d+$/.test(value)) {
    return `${value}.0`;
  }
  if (/^-?\d+e[+-]?\d+$/i.test(value)) {
    return value.replace(/e/i, ".0e");
  }
  return value;
}
export function llvmDoubleLiteral(value: number): string {
  if (value === Number.POSITIVE_INFINITY) {
    return "0x7FF0000000000000";
  }
  if (value === Number.NEGATIVE_INFINITY) {
    return "0xFFF0000000000000";
  }
  return llvmDoubleBitcastOperand(String(value));
}
// eslint-disable-next-line complexity, max-statements -- Number expression lowering includes temporary runtime array method branches.
export function emitNumberExpression(expression: JsIrNumberExpression, context: EmitContext): NumberValue {
  if (expression.kind === "regexSearch") {
    const regex = context.emitValue(expression.regex);
    const input = context.emitStringExpression(expression.input);
    const inputValue = `%regex.search.input.${context.callIndex}`;
    const call = emitGeneratedJsCall("regexSearch", [`i64 ${regex.value}`, `i64 ${inputValue}`], context);
    const number = `%regex.search.number.${context.numIndex}`;
    context.numIndex += 1;
    return {
      lines: [
        ...regex.lines,
        `  call void @gcRootPush(i64 ${regex.value})`,
        ...input.lines,
        `  ${inputValue} = call i64 @valueBoxString(ptr ${input.value}, i64 ${input.length})`,
        ...call.lines,
        `  ${number} = call double @valueNumber(i64 ${call.value})`
      ],
      value: number
    };
  }
  const simple = emitSimpleNumberExpression(expression, context);
  if (simple !== undefined) {
    return simple;
  }

  if (expression.kind === "call") {
    return context.emitCallExpressionResult(expression);
  }

  if (expression.kind === "arrayPush" || expression.kind === "arrayUnshift") {
    return emitRuntimeArrayAppendNumberExpression(expression, context);
  }

  if (expression.kind === "arrayIndexOf") {
    const array = emitRuntimeArrayPointer(expression.arrayName, context);
    const needle = context.emitValue(expression.value);
    let fromIndex: NumberValue = { lines: [], value: "0" };
    if (expression.fromEnd === true) {
      fromIndex = { lines: [], value: "9223372036854775807" };
    }
    if (expression.fromIndex !== undefined) {
      fromIndex = emitArrayIndex(expression.fromIndex, context);
    }
    const raw = `%arr.index.${context.arrayIndex}`;
    context.arrayIndex += 1;
    const number = `%num.${context.numIndex}`;
    context.numIndex += 1;
    let helper: "arrayIndexOf" | "arrayLastIndexOf" = "arrayIndexOf";
    if (expression.fromEnd === true) {
      helper = "arrayLastIndexOf";
    }
    return { lines: [...array.lines, ...needle.lines, ...fromIndex.lines, `  ${raw} = call i64 @${helper}(ptr ${array.value}, i64 ${needle.value}, i64 ${fromIndex.value})`, `  ${number} = sitofp i64 ${raw} to double`], value: number };
  }

  if (expression.kind === "arrayFindIndex") {
    const array = emitRuntimeArrayPointer(expression.arrayName, context);
    const raw = `%arr.index.${context.arrayIndex}`;
    context.arrayIndex += 1;
    const number = `%num.${context.numIndex}`;
    context.numIndex += 1;
    return { lines: [...array.lines, `  ${raw} = call i64 @arrayFindIndex(ptr ${array.value})`, `  ${number} = sitofp i64 ${raw} to double`], value: number };
  }

  if (expression.kind === "runtimeCollectionSize") {
    const collection = emitRuntimeCollectionPointer(expression.collectionName, context);
    const raw = `%collection.size.${context.arrayIndex}`;
    context.arrayIndex += 1;
    const number = `%num.${context.numIndex}`;
    context.numIndex += 1;
    return { lines: [...collection.lines, `  ${raw} = call i64 @collectionSize(ptr ${collection.value})`, `  ${number} = sitofp i64 ${raw} to double`], value: number };
  }

  if (expression.kind === "valueToNumber") {
    const value = context.emitValue(expression.value);
    const number = `%num.${context.numIndex}`;
    context.numIndex += 1;
    return { lines: [...value.lines, `  ${number} = call double @valueToNumber(i64 ${value.value})`], value: number };
  }

  if (expression.kind === "mathCall") {
    return emitMathCallNumberExpression(expression, context);
  }

  if (expression.kind === "parseInt" || expression.kind === "parseFloat") {
    const source = context.emitStringExpression(expression.value);
    const number = `%num.${context.numIndex}`;
    context.numIndex += 1;
    return { lines: [...source.lines, `  ${number} = call double @${expression.kind}(i64 ${source.length}, ptr ${source.value})`], value: number };
  }

  if (expression.kind === "ternary") {
    return emitTernaryNumberExpression(expression, context);
  }

  if (expression.kind === "update") {
    return emitUpdateNumberExpression(expression, context);
  }

  const aggregate = emitAggregateNumberExpression(expression, context);
  if (aggregate !== undefined) {
    return aggregate;
  }

  if (expression.kind === "unary") {
    const value = context.emitNumberExpression(expression.value);
    const index = context.numIndex;
    context.numIndex += 1;
    const name = `%num.${index}`;
    if (expression.operator === "bitNot") {
      const integer = `%num.i32.${index}`;
      const inverted = `%num.not.${index}`;
      return {
        lines: [...value.lines, `  ${integer} = fptosi double ${value.value} to i32`, `  ${inverted} = xor i32 ${integer}, -1`, `  ${name} = sitofp i32 ${inverted} to double`],
        value: name
      };
    }

    return {
      lines: [...value.lines, `  ${name} = fneg double ${value.value}`],
      value: name
    };
  }

  if (expression.kind !== "binary") {
    // Defensive; see the note at the end of emitValueExpression.
    throw new Error(`Unhandled JsIrNumberExpression variant: ${expression.kind}`);
  }

  const left = context.emitNumberExpression(expression.left);
  const right = context.emitNumberExpression(expression.right);
  const index = context.numIndex;
  context.numIndex += 1;
  const name = `%num.${index}`;
  if (isBitwiseNumberOperator(expression.operator)) {
    return emitBitwiseNumberExpression(expression, left, right, name, index);
  }
  if (expression.operator === "power") {
    return { lines: [...left.lines, ...right.lines, `  ${name} = call double @mathPow(double ${left.value}, double ${right.value})`], value: name };
  }

  return {
    lines: [...left.lines, ...right.lines, `  ${name} = ${llvmNumberOperator(expression.operator)} double ${left.value}, ${right.value}`],
    value: name
  };
}
export function emitUpdateNumberExpression(
  expression: Extract<JsIrNumberExpression, { readonly kind: "update" }>,
  context: EmitContext
): NumberValue {
  const index = context.numIndex;
  context.numIndex += 1;
  const current = `%num.update.current.${index}`;
  const next = `%num.update.next.${index}`;
  const pointer = variablePointerName(expression.name);
  let instruction = "fadd";
  if (expression.operator === "decrement") {
    instruction = "fsub";
  }
  let result = current;
  if (expression.prefix) {
    result = next;
  }
  return {
    lines: [`  ${current} = load double, ptr ${pointer}`, `  ${next} = ${instruction} double ${current}, 1.0`, `  store double ${next}, ptr ${pointer}`],
    value: result
  };
}
export function isBitwiseNumberOperator(operator: JsIrNumberOperator): boolean {
  return operator === "bitAnd" || operator === "bitOr" || operator === "bitXor" || operator === "shiftLeft" || operator === "shiftRight" || operator === "shiftRightUnsigned";
}
export function emitBitwiseNumberExpression(
  expression: Extract<JsIrNumberExpression, { readonly kind: "binary" }>,
  left: NumberValue,
  right: NumberValue,
  name: string,
  index: number
): NumberValue {
  const leftInt = `%num.left.i32.${index}`;
  const rightInt = `%num.right.i32.${index}`;
  const raw = `%num.bitwise.${index}`;
  const resultInstruction = bitwiseInstruction(expression.operator);
  let conversion = `sitofp i32 ${raw} to double`;
  if (expression.operator === "shiftRightUnsigned") {
    conversion = `uitofp i32 ${raw} to double`;
  }
  return {
    lines: [
      ...left.lines,
      ...right.lines,
      `  ${leftInt} = fptosi double ${left.value} to i32`,
      `  ${rightInt} = fptosi double ${right.value} to i32`,
      `  ${raw} = ${resultInstruction} i32 ${leftInt}, ${rightInt}`,
      `  ${name} = ${conversion}`
    ],
    value: name
  };
}
export function bitwiseInstruction(operator: JsIrNumberOperator): string {
  switch (operator) {
    case "bitAnd": { return "and"; }
    case "bitOr": { return "or"; }
    case "bitXor": { return "xor"; }
    case "shiftLeft": { return "shl"; }
    case "shiftRight": { return "ashr"; }
    case "shiftRightUnsigned": { return "lshr"; }
    default: { throw new Error("Unsupported bitwise operator"); }
  }
}
export function emitRuntimeArrayAppendNumberExpression(
  expression: Extract<JsIrNumberExpression, { readonly kind: "arrayPush" | "arrayUnshift" }>,
  context: EmitContext
): NumberValue {
  const array = emitRuntimeArrayPointer(expression.arrayName, context);
  const values = expression.values.map((value) => context.emitValue(value));
  const lines = [...array.lines];
  const helper = arrayNumberAppendHelper(expression.kind);
  let result = "0";
  for (const value of values) {
    const index = context.arrayIndex;
    context.arrayIndex += 1;
    result = `%arr.method.${index}`;
    lines.push(...value.lines, `  ${result} = call i64 @${helper}(ptr ${array.value}, i64 ${value.value})`);
  }
  const { numIndex } = context;
  context.numIndex += 1;
  const number = `%num.${numIndex}`;
  lines.push(`  ${number} = uitofp i64 ${result} to double`);
  return { lines, value: number };
}
// eslint-disable-next-line complexity, max-statements -- Math lowering dispatches the supported static runtime surface in one place.
export function emitMathCallNumberExpression(
  expression: Extract<JsIrNumberExpression, { readonly kind: "mathCall" }>,
  context: EmitContext
): NumberValue {
  const args = expression.arguments.map((argument) => context.emitNumberExpression(argument));
  const number = `%num.${context.numIndex}`;
  context.numIndex += 1;
  const lines = args.flatMap((argument) => argument.lines);
  if (expression.method === "min" || expression.method === "max") {
    if (args.length === 0) {
      if (expression.method === "min") {
        return { lines, value: "0x7FF0000000000000" };
      }
      return { lines, value: "0xFFF0000000000000" };
    }
    let helper: "mathMax2" | "mathMin2" = "mathMax2";
    if (expression.method === "min") {
      helper = "mathMin2";
    }
    let current = args[0].value;
    for (let i = 1; i < args.length; i++) {
      const next = `%num.${context.numIndex}`;
      context.numIndex += 1;
      lines.push(`  ${next} = call double @${helper}(double ${current}, double ${args[i].value})`);
      current = next;
    }
    return { lines, value: current };
  }
  if (expression.method === "pow") {
    const base = args[0]?.value ?? "0.0";
    const exponent = args[1]?.value ?? "0.0";
    return { lines: [...lines, `  ${number} = call double @mathPow(double ${base}, double ${exponent})`], value: number };
  }
  if (expression.method === "hypot") {
    const left = args[0]?.value ?? "0.0";
    const right = args[1]?.value ?? "0.0";
    return { lines: [...lines, `  ${number} = call double @mathHypot2(double ${left}, double ${right})`], value: number };
  }
  if (expression.method === "imul") {
    const left = args[0]?.value ?? "0.0";
    const right = args[1]?.value ?? "0.0";
    return { lines: [...lines, `  ${number} = call double @mathImul(double ${left}, double ${right})`], value: number };
  }
  if (expression.method === "random") {
    return { lines: [...lines, `  ${number} = call double @mathRandom()`], value: number };
  }
  const helperByMethod = {
    abs: "mathAbs",
    floor: "mathFloor",
    ceil: "mathCeil",
    trunc: "mathTrunc",
    round: "mathRound",
    sqrt: "mathSqrt",
    cbrt: "mathCbrt",
    exp: "mathExp",
    log: "mathLog",
    log2: "mathLog2",
    log10: "mathLog10",
    fround: "mathFround",
    clz32: "mathClz32",
    sin: "mathSin",
    cos: "mathCos",
    tan: "mathTan",
    sign: "mathSign"
  } as const;
  const helper = helperByMethod[expression.method];
  const argument = args[0]?.value ?? "0.0";
  return { lines: [...lines, `  ${number} = call double @${helper}(double ${argument})`], value: number };
}
export function arrayNumberAppendHelper(kind: "arrayPush" | "arrayUnshift"): "arrayPush" | "arrayUnshift" {
  if (kind === "arrayPush") {
    return "arrayPush";
  }
  return "arrayUnshift";
}
// eslint-disable-next-line max-statements -- Pre-existing aggregate number expression dispatch centralizes array/object/math branches in one place.
export function emitAggregateNumberExpression(
  expression: JsIrNumberExpression,
  context: EmitContext
): NumberValue | undefined {
  if (expression.kind === "arrayAccess") {
    const pointer = emitArrayElementPointer(expression.arrayName, expression.index, context);
    const index = context.numIndex;
    context.numIndex += 1;
    const name = `%num.${index}`;
    return { lines: [...pointer.lines, `  ${name} = load double, ptr ${pointer.value}`], value: name };
  }

  if (expression.kind === "arrayLength") {
    const binding = context.bindings.get(expression.arrayName);
    if (binding?.kind === "array") {
      return { lines: [], value: llvmDoubleLiteral(binding.length) };
    }
    if (binding?.kind === "runtimeArray") {
      const array = emitRuntimeArrayPointer(expression.arrayName, context);
      const index = context.numIndex;
      context.numIndex += 1;
      const length = `%arr.len.${index}`;
      const value = `%num.${index}`;
      return { lines: [...array.lines, `  ${length} = call i64 @arrayLength(ptr ${array.value})`, `  ${value} = uitofp i64 ${length} to double`], value };
    }
  }

  if (expression.kind === "valueArrayLength") {
    const receiver = context.emitValue(expression.value);
    const index = context.numIndex;
    context.numIndex += 1;
    const length = `%arr.len.${index}`;
    const value = `%num.${index}`;
    return { lines: [...receiver.lines, `  ${length} = call i64 @valueArrayLength(i64 ${receiver.value})`, `  ${value} = uitofp i64 ${length} to double`], value };
  }

  if (expression.kind === "valueLength") {
    const receiver = context.emitValue(expression.value);
    const index = context.numIndex;
    context.numIndex += 1;
    const length = `%value.len.${index}`;
    const value = `%num.${index}`;
    return { lines: [...receiver.lines, `  ${length} = call i64 @valueLength(i64 ${receiver.value})`, `  ${value} = uitofp i64 ${length} to double`], value };
  }

  if (expression.kind === "valueObjectLength") {
    const receiver = context.emitValue(expression.value);
    const index = context.numIndex;
    context.numIndex += 1;
    const raw = `%obj.len.${index}`;
    const value = `%num.${index}`;
    const lengthKey = addStringConstant("length", context);
    return {
      lines: [...receiver.lines, `  ${raw} = call i64 @valuePropertyGet(i64 ${receiver.value}, i64 6, ptr ${lengthKey})`, `  ${value} = sitofp i64 ${raw} to double`],
      value
    };
  }

  if (expression.kind === "objectAccess") {
    return emitObjectNumberExpression(expression, context);
  }

  return undefined;
}
export function emitObjectNumberExpression(
  expression: Extract<JsIrNumberExpression, { readonly kind: "objectAccess" }>,
  context: EmitContext
): NumberValue | undefined {
  const pointer = emitObjectFieldPointer(expression.objectName, expression.path, context);
  const index = context.numIndex;
  context.numIndex += 1;
  const name = `%num.${index}`;
  if (pointer === undefined) {
    return undefined;
  }
  return { lines: [...pointer.lines, `  ${name} = load double, ptr ${pointer.value}`], value: name };
}
export function emitArrayElementPointer(
  arrayName: string,
  indexExpression: JsIrNumberExpression,
  context: EmitContext
): NumberValue {
  const binding = context.bindings.get(arrayName);
  let arrayPointer = arrayName;
  let length = 0;
  if (binding?.kind === "array") {
    const { name, length: arrayLength } = binding;
    arrayPointer = name;
    length = arrayLength;
  }
  const index = emitArrayIndex(indexExpression, context);
  const gepIndex = context.arrayIndex;
  context.arrayIndex += 1;
  const name = `%arr.gep.${gepIndex}`;
  return {
    lines: [...index.lines, `  ${name} = getelementptr [${length} x double], ptr ${arrayPointer}, i64 0, i64 ${index.value}`],
    value: name
  };
}
export function emitArrayIndex(expression: JsIrNumberExpression, context: EmitContext): NumberValue {
  if (expression.kind === "literal") {
    return { lines: [], value: String(expression.value) };
  }
  const number = context.emitNumberExpression(expression);
  const index = context.arrayIndex;
  context.arrayIndex += 1;
  const name = `%arr.idx.${index}`;
  return { lines: [...number.lines, `  ${name} = fptosi double ${number.value} to i64`], value: name };
}
export function emitSimpleNumberExpression(
  expression: JsIrNumberExpression,
  context: EmitContext
): NumberValue | undefined {
  if (expression.kind === "literal") {
    return {
      lines: [],
      value: llvmDoubleLiteral(expression.value)
    };
  }

  if (expression.kind === "nan") {
    return {
      lines: [],
      value: "0x7FF4000000000000"
    };
  }

  if (expression.kind === "negatedZero") {
    return {
      lines: [],
      value: "0x8000000000000000"
    };
  }

  if (expression.kind === "parameter") {
    const binding = context.bindings.get(expression.name);
    if (binding?.kind === "number" && binding.value.kind === "parameter") {
      return {
        lines: [],
        value: binding.value.name
      };
    }
    return {
      lines: [],
      value: expression.name
    };
  }

  if (expression.kind !== "variable") {
    return undefined;
  }

  const binding = context.bindings.get(expression.name);
  let pointer = expression.name;
  if (binding?.kind === "number" && binding.value.kind === "variable") {
    pointer = binding.value.name;
  }
  const index = context.numIndex;
  context.numIndex += 1;
  const name = `%num.${index}`;

  return {
    lines: [`  ${name} = load double, ptr ${pointer}`],
    value: name
  };
}
export function emitTernaryNumberExpression(
  expression: Extract<JsIrNumberExpression, { readonly kind: "ternary" }>,
  context: EmitContext
): NumberValue {
  const condition = context.emitCondition(expression.condition);
  const consequent = context.emitNumberExpression(expression.consequent);
  const alternate = context.emitNumberExpression(expression.alternate);
  const index = context.numIndex;
  context.numIndex += 1;
  const name = `%num.${index}`;

  return {
    lines: [
      ...condition.lines,
      ...consequent.lines,
      ...alternate.lines,
      `  ${name} = select i1 ${condition.value}, double ${consequent.value}, double ${alternate.value}`
    ],
    value: name
  };
}
export function llvmNumberOperator(operator: JsIrNumberOperator): string {
  switch (operator) {
    case "add": {
      return "fadd";
    }
    case "subtract": {
      return "fsub";
    }
    case "multiply": {
      return "fmul";
    }
    case "divide": {
      return "fdiv";
    }
    case "remainder": {
      return "frem";
    }
    case "bitAnd":
    case "bitOr":
    case "bitXor":
    case "shiftLeft":
    case "shiftRight":
    case "shiftRightUnsigned": {
      throw new Error("Bitwise operators are emitted through integer lowering");
    }
    case "power": {
      throw new Error("Power operator is emitted through mathPow");
    }
    default: {
      const unsupported: never = operator;
      throw new Error(`Unsupported number operator: ${String(unsupported)}`);
    }
  }
}
