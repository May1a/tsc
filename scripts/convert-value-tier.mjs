// Converts the value tier's `undefined` sentinel to `Lowered<T>`, in `src/compiler/ir.ts`.
//
// The conversion unit is the cone around `lowerValueExpression` -- everything it reaches, and everything
// reaching it, whose return type is `T | undefined`. Those 176 functions are mutually recursive, so they
// land together or not at all: the cut graph puts 185 of the file's declarations in one strongly
// connected component, and this is the part of it the sentinel reaches.
//
// Every decision below is made from the resolved type or from a syntactic fact, so the type checker
// verifies each edit. The one judgement the tier contains -- a guard that declines a recogniser versus a
// guard that narrows a value it is about to read -- is settled by a proof: **a guard is a use site only
// when the value it guards is referenced again after it.** Referenced means use site, which is checkable;
// not referenced means chain step, and a wrong guess in that direction does not compile, because
// `.operation` is then absent. The default is the safe one to get wrong.
//
// Three phases, because each depends on the types the previous one established. A guard cannot be
// classified before the signatures convert -- every call still returns `T | undefined`, so nothing looks
// like a chain result -- and `.operation` cannot be inserted before the guards narrow their values.
//
//   node scripts/convert-value-tier.mjs --phase 1
//   node scripts/convert-value-tier.mjs --phase 2
//   node scripts/convert-value-tier.mjs --phase 3
//
// Takes the tier from 1,295 diagnostics to 418. The residue is about twenty shapes of per-site work;
// see PLAN.md.
import ts from "typescript";
import { writeFileSync } from "node:fs";

const FILE = "src/compiler/ir.ts";
const DEFAULT_PHASE = 3;
const WRAPPER_KINDS = new Set(["lowered", "notApplicable", "unsupported"]);
const KIND_PROPERTY = "kind";

/** @typedef {{ start: number, end: number, text: string }} Edit */

