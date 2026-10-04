import type { JsIrBindingValue, JsIrCallArgument } from "../ir/bindings.js";
import type { JsIrExpression } from "../ir/expressions.js";
import { emitGeneratedJsCall } from "./completion.js";
import type { EmitContext, OperationOf } from "./context.js";
import { encodeCString } from "./strings.js";

/**
 * `print`, and the coercions it needs to turn one value into text.
 *
 * Printing is the only place a value stops being a value, so this tier is where the representation
 * questions end: a number goes through `Number.toString` semantics as a `double`, a string is already a
 * `ptr` and is written with its byte length, and a boolean is an `i64` whose only interesting bit is
 * the low one. A `JsValue` is boxed-or-primitive, so its three cases are dispatched on the box tag
 * rather than on anything the source said.
 *
 * The coercions are here rather than in the value tier because they exist for `print` and for nothing
 * else. Making them general would mean every value could become a string implicitly, which is a
 * different language.
 */

export function emitPrintOperation(operation: OperationOf<"print">, context: EmitContext): string[] {
  return emitExpressionPrint(operation.expression, context);
}
export function emitNumberCallExpressionResult(expression: { readonly kind: "call"; readonly name: string; readonly arguments: readonly JsIrCallArgument[] }, context: EmitContext): { readonly lines: string[]; readonly value: string } {
  const args = context.emitCallArguments(expression.arguments);
  const generated = emitGeneratedJsCall(expression.name, args.values, context);
  const number = `%call.${context.numIndex}.num`;
  context.numIndex += 1;
  return {
    lines: [...args.lines, ...generated.lines, `  ${number} = call double @valueNumber(i64 ${generated.value})`],
    value: number
  };
}
export function emitExpressionPrint(expression: JsIrExpression, context: EmitContext): string[] {
  if (expression.kind === "string") {
    return [emitStringPrint(expression.value, context)];
  }

  if (expression.kind === "stringExpression") {
    const result = context.emitStringExpression(expression.value);
    return [...result.lines, emitStringPointerPrint(result.value, context)];
  }

  if (expression.kind === "number") {
    const result = context.emitNumberExpression(expression.value);
    return [...result.lines, emitNumberPrint(result.value, context)];
  }

  if (expression.kind === "boolean") {
    return [emitStringPrint(String(expression.value), context)];
  }

  if (expression.kind === "call") {
    const result = emitNumberCallExpressionResult(expression, context);
    return [...result.lines, emitNumberPrint(result.value, context)];
  }

  if (expression.kind === "value") {
    const result = context.emitValue(expression.value);
    return [...result.lines, `  call void @valuePrint(i64 ${result.value})`];
  }

  const binding = context.bindings.get(expression.name);
  if (binding === undefined) {
    return [];
  }

  return emitBindingPrint(binding, context);
}
// eslint-disable-next-line max-statements -- Print lowering handles all current binding variants in one dispatch.
export function emitBindingPrint(binding: JsIrBindingValue, context: EmitContext): string[] {
  if (binding.kind === "number") {
    const result = context.emitNumberExpression(binding.value);
    return [...result.lines, emitNumberPrint(result.value, context)];
  }

  if (binding.kind === "boolean") {
    return [emitStringPrint(String(binding.value), context)];
  }

  if (binding.kind === "booleanExpression") {
    const result = context.emitCondition(binding.value);
    return [...result.lines, ...emitBooleanValuePrint(result.value, context)];
  }

  if (binding.kind === "booleanVariable") {
    const result = context.emitCondition({ kind: "booleanVariable", name: binding.name });
    return [...result.lines, ...emitBooleanValuePrint(result.value, context)];
  }

  if (binding.kind === "string") {
    return [emitStringPrint(binding.value, context)];
  }

  if (binding.kind === "stringExpression") {
    const result = context.emitStringExpression(binding.value);
    return [...result.lines, emitStringPointerPrint(result.value, context)];
  }

  if (binding.kind === "stringVariable") {
    const result = context.emitStringExpression({ kind: "variable", name: binding.name });
    return [...result.lines, emitStringPointerPrint(result.value, context)];
  }

  if (binding.kind === "value") {
    const result = context.emitValue(binding.value);
    return [...result.lines, `  call void @valuePrint(i64 ${result.value})`];
  }

  if (binding.kind === "valueVariable") {
    const value = context.emitValue({ kind: "variable", name: binding.name });
    return [...value.lines, `  call void @valuePrint(i64 ${value.value})`];
  }

  if (binding.kind === "runtimeObject") {
    const result = context.emitValue({ kind: "objectRef", name: binding.name });
    return [...result.lines, `  call void @valuePrint(i64 ${result.value})`];
  }

  if (binding.kind === "runtimeArray") {
    const result = context.emitValue({ kind: "arrayRef", name: binding.name });
    return [...result.lines, `  call void @valuePrint(i64 ${result.value})`];
  }

  return [];
}
export function emitStringPrint(value: string, context: EmitContext): string {
  const index = context.printIndex;
  context.printIndex += 1;
  const encoded = encodeCString(value);
  context.stringConstants.push(`@.str.${index} = private unnamed_addr constant [${encoded.length} x i8] c"${encoded.value}"`);
  return `  %print.${index} = call i32 @puts(ptr @.str.${index})`;
}
export function emitStringPointerPrint(value: string, context: EmitContext): string {
  const index = context.printIndex;
  context.printIndex += 1;
  return `  %print.${index} = call i32 @puts(ptr ${value})`;
}
export function emitNumberPrint(value: string, context: EmitContext): string {
  const index = context.printIndex;
  context.printIndex += 1;
  context.hasNumberPrint = true;
  return `  %print.${index}.nan = fcmp uno double ${value}, ${value}
  br i1 %print.${index}.nan, label %print.nan.${index}, label %print.check-infinity.${index}
print.nan.${index}:
  %print.${index}.nan.result = call i32 @puts(ptr @.fmt.number.nan)
  br label %print.end.${index}
print.check-infinity.${index}:
  %print.${index}.bits = call i64 @valueBoxNumber(double ${value})
  %print.${index}.absolute-bits = and i64 %print.${index}.bits, 9223372036854775807
  %print.${index}.infinite = icmp eq i64 %print.${index}.absolute-bits, 9218868437227405312
  br i1 %print.${index}.infinite, label %print.infinity-sign.${index}, label %print.finite.${index}
print.infinity-sign.${index}:
  %print.${index}.negative = icmp slt i64 %print.${index}.bits, 0
  br i1 %print.${index}.negative, label %print.negative-infinity.${index}, label %print.positive-infinity.${index}
print.negative-infinity.${index}:
  %print.${index}.negative-infinity.result = call i32 @puts(ptr @.fmt.number.negative-infinity)
  br label %print.end.${index}
print.positive-infinity.${index}:
  %print.${index}.positive-infinity.result = call i32 @puts(ptr @.fmt.number.infinity)
  br label %print.end.${index}
print.finite.${index}:
  %print.${index} = call i32 (ptr, ...) @printf(ptr @.fmt.number, double ${value})
  br label %print.end.${index}
print.end.${index}:`;
}
export function emitBooleanValuePrint(value: string, context: EmitContext): string[] {
  const index = context.boolIndex;
  context.boolIndex += 1;
  const truePrint = emitStringPrint("true", context);
  const falsePrint = emitStringPrint("false", context);
  const trueLabel = `bool.true.${index}`;
  const falseLabel = `bool.false.${index}`;
  const endLabel = `bool.end.${index}`;

  return [
    `  br i1 ${value}, label %${trueLabel}, label %${falseLabel}`,
    `${trueLabel}:`,
    truePrint,
    `  br label %${endLabel}`,
    `${falseLabel}:`,
    falsePrint,
    `  br label %${endLabel}`,
    `${endLabel}:`
  ];
}
