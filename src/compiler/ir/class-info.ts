import ts from "typescript";
import { classAccessorFunctionName, classMethodFunctionName, classPrivateFunctionSlotName, classStaticAccessorFunctionName } from "./class-names.js";
import type { LoweringContext } from "./context.js";
import type { JsIrBindingValue, JsIrFunctionParameter, JsIrValueKind } from "./bindings.js";
import type { JsIrValueExpression } from "./expressions.js";
import type { JsIrOperation } from "./types.js";
import { updateBindings } from "./binding-updates.js";
import type { JsIrTraceOrigin } from "./module.js";
import { errorConstructorNames, unwrapTypeOnlyExpression } from "./predicates.js";
import { type Produced, produced, unsupportedIn } from "./lowered.js";
import {
  type ClassAccessorEntry,
  type ClassFieldInfo,
  type ClassMethodEntry,
  type CollectedClassMembers,
  classPrivateFieldStorageKey,
  isParameterProperty,
  runtimeParameters
} from "./class-members.js";

export {
  type ClassAccessorEntry,
  type ClassComputedKeyInfo,
  type ClassComputedMethodEntry,
  type ClassFieldInfo,
  type ClassMemberKey,
  type ClassMethodEntry,
  type ClassStaticInitializer,
  type CollectedClassMembers,
  classPrivateFieldStorageKey,
  collectClassMembers,
  isParameterProperty,
  lowerSymbolIteratorKeyExpression,
  runtimeParameters
} from "./class-members.js";
export interface ClassMethodInfo {
  readonly parameters: readonly JsIrFunctionParameter[];
}
export interface ClassInfo {
  readonly name: string;
  readonly baseName?: string;
  readonly baseErrorName?: string;
  readonly hasDynamicBase?: boolean;
  readonly hasValueReturn: boolean;
  readonly fields: readonly ClassFieldInfo[];
  readonly constructorParameters: readonly JsIrFunctionParameter[];
  readonly methods: ReadonlyMap<string, ClassMethodInfo>;
  readonly staticMethods: ReadonlyMap<string, ClassMethodInfo>;
  readonly staticFields: ReadonlySet<string>;
  readonly staticGetters: ReadonlySet<string>;
  readonly staticSetters: ReadonlySet<string>;
  readonly getters: ReadonlySet<string>;
  readonly setters: ReadonlySet<string>;
  readonly iteratorMethod: ts.MethodDeclaration | undefined;
  /**
   * Names this class's own constructor declares as fields, in parameter order.
   *
   * A parameter property — `constructor(readonly v: number)` — declares a field rather than only
   * receiving an argument, so the constructor has to store each one onto `this`. Order matters because
   * TypeScript assigns them before the field initializers, and a field initializer may read one.
   */
  readonly parameterProperties: readonly string[];
  // Source-level private field name (`#x`) → class-mangled key of the instance's private element.
  // The runtime's private-element table holds it, and holding it is the brand check.
  readonly privateFields: ReadonlyMap<string, string>;
  /** Source-level private method name (`#m`) → the function construction adds as an element. */
  readonly privateMethods: ReadonlyMap<string, ClassPrivateFunctionInfo>;
  /** Source-level private accessor name (`#x`) → its getter and setter elements. */
  readonly privateAccessors: ReadonlyMap<string, ClassPrivateAccessorInfo>;
  /** Source-level static private field name (`#x`) → class-mangled key on the class static storage. */
  readonly staticPrivateFields: ReadonlyMap<string, string>;
  /** Source-level static private method name (`#m`) → the function added to class static storage. */
  readonly staticPrivateMethods: ReadonlyMap<string, ClassPrivateFunctionInfo>;
  /** Source-level static private accessor name (`#x`) → its getter and setter elements on static storage. */
  readonly staticPrivateAccessors: ReadonlyMap<string, ClassPrivateAccessorInfo>;
}
/**
 * A private method, getter or setter. The class definition stores one function object for it in
 * `slotName`, and construction adds that object to every instance as the private element
 * `storageKey`, so all instances share it. The object forwards to the direct function
 * `functionName`, which takes the receiver as its first argument.
 */
