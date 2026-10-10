// Check expression table keys against the authoritative IR unions.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const tiers = [
  { union: "JsIrValueExpression", table: "value-expressions.ts", builder: "handlers" },
  { union: "JsIrNumberExpression", table: "numbers.ts", builder: "handlers" },
  { union: "JsIrStringExpression", table: "string-expressions.ts", builder: "handlers" },
  { union: "JsIrCondition", table: "conditions.ts", builder: "handlers" }
];

const irModelPath = path.join(repoRoot, "src/compiler/ir/expressions.ts");

export function unionKinds(sourceText, unionName) {
  const source = ts.createSourceFile("expressions.ts", sourceText, ts.ScriptTarget.Latest, true);
  const declaration = source.statements.find(
    (statement) => ts.isTypeAliasDeclaration(statement) && statement.name.text === unionName
  );
  if (declaration === undefined) {
    throw new Error(`${unionName} is not declared in expressions.ts`);
  }
  const kinds = new Set();
  for (const member of membersOf(declaration.type)) {
    if (!ts.isTypeLiteralNode(member) && !ts.isInterfaceDeclaration(member)) {
      throw new Error(`${unionName} has a member that is not an object type`);
    }
    const kind = member.members.find((field) => ts.isPropertySignature(field) && field.name.getText(source) === "kind");
    if (kind === undefined || !ts.isPropertySignature(kind) || kind.type === undefined) {
      throw new Error(`${unionName} has a variant without a kind property`);
    }
    for (const literal of stringLiterals(kind.type)) {
      kinds.add(literal);
    }
  }
  return [...kinds].toSorted(compareNames);
}

function compareNames(left, right) {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
}

function membersOf(type) {
  if (ts.isUnionTypeNode(type)) {
    return type.types.flatMap(membersOf);
  }
  return [type];
}

function stringLiterals(type) {
  if (ts.isLiteralTypeNode(type) && ts.isStringLiteral(type.literal)) {
    return [type.literal.text];
  }
  if (ts.isUnionTypeNode(type)) {
    return type.types.flatMap(stringLiterals);
  }
  throw new Error(`Expected a string literal kind, found ${ts.SyntaxKind[type.kind]}`);
}

export function tableKeys(sourceText, tableName) {
  const source = ts.createSourceFile(tableName, sourceText, ts.ScriptTarget.Latest, true);
  const declaration = source.statements
    .flatMap((statement) => ts.isVariableStatement(statement) ? statement.declarationList.declarations : [])
    .find((entry) => ts.isIdentifier(entry.name) && entry.name.text === tableName);
  const table = declaration?.initializer;
  if (table === undefined) { return []; }
  const argument = tableObject(table);
  if (argument === undefined || !ts.isObjectLiteralExpression(argument)) {
    throw new Error(`${tableName} requires an object literal handler table`);
  }
  return argument.properties.flatMap((property) => {
    if (ts.isShorthandPropertyAssignment(property) || ts.isPropertyAssignment(property)) {
      return [property.name.getText(source).replace(/^["']|["']$/g, "")];
    }
    throw new Error(`${tableName} has a computed or spread entry in its emitter table`);
  });
}

function tableObject(table) {
  if (ts.isObjectLiteralExpression(table)) { return table; }
  if (isTableCall(table)) { return table.arguments.at(0); }
  throw new Error("Handler table must be an object literal");
}

function isTableCall(node) {
  const callee = ts.isCallExpression(node) ? node.expression : undefined;
  if (callee === undefined) {
    return false;
  }
  if (ts.isIdentifier(callee)) {
    return callee.text === "tierHandlers";
  }
  return ts.isPropertyAccessExpression(callee) && callee.name.text === "tierHandlers";
}

export function checkTier(tier, irSource) {
  const kinds = unionKinds(irSource, tier.union);
  const file = path.join(repoRoot, "src/compiler/native-lowering", tier.table);
  const keys = tableKeys(readFileSync(file, "utf8"), tier.builder);
  const registered = new Set(keys);
  return {
    ...tier,
    kinds,
    missing: kinds.filter((kind) => !registered.has(kind)),
    extra: [...registered].filter((key) => !kinds.includes(key)).toSorted(compareNames)
  };
}

export function checkRepository() {
  const irSource = readFileSync(irModelPath, "utf8");
  return tiers.map((tier) => checkTier(tier, irSource));
}

function report(results) {
  let failed = false;
  for (const result of results) {
    const total = result.missing.length === 0 && result.extra.length === 0;
    failed ||= !total;
    console.log(`${total ? "ok  " : "FAIL"} ${result.union} (${result.kinds.length} kinds, ${result.table})`);
    for (const kind of result.missing) {
      console.log(`       missing handler: ${kind}`);
    }
    for (const key of result.extra) {
      console.log(`       unknown kind:    ${key}`);
    }
  }
  return failed;
}

if (process.argv.slice(1, 2).at(0) !== undefined && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.length > 2) {
    process.stderr.write("usage: check-expression-dispatch.mjs\n");
    process.exit(2);
  }
  process.exitCode = report(checkRepository()) ? 1 : 0;
}
