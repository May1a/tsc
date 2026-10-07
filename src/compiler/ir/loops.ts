import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import { type Lowered, loweredPayload, notApplicable, produced } from "./lowered.js";
import { lowerAssignmentStatement } from "./assignments.js";
import type { JsIrOperation } from "./types.js";
import { lowerUpdateExpressionStatement } from "./expression-statements.js";
import { withinLoopLabel } from "./loop-labels.js";
import { lowerStatementBody } from "./statement-lists.js";
import { iteratorErrorSubject } from "./iterator-subject.js";
import { updateBindings } from "./binding-updates.js";

/**
 * Lower one loop's body, taking a label frame for the loop being entered.
 *
 * Every loop form goes through here rather than calling `lowerStatementBody` itself, because the frame
 * is what makes `break label` resolve: the depth it carries counts *loops* between the jump and the one
 * the label named, so a loop that does not take one makes every enclosing count short. That is not a
 * hypothetical — an unlabelled `for…of` inside a labelled `while` used to make `break outer` exit the
 * `for…of`, and a label on a `for…of` used to be adopted by the first nested `for`, both silently.
 * Wrapping the two steps together is what keeps the next loop form from reintroducing it.
 */
function lowerLoopBody(
  context: LoweringContext,
  bodyStatement: ts.Statement,
  bodyBindings: ReadonlyMap<string, JsIrBindingValue>
): ReturnType<typeof lowerStatementBody> {
  return withinLoopLabel(context, () => lowerStatementBody(context, bodyStatement, bodyBindings));
}

export function lowerForStatement(
  context: LoweringContext,
  statement: ts.ForStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (
    statement.initializer === undefined ||
    statement.condition === undefined ||
    statement.incrementor === undefined
  ) {
    return notApplicable;
  }

  const forBindings = new Map(bindings);
  const initializer = lowerForInitializer(context, statement.initializer, forBindings);
  if (initializer.kind !== "lowered") {
    return initializer;
  }

  const condition = context.lowerConditionExpression(context, statement.condition, forBindings);
  if (condition.kind !== "lowered") {
    return condition;
  }

  // `i = i + 1` and `i++` are both incrementors, and the two lower through different recognizers: the
  // second is an update expression, which the expression-statement tier already lowers to the same
  // `assignNumber`. Only routing one of them makes the other look unsupported.
  const incrementor = lowerAssignmentStatement(context, statement.incrementor, forBindings);
  if (incrementor.kind === "unsupported") {
    return incrementor;
  }
  let increment: JsIrOperation | undefined;
  if (incrementor.kind === "lowered") {
    increment = incrementor.operation;
  } else {
    const updateExpressionStatementResult = lowerUpdateExpressionStatement(statement.incrementor, forBindings);
    if (updateExpressionStatementResult.kind === "unsupported") {
      return updateExpressionStatementResult;
    }
    increment = loweredPayload(updateExpressionStatementResult);
  }
  if (increment === undefined) {
    return notApplicable;
  }

  const bodyResult = lowerLoopBody(context, statement.statement, forBindings);
  if (bodyResult.kind === "unsupported") {
    return bodyResult;
  }
  const body = bodyResult.operation;

  return produced({
    kind: "for",
    initializer: initializer.operation,
    condition: condition.operation,
    increment,
    body
  });
}

