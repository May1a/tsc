import type { LoweringContext } from "./context.js";
import type { ClassFieldInfo, ClassInfo } from "./class-info.js";
import ts from "typescript";
import type { JsIrBindingValue, JsIrCallArgument, JsIrFunctionParameter } from "./bindings.js";
import { type Lowered, type Produced, loweredPayload, notApplicable, produced, unsupportedIn, withRefusal } from "./lowered.js";
import type { JsIrOperation } from "./types.js";
import { CLASS_THIS_NAME, classAbortReason, classConstructorName, classMemberKeyStringExpression } from "./class-names.js";
import { bindFunctionParameter, functionFrameBindings } from "./function-parameters.js";
import { isNonExecutableDeclaration } from "./comparisons.js";
import { updateBindings } from "./binding-updates.js";
import type { JsIrValueExpression } from "./expressions.js";
import { SYMBOL_ITERATOR_SENTINEL } from "../symbols.js";

// eslint-disable-next-line complexity, max-statements -- Constructor lowering owns super ordering, instance initialization, and body scope restoration.
export function lowerClassConstructor(
  context: LoweringContext,
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

  const previousThis = context.classThisInScope;
  const previousClass = context.activeEnclosingClass;
  const previousStatic = context.activeClassMethodStatic;
  context.classThisInScope = true;
  context.activeEnclosingClass = info;
  context.activeClassMethodStatic = false;
  try {
    const body: JsIrOperation[] = [];
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
      const initializer = lowerClassFieldInitializer(context, field, fnBindings);
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
        const result = context.lowerStatement(context, statement, fnBindings);
        if (result.kind !== "lowered") {
          return unsupportedIn(classAbortReason(result));
        }
        body.push(result.operation);
        updateBindings(result.operation, fnBindings);
      }
    }
    return produced({ kind: "function", name: classConstructorName(info.name), parameters, body });
  } finally {
    context.classThisInScope = previousThis;
    context.activeEnclosingClass = previousClass;
    context.activeClassMethodStatic = previousStatic;
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
    return withRefusal(value, unsupportedIn("A class field initializer is not an expression this build can evaluate"));
  }
  return produced(value.operation);
}
