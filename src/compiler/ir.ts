import {
  isMathMethod,
  isNonExecutableDeclaration,
  lowerBooleanComparisonExpression,
  lowerComparisonOperator,
  lowerRuntimeCollectionIdentityCondition,
  lowerTruthyConditionExpression,
  lowerTypeOfResult,
  unsupportedStatementDiagnostic
} from "./ir/comparisons.js";
import {
  collectFunctionDeclarationEnclosingCaptureNames,
  collectFunctionExpressionCaptureNames,
  collectFunctionObjectDefinitions,
  collectPromotedAggregateNames,
  functionExpressionSelfReferences,
  lowerCapturedBindingValue
} from "./ir/captures.js";
import {
  inlineCppDisabledDiagnostic,
  inlineCppState,
  lowerInlineCppValueExpression
} from "./ir/inline-cpp.js";
import {
  isBoxedAggregateCandidateBinding,
  lowerObjectAccessPath,
  lowerRuntimeDataDescriptorMapValue,
  lowerRuntimeDataDescriptorValue,
  lowerRuntimeObjectCreateBinding,
  lowerRuntimeObjectEntriesBinding,
  lowerRuntimeObjectFromEntriesBinding,
  lowerRuntimeObjectGetPrototypeBinding,
  lowerRuntimeObjectKeysBinding,
  lowerRuntimeObjectOwnPropertyDescriptorsBinding,
  lowerRuntimeObjectOwnPropertyNamesBinding,
  lowerRuntimeObjectStateCondition,
  lowerRuntimeObjectValuesBinding,
  objectHasNestedFields,
  objectPathExists
} from "./ir/builtins/object-producers.js";
import {

  type ClassComputedKeyInfo,
  type ClassComputedMethodEntry,
  type ClassFieldInfo,
  type ClassInfo,
  type ClassMemberKey,
  type ClassMethodEntry,
  type ClassMethodInfo,

  type CollectedClassMembers,
  appendClassOperations,
  buildClassInfo,
  classAccessorEntries,
  classCallableParameters,
  classLoweringState,
  classMethodEntries,
  classPrototypeName,
  classStaticStorageName,
  collectClassMembers,
  containsLexicalThis,
  findClassInChain,
  isPlainObjectReturningConstructor,
  lowerClassInheritanceOperations,
  lowerClassStaticFieldAccess,
  lowerSymbolIteratorKeyExpression,
  parameterValueKind,
  resolveClassNames,
  resolveReceiverClass,
  runtimeParameters,
  sourceSpan,
  traceOperationFromNode
} from "./ir/class-info.js";
import {
  type Lowered,
  type LoweredStatementList,
  type Produced,
  loweredOperation,
  loweredOperationList,
  loweredStatementResult,
  loweredUnsupportedStatementList,
  notApplicable,
  produced,
  statementResult,
  unsupported,
  unsupportedIn
} from "./ir/lowered.js";
import { functionReturnKind, markRuntimeObjectShadows, updateBindings } from "./ir/binding-updates.js";
import ts from "typescript";
import type { CompilerDiagnostic } from "./diagnostics.js";
import { SYMBOL_ITERATOR_SENTINEL } from "./runtime-ir.js";
// The IR's four type modules, re-exported so `llvm.ts`, `trace.ts` and `pipeline.ts` keep one
// import site for the IR.
import type {
  JsIrBindingValue,
  JsIrCallArgument,
  JsIrFunctionParameter,
  JsIrValueKind
} from "./ir/bindings.js";
import type {
  JsIrArrayDestructureElement,
  JsIrClosureValue,
  JsIrCondition,
  JsIrExpression,
  JsIrNumberExpression,
  JsIrNumberOperator,
  JsIrObjectAssignSource,
  JsIrObjectField,
  JsIrObjectValue,
  JsIrRuntimeArrayConcatElement,
  JsIrRuntimeArrayElement,
  JsIrRuntimeDataDescriptor,
  JsIrRuntimeObjectField,
  JsIrRuntimeObjectValue,
  JsIrStringExpression,
  JsIrSwitchClause,
  JsIrValueExpression
} from "./ir/expressions.js";
import {
  definePropertyArgumentCount,
  errorConstructorNames,
  lowerCanonicalArrayIndexString,
  unwrapTypeOnlyExpression,
} from "./ir/predicates.js";
import type {
  JsIrInlineCppBlock,
  JsIrLowerOptions,
  JsIrLoweringMode,
  JsIrOperationTrace,
  JsIrResult,
} from "./ir/module.js";
import {
  isKnownGlobalCallee,
  isPlannedBuiltinCall,
  unlowerableCallee,
} from "./ir/builtins/index.js";
import { unsupportedStatementMessage } from "./ir/diagnostics.js";
import type { JsIrOperation } from "./ir/types.js";
import { visitJsIrOperations } from "./ir/visit.js";
export { aggregateBindingForOperation } from "./ir/binding-updates.js";
export type { Lowered, Produced } from "./ir/lowered.js";
export type * from "./ir/bindings.js";
export type * from "./ir/expressions.js";
export type * from "./ir/module.js";
export type * from "./ir/types.js";

// The TypeScript checker for the program currently being lowered. Set by
// `lowerToJsIr` and read by the class-lowering path for static method dispatch.
// Lowering is synchronous and single-threaded, so a module-level handle is safe.

// Name of the synthetic `this` parameter threaded through constructors/methods.
const CLASS_THIS_NAME = "this";

/**
 * The labels of the loops this lowering is inside, outermost first.
 *
 * A label names a loop, not a place in the emitted code, so `break outer` is resolved here rather than
 * carried to emission: the loop it named sits at a known depth in this list, and the `break` becomes an
 * ordinary one that leaves that many loops. Searching from the innermost is what makes a repeated label
 * name mean the inner loop, which is what JavaScript does.
 */
const enclosingLoopLabels: (string | undefined)[] = [];

/**
 * The label the next loop lowering should adopt, set by a `label: loop` statement.
 *
 * A loop takes the label and clears it, so `outer: for (..)` labels that loop and nothing else. It is a
 * holder rather than a parameter because the loop recognizers are shared by every loop form and threading a
 * label through each of their signatures would reach the whole statement tier.
 */
let pendingLoopLabel: string | undefined;

/**
 * Lower a loop's body with `pendingLoopLabel` adopted as the label of the loop being entered.
 *
 * The label is consumed either way, so a loop that declines leaves nothing behind for its next sibling.
 */
function withinLoopLabel<T>(lowerBody: () => T): T {
  const label = pendingLoopLabel;
  pendingLoopLabel = undefined;
  // Every loop takes a frame, labelled or not: the depth a `break label` resolves to counts *loops*, so an
  // unlabelled one between here and the target has to occupy a position or the count is short.
  enclosingLoopLabels.push(label);
  try {
    return lowerBody();
  } finally {
    enclosingLoopLabels.pop();
  }
}

/**
 * How many loops lie between here and the one `label` names, or `undefined` when no enclosing loop has
 * that label — which for a well-typed program means a labelled `break` that names nothing in scope.
 */
function loopDepthForLabel(label: string): number | undefined {
  for (let index = enclosingLoopLabels.length - 1; index >= 0; index--) {
    if (enclosingLoopLabels[index] === label) {
      return enclosingLoopLabels.length - 1 - index;
    }
  }
  return undefined;
}


// Registry of classes in the file being lowered, consulted by the deep value
// lowerers to resolve `new C(...)`. Scoped per file by `lowerTopLevelStatements`.

// True while lowering a constructor or method body, so `this` resolves to the
// synthetic instance parameter.
let classThisInScope = false;
let activeEnclosingClass: ClassInfo | undefined;
let activeClassMethodStatic = false;





let nextFunctionObjectId = 0;
let nextJsonStatementValueId = 0;

type ArrayLiteralClassification =
  | {
      readonly kind: "fixed";
      readonly elements: readonly JsIrNumberExpression[];
    }
  | {
      readonly kind: "runtime";
      readonly elements: readonly JsIrRuntimeArrayElement[];
    };

type ObjectLiteralClassification =
  | {
      readonly kind: "fixed";
      readonly value: JsIrObjectValue;
    }
  | {
      readonly kind: "runtime";
      readonly value: JsIrRuntimeObjectValue;
    };

const arrayFillRangeArgumentCount = 3;
const arrayCopyWithinArgumentCount = 3;
const arrayCallbackArgumentCount = 3;
const reduceCallbackArgumentCount = 4;
const sortCallbackArgumentCount = 2;
const decimalRadix = 10;
const minimumNumberRadix = 2;
const maximumNumberRadix = 36;
const maximumToFixedDigits = 100;
const regexpConstructorArgumentCount = 2;
const arrayFromArgumentCount = 3;
const traceOperationIdWidth = 6;

function finalizeOperationTraces(operations: readonly JsIrOperation[], moduleIndex: number): readonly JsIrOperation[] {
  let operationIndex = 0;
  visitJsIrOperations(operations, (operation, parent) => {
    const inheritedSource = operation.trace?.source ?? parent?.trace?.source;
    const id = `m${moduleIndex}:o${operationIndex.toString().padStart(traceOperationIdWidth, "0")}`;
    let trace: JsIrOperationTrace = { id, origin: operation.trace?.origin ?? "synthesized" };
    if (inheritedSource !== undefined) {
      trace = { ...trace, source: inheritedSource };
    }
    (operation as { trace?: JsIrOperationTrace }).trace = trace;
    operationIndex += 1;
  });
  return operations;
}


























/**
 * `Produced` for a recognizer that produces something other than a single operation.
 *
 * Named for the shape rather than the verb: `lowered` is already a local in several functions
 * below, and shadowing it would hide which one a call refers to.
 */

/** The refusal, narrowed to whatever the caller returns. */

/**
 * The "no recognizer claimed this" value, typed so it fits any `Lowered<T>`.
 *
 * `never` is what makes that work: `Lowered<never>`'s lowered branch carries `operation: never`, which
 * is assignable to `operation: T` for every `T`, so one constant can be returned from a recognizer
 * that produces an operation and from one that produces a list of them. Typing it as `Lowered` alone
 * pinned it to `JsIrOperation` and made every other return site a type error.
 */

/**
 * Aborts the class lowering pass.
 *
 * The class recognizers still unwind by exception rather than returning `unsupported`; this is
 * the one place the distinction is not yet expressed as a value, and it is the reason lowering
 * has to run the file twice. The optional `reason` is the diagnostic text when the abort already
 * knows what the limitation is.
 */
/** The diagnostic text a failed class lowering already knows, or `undefined` when it does not. */
/** The reason a body statement refused, which is what aborts the enclosing class member. */
function classAbortReason(result: Lowered): string {
  if (result.kind === "unsupported") {
    return result.reason;
  }
  return "A statement in a class member body could not be lowered";
}

class ClassLoweringUnsupportedError extends Error {
  public constructor(reason?: string) {
    super(reason ?? "class lowering unsupported");
    this.name = "ClassLoweringUnsupportedError";
  }
}

interface LoweredStatements {
  readonly operations: readonly JsIrOperation[];
  readonly diagnostics: readonly CompilerDiagnostic[];
  readonly loweringMode: JsIrLoweringMode;
}

function lowerStatements(
  sourceFile: ts.SourceFile
): LoweredStatements {
  nextFunctionObjectId = 0;
  nextJsonStatementValueId = 0;
  const inlineCppDiagnostic = inlineCppDisabledDiagnostic(sourceFile);
  if (inlineCppDiagnostic !== undefined) {
    return { operations: [], diagnostics: [inlineCppDiagnostic], loweringMode: "native" };
  }

  try {
    return lowerTopLevelStatements(sourceFile);
  } catch (error) {
    if (!(error instanceof ClassLoweringUnsupportedError)) {
      throw error;
    }
    return {
      operations: [],
      diagnostics: [{
        code: "TSCN1002",
        category: "error",
        message: error.message,
        span: sourceSpan(sourceFile, 0)
      }],
      loweringMode: "native"
    };
  }
}

































/**
 * Lowers a source file's top-level statements, collecting a TSCN1002 for each one nothing
 * recognizes. There is no second attempt: a statement that does not lower is reported where it
 * failed, and a class statement that does not lower is reported with the reason the class tier gave.
 */
function lowerTopLevelStatements(sourceFile: ts.SourceFile): LoweredStatements {
  const operations: JsIrOperation[] = [];
  const bindings = new Map<string, JsIrBindingValue>();
  const diagnostics: CompilerDiagnostic[] = [];
  const promotedAggregates = collectPromotedAggregateNames(sourceFile.statements);
  const classes = new Map<string, ClassInfo>();
  const { registry: previousClassRegistry } = classLoweringState;
  classLoweringState.registry = classes;

  try {
    for (const statement of sourceFile.statements) {
      if (isNonExecutableDeclaration(statement)) {
        continue;
      }

      const classResult = lowerClassStatement(statement, bindings, classes);
      if (classResult !== undefined) {
        if (classResult.kind === "unsupported") {
          diagnostics.push(unsupportedStatementDiagnostic(sourceFile, statement, classResult, bindings));
        } else {
          appendClassOperations(operations, classResult.operation, statement, bindings);
        }
        continue;
      }

      const result = lowerStatement(statement, bindings, promotedAggregates);
      if (result.kind === "lowered") {
        operations.push(result.operation);
        updateBindings(result.operation, bindings);
        continue;
      }
      diagnostics.push(unsupportedStatementDiagnostic(sourceFile, statement, result, bindings));
    }
  } finally {
    classLoweringState.registry = previousClassRegistry;
  }

  return { operations: markRuntimeObjectShadows(operations), diagnostics, loweringMode: "native" };
}
























// ---- Real class lowering (static dispatch) ----------------------------------
//
// Classes compile to real LLVM code: instances are runtime objects, fields are
// object properties, and the constructor is an ordinary function whose first
// parameter is the explicit `this` instance value. Features that are not yet
// handled throw `ClassLoweringUnsupportedError`, which `lowerStatements` reports
// as a hard TSCN1002 compile error.

function classConstructorName(className: string): string {
  return `${className}$constructor`;
}

/** The generated function name for a method or accessor, static or not. */
function classMethodFunctionName(className: string, methodName: string, isStatic: boolean): string {
  if (isStatic) {
    return `${className}$static$${methodName}`;
  }
  return `${className}$${methodName}`;
}

/** Accessors are getter/setter pairs, so the name says which half. */
function classAccessorFunctionName(className: string, propertyName: string, isGetter: boolean): string {
  if (isGetter) {
    return classGetterFunctionName(className, propertyName);
  }
  return classSetterFunctionName(className, propertyName);
}

function classGetterFunctionName(className: string, propertyName: string): string {
  return `${className}$get$${propertyName}`;
}

function classSetterFunctionName(className: string, propertyName: string): string {
  return `${className}$set$${propertyName}`;
}

// Node-compatible TypeError messages for private field access on an instance
// that does not own the declaring class's brand.
function classPrivateFieldReadMessage(fieldName: string): string {
  return `Cannot read private member ${fieldName} from an object whose class did not declare it`;
}

function classPrivateFieldWriteMessage(fieldName: string): string {
  return `Cannot write private member ${fieldName} to an object whose class did not declare it`;
}

// Lowers `const C = class [Inner] { ... }` by registering the class under the
// declared variable name, so `new C()`, `C.m()`, and `instanceof C` resolve
// exactly like they do for a class declaration. Other class-expression
// positions (arguments, returns, non-const declarations) are unsupported and
// raise a hard compile error. Returns undefined when the statement is not a
// class-expression variable statement.
/**
 * The class result for a top-level statement, or `undefined` when it is not a class form.
 *
 * Both class spellings reach one place so the caller has a single thing to branch on: a declaration
 * and an expression bound to a `const` differ only in which recognizer claims them.
 */
function lowerClassStatement(
  statement: ts.Statement,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  classes: Map<string, ClassInfo>
): Produced<readonly JsIrOperation[]> | undefined {
  if (ts.isClassDeclaration(statement)) {
    return lowerClassDeclaration(statement, bindings, classes);
  }
  return lowerClassExpressionStatement(statement, bindings, classes);
}

function lowerClassExpressionStatement(
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
  return lowerClassDeclaration(initializer, bindings, classes, declaration.name.text);
}

// eslint-disable-next-line complexity, max-statements -- Class declaration lowering assembles all generated class artifacts in source order.
function lowerClassDeclaration(
  statement: ts.ClassDeclaration | ts.ClassExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  classes: Map<string, ClassInfo>,
  expressionBindingName?: string
): LoweredStatementList {
  const before = new Map(classes);
  const result = lowerRegisteredClassDeclaration(statement, bindings, classes, expressionBindingName);
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
  info: ClassInfo,
  members: CollectedClassMembers,
  memberBindings: ReadonlyMap<string, JsIrBindingValue>
): LoweredStatementList {
  const { baseName } = info;
  const operations: JsIrOperation[] = [];
  // Computed member names evaluate once, in definition order, before any
  // static initializer runs — matching Node's class-definition evaluation.
  for (const computedKey of members.computedKeys) {
    const slot = lowerClassComputedKeySlot(computedKey, memberBindings);
    if (slot.kind !== "lowered") {
      return loweredUnsupportedStatementList(slot.reason);
    }
    operations.push(slot.operation);
  }
  operations.push(lowerClassPrototypeStorage(info));
  const staticStorage = lowerClassStaticStorage(info, members.staticFields, memberBindings);
  if (staticStorage.kind !== "lowered") {
    return loweredUnsupportedStatementList(staticStorage.reason);
  }
  operations.push(staticStorage.operation);
  const inheritance = lowerClassInheritanceOperations(info, baseName);
  if (inheritance.kind !== "unsupported") {
    operations.push(...inheritance.operation);
  }
  return lowerClassMemberOperations(info, members, memberBindings, operations);
}

