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
    const loweredArguments = lowerCopyWithinArguments(context, expression.arguments, bindings);
    if (loweredArguments.kind === "unsupported") {
      return loweredArguments;
    }
    if (loweredArguments.kind === "lowered") {
      const { target, start, end } = loweredArguments.operation;
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

/**
 * `splice`'s argument list: the start, the optional delete count, and the items to insert.
 *
 * Both `splice` forms lower the same way — the statement form and the binding form differ only in the
 * operation they produce — so the reading of the arguments lives here once. Keeping two copies meant a
 * change to how one of them read an argument left the other reading it differently, which is the kind of
 * divergence that shows up as `x.splice(0, 1)` and `const r = x.splice(0, 1)` disagreeing.
 */
export interface LoweredSpliceArguments {
  readonly start: JsIrNumberExpression;
  readonly deleteCount: JsIrNumberExpression | undefined;
  readonly items: readonly JsIrValueExpression[];
}

/**
 * Reads `args` as a `splice` argument list, or declines when the shape is not one.
 *
 * The second argument is the delete count and every one after it is an item, which is what makes the
 * interpretation positional: there is no separate arity to check beyond "at least a start".
 */
export function lowerSpliceArguments(
  context: LoweringContext,
  args: ts.NodeArray<ts.Expression>,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<LoweredSpliceArguments> {
  if (args.length === 0) {
    return notApplicable;
  }
  const start = context.lowerNumberExpression(context, args[0], bindings);
  if (start.kind === "unsupported") {
    return start;
  }
  if (start.kind !== "lowered") {
    return notApplicable;
  }
  let deleteCount: JsIrNumberExpression | undefined;
  const items: JsIrValueExpression[] = [];
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    if (deleteCount === undefined) {
      const count = context.lowerNumberExpression(context, argument, bindings);
      if (count.kind === "unsupported") {
        return count;
      }
      deleteCount = loweredPayload(count);
      if (deleteCount === undefined) {
        return notApplicable;
      }
      continue;
    }
    const value = context.lowerValueExpression(context, argument, bindings);
    if (value.kind === "unsupported") {
      return value;
    }
    if (value.kind !== "lowered") {
      return notApplicable;
    }
    items.push(value.operation);
  }
  return produced({ start: start.operation, deleteCount, items });
}

/** `copyWithin`'s target/start/optional-end triple, read the same way from both call sites. */
export interface LoweredCopyWithinArguments {
  readonly target: JsIrNumberExpression;
  readonly start: JsIrNumberExpression;
  readonly end: JsIrNumberExpression | undefined;
}

/**
 * Reads `args` as a `copyWithin` argument list: a target and a start, plus an end that is only present in
 * the three-argument form. The caller has already checked the arity, so this only reads.
 */
export function lowerCopyWithinArguments(
  context: LoweringContext,
  args: ts.NodeArray<ts.Expression>,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<LoweredCopyWithinArguments> {
  const targetResult = context.lowerNumberExpression(context, args[0], bindings);
  if (targetResult.kind === "unsupported") {
    return targetResult;
  }
  const startResult = context.lowerNumberExpression(context, args[1], bindings);
  if (startResult.kind === "unsupported") {
    return startResult;
  }
  let end: JsIrNumberExpression | undefined;
  if (args.length === arrayCopyWithinArgumentCount) {
    const endResult = context.lowerNumberExpression(context, args[2], bindings);
    if (endResult.kind === "unsupported") {
      return endResult;
    }
    end = loweredPayload(endResult);
  }
  const target = loweredPayload(targetResult);
  const start = loweredPayload(startResult);
  if (target === undefined || start === undefined) {
    return notApplicable;
  }
  return produced({ target, start, end });
}

function lowerRuntimeArraySpliceStatement(
  context: LoweringContext,
  arrayName: string,
  args: ts.NodeArray<ts.Expression>,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const loweredArguments = lowerSpliceArguments(context, args, bindings);
  if (loweredArguments.kind !== "lowered") {
    return loweredArguments;
  }
  const { start, deleteCount, items } = loweredArguments.operation;
  return produced({ kind: "runtimeArraySpliceStatement", arrayName, start, deleteCount, items });
}
