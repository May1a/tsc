import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import { type Lowered, type Produced, loweredOperation, loweredPayload, produced, unsupported, unsupportedIn, withRefusal } from "./lowered.js";
import { lowerStatementBody, lowerStatementList } from "./statement-lists.js";
import { withinSwitch } from "./jump-targets.js";
import { expressionSnippet, unsupportedStatementMessage } from "./diagnostics.js";
import type { JsIrSwitchClause, JsIrValueExpression } from "./expressions.js";
import { updateBindings } from "./binding-updates.js";

export function lowerIfStatement(
  context: LoweringContext,
  statement: ts.IfStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const condition = context.lowerConditionExpression(context, statement.expression, bindings);
  if (condition.kind !== "lowered") {
    return withRefusal(condition, unsupportedIn(`An \`if\` condition must be an expression this build can evaluate: \`${expressionSnippet(statement.expression)}\``));
  }

  const thenOperationsResult = lowerStatementBody(context, statement.thenStatement, bindings);
  if (thenOperationsResult.kind === "unsupported") {
    return thenOperationsResult;
  }
  const thenOperations = thenOperationsResult.operation;

  if (!statement.elseStatement) {
    return produced({ kind: "if", condition: condition.operation, thenOperations, elseOperations: [] });
  }

  const elseOperationsResult = lowerStatementBody(context, statement.elseStatement, bindings);
  if (elseOperationsResult.kind === "unsupported") {
    return elseOperationsResult;
  }
  const elseOperations = elseOperationsResult.operation;

  return produced({
    kind: "if",
    condition: condition.operation,
    thenOperations,
    elseOperations
  });
}

export function lowerSwitchStatement(
  context: LoweringContext,
  statement: ts.SwitchStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const reason = unsupportedStatementMessage(statement, bindings);
  const expression = context.lowerValueExpression(context, statement.expression, bindings);
  if (expression.kind !== "lowered") {
    return withRefusal(expression, unsupported(reason));
  }
  const clauses = withinSwitch(context, () => lowerSwitchClauses(context, statement.caseBlock, bindings, reason));
  if (clauses.kind !== "lowered") {
    return clauses;
  }
  return loweredOperation({ kind: "switch", expression: expression.operation, clauses: clauses.operation });
}

function lowerSwitchClauses(
  context: LoweringContext,
  caseBlock: ts.CaseBlock,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  reason: string
): Produced<readonly JsIrSwitchClause[]> {
  const clauses: JsIrSwitchClause[] = [];
  const switchBindings = new Map(bindings);
  for (const clause of caseBlock.clauses) {
    let test: JsIrValueExpression | undefined;
    if (ts.isCaseClause(clause)) {
      const valueExpressionResult = context.lowerValueExpression(context, clause.expression, switchBindings);
      if (valueExpressionResult.kind === "unsupported") {
        return valueExpressionResult;
      }
      test = loweredPayload(valueExpressionResult);
      if (test === undefined) {
        return unsupportedIn(reason);
      }
    }
    const clauseOperations = lowerStatementList(context, clause.statements, switchBindings);
    if (clauseOperations.kind === "unsupported") {
      return clauseOperations;
    }
    for (const operation of clauseOperations.operation) {
      updateBindings(operation, switchBindings);
    }
    clauses.push({ test, operations: clauseOperations.operation });
  }
  return produced(clauses);
}
