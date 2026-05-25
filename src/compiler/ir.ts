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
  const stringBindings = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (isNonExecutableDeclaration(statement)) {
      continue;
    }

    const operation = lowerStatement(statement, stringBindings);
    if (operation) {
      operations.push(operation);
      if (operation.kind === "constString") {
        stringBindings.add(operation.name);
      }
      continue;
    }

    diagnostics.push({
      code: "TSCN1002",
      category: "error",
      message: "Only top-level const string bindings and print calls are supported by the current lowering slice",
      span: sourceSpan(sourceFile, statement.getStart(sourceFile))
    });
  }

  return operations;
};

const isNonExecutableDeclaration = (statement: ts.Statement): boolean => {
  if (
    ts.isImportDeclaration(statement) ||
    ts.isImportEqualsDeclaration(statement) ||
    ts.isExportDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement)
  ) {
    return true;
  }

  return Boolean(ts.getCombinedModifierFlags(statement as unknown as ts.Declaration) & ts.ModifierFlags.Ambient);
};

const lowerStatement = (statement: ts.Statement, stringBindings: ReadonlySet<string>): JsIrOperation | undefined => {
  if (ts.isVariableStatement(statement)) {
    return lowerConstStringBinding(statement);
  }

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
  if (!argument) {
    return undefined;
  }

  if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) {
    return {
      kind: "printString",
      value: argument.text
    };
  }

  if (ts.isIdentifier(argument) && stringBindings.has(argument.text)) {
    return {
      kind: "printIdentifier",
      name: argument.text
    };
  }

  return undefined;
};

const lowerConstStringBinding = (statement: ts.VariableStatement): JsIrOperation | undefined => {
  if ((statement.declarationList.flags & ts.NodeFlags.Const) === 0 || statement.declarationList.declarations.length !== 1) {
    return undefined;
  }

  const [declaration] = statement.declarationList.declarations;
  if (!declaration || !ts.isIdentifier(declaration.name) || !declaration.initializer) {
    return undefined;
  }

  if (!ts.isStringLiteral(declaration.initializer) && !ts.isNoSubstitutionTemplateLiteral(declaration.initializer)) {
    return undefined;
  }

  return {
    kind: "constString",
    name: declaration.name.text,
    value: declaration.initializer.text
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
