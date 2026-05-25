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
  const booleanBindings = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (isNonExecutableDeclaration(statement)) {
      continue;
    }

    const operation = lowerStatement(statement, stringBindings, numberBindings, booleanBindings);
    if (operation) {
      operations.push(operation);
      if (operation.kind === "constString") {
        stringBindings.set(operation.name, operation.value);
      }
      if (operation.kind === "constNumber") {
        numberBindings.set(operation.name, operation.value);
      }
      if (operation.kind === "constBoolean") {
        booleanBindings.add(operation.name);
      }
      continue;
    }

    diagnostics.push({
      code: "TSCN1002",
      category: "error",
      message: "Only top-level const string, number, or boolean bindings and print calls are supported by the current lowering slice",
      span: sourceSpan(sourceFile, statement.getStart(sourceFile))
    });
  }

  return operations;
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
  booleanBindings: ReadonlySet<string>
): JsIrOperation | undefined {
  if (ts.isVariableStatement(statement)) {
    return lowerConstBinding(statement, stringBindings, numberBindings);
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

function lowerConstBinding(
  statement: ts.VariableStatement,
  stringBindings: ReadonlyMap<string, string>,
  numberBindings: ReadonlyMap<string, number>
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

  if (declaration.initializer.kind === ts.SyntaxKind.TrueKeyword || declaration.initializer.kind === ts.SyntaxKind.FalseKeyword) {
    return {
      kind: "constBoolean",
      name: declaration.name.text,
      value: declaration.initializer.kind === ts.SyntaxKind.TrueKeyword
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
