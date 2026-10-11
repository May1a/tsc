import ts from "typescript";
import { unwrapTypeOnlyExpression } from "./predicates.js";

/**
 * The instance-method shape of one class, read from its declaration before any body lowers.
 *
 * `opaque` records a class with an instance method whose name is only known when the class
 * definition runs. Such a method can override any name, so every method above it is treated as
 * overridden.
 */
interface ClassHierarchyEntry {
  readonly baseName: string | undefined;
  readonly methods: ReadonlySet<string>;
  readonly opaque: boolean;
}

/**
 * Every class a source file declares, keyed by the name the class registry uses.
 *
 * Lowering registers a class when its declaration lowers, so the registry cannot answer whether a
 * method is overridden: a function declared between a base and its subclass lowers before the
 * subclass exists. This table is collected from the whole file first and answers that question the
 * same way at every call site.
 */
export interface ClassHierarchy {
  readonly entries: ReadonlyMap<string, ClassHierarchyEntry>;
}

export const emptyClassHierarchy: ClassHierarchy = { entries: new Map() };

/** Collects every named class declaration and `const`-bound class expression in a source file. */
export function collectClassHierarchy(sourceFile: ts.SourceFile): ClassHierarchy {
  const entries = new Map<string, ClassHierarchyEntry>();
  const record = (name: string, node: ts.ClassLikeDeclaration): void => {
    entries.set(name, mergeEntries(entries.get(name), hierarchyEntry(node)));
  };
  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node) && node.name !== undefined) {
      record(node.name.text, node);
    } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined) {
      const initializer = unwrapTypeOnlyExpression(node.initializer);
      if (ts.isClassExpression(initializer)) {
        record(node.name.text, initializer);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { entries };
}

/**
 * Two declarations that share a name both reach the registry under it, so a call resolved through
 * that name may meet either. Their union keeps the answers below conservative.
 */
function mergeEntries(existing: ClassHierarchyEntry | undefined, next: ClassHierarchyEntry): ClassHierarchyEntry {
  if (existing === undefined) {
    return next;
  }
  return {
    baseName: existing.baseName ?? next.baseName,
    methods: new Set([...existing.methods, ...next.methods]),
    opaque: existing.opaque || next.opaque
  };
}

function hierarchyEntry(node: ts.ClassLikeDeclaration): ClassHierarchyEntry {
  const methods = new Set<string>();
  let opaque = false;
  for (const member of node.members) {
    if (!ts.isMethodDeclaration(member) || hasModifier(member, ts.SyntaxKind.StaticKeyword) || ts.isPrivateIdentifier(member.name)) {
      continue;
    }
    const name = literalMemberName(member.name);
    if (name === undefined) {
      opaque ||= member.body !== undefined;
    } else if (member.body !== undefined) {
      methods.add(name);
    }
  }
  return { baseName: extendedIdentifier(node), methods, opaque };
}

function hasModifier(member: ts.ClassElement, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(member) && (ts.getModifiers(member)?.some((modifier) => modifier.kind === kind) ?? false);
}

function literalMemberName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return undefined;
}

function extendedIdentifier(node: ts.ClassLikeDeclaration): string | undefined {
  const heritage = node.heritageClauses?.find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword);
  const expression = heritage?.types.at(0)?.expression;
  return expression !== undefined && ts.isIdentifier(expression) ? expression.text : undefined;
}

/** The proper ancestors of `className`, nearest first. A cycle ends the walk. */
function ancestorsOf(hierarchy: ClassHierarchy, className: string): readonly string[] {
  const ancestors: string[] = [];
  let current = hierarchy.entries.get(className)?.baseName;
  while (current !== undefined && current !== className && !ancestors.includes(current)) {
    ancestors.push(current);
    current = hierarchy.entries.get(current)?.baseName;
  }
  return ancestors;
}

/** Whether some class strictly below `className` implements `methodName`, or may. */
export function isOverriddenBelow(hierarchy: ClassHierarchy, className: string, methodName: string): boolean {
  for (const [name, entry] of hierarchy.entries) {
    if ((entry.methods.has(methodName) || entry.opaque) && ancestorsOf(hierarchy, name).includes(className)) {
      return true;
    }
  }
  return false;
}
