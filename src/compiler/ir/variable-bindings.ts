import { type Lowered, loweredPayload, notApplicable, produced } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import { lowerDestructuringBinding } from "./destructuring.js";
import { lowerClosureFactoryCall, lowerFunctionObjectValue } from "./closures.js";
import { unwrapTypeOnlyExpression } from "./predicates.js";
import { classifyArrayLiteral } from "./array-literals.js";
import { lowerStringExpression } from "./string-constants.js";
import { lowerBooleanExpression } from "./conditions.js";
import { classifyObjectLiteral } from "./object-literals.js";
import { fixedObjectToRuntimeObjectValue, lowerRuntimeObjectOwnPropertyDescriptorBinding } from "./object-descriptors.js";
import { lowerRuntimeErrorLiteral } from "./errors.js";
import { lowerJsonParseBinding } from "./json-bindings.js";
import { lowerRuntimeObjectCreateBinding, lowerRuntimeObjectGetPrototypeBinding, lowerRuntimeObjectKeysBinding, lowerRuntimeObjectOwnPropertyDescriptorsBinding, lowerRuntimeObjectOwnPropertyNamesBinding, lowerRuntimeObjectValuesBinding } from "./builtins/object-producers.js";
import { lowerRuntimeAggregateExpansionBinding } from "./aggregate-bindings.js";
import { lowerRuntimeCollectionBinding, lowerRuntimeIteratorBinding } from "./collection-bindings.js";

export function lowerVariableBinding(
  context: LoweringContext,
  statement: ts.VariableStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  promotedAggregates: ReadonlySet<string> = new Set()
): Lowered {
  if (statement.declarationList.declarations.length !== 1) {
    return notApplicable;
  }

  const [declaration] = statement.declarationList.declarations;
  if (!declaration.initializer) {
    return notApplicable;
  }

  const isConst = (statement.declarationList.flags & ts.NodeFlags.Const) !== 0;
  const isVar = (statement.declarationList.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) === 0;

  if (ts.isArrayBindingPattern(declaration.name) || ts.isObjectBindingPattern(declaration.name)) {
    if (!isConst) {
      return notApplicable;
    }
    return lowerDestructuringBinding(context, declaration.name, declaration.initializer, bindings);
  }

  if (!ts.isIdentifier(declaration.name)) {
    return notApplicable;
  }

  // Simple `var` bindings flow through the `let` path. Function-scoped hoisting
  // (use before declaration) is not modeled, so a `var` is only supported where
  // a `let` in the same position would be. A redeclaration in the same scope
  // merges with the existing binding, matching function-scoped `var` semantics.
  if (!isConst) {
    if (isVar && bindings.has(declaration.name.text)) {
      return lowerVarRedeclaration(context, declaration.name.text, declaration.initializer, bindings);
    }
    return lowerLetVariableBinding(context, declaration.name.text, declaration.initializer, bindings);
  }

  return context.lowerConstVariableBinding(
    context, declaration.name.text,
    declaration.initializer,
    bindings,
    declaration.type?.kind === ts.SyntaxKind.UnknownKeyword || declaration.type?.kind === ts.SyntaxKind.AnyKeyword,
    isRuntimeArrayTypeHint(declaration.type) || promotedAggregates.has(declaration.name.text),
    promotedAggregates.has(declaration.name.text)
  );
}

function isRuntimeArrayTypeHint(type: ts.TypeNode | undefined): boolean {
  if (type === undefined) {
    return false;
  }
  if (ts.isArrayTypeNode(type)) {
    return type.elementType.kind === ts.SyntaxKind.UnknownKeyword || type.elementType.kind === ts.SyntaxKind.AnyKeyword;
  }
  return type.kind === ts.SyntaxKind.AnyKeyword;
}

