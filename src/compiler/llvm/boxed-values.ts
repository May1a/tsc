import type { JsIrValueExpression } from "../ir/expressions.js";
import { emitGeneratedJsCall, emitRootStackPush } from "./completion.js";
import type { EmitContext, JsValue } from "./context.js";
import { addStringConstant, utf8ByteLength } from "./strings.js";

/**
 * The boxed forms: reading a primitive back out of a box, calling a method on one, and a tagged
 * template.
 *
 * "Boxed" is the value ABI's own term and it is the distinction that matters here. Every number in this
 * language is a js value, so a primitive exists in two shapes — the `double` a computation produced and
 * the `i64` box it lives in — and these three forms are the ones that cross between them. A boxed method
 * call is the sharpest case: it has to know the box tag to decide whether `valueOf` or `toString` is the
 * right question.
 *
 * The tagged template is here rather than with the string tier because it is not about strings. It
 * builds a `TemplateStringsArray`, boxes the interpolations, and calls a tag — the last part is a plain
 * call, and the first two are the only tagged-template-specific code in the emitter.
 */

/** a method call on a boxed value. */
export function emitBoxedMethodCallValueExpression(expression: JsIrValueExpression, context: EmitContext): JsValue | undefined {
  if (expression.kind === "boxedMethodCall") {
    const lines: string[] = [];
    const receiver = context.emitValue(expression.receiver);
    lines.push(...receiver.lines);
    const { objectIndex } = context;
    context.objectIndex += 1;
    const objectPtr = `%boxed.object.ptr.${objectIndex}`;
    lines.push(`  ${objectPtr} = call ptr @valueObjectPtr(i64 ${receiver.value})`);
    if (expression.method === "valueOf") {
      const valueIndex = context.numIndex;
      context.numIndex += 1;
      const value = `%value.${valueIndex}`;
      lines.push(`  ${value} = call i64 @boxedValueOf(ptr ${objectPtr})`);
      return { lines, value };
    }
    const converted = emitBoxedToStringValue(objectPtr, context);
    return { lines: [...lines, ...converted.lines], value: converted.value };
  }
  return undefined;
}
/** a primitive read back out of a box. */
export function emitBoxedPrimitiveValueExpression(expression: JsIrValueExpression, context: EmitContext): JsValue | undefined {
  if (expression.kind === "boxedPrimitive") {
    const lines: string[] = [];
    const inner = context.emitValue(expression.inner);
    lines.push(...inner.lines);
    const { objectIndex } = context;
    context.objectIndex += 1;
    const objectName = `%boxed.object.${objectIndex}`;
    let capacity = 1;
    if (expression.storeLength === true) {
      capacity = 2;
    }
    lines.push(`  ${objectName} = call ptr @objectNew(i64 ${capacity})`);
    const primitiveKey = "primitive";
    const primitiveKeyLen = primitiveKey.length;
    const keyString = addStringConstant(primitiveKey, context);
    lines.push(`  call void @objectSet(ptr ${objectName}, i64 ${primitiveKeyLen}, ptr ${keyString}, i64 ${inner.value})`);
    if (expression.storeLength === true) {
      const lengthKey = "length";
      const lengthKeyLen = lengthKey.length;
      const lengthKeyString = addStringConstant(lengthKey, context);
      const lengthIndex = context.numIndex;
      context.numIndex += 1;
      const lengthValue = `%value.${lengthIndex}`;
      lines.push(`  ${lengthValue} = call i64 @valueStringLength(i64 ${inner.value})`);
      lines.push(`  call void @objectSet(ptr ${objectName}, i64 ${lengthKeyLen}, ptr ${lengthKeyString}, i64 ${lengthValue})`);
    }
    const valueIndex = context.numIndex;
    context.numIndex += 1;
    const value = `%value.${valueIndex}`;
    lines.push(`  ${value} = call i64 @valueBoxObject(ptr ${objectName})`);
    return { lines, value };
  }
  return undefined;
}
/** a tagged template. */
export function emitTaggedTemplateValueExpression(expression: JsIrValueExpression, context: EmitContext): JsValue | undefined {
  if (expression.kind === "taggedTemplateValue") {
    const lines: string[] = [];
    const cooked = emitTemplateStringsArray(expression.head, expression.middleTexts, context);
    lines.push(...cooked.lines);
    const stringsBox = cooked.value;
    const valueArgs = emitTemplateValueArguments(expression.expressions, expression.wrapValuesInRest, context);
    lines.push(...valueArgs.lines);
    const callArgs = [`i64 ${stringsBox}`, ...valueArgs.args.map((arg) => `i64 ${arg}`)];
    const generated = emitGeneratedJsCall(expression.tag, callArgs, context);
    lines.push(...generated.lines);
    return { lines, value: generated.value };
  }
  return undefined;
}
/**
 * `toString` on a boxed value: call the runtime's conversion, copy the result into a NUL-terminated
 * buffer, and box it again.
 *
 * Three separate allocations, and none of them is avoidable in the IR: the runtime returns a `{ ptr,
 * i64 }` that it does not own, the source needs a NUL terminator for a C string, and the result has to
 * be a js value again. That is why this is a helper rather than three more statements in the
 * recognizer, and why it is not something the value ABI can hide.
 */
