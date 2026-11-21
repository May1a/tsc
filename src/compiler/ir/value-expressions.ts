import { type Lowered, loweredPayload, notApplicable, produced, unsupportedIn, withRefusal } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import { lowerValueCallArguments } from "./call-arguments.js";
import type { JsIrBindingValue } from "./bindings.js";
import type { JsIrStringExpression, JsIrValueExpression } from "./expressions.js";
import { errorConstructorNames, isUnsupportedSymbolExpression, lowerCanonicalArrayIndexString, unwrapTypeOnlyExpression } from "./predicates.js";
import { callTargetMessage, isKnownGlobalCallee, isPlannedBuiltinCall, isRecognizedGlobalCallee, plannedBuiltinMessageFor } from "./builtins/index.js";
import { expressionSnippet, unsupportedNewExpressionMessage, unsupportedSymbolMessage, unsupportedUnboundValueMessage } from "./diagnostics.js";
import { CLASS_THIS_NAME } from "./class-names.js";
import { lowerInlineCppValueExpression } from "./inline-cpp.js";
import { lowerClassValueExpression } from "./class-values.js";
import { lowerDirectValueExpression } from "./direct-values.js";
import { lowerValueCallExpression } from "./value-calls.js";
import { lowerRuntimeObjectLiteralExpression } from "./object-literals.js";
import { isFunctionPrototypeAccess } from "./optional-chains.js";
import { isBoxedAggregateCandidateBinding, objectHasNestedFields } from "./builtins/object-producers.js";
import { lowerPropertyKeyExpression } from "./string-expressions.js";

export function lowerValueExpression(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  const unwrappedExpression = unwrapTypeOnlyExpression(expression);
  if (unwrappedExpression !== expression) {
    return context.lowerValueExpression(context, unwrappedExpression, bindings);
  }

  if (expression.kind === ts.SyntaxKind.ThisKeyword && bindings.get(CLASS_THIS_NAME)?.kind === "valueVariable") {
    return produced({ kind: "variable", name: CLASS_THIS_NAME });
  }

  const inlineCppValue = lowerInlineCppValueExpression(context.inlineCpp, expression);
  if (inlineCppValue.kind !== "notApplicable") {
    return inlineCppValue;
  }

  const classValue = lowerClassValueExpression(context, expression, bindings);
  if (classValue.kind !== "notApplicable") {
    return classValue;
  }

  const directValue = lowerDirectValueExpression(context, expression, bindings);
  if (directValue.kind !== "notApplicable") {
    return directValue;
  }

  const aggregateValue = lowerAggregateValueExpression(context, expression, bindings);
  if (aggregateValue.kind !== "notApplicable") {
    return aggregateValue;
  }

  const scalarValue = lowerScalarValueExpression(context, expression, bindings);
  if (scalarValue.kind !== "notApplicable") {
    return scalarValue;
  }

  return lowerValueCallAndSymbol(context, expression, bindings);
}

/**
 * What the value chain reports for a call, tag, or `Symbol` no tier lowered: a planned builtin or a
 * general `Symbol` is refused by name, and any other call lowers through the value-call tier.
 *
 * Both refusals run after every tier that could lower the expression — including degraded "stubbed"
 * lowerings such as `Date.now()` to `0` — so only an expression no tier claimed is refused. In an
 * expression position there is no statement diagnostic to name the missing builtin, so declining
 * would report the enclosing initializer or argument instead.
 */
