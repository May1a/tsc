import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import type { JsIrCondition, JsIrNumberExpression } from "./expressions.js";
import { sourceSpan } from "./class-info.js";
import type { CompilerDiagnostic } from "../diagnostics.js";
import { unsupportedStatementMessage } from "./diagnostics.js";
import type { Lowered } from "./lowered.js";

/**
 * `typeof`, truthiness, and the comparison operators.
 *
 * These are the questions a condition asks before it reaches a value: what is this thing, is it
 * truthy, and how do two of them compare. They are grouped because they share the same problem — each
 * has to produce an answer *statically*, from the binding and the syntax, with nothing evaluated — and
 * because that shared constraint is what makes them recognizers rather than runtime calls.
 *
 * `lowerTypeOfResult` mirrors the supported `typeof` cases explicitly rather than folding them into a
 * lookup. The comment above it says why: an unsupported expression has to stay diagnostic-only, so a
 * case that cannot be answered statically returns `undefined` rather than guessing. `null` answering
 * `"object"` is in that list because the language says so.
 *
 * `lowerRuntimeCollectionIdentityCondition` is the one that reads a runtime value rather than a
 * binding. A `Map` or `Set` compared with `===` is a pointer comparison at runtime, which is the whole
 * reason collection identity is a condition and not a static answer.
 */

/**
 * The TSCN1002 for a statement nothing lowered. A recognizer that reported `unsupported` names the
 * reason it gave up; `notApplicable` means no recognizer claimed the shape at all, so the
 * diagnostic falls back to describing the syntax.
 */
