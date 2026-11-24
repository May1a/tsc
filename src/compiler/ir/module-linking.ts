import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import type { JsIrModuleImport, PackageModuleGraph } from "./module.js";
import type { JsIrOperation } from "./types.js";
import type { LoweringContext } from "./context.js";
import { type ClassInfo, classPrototypeName, classStaticStorageName } from "./class-info.js";
import { functionReferenceBinding } from "./function-parameters.js";
import {
  classConstructorName,
  classConstructorValueName,
  classDynamicSuperName,
  classGetterFunctionName,
  classMethodFunctionName,
  classSetterFunctionName,
  classStaticAccessorFunctionName
} from "./class-names.js";
import {
  DEFAULT_EXPORT_BINDING_NAME,
  MODULE_NAMESPACE_BINDING_NAME,
  type ModuleExportIndex,
  type ResolvedModuleTarget,
  collectModuleExportEntries,
  resolveAstExportTarget,
  resolveSpecifierFile
} from "./esm-exports.js";

export { DEFAULT_EXPORT_BINDING_NAME, MODULE_NAMESPACE_BINDING_NAME, buildModuleExportIndex } from "./esm-exports.js";
export type { ModuleExportIndex } from "./esm-exports.js";

interface ModuleImportWiring {
  readonly imports: readonly JsIrModuleImport[];
  readonly preamble: readonly JsIrOperation[];
  readonly addImport: (entry: JsIrModuleImport) => void;
}

/** Dependency-first topological order over `sourceFiles`, starting from `entry`. */
export function orderSourceFiles(
  entry: string,
  sourceFiles: readonly ts.SourceFile[],
  checker: ts.TypeChecker | undefined,
  packageGraph?: PackageModuleGraph
): readonly ts.SourceFile[] {
  if (sourceFiles.length <= 1) {
    return sourceFiles;
  }
  const filesByName = new Map(sourceFiles.map((file) => [file.fileName, file]));
  const ordered: ts.SourceFile[] = [];
  const visited = new Set<string>();

  const visit = (file: ts.SourceFile): void => {
    if (visited.has(file.fileName)) {
      return;
    }
    visited.add(file.fileName);
    for (const dependency of directModuleDependencies(file, checker, packageGraph, filesByName)) {
      visit(dependency);
    }
    ordered.push(file);
  };

  const entryFile = filesByName.get(entry);
  if (entryFile !== undefined) {
    visit(entryFile);
  }
  for (const file of sourceFiles) {
    visit(file);
  }
  return ordered;
}

function directModuleDependencies(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker | undefined,
  packageGraph: PackageModuleGraph | undefined,
  filesByName: ReadonlyMap<string, ts.SourceFile>
): readonly ts.SourceFile[] {
  const dependencies: ts.SourceFile[] = [];
  const requested = packageGraph?.requestedExportsByFile.get(sourceFile.fileName);
  const isPackageFile = requested !== undefined;
  const effectiveChecker = isPackageFile ? undefined : checker;
  for (const statement of sourceFile.statements) {
    const specifier = moduleSpecifierOf(statement, requested);
    if (specifier === undefined) {
      continue;
    }
    const target = resolveSpecifierFile(sourceFile.fileName, specifier, effectiveChecker, packageGraph, filesByName);
    if (target !== undefined) {
      dependencies.push(target);
    }
  }
  return dependencies;
}

function moduleSpecifierOf(
  statement: ts.Statement,
  requested: ReadonlySet<string> | "*" | undefined
): ts.StringLiteral | undefined {
  if (ts.isImportDeclaration(statement)) {
    if (statement.importClause?.phaseModifier === ts.SyntaxKind.TypeKeyword) {
      return undefined;
    }
    return ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier : undefined;
  }
  if (ts.isExportDeclaration(statement) && !statement.isTypeOnly && statement.moduleSpecifier !== undefined && ts.isStringLiteral(statement.moduleSpecifier)) {
    if (requested === undefined || requested === "*") {
      return statement.moduleSpecifier;
    }
    const { exportClause } = statement;
    if (exportClause === undefined) {
      return requested.size > 0 ? statement.moduleSpecifier : undefined;
    }
    if (ts.isNamespaceExport(exportClause)) {
      return requested.has(exportClause.name.text) ? statement.moduleSpecifier : undefined;
    }
    const needed = exportClause.elements.some((element) => !element.isTypeOnly && requested.has(element.name.text));
    return needed ? statement.moduleSpecifier : undefined;
  }
  return undefined;
}

