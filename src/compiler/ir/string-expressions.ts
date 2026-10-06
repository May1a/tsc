import { type Lowered, loweredPayload, notApplicable, produced } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import type { JsIrStringExpression, JsIrValueExpression } from "./expressions.js";
import { isRegexExpression } from "./regex-predicates.js";
import { lowerRuntimeNumberFormatExpression, lowerRuntimeStringMethodExpression, lowerStringFromCharCodeExpression } from "./string-builtins.js";
import { lowerTypeOfResult } from "./comparisons.js";
import { lowerSymbolIteratorKeyExpression } from "./class-info.js";
import { sourceNumericLiteralValue } from "./enums.js";
import { lowerCallArguments } from "./call-arguments.js";
import { lowerDateConstructorMilliseconds } from "./number-builtins.js";
import { numericLiteralValue } from "./number-constants.js";

// eslint-disable-next-line complexity, max-statements -- Runtime string lowering is centralized during the JSValue transition.
export function lowerStringRuntimeExpression(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrStringExpression> {
  if (
    ts.isCallExpression(expression) &&
    ts.isPropertyAccessExpression(expression.expression) &&
    expression.expression.name.text === "replace" &&
    expression.arguments.length === 2 &&
    isRegexExpression(expression.arguments[0], bindings)
  ) {
    const receiverResult = context.lowerStringRuntimeExpression(context, expression.expression.expression, bindings);
    if (receiverResult.kind === "unsupported") {
      return receiverResult;
    }
    const receiver = loweredPayload(receiverResult);
    const regexResult = context.lowerValueExpression(context, expression.arguments[0], bindings);
    if (regexResult.kind === "unsupported") {
      return regexResult;
    }
    const regex = loweredPayload(regexResult);
    const replacementResult = context.lowerStringRuntimeExpression(context, expression.arguments[1], bindings);
    if (replacementResult.kind === "unsupported") {
      return replacementResult;
    }
    const replacement = loweredPayload(replacementResult);
    if (receiver !== undefined && regex !== undefined && replacement !== undefined) {
      return produced({ kind: "regexReplace", receiver, regex, replacement });
    }
  }
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return produced({ kind: "literal", value: expression.text });
  }

  if (ts.isIdentifier(expression)) {
    const binding = bindings.get(expression.text);
    if (binding?.kind === "string") {
      return produced({ kind: "literal", value: binding.value });
    }
    if (binding?.kind === "stringExpression") {
      return produced(binding.value);
    }
    if (binding?.kind === "stringVariable") {
      return produced({ kind: "variable", name: binding.name });
    }
  }

  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return lowerStringConcatExpression(context, expression, bindings);
  }

  if (ts.isTemplateExpression(expression)) {
    return lowerTemplateExpression(context, expression, bindings);
  }

  if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text !== "print") {
    if (expression.expression.text === "String" && expression.arguments.length === 1) {
      const value = context.lowerValueExpression(context, expression.arguments[0], bindings);
      if (value.kind === "unsupported") {
        return value;
      }
      if (value.kind === "lowered") {
        return produced({ kind: "stringConversion", value: value.operation });
      }
    }
    return lowerStringCallExpression(context, expression, bindings);
  }

  if (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression)) {
    const dateIsoString = lowerDateIsoStringExpression(context, expression, bindings);
    if (dateIsoString.kind !== "notApplicable") {
      return dateIsoString;
    }
    const numberFormatMethod = lowerRuntimeNumberFormatExpression(context, expression, bindings);
    if (numberFormatMethod.kind !== "notApplicable") {
      return numberFormatMethod;
    }
    const fromCharCode = lowerStringFromCharCodeExpression(context, expression, bindings);
    if (fromCharCode.kind !== "notApplicable") {
      return fromCharCode;
    }
    const runtimeStringMethod = lowerRuntimeStringMethodExpression(context, expression, bindings);
    if (runtimeStringMethod.kind !== "notApplicable") {
      return runtimeStringMethod;
    }
    if (!ts.isIdentifier(expression.expression.expression)) {
      return notApplicable;
    }
    if (expression.expression.name.text === "toString" && expression.arguments.length === 0) {
      const receiverBinding = bindings.get(expression.expression.expression.text);
      if (receiverBinding?.kind === "runtimeObject" && receiverBinding.errorName !== undefined) {
        return produced({ kind: "errorToString", objectName: receiverBinding.name });
      }
    }
    const arrayName = expression.expression.expression.text;
    if (expression.expression.name.text === "join" && bindings.get(arrayName)?.kind === "runtimeArray" && expression.arguments.length === 1) {
      const separator = context.lowerStringRuntimeExpression(context, expression.arguments[0], bindings);
      if (separator.kind === "unsupported") {
        return separator;
      }
      if (separator.kind === "lowered") {
        return produced({ kind: "arrayJoin", arrayName, separator: separator.operation });
      }
    }
  }

  if (ts.isTypeOfExpression(expression)) {
    const typeName = lowerTypeOfResult(expression.expression, bindings);
    if (typeName !== undefined) {
      return produced({ kind: "typeof", value: typeName });
    }
  }

  if (!ts.isConditionalExpression(expression)) {
    return notApplicable;
  }

  const condition = context.lowerConditionExpression(context, expression.condition, bindings);
  const consequentResult = context.lowerStringRuntimeExpression(context, expression.whenTrue, bindings);
  if (consequentResult.kind === "unsupported") {
    return consequentResult;
  }
  const consequent = loweredPayload(consequentResult);
  const alternateResult = context.lowerStringRuntimeExpression(context, expression.whenFalse, bindings);
  if (alternateResult.kind === "unsupported") {
    return alternateResult;
  }
  const alternate = loweredPayload(alternateResult);
  if (condition.kind !== "lowered" || consequent === undefined || alternate === undefined) {
    return notApplicable;
  }

  return produced({
    kind: "ternary",
    condition: condition.operation,
    consequent,
    alternate
  });
}

