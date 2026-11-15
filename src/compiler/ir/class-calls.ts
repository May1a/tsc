import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import { type Lowered, notApplicable, produced, unsupportedIn, withRefusal } from "./lowered.js";
import type { JsIrValueExpression } from "./expressions.js";
import { type ClassInfo, type ClassMethodInfo, classPrototypeName, findClassInChain, resolveReceiverClass } from "./class-info.js";
import { isOverriddenBelow } from "./class-hierarchy.js";
import { lowerValueCallArguments } from "./call-arguments.js";
import { CLASS_THIS_NAME, classConstructorName, classMethodFunctionName } from "./class-names.js";

// A class method call lowers to a direct call, to a call dispatched through the receiver's prototype
// chain when a subclass overrides the method, or — when the receiver itself is optional
// (`s?.area()`) — to a direct call guarded by the receiver's nullish check. The guard reuses the
// optional-chain short-circuit, so a nullish receiver yields `undefined` without evaluating the
// arguments instead of entering the method with no instance.
export type ClassMethodCallValue =
  | Extract<JsIrValueExpression, { readonly kind: "call" }>
  | Extract<JsIrValueExpression, { readonly kind: "callValue" }>
  | Extract<JsIrValueExpression, { readonly kind: "optionalChain" }>;

// eslint-disable-next-line complexity, max-statements -- Method resolution handles super, static inheritance, and instance inheritance at one dispatch seam.
export function lowerClassMethodCall(
  context: LoweringContext,
  call: ts.CallExpression,
  callee: ts.PropertyAccessExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<ClassMethodCallValue> {
  const methodName = callee.name.text;

  if (callee.expression.kind === ts.SyntaxKind.SuperKeyword) {
    return lowerSuperMethodCall(context, call, bindings, methodName);
  }

  if (ts.isIdentifier(callee.expression) && !bindings.has(callee.expression.text)) {
    const staticClass = context.classes.get(callee.expression.text);
    let definingClass: ClassInfo | undefined;
    if (staticClass !== undefined) {
      definingClass = findClassInChain(context, staticClass, (candidate) => candidate.staticMethods.has(methodName));
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

  const receiverClass = resolveReceiverClass(context, callee.expression, bindings);
  // A union receiver such as `S | undefined` names no single class, so the resolver above declines
  // it. For an optional-receiver call the nullish case is handled by the guard below, so a union of
  // one class with nullish constituents still resolves. Non-optional calls keep declining: entering
  // the method with no instance would be wrong.
  const receiverIdentifier = ts.isIdentifier(callee.expression) ? callee.expression : undefined;
  const unionReceiverClass = receiverClass === undefined && receiverIdentifier !== undefined
    ? resolveOptionalUnionReceiverClass(context, callee, receiverIdentifier, bindings)
    : undefined;
  const staticClass = receiverClass ?? unionReceiverClass;
  if (staticClass === undefined) {
    return notApplicable;
  }
  const definingClass = findClassInChain(context, staticClass, (candidate) => candidate.methods.has(methodName));
  const method = definingClass?.methods.get(methodName);
  if (requiresPrototypeDispatch(context, callee.expression, staticClass, methodName, bindings)) {
    // An optional call through a dispatching receiver is left to the general optional-call lowering,
    // which reads the method off the receiver after its nullish check.
    if (callee.questionDotToken !== undefined) {
      return notApplicable;
    }
    return lowerDispatchedMethodCall(context, call, callee, bindings, methodName);
  }
  if (definingClass === undefined || method === undefined) {
    return notApplicable;
  }
  // A union receiver rereads its source: a value variable from its stable slot, any other
  // inlineable value where it was bound. The guard below skips the call when that value is nullish.
  const receiverValue = unionReceiverClass !== undefined && receiverIdentifier !== undefined
    ? context.lowerValueExpression(context, receiverIdentifier, bindings)
    : lowerMethodReceiverValue(context, callee.expression, bindings);
  if (receiverValue.kind !== "lowered") {
    // The method resolved in the chain above, so the receiver *is* one this build recognises as a class
    // instance — it is the pass-as-value step that declined. Returning the bare `notApplicable` let the
    // generic call lowering claim the call and report it as an unrecognised target, naming neither the
    // method nor the receiver.
    return withRefusal(receiverValue, unsupportedIn(`The receiver of the method \`${methodName}\` is not an instance this build can pass`));
  }
  const args = context.lowerTypedCallArguments(context, method.parameters, call.arguments, bindings);
  if (args.kind !== "lowered") {
    return withRefusal(args, unsupportedIn(`Arguments to the method \`${methodName}\` must be expressions this build can evaluate`));
  }
  const directCall: Extract<JsIrValueExpression, { readonly kind: "call" }> = {
    kind: "call",
    name: classMethodFunctionName(definingClass.name, methodName, false),
    arguments: [{ valueKind: "value", value: receiverValue.operation }, ...args.operation]
  };
  if (callee.questionDotToken === undefined) {
    return produced(directCall);
  }
  return produced({
    kind: "optionalChain",
    guard: receiverValue.operation,
    access: {
      ...directCall,
      arguments: [{ valueKind: "value", value: { kind: "optionalTarget" } }, ...args.operation]
    }
  });
}

/**
 * Whether an instance call dispatches through the receiver's prototype chain rather than calling the
 * implementation its static class resolves to.
 *
 * A direct call is correct only when the receiver cannot hold an instance carrying a more-derived
 * implementation. The class hierarchy covers the whole source file, so a subclass declared after the
 * call site still counts. A `new` expression and a variable materialized from one construct exactly
 * their class and stay direct.
 */
function requiresPrototypeDispatch(
  context: LoweringContext,
  receiver: ts.Expression,
  receiverClass: ClassInfo,
  methodName: string,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): boolean {
  return !isExactInstanceReceiver(context, receiver, bindings)
    && isOverriddenBelow(context.classHierarchy, receiverClass.name, methodName);
}

/**
 * Whether a receiver expression constructs exactly its static class.
 *
 * `new C(...)` constructs a `C`, and a variable materialized from one (`const c = new C()`) still
 * holds that instance: `constValue` inlines other shapes, so only `newInstance` materializes into a
 * stable slot.
 */
function isExactInstanceReceiver(
  context: LoweringContext,
  receiver: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): boolean {
  if (ts.isNewExpression(receiver) && ts.isIdentifier(receiver.expression) && !bindings.has(receiver.expression.text)) {
    return context.classes.has(receiver.expression.text);
  }
  if (ts.isIdentifier(receiver)) {
    const binding = bindings.get(receiver.text);
    return binding?.kind === "valueVariable" && binding.className !== undefined;
  }
  return false;
}

/**
 * An instance call dispatched through the receiver's prototype chain.
 *
 * The callee reads the method off the receiver, so the prototype chain selects the most-derived
 * implementation. `methodReceiver` carries the same value: the native call evaluates it once for both
 * the lookup and the `this` value. The arguments are boxed because the implementation is not known
 * here; each prototype entry converts them with its own parameter list.
 */
function lowerDispatchedMethodCall(
  context: LoweringContext,
  call: ts.CallExpression,
  callee: ts.PropertyAccessExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  methodName: string
): Lowered<Extract<JsIrValueExpression, { readonly kind: "callValue" }>> {
  const receiverValue = lowerMethodReceiverValue(context, callee.expression, bindings);
  if (receiverValue.kind !== "lowered") {
    return withRefusal(receiverValue, unsupportedIn(`The receiver of the method \`${methodName}\` is not an instance this build can pass`));
  }
  const args = lowerValueCallArguments(context, call.arguments, bindings, methodName);
  if (args.kind !== "lowered") {
    return withRefusal(args, unsupportedIn(`Arguments to the method \`${methodName}\` must be expressions this build can evaluate`));
  }
  return produced({
    kind: "callValue",
    callee: { kind: "valueObjectDynamicAccess", value: receiverValue.operation, key: { kind: "literal", value: methodName } },
    arguments: args.operation,
    methodReceiver: receiverValue.operation,
    methodKey: { kind: "literal", value: methodName }
  });
}

/**
 * The value a method call passes and dispatches on.
 *
 * Inline receivers lower as instances the way direct calls pass them. Element, property and call
 * receivers have no instance lowering, but both paths only need their value — the direct call passes
 * it as `this`, and a dispatched call reads the method off it — so those lower as ordinary values.
 */
function lowerMethodReceiverValue(
  context: LoweringContext,
  receiver: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  const instance = lowerInstanceReceiverValue(context, receiver, bindings);
  if (instance.kind !== "notApplicable") {
    return instance;
  }
  return context.lowerValueExpression(context, receiver, bindings);
}

// The class of a `s?.m()` receiver whose static type is a union of one class with nullish
// constituents (`S | undefined`). The shared resolver declines unions. Only identifiers reading a
// stable slot or an inlineable value are claimed; anything else — multiple classes, a non-nullish
// non-class member, or a non-optional receiver — declines back to the generic path.
function resolveOptionalUnionReceiverClass(
  context: LoweringContext,
  callee: ts.PropertyAccessExpression,
  receiver: ts.Identifier,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): ClassInfo | undefined {
  if (callee.questionDotToken === undefined || context.typeChecker === undefined) {
    return undefined;
  }
  const binding = bindings.get(receiver.text);
  if (binding?.kind !== "valueVariable" && binding?.kind !== "value") {
    return undefined;
  }
  const type = context.typeChecker.getTypeAtLocation(receiver);
  if (!type.isUnion()) {
    return undefined;
  }
  let found: ClassInfo | undefined;
  for (const constituent of type.types) {
    if ((constituent.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)) !== 0) {
      continue;
    }
    const symbol = constituent.getSymbol();
    const info = symbol === undefined ? undefined : context.classes.get(symbol.getName());
    if (info === undefined || (found !== undefined && found !== info)) {
      return undefined;
    }
    found = info;
  }
  return found;
}

/** A `super.m(...)` call inside a class method or constructor. */
function lowerSuperMethodCall(
  context: LoweringContext,
  call: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  methodName: string
): Lowered<Extract<JsIrValueExpression, { readonly kind: "call" }>> {
  const base = baseClassOf(context.activeEnclosingClass, context.classes);
  if (base === undefined) {
    return unsupportedIn(`\`super.${methodName}\` appears in a class with no base class this module lowered`);
  }
  const isStatic = context.activeClassMethodStatic;
  const declares = (candidate: ClassInfo): boolean => superMethodOf(candidate, methodName, isStatic) !== undefined;
  const definingClass = findClassInChain(context, base, declares);
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
  const kind = isStatic ? "static method" : "method";
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

// Lowers an expression that evaluates to a class instance value (`this` or a
// `new C(...)`), or returns undefined when it is not one.
export function lowerClassInstanceExpression(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  if (context.classThisInScope && expression.kind === ts.SyntaxKind.ThisKeyword) {
    return produced({ kind: "variable", name: CLASS_THIS_NAME } as JsIrValueExpression);
  }
  if (ts.isNewExpression(expression) && ts.isIdentifier(expression.expression) && !bindings.has(expression.expression.text)) {
    const info = context.classes.get(expression.expression.text);
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
    if (binding?.kind === "valueVariable" && resolveReceiverClass(context, expression, bindings) !== undefined) {
      return produced({ kind: "variable", name: expression.text } as JsIrValueExpression);
    }
  }
  return notApplicable;
}

