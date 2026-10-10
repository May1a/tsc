import { unsupportedFormMessage } from "./builtins/manifest.js";
import ts from "typescript";
import { type Lowered, unsupported } from "./lowered.js";
import type { JsIrBindingValue } from "./bindings.js";
import { callTargetMessage, isRecognizedGlobalCallee, plannedMemberReadMessage } from "./builtins/owners.js";
import {
  definePropertyArgumentCount,
  errorConstructorNames,
  isInlineCppTaggedTemplate,
  isLiteralElementAccessArgument,
  isUnsupportedSymbolExpression,
  lowerCanonicalArrayIndexString,
  unwrapTypeOnlyExpression
} from "./predicates.js";

/**
 * Why a statement or expression did not lower.
 *
 * Every function here answers one question — what should the user be told about a thing the compiler
 * could not turn into code — and none of them lowers anything. That separation is the point. A
 * recognizer that reports `unsupported` carries the reason it gave up; this module carries the reasons
 * for the shapes no recognizer claimed at all.
 *
 * **The order the checks run in is the order of specificity, not of convenience.** `isFinite(2)` has
 * to reach the generic call-target message *last*, because `Object.defineProperty` and the inline-cpp
 * tag each have a better one, and putting the generic check first replaced two specific diagnostics
 * with a string that names neither.
 *
 * It depends on the shape predicates and the support-table owner lookup and on nothing else, which is
 * what makes it readable on its own: a reader looking for "why did my program not compile" arrives
 * here and is not reading the lowering.
 */
export function unsupportedStatementMessage(statement: ts.Statement, bindings: ReadonlyMap<string, JsIrBindingValue>): string {
  if (ts.isVariableStatement(statement)) {
    const [declaration] = statement.declarationList.declarations;
    if (declaration.initializer !== undefined) {
      const message = unsupportedExpressionMessage(declaration.initializer, bindings);
      if (message !== undefined) {
        return message;
      }
    }
  }

  if (ts.isFunctionDeclaration(statement)) {
    if (statement.parameters.some((parameter) => parameter.type?.kind === ts.SyntaxKind.StringKeyword)) {
      return "String parameters in function declarations are not supported by the current runtime string ABI";
    }
  }

  if (ts.isExpressionStatement(statement)) {
    const message = unsupportedExpressionMessage(statement.expression, bindings);
    if (message !== undefined) {
      return message;
    }
  }

  return `Unsupported statement in the current lowering slice: ${syntaxKindName(statement.kind)}`;
}

/** Supply a fallback diagnostic only when no recognizer claimed the statement. */
export function loweredStatementResult(
  result: Lowered,
  statement: ts.Statement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (result.kind !== "notApplicable") {
    return result;
  }
  return unsupported(unsupportedStatementMessage(statement, bindings));
}

/**
 * The canonical name of a `ts.SyntaxKind`.
 *
 * The enum declares 28 range aliases after the values they alias — `FirstStatement` is declared
 * just after `VariableStatement` and holds the same number — so the reverse lookup
 * `ts.SyntaxKind[kind]`, which walks the enum object in insertion order and takes the last match,
 * resolves to the alias. A user whose `const` declaration was rejected was being told their
 * variable declaration was a `FirstStatement`. Insertion order is declaration order, so the first
 * name for a value is the canonical one.
 */
const syntaxKindNames: ReadonlyMap<ts.SyntaxKind, string> = (() => {
  const names = new Map<ts.SyntaxKind, string>();
  for (const [name, value] of Object.entries(ts.SyntaxKind)) {
    if (typeof value === "number" && !names.has(value)) {
      names.set(value, name);
    }
  }
  return names;
})();

function syntaxKindName(kind: ts.SyntaxKind): string {
  return syntaxKindNames.get(kind) ?? String(kind);
}

function unsupportedExpressionMessage(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): string | undefined {
  if (ts.isNewExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === "Date" && !bindings.has("Date")) {
    return unsupportedFormMessage("date-constructor");
  }

  if (isUnsupportedSymbolExpression(expression, new Map())) {
    return "General Symbol values are not supported; only the well-known Symbol.iterator key is available";
  }
  const inlineCppMessage = unsupportedInlineCppExpressionMessage(expression);
  if (inlineCppMessage !== undefined) {
    return inlineCppMessage;
  }
  const runtimeBoundary = unsupportedRuntimeBoundaryMessage(expression, bindings);
  if (runtimeBoundary !== undefined) {
    return runtimeBoundary;
  }
  const binaryMessage = unsupportedBinaryExpressionMessage(expression);
  if (binaryMessage !== undefined) {
    return binaryMessage;
  }
  if (ts.isArrayLiteralExpression(expression)) {
    return unsupportedArrayLiteralMessage(expression);
  }
  if (ts.isObjectLiteralExpression(expression)) {
    return unsupportedObjectLiteralMessage(expression);
  }
  if (unsupportedStringExpression(expression)) {
    return "Unsupported string expression in the current runtime string lowering slice";
  }
  const nestedMessage = unsupportedNestedExpressionMessage(expression, bindings);
  if (nestedMessage !== undefined) {
    return nestedMessage;
  }
  if (ts.isElementAccessExpression(expression) && !isLiteralElementAccessArgument(expression)) {
    if (containsNestedObjectElementAccess(expression)) {
      return "Dynamic computed object keys on nested known-shape objects are not supported yet";
    }
    return "Dynamic computed object keys are not supported by known-shape numeric objects";
  }
  return fallbackCallTargetMessage(expression, bindings) ?? plannedMemberReadMessage(expression, bindings);
}

