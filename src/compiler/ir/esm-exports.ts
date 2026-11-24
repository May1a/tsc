import ts from "typescript";
import type { PackageModuleGraph } from "./module.js";
import { classConstructorValueName } from "./class-names.js";

export const DEFAULT_EXPORT_BINDING_NAME = "__tscn_default_export";
export const MODULE_NAMESPACE_BINDING_NAME = "__tscn_module_namespace";

export interface ResolvedModuleTarget {
  readonly fileName: string;
  readonly targetName: string;
  readonly functionDeclaration?: ts.FunctionDeclaration;
  readonly isClass: boolean;
  readonly classLookupName: string;
}

type ExportEntry =
  | { readonly kind: "local"; readonly localName: string }
  | { readonly kind: "reexport"; readonly specifier: string; readonly importedName: string }
  | { readonly kind: "namespaceReexport"; readonly specifier: string }
  | { readonly kind: "defaultExpr" };

type LocalImportEntry =
  | { readonly kind: "named"; readonly specifier: string; readonly importedName: string }
  | { readonly kind: "namespace"; readonly specifier: string };

interface ModuleExportSummary {
  readonly fileName: string;
  readonly localDecls: ReadonlyMap<string, ResolvedModuleTarget>;
  readonly localImports: ReadonlyMap<string, LocalImportEntry>;
  readonly namedExports: ReadonlyMap<string, ExportEntry>;
  readonly starReexports: readonly string[];
}

export interface ModuleExportIndex {
  readonly summaries: ReadonlyMap<string, ModuleExportSummary>;
  readonly packageGraph: PackageModuleGraph | undefined;
  readonly namespaceDemandedFiles: ReadonlySet<string>;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  if (!ts.canHaveModifiers(node)) {
    return false;
  }
  return ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) === true;
}

function collectPatternNames(name: ts.BindingName, out: string[]): void {
  if (ts.isIdentifier(name)) {
    out.push(name.text);
    return;
  }
  for (const element of name.elements) {
    if (ts.isBindingElement(element)) {
      collectPatternNames(element.name, out);
    }
  }
}

function recordLocalDeclaration(
  fileName: string,
  statement: ts.Statement,
  localDecls: Map<string, ResolvedModuleTarget>,
  namedExports: Map<string, ExportEntry>
): void {
  const isExported = hasModifier(statement, ts.SyntaxKind.ExportKeyword);
  const isDefault = hasModifier(statement, ts.SyntaxKind.DefaultKeyword);
  const register = (localName: string, target: ResolvedModuleTarget): void => {
    localDecls.set(localName, target);
    if (isExported) {
      namedExports.set(isDefault ? "default" : localName, { kind: "local", localName });
    }
  };

  if (ts.isFunctionDeclaration(statement) && statement.body !== undefined) {
    const localName = statement.name?.text ?? DEFAULT_EXPORT_BINDING_NAME;
    register(localName, { fileName, targetName: localName, functionDeclaration: statement, isClass: false, classLookupName: "" });
    return;
  }
  if (ts.isClassDeclaration(statement)) {
    const className = statement.name?.text ?? DEFAULT_EXPORT_BINDING_NAME;
    register(className, { fileName, targetName: classConstructorValueName(className), isClass: true, classLookupName: className });
    return;
  }
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) {
        const isClassExpr = declaration.initializer !== undefined && ts.isClassExpression(declaration.initializer);
        const name = declaration.name.text;
        register(name, {
          fileName,
          targetName: isClassExpr ? classConstructorValueName(name) : name,
          isClass: isClassExpr,
          classLookupName: name
        });
      } else {
        const names: string[] = [];
        collectPatternNames(declaration.name, names);
        for (const name of names) {
          register(name, { fileName, targetName: name, isClass: false, classLookupName: "" });
        }
      }
    }
    return;
  }
  if (ts.isEnumDeclaration(statement)) {
    register(statement.name.text, { fileName, targetName: statement.name.text, isClass: false, classLookupName: "" });
    return;
  }
  if (ts.isModuleDeclaration(statement) && ts.isIdentifier(statement.name)) {
    register(statement.name.text, { fileName, targetName: statement.name.text, isClass: false, classLookupName: "" });
    return;
  }
  if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
    namedExports.set("default", { kind: "defaultExpr" });
  }
}

function recordImportStatement(statement: ts.ImportDeclaration, localImports: Map<string, LocalImportEntry>): void {
  const { importClause } = statement;
  if (importClause === undefined || importClause.phaseModifier === ts.SyntaxKind.TypeKeyword || !ts.isStringLiteral(statement.moduleSpecifier)) {
    return;
  }
  const specifier = statement.moduleSpecifier.text;
  if (importClause.name !== undefined) {
    localImports.set(importClause.name.text, { kind: "named", specifier, importedName: "default" });
  }
  const { namedBindings } = importClause;
  if (namedBindings === undefined) {
    return;
  }
  if (ts.isNamespaceImport(namedBindings)) {
    localImports.set(namedBindings.name.text, { kind: "namespace", specifier });
    return;
  }
  for (const element of namedBindings.elements) {
    if (!element.isTypeOnly) {
      localImports.set(element.name.text, {
        kind: "named",
        specifier,
        importedName: element.propertyName?.text ?? element.name.text
      });
    }
  }
}

