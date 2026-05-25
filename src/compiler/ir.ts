import ts from "typescript";
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

export type JsIrOperation =
  | {
      readonly kind: "constNumber";
      readonly name: string;
      readonly value: number;
    }
  | {
      readonly kind: "constString";
      readonly name: string;
      readonly value: string;
    }
  | {
      readonly kind: "constBoolean";
      readonly name: string;
      readonly value: boolean;
    }
  | {
      readonly kind: "printString";
      readonly value: string;
    }
  | {
      readonly kind: "printIdentifier";
      readonly name: string;
    }
  | {
      readonly kind: "printNumber";
      readonly value: number;
    }
  | {
      readonly kind: "printBoolean";
      readonly value: boolean;
    }
  | {
      readonly kind: "if";
      readonly condition: boolean;
      readonly thenOperations: readonly JsIrOperation[];
      readonly elseOperations: readonly JsIrOperation[];
    };

export type JsIrResult = {
  readonly module: JsIrModule;
  readonly diagnostics: readonly CompilerDiagnostic[];
};

const sourceSpan = (sourceFile: ts.SourceFile, position: number) => {
  const lineAndCharacter = sourceFile.getLineAndCharacterOfPosition(position);

  return {
    fileName: sourceFile.fileName,
    line: lineAndCharacter.line + 1,
    column: lineAndCharacter.character + 1
  };
};

function lowerStatements(
  sourceFile: ts.SourceFile,
  diagnostics: CompilerDiagnostic[]
): readonly JsIrOperation[] {
  const operations: JsIrOperation[] = [];
  const stringBindings = new Map<string, string>();
  const numberBindings = new Map<string, number>();
  const booleanBindings = new Map<string, boolean>();

  for (const statement of sourceFile.statements) {
    if (isNonExecutableDeclaration(statement)) {
      continue;
    }

    const operation = lowerStatement(statement, stringBindings, numberBindings, booleanBindings);
    if (operation) {
      operations.push(operation);
      updateBindings(operation, stringBindings, numberBindings, booleanBindings);
      continue;
    }

    diagnostics.push({
      code: "TSCN1002",
      category: "error",
      message: "Only top-level const string, number, or boolean bindings, print calls, and if statements are supported by the current lowering slice",
      span: sourceSpan(sourceFile, statement.getStart(sourceFile))
    });
  }

  return operations;
}

function updateBindings(
  operation: JsIrOperation,
  stringBindings: Map<string, string>,
  numberBindings: Map<string, number>,
  booleanBindings: Map<string, boolean>
): void {
  if (operation.kind === "constString") {
    stringBindings.set(operation.name, operation.value);
  }
  if (operation.kind === "constNumber") {
    numberBindings.set(operation.name, operation.value);
  }
  if (operation.kind === "constBoolean") {
    booleanBindings.set(operation.name, operation.value);
  }
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
  stringBindings: ReadonlyMap<string, string>,
  numberBindings: ReadonlyMap<string, number>,
  booleanBindings: ReadonlyMap<string, boolean>
): JsIrOperation | undefined {
  if (ts.isVariableStatement(statement)) {
    return lowerConstBinding(statement, stringBindings, numberBindings, booleanBindings);
  }

  if (ts.isIfStatement(statement)) {
    return lowerIfStatement(statement, stringBindings, numberBindings, booleanBindings);
  }

  if (!ts.isExpressionStatement(statement)) {
    return undefined;
  }

  const {expression} = statement;
  if (!ts.isCallExpression(expression) || !ts.isIdentifier(expression.expression)) {
    return undefined;
  }

  if (expression.expression.text !== "print" || expression.arguments.length !== 1) {
    return undefined;
  }

  const [argument] = expression.arguments;
  if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) {
    return {
      kind: "printString",
      value: argument.text
    };
  }

  const stringArgument = lowerStringExpression(argument, stringBindings);
  if (stringArgument !== undefined) {
    return {
      kind: "printString",
      value: stringArgument
    };
  }

  const numberArgument = lowerNumberExpression(argument, numberBindings);
  if (numberArgument !== undefined) {
    return {
      kind: "printNumber",
      value: numberArgument
    };
  }

  if (argument.kind === ts.SyntaxKind.TrueKeyword || argument.kind === ts.SyntaxKind.FalseKeyword) {
    return {
      kind: "printBoolean",
      value: argument.kind === ts.SyntaxKind.TrueKeyword
    };
  }

  if (
    ts.isIdentifier(argument) &&
    (stringBindings.has(argument.text) || numberBindings.has(argument.text) || booleanBindings.has(argument.text))
  ) {
    return {
      kind: "printIdentifier",
      name: argument.text
    };
  }

  return undefined;
}