interface ClassPrivateFunctionInfo extends ClassMethodInfo {
  readonly storageKey: string;
  readonly functionName: string;
  readonly slotName: string;
}
/** A private accessor: reading calls the getter, writing calls the setter. */
export interface ClassPrivateAccessorInfo {
  readonly getter?: ClassPrivateFunctionInfo;
  readonly setter?: ClassPrivateFunctionInfo;
}
export const sourceSpan = (
  sourceFile: ts.SourceFile,
  position: number
): { readonly fileName: string; readonly line: number; readonly column: number } => {
  const lineAndCharacter = sourceFile.getLineAndCharacterOfPosition(position);

  return {
    fileName: sourceFile.fileName,
    line: lineAndCharacter.line + 1,
    column: lineAndCharacter.character + 1
  };
};
export function traceOperationFromNode(
  operation: JsIrOperation,
  node: ts.Node,
  origin: JsIrTraceOrigin = "source"
): JsIrOperation {
  if (operation.trace?.source !== undefined) {
    return operation;
  }
  const sourceFile = node.getSourceFile();
  return {
    ...operation,
    trace: {
      id: operation.trace?.id ?? "",
      source: sourceSpan(sourceFile, node.getStart(sourceFile)),
      origin
    }
  };
}
function classOperationTraceOrigin(index: number): JsIrTraceOrigin {
  if (index === 0) {
    return "source";
  }
  return "synthesized";
}
// Pushes a class's lowered operations into the statement stream, attaching
// trace origins and updating bindings the same way ordinary statements do.
export function appendClassOperations(
  operations: JsIrOperation[],
  classOperations: readonly JsIrOperation[],
  statement: ts.Statement,
  bindings: Map<string, JsIrBindingValue>
): void {
  for (let index = 0; index < classOperations.length; index += 1) {
    const traced = traceOperationFromNode(classOperations[index], statement, classOperationTraceOrigin(index));
    operations.push(traced);
    updateBindings(traced, bindings);
  }
}
// Name of the per-class module-level slot holding the object that backs static
// fields. Created once at module init; `C.x` reads/writes are properties on it.
export function classStaticStorageName(className: string): string {
  return `${className}$statics`;
}
export function classPrototypeName(className: string): string {
  return `${className}$prototype`;
}

/**
 * The names a class body is lowered under: the one its generated functions are named after, the inner
 * name a named class expression binds inside its own body, and the base it extends.
 *
 * Class expressions take their codegen name from the bound variable; a named class expression
 * additionally binds its inner name inside the class body.
 */
interface ClassNames {
  readonly infoName: string;
  readonly innerName: string | undefined;
  readonly baseName: string | undefined;
  readonly baseErrorName: string | undefined;
  readonly dynamicBaseExpression: ts.Expression | undefined;
}
export function resolveClassNames(
  statement: ts.ClassDeclaration | ts.ClassExpression,
  expressionBindingName: string | undefined,
  classes: ReadonlyMap<string, ClassInfo>,
  bindings?: ReadonlyMap<string, JsIrBindingValue>
): Produced<ClassNames> {
  let infoName: string | undefined = expressionBindingName;
  let innerName: string | undefined;
  if (infoName === undefined) {
    if (statement.name === undefined) {
      return unsupportedIn("A class declaration must be named");
    }
    infoName = statement.name.text;
  } else if (statement.name !== undefined && statement.name.text !== infoName) {
    // A named class expression binds its inner name inside its own body, per JS class scope.
    innerName = statement.name.text;
  }
  const extended = resolveExtendedClassName(statement.heritageClauses, classes);
  if (extended === undefined) {
    const baseErrorName = resolveExtendedErrorName(statement.heritageClauses, classes, bindings);
    if (baseErrorName !== undefined) {
      return produced({ infoName, innerName, baseName: undefined, baseErrorName, dynamicBaseExpression: undefined });
    }
    const dynamicBaseExpression = resolveDynamicBaseExpression(statement.heritageClauses, classes, bindings);
    if (dynamicBaseExpression !== undefined) {
      return produced({ infoName, innerName, baseName: undefined, baseErrorName: undefined, dynamicBaseExpression });
    }
    // No usable `extends` is not itself a failure: a class may extend nothing, and a class may
    // implement interfaces while extending nothing. Only an `extends` clause that is present and
    // unusable is a refusal.
    const extendsClauses = (statement.heritageClauses ?? []).filter(isExtendsClause);
    if (extendsClauses.length > 0) {
      return unsupportedIn(classHeritageRefusal(extendsClauses));
    }
    return produced({ infoName, innerName, baseName: undefined, baseErrorName: undefined, dynamicBaseExpression: undefined });
  }
  return produced({ infoName, innerName, baseName: extended, baseErrorName: undefined, dynamicBaseExpression: undefined });
}