// eslint-disable-next-line complexity, max-statements -- for...of lowering dispatches specialized source kinds first, then the generic Symbol.iterator protocol.
export function lowerForOfStatement(
  context: LoweringContext,
  statement: ts.ForOfStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!ts.isVariableDeclarationList(statement.initializer) || statement.initializer.declarations.length !== 1) {
    return notApplicable;
  }
  const [declaration] = statement.initializer.declarations;
  if (!ts.isIdentifier(declaration.name) || declaration.initializer !== undefined || (statement.initializer.flags & ts.NodeFlags.Const) === 0) {
    return notApplicable;
  }
  const itemName = declaration.name.text;
  const bodyStatement = statement.statement;
  const specialized = lowerSpecializedForOf(context, statement.expression, itemName, bodyStatement, bindings);
  if (specialized.kind !== "notApplicable") {
    return specialized;
  }
  // Generic sync iteration protocol: for-of over any value that may implement Symbol.iterator.
  const iterable = context.lowerValueExpression(context, statement.expression, bindings);
  if (iterable.kind !== "lowered") {
    return iterable;
  }
  const bodyBindings = new Map(bindings);
  bodyBindings.set(itemName, { kind: "valueVariable", name: itemName });
  const bodyResult = lowerLoopBody(context, bodyStatement, bodyBindings);
  if (bodyResult.kind === "unsupported") {
    return bodyResult;
  }
  const body = bodyResult.operation;

  return produced({
    kind: "forOfProtocol",
    itemName,
    iterable: iterable.operation,
    notIterableMessage: `${iteratorErrorSubject(statement.expression)} is not iterable`,
    body
  });
}

// eslint-disable-next-line max-statements -- Specialized for-of branches cover string, Set, Map, and fixed array sources.
function lowerSpecializedForOf(
  context: LoweringContext,
  sourceExpression: ts.Expression,
  itemName: string,
  bodyStatement: ts.Statement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const sourceString = context.lowerStringRuntimeExpression(context, sourceExpression, bindings);
  if (sourceString.kind === "unsupported") {
    return sourceString;
  }
  if (sourceString.kind === "lowered") {
    const bodyBindings = new Map(bindings);
    bodyBindings.set(itemName, { kind: "stringVariable", name: itemName });
    const bodyResult = lowerLoopBody(context, bodyStatement, bodyBindings);
    if (bodyResult.kind === "unsupported") {
      return bodyResult;
    }
    const body = bodyResult.operation;

    return produced({ kind: "forOfString", itemName, source: sourceString.operation, body });
  }
  if (!ts.isIdentifier(sourceExpression)) {
    return notApplicable;
  }
  const sourceName = sourceExpression.text;
  const sourceBinding = bindings.get(sourceName);
  if (sourceBinding?.kind === "runtimeSet") {
    const bodyBindings = new Map(bindings);
    bodyBindings.set(itemName, { kind: "valueVariable", name: itemName });
    const bodyResult = lowerLoopBody(context, bodyStatement, bodyBindings);
    if (bodyResult.kind === "unsupported") {
      return bodyResult;
    }
    const body = bodyResult.operation;

    return produced({ kind: "forOfSet", itemName, setName: sourceBinding.name, body });
  }
  if (sourceBinding?.kind === "runtimeMap") {
    const bodyBindings = new Map(bindings);
    bodyBindings.set(itemName, { kind: "runtimeArray", name: itemName });
    const bodyResult = lowerLoopBody(context, bodyStatement, bodyBindings);
    if (bodyResult.kind === "unsupported") {
      return bodyResult;
    }
    const body = bodyResult.operation;

    return produced({ kind: "forOfMap", itemName, mapName: sourceBinding.name, body });
  }
  if (sourceBinding?.kind !== "array") {
    return notApplicable;
  }
  const bodyBindings = new Map(bindings);
  bodyBindings.set(itemName, { kind: "number", value: { kind: "variable", name: itemName } });
  const bodyResult = lowerLoopBody(context, bodyStatement, bodyBindings);
  if (bodyResult.kind === "unsupported") {
    return bodyResult;
  }
  const body = bodyResult.operation;

  return produced({ kind: "forOfArray", itemName, arrayName: sourceName, body });
}

