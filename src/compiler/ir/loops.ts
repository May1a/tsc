import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import { type Lowered, type LoweredStatementList, type Produced, notApplicable, produced, unsupported, unsupportedIn, withRefusal } from "./lowered.js";
import { lowerAssignmentStatement } from "./assignments.js";
import type { JsIrCondition, JsIrValueExpression } from "./expressions.js";
import type { JsIrOperation } from "./types.js";
import { lowerUpdateExpressionStatement } from "./expression-statements.js";
import { withinLoopLabel } from "./loop-labels.js";
import { lowerStatementBody } from "./statement-lists.js";
import { iteratorErrorSubject } from "./iterator-subject.js";
import { expressionSnippet } from "./diagnostics.js";
import { unsupportedFormMessage } from "./builtins/manifest.js";
import { updateBindings } from "./binding-updates.js";
import { lowerArrayProtocolDestructuringFromSource } from "./destructuring.js";

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
): LoweredStatementList {
  return withinLoopLabel(context, () => lowerStatementBody(context, bodyStatement, bodyBindings));
}

export function lowerForStatement(
  context: LoweringContext,
  statement: ts.ForStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const forBindings = new Map(bindings);
  // An omitted initializer declares nothing: `for (; cond; incr)` reads the outer bindings.
  const initializer = statement.initializer === undefined
    ? produced<readonly JsIrOperation[]>([])
    : lowerForInitializer(context, statement.initializer, forBindings);
  if (initializer.kind !== "lowered") {
    return initializer;
  }

  const condition = lowerForCondition(context, statement.condition, forBindings);
  if (condition.kind !== "lowered") {
    return withRefusal(condition, unsupportedIn("A `for` statement condition must be an expression this build can evaluate"));
  }

  const increment = lowerForIncrement(context, statement.incrementor, forBindings);
  if (increment.kind !== "lowered") {
    return increment;
  }

  const bodyResult = lowerLoopBody(context, statement.statement, forBindings);
  if (bodyResult.kind === "unsupported") {
    return bodyResult;
  }
  const body = bodyResult.operation;

  return produced({
    kind: "for",
    initializer: initializer.operation,
    ...(condition.operation === undefined ? {} : { condition: condition.operation }),
    ...(increment.operation === undefined ? {} : { increment: increment.operation }),
    body
  });
}

/**
 * A `for` condition, or `undefined` when the source omitted it.
 *
 * Per ECMA-262 an omitted condition is `true`. The omission stays an absent IR field rather than a
 * synthesized constant so that emission enters the body without a test.
 */
