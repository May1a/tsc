import { FileSystem, Path } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import { Effect } from "effect";
import ts from "typescript";
import { Diagnostics } from "./diagnostics-service.js";
import type { CompilerDiagnostic } from "./diagnostics.js";

export type FrontendResult = {
  readonly program: ts.Program;
  readonly sourceFiles: readonly ts.SourceFile[];
};

type ParsedConfigResult = {
  readonly parsed: ts.ParsedCommandLine;
  readonly diagnostics: readonly CompilerDiagnostic[];
};

type CachedParsedConfigResult = {
  readonly content: string;
  readonly result: ParsedConfigResult;
};

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
  type ProbeResult = { readonly step: Step; readonly path: string };
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

const createCompilerHostWithCachedDeclarations = (options: ts.CompilerOptions): ts.CompilerHost => {
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);

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

export const loadProgram = (
  entry: string
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

    const tsDiagnostics = tsDiagnosticsToCompiler([
      ...program.getOptionsDiagnostics(),
      ...program.getGlobalDiagnostics(),
      ...program.getSyntacticDiagnostics(),
      ...program.getSemanticDiagnostics()
    ]);
    yield* Effect.forEach(tsDiagnostics, (diagnostic) => diagnostics.add(diagnostic), { discard: true });

    yield* rejectPackageImports(sourceFiles);

    return { program, sourceFiles };
  });
