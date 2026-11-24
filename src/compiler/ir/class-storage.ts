import type { LoweringContext } from "./context.js";
import { type ClassComputedKeyInfo, type ClassComputedMethodEntry, type ClassInfo, type ClassMethodInfo, type ClassStaticInitializer, type CollectedClassMembers, classPrivateFunctions, classPrototypeName, classStaticPrivateFunctions, classStaticStorageName } from "./class-info.js";
import type { JsIrBindingValue, JsIrFunctionParameter } from "./bindings.js";
import { type Produced, loweredPayload, produced, unsupportedIn, withRefusal } from "./lowered.js";
import type { JsIrOperation } from "./types.js";
import type { JsIrRuntimeArrayElement, JsIrValueExpression } from "./expressions.js";
import { forwardedClassArgument, lowerClassFieldInitializer } from "./class-constructors.js";
import { CLASS_THIS_NAME, classAccessorFunctionName, classComputedAccessorFunctionName, classConstructorName, classConstructorValueName, classMemberKeyStringExpression, classMethodFunctionName, classPrivateFieldDefineMessage, classStaticAccessorFunctionName, classStaticBlockFunctionName } from "./class-names.js";

// Emits the module-init slot holding a runtime-computed member name: the name
// expression is evaluated and converted to a property key exactly once, at
// class-definition time, so a key object's `toString` runs once.
export function lowerClassComputedKeySlot(
  context: LoweringContext,
  computedKey: ClassComputedKeyInfo,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  isLocal = false
): Produced<JsIrOperation> {
  const value = context.lowerValueExpression(context, computedKey.expression, bindings);
  if (value.kind !== "lowered") {
    return withRefusal(value, unsupportedIn("A computed class member name must be an expression this build can evaluate"));
  }
  return produced({
    kind: "letValue",
    name: computedKey.slotName,
    ...(isLocal ? {} : { moduleGlobal: true }),
    value: { kind: "string", value: { kind: "propertyKey", value: value.operation } }
  });
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
  context.classThisInScope = true;
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
export function lowerClassPrototypeStorage(info: ClassInfo, isLocal = false): JsIrOperation {
  return {
    kind: "letValue",
    name: classPrototypeName(info.name),
    ...(isLocal ? {} : { moduleGlobal: true }),
    value: { kind: "objectLiteralValue", value: { fields: [] } }
  };
}

// Emits the module-init slot that backs a class's static properties and prototype link.
// Initialized as an empty object first so static methods, accessors, private elements, and
// static initializers attach to it in definition order.
export function lowerClassStaticStorage(info: ClassInfo, isLocal = false): JsIrOperation {
  return {
    kind: "letValue",
    name: classStaticStorageName(info.name),
    ...(isLocal ? {} : { moduleGlobal: true }),
    value: {
      kind: "objectLiteralValue",
      value: {
        fields: [{
          kind: "field",
          key: { kind: "literal", value: "prototype" },
          value: { kind: "variable", name: classPrototypeName(info.name) }
        }]
      }
    }
  };
}

/**
 * Emits the boxed constructor function value `C$ctor` and attaches `C$statics` as its backing
 * properties object so `C` works as a first-class value (`const K = C; new K(); K.prop; typeof C`).
 */
export function lowerClassConstructorValue(
  context: LoweringContext,
  info: ClassInfo,
  isLocal = false,
  ctorCaptures: readonly string[] = []
): readonly JsIrOperation[] {
  const ctorName = classConstructorValueName(info.name);
  const codeName = `__tscn_class_ctor_${info.name}_${context.nextFunctionObjectId}`.replace(/[^A-Za-z0-9_]/g, "_");
  context.nextFunctionObjectId += 1;
  const parameters = info.constructorParameters;
  const hasRest = parameters.some((parameter) => parameter.isRest === true);
  const body: JsIrOperation[] = [{
    kind: "returnValue",
    expression: {
      kind: "newInstance",
      className: info.name,
      fieldCount: info.fields.length,
      prototypeName: classPrototypeName(info.name),
      constructorName: classConstructorName(info.name),
      newTargetName: ctorName,
      ...(hasRest
        ? { arguments: [], spreadArguments: parameters.map(forwardedArrayElement) }
        : { arguments: parameters.map((parameter) => forwardedClassArgument(parameter)) })
    }
  }];
  const uniqueCaptureNames = isLocal
    ? [...new Set([classPrototypeName(info.name), ctorName, ...ctorCaptures])]
    : [];
  const captures = uniqueCaptureNames.map((name) => ({
    name,
    valueKind: "value" as const,
    value: { kind: "variable" as const, name }
  }));
  const fnExpr: JsIrValueExpression = {
    kind: "functionObject",
    definition: {
      codeName,
      parameters,
      functionKind: "ordinary",
      returnKind: "value",
      inferredName: info.name,
      body,
      ...(captures.length === 0 ? {} : { captures })
    }
  };
  const ctorBindingOps: readonly JsIrOperation[] = isLocal
    ? [
        { kind: "letValue", name: ctorName, value: { kind: "undefined" } },
        { kind: "assignValue", name: ctorName, value: fnExpr }
      ]
    : [{ kind: "letValue", name: ctorName, moduleGlobal: true, value: fnExpr }];
  return [
    ...ctorBindingOps,
    {
      kind: "attachFunctionProperties",
      functionName: ctorName,
      propertiesName: classStaticStorageName(info.name)
    }
  ];
}

/**
 * Lowers static field initializers, static private field initializers, and static initialization
 * blocks in exact source declaration order, with `this` bound to the class constructor value.
 */
export function lowerClassStaticInitializers(
  context: LoweringContext,
  info: ClassInfo,
  initializers: readonly ClassStaticInitializer[],
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<readonly JsIrOperation[]> {
  if (initializers.length === 0) {
    return produced([]);
  }
  const initBindings = new Map(bindings);
  initBindings.set(CLASS_THIS_NAME, { kind: "valueVariable", name: classConstructorValueName(info.name) });
  const previousThis = context.classThisInScope;
  const previousCtor = context.inClassConstructor;
  const previousClass = context.activeEnclosingClass;
  const previousStatic = context.activeClassMethodStatic;
  context.classThisInScope = true;
  context.inClassConstructor = false;
  context.activeEnclosingClass = info;
  context.activeClassMethodStatic = true;
  try {
    const operations: JsIrOperation[] = [];
    for (const item of initializers) {
      if (item.kind === "block") {
        operations.push({
          kind: "call",
          name: classStaticBlockFunctionName(info.name, item.index),
          arguments: [{ valueKind: "value", value: { kind: "variable", name: classConstructorValueName(info.name) } }]
        });
        continue;
      }
      const value = lowerClassFieldInitializer(context, item.field, initBindings);
      if (value.kind !== "lowered") {
        return value;
      }
      if (item.field.privateName !== undefined && item.field.key.kind === "literal") {
        operations.push({
          kind: "privateFieldStore",
          targetName: classStaticStorageName(info.name),
          key: item.field.key.name,
          value: value.operation,
          message: classPrivateFieldDefineMessage(item.field.privateName),
          define: true
        });
      } else {
        operations.push({
          kind: "valueObjectStore",
          targetName: classStaticStorageName(info.name),
          key: classMemberKeyStringExpression(item.field.key),
          value: value.operation
        });
      }
    }
    return produced(operations);
  } finally {
    context.classThisInScope = previousThis;
    context.inClassConstructor = previousCtor;
    context.activeEnclosingClass = previousClass;
    context.activeClassMethodStatic = previousStatic;
  }
}

/**
 * The prototype and static entries a class declaration installs: accessors and methods on both
 * `C.prototype` and `C` (statics), including computed accessors.
 */
export function lowerPrototypeMethodStores(
  context: LoweringContext,
  info: ClassInfo,
  members: CollectedClassMembers,
  methodCaptures?: ReadonlyMap<string, readonly string[]>
): readonly JsIrOperation[] {
  const instanceAccessors: readonly JsIrOperation[] = [...new Set([...info.getters, ...info.setters])].map((name) => {
    const getName = classAccessorFunctionName(info.name, name, true);
    const setName = classAccessorFunctionName(info.name, name, false);
    return {
      kind: "defineAccessor",
      targetName: classPrototypeName(info.name),
      key: { kind: "literal", value: name },
      getter: info.getters.has(name) ? dispatchWrapper(context, info, getName, [], undefined, methodCaptures?.get(getName)) : { kind: "undefined" },
      setter: info.setters.has(name) ? dispatchWrapper(context, info, setName,
        [{ name: "value", valueKind: "value" }], undefined, methodCaptures?.get(setName)) : { kind: "undefined" }
    };
  });
  const staticAccessors: readonly JsIrOperation[] = [...new Set([...info.staticGetters, ...info.staticSetters])].map((name) => {
    const getName = classStaticAccessorFunctionName(info.name, name, true);
    const setName = classStaticAccessorFunctionName(info.name, name, false);
    return {
      kind: "defineAccessor",
      targetName: classStaticStorageName(info.name),
      key: { kind: "literal", value: name },
      getter: info.staticGetters.has(name) ? dispatchWrapper(context, info, getName, [], undefined, methodCaptures?.get(getName)) : { kind: "undefined" },
      setter: info.staticSetters.has(name) ? dispatchWrapper(context, info, setName,
        [{ name: "value", valueKind: "value" }], undefined, methodCaptures?.get(setName)) : { kind: "undefined" }
    };
  });
  const computedAccessors: readonly JsIrOperation[] = members.computedAccessors.map((entry) => {
    const fnName = classComputedAccessorFunctionName(info.name, entry.isStatic, entry.isGetter, entry.index);
    const wrapper = dispatchWrapper(context, info, fnName, entry.isGetter ? [] : [{ name: "value", valueKind: "value" }], undefined, methodCaptures?.get(fnName));
    return {
      kind: "defineAccessor",
      targetName: entry.isStatic ? classStaticStorageName(info.name) : classPrototypeName(info.name),
      key: { kind: "stringConversion", value: { kind: "variable", name: entry.slotName } },
      getter: entry.isGetter ? wrapper : { kind: "undefined" },
      setter: entry.isGetter ? { kind: "undefined" } : wrapper
    };
  });
  const instanceMethods = members.methodDeclarations.flatMap((entry) => {
    const method = info.methods.get(entry.name);
    return method === undefined ? [] : [lowerPrototypeMethodStore(context, info, entry.name, method, false, methodCaptures)];
  });
  const staticMethods = members.staticMethodDeclarations.flatMap((entry) => {
    const method = info.staticMethods.get(entry.name);
    return method === undefined ? [] : [lowerPrototypeMethodStore(context, info, entry.name, method, true, methodCaptures)];
  });
  return [...instanceAccessors, ...staticAccessors, ...computedAccessors, ...instanceMethods, ...staticMethods];
}

/**
 * One slot per private method, getter and setter (instance and static), plus defining static
 * private elements on `C$statics`.
 */
export function lowerPrivateFunctionSlots(
  context: LoweringContext,
  info: ClassInfo,
  isLocal = false,
  methodCaptures?: ReadonlyMap<string, readonly string[]>
): readonly JsIrOperation[] {
  const slot = (privateFunction: ReturnType<typeof classPrivateFunctions>[number]): JsIrOperation => {
    const value = dispatchWrapper(context, info, privateFunction.functionName, privateFunction.parameters, undefined,
      methodCaptures?.get(privateFunction.functionName));
    return isLocal
      ? { kind: "letValue", name: privateFunction.slotName, value }
      : { kind: "letValue", name: privateFunction.slotName, moduleGlobal: true, value };
  };
  const instanceSlots = classPrivateFunctions(info).map((privateFunction) => slot(privateFunction));
  const staticFunctions = classStaticPrivateFunctions(info);
  const staticSlots = staticFunctions.map((privateFunction) => slot(privateFunction));
  const staticDefines = staticFunctions.map((privateFunction): JsIrOperation => ({
    kind: "privateFieldStore",
    targetName: classStaticStorageName(info.name),
    key: privateFunction.storageKey,
    value: { kind: "variable", name: privateFunction.slotName },
    message: classPrivateFieldDefineMessage(privateFunction.functionName),
    define: true
  }));
  return [...instanceSlots, ...staticSlots, ...staticDefines];
}

/** One store installing `methodName`'s dispatch wrapper on `target`'s prototype or statics object. */
function lowerPrototypeMethodStore(
  context: LoweringContext,
  target: ClassInfo,
  methodName: string,
  method: ClassMethodInfo,
  isStatic: boolean,
  methodCaptures?: ReadonlyMap<string, readonly string[]>
): JsIrOperation {
  const fnName = classMethodFunctionName(target.name, methodName, isStatic);
  return {
    kind: "valueObjectStore",
    targetName: isStatic ? classStaticStorageName(target.name) : classPrototypeName(target.name),
    key: { kind: "literal", value: methodName },
    value: dispatchWrapper(context, target, fnName, method.parameters, methodName, methodCaptures?.get(fnName))
  };
}

/** A function object taking `parameters` that calls the direct function `functionName` with its receiver. */
function dispatchWrapper(
  context: LoweringContext,
  target: ClassInfo,
  functionName: string,
  parameters: readonly JsIrFunctionParameter[],
  inferredName?: string,
  extraCaptures: readonly string[] = []
): JsIrValueExpression {
  const codeName = `__tscn_protomethod_${target.name}_${functionName}_${context.nextFunctionObjectId}`.replace(/[^A-Za-z0-9_]/g, "_");
  context.nextFunctionObjectId += 1;
  const captures = extraCaptures.map((name) => ({
    name,
    valueKind: "value" as const,
    value: { kind: "variable" as const, name }
  }));
  const captureField = captures.length === 0 ? {} : { captures };
  const hasRest = parameters.some((parameter) => parameter.isRest === true);
  if (hasRest) {
    const spreadElements: JsIrRuntimeArrayElement[] = [
      { kind: "value", value: { kind: "variable", name: CLASS_THIS_NAME } },
      ...parameters.map(forwardedArrayElement)
    ];
    return {
      kind: "functionObject",
      definition: {
        codeName,
        parameters,
        functionKind: "ordinary",
        returnKind: "value",
        ...(inferredName === undefined ? {} : { inferredName }),
        ...captureField,
        body: [{
          kind: "returnValue",
          expression: {
            kind: "callValue",
            callee: {
              kind: "functionObject",
              definition: {
                codeName: `${codeName}_target`,
                parameters: [{ name: CLASS_THIS_NAME, valueKind: "value" }, ...parameters],
                functionKind: "ordinary",
                returnKind: "value",
                directTarget: functionName
              }
            },
            arguments: [],
            spreadArguments: spreadElements
          }
        }]
      }
    };
  }
  const forwarded = parameters.map((parameter) => forwardedClassArgument(parameter));
  return {
    kind: "functionObject",
    definition: {
      codeName,
      parameters,
      functionKind: "ordinary",
      returnKind: "value",
      ...(inferredName === undefined ? {} : { inferredName }),
      ...captureField,
      body: [{
        kind: "returnValue",
        expression: {
          kind: "call",
          name: functionName,
          arguments: [{ valueKind: "value", value: { kind: "variable", name: CLASS_THIS_NAME } }, ...forwarded]
        }
      }]
    }
  };
}

/** A wrapper's parameter as it passes it on: a rest parameter spreads back into separate arguments. */
function forwardedArrayElement(parameter: JsIrFunctionParameter): JsIrRuntimeArrayElement {
  return parameter.isRest === true
    ? { kind: "spread", arrayName: parameter.name, sourceKind: "runtime" }
    : { kind: "value", value: forwardedParameterValue(parameter) };
}

function forwardedParameterValue(parameter: JsIrFunctionParameter): JsIrValueExpression {
  if (parameter.valueKind === "number") {
    return { kind: "number", value: { kind: "parameter", name: parameter.name } };
  }
  if (parameter.valueKind === "string") {
    return { kind: "string", value: { kind: "variable", name: parameter.name } };
  }
  return { kind: "variable", name: parameter.name };
}
