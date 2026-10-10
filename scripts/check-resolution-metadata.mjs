// Optional IR fields must survive every binding-resolution return path.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const irModelPath = path.join(repoRoot, "src/compiler/ir/expressions.ts");
const resolverDirectory = path.join(repoRoot, "src/compiler/binding-resolution");

/** The tier tables this check owns, and the IR union each one is total over. */
export const tiers = [
  { union: "JsIrNumberExpression", file: "numbers.ts", table: "numberHandlers" },
  { union: "JsIrStringExpression", file: "strings.ts", table: "stringHandlers" },
  { union: "JsIrCondition", file: "conditions.ts", table: "conditionHandlers" },
  { union: "JsIrValueExpression", file: "values.ts", table: "valueHandlers" }
];

function compareNames(left, right) {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
}

function propertyName(node) {
  return node.getText().replace(/^["']|["']$/g, "");
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

/** Every field of every variant of `unionName`, keyed by the kind that selects the variant. */
export function unionVariants(sourceText, unionName) {
  const source = ts.createSourceFile("expressions.ts", sourceText, ts.ScriptTarget.Latest, true);
  const declaration = source.statements.find(
    (statement) => ts.isTypeAliasDeclaration(statement) && statement.name.text === unionName
  );
  if (declaration === undefined) {
    throw new Error(`${unionName} is not declared in expressions.ts`);
  }
  const variants = new Map();
  for (const member of membersOf(declaration.type)) {
    if (!ts.isTypeLiteralNode(member)) {
      throw new Error(`${unionName} has a member that is not an object type`);
    }
    const kind = member.members.find((field) => ts.isPropertySignature(field) && field.name.getText(source) === "kind");
    if (kind === undefined || kind.type === undefined) {
      throw new Error(`${unionName} has a variant without a kind property`);
    }
    const fields = member.members.flatMap((field) => ts.isPropertySignature(field)
      ? [{ name: propertyName(field.name), required: field.questionToken === undefined }]
      : []);
    for (const literal of stringLiterals(kind.type)) {
      variants.set(literal, fields);
    }
  }
  return variants;
}

function handlerTable(source, tableName) {
  const declaration = source.statements
    .flatMap((statement) => ts.isVariableStatement(statement) ? statement.declarationList.declarations : [])
    .find((entry) => ts.isIdentifier(entry.name) && entry.name.text === tableName);
  const table = declaration?.initializer;
  if (table === undefined) {
    throw new Error(`${tableName} is not declared`);
  }
  const argument = ts.isCallExpression(table) ? table.arguments.at(0) : table;
  if (argument === undefined || !ts.isObjectLiteralExpression(argument)) {
    throw new Error(`${tableName} requires an object literal handler table`);
  }
  return argument;
}

function isFunctionLike(node) {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node);
}

function unwrapParens(node) {
  return ts.isParenthesizedExpression(node) ? node.expression : node;
}

/**
 * The object literals a handler returns. A handler that returns anything else -- a helper's
 * result, for instance -- cannot be read here, so it reports as unverifiable instead of
 * passing silently.
 */
function returnedLiterals(handler) {
  const { body } = handler;
  if (body === undefined) {
    return unreadable();
  }
  if (!ts.isBlock(body)) {
    const expression = unwrapParens(body);
    return ts.isObjectLiteralExpression(expression) ? { readable: true, literals: [expression] } : unreadable();
  }
  const literals = [];
  let returns = 0;
  const visit = (node) => {
    if (node !== handler && isFunctionLike(node)) {
      return;
    }
    if (ts.isReturnStatement(node)) {
      returns += 1;
      const expression = node.expression === undefined ? undefined : unwrapParens(node.expression);
      if (expression !== undefined && ts.isObjectLiteralExpression(expression)) {
        literals.push(expression);
      }
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return returns === 0 || literals.length !== returns ? unreadable() : { readable: true, literals };
}

function unreadable() {
  return { readable: false, literals: [] };
}

/** Whether a subtree reads `node.<field>`, which is what keeps a carried field faithful. */
function readsSourceField(node, field, handler, isSourceNode) {
  let found = false;
  const visit = (child) => {
    if (found) {
      return;
    }
    if (ts.isPropertyAccessExpression(child) && ts.isIdentifier(child.expression) &&
        isSourceNode(child.expression) && child.name.text === field) {
      found = true;
      return;
    }
    if (ts.isVariableDeclaration(child) && ts.isObjectBindingPattern(child.name) &&
        child.initializer !== undefined && ts.isIdentifier(child.initializer) && isSourceNode(child.initializer)) {
      found = child.name.elements.some((element) => ts.isBindingElement(element) &&
        propertyName(element.propertyName ?? element.name) === field);
      if (found) {
        return;
      }
    }
    if (child !== handler && isFunctionLike(child)) {
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

/** The local a shorthand property assignment forwards, so its derivation can be read too. */
function localInitializer(handler, name) {
  const found = [];
  const visit = (node) => {
    if (node !== handler && isFunctionLike(node)) {
      return;
    }
    if (ts.isVariableDeclaration(node) && node.initializer !== undefined && bindsName(node.name, name)) {
      found.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(handler);
  return found.length === 1 ? found[0] : undefined;
}

function bindsName(name, wanted) {
  if (ts.isIdentifier(name)) {
    return name.text === wanted;
  }
  return name.elements.some((element) => ts.isBindingElement(element) && bindsName(element.name, wanted));
}

function conditionalSpread(expression) {
  if (!ts.isConditionalExpression(expression)) return false;
  const consequent = unwrapParens(expression.whenTrue);
  const alternate = unwrapParens(expression.whenFalse);
  if (!ts.isObjectLiteralExpression(consequent) || !ts.isObjectLiteralExpression(alternate)) return false;
  const properties = (literal) => new Map(literal.properties.map((property) => {
    if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) return [undefined, undefined];
    return [propertyName(property.name), ts.isPropertyAssignment(property) ? property.initializer : undefined];
  }));
  const whenTrue = properties(consequent);
  const whenFalse = properties(alternate);
  if (whenTrue.has(undefined) || whenFalse.has(undefined)) return false;
  return new Map([...new Set([...whenTrue.keys(), ...whenFalse.keys()])].map((key) => [key, {
    condition: expression.condition,
    omittedWhenTrue: !whenTrue.has(key),
    presentInBoth: whenTrue.has(key) && whenFalse.has(key),
    initializer: whenTrue.has(key) ? whenTrue.get(key) : whenFalse.get(key)
  }]));
}

function literalShape(literal, isSourceNode) {
  const shape = { readable: true, assigned: new Map(), conditional: new Map(), copied: false };
  for (const property of literal.properties) {
    if (ts.isShorthandPropertyAssignment(property) || ts.isPropertyAssignment(property)) {
      const name = propertyName(property.name);
      shape.assigned.set(name, ts.isPropertyAssignment(property) ? property.initializer : undefined);
      shape.conditional.delete(name);
      continue;
    }
    if (!ts.isSpreadAssignment(property)) return { ...shape, readable: false };
    const expression = unwrapParens(property.expression);
    if (ts.isIdentifier(expression) && isSourceNode(expression)) {
      shape.copied = true;
      shape.assigned.clear();
      shape.conditional.clear();
      continue;
    }
    const conditional = conditionalSpread(expression);
    if (conditional === false) return { ...shape, readable: false };
    for (const [key, entry] of conditional) {
      shape.assigned.delete(key);
      shape.conditional.set(key, entry);
    }
  }
  return shape;
}

function derivesFromField(initializer, name, handler, isSourceNode) {
  const source = initializer ?? localInitializer(handler, name);
  return source !== undefined && readsSourceField(source, name, handler, isSourceNode);
}

function isUndefined(node) {
  return ts.isIdentifier(node) && node.text === "undefined";
}

function isAbsenceGuard(condition, name, omittedWhenTrue, isSourceNode) {
  const expression = unwrapParens(condition);
  if (!ts.isBinaryExpression(expression)) return false;
  const isField = (node) => ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) &&
    isSourceNode(node.expression) && node.name.text === name;
  if (!((isField(expression.left) && isUndefined(expression.right)) ||
      (isUndefined(expression.left) && isField(expression.right)))) return false;
  return expression.operatorToken.kind === (omittedWhenTrue
    ? ts.SyntaxKind.EqualsEqualsEqualsToken : ts.SyntaxKind.ExclamationEqualsEqualsToken);
}

function fieldVerdict(field, handler, shape, isSourceNode) {
  const { name } = field;
  const rewritten = { rule: "no-rewritten-resolution-metadata",
    message: "the resolved field must derive from the field it resolves, not a fresh value" };
  if (shape.assigned.has(name)) {
    return derivesFromField(shape.assigned.get(name), name, handler, isSourceNode) ? undefined : rewritten;
  }
  const conditional = shape.conditional.get(name);
  if (conditional === undefined) {
    return shape.copied ? undefined
      : { rule: "no-dropped-resolution-metadata", message: "is not carried into the resolved variant" };
  }
  if (field.required) {
    return { rule: "no-unguarded-resolution-metadata", message: "a required field cannot be spread conditionally" };
  }
  if (conditional.presentInBoth || !isAbsenceGuard(conditional.condition, name, conditional.omittedWhenTrue, isSourceNode)) {
    return { rule: "no-unguarded-resolution-metadata",
      message: `the conditional spread must be guarded by \`node.${name}\`, found: ${conditional.condition.getText()}` };
  }
  return derivesFromField(conditional.initializer, name, handler, isSourceNode) ? undefined : rewritten;
}

function checkerFor(source) {
  const options = { noLib: true, noResolve: true };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = (name) => path.resolve(name) === path.resolve(source.fileName) ? source : undefined;
  return ts.createProgram([source.fileName], options, host).getTypeChecker();
}

/** One tier's findings, in the order the IR declares its variants. */
export function checkTier(tier, irSource, resolverSource) {
  const variants = unionVariants(irSource, tier.union);
  const source = ts.createSourceFile(tier.file, resolverSource, ts.ScriptTarget.Latest, true);
  const table = handlerTable(source, tier.table);
  const checker = checkerFor(source);
  const handlers = new Map(table.properties.map((property) => [propertyName(property.name), property.initializer]));
  const findings = [];
  const addFinding = (kind, field, node, rule, message) => {
    const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
    const name = field === undefined ? kind : `${kind}.${field}`;
    findings.push({ file: tier.file, line: line + 1, column: character + 1, rule, message: `${tier.union}.${name}: ${message}` });
  };
  for (const [kind, fields] of [...variants].toSorted(([left], [right]) => compareNames(left, right))) {
    const handler = handlers.get(kind);
    if (handler === undefined) {
      addFinding(kind, undefined, table, "no-missing-resolution-handler",
        `${tier.table} has no handler for this variant`);
      continue;
    }
    const parameter = handler.parameters?.at(0)?.name;
    const symbol = parameter !== undefined && ts.isIdentifier(parameter) ? checker.getSymbolAtLocation(parameter) : undefined;
    const isSourceNode = (identifier) => symbol !== undefined && checker.getSymbolAtLocation(identifier) === symbol;
    const returned = returnedLiterals(handler);
    const shapes = returned.literals.map((literal) => literalShape(literal, isSourceNode));
    if (!returned.readable || shapes.some((shape) => !shape.readable)) {
      addFinding(kind, undefined, handler, "no-unverifiable-resolution-handler",
        "return the resolved variant as an object literal so its fields can be checked");
      continue;
    }
    for (const field of fields.filter((entry) => entry.name !== "kind")) {
      const verdict = shapes.map((shape) => fieldVerdict(field, handler, shape, isSourceNode)).find((entry) => entry !== undefined);
      if (verdict !== undefined) {
        addFinding(kind, field.name, handler, verdict.rule, verdict.message);
      }
    }
  }
  return { findings };
}

export function checkRepository() {
  const irSource = readFileSync(irModelPath, "utf8");
  return tiers.flatMap((tier) => checkTier(tier, irSource,
    readFileSync(path.join(resolverDirectory, tier.file), "utf8")).findings);
}

function report(findings) {
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line}:${finding.column}: ${finding.rule}: ${finding.message}`);
  }
  if (findings.length > 0) {
    return true;
  }
  console.log(`Resolution carries every IR metadata field (${tiers.length} tiers).`);
  return false;
}

const entryPoint = process.argv.slice(1, 2).at(0);
if (entryPoint !== undefined && pathToFileURL(path.resolve(entryPoint)).href === import.meta.url) {
  if (process.argv.length > 2) {
    process.stderr.write("usage: check-resolution-metadata.mjs\n");
    process.exit(2);
  }
  process.exitCode = report(checkRepository()) ? 1 : 0;
}
