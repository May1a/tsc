import ts from "typescript";
import type { LoweringContext } from "./context.js";
import type { JsIrBindingValue } from "./bindings.js";
import type { JsIrArrayDestructureElement, JsIrValueExpression } from "./expressions.js";
import type { JsIrOperation } from "./types.js";
import { type Produced, produced, unsupportedIn, withRefusal } from "./lowered.js";
import { expressionSnippet } from "./diagnostics.js";
import { constAssignmentRefusal } from "./throwing-forms.js";
import { updateBindings } from "./binding-updates.js";
import { lowerFunctionObjectValue } from "./closures.js";

/**
 * Destructuring assignment: `[a, b = 1, ...rest] = source` and `({ a, b: c = 1 } = source)`.
 *
 * An array pattern iterates its source with `arrayDestructureProtocol`. Each target is a `nested`
 * element: its temporary receives the item, and its operations assign the target before the next
 * item is pulled, so a default runs at the same point as in JavaScript and reads the target's old
 * value. An object pattern reads each property from a temporary holding the source.
 *
 * A target is a `let`, `var` or parameter binding in a boxed slot, or a nested pattern. The storage
 * plan boxes every binding a pattern writes (`dynamic`), because a pattern may store any value.
 */
export function lowerDestructuringAssignment(
  context: LoweringContext,
  pattern: ts.ArrayLiteralExpression | ts.ObjectLiteralExpression,
  source: JsIrValueExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<readonly JsIrOperation[]> {
  const working = new Map(bindings);
  return ts.isArrayLiteralExpression(pattern)
    ? lowerArrayAssignment(context, pattern, source, working)
    : lowerObjectAssignment(context, pattern, source, working);
}

/** Whether `expression` is an array or object literal used as an assignment pattern. */
export function isAssignmentPattern(expression: ts.Expression): expression is ts.ArrayLiteralExpression | ts.ObjectLiteralExpression {
  return ts.isArrayLiteralExpression(expression) || ts.isObjectLiteralExpression(expression);
}

/**
 * The operations that write `value` to one assignment target: a boxed binding, or a nested pattern
 * destructured from it.
 */
export function lowerAssignmentTarget(
  context: LoweringContext,
  target: ts.Expression,
  value: JsIrValueExpression,
  working: Map<string, JsIrBindingValue>
): Produced<readonly JsIrOperation[]> {
  const unwrapped = ts.isParenthesizedExpression(target) ? target.expression : target;
  if (isAssignmentPattern(unwrapped)) {
    return ts.isArrayLiteralExpression(unwrapped)
      ? lowerArrayAssignment(context, unwrapped, value, working)
      : lowerObjectAssignment(context, unwrapped, value, working);
  }
  if (!ts.isIdentifier(unwrapped)) {
    return unsupportedIn(`Destructuring into \`${expressionSnippet(unwrapped)}\` is not supported yet; a target must be a variable`);
  }
  const constant = constAssignmentRefusal(context.typeChecker, unwrapped);
  if (constant !== undefined) {
    return unsupportedIn(constant);
  }
  if (working.get(unwrapped.text)?.kind !== "valueVariable") {
    return unsupportedIn(`Destructuring into \`${unwrapped.text}\` needs a \`let\` or \`var\` that can hold any value`);
  }
  return produced([{ kind: "assignValue", name: unwrapped.text, value }]);
}

function lowerArrayAssignment(
  context: LoweringContext,
  pattern: ts.ArrayLiteralExpression,
  source: JsIrValueExpression,
  working: Map<string, JsIrBindingValue>
): Produced<readonly JsIrOperation[]> {
  const elements: JsIrArrayDestructureElement[] = [];
  const after: JsIrOperation[] = [];
  for (const [index, element] of pattern.elements.entries()) {
    if (ts.isOmittedExpression(element)) {
      elements.push({ kind: "elision" });
      continue;
    }
    if (ts.isSpreadElement(element)) {
      if (index !== pattern.elements.length - 1) {
        return unsupportedIn("A rest element must be the last element of an array pattern");
      }
      const restName = `destructure.rest.${element.pos}`;
      elements.push({ kind: "rest", name: restName });
      working.set(restName, { kind: "runtimeArray", name: restName });
      const assigned = lowerAssignmentTarget(context, element.expression, { kind: "arrayRef", name: restName }, working);
      if (assigned.kind !== "lowered") {
        return assigned;
      }
      after.push(...assigned.operation);
      continue;
    }
    const nested = lowerArrayTargetElement(context, element, working);
    if (nested.kind !== "lowered") {
      return nested;
    }
    elements.push(nested.operation);
  }
  const protocol: JsIrOperation = { kind: "arrayDestructureProtocol", source: { kind: "value", value: source }, elements, notIterableMessage: "The destructured value is not iterable" };
  return produced([protocol, ...after]);
}

/** One array pattern element: its temporary takes the item, then the target is assigned from it. */
function lowerArrayTargetElement(
  context: LoweringContext,
  element: ts.Expression,
  working: Map<string, JsIrBindingValue>
): Produced<JsIrArrayDestructureElement> {
  const temporaryName = `destructure.target.${element.pos}`;
  working.set(temporaryName, { kind: "valueVariable", name: temporaryName });
  const [target, initializer] = splitDefault(element);
  const value = withDefault(context, { kind: "variable", name: temporaryName }, initializer, target, working);
  if (value.kind !== "lowered") {
    return value;
  }
  const operations = lowerAssignmentTarget(context, target, value.operation, working);
  if (operations.kind !== "lowered") {
    return operations;
  }
  return produced({ kind: "nested", temporaryName, operations: operations.operation });
}

function lowerObjectAssignment(
  context: LoweringContext,
  pattern: ts.ObjectLiteralExpression,
  source: JsIrValueExpression,
  working: Map<string, JsIrBindingValue>
): Produced<readonly JsIrOperation[]> {
  const sourceName = `destructure.source.${pattern.pos}`;
  const temporary: JsIrOperation = { kind: "constValue", name: sourceName, value: source };
  updateBindings(temporary, working);
  const operations: JsIrOperation[] = [temporary, { kind: "requireObjectCoercible", value: { kind: "variable", name: sourceName } }];
  for (const property of pattern.properties) {
    const assigned = lowerObjectPatternProperty(context, property, sourceName, working);
    if (assigned.kind !== "lowered") {
      return assigned;
    }
    operations.push(...assigned.operation);
  }
  return produced(operations);
}

function lowerObjectPatternProperty(
  context: LoweringContext,
  property: ts.ObjectLiteralElementLike,
  sourceName: string,
  working: Map<string, JsIrBindingValue>
): Produced<readonly JsIrOperation[]> {
  const read = (key: string): JsIrValueExpression => ({
    kind: "valueObjectDynamicAccess", value: { kind: "variable", name: sourceName }, key: { kind: "literal", value: key }
  });
  if (ts.isShorthandPropertyAssignment(property)) {
    const value = withDefault(context, read(property.name.text), property.objectAssignmentInitializer, property.name, working);
    return value.kind === "lowered" ? lowerAssignmentTarget(context, property.name, value.operation, working) : value;
  }
  if (ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) || ts.isNumericLiteral(property.name))) {
    const [target, initializer] = splitDefault(property.initializer);
    const value = withDefault(context, read(property.name.text), initializer, target, working);
    return value.kind === "lowered" ? lowerAssignmentTarget(context, target, value.operation, working) : value;
  }
  return unsupportedIn("Rest elements and computed keys in an object assignment pattern are not supported yet");
}

