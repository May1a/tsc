import { unsupportedFormMessage } from "./builtins/manifest.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import { type ClassInfo, type CollectedClassMembers, buildClassInfo, classAccessorEntries, classLoweringState, classMethodEntries, collectClassMembers, lowerClassInheritanceOperations, resolveClassNames } from "./class-info.js";
import { type LoweredStatementList, type Produced, loweredOperationList, loweredUnsupportedStatementList, unsupportedIn } from "./lowered.js";
import type { JsIrOperation } from "./types.js";
import { unwrapTypeOnlyExpression } from "./predicates.js";
import { lowerClassComputedKeySlot, lowerClassComputedMethodStore, lowerClassPrototypeStorage, lowerClassStaticStorage } from "./class-storage.js";
import { lowerClassConstructor } from "./class-constructors.js";
import { lowerClassAccessor, lowerClassMethod } from "./class-methods.js";
import { classAccessorFunctionName } from "./class-names.js";

/**
 * The class result for a top-level statement, or `undefined` when it is not a class form.
 *
 * Both class spellings reach one place so the caller has a single thing to branch on: a declaration
 * and an expression bound to a `const` differ only in which recognizer claims them.
 */
export function lowerClassStatement(
  context: LoweringContext,
  statement: ts.Statement,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  classes: Map<string, ClassInfo>
): Produced<readonly JsIrOperation[]> | undefined {
  if (ts.isClassDeclaration(statement)) {
    return lowerClassDeclaration(context, statement, bindings, classes);
  }
  return lowerClassExpressionStatement(context, statement, bindings, classes);
}

function lowerClassExpressionStatement(
  context: LoweringContext,
  statement: ts.Statement,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  classes: Map<string, ClassInfo>
): Produced<readonly JsIrOperation[]> | undefined {
  if (!ts.isVariableStatement(statement)) {
    return undefined;
  }
  const [declaration] = statement.declarationList.declarations;
  if (statement.declarationList.declarations.length !== 1 || declaration.initializer === undefined) {
    return undefined;
  }
  const initializer = unwrapTypeOnlyExpression(declaration.initializer);
  if (!ts.isClassExpression(initializer)) {
    return undefined;
  }
  if (!ts.isIdentifier(declaration.name)) {
    return unsupportedIn("A class expression must be bound to an identifier");
  }
  if ((statement.declarationList.flags & ts.NodeFlags.Const) === 0) {
    return unsupportedIn("A class expression must be bound to a `const`");
  }
  return lowerClassDeclaration(context, initializer, bindings, classes, declaration.name.text);
}

// eslint-disable-next-line complexity, max-statements -- Class declaration lowering assembles all generated class artifacts in source order.
function lowerClassDeclaration(
  context: LoweringContext,
  statement: ts.ClassDeclaration | ts.ClassExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  classes: Map<string, ClassInfo>,
  expressionBindingName?: string
): LoweredStatementList {
  if ((ts.canHaveDecorators(statement) && (ts.getDecorators(statement)?.length ?? 0) > 0)
    || statement.members.some((member) => ts.canHaveDecorators(member) && (ts.getDecorators(member)?.length ?? 0) > 0)) {
    return unsupportedIn(unsupportedFormMessage("decorator"));
  }
  if (statement.members.some((member) => ts.isMethodDeclaration(member) && member.body !== undefined
    && ts.getModifiers(member)?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) === true)) {
    return unsupportedIn(unsupportedFormMessage("async-function"));
  }
  if (statement.members.some((member) => ts.isMethodDeclaration(member) && member.body !== undefined
    && member.asteriskToken !== undefined)) {
    return unsupportedIn(unsupportedFormMessage("class-generator-method"));
  }
  const before = new Map(classes);
  const result = lowerRegisteredClassDeclaration(context, statement, bindings, classes, expressionBindingName);
  if (result.kind === "unsupported") {
    // A class is registered before its body lowers, because `this`, `super` and a self-referencing
    // receiver all resolve through the registry. Before this tier carried a reason, a refusal threw
    // all the way out of the file and the registry died with it; now it is a value that returns, so
    // the rollback has to be explicit. Without it a later `class Derived extends Base` sees a base
    // whose `Base$prototype` slot was never emitted and emission dies on `Expected JSValue binding`.
    classes.clear();
    for (const [name, info] of before) {
      classes.set(name, info);
    }
  }
  return result;
}

