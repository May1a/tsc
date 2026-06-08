import { FileSystem, Path } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import { Chunk, Effect } from "effect";
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
  const parsedJson = ts.parseConfigFileTextToJson(configFileName, content);
  let parseDiagnostics: readonly ts.Diagnostic[] = [];
  if (parsedJson.error !== undefined) {
    parseDiagnostics = [parsedJson.error];
  }
  if (!parsedJson.config) {
    return { parsed: defaultCompilerOptions(), diagnostics: tsDiagnosticsToCompiler(parseDiagnostics) };
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
  return { parsed, diagnostics: tsDiagnosticsToCompiler([...parseDiagnostics, ...parsed.errors]) };
};

const rejectPackageImports = (
  sourceFiles: readonly ts.SourceFile[]
): Effect.Effect<void, never, Diagnostics> =>
  Effect.gen(function* rejectPackages() {
    const diagnostics = yield* Diagnostics;
    for (const sourceFile of sourceFiles) {
      const visit = (node: ts.Node): Effect.Effect<void, never, Diagnostics> =>
        Effect.gen(function* visitNode() {
          if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
            const specifier = node.moduleSpecifier.text;
            if (!specifier.startsWith(".") && !specifier.startsWith("/")) {
              yield* diagnostics.error({
                code: "TSCN1001",
                message: `NPM package imports are not supported yet: ${specifier}`,
                span: sourceSpan(sourceFile, node.moduleSpecifier.getStart(sourceFile))
              });
            }
          }
          const children: ts.Node[] = [];
          ts.forEachChild(node, (child) => {
            children.push(child);
          });
          yield* Effect.forEach(children, (child) => visit(child), { discard: true });
        });

      yield* visit(sourceFile);
    }
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

    const program = ts.createProgram([resolvedEntry], parsed.options);
    const sourceFiles = program
      .getSourceFiles()
      .filter((sourceFile) => !sourceFile.isDeclarationFile && !sourceFile.fileName.includes("/node_modules/"));

    const tsDiagnostics = Chunk.toReadonlyArray(
      Chunk.appendAll(
        Chunk.fromIterable(tsDiagnosticsToCompiler(program.getOptionsDiagnostics())),
        Chunk.appendAll(
          Chunk.fromIterable(tsDiagnosticsToCompiler(program.getGlobalDiagnostics())),
          Chunk.appendAll(
            Chunk.fromIterable(tsDiagnosticsToCompiler(program.getSyntacticDiagnostics())),
            Chunk.fromIterable(tsDiagnosticsToCompiler(program.getSemanticDiagnostics()))
          )
        )
      )
    );
    yield* Effect.forEach(tsDiagnostics, (diagnostic) => diagnostics.add(diagnostic), { discard: true });

    yield* rejectPackageImports(sourceFiles);

    return { program, sourceFiles };
  });
