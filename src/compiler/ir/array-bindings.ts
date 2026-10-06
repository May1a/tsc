import { type Lowered, loweredPayload, notApplicable, produced } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import { arrayCopyWithinArgumentCount, lowerRuntimeArrayFillCallStatement } from "./array-mutations.js";
import type { JsIrNumberExpression, JsIrRuntimeArrayConcatElement, JsIrValueExpression } from "./expressions.js";
import { lowerArrayLiteralExpression } from "./array-literals.js";

export function lowerRuntimeArrayMutatorResultBinding(
  context: LoweringContext,
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!ts.isCallExpression(initializer) || !ts.isPropertyAccessExpression(initializer.expression) || !ts.isIdentifier(initializer.expression.expression)) {
    return notApplicable;
  }
  const arrayName = initializer.expression.expression.text;
  if (bindings.get(arrayName)?.kind !== "runtimeArray") {
    return notApplicable;
  }
  const method = initializer.expression.name.text;
  if (method === "reverse") {
    return produced({ kind: "runtimeArrayMutatorResult", name, arrayName, mutation: { kind: "reverse" } });
  }
  if (method === "fill") {
    const fillResult = lowerRuntimeArrayFillCallStatement(context, arrayName, method, initializer.arguments, bindings);
    if (fillResult.kind === "unsupported") {
      return fillResult;
    }
    const fill = loweredPayload(fillResult);
    if (fill?.kind === "runtimeArrayFill") {
      return produced({ kind: "runtimeArrayMutatorResult", name, arrayName, mutation: { kind: "fill", value: fill.value, start: fill.start, end: fill.end } });
    }
  }
  if (method === "copyWithin" && (initializer.arguments.length === 2 || initializer.arguments.length === arrayCopyWithinArgumentCount)) {
    return lowerCopyWithinResultBinding(context, name, arrayName, initializer, bindings);
  }
  return notApplicable;
}

export function lowerRuntimeArraySliceBinding(
  context: LoweringContext,
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!ts.isCallExpression(initializer) || !ts.isPropertyAccessExpression(initializer.expression) || !ts.isIdentifier(initializer.expression.expression)) {
    return notApplicable;
  }
  const arrayName = initializer.expression.expression.text;
  if (initializer.expression.name.text !== "slice" || bindings.get(arrayName)?.kind !== "runtimeArray") {
    return notApplicable;
  }
  if (initializer.arguments.length > 2) {
    return notApplicable;
  }
  let start: JsIrNumberExpression | undefined = { kind: "literal", value: 0 };
  if (initializer.arguments.length > 0) {
    const numberExpressionResult = context.lowerNumberExpression(context, initializer.arguments[0], bindings);
    if (numberExpressionResult.kind === "unsupported") {
      return numberExpressionResult;
    }
    start = loweredPayload(numberExpressionResult);
  }
  let end: JsIrNumberExpression | undefined;
  if (initializer.arguments.length === 2) {
    const numberExpressionResult2 = context.lowerNumberExpression(context, initializer.arguments[1], bindings);
    if (numberExpressionResult2.kind === "unsupported") {
      return numberExpressionResult2;
    }
    end = loweredPayload(numberExpressionResult2);
  }
  if (start === undefined || (initializer.arguments.length === 2 && end === undefined)) {
    return notApplicable;
  }
  return produced({ kind: "runtimeArraySlice", name, arrayName, start, end });
}

export function lowerRuntimeArrayConcatBinding(
  context: LoweringContext,
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!ts.isCallExpression(initializer) || !ts.isPropertyAccessExpression(initializer.expression) || !ts.isIdentifier(initializer.expression.expression)) {
    return notApplicable;
  }
  const leftName = initializer.expression.expression.text;
  if (initializer.expression.name.text !== "concat" || bindings.get(leftName)?.kind !== "runtimeArray" || initializer.arguments.length === 0) {
    return notApplicable;
  }
  const values: JsIrRuntimeArrayConcatElement[] = [];
  for (const argument of initializer.arguments) {
    if (ts.isIdentifier(argument)) {
      const binding = bindings.get(argument.text);
      if (binding?.kind === "array") {
        values.push({ kind: "fixedArraySpread", arrayName: argument.text, length: binding.length });
        continue;
      }
    }
    if (ts.isArrayLiteralExpression(argument)) {
      const elements = lowerArrayLiteralExpression(context, argument, bindings);
      if (elements.kind !== "lowered") {
        return elements;
      }
      for (const element of elements.operation) {
        values.push({ kind: "value", value: { kind: "number", value: element } });
      }
      continue;
    }
    const value = context.lowerValueExpression(context, argument, bindings);
    if (value.kind !== "lowered") {
      return value;
    }
    values.push({ kind: "value", value: value.operation });
  }
  return produced({ kind: "runtimeArrayConcat", name, leftName, values });
}