function resolveDynamicBaseExpression(
  heritageClauses: ts.NodeArray<ts.HeritageClause> | undefined,
  classes: ReadonlyMap<string, ClassInfo>,
  bindings: ReadonlyMap<string, JsIrBindingValue> | undefined
): ts.Expression | undefined {
  const extendsClauses = (heritageClauses ?? []).filter(isExtendsClause);
  if (extendsClauses.length !== 1) {
    return undefined;
  }
  const [clause] = extendsClauses;
  if (clause.types.length !== 1) {
    return undefined;
  }
  const expr = unwrapTypeOnlyExpression(clause.types[0].expression);
  if (ts.isIdentifier(expr)) {
    // An unbound identifier that is not a declared class or Error keeps its specific refusal message.
    if (classes.has(expr.text) || bindings === undefined || !bindings.has(expr.text)) {
      return undefined;
    }
    return expr;
  }
  return expr;
}

function resolveExtendedErrorName(
  heritageClauses: ts.NodeArray<ts.HeritageClause> | undefined,
  classes: ReadonlyMap<string, ClassInfo>,
  bindings: ReadonlyMap<string, JsIrBindingValue> | undefined
): string | undefined {
  const extendsClauses = (heritageClauses ?? []).filter(isExtendsClause);
  if (extendsClauses.length !== 1) {
    return undefined;
  }
  const [clause] = extendsClauses;
  if (clause.types.length !== 1) {
    return undefined;
  }
  const [type] = clause.types;
  const { expression } = type;
  // A module may declare its own `Error`, which is then an ordinary base value.
  if (!ts.isIdentifier(expression) || classes.has(expression.text) || bindings?.has(expression.text) === true || !errorConstructorNames.has(expression.text)) {
    return undefined;
  }
  return expression.text;
}

/**
 * Whether a heritage clause is the one that names a base class. The other kind, `implements`, is
 * erased: it asserts a shape the class already has and produces no runtime base, so it is not a
 * heritage clause this lowering has to resolve. A class may carry several of them at once.
 */
function isExtendsClause(heritage: ts.HeritageClause): boolean {
  return heritage.token === ts.SyntaxKind.ExtendsKeyword;
}
/** Why an `extends` clause produced no usable base class. */
function classHeritageRefusal(heritageClauses: readonly ts.HeritageClause[]): string {
  if (heritageClauses.length !== 1) {
    return "A class may extend at most one class";
  }
  const [heritage] = heritageClauses;
  if (heritage.types.length === 1 && ts.isIdentifier(heritage.types[0].expression)) {
    return `\`extends ${heritage.types[0].expression.text}\` does not name a class declared in this module`;
  }
  return "`extends` must name a single class declared in this module";
}
/** The base class a heritage clause names, or `undefined` when it names something unusable. */
function resolveExtendedClassName(
  heritageClauses: ts.NodeArray<ts.HeritageClause> | undefined,
  classes: ReadonlyMap<string, ClassInfo>
): string | undefined {
  const extendsClauses = (heritageClauses ?? []).filter(isExtendsClause);
  if (extendsClauses.length !== 1) {
    return undefined;
  }
  const [heritage] = extendsClauses;
  if (heritage.types.length !== 1) {
    return undefined;
  }
  const [type] = heritage.types;
  if (!ts.isIdentifier(type.expression)) {
    return undefined;
  }
  const { text } = type.expression;
  if (!classes.has(text)) {
    return undefined;
  }
  return text;
}
/**
 * The `ClassInfo` a class registers, from its members and parameter tables.
 *
 * A derived class with no constructor of its own forwards the base's parameter list, so the generated
 * constructor takes the same arguments the base does.
 */
