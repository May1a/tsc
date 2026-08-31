import { FileSystem, Path } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import { Effect } from "effect";
import ts from "typescript";
import { Diagnostics } from "./diagnostics-service.js";
import type { CompilerDiagnostic } from "./diagnostics.js";

export interface FrontendResult {
  readonly program: ts.Program;
  readonly sourceFiles: readonly ts.SourceFile[];
}

interface ParsedConfigResult {
  readonly parsed: ts.ParsedCommandLine;
  readonly diagnostics: readonly CompilerDiagnostic[];
}

interface CachedParsedConfigResult {
  readonly content: string;
  readonly result: ParsedConfigResult;
}

const inlineCppTag = "__tscn_inline_cpp";
const inlineCppMarker = "@cpp";
const missingInlineCppTagDiagnosticCode = 2304;
const suggestedInlineCppTagDiagnosticCode = 2552;
// Early-error syntax rejections the TypeScript parser deliberately accepts.
// tscn treats every entry as strict module code, and the ECMAScript grammar
// forbids these forms in sloppy mode as well, so the rejection applies
// unconditionally (issues #43).
const invalidFunctionDeclarationDiagnosticCode = "TSCN1004";
// TS2556 ("a spread argument must either have a tuple type or be passed to a
// rest parameter") must be suppressed globally: it fires on user source the
// compiler intentionally accepts. Call spread over generic iterables and
// arrays into fixed-arity parameters (issue #23, docs/plan/iterator-spread.md)
// is a supported runtime feature — the argv buffer is materialized through the
// iterator protocol and dispatched via jsCall with a runtime argc — but the TS
// checker can only type tuple spreads or rest targets. The suppression cannot
// be narrowed to harness/prelude code because the diagnostic originates from
// user call sites. It also hides no genuinely ill-typed code: non-iterable
// spread sources are still rejected by TS2488, arity mismatches by TS2554, and
// element type mismatches by TS2345, none of which are filtered.
const spreadArgumentDiagnosticCode = 2556;

const parsedConfigCache = new Map<string, CachedParsedConfigResult>();

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

const findAncestorTsConfig = (
  searchPath: string,
  configName = "tsconfig.json"
): Effect.Effect<string | undefined, PlatformError, FileSystem.FileSystem | Path.Path> => {
  type Step = "found" | "stop" | "descend";
  interface ProbeResult { readonly step: Step; readonly path: string }
  const probeStep = (
    current: string
  ): Effect.Effect<ProbeResult, PlatformError, FileSystem.FileSystem | Path.Path> =>
    Effect.gen(function* probeStepGen() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const candidate = path.join(current, configName);
      if (yield* fs.exists(candidate)) {
        return { step: "found", path: candidate };
      }
      const parent = path.dirname(current);
      if (parent === current) {
        return { step: "stop", path: current };
      }
      return { step: "descend", path: parent };
    });
  const walk = (current: string): Effect.Effect<string | undefined, PlatformError, FileSystem.FileSystem | Path.Path> =>
    Effect.gen(function* walkGen() {
      const step = yield* probeStep(current);
      if (step.step === "found") {
        return step.path;
      }
      if (step.step === "stop") {
        return step.path;
      }
      return yield* walk(step.path);
    });
  return Effect.gen(function* wrap() {
    const path = yield* Path.Path;
    return yield* walk(path.resolve(searchPath));
  });
};

const parseConfigFromContent = (
  configFileName: string,
  content: string,
  pathService: Path.Path
): ParsedConfigResult => {
  const cached = parsedConfigCache.get(configFileName);
  if (cached?.content === content) {
    return cached.result;
  }

  const parsedJson = ts.parseConfigFileTextToJson(configFileName, content);
  let parseDiagnostics: readonly ts.Diagnostic[] = [];
  if (parsedJson.error !== undefined) {
    parseDiagnostics = [parsedJson.error];
  }
  if (!parsedJson.config) {
    const result = { parsed: defaultCompilerOptions(), diagnostics: tsDiagnosticsToCompiler(parseDiagnostics) };
    parsedConfigCache.set(configFileName, { content, result });
    return result;
  }
  const host: ts.ParseConfigHost = {
    useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
    readDirectory: (rootDir, extensions, excludes, includes, depth) =>
      ts.sys.readDirectory(rootDir, extensions, excludes, includes, depth),
    fileExists: (fileName) => {
      if (fileName === configFileName) {
        return true;
      }
      return ts.sys.fileExists(fileName);
    },
    readFile: (fileName) => {
      if (fileName === configFileName) {
        return content;
      }
      return ts.sys.readFile(fileName);
    }
  };
  const parsed = ts.parseJsonConfigFileContent(parsedJson.config, host, pathService.dirname(configFileName));
  const result = { parsed, diagnostics: tsDiagnosticsToCompiler([...parseDiagnostics, ...parsed.errors]) };
  parsedConfigCache.set(configFileName, { content, result });
  return result;
};