export function unsupportedStatementDiagnostic(
  sourceFile: ts.SourceFile,
  statement: ts.Statement,
  result: Lowered,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): CompilerDiagnostic {
  let message = unsupportedStatementMessage(statement, bindings);
  if (result.kind === "unsupported") {
    message = result.reason;
  }
  return {
    code: "TSCN1002",
    category: "error",
    message,
    span: sourceSpan(sourceFile, statement.getStart(sourceFile))
  };
}
export function isNonExecutableDeclaration(statement: ts.Statement): boolean {
  if (
    ts.isImportDeclaration(statement) ||
    ts.isImportEqualsDeclaration(statement) ||
    ts.isExportDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement)
  ) {
    return true;
  }
  // An overload signature is a function declaration with no body: it declares a type the compiler
  // checks calls against and emits nothing. Only the implementation signature is executable, so the
  // signature must be dropped here rather than refused as a function with no body.
  if (ts.isFunctionDeclaration(statement) && statement.body === undefined) {
    return true;
  }

  let modifiers: readonly ts.Modifier[] | undefined;
  if (ts.canHaveModifiers(statement)) {
    modifiers = ts.getModifiers(statement);
  }
  return Boolean(modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword));
}
// eslint-disable-next-line complexity -- Mirrors supported typeof cases explicitly while unsupported expressions stay diagnostic-only.
export function lowerTypeOfResult(expression: ts.Expression, bindings: ReadonlyMap<string, JsIrBindingValue>): string | undefined {
  if (expression.kind === ts.SyntaxKind.UndefinedKeyword || (ts.isIdentifier(expression) && expression.text === "undefined")) {
    return "undefined";
  }
  if (expression.kind === ts.SyntaxKind.NullKeyword) {
    return "object";
  }
  if (expression.kind === ts.SyntaxKind.TrueKeyword || expression.kind === ts.SyntaxKind.FalseKeyword) {
    return "boolean";
  }
  if (ts.isNumericLiteral(expression)) {
    return "number";
  }
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return "string";
  }
  if (ts.isIdentifier(expression)) {
    const binding = bindings.get(expression.text);
    if (binding?.kind === "value") {
      if (binding.value.kind === "undefined") return "undefined";
      if (binding.value.kind === "null") return "object";
      if (binding.value.kind === "boolean") return "boolean";
      if (binding.value.kind === "number") return "number";
      if (binding.value.kind === "string") return "string";
      if (binding.value.kind === "objectRef" || binding.value.kind === "arrayRef" || binding.value.kind === "objectLiteralValue") return "object";
    }
    if (binding?.kind === "runtimeObject" || binding?.kind === "runtimeArray" || binding?.kind === "object" || binding?.kind === "array") {
      return "object";
    }
    if (binding?.kind === "function" || binding?.kind === "closure" || binding?.kind === "closureFactory") {
      return "function";
    }
    if (binding?.kind === "valueVariable" && binding.valueType === "function") {
      return "function";
    }
    if (binding?.kind === "string" || binding?.kind === "stringExpression" || binding?.kind === "stringVariable") return "string";
    if (binding?.kind === "number") return "number";
    if (binding?.kind === "boolean" || binding?.kind === "booleanExpression" || binding?.kind === "booleanVariable") return "boolean";
  }
  return undefined;
}
export function lowerRuntimeCollectionIdentityCondition(
  expression: ts.BinaryExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {
  const operator = lowerComparisonOperator(expression.operatorToken.kind);
  if (operator !== "===" && operator !== "!==" || !ts.isIdentifier(expression.left) || !ts.isIdentifier(expression.right)) {
    return undefined;
  }
  const left = bindings.get(expression.left.text);
  const right = bindings.get(expression.right.text);
  if ((left?.kind !== "runtimeMap" && left?.kind !== "runtimeSet") || left.kind !== right?.kind) {
    return undefined;
  }
  return { kind: "runtimeCollectionIdentity", operator, leftName: left.name, rightName: right.name };
}
export function lowerTruthyConditionExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {
  if (expression.kind === ts.SyntaxKind.UndefinedKeyword || (ts.isIdentifier(expression) && expression.text === "undefined")) {
    return { kind: "valueTruthy", value: { kind: "undefined" } };
  }
  if (expression.kind === ts.SyntaxKind.NullKeyword) {
    return { kind: "valueTruthy", value: { kind: "null" } };
  }
  if (!ts.isIdentifier(expression)) {
    return undefined;
  }
  const binding = bindings.get(expression.text);
  if (binding?.kind === "runtimeObject" || binding?.kind === "runtimeArray") {
    return { kind: "boolean", value: true };
  }
  if (binding?.kind === "value") {
    return { kind: "valueTruthy", value: binding.value };
  }
  if (binding?.kind === "valueVariable") {
    return { kind: "valueTruthy", value: { kind: "variable", name: binding.name } };
  }
  return undefined;
}
export function lowerBooleanComparisonExpression(
  expression: ts.BinaryExpression,
  operator: "===" | "!==" | "==" | "!=" | "<" | "<=" | ">" | ">=",
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {
  if (operator !== "===" && operator !== "!==") {
    return undefined;
  }

  const left = lowerBooleanOperandExpression(expression.left, bindings);
  const right = lowerBooleanOperandExpression(expression.right, bindings);
  if (left === undefined || right === undefined) {
    return undefined;
  }

  return { kind: "booleanComparison", operator, left, right };
}
export function lowerBooleanOperandExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {
  if (expression.kind === ts.SyntaxKind.TrueKeyword || expression.kind === ts.SyntaxKind.FalseKeyword) {
    return { kind: "boolean", value: expression.kind === ts.SyntaxKind.TrueKeyword };
  }

  if (!ts.isIdentifier(expression)) {
    return undefined;
  }

  const binding = bindings.get(expression.text);
  if (binding?.kind === "boolean") {
    return { kind: "boolean", value: binding.value };
  }
  if (binding?.kind === "booleanExpression") {
    return binding.value;
  }
  if (binding?.kind === "booleanVariable") {
    return { kind: "booleanVariable", name: binding.name };
  }

  return undefined;
}
export function lowerComparisonOperator(kind: ts.SyntaxKind): "===" | "!==" | "==" | "!=" | "<" | "<=" | ">" | ">=" | undefined {
  switch (kind) {
    case ts.SyntaxKind.EqualsEqualsToken: {
      return "==";
    }
    case ts.SyntaxKind.ExclamationEqualsToken: {
      return "!=";
    }
    case ts.SyntaxKind.EqualsEqualsEqualsToken: {
      return "===";
    }
    case ts.SyntaxKind.ExclamationEqualsEqualsToken: {
      return "!==";
    }
    case ts.SyntaxKind.LessThanToken: {
      return "<";
    }
    case ts.SyntaxKind.LessThanEqualsToken: {
      return "<=";
    }
    case ts.SyntaxKind.GreaterThanToken: {
      return ">";
    }
    case ts.SyntaxKind.GreaterThanEqualsToken: {
      return ">=";
    }
    default: {
      return undefined;
    }
  }
}
export const mathMethods = new Set<string>([
  "abs",
  "floor",
  "ceil",
  "trunc",
  "round",
  "sqrt",
  "cbrt",
  "pow",
  "exp",
  "log",
  "log2",
  "log10",
  "hypot",
  "min",
  "max",
  "random",
  "fround",
  "clz32",
  "imul",
  "sin",
  "cos",
  "tan",
  "sign"
]);
export function isMathMethod(method: string): method is Extract<JsIrNumberExpression, { readonly kind: "mathCall" }>["method"] {
  return mathMethods.has(method);
}
