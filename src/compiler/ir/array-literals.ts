import { type Lowered, loweredPayload, notApplicable, produced } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import type { JsIrNumberExpression, JsIrRuntimeArrayElement } from "./expressions.js";
import type { ArrayLiteralClassification } from "./literal-types.js";
import { iteratorErrorSubject } from "./iterator-subject.js";

export function lowerArrayLiteralExpression(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<readonly JsIrNumberExpression[]> {
  if (!ts.isArrayLiteralExpression(expression)) {
    return notApplicable;
  }

  const elements: JsIrNumberExpression[] = [];
  for (const element of expression.elements) {
    if (ts.isSpreadElement(element) && ts.isIdentifier(element.expression)) {
      const binding = bindings.get(element.expression.text);
      if (binding?.kind !== "array") {
        return notApplicable;
      }
      for (let index = 0; index < binding.length; index++) {
        elements.push({ kind: "arrayAccess", arrayName: element.expression.text, index: { kind: "literal", value: index } });
      }
      continue;
    }
    const value = context.lowerNumberExpression(context, element, bindings);
    if (value.kind !== "lowered") {
      return value;
    }
    elements.push(value.operation);
  }
  return produced(elements);
}

export function classifyArrayLiteral(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<ArrayLiteralClassification> {
  const fixed = lowerArrayLiteralExpression(context, expression, bindings);
  if (fixed.kind === "unsupported") {
    return fixed;
  }
  if (fixed.kind === "lowered") {
    return produced({ kind: "fixed", elements: fixed.operation });
  }

  const runtime = lowerRuntimeArrayLiteralExpression(context, expression, bindings);
  if (runtime.kind === "unsupported") {
    return runtime;
  }
  if (runtime.kind === "lowered") {
    return produced({ kind: "runtime", elements: runtime.operation });
  }

  return notApplicable;
}

// eslint-disable-next-line max-statements -- Runtime array literal classification handles holes plus fixed/runtime spreads.
function lowerRuntimeArrayLiteralExpression(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<readonly JsIrRuntimeArrayElement[]> {
  if (!ts.isArrayLiteralExpression(expression)) {
    return notApplicable;
  }

  const elements: JsIrRuntimeArrayElement[] = [];
  let needsRuntimeArray = false;
  for (const element of expression.elements) {
    if (ts.isSpreadElement(element)) {
      if (ts.isIdentifier(element.expression)) {
        const binding = bindings.get(element.expression.text);
        if (binding?.kind === "array") {
          elements.push({ kind: "spread", arrayName: element.expression.text, sourceKind: "fixed" });
          needsRuntimeArray = true;
          continue;
        }
      }
      const source = context.lowerValueExpression(context, element.expression, bindings);
      if (source.kind !== "lowered") {
        return source;
      }
      elements.push({
        kind: "iterableSpread",
        source: source.operation,
        notIterableMessage: `${iteratorErrorSubject(element.expression)} is not iterable`
      });
      needsRuntimeArray = true;
      continue;
    }
    if (ts.isOmittedExpression(element)) {
      elements.push({ kind: "hole" });
      needsRuntimeArray = true;
      continue;
    }
    const numberResult = context.lowerNumberExpression(context, element, bindings);
    if (numberResult.kind === "unsupported") {
      return numberResult;
    }
    const number = loweredPayload(numberResult);
    const value = context.lowerValueExpression(context, element, bindings);
    if (value.kind !== "lowered") {
      return value;
    }
    if (number === undefined) {
      needsRuntimeArray = true;
    }
    elements.push({ kind: "value", value: value.operation });
  }

  if (!needsRuntimeArray) {
    return notApplicable;
  }
  return produced(elements);
}
