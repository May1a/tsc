import ts from "typescript";
import type { JsIrBindingValue, JsIrFunctionParameter, JsIrValueKind } from "./bindings.js";
import type { JsIrStringExpression, JsIrValueExpression } from "./expressions.js";
import type { JsIrOperation } from "./types.js";
import { updateBindings } from "./binding-updates.js";
import type { JsIrTraceOrigin } from "./module.js";
import { errorConstructorNames, unwrapTypeOnlyExpression } from "./predicates.js";
import { type Produced, produced, unsupportedIn } from "./lowered.js";
import { SYMBOL_ITERATOR_SENTINEL } from "../runtime-ir.js";


// Key of a class member. Literal keys are known at compile time; computed keys
// are evaluated once at class-definition time into a module-level slot and read
// back from there wherever the member is stored.
export type ClassMemberKey =
  | { readonly kind: "literal"; readonly name: string }
  | { readonly kind: "computed"; readonly slotName: string };
export interface ClassFieldInfo {
  readonly key: ClassMemberKey;
  readonly initializer: ts.Expression | undefined;
}
export interface ClassMethodInfo {
  readonly parameters: readonly JsIrFunctionParameter[];
}
export interface ClassInfo {
  readonly name: string;
  readonly baseName?: string;
  readonly fields: readonly ClassFieldInfo[];
  readonly classId: number;
  readonly constructorParameters: readonly JsIrFunctionParameter[];
  readonly methods: ReadonlyMap<string, ClassMethodInfo>;
  readonly staticMethods: ReadonlyMap<string, ClassMethodInfo>;
  readonly staticFields: ReadonlySet<string>;
  readonly getters: ReadonlySet<string>;
  readonly setters: ReadonlySet<string>;
  readonly iteratorMethod: ts.MethodDeclaration | undefined;
  // Source-level private field name (`#x`) → class-mangled storage key on the
  // instance object. Presence of the storage key doubles as the brand check.
  readonly privateFields: ReadonlyMap<string, string>;
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
export function classOperationTraceOrigin(index: number): JsIrTraceOrigin {
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
// Storage key for a private field: mangled with the owning class name behind a
// NUL prefix so it can never collide with a source-level property name. Its
// presence as an own property of an instance doubles as the class brand.
export function classPrivateFieldStorageKey(className: string, fieldName: string): string {
  return `\0private\0${className}\0${fieldName}`;
}
export function classMemberHasStaticModifier(member: ts.ClassElement): boolean {
  if (!ts.canHaveModifiers(member)) {
    return false;
  }
  return ts.getModifiers(member)?.some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword) ?? false;
}
/**
 * The class lowering's mutable state for the file being lowered.
 *
 * Three of these were loose module-level `let`s. They are one object because they are one thing: the
 * registry a `new C(...)` resolves against, the checker the class expressions ask, and the id counter
 * they share. An ES module binding cannot be assigned from outside its module, so they could not be cut
 * out of `ir.ts` as bindings — and three loose `let`s with `undefined` sentinels is exactly the shape
 * that becomes an accidental global. One named holder makes the scope the thing you read.
 *
 * `registry` is scoped per file by `lowerTopLevelStatements`, which saves and restores it around the
 * statement list; `typeChecker` is set by `lowerToJsIr` and cleared afterwards.
 */
export const classLoweringState: {
  typeChecker: ts.TypeChecker | undefined;
  registry: Map<string, ClassInfo> | undefined;
  nextId: number;
} = { typeChecker: undefined, registry: undefined, nextId: 1 };

/** `lowerClassDeclaration` with the registry rollback left to its caller. */
/**
 * The names a class body is lowered under: the one its generated functions are named after, the inner
 * name a named class expression binds inside its own body, and the base it extends.
 *
 * Class expressions take their codegen name from the bound variable; a named class expression
 * additionally binds its inner name inside the class body.
 */
export interface ClassNames {
  readonly infoName: string;
  readonly innerName: string | undefined;
  readonly baseName: string | undefined;
}
export function resolveClassNames(
  statement: ts.ClassDeclaration | ts.ClassExpression,
  expressionBindingName: string | undefined,
  classes: ReadonlyMap<string, ClassInfo>
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
  if (statement.heritageClauses === undefined || statement.heritageClauses.length === 0) {
    return produced({ infoName, innerName, baseName: undefined });
  }
  const baseName = resolveExtendedClassName(statement.heritageClauses, classes);
  if (baseName === undefined) {
    return unsupportedIn(classHeritageRefusal(statement.heritageClauses));
  }
  return produced({ infoName, innerName, baseName });
}
/** Why a heritage clause produced no usable base class. */
export function classHeritageRefusal(heritageClauses: ts.NodeArray<ts.HeritageClause>): string {
  if (heritageClauses.length !== 1) {
    return "A class may have at most one heritage clause";
  }
  const [heritage] = heritageClauses;
  if (heritage.token !== ts.SyntaxKind.ExtendsKeyword) {
    return "Class `implements` clauses are not supported yet; only `extends` is lowered";
  }
  if (heritage.types.length === 1 && ts.isIdentifier(heritage.types[0].expression)) {
    return `\`extends ${heritage.types[0].expression.text}\` does not name a class declared in this module`;
  }
  return "`extends` must name a single class declared in this module";
}
/** The base class a heritage clause names, or `undefined` when it names something unusable. */
export function resolveExtendedClassName(
  heritageClauses: ts.NodeArray<ts.HeritageClause>,
  classes: ReadonlyMap<string, ClassInfo>
): string | undefined {
  if (heritageClauses.length !== 1) {
    return undefined;
  }
  const [heritage] = heritageClauses;
  if (heritage.token !== ts.SyntaxKind.ExtendsKeyword || heritage.types.length !== 1) {
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
  let constructorParameters = ownParameters.operation;
  if (names.baseName !== undefined && members.constructorDeclaration === undefined) {
    constructorParameters = classes.get(names.baseName)?.constructorParameters ?? [];
  }
  return produced({
    name: names.infoName,
    baseName: names.baseName,
    fields: members.fields,
    classId: classLoweringState.nextId++,
    constructorParameters,
    methods: ownMethods.operation,
    staticMethods: staticMethods.operation,
    staticFields: literalStaticFieldNames(members.staticFields),
    getters: new Set(members.getAccessors.map((entry) => entry.name)),
    setters: new Set(members.setAccessors.map((entry) => entry.name)),
    iteratorMethod: members.iteratorMethod,
    privateFields: members.privateFields
  });
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
    [members.staticMethodDeclarations, true]
  ];
}
/** The getter and setter entries, paired with whether each is a getter. */
export function classAccessorEntries(
  members: CollectedClassMembers
): readonly (readonly [readonly ClassAccessorEntry[], boolean])[] {
  return [
    [members.getAccessors, true],
    [members.setAccessors, false]
  ];
}
export function literalStaticFieldNames(staticFields: readonly ClassFieldInfo[]): ReadonlySet<string> {
  const names = new Set<string>();
  for (const field of staticFields) {
    if (field.key.kind === "literal") {
      names.add(field.key.name);
    }
  }
  return names;
}
// Resolves a computed member name that is constant at compile time (a string,
// numeric, or template literal, or a const-bound string), so such members keep
// using the ordinary static machinery.
export function resolveConstantComputedMemberName(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): string | undefined {
  if (ts.isStringLiteral(expression) || ts.isNumericLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }
  if (ts.isIdentifier(expression)) {
    const binding = bindings.get(expression.text);
    if (binding?.kind === "string") {
      return binding.value;
    }
  }
  return undefined;
}
// Resolves the key of a class member. Runtime-computed names are recorded in
// `computedKeys` (in definition order) so their evaluation can be emitted once
// at class-definition time. Returns undefined for names this lowering cannot
// handle (private identifiers, symbol keys other than Symbol.iterator).
export function classMemberKeyOf(
  name: ts.PropertyName,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  computedKeys: ClassComputedKeyInfo[],
  slotPrefix: string
): ClassMemberKey | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return { kind: "literal", name: name.text };
  }
  if (!ts.isComputedPropertyName(name)) {
    return undefined;
  }
  const constant = resolveConstantComputedMemberName(name.expression, bindings);
  if (constant !== undefined) {
    return { kind: "literal", name: constant };
  }
  const slotName = `${slotPrefix}$computed$${computedKeys.length}`;
  computedKeys.push({ slotName, expression: name.expression });
  return { kind: "computed", slotName };
}
/**
 * The literal name of a member that only supports compile-time names, or the reason it has none.
 *
 * Accessors are the only members that need this: a getter's name is baked into the generated
 * function's LLVM name at emit time, so a computed one has nothing to bake. The reason says that
 * rather than letting the caller report the enclosing class.
 */