/** Appends the per-member operations, stopping at the first member that cannot be placed. */
function lowerClassMemberOperations(
  info: ClassInfo,
  members: CollectedClassMembers,
  memberBindings: ReadonlyMap<string, JsIrBindingValue>,
  operations: JsIrOperation[]
): LoweredStatementList {
  for (const entry of members.computedMethodDeclarations) {
    const store = lowerClassComputedMethodStore(info, entry, false, memberBindings);
    if (store.kind !== "lowered") {
      return loweredUnsupportedStatementList(store.reason);
    }
    operations.push(store.operation);
  }
  for (const entry of members.computedStaticMethodDeclarations) {
    const store = lowerClassComputedMethodStore(info, entry, true, memberBindings);
    if (store.kind !== "lowered") {
      return loweredUnsupportedStatementList(store.reason);
    }
    operations.push(store.operation);
  }
  const constructor = lowerClassConstructor(info, members.constructorDeclaration, memberBindings);
  if (constructor.kind !== "lowered") {
    return loweredUnsupportedStatementList(constructor.reason);
  }
  operations.push(constructor.operation);
  for (const [entries, isStatic] of classMethodEntries(members)) {
    for (const entry of entries) {
      const method = lowerClassMethod(info, entry, isStatic, memberBindings);
      if (method.kind !== "lowered") {
        return loweredUnsupportedStatementList(method.reason);
      }
      operations.push(method.operation);
    }
  }
  for (const [entries, isGetter] of classAccessorEntries(members)) {
    for (const entry of entries) {
      const accessor = lowerClassAccessor(
        info,
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
    return lowerClassOperations(info, collected.operation, memberBindings);
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

// Emits the module-init slot holding a runtime-computed member name: the name
// expression is evaluated exactly once, at class-definition time.
function lowerClassComputedKeySlot(
  computedKey: ClassComputedKeyInfo,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrOperation> {
  const value = lowerValueExpression(computedKey.expression, bindings);
  if (value === undefined) {
    return unsupportedIn("A computed class member name must be an expression this build can evaluate");
  }
  return produced({ kind: "letValue", name: computedKey.slotName, moduleGlobal: true, value });
}

function classComputedMethodTargetName(info: ClassInfo, isStatic: boolean): string {
  if (isStatic) {
    return classStaticStorageName(info.name);
  }
  return classPrototypeName(info.name);
}

// Stores a method whose name is only known at runtime as a function value on
// the prototype (or statics slot) under the evaluated key. Calls to it resolve
// through the ordinary dynamic property path, since static dispatch requires a
// compile-time name.
function lowerClassComputedMethodStore(
  info: ClassInfo,
  entry: ClassComputedMethodEntry,
  isStatic: boolean,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrOperation> {
  const previousThis = classThisInScope;
  const previousClass = activeEnclosingClass;
  const previousStatic = activeClassMethodStatic;
  classThisInScope = false;
  activeEnclosingClass = info;
  activeClassMethodStatic = isStatic;
  let methodValue: JsIrValueExpression | undefined;
  try {
    methodValue = lowerObjectMethodFunctionValue(entry.declaration, bindings);
  } finally {
    classThisInScope = previousThis;
    activeEnclosingClass = previousClass;
    activeClassMethodStatic = previousStatic;
  }
  if (methodValue === undefined) {
    return unsupportedIn("A computed class method name must be an expression this build can evaluate");
  }
  return produced({
    kind: "valueObjectStore",
    targetName: classComputedMethodTargetName(info, isStatic),
    key: { kind: "stringConversion", value: { kind: "variable", name: entry.slotName } },
    value: methodValue
  });
}

// Emits the module-init slot that backs a class's prototype object: an empty
// object that serves as the prototype for all instances. Accessible as `C.prototype`
// and automatically set on instances via the class-id slot (future work).
function lowerClassPrototypeStorage(info: ClassInfo): JsIrOperation {
  return {
    kind: "letValue",
    name: classPrototypeName(info.name),
    moduleGlobal: true,
    value: { kind: "objectLiteralValue", value: { fields: [] } }
  };
}

// Emits the module-init slot that backs a class's static fields: a single object
// whose properties are the static fields, initialized in declaration order. Each
// `C.x` read/write resolves to a property access on this slot. Returns undefined
// for classes without static fields.
function lowerClassStaticStorage(
  info: ClassInfo,
  staticFields: readonly ClassFieldInfo[],
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrOperation> {
  const fields: JsIrRuntimeObjectField[] = [];
  for (const field of staticFields) {
    const initializer = lowerClassFieldInitializer(field, bindings);
    if (initializer.kind !== "lowered") {
      return initializer;
    }
    fields.push({ kind: "field", key: classMemberKeyStringExpression(field.key), value: initializer.operation });
  }
  return produced({
    kind: "letValue",
    name: classStaticStorageName(info.name),
    moduleGlobal: true,
    value: { kind: "objectLiteralValue", value: { fields } }
  });
}

// String expression addressing a member key: literal keys inline the name;
// computed keys read the definition-time slot and coerce it to a property key.
function classMemberKeyStringExpression(key: ClassMemberKey): JsIrStringExpression {
  if (key.kind === "literal") {
    return { kind: "literal", value: key.name };
  }
  return { kind: "stringConversion", value: { kind: "variable", name: key.slotName } };
}

function lowerClassAccessor(
  info: ClassInfo,
  accessor: ts.AccessorDeclaration,
  functionName: string,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrOperation> {
  if (accessor.body === undefined) {
    return unsupportedIn("An accessor overload signature is not supported yet; only the implementation is lowered");
  }
  const parameters = classCallableParameters(accessor);
  if (parameters.kind !== "lowered") {
    return parameters;
  }
  const fnParameters: JsIrFunctionParameter[] = [
    { name: CLASS_THIS_NAME, valueKind: "value" },
    ...parameters.operation
  ];
  const fnBindings = functionFrameBindings(bindings);
  fnBindings.set(CLASS_THIS_NAME, { kind: "valueVariable", name: CLASS_THIS_NAME });
  for (const parameter of parameters.operation) {
    bindFunctionParameter(parameter.name, parameter.valueKind, false, fnBindings);
  }

  const previousThis = classThisInScope;
  const previousClass = activeEnclosingClass;
  const previousStatic = activeClassMethodStatic;
  classThisInScope = true;
  activeEnclosingClass = info;
  activeClassMethodStatic = false;
  try {
    const body = lowerClassMethodBody(accessor.body, fnBindings);
    if (body.kind !== "lowered") {
      return body;
    }
    return produced({ kind: "function", name: functionName, parameters: fnParameters, body: body.operation });
  } finally {
    classThisInScope = previousThis;
    activeEnclosingClass = previousClass;
    activeClassMethodStatic = previousStatic;
  }
}

function lowerClassMethod(
  info: ClassInfo,
  entry: ClassMethodEntry,
  isStatic: boolean,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrOperation> {
  const { declaration } = entry;
  // `collectClassMembers` drops a method with no body, so this cannot be reached from a class this
  // compiler collected. The guard turns a regression in that filter into a named diagnostic instead of
  // an `undefined` block somewhere in emission, and it is the only narrowing of `body` in the tier.
  if (declaration.body === undefined) {
    return unsupportedIn("A method with no body reached emission; the class tier should have dropped it as an overload signature");
  }
  const methodName = entry.name;
  const parameters = classCallableParameters(declaration);
  if (parameters.kind !== "lowered") {
    return parameters;
  }
  const fnBindings = functionFrameBindings(bindings);
  const fnParameters: JsIrFunctionParameter[] = [];
  if (!isStatic) {
    fnParameters.push({ name: CLASS_THIS_NAME, valueKind: "value" });
    fnBindings.set(CLASS_THIS_NAME, { kind: "valueVariable", name: CLASS_THIS_NAME });
  }
  for (const parameter of parameters.operation) {
    fnParameters.push(parameter);
    bindFunctionParameter(parameter.name, parameter.valueKind, false, fnBindings);
  }

  const previousThis = classThisInScope;
  const previousClass = activeEnclosingClass;
  const previousStatic = activeClassMethodStatic;
  classThisInScope = !isStatic;
  activeEnclosingClass = info;
  activeClassMethodStatic = isStatic;
  try {
    const body = lowerClassMethodBody(declaration.body, fnBindings);
    if (body.kind !== "lowered") {
      return body;
    }
    return produced({
      kind: "function",
      name: classMethodFunctionName(info.name, methodName, isStatic),
      parameters: fnParameters,
      body: body.operation
    });
  } finally {
    classThisInScope = previousThis;
    activeEnclosingClass = previousClass;
    activeClassMethodStatic = previousStatic;
  }
}

// Lowers a constructor-or-method body, normalizing every `return` to a JSValue
// result so method calls are uniformly value-typed at their call sites.
function lowerClassMethodBody(
  block: ts.Block,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<readonly JsIrOperation[]> {
  const operations: JsIrOperation[] = [];
  const bodyBindings = new Map(bindings);
  for (const statement of block.statements) {
    if (isNonExecutableDeclaration(statement)) {
      continue;
    }
    if (ts.isReturnStatement(statement)) {
      let value: JsIrValueExpression | undefined = { kind: "undefined" };
      if (statement.expression !== undefined) {
        value = lowerValueExpression(statement.expression, bodyBindings);
      }
      if (value === undefined) {
        return unsupportedIn("The return value in a class member body is not an expression this build can evaluate");
      }
      operations.push({ kind: "returnValue", expression: value });
      continue;
    }
    const result = lowerStatement(statement, bodyBindings);
    if (result.kind !== "lowered") {
      return unsupportedIn(classAbortReason(result));
    }
    operations.push(result.operation);
    updateBindings(result.operation, bodyBindings);
  }
  return produced(operations);
}

// eslint-disable-next-line complexity, max-statements -- Constructor lowering owns super ordering, instance initialization, and body scope restoration.
function lowerClassConstructor(
  info: ClassInfo,
  constructorDeclaration: ts.ConstructorDeclaration | undefined,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrOperation> {
  const parameters: JsIrFunctionParameter[] = [{ name: CLASS_THIS_NAME, valueKind: "value" }, ...info.constructorParameters];
  const fnBindings = functionFrameBindings(bindings);
  fnBindings.set(CLASS_THIS_NAME, { kind: "valueVariable", name: CLASS_THIS_NAME });
  for (const parameter of info.constructorParameters) {
    bindFunctionParameter(parameter.name, parameter.valueKind, false, fnBindings);
  }

  const previousThis = classThisInScope;
  const previousClass = activeEnclosingClass;
  const previousStatic = activeClassMethodStatic;
  classThisInScope = true;
  activeEnclosingClass = info;
  activeClassMethodStatic = false;
  try {
    const body: JsIrOperation[] = [];
    let remainingStatements: readonly ts.Statement[] = constructorDeclaration?.body?.statements ?? [];
    if (info.baseName !== undefined) {
      const base = classLoweringState.registry?.get(info.baseName);
      if (base === undefined) {
        return unsupportedIn(`\`extends ${info.baseName ?? "that class"}\` names a class this module did not lower`);
      }
      let superArguments: readonly JsIrCallArgument[] | undefined;
      if (constructorDeclaration === undefined) {
        superArguments = info.constructorParameters.map(forwardedClassArgument);
      } else {
        const statements = constructorDeclaration.body?.statements ?? ts.factory.createNodeArray<ts.Statement>();
        const [first, ...rest] = statements;
        if (
          !ts.isExpressionStatement(first) ||
          !ts.isCallExpression(first.expression) ||
          first.expression.expression.kind !== ts.SyntaxKind.SuperKeyword
        ) {
          return unsupportedIn("A derived constructor must call `super(...)` as its first statement");
        }
        superArguments = lowerTypedCallArguments(base.constructorParameters, first.expression.arguments, fnBindings);
        remainingStatements = rest;
      }
      if (superArguments === undefined) {
        return unsupportedIn("`super(...)` arguments must be expressions this build can evaluate");
      }
      body.push({
        kind: "call",
        name: classConstructorName(base.name),
        arguments: [{ valueKind: "value", value: { kind: "variable", name: CLASS_THIS_NAME } }, ...superArguments]
      });
    }
    const iteratorStore = lowerClassIteratorStore(info, fnBindings);
    if (iteratorStore.kind === "unsupported") {
      return iteratorStore;
    }
    if (iteratorStore.kind === "lowered") {
      body.push(iteratorStore.operation);
    }
    // TypeScript assigns parameter properties after `super(...)` and before the field initializers, so
    // a field initializer may read one. The order here matches that emit exactly, which is what makes
    // `class C { x = this.p + 1; constructor(public p: number) {} }` read the argument.
    for (const name of info.parameterProperties) {
      const parameter = info.constructorParameters.find((candidate) => candidate.name === name);
      if (parameter === undefined) {
        return unsupportedIn(`\`${name}\` is declared as a field by a parameter this build cannot read`);
      }
      body.push({
        kind: "valueObjectStore",
        targetName: CLASS_THIS_NAME,
        key: classMemberKeyStringExpression({ kind: "literal", name }),
        value: parameterPropertyValue(parameter)
      });
    }
    for (const field of info.fields) {
      const initializer = lowerClassFieldInitializer(field, fnBindings);
      if (initializer.kind !== "lowered") {
        return initializer;
      }
      body.push({
        kind: "valueObjectStore",
        targetName: CLASS_THIS_NAME,
        key: classMemberKeyStringExpression(field.key),
        value: initializer.operation
      });
    }
    if (constructorDeclaration?.body !== undefined) {
      for (const statement of remainingStatements) {
        if (isNonExecutableDeclaration(statement)) {
          continue;
        }
        const result = lowerStatement(statement, fnBindings);
        if (result.kind !== "lowered") {
          return unsupportedIn(classAbortReason(result));
        }
        body.push(result.operation);
        updateBindings(result.operation, fnBindings);
      }
    }
    return produced({ kind: "function", name: classConstructorName(info.name), parameters, body });
  } finally {
    classThisInScope = previousThis;
    activeEnclosingClass = previousClass;
    activeClassMethodStatic = previousStatic;
  }
}

/**
 * The value a constructor parameter property stores onto `this`.
 *
 * The representation follows the parameter's own kind, the same way `forwardedClassArgument` chooses a
 * form to pass one along: a number is read as a number expression, and a string or boxed value as the
 * value it already is.
 */
function parameterPropertyValue(parameter: JsIrFunctionParameter): JsIrValueExpression {
  if (parameter.valueKind === "number") {
    return { kind: "number", value: { kind: "parameter", name: parameter.name } };
  }
  if (parameter.valueKind === "string") {
    return { kind: "string", value: { kind: "variable", name: parameter.name } };
  }
  return { kind: "variable", name: parameter.name };
}

function forwardedClassArgument(parameter: JsIrFunctionParameter): JsIrCallArgument {
  if (parameter.valueKind === "number") {
    return { valueKind: "number", value: { kind: "parameter", name: parameter.name } };
  }
  if (parameter.valueKind === "string") {
    return { valueKind: "string", value: { kind: "variable", name: parameter.name } };
  }
  return { valueKind: "value", value: { kind: "variable", name: parameter.name } };
}

function lowerClassIteratorStore(
  info: ClassInfo,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (info.iteratorMethod === undefined) {
    return notApplicable;
  }
  const previousClassThisInScope = classThisInScope;
  classThisInScope = false;
  let iteratorMethod: JsIrValueExpression | undefined;
  try {
    iteratorMethod = lowerObjectMethodFunctionValue(info.iteratorMethod, bindings);
  } finally {
    classThisInScope = previousClassThisInScope;
  }
  if (iteratorMethod === undefined) {
    return unsupportedIn("An [Symbol.iterator] method body is not an expression this build can evaluate");
  }
  return produced({
    kind: "valueObjectStore",
    targetName: CLASS_THIS_NAME,
    key: { kind: "literal", value: SYMBOL_ITERATOR_SENTINEL },
    value: iteratorMethod
  });
}

function lowerClassFieldInitializer(
  field: ClassFieldInfo,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrValueExpression> {
  if (field.initializer === undefined) {
    return produced({ kind: "undefined" } as JsIrValueExpression);
  }
  const value = lowerValueExpression(field.initializer, bindings);
  if (value === undefined) {
    return unsupportedIn("A class field initializer is not an expression this build can evaluate");
  }
  return produced(value);
}

function lowerClassValueExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  if (classLoweringState.registry === undefined) {
    return undefined;
  }

  if (classThisInScope && expression.kind === ts.SyntaxKind.ThisKeyword) {
    return { kind: "variable", name: CLASS_THIS_NAME };
  }

  const instance = lowerClassInstanceExpression(expression, bindings);
  if (instance.kind === "unsupported") {
    throw new ClassLoweringUnsupportedError(instance.reason);
  }
  if (instance.kind === "lowered") {
    return instance.operation;
  }

  if (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression)) {
    const methodCall = lowerClassMethodCall(expression, expression.expression, bindings);
    if (methodCall.kind === "unsupported") {
      throw new ClassLoweringUnsupportedError(methodCall.reason);
    }
    if (methodCall.kind === "lowered") {
      return methodCall.operation;
    }
  }

  const staticField = lowerClassStaticFieldAccess(expression, bindings);
  if (staticField !== undefined) {
    return staticField;
  }

  const property = lowerClassPropertyValueAccess(expression, bindings);
  if (property.kind === "unsupported") {
    throw new ClassLoweringUnsupportedError(property.reason);
  }
  if (property.kind === "lowered") {
    return property.operation;
  }
  return undefined;
}

// Lowers a property access on a class-related receiver: private field reads,
// `C.prototype`, getter dispatch, and plain instance field reads.
function lowerClassPropertyValueAccess(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  if (classLoweringState.registry === undefined || !ts.isPropertyAccessExpression(expression)) {
    return notApplicable;
  }
  if (ts.isPrivateIdentifier(expression.name)) {
    const privateField = lowerClassPrivateFieldAccess(expression, bindings);
    if (privateField.kind !== "lowered") {
      return privateField;
    }
    return produced(privateField.operation);
  }

  // C.prototype where C is a class name (not in bindings) gives the prototype object
  if (ts.isIdentifier(expression.expression) && !bindings.has(expression.expression.text) && expression.name.text === "prototype") {
    const classInfo = classLoweringState.registry.get(expression.expression.text);
    if (classInfo !== undefined) {
      return produced({ kind: "variable", name: classPrototypeName(classInfo.name) } as JsIrValueExpression);
    }
  }

  const receiver = lowerClassInstanceExpression(expression.expression, bindings);
  if (receiver.kind === "unsupported") {
    return receiver;
  }
  if (receiver.kind === "notApplicable") {
    return notApplicable;
  }
  const receiverClass = resolveReceiverClass(expression.expression, bindings);
  let getterClass: ClassInfo | undefined;
  if (receiverClass !== undefined) {
    getterClass = findClassInChain(receiverClass, (candidate) => candidate.getters.has(expression.name.text));
  }
  if (getterClass !== undefined) {
    return produced({
      kind: "call",
      name: classGetterFunctionName(getterClass.name, expression.name.text),
      arguments: [{ valueKind: "value", value: receiver.operation }]
    });
  }
  return produced({
    kind: "valueObjectDynamicAccess",
    value: receiver.operation,
    key: { kind: "literal", value: expression.name.text }
  });
}

// Lowers a private field read `recv.#x` inside a class body. The lexically
// enclosing class must declare the private name; ownership of the brand is
// enforced by a runtime check on the receiver.
function lowerClassPrivateFieldAccess(
  expression: ts.PropertyAccessExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrValueExpression> {
  const fieldName = expression.name.text;
  const storageKey = activeEnclosingClass?.privateFields.get(fieldName);
  if (storageKey === undefined) {
    return unsupportedIn(`\`#${fieldName}\` is not declared by the lexically enclosing class`);
  }
  const receiver = lowerClassPrivateFieldReceiver(expression.expression, bindings);
  if (receiver.kind !== "lowered") {
    return receiver;
  }
  return produced({
    kind: "privateFieldAccess",
    receiver: receiver.operation,
    key: storageKey,
    message: classPrivateFieldReadMessage(fieldName)
  });
}

// Resolves the receiver of a private field access to a stable instance value:
// `this`, `new C(...)`, or a named value variable (e.g. a method parameter).
function lowerClassPrivateFieldReceiver(
  receiver: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrValueExpression> {
  const instance = lowerClassInstanceExpression(receiver, bindings);
  if (instance.kind !== "notApplicable") {
    return instance;
  }
  if (ts.isIdentifier(receiver) && bindings.get(receiver.text)?.kind === "valueVariable") {
    return produced({ kind: "variable", name: receiver.text } as JsIrValueExpression);
  }
  return unsupportedIn("The receiver of a private field access must be `this`, an instance, or a value variable");
}

// Lowers a private field write `recv.#x = value` inside a class body, with the
// same lexical scoping and runtime brand check as reads.
function lowerClassPrivateFieldStore(
  left: ts.PropertyAccessExpression,
  right: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!ts.isPrivateIdentifier(left.name)) {
    return notApplicable;
  }
  const fieldName = left.name.text;
  const storageKey = activeEnclosingClass?.privateFields.get(fieldName);
  if (storageKey === undefined) {
    return unsupportedIn(`\`#${fieldName}\` is not declared by the lexically enclosing class`);
  }
  let targetName: string | undefined;
  if (left.expression.kind === ts.SyntaxKind.ThisKeyword && bindings.get(CLASS_THIS_NAME)?.kind === "valueVariable") {
    targetName = CLASS_THIS_NAME;
  } else if (ts.isIdentifier(left.expression) && bindings.get(left.expression.text)?.kind === "valueVariable") {
    targetName = left.expression.text;
  }
  if (targetName === undefined) {
    return unsupportedIn("The receiver of a private field write must be `this` or a value variable");
  }
  const value = lowerValueExpression(right, bindings);
  if (value === undefined) {
    return unsupportedIn("The value written to a private field is not an expression this build can evaluate");
  }
  return produced({
    kind: "privateFieldStore",
    targetName,
    key: storageKey,
    value,
    message: classPrivateFieldWriteMessage(fieldName)
  });
}

// Resolves a static method call `C.m(...)` or an instance method call
// `(<instance>).m(...)` to a direct call of the generated method function.
// eslint-disable-next-line complexity, max-statements -- Method resolution handles super, static inheritance, and instance inheritance at one dispatch seam.
function lowerClassMethodCall(
  call: ts.CallExpression,
  callee: ts.PropertyAccessExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<Extract<JsIrValueExpression, { readonly kind: "call" }>> {
  if (classLoweringState.registry === undefined) {
    return notApplicable;
  }
  const methodName = callee.name.text;

  if (callee.expression.kind === ts.SyntaxKind.SuperKeyword) {
    return lowerSuperMethodCall(call, bindings, methodName);
  }

  if (ts.isIdentifier(callee.expression) && !bindings.has(callee.expression.text)) {
    const staticClass = classLoweringState.registry.get(callee.expression.text);
    let definingClass: ClassInfo | undefined;
    if (staticClass !== undefined) {
      definingClass = findClassInChain(staticClass, (candidate) => candidate.staticMethods.has(methodName));
    }
    const staticMethod = definingClass?.staticMethods.get(methodName);
    if (definingClass !== undefined && staticMethod !== undefined) {
      const args = lowerTypedCallArguments(staticMethod.parameters, call.arguments, bindings);
      if (args === undefined) {
        return unsupportedIn(`Arguments to the static method \`${methodName}\` must be expressions this build can evaluate`);
      }
      return produced({
        kind: "call",
        name: classMethodFunctionName(definingClass.name, methodName, true),
        arguments: args
      });
    }
  }

  const receiverClass = resolveReceiverClass(callee.expression, bindings);
  let definingClass: ClassInfo | undefined;
  if (receiverClass !== undefined) {
    definingClass = findClassInChain(receiverClass, (candidate) => candidate.methods.has(methodName));
  }
  const method = definingClass?.methods.get(methodName);
  if (definingClass === undefined || method === undefined) {
    return notApplicable;
  }
  const receiverValue = lowerInstanceReceiverValue(callee.expression, bindings);
  if (receiverValue === undefined) {
    // Not "mine but no": the receiver is a named instance this path cannot resolve, and a later
    // recognizer may still handle the call. The base tree returned `undefined` here; making it a
    // refusal broke 81 Test262 class tests.
    return notApplicable;
  }
  const args = lowerTypedCallArguments(method.parameters, call.arguments, bindings);
  if (args === undefined) {
    return unsupportedIn(`Arguments to the method \`${methodName}\` must be expressions this build can evaluate`);
  }
  return produced({
    kind: "call",
    name: classMethodFunctionName(definingClass.name, methodName, false),
    arguments: [{ valueKind: "value", value: receiverValue }, ...args]
  });
}

/** A `super.m(...)` call inside a class method or constructor. */
function lowerSuperMethodCall(
  call: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  methodName: string
): Lowered<Extract<JsIrValueExpression, { readonly kind: "call" }>> {
  const { registry } = classLoweringState;
  if (registry === undefined) {
    return notApplicable;
  }
  const base = baseClassOf(activeEnclosingClass, registry);
  if (base === undefined) {
    return unsupportedIn(`\`super.${methodName}\` appears in a class with no base class this module lowered`);
  }
  const isStatic = activeClassMethodStatic;
  const declares = (candidate: ClassInfo): boolean => superMethodOf(candidate, methodName, isStatic) !== undefined;
  const definingClass = findClassInChain(base, declares);
  if (definingClass === undefined) {
    return unsupportedIn(classSuperMethodRefusal(methodName, base.name, isStatic));
  }
  const method = superMethodOf(definingClass, methodName, isStatic);
  if (method === undefined) {
    return unsupportedIn(classSuperMethodRefusal(methodName, base.name, isStatic));
  }
  const args = lowerTypedCallArguments(method.parameters, call.arguments, bindings);
  if (args === undefined) {
    return unsupportedIn("`super(...)` method arguments must be expressions this build can evaluate");
  }
  if (isStatic) {
    return produced({
      kind: "call",
      name: classMethodFunctionName(definingClass.name, methodName, true),
      arguments: args
    });
  }
  return produced({
    kind: "call",
    name: classMethodFunctionName(definingClass.name, methodName, false),
    arguments: [{ valueKind: "value", value: { kind: "variable", name: CLASS_THIS_NAME } }, ...args]
  });
}

/** The method a `super.m(...)` resolves to on one class in the chain. */
function superMethodOf(
  candidate: ClassInfo,
  methodName: string,
  isStatic: boolean
): ClassMethodInfo | undefined {
  if (isStatic) {
    return candidate.staticMethods.get(methodName);
  }
  return candidate.methods.get(methodName);
}

/** Why a `super.m(...)` found no method, naming whether it was looking for a static one. */
function classSuperMethodRefusal(methodName: string, baseName: string, isStatic: boolean): string {
  let kind = "method";
  if (isStatic) {
    kind = "static method";
  }
  return `\`super.${methodName}\` is not a ${kind} of \`${baseName}\` or its bases`;
}

/** The `ClassInfo` a class extends, or `undefined` when it names one this module did not lower. */
function baseClassOf(
  enclosing: ClassInfo | undefined,
  registry: ReadonlyMap<string, ClassInfo>
): ClassInfo | undefined {
  if (enclosing?.baseName === undefined) {
    return undefined;
  }
  return registry.get(enclosing.baseName);
}

// Lowers a method-call receiver to a stable instance value. Only inline
// receivers (`this`, `new C()`) are supported; named-variable instances require
// stable value storage and are reported as unsupported for now.
function lowerInstanceReceiverValue(
  receiver: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  const instance = lowerClassInstanceExpression(receiver, bindings);
  if (instance.kind === "unsupported") {
    throw new ClassLoweringUnsupportedError(instance.reason);
  }
  if (instance.kind === "lowered") {
    return instance.operation;
  }
  return undefined;
}

// Lowers an expression that evaluates to a class instance value (`this` or a
// `new C(...)`), or returns undefined when it is not one.
function lowerClassInstanceExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  if (classLoweringState.registry === undefined) {
    return notApplicable;
  }
  if (classThisInScope && expression.kind === ts.SyntaxKind.ThisKeyword) {
    return produced({ kind: "variable", name: CLASS_THIS_NAME } as JsIrValueExpression);
  }
  if (ts.isNewExpression(expression) && ts.isIdentifier(expression.expression) && !bindings.has(expression.expression.text)) {
    const info = classLoweringState.registry.get(expression.expression.text);
    if (info !== undefined) {
      const args = lowerTypedCallArguments(info.constructorParameters, expression.arguments ?? ts.factory.createNodeArray(), bindings);
      if (args === undefined) {
        return unsupportedIn(`Arguments to \`new ${info.name}(...)\` must be expressions this build can evaluate`);
      }
      return produced({
        kind: "newInstance",
        className: info.name,
        fieldCount: info.fields.length,
        prototypeName: classPrototypeName(info.name),
        constructorName: classConstructorName(info.name),
        arguments: args
      } as JsIrValueExpression);
    }
  }
  // A named local holding a class instance (`const c = new C()`, or a parameter
  // typed as the class) resolves to its stable slot so identity is preserved.
  if (ts.isIdentifier(expression)) {
    const binding = bindings.get(expression.text);
    if (binding?.kind === "valueVariable" && resolveReceiverClass(expression, bindings) !== undefined) {
      return produced({ kind: "variable", name: expression.text } as JsIrValueExpression);
    }
  }
  return notApplicable;
}

// Lowers `recv.prop = value` when `recv` is a class instance: setter members
// dispatch to the generated setter function; plain instance fields store onto
// the instance object.
function lowerClassPropertyAssignment(
  left: ts.PropertyAccessExpression,
  right: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (classLoweringState.registry === undefined) {
    return notApplicable;
  }
  const receiverClass = resolveReceiverClass(left.expression, bindings);
  if (receiverClass === undefined) {
    return notApplicable;
  }
  const propertyName = left.name.text;
  if (findClassInChain(receiverClass, (candidate) => candidate.staticFields.has(propertyName)) !== undefined) {
    const value = lowerValueExpression(right, bindings);
    if (value === undefined) {
      return unsupportedIn(`The value written to the static field \`${propertyName}\` is not an expression this build can evaluate`);
    }
    return produced({
      kind: "valueObjectStore",
      targetName: classStaticStorageName(receiverClass.name),
      key: { kind: "literal", value: propertyName },
      value
    });
  }
  const value = lowerValueExpression(right, bindings);
  if (value === undefined) {
    return unsupportedIn(`The value written to \`${propertyName}\` is not an expression this build can evaluate`);
  }
  const setterClass = findClassInChain(receiverClass, (candidate) => candidate.setters.has(propertyName));
  if (setterClass !== undefined) {
    const receiver = lowerInstanceReceiverValue(left.expression, bindings);
    if (receiver === undefined) {
      return unsupportedIn(`A named instance cannot yet receive the setter call \`${propertyName}\``);
    }
    return produced({
      kind: "call",
      name: classSetterFunctionName(setterClass.name, propertyName),
      arguments: [{ valueKind: "value", value: receiver }, { valueKind: "value", value }]
    });
  }
  if (ts.isIdentifier(left.expression) && bindings.get(left.expression.text)?.kind === "valueVariable") {
    return produced({
      kind: "valueObjectStore",
      targetName: left.expression.text,
      key: { kind: "literal", value: propertyName },
      value
    });
  }
  return unsupportedIn(`The receiver of \`${propertyName}\` cannot yet be assigned through`);
}

function isRegExpConstructorCall(node: ts.Node): node is ts.NewExpression {
  return ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "RegExp";
}

function unsupportedRegExpPatternMessage(pattern: string, flags: string): string | undefined {
  if (/[^gimyu]/.test(flags) || new Set(flags).size !== flags.length) {
    return "Unsupported or duplicate RegExp flags";
  }
  if (pattern.includes("(?<") || pattern.includes("(?<=") || pattern.includes("(?<!") || pattern.includes(String.raw`\p{`) || pattern.includes(String.raw`\P{`)) {
    return "RegExp named groups, lookbehind, and Unicode properties are not supported yet";
  }
  return undefined;
}



















function lowerStatement(
  statement: ts.Statement,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  promotedAggregates: ReadonlySet<string> = new Set()
): Lowered {
  const result = lowerStatementCore(statement, bindings, promotedAggregates);
  if (result.kind !== "lowered") {
    return result;
  }
  return loweredOperation(traceOperationFromNode(result.operation, statement));
}

// eslint-disable-next-line max-statements -- Statement dispatch covers all supported top-level node kinds in one place.
function lowerStatementCore(
  statement: ts.Statement,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  promotedAggregates: ReadonlySet<string> = new Set()
): Lowered {
  if (ts.isVariableStatement(statement)) {
    return statementResult(lowerVariableBinding(statement, bindings, promotedAggregates), statement, bindings);
  }

  if (ts.isIfStatement(statement)) {
    return loweredStatementResult(lowerIfStatement(statement, bindings), statement, bindings);
  }

  if (ts.isSwitchStatement(statement)) {
    return lowerSwitchStatement(statement, bindings);
  }

  if (ts.isWhileStatement(statement)) {
    return loweredStatementResult(lowerWhileStatement(statement, bindings), statement, bindings);
  }

  if (ts.isForStatement(statement)) {
    return loweredStatementResult(lowerForStatement(statement, bindings), statement, bindings);
  }

  if (ts.isForOfStatement(statement)) {
    return statementResult(lowerForOfStatement(statement, bindings), statement, bindings);
  }

  if (ts.isForInStatement(statement)) {
    return statementResult(lowerForInStatement(statement, bindings), statement, bindings);
  }

  if (ts.isDoStatement(statement)) {
    return loweredStatementResult(lowerDoWhileStatement(statement, bindings), statement, bindings);
  }

  if (ts.isBreakStatement(statement)) {
    return loweredOperation(lowerLabelledJump("break", statement.label));
  }

  if (ts.isContinueStatement(statement)) {
    return loweredOperation(lowerLabelledJump("continue", statement.label));
  }

  if (ts.isLabeledStatement(statement)) {
    return lowerLabelledStatement(statement, bindings);
  }

  if (ts.isFunctionDeclaration(statement)) {
    return lowerFunctionDeclaration(statement, bindings);
  }

  // A `namespace` is a statement whose value is an object, and the object-literal tier already knows how
  // to build one. Only the non-module kind reaches here: `declare module` is a `declare` declaration and
  // `isNonExecutableDeclaration` has already dropped it.
  if (ts.isModuleDeclaration(statement)) {
    return lowerNamespaceDeclarationStatement(statement, bindings);
  }

  // An enum's value is an object holding both the forward and reverse mappings, so it lowers to the same
  // runtime-object literal a namespace does.
  if (ts.isEnumDeclaration(statement)) {
    return lowerEnumDeclarationStatement(statement);
  }

  if (ts.isReturnStatement(statement)) {
    return statementResult(lowerReturnStatement(statement, bindings), statement, bindings);
  }

  if (ts.isThrowStatement(statement)) {
    return statementResult(lowerThrowStatement(statement, bindings), statement, bindings);
  }

  if (ts.isTryStatement(statement)) {
    return lowerTryCatchStatement(statement, bindings);
  }

  if (ts.isExpressionStatement(statement)) {
    return loweredStatementResult(lowerExpressionStatement(statement.expression, bindings), statement, bindings);
  }

  return notApplicable;
}

// Lowering-time nesting counters for the one finally-routing shape the
// backend cannot complete correctly: a `throw` inside a finally block that
// sits in the try region of an enclosing try/catch/finally. The emitted
// completion routing sends such a throw straight past the enclosing catch
// clause, so it is rejected at lowering time (a clean coverage-gap) instead
// of running with wrong semantics.
let tryRegionOfCatchFinallyDepth = 0;
let finallyBlockDepth = 0;

function lowerThrowStatement(
  statement: ts.ThrowStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (finallyBlockDepth > 0 && tryRegionOfCatchFinallyDepth > 0) {
    return undefined;
  }
  const value = lowerValueExpression(statement.expression, bindings);
  if (value === undefined) {
    return undefined;
  }
  return { kind: "throwValue", value };
}

function lowerTryRegionOperations(
  statement: ts.TryStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): LoweredStatementList {
  const tracksTryRegion = statement.catchClause !== undefined && statement.finallyBlock !== undefined;
  if (tracksTryRegion) {
    tryRegionOfCatchFinallyDepth += 1;
  }
  try {
    return lowerBlockStatements(statement.tryBlock, bindings);
  } finally {
    if (tracksTryRegion) {
      tryRegionOfCatchFinallyDepth -= 1;
    }
  }
}

function lowerFinallyBlockOperations(
  block: ts.Block,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): LoweredStatementList {
  finallyBlockDepth += 1;
  try {
    return lowerBlockStatements(block, bindings);
  } finally {
    finallyBlockDepth -= 1;
  }
}

function lowerTryCatchStatement(
  statement: ts.TryStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  // Semantically-equivalent compile-time shortcut for the direct
  // `try { throw expr; } catch (e) { ... }` shape without finally. It avoids real
  // exception machinery for the common cases (error construction and plain value
  // throws) and does not conflict with the general `tryCatch` lowering below.
  if (statement.finallyBlock === undefined) {
    const shortcut = lowerDirectThrowTryCatchShortcut(statement, bindings);
    if (shortcut !== undefined) {
      return loweredOperation(shortcut);
    }
  }

  // General path: lower try/catch/finally using normal block statement lowering.
  // The catch variable is bound as a value variable and is lexically scoped to the
  // catch block (a fresh binding map shadows any outer binding of the same name
  // without leaking outwards). Cleanup/completion routing for finally is owned by
  // the LLVM backend's shared cleanup stack.
  const tryOperations = lowerTryRegionOperations(statement, bindings);
  if (tryOperations.kind === "unsupported") {
    return tryOperations;
  }

  const { catchClause } = statement;
  let catchVariable = "";
  let catchOperations: readonly JsIrOperation[] = [];
  const hasCatch = catchClause !== undefined;
  if (catchClause !== undefined) {
    const loweredCatch = lowerCatchClause(statement, catchClause, bindings);
    if (loweredCatch.kind === "unsupported") {
      return loweredCatch;
    }
    catchVariable = loweredCatch.variable;
    catchOperations = loweredCatch.operations;
  }

  let finallyOperations: readonly JsIrOperation[] | undefined;
  if (statement.finallyBlock !== undefined) {
    const loweredFinally = lowerFinallyBlockOperations(statement.finallyBlock, bindings);
    if (loweredFinally.kind === "unsupported") {
      return loweredFinally;
    }
    finallyOperations = loweredFinally.operation;
  }

  if (!hasCatch && finallyOperations === undefined) {
    // `try { ... }` with neither catch nor finally is not valid TypeScript;
    // defensively run the try body as a plain block.
    return loweredOperation({ kind: "block", operations: tryOperations.operation });
  }

  return loweredOperation({
    kind: "tryCatch",
    tryOperations: tryOperations.operation,
    catchVariable,
    catchOperations,
    hasCatch,
    finallyOperations
  });
}

type LoweredCatchClause =
  | { readonly kind: "lowered"; readonly variable: string; readonly operations: readonly JsIrOperation[] }
  | { readonly kind: "unsupported"; readonly reason: string };

function lowerCatchClause(
  statement: ts.TryStatement,
  catchClause: ts.CatchClause,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): LoweredCatchClause {
  const catchBindings = new Map(bindings);
  const catchBinding = catchClause.variableDeclaration?.name;
  const destructuringOperations: JsIrOperation[] = [];
  let variable = catchBindingName(catchClause);
  if (catchBinding !== undefined && (ts.isArrayBindingPattern(catchBinding) || ts.isObjectBindingPattern(catchBinding))) {
    variable = `__catch${statement.pos}`;
    catchBindings.set(variable, { kind: "valueVariable", name: variable });
    const source: DestructuringSource = { name: variable, binding: { kind: "valueVariable", name: variable } };
    let lowered: boolean;
    if (ts.isArrayBindingPattern(catchBinding)) {
      lowered = lowerArrayDestructuringElements(catchBinding, source, catchBindings, destructuringOperations, true);
    } else {
      lowered = lowerObjectDestructuringElements(catchBinding, source, catchBindings, destructuringOperations, true);
    }
    if (!lowered) {
      return { kind: "unsupported", reason: "Destructuring a catch binding is not supported" };
    }
  } else if (variable !== "") {
    catchBindings.set(variable, { kind: "valueVariable", name: variable });
  }
  const blockOperations = lowerBlockStatements(catchClause.block, catchBindings);
  if (blockOperations.kind === "unsupported") {
    return blockOperations;
  }
  return { kind: "lowered", variable, operations: [...destructuringOperations, ...blockOperations.operation] };
}

function catchBindingName(catchClause: ts.CatchClause): string {
  const variable = catchClause.variableDeclaration?.name;
  if (variable !== undefined && ts.isIdentifier(variable)) {
    return variable.text;
  }
  return "";
}

function lowerDirectThrowTryCatchShortcut(
  statement: ts.TryStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  const { catchClause } = statement;
  if (catchClause === undefined || statement.tryBlock.statements.length !== 1) {
    return undefined;
  }
  const [throwStatement] = statement.tryBlock.statements;
  if (!ts.isThrowStatement(throwStatement)) {
    return undefined;
  }
  const catchVariable = catchBindingName(catchClause);
  if (catchVariable === "") {
    return undefined;
  }
  const errorCatch = lowerErrorTryCatchStatement(statement, throwStatement, catchVariable, bindings);
  if (errorCatch !== undefined) {
    return errorCatch;
  }
  const thrown = lowerValueExpression(throwStatement.expression, bindings);
  if (thrown === undefined) {
    return undefined;
  }
  const shortcutBindings = new Map(bindings);
  shortcutBindings.set(catchVariable, { kind: "value", value: thrown });
  const operations = bodyOperations(lowerBlockStatements(catchClause.block, shortcutBindings));
  if (operations === undefined) {
    return undefined;
  }
  return { kind: "block", operations: [{ kind: "constValue", name: catchVariable, value: thrown }, ...operations] };
}

function lowerErrorTryCatchStatement(
  statement: ts.TryStatement,
  throwStatement: ts.ThrowStatement,
  variableName: string,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (statement.catchClause === undefined) {
    return undefined;
  }
  const thrownExpression = unwrapTypeOnlyExpression(throwStatement.expression);
  const errorOperation = lowerRuntimeErrorLiteral(`${variableName}.thrown.${statement.pos}`, thrownExpression, bindings);
  if (errorOperation !== undefined) {
    const catchBindings = new Map(bindings);
    catchBindings.set(variableName, { kind: "runtimeObject", name: errorOperation.name, errorName: errorOperation.errorName });
    const operations = bodyOperations(lowerBlockStatements(statement.catchClause.block, catchBindings));
    if (operations === undefined) {
      return undefined;
    }
    return { kind: "block", operations: [errorOperation, ...operations] };
  }
  if (!ts.isIdentifier(thrownExpression)) {
    return undefined;
  }
  const thrownBinding = bindings.get(thrownExpression.text);
  if (thrownBinding?.kind !== "runtimeObject" && thrownBinding?.kind !== "runtimeArray") {
    return undefined;
  }
  const catchBindings = new Map(bindings);
  catchBindings.set(variableName, thrownBinding);
  const operations = bodyOperations(lowerBlockStatements(statement.catchClause.block, catchBindings));
  if (operations === undefined) {
    return undefined;
  }
  return { kind: "block", operations: [...operations] };
}

function lowerRuntimeErrorLiteral(
  name: string,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Extract<JsIrOperation, { readonly kind: "runtimeErrorLiteral" }> | undefined {
  let call: ts.NewExpression | ts.CallExpression | undefined;
  if (ts.isNewExpression(expression) || ts.isCallExpression(expression)) {
    call = expression;
  }
  if (call === undefined || !ts.isIdentifier(call.expression)) {
    return undefined;
  }
  const errorName = call.expression.text;
  if (!errorConstructorNames.has(errorName) || bindings.has(errorName)) {
    return undefined;
  }
  const callArguments = call.arguments ?? [];
  if (callArguments.length > 1) {
    return undefined;
  }
  if (callArguments.length === 0) {
    return { kind: "runtimeErrorLiteral", name, errorName, message: { kind: "string", value: { kind: "literal", value: "" } } };
  }
  const message = lowerErrorMessageValue(callArguments[0], bindings);
  if (message === undefined) {
    return undefined;
  }
  return { kind: "runtimeErrorLiteral", name, errorName, message };
}

function lowerErrorMessageValue(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  const argument = unwrapTypeOnlyExpression(expression);
  if (ts.isIdentifier(argument) && argument.text === "undefined" && !bindings.has("undefined")) {
    return { kind: "string", value: { kind: "literal", value: "" } };
  }
  const stringValue = lowerStringRuntimeExpression(argument, bindings);
  if (stringValue !== undefined) {
    return { kind: "string", value: stringValue };
  }
  const value = lowerValueExpression(argument, bindings);
  if (value === undefined) {
    return undefined;
  }
  return { kind: "string", value: { kind: "stringConversion", value } };
}

// eslint-disable-next-line max-statements -- Statement expression routing is centralized for the current lowering slice.
function lowerExpressionStatement(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const update = lowerUpdateExpressionStatement(expression, bindings);
  if (update !== undefined) {
    return produced(update);
  }

  const assignment = lowerAssignmentStatement(expression, bindings);
  if (assignment.kind !== "notApplicable") {
    return assignment;
  }

  const deletion = lowerDeleteExpression(expression, bindings);
  if (deletion !== undefined) {
    return produced(deletion);
  }

  if (ts.isCallExpression(expression)) {
    const runtimeCollectionCall = lowerRuntimeCollectionCallStatement(expression, bindings);
    if (runtimeCollectionCall !== undefined) {
      return produced(runtimeCollectionCall);
    }
    const runtimeObjectCall = lowerRuntimeObjectCallStatement(expression, bindings);
    if (runtimeObjectCall !== undefined) {
      return produced(runtimeObjectCall);
    }
    const runtimeArrayCall = lowerRuntimeArrayCallStatement(expression, bindings);
    if (runtimeArrayCall !== undefined) {
      return produced(runtimeArrayCall);
    }
  }

  const inlineCppValue = lowerInlineCppValueExpression(expression);
  if (inlineCppValue?.kind === "inlineCppValue") {
    return produced({ kind: "inlineCpp", symbol: inlineCppValue.symbol });
  }

  if (!ts.isCallExpression(expression)) {
    return notApplicable;
  }

  const callOp = lowerCallStatement(expression, bindings);
  if (callOp.kind !== "notApplicable") {
    return callOp;
  }

  if (!ts.isIdentifier(expression.expression)) {
    return notApplicable;
  }

  if (expression.expression.text !== "print" || expression.arguments.length !== 1) {
    return notApplicable;
  }

  const [argument] = expression.arguments;
  const printExpression = lowerPrintExpression(argument, bindings);
  if (printExpression !== undefined) {
    return produced({ kind: "print", expression: printExpression });
  }

  return notApplicable;
}

function lowerUpdateExpressionStatement(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  const update = lowerUpdateNumberExpression(expression, bindings);
  if (update === undefined) {
    return undefined;
  }
  const step: JsIrNumberExpression = { kind: "literal", value: 1 };
  let operator: JsIrNumberOperator = "add";
  if (update.operator === "decrement") {
    operator = "subtract";
  }
  return { kind: "assignNumber", name: update.name, value: { kind: "binary", operator, left: { kind: "variable", name: update.name }, right: step } };
}

function lowerRuntimeCollectionCallStatement(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression)) {
    return undefined;
  }
  const receiver = expression.expression.expression.text;
  const binding = bindings.get(receiver);
  const method = expression.expression.name.text;
  if (binding?.kind === "runtimeMap" && method === "set" && expression.arguments.length === 2) {
    const key = lowerValueExpression(expression.arguments[0], bindings);
    const value = lowerValueExpression(expression.arguments[1], bindings);
    if (key !== undefined && value !== undefined) {
      return { kind: "runtimeMapSet", mapName: binding.name, key, value };
    }
  }
  if (binding?.kind === "runtimeSet" && method === "add" && expression.arguments.length === 1) {
    const value = lowerValueExpression(expression.arguments[0], bindings);
    if (value !== undefined) {
      return { kind: "runtimeSetAdd", setName: binding.name, value };
    }
  }
  return undefined;
}

// eslint-disable-next-line complexity, max-statements -- Delete lowering handles fixed, runtime, and boxed aggregate targets in one place.
function lowerDeleteExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isDeleteExpression(expression)) {
    return undefined;
  }

  const target = expression.expression;
  if (ts.isPropertyAccessExpression(target) && ts.isIdentifier(target.expression)) {
    const binding = bindings.get(target.expression.text);
    if (binding?.kind === "runtimeObject") {
      return { kind: "runtimeObjectDelete", objectName: target.expression.text, key: { kind: "literal", value: target.name.text } };
    }
    if (isProvenBoxedAggregateBinding(binding)) {
      return { kind: "valueObjectDelete", targetName: target.expression.text, key: { kind: "literal", value: target.name.text } };
    }
  }

  if (ts.isElementAccessExpression(target) && ts.isIdentifier(target.expression)) {
    const binding = bindings.get(target.expression.text);
    if (binding?.kind === "runtimeArray") {
      const index = lowerNumberExpression(target.argumentExpression, bindings);
      if (index !== undefined) {
        return { kind: "runtimeArrayDelete", arrayName: target.expression.text, index };
      }
      const stringIndex = lowerCanonicalArrayIndexString(target.argumentExpression);
      if (stringIndex !== undefined) {
        return { kind: "runtimeArrayDelete", arrayName: target.expression.text, index: { kind: "literal", value: stringIndex } };
      }
      const key = lowerPropertyKeyExpression(target.argumentExpression, bindings);
      if (key !== undefined) {
        return { kind: "runtimeArrayNamedDelete", arrayName: target.expression.text, key };
      }
    }
    if (isProvenBoxedAggregateBinding(binding)) {
      const index = lowerNumberExpression(target.argumentExpression, bindings);
      const stringIndex = lowerCanonicalArrayIndexString(target.argumentExpression);
      if (index !== undefined) {
        return { kind: "valueArrayDelete", targetName: target.expression.text, index };
      }
      if (stringIndex !== undefined) {
        return { kind: "valueArrayDelete", targetName: target.expression.text, index: { kind: "literal", value: stringIndex } };
      }
      const key = lowerPropertyKeyExpression(target.argumentExpression, bindings);
      if (key !== undefined) {
        return { kind: "valueObjectDelete", targetName: target.expression.text, key };
      }
    }
    const key = lowerStringRuntimeExpression(target.argumentExpression, bindings);
    if (binding?.kind === "runtimeObject" && key !== undefined) {
      return { kind: "runtimeObjectDelete", objectName: target.expression.text, key };
    }
  }

  return undefined;
}

function lowerForStatement(
  statement: ts.ForStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (
    statement.initializer === undefined ||
    statement.condition === undefined ||
    statement.incrementor === undefined
  ) {
    return notApplicable;
  }

  const forBindings = new Map(bindings);
  const initializer = lowerForInitializer(statement.initializer, forBindings);
  if (initializer === undefined) {
    return notApplicable;
  }

  const condition = lowerConditionExpression(statement.condition, forBindings);
  if (condition.kind !== "lowered") {
    return condition;
  }

  // `i = i + 1` and `i++` are both incrementors, and the two lower through different recognizers: the
  // second is an update expression, which the expression-statement tier already lowers to the same
  // `assignNumber`. Only routing one of them makes the other look unsupported.
  const incrementor = lowerAssignmentStatement(statement.incrementor, forBindings);
  if (incrementor.kind === "unsupported") {
    return incrementor;
  }
  let increment: JsIrOperation | undefined;
  if (incrementor.kind === "lowered") {
    increment = incrementor.operation;
  } else {
    increment = lowerUpdateExpressionStatement(statement.incrementor, forBindings);
  }
  if (increment === undefined) {
    return notApplicable;
  }

  const body = withinLoopLabel(() => bodyOperations(lowerStatementBody(statement.statement, forBindings)));
  if (body === undefined) {
    return notApplicable;
  }

  return produced({
    kind: "for",
    initializer,
    condition: condition.operation,
    increment,
    body
  });
}

// eslint-disable-next-line complexity, max-statements -- for...of lowering dispatches specialized source kinds first, then the generic Symbol.iterator protocol.
function lowerForOfStatement(
  statement: ts.ForOfStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isVariableDeclarationList(statement.initializer) || statement.initializer.declarations.length !== 1) {
    return undefined;
  }
  const [declaration] = statement.initializer.declarations;
  if (!ts.isIdentifier(declaration.name) || declaration.initializer !== undefined || (statement.initializer.flags & ts.NodeFlags.Const) === 0) {
    return undefined;
  }
  const itemName = declaration.name.text;
  const bodyStatement = statement.statement;
  const specialized = lowerSpecializedForOf(statement.expression, itemName, bodyStatement, bindings);
  if (specialized !== undefined) {
    return specialized;
  }
  // Generic sync iteration protocol: for-of over any value that may implement Symbol.iterator.
  const iterable = lowerValueExpression(statement.expression, bindings);
  if (iterable === undefined) {
    return undefined;
  }
  const bodyBindings = new Map(bindings);
  bodyBindings.set(itemName, { kind: "valueVariable", name: itemName });
  const body = bodyOperations(lowerStatementBody(bodyStatement, bodyBindings));
  if (body === undefined) {
    return undefined;
  }
  return {
    kind: "forOfProtocol",
    itemName,
    iterable,
    notIterableMessage: `${iteratorErrorSubject(statement.expression)} is not iterable`,
    body
  };
}

// eslint-disable-next-line max-statements -- Specialized for-of branches cover string, Set, Map, and fixed array sources.
function lowerSpecializedForOf(
  sourceExpression: ts.Expression,
  itemName: string,
  bodyStatement: ts.Statement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  const sourceString = lowerStringRuntimeExpression(sourceExpression, bindings);
  if (sourceString !== undefined) {
    const bodyBindings = new Map(bindings);
    bodyBindings.set(itemName, { kind: "stringVariable", name: itemName });
    const body = bodyOperations(lowerStatementBody(bodyStatement, bodyBindings));
    if (body === undefined) {
      return undefined;
    }
    return { kind: "forOfString", itemName, source: sourceString, body };
  }
  if (!ts.isIdentifier(sourceExpression)) {
    return undefined;
  }
  const sourceName = sourceExpression.text;
  const sourceBinding = bindings.get(sourceName);
  if (sourceBinding?.kind === "runtimeSet") {
    const bodyBindings = new Map(bindings);
    bodyBindings.set(itemName, { kind: "valueVariable", name: itemName });
    const body = bodyOperations(lowerStatementBody(bodyStatement, bodyBindings));
    if (body === undefined) {
      return undefined;
    }
    return { kind: "forOfSet", itemName, setName: sourceBinding.name, body };
  }
  if (sourceBinding?.kind === "runtimeMap") {
    const bodyBindings = new Map(bindings);
    bodyBindings.set(itemName, { kind: "runtimeArray", name: itemName });
    const body = bodyOperations(lowerStatementBody(bodyStatement, bodyBindings));
    if (body === undefined) {
      return undefined;
    }
    return { kind: "forOfMap", itemName, mapName: sourceBinding.name, body };
  }
  if (sourceBinding?.kind !== "array") {
    return undefined;
  }
  const bodyBindings = new Map(bindings);
  bodyBindings.set(itemName, { kind: "number", value: { kind: "variable", name: itemName } });
  const body = bodyOperations(lowerStatementBody(bodyStatement, bodyBindings));
  if (body === undefined) {
    return undefined;
  }
  return { kind: "forOfArray", itemName, arrayName: sourceName, body };
}

function iteratorErrorSubject(expression: ts.Expression): string {
  let current = expression;
  while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isTypeAssertionExpression(current) || ts.isNonNullExpression(current)) {
    current = current.expression;
  }
  if (ts.isIdentifier(current)) {
    return current.text;
  }
  return "value";
}

// eslint-disable-next-line max-statements -- for...in lowering dispatches supported source kinds explicitly while unsupported iterables stay diagnostic-only.
function lowerForInStatement(
  statement: ts.ForInStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isVariableDeclarationList(statement.initializer) || statement.initializer.declarations.length !== 1) {
    return undefined;
  }
  const [declaration] = statement.initializer.declarations;
  if (!ts.isIdentifier(declaration.name) || declaration.initializer !== undefined || (statement.initializer.flags & ts.NodeFlags.Const) === 0) {
    return undefined;
  }
  if (!ts.isIdentifier(statement.expression)) {
    return undefined;
  }
  const sourceName = statement.expression.text;
  const sourceBinding = bindings.get(sourceName);
  if (sourceBinding?.kind === "runtimeObject") {
    const bodyBindings = new Map(bindings);
    bodyBindings.set(declaration.name.text, { kind: "stringVariable", name: declaration.name.text });
    const body = bodyOperations(lowerStatementBody(statement.statement, bodyBindings));
    if (body === undefined) {
      return undefined;
    }
    return { kind: "forInObject", itemName: declaration.name.text, objectName: sourceBinding.name, body };
  }
  if (sourceBinding?.kind === "runtimeArray") {
    const bodyBindings = new Map(bindings);
    bodyBindings.set(declaration.name.text, { kind: "stringVariable", name: declaration.name.text });
    const body = bodyOperations(lowerStatementBody(statement.statement, bodyBindings));
    if (body === undefined) {
      return undefined;
    }
    return { kind: "forInArray", itemName: declaration.name.text, arrayName: sourceBinding.name, body };
  }
  return undefined;
}

/**
 * The bindings a `for` initializer declares, in source order.
 *
 * The initializer is a declaration list, so it may declare more than one name, and every declaration is
 * evaluated before the condition runs: `for (let i = 0, j = i + 1; ...)` needs `i` visible to `j`. The
 * caller therefore folds each result into its binding map as it goes rather than after the fact.
 *
 * `undefined` means this initializer is not one the loop tier can represent — a `const`, a destructuring
 * pattern, or a value that is not a number — and the caller declines the whole statement.
 */
function lowerForInitializer(
  initializer: ts.ForInitializer,
  bindings: Map<string, JsIrBindingValue>
): readonly JsIrOperation[] | undefined {
  if (!ts.isVariableDeclarationList(initializer) || (initializer.flags & ts.NodeFlags.Const) !== 0) {
    return undefined;
  }

  const declarations: JsIrOperation[] = [];
  for (const declaration of initializer.declarations) {
    if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
      return undefined;
    }
    const value = lowerNumberExpression(declaration.initializer, bindings);
    if (value === undefined) {
      return undefined;
    }
    const operation: JsIrOperation = {
      kind: "letNumber",
      name: declaration.name.text,
      value
    };
    declarations.push(operation);
    updateBindings(operation, bindings);
  }

  return declarations;
}

function lowerWhileStatement(
  statement: ts.WhileStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const condition = lowerConditionExpression(statement.expression, bindings);
  if (condition.kind !== "lowered") {
    return condition;
  }

  const body = withinLoopLabel(() => bodyOperations(lowerStatementBody(statement.statement, bindings)));
  if (body === undefined) {
    return notApplicable;
  }

  return produced({
    kind: "while",
    condition: condition.operation,
    body
  });
}

function lowerDoWhileStatement(
  statement: ts.DoStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const condition = lowerConditionExpression(statement.expression, bindings);
  if (condition.kind !== "lowered") {
    return condition;
  }

  const body = withinLoopLabel(() => bodyOperations(lowerStatementBody(statement.statement, bindings)));
  if (body === undefined) {
    return notApplicable;
  }

  return produced({
    kind: "doWhile",
    condition: condition.operation,
    body
  });
}

/**
 * `break` or `continue`, with the depth a label resolved to.
 *
 * An unlabelled jump is the innermost loop, which is depth zero and therefore carries no field at all — so
 * every existing jump lowers to the same operation it did before.
 */
function lowerLabelledJump(kind: "break" | "continue", label: ts.Identifier | undefined): JsIrOperation {
  if (label === undefined) {
    return { kind };
  }
  const targetDepth = loopDepthForLabel(label.text);
  if (targetDepth === undefined) {
    return { kind };
  }
  return { kind, targetDepth };
}

/**
 * `label: statement`.
 *
 * A label on a loop names the loop, and `break label` / `continue label` then resolve to a depth — which is
 * what makes the two indistinguishable from an unlabelled jump once the depth is known. A label on
 * anything else names a statement that is not a jump target this lowering can reach: a `break` out of a
 * labelled block has to leave a construct the IR has no frame for, so it is declined by name rather than
 * compiled as a jump to the wrong loop.
 */
function lowerLabelledStatement(
  statement: ts.LabeledStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!ts.isIdentifier(statement.label)) {
    return unsupportedIn("A statement label must be an identifier");
  }
  const body = statement.statement;
  const isLoop =
    ts.isForStatement(body) ||
    ts.isForOfStatement(body) ||
    ts.isForInStatement(body) ||
    ts.isWhileStatement(body) ||
    ts.isDoStatement(body);
  if (!isLoop) {
    return unsupportedIn(
      `\`${statement.label.text}:\` must label a loop; a label on a block or conditional is not supported yet`
    );
  }
  pendingLoopLabel = statement.label.text;
  try {
    return lowerStatement(body, bindings);
  } finally {
    pendingLoopLabel = undefined;
  }
}

// Lowers a statement body that may be a block or a single unbraced statement
// (e.g. `if (x) foo();` or `while (x) y--;`), normalizing the latter through
// the same statement-list channel blocks use.
/**
 * The operations of a lowered body, or `undefined` when it could not be lowered. A recognizer
 * that still returns `JsIrOperation | undefined` has nowhere to put the reason, so the statement
 * tier reports its own; converting that recognizer to return `Lowered` forwards the real one.
 */
function bodyOperations(body: LoweredStatementList): readonly JsIrOperation[] | undefined {
  if (body.kind === "lowered") {
    return body.operation;
  }
  return undefined;
}

function lowerStatementBody(
  statement: ts.Statement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): LoweredStatementList {
  if (ts.isBlock(statement)) {
    return lowerBlockStatements(statement, bindings);
  }
  return lowerStatementList([statement], bindings);
}

function lowerPrintExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrExpression | undefined {
  if (ts.isIdentifier(expression) && bindings.has(expression.text)) {
    return {
      kind: "identifier",
      name: expression.text
    };
  }

  const stringPrintExpression = lowerStringPrintExpression(expression, bindings);
  if (stringPrintExpression !== undefined) {
    return stringPrintExpression;
  }

  const numberArgument = lowerNumberExpression(expression, bindings);
  if (numberArgument !== undefined) {
    return {
      kind: "number",
      value: numberArgument
    };
  }

  if (expression.kind === ts.SyntaxKind.TrueKeyword || expression.kind === ts.SyntaxKind.FalseKeyword) {
    return {
      kind: "boolean",
      value: expression.kind === ts.SyntaxKind.TrueKeyword
    };
  }

  const valuePrintExpression = lowerValuePrintExpression(expression, bindings);
  if (valuePrintExpression !== undefined) {
    return valuePrintExpression;
  }

  if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text !== "print") {
    if (isPlannedBuiltinCall(expression.expression, bindings)) {
      return undefined;
    }
    const callee = bindings.get(expression.expression.text);
    const args: JsIrCallArgument[] = [];
    if (callee?.kind === "closure") {
      args.push(...callee.value.captures.map((value) => ({ valueKind: "number" as const, value })));
    }
    const loweredArgs = lowerCallArguments(expression.expression.text, expression.arguments, bindings);
    if (loweredArgs === undefined) {
      return undefined;
    }
    args.push(...loweredArgs);
    let name = expression.expression.text;
    if (callee?.kind === "closure") {
      name = callee.value.functionName;
    }
    return { kind: "call", name, arguments: args };
  }

  return undefined;
}

function lowerValuePrintExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrExpression | undefined {
  const valueArgument = lowerValueExpression(expression, bindings);
  if (valueArgument === undefined) {
    return undefined;
  }
  return { kind: "value", value: valueArgument };
}

function lowerStringPrintExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrExpression | undefined {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return { kind: "string", value: expression.text };
  }

  const stringArgument = lowerStringExpression(expression, bindings);
  if (stringArgument !== undefined) {
    return { kind: "string", value: stringArgument };
  }

  const stringExpression = lowerStringRuntimeExpression(expression, bindings);
  if (stringExpression !== undefined) {
    return { kind: "stringExpression", value: stringExpression };
  }

  return undefined;
}

function lowerIfStatement(
  statement: ts.IfStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const condition = lowerConditionExpression(statement.expression, bindings);
  if (condition.kind !== "lowered") {
    return condition;
  }

  const thenOperations = bodyOperations(lowerStatementBody(statement.thenStatement, bindings));
  if (thenOperations === undefined) {
    return notApplicable;
  }

  if (!statement.elseStatement) {
    return produced({ kind: "if", condition: condition.operation, thenOperations, elseOperations: [] });
  }

  const elseOperations = bodyOperations(lowerStatementBody(statement.elseStatement, bindings));
  if (elseOperations === undefined) {
    return notApplicable;
  }

  return produced({
    kind: "if",
    condition: condition.operation,
    thenOperations,
    elseOperations
  });
}

function lowerBlockStatements(
  block: ts.Block,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): LoweredStatementList {
  return lowerStatementList(block.statements, bindings);
}

function lowerStatementList(
  statements: readonly ts.Statement[],
  bindings: ReadonlyMap<string, JsIrBindingValue>
): LoweredStatementList {
  const operations: JsIrOperation[] = [];
  const blockBindings = new Map(bindings);

  for (const statement of statements) {
    if (isNonExecutableDeclaration(statement)) {
      continue;
    }

    const result = lowerStatement(statement, blockBindings);
    if (result.kind === "unsupported") {
      return result;
    }
    if (result.kind === "notApplicable") {
      return { kind: "unsupported", reason: unsupportedStatementMessage(statement, blockBindings) };
    }

    operations.push(result.operation);
    updateBindings(result.operation, blockBindings);
  }

  return loweredOperationList(operations);
}

function lowerSwitchStatement(
  statement: ts.SwitchStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const reason = unsupportedStatementMessage(statement, bindings);
  const expression = lowerValueExpression(statement.expression, bindings);
  if (expression === undefined) {
    return unsupported(reason);
  }
  const clauses: JsIrSwitchClause[] = [];
  const switchBindings = new Map(bindings);
  for (const clause of statement.caseBlock.clauses) {
    let test: JsIrValueExpression | undefined;
    if (ts.isCaseClause(clause)) {
      test = lowerValueExpression(clause.expression, switchBindings);
      if (test === undefined) {
        return unsupported(reason);
      }
    }
    const clauseOperations = lowerStatementList(clause.statements, switchBindings);
    if (clauseOperations.kind === "unsupported") {
      return clauseOperations;
    }
    for (const operation of clauseOperations.operation) {
      updateBindings(operation, switchBindings);
    }
    clauses.push({ test, operations: clauseOperations.operation });
  }
  return loweredOperation({ kind: "switch", expression, clauses });
}

// eslint-disable-next-line complexity, max-statements -- Function declaration lowering covers default initializers, rest parameters, and per-kind binding setup in one place.
function lowerFunctionDeclaration(
  statement: ts.FunctionDeclaration,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const reason = unsupportedStatementMessage(statement, bindings);
  if (!statement.name || !statement.body || !ts.isBlock(statement.body)) {
    return unsupported(reason);
  }

  const parameters: JsIrFunctionParameter[] = [];
  const fnBindings = functionFrameBindings(bindings);
  const prelude: JsIrOperation[] = [];
  const declaredParameters = runtimeParameters(statement.parameters);
  for (let i = 0; i < declaredParameters.length; i++) {
    const param = declaredParameters[i];
    const isRest = param.dotDotDotToken !== undefined;
    if (isRest && i !== declaredParameters.length - 1) {
      return unsupported(reason);
    }
    const isDestructuring = ts.isObjectBindingPattern(param.name) || ts.isArrayBindingPattern(param.name);
    if (isRest && isDestructuring) {
      return unsupported(reason);
    }
    let valueKind: JsIrValueKind;
    if (isRest || isDestructuring) {
      valueKind = "value";
    } else if (ts.isIdentifier(param.name)) {
      valueKind = parameterValueKind(param);
    } else {
      return unsupported(reason);
    }
    let defaultValue: JsIrNumberExpression | undefined;
    if (!isRest && !isDestructuring) {
      defaultValue = lowerNumericDefaultValue(param, fnBindings);
    }
    let parameter: JsIrFunctionParameter;
    let paramName: string;
    if (isDestructuring) {
      if (isRest) {
        paramName = "";
      } else {
        paramName = `__param${i}`;
      }
      parameter = { name: paramName, valueKind };
    } else {
      paramName = param.name.text;
      // `x?: T` with no initializer is omittable, which is not the same as having no default: the
      // call site passes `undefined` rather than refusing the shorter call. A rest parameter is never
      // omittable — it is always present, possibly empty — and a default already covers omission.
      const isOptional = param.questionToken !== undefined && defaultValue === undefined && !isRest;
      if (defaultValue === undefined) {
        if (isRest) {
          parameter = { name: paramName, valueKind, isRest: true };
        } else if (isOptional) {
          parameter = { name: paramName, valueKind, isOptional: true };
        } else {
          parameter = { name: paramName, valueKind };
        }
      } else {
        parameter = { name: paramName, valueKind, defaultValue };
      }
    }
    parameters.push(parameter);
    bindFunctionParameter(paramName, valueKind, isRest, fnBindings);
    if (isDestructuring) {
      const destructuringSource: DestructuringSource = {
        name: paramName,
        binding: { kind: "valueVariable", name: paramName }
      };
      const pattern: ts.ArrayBindingPattern | ts.ObjectBindingPattern = param.name;
      const destructuringOperations: JsIrOperation[] = [];
      const destructuringBindings = new Map(fnBindings);
      let loweredDestructuring: boolean;
      if (ts.isArrayBindingPattern(pattern)) {
        loweredDestructuring = lowerArrayProtocolDestructuringFromSource(
          pattern,
          { kind: "value", value: { kind: "variable", name: paramName } },
          `${paramName} is not iterable`,
          destructuringBindings,
          destructuringOperations
        );
      } else {
        loweredDestructuring = lowerObjectDestructuringElements(pattern, destructuringSource, destructuringBindings, destructuringOperations);
      }
      if (!loweredDestructuring) {
        return unsupported(reason);
      }
      for (const op of destructuringOperations) {
        prelude.push(op);
        updateBindings(op, destructuringBindings);
      }
      for (const [name, value] of destructuringBindings) {
        fnBindings.set(name, value);
      }
    }
  }

  fnBindings.set(statement.name.text, {
    kind: "functionReference",
    parameters,
    returnKind: declaredFunctionReturnKind(statement.type)
  });

  const loweredBody = lowerBlockStatements(statement.body, fnBindings);
  if (loweredBody.kind === "unsupported") {
    return loweredBody;
  }
  const bodyStatements = loweredBody.operation;

  let body: readonly JsIrOperation[];
  if (prelude.length === 0) {
    body = bodyStatements;
  } else {
    body = [{ kind: "bindingGroup", operations: [...prelude, ...bodyStatements] }];
  }

  return loweredOperation({
    kind: "function",
    name: statement.name.text,
    parameters,
    body,
    enclosingCaptureNames: collectFunctionDeclarationEnclosingCaptureNames(statement, bindings),
    constructibleByObjectReturn: isPlainObjectReturningConstructor(statement)
  });
}

function declaredFunctionReturnKind(type: ts.TypeNode | undefined): JsIrValueKind | "void" {
  if (type?.kind === ts.SyntaxKind.NumberKeyword) {
    return "number";
  }
  if (type?.kind === ts.SyntaxKind.StringKeyword) {
    return "string";
  }
  if (type?.kind === ts.SyntaxKind.VoidKeyword) {
    return "void";
  }
  return "value";
}
























































































function lowerNumericDefaultValue(
  param: ts.ParameterDeclaration,
  fnBindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrNumberExpression | undefined {
  if (param.initializer === undefined || param.initializer.kind === ts.SyntaxKind.UndefinedKeyword) {
    return undefined;
  }
  return lowerNumberExpression(param.initializer, fnBindings);
}

function bindFunctionParameter(
  name: string,
  valueKind: JsIrValueKind,
  isRest: boolean,
  fnBindings: Map<string, JsIrBindingValue>
): void {
  if (isRest || valueKind === "value") {
    fnBindings.set(name, { kind: "valueVariable", name });
    return;
  }
  if (valueKind === "string") {
    fnBindings.set(name, { kind: "stringVariable", name });
    return;
  }
  fnBindings.set(name, { kind: "number", value: { kind: "parameter", name } });
}

// The backend has no cross-frame access to mutable number/string/boolean
// bindings: referencing an enclosing frame's mutable variable from inside a
// function would emit a load/store through a pointer that only exists in the
// enclosing frame, producing invalid IR. Entering a new function frame drops
// those inherited bindings so such references fail to lower (a clean TSCN1002
// rejection) instead. Parameters and body-local bindings are added after this
// copy and are unaffected. Returned closures are exempt:
// lowerReturnedFunctionExpression re-binds free variables as explicit capture
// parameters.
function functionFrameBindings(bindings: ReadonlyMap<string, JsIrBindingValue>): Map<string, JsIrBindingValue> {
  const frameBindings = new Map(bindings);
  for (const [name, binding] of frameBindings) {
    if (binding.kind === "stringVariable" || binding.kind === "booleanVariable" || (binding.kind === "number" && binding.value.kind === "variable")) {
      frameBindings.delete(name);
    }
  }
  return frameBindings;
}

function lowerCallStatement(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (ts.isIdentifier(expression.expression) && expression.expression.text === "print") {
    return notApplicable;
  }

  // A discarded `<instance>.<method>(...)` is still a class method call, and the value path
  // cannot see that: it reads the method off the receiver, and class methods are never
  // installed on the prototype, so `jsCall` dispatched on `undefined` and the program
  // segfaulted. Resolve it to the generated method function here, exactly as the value path
  // does, so both positions agree.
  if (ts.isPropertyAccessExpression(expression.expression)) {
    const methodCall = lowerClassMethodCall(expression, expression.expression, bindings);
    if (methodCall.kind !== "notApplicable") {
      return methodCall;
    }
  }

  const jsonStatement = lowerJsonStatementCall(expression, bindings);
  if (jsonStatement !== undefined) {
    return produced(jsonStatement);
  }

  const spreadCall = lowerSpreadCallValue(expression, bindings);
  if (spreadCall !== undefined) {
    return produced(spreadCall);
  }

  let identifierBinding: JsIrBindingValue | undefined;
  if (ts.isIdentifier(expression.expression)) {
    identifierBinding = bindings.get(expression.expression.text);
  }
  if (unlowerableCallee(expression.expression, identifierBinding, bindings)) {
    return notApplicable;
  }
  if (!ts.isIdentifier(expression.expression) || identifierBinding?.kind === "value" || identifierBinding?.kind === "valueVariable") {
    const callee = lowerValueExpression(expression.expression, bindings);
    const args = lowerValueCallArguments(expression.arguments, bindings);
    if (callee === undefined || args === undefined) {
      return notApplicable;
    }
    return produced({
      kind: "callValue",
      callee,
      arguments: args,
      thisValue: lowerCallThisValue(expression.expression, bindings),
      optionalCallee: optionalStatementCallee(expression)
    });
  }

  const args = lowerCallArguments(expression.expression.text, expression.arguments, bindings);
  if (args === undefined) {
    return notApplicable;
  }

  return produced({ kind: "call", name: expression.expression.text, arguments: args });
}

// A call is conditional on its callee exactly when the source wrote `callee?.(...)`. ECMAScript
// still evaluates the callee; it just skips the dispatch when the result is nullish.
function optionalStatementCallee(expression: ts.CallExpression): true | undefined {
  if (expression.questionDotToken === undefined) {
    return undefined;
  }
  return true;
}

function lowerRuntimeObjectCallStatement(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression)) {
    return undefined;
  }
  if (expression.expression.expression.text !== "Object") {
    return undefined;
  }

  if (expression.expression.name.text === "setPrototypeOf") {
    return lowerRuntimeSetPrototypeCall(expression, bindings);
  }
  if (expression.expression.name.text === "defineProperty") {
    return lowerRuntimeDefinePropertyCall(expression, bindings);
  }
  if (expression.expression.name.text === "defineProperties") {
    return lowerRuntimeDefinePropertiesCall(expression, bindings);
  }
  if (expression.expression.name.text === "preventExtensions") {
    return lowerUnaryRuntimeObjectCall(expression, bindings, "runtimeObjectPreventExtensions");
  }
  if (expression.expression.name.text === "seal") {
    return lowerUnaryRuntimeObjectCall(expression, bindings, "runtimeObjectSeal");
  }
  if (expression.expression.name.text === "freeze") {
    return lowerUnaryRuntimeObjectCall(expression, bindings, "runtimeObjectFreeze");
  }
  if (expression.expression.name.text === "assign") {
    return lowerRuntimeObjectAssignCall(expression, bindings);
  }
  return undefined;
}

