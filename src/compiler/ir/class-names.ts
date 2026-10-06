import type { Lowered } from "./lowered.js";
import type { ClassMemberKey } from "./class-info.js";
import type { JsIrStringExpression } from "./expressions.js";

// Name of the synthetic `this` parameter threaded through constructors/methods.
export const CLASS_THIS_NAME = "this";

/** The reason a body statement refused, which is what aborts the enclosing class member. */
export function classAbortReason(result: Lowered): string {
  if (result.kind === "unsupported") {
    return result.reason;
  }
  return "A statement in a class member body could not be lowered";
}

// tier reports against the statement that caused it as a TSCN1002.

export function classConstructorName(className: string): string {
  return `${className}$constructor`;
}

/** The generated function name for a method or accessor, static or not. */
export function classMethodFunctionName(className: string, methodName: string, isStatic: boolean): string {
  if (isStatic) {
    return `${className}$static$${methodName}`;
  }
  return `${className}$${methodName}`;
}

/** Accessors are getter/setter pairs, so the name says which half. */
export function classAccessorFunctionName(className: string, propertyName: string, isGetter: boolean): string {
  if (isGetter) {
    return classGetterFunctionName(className, propertyName);
  }
  return classSetterFunctionName(className, propertyName);
}

export function classGetterFunctionName(className: string, propertyName: string): string {
  return `${className}$get$${propertyName}`;
}

export function classSetterFunctionName(className: string, propertyName: string): string {
  return `${className}$set$${propertyName}`;
}

// that does not own the declaring class's brand.
export function classPrivateFieldReadMessage(fieldName: string): string {
  return `Cannot read private member ${fieldName} from an object whose class did not declare it`;
}

export function classPrivateFieldWriteMessage(fieldName: string): string {
  return `Cannot write private member ${fieldName} to an object whose class did not declare it`;
}

// computed keys read the definition-time slot and coerce it to a property key.
export function classMemberKeyStringExpression(key: ClassMemberKey): JsIrStringExpression {
  if (key.kind === "literal") {
    return { kind: "literal", value: key.name };
  }
  return { kind: "stringConversion", value: { kind: "variable", name: key.slotName } };
}
