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
  const stringBindings = new Set<string>();
  const numberBindings = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (isNonExecutableDeclaration(statement)) {
      continue;
    }

    const operation = lowerStatement(statement, stringBindings, numberBindings);
    if (operation) {
      operations.push(operation);
      if (operation.kind === "constString") {
        stringBindings.add(operation.name);
      }
      if (operation.kind === "constNumber") {
        numberBindings.add(operation.name);
      }
      continue;
    }

    diagnostics.push({
      code: "TSCN1002",
      category: "error",
      message: "Only top-level const string or number bindings and print calls are supported by the current lowering slice",
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
  stringBindings: ReadonlySet<string>,
  numberBindings: ReadonlySet<string>
): JsIrOperation | undefined {
  if (ts.isVariableStatement(statement)) {
    return lowerConstBinding(statement);
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

  if (ts.isNumericLiteral(argument)) {
    return {
      kind: "printNumber",
      value: Number(argument.text)
    };
  }

  if (ts.isIdentifier(argument) && (stringBindings.has(argument.text) || numberBindings.has(argument.text))) {
    return {
      kind: "printIdentifier",
      name: argument.text
    };
  }

  return undefined;
}

function lowerConstBinding(statement: ts.VariableStatement): JsIrOperation | undefined {
  if ((statement.declarationList.flags & ts.NodeFlags.Const) === 0 || statement.declarationList.declarations.length !== 1) {
    return undefined;
  }

  const [declaration] = statement.declarationList.declarations;
  if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
    return undefined;
  }

  if (ts.isStringLiteral(declaration.initializer) || ts.isNoSubstitutionTemplateLiteral(declaration.initializer)) {
    return {
      kind: "constString",
      name: declaration.name.text,
      value: declaration.initializer.text
    };
  }

  if (ts.isNumericLiteral(declaration.initializer)) {
    return {
      kind: "constNumber",
      name: declaration.name.text,
      value: Number(declaration.initializer.text)
    };
  }

  return undefined;
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