const compilerOptionsForEntry = (options: ts.CompilerOptions): ts.CompilerOptions => ({
  ...options,
  rootDir: undefined
});

const declarationSourceFileCache = new Map<string, ts.SourceFile>();

const sourceFileCacheKey = (
  fileName: string,
  languageVersionOrOptions: ts.ScriptTarget | ts.CreateSourceFileOptions
): string => {
  const normalized = ts.sys.resolvePath(fileName);
  let stableFileName = normalized;
  if (!ts.sys.useCaseSensitiveFileNames) {
    stableFileName = normalized.toLowerCase();
  }

  let languageKey: string;
  if (typeof languageVersionOrOptions === "number") {
    languageKey = String(languageVersionOrOptions);
  } else {
    languageKey = JSON.stringify({
      languageVersion: languageVersionOrOptions.languageVersion,
      impliedNodeFormat: languageVersionOrOptions.impliedNodeFormat,
      jsDocParsingMode: languageVersionOrOptions.jsDocParsingMode
    });
  }
  return `${stableFileName}:${languageKey}`;
};

function isInlineCppMarkerAt(content: string, index: number): boolean {
  return content.startsWith(`${inlineCppMarker}\``, index);
}

function skipQuotedString(content: string, index: number, quote: string): number {
  let current = index + 1;
  while (current < content.length) {
    const char = content[current];
    if (char === "\\") {
      current += 2;
      continue;
    }
    if (char === quote) {
      return current + 1;
    }
    current += 1;
  }
  return current;
}

function skipLineComment(content: string, index: number): number {
  const end = content.indexOf("\n", index + 2);
  if (end === -1) {
    return content.length;
  }
  return end;
}

function skipBlockComment(content: string, index: number): number {
  const end = content.indexOf("*/", index + 2);
  if (end === -1) {
    return content.length;
  }
  return end + 2;
}

interface RewriteResult {
  readonly rewritten: string;
  readonly index: number;
}

function rewriteInlineCppMarker(content: string, index: number): RewriteResult | undefined {
  if (!isInlineCppMarkerAt(content, index)) {
    return undefined;
  }
  return { rewritten: inlineCppTag, index: index + inlineCppMarker.length };
}

function copyQuotedString(content: string, index: number, quote: string): RewriteResult {
  const next = skipQuotedString(content, index, quote);
  return { rewritten: content.slice(index, next), index: next };
}

function copyComment(content: string, index: number): RewriteResult | undefined {
  if (content[index] === "/" && content[index + 1] === "/") {
    const next = skipLineComment(content, index);
    return { rewritten: content.slice(index, next), index: next };
  }
  if (content[index] === "/" && content[index + 1] === "*") {
    const next = skipBlockComment(content, index);
    return { rewritten: content.slice(index, next), index: next };
  }
  return undefined;
}

function rewriteTemplatePlaceholder(content: string, index: number): RewriteResult {
  const body = rewriteCode(content, index, true);
  if (body.index >= content.length || content[body.index] !== "}") {
    return body;
  }
  return { rewritten: `${body.rewritten}}`, index: body.index + 1 };
}

function rewriteTemplateLiteral(content: string, index: number): RewriteResult {
  let rewritten = "`";
  let current = index + 1;
  while (current < content.length) {
    const char = content[current];
    if (char === "\\") {
      rewritten += content.slice(current, current + 2);
      current += 2;
      continue;
    }
    if (char === "`") {
      return { rewritten: `${rewritten}\``, index: current + 1 };
    }
    if (char === "$" && content[current + 1] === "{") {
      const placeholder = rewriteTemplatePlaceholder(content, current + 2);
      rewritten += `\${${placeholder.rewritten}`;
      current = placeholder.index;
      continue;
    }
    rewritten += char;
    current += 1;
  }
  return { rewritten, index: current };
}

function rewriteCopiedLiteralOrComment(content: string, index: number): RewriteResult | undefined {
  const char = content[index];
  if (char === "\"" || char === "'") {
    return copyQuotedString(content, index, char);
  }
  if (char === "`") {
    return rewriteTemplateLiteral(content, index);
  }
  return copyComment(content, index);
}