export function emitBoxedToStringValue(objectPtr: string, context: EmitContext): JsValue {
  const lines: string[] = [];
  const { stringIndex } = context;
  context.stringIndex += 1;
  const raw = `%str.result.${stringIndex}`;
  const ptrValue = `%str.${stringIndex}`;
  const length = `%str.len.${stringIndex}`;
  lines.push(`  ${raw} = call { ptr, i64 } @boxedToString(ptr ${objectPtr})`);
  lines.push(`  ${ptrValue} = extractvalue { ptr, i64 } ${raw}, 0`);
  lines.push(`  ${length} = extractvalue { ptr, i64 } ${raw}, 1`);
  const allocIndex = context.numIndex;
  context.numIndex += 1;
  const allocPtr = `%str.alloc.${allocIndex}`;
  const totalIndex = context.numIndex;
  context.numIndex += 1;
  const totalLen = `%str.total.${totalIndex}`;
  lines.push(`  ${totalLen} = add i64 ${length}, 1`);
  lines.push(`  ${allocPtr} = call ptr @malloc(i64 ${totalLen})`);
  lines.push(`  call ptr @memcpy(ptr ${allocPtr}, ptr ${ptrValue}, i64 ${length})`);
  const nulIndex = context.numIndex;
  context.numIndex += 1;
  const nulPos = `%str.nul.${nulIndex}`;
  lines.push(`  ${nulPos} = getelementptr i8, ptr ${allocPtr}, i64 ${length}`);
  lines.push(`  store i8 0, ptr ${nulPos}`);
  const boxIndex = context.numIndex;
  context.numIndex += 1;
  const boxValue = `%value.${boxIndex}`;
  lines.push(`  ${boxValue} = call i64 @valueBoxString(ptr ${allocPtr}, i64 ${length})`);
  lines.push(emitRootStackPush(boxValue, context));
  return { lines, value: boxValue };
}
/**
 * The interpolations of a tagged template, as call arguments.
 *
 * A tag declared as `(strings: TemplateStringsArray, ...values: T[])` gets them as a rest array; one
 * declared as `(strings, a, b)` gets them positionally. The IR records which with
 * `wrapValuesInRest`, and the two are different argument *shapes* rather than a flag the callee sees,
 * so they are built here rather than at the call site.
 */
export function emitTemplateValueArguments(
  expressions: readonly JsIrValueExpression[],
  wrapValuesInRest: boolean | undefined,
  context: EmitContext
): { readonly lines: readonly string[]; readonly args: readonly string[] } {
  const lines: string[] = [];
  const values = expressions.map((expr) => context.emitValue(expr));
  for (const value of values) {
    lines.push(...value.lines);
  }
  if (wrapValuesInRest === true) {
    const restArrayIndex = context.arrayIndex;
    context.arrayIndex += 1;
    const restArray = `%rest.array.${restArrayIndex}`;
    lines.push(`  ${restArray} = call ptr @arrayNew(i64 ${values.length})`);
    for (let i = 0; i < values.length; i++) {
      lines.push(`  call void @arraySet(ptr ${restArray}, i64 ${i}, i64 ${values[i].value})`);
    }
    const restBoxIndex = context.numIndex;
    context.numIndex += 1;
    const restBox = `%value.${restBoxIndex}`;
    lines.push(`  ${restBox} = call i64 @valueBoxArray(ptr ${restArray})`);
    lines.push(emitRootStackPush(restBox, context));
    return { lines, args: [restBox] };
  }
  return { lines, args: values.map((value) => value.value) };
}
/**
 * The cooked strings of a tagged template, as a boxed array.
 *
 * A template's `strings` argument is a `TemplateStringsArray` — every literal piece, boxed, in order —
 * and the pieces are the same constants for every evaluation of the same template, so they are interned
 * through `addStringConstant` rather than rebuilt. Only the interpolations vary, and they are the other
 * argument.
 */
export function emitTemplateStringsArray(
  head: string,
  middleTexts: readonly string[],
  context: EmitContext
): JsValue {
  const lines: string[] = [];
  const { arrayIndex } = context;
  context.arrayIndex += 1;
  const stringsArray = `%strings.array.${arrayIndex}`;
  lines.push(`  ${stringsArray} = call ptr @arrayNew(i64 ${middleTexts.length + 1})`);
  const pieces = [head, ...middleTexts];
  for (let i = 0; i < pieces.length; i++) {
    const pieceString = addStringConstant(pieces[i], context);
    const pieceLength = String(utf8ByteLength(pieces[i]));
    const pieceBoxIndex = context.numIndex;
    context.numIndex += 1;
    const pieceBox = `%value.${pieceBoxIndex}`;
    lines.push(`  ${pieceBox} = call i64 @valueBoxString(ptr ${pieceString}, i64 ${pieceLength})`);
    lines.push(emitRootStackPush(pieceBox, context));
    lines.push(`  call void @arraySet(ptr ${stringsArray}, i64 ${i}, i64 ${pieceBox})`);
  }
  const boxIndex = context.numIndex;
  context.numIndex += 1;
  const box = `%value.${boxIndex}`;
  lines.push(`  ${box} = call i64 @valueBoxArray(ptr ${stringsArray})`);
  lines.push(emitRootStackPush(box, context));
  return { lines, value: box };
}
