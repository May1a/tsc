import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import { type Lowered, loweredPayload, notApplicable, produced, unsupported, unsupportedIn, withRefusal } from "./lowered.js";
import { lowerAssignmentStatement } from "./assignments.js";
import { lowerRuntimeObjectCallStatement } from "./object-mutations.js";
import { lowerRuntimeArrayCallStatement } from "./array-mutations.js";
import { lowerInlineCppValueExpression } from "./inline-cpp.js";
import { lowerCallStatement } from "./call-statements.js";
import { lowerPrintExpression } from "./print.js";
import { lowerUpdateNumberExpression } from "./number-expressions.js";
import type { JsIrNumberExpression, JsIrNumberOperator } from "./expressions.js";
import type { JsIrOperation } from "./types.js";
import { isBoxedStoreReceiverBinding } from "./number-access.js";
import { lowerCanonicalArrayIndexString } from "./predicates.js";
import { constWriteRefusal } from "./throwing-forms.js";
import { lowerPropertyKeyExpression } from "./string-expressions.js";

// eslint-disable-next-line max-statements -- Statement expression routing is centralized for the current lowering slice.
export function lowerExpressionStatement(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  // A statement's parentheses change nothing it does, so `({ a } = source);` is the assignment.
  if (ts.isParenthesizedExpression(expression)) {
    return lowerExpressionStatement(context, expression.expression, bindings);
  }
  const constWrite = constWriteRefusal(context.typeChecker, expression);
  if (constWrite !== undefined) {
    return unsupportedIn(constWrite);
  }
  const update = lowerUpdateExpressionStatement(expression, bindings);
  if (update.kind !== "notApplicable") {
    return update;
  }

  const assignment = lowerAssignmentStatement(context, expression, bindings);
  if (assignment.kind !== "notApplicable") {
    return assignment;
  }

  const deletion = lowerDeleteExpression(context, expression, bindings);
  if (deletion.kind !== "notApplicable") {
    return deletion;
  }

  if (ts.isCallExpression(expression)) {
    const runtimeCollectionCall = lowerRuntimeCollectionCallStatement(context, expression, bindings);
    if (runtimeCollectionCall.kind !== "notApplicable") {
      return runtimeCollectionCall;
    }
    const runtimeObjectCall = lowerRuntimeObjectCallStatement(context, expression, bindings);
    if (runtimeObjectCall.kind !== "notApplicable") {
      return runtimeObjectCall;
    }
    const runtimeArrayCall = lowerRuntimeArrayCallStatement(context, expression, bindings);
    if (runtimeArrayCall.kind !== "notApplicable") {
      return runtimeArrayCall;
    }
  }

  const inlineCppValueResult = lowerInlineCppValueExpression(context.inlineCpp, expression);
  if (inlineCppValueResult.kind === "unsupported") {
    return inlineCppValueResult;
  }
  const inlineCppValue = loweredPayload(inlineCppValueResult);
  if (inlineCppValue?.kind === "inlineCppValue") {
    return produced({ kind: "inlineCpp", symbol: inlineCppValue.symbol });
  }

  // A discarded `new` runs its constructor for side effects; see `lowerDiscardedNewExpression`.
  if (ts.isNewExpression(expression)) {
    return lowerDiscardedNewExpression(context, expression, bindings);
  }

  // String directives and tagged templates keep the diagnostic's own reason, which names the string
  // slice or the tag rather than the statement around them.
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression) || ts.isTaggedTemplateExpression(expression)) {
    return notApplicable;
  }

  if (!ts.isCallExpression(expression)) {
    return lowerDiscardedValue(context, expression, bindings);
  }

  const callOp = lowerCallStatement(context, expression, bindings);
  if (callOp.kind !== "notApplicable") {
    return callOp;
  }

  return lowerPrintCallStatement(context, expression, bindings);
}

/**
 * A discarded `new` runs its constructor for side effects, which the value tier already knows how
 * to lower; the statement tier only refuses to drop the instance, and reports an inner failure (an
 * unknown class, an unlowerable argument) in that failure's own words.
 */