/**
 * The last-resort diagnostic for an expression nothing lowered: the name of the call target.
 *
 * It runs after every check that knows more about why the expression did not lower. The callee may
 * be a bare global or a tagged template's tag, neither of which is a property access, and without
 * this `isFinite(2)` and `String.raw` would report their enclosing statement instead of the builtin
 * that is missing.
 */
function fallbackCallTargetMessage(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): string | undefined {
  if (ts.isCallExpression(expression) && !isRecognizedGlobalCallee(expression.expression)) {
    return callTargetMessage(expression.expression, bindings);
  }
  if (ts.isTaggedTemplateExpression(expression)) {
    return callTargetMessage(expression.tag, bindings);
  }
  return undefined;
}

function unsupportedBinaryExpressionMessage(expression: ts.Expression): string | undefined {
  if (!ts.isBinaryExpression(expression)) {
    return undefined;
  }
  if (expression.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword) {
    return unsupportedInstanceOfMessage(expression);
  }
  if (expression.operatorToken.kind === ts.SyntaxKind.InKeyword) {
    return "The `in` operator only supports runtime dictionary objects and runtime arrays on the right-hand side";
  }
  return undefined;
}

function unsupportedNestedExpressionMessage(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): string | undefined {
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    return unsupportedExpressionMessage(expression.right, bindings);
  }
  if (!ts.isCallExpression(expression)) {
    return undefined;
  }
  for (const argument of expression.arguments) {
    const message = unsupportedExpressionMessage(argument, bindings);
    if (message !== undefined) {
      return message;
    }
  }
  return undefined;
}

function unsupportedInlineCppExpressionMessage(expression: ts.Expression): string | undefined {
  if (!isInlineCppTaggedTemplate(expression)) {
    return undefined;
  }
  if (!ts.isNoSubstitutionTemplateLiteral(expression.template)) {
    return "Inline C++ interpolation is not supported yet";
  }
  return undefined;
}

function unsupportedRuntimeBoundaryMessage(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): string | undefined {
  if (ts.isElementAccessExpression(expression) && isLiteralElementAccessArgument(expression)) {
    if (ts.isStringLiteral(expression.argumentExpression)) {
      const key = expression.argumentExpression.text;
      if (key !== "length" && lowerCanonicalArrayIndexString(expression.argumentExpression) === undefined) {
        return `Runtime array string key "${key}" is not supported; only canonical non-negative integer string literals are supported`;
      }
    }
  }
  if (!ts.isCallExpression(expression)) {
    return undefined;
  }
  const callee = expression.expression;
  // A global the compiler lowers itself is reported by its own recognizer, which knows what inside
  // it failed; attributing the failure to the global's own name would name the wrong thing.
  if (isRecognizedGlobalCallee(callee)) {
    return undefined;
  }
  if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)) {
    const jsonMessage = unsupportedJsonMessage(callee);
    if (jsonMessage !== undefined) {
      return jsonMessage;
    }
    if (callee.expression.text === "Object") {
      if (callee.name.text === "defineProperty") {
        return unsupportedDefinePropertyMessage(expression);
      }
      if (callee.name.text === "keys") {
        return "Object.keys is only supported for runtime dictionary objects and runtime arrays";
      }
      if (callee.name.text === "assign") {
        return "Object.assign is only supported for runtime dictionary object targets and sources";
      }
    }
    if (callee.name.text === "push" || callee.name.text === "pop" || callee.name.text === "shift" || callee.name.text === "unshift") {
      return "Array method calls are only supported on runtime arrays";
    }
  }
  return callTargetMessage(callee, bindings);
}

function unsupportedJsonMessage(callee: ts.PropertyAccessExpression): string | undefined {
  if (!ts.isIdentifier(callee.expression) || callee.expression.text !== "JSON") {
    return undefined;
  }
  if (callee.name.text === "parse") {
    return "JSON.parse is only supported with a text argument and an optional reviver that lower to runtime values";
  }
  if (callee.name.text === "stringify") {
    return "JSON.stringify replacers must be string-array bindings and indents must be numeric literals between 0 and 10";
  }
  return undefined;
}

