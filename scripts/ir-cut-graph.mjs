// Measure the declaration graph of a compiler module with TypeScript's symbol resolver.
// Prints strongly connected components and the external callers of the largest component.
// Declaration extents exclude the comments and blank lines between declarations.
//
//   node scripts/ir-cut-graph.mjs [file]
import ts from "typescript";

const file = process.argv[2] ?? "src/compiler/ir/value-expressions.ts";

const program = ts.createProgram([file], {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: true,
});
const checker = program.getTypeChecker();
const sourceFile = program.getSourceFile(file);
if (sourceFile === undefined) throw new Error(`${file} is not in the program`);

/** @type {Map<string, ts.Declaration>} */
const declarations = new Map();
/** @param {string | undefined} name @param {ts.Declaration} declaration */
const record = (name, declaration) => { if (name !== undefined) declarations.set(name, declaration); };
for (const statement of sourceFile.statements) {
  if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) record(statement.name?.text, statement);
  else if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement) || ts.isEnumDeclaration(statement)) record(statement.name.text, statement);
  else if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) { record(declaration.name.text, statement); }
    }
  }
}
if (declarations.size === 0) {
  console.log(`${file}: no local declarations`);
  process.exit(0);
}

/** @type {Map<ts.Declaration, string>} */
const nameOf = new Map([...declarations].map(([name, declaration]) => [declaration, name]));

// An imported name is not a sibling, so a reference to one does not make a declaration load-bearing here.
/** @type {Set<string>} */
const imported = new Set();
for (const statement of sourceFile.statements) {
  if (!ts.isImportDeclaration(statement) || statement.importKind === ts.ImportKind.Type) continue;
  const bindings = statement.importClause?.namedBindings;
  if (bindings !== undefined && ts.isNamedImports(bindings)) {
    for (const element of bindings.elements) imported.add(element.name.text);
  }
}

/** @type {Map<string, Set<string>>} */
const references = new Map();
for (const [name, declaration] of declarations) {
  const referenced = new Set();
  const visit = (node) => {
    if (ts.isIdentifier(node) && node.text !== name) {
      const target = nameOf.get(checker.getSymbolAtLocation(node)?.declarations?.[0]);
      if (target !== undefined && target !== name && !imported.has(target)) {
        referenced.add(target);
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(declaration, visit);
  references.set(name, referenced);
}

/** @param {string} name @returns {number} */
const linesOf = (name) => {
  const declaration = declarations.get(name);
  let count = 0;
  for (let at = declaration.getStart(sourceFile); at < declaration.end; at += 1) {
    if (sourceFile.text[at] === "\n") count += 1;
  }
  return count + 1;
};

// Tarjan, iterative in the sense that matters here: a 185-declaration component recursing in JS is fine.
let counter = 0;
/** @type {Map<string, number>} */
const indices = new Map();
/** @type {Map<string, number>} */
const lowLinks = new Map();
/** @type {string[]} */
const stack = [];
/** @type {Set<string>} */
const onStack = new Set();
/** @type {string[][]} */
const components = [];
/** @param {string} name */
const strongConnect = (name) => {
  indices.set(name, counter); lowLinks.set(name, counter); counter += 1;
  stack.push(name); onStack.add(name);
  for (const next of references.get(name)) {
    if (!indices.has(next)) { strongConnect(next); lowLinks.set(name, Math.min(lowLinks.get(name), lowLinks.get(next))); }
    else if (onStack.has(next)) lowLinks.set(name, Math.min(lowLinks.get(name), indices.get(next)));
  }
  if (lowLinks.get(name) !== indices.get(name)) return;
  const component = [];
  for (let member = stack.pop(); ; member = stack.pop()) {
    onStack.delete(member); component.push(member);
    if (member === name) break;
  }
  components.push(component);
};
for (const name of declarations.keys()) if (!indices.has(name)) strongConnect(name);
/** @param {string[]} component @returns {number} */
const sizeOf = (component) => component.reduce((total, name) => total + linesOf(name), 0);
/** @param {string[]} names @returns {number} */
const sumLines = (names) => names.reduce((total, name) => total + linesOf(name), 0);
components.sort((a, b) => sizeOf(b) - sizeOf(a));

console.log(`${file}: ${declarations.size} declarations, ${sumLines([...declarations.keys()])} lines, ${components.length} components`);
console.log("largest components:");
const largestToReport = 8;
for (const component of components.slice(0, largestToReport)) {
  console.log(`  ${component.length} decls, ${sizeOf(component)} lines`);
}

/** @type {Set<string>} */
const root = new Set(components[0]);
console.log(`\nentries into the root component (${components[0].length} decls, ${sizeOf(components[0])} lines), called from outside it:`);
for (const name of components[0]) {
  const callers = [];
  for (const [from, to] of references) if (to.has(name) && !root.has(from)) callers.push(from);
  if (callers.length > 0) console.log(`  ${name}  <- ${callers.join(", ")}`);
}