const nodeBuiltinModuleMap: Readonly<Record<string, "fs" | "path" | "os" | "child_process" | undefined>> = {
  "node:fs": "fs",
  fs: "fs",
  "node:path": "path",
  path: "path",
  "node:os": "os",
  os: "os",
  "node:child_process": "child_process",
  child_process: "child_process"
};

function wireNodeBuiltinImport(
  context: LoweringContext,
  importClause: ts.ImportClause,
  moduleName: "fs" | "path" | "os" | "child_process",
  bindings: Map<string, JsIrBindingValue>,
  preamble: JsIrOperation[]
): void {
  const modBindingName = `__tscn_node_${moduleName}_${context.nextSyntheticTempId++}`;
  preamble.push({ kind: "letValue", name: modBindingName, value: { kind: "nodeBuiltinModule", moduleName } });
  if (importClause.name !== undefined) {
    const localName = importClause.name.text;
    preamble.push({ kind: "letValue", name: localName, value: { kind: "variable", name: modBindingName } });
    bindings.set(localName, { kind: "valueVariable", name: localName });
  }
  const { namedBindings } = importClause;
  if (namedBindings === undefined) {
    return;
  }
  if (ts.isNamespaceImport(namedBindings)) {
    const localName = namedBindings.name.text;
    preamble.push({ kind: "letValue", name: localName, value: { kind: "variable", name: modBindingName } });
    bindings.set(localName, { kind: "valueVariable", name: localName });
    return;
  }
  for (const element of namedBindings.elements) {
    if (element.isTypeOnly) {
      continue;
    }
    const localName = element.name.text;
    const exportName = element.propertyName?.text ?? localName;
    preamble.push({
      kind: "letValue",
      name: localName,
      value: { kind: "valueObjectDynamicAccess", value: { kind: "variable", name: modBindingName }, key: { kind: "literal", value: exportName } }
    });
    bindings.set(localName, { kind: "valueVariable", name: localName });
  }
}

/** Wires value, function, class, and namespace imports from compiled modules into `bindings` and `context.classes`. */
export function wireModuleImports(
  context: LoweringContext,
  sourceFile: ts.SourceFile,
  exportIndex: ModuleExportIndex,
  programChecker: ts.TypeChecker | undefined,
  filesByName: ReadonlyMap<string, ts.SourceFile>,
  moduleClassesByFile: ReadonlyMap<string, ReadonlyMap<string, ClassInfo>>,
  bindings: Map<string, JsIrBindingValue>
): ModuleImportWiring {
  const imports: JsIrModuleImport[] = [];
  const seenImports = new Set<string>();
  const preamble: JsIrOperation[] = [];
  const addImport = (entry: JsIrModuleImport): void => {
    const key = `${entry.localName}\0${entry.sourceFileName}\0${entry.targetName}`;
    if (!seenImports.has(key)) {
      seenImports.add(key);
      imports.push(entry);
    }
  };
  const isPackageFile = exportIndex.packageGraph?.requestedExportsByFile.has(sourceFile.fileName) === true;
  const effectiveChecker = isPackageFile ? undefined : programChecker;

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    const { importClause } = statement;
    if (importClause === undefined || importClause.phaseModifier === ts.SyntaxKind.TypeKeyword) {
      continue;
    }
    const nodeModule = nodeBuiltinModuleMap[statement.moduleSpecifier.text];
    if (nodeModule !== undefined) {
      wireNodeBuiltinImport(context, importClause, nodeModule, bindings, preamble);
      continue;
    }
    const targetFile = resolveSpecifierFile(sourceFile.fileName, statement.moduleSpecifier, effectiveChecker, exportIndex.packageGraph, filesByName);
    if (targetFile === undefined) {
      continue;
    }
    wireImportClause(
      context,
      effectiveChecker,
      exportIndex,
      importClause,
      targetFile,
      filesByName,
      moduleClassesByFile,
      bindings,
      addImport
    );
  }

  return { imports, preamble, addImport };
}