// The conversion cone: everything `lowerValueExpression` reaches, and everything reaching it, whose
// return type is `T | undefined`. Derived here rather than checked in as a list, so the tool stays
// correct when the file moves under it.
const coneOf = () => {
  /** @type {Map<string, ts.FunctionDeclaration>} */
  const declarations = new Map();
  /** @type {Map<ts.Declaration, string>} */
  const nameOf = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isFunctionDeclaration(statement) || statement.name === undefined) continue;
    declarations.set(statement.name.text, statement);
    nameOf.set(statement, statement.name.text);
  }
  /** @type {Set<string>} */
  const imported = new Set();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (statement.importKind === ts.ImportKind.Type) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings !== undefined && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) imported.add(element.name.text);
    }
  }
  /** @type {Map<string, Set<string>>} */
  const references = new Map();
  /** @type {Map<string, Set<string>>} */
  const referencedBy = new Map();
  for (const [name, declaration] of declarations) {
    /** @type {Set<string>} */
    const set = new Set();
    /** @param {ts.Node} node */
    const visit = (node) => {
      if (ts.isIdentifier(node) && node.text !== name) {
        const symbol = checker.getSymbolAtLocation(node);
        const target = symbol?.declarations?.[0];
        const resolved = target === undefined ? undefined : nameOf.get(target);
        if (resolved !== undefined && resolved !== name && !imported.has(resolved)) set.add(resolved);
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(declaration, visit);
    references.set(name, set);
    for (const next of set) {
      if (!referencedBy.has(next)) referencedBy.set(next, new Set());
      referencedBy.get(next)?.add(name);
    }
  }
  /** @param {Map<string, Set<string>>} edges @param {string} from */
  const reach = (edges, from) => {
    /** @type {Set<string>} */
    const seen = new Set([from]);
    const queue = [from];
    while (queue.length > 0) {
      const current = queue.pop() ?? "";
      for (const next of edges.get(current) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    return seen;
  };
  const down = reach(references, "lowerValueExpression");
  const up = reach(referencedBy, "lowerValueExpression");
  /** @type {Set<string>} */
  const cone = new Set([...down, ...up]);
  /** @param {string} name */
  const returnsUndefined = (name) => {
    const declaration = declarations.get(name);
    if (declaration === undefined) return false;
    const type = checker.getSignatureFromDeclaration(declaration).getReturnType();
    return type.isUnion() && type.types.some((member) => (member.flags & ts.TypeFlags.Undefined) !== 0);
  };
  /** @type {Set<string>} */
  const result = new Set();
  for (const name of cone) {
    if (returnsUndefined(name)) result.add(name);
  }
  return result;
};
/** @type {Set<string>} */
let convert = new Set();
const phaseIndex = process.argv.indexOf("--phase");
const PHASE = phaseIndex === -1 ? DEFAULT_PHASE : Number(process.argv[phaseIndex + 1]);
const options = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: true,
  noEmit: true
};
const program = ts.createProgram([FILE], options);
const checker = program.getTypeChecker();
const sourceFile = program.getSourceFile(FILE);

// The conversion cone is computed against the program, so it runs after the program exists.
convert = coneOf();

/** @type {Edit[]} */
const edits = [];
/** @param {number} start @param {number} end @param {string} text */
const put = (start, end, text) => { edits.push({ start, end, text }); };
const counts = {
  signature: 0, local: 0, wrap: 0, decline: 0, guard: 0, unsupported: 0, operation: 0
};

/** @param {ts.Type} type */
const isObject = (type) => (type.flags & ts.TypeFlags.Object) !== 0;
/** @param {ts.Type} type */
const membersOf = (type) => (type.isUnion() ? type.types : [type]).filter(isObject);
/** @param {ts.Type} type @param {string} property */
const hasMember = (type, property) => membersOf(type).some((member) => member.getProperty(property) !== undefined);

// `operation` *or* `reason`, not both: a value already narrowed to the `lowered` variant has the first and
// a value narrowed away from it has the second, and requiring both made both invisible -- so a narrowed
// `Lowered` looked like a payload and got wrapped a second time.
/** @param {ts.Type} type */
const isChainType = (type) => hasMember(type, KIND_PROPERTY) && (hasMember(type, "operation") || hasMember(type, "reason"));

/** @param {ts.Node} node */
const isUndefined = (node) => ts.isIdentifier(node) && node.text === "undefined";

/** A nested function has its own signature; its `return`s are not this function's. @param {ts.Node} node */
const isNestedFunction = (node) => {
  if (node.parent === undefined) return false;
  if (node.parent.kind === ts.SyntaxKind.SourceFile) return false;
  return ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)
    || ts.isArrowFunction(node) || ts.isMethodDeclaration(node);
};

/** The `T` in `Lowered<T>`: the type an operation is handed back as. @param {ts.Type} type @param {ts.Node} at */
const payloadOf = (type, at) => {
  const variant = membersOf(type).find((member) => member.getProperty("operation") !== undefined);
  if (variant === undefined) return undefined;
  const property = variant.getProperty("operation");
  if (property === undefined) return undefined;
  return checker.getTypeOfSymbolAtLocation(property, at);
};

/** @param {number} position */
const indentOf = (position) => {
  const { line } = sourceFile.getLineAndCharacterOfPosition(position);
  const text = sourceFile.text.split("\n")[line];
  return /^\s*/.exec(text)?.[0] ?? "";
};

/** @param {ts.Node} node */
const enclosingFunction = (node) => {
  let at = node;
  while (at !== undefined) {
    if (ts.isFunctionDeclaration(at)) return at;
    at = at.parent;
  }
  return undefined;
};

/** @param {ts.Node} node */
const enclosingStatement = (node) => {
  let at = node;
  while (at !== undefined) {
    if (ts.isStatement(at)) return at;
    at = at.parent;
  }
  return node;
};

/** @param {ts.FunctionDeclaration | undefined} fn */
const returnsOf = (fn) => {
  if (fn === undefined) return undefined;
  return checker.getSignatureFromDeclaration(fn).getReturnType();
};

/** The sound rule: a guard is a use site only when the value is referenced again after it.
 * @param {ts.Symbol} symbol @param {ts.Block} block @param {ts.IfStatement} guardStatement */
const referencedAfter = (symbol, block, guardStatement) => {
  /** @param {ts.Node} node */
  const walk = (node) => {
    if (isNestedFunction(node)) return false;
    if (ts.isIdentifier(node) && checker.getSymbolAtLocation(node) === symbol) return true;
    let found = false;
    ts.forEachChild(node, (child) => {
      if (!found && walk(child)) found = true;
    });
    return found;
  };
  for (const statement of block.statements) {
    if (statement !== guardStatement && walk(statement)) return true;
  }
  return false;
};

/** @param {ts.Type} type */
const canDecline = (type) => membersOf(type).some((member) => {
  const property = member.getProperty(KIND_PROPERTY);
  if (property === undefined) return false;
  const propertyType = checker.getTypeOfSymbolAtLocation(property, sourceFile);
  return propertyType.isStringLiteral() && propertyType.value === "notApplicable";
});

// ---- the payload map, read from whichever phase is current ------------------------------
/** @type {Map<string, ts.Type>} */
const payloads = new Map();

/** @param {ts.FunctionDeclaration} statement */
const collectPayload = (statement) => {
  const annotation = statement.type;
  if (annotation === undefined) return;
  const reference = ts.isUnionTypeNode(annotation) ? undefined : annotation;
  const isLoweredReference = reference !== undefined && reference.kind === ts.SyntaxKind.TypeReference
    && reference.typeName.getText(sourceFile) === "Lowered";
  if (!isLoweredReference) return;
  const argument = reference.typeArguments?.[0];
  if (argument === undefined) return;
  payloads.set(statement.name?.text ?? "", checker.getTypeFromTypeNode(argument));
};

// ---- phase 1: return type annotations of the conversion cone ---------------------------
if (PHASE === 1) {
  for (const statement of sourceFile.statements) {
    if (!ts.isFunctionDeclaration(statement)) continue;
    const name = statement.name?.text;
    if (name === undefined || statement.type === undefined) continue;
    if (!convert.has(name)) continue;
    const annotation = statement.type;
    const parts = ts.isUnionTypeNode(annotation) ? annotation.types : [annotation];
    const bare = parts.filter((part) => part.getText(sourceFile) !== "undefined");
    if (bare.length === parts.length) continue;
    // `LoweredStatementList` is `Produced<JsIrOperation[]>`, so `LoweredStatementList | undefined` must
    // become `Lowered<JsIrOperation[]>` and not `Lowered<LoweredStatementList>`: the second wraps a chain
    // type inside a chain type, and every payload ends up one level too deep.
    const bareType = bare.length === 1 ? checker.getTypeFromTypeNode(bare[0]) : undefined;
    let alreadyProduced;
    if (bareType !== undefined && isChainType(bareType)) alreadyProduced = payloadOf(bareType, statement);
    let finalText = `Lowered<${bare.map((part) => part.getText(sourceFile)).join(" | ")}>`;
    if (alreadyProduced !== undefined) {
      const printed = checker.typeToString(alreadyProduced, undefined, ts.TypeFormatFlags.NoTruncation);
      finalText = `Lowered<${printed}>`;
    }
    put(annotation.getStart(sourceFile), annotation.end, finalText);
    if (bare.length === 1) {
      payloads.set(name, alreadyProduced ?? checker.getTypeFromTypeNode(bare[0]));
    }
    counts.signature += 1;
  }
} else {
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement)) collectPayload(statement);
  }
}