function lowerDiscardedNewExpression(
  context: LoweringContext,
  expression: ts.NewExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const reason = "A `new` expression as a statement is not supported yet";
  const newValue = context.lowerValueExpression(context, expression, bindings);
  if (newValue.kind === "lowered") {
    return unsupported(reason);
  }
  return withRefusal(newValue, unsupportedIn(reason));
}

/**
 * A `print` call the general call tier declined: `print` is recognized by its own tier below, while
 * any other declined call still belongs to the diagnostic, where a planned builtin or an
 * unrecognized target is named.
 */
function lowerPrintCallStatement(
  context: LoweringContext,
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!ts.isIdentifier(expression.expression) || expression.expression.text !== "print") {
    return notApplicable;
  }
  if (expression.arguments.length !== 1) {
    return unsupported("`print` accepts exactly one argument");
  }
  const reason = "The argument to `print` must be an expression this build can evaluate";
  const [argument] = expression.arguments;
  const printExpression = lowerPrintExpression(context, argument, bindings);
  if (printExpression.kind === "lowered") {
    return produced({ kind: "print", expression: printExpression.operation });
  }
  if (printExpression.kind === "unsupported") {
    return printExpression;
  }
  // Only a bare identifier this build cannot evaluate is the print tier's own refusal: calls,
  // literals, templates, and member reads keep the diagnostic's reason, which names the argument.
  if (ts.isIdentifier(argument)) {
    return unsupported(reason);
  }
  return notApplicable;
}

export function lowerUpdateExpressionStatement(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const boxedUpdate = lowerBoxedUpdateStatement(expression, bindings);
  if (boxedUpdate !== undefined) {
    return produced(boxedUpdate);
  }
  const update = lowerUpdateNumberExpression(expression, bindings);
  if (update === undefined) {
    return notApplicable;
  }
  const step: JsIrNumberExpression = { kind: "literal", value: 1 };
  const operator: JsIrNumberOperator = update.operator === "decrement" ? "subtract" : "add";
  return produced({ kind: "assignNumber", name: update.name, value: { kind: "binary", operator, left: { kind: "variable", name: update.name }, right: step } });
}

const updateOperators: ReadonlyMap<ts.SyntaxKind, JsIrNumberOperator> = new Map([
  [ts.SyntaxKind.PlusPlusToken, "add"],
  [ts.SyntaxKind.MinusMinusToken, "subtract"]
]);

/**
 * `x++` or `--x` as a statement on a boxed binding: the value converts to a number, as `++` does in
 * JavaScript, and the result is stored back boxed.
 */
function lowerBoxedUpdateStatement(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Extract<JsIrOperation, { readonly kind: "assignValue" }> | undefined {
  if (!(ts.isPrefixUnaryExpression(expression) || ts.isPostfixUnaryExpression(expression)) || !ts.isIdentifier(expression.operand)) {
    return undefined;
  }
  const operator = updateOperators.get(expression.operator);
  const name = expression.operand.text;
  if (operator === undefined || bindings.get(name)?.kind !== "valueVariable") {
    return undefined;
  }
  return {
    kind: "assignValue",
    name,
    value: { kind: "number", value: { kind: "binary", operator, left: { kind: "valueToNumber", value: { kind: "variable", name } },
      right: { kind: "literal", value: 1 } } }
  };
}

function lowerRuntimeCollectionCallStatement(
  context: LoweringContext,
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression)) {
    return notApplicable;
  }
  const receiver = expression.expression.expression.text;
  const binding = bindings.get(receiver);
  const method = expression.expression.name.text;
  if (binding?.kind === "runtimeMap" && method === "set" && expression.arguments.length === 2) {
    const keyResult = context.lowerValueExpression(context, expression.arguments[0], bindings);
    if (keyResult.kind === "unsupported") {
      return keyResult;
    }
    const key = loweredPayload(keyResult);
    const valueResult = context.lowerValueExpression(context, expression.arguments[1], bindings);
    if (valueResult.kind === "unsupported") {
      return valueResult;
    }
    const value = loweredPayload(valueResult);
    if (key !== undefined && value !== undefined) {
      return produced({ kind: "runtimeMapSet", mapName: binding.name, key, value });
    }
  }
  if (binding?.kind === "runtimeSet" && method === "add" && expression.arguments.length === 1) {
    const value = context.lowerValueExpression(context, expression.arguments[0], bindings);
    if (value.kind === "unsupported") {
      return value;
    }
    if (value.kind === "lowered") {
      return produced({ kind: "runtimeSetAdd", setName: binding.name, value: value.operation });
    }
  }
  return notApplicable;
}