function unsupportedInstanceOfMessage(expression: ts.BinaryExpression): string {
  const right = unwrapTypeOnlyExpression(expression.right);
  if (!ts.isIdentifier(right) || !errorConstructorNames.has(right.text)) {
    return "instanceof right-hand sides are only supported for built-in error constructors";
  }
  return "instanceof on primitive values is not supported; JavaScript would throw a TypeError for non-object left-hand sides";
}

function unsupportedDefinePropertyMessage(expression: ts.CallExpression): string | undefined {
  if (expression.arguments.length !== definePropertyArgumentCount) {
    return undefined;
  }
  const [_targetExpression, _keyExpression, descriptor] = expression.arguments;
  if (!ts.isObjectLiteralExpression(descriptor)) {
    return undefined;
  }
  for (const property of descriptor.properties) {
    if (ts.isGetAccessorDeclaration(property) || ts.isSetAccessorDeclaration(property) || ts.isMethodDeclaration(property)) {
      return "Object.defineProperty accessor descriptors are not supported yet";
    }
    if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && (property.name.text === "writable" || property.name.text === "enumerable" || property.name.text === "configurable")) {
      if (property.initializer.kind !== ts.SyntaxKind.TrueKeyword && property.initializer.kind !== ts.SyntaxKind.FalseKeyword) {
        return "Object.defineProperty descriptor booleans must be literal true or false";
      }
    }
  }
  return undefined;
}

function containsNestedObjectElementAccess(expression: ts.Expression): boolean {
  if (ts.isElementAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
    return true;
  }
  if (ts.isCallExpression(expression)) {
    return expression.arguments.some((argument) => containsNestedObjectElementAccess(argument));
  }
  if (ts.isBinaryExpression(expression)) {
    return containsNestedObjectElementAccess(expression.left) || containsNestedObjectElementAccess(expression.right);
  }
  return false;
}

function unsupportedArrayLiteralMessage(expression: ts.ArrayLiteralExpression): string | undefined {
  for (const element of expression.elements) {
    if (ts.isOmittedExpression(element)) {
      return "Array holes are not supported; fixed numeric arrays require every element to be present";
    }
    if (ts.isSpreadElement(element)) {
      return "Array spread elements are not supported in fixed numeric arrays";
    }
    if (ts.isArrayLiteralExpression(element) || ts.isObjectLiteralExpression(element) || unsupportedStringExpression(element)) {
      return "Non-numeric array elements are not supported; fixed numeric arrays only store numbers";
    }
  }
  return undefined;
}

function unsupportedObjectLiteralMessage(expression: ts.ObjectLiteralExpression): string | undefined {
  for (const property of expression.properties) {
    if (ts.isSpreadAssignment(property)) {
      return "Object spread properties are not supported by known-shape numeric objects";
    }
    if (ts.isShorthandPropertyAssignment(property)) {
      return "Object shorthand properties are not supported by known-shape numeric objects";
    }
    if (ts.isMethodDeclaration(property)) {
      return "Object methods are not supported by known-shape numeric objects";
    }
    if (ts.isPropertyAssignment(property)) {
      if (ts.isComputedPropertyName(property.name)) {
        return "Dynamic computed object keys are not supported by known-shape numeric objects";
      }
      if (unsupportedStringExpression(property.initializer) || property.initializer.kind === ts.SyntaxKind.TrueKeyword || property.initializer.kind === ts.SyntaxKind.FalseKeyword) {
        return "Non-number object fields are not supported by known-shape numeric objects";
      }
      if (ts.isObjectLiteralExpression(property.initializer)) {
        const nested = unsupportedObjectLiteralMessage(property.initializer);
        if (nested !== undefined) {
          return nested;
        }
      }
    }
  }
  return undefined;
}

function unsupportedStringExpression(expression: ts.Expression): boolean {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return true;
  }
  if (ts.isBinaryExpression(expression)) {
    if (expression.operatorToken.kind === ts.SyntaxKind.InKeyword) {
      return false;
    }
    if (
      expression.operatorToken.kind === ts.SyntaxKind.EqualsToken
      || expression.operatorToken.kind === ts.SyntaxKind.CommaToken
    ) {
      return unsupportedStringExpression(expression.left) || unsupportedStringExpression(expression.right);
    }
    return unsupportedStringExpression(expression.left) || unsupportedStringExpression(expression.right);
  }
  if (ts.isConditionalExpression(expression)) {
    return unsupportedStringExpression(expression.whenTrue) || unsupportedStringExpression(expression.whenFalse);
  }
  if (ts.isVoidExpression(expression)) {
    return false;
  }
  if (ts.isCallExpression(expression)) {
    if (ts.isPropertyAccessExpression(expression.expression)) {
      return false;
    }
    return expression.arguments.some((argument) => unsupportedStringExpression(argument));
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return false;
  }
  return false;
}
