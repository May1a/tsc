import { type Produced, produced, withRefusal } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import { type DestructuringSource, lowerDestructuredFallbackOperation, lowerDestructuredValueBinding, lowerNestedBindingFromValue } from "./destructuring.js";
import type { JsIrBindingValue } from "./bindings.js";
import type { JsIrOperation } from "./types.js";
import type { JsIrObjectValue, JsIrValueExpression } from "./expressions.js";
import { updateBindings } from "./binding-updates.js";
import { objectPathExists } from "./builtins/object-producers.js";

// eslint-disable-next-line complexity, max-statements -- Object destructuring routes fixed and runtime sources plus rest, rename, default, and nested shapes.
export function lowerObjectDestructuringElements(
  context: LoweringContext,
  pattern: ts.ObjectBindingPattern,
  source: DestructuringSource,
  working: Map<string, JsIrBindingValue>,
  operations: JsIrOperation[],
  lazyDefaults = false
): Produced<boolean> {
  const sourceBinding = source.binding;
  if (sourceBinding.kind !== "runtimeObject" && sourceBinding.kind !== "object" && sourceBinding.kind !== "valueVariable") {
    return produced(false);
  }
  if (sourceBinding.kind === "valueVariable") {
    operations.push({ kind: "requireObjectCoercible", value: { kind: "variable", name: source.name } });
  }
  const extractedKeys: string[] = [];
  for (const element of pattern.elements) {
    if (element.dotDotDotToken !== undefined) {
      if (sourceBinding.kind !== "runtimeObject" || !ts.isIdentifier(element.name)) {
        return produced(false);
      }
      lowerObjectDestructuredRest(element.name.text, source.name, extractedKeys, working, operations);
      continue;
    }
    const key = destructuredPropertyKey(element);
    if (key === undefined) {
      return produced(false);
    }
    extractedKeys.push(key);
    if (!ts.isIdentifier(element.name)) {
      // Static numeric object layouts have no boxed property value to recurse through.
      if (sourceBinding.kind === "object") {
        return produced(false);
      }
      const nestedResult = lowerNestedBindingFromValue(
        context, element, `destructure.property.${element.pos}`,
        destructuredPropertyAccess(source, key), working, operations
      );
      if (nestedResult.kind === "unsupported") {
        return nestedResult;
      }
      if (!nestedResult.operation) {
        return produced(false);
      }
      continue;
    }
    if (sourceBinding.kind === "object") {
      const fixedElementResult = lowerFixedObjectDestructuredElement(context, element.name.text, source.name, sourceBinding.value, key, element.initializer, working, operations);
      if (fixedElementResult.kind === "unsupported") {
        return fixedElementResult;
      }
      const fixedElement = fixedElementResult.operation;
      if (!fixedElement) {
        return produced(false);
      }
      continue;
    }
    const operation = lowerDestructuredValueBinding(
      context, element.name.text, destructuredPropertyAccess(source, key), element.initializer, working, lazyDefaults
    );
    if (operation.kind !== "lowered") {
      return withRefusal(operation, produced(false));
    }
    operations.push(operation.operation);
    updateBindings(operation.operation, working);
  }
  return produced(true);
}

function destructuredPropertyKey(element: ts.BindingElement): string | undefined {
  if (element.propertyName !== undefined) {
    if (ts.isIdentifier(element.propertyName) || ts.isStringLiteral(element.propertyName)) {
      return element.propertyName.text;
    }
    return undefined;
  }
  if (ts.isIdentifier(element.name)) {
    return element.name.text;
  }
  return undefined;
}

function lowerObjectDestructuredRest(
  name: string,
  sourceName: string,
  extractedKeys: readonly string[],
  working: Map<string, JsIrBindingValue>,
  operations: JsIrOperation[]
): void {
  const literal: JsIrOperation = { kind: "runtimeObjectLiteral", name, value: { fields: [] } };
  operations.push(literal);
  updateBindings(literal, working);
  operations.push({ kind: "runtimeObjectAssign", targetName: name, sources: [{ kind: "runtimeObject", name: sourceName }] });
  for (const key of extractedKeys) {
    operations.push({ kind: "runtimeObjectDelete", objectName: name, key: { kind: "literal", value: key } });
  }
}

function lowerFixedObjectDestructuredElement(
  context: LoweringContext,
  name: string,
  sourceName: string,
  objectValue: JsIrObjectValue,
  key: string,
  defaultInitializer: ts.Expression | undefined,
  working: Map<string, JsIrBindingValue>,
  operations: JsIrOperation[]
): Produced<boolean> {
  const operation = lowerDestructuredFallbackOperation(
    context, name,
    objectPathExists(objectValue, [key]),
    { kind: "constNumber", name, value: { kind: "objectAccess", objectName: sourceName, path: [key] } },
    defaultInitializer,
    working
  );
  if (operation.kind !== "lowered") {
    return withRefusal(operation, produced(false));
  }
  operations.push(operation.operation);
  updateBindings(operation.operation, working);
  return produced(true);
}

function destructuredPropertyAccess(source: DestructuringSource, key: string): JsIrValueExpression {
  if (source.binding.kind === "valueVariable") {
    return { kind: "valueObjectDynamicAccess", value: { kind: "variable", name: source.name }, key: { kind: "literal", value: key } };
  }
  return { kind: "objectDynamicAccess", objectName: source.name, key: { kind: "literal", value: key } };
}
