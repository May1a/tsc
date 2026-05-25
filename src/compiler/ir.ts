import ts from "typescript";
import type { CompilerDiagnostic } from "./diagnostics.js";

export type JsIrModule = {
  readonly entry: string;
  readonly modules: ReadonlyArray<JsIrSourceModule>;
};

export type JsIrSourceModule = {
  readonly fileName: string;
  readonly statementCount: number;
  readonly operations: ReadonlyArray<JsIrOperation>;
};

export type JsIrOperation =
  | {
      readonly kind: "printString";
      readonly value: string;
    };

export type JsIrResult = {
  readonly module: JsIrModule;
  readonly diagnostics: ReadonlyArray<CompilerDiagnostic>;
};

export const lowerToJsIr = (entry: string, sourceFiles: ReadonlyArray<ts.SourceFile>): JsIrResult => {
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

const lowerStatements = (
  sourceFile: ts.SourceFile,
  diagnostics: CompilerDiagnostic[]
): ReadonlyArray<JsIrOperation> => {
  const operations: JsIrOperation[] = [];

  for (const statement of sourceFile.statements) {
    if (isAmbientDeclaration(statement)) {
      continue;
    }

    const operation = lowerStatement(statement);
    if (operation) {
      operations.push(operation);
      continue;
    }

    diagnostics.push({
      code: "TSCN1002",
      category: "error",
      message: "Only top-level print(\"literal\") statements are supported by the current lowering slice",
      span: sourceSpan(sourceFile, statement.getStart(sourceFile))
    });
  }

  return operations;
};

const isAmbientDeclaration = (statement: ts.Statement): boolean =>
  Boolean(ts.getCombinedModifierFlags(statement as unknown as ts.Declaration) & ts.ModifierFlags.Ambient);

const lowerStatement = (statement: ts.Statement): JsIrOperation | undefined => {
  if (!ts.isExpressionStatement(statement)) {
    return undefined;
  }

  const expression = statement.expression;
  if (!ts.isCallExpression(expression) || !ts.isIdentifier(expression.expression)) {
    return undefined;
  }

  if (expression.expression.text !== "print" || expression.arguments.length !== 1) {
    return undefined;
  }

  const [argument] = expression.arguments;
  if (!argument || (!ts.isStringLiteral(argument) && !ts.isNoSubstitutionTemplateLiteral(argument))) {
    return undefined;
  }

  return {
    kind: "printString",
    value: argument.text
  };
};

const sourceSpan = (sourceFile: ts.SourceFile, position: number) => {
  const lineAndCharacter = sourceFile.getLineAndCharacterOfPosition(position);

  return {
    fileName: sourceFile.fileName,
    line: lineAndCharacter.line + 1,
    column: lineAndCharacter.character + 1
  };
};