function lowerValueCallAndSymbol(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  // General `Symbol` values have no representation: only the well-known `Symbol.iterator` key is
  // available, and it is read by its own recognizer rather than as a value.
  if (isUnsupportedSymbolExpression(expression, bindings)) {
    return unsupportedIn(unsupportedSymbolMessage);
  }
  if (ts.isCallExpression(expression) && !(ts.isIdentifier(expression.expression) && expression.expression.text === "print")) {
    const plannedCall = plannedCallRefusal(expression.expression, bindings);
    if (plannedCall !== undefined) {
      return plannedCall;
    }
    return lowerValueCallExpression(context, expression, bindings);
  }
  if (ts.isTaggedTemplateExpression(expression)) {
    const plannedTag = plannedCallRefusal(expression.tag, bindings);
    if (plannedTag !== undefined) {
      return plannedTag;
    }
  }
  const plannedMember = plannedMemberCallRefusal(expression, bindings);
  if (plannedMember !== undefined) {
    return plannedMember;
  }
  if (ts.isNewExpression(expression)) {
    return lowerBuiltinErrorConstruction(context, expression, bindings);
  }
  if (isErrorConstructorReference(expression, bindings)) {
    return produced({ kind: "errorConstructor", errorName: expression.text });
  }
  return unboundValueRefusal(context, expression, bindings);
}

/**
 * `new TypeError(message)` as a value. A builtin error constructor creates the same error whether or
 * not it is called with `new`, so the construction is a call of its constructor value.
 */
function lowerBuiltinErrorConstruction(
  context: LoweringContext,
  expression: ts.NewExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  const refusal: Lowered<JsIrValueExpression> = unsupportedIn(newExpressionRefusal(expression));
  if (isErrorConstructorReference(expression.expression, bindings)) {
    const args = lowerValueCallArguments(context, expression.arguments ?? ts.factory.createNodeArray(), bindings, expression.expression.text);
    if (args.kind !== "lowered") {
      return withRefusal(args, refusal);
    }
    return produced({ kind: "callValue", callee: { kind: "errorConstructor", errorName: expression.expression.text }, arguments: args.operation });
  }
  const target = unwrapTypeOnlyExpression(expression.expression);
  if (ts.isIdentifier(target)) {
    const binding = bindings.get(target.text);
    if (binding?.kind !== "valueVariable" && binding?.kind !== "value") {
      return refusal;
    }
  }
  const callee = context.lowerValueExpression(context, target, bindings);
  if (callee.kind !== "lowered") {
    return withRefusal(callee, refusal);
  }
  const args = lowerValueCallArguments(context, expression.arguments ?? ts.factory.createNodeArray(), bindings, expression.expression.getText());
  if (args.kind !== "lowered") {
    return withRefusal(args, refusal);
  }
  return produced({ kind: "callValue", callee: callee.operation, arguments: args.operation });
}

/** A builtin error constructor named as a value, which no binding of the same name shadows. */
function isErrorConstructorReference(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): expression is ts.Identifier {
  return ts.isIdentifier(expression) && !bindings.has(expression.text) && errorConstructorNames.has(expression.text);
}

/**
 * Why a `new` expression did not lower to a value.
 *
 * Every tier that constructs something has declined by this point: module classes, builtin
 * constructors such as `RegExp` and `Map`, and functions that construct by returning an object. The
 * constructor itself is therefore what this build cannot construct.
 */
function newExpressionRefusal(expression: ts.NewExpression): string {
  if (ts.isIdentifier(expression.expression)) {
    return unsupportedNewExpressionMessage(expression.expression.text);
  }
  return `A \`new\` expression with a non-identifier target is not supported yet: \`${expressionSnippet(expression)}\``;
}

/**
 * Why a member call did not lower to a value.
 *
 * The direct tier tries the members this build implements; a call it declined that the support
 * tables list as planned names the missing builtin rather than the argument or initializer around it.
 */
