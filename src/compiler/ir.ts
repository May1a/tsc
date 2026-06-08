import { Chunk, Effect } from "effect";
import ts from "typescript";
import { Diagnostics } from "./diagnostics-service.js";
import type { CompilerDiagnostic } from "./diagnostics.js";

export type JsIrModule = {
  readonly entry: string;
  readonly modules: readonly JsIrSourceModule[];
};

export type JsIrSourceModule = {
  readonly fileName: string;
  readonly statementCount: number;
  readonly operations: readonly JsIrOperation[];
};

export type JsIrNumberOperator = "add" | "subtract" | "multiply" | "divide";

export type JsIrValueKind = "number" | "string" | "value";

export type JsIrFunctionParameter = {
  readonly name: string;
  readonly valueKind: JsIrValueKind;
};

export type JsIrCallArgument =
  | {
      readonly valueKind: "number";
      readonly value: JsIrNumberExpression;
    }
  | {
      readonly valueKind: "string";
      readonly value: JsIrStringExpression;
    }
  | {
      readonly valueKind: "value";
      readonly value: JsIrValueExpression;
    };

export type JsIrValueExpression =
  | {
      readonly kind: "number";
      readonly value: JsIrNumberExpression;
    }
  | {
      readonly kind: "boolean";
      readonly value: JsIrCondition;
    }
  | {
      readonly kind: "undefined";
    }
  | {
      readonly kind: "string";
      readonly value: JsIrStringExpression;
    }
  | {
      readonly kind: "variable";
      readonly name: string;
    }
  | {
      readonly kind: "call";
      readonly name: string;
      readonly arguments: readonly JsIrCallArgument[];
    }
  | {
      readonly kind: "ternary";
      readonly condition: JsIrCondition;
      readonly consequent: JsIrValueExpression;
      readonly alternate: JsIrValueExpression;
    }
  | {
      readonly kind: "arrayAccess";
      readonly arrayName: string;
      readonly index: JsIrNumberExpression;
    }
  | {
      readonly kind: "objectDynamicAccess";
      readonly objectName: string;
      readonly key: JsIrStringExpression;
    };

export type JsIrNumberExpression =
  | {
      readonly kind: "literal";
      readonly value: number;
    }
  | {
      readonly kind: "unary";
      readonly operator: "negate";
      readonly value: JsIrNumberExpression;
    }
  | {
      readonly kind: "binary";
      readonly operator: JsIrNumberOperator;
      readonly left: JsIrNumberExpression;
      readonly right: JsIrNumberExpression;
    }
  | {
      readonly kind: "parameter";
      readonly name: string;
    }
  | {
      readonly kind: "variable";
      readonly name: string;
    }
  | {
      readonly kind: "call";
      readonly name: string;
      readonly arguments: readonly JsIrNumberExpression[];
    }
  | {
      readonly kind: "ternary";
      readonly condition: JsIrCondition;
      readonly consequent: JsIrNumberExpression;
      readonly alternate: JsIrNumberExpression;
    }
  | {
      readonly kind: "arrayAccess";
      readonly arrayName: string;
      readonly index: JsIrNumberExpression;
    }
  | {
      readonly kind: "arrayLength";
      readonly arrayName: string;
    }
  | {
      readonly kind: "objectAccess";
      readonly objectName: string;
      readonly path: readonly string[];
    };

export type JsIrStringExpression =
  | {
      readonly kind: "literal";
      readonly value: string;
    }
  | {
      readonly kind: "variable";
      readonly name: string;
    }
  | {
      readonly kind: "ternary";
      readonly condition: JsIrCondition;
      readonly consequent: JsIrStringExpression;
      readonly alternate: JsIrStringExpression;
    }
  | {
      readonly kind: "concat";
      readonly left: JsIrStringExpression;
      readonly right: JsIrStringExpression;
    }
  | {
      readonly kind: "call";
      readonly name: string;
      readonly arguments: readonly JsIrCallArgument[];
    };

export type JsIrObjectFieldValue =
  | {
      readonly kind: "number";
      readonly value: JsIrNumberExpression;
    }
  | {
      readonly kind: "object";
      readonly value: JsIrObjectValue;
    };

export type JsIrObjectField = {
  readonly name: string;
  readonly value: JsIrObjectFieldValue;
};

export type JsIrObjectValue = {
  readonly fields: readonly JsIrObjectField[];
};

export type JsIrRuntimeObjectField = {
  readonly key: JsIrStringExpression;
  readonly value: JsIrValueExpression;
};

export type JsIrRuntimeObjectValue = {
  readonly fields: readonly JsIrRuntimeObjectField[];
};

export type JsIrClosureValue = {
  readonly functionName: string;
  readonly captures: readonly JsIrNumberExpression[];
};

export type JsIrBindingValue =
  | {
      readonly kind: "string";
      readonly value: string;
    }
  | {
      readonly kind: "stringExpression";
      readonly value: JsIrStringExpression;
    }
  | {
      readonly kind: "stringVariable";
      readonly name: string;
    }
  | {
      readonly kind: "value";
      readonly value: JsIrValueExpression;
    }
  | {
      readonly kind: "valueVariable";
      readonly name: string;
    }
  | {
      readonly kind: "number";
      readonly value: JsIrNumberExpression;
    }
  | {
      readonly kind: "boolean";
      readonly value: boolean;
    }
  | {
      readonly kind: "booleanExpression";
      readonly value: JsIrCondition;
    }
  | {
      readonly kind: "booleanVariable";
      readonly name: string;
    }
  | {
      readonly kind: "array";
      readonly name: string;
      readonly length: number;
    }
  | {
      readonly kind: "runtimeArray";
      readonly name: string;
    }
  | {
      readonly kind: "object";
      readonly value: JsIrObjectValue;
    }
  | {
      readonly kind: "runtimeObject";
      readonly name: string;
    }
  | {
      readonly kind: "closure";
      readonly value: JsIrClosureValue;
    }
  | {
      readonly kind: "closureFactory";
      readonly functionName: string;
      readonly factoryParameters: readonly string[];
      readonly captureNames: readonly string[];
    }
  | {
      readonly kind: "function";
      readonly parameters: readonly JsIrFunctionParameter[];
      readonly returnKind: JsIrValueKind | "void";
    };

export type JsIrCondition =
  | {
      readonly kind: "boolean";
      readonly value: boolean;
    }
  | {
      readonly kind: "numberComparison";
      readonly operator: "===" | "!==" | "<" | "<=" | ">" | ">=";
      readonly left: JsIrNumberExpression;
      readonly right: JsIrNumberExpression;
    }
  | {
      readonly kind: "negate";
      readonly condition: JsIrCondition;
    }
  | {
      readonly kind: "and";
      readonly left: JsIrCondition;
      readonly right: JsIrCondition;
    }
  | {
      readonly kind: "or";
      readonly left: JsIrCondition;
      readonly right: JsIrCondition;
    }
  | {
      readonly kind: "booleanVariable";
      readonly name: string;
    }
  | {
      readonly kind: "stringComparison";
      readonly operator: "===" | "!==";
      readonly left: JsIrStringExpression;
      readonly right: JsIrStringExpression;
    }
  | {
      readonly kind: "booleanComparison";
      readonly operator: "===" | "!==";
      readonly left: JsIrCondition;
      readonly right: JsIrCondition;
    }
  | {
      readonly kind: "valueComparison";
      readonly operator: "===" | "!==";
      readonly left: JsIrValueExpression;
      readonly right: JsIrValueExpression;
    };

export type JsIrExpression =
  | {
      readonly kind: "string";
      readonly value: string;
    }
  | {
      readonly kind: "stringExpression";
      readonly value: JsIrStringExpression;
    }
  | {
      readonly kind: "number";
      readonly value: JsIrNumberExpression;
    }
  | {
      readonly kind: "boolean";
      readonly value: boolean;
    }
  | {
      readonly kind: "identifier";
      readonly name: string;
    }
  | {
      readonly kind: "call";
      readonly name: string;
      readonly arguments: readonly JsIrCallArgument[];
    }
  | {
      readonly kind: "value";
      readonly value: JsIrValueExpression;
    };

