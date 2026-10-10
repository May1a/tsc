// valueObjectGet decodes an object layout without checking the JSValue tag.
// Emission has general JsValue operands, so it must dispatch by value kind.
// Even a validated iterator result can be read through valuePropertyGet.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(import.meta.dirname, "..");
const rule = "no-unchecked-object-access";

export function scanSource(sourceText) {
  const source = ts.createSourceFile("scan.ts", sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const findings = [];
  function visit(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      // Check the symbol as well as calls, so passing it to emitGeneratedJsCall
      // or storing it in a constant cannot bypass the rule.
      if (/\bvalueObjectGet\b/.test(node.text)) {
        const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
        findings.push({ rule, line: line + 1, column: character + 1 });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return findings;
}

export function scanRepository(root = repoRoot) {
  const directory = path.join(root, "src/compiler/native-lowering");
  const files = readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .toSorted();
  return files.flatMap((file) => scanSource(readFileSync(file, "utf8"))
    .map((finding) => ({ file: path.relative(root, file), rule: finding.rule, line: finding.line, column: finding.column })));
}

const entryPoint = process.argv.slice(1, 2).at(0);
if (entryPoint !== undefined && pathToFileURL(path.resolve(entryPoint)).href === import.meta.url) {
  const findings = scanRepository();
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line}:${finding.column}: ${finding.rule}: ` +
      "Use checkedValuePropertyGet for an arbitrary JSValue, or valuePropertyGet after checking nullish receivers. " +
      "valueObjectGet assumes an object layout and cannot be emitted for general values.");
  }
  if (findings.length > 0) {
    process.exitCode = 1;
  } else {
    console.log(`${rule} check passed`);
  }
}
