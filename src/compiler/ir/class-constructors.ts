import type { LoweringContext } from "./context.js";
import { type ClassFieldInfo, type ClassInfo, classPrivateFunctions } from "./class-info.js";
import ts from "typescript";
import type { JsIrBindingValue, JsIrCallArgument, JsIrFunctionParameter } from "./bindings.js";
import { type Lowered, type Produced, loweredPayload, notApplicable, produced, unsupportedIn, withRefusal } from "./lowered.js";
import type { JsIrOperation } from "./types.js";
import { CLASS_THIS_NAME, classAbortReason, classConstructorName, classMemberKeyStringExpression, classPrivateFieldDefineMessage } from "./class-names.js";
import { bindFunctionParameter, functionFrameBindings } from "./function-parameters.js";
import { lowerFunctionParameters } from "./function-parameter-lowering.js";
import { isNonExecutableDeclaration } from "./comparisons.js";
import { updateBindings } from "./binding-updates.js";
import { collectMethodEnclosingCaptureNames } from "./captures.js";
import type { JsIrValueExpression } from "./expressions.js";
import { expressionSnippet } from "./diagnostics.js";
import { SYMBOL_ITERATOR_SENTINEL } from "../symbols.js";
import { collectParameterBindingNames, withHoistedVars } from "./var-hoisting.js";