export function buildClassInfo(
  names: ClassNames,
  members: CollectedClassMembers,
  classes: ReadonlyMap<string, ClassInfo>
): Produced<ClassInfo> {
  const ownParameters = constructorParametersOf(members.constructorDeclaration);
  if (ownParameters.kind !== "lowered") {
    return ownParameters;
  }
  const ownMethods = classMethodInfoMap(members.methodDeclarations);
  if (ownMethods.kind !== "lowered") {
    return ownMethods;
  }
  const staticMethods = classMethodInfoMap(members.staticMethodDeclarations);
  if (staticMethods.kind !== "lowered") {
    return staticMethods;
  }
  const privateMethods = classPrivateMethodInfoMap(names.infoName, members.privateMethodDeclarations, false);
  if (privateMethods.kind !== "lowered") {
    return privateMethods;
  }
  const staticPrivateMethods = classPrivateMethodInfoMap(names.infoName, members.staticPrivateMethodDeclarations, true);
  if (staticPrivateMethods.kind !== "lowered") {
    return staticPrivateMethods;
  }
  let constructorParameters = ownParameters.operation;
  if (names.baseName !== undefined && members.constructorDeclaration === undefined) {
    constructorParameters = classes.get(names.baseName)?.constructorParameters ?? [];
  } else if (names.baseErrorName !== undefined && members.constructorDeclaration === undefined) {
    constructorParameters = [
      { name: "message", valueKind: "value", isOptional: true },
      { name: "options", valueKind: "value", isOptional: true }
    ];
  } else if (names.dynamicBaseExpression !== undefined && members.constructorDeclaration === undefined) {
    constructorParameters = [{ name: "__tscn_super_args", valueKind: "value", isRest: true }];
  }
  const constructorBody = members.constructorDeclaration?.body;
  return produced({
    name: names.infoName,
    baseName: names.baseName,
    baseErrorName: names.baseErrorName,
    ...(names.dynamicBaseExpression === undefined ? {} : { hasDynamicBase: true }),
    hasValueReturn: names.dynamicBaseExpression !== undefined || (constructorBody !== undefined && constructorHasValueReturn(constructorBody)),
    fields: members.fields,
    constructorParameters,
    methods: ownMethods.operation,
    staticMethods: staticMethods.operation,
    staticFields: literalStaticFieldNames(members.staticFields),
    staticGetters: new Set(members.staticGetAccessors.map((entry) => entry.name)),
    staticSetters: new Set(members.staticSetAccessors.map((entry) => entry.name)),
    getters: new Set(members.getAccessors.map((entry) => entry.name)),
    setters: new Set(members.setAccessors.map((entry) => entry.name)),
    iteratorMethod: members.iteratorMethod,
    parameterProperties: members.parameterProperties,
    privateFields: members.privateFields,
    privateMethods: privateMethods.operation,
    privateAccessors: classPrivateAccessorInfoMap(names.infoName, members.privateGetAccessors, members.privateSetAccessors, false),
    staticPrivateFields: members.staticPrivateFields,
    staticPrivateMethods: staticPrivateMethods.operation,
    staticPrivateAccessors: classPrivateAccessorInfoMap(names.infoName, members.staticPrivateGetAccessors, members.staticPrivateSetAccessors, true)
  });
}

function constructorHasValueReturn(body: ts.Block): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found || ts.isFunctionLike(node) || ts.isClassLike(node)) {
      return;
    }
    if (ts.isReturnStatement(node) && node.expression !== undefined) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return found;
}