function plannedMemberCallRefusal(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> | undefined {
  if (!ts.isCallExpression(expression) || !ts.isPropertyAccessExpression(expression.expression)) {
    return undefined;
  }
  const planned = plannedBuiltinMessageFor(expression.expression.expression, expression.expression.name.text, bindings);
  if (planned === undefined) {
    return undefined;
  }
  return unsupportedIn(planned);
}

/**
 * Why a bare name did not lower to a value.
 *
 * Bindings lower through their own recognizers, and alias functions through the named-call path, so
 * an unbound identifier that reaches the tail of the value chain has no value to read. Reads the
 * number tier answers itself (`NaN`, `Infinity`) and globals the compiler lowers itself keep their
 * own diagnostics rather than this one.
 */
function unboundValueRefusal(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  if (expression.kind === ts.SyntaxKind.ThisKeyword) {
    return unsupportedIn(unsupportedUnboundValueMessage("this"));
  }
  if (!ts.isIdentifier(expression) || bindings.has(expression.text)) {
    return notApplicable;
  }
  if (expression.text === "undefined" || expression.text === "NaN" || expression.text === "Infinity" || expression.text === "print") {
    return notApplicable;
  }
  if (isRecognizedGlobalCallee(expression) || isKnownGlobalCallee(expression)) {
    return notApplicable;
  }
  const symbol = context.typeChecker?.getSymbolAtLocation(expression);
  if (symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0) {
    return notApplicable;
  }
  // With a checker that finds no declaration at all, the read is unresolvable and throws.
  if (context.typeChecker !== undefined && symbol === undefined) {
    return produced({ kind: "unresolvableReference", message: `${expression.text} is not defined` });
  }
  return unsupportedIn(unsupportedUnboundValueMessage(expression.text));
}

/** The refusal for a call or tag the support tables list as planned, or `undefined` when it is not one. */
function plannedCallRefusal(
  callee: ts.LeftHandSideExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> | undefined {
  if (!isPlannedBuiltinCall(callee, bindings)) {
    return undefined;
  }
  const planned = callTargetMessage(callee, bindings);
  if (planned === undefined) {
    return undefined;
  }
  return unsupportedIn(planned);
}

function lowerAggregateValueExpression(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  if (ts.isObjectLiteralExpression(expression)) {
    const value = lowerRuntimeObjectLiteralExpression(context, expression, bindings);
    if (value.kind === "unsupported") {
      return value;
    }
    if (value.kind === "lowered") {
      return produced({ kind: "objectLiteralValue", value: value.operation });
    }
  }

  if (ts.isArrayLiteralExpression(expression)) {
    const arrayLiteralValue = lowerValueTypedArrayLiteralExpression(context, expression, bindings);
    if (arrayLiteralValue.kind !== "notApplicable") {
      return arrayLiteralValue;
    }
  }

  if (ts.isElementAccessExpression(expression)) {
    if (ts.isIdentifier(expression.expression)) {
      const arrayAccess = lowerRuntimeArrayValueAccess(context, expression, bindings);
      if (arrayAccess.kind !== "notApplicable") {
        return arrayAccess;
      }
      const objectAccess = lowerRuntimeObjectElementValueAccess(context, expression, bindings);
      if (objectAccess.kind !== "notApplicable") {
        return objectAccess;
      }
    }
    const valueAccess = lowerValueElementAccess(context, expression, bindings);
    if (valueAccess.kind !== "notApplicable") {
      return valueAccess;
    }
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return lowerAggregatePropertyValueAccess(context, expression, bindings);
  }

  if (ts.isIdentifier(expression)) {
    const binding = bindings.get(expression.text);
    if (binding?.kind === "runtimeObject") {
      return produced({ kind: "objectRef", name: binding.name });
    }
    if (binding?.kind === "runtimeArray") {
      return produced({ kind: "arrayRef", name: binding.name });
    }
  }

  return notApplicable;
}

function lowerValueTypedArrayLiteralExpression(
  context: LoweringContext,
  expression: ts.ArrayLiteralExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  const valueElements: JsIrValueExpression[] = [];
  for (const element of expression.elements) {
    if (ts.isSpreadElement(element) || ts.isOmittedExpression(element)) {
      return notApplicable;
    }
    const value = context.lowerValueExpression(context, element, bindings);
    if (value.kind !== "lowered") {
      return value;
    }
    valueElements.push(value.operation);
  }
  return produced({ kind: "runtimeArrayValue", elements: valueElements });
}

function isDynamicPropertyReceiver(
  context: LoweringContext,
  receiverName: string,
  binding: JsIrBindingValue | undefined,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): boolean {
  if (isBoxedAggregateCandidateBinding(binding)) {
    return true;
  }
  if (binding?.kind === "function" || binding?.kind === "functionReference" || binding?.kind === "closure") {
    return true;
  }
  return !bindings.has(receiverName) && context.classes.has(receiverName);
}

function lowerAggregatePropertyValueAccess(
  context: LoweringContext,
  expression: ts.PropertyAccessExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  if (expression.expression.kind === ts.SyntaxKind.ThisKeyword) {
    const value = context.lowerValueExpression(context, expression.expression, bindings);
    return value.kind === "lowered"
      ? produced({ kind: "valueObjectDynamicAccess", value: value.operation, key: { kind: "literal", value: expression.name.text } })
      : value;
  }
  const receiver = unwrapTypeOnlyExpression(expression.expression);
  if (!ts.isIdentifier(receiver)) {
    return lowerChainedPropertyValueAccess(context, receiver, expression.name, bindings);
  }
  const binding = bindings.get(receiver.text);
  if (isFunctionPrototypeAccess(expression, bindings)) {
    return notApplicable;
  }
  if (binding?.kind === "runtimeObject") {
    if (binding.errorName !== undefined && expression.name.text === "stack") {
      return notApplicable;
    }
    return produced({ kind: "objectDynamicAccess", objectName: binding.name, key: { kind: "literal", value: expression.name.text } });
  }
  if (binding?.kind === "runtimeArray" && plannedBuiltinMessageFor(receiver, expression.name.text, bindings) === undefined) {
    return produced({ kind: "valueObjectDynamicAccess", value: { kind: "arrayRef", name: binding.name }, key: { kind: "literal", value: expression.name.text } });
  }
  if (isDynamicPropertyReceiver(context, receiver.text, binding, bindings)) {
    const value = context.lowerValueExpression(context, receiver, bindings);
    return value.kind === "lowered"
      ? produced({ kind: "valueObjectDynamicAccess", value: value.operation, key: { kind: "literal", value: expression.name.text } })
      : value;
  }
  return notApplicable;
}

const staticBuiltinRootNames: ReadonlySet<string> = new Set([
  "Array",
  "Date",
  "JSON",
  "Map",
  "Math",
  "Number",
  "Object",
  "RegExp",
  "Set",
  "String",
  "Symbol",
  "console"
]);

function isStaticBuiltinRoot(expression: ts.Expression, bindings: ReadonlyMap<string, JsIrBindingValue>): boolean {
  let current = unwrapTypeOnlyExpression(expression);
  while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    current = unwrapTypeOnlyExpression(current.expression);
  }
  return ts.isIdentifier(current) && !bindings.has(current.text) && staticBuiltinRootNames.has(current.text);
}

function lowerChainedPropertyValueAccess(
  context: LoweringContext,
  receiver: ts.Expression,
  propertyName: ts.MemberName,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  if (ts.isPrivateIdentifier(propertyName) || isStaticBuiltinRoot(receiver, bindings)) {
    return notApplicable;
  }
  if (plannedBuiltinMessageFor(receiver, propertyName.text, bindings) !== undefined) {
    return notApplicable;
  }
  const value = context.lowerValueExpression(context, receiver, bindings);
  if (value.kind !== "lowered") {
    return value;
  }
  return produced({ kind: "valueObjectDynamicAccess", value: value.operation, key: { kind: "literal", value: propertyName.text } });
}

function lowerValueElementAccess(
  context: LoweringContext,
  expression: ts.ElementAccessExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  const value = lowerValueElementReceiver(context, expression.expression, bindings);
  if (value.kind !== "lowered") {
    return value;
  }
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
    const keyValue = index.kind === "literal" ? String(index.value) : "0";
    return produced({ kind: "valueArrayAccess", value: value.operation, index, key: { kind: "literal", value: keyValue } });
  }
  const key = lowerPropertyKeyExpression(context, expression.argumentExpression, bindings);
  if (key.kind === "unsupported") {
    return key;
  }
  if (key.kind === "lowered") {
    return produced({ kind: "valueObjectDynamicAccess", value: value.operation, key: key.operation });
  }
  return notApplicable;
}