function lowerUnaryRuntimeObjectCall(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  kind: "runtimeObjectPreventExtensions" | "runtimeObjectSeal" | "runtimeObjectFreeze"
): JsIrOperation | undefined {
  if (expression.arguments.length !== 1) {
    return undefined;
  }
  const [target] = expression.arguments;
  if (!ts.isIdentifier(target) || bindings.get(target.text)?.kind !== "runtimeObject") {
    return undefined;
  }
  return { kind, objectName: target.text };
}

function lowerRuntimeObjectAssignCall(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (expression.arguments.length < 2) {
    return undefined;
  }
  const [target, ...sourceExpressions] = expression.arguments;
  if (!ts.isIdentifier(target) || bindings.get(target.text)?.kind !== "runtimeObject") {
    return undefined;
  }
  const loweredSources: JsIrObjectAssignSource[] = [];
  for (const source of sourceExpressions) {
    if (!ts.isIdentifier(source)) {
      return undefined;
    }
    const binding = bindings.get(source.text);
    if (binding?.kind === "runtimeObject") {
      loweredSources.push({ kind: "runtimeObject", name: source.text });
      continue;
    }
    if (binding?.kind === "runtimeArray") {
      loweredSources.push({ kind: "runtimeArray", name: source.text });
      continue;
    }
    if (binding?.kind === "object" && !objectHasNestedFields(binding.value)) {
      loweredSources.push({ kind: "fixedObject", value: binding.value });
      continue;
    }
    if (binding?.kind === "array") {
      loweredSources.push({ kind: "fixedArray", name: source.text, length: binding.length });
      continue;
    }
    if (isProvenBoxedAggregateBinding(binding)) {
      const value = lowerValueExpression(source, bindings);
      if (value !== undefined) {
        loweredSources.push({ kind: "value", value });
        continue;
      }
    }
    return undefined;
  }
  return { kind: "runtimeObjectAssign", targetName: target.text, sources: loweredSources };
}

// eslint-disable-next-line complexity, max-statements -- Runtime array statement methods are centralized while the method surface is small.
function lowerRuntimeArrayCallStatement(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression)) {
    return undefined;
  }
  const arrayName = expression.expression.expression.text;
  if (bindings.get(arrayName)?.kind !== "runtimeArray") {
    return undefined;
  }
  const method = expression.expression.name.text;
  if (method === "push" || method === "unshift") {
    const values = lowerArrayMethodValues(expression.arguments, bindings);
    if (values === undefined) {
      return undefined;
    }
    return { kind: runtimeArrayAppendOperationKind(method), arrayName, values };
  }
  if (method === "pop" || method === "shift") {
    return { kind: runtimeArrayRemoveOperationKind(method), arrayName };
  }
  if (method === "splice") {
    return lowerRuntimeArraySpliceStatement(arrayName, expression.arguments, bindings);
  }
  const fill = lowerRuntimeArrayFillCallStatement(arrayName, method, expression.arguments, bindings);
  if (fill !== undefined) {
    return fill;
  }
  if (method === "reverse") {
    return { kind: "runtimeArrayReverse", arrayName };
  }
  if (method === "forEach") {
    return lowerRuntimeArrayForEachCallbackStatement(arrayName, expression.arguments, bindings);
  }
  if (method === "copyWithin" && (expression.arguments.length === 2 || expression.arguments.length === arrayCopyWithinArgumentCount)) {
    const target = lowerNumberExpression(expression.arguments[0], bindings);
    const start = lowerNumberExpression(expression.arguments[1], bindings);
    let end: JsIrNumberExpression | undefined;
    if (expression.arguments.length === arrayCopyWithinArgumentCount) {
      end = lowerNumberExpression(expression.arguments[2], bindings);
    }
    if (target !== undefined && start !== undefined && (expression.arguments.length === 2 || end !== undefined)) {
      return { kind: "runtimeArrayCopyWithin", arrayName, target, start, end };
    }
  }
  return undefined;
}

function lowerRuntimeArrayFillCallStatement(
  arrayName: string,
  method: string,
  args: ts.NodeArray<ts.Expression>,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (method !== "fill" || (args.length !== 1 && args.length !== 2 && args.length !== arrayFillRangeArgumentCount)) {
    return undefined;
  }
  const value = lowerValueExpression(args[0], bindings);
  if (value === undefined) {
    return undefined;
  }
  if (args.length === 1) {
    return { kind: "runtimeArrayFill", arrayName, value };
  }
  const start = lowerNumberExpression(args[1], bindings);
  let end: JsIrNumberExpression | undefined;
  if (args.length === arrayFillRangeArgumentCount) {
    end = lowerNumberExpression(args[2], bindings);
  }
  if (start === undefined || (args.length === arrayFillRangeArgumentCount && end === undefined)) {
    return undefined;
  }
  return { kind: "runtimeArrayFill", arrayName, value, start, end };
}

function runtimeArrayAppendOperationKind(method: "push" | "unshift"): "runtimeArrayPush" | "runtimeArrayUnshift" {
  if (method === "push") {
    return "runtimeArrayPush";
  }
  return "runtimeArrayUnshift";
}

function runtimeArrayRemoveOperationKind(method: "pop" | "shift"): "runtimeArrayPop" | "runtimeArrayShift" {
  if (method === "pop") {
    return "runtimeArrayPop";
  }
  return "runtimeArrayShift";
}

function lowerArrayMethodValues(
  args: ts.NodeArray<ts.Expression>,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): readonly JsIrValueExpression[] | undefined {
  const values: JsIrValueExpression[] = [];
  for (const arg of args) {
    const value = lowerValueExpression(arg, bindings);
    if (value === undefined) {
      return undefined;
    }
    values.push(value);
  }
  return values;
}

function lowerRuntimeSetPrototypeCall(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (expression.arguments.length !== 2) {
    return undefined;
  }
  const [target, prototype] = expression.arguments;
  if (!ts.isIdentifier(target)) {
    return undefined;
  }
  const targetBinding = bindings.get(target.text);
  let targetKind: "object" | "array" | undefined;
  if (targetBinding?.kind === "runtimeObject") {
    targetKind = "object";
  }
  if (targetBinding?.kind === "runtimeArray") {
    targetKind = "array";
  }
  if (targetKind === undefined) {
    return undefined;
  }
  if (prototype.kind === ts.SyntaxKind.NullKeyword) {
    return { kind: "runtimeObjectSetPrototype", targetName: target.text, targetKind };
  }
  if (!ts.isIdentifier(prototype) || prototype.text === target.text) {
    return undefined;
  }
  const prototypeBinding = bindings.get(prototype.text);
  if (prototypeBinding?.kind !== "runtimeObject") {
    return undefined;
  }
  return { kind: "runtimeObjectSetPrototype", targetName: target.text, targetKind, prototypeName: prototype.text };
}

function lowerRuntimeDefinePropertyCall(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (expression.arguments.length !== definePropertyArgumentCount) {
    return undefined;
  }
  const [target, keyExpression, descriptorExpression] = expression.arguments;
  if (!ts.isIdentifier(target) || bindings.get(target.text)?.kind !== "runtimeObject") {
    return undefined;
  }
  const key = lowerPropertyKeyExpression(keyExpression, bindings);
  const descriptor = lowerRuntimeDataDescriptor(key, descriptorExpression, bindings);
  if (descriptor === undefined) {
    return undefined;
  }
  return { kind: "runtimeObjectDefineDataProperty", objectName: target.text, descriptor };
}

function lowerRuntimeDefinePropertiesCall(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (expression.arguments.length !== 2) {
    return undefined;
  }
  const [target, descriptorsExpression] = expression.arguments;
  if (!ts.isIdentifier(target) || bindings.get(target.text)?.kind !== "runtimeObject" || !ts.isObjectLiteralExpression(descriptorsExpression)) {
    return undefined;
  }
  const descriptors = lowerRuntimeDataDescriptorMap(descriptorsExpression, bindings);
  if (descriptors === undefined) {
    return undefined;
  }
  return { kind: "runtimeObjectDefineDataProperties", objectName: target.text, descriptors };
}

function lowerRuntimeDataDescriptorMap(
  expression: ts.ObjectLiteralExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): readonly JsIrRuntimeDataDescriptor[] | undefined {
  const descriptors: JsIrRuntimeDataDescriptor[] = [];
  for (const property of expression.properties) {
    if (ts.isSpreadAssignment(property)) {
      if (!ts.isIdentifier(property.expression)) {
        return undefined;
      }
      const source = bindings.get(property.expression.text);
      if (source?.kind !== "runtimeObject" || source.value === undefined) {
        return undefined;
      }
      const spreadDescriptors = lowerRuntimeDataDescriptorMapValue(source.value, bindings);
      if (spreadDescriptors === undefined) {
        return undefined;
      }
      descriptors.push(...spreadDescriptors);
      continue;
    }
    if (ts.isShorthandPropertyAssignment(property)) {
      const descriptor = lowerRuntimeDataDescriptor({ kind: "literal", value: property.name.text }, property.name, bindings);
      if (descriptor === undefined) {
        return undefined;
      }
      descriptors.push(descriptor);
      continue;
    }
    if (!ts.isPropertyAssignment(property)) {
      return undefined;
    }
    const key = lowerRuntimeObjectFieldName(property.name, bindings);
    const descriptor = lowerRuntimeDataDescriptor(key, property.initializer, bindings);
    if (descriptor === undefined) {
      return undefined;
    }
    descriptors.push(descriptor);
  }
  return descriptors;
}

// eslint-disable-next-line max-statements -- Method value lowering keeps parameter, this, and body setup together.
/**
 * The number a numeric *source* literal denotes, or `undefined` when the expression is not one.
 *
 * Distinct from `numericLiteralValue`, which reads an already-lowered number: this runs before lowering,
 * on a TypeScript expression. A sign in front of the literal is still a constant — TypeScript accepts
 * `enum E { A = -1 }` and emits `E[E["A"] = -1] = "A"` — so the sign belongs to the value rather than
 * being a separate operation.
 */
function sourceNumericLiteralValue(expression: ts.Expression): number | undefined {
  if (ts.isNumericLiteral(expression)) {
    return Number(expression.text);
  }
  if (ts.isPrefixUnaryExpression(expression) && ts.isNumericLiteral(expression.operand)) {
    const magnitude = Number(expression.operand.text);
    if (expression.operator === ts.SyntaxKind.MinusToken) {
      return -magnitude;
    }
    if (expression.operator === ts.SyntaxKind.PlusToken) {
      return magnitude;
    }
  }
  return undefined;
}

/**
 * One enum member with the value TypeScript gives it, worked out before anything is lowered.
 *
 * `undefined` is a real value here and not a gap: a member that auto-numbers after a string member has
 * no number to take, so TypeScript gives it `undefined` and still gives it a reverse entry under the key
 * `"undefined"`. `enum Mixed { X = 5, Y, Z = "s", W }` has `Mixed.W === undefined`.
 */
interface EnumMemberValue {
  readonly name: string;
  readonly value: number | string | undefined;
}

/**
 * The values of an enum's members, in declaration order.
 *
 * C-style rules, as TypeScript implements them: a member with no initializer takes the next number, a
 * numeric initializer sets that number and moves the counter past it, and a string initializer leaves no
 * counter — so the next auto-numbered member is `undefined` until a numeric initializer restores it.
 *
 * An initializer that is neither a numeric nor a string literal has no value this lowering can work out:
 * `A = 1 + 1` needs constant folding, which is the checker's job and not this pass's.
 */
/** What one member's initializer contributes: its value, and the counter for the member after it. */
interface EnumInitializerOutcome {
  readonly value: number | string | undefined;
  readonly nextNumber: number;
  readonly counterIsValid: boolean;
}

/** Classify a member's initializer, or `undefined` when it is not a constant this pass can read. */
function enumInitializerOutcome(initializer: ts.Expression): EnumInitializerOutcome | undefined {
  const signed = sourceNumericLiteralValue(initializer);
  if (signed !== undefined) {
    if (!Number.isFinite(signed)) {
      return undefined;
    }
    return { value: signed, nextNumber: signed + 1, counterIsValid: true };
  }
  if (ts.isStringLiteral(initializer)) {
    // A string leaves no counter, so the next auto-numbered member is `undefined` until a numeric
    // initializer restores it.
    return { value: initializer.text, nextNumber: 0, counterIsValid: false };
  }
  return undefined;
}

function enumMemberValues(members: ts.NodeArray<ts.EnumMember>): Produced<readonly EnumMemberValue[]> {
  const values: EnumMemberValue[] = [];
  let nextNumber = 0;
  let counterIsValid = true;
  for (const member of members) {
    const { name } = member;
    if (!ts.isIdentifier(name) && !ts.isStringLiteral(name)) {
      return unsupportedIn("An enum member name must be an identifier or a string literal");
    }
    const { initializer } = member;
    if (initializer === undefined) {
      let value: number | undefined;
      if (counterIsValid) {
        value = nextNumber;
        nextNumber += 1;
      }
      values.push({ name: name.text, value });
      continue;
    }
    const outcome = enumInitializerOutcome(initializer);
    if (outcome === undefined) {
      return unsupportedIn(
        `\`${name.text}\` has an enum initializer that is not a numeric or string literal; this build does not fold constant expressions`
      );
    }
    values.push({ name: name.text, value: outcome.value });
    const { nextNumber: following, counterIsValid: followingIsValid } = outcome;
    nextNumber = following;
    counterIsValid = followingIsValid;
  }
  return produced(values);
}

/**
 * An enum lowered to the object TypeScript's own emit builds.
 *
 * Both directions are in one object literal, as they are in TypeScript's output: the forward mapping is
 * `A: 0`, and the reverse mapping is the *key* `0` holding `"A"`. A string member contributes only the
 * forward entry, because a string has no reverse entry — that is what the plan means by handling numeric
 * and string members separately. The reverse key is the member's value rendered as a string, since a
 * property key is always a string; `undefined` becomes `"undefined"`, matching the quirk above.
 */
function lowerEnumValue(declaration: ts.EnumDeclaration): Produced<JsIrRuntimeObjectValue> {
  const members = enumMemberValues(declaration.members);
  if (members.kind !== "lowered") {
    return members;
  }
  const fields: JsIrRuntimeObjectField[] = [];
  for (const member of members.operation) {
    fields.push({
      kind: "field",
      key: { kind: "literal", value: member.name },
      value: enumMemberValueExpression(member.value)
    });
    if (typeof member.value === "number") {
      fields.push({
        kind: "field",
        key: { kind: "literal", value: String(member.value) },
        value: { kind: "string", value: { kind: "literal", value: member.name } }
      });
    } else if (member.value === undefined) {
      fields.push({
        kind: "field",
        key: { kind: "literal", value: "undefined" },
        value: { kind: "string", value: { kind: "literal", value: member.name } }
      });
    }
  }
  return produced({ fields });
}

function enumMemberValueExpression(value: number | string | undefined): JsIrValueExpression {
  if (typeof value === "number") {
    return { kind: "number", value: { kind: "literal", value } };
  }
  if (typeof value === "string") {
    return { kind: "string", value: { kind: "literal", value } };
  }
  return { kind: "undefined" };
}

/** `enum E { .. }` as the object-literal statement that binds `E`. */
function lowerEnumDeclarationStatement(declaration: ts.EnumDeclaration): Lowered {
  const { name } = declaration;
  const value = lowerEnumValue(declaration);
  if (value.kind !== "lowered") {
    return unsupportedIn(value.reason);
  }
  return loweredOperation({ kind: "runtimeObjectLiteral", name: name.text, value: value.operation });
}

/**
 * A namespace lowered to the object its exported members describe.
 *
 * A `namespace` declares a name whose value is an object of its exports, which is the shape an object
 * literal already produces, so the desugaring is that literal rather than a runtime namespace object.
 * This is the plan's "an object literal" reading; the IIFE wrapper TypeScript emits is the half that has
 * no representation here, and it is also the half that would let a non-exported declaration stay local.
 */
function lowerNamespaceValue(
  declaration: ts.ModuleDeclaration,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrRuntimeObjectValue> {
  const { name: declaredName, body } = declaration;
  if (!ts.isIdentifier(declaredName)) {
    return unsupportedIn("A namespace name must be a single identifier");
  }
  if (body === undefined || !ts.isModuleBlock(body)) {
    return unsupportedIn(`\`namespace ${declaredName.text}\` must have a body`);
  }
  const fields: JsIrRuntimeObjectField[] = [];
  for (const statement of body.statements) {
    if (isNonExecutableDeclaration(statement)) {
      continue;
    }
    const field = lowerNamespaceField(statement, bindings);
    if (field.kind !== "lowered") {
      return field;
    }
    fields.push(field.operation);
  }
  return produced({ fields });
}

/** One exported namespace member, as the field it contributes to the namespace object. */
function lowerNamespaceField(
  statement: ts.Statement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrRuntimeObjectField> {
  if (ts.isModuleDeclaration(statement)) {
    // A nested namespace is an object *inside* the field, and a runtime object's field takes a value
    // expression rather than a nested object. The inline form belongs to the fixed-shape object, which
    // cannot hold a function member, so the two shapes do not combine yet.
    return unsupportedIn("Nested namespaces are not supported yet; a namespace member must be a value or a function");
  }
  let exported = false;
  if (ts.canHaveModifiers(statement)) {
    exported = ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true;
  }
  if (!exported) {
    // The closure that would keep a non-exported declaration local is the IIFE half of the desugaring
    // this does not perform, so a namespace carrying one is declined rather than given an object that
    // would be missing it at runtime.
    return unsupportedIn("A namespace declaration that is not `export`ed is not supported yet");
  }
  if (ts.isFunctionDeclaration(statement)) {
    const { name } = statement;
    if (name === undefined || !ts.isIdentifier(name)) {
      return unsupportedIn("An exported namespace function must be named");
    }
    const value = lowerObjectMethodFunctionValue(statement, bindings);
    if (value === undefined) {
      return unsupportedIn(`\`function ${name.text}\` is not a function value this build can lower`);
    }
    return produced({ kind: "field", key: { kind: "literal", value: name.text }, value });
  }
  if (!ts.isVariableStatement(statement) || statement.declarationList.declarations.length !== 1) {
    return unsupportedIn("An exported namespace member must be a single `const`, `let`, `var` or `function` declaration");
  }
  const [declaration] = statement.declarationList.declarations;
  const declaredName = declaration.name;
  if (!ts.isIdentifier(declaredName) || declaration.initializer === undefined) {
    return unsupportedIn("An exported namespace variable must be a single named declaration with an initializer");
  }
  const value = lowerValueExpression(declaration.initializer, bindings);
  if (value === undefined) {
    return unsupportedIn(`\`${declaredName.text}\` is not a value this build can evaluate`);
  }
  return produced({ kind: "field", key: { kind: "literal", value: declaredName.text }, value });
}

/**
 * `namespace N { .. }` as the object-literal statement that binds `N`.
 *
 * The name is bound by the same operation an object literal's own name is bound by, so `N.member`
 * resolves through exactly the binding it would for the equivalent literal.
 */
function lowerNamespaceDeclarationStatement(
  statement: ts.ModuleDeclaration,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const value = lowerNamespaceValue(statement, bindings);
  if (value.kind !== "lowered") {
    return unsupportedIn(value.reason);
  }
  const { name } = statement;
  if (!ts.isIdentifier(name)) {
    return unsupportedIn("A namespace name must be a single identifier");
  }
  return loweredOperation({ kind: "runtimeObjectLiteral", name: name.text, value: value.operation });
}

/**
 * The function value an object-literal member contributes.
 *
 * Takes a method or a function declaration because both describe a function body with a name, a
 * parameter list and a body, which is everything read here — an object-literal method and an exported
 * namespace function differ only in the syntax they are written in.
 */
function lowerObjectMethodFunctionValue(
  method: ts.MethodDeclaration | ts.FunctionDeclaration,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  if (method.asteriskToken !== undefined || method.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) === true || method.body === undefined) {
    return undefined;
  }
  const parameters: JsIrFunctionParameter[] = [];
  const methodBindings = new Map(bindings);
  methodBindings.set(CLASS_THIS_NAME, { kind: "valueVariable", name: CLASS_THIS_NAME });
  for (const parameter of runtimeParameters(method.parameters)) {
    if (!ts.isIdentifier(parameter.name) || parameter.initializer !== undefined || parameter.dotDotDotToken !== undefined) {
      return undefined;
    }
    const valueKind = parameterValueKind(parameter);
    parameters.push({ name: parameter.name.text, valueKind });
    bindFunctionParameter(parameter.name.text, valueKind, false, methodBindings);
  }
  const body = bodyOperations(lowerBlockStatements(method.body, methodBindings));
  if (body === undefined) {
    return undefined;
  }
  let displayName = "method";
  const declaredName = method.name;
  if (declaredName !== undefined && ts.isIdentifier(declaredName)) {
    displayName = declaredName.text;
  }
  const codeName = `__tscn_fnobj_${displayName}_${nextFunctionObjectId}`.replace(/[^A-Za-z0-9_]/g, "_");
  nextFunctionObjectId += 1;
  return { kind: "functionObject", definition: { codeName, parameters, functionKind: "ordinary", returnKind: functionReturnKind(body), body } };
}



















// eslint-disable-next-line complexity, max-statements -- Descriptor literal lowering keeps data descriptor validation in one place.
function lowerRuntimeDataDescriptor(
  key: JsIrStringExpression | undefined,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrRuntimeDataDescriptor | undefined {
  if (key === undefined || !ts.isObjectLiteralExpression(expression)) {
    if (key !== undefined && ts.isIdentifier(expression)) {
      const binding = bindings.get(expression.text);
      if (binding?.kind === "runtimeObject" && binding.value !== undefined) {
        return lowerRuntimeDataDescriptorValue(key, { kind: "objectRef", name: expression.text }, bindings, binding.value);
      }
    }
    return undefined;
  }
  let value: JsIrValueExpression | undefined;
  let writable = false;
  let enumerable = false;
  let configurable = false;
  for (const property of expression.properties) {
    if (ts.isShorthandPropertyAssignment(property)) {
      const booleanValue = lowerBooleanExpression(property.name, bindings);
      if (booleanValue === undefined) {
        return undefined;
      }
      if (property.name.text === "writable") {
        writable = booleanValue;
        continue;
      }
      if (property.name.text === "enumerable") {
        enumerable = booleanValue;
        continue;
      }
      if (property.name.text === "configurable") {
        configurable = booleanValue;
        continue;
      }
      return undefined;
    }
    if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) {
      return undefined;
    }
    if (property.name.text === "value") {
      value = lowerValueExpression(property.initializer, bindings);
      continue;
    }
    const booleanValue = lowerBooleanExpression(property.initializer, bindings);
    if (booleanValue === undefined) {
      return undefined;
    }
    if (property.name.text === "writable") {
      writable = booleanValue;
      continue;
    }
    if (property.name.text === "enumerable") {
      enumerable = booleanValue;
      continue;
    }
    if (property.name.text === "configurable") {
      configurable = booleanValue;
      continue;
    }
    return undefined;
  }
  if (value === undefined) {
    return undefined;
  }
  return { key, value, writable, enumerable, configurable };
}
































































function fixedObjectToRuntimeObjectValue(value: JsIrObjectValue): JsIrRuntimeObjectValue | undefined {
  const fields: JsIrRuntimeObjectField[] = [];
  for (const field of value.fields) {
    if (field.value.kind !== "number") {
      return undefined;
    }
    fields.push({ kind: "field", key: { kind: "literal", value: field.name }, value: { kind: "number", value: field.value.value } });
  }
  return { fields };
}














function lowerReturnStatement(
  statement: ts.ReturnStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!statement.expression) {
    // Bare `return;` yields undefined, matching the class method normalization
    // in lowerClassMethodBody.
    return {
      kind: "returnValue",
      expression: { kind: "undefined" }
    };
  }

  const closure = lowerReturnedFunctionExpression(statement.expression, bindings);
  if (closure !== undefined) {
    return closure;
  }

  const stringExpression = lowerStringRuntimeExpression(statement.expression, bindings);
  if (stringExpression !== undefined) {
    return {
      kind: "returnString",
      expression: stringExpression
    };
  }

  const expression = lowerNumberExpression(statement.expression, bindings);
  if (expression !== undefined) {
    return {
      kind: "returnNumber",
      expression
    };
  }

  const valueExpression = lowerValueExpression(statement.expression, bindings);
  if (valueExpression === undefined) {
    return undefined;
  }

  return {
    kind: "returnValue",
    expression: valueExpression
  };
}