export function lowerPropertyKeyExpression(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrStringExpression> {
  const symbolIterator = lowerSymbolIteratorKeyExpression(expression, bindings);
  if (symbolIterator !== undefined) {
    return produced(symbolIterator);
  }
  // A signed numeric literal is still a constant key, so `E[-1]` resolves the way `E["-1"]` does.
  const numeric = sourceNumericLiteralValue(expression);
  if (numeric !== undefined) {
    return produced({ kind: "literal", value: String(numeric) });
  }
  if (expression.kind === ts.SyntaxKind.TrueKeyword) {
    return produced({ kind: "literal", value: "true" });
  }
  if (expression.kind === ts.SyntaxKind.FalseKeyword) {
    return produced({ kind: "literal", value: "false" });
  }
  return context.lowerStringRuntimeExpression(context, expression, bindings);
}

function lowerStringConcatExpression(
  context: LoweringContext,
  expression: ts.BinaryExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrStringExpression> {
  const leftResult = context.lowerStringRuntimeExpression(context, expression.left, bindings);
  if (leftResult.kind === "unsupported") {
    return leftResult;
  }
  const left = loweredPayload(leftResult);
  const rightResult = context.lowerStringRuntimeExpression(context, expression.right, bindings);
  if (rightResult.kind === "unsupported") {
    return rightResult;
  }
  const right = loweredPayload(rightResult);
  if (left !== undefined && right !== undefined) {
    return produced({ kind: "concat", left, right });
  }
  if (left === undefined && right === undefined) {
    return notApplicable;
  }
  const leftValueResult = context.lowerValueExpression(context, expression.left, bindings);
  if (leftValueResult.kind === "unsupported") {
    return leftValueResult;
  }
  const leftValue = loweredPayload(leftValueResult);
  const rightValueResult = context.lowerValueExpression(context, expression.right, bindings);
  if (rightValueResult.kind === "unsupported") {
    return rightValueResult;
  }
  const rightValue = loweredPayload(rightValueResult);
  if (leftValue === undefined || rightValue === undefined) {
    return notApplicable;
  }
  return produced({
    kind: "concat",
    left: { kind: "stringConversion", value: leftValue },
    right: { kind: "stringConversion", value: rightValue }
  });
}

// eslint-disable-next-line complexity, max-statements -- Template literal lowering handles multi-interpolation, nested templates, and tagged templates in one place.
function lowerTemplateExpression(
  context: LoweringContext,
  expression: ts.TemplateExpression | ts.TaggedTemplateExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrStringExpression> {
  if (ts.isTaggedTemplateExpression(expression)) {
    return lowerTaggedTemplateExpression(context, expression, bindings);
  }
  const head = expression.head.text;
  let result: JsIrStringExpression = { kind: "literal", value: head };
  for (const span of expression.templateSpans) {
    const exprValue = context.lowerValueExpression(context, span.expression, bindings);
    if (exprValue.kind !== "lowered") {
      return exprValue;
    }
    const middle = span.literal.text;
    result = {
      kind: "concat",
      left: result,
      right: {
        kind: "concat",
        left: { kind: "stringConversion", value: exprValue.operation },
        right: { kind: "literal", value: middle }
      }
    };
  }
  return produced(result);
}

function lowerTaggedTemplateExpression(
  context: LoweringContext,
  expression: ts.TaggedTemplateExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrStringExpression> {
  if (!ts.isIdentifier(expression.tag) || expression.tag.text === "String") {
    return notApplicable;
  }
  const tagBinding = bindings.get(expression.tag.text);
  if (tagBinding?.kind !== "function" || tagBinding.returnKind !== "string") {
    return notApplicable;
  }
  const { template } = expression;
  if (ts.isNoSubstitutionTemplateLiteral(template)) {
    return produced({ kind: "literal", value: template.text });
  }
  const headText = template.head.text;
  const middleTexts: string[] = [];
  const middleExpressions: JsIrValueExpression[] = [];
  for (const span of template.templateSpans) {
    middleTexts.push(span.literal.text);
    const exprValue = context.lowerValueExpression(context, span.expression, bindings);
    if (exprValue.kind !== "lowered") {
      return exprValue;
    }
    middleExpressions.push(exprValue.operation);
  }
  return produced({
    kind: "taggedTemplate",
    tag: expression.tag.text,
    head: headText,
    middleTexts,
    expressions: middleExpressions
  });
}

function lowerStringCallExpression(
  context: LoweringContext,
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrStringExpression> {
  if (!ts.isIdentifier(expression.expression)) {
    return notApplicable;
  }
  const callee = bindings.get(expression.expression.text);
  if (callee?.kind !== "function" || callee.returnKind !== "string") {
    return notApplicable;
  }
  const args = lowerCallArguments(context, expression.expression.text, expression.arguments, bindings);
  if (args.kind !== "lowered") {
    return args;
  }
  return produced({ kind: "call", name: expression.expression.text, arguments: args.operation });
}

function lowerDateIsoStringExpression(
  context: LoweringContext,
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrStringExpression> {
  if (!ts.isPropertyAccessExpression(expression.expression) || expression.expression.name.text !== "toISOString" || expression.arguments.length > 0) {
    return notApplicable;
  }
  const millisResult = lowerDateConstructorMilliseconds(context, expression.expression.expression, bindings);
  if (millisResult.kind === "unsupported") {
    return millisResult;
  }
  const millis = loweredPayload(millisResult);
  if (millis === undefined || numericLiteralValue(millis) !== 0) {
    return notApplicable;
  }
  return produced({ kind: "literal", value: "1970-01-01T00:00:00.000Z" });
}