// eslint-disable-next-line complexity -- This scanner tracks JS template placeholder boundaries without parsing raw @cpp as TypeScript.
function rewriteCode(content: string, index: number, stopAtTemplatePlaceholderEnd: boolean): RewriteResult {
  let rewritten = "";
  let current = index;
  let braceDepth = 0;
  while (current < content.length) {
    const char = content[current];
    if (stopAtTemplatePlaceholderEnd && char === "}" && braceDepth === 0) {
      return { rewritten, index: current };
    }

    const marker = rewriteInlineCppMarker(content, current);
    if (marker !== undefined) {
      rewritten += marker.rewritten;
      current = marker.index;
      continue;
    }

    const copied = rewriteCopiedLiteralOrComment(content, current);
    if (copied !== undefined) {
      rewritten += copied.rewritten;
      current = copied.index;
      continue;
    }

    if (stopAtTemplatePlaceholderEnd && char === "{") {
      braceDepth += 1;
    }
    if (stopAtTemplatePlaceholderEnd && char === "}") {
      braceDepth -= 1;
    }

    rewritten += char;
    current += 1;
  }
  return { rewritten, index: current };
}

function rewriteInlineCppSyntax(content: string): string {
  return rewriteCode(content, 0, false).rewritten;
}

function isSyntheticInlineCppDiagnostic(diagnostic: ts.Diagnostic): boolean {
  if (diagnostic.code !== missingInlineCppTagDiagnosticCode && diagnostic.code !== suggestedInlineCppTagDiagnosticCode) {
    return false;
  }
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n").includes(inlineCppTag);
}

const createCompilerHostWithCachedDeclarations = (options: ts.CompilerOptions): ts.CompilerHost => {
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);

  const readFile = host.readFile.bind(host);
  host.readFile = (fileName) => {
    const content = readFile(fileName);
    if (content === undefined || fileName.endsWith(".d.ts")) {
      return content;
    }
    return rewriteInlineCppSyntax(content);
  };

  host.getSourceFile = (fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile) => {
    if (shouldCreateNewSourceFile === true || !fileName.endsWith(".d.ts")) {
      return getSourceFile(fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile);
    }

    const key = sourceFileCacheKey(fileName, languageVersionOrOptions);
    const cached = declarationSourceFileCache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const sourceFile = getSourceFile(fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile);
    if (sourceFile !== undefined) {
      declarationSourceFileCache.set(key, sourceFile);
    }
    return sourceFile;
  };

  return host;
};

const rejectPackageImports = (
  sourceFiles: readonly ts.SourceFile[]
): Effect.Effect<void, never, Diagnostics> =>
  Effect.gen(function* rejectPackages() {
    const diagnostics = yield* Diagnostics;
    const packageImportDiagnostics: CompilerDiagnostic[] = [];
    for (const sourceFile of sourceFiles) {
      for (const statement of sourceFile.statements) {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
          continue;
        }
        const specifier = statement.moduleSpecifier.text;
        if (specifier.startsWith(".") || specifier.startsWith("/")) {
          continue;
        }
        packageImportDiagnostics.push({
          code: "TSCN1001",
          category: "error",
          message: `NPM package imports are not supported yet: ${specifier}`,
          span: sourceSpan(sourceFile, statement.moduleSpecifier.getStart(sourceFile))
        });
      }
    }
    yield* Effect.forEach(packageImportDiagnostics, (diagnostic) => diagnostics.add(diagnostic), { discard: true });
  });

const iterationStatementKeyword = (statement: ts.IterationStatement): string => {
  if (ts.isWhileStatement(statement)) {
    return "while";
  }
  if (ts.isDoStatement(statement)) {
    return "do-while";
  }
  if (ts.isForInStatement(statement)) {
    return "for-in";
  }
  if (ts.isForOfStatement(statement)) {
    return "for-of";
  }
  return "for";
};

// Mirrors the spec's IsLabelledFunction: labels wrapped around the body do not
// make a function declaration a valid iteration body.
const isLabelledFunctionDeclaration = (statement: ts.Statement): boolean => {
  let current = statement;
  while (ts.isLabeledStatement(current)) {
    current = current.statement;
  }
  return ts.isFunctionDeclaration(current);
};

const collectBoundNames = (name: ts.BindingName, names: Set<string>): void => {
  if (ts.isIdentifier(name)) {
    names.add(name.text);
    return;
  }
  for (const element of name.elements) {
    if (ts.isBindingElement(element)) {
      collectBoundNames(element.name, names);
    }
  }
};