// eslint-disable-next-line complexity, max-statements -- Closure lowering validates syntax, captures, parameters, and body atomically.
function lowerReturnedFunctionExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isFunctionExpression(expression) && !ts.isArrowFunction(expression)) {
    return undefined;
  }

  const parameters: JsIrFunctionParameter[] = [];
  const nestedBindings = new Map(bindings);
  const localNames = new Set<string>();
  for (const param of runtimeParameters(expression.parameters)) {
    if (!ts.isIdentifier(param.name)) {
      return undefined;
    }
    const valueKind = parameterValueKind(param);
    parameters.push({ name: param.name.text, valueKind });
    localNames.add(param.name.text);
    bindFunctionParameter(param.name.text, valueKind, false, nestedBindings);
  }

  const captureNames = collectFunctionExpressionCaptureNames(expression, localNames, bindings);
  for (const name of captureNames) {
    const binding = bindings.get(name);
    if (binding?.kind === "number") {
      nestedBindings.set(name, { kind: "number", value: { kind: "parameter", name } });
    } else if (binding?.kind === "string" || binding?.kind === "stringExpression" || binding?.kind === "stringVariable") {
      nestedBindings.set(name, { kind: "stringVariable", name });
    } else {
      nestedBindings.set(name, { kind: "valueVariable", name });
    }
  }

  const body = lowerInlineFunctionBody(expression.body, nestedBindings);
  if (body === undefined) {
    return undefined;
  }
  const captures: { name: string; valueKind: JsIrValueKind; value: JsIrValueExpression }[] = [];
  for (const name of captureNames) {
    const binding = bindings.get(name);
    const capture = lowerCapturedBindingValue(binding);
    if (capture === undefined) {
      return undefined;
    }
    captures.push({ name, ...capture });
  }
  let displayName = "arrow";
  if (ts.isFunctionExpression(expression)) {
    displayName = expression.name?.text ?? "anonymous";
  }
  const codeName = `__tscn_fnobj_${displayName}_${nextFunctionObjectId}`.replace(/[^A-Za-z0-9_]/g, "_");
  nextFunctionObjectId += 1;
  return {
    kind: "returnValue",
    expression: {
      kind: "functionObject",
      definition: {
        codeName,
        parameters,
        functionKind: functionExpressionKind(expression),
        returnKind: functionReturnKind(body),
        body,
        captures
      }
    }
  };
}

function functionExpressionKind(expression: ts.ArrowFunction | ts.FunctionExpression): "arrow" | "ordinary" {
  if (ts.isArrowFunction(expression)) {
    return "arrow";
  }
  return "ordinary";
}






















































function lowerVariableBinding(
  statement: ts.VariableStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  promotedAggregates: ReadonlySet<string> = new Set()
): JsIrOperation | undefined {
  if (statement.declarationList.declarations.length !== 1) {
    return undefined;
  }

  const [declaration] = statement.declarationList.declarations;
  if (!declaration.initializer) {
    return undefined;
  }

  const isConst = (statement.declarationList.flags & ts.NodeFlags.Const) !== 0;
  const isVar = (statement.declarationList.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) === 0;

  if (ts.isArrayBindingPattern(declaration.name) || ts.isObjectBindingPattern(declaration.name)) {
    if (!isConst) {
      return undefined;
    }
    return lowerDestructuringBinding(declaration.name, declaration.initializer, bindings);
  }

  if (!ts.isIdentifier(declaration.name)) {
    return undefined;
  }

  // Simple `var` bindings flow through the `let` path. Function-scoped hoisting
  // (use before declaration) is not modeled, so a `var` is only supported where
  // a `let` in the same position would be. A redeclaration in the same scope
  // merges with the existing binding, matching function-scoped `var` semantics.
  if (!isConst) {
    if (isVar && bindings.has(declaration.name.text)) {
      return lowerVarRedeclaration(declaration.name.text, declaration.initializer, bindings);
    }
    return lowerLetVariableBinding(declaration.name.text, declaration.initializer, bindings);
  }

  return lowerConstVariableBinding(
    declaration.name.text,
    declaration.initializer,
    bindings,
    declaration.type?.kind === ts.SyntaxKind.UnknownKeyword || declaration.type?.kind === ts.SyntaxKind.AnyKeyword,
    isRuntimeArrayTypeHint(declaration.type) || promotedAggregates.has(declaration.name.text),
    promotedAggregates.has(declaration.name.text)
  );
}

function lowerDestructuringBinding(
  pattern: ts.ArrayBindingPattern | ts.ObjectBindingPattern,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  const operations: JsIrOperation[] = [];
  const working = new Map(bindings);
  if (ts.isArrayBindingPattern(pattern) && lowerArrayProtocolDestructuring(pattern, initializer, working, operations)) {
    return { kind: "bindingGroup", operations };
  }
  const source = resolveDestructuringSource(initializer, working, operations, pattern.pos);
  if (source === undefined) {
    return undefined;
  }
  let lowered: boolean;
  if (ts.isArrayBindingPattern(pattern)) {
    lowered = lowerArrayDestructuringElements(pattern, source, working, operations);
  } else {
    lowered = lowerObjectDestructuringElements(pattern, source, working, operations);
  }
  if (!lowered) {
    return undefined;
  }
  return { kind: "bindingGroup", operations };
}

function lowerArrayProtocolDestructuring(
  pattern: ts.ArrayBindingPattern,
  initializer: ts.Expression,
  working: Map<string, JsIrBindingValue>,
  operations: JsIrOperation[]
): boolean {
  const unwrapped = unwrapTypeOnlyExpression(initializer);
  if (ts.isIdentifier(unwrapped) && working.get(unwrapped.text)?.kind === "array") {
    return false;
  }
  let source: Extract<JsIrOperation, { readonly kind: "arrayDestructureProtocol" }>["source"] | undefined;
  if (ts.isIdentifier(unwrapped)) {
    const binding = working.get(unwrapped.text);
    if (binding?.kind === "runtimeMap" || binding?.kind === "runtimeSet") {
      let sourceKind: "map" | "set" = "set";
      if (binding.kind === "runtimeMap") {
        sourceKind = "map";
      }
      source = {
        kind: "collection",
        name: binding.name,
        sourceKind
      };
    }
  }
  if (source === undefined) {
    const iterable = lowerValueExpression(unwrapped, working);
    if (iterable === undefined) {
      return false;
    }
    source = { kind: "value", value: iterable };
  }

  return lowerArrayProtocolDestructuringFromSource(
    pattern,
    source,
    `${iteratorErrorSubject(initializer)} is not iterable`,
    working,
    operations
  );
}

// eslint-disable-next-line max-statements -- Recursive pattern lowering validates and records elisions, defaults, rest, and nested patterns together.
function lowerArrayProtocolDestructuringFromSource(
  pattern: ts.ArrayBindingPattern,
  source: Extract<JsIrOperation, { readonly kind: "arrayDestructureProtocol" }>["source"],
  notIterableMessage: string,
  working: Map<string, JsIrBindingValue>,
  operations: JsIrOperation[]
): boolean {
  const elements: JsIrArrayDestructureElement[] = [];
  for (let index = 0; index < pattern.elements.length; index += 1) {
    const element = pattern.elements[index];
    if (ts.isOmittedExpression(element)) {
      elements.push({ kind: "elision" });
      continue;
    }
    if (element.dotDotDotToken !== undefined) {
      if (index !== pattern.elements.length - 1 || element.initializer !== undefined || !ts.isIdentifier(element.name)) {
        return false;
      }
      elements.push({ kind: "rest", name: element.name.text });
      working.set(element.name.text, { kind: "runtimeArray", name: element.name.text });
      continue;
    }
    if (ts.isIdentifier(element.name)) {
      let defaultValue: JsIrValueExpression | undefined;
      if (element.initializer !== undefined) {
        defaultValue = lowerFunctionObjectValue(element.initializer, working, element.name.text) ?? lowerValueExpression(element.initializer, working);
        if (defaultValue === undefined) {
          return false;
        }
      }
      let destructureElement: JsIrArrayDestructureElement = { kind: "binding", name: element.name.text };
      if (defaultValue !== undefined) {
        destructureElement = { kind: "binding", name: element.name.text, defaultValue };
      }
      elements.push(destructureElement);
      working.set(element.name.text, { kind: "valueVariable", name: element.name.text });
      continue;
    }
    if (element.initializer !== undefined) {
      return false;
    }
    const temporaryName = `destructure.nested.${element.pos}`;
    const nestedWorking = new Map(working);
    nestedWorking.set(temporaryName, { kind: "valueVariable", name: temporaryName });
    const nestedOperations: JsIrOperation[] = [];
    let lowered = false;
    if (ts.isArrayBindingPattern(element.name)) {
      lowered = lowerArrayProtocolDestructuringFromSource(
        element.name,
        { kind: "value", value: { kind: "variable", name: temporaryName } },
        `${temporaryName} is not iterable`,
        nestedWorking,
        nestedOperations
      );
    } else if (ts.isObjectBindingPattern(element.name)) {
      lowered = lowerObjectDestructuringElements(
        element.name,
        { name: temporaryName, binding: { kind: "valueVariable", name: temporaryName } },
        nestedWorking,
        nestedOperations,
        true
      );
    }
    if (!lowered) {
      return false;
    }
    elements.push({ kind: "nested", temporaryName, operations: nestedOperations });
    for (const [name, value] of nestedWorking) {
      working.set(name, value);
    }
  }

  const operation: JsIrOperation = { kind: "arrayDestructureProtocol", source, elements, notIterableMessage };
  operations.push(operation);
  updateBindings(operation, working);
  return true;
}

interface DestructuringSource {
  readonly name: string;
  readonly binding: JsIrBindingValue;
}

function resolveDestructuringSource(
  initializer: ts.Expression,
  working: Map<string, JsIrBindingValue>,
  operations: JsIrOperation[],
  position: number
): DestructuringSource | undefined {
  const unwrapped = unwrapTypeOnlyExpression(initializer);
  if (ts.isIdentifier(unwrapped)) {
    const binding = working.get(unwrapped.text);
    if (binding?.kind === "runtimeArray" || binding?.kind === "array" || binding?.kind === "runtimeObject") {
      return { name: binding.name, binding };
    }
    if (binding?.kind === "object") {
      return { name: unwrapped.text, binding };
    }
    return undefined;
  }
  const temporaryName = `destructure.source.${position}`;
  const operation = lowerConstAggregateBinding(temporaryName, unwrapped, working);
  if (operation === undefined) {
    return undefined;
  }
  operations.push(operation);
  updateBindings(operation, working);
  const binding = working.get(temporaryName);
  if (binding === undefined) {
    return undefined;
  }
  return { name: temporaryName, binding };
}

// eslint-disable-next-line complexity, max-statements -- Array destructuring routes fixed and runtime sources plus rest and default shapes.
function lowerArrayDestructuringElements(
  pattern: ts.ArrayBindingPattern,
  source: DestructuringSource,
  working: Map<string, JsIrBindingValue>,
  operations: JsIrOperation[],
  lazyDefaults = false
): boolean {
  const sourceBinding = source.binding;
  if (sourceBinding.kind !== "runtimeArray" && sourceBinding.kind !== "array" && sourceBinding.kind !== "valueVariable") {
    return false;
  }
  for (let index = 0; index < pattern.elements.length; index += 1) {
    const element = pattern.elements[index];
    if (ts.isOmittedExpression(element)) {
      continue;
    }
    if (!ts.isIdentifier(element.name)) {
      return false;
    }
    const name = element.name.text;
    if (element.dotDotDotToken !== undefined) {
      if (sourceBinding.kind !== "runtimeArray" || index !== pattern.elements.length - 1) {
        return false;
      }
      const operation: JsIrOperation = { kind: "runtimeArraySlice", name, arrayName: source.name, start: { kind: "literal", value: index } };
      operations.push(operation);
      updateBindings(operation, working);
      continue;
    }
    if (sourceBinding.kind === "array") {
      if (!lowerFixedArrayDestructuredElement(name, sourceBinding, index, element.initializer, working, operations)) {
        return false;
      }
      continue;
    }
    if (sourceBinding.kind === "valueVariable") {
      const access: JsIrValueExpression = {
        kind: "valueArrayAccess",
        value: { kind: "variable", name: source.name },
        index: { kind: "literal", value: index },
        key: { kind: "literal", value: String(index) }
      };
      const operation = lowerDestructuredValueBinding(name, access, element.initializer, working, lazyDefaults);
      if (operation === undefined) {
        return false;
      }
      operations.push(operation);
      updateBindings(operation, working);
      continue;
    }
    const access: JsIrValueExpression = {
      kind: "arrayAccess",
      arrayName: source.name,
      index: { kind: "literal", value: index },
      key: { kind: "literal", value: String(index) }
    };
    const operation = lowerDestructuredValueBinding(name, access, element.initializer, working, lazyDefaults);
    if (operation === undefined) {
      return false;
    }
    operations.push(operation);
    updateBindings(operation, working);
  }
  return true;
}

function lowerFixedArrayDestructuredElement(
  name: string,
  sourceBinding: Extract<JsIrBindingValue, { readonly kind: "array" }>,
  index: number,
  defaultInitializer: ts.Expression | undefined,
  working: Map<string, JsIrBindingValue>,
  operations: JsIrOperation[]
): boolean {
  const operation = lowerDestructuredFallbackOperation(
    name,
    index < sourceBinding.length,
    { kind: "constNumber", name, value: { kind: "arrayAccess", arrayName: sourceBinding.name, index: { kind: "literal", value: index } } },
    defaultInitializer,
    working
  );
  if (operation === undefined) {
    return false;
  }
  operations.push(operation);
  updateBindings(operation, working);
  return true;
}

function lowerDestructuredValueBinding(
  name: string,
  access: JsIrValueExpression,
  defaultInitializer: ts.Expression | undefined,
  working: ReadonlyMap<string, JsIrBindingValue>,
  lazyDefault = false
): JsIrOperation | undefined {
  let value: JsIrValueExpression = access;
  let defaultIsFunction = false;
  if (defaultInitializer !== undefined) {
    const defaultValue = lowerFunctionObjectValue(defaultInitializer, working, name) ?? lowerValueExpression(defaultInitializer, working);
    if (defaultValue === undefined) {
      return undefined;
    }
    defaultIsFunction = defaultValue.kind === "functionObject";
    const defaultIsCall = ts.isCallExpression(unwrapTypeOnlyExpression(defaultInitializer));
    if (lazyDefault || defaultIsFunction || defaultIsCall) {
      value = { kind: "lazyDefault", value: access, defaultValue };
    } else {
      value = {
        kind: "ternary",
        condition: { kind: "valueComparison", operator: "===", left: access, right: { kind: "undefined" } },
        consequent: defaultValue,
        alternate: access
      };
    }
  }
  if (
    lazyDefault ||
    (defaultInitializer !== undefined && ts.isCallExpression(unwrapTypeOnlyExpression(defaultInitializer))) ||
    defaultIsFunction
  ) {
    return { kind: "letValue", name, value };
  }
  return { kind: "constValue", name, value };
}

// eslint-disable-next-line complexity, max-statements -- Object destructuring routes fixed and runtime sources plus rest, rename, default, and nested shapes.
function lowerObjectDestructuringElements(
  pattern: ts.ObjectBindingPattern,
  source: DestructuringSource,
  working: Map<string, JsIrBindingValue>,
  operations: JsIrOperation[],
  lazyDefaults = false
): boolean {
  const sourceBinding = source.binding;
  if (sourceBinding.kind !== "runtimeObject" && sourceBinding.kind !== "object" && sourceBinding.kind !== "valueVariable") {
    return false;
  }
  const extractedKeys: string[] = [];
  for (const element of pattern.elements) {
    if (element.dotDotDotToken !== undefined) {
      if (sourceBinding.kind !== "runtimeObject" || !ts.isIdentifier(element.name)) {
        return false;
      }
      lowerObjectDestructuredRest(element.name.text, source.name, extractedKeys, working, operations);
      continue;
    }
    const key = destructuredPropertyKey(element);
    if (key === undefined) {
      return false;
    }
    extractedKeys.push(key);
    if (ts.isObjectBindingPattern(element.name)) {
      if (sourceBinding.kind !== "runtimeObject" || !lowerNestedObjectDestructuring(element.name, source.name, key, working, operations)) {
        return false;
      }
      continue;
    }
    if (!ts.isIdentifier(element.name)) {
      return false;
    }
    if (sourceBinding.kind === "object") {
      if (!lowerFixedObjectDestructuredElement(element.name.text, source.name, sourceBinding.value, key, element.initializer, working, operations)) {
        return false;
      }
      continue;
    }
    let access: JsIrValueExpression;
    if (sourceBinding.kind === "valueVariable") {
      access = { kind: "valueObjectDynamicAccess", value: { kind: "variable", name: source.name }, key: { kind: "literal", value: key } };
    } else {
      access = { kind: "objectDynamicAccess", objectName: source.name, key: { kind: "literal", value: key } };
    }
    const operation = lowerDestructuredValueBinding(element.name.text, access, element.initializer, working, lazyDefaults);
    if (operation === undefined) {
      return false;
    }
    operations.push(operation);
    updateBindings(operation, working);
  }
  return true;
}

function destructuredPropertyKey(element: ts.BindingElement): string | undefined {
  if (element.propertyName !== undefined) {
    if (ts.isIdentifier(element.propertyName) || ts.isStringLiteral(element.propertyName)) {
      return element.propertyName.text;
    }
    return undefined;
  }
  if (ts.isIdentifier(element.name)) {
    return element.name.text;
  }
  return undefined;
}

function lowerObjectDestructuredRest(
  name: string,
  sourceName: string,
  extractedKeys: readonly string[],
  working: Map<string, JsIrBindingValue>,
  operations: JsIrOperation[]
): void {
  const literal: JsIrOperation = { kind: "runtimeObjectLiteral", name, value: { fields: [] } };
  operations.push(literal);
  updateBindings(literal, working);
  operations.push({ kind: "runtimeObjectAssign", targetName: name, sources: [{ kind: "runtimeObject", name: sourceName }] });
  for (const key of extractedKeys) {
    operations.push({ kind: "runtimeObjectDelete", objectName: name, key: { kind: "literal", value: key } });
  }
}

function lowerFixedObjectDestructuredElement(
  name: string,
  sourceName: string,
  objectValue: JsIrObjectValue,
  key: string,
  defaultInitializer: ts.Expression | undefined,
  working: Map<string, JsIrBindingValue>,
  operations: JsIrOperation[]
): boolean {
  const operation = lowerDestructuredFallbackOperation(
    name,
    objectPathExists(objectValue, [key]),
    { kind: "constNumber", name, value: { kind: "objectAccess", objectName: sourceName, path: [key] } },
    defaultInitializer,
    working
  );
  if (operation === undefined) {
    return false;
  }
  operations.push(operation);
  updateBindings(operation, working);
  return true;
}

function lowerDestructuredFallbackOperation(
  name: string,
  hasValue: boolean,
  accessOperation: JsIrOperation,
  defaultInitializer: ts.Expression | undefined,
  working: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (hasValue) {
    return accessOperation;
  }
  if (defaultInitializer !== undefined) {
    const fallback = lowerConstVariableBinding(name, defaultInitializer, working);
    if (fallback?.kind === "constValue" && ts.isCallExpression(unwrapTypeOnlyExpression(defaultInitializer))) {
      return { kind: "letValue", name, value: fallback.value };
    }
    return fallback;
  }
  return { kind: "constValue", name, value: { kind: "undefined" } };
}

function lowerNestedObjectDestructuring(
  pattern: ts.ObjectBindingPattern,
  sourceName: string,
  parentKey: string,
  working: Map<string, JsIrBindingValue>,
  operations: JsIrOperation[]
): boolean {
  const parentAccess: JsIrValueExpression = { kind: "objectDynamicAccess", objectName: sourceName, key: { kind: "literal", value: parentKey } };
  for (const element of pattern.elements) {
    if (element.dotDotDotToken !== undefined || !ts.isIdentifier(element.name)) {
      return false;
    }
    const key = destructuredPropertyKey(element);
    if (key === undefined) {
      return false;
    }
    const access: JsIrValueExpression = { kind: "valueObjectDynamicAccess", value: parentAccess, key: { kind: "literal", value: key } };
    const operation = lowerDestructuredValueBinding(element.name.text, access, element.initializer, working);
    if (operation === undefined) {
      return false;
    }
    operations.push(operation);
    updateBindings(operation, working);
  }
  return true;
}

function isRuntimeArrayTypeHint(type: ts.TypeNode | undefined): boolean {
  if (type === undefined) {
    return false;
  }
  if (ts.isArrayTypeNode(type)) {
    return type.elementType.kind === ts.SyntaxKind.UnknownKeyword || type.elementType.kind === ts.SyntaxKind.AnyKeyword;
  }
  return type.kind === ts.SyntaxKind.AnyKeyword;
}

// A `var` redeclaration in the same scope merges with the existing binding
// (function-scoped `var` semantics): it lowers as a plain assignment to the
// existing slot instead of a fresh allocation, which also keeps the emitted
// LLVM free of duplicate allocas. A redeclaration whose initializer kind does
// not match the existing binding is rejected rather than silently re-typed.
function lowerVarRedeclaration(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  const binding = bindings.get(name);
  if (binding?.kind === "stringVariable") {
    const value = lowerStringRuntimeExpression(initializer, bindings);
    if (value === undefined) {
      return undefined;
    }
    return { kind: "assignString", name, value };
  }
  if (binding?.kind === "booleanVariable") {
    const booleanValue = lowerConditionExpression(initializer, bindings);
    if (booleanValue.kind !== "lowered") {
      return undefined;
    }
    return { kind: "assignBoolean", name, value: booleanValue.operation };
  }
  if (binding?.kind !== "number" || binding.value.kind !== "variable") {
    return undefined;
  }
  const value = lowerNumberExpression(initializer, bindings);
  if (value === undefined) {
    return undefined;
  }
  return { kind: "assignNumber", name, value };
}

function lowerLetVariableBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  const functionValue = lowerFunctionObjectValue(unwrapTypeOnlyExpression(initializer), bindings, name);
  if (functionValue !== undefined) {
    return { kind: "letValue", name, value: functionValue };
  }

  const arrayLiteral = classifyArrayLiteral(initializer, bindings);
  if (arrayLiteral?.kind === "fixed") {
    return {
      kind: "arrayLiteral",
      name,
      elements: arrayLiteral.elements
    };
  }

  if (arrayLiteral?.kind === "runtime") {
    return {
      kind: "runtimeArrayLiteral",
      name,
      elements: arrayLiteral.elements
    };
  }

  const booleanValue = lowerConditionExpression(initializer, bindings);
  if (booleanValue.kind === "lowered") {
    return {
      kind: "letBoolean",
      name,
      value: booleanValue.operation
    };
  }

  const stringValue = lowerStringRuntimeExpression(initializer, bindings);
  if (stringValue !== undefined) {
    return {
      kind: "letString",
      name,
      value: stringValue
    };
  }

  const numberValue = lowerNumberExpression(initializer, bindings);
  if (numberValue === undefined) {
    return undefined;
  }

  return {
    kind: "letNumber",
    name,
    value: numberValue
  };
}

// eslint-disable-next-line complexity, max-statements -- Const initializer dispatch walks aggregate/closure/string/number/boolean/condition/value branches in one place.
function lowerConstVariableBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  forceValue = false,
  forceRuntimeArray = false,
  forceRuntimeObject = false
): JsIrOperation | undefined {
  const unwrappedInitializer = unwrapTypeOnlyExpression(initializer);
  const aggregateValue = lowerConstAggregateBinding(name, unwrappedInitializer, bindings, forceRuntimeArray, forceRuntimeObject);
  if (aggregateValue !== undefined) {
    return aggregateValue;
  }

  const functionValue = lowerFunctionObjectValue(unwrappedInitializer, bindings, name);
  if (functionValue !== undefined) {
    return { kind: "letValue", name, value: functionValue };
  }

  if (forceValue) {
    const value = lowerValueExpression(unwrappedInitializer, bindings);
    if (value === undefined) {
      return undefined;
    }
    return { kind: "constValue", name, value };
  }

  const closureValue = lowerClosureFactoryCall(unwrappedInitializer, bindings);
  if (closureValue !== undefined) {
    return {
      kind: "constClosure",
      name,
      value: closureValue
    };
  }

  const stringValue = lowerStringExpression(unwrappedInitializer, bindings);
  if (stringValue !== undefined) {
    return {
      kind: "constString",
      name,
      value: stringValue
    };
  }

  const stringExpression = lowerStringRuntimeExpression(unwrappedInitializer, bindings);
  if (stringExpression !== undefined) {
    return {
      kind: "constStringExpression",
      name,
      value: stringExpression
    };
  }

  const numberValue = lowerNumberExpression(unwrappedInitializer, bindings);
  if (numberValue !== undefined) {
    return {
      kind: "constNumber",
      name,
      value: numberValue
    };
  }

  const booleanValue = lowerBooleanExpression(unwrappedInitializer, bindings);
  if (booleanValue !== undefined) {
    return {
      kind: "constBoolean",
      name,
      value: booleanValue
    };
  }

  const booleanCondition = lowerConditionExpression(unwrappedInitializer, bindings);
  if (booleanCondition.kind === "lowered") {
    return {
      kind: "constBooleanExpression",
      name,
      value: booleanCondition.operation
    };
  }

  const value = lowerValueExpression(unwrappedInitializer, bindings);
  if (value !== undefined) {
    // A class instance must be materialized once into a stable slot so later
    // references share object identity instead of re-running the constructor.
    if (value.kind === "newInstance" || value.kind === "functionObject" || value.kind === "call" || value.kind === "callValue" || value.kind === "regexCompile" || value.kind === "regexExec" || value.kind === "regexMatch" || value.kind === "jsonParse") {
      return { kind: "letValue", name, value };
    }
    return {
      kind: "constValue",
      name,
      value
    };
  }

  return undefined;
}

// eslint-disable-next-line complexity, max-statements -- Const aggregate binding routes the supported built-in constructors and inspectors.
function lowerConstAggregateBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  forceRuntimeArray = false,
  forceRuntimeObject = false
): JsIrOperation | undefined {
  const arrayLiteral = classifyArrayLiteral(initializer, bindings);
  if (forceRuntimeArray && arrayLiteral?.kind === "fixed") {
    return { kind: "runtimeArrayLiteral", name, elements: arrayLiteral.elements.map((value) => ({ kind: "value", value: { kind: "number", value } })) };
  }
  if (arrayLiteral?.kind === "fixed") {
    return { kind: "arrayLiteral", name, elements: arrayLiteral.elements };
  }
  if (arrayLiteral?.kind === "runtime") {
    return { kind: "runtimeArrayLiteral", name, elements: arrayLiteral.elements };
  }
  const objectLiteral = classifyObjectLiteral(initializer, bindings);
  if (forceRuntimeObject && objectLiteral?.kind === "fixed") {
    const value = fixedObjectToRuntimeObjectValue(objectLiteral.value);
    if (value === undefined) {
      return undefined;
    }
    return { kind: "runtimeObjectLiteral", name, value };
  }
  if (objectLiteral?.kind === "fixed") {
    return { kind: "objectLiteral", name, value: objectLiteral.value, needsRuntimeShadow: false };
  }
  if (objectLiteral?.kind === "runtime") {
    return { kind: "runtimeObjectLiteral", name, value: objectLiteral.value };
  }
  const errorLiteral = lowerRuntimeErrorLiteral(name, initializer, bindings);
  if (errorLiteral !== undefined) {
    return errorLiteral;
  }
  const jsonParse = lowerJsonParseBinding(name, initializer, bindings);
  if (jsonParse !== undefined) {
    return jsonParse;
  }
  const objectCreate = lowerRuntimeObjectCreateBinding(name, initializer, bindings);
  if (objectCreate !== undefined) {
    return objectCreate;
  }
  const objectKeys = lowerRuntimeObjectKeysBinding(name, initializer, bindings);
  if (objectKeys !== undefined) {
    return objectKeys;
  }
  const objectValues = lowerRuntimeObjectValuesBinding(name, initializer, bindings);
  if (objectValues !== undefined) {
    return objectValues;
  }
  const runtimeExpansion = lowerRuntimeAggregateExpansionBinding(name, initializer, bindings);
  if (runtimeExpansion !== undefined) {
    return runtimeExpansion;
  }
  const descriptor = lowerRuntimeObjectOwnPropertyDescriptorBinding(name, initializer, bindings);
  if (descriptor !== undefined) {
    return descriptor;
  }
  const propertyNames = lowerRuntimeObjectOwnPropertyNamesBinding(name, initializer, bindings);
  if (propertyNames !== undefined) {
    return propertyNames;
  }
  const descriptors = lowerRuntimeObjectOwnPropertyDescriptorsBinding(name, initializer, bindings);
  if (descriptors !== undefined) {
    return descriptors;
  }
  const objectPrototype = lowerRuntimeObjectGetPrototypeBinding(name, initializer, bindings);
  if (objectPrototype !== undefined) {
    return objectPrototype;
  }
  const collection = lowerRuntimeCollectionBinding(name, initializer, bindings);
  if (collection !== undefined) {
    return collection;
  }
  const iterator = lowerRuntimeIteratorBinding(name, initializer, bindings);
  if (iterator !== undefined) {
    return iterator;
  }
  return undefined;
}

function lowerRuntimeIteratorBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  const defaultIterator = lowerRuntimeCollectionDefaultIteratorBinding(name, initializer, bindings);
  if (defaultIterator !== undefined) {
    return defaultIterator;
  }
  if (!ts.isCallExpression(initializer) || initializer.arguments.length > 0 || !ts.isPropertyAccessExpression(initializer.expression) || !ts.isIdentifier(initializer.expression.expression)) {
    return undefined;
  }
  const receiver = initializer.expression.expression.text;
  const binding = bindings.get(receiver);
  const method = initializer.expression.name.text;
  if (method !== "keys" && method !== "values" && method !== "entries") {
    return undefined;
  }
  if (binding?.kind === "runtimeMap") {
    return { kind: "runtimeIteratorNew", name, collectionName: binding.name, sourceKind: "map", iterationKind: method };
  }
  if (binding?.kind === "runtimeSet") {
    return { kind: "runtimeIteratorNew", name, collectionName: binding.name, sourceKind: "set", iterationKind: method };
  }
  return undefined;
}

function lowerRuntimeCollectionDefaultIteratorBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (
    ts.isCallExpression(initializer) &&
    initializer.arguments.length === 0 &&
    ts.isElementAccessExpression(initializer.expression) &&
    ts.isIdentifier(initializer.expression.expression) &&
    lowerSymbolIteratorKeyExpression(initializer.expression.argumentExpression, bindings) !== undefined
  ) {
    const receiver = initializer.expression.expression.text;
    const binding = bindings.get(receiver);
    if (binding?.kind === "runtimeMap") {
      return { kind: "runtimeIteratorNew", name, collectionName: binding.name, sourceKind: "map", iterationKind: "entries", observeOverride: true };
    }
    if (binding?.kind === "runtimeSet") {
      return { kind: "runtimeIteratorNew", name, collectionName: binding.name, sourceKind: "set", iterationKind: "values", observeOverride: true };
    }
  }
  return undefined;
}

function lowerRuntimeCollectionBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  const constructed = lowerRuntimeCollectionConstructorBinding(name, initializer, bindings);
  if (constructed !== undefined) {
    return constructed;
  }
  if (!ts.isCallExpression(initializer) || !ts.isPropertyAccessExpression(initializer.expression) || !ts.isIdentifier(initializer.expression.expression)) {
    return undefined;
  }
  const receiver = initializer.expression.expression.text;
  const binding = bindings.get(receiver);
  const method = initializer.expression.name.text;
  if (binding?.kind === "runtimeMap" && method === "set" && initializer.arguments.length === 2) {
    const key = lowerValueExpression(initializer.arguments[0], bindings);
    const value = lowerValueExpression(initializer.arguments[1], bindings);
    if (key !== undefined && value !== undefined) {
      return { kind: "runtimeMapSetResult", name, mapName: binding.name, key, value };
    }
  }
  if (binding?.kind === "runtimeSet" && method === "add" && initializer.arguments.length === 1) {
    const value = lowerValueExpression(initializer.arguments[0], bindings);
    if (value !== undefined) {
      return { kind: "runtimeSetAddResult", name, setName: binding.name, value };
    }
  }
  return undefined;
}

function lowerRuntimeCollectionConstructorBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isNewExpression(initializer) || !ts.isIdentifier(initializer.expression)) {
    return undefined;
  }
  const argumentCount = initializer.arguments?.length ?? 0;
  if (argumentCount === 0 && initializer.expression.text === "Map" && !bindings.has("Map")) {
    return { kind: "runtimeMapNew", name };
  }
  if (argumentCount === 0 && initializer.expression.text === "Set" && !bindings.has("Set")) {
    return { kind: "runtimeSetNew", name };
  }
  if (argumentCount !== 1 || initializer.arguments === undefined) {
    return undefined;
  }
  const [sourceExpression] = initializer.arguments;
  const isMap = initializer.expression.text === "Map" && !bindings.has("Map");
  const isSet = initializer.expression.text === "Set" && !bindings.has("Set");
  if (!isMap && !isSet) {
    return undefined;
  }
  const fromCollection = lowerRuntimeCollectionCopyConstructor(name, sourceExpression, isMap, bindings);
  if (fromCollection !== undefined) {
    return fromCollection;
  }
  const iterable = lowerValueExpression(sourceExpression, bindings);
  if (iterable === undefined) {
    return undefined;
  }
  const notIterableMessage = `${iteratorErrorSubject(sourceExpression)} is not iterable`;
  if (isMap) {
    return { kind: "runtimeMapFromIterable", name, iterable, notIterableMessage };
  }
  return { kind: "runtimeSetFromIterable", name, iterable, notIterableMessage };
}

// Collection-to-collection copy keeps a specialized path that does not require
// Map/Set values to be boxed as JSValues.
function lowerRuntimeCollectionCopyConstructor(
  name: string,
  sourceExpression: ts.Expression,
  isMap: boolean,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isIdentifier(sourceExpression)) {
    return undefined;
  }
  const source = bindings.get(sourceExpression.text);
  if (source?.kind === "runtimeMap") {
    if (isMap) {
      return { kind: "runtimeMapFromCollection", name, sourceName: source.name, sourceKind: "map" };
    }
    return { kind: "runtimeSetFromCollection", name, sourceName: source.name, sourceKind: "map" };
  }
  if (source?.kind === "runtimeSet") {
    if (isMap) {
      return { kind: "runtimeMapFromCollection", name, sourceName: source.name, sourceKind: "set" };
    }
    return { kind: "runtimeSetFromCollection", name, sourceName: source.name, sourceKind: "set" };
  }
  return undefined;
}

function lowerJsonParseBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isCallExpression(initializer) || initializer.arguments.length !== 1) {
    return undefined;
  }
  const callee = initializer.expression;
  if (!ts.isPropertyAccessExpression(callee) || !ts.isIdentifier(callee.expression)) {
    return undefined;
  }
  if (callee.expression.text !== "JSON" || callee.name.text !== "parse" || bindings.has("JSON")) {
    return undefined;
  }
  const text = lowerStringExpression(initializer.arguments[0], bindings);
  if (text === undefined) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      kind: "bindingGroup",
      operations: [
        { kind: "throwValue", value: { kind: "string", value: { kind: "literal", value: "SyntaxError: Unexpected token in JSON" } } },
        { kind: "constValue", name, value: { kind: "undefined" } }
      ]
    };
  }
  const operations: JsIrOperation[] = [];
  lowerParsedJsonBinding(name, parsed, operations);
  return { kind: "bindingGroup", operations };
}

function lowerParsedJsonBinding(name: string, parsed: unknown, operations: JsIrOperation[]): void {
  if (Array.isArray(parsed)) {
    const elements: JsIrRuntimeArrayElement[] = parsed.map((element, index) => ({
      kind: "value",
      value: lowerParsedJsonValueExpression(`${name}.json${index}`, element, operations)
    }));
    operations.push({ kind: "runtimeArrayLiteral", name, elements });
    return;
  }
  if (typeof parsed === "object" && parsed !== null) {
    const fields: JsIrRuntimeObjectField[] = Object.entries(parsed).map(([key, value], index) => ({
      kind: "field",
      key: { kind: "literal", value: key },
      value: lowerParsedJsonValueExpression(`${name}.json${index}`, value, operations)
    }));
    operations.push({ kind: "runtimeObjectLiteral", name, value: { fields } });
    return;
  }
  operations.push({ kind: "constValue", name, value: lowerParsedJsonPrimitive(parsed) });
}

function lowerParsedJsonValueExpression(temporaryName: string, value: unknown, operations: JsIrOperation[]): JsIrValueExpression {
  if (Array.isArray(value)) {
    lowerParsedJsonBinding(temporaryName, value, operations);
    return { kind: "arrayRef", name: temporaryName };
  }
  if (typeof value === "object" && value !== null) {
    lowerParsedJsonBinding(temporaryName, value, operations);
    return { kind: "objectRef", name: temporaryName };
  }
  return lowerParsedJsonPrimitive(value);
}

function lowerParsedJsonPrimitive(value: unknown): JsIrValueExpression {
  if (value === null) {
    return { kind: "null" };
  }
  if (typeof value === "string") {
    return { kind: "string", value: { kind: "literal", value } };
  }
  if (typeof value === "boolean") {
    return { kind: "boolean", value: { kind: "boolean", value } };
  }
  if (typeof value === "number") {
    return { kind: "number", value: numberExpressionFromNumber(value) };
  }
  throw new Error("Unsupported JSON.parse primitive value");
}

// eslint-disable-next-line max-statements -- Runtime aggregate built-in routing is centralized during roadmap expansion.
function lowerRuntimeAggregateExpansionBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  const objectEntries = lowerRuntimeObjectEntriesBinding(name, initializer, bindings);
  if (objectEntries !== undefined) {
    return objectEntries;
  }
  const fromEntries = lowerRuntimeObjectFromEntriesBinding(name, initializer, bindings);
  if (fromEntries !== undefined) {
    return fromEntries;
  }
  const slice = lowerRuntimeArraySliceBinding(name, initializer, bindings);
  if (slice !== undefined) {
    return slice;
  }
  const concat = lowerRuntimeArrayConcatBinding(name, initializer, bindings);
  if (concat !== undefined) {
    return concat;
  }
  const splice = lowerRuntimeArraySpliceBinding(name, initializer, bindings);
  if (splice !== undefined) {
    return splice;
  }
  const flat = lowerRuntimeArrayFlatBinding(name, initializer, bindings);
  if (flat !== undefined) {
    return flat;
  }
  const arrayStatic = lowerRuntimeArrayStaticBinding(name, initializer, bindings);
  if (arrayStatic !== undefined) {
    return arrayStatic;
  }
  const split = lowerRuntimeStringSplitBinding(name, initializer, bindings);
  if (split !== undefined) {
    return split;
  }
  const callback = lowerRuntimeArrayCallbackBinding(name, initializer, bindings);
  if (callback !== undefined) {
    return callback;
  }
  const mutator = lowerRuntimeArrayMutatorResultBinding(name, initializer, bindings);
  if (mutator !== undefined) {
    return mutator;
  }
  const sort = lowerRuntimeArraySortBinding(name, initializer, bindings);
  if (sort !== undefined) {
    return sort;
  }
  return undefined;
}

