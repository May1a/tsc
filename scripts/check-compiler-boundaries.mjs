// Check the runtime import graph after TypeScript erases type-only edges.
// Recursive entries belong on pass capabilities, never in module initialization.
import { readFileSync, readdirSync } from "node:fs";
import { isBuiltin } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(import.meta.dirname, "..");
const irModelFiles = new Set([
  "operation-bindings.ts", "bindings.ts", "expressions.ts", "lowered.ts", "module.ts", "types.ts", "visit.ts",
]);
const compilerModelFiles = new Set(["diagnostics.ts", "dispatch.ts", "symbols.ts", "target.ts", "types.ts"]);
const permittedLayers = {
  "Compiler model": new Set(["Compiler model"]),
  "Trace model": new Set(["IR model"]),
  "IR model": new Set(["IR model"]),
  Lowering: new Set(["IR model", "Lowering"]),
  "Binding resolution": new Set(["IR model", "Binding resolution"]),
  "Native lowering": new Set(["Binding resolution", "Native lowering", "LLVM builder", "JsValue ABI", "Runtime contracts", "Runtime construction", "GC verification", "Trace model"]),
  "GC verification": new Set(["GC verification", "LLVM builder", "Runtime contracts"]),
  "Runtime construction": new Set(["LLVM builder", "JsValue ABI", "Runtime contracts"]),
  "Runtime contracts": new Set(["Runtime contracts", "LLVM builder"]),
  "LLVM builder": new Set(["LLVM builder"]),
  "JsValue ABI": new Set(["JsValue ABI", "LLVM builder"]),
};
const boundaryModules = new Set(["entry.ts", "frontend.ts", "pipeline.ts", "linker.ts", "toolchain.ts", "runtime-files.ts", "live-layer.ts", "errors.ts"]);

function layerOf(file) {
  const relative = file.replaceAll(path.sep, "/");
  if (compilerModelFiles.has(relative.slice("src/compiler/".length)) && relative.startsWith("src/compiler/")) {
    return "Compiler model";
  }
  if (relative === "src/compiler/trace.ts") {
    return "Trace model";
  }
  if (relative === "src/compiler/runtime-ir.ts") {
    return "Runtime construction";
  }
  if (relative.startsWith("src/compiler/ir/")) {
    return irModelFiles.has(relative.slice("src/compiler/ir/".length)) ? "IR model" : "Lowering";
  }
  if (relative.startsWith("src/compiler/llvm-ir/")) {
    return "LLVM builder";
  }
  if (relative.startsWith("src/compiler/binding-resolution/")) {
    return "Binding resolution";
  }
  if (relative.startsWith("src/compiler/native-lowering/")) {
    return "Native lowering";
  }
  if (relative.startsWith("src/compiler/runtime-contracts/")) {
    return "Runtime contracts";
  }
  if (relative.startsWith("src/compiler/gc-liveness/")) {
    return "GC verification";
  }
  if (relative.startsWith("src/compiler/js-value-abi/")) {
    return "JsValue ABI";
  }
  return;
}

export function checkLayerImport(file, specifier, runtime = true) {
  const layer = layerOf(file);
  if (layer === undefined) {
    return;
  }
  if (/^typescript(?:\/|$)/.test(specifier) && layer !== "Lowering") {
    const model = layer === "Native lowering" ? "resolved bindings" : "the IR model";
    return `${layer} must not depend on the TypeScript AST. Consume ${model} instead.`;
  }
  if (!specifier.startsWith(".")) {
    return runtime && (isBuiltin(specifier) || /^(?:effect(?:\/|$)|@effect\/)/.test(specifier))
      ? `${layer} is pure. Move filesystem, process, and Effect work to a compiler boundary.`
      : undefined;
  }
  const dependency = path.normalize(path.join(path.dirname(file), specifier)).replace(/\.js$/, ".ts");
  if (/^src[/\\]compiler[/\\]llvm[/\\]/.test(dependency)) {
    return `${layer} must not import the removed text LLVM backend. Use Native lowering and the LLVM builder.`;
  }
  const dependencyLayer = layerOf(dependency);
  if (dependencyLayer !== undefined && dependencyLayer !== "Compiler model" && !permittedLayers[layer].has(dependencyLayer)) {
    return `${layer} must not import ${dependencyLayer}. Move shared IR classification into the IR model.`;
  }
  if (dependency === path.join("src", "compiler", "ir.ts")) {
    return `${layer} must import IR model modules directly. ir.ts also exports the Lowering entry point.`;
  }
  if (path.dirname(dependency) === path.join("src", "compiler") && boundaryModules.has(path.basename(dependency))) {
    return `${layer} must not depend on compiler boundary ${path.basename(dependency)}.`;
  }
  return;
}