// not match the existing binding is rejected rather than silently re-typed.
function lowerVarRedeclaration(
  context: LoweringContext,
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const binding = bindings.get(name);
  if (binding?.kind === "stringVariable") {
    const value = context.lowerStringRuntimeExpression(context, initializer, bindings);
    if (value.kind !== "lowered") {
      return value;
    }
    return produced({ kind: "assignString", name, value: value.operation });
  }
  if (binding?.kind === "booleanVariable") {
    const booleanValue = context.lowerConditionExpression(context, initializer, bindings);
    if (booleanValue.kind !== "lowered") {
      return notApplicable;
    }
    return produced({ kind: "assignBoolean", name, value: booleanValue.operation });
  }
  if (binding?.kind !== "number" || binding.value.kind !== "variable") {
    return notApplicable;
  }
  const value = context.lowerNumberExpression(context, initializer, bindings);
  if (value.kind !== "lowered") {
    return value;
  }
  return produced({ kind: "assignNumber", name, value: value.operation });
}

function lowerLetVariableBinding(
  context: LoweringContext,
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const functionValue = lowerFunctionObjectValue(context, unwrapTypeOnlyExpression(initializer), bindings, name);
  if (functionValue.kind === "unsupported") {
    return functionValue;
  }
  if (functionValue.kind === "lowered") {
    return produced({ kind: "letValue", name, value: functionValue.operation });
  }

  const arrayLiteralResult = classifyArrayLiteral(context, initializer, bindings);
  if (arrayLiteralResult.kind === "unsupported") {
    return arrayLiteralResult;
  }
  const arrayLiteral = loweredPayload(arrayLiteralResult);
  if (arrayLiteral?.kind === "fixed") {
    return produced({
      kind: "arrayLiteral",
      name,
      elements: arrayLiteral.elements
    });
  }

  if (arrayLiteral?.kind === "runtime") {
    return produced({
      kind: "runtimeArrayLiteral",
      name,
      elements: arrayLiteral.elements
    });
  }

  const booleanValue = context.lowerConditionExpression(context, initializer, bindings);
  if (booleanValue.kind === "lowered") {
    return produced({
      kind: "letBoolean",
      name,
      value: booleanValue.operation
    });
  }

  const stringValue = context.lowerStringRuntimeExpression(context, initializer, bindings);
  if (stringValue.kind === "unsupported") {
    return stringValue;
  }
  if (stringValue.kind === "lowered") {
    return produced({
      kind: "letString",
      name,
      value: stringValue.operation
    });
  }

  const numberValue = context.lowerNumberExpression(context, initializer, bindings);
  if (numberValue.kind !== "lowered") {
    return numberValue;
  }

  return produced({
    kind: "letNumber",
    name,
    value: numberValue.operation
  });
}