function lowerValueElementReceiver(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  const unwrapped = unwrapTypeOnlyExpression(expression);
  if (ts.isIdentifier(unwrapped)) {
    const binding = bindings.get(unwrapped.text);
    const isClass = !bindings.has(unwrapped.text) && context.classes.has(unwrapped.text);
    if (!isBoxedAggregateCandidateBinding(binding) && binding?.kind !== "runtimeObject" && binding?.kind !== "runtimeArray" && !isClass) {
      return notApplicable;
    }
    return context.lowerValueExpression(context, unwrapped, bindings);
  }
  if (isStaticBuiltinRoot(unwrapped, bindings)) {
    return notApplicable;
  }
  return context.lowerValueExpression(context, unwrapped, bindings);
}

function lowerRuntimeArrayValueAccess(
  context: LoweringContext,
  expression: ts.ElementAccessExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  if (!ts.isIdentifier(expression.expression) || bindings.get(expression.expression.text)?.kind !== "runtimeArray") {
    return notApplicable;
  }
  const indexResult2 = context.lowerNumberExpression(context, expression.argumentExpression, bindings);
  if (indexResult2.kind === "unsupported") {
    return indexResult2;
  }
  let index = loweredPayload(indexResult2);
  let key: JsIrStringExpression | undefined;
  const stringIndex = lowerCanonicalArrayIndexString(expression.argumentExpression);
  if (stringIndex !== undefined) {
    index = { kind: "literal", value: stringIndex };
    key = { kind: "literal", value: String(stringIndex) };
  }
  if (index !== undefined) {
    if (ts.isNumericLiteral(expression.argumentExpression)) {
      key = { kind: "literal", value: expression.argumentExpression.text };
    }
    return produced({ kind: "arrayAccess", arrayName: expression.expression.text, index, key });
  }
  if (ts.isStringLiteral(expression.argumentExpression) && expression.argumentExpression.text === "length") {
    return produced({ kind: "number", value: { kind: "arrayLength", arrayName: expression.expression.text } });
  }
  const propertyKeyExpressionResult = lowerPropertyKeyExpression(context, expression.argumentExpression, bindings);
  if (propertyKeyExpressionResult.kind === "unsupported") {
    return propertyKeyExpressionResult;
  }
  key = loweredPayload(propertyKeyExpressionResult);
  if (key !== undefined) {
    return produced({ kind: "arrayAccess", arrayName: expression.expression.text, index: { kind: "literal", value: -1 }, key });
  }
  return notApplicable;
}

