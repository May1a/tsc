import type { JsIrNumberExpression, JsIrStringExpression, JsIrValueExpression } from "../ir/expressions.js";
import { bindingSlotName, stringLengthPointerName, variablePointerName } from "./names.js";
import type { EmitContext, NumberValue, StringValue } from "./context.js";
import { emitGeneratedJsCall, emitRootStackPush } from "./completion.js";
import { emitRuntimeArrayPointer, emitRuntimeObjectPointer } from "./layout.js";
import { emitArrayIndex } from "./numbers.js";
import { addStringConstant, utf8ByteLength } from "./strings.js";

/**
 * The string expression tier: one function per `JsIrStringExpression` shape.
 *
 * A `StringValue` carries a `ptr` to a NUL-terminated buffer *and* its byte length, because LLVM
 * strings are not counted and every runtime helper that takes one wants the length separately. That
 * is the whole reason this is a distinct tier from numbers rather than a special case of them.
 *
 * The tagged-template case is here rather than in the argument ABI because a template is a string
 * expression that happens to have interpolations, and the interpolations are ordinary values — so it
 * reduces to concatenating the cooked strings and the evaluated expressions in order.
 *
 * Reached through `context.emitStringExpression` rather than called directly, because
 * `emitCallArguments` needs the raw `StringValue` to box it and the two would otherwise name each
 * other with nothing to break the cycle.
 */