function lowerIfStatement(
  statement: ts.IfStatement,
  stringBindings: ReadonlyMap<string, string>,
  numberBindings: ReadonlyMap<string, number>,
  booleanBindings: ReadonlyMap<string, boolean>
): JsIrOperation | undefined {
  const condition = lowerBooleanExpression(statement.expression, booleanBindings);
  if (condition === undefined || !ts.isBlock(statement.thenStatement)) {
    return undefined;
  }

  const thenOperations = lowerBlockStatements(statement.thenStatement, stringBindings, numberBindings, booleanBindings);
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

  const elseOperations = lowerBlockStatements(statement.elseStatement, stringBindings, numberBindings, booleanBindings);
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
  stringBindings: ReadonlyMap<string, string>,
  numberBindings: ReadonlyMap<string, number>,
  booleanBindings: ReadonlyMap<string, boolean>
): readonly JsIrOperation[] | undefined {
  const operations: JsIrOperation[] = [];
  const blockStringBindings = new Map(stringBindings);
  const blockNumberBindings = new Map(numberBindings);
  const blockBooleanBindings = new Map(booleanBindings);

  for (const statement of block.statements) {
    if (isNonExecutableDeclaration(statement)) {
      continue;
    }

    const operation = lowerStatement(statement, blockStringBindings, blockNumberBindings, blockBooleanBindings);
    if (!operation) {
      return undefined;
    }

    operations.push(operation);
    updateBindings(operation, blockStringBindings, blockNumberBindings, blockBooleanBindings);
  }

  return operations;
}

function lowerConstBinding(
  statement: ts.VariableStatement,
  stringBindings: ReadonlyMap<string, string>,
  numberBindings: ReadonlyMap<string, number>,
  booleanBindings: ReadonlyMap<string, boolean>
): JsIrOperation | undefined {
  if ((statement.declarationList.flags & ts.NodeFlags.Const) === 0 || statement.declarationList.declarations.length !== 1) {
    return undefined;
  }

  const [declaration] = statement.declarationList.declarations;
  if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
    return undefined;
  }

  const stringValue = lowerStringExpression(declaration.initializer, stringBindings);
  if (stringValue !== undefined) {
    return {
      kind: "constString",
      name: declaration.name.text,
      value: stringValue
    };
  }

  const numberValue = lowerNumberExpression(declaration.initializer, numberBindings);
  if (numberValue !== undefined) {
    return {
      kind: "constNumber",
      name: declaration.name.text,
      value: numberValue
    };
  }

  const booleanValue = lowerBooleanExpression(declaration.initializer, booleanBindings);
  if (booleanValue !== undefined) {
    return {
      kind: "constBoolean",
      name: declaration.name.text,
      value: booleanValue
    };
  }

  return undefined;
}

function lowerStringExpression(expression: ts.Expression, stringBindings: ReadonlyMap<string, string>): string | undefined {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }

  if (ts.isIdentifier(expression)) {
    return stringBindings.get(expression.text);
  }

  if (!ts.isBinaryExpression(expression) || expression.operatorToken.kind !== ts.SyntaxKind.PlusToken) {
    return undefined;
  }

  const left = lowerStringExpression(expression.left, stringBindings);
  const right = lowerStringExpression(expression.right, stringBindings);
  if (left === undefined || right === undefined) {
    return undefined;
  }

  return left + right;
}

function lowerBooleanExpression(expression: ts.Expression, booleanBindings: ReadonlyMap<string, boolean>): boolean | undefined {
  if (expression.kind === ts.SyntaxKind.TrueKeyword || expression.kind === ts.SyntaxKind.FalseKeyword) {
    return expression.kind === ts.SyntaxKind.TrueKeyword;
  }

  if (ts.isIdentifier(expression)) {
    return booleanBindings.get(expression.text);
  }

  return undefined;
}

function lowerNumberExpression(expression: ts.Expression, numberBindings: ReadonlyMap<string, number>): number | undefined {
  if (ts.isNumericLiteral(expression)) {
    return Number(expression.text);
  }

  if (ts.isIdentifier(expression)) {
    return numberBindings.get(expression.text);
  }

  if (!ts.isBinaryExpression(expression)) {
    return undefined;
  }

  const left = lowerNumberExpression(expression.left, numberBindings);
  const right = lowerNumberExpression(expression.right, numberBindings);
  if (left === undefined || right === undefined) {
    return undefined;
  }

  switch (expression.operatorToken.kind) {
    case ts.SyntaxKind.PlusToken: {
      return left + right;
    }
    case ts.SyntaxKind.MinusToken: {
      return left - right;
    }
    case ts.SyntaxKind.AsteriskToken: {
      return left * right;
    }
    case ts.SyntaxKind.SlashToken: {
      return left / right;
    }
    default: {
      return undefined;
    }
  }
}

export const lowerToJsIr = (entry: string, sourceFiles: readonly ts.SourceFile[]): JsIrResult => {
  const diagnostics: CompilerDiagnostic[] = [];

  return {
    module: {
      entry,
      modules: sourceFiles.map((sourceFile) => ({
        fileName: sourceFile.fileName,
        statementCount: sourceFile.statements.length,
        operations: lowerStatements(sourceFile, diagnostics)
      }))
    },
    diagnostics
  };
};