// eslint-disable-next-line complexity, max-statements -- Array static routing distinguishes value, aggregate, and collection source representations.
function lowerRuntimeArrayStaticBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isCallExpression(initializer) || !ts.isPropertyAccessExpression(initializer.expression) || !ts.isIdentifier(initializer.expression.expression) || initializer.expression.expression.text !== "Array") {
    return undefined;
  }
  const method = initializer.expression.name.text;
  if (method === "of") {
    const elements: JsIrRuntimeArrayElement[] = [];
    for (const argument of initializer.arguments) {
      const value = lowerValueExpression(argument, bindings);
      if (value === undefined) {
        return undefined;
      }
      elements.push({ kind: "value", value });
    }
    return { kind: "runtimeArrayLiteral", name, elements };
  }
  if (method !== "from" || initializer.arguments.length === 0 || initializer.arguments.length > arrayFromArgumentCount) {
    return undefined;
  }
  const [sourceExpression] = initializer.arguments;
  const callbacks = lowerArrayFromCallbacks(initializer.arguments, bindings);
  if (callbacks === undefined) {
    return undefined;
  }
  const { mapper, thisArg } = callbacks;
  // Prefer the protocol path for every supported value so Symbol.iterator overrides
  // are observed before any array-like fallback inside the runtime helper.
  const source = lowerValueExpression(sourceExpression, bindings);
  if (source !== undefined) {
    return { kind: "runtimeArrayFromValue", name, source, mapper, thisArg };
  }
  if (!ts.isIdentifier(sourceExpression)) {
    return undefined;
  }
  const targetName = sourceExpression.text;
  const target = bindings.get(targetName);
  if (target?.kind === "runtimeArray") {
    return { kind: "runtimeArrayFrom", name, targetName, targetKind: "array" };
  }
  if (target?.kind === "runtimeObject") {
    return { kind: "runtimeArrayFrom", name, targetName, targetKind: "object" };
  }
  if (target?.kind === "runtimeMap") {
    return { kind: "runtimeArrayFromCollection", name, collectionName: target.name, sourceKind: "map", iterationKind: "entries", mapper, thisArg };
  }
  if (target?.kind === "runtimeSet") {
    return { kind: "runtimeArrayFromCollection", name, collectionName: target.name, sourceKind: "set", iterationKind: "values", mapper, thisArg };
  }
  return undefined;
}

function lowerArrayFromCallbacks(
  arguments_: ts.NodeArray<ts.Expression>,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): { readonly mapper?: JsIrValueExpression; readonly thisArg?: JsIrValueExpression } | undefined {
  const mapperExpression = arguments_.at(1);
  const thisArgExpression = arguments_.at(2);
  let mapper: JsIrValueExpression | undefined;
  if (mapperExpression !== undefined) {
    mapper = lowerValueExpression(mapperExpression, bindings);
  }
  if (mapperExpression !== undefined && mapper === undefined) {
    return undefined;
  }
  let thisArg: JsIrValueExpression | undefined;
  if (thisArgExpression !== undefined) {
    thisArg = lowerValueExpression(thisArgExpression, bindings);
  }
  if (thisArgExpression !== undefined && thisArg === undefined) {
    return undefined;
  }
  return { mapper, thisArg };
}

function lowerRuntimeArraySortBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isCallExpression(initializer) || !ts.isPropertyAccessExpression(initializer.expression) || !ts.isIdentifier(initializer.expression.expression)) {
    return undefined;
  }
  const arrayName = initializer.expression.expression.text;
  if (initializer.expression.name.text !== "sort" || bindings.get(arrayName)?.kind !== "runtimeArray" || initializer.arguments.length > 1) {
    return undefined;
  }
  if (initializer.arguments.length === 0) {
    return { kind: "runtimeArraySort", name, arrayName };
  }
  const [callback] = initializer.arguments;
  if (!ts.isIdentifier(callback)) {
    return undefined;
  }
  const callbackBinding = lowerArrayCallbackBinding(callback.text, bindings, sortCallbackArgumentCount);
  if (callbackBinding === undefined || callbackBinding.returnKind === "void") {
    return undefined;
  }
  return { kind: "runtimeArraySort", name, arrayName, callbackName: callback.text, callbackParameters: callbackBinding.parameters, callbackReturnKind: callbackBinding.returnKind };
}

function lowerRuntimeStringSplitBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isCallExpression(initializer) || !ts.isPropertyAccessExpression(initializer.expression) || initializer.expression.name.text !== "split") {
    return undefined;
  }
  if (initializer.arguments.length !== 1 && initializer.arguments.length !== 2) {
    return undefined;
  }
  const receiver = lowerStringRuntimeExpression(initializer.expression.expression, bindings);
  if (receiver !== undefined && isRegexExpression(initializer.arguments[0], bindings)) {
    const regex = lowerValueExpression(initializer.arguments[0], bindings);
    if (regex === undefined) {
      return undefined;
    }
    let limit: JsIrNumberExpression | undefined;
    if (initializer.arguments.length === 2) {
      limit = lowerNumberExpression(initializer.arguments[1], bindings);
      if (limit === undefined) {
        return undefined;
      }
    }
    if (limit === undefined) {
      return { kind: "runtimeRegexSplit", name, receiver, regex };
    }
    return { kind: "runtimeRegexSplit", name, receiver, regex, limit };
  }
  const separator = lowerStringRuntimeExpression(initializer.arguments[0], bindings);
  if (receiver === undefined || separator === undefined) {
    return undefined;
  }
  let limit: JsIrNumberExpression | undefined;
  if (initializer.arguments.length === 2) {
    limit = lowerNumberExpression(initializer.arguments[1], bindings);
    if (limit === undefined) {
      return undefined;
    }
  }
  return { kind: "runtimeStringSplit", name, receiver, separator, limit };
}

// eslint-disable-next-line complexity, max-statements -- Runtime array callback routing keeps method-specific validation in one place.
function lowerRuntimeArrayCallbackBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isCallExpression(initializer) || !ts.isPropertyAccessExpression(initializer.expression) || !ts.isIdentifier(initializer.expression.expression)) {
    return undefined;
  }
  const arrayName = initializer.expression.expression.text;
  if (bindings.get(arrayName)?.kind !== "runtimeArray") {
    return undefined;
  }
  const method = initializer.expression.name.text;
  if (method === "reduce" || method === "reduceRight") {
    let direction: "left" | "right" = "left";
    if (method === "reduceRight") {
      direction = "right";
    }
    return lowerRuntimeArrayReduceCallbackBinding(name, arrayName, initializer.arguments, bindings, direction);
  }
  if (method !== "map" && method !== "flatMap" && method !== "filter" && method !== "find" && method !== "findIndex") {
    return undefined;
  }
  if (initializer.arguments.length !== 1 && initializer.arguments.length !== 2) {
    return undefined;
  }
  const [callback] = initializer.arguments;
  const inlineCallback = lowerInlineArrayCallbackFunctionObject(name, arrayName, callback, initializer.arguments[1], bindings, arrayCallbackArgumentCount, method);
  if (inlineCallback !== undefined) {
    return inlineCallback;
  }
  if (initializer.arguments.length !== 1) {
    return undefined;
  }
  if (!ts.isIdentifier(callback)) {
    return undefined;
  }
  const callbackBinding = lowerArrayCallbackBinding(callback.text, bindings, arrayCallbackArgumentCount);
  if (callbackBinding === undefined || callbackBinding.returnKind === "void") {
    return undefined;
  }
  if (method === "map") {
    return { kind: "runtimeArrayMapCallback", name, arrayName, callbackName: callback.text, callbackParameters: callbackBinding.parameters, callbackReturnKind: callbackBinding.returnKind };
  }
  if (method === "flatMap") {
    return { kind: "runtimeArrayFlatMapCallback", name, arrayName, callbackName: callback.text, callbackParameters: callbackBinding.parameters, callbackReturnKind: callbackBinding.returnKind };
  }
  if (method === "filter") {
    return { kind: "runtimeArrayFilterCallback", name, arrayName, callbackName: callback.text, callbackParameters: callbackBinding.parameters, callbackReturnKind: callbackBinding.returnKind };
  }
  if (method === "find") {
    return { kind: "runtimeArrayFindCallback", name, arrayName, callbackName: callback.text, callbackParameters: callbackBinding.parameters, callbackReturnKind: callbackBinding.returnKind };
  }
  return { kind: "runtimeArrayFindIndexCallback", name, arrayName, callbackName: callback.text, callbackParameters: callbackBinding.parameters, callbackReturnKind: callbackBinding.returnKind };
}

function lowerRuntimeArrayReduceCallbackBinding(
  name: string,
  arrayName: string,
  args: ts.NodeArray<ts.Expression>,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  direction: "left" | "right"
): JsIrOperation | undefined {
  if (args.length !== 1 && args.length !== 2) {
    return undefined;
  }
  const [callback] = args;
  let method: "reduce" | "reduceRight" = "reduce";
  if (direction === "right") {
    method = "reduceRight";
  }
  const inlineCallback = lowerInlineArrayCallbackFunctionObject(name, arrayName, callback, undefined, bindings, reduceCallbackArgumentCount, method);
  if (inlineCallback !== undefined) {
    if (args.length === 1) {
      return inlineCallback;
    }
    const initialValue = lowerValueExpression(args[1], bindings);
    if (initialValue === undefined) {
      return undefined;
    }
    return { ...inlineCallback, initialValue, direction };
  }
  if (!ts.isIdentifier(callback)) {
    return undefined;
  }
  const callbackBinding = lowerArrayCallbackBinding(callback.text, bindings, reduceCallbackArgumentCount);
  if (callbackBinding === undefined || callbackBinding.returnKind === "void") {
    return undefined;
  }
  let initialValue: JsIrValueExpression | undefined;
  if (args.length === 2) {
    initialValue = lowerValueExpression(args[1], bindings);
    if (initialValue === undefined) {
      return undefined;
    }
  }
  return { kind: "runtimeArrayReduceCallback", name, arrayName, callbackName: callback.text, callbackParameters: callbackBinding.parameters, callbackReturnKind: callbackBinding.returnKind, initialValue, direction };
}

function lowerRuntimeArrayForEachCallbackStatement(
  arrayName: string,
  args: ts.NodeArray<ts.Expression>,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (args.length !== 1 && args.length !== 2) {
    return undefined;
  }
  const [callback] = args;
  const inlineCallback = lowerInlineArrayCallbackFunctionObject("__tscn_each", arrayName, callback, args[1], bindings, arrayCallbackArgumentCount, "forEach");
  if (inlineCallback !== undefined) {
    return inlineCallback;
  }
  if (args.length !== 1) {
    return undefined;
  }
  if (!ts.isIdentifier(callback)) {
    return undefined;
  }
  const callbackBinding = lowerArrayCallbackBinding(callback.text, bindings, arrayCallbackArgumentCount);
  if (callbackBinding === undefined) {
    return undefined;
  }
  return { kind: "runtimeArrayForEachCallback", arrayName, callbackName: callback.text, callbackParameters: callbackBinding.parameters, callbackReturnKind: callbackBinding.returnKind };
}

function lowerArrayCallbackBinding(
  callbackName: string,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  maxParameters: number
): Extract<JsIrBindingValue, { readonly kind: "function" }> | undefined {
  const callbackBinding = bindings.get(callbackName);
  if (callbackBinding?.kind !== "function" || callbackBinding.parameters.length > maxParameters || callbackBinding.parameters.some((parameter) => parameter.valueKind === "string")) {
    return undefined;
  }
  if (callbackBinding.parameters.some((parameter, index) => index >= 2 && parameter.valueKind !== "value")) {
    return undefined;
  }
  return callbackBinding;
}

// eslint-disable-next-line complexity, max-statements -- Callback lowering validates syntax, parameters, receiver semantics, and the body as one atomic operation.
function lowerInlineArrayCallbackFunctionObject(
  name: string,
  arrayName: string,
  callback: ts.Expression,
  thisArgExpression: ts.Expression | undefined,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  maxParameters: number,
  method: "map" | "flatMap" | "filter" | "find" | "findIndex" | "reduce" | "reduceRight" | "forEach"
): Extract<JsIrOperation, { readonly kind: "runtimeArrayMapFunctionObject" }> | undefined {
  if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) {
    return lowerArrayCallbackValueWrapper(name, arrayName, callback, thisArgExpression, bindings, maxParameters, method);
  }
  if ((ts.isFunctionExpression(callback) && callback.asteriskToken !== undefined) || callback.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) === true) {
    return undefined;
  }
  let callbackKind: "arrow" | "ordinary" = "ordinary";
  if (ts.isArrowFunction(callback)) {
    callbackKind = "arrow";
  }
  const declaredParameters = [...callback.parameters];
  const firstParameter = declaredParameters.at(0);
  if (callbackKind === "ordinary" && firstParameter !== undefined && ts.isIdentifier(firstParameter.name) && firstParameter.name.text === CLASS_THIS_NAME) {
    declaredParameters.shift();
  }
  const captures: { name: string; valueKind: JsIrValueKind; value: JsIrValueExpression }[] = [];
  if (callbackKind === "arrow" && containsLexicalThis(callback.body)) {
    const thisBinding = bindings.get(CLASS_THIS_NAME);
    if (thisBinding?.kind !== "valueVariable") {
      return undefined;
    }
    captures.push({ name: CLASS_THIS_NAME, valueKind: "value", value: { kind: "variable", name: thisBinding.name } });
  }
  if (declaredParameters.length > maxParameters) {
    return undefined;
  }
  const parameters: JsIrFunctionParameter[] = [];
  const callbackBindings = functionFrameBindings(bindings);
  if (callbackKind === "ordinary") {
    callbackBindings.set(CLASS_THIS_NAME, { kind: "valueVariable", name: CLASS_THIS_NAME });
  }
  for (const parameter of declaredParameters) {
    if (!ts.isIdentifier(parameter.name) || parameter.initializer !== undefined || parameter.dotDotDotToken !== undefined) {
      return undefined;
    }
    parameters.push({ name: parameter.name.text, valueKind: "value" });
    callbackBindings.set(parameter.name.text, { kind: "valueVariable", name: parameter.name.text });
  }
  const body = lowerInlineFunctionBody(callback.body, callbackBindings);
  if (body === undefined) {
    return undefined;
  }
  const returnKind = functionReturnKind(body);
  if (returnKind === "void" && method !== "forEach") {
    return undefined;
  }
  let thisArg: JsIrValueExpression | undefined;
  if (thisArgExpression !== undefined) {
    thisArg = lowerValueExpression(thisArgExpression, bindings);
    if (thisArg === undefined) {
      return undefined;
    }
  }
  const callbackName = `__tscn_fnobj_${name}_${nextFunctionObjectId}`.replace(/[^A-Za-z0-9_]/g, "_");
  nextFunctionObjectId += 1;
  let direction: "left" | "right" = "left";
  if (method === "reduceRight") {
    direction = "right";
  }
  return { kind: "runtimeArrayMapFunctionObject", method, name, arrayName, callbackName, callbackParameters: parameters, callbackReturnKind: returnKind, callbackBody: body, callbackKind, direction, thisArg, captures };
}

function lowerArrayCallbackValueWrapper(
  name: string,
  arrayName: string,
  callback: ts.Expression,
  thisArgExpression: ts.Expression | undefined,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  maxParameters: number,
  method: "map" | "flatMap" | "filter" | "find" | "findIndex" | "reduce" | "reduceRight" | "forEach"
): Extract<JsIrOperation, { readonly kind: "runtimeArrayMapFunctionObject" }> | undefined {
  const callbackValue = lowerValueExpression(callback, bindings);
  if (callbackValue === undefined) {
    return undefined;
  }
  let thisValue: JsIrValueExpression = { kind: "undefined" };
  if (thisArgExpression !== undefined) {
    const loweredThis = lowerValueExpression(thisArgExpression, bindings);
    if (loweredThis === undefined) {
      return undefined;
    }
    thisValue = loweredThis;
  }
  const id = nextFunctionObjectId;
  nextFunctionObjectId += 1;
  const callbackName = `__tscn_fnobj_${name}_${id}`.replace(/[^A-Za-z0-9_]/g, "_");
  const callbackCaptureName = `__callback_${id}`;
  const thisCaptureName = `__callback_this_${id}`;
  const parameters = Array.from({ length: maxParameters }, (_, index) => ({ name: `__callback_arg_${id}_${index}`, valueKind: "value" as const }));
  const callArguments = parameters.map((parameter) => ({ valueKind: "value" as const, value: { kind: "variable" as const, name: parameter.name } }));
  const body: JsIrOperation[] = [{
    kind: "returnValue",
    expression: {
      kind: "callValue",
      callee: { kind: "variable", name: callbackCaptureName },
      arguments: callArguments,
      thisValue: { kind: "variable", name: thisCaptureName }
    }
  }];
  return {
    kind: "runtimeArrayMapFunctionObject",
    method,
    name,
    arrayName,
    callbackName,
    callbackParameters: parameters,
    callbackReturnKind: "value",
    callbackBody: body,
    callbackKind: "arrow",
    direction: arrayCallbackDirection(method),
    captures: [
      { name: callbackCaptureName, valueKind: "value", value: callbackValue },
      { name: thisCaptureName, valueKind: "value", value: thisValue }
    ]
  };
}

function arrayCallbackDirection(method: "map" | "flatMap" | "filter" | "find" | "findIndex" | "reduce" | "reduceRight" | "forEach"): "left" | "right" {
  if (method === "reduceRight") {
    return "right";
  }
  return "left";
}

function lowerInlineFunctionBody(
  body: ts.ConciseBody,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): readonly JsIrOperation[] | undefined {
  if (ts.isBlock(body)) {
    return bodyOperations(lowerBlockStatements(body, bindings));
  }
  const expression = lowerValueExpression(body, bindings);
  if (expression === undefined) {
    return undefined;
  }
  return [{ kind: "returnValue", expression }];
}

function lowerRuntimeArrayMutatorResultBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isCallExpression(initializer) || !ts.isPropertyAccessExpression(initializer.expression) || !ts.isIdentifier(initializer.expression.expression)) {
    return undefined;
  }
  const arrayName = initializer.expression.expression.text;
  if (bindings.get(arrayName)?.kind !== "runtimeArray") {
    return undefined;
  }
  const method = initializer.expression.name.text;
  if (method === "reverse") {
    return { kind: "runtimeArrayMutatorResult", name, arrayName, mutation: { kind: "reverse" } };
  }
  if (method === "fill") {
    const fill = lowerRuntimeArrayFillCallStatement(arrayName, method, initializer.arguments, bindings);
    if (fill?.kind === "runtimeArrayFill") {
      return { kind: "runtimeArrayMutatorResult", name, arrayName, mutation: { kind: "fill", value: fill.value, start: fill.start, end: fill.end } };
    }
  }
  if (method === "copyWithin" && (initializer.arguments.length === 2 || initializer.arguments.length === arrayCopyWithinArgumentCount)) {
    const target = lowerNumberExpression(initializer.arguments[0], bindings);
    const start = lowerNumberExpression(initializer.arguments[1], bindings);
    let end: JsIrNumberExpression | undefined;
    if (initializer.arguments.length === arrayCopyWithinArgumentCount) {
      end = lowerNumberExpression(initializer.arguments[2], bindings);
    }
    if (target !== undefined && start !== undefined && (initializer.arguments.length === 2 || end !== undefined)) {
      return { kind: "runtimeArrayMutatorResult", name, arrayName, mutation: { kind: "copyWithin", target, start, end } };
    }
  }
  return undefined;
}
























































// eslint-disable-next-line complexity, max-statements -- Descriptor lowering handles object, array, and boxed aggregate receiver shapes.
function lowerRuntimeObjectOwnPropertyDescriptorBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isCallExpression(initializer) || initializer.arguments.length !== 2) {
    return undefined;
  }
  const callee = initializer.expression;
  if (!ts.isPropertyAccessExpression(callee) || !ts.isIdentifier(callee.expression) || callee.expression.text !== "Object" || callee.name.text !== "getOwnPropertyDescriptor") {
    return undefined;
  }
  const [target, keyExpression] = initializer.arguments;
  if (!ts.isIdentifier(target)) {
    return undefined;
  }
  const binding = bindings.get(target.text);
  if (binding?.kind === "runtimeObject" || (binding?.kind === "object" && !objectHasNestedFields(binding.value))) {
    const key = lowerPropertyKeyExpression(keyExpression, bindings);
    if (key !== undefined) {
      return { kind: "runtimeObjectOwnPropertyDescriptor", name, targetName: target.text, targetKind: "object", key };
    }
  }
  if (binding?.kind === "runtimeArray") {
    if (ts.isStringLiteral(keyExpression) && keyExpression.text === "length") {
      return { kind: "runtimeObjectOwnPropertyDescriptor", name, targetName: target.text, targetKind: "array", key: { kind: "literal", value: "length" }, isLength: true };
    }
    const key = lowerPropertyKeyExpression(keyExpression, bindings);
    if (key === undefined) {
      return undefined;
    }
    let index = lowerNumberExpression(keyExpression, bindings);
    const stringIndex = lowerCanonicalArrayIndexString(keyExpression);
    if (stringIndex !== undefined) {
      index = { kind: "literal", value: stringIndex };
    }
    index ??= { kind: "literal", value: -1 };
    return { kind: "runtimeObjectOwnPropertyDescriptor", name, targetName: target.text, targetKind: "array", key, index };
  }
  if (isBoxedAggregateCandidateBinding(binding)) {
    const key = lowerPropertyKeyExpression(keyExpression, bindings);
    if (key === undefined) {
      return undefined;
    }
    if (ts.isStringLiteral(keyExpression) && keyExpression.text === "length") {
      return { kind: "runtimeObjectOwnPropertyDescriptor", name, targetName: target.text, targetKind: "value", key, isLength: true };
    }
    let index = lowerNumberExpression(keyExpression, bindings);
    const stringIndex = lowerCanonicalArrayIndexString(keyExpression);
    if (stringIndex !== undefined) {
      index = { kind: "literal", value: stringIndex };
    }
    return { kind: "runtimeObjectOwnPropertyDescriptor", name, targetName: target.text, targetKind: "value", key, index };
  }
  return undefined;
}

























function lowerRuntimeArraySliceBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isCallExpression(initializer) || !ts.isPropertyAccessExpression(initializer.expression) || !ts.isIdentifier(initializer.expression.expression)) {
    return undefined;
  }
  const arrayName = initializer.expression.expression.text;
  if (initializer.expression.name.text !== "slice" || bindings.get(arrayName)?.kind !== "runtimeArray") {
    return undefined;
  }
  if (initializer.arguments.length > 2) {
    return undefined;
  }
  let start: JsIrNumberExpression | undefined = { kind: "literal", value: 0 };
  if (initializer.arguments.length > 0) {
    start = lowerNumberExpression(initializer.arguments[0], bindings);
  }
  let end: JsIrNumberExpression | undefined;
  if (initializer.arguments.length === 2) {
    end = lowerNumberExpression(initializer.arguments[1], bindings);
  }
  if (start === undefined || (initializer.arguments.length === 2 && end === undefined)) {
    return undefined;
  }
  return { kind: "runtimeArraySlice", name, arrayName, start, end };
}

function lowerRuntimeArrayConcatBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isCallExpression(initializer) || !ts.isPropertyAccessExpression(initializer.expression) || !ts.isIdentifier(initializer.expression.expression)) {
    return undefined;
  }
  const leftName = initializer.expression.expression.text;
  if (initializer.expression.name.text !== "concat" || bindings.get(leftName)?.kind !== "runtimeArray" || initializer.arguments.length === 0) {
    return undefined;
  }
  const values: JsIrRuntimeArrayConcatElement[] = [];
  for (const argument of initializer.arguments) {
    if (ts.isIdentifier(argument)) {
      const binding = bindings.get(argument.text);
      if (binding?.kind === "array") {
        values.push({ kind: "fixedArraySpread", arrayName: argument.text, length: binding.length });
        continue;
      }
    }
    if (ts.isArrayLiteralExpression(argument)) {
      const elements = lowerArrayLiteralExpression(argument, bindings);
      if (elements === undefined) {
        return undefined;
      }
      for (const element of elements) {
        values.push({ kind: "value", value: { kind: "number", value: element } });
      }
      continue;
    }
    const value = lowerValueExpression(argument, bindings);
    if (value === undefined) {
      return undefined;
    }
    values.push({ kind: "value", value });
  }
  return { kind: "runtimeArrayConcat", name, leftName, values };
}

function lowerRuntimeArraySpliceBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isCallExpression(initializer) || !ts.isPropertyAccessExpression(initializer.expression) || !ts.isIdentifier(initializer.expression.expression)) {
    return undefined;
  }
  const arrayName = initializer.expression.expression.text;
  if (initializer.expression.name.text !== "splice" || bindings.get(arrayName)?.kind !== "runtimeArray") {
    return undefined;
  }
  if (initializer.arguments.length === 0) {
    return undefined;
  }
  const start = lowerNumberExpression(initializer.arguments[0], bindings);
  if (start === undefined) {
    return undefined;
  }
  let deleteCount: JsIrNumberExpression | undefined;
  const items: JsIrValueExpression[] = [];
  for (let index = 1; index < initializer.arguments.length; index += 1) {
    const argument = initializer.arguments[index];
    if (deleteCount === undefined) {
      deleteCount = lowerNumberExpression(argument, bindings);
      if (deleteCount === undefined) {
        return undefined;
      }
      continue;
    }
    const value = lowerValueExpression(argument, bindings);
    if (value === undefined) {
      return undefined;
    }
    items.push(value);
  }
  return { kind: "runtimeArraySplice", name, arrayName, start, deleteCount, items };
}

function lowerRuntimeArraySpliceStatement(
  arrayName: string,
  args: ts.NodeArray<ts.Expression>,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (args.length === 0) {
    return undefined;
  }
  const start = lowerNumberExpression(args[0], bindings);
  if (start === undefined) {
    return undefined;
  }
  let deleteCount: JsIrNumberExpression | undefined;
  const items: JsIrValueExpression[] = [];
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    if (deleteCount === undefined) {
      deleteCount = lowerNumberExpression(argument, bindings);
      if (deleteCount === undefined) {
        return undefined;
      }
      continue;
    }
    const value = lowerValueExpression(argument, bindings);
    if (value === undefined) {
      return undefined;
    }
    items.push(value);
  }
  return { kind: "runtimeArraySpliceStatement", arrayName, start, deleteCount, items };
}

function lowerRuntimeArrayFlatBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isCallExpression(initializer) || !ts.isPropertyAccessExpression(initializer.expression) || !ts.isIdentifier(initializer.expression.expression)) {
    return undefined;
  }
  const arrayName = initializer.expression.expression.text;
  if (initializer.expression.name.text !== "flat" || bindings.get(arrayName)?.kind !== "runtimeArray") {
    return undefined;
  }
  if (initializer.arguments.length > 1) {
    return undefined;
  }
  let depth: JsIrNumberExpression = { kind: "literal", value: 1 };
  if (initializer.arguments.length === 1) {
    const loweredDepth = lowerNumberExpression(initializer.arguments[0], bindings);
    if (loweredDepth === undefined) {
      return undefined;
    }
    depth = loweredDepth;
  }
  return { kind: "runtimeArrayFlat", name, arrayName, depth };
}


















































































// eslint-disable-next-line max-statements -- Assignment routing handles scalar, aggregate, nullish, and compound stores together.
function lowerAssignmentStatement(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!ts.isBinaryExpression(expression)) {
    return notApplicable;
  }

  if (expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionEqualsToken) {
    return lowerNullishAssignmentStatement(expression, bindings);
  }

  const compound = lowerCompoundAssignmentStatement(expression, bindings);
  if (compound.kind !== "notApplicable") {
    return compound;
  }

  if (expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken) {
    return notApplicable;
  }

  if (ts.isElementAccessExpression(expression.left)) {
    return lowerElementAssignment(expression.left, expression.right, bindings);
  }

  if (ts.isPropertyAccessExpression(expression.left)) {
    return lowerObjectPropertyAssignment(expression.left, expression.right, bindings);
  }

  if (!ts.isIdentifier(expression.left)) {
    return notApplicable;
  }

  const binding = bindings.get(expression.left.text);
  if (binding?.kind === "stringVariable") {
    const value = lowerStringRuntimeExpression(expression.right, bindings);
    if (value === undefined) {
      return notApplicable;
    }

    return produced({ kind: "assignString", name: expression.left.text, value });
  }

  if (binding?.kind === "booleanVariable") {
    const value = lowerConditionExpression(expression.right, bindings);
    if (value.kind !== "lowered") {
      return value;
    }

    return produced({ kind: "assignBoolean", name: expression.left.text, value: value.operation });
  }

  if (binding?.kind !== "number" || binding.value.kind !== "variable") {
    return notApplicable;
  }

  const value = lowerNumberExpression(expression.right, bindings);
  if (value === undefined) {
    return notApplicable;
  }

  return produced({ kind: "assignNumber", name: expression.left.text, value });
}

function lowerCompoundAssignmentStatement(
  expression: ts.BinaryExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const operator = lowerCompoundAssignmentOperator(expression.operatorToken.kind);
  if (operator === undefined || !ts.isIdentifier(expression.left)) {
    return notApplicable;
  }
  const binding = bindings.get(expression.left.text);
  if (binding?.kind !== "number" || binding.value.kind !== "variable") {
    return notApplicable;
  }
  const right = lowerNumberExpression(expression.right, bindings);
  if (right === undefined) {
    return notApplicable;
  }
  return produced({
    kind: "assignNumber",
    name: expression.left.text,
    value: { kind: "binary", operator, left: { kind: "variable", name: expression.left.text }, right }
  });
}

function lowerCompoundAssignmentOperator(kind: ts.SyntaxKind): JsIrNumberOperator | undefined {
  switch (kind) {
    case ts.SyntaxKind.PlusEqualsToken: { return "add"; }
    case ts.SyntaxKind.MinusEqualsToken: { return "subtract"; }
    case ts.SyntaxKind.AsteriskEqualsToken: { return "multiply"; }
    case ts.SyntaxKind.SlashEqualsToken: { return "divide"; }
    case ts.SyntaxKind.PercentEqualsToken: { return "remainder"; }
    case ts.SyntaxKind.AmpersandEqualsToken: { return "bitAnd"; }
    case ts.SyntaxKind.BarEqualsToken: { return "bitOr"; }
    case ts.SyntaxKind.CaretEqualsToken: { return "bitXor"; }
    case ts.SyntaxKind.LessThanLessThanEqualsToken: { return "shiftLeft"; }
    case ts.SyntaxKind.GreaterThanGreaterThanEqualsToken: { return "shiftRight"; }
    case ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken: { return "shiftRightUnsigned"; }
    case ts.SyntaxKind.AsteriskAsteriskEqualsToken: { return "power"; }
    default: { return undefined; }
  }
}

function lowerNullishAssignmentStatement(
  expression: ts.BinaryExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const currentValue = lowerValueExpression(expression.left, bindings);
  if (currentValue === undefined) {
    return notApplicable;
  }
  let store: Lowered;
  if (ts.isElementAccessExpression(expression.left)) {
    store = lowerElementAssignment(expression.left, expression.right, bindings);
  } else if (ts.isPropertyAccessExpression(expression.left)) {
    store = lowerObjectPropertyAssignment(expression.left, expression.right, bindings);
  } else {
    return notApplicable;
  }
  if (store.kind === "unsupported") {
    return store;
  }
  if (store.kind !== "lowered") {
    return notApplicable;
  }
  const condition: JsIrCondition = {
    kind: "or",
    left: { kind: "valueComparison", operator: "===", left: currentValue, right: { kind: "null" } },
    right: { kind: "valueComparison", operator: "===", left: currentValue, right: { kind: "undefined" } }
  };
  return produced({ kind: "if", condition, thenOperations: [store.operation], elseOperations: [] });
}

// eslint-disable-next-line complexity, max-statements -- Element assignment handles fixed, runtime, and boxed aggregate targets.
function lowerElementAssignment(
  left: ts.ElementAccessExpression,
  right: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const objectAccess = lowerObjectAccessPath(left, bindings);
  if (objectAccess !== undefined) {
    const objectValue = lowerNumberExpression(right, bindings);
    if (objectValue === undefined) {
      return notApplicable;
    }
    return produced({ kind: "objectStore", objectName: objectAccess.objectName, path: objectAccess.path, value: objectValue });
  }

  if (!ts.isIdentifier(left.expression)) {
    return notApplicable;
  }

  const arrayBinding = bindings.get(left.expression.text);
  if (
    (arrayBinding?.kind === "runtimeMap" || arrayBinding?.kind === "runtimeSet") &&
    lowerSymbolIteratorKeyExpression(left.argumentExpression, bindings) !== undefined
  ) {
    const iteratorMethod = lowerValueExpression(right, bindings);
    if (iteratorMethod !== undefined) {
      return produced({ kind: "runtimeCollectionSetIterator", collectionName: arrayBinding.name, value: iteratorMethod });
    }
  }
  let index = lowerNumberExpression(left.argumentExpression, bindings);
  if (arrayBinding?.kind === "runtimeArray" && index === undefined) {
    const stringIndex = lowerCanonicalArrayIndexString(left.argumentExpression);
    if (stringIndex !== undefined) {
      index = { kind: "literal", value: stringIndex };
    }
  }
  const value = lowerNumberExpression(right, bindings);
  if (arrayBinding?.kind === "array" && index !== undefined && value !== undefined) {
    return produced({ kind: "arrayStore", arrayName: left.expression.text, index, value });
  }

  const objectStore = lowerObjectElementAssignment(left, right, arrayBinding, bindings);
  if (objectStore !== undefined) {
    return produced(objectStore);
  }

  const runtimeValue = lowerValueExpression(right, bindings);
  if (arrayBinding?.kind === "runtimeArray" && index !== undefined && runtimeValue !== undefined) {
    return produced({ kind: "runtimeArrayStore", arrayName: left.expression.text, index, value: runtimeValue });
  }
  if (arrayBinding?.kind === "runtimeArray" && runtimeValue !== undefined) {
    const key = lowerPropertyKeyExpression(left.argumentExpression, bindings);
    if (key !== undefined) {
      return produced({ kind: "runtimeArrayNamedStore", arrayName: left.expression.text, key, value: runtimeValue });
    }
  }
  if (isProvenBoxedAggregateBinding(arrayBinding) && runtimeValue !== undefined) {
    if (index !== undefined) {
      return produced({ kind: "valueArrayStore", targetName: left.expression.text, index, value: runtimeValue });
    }
    const key = lowerPropertyKeyExpression(left.argumentExpression, bindings);
    if (key !== undefined) {
      return produced({ kind: "valueObjectStore", targetName: left.expression.text, key, value: runtimeValue });
    }
  }

  return notApplicable;
}

function lowerObjectElementAssignment(
  left: ts.ElementAccessExpression,
  right: ts.Expression,
  binding: JsIrBindingValue | undefined,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isIdentifier(left.expression)) {
    return undefined;
  }

  if (binding?.kind === "object") {
    const key = lowerStringExpression(left.argumentExpression, bindings);
    const objectValue = lowerNumberExpression(right, bindings);
    if (key !== undefined && objectValue !== undefined && objectPathExists(binding.value, [key])) {
      return { kind: "objectStore", objectName: left.expression.text, path: [key], value: objectValue };
    }
    return undefined;
  }

  if (binding?.kind !== "runtimeObject") {
    return undefined;
  }

  const key = lowerPropertyKeyExpression(left.argumentExpression, bindings);
  const runtimeValue = lowerValueExpression(right, bindings);
  if (key === undefined || runtimeValue === undefined) {
    return undefined;
  }
  return { kind: "runtimeObjectStore", objectName: left.expression.text, key, value: runtimeValue };
}

// eslint-disable-next-line complexity, max-statements -- Property-assignment routing dispatches class, runtime, boxed, and fixed targets in one place.
function lowerObjectPropertyAssignment(
  left: ts.PropertyAccessExpression,
  right: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const privateStore = lowerClassPrivateFieldStore(left, right, bindings);
  if (privateStore.kind !== "notApplicable") {
    return privateStore;
  }

  const thisStore = lowerThisPropertyAssignment(left, right, bindings);
  if (thisStore.kind !== "notApplicable") {
    return thisStore;
  }

  const classAssignment = lowerClassPropertyAssignment(left, right, bindings);
  if (classAssignment.kind !== "notApplicable") {
    return classAssignment;
  }

  if (ts.isIdentifier(left.expression)) {
    const binding = bindings.get(left.expression.text);
    if (binding?.kind === "runtimeArray" && left.name.text === "length") {
      const length = lowerNumberExpression(right, bindings);
      if (length !== undefined) {
        return produced({ kind: "runtimeArraySetLength", arrayName: left.expression.text, length });
      }
    }
    if (isProvenBoxedAggregateBinding(binding) && left.name.text === "length") {
      const length = lowerNumberExpression(right, bindings);
      if (length !== undefined) {
        return produced({ kind: "valueArraySetLength", targetName: left.expression.text, length });
      }
    }
    if (binding?.kind === "runtimeObject") {
      const value = lowerValueExpression(right, bindings);
      if (value !== undefined) {
        return produced({ kind: "runtimeObjectStore", objectName: left.expression.text, key: { kind: "literal", value: left.name.text }, value });
      }
    }
    if (isProvenBoxedAggregateBinding(binding)) {
      const value = lowerValueExpression(right, bindings);
      if (value !== undefined) {
        return produced({ kind: "valueObjectStore", targetName: left.expression.text, key: { kind: "literal", value: left.name.text }, value });
      }
    }
  }

  const access = lowerObjectAccessPath(left, bindings);
  const value = lowerNumberExpression(right, bindings);
  if (access === undefined || value === undefined) {
    return notApplicable;
  }

  return produced({ kind: "objectStore", objectName: access.objectName, path: access.path, value });
}

function lowerThisPropertyAssignment(
  left: ts.PropertyAccessExpression,
  right: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  // Object-literal methods and class methods both bind `this` as a valueVariable.
  if (left.expression.kind !== ts.SyntaxKind.ThisKeyword || bindings.get(CLASS_THIS_NAME)?.kind !== "valueVariable") {
    return notApplicable;
  }
  const value = lowerValueExpression(right, bindings);
  if (value === undefined) {
    if (classThisInScope) {
      return unsupportedIn(`The value written to \`this.${left.name.text}\` is not an expression this build can evaluate`);
    }
    return notApplicable;
  }
  return produced({
    kind: "valueObjectStore",
    targetName: CLASS_THIS_NAME,
    key: { kind: "literal", value: left.name.text },
    value
  });
}

function lowerClosureFactoryCall(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrClosureValue | undefined {
  if (!ts.isCallExpression(expression) || !ts.isIdentifier(expression.expression)) {
    return undefined;
  }

  const factory = bindings.get(expression.expression.text);
  if (factory?.kind !== "closureFactory") {
    return undefined;
  }
  if (expression.arguments.length !== factory.factoryParameters.length) {
    return undefined;
  }

  const factoryArgs = new Map<string, JsIrNumberExpression>();
  for (let i = 0; i < factory.factoryParameters.length; i++) {
    const argument = expression.arguments[i];
    const lowered = lowerNumberExpression(argument, bindings);
    if (lowered === undefined) {
      return undefined;
    }
    factoryArgs.set(factory.factoryParameters[i], lowered);
  }

  const captures: JsIrNumberExpression[] = [];
  for (const captureName of factory.captureNames) {
    const capture = factoryArgs.get(captureName);
    if (capture === undefined) {
      return undefined;
    }
    captures.push(capture);
  }

  return {
    functionName: factory.functionName,
    captures
  };
}

function lowerStringExpression(expression: ts.Expression, bindings: ReadonlyMap<string, JsIrBindingValue>): string | undefined {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }

  if (ts.isIdentifier(expression)) {
    const binding = bindings.get(expression.text);
    if (binding?.kind !== "string") {
      return undefined;
    }
    return binding.value;
  }

  if (!ts.isBinaryExpression(expression) || expression.operatorToken.kind !== ts.SyntaxKind.PlusToken) {
    return undefined;
  }

  const left = lowerStringExpression(expression.left, bindings);
  const right = lowerStringExpression(expression.right, bindings);
  if (left === undefined || right === undefined) {
    return undefined;
  }

  return left + right;
}

