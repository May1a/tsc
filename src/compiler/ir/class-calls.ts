import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import { type Lowered, notApplicable, produced, unsupportedIn, withRefusal } from "./lowered.js";
import type { JsIrValueExpression } from "./expressions.js";
import { type ClassInfo, type ClassMethodInfo, classLoweringState, classPrototypeName, findClassInChain, resolveReceiverClass } from "./class-info.js";
import { CLASS_THIS_NAME, classConstructorName, classMethodFunctionName } from "./class-names.js";

// eslint-disable-next-line complexity, max-statements -- Method resolution handles super, static inheritance, and instance inheritance at one dispatch seam.
export function lowerClassMethodCall(
  context: LoweringContext,
  call: ts.CallExpression,
  callee: ts.PropertyAccessExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<Extract<JsIrValueExpression, { readonly kind: "call" }>> {
  if (classLoweringState.registry === undefined) {
    return notApplicable;
  }
  const methodName = callee.name.text;

  if (callee.expression.kind === ts.SyntaxKind.SuperKeyword) {
    return lowerSuperMethodCall(context, call, bindings, methodName);
  }

  if (ts.isIdentifier(callee.expression) && !bindings.has(callee.expression.text)) {
    const staticClass = classLoweringState.registry.get(callee.expression.text);
    let definingClass: ClassInfo | undefined;
    if (staticClass !== undefined) {
      definingClass = findClassInChain(staticClass, (candidate) => candidate.staticMethods.has(methodName));
    }
    const staticMethod = definingClass?.staticMethods.get(methodName);
    if (definingClass !== undefined && staticMethod !== undefined) {
      const args = context.lowerTypedCallArguments(context, staticMethod.parameters, call.arguments, bindings);
      if (args.kind !== "lowered") {
        return withRefusal(args, unsupportedIn(`Arguments to the static method \`${methodName}\` must be expressions this build can evaluate`));
      }
      return produced({
        kind: "call",
        name: classMethodFunctionName(definingClass.name, methodName, true),
        arguments: args.operation
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
  const receiverValue = lowerInstanceReceiverValue(context, callee.expression, bindings);
  if (receiverValue.kind !== "lowered") {
    return receiverValue;
  }
  const args = context.lowerTypedCallArguments(context, method.parameters, call.arguments, bindings);
  if (args.kind !== "lowered") {
    return withRefusal(args, unsupportedIn(`Arguments to the method \`${methodName}\` must be expressions this build can evaluate`));
  }
  return produced({
    kind: "call",
    name: classMethodFunctionName(definingClass.name, methodName, false),
    arguments: [{ valueKind: "value", value: receiverValue.operation }, ...args.operation]
  });
}

/** A `super.m(...)` call inside a class method or constructor. */
function lowerSuperMethodCall(
  context: LoweringContext,
  call: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  methodName: string
): Lowered<Extract<JsIrValueExpression, { readonly kind: "call" }>> {
  const { registry } = classLoweringState;
  if (registry === undefined) {
    return notApplicable;
  }
  const base = baseClassOf(context.activeEnclosingClass, registry);
  if (base === undefined) {
    return unsupportedIn(`\`super.${methodName}\` appears in a class with no base class this module lowered`);
  }
  const isStatic = context.activeClassMethodStatic;
  const declares = (candidate: ClassInfo): boolean => superMethodOf(candidate, methodName, isStatic) !== undefined;
  const definingClass = findClassInChain(base, declares);
  if (definingClass === undefined) {
    return unsupportedIn(classSuperMethodRefusal(methodName, base.name, isStatic));
  }
  const method = superMethodOf(definingClass, methodName, isStatic);
  if (method === undefined) {
    return unsupportedIn(classSuperMethodRefusal(methodName, base.name, isStatic));
  }
  const args = context.lowerTypedCallArguments(context, method.parameters, call.arguments, bindings);
  if (args.kind !== "lowered") {
    return withRefusal(args, unsupportedIn("`super(...)` method arguments must be expressions this build can evaluate"));
  }
  if (isStatic) {
    return produced({
      kind: "call",
      name: classMethodFunctionName(definingClass.name, methodName, true),
      arguments: args.operation
    });
  }
  return produced({
    kind: "call",
    name: classMethodFunctionName(definingClass.name, methodName, false),
    arguments: [{ valueKind: "value", value: { kind: "variable", name: CLASS_THIS_NAME } }, ...args.operation]
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

// stable value storage and are reported as unsupported for now.
export function lowerInstanceReceiverValue(
  context: LoweringContext,
  receiver: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  const instance = lowerClassInstanceExpression(context, receiver, bindings);
  if (instance.kind === "unsupported") {
    return instance;
  }
  if (instance.kind === "lowered") {
    return produced(instance.operation);
  }
  return notApplicable;
}

// `new C(...)`), or returns undefined when it is not one.
export function lowerClassInstanceExpression(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  if (classLoweringState.registry === undefined) {
    return notApplicable;
  }
  if (context.classThisInScope && expression.kind === ts.SyntaxKind.ThisKeyword) {
    return produced({ kind: "variable", name: CLASS_THIS_NAME } as JsIrValueExpression);
  }
  if (ts.isNewExpression(expression) && ts.isIdentifier(expression.expression) && !bindings.has(expression.expression.text)) {
    const info = classLoweringState.registry.get(expression.expression.text);
    if (info !== undefined) {
      const args = context.lowerTypedCallArguments(context, info.constructorParameters, expression.arguments ?? ts.factory.createNodeArray(), bindings);
      if (args.kind !== "lowered") {
        return withRefusal(args, unsupportedIn(`Arguments to \`new ${info.name}(...)\` must be expressions this build can evaluate`));
      }
      return produced({
        kind: "newInstance",
        className: info.name,
        fieldCount: info.fields.length,
        prototypeName: classPrototypeName(info.name),
        constructorName: classConstructorName(info.name),
        arguments: args.operation
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
