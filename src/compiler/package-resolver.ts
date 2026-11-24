import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import type { CompilerDiagnostic } from "./diagnostics.js";
import type { PackageModuleGraph } from "./ir/module.js";

interface PackageResolutionResult {
  readonly packageSourceFiles: readonly ts.SourceFile[];
  readonly packageGraph: PackageModuleGraph;
  readonly diagnostics: readonly CompilerDiagnostic[];
}

interface PackageJsonData {
  readonly exports?: unknown;
  readonly module?: unknown;
  readonly main?: unknown;
}

const exportConditions: readonly string[] = ["module", "import", "default"];
const relativeExtensions: readonly string[] = ["", ".js", ".mjs", "/index.js", "/index.mjs"];

function isRegularFile(filePath: string): boolean {
  if (!existsSync(filePath)) {
    return false;
  }
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function canonicalFilePath(filePath: string): string {
  try {
    return realpathSync(filePath);
  } catch {
    return path.resolve(filePath);
  }
}

function resolveFileCandidate(basePath: string): string | undefined {
  for (const suffix of relativeExtensions) {
    const candidate = suffix.startsWith("/") ? path.join(basePath, suffix.slice(1)) : `${basePath}${suffix}`;
    if (isRegularFile(candidate)) {
      return canonicalFilePath(candidate);
    }
  }
  return undefined;
}

function splitBareSpecifier(specifier: string): { readonly packageName: string; readonly subpath: string } {
  const parts = specifier.split("/");
  if (specifier.startsWith("@") && parts.length >= 2) {
    const [scope, name, ...rest] = parts;
    return {
      packageName: `${scope}/${name}`,
      subpath: rest.length > 0 ? `./${rest.join("/")}` : "."
    };
  }
  const [name, ...rest] = parts;
  return {
    packageName: name,
    subpath: rest.length > 0 ? `./${rest.join("/")}` : "."
  };
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveConditionTarget(entry: unknown): string | undefined {
  if (typeof entry === "string") {
    return entry;
  }
  if (Array.isArray(entry)) {
    for (const item of entry) {
      const resolved = resolveConditionTarget(item);
      if (resolved !== undefined) {
        return resolved;
      }
    }
    return undefined;
  }
  if (!isObjectRecord(entry)) {
    return undefined;
  }
  for (const condition of exportConditions) {
    if (Object.hasOwn(entry, condition)) {
      const resolved = resolveConditionTarget(entry[condition]);
      if (resolved !== undefined) {
        return resolved;
      }
    }
  }
  return undefined;
}

function resolveSubpathExport(exportsField: unknown, subpath: string): string | undefined {
  if (typeof exportsField === "string") {
    return subpath === "." ? exportsField : undefined;
  }
  if (!isObjectRecord(exportsField)) {
    return undefined;
  }
  const keys = Object.keys(exportsField);
  const isSubpathMap = keys.some((key) => key.startsWith("."));
  if (!isSubpathMap) {
    return subpath === "." ? resolveConditionTarget(exportsField) : undefined;
  }
  if (Object.hasOwn(exportsField, subpath)) {
    return resolveConditionTarget(exportsField[subpath]);
  }
  for (const key of keys) {
    const starIndex = key.indexOf("*");
    if (starIndex === -1) {
      continue;
    }
    const prefix = key.slice(0, starIndex);
    const suffix = key.slice(starIndex + 1);
    if (subpath.startsWith(prefix) && subpath.endsWith(suffix) && subpath.length >= prefix.length + suffix.length) {
      const matched = subpath.slice(prefix.length, subpath.length - suffix.length);
      const target = resolveConditionTarget(exportsField[key]);
      if (target !== undefined) {
        return target.replace("*", matched);
      }
    }
  }
  return undefined;
}

function readPackageJson(packageJsonPath: string, cache: Map<string, PackageJsonData | undefined>): PackageJsonData | undefined {
  if (cache.has(packageJsonPath)) {
    return cache.get(packageJsonPath);
  }
  if (!isRegularFile(packageJsonPath)) {
    cache.set(packageJsonPath, undefined);
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    const data: PackageJsonData | undefined = isObjectRecord(parsed)
      ? { exports: parsed.exports, module: parsed.module, main: parsed.main }
      : undefined;
    cache.set(packageJsonPath, data);
    return data;
  } catch {
    cache.set(packageJsonPath, undefined);
    return undefined;
  }
}

function resolveInPackageDir(packageDir: string, subpath: string, pkg: PackageJsonData): string | undefined {
  if (pkg.exports !== undefined) {
    const exportedTarget = resolveSubpathExport(pkg.exports, subpath);
    if (exportedTarget !== undefined) {
      const resolved = resolveFileCandidate(path.resolve(packageDir, exportedTarget));
      if (resolved !== undefined) {
        return resolved;
      }
    }
  }
  if (subpath === ".") {
    if (typeof pkg.module === "string") {
      const resolved = resolveFileCandidate(path.resolve(packageDir, pkg.module));
      if (resolved !== undefined) {
        return resolved;
      }
    }
    if (typeof pkg.main === "string") {
      const resolved = resolveFileCandidate(path.resolve(packageDir, pkg.main));
      if (resolved !== undefined) {
        return resolved;
      }
    }
    return resolveFileCandidate(path.join(packageDir, "index.js"));
  }
  return resolveFileCandidate(path.resolve(packageDir, subpath));
}

function resolveEsmSpecifier(
  specifier: string,
  fromFile: string,
  packageJsonCache: Map<string, PackageJsonData | undefined>
): string | undefined {
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    return resolveFileCandidate(path.resolve(path.dirname(fromFile), specifier));
  }
  const { packageName, subpath } = splitBareSpecifier(specifier);
  let currentDir = path.dirname(path.resolve(fromFile));
  for (;;) {
    const packageDir = path.join(currentDir, "node_modules", packageName);
    const pkg = readPackageJson(path.join(packageDir, "package.json"), packageJsonCache);
    if (pkg !== undefined) {
      const resolved = resolveInPackageDir(packageDir, subpath, pkg);
      if (resolved !== undefined) {
        return resolved;
      }
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return undefined;
    }
    currentDir = parentDir;
  }
}

function specifierKey(importerFileName: string, specifier: string): string {
  return `${importerFileName}\0${specifier}`;
}

function sourceSpan(sourceFile: ts.SourceFile, position: number) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(position);
  return { fileName: sourceFile.fileName, line: line + 1, column: character + 1 };
}