function recordExportDeclaration(
  statement: ts.ExportDeclaration,
  namedExports: Map<string, ExportEntry>,
  starReexports: string[]
): void {
  if (statement.isTypeOnly) {
    return;
  }
  const specifier = statement.moduleSpecifier !== undefined && ts.isStringLiteral(statement.moduleSpecifier)
    ? statement.moduleSpecifier.text
    : undefined;
  const { exportClause } = statement;
  if (exportClause === undefined) {
    if (specifier !== undefined) {
      starReexports.push(specifier);
    }
    return;
  }
  if (ts.isNamespaceExport(exportClause)) {
    if (specifier !== undefined) {
      namedExports.set(exportClause.name.text, { kind: "namespaceReexport", specifier });
    }
    return;
  }
  for (const element of exportClause.elements) {
    if (element.isTypeOnly) {
      continue;
    }
    const localOrOrig = element.propertyName?.text ?? element.name.text;
    const exportedName = element.name.text;
    namedExports.set(
      exportedName,
      specifier === undefined
        ? { kind: "local", localName: localOrOrig }
        : { kind: "reexport", specifier, importedName: localOrOrig }
    );
  }
}

function summarizeSourceFile(sourceFile: ts.SourceFile): ModuleExportSummary {
  const localDecls = new Map<string, ResolvedModuleTarget>();
  const localImports = new Map<string, LocalImportEntry>();
  const namedExports = new Map<string, ExportEntry>();
  const starReexports: string[] = [];

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      recordImportStatement(statement, localImports);
    } else if (ts.isExportDeclaration(statement)) {
      recordExportDeclaration(statement, namedExports, starReexports);
    } else {
      recordLocalDeclaration(sourceFile.fileName, statement, localDecls, namedExports);
    }
  }
  return { fileName: sourceFile.fileName, localDecls, localImports, namedExports, starReexports };
}

export function resolveSpecifierFile(
  importerFileName: string,
  specifierNode: ts.StringLiteral,
  checker: ts.TypeChecker | undefined,
  packageGraph: PackageModuleGraph | undefined,
  filesByName: ReadonlyMap<string, ts.SourceFile>
): ts.SourceFile | undefined {
  const mapped = packageGraph?.resolvedSpecifiers.get(`${importerFileName}\0${specifierNode.text}`);
  if (mapped !== undefined) {
    return filesByName.get(mapped);
  }
  if (checker !== undefined) {
    const symbol = checker.getSymbolAtLocation(specifierNode);
    const declaration = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
    if (declaration !== undefined && ts.isSourceFile(declaration)) {
      return filesByName.get(declaration.fileName);
    }
  }
  return undefined;
}

function resolveSpecifierString(
  importerFileName: string,
  specifier: string,
  packageGraph: PackageModuleGraph | undefined,
  checker: ts.TypeChecker | undefined,
  filesByName: ReadonlyMap<string, ts.SourceFile>
): ts.SourceFile | undefined {
  const mapped = packageGraph?.resolvedSpecifiers.get(`${importerFileName}\0${specifier}`);
  if (mapped !== undefined) {
    return filesByName.get(mapped);
  }
  const importerFile = filesByName.get(importerFileName);
  if (importerFile === undefined || checker === undefined) {
    return undefined;
  }
  for (const statement of importerFile.statements) {
    const literal = ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)
      ? statement.moduleSpecifier
      : undefined;
    if (literal !== undefined && ts.isStringLiteral(literal) && literal.text === specifier) {
      return resolveSpecifierFile(importerFileName, literal, checker, packageGraph, filesByName);
    }
  }
  return undefined;
}

function namespaceDemandSpecifier(
  statement: ts.Statement,
  requested: ReadonlySet<string> | "*" | undefined
): ts.StringLiteral | undefined {
  if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
    const { importClause } = statement;
    if (importClause !== undefined && importClause.phaseModifier !== ts.SyntaxKind.TypeKeyword &&
      importClause.namedBindings !== undefined && ts.isNamespaceImport(importClause.namedBindings)) {
      return statement.moduleSpecifier;
    }
    return undefined;
  }
  if (ts.isExportDeclaration(statement) && !statement.isTypeOnly && statement.moduleSpecifier !== undefined &&
    ts.isStringLiteral(statement.moduleSpecifier) && statement.exportClause !== undefined &&
    ts.isNamespaceExport(statement.exportClause)) {
    const nsName = statement.exportClause.name.text;
    if (requested === undefined || requested === "*" || requested.has(nsName)) {
      return statement.moduleSpecifier;
    }
  }
  return undefined;
}

