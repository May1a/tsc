import path from "node:path";
import ts from "typescript";
import type { CompilerDiagnostic } from "./diagnostics.js";

export type FrontendResult = {
  readonly program: ts.Program;
  readonly sourceFiles: readonly ts.SourceFile[];
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

const defaultCompilerOptions = (): ts.ParsedCommandLine => ({
  options: {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    strict: true
  },
  fileNames: [],
  errors: []
});

const findTsConfig = (entry: string): string | undefined =>
  ts.findConfigFile(path.dirname(path.resolve(entry)), (fileName) => ts.sys.fileExists(fileName), "tsconfig.json");

const readTsConfig = (configFileName: string): ts.ParsedCommandLine => {
  const config = ts.readConfigFile(configFileName, (fileName) => ts.sys.readFile(fileName));
  if (config.error) {
    return defaultCompilerOptions();
  }

  return ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configFileName));
};

const tsDiagnosticsToCompiler = (diagnostics: readonly ts.Diagnostic[]): readonly CompilerDiagnostic[] =>
  diagnostics.map((diagnostic) => {
    let span;
    if (diagnostic.file && diagnostic.start !== undefined) {
      span = sourceSpan(diagnostic.file, diagnostic.start);
    }

    return {
      code: `TS${diagnostic.code}`,
      category: "error",
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      span
    };
  });

const rejectPackageImports = (sourceFiles: readonly ts.SourceFile[]): readonly CompilerDiagnostic[] => {
  const diagnostics: CompilerDiagnostic[] = [];

  for (const sourceFile of sourceFiles) {
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const specifier = node.moduleSpecifier.text;
        if (!specifier.startsWith(".") && !specifier.startsWith("/")) {
          diagnostics.push({
            code: "TSCN1001",
            category: "error",
            message: `NPM package imports are not supported yet: ${specifier}`,
            span: sourceSpan(sourceFile, node.moduleSpecifier.getStart(sourceFile))
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return diagnostics;
};

export const loadProgram = (entry: string): FrontendResult => {
  const config = findTsConfig(entry);
  let parsed = defaultCompilerOptions();
  if (config) {
    parsed = readTsConfig(config);
  }
  const program = ts.createProgram([path.resolve(entry)], parsed.options);
  const sourceFiles = program
    .getSourceFiles()
    .filter((sourceFile) => !sourceFile.isDeclarationFile && !sourceFile.fileName.includes("/node_modules/"));

  return {
    program,
    sourceFiles,
    diagnostics: [
      ...tsDiagnosticsToCompiler(program.getSyntacticDiagnostics()),
      ...tsDiagnosticsToCompiler(program.getSemanticDiagnostics()),
      ...rejectPackageImports(sourceFiles)
    ]
  };
};
