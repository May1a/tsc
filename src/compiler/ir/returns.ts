import { type Lowered, notApplicable, produced, unsupportedIn, withRefusal } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import { expressionSnippet } from "./diagnostics.js";
import { lowerFunctionObjectValue } from "./closures.js";

export function lowerReturnStatement(
  context: LoweringContext,
  statement: ts.ReturnStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!statement.expression) {
    // Bare `return;` yields undefined, matching the class method normalization
    // in lowerClassMethodBody.
    return produced({
      kind: "returnValue",
      expression: { kind: "undefined" }
    });
  }

  const closure = lowerReturnedFunctionExpression(context, statement.expression, bindings);
  if (closure.kind !== "notApplicable") {
    return closure;
  }

  const stringExpression = context.lowerStringRuntimeExpression(context, statement.expression, bindings);
  if (stringExpression.kind === "unsupported") {
    return stringExpression;
  }
  if (stringExpression.kind === "lowered") {
    return produced({
      kind: "returnString",
      expression: stringExpression.operation
    });
  }

  const expression = context.lowerNumberExpression(context, statement.expression, bindings);
  if (expression.kind === "unsupported") {
    return expression;
  }
  if (expression.kind === "lowered") {
    return produced({
      kind: "returnNumber",
      expression: expression.operation
    });
  }

  const valueExpression = context.lowerValueExpression(context, statement.expression, bindings);
  if (valueExpression.kind !== "lowered") {
    return withRefusal(valueExpression, unsupportedIn(`The return value is not an expression this build can evaluate: \`${expressionSnippet(statement.expression)}\``));
  }

  return produced({
    kind: "returnValue",
    expression: valueExpression.operation
  });
}

function lowerReturnedFunctionExpression(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!ts.isFunctionExpression(expression) && !ts.isArrowFunction(expression)) {
    return notApplicable;
  }
  const fnValue = lowerFunctionObjectValue(context, expression, bindings);
  if (fnValue.kind !== "lowered") {
    return fnValue;
  }
  return produced({ kind: "returnValue", expression: fnValue.operation });
}