function wireImportClause(
  context: LoweringContext,
  checker: ts.TypeChecker | undefined,
  exportIndex: ModuleExportIndex,
  importClause: ts.ImportClause,
  targetFile: ts.SourceFile,
  filesByName: ReadonlyMap<string, ts.SourceFile>,
  moduleClassesByFile: ReadonlyMap<string, ReadonlyMap<string, ClassInfo>>,
  bindings: Map<string, JsIrBindingValue>,
  addImport: (entry: JsIrModuleImport) => void
): void {
  if (importClause.name !== undefined) {
    wireResolvedExport(
      context,
      checker,
      exportIndex,
      targetFile.fileName,
      "default",
      importClause.name,
      importClause.name.text,
      filesByName,
      moduleClassesByFile,
      bindings,
      addImport
    );
  }
  const { namedBindings } = importClause;
  if (namedBindings === undefined) {
    return;
  }
  if (ts.isNamespaceImport(namedBindings)) {
    const localName = namedBindings.name.text;
    addImport({ localName, sourceFileName: targetFile.fileName, targetName: MODULE_NAMESPACE_BINDING_NAME });
    bindings.set(localName, { kind: "valueVariable", name: localName });
    return;
  }
  for (const element of namedBindings.elements) {
    if (!element.isTypeOnly) {
      const exportName = element.propertyName?.text ?? element.name.text;
      wireResolvedExport(
        context,
        checker,
        exportIndex,
        targetFile.fileName,
        exportName,
        element.name,
        element.name.text,
        filesByName,
        moduleClassesByFile,
        bindings,
        addImport
      );
    }
  }
}

function wireResolvedExport(
  context: LoweringContext,
  checker: ts.TypeChecker | undefined,
  exportIndex: ModuleExportIndex,
  targetFileName: string,
  exportName: string,
  identifier: ts.Identifier,
  localName: string,
  filesByName: ReadonlyMap<string, ts.SourceFile>,
  moduleClassesByFile: ReadonlyMap<string, ReadonlyMap<string, ClassInfo>>,
  bindings: Map<string, JsIrBindingValue>,
  addImport: (entry: JsIrModuleImport) => void
): void {
  const astTarget = resolveAstExportTarget(targetFileName, exportName, exportIndex, checker, filesByName);
  const target = astTarget ?? (checker === undefined ? undefined : resolveCheckerSymbolTarget(checker, identifier, filesByName));
  if (target === undefined) {
    return;
  }
  if (target.isClass) {
    const info = moduleClassesByFile.get(target.fileName)?.get(target.classLookupName);
    if (info !== undefined) {
      context.classes.set(localName, info);
      importClassBindings(context, info, target.fileName, addImport);
      return;
    }
  }
  addImport({ localName, sourceFileName: target.fileName, targetName: target.targetName });
  bindings.set(
    localName,
    target.functionDeclaration === undefined
      ? { kind: "valueVariable", name: localName }
      : functionReferenceBinding(target.functionDeclaration)
  );
}