export type JsIrOperation =
  | {
      readonly kind: "constNumber";
      readonly name: string;
      readonly value: JsIrNumberExpression;
    }
  | {
      readonly kind: "constString";
      readonly name: string;
      readonly value: string;
    }
  | {
      readonly kind: "constStringExpression";
      readonly name: string;
      readonly value: JsIrStringExpression;
    }
  | {
      readonly kind: "constBoolean";
      readonly name: string;
      readonly value: boolean;
    }
  | {
      readonly kind: "constBooleanExpression";
      readonly name: string;
      readonly value: JsIrCondition;
    }
  | {
      readonly kind: "constValue";
      readonly name: string;
      readonly value: JsIrValueExpression;
    }
  | {
      readonly kind: "constClosure";
      readonly name: string;
      readonly value: JsIrClosureValue;
    }
  | {
      readonly kind: "letNumber";
      readonly name: string;
      readonly value: JsIrNumberExpression;
    }
  | {
      readonly kind: "letString";
      readonly name: string;
      readonly value: JsIrStringExpression;
    }
  | {
      readonly kind: "letBoolean";
      readonly name: string;
      readonly value: JsIrCondition;
    }
  | {
      readonly kind: "arrayLiteral";
      readonly name: string;
      readonly elements: readonly JsIrNumberExpression[];
    }
  | {
      readonly kind: "runtimeArrayLiteral";
      readonly name: string;
      readonly elements: readonly JsIrValueExpression[];
    }
  | {
      readonly kind: "objectLiteral";
      readonly name: string;
      readonly value: JsIrObjectValue;
      readonly needsRuntimeShadow: boolean;
    }
  | {
      readonly kind: "runtimeObjectLiteral";
      readonly name: string;
      readonly value: JsIrRuntimeObjectValue;
    }
  | {
      readonly kind: "assignNumber";
      readonly name: string;
      readonly value: JsIrNumberExpression;
    }
  | {
      readonly kind: "assignString";
      readonly name: string;
      readonly value: JsIrStringExpression;
    }
  | {
      readonly kind: "assignBoolean";
      readonly name: string;
      readonly value: JsIrCondition;
    }
  | {
      readonly kind: "arrayStore";
      readonly arrayName: string;
      readonly index: JsIrNumberExpression;
      readonly value: JsIrNumberExpression;
    }
  | {
      readonly kind: "runtimeArrayStore";
      readonly arrayName: string;
      readonly index: JsIrNumberExpression;
      readonly value: JsIrValueExpression;
    }
  | {
      readonly kind: "objectStore";
      readonly objectName: string;
      readonly path: readonly string[];
      readonly value: JsIrNumberExpression;
    }
  | {
      readonly kind: "runtimeObjectStore";
      readonly objectName: string;
      readonly key: JsIrStringExpression;
      readonly value: JsIrValueExpression;
    }
  | {
      readonly kind: "print";
      readonly expression: JsIrExpression;
    }
  | {
      readonly kind: "if";
      readonly condition: JsIrCondition;
      readonly thenOperations: readonly JsIrOperation[];
      readonly elseOperations: readonly JsIrOperation[];
    }
  | {
      readonly kind: "while";
      readonly condition: JsIrCondition;
      readonly body: readonly JsIrOperation[];
    }
  | {
      readonly kind: "doWhile";
      readonly condition: JsIrCondition;
      readonly body: readonly JsIrOperation[];
    }
  | {
      readonly kind: "for";
      readonly initializer: JsIrOperation;
      readonly condition: JsIrCondition;
      readonly increment: JsIrOperation;
      readonly body: readonly JsIrOperation[];
    }
  | {
      readonly kind: "break";
    }
  | {
      readonly kind: "continue";
    }
  | {
      readonly kind: "function";
      readonly name: string;
      readonly parameters: readonly JsIrFunctionParameter[];
      readonly body: readonly JsIrOperation[];
    }
  | {
      readonly kind: "call";
      readonly name: string;
      readonly arguments: readonly JsIrCallArgument[];
    }
  | {
      readonly kind: "returnNumber";
      readonly expression: JsIrNumberExpression;
    }
  | {
      readonly kind: "returnString";
      readonly expression: JsIrStringExpression;
    }
  | {
      readonly kind: "returnValue";
      readonly expression: JsIrValueExpression;
    }
  | {
      readonly kind: "returnClosure";
      readonly functionName: string;
      readonly parameters: readonly string[];
      readonly captures: readonly string[];
      readonly body: readonly JsIrOperation[];
    };

export type JsIrResult = {
  readonly module: JsIrModule;
};

type ArrayLiteralClassification =
  | {
      readonly kind: "fixed";
      readonly elements: readonly JsIrNumberExpression[];
    }
  | {
      readonly kind: "runtime";
      readonly elements: readonly JsIrValueExpression[];
    };

type ObjectLiteralClassification =
  | {
      readonly kind: "fixed";
      readonly value: JsIrObjectValue;
    }
  | {
      readonly kind: "runtime";
      readonly value: JsIrRuntimeObjectValue;
    };

export function aggregateBindingForOperation(operation: JsIrOperation): JsIrBindingValue | undefined {
  if (operation.kind === "arrayLiteral") {
    return { kind: "array", name: operation.name, length: operation.elements.length };
  }
  if (operation.kind === "runtimeArrayLiteral") {
    return { kind: "runtimeArray", name: operation.name };
  }
  if (operation.kind === "objectLiteral") {
    return { kind: "object", value: operation.value };
  }
  if (operation.kind === "runtimeObjectLiteral") {
    return { kind: "runtimeObject", name: operation.name };
  }
  return undefined;
}

const sourceSpan = (sourceFile: ts.SourceFile, position: number) => {
  const lineAndCharacter = sourceFile.getLineAndCharacterOfPosition(position);

  return {
    fileName: sourceFile.fileName,
    line: lineAndCharacter.line + 1,
    column: lineAndCharacter.character + 1
  };
};

function lowerStatements(
  sourceFile: ts.SourceFile
): { readonly operations: readonly JsIrOperation[]; readonly diagnostics: Chunk.Chunk<CompilerDiagnostic> } {
  const operations: JsIrOperation[] = [];
  const bindings = new Map<string, JsIrBindingValue>();
  const diagnostics: CompilerDiagnostic[] = [];

  for (const statement of sourceFile.statements) {
    if (isNonExecutableDeclaration(statement)) {
      continue;
    }

    const operation = lowerStatement(statement, bindings);
    if (operation) {
      operations.push(operation);
      updateBindings(operation, bindings);
      continue;
    }

    diagnostics.push({
      code: "TSCN1002",
      category: "error",
      message: unsupportedStatementMessage(statement),
      span: sourceSpan(sourceFile, statement.getStart(sourceFile))
    });
  }

  return { operations: markRuntimeObjectShadows(operations), diagnostics: Chunk.fromIterable(diagnostics) };
}

function updateBindings(
  operation: JsIrOperation,
  bindings: Map<string, JsIrBindingValue>
): void {
  if (operation.kind === "constString") {
    bindings.set(operation.name, { kind: "string", value: operation.value });
  }
  if (operation.kind === "constStringExpression") {
    bindings.set(operation.name, { kind: "stringExpression", value: operation.value });
  }
  if (operation.kind === "constNumber") {
    bindings.set(operation.name, { kind: "number", value: operation.value });
  }
  if (operation.kind === "constBoolean") {
    bindings.set(operation.name, { kind: "boolean", value: operation.value });
  }
  if (operation.kind === "constBooleanExpression") {
    bindings.set(operation.name, { kind: "booleanExpression", value: operation.value });
  }
  if (operation.kind === "constValue") {
    bindings.set(operation.name, { kind: "value", value: operation.value });
  }
  if (operation.kind === "constClosure") {
    bindings.set(operation.name, { kind: "closure", value: operation.value });
  }
  if (operation.kind === "letNumber") {
    bindings.set(operation.name, { kind: "number", value: { kind: "variable", name: operation.name } });
  }
  if (operation.kind === "letString") {
    bindings.set(operation.name, { kind: "stringVariable", name: operation.name });
  }
  if (operation.kind === "letBoolean") {
    bindings.set(operation.name, { kind: "booleanVariable", name: operation.name });
  }
  updateAggregateBindings(operation, bindings);
  if (operation.kind === "function") {
    bindings.set(operation.name, {
      kind: "function",
      parameters: operation.parameters,
      returnKind: functionReturnKind(operation.body)
    });
    const returnClosure = operation.body.find((bodyOperation) => bodyOperation.kind === "returnClosure");
    if (returnClosure?.kind === "returnClosure") {
      bindings.set(operation.name, {
        kind: "closureFactory",
        functionName: returnClosure.functionName,
        factoryParameters: operation.parameters.map((parameter) => parameter.name),
        captureNames: returnClosure.captures
      });
    }
  }
}

function updateAggregateBindings(
  operation: JsIrOperation,
  bindings: Map<string, JsIrBindingValue>
): void {
  const binding = aggregateBindingForOperation(operation);
  if (binding !== undefined && "name" in operation) {
    bindings.set(operation.name, binding);
  }
}

function markRuntimeObjectShadows(operations: readonly JsIrOperation[]): readonly JsIrOperation[] {
  const shadowedObjects = new Set<string>();
  for (const operation of operations) {
    collectRuntimeShadowObjectNames(operation, shadowedObjects);
  }

  if (shadowedObjects.size === 0) {
    return operations;
  }

  return operations.map((operation) => markRuntimeObjectShadow(operation, shadowedObjects));
}

