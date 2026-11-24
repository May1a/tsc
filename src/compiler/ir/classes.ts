import { unsupportedFormMessage } from "./builtins/manifest.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import { type ClassInfo, type CollectedClassMembers, buildClassInfo, classAccessorEntries, classMethodEntries, classPrototypeName, classStaticStorageName, collectClassMembers, lowerClassInheritanceOperations, resolveClassNames } from "./class-info.js";
import { type LoweredStatementList, type Produced, loweredOperationList, loweredUnsupportedStatementList, unsupportedIn } from "./lowered.js";
import type { JsIrOperation } from "./types.js";
import { unwrapTypeOnlyExpression } from "./predicates.js";
import { lowerClassComputedKeySlot, lowerClassComputedMethodStore, lowerClassConstructorValue, lowerClassPrototypeStorage, lowerClassStaticInitializers, lowerClassStaticStorage, lowerPrivateFunctionSlots, lowerPrototypeMethodStores } from "./class-storage.js";
import { lowerClassConstructor } from "./class-constructors.js";
import { lowerClassAccessor, lowerClassMethod, lowerClassStaticBlock } from "./class-methods.js";
import { classAccessorFunctionName, classComputedAccessorFunctionName, classConstructorValueName, classDynamicSuperName, classStaticAccessorFunctionName, classStaticBlockFunctionName } from "./class-names.js";
import { isRuntimeIdentifierReference, lowerInlineFunctionCaptures } from "./captures.js";
import type { JsIrValueExpression } from "./expressions.js";

/**
 * The class result for a top-level statement, or `undefined` when it is not a class form.
 *
 * Both class spellings reach one place so the caller has a single thing to branch on: a declaration
 * and an expression bound to a `const` differ only in which recognizer claims them.
 */
/**
 * Pre-registers top-level class metadata before statement lowering so functions and earlier classes
 * can instantiate or reference classes declared later in the same module.
 */
export function preregisterModuleClasses(
  statements: readonly ts.Statement[],
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  classes: Map<string, ClassInfo>
): void {
  const pending: { readonly node: ts.ClassDeclaration | ts.ClassExpression; readonly bindingName?: string }[] = [];
  for (const statement of statements) {
    if (ts.isClassDeclaration(statement) && statement.name !== undefined && !hasDecorators(statement) && !statement.members.some(hasMemberDecorators)) {
      pending.push({ node: statement });
    } else if (ts.isVariableStatement(statement) && (statement.declarationList.flags & ts.NodeFlags.Const) !== 0 && statement.declarationList.declarations.length === 1) {
      const [decl] = statement.declarationList.declarations;
      if (ts.isIdentifier(decl.name) && decl.initializer !== undefined) {
        const init = unwrapTypeOnlyExpression(decl.initializer);
        if (ts.isClassExpression(init) && !hasDecorators(init) && !init.members.some(hasMemberDecorators)) {
          pending.push({ node: init, bindingName: decl.name.text });
        }
      }
    }
  }
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const candidate of pending) {
      const resolved = resolveClassNames(candidate.node, candidate.bindingName, classes, bindings);
      if (resolved.kind !== "lowered" || classes.has(resolved.operation.infoName)) {
        continue;
      }
      const collected = collectClassMembers(candidate.node, bindings, resolved.operation.infoName);
      if (collected.kind !== "lowered") {
        continue;
      }
      const built = buildClassInfo(resolved.operation, collected.operation, classes);
      if (built.kind === "lowered") {
        classes.set(built.operation.name, built.operation);
        progressed = true;
      }
    }
  }
}

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

function hasDecorators(node: ts.Node): boolean {
  return ts.canHaveDecorators(node) && (ts.getDecorators(node)?.length ?? 0) > 0;
}

function hasMemberDecorators(member: ts.ClassElement): boolean {
  if (hasDecorators(member)) {
    return true;
  }
  if (ts.isConstructorDeclaration(member) || ts.isMethodDeclaration(member)
    || ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member)) {
    return member.parameters.some(hasDecorators);
  }
  return false;
}