// eslint-disable-next-line complexity, max-statements -- Runtime string lowering is centralized during the JSValue transition.
function lowerStringRuntimeExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrStringExpression | undefined {
  if (
    ts.isCallExpression(expression) &&
    ts.isPropertyAccessExpression(expression.expression) &&
    expression.expression.name.text === "replace" &&
    expression.arguments.length === 2 &&
    isRegexExpression(expression.arguments[0], bindings)
  ) {
    const receiver = lowerStringRuntimeExpression(expression.expression.expression, bindings);
    const regex = lowerValueExpression(expression.arguments[0], bindings);
    const replacement = lowerStringRuntimeExpression(expression.arguments[1], bindings);
    if (receiver !== undefined && regex !== undefined && replacement !== undefined) {
      return { kind: "regexReplace", receiver, regex, replacement };
    }
  }
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return { kind: "literal", value: expression.text };
  }

  if (ts.isIdentifier(expression)) {
    const binding = bindings.get(expression.text);
    if (binding?.kind === "string") {
      return { kind: "literal", value: binding.value };
    }
    if (binding?.kind === "stringExpression") {
      return binding.value;
    }
    if (binding?.kind === "stringVariable") {
      return { kind: "variable", name: binding.name };
    }
  }

  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return lowerStringConcatExpression(expression, bindings);
  }

  if (ts.isTemplateExpression(expression)) {
    return lowerTemplateExpression(expression, bindings);
  }

  if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text !== "print") {
    if (expression.expression.text === "String" && expression.arguments.length === 1) {
      const value = lowerValueExpression(expression.arguments[0], bindings);
      if (value !== undefined) {
        return { kind: "stringConversion", value };
      }
    }
    return lowerStringCallExpression(expression, bindings);
  }

  if (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression)) {
    const dateIsoString = lowerDateIsoStringExpression(expression, bindings);
    if (dateIsoString !== undefined) {
      return dateIsoString;
    }
    const numberFormatMethod = lowerRuntimeNumberFormatExpression(expression, bindings);
    if (numberFormatMethod !== undefined) {
      return numberFormatMethod;
    }
    const fromCharCode = lowerStringFromCharCodeExpression(expression, bindings);
    if (fromCharCode !== undefined) {
      return fromCharCode;
    }
    const runtimeStringMethod = lowerRuntimeStringMethodExpression(expression, bindings);
    if (runtimeStringMethod !== undefined) {
      return runtimeStringMethod;
    }
    if (!ts.isIdentifier(expression.expression.expression)) {
      return undefined;
    }
    if (expression.expression.name.text === "toString" && expression.arguments.length === 0) {
      const receiverBinding = bindings.get(expression.expression.expression.text);
      if (receiverBinding?.kind === "runtimeObject" && receiverBinding.errorName !== undefined) {
        return { kind: "errorToString", objectName: receiverBinding.name };
      }
    }
    const arrayName = expression.expression.expression.text;
    if (expression.expression.name.text === "join" && bindings.get(arrayName)?.kind === "runtimeArray" && expression.arguments.length === 1) {
      const separator = lowerStringRuntimeExpression(expression.arguments[0], bindings);
      if (separator !== undefined) {
        return { kind: "arrayJoin", arrayName, separator };
      }
    }
  }

  if (ts.isTypeOfExpression(expression)) {
    const typeName = lowerTypeOfResult(expression.expression, bindings);
    if (typeName !== undefined) {
      return { kind: "typeof", value: typeName };
    }
  }

  if (!ts.isConditionalExpression(expression)) {
    return undefined;
  }

  const condition = lowerConditionExpression(expression.condition, bindings);
  const consequent = lowerStringRuntimeExpression(expression.whenTrue, bindings);
  const alternate = lowerStringRuntimeExpression(expression.whenFalse, bindings);
  if (condition.kind !== "lowered" || consequent === undefined || alternate === undefined) {
    return undefined;
  }

  return {
    kind: "ternary",
    condition: condition.operation,
    consequent,
    alternate
  };
}

function isRegexExpression(expression: ts.Expression, bindings: ReadonlyMap<string, JsIrBindingValue>): boolean {
  if (expression.kind === ts.SyntaxKind.RegularExpressionLiteral || isRegExpConstructorCall(expression)) {
    return true;
  }
  if (!ts.isIdentifier(expression)) {
    return false;
  }
  const binding = bindings.get(expression.text);
  return binding?.kind === "valueVariable" && binding.valueType === "regex";
}

// eslint-disable-next-line complexity, max-statements -- String method argument validation mirrors the supported runtime surface explicitly.
function lowerRuntimeStringMethodExpression(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrStringExpression | undefined {
  if (!ts.isPropertyAccessExpression(expression.expression)) {
    return undefined;
  }
  const method = expression.expression.name.text;
  const receiver = lowerStringRuntimeExpression(expression.expression.expression, bindings);
  if (receiver === undefined) {
    return undefined;
  }
  if ((method === "trim" || method === "trimStart" || method === "trimEnd" || method === "toUpperCase" || method === "toLowerCase") && expression.arguments.length === 0) {
    return { kind: "stringMethod", method, receiver };
  }
  if (method === "repeat" && expression.arguments.length === 1) {
    const count = lowerNumberExpression(expression.arguments[0], bindings);
    let literal: number | undefined;
    if (count !== undefined) {
      literal = numericLiteralValue(count);
    }
    if (count === undefined || (literal !== undefined && literal < 0)) {
      return undefined;
    }
    return { kind: "stringMethod", method, receiver, count };
  }
  if ((method === "replace" || method === "replaceAll") && expression.arguments.length === 2) {
    const search = lowerStringRuntimeExpression(expression.arguments[0], bindings);
    const replacement = lowerStringRuntimeExpression(expression.arguments[1], bindings);
    if (search === undefined || replacement === undefined) {
      return undefined;
    }
    return { kind: "stringMethod", method, receiver, search, replacement };
  }
  if ((method === "padStart" || method === "padEnd") && expression.arguments.length === 2) {
    const targetLength = lowerNumberExpression(expression.arguments[0], bindings);
    const padString = lowerStringRuntimeExpression(expression.arguments[1], bindings);
    if (targetLength === undefined || padString === undefined) {
      return undefined;
    }
    return { kind: "stringMethod", method, receiver, targetLength, padString };
  }
  if ((method === "charAt" || method === "at") && expression.arguments.length <= 1) {
    const position = lowerOptionalStringIndexArgument(expression.arguments[0], bindings);
    if (position === undefined) {
      return undefined;
    }
    return { kind: "stringMethod", method, receiver, position };
  }
  if ((method === "slice" || method === "substring" || method === "substr") && expression.arguments.length <= 2) {
    const start = lowerOptionalStringIndexArgument(expression.arguments[0], bindings);
    if (start === undefined) {
      return undefined;
    }
    let end: JsIrNumberExpression | undefined;
    if (expression.arguments.length === 2) {
      const loweredEnd = lowerNumberExpression(expression.arguments[1], bindings);
      if (loweredEnd === undefined) {
        return undefined;
      }
      end = loweredEnd;
    }
    return { kind: "stringMethod", method, receiver, start, end };
  }
  return undefined;
}

function lowerOptionalStringIndexArgument(
  argument: ts.Expression | undefined,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrNumberExpression | undefined {
  if (argument === undefined) {
    return { kind: "literal", value: 0 };
  }
  return lowerNumberExpression(argument, bindings);
}

function lowerStringFromCharCodeExpression(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrStringExpression | undefined {
  if (!ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression)) {
    return undefined;
  }
  if (expression.expression.expression.text !== "String" || expression.expression.name.text !== "fromCharCode" || bindings.has("String")) {
    return undefined;
  }
  const codes: JsIrNumberExpression[] = [];
  for (const argument of expression.arguments) {
    const code = lowerNumberExpression(argument, bindings);
    if (code === undefined) {
      return undefined;
    }
    codes.push(code);
  }
  return { kind: "stringFromCharCode", codes };
}

function lowerRuntimeNumberFormatExpression(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrStringExpression | undefined {
  if (!ts.isPropertyAccessExpression(expression.expression)) {
    return undefined;
  }
  const method = expression.expression.name.text;
  if (method !== "toFixed" && method !== "toPrecision" && method !== "toExponential" && method !== "toString") {
    return undefined;
  }
  const receiver = lowerNumberExpression(expression.expression.expression, bindings);
  if (receiver === undefined || expression.arguments.length > 1) {
    return undefined;
  }
  if (expression.arguments.length === 0) {
    return { kind: "numberFormat", method, receiver };
  }
  const argument = lowerNumberExpression(expression.arguments[0], bindings);
  if (argument === undefined) {
    return undefined;
  }
  const literal = numericLiteralValue(argument);
  if (method === "toFixed" && literal !== undefined && (literal < 0 || literal > maximumToFixedDigits)) {
    return undefined;
  }
  if (method === "toString" && literal !== undefined && (literal < minimumNumberRadix || literal > maximumNumberRadix)) {
    return undefined;
  }
  return { kind: "numberFormat", method, receiver, argument };
}












































function lowerPropertyKeyExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrStringExpression | undefined {
  const symbolIterator = lowerSymbolIteratorKeyExpression(expression, bindings);
  if (symbolIterator !== undefined) {
    return symbolIterator;
  }
  // A signed numeric literal is still a constant key, so `E[-1]` resolves the way `E["-1"]` does.
  const numeric = sourceNumericLiteralValue(expression);
  if (numeric !== undefined) {
    return { kind: "literal", value: String(numeric) };
  }
  if (expression.kind === ts.SyntaxKind.TrueKeyword) {
    return { kind: "literal", value: "true" };
  }
  if (expression.kind === ts.SyntaxKind.FalseKeyword) {
    return { kind: "literal", value: "false" };
  }
  return lowerStringRuntimeExpression(expression, bindings);
}

function lowerStringConcatExpression(
  expression: ts.BinaryExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrStringExpression | undefined {
  const left = lowerStringRuntimeExpression(expression.left, bindings);
  const right = lowerStringRuntimeExpression(expression.right, bindings);
  if (left !== undefined && right !== undefined) {
    return { kind: "concat", left, right };
  }
  if (left === undefined && right === undefined) {
    return undefined;
  }
  const leftValue = lowerValueExpression(expression.left, bindings);
  const rightValue = lowerValueExpression(expression.right, bindings);
  if (leftValue === undefined || rightValue === undefined) {
    return undefined;
  }
  return {
    kind: "concat",
    left: { kind: "stringConversion", value: leftValue },
    right: { kind: "stringConversion", value: rightValue }
  };
}

// eslint-disable-next-line complexity, max-statements -- Template literal lowering handles multi-interpolation, nested templates, and tagged templates in one place.
function lowerTemplateExpression(
  expression: ts.TemplateExpression | ts.TaggedTemplateExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrStringExpression | undefined {
  if (ts.isTaggedTemplateExpression(expression)) {
    return lowerTaggedTemplateExpression(expression, bindings);
  }
  const head = expression.head.text;
  let result: JsIrStringExpression = { kind: "literal", value: head };
  for (const span of expression.templateSpans) {
    const exprValue = lowerValueExpression(span.expression, bindings);
    if (exprValue === undefined) {
      return undefined;
    }
    const middle = span.literal.text;
    result = {
      kind: "concat",
      left: result,
      right: {
        kind: "concat",
        left: { kind: "stringConversion", value: exprValue },
        right: { kind: "literal", value: middle }
      }
    };
  }
  return result;
}

function lowerTaggedTemplateExpression(
  expression: ts.TaggedTemplateExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrStringExpression | undefined {
  if (!ts.isIdentifier(expression.tag) || expression.tag.text === "String") {
    return undefined;
  }
  const tagBinding = bindings.get(expression.tag.text);
  if (tagBinding?.kind !== "function" || tagBinding.returnKind !== "string") {
    return undefined;
  }
  const { template } = expression;
  if (ts.isNoSubstitutionTemplateLiteral(template)) {
    return { kind: "literal", value: template.text };
  }
  const headText = template.head.text;
  const middleTexts: string[] = [];
  const middleExpressions: JsIrValueExpression[] = [];
  for (const span of template.templateSpans) {
    middleTexts.push(span.literal.text);
    const exprValue = lowerValueExpression(span.expression, bindings);
    if (exprValue === undefined) {
      return undefined;
    }
    middleExpressions.push(exprValue);
  }
  return {
    kind: "taggedTemplate",
    tag: expression.tag.text,
    head: headText,
    middleTexts,
    expressions: middleExpressions
  };
}

function lowerStringCallExpression(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrStringExpression | undefined {
  if (!ts.isIdentifier(expression.expression)) {
    return undefined;
  }
  const callee = bindings.get(expression.expression.text);
  if (callee?.kind !== "function" || callee.returnKind !== "string") {
    return undefined;
  }
  const args = lowerCallArguments(expression.expression.text, expression.arguments, bindings);
  if (args === undefined) {
    return undefined;
  }
  return { kind: "call", name: expression.expression.text, arguments: args };
}

function lowerDateIsoStringExpression(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrStringExpression | undefined {
  if (!ts.isPropertyAccessExpression(expression.expression) || expression.expression.name.text !== "toISOString" || expression.arguments.length > 0) {
    return undefined;
  }
  const millis = lowerDateConstructorMilliseconds(expression.expression.expression, bindings);
  if (millis === undefined || numericLiteralValue(millis) !== 0) {
    return undefined;
  }
  return { kind: "literal", value: "1970-01-01T00:00:00.000Z" };
}

function lowerBooleanExpression(expression: ts.Expression, bindings: ReadonlyMap<string, JsIrBindingValue>): boolean | undefined {
  if (expression.kind === ts.SyntaxKind.TrueKeyword || expression.kind === ts.SyntaxKind.FalseKeyword) {
    return expression.kind === ts.SyntaxKind.TrueKeyword;
  }

  if (ts.isIdentifier(expression)) {
    const binding = bindings.get(expression.text);
    if (binding?.kind === "boolean") {
      return binding.value;
    }
    if (binding?.kind === "booleanVariable") {
      return binding.initialValue;
    }
  }

  return undefined;
}

function lowerInstanceOfCondition(
  expression: ts.BinaryExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrCondition> {
  const right = unwrapTypeOnlyExpression(expression.right);
  if (ts.isIdentifier(right) && !bindings.has(right.text)) {
    const classInfo = classLoweringState.registry?.get(right.text);
    if (classInfo !== undefined) {
      const instance = lowerClassInstanceExpression(unwrapTypeOnlyExpression(expression.left), bindings);
      if (instance.kind === "unsupported") {
        return instance;
      }
      let value: JsIrValueExpression | undefined;
      if (instance.kind === "lowered") {
        value = instance.operation;
      } else {
        value = lowerValueExpression(unwrapTypeOnlyExpression(expression.left), bindings);
      }
      if (value !== undefined) {
        return produced({ kind: "classInstanceOf", value, prototypeName: classPrototypeName(classInfo.name) });
      }
    }
  }
  if (!ts.isIdentifier(right) || !errorConstructorNames.has(right.text) || bindings.has(right.text)) {
    return notApplicable;
  }
  const errorCondition = lowerErrorInstanceOfCondition(expression.left, right.text, bindings);
  if (errorCondition === undefined) {
    return notApplicable;
  }
  return produced(errorCondition);
}

function lowerErrorInstanceOfCondition(
  leftExpression: ts.Expression,
  constructorName: string,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {
  const left = unwrapTypeOnlyExpression(leftExpression);
  if (!ts.isIdentifier(left)) {
    return undefined;
  }
  const binding = bindings.get(left.text);
  if (binding?.kind === "runtimeObject") {
    return { kind: "boolean", value: errorInstanceMatches(binding.errorName, constructorName) };
  }
  if (binding?.kind === "runtimeArray" || binding?.kind === "object" || binding?.kind === "array") {
    return { kind: "boolean", value: false };
  }
  // Boxed values (catch variables, JSON.parse results, dynamic property reads)
  // resolve the error class at runtime; primitive bindings stay unsupported.
  if (binding?.kind === "valueVariable" || binding?.kind === "value") {
    const value = lowerValueExpression(left, bindings);
    if (value !== undefined) {
      return { kind: "errorInstanceOf", value, errorName: constructorName };
    }
  }
  return undefined;
}

function errorInstanceMatches(errorName: string | undefined, constructorName: string): boolean {
  if (errorName === undefined) {
    return false;
  }
  if (constructorName === "Error") {
    return true;
  }
  return errorName === constructorName;
}

// eslint-disable-next-line complexity, max-statements -- Condition lowering is still centralized while runtime predicates are introduced.
function lowerConditionExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrCondition> {
  const unwrappedExpression = unwrapTypeOnlyExpression(expression);
  if (unwrappedExpression !== expression) {
    return lowerConditionExpression(unwrappedExpression, bindings);
  }

  const regexTest = lowerRegexTestCondition(expression, bindings);
  if (regexTest !== undefined) {
    return produced(regexTest);
  }

  if (ts.isPrefixUnaryExpression(expression) && expression.operator === ts.SyntaxKind.ExclamationToken) {
    const operand = lowerConditionExpression(expression.operand, bindings);
    if (operand.kind !== "lowered") {
      return operand;
    }

    return produced({ kind: "negate", condition: operand.operation });
  }

  if (ts.isBinaryExpression(expression)) {
    if (expression.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword) {
      return lowerInstanceOfCondition(expression, bindings);
    }
    const logicalCondition = lowerLogicalConditionExpression(expression, bindings);
    if (logicalCondition !== undefined) {
      return produced(logicalCondition);
    }
    const presenceCondition = lowerPresenceConditionExpression(expression, bindings);
    if (presenceCondition !== undefined) {
      return produced(presenceCondition);
    }
    const collectionIdentity = lowerRuntimeCollectionIdentityCondition(expression, bindings);
    if (collectionIdentity !== undefined) {
      return produced(collectionIdentity);
    }
  }

  const hasOwnCondition = lowerHasOwnConditionExpression(expression, bindings);
  if (hasOwnCondition !== undefined) {
    return produced(hasOwnCondition);
  }

  const methodSugar = lowerObjectMethodSugarConditionExpression(expression, bindings);
  if (methodSugar !== undefined) {
    return produced(methodSugar);
  }

  const isArray = lowerArrayIsArrayConditionExpression(expression, bindings);
  if (isArray !== undefined) {
    return produced(isArray);
  }

  const everySome = lowerRuntimeArrayEverySomeConditionExpression(expression, bindings);
  if (everySome !== undefined) {
    return produced(everySome);
  }

  const objectIsCondition = lowerObjectIsConditionExpression(expression, bindings);
  if (objectIsCondition !== undefined) {
    return produced(objectIsCondition);
  }

  const objectStateCondition = lowerRuntimeObjectStateCondition(expression, bindings);
  if (objectStateCondition !== undefined) {
    return produced(objectStateCondition);
  }

  const numberPredicate = lowerNumberPredicateCondition(expression, bindings);
  if (numberPredicate !== undefined) {
    return produced(numberPredicate);
  }

  const stringSearch = lowerRuntimeStringSearchCondition(expression, bindings);
  if (stringSearch !== undefined) {
    return produced(stringSearch);
  }

  const collectionHas = lowerRuntimeCollectionHasCondition(expression, bindings);
  if (collectionHas !== undefined) {
    return produced(collectionHas);
  }

  if (ts.isIdentifier(expression)) {
    const binding = bindings.get(expression.text);
    if (binding?.kind === "booleanExpression") {
      return produced(binding.value);
    }
    if (binding?.kind === "booleanVariable") {
      return produced({ kind: "booleanVariable", name: binding.name });
    }
  }

  const booleanValue = lowerBooleanExpression(expression, bindings);
  if (booleanValue !== undefined) {
    return produced({ kind: "boolean", value: booleanValue });
  }

  const truthy = lowerTruthyConditionExpression(expression, bindings);
  if (truthy !== undefined) {
    return produced(truthy);
  }

  if (!ts.isBinaryExpression(expression)) {
    return notApplicable;
  }

  const comparison = lowerComparisonConditionExpression(expression, bindings);
  if (comparison === undefined) {
    return notApplicable;
  }
  return produced(comparison);
}

















function lowerRuntimeCollectionHasCondition(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {
  if (!ts.isCallExpression(expression) || !ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression) || expression.arguments.length !== 1) {
    return undefined;
  }
  const receiver = expression.expression.expression.text;
  const binding = bindings.get(receiver);
  if (binding?.kind !== "runtimeMap" && binding?.kind !== "runtimeSet") {
    return undefined;
  }
  const method = expression.expression.name.text;
  if (method !== "has" && method !== "delete") {
    return undefined;
  }
  const key = lowerValueExpression(expression.arguments[0], bindings);
  if (key === undefined) {
    return undefined;
  }
  if (method === "has") {
    return { kind: "runtimeCollectionHas", collectionName: binding.name, key };
  }
  return { kind: "runtimeCollectionDelete", collectionName: binding.name, key };
}

function lowerRuntimeStringSearchCondition(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {
  if (!ts.isCallExpression(expression) || !ts.isPropertyAccessExpression(expression.expression) || expression.arguments.length !== 1) {
    return undefined;
  }
  const method = expression.expression.name.text;
  if (method !== "includes" && method !== "startsWith" && method !== "endsWith") {
    return undefined;
  }
  const receiver = lowerStringRuntimeExpression(expression.expression.expression, bindings);
  const search = lowerStringRuntimeExpression(expression.arguments[0], bindings);
  if (receiver === undefined || search === undefined) {
    return undefined;
  }
  return { kind: "stringSearch", method, receiver, search };
}

// eslint-disable-next-line complexity -- Number predicate routing is centralized with the existing predicate surface.
function lowerNumberPredicateCondition(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {
  if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === "Boolean" && expression.arguments.length === 1) {
    const value = lowerValueExpression(expression.arguments[0], bindings);
    if (value !== undefined) {
      return { kind: "valueTruthy", value };
    }
  }
  if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === "isNaN" && expression.arguments.length === 1) {
    const value = lowerValueExpression(expression.arguments[0], bindings);
    if (value !== undefined) {
      return { kind: "numberPredicate", predicate: "globalIsNaN", value };
    }
  }
  if (!ts.isCallExpression(expression) || !ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression) || expression.expression.expression.text !== "Number" || expression.arguments.length !== 1) {
    return undefined;
  }
  const value = lowerValueExpression(expression.arguments[0], bindings);
  if (value === undefined) {
    return undefined;
  }
  if (expression.expression.name.text === "isNaN") {
    return { kind: "numberPredicate", predicate: "numberIsNaN", value };
  }
  if (expression.expression.name.text === "isFinite") {
    return { kind: "numberPredicate", predicate: "numberIsFinite", value };
  }
  if (expression.expression.name.text === "isInteger") {
    return { kind: "numberPredicate", predicate: "numberIsInteger", value };
  }
  if (expression.expression.name.text === "isSafeInteger") {
    return { kind: "numberPredicate", predicate: "numberIsSafeInteger", value };
  }
  return undefined;
}



















































function lowerPresenceConditionExpression(
  expression: ts.BinaryExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {
  if (expression.operatorToken.kind !== ts.SyntaxKind.InKeyword || !ts.isIdentifier(expression.right)) {
    return undefined;
  }
  const binding = bindings.get(expression.right.text);
  if (binding?.kind === "runtimeObject") {
    const key = lowerStringRuntimeExpression(expression.left, bindings);
    if (key !== undefined) {
      return { kind: "runtimeObjectHas", objectName: expression.right.text, key, ownOnly: false };
    }
  }
  if (binding?.kind === "runtimeArray") {
    let index = lowerNumberExpression(expression.left, bindings);
    let key: JsIrStringExpression | undefined;
      if (ts.isNumericLiteral(expression.left)) {
        key = { kind: "literal", value: expression.left.text };
      }
      const stringIndex = lowerCanonicalArrayIndexString(expression.left);
      if (stringIndex !== undefined) {
        index = { kind: "literal", value: stringIndex };
        key = { kind: "literal", value: String(stringIndex) };
      }
      if (index !== undefined) {
        return { kind: "runtimeArrayHas", arrayName: expression.right.text, index, key, ownOnly: false };
      }
      key = lowerPropertyKeyExpression(expression.left, bindings);
      if (key !== undefined) {
        return { kind: "runtimeArrayHas", arrayName: expression.right.text, index: { kind: "literal", value: -1 }, key, ownOnly: false };
      }
    }
  return undefined;
}

function lowerHasOwnConditionExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {
  if (!ts.isCallExpression(expression) || expression.arguments.length !== 2) {
    return undefined;
  }
  const callee = expression.expression;
  if (!ts.isPropertyAccessExpression(callee) || !ts.isIdentifier(callee.expression) || callee.expression.text !== "Object" || callee.name.text !== "hasOwn") {
    return undefined;
  }
  const [target, keyExpression] = expression.arguments;
  if (!ts.isIdentifier(target)) {
    return undefined;
  }
  const binding = bindings.get(target.text);
  if (binding?.kind === "runtimeObject") {
    const key = lowerStringRuntimeExpression(keyExpression, bindings);
    if (key !== undefined) {
      return { kind: "runtimeObjectHas", objectName: target.text, key, ownOnly: true, receiverKind: "object" };
    }
  }
  if (isBoxedAggregateCandidateBinding(binding)) {
    const key = lowerStringRuntimeExpression(keyExpression, bindings);
    if (key !== undefined) {
      return { kind: "runtimeObjectHas", objectName: target.text, key, ownOnly: true, receiverKind: "value" };
    }
  }
  if (binding?.kind === "runtimeArray") {
    let index = lowerNumberExpression(keyExpression, bindings);
    const stringIndex = lowerCanonicalArrayIndexString(keyExpression);
    if (stringIndex !== undefined) {
      index = { kind: "literal", value: stringIndex };
    }
    if (index !== undefined) {
      return { kind: "runtimeArrayHas", arrayName: target.text, index, ownOnly: true };
    }
    const key = lowerPropertyKeyExpression(keyExpression, bindings);
    if (key !== undefined) {
      return { kind: "runtimeArrayHas", arrayName: target.text, index: { kind: "literal", value: -1 }, key, ownOnly: true };
    }
  }
  return undefined;
}

function lowerObjectMethodSugarConditionExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {
  if (!ts.isCallExpression(expression) || expression.arguments.length !== 1 || !ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression)) {
    return undefined;
  }
  const receiver = expression.expression.expression.text;
  const method = expression.expression.name.text;
  if (method !== "hasOwnProperty" && method !== "propertyIsEnumerable") {
    return undefined;
  }
  const binding = bindings.get(receiver);
  const [keyExpression] = expression.arguments;
  if (binding?.kind === "runtimeObject") {
    const key = lowerPropertyKeyExpression(keyExpression, bindings);
    if (key === undefined) {
      return undefined;
    }
    if (method === "hasOwnProperty") {
      return { kind: "runtimeObjectHas", objectName: receiver, key, ownOnly: true };
    }
    return { kind: "runtimeObjectPropertyIsEnumerable", objectName: receiver, key };
  }
  if (binding?.kind === "runtimeArray") {
    let index = lowerNumberExpression(keyExpression, bindings);
    const stringIndex = lowerCanonicalArrayIndexString(keyExpression);
    if (stringIndex !== undefined) {
      index = { kind: "literal", value: stringIndex };
    }
    if (index !== undefined) {
      return { kind: "runtimeArrayHas", arrayName: receiver, index, ownOnly: true };
    }
    const key = lowerPropertyKeyExpression(keyExpression, bindings);
    if (key !== undefined) {
      return { kind: "runtimeArrayHas", arrayName: receiver, index: { kind: "literal", value: -1 }, key, ownOnly: true };
    }
  }
  return undefined;
}

/**
 * The receiver of a `valueOf`/`toString` call when it is a boxed primitive, or `undefined` when it
 * is not. The binding is read rather than the lowered value so the decision is made once, from the
 * shape the lowering already recorded.
 */
function lowerBoxedPrimitiveReceiver(
  receiver: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  if (!ts.isIdentifier(receiver)) {
    return undefined;
  }
  const binding = bindings.get(receiver.text);
  if (binding?.kind !== "value" || binding.value.kind !== "boxedPrimitive") {
    return undefined;
  }
  return binding.value;
}

// eslint-disable-next-line complexity -- Array.isArray classification mirrors supported receiver shapes explicitly.
function lowerArrayIsArrayConditionExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {
  if (!ts.isCallExpression(expression) || expression.arguments.length !== 1) {
    return undefined;
  }
  const callee = expression.expression;
  if (!ts.isPropertyAccessExpression(callee) || !ts.isIdentifier(callee.expression) || callee.expression.text !== "Array" || callee.name.text !== "isArray") {
    return undefined;
  }
  const [arg] = expression.arguments;
  if ((ts.isIdentifier(arg) && arg.text === "undefined") || arg.kind === ts.SyntaxKind.UndefinedKeyword || arg.kind === ts.SyntaxKind.NullKeyword || arg.kind === ts.SyntaxKind.TrueKeyword || arg.kind === ts.SyntaxKind.FalseKeyword || ts.isNumericLiteral(arg) || ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
    return { kind: "runtimeArrayIsArray", value: false };
  }
  if (!ts.isIdentifier(arg)) {
    const objectLiteral = classifyObjectLiteral(arg, bindings);
    if (objectLiteral !== undefined) {
      return { kind: "runtimeArrayIsArray", value: false };
    }
    const arrayLiteral = classifyArrayLiteral(arg, bindings);
    if (arrayLiteral !== undefined) {
      return { kind: "runtimeArrayIsArray", value: true };
    }
    return undefined;
  }
  const binding = bindings.get(arg.text);
  if (binding?.kind === "array") {
    return { kind: "runtimeArrayIsArray", value: true };
  }
  if (binding?.kind === "runtimeArray") {
    return { kind: "runtimeArrayIsArray", value: true };
  }
  if (binding?.kind === "runtimeObject") {
    return { kind: "runtimeArrayIsArray", value: false };
  }
  if (isBoxedAggregateCandidateBinding(binding)) {
    const value = lowerValueExpression(arg, bindings);
    if (value !== undefined) {
      return { kind: "runtimeArrayIsArray", value };
    }
  }
  return undefined;
}

function lowerRuntimeArrayEverySomeConditionExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {
  if (!ts.isCallExpression(expression)) {
    return undefined;
  }
  if (expression.arguments.length > 0) {
    return undefined;
  }
  const callee = expression.expression;
  if (!ts.isPropertyAccessExpression(callee)) {
    return undefined;
  }
  let receiver: ts.Expression = callee.expression;
  while (ts.isParenthesizedExpression(receiver)) {
    receiver = receiver.expression;
  }
  receiver = unwrapTypeOnlyExpression(receiver);
  if (!ts.isIdentifier(receiver)) {
    return undefined;
  }
  if (bindings.get(receiver.text)?.kind !== "runtimeArray") {
    return undefined;
  }
  if (callee.name.text === "every") {
    return { kind: "runtimeArrayEvery", arrayName: receiver.text };
  }
  if (callee.name.text === "some") {
    return { kind: "runtimeArraySome", arrayName: receiver.text };
  }
  return undefined;
}

function lowerObjectIsConditionExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {
  if (!ts.isCallExpression(expression) || expression.arguments.length !== 2) {
    return undefined;
  }
  const callee = expression.expression;
  if (!ts.isPropertyAccessExpression(callee) || !ts.isIdentifier(callee.expression) || callee.expression.text !== "Object" || callee.name.text !== "is") {
    return undefined;
  }
  const [leftArg, rightArg] = expression.arguments;
  let left: ts.Expression = leftArg;
  let right: ts.Expression = rightArg;
  while (ts.isParenthesizedExpression(left)) {
    left = left.expression;
  }
  while (ts.isParenthesizedExpression(right)) {
    right = right.expression;
  }
  left = unwrapTypeOnlyExpression(left);
  right = unwrapTypeOnlyExpression(right);
  const leftValue = lowerValueExpression(left, bindings);
  const rightValue = lowerValueExpression(right, bindings);
  if (leftValue === undefined || rightValue === undefined) {
    return undefined;
  }
  return { kind: "objectIs", left: leftValue, right: rightValue };
}

function lowerComparisonConditionExpression(
  expression: ts.BinaryExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {

  const operator = lowerComparisonOperator(expression.operatorToken.kind);
  if (operator === undefined) {
    return undefined;
  }

  const stringComparison = lowerStringComparisonExpression(expression, operator, bindings);
  if (stringComparison !== undefined) {
    return stringComparison;
  }

  const booleanComparison = lowerBooleanComparisonExpression(expression, operator, bindings);
  if (booleanComparison !== undefined) {
    return booleanComparison;
  }

  const left = lowerNumberExpression(expression.left, bindings);
  const right = lowerNumberExpression(expression.right, bindings);
  if (left !== undefined && right !== undefined && operator !== "==" && operator !== "!=") {
    return {
      kind: "numberComparison",
      operator,
      left,
      right
    };
  }

  return lowerValueComparisonExpression(expression, operator, bindings);
}

function lowerStringComparisonExpression(
  expression: ts.BinaryExpression,
  operator: "===" | "!==" | "==" | "!=" | "<" | "<=" | ">" | ">=",
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {
  if (operator !== "===" && operator !== "!==") {
    return undefined;
  }

  const left = lowerStringExpression(expression.left, bindings);
  const right = lowerStringExpression(expression.right, bindings);
  if (left !== undefined && right !== undefined) {
    let value = left === right;
    if (operator === "!==") {
      value = !value;
    }

    return { kind: "boolean", value };
  }

  const runtimeLeft = lowerStringRuntimeExpression(expression.left, bindings);
  const runtimeRight = lowerStringRuntimeExpression(expression.right, bindings);
  if (runtimeLeft === undefined || runtimeRight === undefined) {
    return undefined;
  }

  return { kind: "stringComparison", operator, left: runtimeLeft, right: runtimeRight };
}













































function lowerValueComparisonExpression(
  expression: ts.BinaryExpression,
  operator: "===" | "!==" | "==" | "!=" | "<" | "<=" | ">" | ">=",
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {
  const left = lowerValueExpression(expression.left, bindings);
  const right = lowerValueExpression(expression.right, bindings);
  if (left === undefined || right === undefined) {
    return undefined;
  }

  if (operator === "==" || operator === "!=") {
    return { kind: "valueLooseComparison", operator, left, right };
  }

  if (operator !== "===" && operator !== "!==") {
    return { kind: "valueRelationalComparison", operator, left, right };
  }

  return { kind: "valueComparison", operator, left, right };
}

function lowerValueExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  const unwrappedExpression = unwrapTypeOnlyExpression(expression);
  if (unwrappedExpression !== expression) {
    return lowerValueExpression(unwrappedExpression, bindings);
  }

  if (expression.kind === ts.SyntaxKind.ThisKeyword && bindings.get(CLASS_THIS_NAME)?.kind === "valueVariable") {
    return { kind: "variable", name: CLASS_THIS_NAME };
  }

  const inlineCppValue = lowerInlineCppValueExpression(expression);
  if (inlineCppValue !== undefined) {
    return inlineCppValue;
  }

  const classValue = lowerClassValueExpression(expression, bindings);
  if (classValue !== undefined) {
    return classValue;
  }

  const directValue = lowerDirectValueExpression(expression, bindings);
  if (directValue !== undefined) {
    return directValue;
  }

  const aggregateValue = lowerAggregateValueExpression(expression, bindings);
  if (aggregateValue !== undefined) {
    return aggregateValue;
  }

  const stringValue = lowerStringRuntimeExpression(expression, bindings);
  if (stringValue !== undefined) {
    return { kind: "string", value: stringValue };
  }

  const numberValue = lowerNumberExpression(expression, bindings);
  if (numberValue !== undefined) {
    return { kind: "number", value: numberValue };
  }

  const booleanValue = lowerConditionExpression(expression, bindings);
  if (booleanValue.kind === "lowered") {
    return { kind: "boolean", value: booleanValue.operation };
  }

  if (ts.isCallExpression(expression) && !(ts.isIdentifier(expression.expression) && expression.expression.text === "print")) {
    return lowerValueCallExpression(expression, bindings);
  }

  return undefined;
}























function lowerAggregateValueExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  if (ts.isObjectLiteralExpression(expression)) {
    const value = lowerRuntimeObjectLiteralExpression(expression, bindings);
    if (value !== undefined) {
      return { kind: "objectLiteralValue", value };
    }
  }

  if (ts.isArrayLiteralExpression(expression)) {
    const arrayLiteralValue = lowerValueTypedArrayLiteralExpression(expression, bindings);
    if (arrayLiteralValue !== undefined) {
      return arrayLiteralValue;
    }
  }

  if (ts.isElementAccessExpression(expression)) {
    if (ts.isIdentifier(expression.expression)) {
      const arrayAccess = lowerRuntimeArrayValueAccess(expression, bindings);
      if (arrayAccess !== undefined) {
        return arrayAccess;
      }
      const objectAccess = lowerRuntimeObjectElementValueAccess(expression, bindings);
      if (objectAccess !== undefined) {
        return objectAccess;
      }
    }
    const valueAccess = lowerValueElementAccess(expression, bindings);
    if (valueAccess !== undefined) {
      return valueAccess;
    }
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return lowerAggregatePropertyValueAccess(expression, bindings);
  }

  if (ts.isIdentifier(expression)) {
    const binding = bindings.get(expression.text);
    if (binding?.kind === "runtimeObject") {
      return { kind: "objectRef", name: binding.name };
    }
    if (binding?.kind === "runtimeArray") {
      return { kind: "arrayRef", name: binding.name };
    }
  }

  return undefined;
}

function lowerValueTypedArrayLiteralExpression(
  expression: ts.ArrayLiteralExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  const valueElements: JsIrValueExpression[] = [];
  for (const element of expression.elements) {
    if (ts.isSpreadElement(element) || ts.isOmittedExpression(element)) {
      return undefined;
    }
    const value = lowerValueExpression(element, bindings);
    if (value === undefined) {
      return undefined;
    }
    valueElements.push(value);
  }
  return { kind: "runtimeArrayValue", elements: valueElements };
}

function lowerAggregatePropertyValueAccess(
  expression: ts.PropertyAccessExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  if (expression.expression.kind === ts.SyntaxKind.ThisKeyword) {
    const value = lowerValueExpression(expression.expression, bindings);
    if (value !== undefined) {
      return { kind: "valueObjectDynamicAccess", value, key: { kind: "literal", value: expression.name.text } };
    }
  }
  const receiver = unwrapTypeOnlyExpression(expression.expression);
  if (!ts.isIdentifier(receiver)) {
    return undefined;
  }
  const binding = bindings.get(receiver.text);
  if (isFunctionPrototypeAccess(expression, bindings)) {
    return undefined;
  }
  if (binding?.kind === "runtimeObject" && binding.errorName !== undefined && expression.name.text === "stack") {
    return undefined;
  }
  if (binding?.kind === "runtimeObject") {
    return { kind: "objectDynamicAccess", objectName: binding.name, key: { kind: "literal", value: expression.name.text } };
  }
  if (isBoxedAggregateCandidateBinding(binding)) {
    const value = lowerValueExpression(receiver, bindings);
    if (value !== undefined) {
      return { kind: "valueObjectDynamicAccess", value, key: { kind: "literal", value: expression.name.text } };
    }
  }
  return undefined;
}

function lowerValueElementAccess(
  expression: ts.ElementAccessExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  const value = lowerValueElementReceiver(expression.expression, bindings);
  if (value === undefined) {
    return undefined;
  }
  let index = lowerNumberExpression(expression.argumentExpression, bindings);
  const stringIndex = lowerCanonicalArrayIndexString(expression.argumentExpression);
  if (stringIndex !== undefined) {
    index = { kind: "literal", value: stringIndex };
  }
  if (index !== undefined) {
    let keyValue = "0";
    if (index.kind === "literal") {
      keyValue = String(index.value);
    }
    return { kind: "valueArrayAccess", value, index, key: { kind: "literal", value: keyValue } };
  }
  const key = lowerPropertyKeyExpression(expression.argumentExpression, bindings);
  if (key !== undefined) {
    return { kind: "valueObjectDynamicAccess", value, key };
  }
  return undefined;
}

function lowerValueElementReceiver(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  if (ts.isElementAccessExpression(expression)) {
    return lowerValueExpression(expression, bindings);
  }
  if (!ts.isIdentifier(expression)) {
    return undefined;
  }
  const binding = bindings.get(expression.text);
  if (!isBoxedAggregateCandidateBinding(binding)) {
    return undefined;
  }
  return lowerValueExpression(expression, bindings);
}

function lowerRuntimeArrayValueAccess(
  expression: ts.ElementAccessExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  if (!ts.isIdentifier(expression.expression) || bindings.get(expression.expression.text)?.kind !== "runtimeArray") {
    return undefined;
  }
  let index = lowerNumberExpression(expression.argumentExpression, bindings);
  let key: JsIrStringExpression | undefined;
  const stringIndex = lowerCanonicalArrayIndexString(expression.argumentExpression);
  if (stringIndex !== undefined) {
    index = { kind: "literal", value: stringIndex };
    key = { kind: "literal", value: String(stringIndex) };
  }
  if (index !== undefined) {
    if (ts.isNumericLiteral(expression.argumentExpression)) {
      key = { kind: "literal", value: expression.argumentExpression.text };
    }
    return { kind: "arrayAccess", arrayName: expression.expression.text, index, key };
  }
  if (ts.isStringLiteral(expression.argumentExpression) && expression.argumentExpression.text === "length") {
    return { kind: "number", value: { kind: "arrayLength", arrayName: expression.expression.text } };
  }
  key = lowerPropertyKeyExpression(expression.argumentExpression, bindings);
  if (key !== undefined) {
    return { kind: "arrayAccess", arrayName: expression.expression.text, index: { kind: "literal", value: -1 }, key };
  }
  return undefined;
}

function lowerRuntimeObjectElementValueAccess(
  expression: ts.ElementAccessExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  if (!ts.isIdentifier(expression.expression)) {
    return undefined;
  }
  const binding = bindings.get(expression.expression.text);
  if (binding?.kind !== "object" && binding?.kind !== "runtimeObject") {
    return undefined;
  }
  if (binding.kind === "object" && objectHasNestedFields(binding.value)) {
    return undefined;
  }
  const key = lowerPropertyKeyExpression(expression.argumentExpression, bindings);
  if (key === undefined) {
    return undefined;
  }
  return { kind: "objectDynamicAccess", objectName: expression.expression.text, key };
}

// eslint-disable-next-line complexity, max-statements -- Direct JSValue lowering is centralized while the runtime ABI expands.
function lowerDirectValueExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  const regex = lowerRegexValueExpression(expression, bindings);
  if (regex !== undefined) {
    return regex;
  }
  const functionValue = lowerFunctionObjectValue(expression, bindings);
  if (functionValue !== undefined) {
    return functionValue;
  }

  if (ts.isBinaryExpression(expression)) {
    if (expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = lowerValueExpression(expression.left, bindings);
      const right = lowerValueExpression(expression.right, bindings);
      if (left !== undefined && right !== undefined) {
        return { kind: "valuePlus", left, right };
      }
    }
    if (expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken || expression.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
      const left = lowerValueExpression(expression.left, bindings);
      const right = lowerValueExpression(expression.right, bindings);
      if (left !== undefined && right !== undefined) {
        let operator: "&&" | "||" = "||";
        if (expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
          operator = "&&";
        }
        return { kind: "logicalValue", operator, left, right };
      }
    }
    if (expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
      const left = lowerValueExpression(expression.left, bindings);
      const right = lowerValueExpression(expression.right, bindings);
      if (left !== undefined && right !== undefined) {
        return { kind: "nullishCoalesce", left, right };
      }
    }
  }

  if (ts.isOptionalChain(expression) && !ts.isNonNullChain(expression)) {
    const optionalChain = lowerOptionalChainValueExpression(expression, bindings);
    if (optionalChain !== undefined) {
      return optionalChain;
    }
  }

  if (expression.kind === ts.SyntaxKind.UndefinedKeyword || (ts.isIdentifier(expression) && expression.text === "undefined")) {
    return { kind: "undefined" };
  }

  if (ts.isVoidExpression(expression)) {
    const inner = lowerValueExpression(expression.expression, bindings);
    if (inner === undefined) {
      return undefined;
    }
    return { kind: "void", expression: inner };
  }

  if (ts.isNewExpression(expression) && ts.isIdentifier(expression.expression)) {
    const constructorName = expression.expression.text;
    const constructor = bindings.get(constructorName);
    if (constructor?.kind === "function" && constructor.constructibleByObjectReturn === true) {
      const constructorArguments = expression.arguments ?? ts.factory.createNodeArray<ts.Expression>();
      const args = lowerPlainConstructorArguments(constructor.parameters, constructorArguments, bindings);
      if (args === undefined) {
        return undefined;
      }
      return { kind: "call", name: constructorName, arguments: args };
    }
    if (constructorName === "Number" || constructorName === "Boolean" || constructorName === "String") {
      const args = expression.arguments ?? [];
      if (args.length !== 1) {
        return undefined;
      }
      const inner = lowerValueExpression(args[0], bindings);
      if (inner === undefined) {
        return undefined;
      }
      return { kind: "boxedPrimitive", inner, storeLength: constructorName === "String" };
    }
  }

  if (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression)) {
    // Object.getPrototypeOf(instance) where instance is a class instance returns the prototype
    if (ts.isIdentifier(expression.expression.expression) && expression.expression.expression.text === "Object" && expression.expression.name.text === "getPrototypeOf" && expression.arguments.length === 1) {
      const [target] = expression.arguments;
      const receiverClass = resolveReceiverClass(target, bindings);
      if (receiverClass !== undefined) {
        return { kind: "variable", name: classPrototypeName(receiverClass.name) };
      }
    }
    if (expression.arguments.length === 0) {
      const method = expression.expression.name.text;
      if (method === "valueOf" || method === "toString") {
        // Only a boxed primitive. `boxedValueOf` and `boxedToString` read the receiver's single
        // stored value, which is the primitive for a boxed Number/Boolean/String and *not* what
        // `Object.prototype` promises: on a plain runtime object `o.toString()` returned the first
        // own property's value and `o.valueOf()` returned it too, where JavaScript returns
        // "[object Object]" and the object. A plain object now declines and is reported, rather
        // than compiled to the wrong answer.
        if (lowerBoxedPrimitiveReceiver(expression.expression.expression, bindings) === undefined) {
          return undefined;
        }
        const receiver = lowerValueExpression(expression.expression.expression, bindings);
        if (receiver === undefined) {
          return undefined;
        }
        return { kind: "boxedMethodCall", receiver, method };
      }
    }
  }

  if (ts.isTaggedTemplateExpression(expression) && ts.isIdentifier(expression.tag)) {
    const tagBinding = bindings.get(expression.tag.text);
    if (tagBinding?.kind === "function") {
      const { template } = expression;
      if (ts.isNoSubstitutionTemplateLiteral(template)) {
        const value = lowerStringRuntimeExpression(template, bindings);
        if (value === undefined) {
          return undefined;
        }
        return { kind: "string", value };
      }
      const headText = template.head.text;
      const middleTexts: string[] = [];
      const middleExpressions: JsIrValueExpression[] = [];
      for (const span of template.templateSpans) {
        middleTexts.push(span.literal.text);
        const exprValue = lowerValueExpression(span.expression, bindings);
        if (exprValue === undefined) {
          return undefined;
        }
        middleExpressions.push(exprValue);
      }
      const hasRest = tagBinding.parameters.some((parameter) => parameter.isRest === true);
      return {
        kind: "taggedTemplateValue",
        tag: expression.tag.text,
        head: headText,
        middleTexts,
        expressions: middleExpressions,
        wrapValuesInRest: hasRest
      };
    }
  }

  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.CommaToken) {
    const left = lowerValueExpression(expression.left, bindings);
    const right = lowerValueExpression(expression.right, bindings);
    if (left !== undefined && right !== undefined) {
      return { kind: "sequence", left, right };
    }
  }

  if (expression.kind === ts.SyntaxKind.NullKeyword) {
    return { kind: "null" };
  }

  if (ts.isIdentifier(expression)) {
    const binding = bindings.get(expression.text);
    if (binding?.kind === "value") {
      return binding.value;
    }
    if (binding?.kind === "valueVariable") {
      return { kind: "variable", name: binding.name };
    }
  }

  if (ts.isConditionalExpression(expression)) {
    return lowerValueConditionalExpression(expression, bindings);
  }

  if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text !== "print") {
    return lowerValueCallExpression(expression, bindings);
  }

  if (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression)) {
    const jsonParse = lowerJsonParseCall(expression, bindings);
    if (jsonParse !== undefined) {
      return jsonParse;
    }
    const jsonStringify = lowerJsonStringifyCall(expression, bindings);
    if (jsonStringify !== undefined) {
      return jsonStringify;
    }
    const arrayMethod = lowerArrayValueMethodCall(expression, bindings);
    if (arrayMethod !== undefined) {
      return arrayMethod;
    }
    const collectionMethod = lowerRuntimeCollectionValueMethodCall(expression, bindings);
    if (collectionMethod !== undefined) {
      return collectionMethod;
    }
    const stringMethod = lowerStringValueMethodCall(expression, bindings);
    if (stringMethod !== undefined) {
      return stringMethod;
    }
  }

  return undefined;
}

// eslint-disable-next-line complexity, max-statements -- RegExp values share one lowering seam across literals, constructors, exec, and match.
function lowerRegexValueExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  if (expression.kind === ts.SyntaxKind.RegularExpressionLiteral) {
    const text = expression.getText();
    const lastSlash = text.lastIndexOf("/");
    if (lastSlash <= 0) {
      return undefined;
    }
    const pattern = text.slice(1, lastSlash);
    const flags = text.slice(lastSlash + 1);
    if (unsupportedRegExpPatternMessage(pattern, flags) !== undefined) {
      return undefined;
    }
    return {
      kind: "regexCompile",
      pattern: { kind: "literal", value: pattern },
      flags: { kind: "literal", value: flags }
    };
  }
  if (isRegExpConstructorCall(expression)) {
    const args = expression.arguments ?? ts.factory.createNodeArray<ts.Expression>();
    if (args.length > regexpConstructorArgumentCount) {
      return undefined;
    }
    let pattern: JsIrStringExpression | undefined = { kind: "literal", value: "" };
    if (args.length > 0) {
      pattern = lowerStringRuntimeExpression(args[0], bindings);
    }
    let flags: JsIrStringExpression | undefined = { kind: "literal", value: "" };
    if (args.length >= regexpConstructorArgumentCount) {
      flags = lowerStringRuntimeExpression(args[1], bindings);
    }
    if (pattern === undefined || flags === undefined) {
      return undefined;
    }
    return { kind: "regexCompile", pattern, flags };
  }
  if (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression)) {
    const method = expression.expression.name.text;
    if ((method === "exec" || method === "match") && expression.arguments.length === 1) {
      if (method === "exec") {
        const regex = lowerValueExpression(expression.expression.expression, bindings);
        const input = lowerStringRuntimeExpression(expression.arguments[0], bindings);
        if (regex !== undefined && input !== undefined) {
          return { kind: "regexExec", regex, input };
        }
      } else {
        const input = lowerStringRuntimeExpression(expression.expression.expression, bindings);
        const regex = lowerValueExpression(expression.arguments[0], bindings);
        if (regex !== undefined && input !== undefined) {
          return { kind: "regexMatch", regex, input };
        }
      }
    }
  }
  return undefined;
}

function lowerRegexTestCondition(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Extract<JsIrCondition, { readonly kind: "regexTest" }> | undefined {
  if (
    !ts.isCallExpression(expression) ||
    !ts.isPropertyAccessExpression(expression.expression) ||
    expression.expression.name.text !== "test" ||
    expression.arguments.length !== 1
  ) {
    return undefined;
  }
  const regex = lowerValueExpression(expression.expression.expression, bindings);
  const input = lowerStringRuntimeExpression(expression.arguments[0], bindings);
  if (regex === undefined || input === undefined) {
    return undefined;
  }
  return { kind: "regexTest", regex, input };
}

function lowerPlainConstructorArguments(
  parameters: readonly JsIrFunctionParameter[],
  args: ts.NodeArray<ts.Expression>,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): readonly JsIrCallArgument[] | undefined {
  if (args.length > parameters.length || parameters.some((parameter) => parameter.isRest === true)) {
    return undefined;
  }
  const lowered: JsIrCallArgument[] = [];
  for (let index = 0; index < parameters.length; index += 1) {
    const parameter = parameters[index];
    if (index < args.length) {
      const value = lowerTypedCallArgument(parameter, args[index], bindings);
      if (value === undefined) {
        return undefined;
      }
      lowered.push(value);
    } else if (parameter.valueKind === "value") {
      lowered.push({ valueKind: "value", value: { kind: "undefined" } });
    } else if (parameter.valueKind === "number" && parameter.defaultValue !== undefined) {
      lowered.push({ valueKind: "number", value: parameter.defaultValue });
    } else {
      return undefined;
    }
  }
  return lowered;
}

// eslint-disable-next-line complexity, max-statements -- Function value lowering validates both declaration references and inline function syntax.
function lowerFunctionObjectValue(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  inferredName?: string
): JsIrValueExpression | undefined {
  const unwrappedExpression = unwrapTypeOnlyExpression(expression);
  if (unwrappedExpression !== expression) {
    return lowerFunctionObjectValue(unwrappedExpression, bindings, inferredName);
  }
  if (ts.isIdentifier(expression)) {
    const binding = bindings.get(expression.text);
    if (binding?.kind !== "function" && binding?.kind !== "functionReference") {
      return undefined;
    }
    const codeName = `__tscn_fnobj_ref_${expression.text}_${nextFunctionObjectId}`.replace(/[^A-Za-z0-9_]/g, "_");
    nextFunctionObjectId += 1;
    return {
      kind: "functionObject",
      definition: {
        codeName,
        parameters: binding.parameters,
        functionKind: "ordinary",
        returnKind: binding.returnKind,
        directTarget: expression.text
      }
    };
  }

  if (!ts.isArrowFunction(expression) && !ts.isFunctionExpression(expression)) {
    return undefined;
  }
  if ((ts.isFunctionExpression(expression) && expression.asteriskToken !== undefined) || expression.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) === true) {
    return undefined;
  }

  const functionKind = functionExpressionKind(expression);
  if (functionKind === "arrow" && containsLexicalThis(expression.body)) {
    return undefined;
  }
  const parameters: JsIrFunctionParameter[] = [];
  const functionBindings = functionFrameBindings(bindings);
  if (functionKind === "ordinary") {
    functionBindings.set(CLASS_THIS_NAME, { kind: "valueVariable", name: CLASS_THIS_NAME });
  }
  for (const parameter of runtimeParameters(expression.parameters)) {
    if (!ts.isIdentifier(parameter.name) || parameter.initializer !== undefined || parameter.dotDotDotToken !== undefined) {
      return undefined;
    }
    const valueKind = parameterValueKind(parameter);
    parameters.push({ name: parameter.name.text, valueKind });
    bindFunctionParameter(parameter.name.text, valueKind, false, functionBindings);
  }
  const selfNames = new Set<string>();
  if (ts.isFunctionExpression(expression) && expression.name !== undefined && bindings.get(expression.name.text) === undefined) {
    selfNames.add(expression.name.text);
  }
  if (inferredName !== undefined && bindings.get(inferredName) === undefined) {
    selfNames.add(inferredName);
  }
  // A function object is emitted under a generated `__tscn_fnobj_*` name with
  // the dynamic (argc/argv) calling convention, so a recursive reference to
  // its own name — or to the variable its initializer is being bound to, which
  // is not bound yet during lowering — would compile into a direct call to a
  // function that is never emitted. Reject such self-references outright.
  if (selfNames.size > 0 && functionExpressionSelfReferences(expression.body, selfNames)) {
    return undefined;
  }
  const body = lowerInlineFunctionBody(expression.body, functionBindings);
  if (body === undefined) {
    return undefined;
  }
  const runtimeName = expression.name?.text ?? inferredName;
  const displayName = runtimeName ?? "anonymous";
  const codeName = `__tscn_fnobj_${displayName}_${nextFunctionObjectId}`.replace(/[^A-Za-z0-9_]/g, "_");
  nextFunctionObjectId += 1;
  return {
    kind: "functionObject",
    definition: {
      codeName,
      parameters,
      functionKind,
      returnKind: functionReturnKind(body),
      body,
      inferredName: runtimeName
    }
  };
}

















function lowerRuntimeCollectionValueMethodCall(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  if (!ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression) || expression.arguments.length !== 1) {
    return undefined;
  }
  const receiver = expression.expression.expression.text;
  const binding = bindings.get(receiver);
  if (binding?.kind !== "runtimeMap" || expression.expression.name.text !== "get") {
    return undefined;
  }
  const key = lowerValueExpression(expression.arguments[0], bindings);
  if (key === undefined) {
    return undefined;
  }
  return { kind: "runtimeMapGet", mapName: binding.name, key };
}

const jsonMaxIndent = 10;
const jsonStringifyMaxArgumentCount = 3;

// eslint-disable-next-line complexity -- JSON.stringify routes value, replacer, and indent argument shapes in one place.
function lowerJsonStringifyCall(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  if (!ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression)) {
    return undefined;
  }
  if (expression.expression.expression.text !== "JSON" || expression.expression.name.text !== "stringify" || bindings.has("JSON")) {
    return undefined;
  }
  if (expression.arguments.length === 0 || expression.arguments.length > jsonStringifyMaxArgumentCount) {
    return undefined;
  }
  const value = lowerValueExpression(expression.arguments[0], bindings);
  if (value === undefined) {
    return undefined;
  }
  let replacerName: string | undefined;
  if (expression.arguments.length >= 2) {
    const replacer = unwrapTypeOnlyExpression(expression.arguments[1]);
    const isNullish = replacer.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(replacer) && replacer.text === "undefined");
    if (!isNullish) {
      if (!ts.isIdentifier(replacer)) {
        return undefined;
      }
      const binding = bindings.get(replacer.text);
      if (binding?.kind !== "runtimeArray") {
        return undefined;
      }
      replacerName = binding.name;
    }
  }
  let indent = 0;
  if (expression.arguments.length === jsonStringifyMaxArgumentCount) {
    const indentExpression = unwrapTypeOnlyExpression(expression.arguments[2]);
    if (!ts.isNumericLiteral(indentExpression)) {
      return undefined;
    }
    indent = Math.min(Math.trunc(Number(indentExpression.text)), jsonMaxIndent);
    if (indent < 0 || Number.isNaN(indent)) {
      return undefined;
    }
  }
  return { kind: "jsonStringify", value, replacerName, indent };
}

