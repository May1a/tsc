// Detect exported declarations in src/ with no importers across src/, test/, or scripts/.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(import.meta.dirname, "..");

/** @param {ts.Node} node */
function hasExportModifier(node) {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false);
}

/** @param {ts.SourceFile} source */
function collectDeclaredExports(source) {
  const exports = [];
  /** @param {string} name @param {ts.Node} node */
  const add = (name, node) => {
    const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
    exports.push({ name, line: line + 1, column: character + 1 });
  };
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier === undefined && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        add(element.name.text, element);
      }
      continue;
    }
    if (!hasExportModifier(statement)) {
      continue;
    }
    if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isInterfaceDeclaration(statement)
      || ts.isTypeAliasDeclaration(statement) || ts.isEnumDeclaration(statement)) && statement.name !== undefined) {
      add(statement.name.text, statement.name);
    } else if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          add(decl.name.text, decl.name);
        }
      }
    }
  }
  return exports;
}

/** @param {string} fromFile @param {string} specifier @param {Set<string>} knownFiles @returns {string} */
function resolveImportTarget(fromFile, specifier, knownFiles) {
  if (!specifier.startsWith(".")) {
    return "";
  }
  const base = path.resolve(path.dirname(fromFile), specifier.replace(/\.js$/, ".ts"));
  if (knownFiles.has(base)) {
    return base;
  }
  const indexCandidate = path.join(base, "index.ts");
  if (knownFiles.has(indexCandidate)) {
    return indexCandidate;
  }
  return "";
}

/** @param {Map<string, Set<string>>} map @param {string} key */
function getOrCreateSet(map, key) {
  const existing = map.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const created = new Set();
  map.set(key, created);
  return created;
}

/**
 * @param {string} fromFile
 * @param {ts.ImportDeclaration | ts.ExportDeclaration} node
 * @param {Set<string>} knownFiles
 * @param {Map<string, Set<string>>} usedByFile
 * @param {Array<{ barrel: string; target: string; wildcard: boolean; map: Map<string, string> }>} reexportEdges
 */
function recordImportEdge(fromFile, node, knownFiles, usedByFile, reexportEdges) {
  const specifier = node.moduleSpecifier;
  if (specifier === undefined || !ts.isStringLiteral(specifier)) {
    return;
  }
  const target = resolveImportTarget(fromFile, specifier.text, knownFiles);
  if (target === "") {
    return;
  }
  if (ts.isImportDeclaration(node)) {
    recordImportBindings(node, getOrCreateSet(usedByFile, target));
    return;
  }
  recordExportEdge(fromFile, target, node, reexportEdges);
}

/** @param {ts.ImportDeclaration} node @param {Set<string>} used */
function recordImportBindings(node, used) {
  const clause = node.importClause;
  if (clause === undefined) {
    used.add("*");
    return;
  }
  if (clause.name !== undefined) {
    used.add("default");
  }
  const bindings = clause.namedBindings;
  if (bindings === undefined) {
    return;
  }
  if (ts.isNamespaceImport(bindings)) {
    used.add("*");
    return;
  }
  for (const element of bindings.elements) {
    used.add((element.propertyName ?? element.name).text);
  }
}

/**
 * @param {string} fromFile
 * @param {string} target
 * @param {ts.ExportDeclaration} node
 * @param {Array<{ barrel: string; target: string; wildcard: boolean; map: Map<string, string> }>} reexportEdges
 */
function recordExportEdge(fromFile, target, node, reexportEdges) {
  const clause = node.exportClause;
  if (clause === undefined || ts.isNamespaceExport(clause)) {
    reexportEdges.push({ barrel: fromFile, target, wildcard: true, map: new Map() });
    return;
  }
  const map = new Map();
  for (const element of clause.elements) {
    map.set(element.name.text, (element.propertyName ?? element.name).text);
  }
  reexportEdges.push({ barrel: fromFile, target, wildcard: false, map });
}

/**
 * @param {Map<string, ts.SourceFile>} sources
 * @param {Set<string>} knownFiles
 */
function collectUsageGraph(sources, knownFiles) {
  /** @type {Map<string, Set<string>>} */
  const usedByFile = new Map();
  /** @type {Array<{ barrel: string; target: string; wildcard: boolean; map: Map<string, string> }>} */
  const reexportEdges = [];
  for (const [file, source] of sources) {
    for (const statement of source.statements) {
      if (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) {
        recordImportEdge(file, statement, knownFiles, usedByFile, reexportEdges);
      }
    }
    collectImportTypes(file, source, knownFiles, usedByFile);
  }
  return { usedByFile, reexportEdges };
}

/**
 * @param {string} file
 * @param {ts.SourceFile} source
 * @param {Set<string>} knownFiles
 * @param {Map<string, Set<string>>} usedByFile
 */
function collectImportTypes(file, source, knownFiles, usedByFile) {
  /** @param {ts.Node} node */
  const visit = (node) => {
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      const target = resolveImportTarget(file, node.argument.literal.text, knownFiles);
      if (target !== "") {
        getOrCreateSet(usedByFile, target).add("*");
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);
}

/**
 * @param {Array<{ barrel: string; target: string; wildcard: boolean; map: Map<string, string> }>} reexportEdges
 * @param {Map<string, Set<string>>} usedByFile
 * @param {Set<string>} entryFiles
 */
function propagateReexports(reexportEdges, usedByFile, entryFiles) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of reexportEdges) {
      if (propagateEdge(edge, usedByFile, entryFiles)) {
        changed = true;
      }
    }
  }
}