// ---- phase 2: locals, returns, guards, kind-rewrites ------------------------------------
if (PHASE === 2) {
  /** @type {Set<ts.Symbol>} */
  const chainBindings = new Set();
  /** @param {ts.Node} node */
  const collectChain = (node) => {
    /** @param {ts.Node} name @param {ts.Node} value */
    const record = (name, value) => {
      if (!ts.isIdentifier(name)) return;
      if (!isChainType(checker.getTypeAtLocation(value))) return;
      const symbol = checker.getSymbolAtLocation(name);
      if (symbol !== undefined) chainBindings.add(symbol);
    };
    if (ts.isVariableDeclaration(node) && node.initializer !== undefined) record(node.name, node.initializer);
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      record(node.left, node.right);
    }
    ts.forEachChild(node, collectChain);
  };
  collectChain(sourceFile);

  /** @param {ts.BinaryExpression} binary */
  const kindCompare = (binary) => {
    const equal = binary.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
      || binary.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken;
    if (!equal) return undefined;
    for (const [access, literal] of [[binary.left, binary.right], [binary.right, binary.left]]) {
      if (!ts.isPropertyAccessExpression(access)) continue;
      if (access.name.text !== KIND_PROPERTY) continue;
      if (!ts.isStringLiteral(literal)) continue;
      if (WRAPPER_KINDS.has(literal.text)) continue;
      const subject = access.expression;
      if (!ts.isIdentifier(subject)) continue;
      if (!isChainType(checker.getTypeAtLocation(subject))) continue;
      return { access, subject };
    }
    return undefined;
  };

  /** @param {ts.Node} node */
  const rewriteLocal = (node) => {
    if (!ts.isVariableDeclaration(node)) return;
    if (node.type === undefined || !ts.isUnionTypeNode(node.type)) return;
    const bare = node.type.types.filter((part) => part.getText(sourceFile) !== "undefined");
    if (bare.length === node.type.types.length) return;
    const symbol = checker.getSymbolAtLocation(node.name);
    const receives = symbol !== undefined && chainBindings.has(symbol)
      || (node.initializer !== undefined && isChainType(checker.getTypeAtLocation(node.initializer)));
    if (!receives) return;
    const printed = bare.map((part) => part.getText(sourceFile)).join(" | ");
    put(node.type.getStart(sourceFile), node.type.end, `Lowered<${printed}>`);
    counts.local += 1;
    // A retyped `let` with no initializer has no `undefined` left in its type, so TypeScript's definite
    // assignment analysis flags every use. `notApplicable` is the honest initial value: the value has not
    // been recognised yet, which is exactly what "declined" means at this tier.
    if (node.initializer === undefined) put(node.type.end, node.type.end, " = notApplicable");
  };

  /** @param {ts.Node} node */
  const unwrapDoubleWrap = (node) => {
    if (!ts.isCallExpression(node)) return;
    if (node.arguments.length !== 1) return;
    if (!ts.isIdentifier(node.expression) || node.expression.text !== "produced") return;
    const [argument] = node.arguments;
    if (argument === undefined) return;
    if (!isChainType(checker.getTypeAtLocation(argument))) return;
    put(node.getStart(sourceFile), node.end, argument.getText(sourceFile));
    counts.wrap += 1;
  };

  /** @param {ts.Node} node */
  const wrapAssignment = (node) => {
    if (!ts.isBinaryExpression(node)) return;
    if (node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return;
    if (!ts.isIdentifier(node.left)) return;
    const leftType = checker.getTypeAtLocation(node.left);
    const variant = membersOf(leftType).find((member) => member.getProperty("operation") !== undefined);
    if (variant === undefined) return;
    // No assignability test: a payload assigned to a `Lowered` binding has to be wrapped whatever its
    // exact shape, and requiring assignability left the tight-shaped object literals behind.
    if (isChainType(checker.getTypeAtLocation(node.right))) return;
    put(node.right.getStart(sourceFile), node.right.getStart(sourceFile), "produced(");
    put(node.right.end, node.right.end, ")");
    counts.wrap += 1;
  };

  /** @param {ts.Node} node @param {ts.Type | undefined} payload @param {boolean} enclosingIsConverted @param {boolean} enclosingReturnsChain */
  const rewriteReturn = (node, payload, enclosingIsConverted, enclosingReturnsChain) => {
    void enclosingReturnsChain;
    if (!ts.isReturnStatement(node)) return;
    const expression = node.expression;
    if (expression === undefined) return;
    if (isUndefined(expression)) {
      put(expression.getStart(sourceFile), expression.end, "notApplicable");
      counts.decline += 1;
      return;
    }
    const type = checker.getTypeAtLocation(expression);
    if (isChainType(type)) return;
    const isObjectLiteral = ts.isObjectLiteralExpression(expression) || ts.isArrayLiteralExpression(expression);
    // A bare object literal return in a converted function is a payload, whatever its shape: the
    // assignability test left the tight-shaped ones behind, and they are the majority of the tail.
    const assignabilityFits = payload !== undefined && checker.isTypeAssignableTo(type, payload);
    if (!enclosingIsConverted) return;
    if (!isObjectLiteral && !assignabilityFits) return;
    const start = expression.getStart(sourceFile);
    put(start, start, "produced(");
    put(expression.end, expression.end, ")");
    counts.wrap += 1;
  };

  /** @param {ts.Node} node @param {boolean} enclosingReturnsChain */
  const rewriteGuard = (node, enclosingReturnsChain) => {
    if (!ts.isIfStatement(node)) return;
    const expression = node.expression;
    if (!ts.isBinaryExpression(expression)) return;
    const equal = expression.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken;
    const unequal = expression.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken;
    if (!equal && !unequal) return;
    for (const [tested, other] of [[expression.left, expression.right], [expression.right, expression.left]]) {
      if (!isUndefined(other) || !ts.isIdentifier(tested)) continue;
      const testedType = checker.getTypeAtLocation(tested);
      if (!isChainType(testedType) || !canDecline(testedType)) continue;
      const block = node.parent;
      if (!ts.isBlock(block)) continue;
      // Both sides move: `x === undefined` becomes `x.kind === "notApplicable"`. Rewriting only the
      // `undefined` side leaves `x === "notApplicable"`, which compares an object to a string.
      put(tested.getStart(sourceFile), tested.end, `${tested.getText(sourceFile)}.kind`);
      put(other.getStart(sourceFile), other.end, '"notApplicable"');
      counts.guard += 1;
      const symbol = checker.getSymbolAtLocation(tested);
      const used = symbol !== undefined && referencedAfter(symbol, block, node);
      if (used && enclosingReturnsChain) {
        const name = tested.getText(sourceFile);
        const pad = indentOf(node.getStart(sourceFile));
        put(node.getStart(sourceFile), node.getStart(sourceFile), `if (${name}.kind === "unsupported") {\n${pad}  return ${name};\n${pad}}\n${pad}`);
        counts.unsupported += 1;
      }
      break;
    }
  };

  /** `x.kind === "somePayloadKind"` where `x` is a chain value: the wrapper's own kinds are
   * `lowered`, `notApplicable` and `unsupported`; anything else is the payload's kind, so it has to be
   * reached through `operation` -- and `operation` needs `unsupported` returned first.
   * @param {ts.Node} node @param {boolean} enclosingReturnsChain */
  const rewriteKindRead = (node, enclosingReturnsChain) => {
    /** @type {{ access: ts.PropertyAccessExpression, subject: ts.Identifier } | undefined} */
    let compared;
    if (ts.isBinaryExpression(node)) compared = kindCompare(node);
    else if (ts.isIfStatement(node) && ts.isBinaryExpression(node.expression)) compared = kindCompare(node.expression);
    if (compared === undefined) return;
    const { access, subject } = compared;
    if (enclosingReturnsChain) {
      const name = subject.getText(sourceFile);
      const statementStart = enclosingStatement(node).getStart(sourceFile);
      const pad = indentOf(statementStart);
      put(statementStart, statementStart, `if (${name}.kind === "unsupported") {\n${pad}  return ${name};\n${pad}}\n${pad}`);
      counts.unsupported += 1;
    }
    put(access.getStart(sourceFile), access.end, `${subject.getText(sourceFile)}.operation.kind`);
    counts.guard += 1;
  };

  /** @param {ts.Node} node @param {ts.Type | undefined} payload */
  const visit = (node, payload) => {
    if (isNestedFunction(node)) return;
    const enclosing = enclosingFunction(node);
    const enclosingName = enclosing?.name?.text;
    const enclosingIsConverted = enclosingName !== undefined && convert.has(enclosingName);
    const enclosingReturnsChain = isChainType(returnsOf(enclosing) ?? sourceFile);
    const own = enclosingName === undefined ? undefined : payloads.get(enclosingName);

    rewriteLocal(node);
    unwrapDoubleWrap(node);
    wrapAssignment(node);
    rewriteReturn(node, own ?? payload, enclosingIsConverted, enclosingReturnsChain);
    rewriteGuard(node, enclosingReturnsChain);
    rewriteKindRead(node, enclosingReturnsChain);

    ts.forEachChild(node, (child) => visit(child, own ?? payload));
  };
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.body !== undefined) visit(statement.body, undefined);
  }
}

