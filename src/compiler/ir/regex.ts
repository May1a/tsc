import { type Lowered, loweredPayload, notApplicable, produced } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import type { JsIrCondition, JsIrNumberExpression, JsIrStringExpression, JsIrValueExpression } from "./expressions.js";
import { isRegExpConstructorCall, isRegexExpression } from "./regex-predicates.js";

const regexpConstructorArgumentCount = 2;

function unsupportedRegExpPatternMessage(pattern: string, flags: string): string | undefined {
  if (/[^gimyu]/.test(flags) || new Set(flags).size !== flags.length) {
    return "Unsupported or duplicate RegExp flags";
  }
  if (pattern.includes("(?<") || pattern.includes("(?<=") || pattern.includes("(?<!") || pattern.includes(String.raw`\p{`) || pattern.includes(String.raw`\P{`)) {
    return "RegExp named groups, lookbehind, and Unicode properties are not supported yet";
  }
  return undefined;
}

// eslint-disable-next-line complexity, max-statements -- RegExp values share one lowering seam across literals, constructors, exec, and match.
export function lowerRegexValueExpression(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  if (expression.kind === ts.SyntaxKind.RegularExpressionLiteral) {
    const text = expression.getText();
    const lastSlash = text.lastIndexOf("/");
    if (lastSlash <= 0) {
      return notApplicable;
    }
    const pattern = text.slice(1, lastSlash);
    const flags = text.slice(lastSlash + 1);
    if (unsupportedRegExpPatternMessage(pattern, flags) !== undefined) {
      return notApplicable;
    }
    return produced({
      kind: "regexCompile",
      pattern: { kind: "literal", value: pattern },
      flags: { kind: "literal", value: flags }
    });
  }
  if (isRegExpConstructorCall(expression)) {
    const args = expression.arguments ?? ts.factory.createNodeArray<ts.Expression>();
    if (args.length > regexpConstructorArgumentCount) {
      return notApplicable;
    }
    let pattern: JsIrStringExpression | undefined = { kind: "literal", value: "" };
    if (args.length > 0) {
      const stringRuntimeExpressionResult = context.lowerStringRuntimeExpression(context, args[0], bindings);
      if (stringRuntimeExpressionResult.kind === "unsupported") {
        return stringRuntimeExpressionResult;
      }
      pattern = loweredPayload(stringRuntimeExpressionResult);
    }
    let flags: JsIrStringExpression | undefined = { kind: "literal", value: "" };
    if (args.length >= regexpConstructorArgumentCount) {
      const stringRuntimeExpressionResult2 = context.lowerStringRuntimeExpression(context, args[1], bindings);
      if (stringRuntimeExpressionResult2.kind === "unsupported") {
        return stringRuntimeExpressionResult2;
      }
      flags = loweredPayload(stringRuntimeExpressionResult2);
    }
    if (pattern === undefined || flags === undefined) {
      return notApplicable;
    }
    return produced({ kind: "regexCompile", pattern, flags });
  }
  if (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression)) {
    const method = expression.expression.name.text;
    if ((method === "exec" || method === "match") && expression.arguments.length === 1) {
      if (method === "exec") {
        const regexResult = context.lowerValueExpression(context, expression.expression.expression, bindings);
        if (regexResult.kind === "unsupported") {
          return regexResult;
        }
        const regex = loweredPayload(regexResult);
        const inputResult = context.lowerStringRuntimeExpression(context, expression.arguments[0], bindings);
        if (inputResult.kind === "unsupported") {
          return inputResult;
        }
        const input = loweredPayload(inputResult);
        if (regex !== undefined && input !== undefined) {
          return produced({ kind: "regexExec", regex, input });
        }
      } else {
        const inputResult2 = context.lowerStringRuntimeExpression(context, expression.expression.expression, bindings);
        if (inputResult2.kind === "unsupported") {
          return inputResult2;
        }
        const input = loweredPayload(inputResult2);
        const regexResult2 = context.lowerValueExpression(context, expression.arguments[0], bindings);
        if (regexResult2.kind === "unsupported") {
          return regexResult2;
        }
        const regex = loweredPayload(regexResult2);
        if (regex !== undefined && input !== undefined) {
          return produced({ kind: "regexMatch", regex, input });
        }
      }
    }
  }
  return notApplicable;
}

export function lowerRegexTestCondition(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<Extract<JsIrCondition, { readonly kind: "regexTest" }>> {
  if (
    !ts.isCallExpression(expression) ||
    !ts.isPropertyAccessExpression(expression.expression) ||
    expression.expression.name.text !== "test" ||
    expression.arguments.length !== 1
  ) {
    return notApplicable;
  }
  const regexResult3 = context.lowerValueExpression(context, expression.expression.expression, bindings);
  if (regexResult3.kind === "unsupported") {
    return regexResult3;
  }
  const regex = loweredPayload(regexResult3);
  const inputResult3 = context.lowerStringRuntimeExpression(context, expression.arguments[0], bindings);
  if (inputResult3.kind === "unsupported") {
    return inputResult3;
  }
  const input = loweredPayload(inputResult3);
  if (regex === undefined || input === undefined) {
    return notApplicable;
  }
  return produced({ kind: "regexTest", regex, input });
}

export function lowerRegexSearchNumberExpression(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<Extract<JsIrNumberExpression, { readonly kind: "regexSearch" }>> {
  if (
    !ts.isCallExpression(expression) ||
    !ts.isPropertyAccessExpression(expression.expression) ||
    expression.expression.name.text !== "search" ||
    expression.arguments.length !== 1
  ) {
    return notApplicable;
  }
  const inputResult4 = context.lowerStringRuntimeExpression(context, expression.expression.expression, bindings);
  if (inputResult4.kind === "unsupported") {
    return inputResult4;
  }
  const input = loweredPayload(inputResult4);
  const regexResult4 = context.lowerValueExpression(context, expression.arguments[0], bindings);
  if (regexResult4.kind === "unsupported") {
    return regexResult4;
  }
  const regex = loweredPayload(regexResult4);
  if (input === undefined || regex === undefined || !isRegexExpression(expression.arguments[0], bindings)) {
    return notApplicable;
  }
  return produced({ kind: "regexSearch", regex, input });
}