const collectInvalidFunctionDeclarations = (sourceFile: ts.SourceFile): CompilerDiagnostic[] => {
  const found: CompilerDiagnostic[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isIterationStatement(node, false) && isLabelledFunctionDeclaration(node.statement)) {
      found.push({
        code: invalidFunctionDeclarationDiagnosticCode,
        category: "error",
        message: `A function declaration cannot be used directly as the body of a ${iterationStatementKeyword(node)} statement`,
        span: sourceSpan(sourceFile, node.statement.getStart(sourceFile))
      });
    }
    if (ts.isIfStatement(node)) {
      // Strict mode forbids the Annex B.3.4 `if (x) function f() {}` forms;
      // the TypeScript parser accepts them, so reject both branches here.
      if (isLabelledFunctionDeclaration(node.thenStatement)) {
        found.push({
          code: invalidFunctionDeclarationDiagnosticCode,
          category: "error",
          message: "A function declaration cannot be used directly as the body of an if statement",
          span: sourceSpan(sourceFile, node.thenStatement.getStart(sourceFile))
        });
      }
      if (node.elseStatement !== undefined && isLabelledFunctionDeclaration(node.elseStatement)) {
        found.push({
          code: invalidFunctionDeclarationDiagnosticCode,
          category: "error",
          message: "A function declaration cannot be used directly as the body of an if statement",
          span: sourceSpan(sourceFile, node.elseStatement.getStart(sourceFile))
        });
      }
    }
    if (ts.isCatchClause(node) && node.variableDeclaration !== undefined) {
      const boundNames = new Set<string>();
      collectBoundNames(node.variableDeclaration.name, boundNames);
      for (const statement of node.block.statements) {
        if (ts.isFunctionDeclaration(statement) && statement.name !== undefined && boundNames.has(statement.name.text)) {
          found.push({
            code: invalidFunctionDeclarationDiagnosticCode,
            category: "error",
            message: `Catch parameter '${statement.name.text}' cannot be redeclared by a directly nested function declaration`,
            span: sourceSpan(sourceFile, statement.name.getStart(sourceFile))
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
};

// The TypeScript parser accepts function declarations as iteration-statement
// or single-statement if/else bodies and lets a catch block redeclare its
// parameter with a function declaration. All are ECMAScript early errors in
// strict code, so reject them during the frontend phase (issue #43).
const rejectInvalidFunctionDeclarations = (
  sourceFiles: readonly ts.SourceFile[]
): Effect.Effect<void, never, Diagnostics> =>
  Effect.gen(function* rejectInvalidFunctions() {
    const diagnostics = yield* Diagnostics;
    const found = sourceFiles.flatMap(collectInvalidFunctionDeclarations);
    yield* Effect.forEach(found, (diagnostic) => diagnostics.add(diagnostic), { discard: true });
  });

export const loadProgram = (
  entry: string,
  options: { readonly suppressSemanticDiagnostics?: boolean } = {}
): Effect.Effect<FrontendResult, PlatformError, FileSystem.FileSystem | Path.Path | Diagnostics> =>
  Effect.gen(function* loadProgramEffect() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const diagnostics = yield* Diagnostics;

    const resolvedEntry = path.resolve(entry);
    const configFileName = yield* findAncestorTsConfig(path.dirname(resolvedEntry));

    let parsed = defaultCompilerOptions();
    if (configFileName !== undefined) {
      const content = yield* fs
        .readFileString(configFileName)
        .pipe(Effect.orElseSucceed(() => ""));
      if (content.length > 0) {
        const { parsed: parsedConfig, diagnostics: configDiagnostics } = parseConfigFromContent(configFileName, content, path);
        parsed = parsedConfig;
        yield* Effect.forEach(configDiagnostics, (diagnostic) => diagnostics.add(diagnostic), { discard: true });
      }
    }

    const compilerOptions = compilerOptionsForEntry(parsed.options);
    const program = ts.createProgram(
      [resolvedEntry],
      compilerOptions,
      createCompilerHostWithCachedDeclarations(compilerOptions)
    );
    const sourceFiles = program
      .getSourceFiles()
      .filter((sourceFile) => !sourceFile.isDeclarationFile && !sourceFile.fileName.includes("/node_modules/"));

    let semanticDiagnostics: readonly ts.Diagnostic[] = [];
    if (options.suppressSemanticDiagnostics !== true) {
      semanticDiagnostics = program.getSemanticDiagnostics();
    }
    const tsDiagnostics = tsDiagnosticsToCompiler([
      ...program.getOptionsDiagnostics(),
      ...program.getGlobalDiagnostics(),
      ...program.getSyntacticDiagnostics(),
      ...semanticDiagnostics
    ].filter((diagnostic) => !isSyntheticInlineCppDiagnostic(diagnostic) && diagnostic.code !== spreadArgumentDiagnosticCode));
    yield* Effect.forEach(tsDiagnostics, (diagnostic) => diagnostics.add(diagnostic), { discard: true });

    yield* rejectPackageImports(sourceFiles);
    yield* rejectInvalidFunctionDeclarations(sourceFiles);

    return { program, sourceFiles };
  });