// eslint-disable-next-line complexity, max-statements -- Delete lowering handles fixed, runtime, and boxed aggregate targets in one place.
function lowerDeleteExpression(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!ts.isDeleteExpression(expression)) {
    return notApplicable;
  }

  const target = expression.expression;
  if (ts.isPropertyAccessExpression(target) && ts.isIdentifier(target.expression)) {
    const binding = bindings.get(target.expression.text);
    if (binding?.kind === "runtimeObject") {
      return produced({ kind: "runtimeObjectDelete", objectName: target.expression.text, key: { kind: "literal", value: target.name.text } });
    }
    if (isBoxedStoreReceiverBinding(binding)) {
      return produced({ kind: "valueObjectDelete", targetName: target.expression.text, key: { kind: "literal", value: target.name.text } });
    }
  }

  if (ts.isElementAccessExpression(target) && ts.isIdentifier(target.expression)) {
    const binding = bindings.get(target.expression.text);
    if (binding?.kind === "runtimeArray") {
      const index = context.lowerNumberExpression(context, target.argumentExpression, bindings);
      if (index.kind === "unsupported") {
        return index;
      }
      if (index.kind === "lowered") {
        return produced({ kind: "runtimeArrayDelete", arrayName: target.expression.text, index: index.operation });
      }
      const stringIndex = lowerCanonicalArrayIndexString(target.argumentExpression);
      if (stringIndex !== undefined) {
        return produced({ kind: "runtimeArrayDelete", arrayName: target.expression.text, index: { kind: "literal", value: stringIndex } });
      }
      const key = lowerPropertyKeyExpression(context, target.argumentExpression, bindings);
      if (key.kind === "unsupported") {
        return key;
      }
      if (key.kind === "lowered") {
        return produced({ kind: "runtimeArrayNamedDelete", arrayName: target.expression.text, key: key.operation });
      }
    }
    if (isBoxedStoreReceiverBinding(binding)) {
      const indexResult = context.lowerNumberExpression(context, target.argumentExpression, bindings);
      if (indexResult.kind === "unsupported") {
        return indexResult;
      }
      const index = loweredPayload(indexResult);
      const stringIndex = lowerCanonicalArrayIndexString(target.argumentExpression);
      if (index !== undefined) {
        return produced({ kind: "valueArrayDelete", targetName: target.expression.text, index });
      }
      if (stringIndex !== undefined) {
        return produced({ kind: "valueArrayDelete", targetName: target.expression.text, index: { kind: "literal", value: stringIndex } });
      }
      const key = lowerPropertyKeyExpression(context, target.argumentExpression, bindings);
      if (key.kind === "unsupported") {
        return key;
      }
      if (key.kind === "lowered") {
        return produced({ kind: "valueObjectDelete", targetName: target.expression.text, key: key.operation });
      }
    }
    const keyResult2 = context.lowerStringRuntimeExpression(context, target.argumentExpression, bindings);
    if (keyResult2.kind === "unsupported") {
      return keyResult2;
    }
    const key = loweredPayload(keyResult2);
    if (binding?.kind === "runtimeObject" && key !== undefined) {
      return produced({ kind: "runtimeObjectDelete", objectName: target.expression.text, key });
    }
  }

  return notApplicable;
}

/** Any other expression statement evaluates its expression for its effects, such as a throwing read. */
function lowerDiscardedValue(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const value = context.lowerValueExpression(context, expression, bindings);
  if (value.kind !== "lowered") {
    return withRefusal(value, unsupportedIn("Only calls, assignments, update expressions, and `delete` expressions are supported as statements"));
  }
  return produced({ kind: "discardValue", value: value.operation });
}