const jsonParseMaxArgumentCount = 2;

function lowerJsonParseCall(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  if (!ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression)) {
    return undefined;
  }
  if (expression.expression.expression.text !== "JSON" || expression.expression.name.text !== "parse" || bindings.has("JSON")) {
    return undefined;
  }
  if (expression.arguments.length === 0 || expression.arguments.length > jsonParseMaxArgumentCount) {
    return undefined;
  }
  const text = lowerValueExpression(expression.arguments[0], bindings);
  if (text === undefined) {
    return undefined;
  }
  let reviver: JsIrValueExpression | undefined;
  if (expression.arguments.length === jsonParseMaxArgumentCount) {
    reviver = lowerValueExpression(expression.arguments[1], bindings);
    if (reviver === undefined) {
      return undefined;
    }
  }
  return { kind: "jsonParse", text, reviver };
}

// `JSON.parse(...)` / `JSON.stringify(...)` used as a standalone statement still
// needs the call to execute (parse errors and cycles throw), so the value is
// materialized into a fresh throwaway slot.
function lowerJsonStatementCall(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression)) {
    return undefined;
  }
  if (expression.expression.expression.text !== "JSON" || bindings.has("JSON")) {
    return undefined;
  }
  const method = expression.expression.name.text;
  if (method !== "parse" && method !== "stringify") {
    return undefined;
  }
  const value = lowerValueExpression(expression, bindings);
  if (value === undefined) {
    return undefined;
  }
  const name = `__tscn_json_stmt_${nextJsonStatementValueId}`;
  nextJsonStatementValueId += 1;
  return { kind: "letValue", name, value };
}

// Function objects carry no `prototype` property in the current runtime;
// reject the access instead of letting it evaluate to undefined.
function isFunctionPrototypeAccess(
  expression: ts.PropertyAccessExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): boolean {
  if (expression.name.text !== "prototype" || !ts.isIdentifier(expression.expression)) {
    return false;
  }
  const binding = bindings.get(expression.expression.text);
  return (
    binding?.kind === "function" ||
    binding?.kind === "functionReference" ||
    (binding?.kind === "valueVariable" && binding.valueType === "function")
  );
}

function lowerOptionalChainValueExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.name)) {
    if (isFunctionPrototypeAccess(expression, bindings)) {
      return undefined;
    }
    const receiver = lowerValueExpression(expression.expression, bindings);
    if (receiver === undefined) {
      return undefined;
    }
    const key: JsIrStringExpression = { kind: "literal", value: expression.name.text };
    const makeAccess = (value: JsIrValueExpression): JsIrValueExpression => ({ kind: "valueObjectDynamicAccess", value, key });
    return buildOptionalChainLink(receiver, makeAccess, expression.questionDotToken !== undefined);
  }
  if (ts.isElementAccessExpression(expression)) {
    const receiver = lowerValueExpression(expression.expression, bindings);
    if (receiver === undefined) {
      return undefined;
    }
    const makeAccess = optionalElementAccessFactory(expression, bindings);
    if (makeAccess === undefined) {
      return undefined;
    }
    return buildOptionalChainLink(receiver, makeAccess, expression.questionDotToken !== undefined);
  }
  if (ts.isCallExpression(expression) && expression.questionDotToken !== undefined) {
    const callee = lowerValueExpression(expression.expression, bindings);
    if (callee !== undefined && (callee.kind === "undefined" || callee.kind === "null")) {
      return { kind: "undefined" };
    }
  }
  return undefined;
}

function buildOptionalChainLink(
  receiver: JsIrValueExpression,
  makeAccess: (value: JsIrValueExpression) => JsIrValueExpression,
  isOptionalLink: boolean
): JsIrValueExpression {
  if (isOptionalLink) {
    return { kind: "optionalChain", guard: receiver, access: makeAccess({ kind: "optionalTarget" }) };
  }
  if (receiver.kind === "optionalChain") {
    return { ...receiver, access: makeAccess(receiver.access) };
  }
  return makeAccess(receiver);
}

function optionalElementAccessFactory(
  expression: ts.ElementAccessExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): ((value: JsIrValueExpression) => JsIrValueExpression) | undefined {
  let index = lowerNumberExpression(expression.argumentExpression, bindings);
  const stringIndex = lowerCanonicalArrayIndexString(expression.argumentExpression);
  if (stringIndex !== undefined) {
    index = { kind: "literal", value: stringIndex };
  }
  if (index !== undefined) {
    const resolvedIndex = index;
    let keyValue = "0";
    if (resolvedIndex.kind === "literal") {
      keyValue = String(resolvedIndex.value);
    }
    return (value) => ({ kind: "valueArrayAccess", value, index: resolvedIndex, key: { kind: "literal", value: keyValue } });
  }
  const key = lowerPropertyKeyExpression(expression.argumentExpression, bindings);
  if (key !== undefined) {
    return (value) => ({ kind: "valueObjectDynamicAccess", value, key });
  }
  return undefined;
}

function lowerArrayValueMethodCall(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  if (!ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression)) {
    return undefined;
  }
  const arrayName = expression.expression.expression.text;
  if (bindings.get(arrayName)?.kind !== "runtimeArray") {
    return undefined;
  }
  const method = expression.expression.name.text;
  if (method === "pop" || method === "shift") {
    return { kind: arrayRemoveValueExpressionKind(method), arrayName };
  }
  if (method === "includes" && expression.arguments.length === 1) {
    const value = lowerValueExpression(expression.arguments[0], bindings);
    if (value !== undefined) {
      return { kind: "arrayIncludes", arrayName, value };
    }
  }
  if (method === "at" && expression.arguments.length === 1) {
    const index = lowerNumberExpression(expression.arguments[0], bindings);
    if (index !== undefined) {
      return { kind: "arrayAt", arrayName, index };
    }
  }
  if (method === "find" && expression.arguments.length === 0) {
    return { kind: "arrayFind", arrayName };
  }
  if (method === "forEach" && expression.arguments.length === 0) {
    return { kind: "arrayForEach", arrayName };
  }
  return undefined;
}

function arrayRemoveValueExpressionKind(method: "pop" | "shift"): "arrayPop" | "arrayShift" {
  if (method === "pop") {
    return "arrayPop";
  }
  return "arrayShift";
}

function lowerValueConditionalExpression(
  expression: ts.ConditionalExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  const condition = lowerConditionExpression(expression.condition, bindings);
  const consequent = lowerValueExpression(expression.whenTrue, bindings);
  const alternate = lowerValueExpression(expression.whenFalse, bindings);
  if (condition.kind !== "lowered" || consequent === undefined || alternate === undefined) {
    return undefined;
  }
  return { kind: "ternary", condition: condition.operation, consequent, alternate };
}

function lowerValueCallExpression(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  const spreadCall = lowerSpreadCallValue(expression, bindings);
  if (spreadCall !== undefined) {
    return spreadCall;
  }
  if (ts.isIdentifier(expression.expression)) {
    const callee = bindings.get(expression.expression.text);
    if (callee?.kind === "function" && callee.returnKind === "value") {
      const args = lowerCallArguments(expression.expression.text, expression.arguments, bindings);
      if (args === undefined) {
        return undefined;
      }
      return { kind: "call", name: expression.expression.text, arguments: args };
    }
    // See `lowerCallStatement`: an unbound global has no definition behind it, while an unbound
    // cross-module function does.
    if (callee === undefined && isKnownGlobalCallee(expression.expression)) {
      return undefined;
    }
  }

  if (isPlannedBuiltinCall(expression.expression, bindings)) {
    return undefined;
  }
  const calleeValue = lowerValueExpression(expression.expression, bindings);
  const args = lowerValueCallArguments(expression.arguments, bindings);
  if (calleeValue === undefined || args === undefined) {
    return undefined;
  }
  return {
    kind: "callValue",
    callee: calleeValue,
    arguments: args,
    thisValue: lowerCallThisValue(expression.expression, bindings),
    optionalCallee: optionalStatementCallee(expression)
  };
}

function lowerCallThisValue(
  callee: ts.LeftHandSideExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  if (ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee)) {
    return lowerValueExpression(callee.expression, bindings);
  }
  return undefined;
}

function lowerMethodCallTarget(
  callee: ts.LeftHandSideExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): { readonly receiver: JsIrValueExpression; readonly key: JsIrStringExpression } | undefined {
  if (ts.isPropertyAccessExpression(callee)) {
    const receiver = lowerValueExpression(callee.expression, bindings);
    if (receiver === undefined) {
      return undefined;
    }
    return { receiver, key: { kind: "literal", value: callee.name.text } };
  }
  if (ts.isElementAccessExpression(callee)) {
    const receiver = lowerValueExpression(callee.expression, bindings);
    const key = lowerPropertyKeyExpression(callee.argumentExpression, bindings);
    if (receiver === undefined || key === undefined) {
      return undefined;
    }
    return { receiver, key };
  }
  return undefined;
}

// eslint-disable-next-line max-statements -- Spread lowering validates fixed and iterable arguments before preserving a single method receiver evaluation.
function lowerSpreadCallValue(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Extract<JsIrValueExpression, { readonly kind: "callValue" }> | undefined {
  if (!expression.arguments.some(ts.isSpreadElement)) {
    return undefined;
  }
  if (ts.isIdentifier(expression.expression)) {
    const directFunction = bindings.get(expression.expression.text);
    const hasRestParameter = directFunction?.kind === "function" && directFunction.parameters.some((parameter) => parameter.isRest === true);
    const spreadsAreFixed = expression.arguments.every((argument) => {
      if (!ts.isSpreadElement(argument)) {
        return true;
      }
      return ts.isIdentifier(argument.expression) && bindings.get(argument.expression.text)?.kind === "array";
    });
    if (hasRestParameter && spreadsAreFixed) {
      return undefined;
    }
  }
  const callee = lowerValueExpression(expression.expression, bindings);
  if (callee === undefined) {
    return undefined;
  }
  const methodTarget = lowerMethodCallTarget(expression.expression, bindings);
  const spreadArguments: JsIrRuntimeArrayElement[] = [];
  for (const argument of expression.arguments) {
    if (ts.isSpreadElement(argument)) {
      if (ts.isIdentifier(argument.expression)) {
        const binding = bindings.get(argument.expression.text);
        if (binding?.kind === "array") {
          spreadArguments.push({ kind: "spread", arrayName: binding.name, sourceKind: "fixed" });
          continue;
        }
      }
      const source = lowerValueExpression(argument.expression, bindings);
      if (source === undefined) {
        return undefined;
      }
      spreadArguments.push({
        kind: "iterableSpread",
        source,
        notIterableMessage: `${iteratorErrorSubject(argument.expression)} is not iterable`
      });
      continue;
    }
    const value = lowerValueExpression(argument, bindings);
    if (value === undefined) {
      return undefined;
    }
    spreadArguments.push({ kind: "value", value });
  }
  let thisValue: JsIrValueExpression | undefined;
  if (methodTarget === undefined) {
    thisValue = lowerCallThisValue(expression.expression, bindings);
  }
  return {
    kind: "callValue",
    callee,
    arguments: [],
    thisValue,
    methodReceiver: methodTarget?.receiver,
    methodKey: methodTarget?.key,
    spreadArguments
  };
}

function lowerStringValueMethodCall(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  const stringMethod = lowerStringMethodCall(expression, bindings);
  if (stringMethod !== undefined) {
    if (typeof stringMethod === "object") {
      return { kind: "undefined" };
    }
    if (typeof stringMethod === "string") {
      return { kind: "string", value: { kind: "literal", value: stringMethod } };
    }
    if (typeof stringMethod === "number") {
      if (Number.isNaN(stringMethod)) {
        return { kind: "number", value: { kind: "nan" } };
      }
      return { kind: "number", value: { kind: "literal", value: stringMethod } };
    }
    return { kind: "boolean", value: { kind: "boolean", value: stringMethod } };
  }
  return lowerRuntimeStringMethodCall(expression, bindings);
}

// eslint-disable-next-line complexity, max-statements -- Runtime string method dispatch routes every method to a dedicated IR node for emission.
function lowerRuntimeStringMethodCall(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  if (!ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression)) {
    return undefined;
  }
  const receiverName = expression.expression.expression.text;
  const receiverBinding = bindings.get(receiverName);
  if (receiverBinding === undefined) {
    return undefined;
  }
  const receiver = lowerStringRuntimeExpression(expression.expression.expression, bindings);
  if (receiver === undefined) {
    return undefined;
  }
  const method = expression.expression.name.text;
  const args = [...expression.arguments];
  const first = args.at(0);
  if ((method === "startsWith" || method === "endsWith") && (args.length === 1 || args.length === 2)) {
    if (first === undefined) {
      return undefined;
    }
    const search = lowerStringRuntimeExpression(first, bindings);
    if (search === undefined) {
      return undefined;
    }
    let position: JsIrNumberExpression | undefined;
    if (args.length === 2) {
      const pos = lowerNumberExpression(args[1], bindings);
      if (pos === undefined) {
        return undefined;
      }
      position = pos;
    }
    if (method === "startsWith") {
      if (position === undefined) {
        return { kind: "stringStartsWith", receiver, search };
      }
      return { kind: "stringStartsWith", receiver, search, position };
    }
    if (position === undefined) {
      return { kind: "stringEndsWith", receiver, search };
    }
    return { kind: "stringEndsWith", receiver, search, position };
  }
  if ((method === "charCodeAt" || method === "codePointAt") && args.length === 1) {
    if (first === undefined) {
      return undefined;
    }
    const index = lowerNumberExpression(first, bindings);
    if (index === undefined) {
      return undefined;
    }
    if (method === "charCodeAt") {
      return { kind: "stringCharCodeAt", receiver, index };
    }
    return { kind: "stringCodePointAt", receiver, index };
  }
  if (method === "indexOf" && (args.length === 1 || args.length === 2)) {
    if (first === undefined) {
      return undefined;
    }
    const search = lowerStringRuntimeExpression(first, bindings);
    if (search === undefined) {
      return undefined;
    }
    let position: JsIrNumberExpression | undefined;
    if (args.length === 2) {
      const loweredPosition = lowerNumberExpression(args[1], bindings);
      if (loweredPosition === undefined) {
        return undefined;
      }
      position = loweredPosition;
    }
    return { kind: "stringIndexOf", receiver, search, position };
  }
  if (method === "lastIndexOf" && args.length === 1) {
    if (first === undefined) {
      return undefined;
    }
    const search = lowerStringRuntimeExpression(first, bindings);
    if (search === undefined) {
      return undefined;
    }
    return { kind: "stringLastIndexOf", receiver, search };
  }
  if (method === "localeCompare" && args.length === 1) {
    if (first === undefined) {
      return undefined;
    }
    const other = lowerStringRuntimeExpression(first, bindings);
    if (other === undefined) {
      return undefined;
    }
    return { kind: "stringLocaleCompare", receiver, index: { kind: "literal", value: 0 }, other };
  }
  if (method === "at" && args.length === 1) {
    if (first === undefined) {
      return undefined;
    }
    const position = lowerNumberExpression(first, bindings);
    if (position === undefined) {
      return undefined;
    }
    return { kind: "string", value: { kind: "stringMethod", method: "at", receiver, position } };
  }
  if (method === "normalize" && args.length === 0) {
    return { kind: "string", value: { kind: "stringMethod", method: "normalize", receiver } };
  }
  return undefined;
}

// eslint-disable-next-line complexity, max-statements -- String method folding centralizes the narrow boxed-string roadmap slice.
function lowerStringMethodCall(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): string | number | boolean | { readonly kind: "undefined" } | undefined {
  if (!ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression)) {
    return undefined;
  }
  const receiverName = expression.expression.expression.text;
  const value = stringLiteralBindingValue(bindings.get(receiverName));
  if (value === undefined) {
    return undefined;
  }
  const method = expression.expression.name.text;
  const args = [...expression.arguments];
  const first = args.at(0);
  const second = args.at(1);
  if ((method === "includes" || method === "indexOf" || method === "startsWith" || method === "endsWith") && (expression.arguments.length === 1 || expression.arguments.length === 2)) {
    const search = lowerStringSearchArgument(first, bindings);
    let fromIndex = 0;
    if (second !== undefined) {
      const fromNumber = lowerNumberExpression(second, bindings);
      if (fromNumber === undefined) {
        return undefined;
      }
      const literal = numericLiteralValue(fromNumber);
      if (literal === undefined) {
        return undefined;
      }
      fromIndex = literal;
    }
    if (search === undefined) {
      return undefined;
    }
    if (method === "includes") {
      return value.includes(search, fromIndex);
    }
    if (method === "startsWith") {
      return value.startsWith(search, fromIndex);
    }
    if (method === "endsWith") {
      let endPosition: number | undefined;
      if (second !== undefined) {
        endPosition = fromIndex;
      }
      return value.endsWith(search, endPosition);
    }
    return value.indexOf(search, fromIndex);
  }
  if (method === "trim" && expression.arguments.length === 0) {
    return value.trim();
  }
  if (method === "trimStart" && expression.arguments.length === 0) {
    return value.trimStart();
  }
  if (method === "trimEnd" && expression.arguments.length === 0) {
    return value.trimEnd();
  }
  let firstLiteral: number | undefined;
  if (first !== undefined) {
    const firstNumber = lowerNumberExpression(first, bindings);
    if (firstNumber !== undefined) {
      firstLiteral = numericLiteralValue(firstNumber);
    }
  }
  let secondLiteral: number | undefined;
  if (second !== undefined) {
    const secondNumber = lowerNumberExpression(second, bindings);
    if (secondNumber !== undefined) {
      secondLiteral = numericLiteralValue(secondNumber);
    }
  }
  if ((first !== undefined && firstLiteral === undefined) || (second !== undefined && secondLiteral === undefined)) {
    return undefined;
  }
  if (method === "charAt" && expression.arguments.length === 1) {
    return value.charAt(Math.max(0, firstLiteral ?? 0));
  }
  if (method === "charCodeAt" && expression.arguments.length === 1) {
    return value.charCodeAt(Math.max(0, firstLiteral ?? 0));
  }
  if (method === "codePointAt" && expression.arguments.length === 1) {
    return value.codePointAt(Math.max(0, firstLiteral ?? 0)) ?? { kind: "undefined" };
  }
  if (method === "at" && expression.arguments.length === 1) {
    return value.at(firstLiteral ?? 0) ?? { kind: "undefined" };
  }
  if (method === "slice" && (expression.arguments.length === 1 || expression.arguments.length === 2)) {
    return value.slice(firstLiteral ?? 0, secondLiteral);
  }
  if (method === "substring" && (expression.arguments.length === 1 || expression.arguments.length === 2)) {
    return value.substring(firstLiteral ?? 0, secondLiteral);
  }
  if (method === "substr" && (expression.arguments.length === 1 || expression.arguments.length === 2)) {
    return stringSubstr(value, firstLiteral ?? 0, secondLiteral);
  }
  return undefined;
}

function stringLiteralBindingValue(receiver: JsIrBindingValue | undefined): string | undefined {
  if (receiver?.kind === "string") {
    const { value } = receiver;
    return value;
  }
  if (receiver?.kind === "stringExpression" && receiver.value.kind === "literal") {
    const { value } = receiver.value;
    return value;
  }
  if (receiver?.kind === "value" && receiver.value.kind === "string" && receiver.value.value.kind === "literal") {
    const { value } = receiver.value.value;
    return value;
  }
  return undefined;
}

function stringSubstr(value: string, start: number, length: number | undefined): string {
  let from = start;
  if (from < 0) {
    from = Math.max(value.length + from, 0);
  }
  if (length === undefined) {
    return value.slice(from);
  }
  if (length < 0) {
    return "";
  }
  return value.slice(from, from + length);
}

function lowerStringSearchArgument(expression: ts.Expression | undefined, bindings: ReadonlyMap<string, JsIrBindingValue>): string | undefined {
  if (expression === undefined) {
    return undefined;
  }
  const lowered = lowerStringRuntimeExpression(expression, bindings);
  if (lowered?.kind === "literal") {
    return lowered.value;
  }
  return undefined;
}

function numericLiteralValue(expression: JsIrNumberExpression): number | undefined {
  if (expression.kind === "literal") {
    return expression.value;
  }
  if (expression.kind === "nan") {
    return Number.NaN;
  }
  if (expression.kind === "negatedZero") {
    return -0;
  }
  if (expression.kind === "unary") {
    const value = numericLiteralValue(expression.value);
    if (value === undefined) {
      return undefined;
    }
    return -value;
  }
  return undefined;
}

