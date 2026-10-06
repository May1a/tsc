// Check the runtime import graph after TypeScript erases type-only edges.
// Recursive lowering and emission belong on their contexts, never in module initialization.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

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

const files = [...filesUnder("src/compiler/ir"), ...filesUnder("src/compiler/llvm")];
const included = new Set(files);
const graph = new Map(files.map((file) => [file, runtimeImports(file).filter((dependency) => included.has(dependency))]));
const cycles = checkCycles(graph);
if (cycles.length > 0) {
  for (const cycle of cycles) {
    console.error(`Runtime import cycle: ${cycle.map((file) => path.relative(process.cwd(), file)).join(" -> ")}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Compiler boundaries checked, ${files.length} modules, no runtime import cycles.`);
}