/** Builds init and post-execution operations for a module's canonical namespace object, when demanded. */
export function buildModuleNamespaceInitOperations(
  sourceFile: ts.SourceFile,
  exportIndex: ModuleExportIndex
): readonly JsIrOperation[] {
  if (!exportIndex.namespaceDemandedFiles.has(sourceFile.fileName)) {
    return [];
  }
  const ops: JsIrOperation[] = [
    { kind: "runtimeObjectLiteral", name: MODULE_NAMESPACE_BINDING_NAME, value: { fields: [] } }
  ];
  const summary = exportIndex.summaries.get(sourceFile.fileName);
  if (summary !== undefined) {
    for (const [exportName, entry] of summary.namedExports) {
      if (entry.kind !== "local") {
        continue;
      }
      const localDecl = summary.localDecls.get(entry.localName);
      if (localDecl?.functionDeclaration !== undefined) {
        ops.push({
          kind: "runtimeObjectStore",
          objectName: MODULE_NAMESPACE_BINDING_NAME,
          key: { kind: "literal", value: exportName },
          value: { kind: "variable", name: localDecl.targetName }
        });
      }
    }
  }
  return ops;
}

export function buildModuleNamespacePopulateOperations(
  context: LoweringContext,
  sourceFile: ts.SourceFile,
  exportIndex: ModuleExportIndex,
  programChecker: ts.TypeChecker | undefined,
  filesByName: ReadonlyMap<string, ts.SourceFile>,
  moduleClassesByFile: ReadonlyMap<string, ReadonlyMap<string, ClassInfo>>,
  localClasses: ReadonlyMap<string, ClassInfo>,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  addImport: (entry: JsIrModuleImport) => void
): readonly JsIrOperation[] {
  if (!exportIndex.namespaceDemandedFiles.has(sourceFile.fileName)) {
    return [];
  }
  const isPackageFile = exportIndex.packageGraph?.requestedExportsByFile.has(sourceFile.fileName) === true;
  const effectiveChecker = isPackageFile ? undefined : programChecker;
  const ops: JsIrOperation[] = [];
  for (const { exportName, target } of collectModuleExportEntries(sourceFile.fileName, exportIndex, effectiveChecker, filesByName)) {
    if (target.fileName === sourceFile.fileName) {
      let localTargetName = target.targetName;
      if (target.isClass) {
        const info = localClasses.get(target.classLookupName);
        if (info === undefined) {
          continue;
        }
        localTargetName = classConstructorValueName(info.name);
      } else if (!bindings.has(localTargetName) && localTargetName !== DEFAULT_EXPORT_BINDING_NAME) {
        continue;
      }
      ops.push({
        kind: "runtimeObjectStore",
        objectName: MODULE_NAMESPACE_BINDING_NAME,
        key: { kind: "literal", value: exportName },
        value: { kind: "variable", name: localTargetName }
      });
      continue;
    }
    let remoteTargetName = target.targetName;
    if (target.isClass) {
      const info = moduleClassesByFile.get(target.fileName)?.get(target.classLookupName);
      if (info !== undefined) {
        remoteTargetName = classConstructorValueName(info.name);
      }
    }
    const aliasName = `__tscn_ns_reexp_${context.nextSyntheticTempId++}`;
    addImport({ localName: aliasName, sourceFileName: target.fileName, targetName: remoteTargetName });
    ops.push({
      kind: "runtimeObjectStore",
      objectName: MODULE_NAMESPACE_BINDING_NAME,
      key: { kind: "literal", value: exportName },
      value: { kind: "variable", name: aliasName }
    });
  }
  return ops;
}

function resolveCheckerSymbolTarget(
  checker: ts.TypeChecker,
  identifier: ts.Identifier,
  filesByName: ReadonlyMap<string, ts.SourceFile>
): ResolvedModuleTarget | undefined {
  const symbol = checker.getSymbolAtLocation(identifier);
  if (symbol === undefined) {
    return undefined;
  }
  const resolved = (symbol.flags & ts.SymbolFlags.Alias) === 0 ? symbol : checker.getAliasedSymbol(symbol);
  if ((resolved.flags & ts.SymbolFlags.Value) === 0) {
    return undefined;
  }
  const declaration = executableDeclarationOf(resolved);
  if (declaration === undefined) {
    return undefined;
  }
  const declFile = declaration.getSourceFile();
  if (!filesByName.has(declFile.fileName)) {
    return undefined;
  }
  return targetFromDeclaration(declaration, declFile.fileName);
}