// eslint-disable-next-line max-statements -- for...in lowering dispatches supported source kinds explicitly while unsupported iterables stay diagnostic-only.
export function lowerForInStatement(
  context: LoweringContext,
  statement: ts.ForInStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!ts.isVariableDeclarationList(statement.initializer) || statement.initializer.declarations.length !== 1) {
    return notApplicable;
  }
  const [declaration] = statement.initializer.declarations;
  if (!ts.isIdentifier(declaration.name) || declaration.initializer !== undefined || (statement.initializer.flags & ts.NodeFlags.Const) === 0) {
    return notApplicable;
  }
  if (!ts.isIdentifier(statement.expression)) {
    return notApplicable;
  }
  const sourceName = statement.expression.text;
  const sourceBinding = bindings.get(sourceName);
  if (sourceBinding?.kind === "runtimeObject") {
    const bodyBindings = new Map(bindings);
    bodyBindings.set(declaration.name.text, { kind: "stringVariable", name: declaration.name.text });
    const bodyResult = lowerLoopBody(context, statement.statement, bodyBindings);
    if (bodyResult.kind === "unsupported") {
      return bodyResult;
    }
    const body = bodyResult.operation;

    return produced({ kind: "forInObject", itemName: declaration.name.text, objectName: sourceBinding.name, body });
  }
  if (sourceBinding?.kind === "runtimeArray") {
    const bodyBindings = new Map(bindings);
    bodyBindings.set(declaration.name.text, { kind: "stringVariable", name: declaration.name.text });
    const bodyResult = lowerLoopBody(context, statement.statement, bodyBindings);
    if (bodyResult.kind === "unsupported") {
      return bodyResult;
    }
    const body = bodyResult.operation;

    return produced({ kind: "forInArray", itemName: declaration.name.text, arrayName: sourceBinding.name, body });
  }
  return notApplicable;
}

/**
 * The bindings a `for` initializer declares, in source order.
 *
 * The initializer is a declaration list, so it may declare more than one name, and every declaration is
 * evaluated before the condition runs: `for (let i = 0, j = i + 1; ...)` needs `i` visible to `j`. The
 * caller therefore folds each result into its binding map as it goes rather than after the fact.
 *
 * `notApplicable` means this initializer is not one the loop tier can represent — a `const`, a destructuring
 * pattern, or a value that is not a number — and the caller declines the whole statement.
 */
function lowerForInitializer(
  context: LoweringContext,
  initializer: ts.ForInitializer,
  bindings: Map<string, JsIrBindingValue>
): Lowered<readonly JsIrOperation[]> {
  if (!ts.isVariableDeclarationList(initializer) || (initializer.flags & ts.NodeFlags.Const) !== 0) {
    return notApplicable;
  }

  const declarations: JsIrOperation[] = [];
  for (const declaration of initializer.declarations) {
    if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
      return notApplicable;
    }
    const value = context.lowerNumberExpression(context, declaration.initializer, bindings);
    if (value.kind !== "lowered") {
      return value;
    }
    const operation: JsIrOperation = {
      kind: "letNumber",
      name: declaration.name.text,
      value: value.operation
    };
    declarations.push(operation);
    updateBindings(operation, bindings);
  }

  return produced(declarations);
}

export function lowerWhileStatement(
  context: LoweringContext,
  statement: ts.WhileStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const condition = context.lowerConditionExpression(context, statement.expression, bindings);
  if (condition.kind !== "lowered") {
    return condition;
  }

  const bodyResult = lowerLoopBody(context, statement.statement, bindings);
  if (bodyResult.kind === "unsupported") {
    return bodyResult;
  }
  const body = bodyResult.operation;

  return produced({
    kind: "while",
    condition: condition.operation,
    body
  });
}

export function lowerDoWhileStatement(
  context: LoweringContext,
  statement: ts.DoStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const condition = context.lowerConditionExpression(context, statement.expression, bindings);
  if (condition.kind !== "lowered") {
    return condition;
  }

  const bodyResult = lowerLoopBody(context, statement.statement, bindings);
  if (bodyResult.kind === "unsupported") {
    return bodyResult;
  }
  const body = bodyResult.operation;

  return produced({
    kind: "doWhile",
    condition: condition.operation,
    body
  });
}