// eslint-disable-next-line complexity, max-statements -- Const initializer dispatch walks aggregate/closure/string/number/boolean/condition/value branches in one place.
export function lowerConstVariableBinding(
  context: LoweringContext,
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  forceValue = false,
  forceRuntimeArray = false,
  forceRuntimeObject = false
): Lowered {
  const unwrappedInitializer = unwrapTypeOnlyExpression(initializer);
  const aggregateValue = context.lowerConstAggregateBinding(context, name, unwrappedInitializer, bindings, forceRuntimeArray, forceRuntimeObject);
  if (aggregateValue.kind !== "notApplicable") {
    return aggregateValue;
  }

  const functionValue = lowerFunctionObjectValue(context, unwrappedInitializer, bindings, name);
  if (functionValue.kind === "unsupported") {
    return functionValue;
  }
  if (functionValue.kind === "lowered") {
    return produced({ kind: "letValue", name, value: functionValue.operation });
  }

  if (forceValue) {
    const value = context.lowerValueExpression(context, unwrappedInitializer, bindings);
    if (value.kind !== "lowered") {
      return value;
    }
    return produced({ kind: "constValue", name, value: value.operation });
  }

  const closureValue = lowerClosureFactoryCall(context, unwrappedInitializer, bindings);
  if (closureValue.kind === "unsupported") {
    return closureValue;
  }
  if (closureValue.kind === "lowered") {
    return produced({
      kind: "constClosure",
      name,
      value: closureValue.operation
    });
  }

  const stringValue = lowerStringExpression(unwrappedInitializer, bindings);
  if (stringValue !== undefined) {
    return produced({
      kind: "constString",
      name,
      value: stringValue
    });
  }

  const stringExpression = context.lowerStringRuntimeExpression(context, unwrappedInitializer, bindings);
  if (stringExpression.kind === "unsupported") {
    return stringExpression;
  }
  if (stringExpression.kind === "lowered") {
    return produced({
      kind: "constStringExpression",
      name,
      value: stringExpression.operation
    });
  }

  const numberValue = context.lowerNumberExpression(context, unwrappedInitializer, bindings);
  if (numberValue.kind === "unsupported") {
    return numberValue;
  }
  if (numberValue.kind === "lowered") {
    return produced({
      kind: "constNumber",
      name,
      value: numberValue.operation
    });
  }

  const booleanValue = lowerBooleanExpression(unwrappedInitializer, bindings);
  if (booleanValue !== undefined) {
    return produced({
      kind: "constBoolean",
      name,
      value: booleanValue
    });
  }

  const booleanCondition = context.lowerConditionExpression(context, unwrappedInitializer, bindings);
  if (booleanCondition.kind === "lowered") {
    return produced({
      kind: "constBooleanExpression",
      name,
      value: booleanCondition.operation
    });
  }

  const value = context.lowerValueExpression(context, unwrappedInitializer, bindings);
  if (value.kind === "unsupported") {
    return value;
  }
  if (value.kind === "lowered") {
    // A class instance must be materialized once into a stable slot so later
    // references share object identity instead of re-running the constructor.
    if (value.operation.kind === "newInstance" || value.operation.kind === "functionObject" || value.operation.kind === "call" || value.operation.kind === "callValue" || value.operation.kind === "regexCompile" || value.operation.kind === "regexExec" || value.operation.kind === "regexMatch" || value.operation.kind === "jsonParse") {
      return produced({ kind: "letValue", name, value: value.operation });
    }
    return produced({
      kind: "constValue",
      name,
      value: value.operation
    });
  }

  return notApplicable;
}