function markRuntimeObjectShadow(operation: JsIrOperation, shadowedObjects: ReadonlySet<string>): JsIrOperation {
  if (operation.kind === "objectLiteral") {
    return { ...operation, needsRuntimeShadow: shadowedObjects.has(operation.name) };
  }
  if (operation.kind === "if") {
    return {
      ...operation,
      thenOperations: markRuntimeObjectShadows(operation.thenOperations),
      elseOperations: markRuntimeObjectShadows(operation.elseOperations)
    };
  }
  if (operation.kind === "while" || operation.kind === "doWhile") {
    return { ...operation, body: markRuntimeObjectShadows(operation.body) };
  }
  if (operation.kind === "for") {
    return {
      ...operation,
      initializer: markRuntimeObjectShadow(operation.initializer, shadowedObjects),
      body: markRuntimeObjectShadows(operation.body),
      increment: markRuntimeObjectShadow(operation.increment, shadowedObjects)
    };
  }
  if (operation.kind === "function") {
    return { ...operation, body: markRuntimeObjectShadows(operation.body) };
  }
  return operation;
}

function collectRuntimeShadowObjectNames(operation: JsIrOperation, names: Set<string>): void {
  collectOperationValueExpressions(operation, names);
  if (operation.kind === "runtimeObjectStore") {
    names.add(operation.objectName);
  }
}

function collectOperationValueExpressions(operation: JsIrOperation, names: Set<string>): void {
  if (operation.kind === "constValue" || operation.kind === "runtimeArrayStore" || operation.kind === "runtimeObjectStore") {
    collectValueExpressionObjectNames(operation.value, names);
  }
  if (operation.kind === "returnValue") {
    collectValueExpressionObjectNames(operation.expression, names);
  }
  if (operation.kind === "runtimeArrayLiteral") {
    for (const element of operation.elements) {
      collectValueExpressionObjectNames(element, names);
    }
  }
  if (operation.kind === "runtimeObjectLiteral") {
    for (const field of operation.value.fields) {
      collectValueExpressionObjectNames(field.value, names);
    }
  }
  if (operation.kind === "print" && operation.expression.kind === "value") {
    collectValueExpressionObjectNames(operation.expression.value, names);
  }
  if (operation.kind === "if") {
    for (const nested of [...operation.thenOperations, ...operation.elseOperations]) {
      collectRuntimeShadowObjectNames(nested, names);
    }
  }
  if (operation.kind === "while" || operation.kind === "doWhile" || operation.kind === "function") {
    for (const nested of operation.body) {
      collectRuntimeShadowObjectNames(nested, names);
    }
  }
  if (operation.kind === "for") {
    collectRuntimeShadowObjectNames(operation.initializer, names);
    for (const nested of operation.body) {
      collectRuntimeShadowObjectNames(nested, names);
    }
    collectRuntimeShadowObjectNames(operation.increment, names);
  }
}

function collectValueExpressionObjectNames(expression: JsIrValueExpression, names: Set<string>): void {
  if (expression.kind === "objectDynamicAccess") {
    names.add(expression.objectName);
  }
  if (expression.kind === "ternary") {
    collectValueExpressionObjectNames(expression.consequent, names);
    collectValueExpressionObjectNames(expression.alternate, names);
  }
  if (expression.kind === "call") {
    for (const argument of expression.arguments) {
      if (argument.valueKind === "value") {
        collectValueExpressionObjectNames(argument.value, names);
      }
    }
  }
}

function functionReturnKind(operations: readonly JsIrOperation[]): JsIrValueKind | "void" {
  if (operations.some((operation) => operation.kind === "returnValue")) {
    return "value";
  }
  if (operations.some((operation) => operation.kind === "returnString")) {
    return "string";
  }
  if (operations.some((operation) => operation.kind === "returnNumber")) {
    return "number";
  }
  return "void";
}

function isNonExecutableDeclaration(statement: ts.Statement): boolean {
  if (
    ts.isImportDeclaration(statement) ||
    ts.isImportEqualsDeclaration(statement) ||
    ts.isExportDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement)
  ) {
    return true;
  }

  let modifiers: readonly ts.Modifier[] | undefined;
  if (ts.canHaveModifiers(statement)) {
    modifiers = ts.getModifiers(statement);
  }
  return Boolean(modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword));
}

function lowerStatement(
  statement: ts.Statement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (ts.isVariableStatement(statement)) {
    return lowerVariableBinding(statement, bindings);
  }

  if (ts.isIfStatement(statement)) {
    return lowerIfStatement(statement, bindings);
  }

  if (ts.isWhileStatement(statement)) {
    return lowerWhileStatement(statement, bindings);
  }

  if (ts.isForStatement(statement)) {
    return lowerForStatement(statement, bindings);
  }

  if (ts.isDoStatement(statement)) {
    return lowerDoWhileStatement(statement, bindings);
  }

  if (ts.isBreakStatement(statement)) {
    return { kind: "break" };
  }

  if (ts.isContinueStatement(statement)) {
    return { kind: "continue" };
  }

  if (ts.isFunctionDeclaration(statement)) {
    return lowerFunctionDeclaration(statement, bindings);
  }

  if (ts.isReturnStatement(statement)) {
    return lowerReturnStatement(statement, bindings);
  }

  if (ts.isExpressionStatement(statement)) {
    return lowerExpressionStatement(statement.expression, bindings);
  }

  return undefined;
}

function lowerExpressionStatement(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  const assignment = lowerAssignmentStatement(expression, bindings);
  if (assignment !== undefined) {
    return assignment;
  }

  if (!ts.isCallExpression(expression) || !ts.isIdentifier(expression.expression)) {
    return undefined;
  }

  const callOp = lowerCallStatement(expression, bindings);
  if (callOp !== undefined) {
    return callOp;
  }

  if (expression.expression.text !== "print" || expression.arguments.length !== 1) {
    return undefined;
  }

  const [argument] = expression.arguments;
  const printExpression = lowerPrintExpression(argument, bindings);
  if (printExpression !== undefined) {
    return {
      kind: "print",
      expression: printExpression
    };
  }

  return undefined;
}

function lowerForStatement(
  statement: ts.ForStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (
    statement.initializer === undefined ||
    statement.condition === undefined ||
    statement.incrementor === undefined ||
    !ts.isBlock(statement.statement)
  ) {
    return undefined;
  }

  const forBindings = new Map(bindings);
  const initializer = lowerForInitializer(statement.initializer, forBindings);
  if (initializer === undefined) {
    return undefined;
  }
  updateBindings(initializer, forBindings);

  const condition = lowerConditionExpression(statement.condition, forBindings);
  if (condition === undefined) {
    return undefined;
  }

  const increment = lowerAssignmentStatement(statement.incrementor, forBindings);
  if (increment === undefined) {
    return undefined;
  }

  const body = lowerBlockStatements(statement.statement, forBindings);
  if (body === undefined) {
    return undefined;
  }

  return {
    kind: "for",
    initializer,
    condition,
    increment,
    body
  };
}

function lowerForInitializer(
  initializer: ts.ForInitializer,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isVariableDeclarationList(initializer) || initializer.declarations.length !== 1) {
    return undefined;
  }

  const [declaration] = initializer.declarations;
  if (!ts.isIdentifier(declaration.name) || !declaration.initializer || (initializer.flags & ts.NodeFlags.Let) === 0) {
    return undefined;
  }

  const value = lowerNumberExpression(declaration.initializer, bindings);
  if (value === undefined) {
    return undefined;
  }

  return {
    kind: "letNumber",
    name: declaration.name.text,
    value
  };
}

function lowerWhileStatement(
  statement: ts.WhileStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  const condition = lowerConditionExpression(statement.expression, bindings);
  if (condition === undefined || !ts.isBlock(statement.statement)) {
    return undefined;
  }

  const body = lowerBlockStatements(statement.statement, bindings);
  if (body === undefined) {
    return undefined;
  }

  return {
    kind: "while",
    condition,
    body
  };
}

function lowerDoWhileStatement(
  statement: ts.DoStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  const condition = lowerConditionExpression(statement.expression, bindings);
  if (condition === undefined || !ts.isBlock(statement.statement)) {
    return undefined;
  }

  const body = lowerBlockStatements(statement.statement, bindings);
  if (body === undefined) {
    return undefined;
  }

  return {
    kind: "doWhile",
    condition,
    body
  };
}

function lowerPrintExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrExpression | undefined {
  if (ts.isIdentifier(expression) && bindings.has(expression.text)) {
    return {
      kind: "identifier",
      name: expression.text
    };
  }

  const stringPrintExpression = lowerStringPrintExpression(expression, bindings);
  if (stringPrintExpression !== undefined) {
    return stringPrintExpression;
  }

  const numberArgument = lowerNumberExpression(expression, bindings);
  if (numberArgument !== undefined) {
    return {
      kind: "number",
      value: numberArgument
    };
  }

  if (expression.kind === ts.SyntaxKind.TrueKeyword || expression.kind === ts.SyntaxKind.FalseKeyword) {
    return {
      kind: "boolean",
      value: expression.kind === ts.SyntaxKind.TrueKeyword
    };
  }

  const valuePrintExpression = lowerValuePrintExpression(expression, bindings);
  if (valuePrintExpression !== undefined) {
    return valuePrintExpression;
  }

  if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text !== "print") {
    const callee = bindings.get(expression.expression.text);
    const args: JsIrCallArgument[] = [];
    if (callee?.kind === "closure") {
      args.push(...callee.value.captures.map((value) => ({ valueKind: "number" as const, value })));
    }
    const loweredArgs = lowerCallArguments(expression.expression.text, expression.arguments, bindings);
    if (loweredArgs === undefined) {
      return undefined;
    }
    args.push(...loweredArgs);
    let name = expression.expression.text;
    if (callee?.kind === "closure") {
      name = callee.value.functionName;
    }
    return { kind: "call", name, arguments: args };
  }

  return undefined;
}

function lowerValuePrintExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrExpression | undefined {
  const valueArgument = lowerValueExpression(expression, bindings);
  if (valueArgument === undefined) {
    return undefined;
  }
  return { kind: "value", value: valueArgument };
}

function lowerStringPrintExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrExpression | undefined {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return { kind: "string", value: expression.text };
  }

  const stringArgument = lowerStringExpression(expression, bindings);
  if (stringArgument !== undefined) {
    return { kind: "string", value: stringArgument };
  }

  const stringExpression = lowerStringRuntimeExpression(expression, bindings);
  if (stringExpression !== undefined) {
    return { kind: "stringExpression", value: stringExpression };
  }

  return undefined;
}

function lowerIfStatement(
  statement: ts.IfStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  const condition = lowerConditionExpression(statement.expression, bindings);
  if (condition === undefined || !ts.isBlock(statement.thenStatement)) {
    return undefined;
  }

  const thenOperations = lowerBlockStatements(statement.thenStatement, bindings);
  if (thenOperations === undefined) {
    return undefined;
  }

  if (!statement.elseStatement) {
    return {
      kind: "if",
      condition,
      thenOperations,
      elseOperations: []
    };
  }

  if (!ts.isBlock(statement.elseStatement)) {
    return undefined;
  }

  const elseOperations = lowerBlockStatements(statement.elseStatement, bindings);
  if (elseOperations === undefined) {
    return undefined;
  }

  return {
    kind: "if",
    condition,
    thenOperations,
    elseOperations
  };
}

function lowerBlockStatements(
  block: ts.Block,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): readonly JsIrOperation[] | undefined {
  const operations: JsIrOperation[] = [];
  const blockBindings = new Map(bindings);

  for (const statement of block.statements) {
    if (isNonExecutableDeclaration(statement)) {
      continue;
    }

    const operation = lowerStatement(statement, blockBindings);
    if (!operation) {
      return undefined;
    }

    operations.push(operation);
    updateBindings(operation, blockBindings);
  }

  return operations;
}

function lowerFunctionDeclaration(
  statement: ts.FunctionDeclaration,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!statement.name || !statement.body || !ts.isBlock(statement.body)) {
    return undefined;
  }

  const parameters: JsIrFunctionParameter[] = [];
  const fnBindings = new Map(bindings);
  for (const param of statement.parameters) {
    if (!ts.isIdentifier(param.name)) {
      return undefined;
    }
    const valueKind = parameterValueKind(param);
    parameters.push({ name: param.name.text, valueKind });
    if (valueKind === "string") {
      fnBindings.set(param.name.text, { kind: "stringVariable", name: param.name.text });
    } else if (valueKind === "value") {
      fnBindings.set(param.name.text, { kind: "valueVariable", name: param.name.text });
    } else {
      fnBindings.set(param.name.text, {
        kind: "number",
        value: { kind: "parameter", name: param.name.text }
      });
    }
  }

  const body = lowerBlockStatements(statement.body, fnBindings);
  if (body === undefined) {
    return undefined;
  }

  return {
    kind: "function",
    name: statement.name.text,
    parameters,
    body
  };
}

function parameterValueKind(parameter: ts.ParameterDeclaration): JsIrValueKind {
  if (parameter.type?.kind === ts.SyntaxKind.StringKeyword) {
    return "string";
  }
  if (parameter.type?.kind === ts.SyntaxKind.UnknownKeyword || parameter.type?.kind === ts.SyntaxKind.AnyKeyword) {
    return "value";
  }
  return "number";
}

function lowerCallStatement(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isIdentifier(expression.expression)) {
    return undefined;
  }

  if (expression.expression.text === "print") {
    return undefined;
  }

  const args = lowerCallArguments(expression.expression.text, expression.arguments, bindings);
  if (args === undefined) {
    return undefined;
  }

  return {
    kind: "call",
    name: expression.expression.text,
    arguments: args
  };
}

function lowerReturnStatement(
  statement: ts.ReturnStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!statement.expression) {
    return undefined;
  }

  const closure = lowerReturnedFunctionExpression(statement.expression, bindings);
  if (closure !== undefined) {
    return closure;
  }

  const stringExpression = lowerStringRuntimeExpression(statement.expression, bindings);
  if (stringExpression !== undefined) {
    return {
      kind: "returnString",
      expression: stringExpression
    };
  }

  const expression = lowerNumberExpression(statement.expression, bindings);
  if (expression !== undefined) {
    return {
      kind: "returnNumber",
      expression
    };
  }

  const valueExpression = lowerValueExpression(statement.expression, bindings);
  if (valueExpression === undefined) {
    return undefined;
  }

  return {
    kind: "returnValue",
    expression: valueExpression
  };
}

function lowerReturnedFunctionExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isFunctionExpression(expression) || !expression.name) {
    return undefined;
  }

  const parameters: string[] = [];
  const nestedBindings = new Map(bindings);
  for (const param of expression.parameters) {
    if (!ts.isIdentifier(param.name)) {
      return undefined;
    }
    parameters.push(param.name.text);
    nestedBindings.set(param.name.text, {
      kind: "number",
      value: { kind: "parameter", name: param.name.text }
    });
  }

  const body = lowerBlockStatements(expression.body, nestedBindings);
  if (body === undefined) {
    return undefined;
  }

  return {
    kind: "returnClosure",
    functionName: expression.name.text,
    parameters,
    captures: collectCapturedParameterNames(body, new Set(parameters), bindings),
    body
  };
}

function collectCapturedParameterNames(
  operations: readonly JsIrOperation[],
  localParameters: ReadonlySet<string>,
  outerBindings: ReadonlyMap<string, JsIrBindingValue>
): readonly string[] {
  const captures: string[] = [];
  const seen = new Set<string>();
  const visitNumber = (expression: JsIrNumberExpression): void => {
    if (expression.kind === "parameter" && !localParameters.has(expression.name) && outerBindings.has(expression.name) && !seen.has(expression.name)) {
      seen.add(expression.name);
      captures.push(expression.name);
      return;
    }
    if (expression.kind === "unary") {
      visitNumber(expression.value);
      return;
    }
    if (expression.kind === "binary") {
      visitNumber(expression.left);
      visitNumber(expression.right);
      return;
    }
    if (expression.kind === "call") {
      for (const arg of expression.arguments) {
        visitNumber(arg);
      }
      return;
    }
    if (expression.kind === "ternary") {
      visitNumber(expression.consequent);
      visitNumber(expression.alternate);
    }
  };

  for (const operation of operations) {
    if (operation.kind === "returnNumber") {
      visitNumber(operation.expression);
    }
  }

  return captures;
}

function lowerVariableBinding(
  statement: ts.VariableStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (statement.declarationList.declarations.length !== 1) {
    return undefined;
  }

  const [declaration] = statement.declarationList.declarations;
  if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
    return undefined;
  }

  const isConst = (statement.declarationList.flags & ts.NodeFlags.Const) !== 0;
  const isLet = (statement.declarationList.flags & ts.NodeFlags.Let) !== 0;

  if (isLet) {
    return lowerLetVariableBinding(declaration.name.text, declaration.initializer, bindings);
  }

  if (!isConst) {
    return undefined;
  }

  return lowerConstVariableBinding(
    declaration.name.text,
    declaration.initializer,
    bindings,
    declaration.type?.kind === ts.SyntaxKind.UnknownKeyword || declaration.type?.kind === ts.SyntaxKind.AnyKeyword
  );
}

function lowerLetVariableBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  const arrayLiteral = classifyArrayLiteral(initializer, bindings);
  if (arrayLiteral?.kind === "fixed") {
    return {
      kind: "arrayLiteral",
      name,
      elements: arrayLiteral.elements
    };
  }

  if (arrayLiteral?.kind === "runtime") {
    return {
      kind: "runtimeArrayLiteral",
      name,
      elements: arrayLiteral.elements
    };
  }

  const booleanValue = lowerConditionExpression(initializer, bindings);
  if (booleanValue !== undefined) {
    return {
      kind: "letBoolean",
      name,
      value: booleanValue
    };
  }

  const stringValue = lowerStringRuntimeExpression(initializer, bindings);
  if (stringValue !== undefined) {
    return {
      kind: "letString",
      name,
      value: stringValue
    };
  }

  const numberValue = lowerNumberExpression(initializer, bindings);
  if (numberValue === undefined) {
    return undefined;
  }

  return {
    kind: "letNumber",
    name,
    value: numberValue
  };
}

function lowerConstVariableBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  forceValue = false
): JsIrOperation | undefined {
  if (forceValue) {
    const value = lowerValueExpression(initializer, bindings);
    if (value === undefined) {
      return undefined;
    }
    return { kind: "constValue", name, value };
  }

  const aggregateValue = lowerConstAggregateBinding(name, initializer, bindings);
  if (aggregateValue !== undefined) {
    return aggregateValue;
  }

  const closureValue = lowerClosureFactoryCall(initializer, bindings);
  if (closureValue !== undefined) {
    return {
      kind: "constClosure",
      name,
      value: closureValue
    };
  }

  const stringValue = lowerStringExpression(initializer, bindings);
  if (stringValue !== undefined) {
    return {
      kind: "constString",
      name,
      value: stringValue
    };
  }

  const stringExpression = lowerStringRuntimeExpression(initializer, bindings);
  if (stringExpression !== undefined) {
    return {
      kind: "constStringExpression",
      name,
      value: stringExpression
    };
  }

  const numberValue = lowerNumberExpression(initializer, bindings);
  if (numberValue !== undefined) {
    return {
      kind: "constNumber",
      name,
      value: numberValue
    };
  }

  const booleanValue = lowerBooleanExpression(initializer, bindings);
  if (booleanValue !== undefined) {
    return {
      kind: "constBoolean",
      name,
      value: booleanValue
    };
  }

  const booleanCondition = lowerConditionExpression(initializer, bindings);
  if (booleanCondition !== undefined) {
    return {
      kind: "constBooleanExpression",
      name,
      value: booleanCondition
    };
  }

  return undefined;
}

function lowerConstAggregateBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  const arrayLiteral = classifyArrayLiteral(initializer, bindings);
  if (arrayLiteral?.kind === "fixed") {
    return { kind: "arrayLiteral", name, elements: arrayLiteral.elements };
  }
  if (arrayLiteral?.kind === "runtime") {
    return { kind: "runtimeArrayLiteral", name, elements: arrayLiteral.elements };
  }
  const objectLiteral = classifyObjectLiteral(initializer, bindings);
  if (objectLiteral?.kind === "fixed") {
    return { kind: "objectLiteral", name, value: objectLiteral.value, needsRuntimeShadow: false };
  }
  if (objectLiteral?.kind === "runtime") {
    return { kind: "runtimeObjectLiteral", name, value: objectLiteral.value };
  }
  return undefined;
}

function lowerAssignmentStatement(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isBinaryExpression(expression) || expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken) {
    return undefined;
  }

  if (ts.isElementAccessExpression(expression.left)) {
    return lowerElementAssignment(expression.left, expression.right, bindings);
  }

  if (ts.isPropertyAccessExpression(expression.left)) {
    return lowerObjectPropertyAssignment(expression.left, expression.right, bindings);
  }

  if (!ts.isIdentifier(expression.left)) {
    return undefined;
  }

  const binding = bindings.get(expression.left.text);
  if (binding?.kind === "stringVariable") {
    const value = lowerStringRuntimeExpression(expression.right, bindings);
    if (value === undefined) {
      return undefined;
    }

    return {
      kind: "assignString",
      name: expression.left.text,
      value
    };
  }

  if (binding?.kind === "booleanVariable") {
    const value = lowerConditionExpression(expression.right, bindings);
    if (value === undefined) {
      return undefined;
    }

    return {
      kind: "assignBoolean",
      name: expression.left.text,
      value
    };
  }

  if (binding?.kind !== "number" || binding.value.kind !== "variable") {
    return undefined;
  }

  const value = lowerNumberExpression(expression.right, bindings);
  if (value === undefined) {
    return undefined;
  }

  return {
    kind: "assignNumber",
    name: expression.left.text,
    value
  };
}

function lowerElementAssignment(
  left: ts.ElementAccessExpression,
  right: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  const objectAccess = lowerObjectAccessPath(left, bindings);
  if (objectAccess !== undefined) {
    const objectValue = lowerNumberExpression(right, bindings);
    if (objectValue === undefined) {
      return undefined;
    }
    return { kind: "objectStore", objectName: objectAccess.objectName, path: objectAccess.path, value: objectValue };
  }

  if (!ts.isIdentifier(left.expression)) {
    return undefined;
  }

  const arrayBinding = bindings.get(left.expression.text);
  const index = lowerNumberExpression(left.argumentExpression, bindings);
  const value = lowerNumberExpression(right, bindings);
  if (arrayBinding?.kind === "array" && index !== undefined && value !== undefined) {
    return { kind: "arrayStore", arrayName: left.expression.text, index, value };
  }

  const objectStore = lowerObjectElementAssignment(left, right, arrayBinding, bindings);
  if (objectStore !== undefined) {
    return objectStore;
  }

  const runtimeValue = lowerValueExpression(right, bindings);
  if (arrayBinding?.kind === "runtimeArray" && index !== undefined && runtimeValue !== undefined) {
    return { kind: "runtimeArrayStore", arrayName: left.expression.text, index, value: runtimeValue };
  }

  return undefined;
}

function lowerObjectElementAssignment(
  left: ts.ElementAccessExpression,
  right: ts.Expression,
  binding: JsIrBindingValue | undefined,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isIdentifier(left.expression)) {
    return undefined;
  }

  if (binding?.kind === "object") {
    const key = lowerStringExpression(left.argumentExpression, bindings);
    const objectValue = lowerNumberExpression(right, bindings);
    if (key !== undefined && objectValue !== undefined && objectPathExists(binding.value, [key])) {
      return { kind: "objectStore", objectName: left.expression.text, path: [key], value: objectValue };
    }
    return undefined;
  }

  if (binding?.kind !== "runtimeObject") {
    return undefined;
  }

  const key = lowerStringRuntimeExpression(left.argumentExpression, bindings);
  const runtimeValue = lowerValueExpression(right, bindings);
  if (key === undefined || runtimeValue === undefined) {
    return undefined;
  }
  return { kind: "runtimeObjectStore", objectName: left.expression.text, key, value: runtimeValue };
}

function lowerObjectPropertyAssignment(
  left: ts.PropertyAccessExpression,
  right: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (ts.isIdentifier(left.expression)) {
    const binding = bindings.get(left.expression.text);
    if (binding?.kind === "runtimeObject") {
      const value = lowerValueExpression(right, bindings);
      if (value !== undefined) {
        return { kind: "runtimeObjectStore", objectName: left.expression.text, key: { kind: "literal", value: left.name.text }, value };
      }
    }
  }

  const access = lowerObjectAccessPath(left, bindings);
  const value = lowerNumberExpression(right, bindings);
  if (access === undefined || value === undefined) {
    return undefined;
  }

  return { kind: "objectStore", objectName: access.objectName, path: access.path, value };
}

