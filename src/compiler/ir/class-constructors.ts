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

// eslint-disable-next-line complexity, max-statements -- Constructor lowering owns super ordering, instance initialization, and body scope restoration.
export function lowerClassConstructor(
  context: LoweringContext,
  info: ClassInfo,
  constructorDeclaration: ts.ConstructorDeclaration | undefined,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrOperation> {
  const constructorBody = constructorDeclaration?.body;
  const returnedValue = constructorBody === undefined ? undefined : valueReturnIn(constructorBody);
  if (returnedValue !== undefined) {
    return unsupportedIn(`A class constructor that returns a value (\`return ${expressionSnippet(returnedValue)}\`) is not supported yet`);
  }
  const receiverBindings = functionFrameBindings(bindings);
  receiverBindings.set(CLASS_THIS_NAME, { kind: "valueVariable", name: CLASS_THIS_NAME });

  const previousThis = context.classThisInScope;
  const previousClass = context.activeEnclosingClass;
  const previousStatic = context.activeClassMethodStatic;
  context.classThisInScope = true;
  context.activeEnclosingClass = info;
  context.activeClassMethodStatic = false;
  try {
    const lowered = lowerConstructorParameters(context, info, constructorDeclaration, receiverBindings);
    if (lowered.kind !== "lowered") {
      return lowered;
    }
    const { bindings: fnBindings, prelude } = lowered.operation;
    const parameters: JsIrFunctionParameter[] = [{ name: CLASS_THIS_NAME, valueKind: "value" }, ...lowered.operation.parameters];
    const body: JsIrOperation[] = [...prelude];
    let remainingStatements: readonly ts.Statement[] = constructorDeclaration?.body?.statements ?? [];
    if (info.baseName !== undefined) {
      const base = context.classes.get(info.baseName);
      if (base === undefined) {
        return unsupportedIn(`\`extends ${info.baseName ?? "that class"}\` names a class this module did not lower`);
      }
      let superArguments: readonly JsIrCallArgument[] | undefined;
      if (constructorDeclaration === undefined) {
        superArguments = info.constructorParameters.map(forwardedClassArgument);
      } else {
        const statements = constructorDeclaration.body?.statements ?? ts.factory.createNodeArray<ts.Statement>();
        // Destructuring an empty array yields `undefined` for `first`, which is not the `ts.Statement` the
        // type claims — hence the widening. `ts.isExpressionStatement` reads `node.kind`, so without the
        // guard below this threw on the undefined instead of refusing the shape, and a defect is a crash
        // with no diagnostic. TypeScript already rejects an empty derived constructor (TS2377) before
        // lowering runs, so this is only ever the defensive branch.
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
        superArguments = loweredPayload(typedCallArgumentsResult);
        // `rest` holds only what follows `first`, which the guard above established is a statement.
        remainingStatements = rest.filter((statement): statement is ts.Statement => statement !== undefined);
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
      for (const statement of remainingStatements) {
        if (isNonExecutableDeclaration(statement)) {
          continue;
        }
        const result = context.lowerStatement(context, statement, fnBindings);
        if (result.kind !== "lowered") {
          return unsupportedIn(classAbortReason(result));
        }
        body.push(result.operation);
        updateBindings(result.operation, fnBindings);
      }
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
    context.activeEnclosingClass = previousClass;
    context.activeClassMethodStatic = previousStatic;
  }
}

/**
 * The first value a constructor body returns, outside its nested functions.
 *
 * `new` produces an object the constructor returns in place of the instance, and a derived
 * constructor that returns another value throws. Lowering binds calls on `new C()` to C's methods
 * statically, which would be wrong for a replacement object, so such a constructor is refused.
 */
function valueReturnIn(body: ts.Block): ts.Expression | undefined {
  let found: ts.Expression | undefined;
  const visit = (node: ts.Node): void => {
    if (found !== undefined || ts.isFunctionLike(node) || ts.isClassLike(node)) {
      return;
    }
    if (ts.isReturnStatement(node) && node.expression !== undefined) {
      found = node.expression;
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return found;
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
  readonly prelude: readonly JsIrOperation[];
}> {
  if (constructorDeclaration !== undefined) {
    return lowerFunctionParameters(context, constructorDeclaration.parameters, receiverBindings);
  }
  const fnBindings = new Map(receiverBindings);
  for (const parameter of info.constructorParameters) {
    bindFunctionParameter(parameter.name, parameter.isOptional === true ? "value" : parameter.valueKind, false, fnBindings);
  }
  return produced({ parameters: info.constructorParameters, bindings: fnBindings, prelude: [] });
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
