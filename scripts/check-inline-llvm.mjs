// C-8: static LLVM IR must live in src/compiler/runtime/*.ll, never in
// TypeScript string literals. runtime-helpers.ts grew past 11k lines of
// inline IR before this check existed; this script keeps it from creeping
// back. It parses each src/**/*.ts file with the TypeScript compiler API,
// inspects the text of every string literal and template part, and reports
// matches for the shapes static IR takes:
//
//   1. define/declare lines naming a literal symbol   ("define ptr @f(...)")
//   2. module-scope constant globals                  ("@g = private unnamed_addr constant ...")
//   3. module headers                                 ("target datalayout/triple")
//
// Dynamically assembled IR is not caught: interpolations split template text,
// so emitter templates like `define ${type} @${name}(...)` never match. The IR
// emitter modules (src/compiler/llvm.ts, src/compiler/llvm-ir/**,
// src/compiler/js-value-abi/**) are exempt because assembling IR text is their
// purpose. Any other intentional match needs a `// inline-llvm-ir-allowed:`
// comment with a reason on the preceding line (see src/compiler/toolchain.ts).
//
// oxlint has no no-restricted-syntax equivalent, so this runs as a companion
// check: `npm run lint` runs oxlint, then this script.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const repoRoot = join(import.meta.dirname, "..");
const sourceRoot = join(repoRoot, "src");

// Modules whose purpose is assembling LLVM IR text programmatically.
const exemptFiles = new Set([
  join("compiler", "llvm.ts"),
  join("compiler", "js-value-abi", "llvm.ts")
]);
const exemptDirectories = [join("compiler", "llvm-ir")];

const llvmShapes = [
  {
    pattern: /(?:^|\n)\s*(?:define|declare) [^\n]*@[A-Za-z_.][A-Za-z0-9_.]*\s*\(/,
    description: "a define/declare with a literal symbol"
  },
  {
    pattern: /@[A-Za-z_.][A-Za-z0-9_.]*\s*=\s*private unnamed_addr constant/,
    description: "a module-scope constant global"
  },
  {
    pattern: /target (?:datalayout|triple)/,
    description: "a module header"
  }
];

const suppressionMarker = /^\s*\/\/\s*inline-llvm-ir-allowed:/;

export function isExemptPath(relativePath) {
  if (exemptFiles.has(relativePath)) {
    return true;
  }
  return exemptDirectories.some((directory) => relativePath.startsWith(`${directory}${sep}`));
}

// Returns findings for one file's text: { line, description, excerpt }.
export function scanSource(sourceText) {
  const sourceFile = ts.createSourceFile("scan.ts", sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const lines = sourceText.split("\n");
  const findings = [];

  const visit = (node) => {
    // String literals and the raw text parts of templates are the only nodes
    // that can carry IR text, and every one of them has a .text property.
    // RegularExpressionLiteral is a distinct node kind, so regexes are never
    // inspected, and comments are not nodes at all.
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      const { text } = node;
      const start = node.getStart(sourceFile);
      const startLine = ts.getLineAndCharacterOfPosition(sourceFile, start).line;
      const endLine = ts.getLineAndCharacterOfPosition(sourceFile, node.getEnd()).line;
      // A suppression marker applies to the whole node, so it sits on the line
      // above where the string or template starts.
      const suppressed = startLine > 0 && suppressionMarker.test(lines[startLine - 1]);
      if (!suppressed) {
        for (const shape of llvmShapes) {
          const pattern = new RegExp(shape.pattern.source, "g");
          let match;
          while ((match = pattern.exec(text)) !== null) {
            // Single-source-line strings may embed "\n" escapes: every match
            // belongs to that one line. Multi-line templates embed real
            // newlines, so cooked offsets map onto source lines directly.
            let reportLine = startLine + 1;
            if (startLine !== endLine) {
              reportLine = startLine + text.slice(0, match.index).split("\n").length;
              reportLine = Math.min(reportLine, lines.length);
            }
            const excerpt = lines[reportLine - 1].trim();
            findings.push({ line: reportLine, description: shape.description, excerpt });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return findings;
}

function collectSourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/\.(?:ts|mts|cts)$/.test(entry.name)) {
      continue;
    }
    // With recursive: true, Dirent.parentPath carries the directory the entry
    // was found in while name is a bare filename.
    const absolute = join(entry.parentPath, entry.name);
    const relativePath = relative(sourceRoot, absolute);
    if (!isExemptPath(relativePath)) {
      files.push(absolute);
    }
  }
  return files.toSorted();
}

export function scanRepository() {
  const findings = [];
  for (const file of collectSourceFiles(sourceRoot)) {
    for (const finding of scanSource(readFileSync(file, "utf8"))) {
      findings.push({ file: relative(repoRoot, file), ...finding });
    }
  }
  return findings;
}

const isMain = process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const findings = scanRepository();
  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(
        `x inline LLVM IR (${finding.description}) at ${finding.file}:${finding.line}: ${finding.excerpt}\n` +
          `  Static IR belongs in src/compiler/runtime/*.ll (loaded by src/compiler/runtime-ir.ts).\n` +
          `  If this string is intentional, precede it with a "// inline-llvm-ir-allowed: <reason>" comment.`
      );
    }
    process.exitCode = 1;
  } else {
    console.log("inline LLVM IR check passed");
  }
}
