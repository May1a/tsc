import { type LoweredStatementList, loweredOperationList } from "./lowered.js";
import type { JsIrOperation } from "./types.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import { unsupportedStatementMessage } from "./diagnostics.js";
import { isNonExecutableDeclaration } from "./comparisons.js";
import { updateBindings } from "./binding-updates.js";

/**
 * The operations of a lowered body, or `undefined` when it could not be lowered. A recognizer
 * that still returns `JsIrOperation | undefined` has nowhere to put the reason, so the statement
 * tier reports its own; converting that recognizer to return `Lowered` forwards the real one.
 */

export function lowerStatementBody(
  context: LoweringContext,
  statement: ts.Statement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): LoweredStatementList {
  if (ts.isBlock(statement)) {
    return lowerBlockStatements(context, statement, bindings);
  }
  return lowerStatementList(context, [statement], bindings);
}

export function lowerBlockStatements(
  context: LoweringContext,
  block: ts.Block,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): LoweredStatementList {
  return lowerStatementList(context, block.statements, bindings);
}

export function lowerStatementList(
  context: LoweringContext,
  statements: readonly ts.Statement[],
  bindings: ReadonlyMap<string, JsIrBindingValue>
): LoweredStatementList {
  const operations: JsIrOperation[] = [];
  const blockBindings = new Map(bindings);

  for (const statement of statements) {
    if (isNonExecutableDeclaration(statement)) {
      continue;
    }

    const result = context.lowerStatement(context, statement, blockBindings);
    if (result.kind === "unsupported") {
      return result;
    }
    if (result.kind === "notApplicable") {
      return { kind: "unsupported", reason: unsupportedStatementMessage(statement, blockBindings) };
    }

    operations.push(result.operation);
    updateBindings(result.operation, blockBindings);
  }

  return loweredOperationList(operations);
}
