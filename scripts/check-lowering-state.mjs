import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(import.meta.dirname, "..");
const mutators = new Set(["set", "add", "delete", "clear", "push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "copyWithin"]);

function rootIdentifier(expression) {
  if (ts.isIdentifier(expression)) {
    return expression;
  }
  if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression) || ts.isParenthesizedExpression(expression)) {
    return rootIdentifier(expression.expression);
  }
  return;
}

function assignmentTarget(node) {
  if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
    node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
    return node.left;
  }
  if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
    (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)) {
    return node.operand;
  }
  if (ts.isDeleteExpression(node)) {
    return node.expression;
  }
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && mutators.has(node.expression.name.text)) {
    return node.expression.expression;
  }
  return;
}

function globalVariables(sources, checker) {
  const symbols = new Set();
  for (const source of sources) {
    for (const statement of source.statements) {
      if (!ts.isVariableStatement(statement)) {
        continue;
      }
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          symbols.add(checker.getSymbolAtLocation(declaration.name));
        }
      }
    }
  }
  return symbols;
}

function resolveSymbol(identifier, checker, globals, visited = new Set()) {
  const symbol = checker.getSymbolAtLocation(identifier);
  if (symbol === undefined || visited.has(symbol)) {
    return false;
  }
  visited.add(symbol);
  const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  if (globals.has(target)) {
    return true;
  }
  return (target.declarations ?? []).some((declaration) => {
    if (!ts.isVariableDeclaration(declaration) || declaration.initializer === undefined) {
      return false;
    }
    const root = rootIdentifier(declaration.initializer);
    return root !== undefined && resolveSymbol(root, checker, globals, visited);
  });
}

export function scanLoweringState(sourceTexts) {
  const sources = new Map(Object.entries(sourceTexts).map(([file, text]) =>
    [path.resolve(file), ts.createSourceFile(path.resolve(file), text, ts.ScriptTarget.Latest, true)]));
  const options = { target: ts.ScriptTarget.Latest, module: ts.ModuleKind.NodeNext, noLib: true };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = (file) => sources.get(path.resolve(file));
  host.fileExists = (file) => sources.has(path.resolve(file));
  host.readFile = (file) => sourceTexts[file];
  const program = ts.createProgram([...sources.keys()], options, host);
  const checker = program.getTypeChecker();
  const globals = globalVariables([...sources.values()], checker);
  const findings = [];
  for (const [file, source] of sources) {
    const report = (node) => {
      const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
      findings.push({ file, line: line + 1, column: character + 1, rule: "no-shared-lowering-state",
        message: "Create mutable Lowering state inside each compilation and pass its owner explicitly." });
    };
    for (const statement of source.statements) {
      if (ts.isVariableStatement(statement) && !(statement.declarationList.flags & ts.NodeFlags.Const)) {
        report(statement);
      }
    }
    const visit = (node) => {
      const target = assignmentTarget(node);
      const root = target === undefined ? undefined : rootIdentifier(target);
      if (root !== undefined && resolveSymbol(root, checker, globals)) {
        report(node);
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(source, visit);
  }
  return findings;
}

function checkRepository() {
  const directory = path.join(repoRoot, "src/compiler/ir");
  const files = readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => path.join(entry.parentPath, entry.name));
  const texts = Object.fromEntries(files.map((file) => [file, readFileSync(file, "utf8")]));
  const findings = scanLoweringState(texts);
  for (const finding of findings) {
    console.error(`${path.relative(repoRoot, finding.file)}:${finding.line}:${finding.column}: ${finding.rule}: ${finding.message}`);
  }
  if (findings.length > 0) {
    process.exitCode = 1;
  } else {
    console.log("Lowering has no shared mutable compilation state.");
  }
}

const entryPoint = process.argv.slice(1, 2).at(0);
if (entryPoint !== undefined && pathToFileURL(path.resolve(entryPoint)).href === import.meta.url) {
  checkRepository();
}