/** `target = default` inside a pattern, as its target and its default. */
function splitDefault(element: ts.Expression): readonly [ts.Expression, ts.Expression | undefined] {
  if (ts.isBinaryExpression(element) && element.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    return [element.left, element.right];
  }
  return [element, undefined];
}

/**
 * `value`, or `initializer` evaluated only when `value` is undefined. An anonymous function default
 * is named after the variable it is assigned to, as in JavaScript.
 */
function withDefault(
  context: LoweringContext,
  value: JsIrValueExpression,
  initializer: ts.Expression | undefined,
  target: ts.Expression,
  working: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrValueExpression> {
  if (initializer === undefined) {
    return produced(value);
  }
  const refusal: Produced<JsIrValueExpression> = unsupportedIn(`The default \`${expressionSnippet(initializer)}\` is not an expression this build can evaluate`);
  const name = ts.isIdentifier(target) ? target.text : undefined;
  const functionValue = lowerFunctionObjectValue(context, initializer, working, name);
  if (functionValue.kind === "unsupported") {
    return withRefusal(functionValue, refusal);
  }
  const defaultValue = functionValue.kind === "lowered" ? functionValue : context.lowerValueExpression(context, initializer, working);
  if (defaultValue.kind !== "lowered") {
    return withRefusal(defaultValue, refusal);
  }
  return produced({ kind: "lazyDefault", value, defaultValue: defaultValue.operation });
}
