import type { LoweringContext } from "./context.js";
import { type ClassComputedKeyInfo, type ClassComputedMethodEntry, type ClassFieldInfo, type ClassInfo, classPrototypeName, classStaticStorageName } from "./class-info.js";
import type { JsIrBindingValue } from "./bindings.js";
import { type Produced, loweredPayload, produced, unsupportedIn, withRefusal } from "./lowered.js";
import type { JsIrOperation } from "./types.js";
import type { JsIrRuntimeObjectField, JsIrValueExpression } from "./expressions.js";
import { lowerClassFieldInitializer } from "./class-constructors.js";
import { classMemberKeyStringExpression } from "./class-names.js";

// Emits the module-init slot holding a runtime-computed member name: the name
// expression is evaluated exactly once, at class-definition time.
export function lowerClassComputedKeySlot(
  context: LoweringContext,
  computedKey: ClassComputedKeyInfo,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrOperation> {
  const value = context.lowerValueExpression(context, computedKey.expression, bindings);
  if (value.kind !== "lowered") {
    return withRefusal(value, unsupportedIn("A computed class member name must be an expression this build can evaluate"));
  }
  return produced({ kind: "letValue", name: computedKey.slotName, moduleGlobal: true, value: value.operation });
}

function classComputedMethodTargetName(info: ClassInfo, isStatic: boolean): string {
  if (isStatic) {
    return classStaticStorageName(info.name);
  }
  return classPrototypeName(info.name);
}

// Stores a method whose name is only known at runtime as a function value on
// the prototype (or statics slot) under the evaluated key. Calls to it resolve
// through the ordinary dynamic property path, since static dispatch requires a
// compile-time name.
export function lowerClassComputedMethodStore(
  context: LoweringContext,
  info: ClassInfo,
  entry: ClassComputedMethodEntry,
  isStatic: boolean,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrOperation> {
  const previousThis = context.classThisInScope;
  const previousClass = context.activeEnclosingClass;
  const previousStatic = context.activeClassMethodStatic;
  context.classThisInScope = false;
  context.activeEnclosingClass = info;
  context.activeClassMethodStatic = isStatic;
  let methodValue: JsIrValueExpression | undefined;
  try {
    const objectMethodFunctionValueResult = context.lowerObjectMethodFunctionValue(context, entry.declaration, bindings);
    if (objectMethodFunctionValueResult.kind === "unsupported") {
      return objectMethodFunctionValueResult;
    }
    methodValue = loweredPayload(objectMethodFunctionValueResult);
  } finally {
    context.classThisInScope = previousThis;
    context.activeEnclosingClass = previousClass;
    context.activeClassMethodStatic = previousStatic;
  }
  if (methodValue === undefined) {
    return unsupportedIn("A computed class method name must be an expression this build can evaluate");
  }
  return produced({
    kind: "valueObjectStore",
    targetName: classComputedMethodTargetName(info, isStatic),
    key: { kind: "stringConversion", value: { kind: "variable", name: entry.slotName } },
    value: methodValue
  });
}

// Emits the module-init slot that backs a class's prototype object: an empty
// object that serves as the prototype for all instances. Accessible as `C.prototype`
// and automatically set on instances via the class-id slot (future work).
export function lowerClassPrototypeStorage(info: ClassInfo): JsIrOperation {
  return {
    kind: "letValue",
    name: classPrototypeName(info.name),
    moduleGlobal: true,
    value: { kind: "objectLiteralValue", value: { fields: [] } }
  };
}

// Emits the module-init slot that backs a class's static fields: a single object
// whose properties are the static fields, initialized in declaration order. Each
// `C.x` read/write resolves to a property access on this slot. Returns undefined
// for classes without static fields.
export function lowerClassStaticStorage(
  context: LoweringContext,
  info: ClassInfo,
  staticFields: readonly ClassFieldInfo[],
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrOperation> {
  const fields: JsIrRuntimeObjectField[] = [];
  for (const field of staticFields) {
    const initializer = lowerClassFieldInitializer(context, field, bindings);
    if (initializer.kind !== "lowered") {
      return initializer;
    }
    fields.push({ kind: "field", key: classMemberKeyStringExpression(field.key), value: initializer.operation });
  }
  return produced({
    kind: "letValue",
    name: classStaticStorageName(info.name),
    moduleGlobal: true,
    value: { kind: "objectLiteralValue", value: { fields } }
  });
}