export function buildModuleExportIndex(
  sourceFiles: readonly ts.SourceFile[],
  packageGraph: PackageModuleGraph | undefined,
  checker: ts.TypeChecker | undefined,
  filesByName: ReadonlyMap<string, ts.SourceFile>
): ModuleExportIndex {
  const summaries = new Map<string, ModuleExportSummary>();
  for (const sourceFile of sourceFiles) {
    summaries.set(sourceFile.fileName, summarizeSourceFile(sourceFile));
  }
  const namespaceDemandedFiles = new Set<string>();
  const requestedByFile = packageGraph?.requestedExportsByFile;
  for (const sourceFile of sourceFiles) {
    const requested = requestedByFile?.get(sourceFile.fileName);
    const effectiveChecker = requested === undefined ? checker : undefined;
    for (const statement of sourceFile.statements) {
      const specifier = namespaceDemandSpecifier(statement, requested);
      if (specifier === undefined) {
        continue;
      }
      const target = resolveSpecifierFile(sourceFile.fileName, specifier, effectiveChecker, packageGraph, filesByName);
      if (target !== undefined) {
        namespaceDemandedFiles.add(target.fileName);
      }
    }
  }
  return { summaries, packageGraph, namespaceDemandedFiles };
}

function resolveNamedExportEntry(
  fileName: string,
  summary: ModuleExportSummary,
  entry: ExportEntry,
  index: ModuleExportIndex,
  checker: ts.TypeChecker | undefined,
  filesByName: ReadonlyMap<string, ts.SourceFile>,
  visited: Set<string>
): ResolvedModuleTarget | undefined {
  if (entry.kind === "defaultExpr") {
    return { fileName, targetName: DEFAULT_EXPORT_BINDING_NAME, isClass: false, classLookupName: "" };
  }
  if (entry.kind === "local") {
    const localDecl = summary.localDecls.get(entry.localName);
    if (localDecl !== undefined) {
      return localDecl;
    }
    const localImport = summary.localImports.get(entry.localName);
    if (localImport === undefined) {
      return { fileName, targetName: entry.localName, isClass: false, classLookupName: "" };
    }
    const targetFile = resolveSpecifierString(fileName, localImport.specifier, index.packageGraph, checker, filesByName);
    if (targetFile === undefined) {
      return undefined;
    }
    if (localImport.kind === "namespace") {
      return { fileName: targetFile.fileName, targetName: MODULE_NAMESPACE_BINDING_NAME, isClass: false, classLookupName: "" };
    }
    return resolveAstExportTarget(targetFile.fileName, localImport.importedName, index, checker, filesByName, visited);
  }
  const targetFile = resolveSpecifierString(fileName, entry.specifier, index.packageGraph, checker, filesByName);
  if (targetFile === undefined) {
    return undefined;
  }
  if (entry.kind === "namespaceReexport") {
    return { fileName: targetFile.fileName, targetName: MODULE_NAMESPACE_BINDING_NAME, isClass: false, classLookupName: "" };
  }
  return resolveAstExportTarget(targetFile.fileName, entry.importedName, index, checker, filesByName, visited);
}

export function resolveAstExportTarget(
  fileName: string,
  exportName: string,
  index: ModuleExportIndex,
  checker: ts.TypeChecker | undefined,
  filesByName: ReadonlyMap<string, ts.SourceFile>,
  visited = new Set<string>()
): ResolvedModuleTarget | undefined {
  const visitKey = `${fileName}\0${exportName}`;
  if (visited.has(visitKey)) {
    return undefined;
  }
  visited.add(visitKey);
  const summary = index.summaries.get(fileName);
  if (summary === undefined) {
    return undefined;
  }
  const entry = summary.namedExports.get(exportName);
  if (entry !== undefined) {
    return resolveNamedExportEntry(fileName, summary, entry, index, checker, filesByName, visited);
  }
  if (exportName === "default") {
    return undefined;
  }
  for (const specifier of summary.starReexports) {
    const targetFile = resolveSpecifierString(fileName, specifier, index.packageGraph, checker, filesByName);
    if (targetFile === undefined) {
      continue;
    }
    const found = resolveAstExportTarget(targetFile.fileName, exportName, index, checker, filesByName, visited);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

export function collectModuleExportEntries(
  fileName: string,
  index: ModuleExportIndex,
  checker: ts.TypeChecker | undefined,
  filesByName: ReadonlyMap<string, ts.SourceFile>,
  visited = new Set<string>()
): readonly { readonly exportName: string; readonly target: ResolvedModuleTarget }[] {
  if (visited.has(fileName)) {
    return [];
  }
  visited.add(fileName);
  const summary = index.summaries.get(fileName);
  if (summary === undefined) {
    return [];
  }
  const results = new Map<string, ResolvedModuleTarget>();
  for (const exportName of summary.namedExports.keys()) {
    const target = resolveAstExportTarget(fileName, exportName, index, checker, filesByName);
    if (target !== undefined) {
      results.set(exportName, target);
    }
  }
  for (const specifier of summary.starReexports) {
    const targetFile = resolveSpecifierString(fileName, specifier, index.packageGraph, checker, filesByName);
    if (targetFile === undefined) {
      continue;
    }
    for (const entry of collectModuleExportEntries(targetFile.fileName, index, checker, filesByName, visited)) {
      if (entry.exportName !== "default" && !results.has(entry.exportName)) {
        results.set(entry.exportName, entry.target);
      }
    }
  }
  return [...results.entries()].map(([exportName, target]) => ({ exportName, target }));
}