// ---- phase 3: `.operation` where the type shows it is legal ---------------------------
if (PHASE === 3) {
  /** @param {ts.Type} type */
  const seesOperation = (type) => {
    const members = membersOf(type);
    if (members.length !== 1) return false;
    const property = members[0].getProperty("operation");
    return property !== undefined;
  };

  /** @param {number} position */
  const innermost = (position) => {
    let found = sourceFile;
    /** @param {ts.Node} node */
    const descend = (node) => {
      if (node.getStart(sourceFile) > position || position >= node.end) return;
      found = node;
      node.forEachChild(descend);
    };
    sourceFile.forEachChild(descend);
    return found;
  };

  const diagnostics = ts.getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.file === sourceFile && diagnostic.start !== undefined);
  for (const diagnostic of diagnostics) {
    const position = diagnostic.start ?? 0;
    let node = innermost(position);
    /** @type {ts.Identifier | undefined} */
    let target;
    while (node !== undefined && node !== sourceFile) {
      const isDeclarationName = ts.isVariableDeclaration(node.parent) && node.parent.name === node;
      const isPropertyName = ts.isPropertyAssignment(node.parent) || ts.isPropertyAccessExpression(node.parent);
      // A shorthand `{ value }` has no name to extend -- `{ value.operation }` is not a property, it is a
      // syntax error. The shorthand becomes an explicit property first: `{ value: value.operation }`.
      const isShorthand = ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node;
      if (ts.isIdentifier(node) && !isDeclarationName && !isPropertyName) {
        let matched = false;
        try { matched = seesOperation(checker.getTypeAtLocation(node)); } catch { matched = false; }
        if (matched) {
          if (isShorthand) put(node.getStart(sourceFile), node.getStart(sourceFile), `${node.text}: `);
          target = node;
          break;
        }
      }
      node = node.parent;
    }
    if (target !== undefined) {
      put(target.end, target.end, ".operation");
      counts.operation += 1;
    }
  }
}

// ---- apply ---------------------------------------------------------------------------
/** @type {Edit[]} */
const sorted = edits.slice().sort((a, b) => b.start - a.start || b.end - a.end);
let out = sourceFile.text;
let last = Infinity;
for (const edit of sorted) {
  if (edit.end > last) continue;
  out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  last = edit.start;
}
writeFileSync(FILE, out);
console.error(JSON.stringify(counts));