function demandedFromImportClause(importClause: ts.ImportClause | undefined): ReadonlySet<string> | "*" {
  if (importClause === undefined) {
    return new Set();
  }
  const { namedBindings } = importClause;
  if (namedBindings !== undefined && ts.isNamespaceImport(namedBindings)) {
    return "*";
  }
  const names = new Set<string>();
  if (importClause.name !== undefined) {
    names.add("default");
  }
  if (namedBindings !== undefined && ts.isNamedImports(namedBindings)) {
    for (const element of namedBindings.elements) {
      if (!element.isTypeOnly) {
        names.add(element.propertyName?.text ?? element.name.text);
      }
    }
  }
  return names;
}

function demandedFromExportClause(
  exportClause: ts.NamedExportBindings | undefined,
  requested: ReadonlySet<string> | "*"
): ReadonlySet<string> | "*" | undefined {
  if (exportClause === undefined) {
    return requested === "*" || requested.size > 0 ? requested : undefined;
  }
  if (ts.isNamespaceExport(exportClause)) {
    return requested === "*" || requested.has(exportClause.name.text) ? "*" : undefined;
  }
  const names = new Set<string>();
  for (const element of exportClause.elements) {
    if (!element.isTypeOnly && (requested === "*" || requested.has(element.name.text))) {
      names.add(element.propertyName?.text ?? element.name.text);
    }
  }
  return names.size > 0 ? names : undefined;
}

function mergeDemand(
  requestedByFile: Map<string, Set<string> | "*">,
  filePath: string,
  demand: ReadonlySet<string> | "*"
): boolean {
  const existing = requestedByFile.get(filePath);
  if (existing === undefined) {
    requestedByFile.set(filePath, demand === "*" ? "*" : new Set(demand));
    return true;
  }
  if (existing === "*") {
    return false;
  }
  if (demand === "*") {
    requestedByFile.set(filePath, "*");
    return true;
  }
  let changed = false;
  for (const name of demand) {
    if (!existing.has(name)) {
      existing.add(name);
      changed = true;
    }
  }
  return changed;
}