function lowerClosureFactoryCall(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrClosureValue | undefined {
  if (!ts.isCallExpression(expression) || !ts.isIdentifier(expression.expression)) {
    return undefined;
  }

  const factory = bindings.get(expression.expression.text);
  if (factory?.kind !== "closureFactory") {
    return undefined;
  }
  if (expression.arguments.length !== factory.factoryParameters.length) {
    return undefined;
  }

  const factoryArgs = new Map<string, JsIrNumberExpression>();
  for (let i = 0; i < factory.factoryParameters.length; i++) {
    const argument = expression.arguments[i];
    const lowered = lowerNumberExpression(argument, bindings);
    if (lowered === undefined) {
      return undefined;
    }
    factoryArgs.set(factory.factoryParameters[i], lowered);
  }

  const captures: JsIrNumberExpression[] = [];
  for (const captureName of factory.captureNames) {
    const capture = factoryArgs.get(captureName);
    if (capture === undefined) {
      return undefined;
    }
    captures.push(capture);
  }

  return {
    functionName: factory.functionName,
    captures
  };
}

function lowerStringExpression(expression: ts.Expression, bindings: ReadonlyMap<string, JsIrBindingValue>): string | undefined {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }

  if (ts.isIdentifier(expression)) {
    const binding = bindings.get(expression.text);
    if (binding?.kind !== "string") {
      return undefined;
    }
    return binding.value;
  }

  if (!ts.isBinaryExpression(expression) || expression.operatorToken.kind !== ts.SyntaxKind.PlusToken) {
    return undefined;
  }

  const left = lowerStringExpression(expression.left, bindings);
  const right = lowerStringExpression(expression.right, bindings);
  if (left === undefined || right === undefined) {
    return undefined;
  }

  return left + right;
}

function lowerStringRuntimeExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrStringExpression | undefined {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return { kind: "literal", value: expression.text };
  }

  if (ts.isIdentifier(expression)) {
    const binding = bindings.get(expression.text);
    if (binding?.kind === "string") {
      return { kind: "literal", value: binding.value };
    }
    if (binding?.kind === "stringExpression") {
      return binding.value;
    }
    if (binding?.kind === "stringVariable") {
      return { kind: "variable", name: binding.name };
    }
  }

  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return lowerStringConcatExpression(expression, bindings);
  }

  if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text !== "print") {
    return lowerStringCallExpression(expression, bindings);
  }

  if (!ts.isConditionalExpression(expression)) {
    return undefined;
  }

  const condition = lowerConditionExpression(expression.condition, bindings);
  const consequent = lowerStringRuntimeExpression(expression.whenTrue, bindings);
  const alternate = lowerStringRuntimeExpression(expression.whenFalse, bindings);
  if (condition === undefined || consequent === undefined || alternate === undefined) {
    return undefined;
  }

  return {
    kind: "ternary",
    condition,
    consequent,
    alternate
  };
}