// eslint-disable-next-line complexity, max-statements -- Constructor lowering owns super ordering, instance initialization, and body scope restoration.
export function lowerClassConstructor(
  context: LoweringContext,
  info: ClassInfo,
  constructorDeclaration: ts.ConstructorDeclaration | undefined,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrOperation> {
  const receiverBindings = functionFrameBindings(bindings);
  receiverBindings.set(CLASS_THIS_NAME, { kind: "valueVariable", name: CLASS_THIS_NAME });

  const previousThis = context.classThisInScope;
  const previousCtor = context.inClassConstructor;
  const previousClass = context.activeEnclosingClass;
  const previousStatic = context.activeClassMethodStatic;
  context.classThisInScope = true;
  context.inClassConstructor = true;
  context.activeEnclosingClass = info;
  context.activeClassMethodStatic = false;
  try {
    const lowered = lowerConstructorParameters(context, info, constructorDeclaration, receiverBindings);
    if (lowered.kind !== "lowered") {
      return lowered;
    }
    const { bindings: fnBindings } = lowered.operation;
    const parameters: JsIrFunctionParameter[] = [{ name: CLASS_THIS_NAME, valueKind: "value" }, ...lowered.operation.parameters];
    const body: JsIrOperation[] = [];
    let remainingStatements: readonly ts.Statement[] = constructorDeclaration?.body?.statements ?? [];
    if (info.baseName !== undefined || info.baseErrorName !== undefined) {
      const superResult = lowerDerivedSuperCall(context, info, constructorDeclaration, fnBindings);
      if (superResult.kind !== "lowered") {
        return superResult;
      }
      body.push(...superResult.operation.operations);
      ({ remainingStatements } = superResult.operation);
    }
    const iteratorStore = lowerClassIteratorStore(context, info, fnBindings);
    if (iteratorStore.kind === "unsupported") {
      return iteratorStore;
    }
    if (iteratorStore.kind === "lowered") {
      body.push(iteratorStore.operation);
    }
    // Private methods and accessors join the instance before any field initializer runs
    // (InitializeInstanceElements).
    for (const privateFunction of classPrivateFunctions(info)) {
      body.push({
        kind: "privateFieldStore",
        targetName: CLASS_THIS_NAME,
        key: privateFunction.storageKey,
        value: { kind: "variable", name: privateFunction.slotName },
        message: classPrivateFieldDefineMessage(privateFunction.functionName),
        define: true
      });
    }
    // TypeScript assigns parameter properties after `super(...)` and before the field initializers, so
    // a field initializer may read one. The order here matches that emit exactly, which is what makes
    // `class C { x = this.p + 1; constructor(public p: number) {} }` read the argument.
    for (const name of info.parameterProperties) {
      const parameter = lowered.operation.parameters.find((candidate) => candidate.name === name);
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
      const initializer = lowerClassFieldInitializer(context, field, fnBindings);
      if (initializer.kind !== "lowered") {
        return initializer;
      }
      body.push(classFieldStore(field, initializer.operation));
    }
    if (constructorDeclaration?.body !== undefined) {
      const loweredStatements = lowerConstructorBodyStatements(context, remainingStatements, constructorDeclaration.parameters, fnBindings);
      if (loweredStatements.kind !== "lowered") {
        return loweredStatements;
      }
      // Isolate constructor body declarations (including hoisted `var`s) in a nested block scope so
      // binding resolution does not let them shadow outer bindings read by field initializers.
      body.push({ kind: "block", operations: loweredStatements.operation });
    }
    const constructorCaptures = constructorDeclaration?.body === undefined ? [] :
      collectMethodEnclosingCaptureNames(context.typeChecker, constructorDeclaration, constructorDeclaration.body,
        [...constructorDeclaration.parameters], bindings);
    const fieldCaptures = collectFieldInitializerCaptureNames(info, bindings);
    const captureNames = [...constructorCaptures, ...fieldCaptures.filter((name) => !constructorCaptures.includes(name))];
    return produced({ kind: "function", name: classConstructorName(info.name), parameters, body,
      ...(captureNames.length === 0 ? {} : { enclosingCaptureNames: [...captureNames] }) });
  } finally {
    context.classThisInScope = previousThis;
    context.inClassConstructor = previousCtor;
    context.activeEnclosingClass = previousClass;
    context.activeClassMethodStatic = previousStatic;
  }
}

function lowerDerivedSuperCall(
  context: LoweringContext,
  info: ClassInfo,
  constructorDeclaration: ts.ConstructorDeclaration | undefined,
  fnBindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<{ readonly operations: readonly JsIrOperation[]; readonly remainingStatements: readonly ts.Statement[] }> {
  if (info.baseErrorName !== undefined) {
    return lowerErrorSuperCall(context, info, constructorDeclaration, fnBindings);
  }
  const base = info.baseName === undefined ? undefined : context.classes.get(info.baseName);
  if (base === undefined) {
    return unsupportedIn(`\`extends ${info.baseName ?? "that class"}\` names a class this module did not lower`);
  }
  if (constructorDeclaration === undefined) {
    if (info.constructorParameters.some((parameter) => parameter.isRest === true)) {
      const spreadElements = [
        { kind: "value" as const, value: { kind: "variable" as const, name: CLASS_THIS_NAME } },
        ...info.constructorParameters.map((parameter) =>
          parameter.isRest === true
            ? { kind: "spread" as const, arrayName: parameter.name, sourceKind: "runtime" as const }
            : { kind: "value" as const, value: forwardedClassValue(parameter) }
        )
      ];
      return produced({
        operations: [{
          kind: "callValue",
          callee: {
            kind: "functionObject",
            definition: {
              codeName: `__tscn_super_fwd_${info.name}_${context.nextFunctionObjectId++}`.replace(/[^A-Za-z0-9_]/g, "_"),
              parameters: [{ name: CLASS_THIS_NAME, valueKind: "value" }, ...base.constructorParameters],
              functionKind: "ordinary",
              returnKind: "value",
              directTarget: classConstructorName(base.name)
            }
          },
          arguments: [],
          spreadArguments: spreadElements
        }],
        remainingStatements: []
      });
    }
    return produced({
      operations: [{
        kind: "call",
        name: classConstructorName(base.name),
        arguments: [{ valueKind: "value", value: { kind: "variable", name: CLASS_THIS_NAME } }, ...info.constructorParameters.map(forwardedClassArgument)]
      }],
      remainingStatements: []
    });
  }
  const statements = constructorDeclaration.body?.statements ?? ts.factory.createNodeArray<ts.Statement>();
  const [first, ...rest] = statements as readonly (ts.Statement | undefined)[];
  if (
    first === undefined ||
    !ts.isExpressionStatement(first) ||
    !ts.isCallExpression(first.expression) ||
    first.expression.expression.kind !== ts.SyntaxKind.SuperKeyword
  ) {
    return unsupportedIn("A derived constructor must call `super(...)` as its first statement");
  }
  const typedCallArgumentsResult = context.lowerTypedCallArguments(context, base.constructorParameters, first.expression.arguments, fnBindings);
  if (typedCallArgumentsResult.kind === "unsupported") {
    return typedCallArgumentsResult;
  }
  const superArguments = loweredPayload(typedCallArgumentsResult);
  if (superArguments === undefined) {
    return unsupportedIn("`super(...)` arguments must be expressions this build can evaluate");
  }
  return produced({
    operations: [{
      kind: "call",
      name: classConstructorName(base.name),
      arguments: [{ valueKind: "value", value: { kind: "variable", name: CLASS_THIS_NAME } }, ...superArguments]
    }],
    remainingStatements: rest.filter((statement): statement is ts.Statement => statement !== undefined)
  });
}

function lowerErrorSuperCall(
  context: LoweringContext,
  info: ClassInfo,
  constructorDeclaration: ts.ConstructorDeclaration | undefined,
  fnBindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<{ readonly operations: readonly JsIrOperation[]; readonly remainingStatements: readonly ts.Statement[] }> {
  const operations: JsIrOperation[] = [
    {
      kind: "valueObjectStore",
      targetName: CLASS_THIS_NAME,
      key: { kind: "literal", value: "name" },
      value: { kind: "string", value: { kind: "literal", value: info.baseErrorName ?? "Error" } }
    }
  ];
  if (constructorDeclaration === undefined) {
    operations.push({
      kind: "valueObjectStore",
      targetName: CLASS_THIS_NAME,
      key: { kind: "literal", value: "message" },
      value: {
        kind: "ternary",
        condition: { kind: "valueComparison", operator: "===", left: { kind: "variable", name: "message" }, right: { kind: "undefined" } },
        consequent: { kind: "string", value: { kind: "literal", value: "" } },
        alternate: { kind: "string", value: { kind: "stringConversion", value: { kind: "variable", name: "message" } } }
      }
    });
    return produced({ operations, remainingStatements: [] });
  }
  const statements = constructorDeclaration.body?.statements ?? ts.factory.createNodeArray<ts.Statement>();
  const [first, ...rest] = statements as readonly (ts.Statement | undefined)[];
  if (
    first === undefined ||
    !ts.isExpressionStatement(first) ||
    !ts.isCallExpression(first.expression) ||
    first.expression.expression.kind !== ts.SyntaxKind.SuperKeyword
  ) {
    return unsupportedIn("A derived constructor must call `super(...)` as its first statement");
  }
  const messageArg: ts.Expression | undefined = first.expression.arguments.at(0);
  const remainingStatements = rest.filter((statement): statement is ts.Statement => statement !== undefined);
  if (messageArg === undefined) {
    operations.push({
      kind: "valueObjectStore",
      targetName: CLASS_THIS_NAME,
      key: { kind: "literal", value: "message" },
      value: { kind: "string", value: { kind: "literal", value: "" } }
    });
  } else {
    const loweredMsg = context.lowerValueExpression(context, messageArg, fnBindings);
    if (loweredMsg.kind !== "lowered") {
      return withRefusal(loweredMsg, unsupportedIn("`super(...)` arguments must be expressions this build can evaluate"));
    }
    operations.push({
      kind: "valueObjectStore",
      targetName: CLASS_THIS_NAME,
      key: { kind: "literal", value: "message" },
      value: { kind: "string", value: { kind: "stringConversion", value: loweredMsg.operation } }
    });
  }
  return produced({ operations, remainingStatements });
}

function forwardedClassValue(parameter: JsIrFunctionParameter): JsIrValueExpression {
  if (parameter.valueKind === "number") {
    return { kind: "number", value: { kind: "parameter", name: parameter.name } };
  }
  if (parameter.valueKind === "string") {
    return { kind: "string", value: { kind: "variable", name: parameter.name } };
  }
  return { kind: "variable", name: parameter.name };
}

function lowerConstructorBodyStatements(
  context: LoweringContext,
  statements: readonly ts.Statement[],
  constructorParameters: readonly ts.ParameterDeclaration[],
  bindings: Map<string, JsIrBindingValue>
): Produced<readonly JsIrOperation[]> {
  const parameterNames = collectParameterBindingNames(constructorParameters, [CLASS_THIS_NAME]);
  return withHoistedVars(context, statements, bindings, parameterNames, (preface) => {
    const operations: JsIrOperation[] = [...preface];
    for (const statement of statements) {
      if (isNonExecutableDeclaration(statement)) {
        continue;
      }
      if (ts.isReturnStatement(statement)) {
        let value: JsIrValueExpression | undefined = { kind: "undefined" };
        if (statement.expression !== undefined) {
          const lowered = context.lowerValueExpression(context, statement.expression, bindings);
          if (lowered.kind === "unsupported") {
            return lowered;
          }
          value = loweredPayload(lowered);
        }
        if (value === undefined) {
          return unsupportedIn("The return value in a class constructor is not an expression this build can evaluate");
        }
        operations.push({ kind: "returnValue", expression: value });
        continue;
      }
      const result = context.lowerStatement(context, statement, bindings);
      if (result.kind !== "lowered") {
        return unsupportedIn(classAbortReason(result));
      }
      operations.push(result.operation);
      updateBindings(result.operation, bindings);
    }
    return produced(operations);
  });
}

/**
 * A written constructor lowers its parameters like a function declaration's, defaults and patterns
 * included. An implicit one takes the signature it forwards to the base constructor, which applies
 * its own defaults.
 */
function lowerConstructorParameters(
  context: LoweringContext,
  info: ClassInfo,
  constructorDeclaration: ts.ConstructorDeclaration | undefined,
  receiverBindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<{
  readonly parameters: readonly JsIrFunctionParameter[];
  readonly bindings: Map<string, JsIrBindingValue>;
}> {
  if (constructorDeclaration !== undefined) {
    return lowerFunctionParameters(context, constructorDeclaration.parameters, receiverBindings);
  }
  const fnBindings = new Map(receiverBindings);
  for (const parameter of info.constructorParameters) {
    bindFunctionParameter(parameter.name, parameter.isOptional === true ? "value" : parameter.valueKind, false, fnBindings);
  }
  return produced({ parameters: info.constructorParameters, bindings: fnBindings });
}

/** A public field is an own property of the instance; a private one is a private element. */
function classFieldStore(field: ClassFieldInfo, value: JsIrValueExpression): JsIrOperation {
  if (field.privateName !== undefined && field.key.kind === "literal") {
    return { kind: "privateFieldStore", targetName: CLASS_THIS_NAME, key: field.key.name, value, message: classPrivateFieldDefineMessage(field.privateName), define: true };
  }
  return { kind: "valueObjectStore", targetName: CLASS_THIS_NAME, key: classMemberKeyStringExpression(field.key), value };
}

function parameterPropertyValue(parameter: JsIrFunctionParameter): JsIrValueExpression {
  if (parameter.valueKind === "number") {
    return { kind: "number", value: { kind: "parameter", name: parameter.name } };
  }
  if (parameter.valueKind === "string") {
    return { kind: "string", value: { kind: "variable", name: parameter.name } };
  }
  return { kind: "variable", name: parameter.name };
}

/**
 * Outer names a field initializer reads, for the constructor's `enclosingCaptureNames`.
 *
 * Field initializers run inside the constructor, so a read of an outer mutable binding needs the
 * same environment slot as a read in the constructor body. The walk is conservative without a
 * checker: any outer name mentioned is captured, which costs a slot rather than a wrong answer.
 */
function collectFieldInitializerCaptureNames(
  info: ClassInfo,
  outerBindings: ReadonlyMap<string, JsIrBindingValue>
): readonly string[] {
  const captures: string[] = [];
  const seen = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionLike(node) && !ts.isArrowFunction(node)) {
      return;
    }
    if (ts.isIdentifier(node) && outerBindings.has(node.text) && !seen.has(node.text)) {
      const { parent } = node;
      if (!(ts.isPropertyAccessExpression(parent) && parent.name === node)) {
        seen.add(node.text);
        captures.push(node.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  for (const field of info.fields) {
    if (field.initializer !== undefined) {
      visit(field.initializer);
    }
  }
  return captures;
}

export function forwardedClassArgument(parameter: JsIrFunctionParameter): JsIrCallArgument {
  if (parameter.valueKind === "number") {
    return { valueKind: "number", value: { kind: "parameter", name: parameter.name } };
  }
  if (parameter.valueKind === "string") {
    return { valueKind: "string", value: { kind: "variable", name: parameter.name } };
  }
  return { valueKind: "value", value: { kind: "variable", name: parameter.name } };
}

function lowerClassIteratorStore(
  context: LoweringContext,
  info: ClassInfo,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (info.iteratorMethod === undefined) {
    return notApplicable;
  }
  const previousClassThisInScope = context.classThisInScope;
  context.classThisInScope = false;
  let iteratorMethod: JsIrValueExpression | undefined;
  try {
    const objectMethodFunctionValueResult = context.lowerObjectMethodFunctionValue(context, info.iteratorMethod, bindings);
    if (objectMethodFunctionValueResult.kind === "unsupported") {
      return objectMethodFunctionValueResult;
    }
    iteratorMethod = loweredPayload(objectMethodFunctionValueResult);
  } finally {
    context.classThisInScope = previousClassThisInScope;
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

export function lowerClassFieldInitializer(
  context: LoweringContext,
  field: ClassFieldInfo,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrValueExpression> {
  if (field.initializer === undefined) {
    return produced({ kind: "undefined" } as JsIrValueExpression);
  }
  const value = context.lowerValueExpression(context, field.initializer, bindings);
  if (value.kind !== "lowered") {
    return withRefusal(value, unsupportedIn(`A class field initializer is not an expression this build can evaluate: \`${expressionSnippet(field.initializer)}\``));
  }
  return produced(value.operation);
}