function lowerLogicalConditionExpression(
  expression: ts.BinaryExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {
  if (
    expression.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken &&
    expression.operatorToken.kind !== ts.SyntaxKind.BarBarToken
  ) {
    return undefined;
  }

  const left = lowerConditionExpression(expression.left, bindings);
  const right = lowerConditionExpression(expression.right, bindings);
  if (left.kind !== "lowered" || right.kind !== "lowered") {
    return undefined;
  }

  if (expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    return { kind: "and", left: left.operation, right: right.operation };
  }

  return { kind: "or", left: left.operation, right: right.operation };
}

































// eslint-disable-next-line complexity, max-statements -- Numeric literal/identifier/NaN/prefix-unary recognition centralizes the canonical JSValue conversion paths.
function lowerNumberExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrNumberExpression | undefined {
  const unwrappedExpression = unwrapTypeOnlyExpression(expression);
  if (unwrappedExpression !== expression) {
    return lowerNumberExpression(unwrappedExpression, bindings);
  }

  const regexSearch = lowerRegexSearchNumberExpression(expression, bindings);
  if (regexSearch !== undefined) {
    return regexSearch;
  }

  const numericBuiltin = lowerNumericBuiltinCall(expression, bindings);
  if (numericBuiltin !== undefined) {
    return numericBuiltin;
  }

  if (ts.isNumericLiteral(expression)) {
    return {
      kind: "literal",
      value: Number(expression.text)
    };
  }

  if (ts.isIdentifier(expression)) {
    if (expression.text === "NaN") {
      return { kind: "nan" };
    }
    if (expression.text === "Infinity") {
      return { kind: "literal", value: Number.POSITIVE_INFINITY };
    }
    const binding = bindings.get(expression.text);
    if (binding?.kind !== "number") {
      return undefined;
    }
    return binding.value;
  }

  if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === "Math") {
    if (expression.name.text === "PI") {
      return { kind: "literal", value: Math.PI };
    }
    if (expression.name.text === "E") {
      return { kind: "literal", value: Math.E };
    }
    if (expression.name.text === "NaN") {
      return { kind: "nan" };
    }
    if (expression.name.text === "Infinity") {
      return { kind: "literal", value: Number.POSITIVE_INFINITY };
    }
  }

  if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === "Number") {
    const constant = numberConstantValue(expression.name.text);
    if (constant !== undefined) {
      return numberExpressionFromNumber(constant);
    }
  }

  if (
    ts.isPrefixUnaryExpression(expression) &&
    expression.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(expression.operand) &&
    expression.operand.text === "0"
  ) {
    return { kind: "negatedZero" };
  }

  if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text !== "print" && expression.expression.text !== "Boolean" && expression.expression.text !== "isNaN") {
    return lowerNumberCallExpression(expression, bindings);
  }

  if (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression)) {
    const method = lowerArrayNumberMethodCall(expression, bindings);
    if (method !== undefined) {
      return method;
    }
    const stringMethod = lowerStringNumberMethodCall(expression, bindings);
    if (stringMethod !== undefined) {
      return stringMethod;
    }
  }

  const classNumber = lowerClassNumberAccess(expression, bindings);
  if (classNumber !== undefined) {
    return classNumber;
  }

  const access = lowerNumberAccessExpression(expression, bindings);
  if (access !== undefined) {
    return access;
  }

  const collectionSize = lowerRuntimeCollectionSizeExpression(expression, bindings);
  if (collectionSize !== undefined) {
    return collectionSize;
  }

  if (ts.isPrefixUnaryExpression(expression) && expression.operator === ts.SyntaxKind.MinusToken) {
    const value = lowerNumberExpression(expression.operand, bindings);
    if (value === undefined) {
      return undefined;
    }

    return {
      kind: "unary",
      operator: "negate",
      value
    };
  }

  if (ts.isPrefixUnaryExpression(expression) && expression.operator === ts.SyntaxKind.TildeToken) {
    const value = lowerNumberExpression(expression.operand, bindings);
    if (value === undefined) {
      return undefined;
    }
    return { kind: "unary", operator: "bitNot", value };
  }

  const update = lowerUpdateNumberExpression(expression, bindings);
  if (update !== undefined) {
    return update;
  }

  if (ts.isConditionalExpression(expression)) {
    return lowerNumberConditionalExpression(expression, bindings);
  }

  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.CommaToken) {
    const left = lowerValueExpression(expression.left, bindings);
    if (left === undefined) {
      return undefined;
    }
    const rightValue = lowerValueExpression(expression.right, bindings);
    if (rightValue === undefined) {
      return undefined;
    }
    return { kind: "valueToNumber", value: { kind: "sequence", left, right: rightValue } };
  }

  if (!ts.isBinaryExpression(expression)) {
    return undefined;
  }

  return lowerNumberBinaryExpression(expression, bindings);
}

function lowerRegexSearchNumberExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Extract<JsIrNumberExpression, { readonly kind: "regexSearch" }> | undefined {
  if (
    !ts.isCallExpression(expression) ||
    !ts.isPropertyAccessExpression(expression.expression) ||
    expression.expression.name.text !== "search" ||
    expression.arguments.length !== 1
  ) {
    return undefined;
  }
  const input = lowerStringRuntimeExpression(expression.expression.expression, bindings);
  const regex = lowerValueExpression(expression.arguments[0], bindings);
  if (input === undefined || regex === undefined || !isRegexExpression(expression.arguments[0], bindings)) {
    return undefined;
  }
  return { kind: "regexSearch", regex, input };
}

function lowerUpdateNumberExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Extract<JsIrNumberExpression, { readonly kind: "update" }> | undefined {
  if (ts.isPrefixUnaryExpression(expression) && (expression.operator === ts.SyntaxKind.PlusPlusToken || expression.operator === ts.SyntaxKind.MinusMinusToken) && ts.isIdentifier(expression.operand)) {
    const binding = bindings.get(expression.operand.text);
    if (binding?.kind === "number" && binding.value.kind === "variable") {
      return { kind: "update", name: expression.operand.text, operator: updateOperator(expression.operator), prefix: true };
    }
  }
  if (ts.isPostfixUnaryExpression(expression) && ts.isIdentifier(expression.operand)) {
    const binding = bindings.get(expression.operand.text);
    if (binding?.kind === "number" && binding.value.kind === "variable") {
      return { kind: "update", name: expression.operand.text, operator: updateOperator(expression.operator), prefix: false };
    }
  }
  return undefined;
}

function updateOperator(kind: ts.SyntaxKind.PlusPlusToken | ts.SyntaxKind.MinusMinusToken): "increment" | "decrement" {
  if (kind === ts.SyntaxKind.PlusPlusToken) {
    return "increment";
  }
  return "decrement";
}

function lowerRuntimeCollectionSizeExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrNumberExpression | undefined {
  if (!ts.isPropertyAccessExpression(expression) || !ts.isIdentifier(expression.expression) || expression.name.text !== "size") {
    return undefined;
  }
  const binding = bindings.get(expression.expression.text);
  if (binding?.kind !== "runtimeMap" && binding?.kind !== "runtimeSet") {
    return undefined;
  }
  return { kind: "runtimeCollectionSize", collectionName: binding.name };
}

// eslint-disable-next-line complexity, max-statements -- Scoped numeric built-in routing is centralized during roadmap package AQ/AR.
function lowerNumericBuiltinCall(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrNumberExpression | undefined {
  if (!ts.isCallExpression(expression)) {
    return undefined;
  }
  const dateNumber = lowerDateNumberCall(expression, bindings);
  if (dateNumber !== undefined) {
    return dateNumber;
  }
  if (ts.isIdentifier(expression.expression)) {
    if (expression.expression.text === "Number" && expression.arguments.length === 1) {
      if (ts.isObjectLiteralExpression(expression.arguments[0])) {
        return { kind: "nan" };
      }
      if (ts.isArrayLiteralExpression(expression.arguments[0])) {
        return lowerArrayLiteralNumberCoercion(expression.arguments[0], bindings);
      }
      const string = lowerStringRuntimeExpression(expression.arguments[0], bindings);
      if (string?.kind === "literal") {
        return numberExpressionFromNumber(coerceStringToNumber(string.value));
      }
      const value = lowerValueExpression(expression.arguments[0], bindings);
      if (value !== undefined) {
        return { kind: "valueToNumber", value };
      }
    }
    if (expression.expression.text === "parseInt" && (expression.arguments.length === 1 || expression.arguments.length === 2)) {
      if (expression.arguments.length === 2) {
        const radix = lowerNumberExpression(expression.arguments[1], bindings);
        if (numericLiteralValue(radix ?? { kind: "nan" }) !== decimalRadix) {
          return undefined;
        }
      }
      const value = lowerStringRuntimeExpression(expression.arguments[0], bindings);
      if (value !== undefined) {
        return { kind: "parseInt", value };
      }
    }
    if (expression.expression.text === "parseFloat" && expression.arguments.length === 1) {
      const value = lowerStringRuntimeExpression(expression.arguments[0], bindings);
      if (value !== undefined) {
        return { kind: "parseFloat", value };
      }
    }
  }
  if (!ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression) || expression.expression.expression.text !== "Math") {
    if (ts.isPropertyAccessExpression(expression.expression) && ts.isIdentifier(expression.expression.expression) && expression.expression.expression.text === "Number") {
      const method = expression.expression.name.text;
      if (method === "parseInt" && (expression.arguments.length === 1 || expression.arguments.length === 2)) {
        if (expression.arguments.length === 2) {
          const radix = lowerNumberExpression(expression.arguments[1], bindings);
          if (numericLiteralValue(radix ?? { kind: "nan" }) !== decimalRadix) {
            return undefined;
          }
        }
        const value = lowerStringRuntimeExpression(expression.arguments[0], bindings);
        if (value !== undefined) {
          return { kind: "parseInt", value };
        }
      }
      if (method === "parseFloat" && expression.arguments.length === 1) {
        const value = lowerStringRuntimeExpression(expression.arguments[0], bindings);
        if (value !== undefined) {
          return { kind: "parseFloat", value };
        }
      }
    }
    return undefined;
  }
  const method = expression.expression.name.text;
  if (method === "PI" || method === "E" || method === "NaN" || method === "Infinity") {
    return undefined;
  }
  if (!isMathMethod(method)) {
    return undefined;
  }
  const args: JsIrNumberExpression[] = [];
  for (const argument of expression.arguments) {
    const lowered = lowerNumberExpression(argument, bindings);
    if (lowered === undefined) {
      return undefined;
    }
    args.push(lowered);
  }
  return { kind: "mathCall", method, arguments: args };
}

function lowerDateNumberCall(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrNumberExpression | undefined {
  if (!ts.isPropertyAccessExpression(expression.expression)) {
    return undefined;
  }
  const receiver = expression.expression.expression;
  const method = expression.expression.name.text;
  if (ts.isIdentifier(receiver) && receiver.text === "Date" && !bindings.has("Date")) {
    if (method === "now" && expression.arguments.length === 0) {
      return { kind: "literal", value: 0 };
    }
    if (method === "parse" && expression.arguments.length === 1) {
      const value = lowerStringExpression(expression.arguments[0], bindings);
      if (value === undefined) {
        return undefined;
      }
      return numberExpressionFromNumber(Date.parse(value));
    }
  }
  if ((method === "getTime" || method === "valueOf") && expression.arguments.length === 0) {
    return lowerDateConstructorMilliseconds(receiver, bindings);
  }
  return undefined;
}

function lowerDateConstructorMilliseconds(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrNumberExpression | undefined {
  if (!ts.isNewExpression(expression) || !ts.isIdentifier(expression.expression) || expression.expression.text !== "Date" || bindings.has("Date")) {
    return undefined;
  }
  const args = expression.arguments ?? [];
  if (args.length !== 1) {
    return undefined;
  }
  return lowerNumberExpression(args[0], bindings);
}































function lowerArrayNumberMethodCall(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrNumberExpression | undefined {
  if (!ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression)) {
    return undefined;
  }
  const arrayName = expression.expression.expression.text;
  if (bindings.get(arrayName)?.kind !== "runtimeArray") {
    return undefined;
  }
  const method = expression.expression.name.text;
  if (method !== "push" && method !== "unshift") {
    if ((method === "indexOf" || method === "lastIndexOf") && (expression.arguments.length === 1 || expression.arguments.length === 2)) {
      const value = lowerValueExpression(expression.arguments[0], bindings);
      let fromIndex: JsIrNumberExpression | undefined;
      if (expression.arguments.length === 2) {
        fromIndex = lowerNumberExpression(expression.arguments[1], bindings);
      }
      if (value !== undefined && (expression.arguments.length === 1 || fromIndex !== undefined)) {
        return { kind: "arrayIndexOf", arrayName, value, fromEnd: method === "lastIndexOf", fromIndex };
      }
    }
    if (method === "findIndex" && expression.arguments.length === 0) {
      return { kind: "arrayFindIndex", arrayName };
    }
    return undefined;
  }
  const values = lowerArrayMethodValues(expression.arguments, bindings);
  if (values === undefined) {
    return undefined;
  }
  return { kind: arrayAppendNumberExpressionKind(method), arrayName, values };
}

function lowerStringNumberMethodCall(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrNumberExpression | undefined {
  const stringMethod = lowerStringMethodCall(expression, bindings);
  if (typeof stringMethod !== "number") {
    return undefined;
  }
  return numberExpressionFromNumber(stringMethod);
}

function arrayAppendNumberExpressionKind(method: "push" | "unshift"): "arrayPush" | "arrayUnshift" {
  if (method === "push") {
    return "arrayPush";
  }
  return "arrayUnshift";
}

// Reads a class instance member (field or getter) as a number by unboxing the
// JSValue it lowers to, so numeric instance members participate in arithmetic.
// Gated on the member's static type so string/other members are left to the
// value path (otherwise number-first contexts like `print` would coerce to NaN).
function lowerClassNumberAccess(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrNumberExpression | undefined {
  if (classLoweringState.registry === undefined || classLoweringState.typeChecker === undefined) {
    return undefined;
  }
  const isMemberAccess = ts.isPropertyAccessExpression(expression) || (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression));
  if (!isMemberAccess) {
    return undefined;
  }
  const type = classLoweringState.typeChecker.getTypeAtLocation(expression);
  if ((type.flags & (ts.TypeFlags.Number | ts.TypeFlags.NumberLiteral)) === 0) {
    return undefined;
  }
  const value = lowerClassValueExpression(expression, bindings);
  if (value === undefined) {
    return undefined;
  }
  return { kind: "valueToNumber", value };
}

function lowerNumberAccessExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrNumberExpression | undefined {
  if (classLoweringState.typeChecker?.getTypeAtLocation(expression).getCallSignatures().length !== 0) {
    return undefined;
  }
  if (ts.isElementAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
    const binding = bindings.get(expression.expression.text);
    const index = lowerNumberExpression(expression.argumentExpression, bindings);
    if (binding?.kind === "array" && index !== undefined) {
      return { kind: "arrayAccess", arrayName: expression.expression.text, index };
    }

    const valueAccess = lowerValueElementAccessNumber(expression, binding, index, bindings);
    if (valueAccess !== undefined) {
      return valueAccess;
    }

    const access = lowerObjectAccessPath(expression, bindings);
    if (access !== undefined) {
      return { kind: "objectAccess", objectName: access.objectName, path: access.path };
    }
  }

  if (ts.isPropertyAccessExpression(expression)) {
    const access = lowerObjectAccessPath(expression, bindings);
    if (access !== undefined) {
      return { kind: "objectAccess", objectName: access.objectName, path: access.path };
    }
    const lengthAccess = lowerLengthPropertyAccessExpression(expression, bindings);
    if (lengthAccess !== undefined) {
      return lengthAccess;
    }
  }

  return undefined;
}

function lowerLengthPropertyAccessExpression(
  expression: ts.PropertyAccessExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrNumberExpression | undefined {
  if (expression.name.text !== "length") {
    return undefined;
  }
  if (!ts.isIdentifier(expression.expression)) {
    // Chained receiver (for example `error.message.length`): the runtime
    // dispatches on the boxed value's tag to read string/array/object lengths.
    const value = lowerValueExpression(expression.expression, bindings);
    if (value === undefined) {
      return undefined;
    }
    return { kind: "valueLength", value };
  }
  const binding = bindings.get(expression.expression.text);
  if (binding?.kind === "array" || binding?.kind === "runtimeArray") {
    return { kind: "arrayLength", arrayName: expression.expression.text };
  }
  if (!isBoxedAggregateCandidateBinding(binding)) {
    return undefined;
  }
  const value = lowerValueExpression(expression.expression, bindings);
  if (value === undefined) {
    return undefined;
  }
  if (binding?.kind === "value" && binding.value.kind === "boxedPrimitive") {
    return { kind: "valueObjectLength", value };
  }
  return { kind: "valueArrayLength", value };
}











function isProvenBoxedAggregateBinding(binding: JsIrBindingValue | undefined): boolean {
  if (binding?.kind !== "value") {
    return false;
  }
  return binding.value.kind === "objectRef" || binding.value.kind === "arrayRef" || binding.value.kind === "objectDynamicAccess" || binding.value.kind === "arrayAccess" || binding.value.kind === "valueObjectDynamicAccess" || binding.value.kind === "valueArrayAccess";
}

function lowerNumberBinaryExpression(
  expression: ts.BinaryExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrNumberExpression | undefined {
  const left = lowerNumberExpression(expression.left, bindings);
  const right = lowerNumberExpression(expression.right, bindings);
  if (left === undefined || right === undefined) {
    return undefined;
  }

  const operator = lowerNumberOperator(expression.operatorToken.kind);
  if (operator === undefined) {
    return undefined;
  }

  return {
    kind: "binary",
    operator,
    left,
    right
  };
}

function lowerNumberConditionalExpression(
  expression: ts.ConditionalExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrNumberExpression | undefined {
  const condition = lowerConditionExpression(expression.condition, bindings);
  const consequent = lowerNumberExpression(expression.whenTrue, bindings);
  const alternate = lowerNumberExpression(expression.whenFalse, bindings);
  if (condition.kind !== "lowered" || consequent === undefined || alternate === undefined) {
    return undefined;
  }

  return {
    kind: "ternary",
    condition: condition.operation,
    consequent,
    alternate
  };
}

// eslint-disable-next-line complexity, max-statements -- Number-call lowering preserves direct and dynamic call fast paths during ABI migration.
function lowerNumberCallExpression(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrNumberExpression | undefined {
  if (classLoweringState.typeChecker !== undefined) {
    const callType = classLoweringState.typeChecker.getTypeAtLocation(expression);
    if ((callType.flags & (ts.TypeFlags.String | ts.TypeFlags.StringLiteral)) !== 0) {
      return undefined;
    }
  }
  if (isPlannedBuiltinCall(expression.expression, bindings)) {
    return undefined;
  }
  const spreadCall = lowerSpreadCallValue(expression, bindings);
  if (spreadCall !== undefined) {
    return { kind: "valueToNumber", value: spreadCall };
  }
  if (!ts.isIdentifier(expression.expression)) {
    const calleeValue = lowerValueExpression(expression.expression, bindings);
    const dynamicArgs = lowerValueCallArguments(expression.arguments, bindings);
    if (calleeValue === undefined || dynamicArgs === undefined) {
      return undefined;
    }
    return { kind: "valueToNumber", value: { kind: "callValue", callee: calleeValue, arguments: dynamicArgs, thisValue: lowerCallThisValue(expression.expression, bindings) } };
  }

  if (expression.expression.text === "Number" && expression.arguments.length === 1) {
    return lowerNumberCoercionExpression(expression.arguments[0], bindings);
  }

  const callee = bindings.get(expression.expression.text);
  if (callee?.kind === "value" || callee?.kind === "valueVariable") {
    const calleeValue = lowerValueExpression(expression.expression, bindings);
    const dynamicArgs = lowerValueCallArguments(expression.arguments, bindings);
    if (calleeValue === undefined || dynamicArgs === undefined) {
      return undefined;
    }
    return { kind: "valueToNumber", value: { kind: "callValue", callee: calleeValue, arguments: dynamicArgs, thisValue: lowerCallThisValue(expression.expression, bindings) } };
  }
  const args: JsIrNumberExpression[] = [];
  let name = expression.expression.text;
  if (callee?.kind === "closure") {
    args.push(...callee.value.captures);
    name = callee.value.functionName;
  } else if (callee?.kind === "function" && (callee.returnKind === "string" || callee.returnKind === "value")) {
    return undefined;
  }

  const loweredArgs = lowerCallArguments(expression.expression.text, expression.arguments, bindings);
  if (loweredArgs === undefined) {
    return undefined;
  }
  for (const arg of loweredArgs) {
    if (arg.valueKind !== "number") {
      return undefined;
    }
    args.push(arg.value);
  }

  return { kind: "call", name, arguments: args };
}

function lowerNumberCoercionExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrNumberExpression | undefined {
  const direct = lowerNumberExpression(expression, bindings);
  if (direct !== undefined) {
    return direct;
  }
  if (expression.kind === ts.SyntaxKind.NullKeyword) {
    return { kind: "literal", value: 0 };
  }
  if (expression.kind === ts.SyntaxKind.UndefinedKeyword || (ts.isIdentifier(expression) && expression.text === "undefined")) {
    return { kind: "nan" };
  }
  const condition = lowerConditionExpression(expression, bindings);
  if (condition.kind === "lowered" && condition.operation.kind === "boolean") {
    if (condition.operation.value) {
      return { kind: "literal", value: 1 };
    }
    return { kind: "literal", value: 0 };
  }
  const string = lowerStringRuntimeExpression(expression, bindings);
  if (string?.kind === "literal") {
    return numberExpressionFromNumber(coerceStringToNumber(string.value));
  }
  if (ts.isObjectLiteralExpression(expression)) {
    return { kind: "nan" };
  }
  if (ts.isArrayLiteralExpression(expression)) {
    return lowerArrayLiteralNumberCoercion(expression, bindings);
  }
  return undefined;
}

function lowerArrayLiteralNumberCoercion(
  expression: ts.ArrayLiteralExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrNumberExpression | undefined {
  if (expression.elements.length === 0) {
    return { kind: "literal", value: 0 };
  }
  if (expression.elements.length !== 1) {
    return { kind: "nan" };
  }
  const [element] = expression.elements;
  if (ts.isSpreadElement(element)) {
    return undefined;
  }
  return lowerNumberCoercionExpression(element, bindings);
}

function coerceStringToNumber(value: string): number {
  const trimmed = value.trim();
  if (trimmed === "") {
    return 0;
  }
  return Number(trimmed);
}

function numberConstantValue(name: string): number | undefined {
  switch (name) {
    case "MAX_SAFE_INTEGER": {
      return Number.MAX_SAFE_INTEGER;
    }
    case "MIN_SAFE_INTEGER": {
      return Number.MIN_SAFE_INTEGER;
    }
    case "EPSILON": {
      return Number.EPSILON;
    }
    case "MAX_VALUE": {
      return Number.MAX_VALUE;
    }
    case "MIN_VALUE": {
      return Number.MIN_VALUE;
    }
    default: {
      return undefined;
    }
  }
}

function numberExpressionFromNumber(value: number): JsIrNumberExpression {
  if (Number.isNaN(value)) {
    return { kind: "nan" };
  }
  if (Object.is(value, -0)) {
    return { kind: "negatedZero" };
  }
  return { kind: "literal", value };
}

function lowerCallArguments(
  name: string,
  args: ts.NodeArray<ts.Expression>,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): readonly JsIrCallArgument[] | undefined {
  const callee = bindings.get(name);
  if (callee?.kind === "function") {
    return lowerTypedCallArguments(callee.parameters, args, bindings);
  }

  const lowered: JsIrCallArgument[] = [];
  for (const arg of args) {
    const value = lowerNumberExpression(arg, bindings);
    if (value === undefined) {
      return undefined;
    }
    lowered.push({ valueKind: "number", value });
  }
  return lowered;
}

function lowerValueCallArguments(
  args: readonly ts.Expression[],
  bindings: ReadonlyMap<string, JsIrBindingValue>
): readonly JsIrCallArgument[] | undefined {
  const lowered: JsIrCallArgument[] = [];
  for (const argument of args) {
    const value = lowerValueExpression(argument, bindings);
    if (value === undefined) {
      return undefined;
    }
    lowered.push({ valueKind: "value", value });
  }
  return lowered;
}

function lowerTypedCallArguments(
  parameters: readonly JsIrFunctionParameter[],
  args: ts.NodeArray<ts.Expression>,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): readonly JsIrCallArgument[] | undefined {
  const restParameter = parameters.find((parameter) => parameter.isRest === true);
  if (restParameter !== undefined) {
    return lowerTypedCallArgumentsWithRest(parameters, restParameter, args, bindings);
  }
  if (args.length > parameters.length) {
    return undefined;
  }
  const lowered: JsIrCallArgument[] = [];
  for (let i = 0; i < parameters.length; i++) {
    const parameter = parameters[i];
    if (i < args.length) {
      const value = lowerTypedCallArgument(parameter, args[i], bindings);
      if (value === undefined) {
        return undefined;
      }
      lowered.push(value);
      continue;
    }
    const omitted = omittedParameterArgument(parameter);
    if (omitted === undefined) {
      return undefined;
    }
    lowered.push(omitted);
  }
  return lowered;
}

/**
 * What to pass for a parameter the call omitted, or `undefined` when it may not be omitted.
 *
 * A numeric initializer substitutes a value. `x?: T` with no initializer is omittable, and the
 * argument is still passed, as `undefined`, so the callee reads its own slot rather than a neighbour's.
 * The parameter keeps its declared value kind either way because the IR is monomorphic and `??`/`?.`
 * test the slot at runtime — which is what makes an omitted argument safe to read.
 */
function omittedParameterArgument(parameter: JsIrFunctionParameter): JsIrCallArgument | undefined {
  if (parameter.defaultValue !== undefined && parameter.valueKind === "number") {
    return { valueKind: "number", value: parameter.defaultValue };
  }
  if (parameter.isOptional === true) {
    return { valueKind: "undefined" };
  }
  return undefined;
}

function lowerTypedCallArgumentsWithRest(
  parameters: readonly JsIrFunctionParameter[],
  restParameter: JsIrFunctionParameter,
  args: ts.NodeArray<ts.Expression>,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): readonly JsIrCallArgument[] | undefined {
  const restIndex = parameters.indexOf(restParameter);
  const lowered: JsIrCallArgument[] = [];
  for (let i = 0; i < parameters.length; i++) {
    const parameter = parameters[i];
    if (parameter.isRest === true) {
      continue;
    }
    if (i < args.length && i < restIndex) {
      const value = lowerTypedCallArgument(parameter, args[i], bindings);
      if (value === undefined) {
        return undefined;
      }
      lowered.push(value);
      continue;
    }
    const omitted = omittedParameterArgument(parameter);
    if (omitted === undefined) {
      return undefined;
    }
    lowered.push(omitted);
  }
  const restValues = lowerRestCallValues(restIndex, args, bindings);
  if (restValues === undefined) {
    return undefined;
  }
  lowered.push({ valueKind: "value", value: { kind: "runtimeArrayValue", elements: restValues } });
  return lowered;
}

/**
 * The arguments a rest parameter collects, as the array it is passed. A spread argument expands to the
 * values it names; anything else is one element.
 */
function lowerRestCallValues(
  restIndex: number,
  args: ts.NodeArray<ts.Expression>,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): readonly JsIrValueExpression[] | undefined {
  const restValues: JsIrValueExpression[] = [];
  for (let i = restIndex; i < args.length; i++) {
    const arg = args[i];
    if (ts.isSpreadElement(arg)) {
      const spreadValues = lowerSpreadElementValues(arg, bindings);
      if (spreadValues === undefined) {
        return undefined;
      }
      restValues.push(...spreadValues);
      continue;
    }
    const value = lowerValueExpression(arg, bindings);
    if (value === undefined) {
      return undefined;
    }
    restValues.push(value);
  }
  return restValues;
}

function lowerSpreadElementValues(
  element: ts.SpreadElement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): readonly JsIrValueExpression[] | undefined {
  if (!ts.isIdentifier(element.expression)) {
    return undefined;
  }
  const binding = bindings.get(element.expression.text);
  if (binding?.kind === "array") {
    const values: JsIrValueExpression[] = [];
    for (let i = 0; i < binding.length; i++) {
      values.push({ kind: "number", value: { kind: "arrayAccess", arrayName: binding.name, index: { kind: "literal", value: i } } });
    }
    return values;
  }
  if (binding?.kind === "runtimeArray") {
    return undefined;
  }
  return undefined;
}

function lowerTypedCallArgument(
  parameter: JsIrFunctionParameter,
  arg: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCallArgument | undefined {
  // `f(undefined)` is the same call as `f()` on an optional parameter, so it lowers to the same
  // argument rather than failing the parameter's value kind. Tested before the kind dispatch because
  // `undefined` is a value rather than a number or a string, whichever slot it is passed into.
  if (arg.kind === ts.SyntaxKind.UndefinedKeyword || (ts.isIdentifier(arg) && arg.text === "undefined")) {
    return { valueKind: "undefined" };
  }
  if (parameter.valueKind === "string") {
    const value = lowerStringRuntimeExpression(arg, bindings);
    if (value === undefined) {
      return undefined;
    }
    return { valueKind: "string", value };
  }
  if (parameter.valueKind === "value") {
    const value = lowerValueExpression(arg, bindings);
    if (value === undefined) {
      return undefined;
    }
    return { valueKind: "value", value };
  }
  const value = lowerNumberExpression(arg, bindings);
  if (value === undefined) {
    return undefined;
  }
  return { valueKind: "number", value };
}

function lowerNumberOperator(kind: ts.SyntaxKind): JsIrNumberOperator | undefined {
  switch (kind) {
    case ts.SyntaxKind.PlusToken: {
      return "add";
    }
    case ts.SyntaxKind.MinusToken: {
      return "subtract";
    }
    case ts.SyntaxKind.AsteriskToken: {
      return "multiply";
    }
    case ts.SyntaxKind.SlashToken: {
      return "divide";
    }
    case ts.SyntaxKind.PercentToken: {
      return "remainder";
    }
    case ts.SyntaxKind.AmpersandToken: {
      return "bitAnd";
    }
    case ts.SyntaxKind.BarToken: {
      return "bitOr";
    }
    case ts.SyntaxKind.CaretToken: {
      return "bitXor";
    }
    case ts.SyntaxKind.LessThanLessThanToken: {
      return "shiftLeft";
    }
    case ts.SyntaxKind.GreaterThanGreaterThanToken: {
      return "shiftRight";
    }
    case ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken: {
      return "shiftRightUnsigned";
    }
    case ts.SyntaxKind.AsteriskAsteriskToken: {
      return "power";
    }
    default: {
      return undefined;
    }
  }
}

function lowerValueElementAccessNumber(
  expression: ts.ElementAccessExpression,
  binding: JsIrBindingValue | undefined,
  index: JsIrNumberExpression | undefined,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrNumberExpression | undefined {
  if (index === undefined || binding?.kind !== "value") {
    return undefined;
  }
  const stringIndex = lowerCanonicalArrayIndexString(expression.argumentExpression);
  if (stringIndex === undefined) {
    return undefined;
  }
  const value = lowerValueExpression(expression.expression, bindings);
  if (value === undefined) {
    return undefined;
  }
  return {
    kind: "valueToNumber",
    value: {
      kind: "valueArrayAccess",
      value,
      index: { kind: "literal", value: stringIndex },
      key: { kind: "literal", value: String(stringIndex) }
    }
  };
}

function lowerArrayLiteralExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): readonly JsIrNumberExpression[] | undefined {
  if (!ts.isArrayLiteralExpression(expression)) {
    return undefined;
  }

  const elements: JsIrNumberExpression[] = [];
  for (const element of expression.elements) {
    if (ts.isSpreadElement(element) && ts.isIdentifier(element.expression)) {
      const binding = bindings.get(element.expression.text);
      if (binding?.kind !== "array") {
        return undefined;
      }
      for (let index = 0; index < binding.length; index++) {
        elements.push({ kind: "arrayAccess", arrayName: element.expression.text, index: { kind: "literal", value: index } });
      }
      continue;
    }
    const value = lowerNumberExpression(element, bindings);
    if (value === undefined) {
      return undefined;
    }
    elements.push(value);
  }
  return elements;
}

function classifyArrayLiteral(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): ArrayLiteralClassification | undefined {
  const fixed = lowerArrayLiteralExpression(expression, bindings);
  if (fixed !== undefined) {
    return { kind: "fixed", elements: fixed };
  }

  const runtime = lowerRuntimeArrayLiteralExpression(expression, bindings);
  if (runtime !== undefined) {
    return { kind: "runtime", elements: runtime };
  }

  return undefined;
}

// eslint-disable-next-line max-statements -- Runtime array literal classification handles holes plus fixed/runtime spreads.
function lowerRuntimeArrayLiteralExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): readonly JsIrRuntimeArrayElement[] | undefined {
  if (!ts.isArrayLiteralExpression(expression)) {
    return undefined;
  }

  const elements: JsIrRuntimeArrayElement[] = [];
  let needsRuntimeArray = false;
  for (const element of expression.elements) {
    if (ts.isSpreadElement(element)) {
      if (ts.isIdentifier(element.expression)) {
        const binding = bindings.get(element.expression.text);
        if (binding?.kind === "array") {
          elements.push({ kind: "spread", arrayName: element.expression.text, sourceKind: "fixed" });
          needsRuntimeArray = true;
          continue;
        }
      }
      const source = lowerValueExpression(element.expression, bindings);
      if (source === undefined) {
        return undefined;
      }
      elements.push({
        kind: "iterableSpread",
        source,
        notIterableMessage: `${iteratorErrorSubject(element.expression)} is not iterable`
      });
      needsRuntimeArray = true;
      continue;
    }
    if (ts.isOmittedExpression(element)) {
      elements.push({ kind: "hole" });
      needsRuntimeArray = true;
      continue;
    }
    const number = lowerNumberExpression(element, bindings);
    const value = lowerValueExpression(element, bindings);
    if (value === undefined) {
      return undefined;
    }
    if (number === undefined) {
      needsRuntimeArray = true;
    }
    elements.push({ kind: "value", value });
  }

  if (!needsRuntimeArray) {
    return undefined;
  }
  return elements;
}

function classifyObjectLiteral(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): ObjectLiteralClassification | undefined {
  const fixed = lowerObjectLiteralExpression(expression, bindings);
  if (fixed !== undefined) {
    if (fixed.fields.length === 0) {
      return { kind: "runtime", value: { fields: [] } };
    }
    return { kind: "fixed", value: fixed };
  }

  const runtime = lowerRuntimeObjectLiteralExpression(expression, bindings);
  if (runtime !== undefined) {
    return { kind: "runtime", value: runtime };
  }

  return undefined;
}

function lowerObjectLiteralExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrObjectValue | undefined {
  if (!ts.isObjectLiteralExpression(expression)) {
    return undefined;
  }

  const fields: JsIrObjectField[] = [];
  for (const property of expression.properties) {
    if (!ts.isPropertyAssignment(property)) {
      return undefined;
    }
    const fieldName = lowerObjectFieldName(property.name);
    if (fieldName === undefined) {
      return undefined;
    }
    const objectValue = lowerObjectLiteralExpression(property.initializer, bindings);
    if (objectValue !== undefined) {
      fields.push({ name: fieldName, value: { kind: "object", value: objectValue } });
      continue;
    }
    const numberValue = lowerNumberExpression(property.initializer, bindings);
    if (numberValue === undefined) {
      return undefined;
    }
    fields.push({ name: fieldName, value: { kind: "number", value: numberValue } });
  }
  return { fields };
}

// eslint-disable-next-line max-statements -- Runtime object literals validate spread, shorthand, methods, and value fields in one pass.
function lowerRuntimeObjectLiteralExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrRuntimeObjectValue | undefined {
  if (!ts.isObjectLiteralExpression(expression)) {
    return undefined;
  }

  const fields: JsIrRuntimeObjectField[] = [];
  for (const property of expression.properties) {
    if (ts.isSpreadAssignment(property)) {
      if (!ts.isIdentifier(property.expression)) {
        return undefined;
      }
      const sourceBinding = bindings.get(property.expression.text);
      if (sourceBinding?.kind !== "runtimeObject" && sourceBinding?.kind !== "object") {
        return undefined;
      }
      fields.push({ kind: "spread", sourceName: property.expression.text });
      continue;
    }
    if (ts.isShorthandPropertyAssignment(property)) {
      const value = lowerValueExpression(property.name, bindings);
      if (value === undefined) {
        return undefined;
      }
      fields.push({ kind: "field", key: { kind: "literal", value: property.name.text }, value });
      continue;
    }
    if (ts.isMethodDeclaration(property) && property.body !== undefined) {
      const key = lowerRuntimeObjectFieldName(property.name, bindings);
      const value = lowerObjectMethodFunctionValue(property, bindings);
      if (key === undefined || value === undefined) {
        return undefined;
      }
      fields.push({ kind: "field", key, value });
      continue;
    }
    if (!ts.isPropertyAssignment(property)) {
      return undefined;
    }
    const key = lowerRuntimeObjectFieldName(property.name, bindings);
    const value = lowerValueExpression(property.initializer, bindings);
    if (key === undefined || value === undefined) {
      return undefined;
    }
    fields.push({ kind: "field", key, value });
  }
  return { fields };
}

function lowerRuntimeObjectFieldName(
  name: ts.PropertyName,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrStringExpression | undefined {
  // A numeric literal name is a string key. JavaScript has one property-key type, so `{ 0: "A" }` and
  // `{ "0": "A" }` are the same object, and an enum's reverse mapping is exactly that shape: a numeric
  // key holding the member's name.
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return { kind: "literal", value: name.text };
  }
  if (!ts.isComputedPropertyName(name)) {
    return undefined;
  }
    return lowerPropertyKeyExpression(name.expression, bindings);
}

function lowerObjectFieldName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
    return name.text;
  }
  return undefined;
}






















































































/**
 * Lowers parsed TypeScript sources into the JS IR.
 *
 * Pure and synchronous. Diagnostics are *returned* rather than pushed into an ambient service:
 * the previous signature was `Effect<JsIrResult, never, Diagnostics>` while the body threw from
 * 49 sites and mutated 12 module-level bindings, so the `never` promised a totality the
 * implementation did not have and the `Diagnostics` requirement bought nothing but a mutable log.
 *
 * Returns diagnostics for the sources it lowered. Not fiber-safe, by construction: the lowering
 * state below is module-level, so concurrent calls would interleave. It is synchronous, so
 * nothing currently does.
 */
export function lowerToJsIr(
  entry: string,
  sourceFiles: readonly ts.SourceFile[],
  checker?: ts.TypeChecker,
  options: JsIrLowerOptions = {}
): JsIrResult {
  const allDiagnostics: CompilerDiagnostic[] = [];
  const inlineCppBlocks: JsIrInlineCppBlock[] = [];
  classLoweringState.typeChecker = checker;
  inlineCppState.enabled = options.fcpp === true;
  inlineCppState.blocks = inlineCppBlocks;
  let modules;
  try {
    modules = sourceFiles.map((sourceFile, moduleIndex) => {
      const lowered = lowerStatements(sourceFile);
      allDiagnostics.push(...lowered.diagnostics);
      return {
        fileName: sourceFile.fileName,
        statementCount: sourceFile.statements.length,
        loweringMode: lowered.loweringMode,
        operations: finalizeOperationTraces(lowered.operations, moduleIndex),
        functionObjects: collectFunctionObjectDefinitions(lowered.operations)
      };
    });
  } finally {
    classLoweringState.typeChecker = undefined;
    inlineCppState.enabled = false;
    inlineCppState.blocks = undefined;
  }
  return {
    module: {
      entry,
      modules,
      inlineCppBlocks
    },
    diagnostics: allDiagnostics
  };
}

// Raised by the class-lowering path when it encounters a class feature that the
// real backend cannot compile yet. `lowerStatements` catches it and turns it into
// a hard TSCN1002 diagnostic: the compiler never evaluates user programs at
// compile time, so unsupported class features are compile errors.