function lowerForCondition(
  context: LoweringContext,
  condition: ts.Expression | undefined,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrCondition | undefined> {
  if (condition === undefined) {
    return produced(undefined);
  }
  return context.lowerConditionExpression(context, condition, bindings);
}

/**
 * A `for` update step, or `undefined` when the source omitted it.
 *
 * `i = i + 1` and `i++` are both incrementors, and the two lower through different recognizers: the
 * second is an update expression, which the expression-statement tier already lowers to the same
 * `assignNumber`. Only routing one of them makes the other look unsupported.
 */
function lowerForIncrement(
  context: LoweringContext,
  incrementor: ts.Expression | undefined,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrOperation | undefined> {
  if (incrementor === undefined) {
    return produced(undefined);
  }
  const assignment = lowerAssignmentStatement(context, incrementor, bindings);
  if (assignment.kind === "unsupported") {
    return assignment;
  }
  if (assignment.kind === "lowered") {
    return produced<JsIrOperation | undefined>(assignment.operation);
  }
  const update = lowerUpdateExpressionStatement(incrementor, bindings);
  if (update.kind !== "lowered") {
    return withRefusal(update, unsupportedIn("A `for` statement update clause must be an assignment or update expression"));
  }
  return produced<JsIrOperation | undefined>(update.operation);
}

// eslint-disable-next-line complexity, max-statements -- for...of lowering dispatches specialized source kinds first, then the generic Symbol.iterator protocol.
export function lowerForOfStatement(
  context: LoweringContext,
  statement: ts.ForOfStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!ts.isVariableDeclarationList(statement.initializer) || statement.initializer.declarations.length !== 1) {
    return unsupported("A `for...of` statement must declare its item with `const`, without an initializer");
  }
  const [declaration] = statement.initializer.declarations;
  if (declaration.initializer !== undefined || (statement.initializer.flags & ts.NodeFlags.Const) === 0) {
    return unsupported("A `for...of` statement must declare its item with `const`, without an initializer");
  }
  const itemName = forOfItemName(declaration.name);
  const bodyStatement = statement.statement;
  const specialized = lowerSpecializedForOf(context, statement.expression, declaration.name, bodyStatement, bindings);
  if (specialized.kind !== "notApplicable") {
    return specialized;
  }
  // Generic sync iteration protocol: for-of over any value that may implement Symbol.iterator.
  const iterable = context.lowerValueExpression(context, statement.expression, bindings);
  if (iterable.kind !== "lowered") {
    return withRefusal(iterable, unsupportedIn("The source of a `for...of` statement must be an expression this build can evaluate"));
  }
  const bodyResult = lowerForOfBody(context, declaration.name, bodyStatement, bindings, { kind: "valueVariable", name: itemName });
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
  itemPattern: ts.BindingName,
  bodyStatement: ts.Statement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const itemName = forOfItemName(itemPattern);
  const sourceString = context.lowerStringRuntimeExpression(context, sourceExpression, bindings);
  if (sourceString.kind === "unsupported") {
    return sourceString;
  }
  if (sourceString.kind === "lowered") {
    if (!ts.isIdentifier(itemPattern)) {
      return unsupported(unsupportedFormMessage("for-of-string-destructuring"));
    }
    const bodyResult = lowerForOfBody(context, itemPattern, bodyStatement, bindings, { kind: "stringVariable", name: itemName });
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
    const bodyResult = lowerForOfBody(context, itemPattern, bodyStatement, bindings, { kind: "valueVariable", name: itemName });
    if (bodyResult.kind === "unsupported") {
      return bodyResult;
    }
    const body = bodyResult.operation;

    return produced({ kind: "forOfSet", itemName, setName: sourceBinding.name, body });
  }
  if (sourceBinding?.kind === "runtimeMap") {
    const bodyResult = lowerForOfBody(context, itemPattern, bodyStatement, bindings, { kind: "runtimeArray", name: itemName });
    if (bodyResult.kind === "unsupported") {
      return bodyResult;
    }
    const body = bodyResult.operation;

    return produced({ kind: "forOfMap", itemName, mapName: sourceBinding.name, body });
  }
  if (sourceBinding?.kind !== "array") {
    return notApplicable;
  }
  const bodyResult = lowerForOfBody(context, itemPattern, bodyStatement, bindings, { kind: "number", value: { kind: "variable", name: itemName } });
  if (bodyResult.kind === "unsupported") {
    return bodyResult;
  }
  const body = bodyResult.operation;

  return produced({ kind: "forOfArray", itemName, arrayName: sourceName, body });
}

function forOfItemName(pattern: ts.BindingName): string {
  if (ts.isIdentifier(pattern)) {
    return pattern.text;
  }
  // Every phase derives the same private name without advancing a counter on recognizer retries.
  // A source position is unique within the current source file; the prefix cannot be a TS identifier.
  return `for.of.item.${pattern.pos}`;
}

function lowerForOfBody(
  context: LoweringContext,
  pattern: ts.BindingName,
  bodyStatement: ts.Statement,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  itemBinding: JsIrBindingValue
): LoweredStatementList {
  const operations: JsIrOperation[] = [];
  const itemName = forOfItemName(pattern);
  const bodyBindings = new Map(bindings);
  bodyBindings.set(itemName, itemBinding);
  if (!ts.isIdentifier(pattern)) {
    const itemValue = context.lowerValueExpression(context, ts.factory.createIdentifier(itemName), bodyBindings);
    if (itemValue.kind === "unsupported") {
      return itemValue;
    }
    if (itemValue.kind === "notApplicable") {
      return { kind: "unsupported", reason: "Unsupported for-of item value in destructuring binding" };
    }
    const result = lowerForOfPattern(context, pattern, itemName, itemBinding, itemValue.operation, bodyBindings, operations);
    if (result.kind === "unsupported") {
      return result;
    }
    if (!result.operation) {
      return { kind: "unsupported", reason: "Unsupported destructuring pattern in for-of binding" };
    }
  }
  const body = lowerLoopBody(context, bodyStatement, bodyBindings);
  if (body.kind === "unsupported") {
    return body;
  }
  return produced([...operations, ...body.operation]);
}

function lowerForOfPattern(
  context: LoweringContext,
  pattern: ts.ArrayBindingPattern | ts.ObjectBindingPattern,
  itemName: string,
  itemBinding: JsIrBindingValue,
  itemValue: JsIrValueExpression,
  bindings: Map<string, JsIrBindingValue>,
  operations: JsIrOperation[]
): Produced<boolean> {
  if (ts.isArrayBindingPattern(pattern)) {
    return lowerArrayProtocolDestructuringFromSource(
      context, pattern, { kind: "value", value: itemValue }, "For-of item is not iterable", bindings, operations
    );
  }
  return context.lowerObjectDestructuringElements(
    context, pattern, { name: itemName, binding: itemBinding }, bindings, operations, true
  );
}

// eslint-disable-next-line max-statements -- for...in lowering dispatches supported source kinds explicitly while unsupported iterables stay diagnostic-only.
export function lowerForInStatement(
  context: LoweringContext,
  statement: ts.ForInStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!ts.isVariableDeclarationList(statement.initializer) || statement.initializer.declarations.length !== 1) {
    return unsupported("A `for...in` statement must declare its key with `const`, without an initializer");
  }
  const [declaration] = statement.initializer.declarations;
  if (!ts.isIdentifier(declaration.name)) {
    return unsupported("Destructuring the key of a `for...in` statement is not supported yet");
  }
  if (declaration.initializer !== undefined || (statement.initializer.flags & ts.NodeFlags.Const) === 0) {
    return unsupported("A `for...in` statement must declare its key with `const`, without an initializer");
  }
  if (!ts.isIdentifier(statement.expression)) {
    return unsupported("A `for...in` statement must iterate over a runtime dictionary object or a runtime array");
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
  return unsupported("A `for...in` statement must iterate over a runtime dictionary object or a runtime array");
}

/**
 * The bindings a `for` initializer declares, in source order.
 *
 * The initializer is a declaration list, so it may declare more than one name, and every declaration is
 * evaluated before the condition runs: `for (let i = 0, j = i + 1; ...)` needs `i` visible to `j`. The
 * caller therefore folds each result into its binding map as it goes rather than after the fact.
 *
 * The loop tier only represents numeric `let` and `var` bindings, so anything else is refused with a
 * reason that names the shape: a `const`, a destructuring pattern, or a value that is not a number.
 */
function lowerForInitializer(
  context: LoweringContext,
  initializer: ts.ForInitializer,
  bindings: Map<string, JsIrBindingValue>
): Lowered<readonly JsIrOperation[]> {
  if (!ts.isVariableDeclarationList(initializer)) {
    return unsupportedIn("A `for` statement initializer must be a `let` or `var` declaration");
  }
  if ((initializer.flags & ts.NodeFlags.Const) !== 0) {
    return unsupportedIn("A `for` statement initializer must be a `let` or `var` declaration, not `const`");
  }

  // A `var` header is one function-scoped binding that every iteration shares; a `let` header is
  // copied into a fresh binding per iteration, which resolution decides from this marker.
  const scope = (initializer.flags & ts.NodeFlags.Let) === 0 ? { functionScoped: true as const } : {};
  const declarations: JsIrOperation[] = [];
  for (const declaration of initializer.declarations) {
    if (!ts.isIdentifier(declaration.name)) {
      return unsupportedIn("A `for` statement initializer does not support destructuring patterns yet");
    }
    if (!declaration.initializer) {
      return unsupportedIn("A `for` statement binding without an initializer is not supported yet");
    }
    const value = context.lowerNumberExpression(context, declaration.initializer, bindings);
    if (value.kind !== "lowered") {
      return withRefusal(value, unsupportedIn("A `for` statement initializer must be a number this build can evaluate"));
    }
    const operation: JsIrOperation = {
      kind: "letNumber",
      name: declaration.name.text,
      value: value.operation,
      ...scope
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
    return withRefusal(condition, unsupportedIn(`A \`while\` condition must be an expression this build can evaluate: \`${expressionSnippet(statement.expression)}\``));
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
    return withRefusal(condition, unsupportedIn(`A \`do...while\` condition must be an expression this build can evaluate: \`${expressionSnippet(statement.expression)}\``));
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