export function lowerNestedClassDeclaration(
  context: LoweringContext,
  statement: ts.ClassDeclaration,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrOperation> {
  const sourceName = statement.name?.text;
  const localId = context.nextFunctionObjectId;
  context.nextFunctionObjectId += 1;
  const syntheticName = `${sourceName ?? "Anonymous"}__local_${localId}`;
  const result = lowerClassDeclaration(context, statement, bindings, context.classes, syntheticName, true);
  if (result.kind !== "lowered") {
    return result;
  }
  const ctorRef: JsIrValueExpression = { kind: "variable", name: classConstructorValueName(syntheticName) };
  const bindOp: readonly JsIrOperation[] = sourceName === undefined
    ? []
    : [{ kind: "letValue", name: sourceName, value: ctorRef }];
  return { kind: "lowered", operation: { kind: "bindingGroup", operations: [...result.operation, ...bindOp] } };
}

export function lowerClassExpressionValue(
  context: LoweringContext,
  expression: ts.ClassExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrValueExpression> {
  const rawName = expression.name?.text ?? "ClassExpr";
  const localId = context.nextFunctionObjectId;
  context.nextFunctionObjectId += 1;
  const syntheticName = `${rawName}__expr_${localId}`;
  const captureNames = collectClassExpressionCaptureNames(expression, bindings);
  const captures = lowerInlineFunctionCaptures(captureNames, bindings);
  if (captures === undefined) {
    return unsupportedIn("A class expression captures a binding that cannot be lowered");
  }
  const result = lowerClassDeclaration(context, expression, bindings, context.classes, syntheticName, true);
  if (result.kind !== "lowered") {
    return result;
  }
  const iifeCodeName = `__tscn_classexpr_${syntheticName}`;
  const body: JsIrOperation[] = [
    ...result.operation,
    { kind: "returnValue", expression: { kind: "variable", name: classConstructorValueName(syntheticName) } }
  ];
  return {
    kind: "lowered",
    operation: {
      kind: "callValue",
      callee: {
        kind: "functionObject",
        definition: {
          codeName: iifeCodeName,
          parameters: [],
          functionKind: "arrow",
          returnKind: "value",
          body,
          ...(captures.length === 0 ? {} : { captures })
        }
      },
      arguments: []
    }
  };
}

function collectClassExpressionCaptureNames(
  expression: ts.ClassExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): readonly string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && bindings.has(node.text) && !seen.has(node.text) && isRuntimeIdentifierReference(node)) {
      seen.add(node.text);
      names.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(expression);
  return names;
}

// eslint-disable-next-line complexity, max-statements -- Class declaration lowering assembles all generated class artifacts in source order.
function lowerClassDeclaration(
  context: LoweringContext,
  statement: ts.ClassDeclaration | ts.ClassExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  classes: Map<string, ClassInfo>,
  expressionBindingName?: string,
  isLocal = false
): LoweredStatementList {
  if (hasDecorators(statement) || statement.members.some(hasMemberDecorators)) {
    return unsupportedIn(unsupportedFormMessage("decorator"));
  }
  const before = new Map(classes);
  const result = lowerRegisteredClassDeclaration(context, statement, bindings, classes, expressionBindingName, isLocal);
  if (result.kind === "unsupported" || isLocal) {
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
  memberBindings: ReadonlyMap<string, JsIrBindingValue>,
  dynamicBaseExpression: ts.Expression | undefined,
  isLocal = false
): LoweredStatementList {
  const { baseName } = info;
  const operations: JsIrOperation[] = [];
  if (dynamicBaseExpression !== undefined) {
    const superValue = context.lowerValueExpression(context, dynamicBaseExpression, memberBindings);
    if (superValue.kind !== "lowered") {
      return loweredUnsupportedStatementList(
        superValue.kind === "unsupported" ? superValue.reason : "A dynamic `extends` expression must be an expression this build can evaluate"
      );
    }
    operations.push({
      kind: "letValue",
      name: classDynamicSuperName(info.name),
      ...(isLocal ? {} : { moduleGlobal: true }),
      value: superValue.operation
    });
  }
  // Computed member names evaluate once, in definition order, before any
  // static initializer runs — matching Node's class-definition evaluation.
  for (const computedKey of members.computedKeys) {
    const slot = lowerClassComputedKeySlot(context, computedKey, memberBindings, isLocal);
    if (slot.kind !== "lowered") {
      return loweredUnsupportedStatementList(slot.reason);
    }
    operations.push(slot.operation);
  }
  operations.push(lowerClassPrototypeStorage(info, isLocal));
  operations.push(lowerClassStaticStorage(info, isLocal));
  const inheritance = lowerClassInheritanceOperations(info, baseName);
  if (inheritance.kind !== "unsupported") {
    operations.push(...inheritance.operation);
  }
  if (dynamicBaseExpression !== undefined) {
    operations.push({
      kind: "classLinkDynamicBase",
      prototypeName: classPrototypeName(info.name),
      staticsName: classStaticStorageName(info.name),
      superName: classDynamicSuperName(info.name)
    });
  }
  return lowerClassMemberOperations(context, info, members, memberBindings, operations, isLocal);
}

/** Appends the per-member operations, stopping at the first member that cannot be placed. */
// eslint-disable-next-line complexity, max-statements -- Emits class methods, accessors, constructor value, and static initializers in JS evaluation order.
function lowerClassMemberOperations(
  context: LoweringContext,
  info: ClassInfo,
  members: CollectedClassMembers,
  memberBindings: ReadonlyMap<string, JsIrBindingValue>,
  operations: JsIrOperation[],
  isLocal = false
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
  const constructor = lowerClassConstructor(context, info, members.constructorDeclaration, memberBindings, isLocal);
  if (constructor.kind !== "lowered") {
    return loweredUnsupportedStatementList(constructor.reason);
  }
  operations.push(constructor.operation);
  const methodCaptures = new Map<string, readonly string[]>();
  const recordCaptures = (op: JsIrOperation): void => {
    if (op.kind === "function" && op.enclosingCaptureNames !== undefined && op.enclosingCaptureNames.length > 0) {
      methodCaptures.set(op.name, op.enclosingCaptureNames);
    }
  };
  for (const [entries, isStatic] of classMethodEntries(members)) {
    for (const entry of entries) {
      const method = lowerClassMethod(context, info, entry, isStatic, memberBindings);
      if (method.kind !== "lowered") {
        return loweredUnsupportedStatementList(method.reason);
      }
      recordCaptures(method.operation);
      operations.push(method.operation);
    }
  }
  for (const [entries, isGetter, isStatic] of classAccessorEntries(members)) {
    for (const entry of entries) {
      const fnName = isStatic
        ? classStaticAccessorFunctionName(info.name, entry.name, isGetter)
        : classAccessorFunctionName(info.name, entry.name, isGetter);
      const accessor = lowerClassAccessor(context, info, entry.declaration, fnName, memberBindings, isStatic);
      if (accessor.kind !== "lowered") {
        return loweredUnsupportedStatementList(accessor.reason);
      }
      recordCaptures(accessor.operation);
      operations.push(accessor.operation);
    }
  }
  for (const entry of members.computedAccessors) {
    const fnName = classComputedAccessorFunctionName(info.name, entry.isStatic, entry.isGetter, entry.index);
    const accessor = lowerClassAccessor(context, info, entry.declaration, fnName, memberBindings, entry.isStatic);
    if (accessor.kind !== "lowered") {
      return loweredUnsupportedStatementList(accessor.reason);
    }
    recordCaptures(accessor.operation);
    operations.push(accessor.operation);
  }
  for (const item of members.staticInitializers) {
    if (item.kind !== "block") {
      continue;
    }
    const blockFn = lowerClassStaticBlock(context, info, item.declaration, classStaticBlockFunctionName(info.name, item.index), memberBindings);
    if (blockFn.kind !== "lowered") {
      return loweredUnsupportedStatementList(blockFn.reason);
    }
    operations.push(blockFn.operation);
  }
  // Prototype and static entries for dispatched calls come after the methods they wrap.
  for (const store of lowerPrototypeMethodStores(context, info, members, isLocal ? methodCaptures : undefined)) {
    operations.push(store);
  }
  operations.push(...lowerPrivateFunctionSlots(context, info, isLocal, isLocal ? methodCaptures : undefined));
  const ctorCaptures = constructor.operation.kind === "function" ? (constructor.operation.enclosingCaptureNames ?? []) : [];
  operations.push(...lowerClassConstructorValue(context, info, isLocal, ctorCaptures));
  const staticInit = lowerClassStaticInitializers(context, info, members.staticInitializers, memberBindings);
  if (staticInit.kind !== "lowered") {
    return loweredUnsupportedStatementList(staticInit.reason);
  }
  operations.push(...staticInit.operation);
  return loweredOperationList(operations);
}

/** `lowerClassDeclaration` with the registry rollback left to its caller. */
function lowerRegisteredClassDeclaration(
  context: LoweringContext,
  statement: ts.ClassDeclaration | ts.ClassExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  classes: Map<string, ClassInfo>,
  expressionBindingName?: string,
  isLocal = false
): LoweredStatementList {
  const resolved = resolveClassNames(statement, expressionBindingName, classes, bindings);
  if (resolved.kind !== "lowered") {
    return loweredUnsupportedStatementList(resolved.reason);
  }
  const names = resolved.operation;
  // The inner name of a named class expression shadows any outer binding inside
  // the class body, per JS class-scope semantics.
  const memberBindings = new Map<string, JsIrBindingValue>(bindings);
  for (const forwardName of context.moduleForwardBindings) {
    if (!memberBindings.has(forwardName)) {
      memberBindings.set(forwardName, { kind: "valueVariable", name: forwardName });
    }
  }
  if (names.innerName !== undefined && memberBindings.has(names.innerName)) {
    memberBindings.delete(names.innerName);
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
  let previousInnerName: ClassInfo | undefined;
  if (names.innerName !== undefined) {
    previousInnerName = classes.get(names.innerName);
    classes.set(names.innerName, info);
  }
  try {
    return lowerClassOperations(context, info, collected.operation, memberBindings, names.dynamicBaseExpression, isLocal);
  } finally {
    if (names.innerName !== undefined && previousInnerName !== undefined) {
      classes.set(names.innerName, previousInnerName);
    }
  }
}