function lowerRuntimeObjectElementValueAccess(
  context: LoweringContext,
  expression: ts.ElementAccessExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  if (!ts.isIdentifier(expression.expression)) {
    return notApplicable;
  }
  const binding = bindings.get(expression.expression.text);
  if (binding?.kind !== "object" && binding?.kind !== "runtimeObject") {
    return notApplicable;
  }
  if (binding.kind === "object" && objectHasNestedFields(binding.value)) {
    return notApplicable;
  }
  const key = lowerPropertyKeyExpression(context, expression.argumentExpression, bindings);
  if (key.kind !== "lowered") {
    return key;
  }
  return produced({ kind: "objectDynamicAccess", objectName: expression.expression.text, key: key.operation });
}

function lowerScalarValueExpression(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  const stringValue = context.lowerStringRuntimeExpression(context, expression, bindings);
  if (stringValue.kind === "unsupported") {
    return stringValue;
  }
  if (stringValue.kind === "lowered") {
    return produced({ kind: "string", value: stringValue.operation });
  }

  const numberValue = context.lowerNumberExpression(context, expression, bindings);
  if (numberValue.kind === "unsupported") {
    return numberValue;
  }
  if (numberValue.kind === "lowered") {
    return produced({ kind: "number", value: numberValue.operation });
  }

  const booleanValue = context.lowerConditionExpression(context, expression, bindings);
  if (booleanValue.kind === "unsupported") {
    return booleanValue;
  }
  if (booleanValue.kind === "lowered") {
    return produced({ kind: "boolean", value: booleanValue.operation });
  }

  return notApplicable;
}
