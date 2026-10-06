import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import { type Lowered, notApplicable, produced, unsupportedIn, withRefusal } from "./lowered.js";
import { classLoweringState, classStaticStorageName, findClassInChain, resolveReceiverClass } from "./class-info.js";
import { lowerInstanceReceiverValue } from "./class-calls.js";
import { classSetterFunctionName } from "./class-names.js";

// the instance object.
export function lowerClassPropertyAssignment(
  context: LoweringContext,
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
    const value = context.lowerValueExpression(context, right, bindings);
    if (value.kind !== "lowered") {
      return withRefusal(value, unsupportedIn(`The value written to the static field \`${propertyName}\` is not an expression this build can evaluate`));
    }
    return produced({
      kind: "valueObjectStore",
      targetName: classStaticStorageName(receiverClass.name),
      key: { kind: "literal", value: propertyName },
      value: value.operation
    });
  }
  const value = context.lowerValueExpression(context, right, bindings);
  if (value.kind !== "lowered") {
    return withRefusal(value, unsupportedIn(`The value written to \`${propertyName}\` is not an expression this build can evaluate`));
  }
  const setterClass = findClassInChain(receiverClass, (candidate) => candidate.setters.has(propertyName));
  if (setterClass !== undefined) {
    const receiver = lowerInstanceReceiverValue(context, left.expression, bindings);
    if (receiver.kind !== "lowered") {
      return withRefusal(receiver, unsupportedIn(`A named instance cannot yet receive the setter call \`${propertyName}\``));
    }
    return produced({
      kind: "call",
      name: classSetterFunctionName(setterClass.name, propertyName),
      arguments: [{ valueKind: "value", value: receiver.operation }, { valueKind: "value", value: value.operation }]
    });
  }
  if (ts.isIdentifier(left.expression) && bindings.get(left.expression.text)?.kind === "valueVariable") {
    return produced({
      kind: "valueObjectStore",
      targetName: left.expression.text,
      key: { kind: "literal", value: propertyName },
      value: value.operation
    });
  }
  return unsupportedIn(`The receiver of \`${propertyName}\` cannot yet be assigned through`);
}
