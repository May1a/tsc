import type { LoweringContext } from "./context.js";
import { type ClassComputedKeyInfo, type ClassComputedMethodEntry, type ClassFieldInfo, type ClassInfo, type ClassMethodInfo, type CollectedClassMembers, classPrototypeName, classStaticStorageName } from "./class-info.js";
import { isDispatchedMethod } from "./class-hierarchy.js";
import type { JsIrBindingValue } from "./bindings.js";
import { type Produced, loweredPayload, produced, unsupportedIn, withRefusal } from "./lowered.js";
import type { JsIrOperation } from "./types.js";
import type { JsIrRuntimeObjectField, JsIrValueExpression } from "./expressions.js";
import { forwardedClassArgument, lowerClassFieldInitializer } from "./class-constructors.js";
import { CLASS_THIS_NAME, classMemberKeyStringExpression, classMethodFunctionName } from "./class-names.js";

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

/**
 * The prototype entries a class declaration installs for dispatched calls.
 *
 * A dispatched call reads its method off the receiver, so every implementation it can reach must be
 * on a prototype: each method this class overrides, and each method a subclass overrides. Each class
 * installs only its own implementations, on its own prototype, when its declaration runs. A base's
 * entries therefore exist before any subclass instance can be constructed.
 */
export function lowerPrototypeDispatchStores(
  context: LoweringContext,
  info: ClassInfo,
  members: CollectedClassMembers
): readonly JsIrOperation[] {
  return members.methodDeclarations.flatMap((entry) => {
    const method = info.methods.get(entry.name);
    if (method === undefined || !isDispatchedMethod(context.classHierarchy, info.name, entry.name)) {
      return [];
    }
    return [lowerPrototypeMethodStore(context, info, entry.name, method)];
  });
}

/** One store installing `methodName`'s dispatch wrapper on `target`'s prototype object. */
function lowerPrototypeMethodStore(
  context: LoweringContext,
  target: ClassInfo,
  methodName: string,
  method: ClassMethodInfo
): JsIrOperation {
  return {
    kind: "valueObjectStore",
    targetName: classPrototypeName(target.name),
    key: { kind: "literal", value: methodName },
    value: classMethodDispatchWrapper(context, target, methodName, method)
  };
}

/**
 * The function value a prototype entry holds for `methodName`.
 *
 * A dispatched call delivers the instance as the JavaScript receiver, while the direct method
 * function reads `this` from its first argv slot. The wrapper bridges the two conventions: it takes
 * the method's own parameters, so a dispatched call passes exactly the arguments a direct call
 * would, and forwards them with the receiver to the direct function.
 */
function classMethodDispatchWrapper(
  context: LoweringContext,
  target: ClassInfo,
  methodName: string,
  method: ClassMethodInfo
): JsIrValueExpression {
  const codeName = `__tscn_protomethod_${target.name}_${methodName}_${context.nextFunctionObjectId}`.replace(/[^A-Za-z0-9_]/g, "_");
  context.nextFunctionObjectId += 1;
  const forwarded = method.parameters.map((parameter) => forwardedClassArgument(parameter));
  return {
    kind: "functionObject",
    definition: {
      codeName,
      parameters: method.parameters,
      functionKind: "ordinary",
      returnKind: "value",
      inferredName: methodName,
      body: [{
        kind: "returnValue",
        expression: {
          kind: "call",
          name: classMethodFunctionName(target.name, methodName, false),
          arguments: [{ valueKind: "value", value: { kind: "variable", name: CLASS_THIS_NAME } }, ...forwarded]
        }
      }]
    }
  };
}
