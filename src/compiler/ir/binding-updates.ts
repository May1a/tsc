import type { JsIrBindingValue, JsIrValueKind } from "./bindings.js";
import type { JsIrValueExpression } from "./expressions.js";
import type { JsIrOperation } from "./types.js";
import { jsIrOperationChildren } from "./visit.js";
import { aggregateBindingForOperation } from "./operation-bindings.js";

/**
 * The binding map: what name means what, and how that changes as operations are emitted.
 *
 * `updateBindings` is the whole of it. After an operation is appended, every name it introduced or
 * rebound has to be recorded, because the *next* operation reads slots by name and there is no
 * per-variable slot in the IR — a binding's `name` is the SSA slot, and `bindingSlotName` in the
 * emitter resolves it. An operation that produces a value without recording it would leave the next
 * reader with no way to find it.
 *
 * Two passes run over the operations. `collect*` walks the expression trees to find which names an
 * operation *reads*, and `markRuntimeObjectShadow` writes the ones that become an opaque runtime
 * object, because a shadowed name can no longer be read as a known-shape field. Getting that order
 * wrong is how a `for...of` over an array literal ends up reading a stale layout.
 *
 */

export function updateConstBindings(
  operation: JsIrOperation,
  bindings: Map<string, JsIrBindingValue>
): void {
  if (operation.kind === "constString") {
    bindings.set(operation.name, { kind: "string", value: operation.value });
  }
  if (operation.kind === "constStringExpression") {
    bindings.set(operation.name, { kind: "stringExpression", value: operation.value });
  }
  if (operation.kind === "constNumber") {
    bindings.set(operation.name, { kind: "number", value: operation.value });
  }
  if (operation.kind === "constBoolean") {
    bindings.set(operation.name, { kind: "boolean", value: operation.value });
  }
  if (operation.kind === "constBooleanExpression") {
    bindings.set(operation.name, { kind: "booleanExpression", value: operation.value });
  }
  if (operation.kind === "constValue") {
    bindings.set(operation.name, { kind: "value", value: operation.value });
  }
  if (operation.kind === "letValue") {
    let valueType: "function" | "regex" | undefined;
    if (operation.value.kind === "functionObject") {
      valueType = "function";
    } else if (operation.value.kind === "regexCompile") {
      valueType = "regex";
    }
    let className: string | undefined;
    if (operation.value.kind === "newInstance") {
      ({ className } = operation.value);
    }
    bindings.set(operation.name, { kind: "valueVariable", name: operation.name, valueType, className });
  }
  if (operation.kind === "constClosure") {
    bindings.set(operation.name, { kind: "closure", value: operation.value });
  }
}
export function updateBindings(
  operation: JsIrOperation,
  bindings: Map<string, JsIrBindingValue>
): void {
  updateConstBindings(operation, bindings);
  if (operation.kind === "bindingGroup") {
    for (const nested of operation.operations) {
      updateBindings(nested, bindings);
    }
  }
  if (operation.kind === "arrayDestructureProtocol") {
    for (const element of operation.elements) {
      if (element.kind === "binding") {
        bindings.set(element.name, { kind: "valueVariable", name: element.name });
      } else if (element.kind === "rest") {
        bindings.set(element.name, { kind: "runtimeArray", name: element.name });
      } else if (element.kind === "nested") {
        for (const nested of element.operations) {
          updateBindings(nested, bindings);
        }
      }
    }
  }
  if (operation.kind === "letNumber") {
    bindings.set(operation.name, { kind: "number", value: { kind: "variable", name: operation.name } });
  }
  if (operation.kind === "letString") {
    bindings.set(operation.name, { kind: "stringVariable", name: operation.name });
  }
  if (operation.kind === "letBoolean") {
    let initialValue: boolean | undefined;
    if (operation.value.kind === "boolean") {
      initialValue = operation.value.value;
    }
    bindings.set(operation.name, { kind: "booleanVariable", name: operation.name, initialValue });
  }
  updateAggregateBindings(operation, bindings);
  if (operation.kind === "function") {
    bindings.set(operation.name, {
      kind: "function",
      parameters: operation.parameters,
      returnKind: functionReturnKind(operation.body),
      body: operation.body,
      constructibleByObjectReturn: operation.constructibleByObjectReturn
    });
    const returnClosure = operation.body.find((bodyOperation) => bodyOperation.kind === "returnClosure");
    if (returnClosure?.kind === "returnClosure") {
      bindings.set(operation.name, {
        kind: "closureFactory",
        functionName: returnClosure.functionName,
        factoryParameters: operation.parameters.map((parameter) => parameter.name),
        captureNames: returnClosure.captures
      });
    }
  }
  if (operation.kind === "runtimeArrayFindCallback" || operation.kind === "runtimeArrayReduceCallback") {
    bindings.set(operation.name, { kind: "valueVariable", name: operation.name });
  }
  if (operation.kind === "runtimeArrayFindIndexCallback") {
    bindings.set(operation.name, { kind: "number", value: { kind: "variable", name: operation.name } });
  }
}
export function updateAggregateBindings(
  operation: JsIrOperation,
  bindings: Map<string, JsIrBindingValue>
): void {
  const binding = aggregateBindingForOperation(operation);
  if (binding !== undefined && "name" in operation) {
    bindings.set(operation.name, binding);
  }
}
export function markRuntimeObjectShadows(operations: readonly JsIrOperation[]): readonly JsIrOperation[] {
  const shadowedObjects = new Set<string>();
  for (const operation of operations) {
    collectRuntimeShadowObjectNames(operation, shadowedObjects);
  }

  if (shadowedObjects.size === 0) {
    return operations;
  }

  return operations.map((operation) => markRuntimeObjectShadow(operation, shadowedObjects));
}
export function markFinallyOperations(
  finallyOperations: readonly JsIrOperation[] | undefined
): readonly JsIrOperation[] | undefined {
  if (finallyOperations === undefined) {
    return undefined;
  }
  return markRuntimeObjectShadows(finallyOperations);
}
export function markRuntimeObjectShadow(operation: JsIrOperation, shadowedObjects: ReadonlySet<string>): JsIrOperation {
  if (operation.kind === "objectLiteral") {
    return { ...operation, needsRuntimeShadow: shadowedObjects.has(operation.name) };
  }
  if (operation.kind === "if") {
    return {
      ...operation,
      thenOperations: markRuntimeObjectShadows(operation.thenOperations),
      elseOperations: markRuntimeObjectShadows(operation.elseOperations)
    };
  }
  if (operation.kind === "switch") {
    return { ...operation, clauses: operation.clauses.map((clause) => ({ ...clause, operations: markRuntimeObjectShadows(clause.operations) })) };
  }
  if (operation.kind === "while" || operation.kind === "doWhile") {
    return { ...operation, body: markRuntimeObjectShadows(operation.body) };
  }
  if (operation.kind === "bindingGroup") {
    return { ...operation, operations: operation.operations.map((nested) => markRuntimeObjectShadow(nested, shadowedObjects)) };
  }
  if (operation.kind === "tryCatch") {
    return {
      ...operation,
      tryOperations: markRuntimeObjectShadows(operation.tryOperations),
      catchOperations: markRuntimeObjectShadows(operation.catchOperations),
      finallyOperations: markFinallyOperations(operation.finallyOperations)
    };
  }
  if (operation.kind === "for") {
    return {
      ...operation,
      initializer: operation.initializer.map((declaration) => markRuntimeObjectShadow(declaration, shadowedObjects)),
      body: markRuntimeObjectShadows(operation.body),
      increment: markRuntimeObjectShadow(operation.increment, shadowedObjects)
    };
  }
  if (operation.kind === "function") {
    return { ...operation, body: markRuntimeObjectShadows(operation.body) };
  }
  return operation;
}
export function collectRuntimeShadowObjectNames(operation: JsIrOperation, names: Set<string>): void {
  collectOperationValueExpressions(operation, names);
  if (operation.kind === "runtimeObjectStore") {
    names.add(operation.objectName);
  }
  if (operation.kind === "runtimeObjectAssign") {
    names.add(operation.targetName);
    for (const source of operation.sources) {
      if (source.kind === "runtimeObject") {
        names.add(source.name);
      }
    }
  }
  if (
    (operation.kind === "runtimeObjectKeys" ||
      operation.kind === "runtimeObjectValues" ||
      operation.kind === "runtimeObjectEntries" ||
      operation.kind === "runtimeObjectOwnPropertyNames" ||
      operation.kind === "runtimeObjectOwnPropertyDescriptors" ||
      operation.kind === "runtimeObjectOwnPropertyDescriptor") &&
    operation.targetKind === "object"
  ) {
    names.add(operation.targetName);
  }
}
// eslint-disable-next-line complexity, max-statements -- Transitional aggregate JSValue tracking centralizes all operation variants.
export function collectOperationValueExpressions(operation: JsIrOperation, names: Set<string>): void {
  if (operation.kind === "constValue" || operation.kind === "requireObjectCoercible" || operation.kind === "throwValue" || operation.kind === "runtimeArrayStore" || operation.kind === "runtimeArrayNamedStore" || operation.kind === "runtimeObjectStore" || operation.kind === "valueArrayStore" || operation.kind === "valueObjectStore" || operation.kind === "privateFieldStore") {
    collectValueExpressionObjectNames(operation.value, names);
  }
  if (operation.kind === "arrayDestructureProtocol") {
    if (operation.source.kind === "value") {
      collectValueExpressionObjectNames(operation.source.value, names);
    }
    for (const element of operation.elements) {
      if (element.kind === "binding" && element.defaultValue !== undefined) {
        collectValueExpressionObjectNames(element.defaultValue, names);
      }
      if (element.kind === "nested") {
        for (const nested of element.operations) {
          collectRuntimeShadowObjectNames(nested, names);
        }
      }
    }
  }
  if (operation.kind === "runtimeErrorLiteral") {
    collectValueExpressionObjectNames(operation.message, names);
  }
  if (operation.kind === "block" || operation.kind === "bindingGroup") {
    for (const nested of operation.operations) {
      collectRuntimeShadowObjectNames(nested, names);
    }
  }
  if (operation.kind === "runtimeArrayConcat") {
    for (const value of operation.values) {
      if (value.kind === "value") {
        collectValueExpressionObjectNames(value.value, names);
      }
    }
  }
  if (operation.kind === "returnValue") {
    collectValueExpressionObjectNames(operation.expression, names);
  }
  if (operation.kind === "runtimeArrayLiteral") {
    for (const element of operation.elements) {
      if (element.kind === "value") {
        collectValueExpressionObjectNames(element.value, names);
      } else if (element.kind === "iterableSpread") {
        collectValueExpressionObjectNames(element.source, names);
      }
    }
  }
  if (operation.kind === "runtimeObjectLiteral") {
    for (const field of operation.value.fields) {
      if (field.kind === "spread") {
        names.add(field.sourceName);
      } else {
        collectValueExpressionObjectNames(field.value, names);
      }
    }
  }
  if (operation.kind === "runtimeObjectDefineDataProperty") {
    collectValueExpressionObjectNames(operation.descriptor.value, names);
  }
  if (operation.kind === "runtimeObjectDefineDataProperties") {
    for (const descriptor of operation.descriptors) {
      collectValueExpressionObjectNames(descriptor.value, names);
    }
  }
  if (operation.kind === "print" && operation.expression.kind === "value") {
    collectValueExpressionObjectNames(operation.expression.value, names);
  }
  if (operation.kind === "if") {
    for (const nested of [...operation.thenOperations, ...operation.elseOperations]) {
      collectRuntimeShadowObjectNames(nested, names);
    }
  }
  if (operation.kind === "switch") {
    collectValueExpressionObjectNames(operation.expression, names);
    for (const clause of operation.clauses) {
      if (clause.test !== undefined) {
        collectValueExpressionObjectNames(clause.test, names);
      }
      for (const nested of clause.operations) {
        collectRuntimeShadowObjectNames(nested, names);
      }
    }
  }
  if (operation.kind === "while" || operation.kind === "doWhile" || operation.kind === "function") {
    for (const nested of operation.body) {
      collectRuntimeShadowObjectNames(nested, names);
    }
  }
  if (operation.kind === "tryCatch") {
    const nestedOps = [...operation.tryOperations, ...operation.catchOperations, ...(operation.finallyOperations ?? [])];
    for (const nested of nestedOps) {
      collectRuntimeShadowObjectNames(nested, names);
    }
  }
  if (operation.kind === "for") {
    for (const declaration of operation.initializer) {
      collectRuntimeShadowObjectNames(declaration, names);
    }
    for (const nested of operation.body) {
      collectRuntimeShadowObjectNames(nested, names);
    }
    collectRuntimeShadowObjectNames(operation.increment, names);
  }
}
export function collectValueExpressionObjectNames(expression: JsIrValueExpression, names: Set<string>): void {
  if (expression.kind === "objectDynamicAccess") {
    names.add(expression.objectName);
  }
  if (expression.kind === "ternary") {
    collectValueExpressionObjectNames(expression.consequent, names);
    collectValueExpressionObjectNames(expression.alternate, names);
  }
  if (expression.kind === "call") {
    for (const argument of expression.arguments) {
      if (argument.valueKind === "value") {
        collectValueExpressionObjectNames(argument.value, names);
      }
    }
  }
  if (expression.kind === "callValue") {
    collectCallValueExpressionObjectNames(expression, names);
  }
  if (expression.kind === "nullishCoalesce" || expression.kind === "logicalValue" || expression.kind === "valuePlus") {
    collectValueExpressionObjectNames(expression.left, names);
    collectValueExpressionObjectNames(expression.right, names);
  }
  if (expression.kind === "optionalChain") {
    collectValueExpressionObjectNames(expression.guard, names);
    collectValueExpressionObjectNames(expression.access, names);
  }
  if (expression.kind === "jsonStringify") {
    collectValueExpressionObjectNames(expression.value, names);
  }
  if (expression.kind === "jsonParse") {
    collectValueExpressionObjectNames(expression.text, names);
    if (expression.reviver !== undefined) {
      collectValueExpressionObjectNames(expression.reviver, names);
    }
  }
}
export function collectCallValueExpressionObjectNames(
  expression: Extract<JsIrValueExpression, { readonly kind: "callValue" }>,
  names: Set<string>
): void {
  collectValueExpressionObjectNames(expression.callee, names);
  if (expression.thisValue !== undefined) {
    collectValueExpressionObjectNames(expression.thisValue, names);
  }
  if (expression.methodReceiver !== undefined) {
    collectValueExpressionObjectNames(expression.methodReceiver, names);
  }
  for (const argument of expression.arguments) {
    if (argument.valueKind === "value") {
      collectValueExpressionObjectNames(argument.value, names);
    }
  }
  for (const argument of expression.spreadArguments ?? []) {
    if (argument.kind === "value") {
      collectValueExpressionObjectNames(argument.value, names);
    } else if (argument.kind === "iterableSpread") {
      collectValueExpressionObjectNames(argument.source, names);
    }
  }
}
export function functionReturnKind(operations: readonly JsIrOperation[]): JsIrValueKind | "void" {
  const flattened = functionControlFlowOperations(operations);
  if (flattened.some((operation) => operation.kind === "returnValue")) {
    return "value";
  }
  if (flattened.some((operation) => operation.kind === "returnString")) {
    return "string";
  }
  if (flattened.some((operation) => operation.kind === "returnNumber")) {
    return "number";
  }
  return "void";
}
export function functionControlFlowOperations(operations: readonly JsIrOperation[]): readonly JsIrOperation[] {
  const flattened: JsIrOperation[] = [];
  const visit = (operation: JsIrOperation): void => {
    flattened.push(operation);
    if (operation.kind === "function" || operation.kind === "returnClosure" || operation.kind === "runtimeArrayMapFunctionObject") {
      return;
    }
    for (const child of jsIrOperationChildren(operation)) {
      visit(child);
    }
  };
  for (const operation of operations) {
    visit(operation);
  }
  return flattened;
}