function executableDeclarationOf(symbol: ts.Symbol): ts.Declaration | undefined {
  const declarations = symbol.declarations ?? [];
  const preferred = declarations.find((declaration) =>
    (ts.isFunctionDeclaration(declaration) && declaration.body !== undefined) ||
    ts.isClassDeclaration(declaration) ||
    ts.isVariableDeclaration(declaration) ||
    ts.isEnumDeclaration(declaration) ||
    ts.isModuleDeclaration(declaration) ||
    ts.isExportAssignment(declaration)
  );
  return preferred ?? symbol.valueDeclaration ?? declarations[0];
}

function targetFromDeclaration(declaration: ts.Declaration, fileName: string): ResolvedModuleTarget | undefined {
  if (ts.isExportAssignment(declaration)) {
    return { fileName, targetName: DEFAULT_EXPORT_BINDING_NAME, isClass: false, classLookupName: "" };
  }
  if (ts.isClassDeclaration(declaration)) {
    const className = declaration.name?.text ?? DEFAULT_EXPORT_BINDING_NAME;
    return { fileName, targetName: classConstructorValueName(className), isClass: true, classLookupName: className };
  }
  if (ts.isFunctionDeclaration(declaration) && declaration.name !== undefined) {
    return { fileName, targetName: declaration.name.text, functionDeclaration: declaration, isClass: false, classLookupName: "" };
  }
  if (ts.isVariableDeclaration(declaration) && ts.isIdentifier(declaration.name)) {
    const isClassExpr = declaration.initializer !== undefined && ts.isClassExpression(declaration.initializer);
    return {
      fileName,
      targetName: isClassExpr ? classConstructorValueName(declaration.name.text) : declaration.name.text,
      isClass: isClassExpr,
      classLookupName: declaration.name.text
    };
  }
  if (ts.isEnumDeclaration(declaration)) {
    return { fileName, targetName: declaration.name.text, isClass: false, classLookupName: "" };
  }
  if (ts.isModuleDeclaration(declaration) && ts.isIdentifier(declaration.name)) {
    return { fileName, targetName: declaration.name.text, isClass: false, classLookupName: "" };
  }
  return undefined;
}

function importClassBindings(
  context: LoweringContext,
  info: ClassInfo,
  ownerFileName: string,
  addImport: (entry: JsIrModuleImport) => void
): void {
  const visited = new Set<string>();
  let current: ClassInfo | undefined = info;
  let currentFile: string | undefined = ownerFileName;
  while (current !== undefined && currentFile !== undefined && !visited.has(current.name)) {
    visited.add(current.name);
    for (const symbolName of classExportedBindingNames(current)) {
      addImport({ localName: symbolName, sourceFileName: currentFile, targetName: symbolName });
    }
    if (current.baseName === undefined) {
      break;
    }
    currentFile = context.classOwnerFiles.get(current.baseName);
    current = context.allClasses.get(current.baseName);
  }
}

function classExportedBindingNames(info: ClassInfo): readonly string[] {
  const names: string[] = [
    classPrototypeName(info.name),
    classStaticStorageName(info.name),
    classConstructorName(info.name),
    classConstructorValueName(info.name),
    ...(info.hasDynamicBase === true ? [classDynamicSuperName(info.name)] : [])
  ];
  for (const methodName of info.methods.keys()) {
    names.push(classMethodFunctionName(info.name, methodName, false));
  }
  for (const methodName of info.staticMethods.keys()) {
    names.push(classMethodFunctionName(info.name, methodName, true));
  }
  for (const getterName of info.getters) {
    names.push(classGetterFunctionName(info.name, getterName));
  }
  for (const setterName of info.setters) {
    names.push(classSetterFunctionName(info.name, setterName));
  }
  for (const getterName of info.staticGetters) {
    names.push(classStaticAccessorFunctionName(info.name, getterName, true));
  }
  for (const setterName of info.staticSetters) {
    names.push(classStaticAccessorFunctionName(info.name, setterName, false));
  }
  return names;
}