function classPrivateMethodInfoMap(
  className: string,
  declarations: readonly ClassMethodEntry[],
  isStatic: boolean
): Produced<ReadonlyMap<string, ClassPrivateFunctionInfo>> {
  const map = new Map<string, ClassPrivateFunctionInfo>();
  for (const entry of declarations) {
    const parameters = classCallableParameters(entry.declaration);
    if (parameters.kind !== "lowered") {
      return parameters;
    }
    const keyTag = isStatic ? `static$${entry.name}` : entry.name;
    const functionName = classMethodFunctionName(className, entry.name, isStatic);
    map.set(entry.name, {
      parameters: parameters.operation,
      storageKey: classPrivateFieldStorageKey(className, keyTag),
      functionName,
      slotName: classPrivateFunctionSlotName(className, functionName)
    });
  }
  return produced(map);
}

/**
 * A getter takes no argument and a setter takes the assigned value, so their parameters are fixed,
 * and each half is its own element.
 */
function classPrivateAccessorInfoMap(
  className: string,
  getters: readonly ClassAccessorEntry[],
  setters: readonly ClassAccessorEntry[],
  isStatic: boolean
): ReadonlyMap<string, ClassPrivateAccessorInfo> {
  const half = (name: string, isGetter: boolean): ClassPrivateFunctionInfo => {
    const functionName = isStatic
      ? classStaticAccessorFunctionName(className, name, isGetter)
      : classAccessorFunctionName(className, name, isGetter);
    return {
      parameters: isGetter ? [] : [{ name: "value", valueKind: "value" }],
      storageKey: classPrivateFieldStorageKey(className, functionName),
      functionName,
      slotName: classPrivateFunctionSlotName(className, functionName)
    };
  };
  const map = new Map<string, ClassPrivateAccessorInfo>();
  for (const entry of getters) {
    map.set(entry.name, { ...map.get(entry.name), getter: half(entry.name, true) });
  }
  for (const entry of setters) {
    map.set(entry.name, { ...map.get(entry.name), setter: half(entry.name, false) });
  }
  return map;
}

/** Every private function a class's instances hold as elements, methods before accessors. */
export function classPrivateFunctions(info: ClassInfo): readonly ClassPrivateFunctionInfo[] {
  const accessorHalves = [...info.privateAccessors.values()]
    .flatMap((accessor) => [accessor.getter, accessor.setter])
    .filter((half): half is ClassPrivateFunctionInfo => half !== undefined);
  return [...info.privateMethods.values(), ...accessorHalves];
}

