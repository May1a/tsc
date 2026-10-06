import { type Lowered, loweredPayload, notApplicable, produced } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import { lowerArrayMethodValues } from "./array-arguments.js";
import { lowerRuntimeArrayForEachCallbackStatement } from "./array-callbacks.js";
import type { JsIrNumberExpression, JsIrValueExpression } from "./expressions.js";

const arrayFillRangeArgumentCount = 3;

export const arrayCopyWithinArgumentCount = 3;

// eslint-disable-next-line complexity, max-statements -- Runtime array statement methods are centralized while the method surface is small.
export function lowerRuntimeArrayCallStatement(
  context: LoweringContext,
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression)) {
    return notApplicable;
  }
  const arrayName = expression.expression.expression.text;
  if (bindings.get(arrayName)?.kind !== "runtimeArray") {
    return notApplicable;
  }
  const method = expression.expression.name.text;
  if (method === "push" || method === "unshift") {
    const values = lowerArrayMethodValues(context, expression.arguments, bindings);
    if (values.kind !== "lowered") {
      return values;
    }
    return produced({ kind: runtimeArrayAppendOperationKind(method), arrayName, values: values.operation });
  }
  if (method === "pop" || method === "shift") {
    return produced({ kind: runtimeArrayRemoveOperationKind(method), arrayName });
  }
  if (method === "splice") {
    return lowerRuntimeArraySpliceStatement(context, arrayName, expression.arguments, bindings);
  }
  const fill = lowerRuntimeArrayFillCallStatement(context, arrayName, method, expression.arguments, bindings);
  if (fill.kind !== "notApplicable") {
    return fill;
  }
  if (method === "reverse") {
    return produced({ kind: "runtimeArrayReverse", arrayName });
  }
  if (method === "forEach") {
    return lowerRuntimeArrayForEachCallbackStatement(context, arrayName, expression.arguments, bindings);
  }
  if (method === "copyWithin" && (expression.arguments.length === 2 || expression.arguments.length === arrayCopyWithinArgumentCount)) {
    const targetResult = context.lowerNumberExpression(context, expression.arguments[0], bindings);
    if (targetResult.kind === "unsupported") {
      return targetResult;
    }
    const target = loweredPayload(targetResult);
    const startResult = context.lowerNumberExpression(context, expression.arguments[1], bindings);
    if (startResult.kind === "unsupported") {
      return startResult;
    }
    const start = loweredPayload(startResult);
    let end: JsIrNumberExpression | undefined;
    if (expression.arguments.length === arrayCopyWithinArgumentCount) {
      const numberExpressionResult = context.lowerNumberExpression(context, expression.arguments[2], bindings);
      if (numberExpressionResult.kind === "unsupported") {
        return numberExpressionResult;
      }
      end = loweredPayload(numberExpressionResult);
    }
    if (target !== undefined && start !== undefined && (expression.arguments.length === 2 || end !== undefined)) {
      return produced({ kind: "runtimeArrayCopyWithin", arrayName, target, start, end });
    }
  }
  return notApplicable;
}

export function lowerRuntimeArrayFillCallStatement(
  context: LoweringContext,
  arrayName: string,
  method: string,
  args: ts.NodeArray<ts.Expression>,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (method !== "fill" || (args.length !== 1 && args.length !== 2 && args.length !== arrayFillRangeArgumentCount)) {
    return notApplicable;
  }
  const value = context.lowerValueExpression(context, args[0], bindings);
  if (value.kind !== "lowered") {
    return value;
  }
  if (args.length === 1) {
    return produced({ kind: "runtimeArrayFill", arrayName, value: value.operation });
  }
  const startResult2 = context.lowerNumberExpression(context, args[1], bindings);
  if (startResult2.kind === "unsupported") {
    return startResult2;
  }
  const start = loweredPayload(startResult2);
  let end: JsIrNumberExpression | undefined;
  if (args.length === arrayFillRangeArgumentCount) {
    const numberExpressionResult2 = context.lowerNumberExpression(context, args[2], bindings);
    if (numberExpressionResult2.kind === "unsupported") {
      return numberExpressionResult2;
    }
    end = loweredPayload(numberExpressionResult2);
  }
  if (start === undefined || (args.length === arrayFillRangeArgumentCount && end === undefined)) {
    return notApplicable;
  }
  return produced({ kind: "runtimeArrayFill", arrayName, value: value.operation, start, end });
}

function runtimeArrayAppendOperationKind(method: "push" | "unshift"): "runtimeArrayPush" | "runtimeArrayUnshift" {
  if (method === "push") {
    return "runtimeArrayPush";
  }
  return "runtimeArrayUnshift";
}

function runtimeArrayRemoveOperationKind(method: "pop" | "shift"): "runtimeArrayPop" | "runtimeArrayShift" {
  if (method === "pop") {
    return "runtimeArrayPop";
  }
  return "runtimeArrayShift";
}

function lowerRuntimeArraySpliceStatement(
  context: LoweringContext,
  arrayName: string,
  args: ts.NodeArray<ts.Expression>,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (args.length === 0) {
    return notApplicable;
  }
  const start = context.lowerNumberExpression(context, args[0], bindings);
  if (start.kind !== "lowered") {
    return start;
  }
  let deleteCount: JsIrNumberExpression | undefined;
  const items: JsIrValueExpression[] = [];
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
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
  return produced({ kind: "runtimeArraySpliceStatement", arrayName, start: start.operation, deleteCount, items });
}