function lowerStringConcatExpression(
  expression: ts.BinaryExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrStringExpression | undefined {
  const left = lowerStringRuntimeExpression(expression.left, bindings);
  const right = lowerStringRuntimeExpression(expression.right, bindings);
  if (left === undefined || right === undefined) {
    return undefined;
  }
  return { kind: "concat", left, right };
}

function lowerStringCallExpression(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrStringExpression | undefined {
  if (!ts.isIdentifier(expression.expression)) {
    return undefined;
  }
  const callee = bindings.get(expression.expression.text);
  if (callee?.kind !== "function" || callee.returnKind !== "string") {
    return undefined;
  }
  const args = lowerCallArguments(expression.expression.text, expression.arguments, bindings);
  if (args === undefined) {
    return undefined;
  }
  return { kind: "call", name: expression.expression.text, arguments: args };
}

function lowerBooleanExpression(expression: ts.Expression, bindings: ReadonlyMap<string, JsIrBindingValue>): boolean | undefined {
  if (expression.kind === ts.SyntaxKind.TrueKeyword || expression.kind === ts.SyntaxKind.FalseKeyword) {
    return expression.kind === ts.SyntaxKind.TrueKeyword;
  }

  if (ts.isIdentifier(expression)) {
    const binding = bindings.get(expression.text);
    if (binding?.kind === "boolean") {
      return binding.value;
    }
  }

  return undefined;
}

function lowerConditionExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {
  if (ts.isPrefixUnaryExpression(expression) && expression.operator === ts.SyntaxKind.ExclamationToken) {
    const condition = lowerConditionExpression(expression.operand, bindings);
    if (condition === undefined) {
      return undefined;
    }

    return {
      kind: "negate",
      condition
    };
  }

  if (ts.isBinaryExpression(expression)) {
    const logicalCondition = lowerLogicalConditionExpression(expression, bindings);
    if (logicalCondition !== undefined) {
      return logicalCondition;
    }
  }

  if (ts.isIdentifier(expression)) {
    const binding = bindings.get(expression.text);
    if (binding?.kind === "booleanExpression") {
      return binding.value;
    }
    if (binding?.kind === "booleanVariable") {
      return { kind: "booleanVariable", name: binding.name };
    }
  }

  const booleanValue = lowerBooleanExpression(expression, bindings);
  if (booleanValue !== undefined) {
    return {
      kind: "boolean",
      value: booleanValue
    };
  }

  if (!ts.isBinaryExpression(expression)) {
    return undefined;
  }

  return lowerComparisonConditionExpression(expression, bindings);
}

function lowerComparisonConditionExpression(
  expression: ts.BinaryExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {

  const operator = lowerComparisonOperator(expression.operatorToken.kind);
  if (operator === undefined) {
    return undefined;
  }

  const stringComparison = lowerStringComparisonExpression(expression, operator, bindings);
  if (stringComparison !== undefined) {
    return stringComparison;
  }

  const booleanComparison = lowerBooleanComparisonExpression(expression, operator, bindings);
  if (booleanComparison !== undefined) {
    return booleanComparison;
  }

  const left = lowerNumberExpression(expression.left, bindings);
  const right = lowerNumberExpression(expression.right, bindings);
  if (left !== undefined && right !== undefined) {
    return {
      kind: "numberComparison",
      operator,
      left,
      right
    };
  }

  return lowerValueComparisonExpression(expression, operator, bindings);
}

function lowerStringComparisonExpression(
  expression: ts.BinaryExpression,
  operator: "===" | "!==" | "<" | "<=" | ">" | ">=",
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {
  if (operator !== "===" && operator !== "!==") {
    return undefined;
  }

  const left = lowerStringExpression(expression.left, bindings);
  const right = lowerStringExpression(expression.right, bindings);
  if (left !== undefined && right !== undefined) {
    let value = left === right;
    if (operator === "!==") {
      value = !value;
    }

    return { kind: "boolean", value };
  }

  const runtimeLeft = lowerStringRuntimeExpression(expression.left, bindings);
  const runtimeRight = lowerStringRuntimeExpression(expression.right, bindings);
  if (runtimeLeft === undefined || runtimeRight === undefined) {
    return undefined;
  }

  return { kind: "stringComparison", operator, left: runtimeLeft, right: runtimeRight };
}

function lowerBooleanComparisonExpression(
  expression: ts.BinaryExpression,
  operator: "===" | "!==" | "<" | "<=" | ">" | ">=",
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

function lowerBooleanOperandExpression(
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

function lowerValueComparisonExpression(
  expression: ts.BinaryExpression,
  operator: "===" | "!==" | "<" | "<=" | ">" | ">=",
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {
  if (operator !== "===" && operator !== "!==") {
    return undefined;
  }

  const left = lowerValueExpression(expression.left, bindings);
  const right = lowerValueExpression(expression.right, bindings);
  if (left === undefined || right === undefined) {
    return undefined;
  }

  return { kind: "valueComparison", operator, left, right };
}

function lowerValueExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  const directValue = lowerDirectValueExpression(expression, bindings);
  if (directValue !== undefined) {
    return directValue;
  }

  const aggregateValue = lowerAggregateValueExpression(expression, bindings);
  if (aggregateValue !== undefined) {
    return aggregateValue;
  }

  const stringValue = lowerStringRuntimeExpression(expression, bindings);
  if (stringValue !== undefined) {
    return { kind: "string", value: stringValue };
  }

  const numberValue = lowerNumberExpression(expression, bindings);
  if (numberValue !== undefined) {
    return { kind: "number", value: numberValue };
  }

  const booleanValue = lowerConditionExpression(expression, bindings);
  if (booleanValue !== undefined) {
    return { kind: "boolean", value: booleanValue };
  }

  return undefined;
}

function lowerAggregateValueExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  if (ts.isElementAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
    const binding = bindings.get(expression.expression.text);
    if (binding?.kind === "runtimeArray") {
      const index = lowerNumberExpression(expression.argumentExpression, bindings);
      if (index !== undefined) {
        return { kind: "arrayAccess", arrayName: expression.expression.text, index };
      }
    }
    if (binding?.kind === "object" || binding?.kind === "runtimeObject") {
      if (binding.kind === "object" && objectHasNestedFields(binding.value)) {
        return undefined;
      }
      const key = lowerStringRuntimeExpression(expression.argumentExpression, bindings);
      if (key !== undefined) {
        return { kind: "objectDynamicAccess", objectName: expression.expression.text, key };
      }
    }
  }

  if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
    const binding = bindings.get(expression.expression.text);
    if (binding?.kind === "runtimeObject") {
      return { kind: "objectDynamicAccess", objectName: expression.expression.text, key: { kind: "literal", value: expression.name.text } };
    }
  }

  return undefined;
}

function lowerDirectValueExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  if (expression.kind === ts.SyntaxKind.UndefinedKeyword || (ts.isIdentifier(expression) && expression.text === "undefined")) {
    return { kind: "undefined" };
  }

  if (ts.isIdentifier(expression)) {
    const binding = bindings.get(expression.text);
    if (binding?.kind === "value") {
      return binding.value;
    }
    if (binding?.kind === "valueVariable") {
      return { kind: "variable", name: binding.name };
    }
  }

  if (ts.isConditionalExpression(expression)) {
    return lowerValueConditionalExpression(expression, bindings);
  }

  if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text !== "print") {
    return lowerValueCallExpression(expression, bindings);
  }

  return undefined;
}

function lowerValueConditionalExpression(
  expression: ts.ConditionalExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  const condition = lowerConditionExpression(expression.condition, bindings);
  const consequent = lowerValueExpression(expression.whenTrue, bindings);
  const alternate = lowerValueExpression(expression.whenFalse, bindings);
  if (condition === undefined || consequent === undefined || alternate === undefined) {
    return undefined;
  }
  return { kind: "ternary", condition, consequent, alternate };
}

function lowerValueCallExpression(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  if (!ts.isIdentifier(expression.expression)) {
    return undefined;
  }
  const callee = bindings.get(expression.expression.text);
  if (callee?.kind !== "function" || callee.returnKind !== "value") {
    return undefined;
  }
  const args = lowerCallArguments(expression.expression.text, expression.arguments, bindings);
  if (args === undefined) {
    return undefined;
  }
  return { kind: "call", name: expression.expression.text, arguments: args };
}

function lowerLogicalConditionExpression(
  expression: ts.BinaryExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {
  if (
    expression.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken &&
    expression.operatorToken.kind !== ts.SyntaxKind.BarBarToken
  ) {
    return undefined;
  }

  const left = lowerConditionExpression(expression.left, bindings);
  const right = lowerConditionExpression(expression.right, bindings);
  if (left === undefined || right === undefined) {
    return undefined;
  }

  if (expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    return { kind: "and", left, right };
  }

  return { kind: "or", left, right };
}

function lowerComparisonOperator(kind: ts.SyntaxKind): "===" | "!==" | "<" | "<=" | ">" | ">=" | undefined {
  switch (kind) {
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

function lowerNumberExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrNumberExpression | undefined {
  if (ts.isNumericLiteral(expression)) {
    return {
      kind: "literal",
      value: Number(expression.text)
    };
  }

  if (ts.isIdentifier(expression)) {
    const binding = bindings.get(expression.text);
    if (binding?.kind !== "number") {
      return undefined;
    }
    return binding.value;
  }

  if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text !== "print") {
    return lowerNumberCallExpression(expression, bindings);
  }

  const access = lowerNumberAccessExpression(expression, bindings);
  if (access !== undefined) {
    return access;
  }

  if (ts.isPrefixUnaryExpression(expression) && expression.operator === ts.SyntaxKind.MinusToken) {
    const value = lowerNumberExpression(expression.operand, bindings);
    if (value === undefined) {
      return undefined;
    }

    return {
      kind: "unary",
      operator: "negate",
      value
    };
  }

  if (ts.isConditionalExpression(expression)) {
    return lowerNumberConditionalExpression(expression, bindings);
  }

  if (!ts.isBinaryExpression(expression)) {
    return undefined;
  }

  return lowerNumberBinaryExpression(expression, bindings);
}

function lowerNumberAccessExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrNumberExpression | undefined {
  if (ts.isElementAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
    const binding = bindings.get(expression.expression.text);
    const index = lowerNumberExpression(expression.argumentExpression, bindings);
    if (binding?.kind === "array" && index !== undefined) {
      return { kind: "arrayAccess", arrayName: expression.expression.text, index };
    }

    const access = lowerObjectAccessPath(expression, bindings);
    if (access !== undefined) {
      return { kind: "objectAccess", objectName: access.objectName, path: access.path };
    }
  }

  if (ts.isPropertyAccessExpression(expression)) {
    const access = lowerObjectAccessPath(expression, bindings);
    if (access !== undefined) {
      return { kind: "objectAccess", objectName: access.objectName, path: access.path };
    }
    if (expression.name.text === "length" && ts.isIdentifier(expression.expression)) {
      const binding = bindings.get(expression.expression.text);
      if (binding?.kind === "array" || binding?.kind === "runtimeArray") {
        return { kind: "arrayLength", arrayName: expression.expression.text };
      }
    }
  }

  return undefined;
}

function lowerNumberBinaryExpression(
  expression: ts.BinaryExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrNumberExpression | undefined {
  const left = lowerNumberExpression(expression.left, bindings);
  const right = lowerNumberExpression(expression.right, bindings);
  if (left === undefined || right === undefined) {
    return undefined;
  }

  const operator = lowerNumberOperator(expression.operatorToken.kind);
  if (operator === undefined) {
    return undefined;
  }

  return {
    kind: "binary",
    operator,
    left,
    right
  };
}

function lowerNumberConditionalExpression(
  expression: ts.ConditionalExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrNumberExpression | undefined {
  const condition = lowerConditionExpression(expression.condition, bindings);
  const consequent = lowerNumberExpression(expression.whenTrue, bindings);
  const alternate = lowerNumberExpression(expression.whenFalse, bindings);
  if (condition === undefined || consequent === undefined || alternate === undefined) {
    return undefined;
  }

  return {
    kind: "ternary",
    condition,
    consequent,
    alternate
  };
}

function lowerNumberCallExpression(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrNumberExpression | undefined {
  if (!ts.isIdentifier(expression.expression)) {
    return undefined;
  }

  const callee = bindings.get(expression.expression.text);
  const args: JsIrNumberExpression[] = [];
  let name = expression.expression.text;
  if (callee?.kind === "closure") {
    args.push(...callee.value.captures);
    name = callee.value.functionName;
  } else if (callee?.kind === "function" && (callee.returnKind === "string" || callee.returnKind === "value")) {
    return undefined;
  }

  const loweredArgs = lowerCallArguments(expression.expression.text, expression.arguments, bindings);
  if (loweredArgs === undefined) {
    return undefined;
  }
  for (const arg of loweredArgs) {
    if (arg.valueKind !== "number") {
      return undefined;
    }
    args.push(arg.value);
  }

  return { kind: "call", name, arguments: args };
}

function lowerCallArguments(
  name: string,
  args: ts.NodeArray<ts.Expression>,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): readonly JsIrCallArgument[] | undefined {
  const callee = bindings.get(name);
  if (callee?.kind === "function") {
    return lowerTypedCallArguments(callee.parameters, args, bindings);
  }

  const lowered: JsIrCallArgument[] = [];
  for (const arg of args) {
    const value = lowerNumberExpression(arg, bindings);
    if (value === undefined) {
      return undefined;
    }
    lowered.push({ valueKind: "number", value });
  }
  return lowered;
}

function lowerTypedCallArguments(
  parameters: readonly JsIrFunctionParameter[],
  args: ts.NodeArray<ts.Expression>,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): readonly JsIrCallArgument[] | undefined {
  if (parameters.length !== args.length) {
    return undefined;
  }
  const lowered: JsIrCallArgument[] = [];
  for (let i = 0; i < parameters.length; i++) {
    const parameter = parameters[i];
    const arg = args[i];
    const value = lowerTypedCallArgument(parameter, arg, bindings);
    if (value === undefined) {
      return undefined;
    }
    lowered.push(value);
  }
  return lowered;
}

function lowerTypedCallArgument(
  parameter: JsIrFunctionParameter,
  arg: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCallArgument | undefined {
  if (parameter.valueKind === "string") {
    const value = lowerStringRuntimeExpression(arg, bindings);
    if (value === undefined) {
      return undefined;
    }
    return { valueKind: "string", value };
  }
  if (parameter.valueKind === "value") {
    const value = lowerValueExpression(arg, bindings);
    if (value === undefined) {
      return undefined;
    }
    return { valueKind: "value", value };
  }
  const value = lowerNumberExpression(arg, bindings);
  if (value === undefined) {
    return undefined;
  }
  return { valueKind: "number", value };
}

function lowerNumberOperator(kind: ts.SyntaxKind): JsIrNumberOperator | undefined {
  switch (kind) {
    case ts.SyntaxKind.PlusToken: {
      return "add";
    }
    case ts.SyntaxKind.MinusToken: {
      return "subtract";
    }
    case ts.SyntaxKind.AsteriskToken: {
      return "multiply";
    }
    case ts.SyntaxKind.SlashToken: {
      return "divide";
    }
    default: {
      return undefined;
    }
  }
}

function lowerArrayLiteralExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): readonly JsIrNumberExpression[] | undefined {
  if (!ts.isArrayLiteralExpression(expression)) {
    return undefined;
  }

  const elements: JsIrNumberExpression[] = [];
  for (const element of expression.elements) {
    const value = lowerNumberExpression(element, bindings);
    if (value === undefined) {
      return undefined;
    }
    elements.push(value);
  }
  return elements;
}

function classifyArrayLiteral(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): ArrayLiteralClassification | undefined {
  const fixed = lowerArrayLiteralExpression(expression, bindings);
  if (fixed !== undefined) {
    return { kind: "fixed", elements: fixed };
  }

  const runtime = lowerRuntimeArrayLiteralExpression(expression, bindings);
  if (runtime !== undefined) {
    return { kind: "runtime", elements: runtime };
  }

  return undefined;
}

function lowerRuntimeArrayLiteralExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): readonly JsIrValueExpression[] | undefined {
  if (!ts.isArrayLiteralExpression(expression)) {
    return undefined;
  }

  const elements: JsIrValueExpression[] = [];
  let needsRuntimeArray = false;
  for (const element of expression.elements) {
    if (ts.isSpreadElement(element)) {
      return undefined;
    }
    if (ts.isOmittedExpression(element)) {
      elements.push({ kind: "undefined" });
      needsRuntimeArray = true;
      continue;
    }
    const number = lowerNumberExpression(element, bindings);
    const value = lowerValueExpression(element, bindings);
    if (value === undefined) {
      return undefined;
    }
    if (number === undefined) {
      needsRuntimeArray = true;
    }
    elements.push(value);
  }

  if (!needsRuntimeArray) {
    return undefined;
  }
  return elements;
}

function classifyObjectLiteral(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): ObjectLiteralClassification | undefined {
  const fixed = lowerObjectLiteralExpression(expression, bindings);
  if (fixed !== undefined) {
    return { kind: "fixed", value: fixed };
  }

  const runtime = lowerRuntimeObjectLiteralExpression(expression, bindings);
  if (runtime !== undefined) {
    return { kind: "runtime", value: runtime };
  }

  return undefined;
}

function lowerObjectLiteralExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrObjectValue | undefined {
  if (!ts.isObjectLiteralExpression(expression)) {
    return undefined;
  }

  const fields: JsIrObjectField[] = [];
  for (const property of expression.properties) {
    if (!ts.isPropertyAssignment(property)) {
      return undefined;
    }
    const fieldName = lowerObjectFieldName(property.name);
    if (fieldName === undefined) {
      return undefined;
    }
    const objectValue = lowerObjectLiteralExpression(property.initializer, bindings);
    if (objectValue !== undefined) {
      fields.push({ name: fieldName, value: { kind: "object", value: objectValue } });
      continue;
    }
    const numberValue = lowerNumberExpression(property.initializer, bindings);
    if (numberValue === undefined) {
      return undefined;
    }
    fields.push({ name: fieldName, value: { kind: "number", value: numberValue } });
  }
  return { fields };
}

function lowerRuntimeObjectLiteralExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrRuntimeObjectValue | undefined {
  if (!ts.isObjectLiteralExpression(expression)) {
    return undefined;
  }

  const fields: JsIrRuntimeObjectField[] = [];
  for (const property of expression.properties) {
    if (!ts.isPropertyAssignment(property)) {
      return undefined;
    }
    const key = lowerRuntimeObjectFieldName(property.name, bindings);
    const value = lowerValueExpression(property.initializer, bindings);
    if (key === undefined || value === undefined) {
      return undefined;
    }
    fields.push({ key, value });
  }
  return { fields };
}

function lowerRuntimeObjectFieldName(
  name: ts.PropertyName,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrStringExpression | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
    return { kind: "literal", value: name.text };
  }
  if (!ts.isComputedPropertyName(name)) {
    return undefined;
  }
  return lowerStringRuntimeExpression(name.expression, bindings);
}

function lowerObjectFieldName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
    return name.text;
  }
  return undefined;
}

function unsupportedStatementMessage(statement: ts.Statement): string {
  if (ts.isVariableStatement(statement)) {
    const [declaration] = statement.declarationList.declarations;
    if (declaration.initializer !== undefined) {
      const message = unsupportedExpressionMessage(declaration.initializer);
      if (message !== undefined) {
        return message;
      }
    }
  }

  if (ts.isFunctionDeclaration(statement)) {
    if (statement.parameters.some((parameter) => parameter.type?.kind === ts.SyntaxKind.StringKeyword)) {
      return "String parameters in function declarations are not supported by the current runtime string ABI";
    }
    if (statement.body?.statements.some((bodyStatement) => ts.isReturnStatement(bodyStatement) && bodyStatement.expression !== undefined && unsupportedStringExpression(bodyStatement.expression))) {
      return "String returns from functions are not supported by the current runtime string ABI";
    }
  }

  if (ts.isExpressionStatement(statement)) {
    const message = unsupportedExpressionMessage(statement.expression);
    if (message !== undefined) {
      return message;
    }
  }

  return "Only top-level const string, number, or boolean bindings, print calls, and if statements are supported by the current lowering slice";
}

function unsupportedExpressionMessage(expression: ts.Expression): string | undefined {
  if (ts.isArrayLiteralExpression(expression)) {
    return unsupportedArrayLiteralMessage(expression);
  }
  if (ts.isObjectLiteralExpression(expression)) {
    return unsupportedObjectLiteralMessage(expression);
  }
  if (unsupportedStringExpression(expression)) {
    return "Unsupported string expression in the current runtime string lowering slice";
  }
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    return unsupportedExpressionMessage(expression.right);
  }
  if (ts.isCallExpression(expression)) {
    for (const argument of expression.arguments) {
      const message = unsupportedExpressionMessage(argument);
      if (message !== undefined) {
        return message;
      }
    }
  }
  if (ts.isElementAccessExpression(expression) && !ts.isStringLiteral(expression.argumentExpression)) {
    if (containsNestedObjectElementAccess(expression)) {
      return "Dynamic computed object keys on nested known-shape objects are not supported yet";
    }
    return "Dynamic computed object keys are not supported by known-shape numeric objects";
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
    return unsupportedStringExpression(expression.left) || unsupportedStringExpression(expression.right);
  }
  if (ts.isConditionalExpression(expression)) {
    return unsupportedStringExpression(expression.whenTrue) || unsupportedStringExpression(expression.whenFalse);
  }
  return false;
}

function lowerObjectAccessPath(
  expression: ts.PropertyAccessExpression | ts.ElementAccessExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): { readonly objectName: string; readonly path: readonly string[] } | undefined {
  const names: string[] = [];
  let current: ts.Expression = expression;
  while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    if (ts.isPropertyAccessExpression(current)) {
      names.unshift(current.name.text);
      current = current.expression;
      continue;
    }
    if (!ts.isStringLiteral(current.argumentExpression)) {
      return undefined;
    }
    names.unshift(current.argumentExpression.text);
    current = current.expression;
  }

  if (!ts.isIdentifier(current)) {
    return undefined;
  }

  const binding = bindings.get(current.text);
  if (binding?.kind !== "object" || !objectPathExists(binding.value, names)) {
    return undefined;
  }

  return { objectName: current.text, path: names };
}

function objectPathExists(value: JsIrObjectValue, path: readonly string[]): boolean {
  let current: JsIrObjectValue = value;
  for (let i = 0; i < path.length; i++) {
    const field = current.fields.find((item) => item.name === path[i]);
    if (field === undefined) {
      return false;
    }
    if (i === path.length - 1) {
      return field.value.kind === "number";
    }
    if (field.value.kind !== "object") {
      return false;
    }
    current = field.value.value;
  }
  return false;
}

function objectHasNestedFields(value: JsIrObjectValue): boolean {
  return value.fields.some((field) => field.value.kind === "object");
}

export const lowerToJsIr = (
  entry: string,
  sourceFiles: readonly ts.SourceFile[]
): Effect.Effect<JsIrResult, never, Diagnostics> =>
  Effect.gen(function* lowerToJsIrEffect() {
    const diagnostics = yield* Diagnostics;
    const allDiagnostics: CompilerDiagnostic[] = [];
    const modules = sourceFiles.map((sourceFile) => {
      const lowered = lowerStatements(sourceFile);
      allDiagnostics.push(...lowered.diagnostics);
      return {
        fileName: sourceFile.fileName,
        statementCount: sourceFile.statements.length,
        operations: lowered.operations
      };
    });
    yield* Effect.forEach(allDiagnostics, (diagnostic) => diagnostics.add(diagnostic), { discard: true });
    return {
      module: {
        entry,
        modules
      }
    };
  });