/** Every static private function a class's static object holds as elements, methods before accessors. */
export function classStaticPrivateFunctions(info: ClassInfo): readonly ClassPrivateFunctionInfo[] {
  const accessorHalves = [...info.staticPrivateAccessors.values()]
    .flatMap((accessor) => [accessor.getter, accessor.setter])
    .filter((half): half is ClassPrivateFunctionInfo => half !== undefined);
  return [...info.staticPrivateMethods.values(), ...accessorHalves];
}
/** The two prototype-chain operations a derived class needs, or a refusal. */
export function lowerClassInheritanceOperations(
  info: ClassInfo,
  baseName: string | undefined
): Produced<readonly JsIrOperation[]> {
  if (baseName === undefined) {
    return produced([]);
  }
  return produced([
    {
      kind: "valueObjectSetPrototype",
      targetName: classPrototypeName(info.name),
      prototypeName: classPrototypeName(baseName)
    },
    {
      kind: "valueObjectSetPrototype",
      targetName: classStaticStorageName(info.name),
      prototypeName: classStaticStorageName(baseName)
    }
  ]);
}
/** The instance and static method entries, paired with whether each is static. */
export function classMethodEntries(
  members: CollectedClassMembers
): readonly (readonly [readonly ClassMethodEntry[], boolean])[] {
  return [
    [members.methodDeclarations, false],
    [members.privateMethodDeclarations, false],
    [members.staticMethodDeclarations, true],
    [members.staticPrivateMethodDeclarations, true]
  ];
}
/** The getter and setter entries, paired with `(isGetter, isStatic)`. */
export function classAccessorEntries(
  members: CollectedClassMembers
): readonly (readonly [readonly ClassAccessorEntry[], boolean, boolean])[] {
  return [
    [members.getAccessors, true, false],
    [members.privateGetAccessors, true, false],
    [members.setAccessors, false, false],
    [members.privateSetAccessors, false, false],
    [members.staticGetAccessors, true, true],
    [members.staticPrivateGetAccessors, true, true],
    [members.staticSetAccessors, false, true],
    [members.staticPrivateSetAccessors, false, true]
  ];
}
function literalStaticFieldNames(staticFields: readonly ClassFieldInfo[]): ReadonlySet<string> {
  const names = new Set<string>();
  for (const field of staticFields) {
    if (field.key.kind === "literal") {
      names.add(field.key.name);
    }
  }
  return names;
}
function constructorParametersOf(
  declaration: ts.ConstructorDeclaration | undefined
): Produced<readonly JsIrFunctionParameter[]> {
  if (declaration === undefined) {
    return produced([] as readonly JsIrFunctionParameter[]);
  }
  return classCallableParameters(declaration);
}
function classMethodInfoMap(
  entries: readonly ClassMethodEntry[]
): Produced<ReadonlyMap<string, ClassMethodInfo>> {
  const map = new Map<string, ClassMethodInfo>();
  for (const entry of entries) {
    const parameters = classCallableParameters(entry.declaration);
    if (parameters.kind !== "lowered") {
      return parameters;
    }
    map.set(entry.name, { parameters: parameters.operation });
  }
  return produced(map);
}
/**
 * True when a parameter is annotated with a bare type parameter.
 *
 * A type parameter names no representation, so it is opaque in exactly the way `unknown` is and is
 * encoded the same way: as a boxed value. The alternative is falling through to a number, which is
 * how a type parameter used to read — and a number is a guess, so `function f<T>(x: T)` accepted an
 * integer argument by accident and rejected every other one at the call site, a long way from the
 * declaration that decided it.
 *
 * A generic such as `Array<T>` or `Box<T>` is not this: its name still says what it is, and the
 * existing rules for that name apply.
 */
function hasUnconstrainedTypeParameter(parameter: ts.ParameterDeclaration): boolean {
  const { type } = parameter;
  return type !== undefined && ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName);
}
/**
 * A class member's parameters as its call sites see them, or the reason it has none this build can
 * place.
 *
 * Collection runs before any member is lowered, so this is the signature without its defaults: a
 * parameter that is optional or has a default may be omitted, and the call site passes `undefined`
 * into its slot. The member's own function lowers its defaults and destructuring patterns with
 * `lowerFunctionParameters`, which names every slot as `parameterSlotName` does here.
 */
export function classCallableParameters(
  declaration: ts.ConstructorDeclaration | ts.MethodDeclaration | ts.AccessorDeclaration
): Produced<readonly JsIrFunctionParameter[]> {
  const parameters: JsIrFunctionParameter[] = [];
  for (const [index, param] of runtimeParameters(declaration.parameters).entries()) {
    // An accessibility or `readonly` modifier declares a field, which the constructor stores onto
    // `this`; it is not an error and it is not a second argv slot. Any other modifier on a parameter
    // declares no field and is not something this tier knows.
    if ((ts.getModifiers(param)?.length ?? 0) > 0 && !isParameterProperty(param)) {
      return unsupportedIn("This modifier on a class member parameter is not supported yet");
    }
    const name = parameterSlotName(param, index);
    if (param.dotDotDotToken !== undefined) {
      parameters.push({ name, valueKind: "value", isRest: true });
    } else if (param.questionToken !== undefined || param.initializer !== undefined) {
      parameters.push({ name, valueKind: "value", isOptional: true });
    } else {
      parameters.push({ name, valueKind: ts.isIdentifier(param.name) ? parameterValueKind(param) : "value" });
    }
  }
  return produced(parameters);
}