function importDependency(node) {
  if (ts.isImportDeclaration(node)) {
    const clause = node.importClause;
    const runtime = clause === undefined || clause.phaseModifier !== ts.SyntaxKind.TypeKeyword &&
      (clause.name !== undefined || clause.namedBindings === undefined || ts.isNamespaceImport(clause.namedBindings) ||
        clause.namedBindings.elements.some((element) => !element.isTypeOnly));
    return { specifier: node.moduleSpecifier, runtime };
  }
  if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
    const runtime = !node.isTypeOnly && (node.exportClause === undefined || ts.isNamespaceExport(node.exportClause) ||
      node.exportClause.elements.some((element) => !element.isTypeOnly));
    return { specifier: node.moduleSpecifier, runtime };
  }
  if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    return { specifier: node.arguments.at(0), runtime: true };
  }
  if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
    return { specifier: node.argument.literal, runtime: false };
  }
  return;
}

export function scanLayerImports(file, sourceText) {
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true);
  const findings = [];
  function visit(node) {
    const dependency = importDependency(node);
    const specifier = dependency?.specifier;
    if (specifier !== undefined && ts.isStringLiteral(specifier)) {
      const message = checkLayerImport(file, specifier.text, dependency.runtime);
      if (message !== undefined) {
        const { line, character } = source.getLineAndCharacterOfPosition(specifier.getStart(source));
        findings.push({ file, line: line + 1, column: character + 1, rule: "no-layer-mixing", message });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return findings;
}

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return filesUnder(file);
    }
    if (file.endsWith(".ts")) {
      return [path.resolve(file)];
    }
    return [];
  });
}

function runtimeImports(file) {
  const { outputText } = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: true },
  });
  const source = ts.createSourceFile(file, outputText, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  return source.statements.flatMap((statement) => {
    if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) {
      return [];
    }
    const { moduleSpecifier } = statement;
    if (moduleSpecifier === undefined || !ts.isStringLiteral(moduleSpecifier) || !moduleSpecifier.text.startsWith(".")) {
      return [];
    }
    return [path.resolve(path.dirname(file), moduleSpecifier.text.replace(/\.js$/, ".ts"))];
  });
}

function checkCycles(graph) {
  const visited = new Set();
  const active = [];
  const cycles = [];
  function visit(file) {
    const index = active.indexOf(file);
    if (index !== -1) {
      cycles.push([...active.slice(index), file]);
      return;
    }
    if (visited.has(file)) {
      return;
    }
    active.push(file);
    for (const dependency of graph.get(file) ?? []) {
      visit(dependency);
    }
    active.pop();
    visited.add(file);
  }
  for (const file of graph.keys()) {
    visit(file);
  }
  return cycles;
}

function checkRepository() {
  const files = filesUnder(path.join(repoRoot, "src/compiler"))
    .filter((file) => layerOf(path.relative(repoRoot, file)) !== undefined);
  const findings = files.flatMap((file) => scanLayerImports(path.relative(repoRoot, file), readFileSync(file, "utf8")));
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line}:${finding.column}: ${finding.rule}: ${finding.message}`);
  }
  const included = new Set(files);
  const graph = new Map(files.map((file) => [file, runtimeImports(file).filter((dependency) => included.has(dependency))]));
  const cycles = checkCycles(graph);
  if (cycles.length > 0 || findings.length > 0) {
    for (const cycle of cycles) {
      console.error(`Runtime import cycle: ${cycle.map((file) => path.relative(process.cwd(), file)).join(" -> ")}`);
    }
    process.exitCode = 1;
  } else {
    console.log(`Compiler boundaries checked, ${files.length} modules, no layer mixing or runtime import cycles.`);
  }
}

const entryPoint = process.argv.slice(1, 2).at(0);
if (entryPoint !== undefined && pathToFileURL(path.resolve(entryPoint)).href === import.meta.url) {
  checkRepository();
}
