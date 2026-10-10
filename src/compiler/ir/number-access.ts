import { type Lowered, loweredPayload, notApplicable, produced } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import type { JsIrNumberExpression } from "./expressions.js";
import { lowerClassValueExpression } from "./class-values.js";
import { isBoxedAggregateCandidateBinding, lowerObjectAccessPath } from "./builtins/object-producers.js";
import { lowerCanonicalArrayIndexString } from "./predicates.js";

// Reads a class instance member (field or getter) as a number by unboxing the
// JSValue it lowers to, so numeric instance members participate in arithmetic.
// Gated on the member's static type so string/other members are left to the
// value path (otherwise number-first contexts like `print` would coerce to NaN).
export function lowerClassNumberAccess(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrNumberExpression> {
  const { typeChecker } = context;
  if (typeChecker === undefined) {
    return notApplicable;
  }
  const isMemberAccess = ts.isPropertyAccessExpression(expression) || (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression));
  if (!isMemberAccess) {
    return notApplicable;
  }
  const type = typeChecker.getTypeAtLocation(expression);
  if ((type.flags & (ts.TypeFlags.Number | ts.TypeFlags.NumberLiteral)) === 0) {
    return notApplicable;
  }
  const value = lowerClassValueExpression(context, expression, bindings);
  if (value.kind !== "lowered") {
    return value;
  }
  return produced({ kind: "valueToNumber", value: value.operation });
}

export function lowerNumberAccessExpression(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrNumberExpression> {
  if (context.typeChecker?.getTypeAtLocation(expression).getCallSignatures().length !== 0) {
    return notApplicable;
  }
  if (ts.isElementAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
    const binding = bindings.get(expression.expression.text);
    const indexResult = context.lowerNumberExpression(context, expression.argumentExpression, bindings);
    if (indexResult.kind === "unsupported") {
      return indexResult;
    }
    const index = loweredPayload(indexResult);
    if (binding?.kind === "array" && index !== undefined) {
      return produced({ kind: "arrayAccess", arrayName: expression.expression.text, index });
    }

    const valueAccess = lowerValueElementAccessNumber(context, expression, binding, index, bindings);
    if (valueAccess.kind !== "notApplicable") {
      return valueAccess;
    }

    const access = lowerObjectAccessPath(expression, bindings);
    if (access !== undefined) {
      return produced({ kind: "objectAccess", objectName: access.objectName, path: access.path });
    }
  }

  if (ts.isPropertyAccessExpression(expression)) {
    const access = lowerObjectAccessPath(expression, bindings);
    if (access !== undefined) {
      return produced({ kind: "objectAccess", objectName: access.objectName, path: access.path });
    }
    const lengthAccess = lowerLengthPropertyAccessExpression(context, expression, bindings);
    if (lengthAccess.kind !== "notApplicable") {
      return lengthAccess;
    }
  }

  return notApplicable;
}

function lowerLengthPropertyAccessExpression(
  context: LoweringContext,
  expression: ts.PropertyAccessExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrNumberExpression> {
  if (expression.name.text !== "length") {
    return notApplicable;
  }
  if (!ts.isIdentifier(expression.expression)) {
    // Chained receiver (for example `error.message.length`): the runtime
    // dispatches on the boxed value's tag to read string/array/object lengths.
    const value = context.lowerValueExpression(context, expression.expression, bindings);
    if (value.kind !== "lowered") {
      return value;
    }
    return produced({ kind: "valueLength", value: value.operation });
  }
  const binding = bindings.get(expression.expression.text);
  if (binding?.kind === "array" || binding?.kind === "runtimeArray") {
    return produced({ kind: "arrayLength", arrayName: expression.expression.text });
  }
  if (!isBoxedAggregateCandidateBinding(binding)) {
    return notApplicable;
  }
  const value = context.lowerValueExpression(context, expression.expression, bindings);
  if (value.kind !== "lowered") {
    return value;
  }
  if (binding?.kind === "value" && binding.value.kind === "boxedPrimitive") {
    return produced({ kind: "valueObjectLength", value: value.operation });
  }
  if (context.typeChecker?.getTypeAtLocation(expression.expression).getCallSignatures().length
      || (binding?.kind === "valueVariable" && binding.valueType === "function")) {
    return produced({ kind: "valueLength", value: value.operation });
  }
  return produced({ kind: "valueArrayLength", value: value.operation });
}

export function isProvenBoxedAggregateBinding(binding: JsIrBindingValue | undefined): boolean {
  if (binding?.kind !== "value") {
    return false;
  }
  return binding.value.kind === "objectRef" || binding.value.kind === "arrayRef" || binding.value.kind === "objectDynamicAccess" || binding.value.kind === "arrayAccess" || binding.value.kind === "valueObjectDynamicAccess" || binding.value.kind === "valueArrayAccess";
}

function lowerValueElementAccessNumber(
  context: LoweringContext,
  expression: ts.ElementAccessExpression,
  binding: JsIrBindingValue | undefined,
  index: JsIrNumberExpression | undefined,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrNumberExpression> {
  if (index === undefined || binding?.kind !== "value") {
    return notApplicable;
  }
  const stringIndex = lowerCanonicalArrayIndexString(expression.argumentExpression);
  if (stringIndex === undefined) {
    return notApplicable;
  }
  const value = context.lowerValueExpression(context, expression.expression, bindings);
  if (value.kind !== "lowered") {
    return value;
  }
  return produced({
    kind: "valueToNumber",
    value: {
      kind: "valueArrayAccess",
      value: value.operation,
      index: { kind: "literal", value: stringIndex },
      key: { kind: "literal", value: String(stringIndex) }
    }
  });
}