export function classLiteralMemberName(
  name: ts.PropertyName,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<string> {
  const key = classMemberKeyOf(name, bindings, [], "");
  if (key?.kind !== "literal") {
    return unsupportedIn("Accessor names must be compile-time literals");
  }
  return produced(key.name);
}
export interface ClassComputedKeyInfo {
  readonly slotName: string;
  readonly expression: ts.Expression;
}
export interface ClassMethodEntry {
  readonly name: string;
  readonly declaration: ts.MethodDeclaration;
}
export interface ClassComputedMethodEntry {
  readonly slotName: string;
  readonly declaration: ts.MethodDeclaration;
}
export interface ClassAccessorEntry {
  readonly name: string;
  readonly declaration: ts.AccessorDeclaration;
}
export interface CollectedClassMembers {
  readonly fields: readonly ClassFieldInfo[];
  readonly staticFields: readonly ClassFieldInfo[];
  readonly computedKeys: readonly ClassComputedKeyInfo[];
  readonly constructorDeclaration: ts.ConstructorDeclaration | undefined;
  readonly methodDeclarations: readonly ClassMethodEntry[];
  readonly staticMethodDeclarations: readonly ClassMethodEntry[];
  readonly computedMethodDeclarations: readonly ClassComputedMethodEntry[];
  readonly computedStaticMethodDeclarations: readonly ClassComputedMethodEntry[];
  readonly getAccessors: readonly ClassAccessorEntry[];
  readonly setAccessors: readonly ClassAccessorEntry[];
  readonly iteratorMethod: ts.MethodDeclaration | undefined;
  readonly privateFields: ReadonlyMap<string, string>;
}
// eslint-disable-next-line complexity, max-statements -- Class member classification keeps mutually exclusive syntax forms in declaration order.
export function collectClassMembers(
  statement: ts.ClassDeclaration | ts.ClassExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  slotPrefix: string
): Produced<CollectedClassMembers> {
  const fields: ClassFieldInfo[] = [];
  const staticFields: ClassFieldInfo[] = [];
  const computedKeys: ClassComputedKeyInfo[] = [];
  const methodDeclarations: ClassMethodEntry[] = [];
  const staticMethodDeclarations: ClassMethodEntry[] = [];
  const computedMethodDeclarations: ClassComputedMethodEntry[] = [];
  const computedStaticMethodDeclarations: ClassComputedMethodEntry[] = [];
  const getAccessors: ClassAccessorEntry[] = [];
  const setAccessors: ClassAccessorEntry[] = [];
  const privateFields = new Map<string, string>();
  let constructorDeclaration: ts.ConstructorDeclaration | undefined;
  let iteratorMethod: ts.MethodDeclaration | undefined;
  for (const member of statement.members) {
    if (ts.isPropertyDeclaration(member) && ts.isPrivateIdentifier(member.name)) {
      // Instance private fields join the ordinary field list (under a
      // class-mangled key) so they initialize in declaration order. Static
      // private fields are not lowered yet.
      if (classMemberHasStaticModifier(member)) {
        return unsupportedIn("Static private class fields are not supported yet");
      }
      const storageKey = classPrivateFieldStorageKey(slotPrefix, member.name.text);
      privateFields.set(member.name.text, storageKey);
      fields.push({ key: { kind: "literal", name: storageKey }, initializer: member.initializer });
    } else if (ts.isPropertyDeclaration(member)) {
      const key = classMemberKeyOf(member.name, bindings, computedKeys, slotPrefix);
      if (key === undefined) {
        return unsupportedIn("Class field names must be identifiers, string literals, or computable from constants");
      }
      let target = fields;
      if (classMemberHasStaticModifier(member)) {
        target = staticFields;
      }
      target.push({ key, initializer: member.initializer });
    } else if (ts.isConstructorDeclaration(member)) {
      constructorDeclaration = member;
    } else if (ts.isMethodDeclaration(member) && member.body !== undefined && isSymbolIteratorPropertyName(member.name, bindings)) {
      if (classMemberHasStaticModifier(member)) {
        return unsupportedIn("A static [Symbol.iterator] method is not supported yet");
      }
      if (iteratorMethod !== undefined) {
        return unsupportedIn("A class may declare at most one [Symbol.iterator] method");
      }
      iteratorMethod = member;
    } else if (ts.isMethodDeclaration(member) && member.body !== undefined) {
      const key = classMemberKeyOf(member.name, bindings, computedKeys, slotPrefix);
      if (key === undefined) {
        return unsupportedIn("Method names must be identifiers, string literals, or computable from constants");
      }
      if (key.kind === "literal") {
        if (classMemberHasStaticModifier(member)) {
          staticMethodDeclarations.push({ name: key.name, declaration: member });
        } else {
          methodDeclarations.push({ name: key.name, declaration: member });
        }
      } else if (classMemberHasStaticModifier(member)) {
        computedStaticMethodDeclarations.push({ slotName: key.slotName, declaration: member });
      } else {
        computedMethodDeclarations.push({ slotName: key.slotName, declaration: member });
      }
    } else if (ts.isGetAccessorDeclaration(member) && !classMemberHasStaticModifier(member) && member.body !== undefined) {
      const accessorName = classLiteralMemberName(member.name, bindings);
      if (accessorName.kind !== "lowered") {
        return accessorName;
      }
      getAccessors.push({ name: accessorName.operation, declaration: member });
    } else if (ts.isSetAccessorDeclaration(member) && !classMemberHasStaticModifier(member) && member.body !== undefined) {
      const accessorName = classLiteralMemberName(member.name, bindings);
      if (accessorName.kind !== "lowered") {
        return accessorName;
      }
      setAccessors.push({ name: accessorName.operation, declaration: member });
    } else {
      return unsupportedIn(classMemberRefusalReason(member));
    }
  }
  return produced({
    fields,
    staticFields,
    computedKeys,
    constructorDeclaration,
    methodDeclarations,
    staticMethodDeclarations,
    computedMethodDeclarations,
    computedStaticMethodDeclarations,
    getAccessors,
    setAccessors,
    iteratorMethod,
    privateFields
  });
}
/**
 * Why a member reached the end of `collectClassMembers` unclassified.
 *
 * Every branch above claims the members it can place, so whatever is left is one of the forms the
 * class tier does not lower. Naming which one is the difference between a diagnostic that says
 * "private methods are not supported yet" and one that says "class lowering unsupported".
 */
export function classMemberRefusalReason(member: ts.ClassElement): string {
  if (ts.isConstructorDeclaration(member)) {
    return "An overloaded constructor is not supported yet; only the implementation is lowered";
  }
  if (member.name === undefined) {
    return "Index signatures and construct signatures are not supported in a class yet";
  }
  if (ts.isPrivateIdentifier(member.name)) {
    return "Private class methods and accessors are not supported yet";
  }
  if (ts.isMethodDeclaration(member) && member.body === undefined) {
    return "Method overload signatures are not supported yet; only the implementation is lowered";
  }
  if ((ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member)) && classMemberHasStaticModifier(member)) {
    return "Static accessors are not supported yet";
  }
  return "This class member form is not supported yet";
}
export function constructorParametersOf(
  declaration: ts.ConstructorDeclaration | undefined
): Produced<readonly JsIrFunctionParameter[]> {
  if (declaration === undefined) {
    return produced([] as readonly JsIrFunctionParameter[]);
  }
  return classCallableParameters(declaration);
}
export function classMethodInfoMap(
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
 * The runtime parameters of a class member, or the reason it has none this build can place.
 *
 * A class member's parameter list becomes an LLVM function signature with one slot per parameter, so
 * a parameter with no fixed shape has no slot: a rest parameter is a different calling convention, an
 * optional or defaulted one needs a slot filled at the call site, and a destructuring or
 * parameter-property one has no name to give the slot. Those are five different omissions that all
 * used to be one string, and the reason is what a user needs in order to know which one they wrote.
 */
export function classCallableParameters(
  declaration: ts.ConstructorDeclaration | ts.MethodDeclaration | ts.AccessorDeclaration
): Produced<readonly JsIrFunctionParameter[]> {
  const parameters: JsIrFunctionParameter[] = [];
  for (const param of runtimeParameters(declaration.parameters)) {
    if (param.dotDotDotToken !== undefined) {
      return unsupportedIn("Rest parameters are not supported on class members yet");
    }
    if (param.questionToken !== undefined) {
      return unsupportedIn("Optional parameters are not supported on class members yet");
    }
    if (param.initializer !== undefined) {
      return unsupportedIn("Parameters with defaults are not supported on class members yet");
    }
    if ((ts.getModifiers(param)?.length ?? 0) > 0) {
      return unsupportedIn("Parameter properties are not supported on class members yet");
    }
    if (!ts.isIdentifier(param.name)) {
      return unsupportedIn("Destructuring parameters are not supported on class members yet");
    }
    parameters.push({ name: param.name.text, valueKind: parameterValueKind(param) });
  }
  return produced(parameters);
}
// Resolves a static field read `C.x` to a property access on the class's
// module-level static storage slot. Returns undefined when the receiver is not a
// class name or the property is not a declared static field.
export function lowerClassStaticFieldAccess(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  if (classLoweringState.registry === undefined || !ts.isPropertyAccessExpression(expression)) {
    return undefined;
  }
  const receiver = expression.expression;
  if (!ts.isIdentifier(receiver) || bindings.has(receiver.text)) {
    return undefined;
  }
  const info = classLoweringState.registry.get(receiver.text);
  if (info === undefined || findClassInChain(info, (candidate) => candidate.staticFields.has(expression.name.text)) === undefined) {
    return undefined;
  }
  return {
    kind: "valueObjectDynamicAccess",
    value: { kind: "variable", name: classStaticStorageName(info.name) },
    key: { kind: "literal", value: expression.name.text }
  };
}
export function findClassInChain(info: ClassInfo, predicate: (candidate: ClassInfo) => boolean): ClassInfo | undefined {
  let current: ClassInfo | undefined = info;
  while (current !== undefined) {
    if (predicate(current)) {
      return current;
    }
    if (current.baseName === undefined) {
      return undefined;
    }
    current = classLoweringState.registry?.get(current.baseName);
  }
  return undefined;
}
// Determines the class of a method-call receiver. Directly-known instances
// (`new C()`) resolve via the registry; named-variable receivers resolve through
// the TypeScript checker.
export function resolveReceiverClass(
  receiver: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): ClassInfo | undefined {
  if (classLoweringState.registry === undefined) {
    return undefined;
  }
  if (ts.isNewExpression(receiver) && ts.isIdentifier(receiver.expression) && !bindings.has(receiver.expression.text)) {
    return classLoweringState.registry.get(receiver.expression.text);
  }
  if (ts.isIdentifier(receiver)) {
    // A variable initialized with `new C(...)` resolves through its binding,
    // which also covers class types the checker cannot name (anonymous class
    // expressions).
    const binding = bindings.get(receiver.text);
    if (binding?.kind === "value" && binding.value.kind === "newInstance") {
      return classLoweringState.registry.get(binding.value.className);
    }
    if (binding?.kind === "valueVariable" && binding.className !== undefined) {
      return classLoweringState.registry.get(binding.className);
    }
  }
  if (ts.isIdentifier(receiver) && classLoweringState.typeChecker !== undefined) {
    const symbol = classLoweringState.typeChecker.getTypeAtLocation(receiver).getSymbol();
    if (symbol !== undefined) {
      return classLoweringState.registry.get(symbol.getName());
    }
  }
  return undefined;
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
export function containsReturnStatement(node: ts.Node): boolean {
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
  if (parameter.type?.kind === ts.SyntaxKind.StringKeyword) {
    return "string";
  }
  if (parameter.type?.kind === ts.SyntaxKind.UnknownKeyword || parameter.type?.kind === ts.SyntaxKind.AnyKeyword) {
    return "value";
  }
  return "number";
}
/** True for TypeScript's type-only `this: T` parameter (not a runtime argv slot). */
export function isTypeOnlyThisParameter(parameter: ts.ParameterDeclaration): boolean {
  return ts.isIdentifier(parameter.name) && parameter.name.text === "this";
}
export function runtimeParameters(parameters: readonly ts.ParameterDeclaration[]): readonly ts.ParameterDeclaration[] {
  return parameters.filter((parameter) => !isTypeOnlyThisParameter(parameter));
}
export function containsLexicalThis(node: ts.Node): boolean {
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
/**
 * Recognise the well-known `Symbol.iterator` member access as the compiler-owned
 * sentinel key. General `Symbol()` / `Symbol.for` remain unsupported.
 */
export function lowerSymbolIteratorKeyExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrStringExpression | undefined {
  if (!ts.isPropertyAccessExpression(expression) || !ts.isIdentifier(expression.expression)) {
    return undefined;
  }
  if (expression.expression.text !== "Symbol" || bindings.has("Symbol")) {
    return undefined;
  }
  if (expression.name.text !== "iterator") {
    return undefined;
  }
  return { kind: "literal", value: SYMBOL_ITERATOR_SENTINEL };
}
export function isSymbolIteratorPropertyName(
  name: ts.PropertyName,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): boolean {
  return ts.isComputedPropertyName(name) && lowerSymbolIteratorKeyExpression(name.expression, bindings) !== undefined;
}