/** The operations a registered class contributes to the module, in definition order. */
function lowerClassOperations(
  context: LoweringContext,
  info: ClassInfo,
  members: CollectedClassMembers,
  memberBindings: ReadonlyMap<string, JsIrBindingValue>
): LoweredStatementList {
  const { baseName } = info;
  const operations: JsIrOperation[] = [];
  // Computed member names evaluate once, in definition order, before any
  // static initializer runs — matching Node's class-definition evaluation.
  for (const computedKey of members.computedKeys) {
    const slot = lowerClassComputedKeySlot(context, computedKey, memberBindings);
    if (slot.kind !== "lowered") {
      return loweredUnsupportedStatementList(slot.reason);
    }
    operations.push(slot.operation);
  }
  operations.push(lowerClassPrototypeStorage(info));
  const staticStorage = lowerClassStaticStorage(context, info, members.staticFields, memberBindings);
  if (staticStorage.kind !== "lowered") {
    return loweredUnsupportedStatementList(staticStorage.reason);
  }
  operations.push(staticStorage.operation);
  const inheritance = lowerClassInheritanceOperations(info, baseName);
  if (inheritance.kind !== "unsupported") {
    operations.push(...inheritance.operation);
  }
  return lowerClassMemberOperations(context, info, members, memberBindings, operations);
}

/** Appends the per-member operations, stopping at the first member that cannot be placed. */
function lowerClassMemberOperations(
  context: LoweringContext,
  info: ClassInfo,
  members: CollectedClassMembers,
  memberBindings: ReadonlyMap<string, JsIrBindingValue>,
  operations: JsIrOperation[]
): LoweredStatementList {
  for (const entry of members.computedMethodDeclarations) {
    const store = lowerClassComputedMethodStore(context, info, entry, false, memberBindings);
    if (store.kind !== "lowered") {
      return loweredUnsupportedStatementList(store.reason);
    }
    operations.push(store.operation);
  }
  for (const entry of members.computedStaticMethodDeclarations) {
    const store = lowerClassComputedMethodStore(context, info, entry, true, memberBindings);
    if (store.kind !== "lowered") {
      return loweredUnsupportedStatementList(store.reason);
    }
    operations.push(store.operation);
  }
  const constructor = lowerClassConstructor(context, info, members.constructorDeclaration, memberBindings);
  if (constructor.kind !== "lowered") {
    return loweredUnsupportedStatementList(constructor.reason);
  }
  operations.push(constructor.operation);
  for (const [entries, isStatic] of classMethodEntries(members)) {
    for (const entry of entries) {
      const method = lowerClassMethod(context, info, entry, isStatic, memberBindings);
      if (method.kind !== "lowered") {
        return loweredUnsupportedStatementList(method.reason);
      }
      operations.push(method.operation);
    }
  }
  for (const [entries, isGetter] of classAccessorEntries(members)) {
    for (const entry of entries) {
      const accessor = lowerClassAccessor(
        context, info,
        entry.declaration,
        classAccessorFunctionName(info.name, entry.name, isGetter),
        memberBindings
      );
      if (accessor.kind !== "lowered") {
        return loweredUnsupportedStatementList(accessor.reason);
      }
      operations.push(accessor.operation);
    }
  }
  return loweredOperationList(operations);
}

/** `lowerClassDeclaration` with the registry rollback left to its caller. */
function lowerRegisteredClassDeclaration(
  context: LoweringContext,
  statement: ts.ClassDeclaration | ts.ClassExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  classes: Map<string, ClassInfo>,
  expressionBindingName?: string
): LoweredStatementList {
  const resolved = resolveClassNames(statement, expressionBindingName, classes);
  if (resolved.kind !== "lowered") {
    return loweredUnsupportedStatementList(resolved.reason);
  }
  const names = resolved.operation;
  // The inner name of a named class expression shadows any outer binding inside
  // the class body, per JS class-scope semantics.
  let memberBindings: ReadonlyMap<string, JsIrBindingValue> = bindings;
  if (names.innerName !== undefined && bindings.has(names.innerName)) {
    const shadowed = new Map(bindings);
    shadowed.delete(names.innerName);
    memberBindings = shadowed;
  }
  const collected = collectClassMembers(statement, memberBindings, names.infoName);
  if (collected.kind !== "lowered") {
    return loweredUnsupportedStatementList(collected.reason);
  }
  const built = buildClassInfo(names, collected.operation, classes);
  if (built.kind !== "lowered") {
    return loweredUnsupportedStatementList(built.reason);
  }
  const info = built.operation;
  classes.set(info.name, info);
  classLoweringState.registry = classes;
  let previousInnerName: ClassInfo | undefined;
  if (names.innerName !== undefined) {
    previousInnerName = classes.get(names.innerName);
    classes.set(names.innerName, info);
  }
  try {
    return lowerClassOperations(context, info, collected.operation, memberBindings);
  } finally {
    // The inner name stays registered when it does not clobber another class:
    // the TypeScript checker names instance types after it, so receivers typed
    // by the class (`const c = new C()`) resolve their class through it. Direct
    // outer references to the inner name are rejected by the type checker, so
    // the leaked binding is not observable in valid programs.
    if (names.innerName !== undefined && previousInnerName !== undefined) {
      classes.set(names.innerName, previousInnerName);
    }
  }
}