/** The argv slot a parameter binds: its own name, or a private name for a destructuring pattern. */
export function parameterSlotName(parameter: ts.ParameterDeclaration, index: number): string {
  return ts.isIdentifier(parameter.name) ? parameter.name.text : `__param${index}`;
}
// Resolves a static field read `C.x` to a property access on the class's
// module-level static storage slot. Returns undefined when the receiver is not a
// class name or the property is not a declared static field.
export function lowerClassStaticFieldAccess(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  if (!ts.isPropertyAccessExpression(expression)) {
    return undefined;
  }
  const receiver = expression.expression;
  if (!ts.isIdentifier(receiver) || bindings.has(receiver.text)) {
    return undefined;
  }
  const info = context.classes.get(receiver.text);
  if (info === undefined || findClassInChain(context, info, (candidate) =>
    candidate.staticFields.has(expression.name.text) ||
    candidate.staticGetters.has(expression.name.text) ||
    candidate.staticSetters.has(expression.name.text)
  ) === undefined) {
    return undefined;
  }
  return {
    kind: "valueObjectDynamicAccess",
    value: { kind: "variable", name: classStaticStorageName(info.name) },
    key: { kind: "literal", value: expression.name.text }
  };
}
export function findClassInChain(
  context: LoweringContext,
  info: ClassInfo,
  predicate: (candidate: ClassInfo) => boolean
): ClassInfo | undefined {
  let current: ClassInfo | undefined = info;
  while (current !== undefined) {
    if (predicate(current)) {
      return current;
    }
    if (current.baseName === undefined) {
      return undefined;
    }
    current = context.classes.get(current.baseName) ?? context.allClasses.get(current.baseName);
  }
  return undefined;
}
// Determines the class of a method-call receiver. Directly-known instances
// (`new C()`) resolve via the registry; `this` in a constructor or instance member resolves to the
// enclosing class; named-variable receivers resolve through their binding or the TypeScript checker,
// and element, property and call receivers resolve through the checker alone.
export function resolveReceiverClass(
  context: LoweringContext,
  receiver: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): ClassInfo | undefined {
  // `this` is an instance of the enclosing class or one of its subclasses. The static class is the
  // enclosing one; a subclass instance is exactly what makes the call dispatch at runtime.
  if (receiver.kind === ts.SyntaxKind.ThisKeyword) {
    return context.classThisInScope ? context.activeEnclosingClass : undefined;
  }
  if (ts.isNewExpression(receiver) && ts.isIdentifier(receiver.expression) && !bindings.has(receiver.expression.text)) {
    const info = context.classes.get(receiver.expression.text);
    return info?.hasValueReturn === true ? undefined : info;
  }
  if (ts.isIdentifier(receiver)) {
    // A variable initialized with `new C(...)` resolves through its binding,
    // which also covers class types the checker cannot name (anonymous class
    // expressions).
    const binding = bindings.get(receiver.text);
    if (binding?.kind === "value" && binding.value.kind === "newInstance") {
      const info = context.classes.get(binding.value.className);
      return info?.hasValueReturn === true ? undefined : info;
    }
    if (binding?.kind === "valueVariable" && binding.className !== undefined) {
      const info = context.classes.get(binding.className);
      return info?.hasValueReturn === true ? undefined : info;
    }
  }
  return checkerReceiverClass(context, receiver);
}
/**
 * The class a receiver's static type names, or `undefined` when the checker names none.
 *
 * Only expressions with a type of their own qualify: an identifier, an element or property read, or
 * a call result. Anything else reaching here (`this` and `new` are claimed above) has no static
 * class this tier can dispatch on.
 */