// JS string index arguments convert NaN to zero before clamping; fptosi on NaN
// is poison in LLVM, so the conversion is guarded explicitly.
export function emitStringIndexArgument(expression: JsIrNumberExpression, context: EmitContext): NumberValue {
  if (expression.kind === "literal") {
    return { lines: [], value: String(expression.value) };
  }
  const number = context.emitNumberExpression(expression);
  const index = context.arrayIndex;
  context.arrayIndex += 1;
  const nanCheck = `%arr.idx.nan.${index}`;
  const safe = `%arr.idx.safe.${index}`;
  const name = `%arr.idx.${index}`;
  return {
    lines: [
      ...number.lines,
      `  ${nanCheck} = fcmp uno double ${number.value}, ${number.value}`,
      `  ${safe} = select i1 ${nanCheck}, double 0.0, double ${number.value}`,
      `  ${name} = fptosi double ${safe} to i64`
    ],
    value: name
  };
}
// eslint-disable-next-line complexity, max-statements -- Runtime string expression emission is centralized during the JSValue transition.
export function emitStringExpression(expression: JsIrStringExpression, context: EmitContext): StringValue {
  if (expression.kind === "literal") {
    return { lines: [], value: addStringConstant(expression.value, context), length: String(utf8ByteLength(expression.value)) };
  }

  if (expression.kind === "variable") {
    const index = context.stringIndex;
    context.stringIndex += 1;
    const name = `%str.${index}`;
    const length = `%str.len.${index}`;
    const slotName = bindingSlotName(expression.name, context.bindings.get(expression.name));
    return {
      lines: [
        `  ${name} = load ptr, ptr ${variablePointerName(slotName)}`,
        `  ${length} = load i64, ptr ${stringLengthPointerName(slotName)}`
      ],
      value: name,
      length
    };
  }

  if (expression.kind === "concat") {
    return emitConcatStringExpression(expression, context);
  }

  if (expression.kind === "call") {
    return context.emitStringCallExpressionResult(expression);
  }

  if (expression.kind === "arrayJoin") {
    const array = emitRuntimeArrayPointer(expression.arrayName, context);
    const separator = context.emitStringExpression(expression.separator);
    const name = `%str.${context.stringIndex}`;
    context.stringIndex += 1;
    return { lines: [...array.lines, ...separator.lines, `  ${name} = call ptr @arrayJoin(ptr ${array.value}, i64 ${separator.length}, ptr ${separator.value})`], value: name, length: "0" };
  }

  if (expression.kind === "typeof") {
    return { lines: [], value: addStringConstant(expression.value, context), length: String(utf8ByteLength(expression.value)) };
  }

  if (expression.kind === "stringConversion") {
    return emitStringConversionExpression(expression, context);
  }

  if (expression.kind === "errorToString") {
    const object = emitRuntimeObjectPointer(expression.objectName, context);
    const index = context.stringIndex;
    context.stringIndex += 1;
    const raw = `%str.result.${index}`;
    const value = `%str.${index}`;
    const length = `%str.len.${index}`;
    return {
      lines: [
        ...object.lines,
        `  ${raw} = call { ptr, i64 } @errorToString(ptr ${object.value})`,
        `  ${value} = extractvalue { ptr, i64 } ${raw}, 0`,
        `  ${length} = extractvalue { ptr, i64 } ${raw}, 1`
      ],
      value,
      length
    };
  }

  if (expression.kind === "regexReplace") {
    const receiver = context.emitStringExpression(expression.receiver);
    const regex = context.emitValue(expression.regex);
    const replacement = context.emitStringExpression(expression.replacement);
    const receiverValue = `%regex.replace.receiver.${context.callIndex}`;
    const replacementValue = `%regex.replace.replacement.${context.callIndex}`;
    const call = emitGeneratedJsCall("regexReplace", [`i64 ${regex.value}`, `i64 ${receiverValue}`, `i64 ${replacementValue}`], context);
    const value = `%regex.replace.ptr.${context.stringIndex}`;
    const length = `%regex.replace.len.${context.stringIndex}`;
    context.stringIndex += 1;
    return {
      lines: [
        ...receiver.lines,
        ...regex.lines,
        ...replacement.lines,
        `  ${receiverValue} = call i64 @valueBoxString(ptr ${receiver.value}, i64 ${receiver.length})`,
        `  ${replacementValue} = call i64 @valueBoxString(ptr ${replacement.value}, i64 ${replacement.length})`,
        ...call.lines,
        `  ${value} = call ptr @valueStringPtr(i64 ${call.value})`,
        `  ${length} = call i64 @valueStringLength(i64 ${call.value})`
      ],
      value,
      length
    };
  }

  if (expression.kind === "stringMethod") {
    const receiver = context.emitStringExpression(expression.receiver);
    const index = context.stringIndex;
    context.stringIndex += 1;
    const raw = `%str.result.${index}`;
    const value = `%str.${index}`;
    const length = `%str.len.${index}`;
    const helperByMethod = {
      trim: "stringTrim",
      trimStart: "stringTrimStart",
      trimEnd: "stringTrimEnd",
      toUpperCase: "stringToUpperCase",
      toLowerCase: "stringToLowerCase",
      repeat: "stringRepeat",
      replace: "stringReplace",
      replaceAll: "stringReplaceAll",
      padStart: "stringPadStart",
      padEnd: "stringPadEnd",
      at: "stringAt",
      charAt: "stringCharAt",
      slice: "stringSlice",
      substring: "stringSubstring",
      substr: "stringSubstr",
      normalize: "stringNormalize"
    } as const;
    const helper = helperByMethod[expression.method];
    if (expression.method === "repeat") {
      const count = emitArrayIndex(expression.count ?? { kind: "literal", value: 0 }, context);
      return {
        lines: [
          ...receiver.lines,
          ...count.lines,
          `  ${raw} = call { ptr, i64 } @${helper}(i64 ${receiver.length}, ptr ${receiver.value}, i64 ${count.value})`,
          `  ${value} = extractvalue { ptr, i64 } ${raw}, 0`,
          `  ${length} = extractvalue { ptr, i64 } ${raw}, 1`
        ],
        value,
        length
      };
    }
    if (expression.method === "replace" || expression.method === "replaceAll") {
      const search = context.emitStringExpression(expression.search ?? { kind: "literal", value: "" });
      const replacement = context.emitStringExpression(expression.replacement ?? { kind: "literal", value: "" });
      return {
        lines: [
          ...receiver.lines,
          ...search.lines,
          ...replacement.lines,
          `  ${raw} = call { ptr, i64 } @${helper}(i64 ${receiver.length}, ptr ${receiver.value}, i64 ${search.length}, ptr ${search.value}, i64 ${replacement.length}, ptr ${replacement.value})`,
          `  ${value} = extractvalue { ptr, i64 } ${raw}, 0`,
          `  ${length} = extractvalue { ptr, i64 } ${raw}, 1`
        ],
        value,
        length
      };
    }
    if (expression.method === "padStart" || expression.method === "padEnd") {
      const targetLength = emitArrayIndex(expression.targetLength ?? { kind: "literal", value: 0 }, context);
      const padString = context.emitStringExpression(expression.padString ?? { kind: "literal", value: "" });
      return {
        lines: [
          ...receiver.lines,
          ...targetLength.lines,
          ...padString.lines,
          `  ${raw} = call { ptr, i64 } @${helper}(i64 ${receiver.length}, ptr ${receiver.value}, i64 ${targetLength.value}, i64 ${padString.length}, ptr ${padString.value})`,
          `  ${value} = extractvalue { ptr, i64 } ${raw}, 0`,
          `  ${length} = extractvalue { ptr, i64 } ${raw}, 1`
        ],
        value,
        length
      };
    }
    if (expression.method === "at") {
      const position = emitArrayIndex(expression.position ?? { kind: "literal", value: 0 }, context);
      return {
        lines: [
          ...receiver.lines,
          ...position.lines,
          `  ${raw} = call { ptr, i64 } @${helper}(i64 ${receiver.length}, ptr ${receiver.value}, i64 ${position.value})`,
          `  ${value} = extractvalue { ptr, i64 } ${raw}, 0`,
          `  ${length} = extractvalue { ptr, i64 } ${raw}, 1`
        ],
        value,
        length
      };
    }
    if (expression.method === "charAt") {
      const position = emitStringIndexArgument(expression.position ?? { kind: "literal", value: 0 }, context);
      return {
        lines: [
          ...receiver.lines,
          ...position.lines,
          `  ${raw} = call { ptr, i64 } @${helper}(i64 ${receiver.length}, ptr ${receiver.value}, i64 ${position.value})`,
          `  ${value} = extractvalue { ptr, i64 } ${raw}, 0`,
          `  ${length} = extractvalue { ptr, i64 } ${raw}, 1`
        ],
        value,
        length
      };
    }
    if (expression.method === "slice" || expression.method === "substring" || expression.method === "substr") {
      const start = emitStringIndexArgument(expression.start ?? { kind: "literal", value: 0 }, context);
      const end = emitStringIndexArgument(expression.end ?? { kind: "literal", value: Number.MAX_SAFE_INTEGER }, context);
      return {
        lines: [
          ...receiver.lines,
          ...start.lines,
          ...end.lines,
          `  ${raw} = call { ptr, i64 } @${helper}(i64 ${receiver.length}, ptr ${receiver.value}, i64 ${start.value}, i64 ${end.value})`,
          `  ${value} = extractvalue { ptr, i64 } ${raw}, 0`,
          `  ${length} = extractvalue { ptr, i64 } ${raw}, 1`
        ],
        value,
        length
      };
    }
    return {
      lines: [
        ...receiver.lines,
        `  ${raw} = call { ptr, i64 } @${helper}(i64 ${receiver.length}, ptr ${receiver.value})`,
        `  ${value} = extractvalue { ptr, i64 } ${raw}, 0`,
        `  ${length} = extractvalue { ptr, i64 } ${raw}, 1`
      ],
      value,
      length
    };
  }

  if (expression.kind === "stringFromCharCode") {
    const index = context.stringIndex;
    context.stringIndex += 1;
    const raw = `%str.result.${index}`;
    const value = `%str.${index}`;
    const length = `%str.len.${index}`;
    const codesAddress = `%str.codes.${index}`;
    const lines: string[] = [`  ${codesAddress} = alloca i64, i64 ${expression.codes.length}`];
    for (let i = 0; i < expression.codes.length; i++) {
      const code = emitStringIndexArgument(expression.codes[i], context);
      const slot = `%str.code.${index}.${i}`;
      lines.push(...code.lines);
      lines.push(`  ${slot} = getelementptr i64, ptr ${codesAddress}, i64 ${i}`);
      lines.push(`  store i64 ${code.value}, ptr ${slot}`);
    }
    lines.push(`  ${raw} = call { ptr, i64 } @stringFromCharCode(ptr ${codesAddress}, i64 ${expression.codes.length})`);
    lines.push(`  ${value} = extractvalue { ptr, i64 } ${raw}, 0`);
    lines.push(`  ${length} = extractvalue { ptr, i64 } ${raw}, 1`);
    return { lines, value, length };
  }

  if (expression.kind === "taggedTemplate") {
    return emitTaggedTemplateCall(
      expression.tag,
      expression.head,
      expression.middleTexts,
      expression.expressions,
      context
    );
  }

  if (expression.kind === "numberFormat") {
    const receiver = context.emitNumberExpression(expression.receiver);
    const argument = context.emitNumberExpression(expression.argument ?? defaultNumberFormatArgument(expression.method));
    const index = context.stringIndex;
    context.stringIndex += 1;
    const raw = `%str.result.${index}`;
    const value = `%str.${index}`;
    const length = `%str.len.${index}`;
    const helperByMethod = {
      toFixed: "numberToFixed",
      toPrecision: "numberToPrecision",
      toExponential: "numberToExponential",
      toString: "numberToStringRadix"
    } as const;
    const helper = helperByMethod[expression.method];
    return {
      lines: [
        ...receiver.lines,
        ...argument.lines,
        `  ${raw} = call { ptr, i64 } @${helper}(double ${receiver.value}, double ${argument.value})`,
        `  ${value} = extractvalue { ptr, i64 } ${raw}, 0`,
        `  ${length} = extractvalue { ptr, i64 } ${raw}, 1`
      ],
      value,
      length
    };
  }

  // Exhaustiveness is already enforced here without an explicit check: the delegation below
  // requires `kind: "ternary"`, so this function is only type-correct while the if-chain above
  // covers every other JsIrStringExpression variant. Adding one makes the compiler complain.
  return emitTernaryStringExpression(expression, context);
}
// eslint-disable-next-line max-statements -- Tagged template emission materializes the strings array, boxes each segment, and forwards them to the tag function alongside the interpolated values.
export function emitTaggedTemplateCall(
  tag: string,
  head: string,
  middleTexts: readonly string[],
  expressions: readonly JsIrValueExpression[],
  context: EmitContext
): StringValue {
  const lines: string[] = [];
  const { arrayIndex } = context;
  context.arrayIndex += 1;
  const stringsArray = `%strings.array.${arrayIndex}`;
  const totalStrings = middleTexts.length + 1;
  lines.push(`  ${stringsArray} = call ptr @arrayNew(i64 ${totalStrings})`);
  const headString = addStringConstant(head, context);
  const headLength = String(utf8ByteLength(head));
  const headBoxIndex = context.numIndex;
  context.numIndex += 1;
  const headBox = `%value.${headBoxIndex}`;
  lines.push(`  ${headBox} = call i64 @valueBoxString(ptr ${headString}, i64 ${headLength})`);
  lines.push(emitRootStackPush(headBox, context));
  lines.push(`  call void @arraySet(ptr ${stringsArray}, i64 0, i64 ${headBox})`);
  for (let i = 0; i < middleTexts.length; i++) {
    const text = middleTexts[i];
    const textString = addStringConstant(text, context);
    const textLength = String(utf8ByteLength(text));
    const textBoxIndex = context.numIndex;
    context.numIndex += 1;
    const textBox = `%value.${textBoxIndex}`;
    lines.push(`  ${textBox} = call i64 @valueBoxString(ptr ${textString}, i64 ${textLength})`);
    lines.push(emitRootStackPush(textBox, context));
    lines.push(`  call void @arraySet(ptr ${stringsArray}, i64 ${i + 1}, i64 ${textBox})`);
  }
  const stringsBoxIndex = context.numIndex;
  context.numIndex += 1;
  const stringsBox = `%value.${stringsBoxIndex}`;
  lines.push(`  ${stringsBox} = call i64 @valueBoxArray(ptr ${stringsArray})`);
  lines.push(emitRootStackPush(stringsBox, context));
  const expressionValues = expressions.map((expr) => context.emitValue(expr));
  for (const value of expressionValues) {
    lines.push(...value.lines);
  }
  const callArgs = [`i64 ${stringsBox}`, ...expressionValues.map((v) => `i64 ${v.value}`)];
  const generated = emitGeneratedJsCall(tag, callArgs, context);
  const valueIndex = context.stringIndex;
  context.stringIndex += 1;
  const value = `%str.${valueIndex}`;
  const length = `%str.len.${valueIndex}`;
  lines.push(...generated.lines);
  lines.push(`  ${value} = call ptr @valueStringPtr(i64 ${generated.value})`);
  lines.push(`  ${length} = call i64 @valueStringLength(i64 ${generated.value})`);
  return { lines, value, length };
}
export function defaultNumberFormatArgument(method: Extract<JsIrStringExpression, { readonly kind: "numberFormat" }>["method"]): JsIrNumberExpression {
  if (method === "toPrecision" || method === "toExponential") {
    return { kind: "literal", value: 6 };
  }
  if (method === "toString") {
    return { kind: "literal", value: 10 };
  }
  return { kind: "literal", value: 0 };
}
export function emitStringConversionExpression(
  expression: Extract<JsIrStringExpression, { readonly kind: "stringConversion" }>,
  context: EmitContext
): StringValue {
  const source = context.emitValue(expression.value);
  const index = context.stringIndex;
  context.stringIndex += 1;
  const raw = `%str.result.${index}`;
  const value = `%str.${index}`;
  const length = `%str.len.${index}`;
  return {
    lines: [
      ...source.lines,
      `  ${raw} = call { ptr, i64 } @valueToString(i64 ${source.value})`,
      `  ${value} = extractvalue { ptr, i64 } ${raw}, 0`,
      `  ${length} = extractvalue { ptr, i64 } ${raw}, 1`
    ],
    value,
    length
  };
}
export function emitConcatStringExpression(
  expression: Extract<JsIrStringExpression, { readonly kind: "concat" }>,
  context: EmitContext
): StringValue {
  const left = context.emitStringExpression(expression.left);
  const right = context.emitStringExpression(expression.right);
  const index = context.stringIndex;
  context.stringIndex += 1;
  const name = `%str.${index}`;
  const length = `%str.len.${index}`;
  return {
    lines: [
      ...left.lines,
      ...right.lines,
      `  ${length} = add i64 ${left.length}, ${right.length}`,
      `  ${name} = call ptr @strConcat(i64 ${left.length}, ptr ${left.value}, i64 ${right.length}, ptr ${right.value})`
    ],
    value: name,
    length
  };
}
export function emitTernaryStringExpression(
  expression: Extract<JsIrStringExpression, { readonly kind: "ternary" }>,
  context: EmitContext
): StringValue {
  const index = context.stringIndex;
  context.stringIndex += 1;
  const thenLabel = `str.then.${index}`;
  const elseLabel = `str.else.${index}`;
  const endLabel = `str.end.${index}`;
  const value = `%str.${index}`;
  const length = `%str.len.${index}`;
  const condition = context.emitCondition(expression.condition);
  const consequent = context.emitStringExpression(expression.consequent);
  const alternate = context.emitStringExpression(expression.alternate);

  return {
    lines: [
      ...condition.lines,
      `  br i1 ${condition.value}, label %${thenLabel}, label %${elseLabel}`,
      `${thenLabel}:`,
      ...consequent.lines,
      `  br label %${endLabel}`,
      `${elseLabel}:`,
      ...alternate.lines,
      `  br label %${endLabel}`,
      `${endLabel}:`,
      `  ${value} = phi ptr [ ${consequent.value}, %${thenLabel} ], [ ${alternate.value}, %${elseLabel} ]`,
      `  ${length} = phi i64 [ ${consequent.length}, %${thenLabel} ], [ ${alternate.length}, %${elseLabel} ]`
    ],
    value,
    length
  };
}