/**
 * @param {{ barrel: string; target: string; wildcard: boolean; map: Map<string, string> }} edge
 * @param {Map<string, Set<string>>} usedByFile
 * @param {Set<string>} entryFiles
 */
function propagateEdge(edge, usedByFile, entryFiles) {
  const barrelUsed = usedByFile.get(edge.barrel);
  if (barrelUsed === undefined && !entryFiles.has(edge.barrel)) {
    return false;
  }
  const targetUsed = getOrCreateSet(usedByFile, edge.target);
  if (entryFiles.has(edge.barrel) || barrelUsed?.has("*")) {
    return propagateAllFromEdge(edge, targetUsed);
  }
  let changed = false;
  for (const name of barrelUsed ?? []) {
    const original = edge.wildcard ? name : edge.map.get(name);
    if (original !== undefined && !targetUsed.has(original)) {
      targetUsed.add(original);
      changed = true;
    }
  }
  return changed;
}

/**
 * @param {{ wildcard: boolean; map: Map<string, string> }} edge
 * @param {Set<string>} targetUsed
 */
function propagateAllFromEdge(edge, targetUsed) {
  if (edge.wildcard) {
    if (targetUsed.has("*")) {
      return false;
    }
    targetUsed.add("*");
    return true;
  }
  let changed = false;
  for (const original of edge.map.values()) {
    if (!targetUsed.has(original)) {
      targetUsed.add(original);
      changed = true;
    }
  }
  return changed;
}

/**
 * @param {Record<string, string>} sourceTexts
 * @param {{ checkedFiles?: readonly string[]; entryFiles?: readonly string[] }} [options]
 */
export function scanDeadExports(sourceTexts, options = {}) {
  const checkedFiles = new Set((options.checkedFiles ?? Object.keys(sourceTexts)).map((f) => path.resolve(f)));
  const entryFiles = new Set((options.entryFiles ?? []).map((f) => path.resolve(f)));
  const knownFiles = new Set(Object.keys(sourceTexts).map((f) => path.resolve(f)));
  const sources = new Map(Object.entries(sourceTexts).map(([file, text]) => {
    const resolved = path.resolve(file);
    return [resolved, ts.createSourceFile(resolved, text, ts.ScriptTarget.Latest, true)];
  }));

  const { usedByFile, reexportEdges } = collectUsageGraph(sources, knownFiles);
  propagateReexports(reexportEdges, usedByFile, entryFiles);
  return collectFindings(checkedFiles, entryFiles, sources, usedByFile);
}

/**
 * @param {Set<string>} checkedFiles
 * @param {Set<string>} entryFiles
 * @param {Map<string, ts.SourceFile>} sources
 * @param {Map<string, Set<string>>} usedByFile
 */
function collectFindings(checkedFiles, entryFiles, sources, usedByFile) {
  const findings = [];
  for (const file of checkedFiles) {
    if (entryFiles.has(file)) {
      continue;
    }
    const source = sources.get(file);
    const used = usedByFile.get(file);
    if (source === undefined || used?.has("*")) {
      continue;
    }
    for (const exp of collectDeclaredExports(source)) {
      if (used === undefined || !used.has(exp.name)) {
        findings.push({
          file,
          line: exp.line,
          column: exp.column,
          rule: "no-dead-export",
          message: `Export '${exp.name}' is never imported by any module or test. Remove 'export' or delete it.`
        });
      }
    }
  }
  return findings;
}

/** @param {string} directory @param {readonly string[]} extensions @returns {string[]} */
function filesUnder(directory, extensions) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return filesUnder(file, extensions);
    }
    if (extensions.some((ext) => file.endsWith(ext))) {
      return [path.resolve(file)];
    }
    return [];
  });
}

/** @param {string} file */
function isEntryModule(file) {
  if (file.includes(`${path.sep}test262${path.sep}`)) {
    return true;
  }
  return file.includes(`${path.sep}runtime-contracts${path.sep}`);
}

function checkRepository() {
  const srcFiles = filesUnder(path.join(repoRoot, "src"), [".ts"]);
  const testFiles = filesUnder(path.join(repoRoot, "test"), [".ts"]).filter((f) => !f.includes(`${path.sep}fixtures${path.sep}`));
  const scriptFiles = filesUnder(path.join(repoRoot, "scripts"), [".mjs", ".ts"]);
  const allFiles = [...srcFiles, ...testFiles, ...scriptFiles];
  const texts = Object.fromEntries(allFiles.map((file) => [file, readFileSync(file, "utf8")]));
  const entryFiles = [path.join(repoRoot, "src/cli/main.ts"), ...srcFiles.filter(isEntryModule)];
  const checkedFiles = srcFiles.filter((file) => !file.endsWith(`${path.sep}index.ts`));
  const findings = scanDeadExports(texts, { checkedFiles, entryFiles });
  for (const finding of findings) {
    console.error(`${path.relative(repoRoot, finding.file)}:${finding.line}:${finding.column}: ${finding.rule}: ${finding.message}`);
  }
  if (findings.length > 0) {
    process.exitCode = 1;
  } else {
    console.log(`Checked ${checkedFiles.length} source modules, no dead exports.`);
  }
}

const entryPoint = process.argv.slice(1, 2).at(0);
if (entryPoint !== undefined && pathToFileURL(path.resolve(entryPoint)).href === import.meta.url) {
  checkRepository();
}