function checkerReceiverClass(context: LoweringContext, receiver: ts.Expression): ClassInfo | undefined {
  const { typeChecker } = context;
  if (typeChecker === undefined) {
    return undefined;
  }
  if (!ts.isIdentifier(receiver) && !ts.isElementAccessExpression(receiver) && !ts.isPropertyAccessExpression(receiver) && !ts.isCallExpression(receiver)) {
    return undefined;
  }
  const symbol = typeChecker.getTypeAtLocation(receiver).getSymbol();
  if (symbol === undefined) {
    return undefined;
  }
  return context.classes.get(symbol.getName());
}
export function isPlainObjectReturningConstructor(declaration: ts.FunctionDeclaration): boolean {
  if (declaration.body === undefined || containsLexicalThis(declaration.body)) {
    return false;
  }
  const { statements } = declaration.body;
  const finalStatement = statements.at(-1);
  if (finalStatement === undefined || !ts.isReturnStatement(finalStatement) || finalStatement.expression === undefined) {
    return false;
  }
  if (statements.slice(0, -1).some(containsReturnStatement)) {
    return false;
  }
  const returned = unwrapTypeOnlyExpression(finalStatement.expression);
  if (ts.isObjectLiteralExpression(returned)) {
    return true;
  }
  if (!ts.isIdentifier(returned)) {
    return false;
  }
  for (const statement of statements.slice(0, -1)) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    for (const variable of statement.declarationList.declarations) {
      if (!ts.isIdentifier(variable.name) || variable.name.text !== returned.text || variable.initializer === undefined) {
        continue;
      }
      if ((statement.declarationList.flags & ts.NodeFlags.Const) === 0) {
        return false;
      }
      const initializer = unwrapTypeOnlyExpression(variable.initializer);
      if (ts.isObjectLiteralExpression(initializer)) {
        return true;
      }
      return ts.isNewExpression(initializer) && ts.isIdentifier(initializer.expression) &&
        errorConstructorNames.has(initializer.expression.text);
    }
  }
  return false;
}
function containsReturnStatement(node: ts.Node): boolean {
  if (ts.isFunctionLike(node)) {
    return false;
  }
  if (ts.isReturnStatement(node)) {
    return true;
  }
  let found = false;
  ts.forEachChild(node, (child) => {
    if (!found && containsReturnStatement(child)) {
      found = true;
    }
  });
  return found;
}
export function parameterValueKind(parameter: ts.ParameterDeclaration): JsIrValueKind {
  if (parameter.questionToken !== undefined) { return "value"; }
  if (parameter.type?.kind === ts.SyntaxKind.StringKeyword) {
    return "string";
  }
  // `boolean` is a concrete annotation the argument ABI has no scalar form for, and the number fallback
  // is worse than useless for it: `new C(true)` then failed as an argument this build cannot evaluate.
  // A boxed value is what `unknown` already uses for an annotation it cannot represent.
  if (
    parameter.type?.kind === ts.SyntaxKind.UnknownKeyword ||
    parameter.type?.kind === ts.SyntaxKind.AnyKeyword ||
    parameter.type?.kind === ts.SyntaxKind.BooleanKeyword
  ) {
    return "value";
  }
  if (hasUnconstrainedTypeParameter(parameter)) {
    return "value";
  }
  return parameter.type?.kind === ts.SyntaxKind.NumberKeyword ? "number" : "value";
}
export function containsLexicalThis(node: ts.Node): boolean {
  if (ts.isFunctionLike(node) && !ts.isArrowFunction(node)) {
    return false;
  }
  let found = false;
  const visit = (child: ts.Node): void => {
    if (found || child.kind === ts.SyntaxKind.ThisKeyword) {
      found = true;
      return;
    }
    if (child !== node && ts.isFunctionLike(child) && !ts.isArrowFunction(child)) {
      return;
    }
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return found;
}
export function containsLexicalArguments(node: ts.Node): boolean {
  if (ts.isFunctionLike(node) && !ts.isArrowFunction(node)) {
    return false;
  }
  let found = false;
  const visit = (child: ts.Node): void => {
    if (found) {
      return;
    }
    if (ts.isIdentifier(child) && child.text === "arguments") {
      const { parent } = child;
      const isNonValueRef =
        (ts.isPropertyAccessExpression(parent) && parent.name === child) ||
        (ts.isPropertyAssignment(parent) && parent.name === child) ||
        (ts.isMethodDeclaration(parent) && parent.name === child) ||
        (ts.isGetAccessorDeclaration(parent) && parent.name === child) ||
        (ts.isSetAccessorDeclaration(parent) && parent.name === child);
      if (!isNonValueRef) {
        found = true;
        return;
      }
    }
    if (child !== node && ts.isFunctionLike(child) && !ts.isArrowFunction(child)) {
      return;
    }
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return found;
}
