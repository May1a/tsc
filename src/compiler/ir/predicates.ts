import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";

/** The tag that marks a template literal as inline C++ rather than a JavaScript tagged template. */
const inlineCppTag = "__tscn_inline_cpp";

export const definePropertyArgumentCount = 3;

export function isInlineCppTaggedTemplate(expression: ts.Expression): expression is ts.TaggedTemplateExpression {
  return ts.isTaggedTemplateExpression(expression) && ts.isIdentifier(expression.tag) && expression.tag.text === inlineCppTag;
}

export const errorConstructorNames: ReadonlySet<string> = new Set(["Error", "TypeError", "RangeError", "EvalError", "URIError", "SyntaxError"]);

/**
 * Erasing every wrapper whose only content is a type.
 *
 * `as T`, the angle-bracket form, `!`, parens and `satisfies T` all produce a value identical to the
 * expression inside them, so a receiver wrapped in one is the same receiver. `satisfies` is the odd one
 * out: it is an *assertion to the compiler* rather than a cast, and it typechecks by requiring the
 * expression to already have the annotated type — which is why unwrapping it is erasure and not a
 * coercion. It belongs here for the same reason `as` does: by the time anything dispatches on the
 * expression's kind, the type information it carried has no representation.
 */
export function unwrapTypeOnlyExpression(expression: ts.Expression): ts.Expression {
  if (
    ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isParenthesizedExpression(expression) ||
    ts.isSatisfiesExpression(expression)
  ) {
    return unwrapTypeOnlyExpression(expression.expression);
  }
  return expression;
}

export function isUnsupportedSymbolExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): boolean {
  if (bindings.has("Symbol")) {
    return false;
  }
  let member: ts.Expression = expression;
  let isCall = false;
  if (ts.isCallExpression(member)) {
    isCall = true;
    member = member.expression;
  }
  if (ts.isIdentifier(member)) {
    return member.text === "Symbol";
  }
  return ts.isPropertyAccessExpression(member) && ts.isIdentifier(member.expression) && member.expression.text === "Symbol" && (isCall || member.name.text !== "iterator");
}

export function isLiteralElementAccessArgument(expression: ts.ElementAccessExpression): boolean {
  return ts.isStringLiteral(expression.argumentExpression) || ts.isNumericLiteral(expression.argumentExpression);
}

export function lowerCanonicalArrayIndexString(expression: ts.Expression): number | undefined {
  if (!ts.isStringLiteral(expression)) {
    return undefined;
  }
  if (expression.text === "0") {
    return 0;
  }
  if (!/^[1-9][0-9]*$/.test(expression.text)) {
    return undefined;
  }
  const value = Number(expression.text);
  if (!Number.isSafeInteger(value)) {
    return undefined;
  }
  return value;
}
/**
 * Predicates over TypeScript expressions that answer a question about *shape* rather than producing
 * IR.
 *
 * They are a module of their own rather than part of `expressions.ts` for two reasons. More than one
 * tier asks them: the diagnostics read them to decide what to say and the lowering reads them to
 * decide what to try, and `unwrapTypeOnlyExpression` has twenty-eight call sites for exactly that —
 * it is the one function every erasure goes through. And `expressions.ts` is a type-only module, so
 * adding values to it would force every importer to carry a second import statement from the same
 * path, which `verbatimModuleSyntax` makes unavoidable and `no-duplicate-imports` then rejects.
 *
 * They depend on nothing but TypeScript's syntax nodes and the binding type, so anything can ask
 * them.
 */
