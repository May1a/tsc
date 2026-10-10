import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const instruction = /(?:^|\s|=)(?:call|alloca|load|store|br|ret|phi|getelementptr|extractvalue|insertvalue|select|fadd|fsub|fmul|fdiv|frem|fneg|add|sub|mul|sdiv|udiv|srem|urem|and|or|xor|shl|lshr|ashr|fcmp|icmp|bitcast|ptrtoint|inttoptr|fptosi|sitofp|fptoui|uitofp|trunc|zext|sext|switch)\s+(?:(?:inbounds|eq|ne|slt|sle|sgt|sge|ult|ule|ugt|uge|oeq|one|olt|ole|ogt|oge|ord|uno|ueq|une|nnan|nsw|nuw)\s+)*(?:\{|\[|ptr\b|double\b|void\b|i\d+\b|label\b)|^\s*(?:define|declare)\s+|^\s*unreachable\s*$|^\s*@\S+\s*=\s*(?:internal\s+|private\s+)?(?:global|constant)\s/;
const instructionFragment = /(?:^|=)\s*(?:call|alloca|load|store|br|ret|phi|getelementptr|extractvalue|insertvalue|select|fadd|fsub|fmul|fdiv|frem|fneg|add|sub|mul|sdiv|udiv|srem|urem|and|or|xor|shl|lshr|ashr|fcmp|icmp|bitcast|ptrtoint|inttoptr|fptosi|sitofp|fptoui|uitofp|trunc|zext|sext|switch)\s+$|=\s*(?:internal\s+|private\s+)?(?:global|constant)\s/;
const stateFields = new Set(["bindings", "objectLayouts", "declaredLocals", "cleanupStack", "activeCleanupBodies", "loopLabels", "optionalTargets",
  "printIndex", "ifIndex", "cmpIndex", "numIndex", "callIndex", "loopIndex", "logicIndex", "boolIndex", "stringIndex", "arrayIndex", "objectIndex",
  "tryIndex", "cleanupSeq", "exceptionTarget", "exceptionSlot", "nextDestId", "gcFrameName", "stringConstants", "arrayGlobals",
  "objectTypes", "valueGlobals", "hasNumberPrint"]);
const mutators = new Set(["set", "add", "delete", "clear", "push", "pop", "shift", "unshift", "splice"]);

function contextField(node) {
  if (ts.isPropertyAccessExpression(node)) {
    if (ts.isIdentifier(node.name) && stateFields.has(node.name.text)) {
      return node.name.text;
    }
    return contextField(node.expression);
  }
  if (ts.isElementAccessExpression(node)) {
    return contextField(node.expression);
  }
  return;
}

function mutatingField(node) {
  if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
    node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
    return readonlyInitialization(node) ? undefined : contextField(node.left);
  }
  if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
    (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)) {
    return contextField(node.operand);
  }
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && mutators.has(node.expression.name.text)) {
    return contextField(node.expression.expression);
  }
  return;
}

function readonlyInitialization(node) {
  if (!ts.isPropertyAccessExpression(node.left) || node.left.expression.kind !== ts.SyntaxKind.ThisKeyword) { return false; }
  let enclosing = node.parent;
  while (enclosing !== undefined && !ts.isConstructorDeclaration(enclosing)) { enclosing = enclosing.parent; }
  if (enclosing === undefined || !ts.isClassDeclaration(enclosing.parent)) { return false; }
  return enclosing.parent.members.some((member) => ts.isPropertyDeclaration(member) && member.name.getText() === node.left.name.text &&
    member.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword));
}

function mutableCollection(type) {
  if (type === undefined) {
    return false;
  }
  if (ts.isArrayTypeNode(type)) {
    return true;
  }
  if (ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)) {
    return new Set(["Array", "Map", "Set", "WeakMap", "WeakSet"]).has(type.typeName.text);
  }
  return ts.isUnionTypeNode(type) && type.types.some(mutableCollection);
}

function exposedState(node) {
  const modifiers = node.modifiers ?? [];
  if (ts.isPropertyDeclaration(node)) {
    const privateField = ts.isPrivateIdentifier(node.name) || modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword);
    const readonly = modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword);
    return !privateField && (!readonly || mutableCollection(node.type));
  }
  if (ts.isParameter(node) && ts.isConstructorDeclaration(node.parent)) {
    const parameterField = modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.PublicKeyword || modifier.kind === ts.SyntaxKind.ReadonlyKeyword);
    const privateField = modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword);
    const readonly = modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword);
    return parameterField && !privateField && (!readonly || mutableCollection(node.type));
  }
  return ts.isPropertySignature(node) &&
    (!modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword) || mutableCollection(node.type)) &&
    ts.isInterfaceDeclaration(node.parent) && node.parent.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

export function scanEmissionArchitecture(file, sourceText) {
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true);
  const findings = [];
  const report = (node, rule, message) => {
    const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
    findings.push({ file, line: line + 1, column: character + 1, rule, message });
  };
  function visit(node) {
    if (exposedState(node)) {
      report(node, "no-exposed-emission-state", "Keep mutable state private to its owner. Expose an operation or a readonly collection through the capability.");
    }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) &&
      (instruction.test(node.text) || instructionFragment.test(node.text))) {
      report(node, "no-raw-llvm-in-emission", "Construct typed LLVM instructions. Only the LLVM renderer and Static Runtime IR may contain instruction text.");
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "addLegacyModuleText") {
      report(node, "no-dynamic-legacy-llvm", "Append Static Runtime IR at its boundary. Build generated functions with typed instructions.");
    }
    const field = mutatingField(node);
    if (field !== undefined && stateFields.has(field)) {
      report(node, "no-context-field-mutation", `Move ${field} mutation into its state owner and request the operation through a capability.`);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return findings;
}

export function scanEmissionRepository() {
  const files = ["native-lowering"].flatMap((name) => {
    const directory = path.join(root, "src/compiler", name);
    return readdirSync(directory, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
      .map((entry) => path.join(entry.parentPath, entry.name));
  });
  return files.flatMap((file) => scanEmissionArchitecture(path.relative(root, file), readFileSync(file, "utf8")));
}

function checkRepository() {
  const findings = scanEmissionRepository();
  if (process.argv.includes("--census")) {
    const files = [...new Set(findings.map((finding) => finding.file))].toSorted((left, right) => left.localeCompare(right));
    console.log(JSON.stringify(files.map((file) => ({
      file,
      findings: findings.filter((finding) => finding.file === file).length,
      rules: [...new Set(findings.filter((finding) => finding.file === file).map((finding) => finding.rule))]
        .toSorted((left, right) => left.localeCompare(right))
    })), undefined, 2));
    return;
  }
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line}:${finding.column}: ${finding.rule}: ${finding.message}`);
  }
  if (findings.length > 0) {
    process.exitCode = 1;
  } else {
    console.log("Emission uses typed instructions and owned state.");
  }
}

const entryPoint = process.argv.slice(1, 2).at(0);
if (entryPoint !== undefined && pathToFileURL(path.resolve(entryPoint)).href === import.meta.url) {
  checkRepository();
}