function unresolvedPackageDiagnostic(sourceFile: ts.SourceFile, specifierNode: ts.StringLiteral): CompilerDiagnostic {
  return {
    code: "TSCN1001",
    category: "error",
    message: `Cannot resolve package import: ${specifierNode.text}`,
    span: sourceSpan(sourceFile, specifierNode.getStart(sourceFile))
  };
}

function statementModuleDemand(
  statement: ts.Statement,
  requested: ReadonlySet<string> | "*"
): { readonly specifierNode: ts.StringLiteral; readonly demand: ReadonlySet<string> | "*" } | undefined {
  if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
    if (statement.importClause?.phaseModifier === ts.SyntaxKind.TypeKeyword) {
      return undefined;
    }
    return { specifierNode: statement.moduleSpecifier, demand: demandedFromImportClause(statement.importClause) };
  }
  if (ts.isExportDeclaration(statement) && !statement.isTypeOnly && statement.moduleSpecifier !== undefined && ts.isStringLiteral(statement.moduleSpecifier)) {
    const demand = demandedFromExportClause(statement.exportClause, requested);
    if (demand !== undefined) {
      return { specifierNode: statement.moduleSpecifier, demand };
    }
  }
  return undefined;
}

/**
 * Resolves all reachable ESM package modules referenced by `userSourceFiles` via `node_modules`,
 * tracking demanded export names per package file so unused barrel re-exports are pruned.
 */
export function resolvePackageModules(
  userSourceFiles: readonly ts.SourceFile[],
  supportedBuiltins: ReadonlySet<string>
): PackageResolutionResult {
  const packageJsonCache = new Map<string, PackageJsonData | undefined>();
  const resolvedSpecifiers = new Map<string, string>();
  const requestedByFile = new Map<string, Set<string> | "*">();
  const parsedPackageFiles = new Map<string, ts.SourceFile>();
  const diagnostics: CompilerDiagnostic[] = [];
  const reportedUnresolved = new Set<string>();
  const worklist: string[] = [];

  const enqueueDemand = (filePath: string, demand: ReadonlySet<string> | "*"): void => {
    if (mergeDemand(requestedByFile, filePath, demand)) {
      worklist.push(filePath);
    }
  };

  const inspectFile = (sourceFile: ts.SourceFile, isUserFile: boolean): void => {
    const requested: ReadonlySet<string> | "*" = isUserFile ? "*" : (requestedByFile.get(sourceFile.fileName) ?? new Set());
    for (const statement of sourceFile.statements) {
      const ref = statementModuleDemand(statement, requested);
      if (ref === undefined) {
        continue;
      }
      const specifier = ref.specifierNode.text;
      if (supportedBuiltins.has(specifier) || (isUserFile && (specifier.startsWith(".") || specifier.startsWith("/")))) {
        continue;
      }
      const key = specifierKey(sourceFile.fileName, specifier);
      const target = resolvedSpecifiers.get(key) ?? resolveEsmSpecifier(specifier, sourceFile.fileName, packageJsonCache);
      if (target === undefined) {
        if (!reportedUnresolved.has(key)) {
          reportedUnresolved.add(key);
          diagnostics.push(unresolvedPackageDiagnostic(sourceFile, ref.specifierNode));
        }
        continue;
      }
      resolvedSpecifiers.set(key, target);
      enqueueDemand(target, ref.demand);
    }
  };

  for (const userFile of userSourceFiles) {
    inspectFile(userFile, true);
  }

  while (worklist.length > 0) {
    const filePath = worklist.shift();
    if (filePath === undefined) {
      continue;
    }
    let sourceFile = parsedPackageFiles.get(filePath);
    if (sourceFile === undefined) {
      const content = readFileSync(filePath, "utf8");
      sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.ES2023, true, ts.ScriptKind.JS);
      parsedPackageFiles.set(filePath, sourceFile);
    }
    inspectFile(sourceFile, false);
  }

  return {
    packageSourceFiles: [...parsedPackageFiles.values()],
    packageGraph: { resolvedSpecifiers, requestedExportsByFile: requestedByFile },
    diagnostics
  };
}