// eslint-disable-next-line complexity, max-statements -- Const aggregate binding routes the supported built-in constructors and inspectors.
export function lowerConstAggregateBinding(
  context: LoweringContext,
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  forceRuntimeArray = false,
  forceRuntimeObject = false
): Lowered {
  const arrayLiteralResult2 = classifyArrayLiteral(context, initializer, bindings);
  if (arrayLiteralResult2.kind === "unsupported") {
    return arrayLiteralResult2;
  }
  const arrayLiteral = loweredPayload(arrayLiteralResult2);
  if (forceRuntimeArray && arrayLiteral?.kind === "fixed") {
    return produced({ kind: "runtimeArrayLiteral", name, elements: arrayLiteral.elements.map((value) => ({ kind: "value", value: { kind: "number", value } })) });
  }
  if (arrayLiteral?.kind === "fixed") {
    return produced({ kind: "arrayLiteral", name, elements: arrayLiteral.elements });
  }
  if (arrayLiteral?.kind === "runtime") {
    return produced({ kind: "runtimeArrayLiteral", name, elements: arrayLiteral.elements });
  }
  const objectLiteralResult = classifyObjectLiteral(context, initializer, bindings);
  if (objectLiteralResult.kind === "unsupported") {
    return objectLiteralResult;
  }
  const objectLiteral = loweredPayload(objectLiteralResult);
  if (forceRuntimeObject && objectLiteral?.kind === "fixed") {
    const value = fixedObjectToRuntimeObjectValue(objectLiteral.value);
    if (value === undefined) {
      return notApplicable;
    }
    return produced({ kind: "runtimeObjectLiteral", name, value });
  }
  if (objectLiteral?.kind === "fixed") {
    return produced({ kind: "objectLiteral", name, value: objectLiteral.value, needsRuntimeShadow: false });
  }
  if (objectLiteral?.kind === "runtime") {
    return produced({ kind: "runtimeObjectLiteral", name, value: objectLiteral.value });
  }
  const errorLiteral = lowerRuntimeErrorLiteral(context, name, initializer, bindings);
  if (errorLiteral.kind !== "notApplicable") {
    return errorLiteral;
  }
  const jsonParseResult = lowerJsonParseBinding(name, initializer, bindings);
  if (jsonParseResult.kind === "unsupported") {
    return jsonParseResult;
  }
  const jsonParse = loweredPayload(jsonParseResult);
  if (jsonParse !== undefined) {
    return produced(jsonParse);
  }
  const objectCreateResult = lowerRuntimeObjectCreateBinding(name, initializer, bindings);
  if (objectCreateResult.kind === "unsupported") {
    return objectCreateResult;
  }
  const objectCreate = loweredPayload(objectCreateResult);
  if (objectCreate !== undefined) {
    return produced(objectCreate);
  }
  const objectKeysResult = lowerRuntimeObjectKeysBinding(name, initializer, bindings);
  if (objectKeysResult.kind === "unsupported") {
    return objectKeysResult;
  }
  const objectKeys = loweredPayload(objectKeysResult);
  if (objectKeys !== undefined) {
    return produced(objectKeys);
  }
  const objectValuesResult = lowerRuntimeObjectValuesBinding(name, initializer, bindings);
  if (objectValuesResult.kind === "unsupported") {
    return objectValuesResult;
  }
  const objectValues = loweredPayload(objectValuesResult);
  if (objectValues !== undefined) {
    return produced(objectValues);
  }
  const runtimeExpansion = lowerRuntimeAggregateExpansionBinding(context, name, initializer, bindings);
  if (runtimeExpansion.kind !== "notApplicable") {
    return runtimeExpansion;
  }
  const descriptor = lowerRuntimeObjectOwnPropertyDescriptorBinding(context, name, initializer, bindings);
  if (descriptor.kind !== "notApplicable") {
    return descriptor;
  }
  const propertyNamesResult = lowerRuntimeObjectOwnPropertyNamesBinding(name, initializer, bindings);
  if (propertyNamesResult.kind === "unsupported") {
    return propertyNamesResult;
  }
  const propertyNames = loweredPayload(propertyNamesResult);
  if (propertyNames !== undefined) {
    return produced(propertyNames);
  }
  const descriptorsResult = lowerRuntimeObjectOwnPropertyDescriptorsBinding(name, initializer, bindings);
  if (descriptorsResult.kind === "unsupported") {
    return descriptorsResult;
  }
  const descriptors = loweredPayload(descriptorsResult);
  if (descriptors !== undefined) {
    return produced(descriptors);
  }
  const objectPrototypeResult = lowerRuntimeObjectGetPrototypeBinding(name, initializer, bindings);
  if (objectPrototypeResult.kind === "unsupported") {
    return objectPrototypeResult;
  }
  const objectPrototype = loweredPayload(objectPrototypeResult);
  if (objectPrototype !== undefined) {
    return produced(objectPrototype);
  }
  const collection = lowerRuntimeCollectionBinding(context, name, initializer, bindings);
  if (collection.kind !== "notApplicable") {
    return collection;
  }
  const iteratorResult = lowerRuntimeIteratorBinding(name, initializer, bindings);
  if (iteratorResult.kind === "unsupported") {
    return iteratorResult;
  }
  const iterator = loweredPayload(iteratorResult);
  if (iterator !== undefined) {
    return produced(iterator);
  }
  return notApplicable;
}
