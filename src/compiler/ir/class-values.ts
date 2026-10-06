import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import type { JsIrValueExpression } from "./expressions.js";
import { type ClassInfo, classLoweringState, classPrototypeName, findClassInChain, lowerClassStaticFieldAccess, resolveReceiverClass } from "./class-info.js";
import { CLASS_THIS_NAME, classGetterFunctionName, classPrivateFieldReadMessage, classPrivateFieldWriteMessage } from "./class-names.js";
import { lowerClassInstanceExpression, lowerClassMethodCall } from "./class-calls.js";
import { type Lowered, type Produced, notApplicable, produced, unsupportedIn, withRefusal } from "./lowered.js";

export function lowerClassValueExpression(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  if (classLoweringState.registry === undefined) {
    return notApplicable;
  }

  if (context.classThisInScope && expression.kind === ts.SyntaxKind.ThisKeyword) {
    return produced({ kind: "variable", name: CLASS_THIS_NAME });
  }

  const instance = lowerClassInstanceExpression(context, expression, bindings);
  if (instance.kind === "unsupported") {
    return instance;
  }
  if (instance.kind === "lowered") {
    return produced(instance.operation);
  }

  if (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression)) {
    const methodCall = lowerClassMethodCall(context, expression, expression.expression, bindings);
    if (methodCall.kind === "unsupported") {
      return methodCall;
    }
    if (methodCall.kind === "lowered") {
      return produced(methodCall.operation);
    }
  }

  const staticField = lowerClassStaticFieldAccess(expression, bindings);
  if (staticField !== undefined) {
    return produced(staticField);
  }

  const property = lowerClassPropertyValueAccess(context, expression, bindings);
  if (property.kind === "unsupported") {
    return property;
  }
  if (property.kind === "lowered") {
    return produced(property.operation);
  }
  return notApplicable;
}

// `C.prototype`, getter dispatch, and plain instance field reads.
function lowerClassPropertyValueAccess(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  if (classLoweringState.registry === undefined || !ts.isPropertyAccessExpression(expression)) {
    return notApplicable;
  }
  if (ts.isPrivateIdentifier(expression.name)) {
    const privateField = lowerClassPrivateFieldAccess(context, expression, bindings);
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

  const receiver = lowerClassInstanceExpression(context, expression.expression, bindings);
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

// enforced by a runtime check on the receiver.
function lowerClassPrivateFieldAccess(
  context: LoweringContext,
  expression: ts.PropertyAccessExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrValueExpression> {
  const fieldName = expression.name.text;
  const storageKey = context.activeEnclosingClass?.privateFields.get(fieldName);
  if (storageKey === undefined) {
    return unsupportedIn(`\`#${fieldName}\` is not declared by the lexically enclosing class`);
  }
  const receiver = lowerClassPrivateFieldReceiver(context, expression.expression, bindings);
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

// `this`, `new C(...)`, or a named value variable (e.g. a method parameter).
function lowerClassPrivateFieldReceiver(
  context: LoweringContext,
  receiver: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrValueExpression> {
  const instance = lowerClassInstanceExpression(context, receiver, bindings);
  if (instance.kind !== "notApplicable") {
    return instance;
  }
  if (ts.isIdentifier(receiver) && bindings.get(receiver.text)?.kind === "valueVariable") {
    return produced({ kind: "variable", name: receiver.text } as JsIrValueExpression);
  }
  return unsupportedIn("The receiver of a private field access must be `this`, an instance, or a value variable");
}

// same lexical scoping and runtime brand check as reads.
export function lowerClassPrivateFieldStore(
  context: LoweringContext,
  left: ts.PropertyAccessExpression,
  right: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!ts.isPrivateIdentifier(left.name)) {
    return notApplicable;
  }
  const fieldName = left.name.text;
  const storageKey = context.activeEnclosingClass?.privateFields.get(fieldName);
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
  const value = context.lowerValueExpression(context, right, bindings);
  if (value.kind !== "lowered") {
    return withRefusal(value, unsupportedIn("The value written to a private field is not an expression this build can evaluate"));
  }
  return produced({
    kind: "privateFieldStore",
    targetName,
    key: storageKey,
    value: value.operation,
    message: classPrivateFieldWriteMessage(fieldName)
  });
}
