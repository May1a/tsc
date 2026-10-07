import { type Lowered, loweredPayload, notApplicable, produced } from "./lowered.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import type { LoweringContext } from "./context.js";
import type { JsIrStringExpression, JsIrValueExpression } from "./expressions.js";
import { lowerCanonicalArrayIndexString } from "./predicates.js";
import { lowerPropertyKeyExpression } from "./string-expressions.js";

// reject the access instead of letting it evaluate to undefined.
export function isFunctionPrototypeAccess(
  expression: ts.PropertyAccessExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): boolean {
  if (expression.name.text !== "prototype" || !ts.isIdentifier(expression.expression)) {
    return false;
  }
  const binding = bindings.get(expression.expression.text);
  return (
    binding?.kind === "function" ||
    binding?.kind === "functionReference" ||
    (binding?.kind === "valueVariable" && binding.valueType === "function")
  );
}

export function lowerOptionalChainValueExpression(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.name)) {
    if (isFunctionPrototypeAccess(expression, bindings)) {
      return notApplicable;
    }
    const receiver = context.lowerValueExpression(context, expression.expression, bindings);
    if (receiver.kind !== "lowered") {
      return receiver;
    }
    const key: JsIrStringExpression = { kind: "literal", value: expression.name.text };
    const makeAccess = (value: JsIrValueExpression): JsIrValueExpression => ({ kind: "valueObjectDynamicAccess", value, key });
    return produced(buildOptionalChainLink(receiver.operation, makeAccess, expression.questionDotToken !== undefined));
  }
  if (ts.isElementAccessExpression(expression)) {
    const receiver = context.lowerValueExpression(context, expression.expression, bindings);
    if (receiver.kind !== "lowered") {
      return receiver;
    }
    const makeAccess = optionalElementAccessFactory(context, expression, bindings);
    if (makeAccess.kind !== "lowered") {
      return makeAccess;
    }
    return produced(buildOptionalChainLink(receiver.operation, makeAccess.operation, expression.questionDotToken !== undefined));
  }
  if (ts.isCallExpression(expression) && expression.questionDotToken !== undefined) {
    const calleeResult = context.lowerValueExpression(context, expression.expression, bindings);
    if (calleeResult.kind === "unsupported") {
      return calleeResult;
    }
    const callee = loweredPayload(calleeResult);
    if (callee !== undefined && (callee.kind === "undefined" || callee.kind === "null")) {
      return produced({ kind: "undefined" });
    }
  }
  return notApplicable;
}

function buildOptionalChainLink(
  receiver: JsIrValueExpression,
  makeAccess: (value: JsIrValueExpression) => JsIrValueExpression,
  isOptionalLink: boolean
): JsIrValueExpression {
  if (isOptionalLink) {
    return { kind: "optionalChain", guard: receiver, access: makeAccess({ kind: "optionalTarget" }) };
  }
  if (receiver.kind === "optionalChain") {
    return { ...receiver, access: makeAccess(receiver.access) };
  }
  return makeAccess(receiver);
}

function optionalElementAccessFactory(
  context: LoweringContext,
  expression: ts.ElementAccessExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<((value: JsIrValueExpression) => JsIrValueExpression)> {
  const indexResult = context.lowerNumberExpression(context, expression.argumentExpression, bindings);
  if (indexResult.kind === "unsupported") {
    return indexResult;
  }
  let index = loweredPayload(indexResult);
  const stringIndex = lowerCanonicalArrayIndexString(expression.argumentExpression);
  if (stringIndex !== undefined) {
    index = { kind: "literal", value: stringIndex };
  }
  if (index !== undefined) {
    const resolvedIndex = index;
    let keyValue = "0";
    if (resolvedIndex.kind === "literal") {
      keyValue = String(resolvedIndex.value);
    }
    return produced((value) => ({ kind: "valueArrayAccess", value, index: resolvedIndex, key: { kind: "literal", value: keyValue } }));
  }
  const key = lowerPropertyKeyExpression(context, expression.argumentExpression, bindings);
  if (key.kind === "unsupported") {
    return key;
  }
  if (key.kind === "lowered") {
    return produced((value) => ({ kind: "valueObjectDynamicAccess", value, key: key.operation }));
  }
  return notApplicable;
}