export function lowerRuntimeArraySpliceBinding(
  context: LoweringContext,
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!ts.isCallExpression(initializer) || !ts.isPropertyAccessExpression(initializer.expression) || !ts.isIdentifier(initializer.expression.expression)) {
    return notApplicable;
  }
  const arrayName = initializer.expression.expression.text;
  if (initializer.expression.name.text !== "splice" || bindings.get(arrayName)?.kind !== "runtimeArray") {
    return notApplicable;
  }
  if (initializer.arguments.length === 0) {
    return notApplicable;
  }
  const start = context.lowerNumberExpression(context, initializer.arguments[0], bindings);
  if (start.kind !== "lowered") {
    return start;
  }
  let deleteCount: JsIrNumberExpression | undefined;
  const items: JsIrValueExpression[] = [];
  for (let index = 1; index < initializer.arguments.length; index += 1) {
    const argument = initializer.arguments[index];
    if (deleteCount === undefined) {
      const numberExpressionResult3 = context.lowerNumberExpression(context, argument, bindings);
      if (numberExpressionResult3.kind === "unsupported") {
        return numberExpressionResult3;
      }
      deleteCount = loweredPayload(numberExpressionResult3);
      if (deleteCount === undefined) {
        return notApplicable;
      }
      continue;
    }
    const value = context.lowerValueExpression(context, argument, bindings);
    if (value.kind !== "lowered") {
      return value;
    }
    items.push(value.operation);
  }
  return produced({ kind: "runtimeArraySplice", name, arrayName, start: start.operation, deleteCount, items });
}

export function lowerRuntimeArrayFlatBinding(
  context: LoweringContext,
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!ts.isCallExpression(initializer) || !ts.isPropertyAccessExpression(initializer.expression) || !ts.isIdentifier(initializer.expression.expression)) {
    return notApplicable;
  }
  const arrayName = initializer.expression.expression.text;
  if (initializer.expression.name.text !== "flat" || bindings.get(arrayName)?.kind !== "runtimeArray") {
    return notApplicable;
  }
  if (initializer.arguments.length > 1) {
    return notApplicable;
  }
  let depth: JsIrNumberExpression = { kind: "literal", value: 1 };
  if (initializer.arguments.length === 1) {
    const loweredDepth = context.lowerNumberExpression(context, initializer.arguments[0], bindings);
    if (loweredDepth.kind !== "lowered") {
      return loweredDepth;
    }
    depth = loweredDepth.operation;
  }
  return produced({ kind: "runtimeArrayFlat", name, arrayName, depth });
}

function lowerCopyWithinResultBinding(
  context: LoweringContext,
  name: string,
  arrayName: string,
  initializer: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const targetResult = context.lowerNumberExpression(context, initializer.arguments[0], bindings);
  if (targetResult.kind === "unsupported") {
    return targetResult;
  }
  const target = loweredPayload(targetResult);
  const startResult = context.lowerNumberExpression(context, initializer.arguments[1], bindings);
  if (startResult.kind === "unsupported") {
    return startResult;
  }
  const start = loweredPayload(startResult);
  let end: JsIrNumberExpression | undefined;
  if (initializer.arguments.length === arrayCopyWithinArgumentCount) {
    const numberExpressionResult4 = context.lowerNumberExpression(context, initializer.arguments[2], bindings);
    if (numberExpressionResult4.kind === "unsupported") {
      return numberExpressionResult4;
    }
    end = loweredPayload(numberExpressionResult4);
  }
  if (target !== undefined && start !== undefined && (initializer.arguments.length === 2 || end !== undefined)) {
    return produced({ kind: "runtimeArrayMutatorResult", name, arrayName, mutation: { kind: "copyWithin", target, start, end } });
  }
  return notApplicable;
}
