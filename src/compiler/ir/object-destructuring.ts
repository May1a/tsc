import { type Produced, produced, withRefusal } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import { type DestructuringSource, lowerDestructuredFallbackOperation, lowerDestructuredValueBinding } from "./destructuring.js";
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
    if (ts.isObjectBindingPattern(element.name)) {
      if (sourceBinding.kind !== "runtimeObject") {
        return produced(false);
      }
      const nestedResult = lowerNestedObjectDestructuring(context, element.name, source.name, key, working, operations);
      if (nestedResult.kind === "unsupported") {
        return nestedResult;
      }
      const nested = nestedResult.operation;
      if (!nested) {
        return produced(false);
      }
      continue;
    }
    if (!ts.isIdentifier(element.name)) {
      return produced(false);
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
    let access: JsIrValueExpression;
    if (sourceBinding.kind === "valueVariable") {
      access = { kind: "valueObjectDynamicAccess", value: { kind: "variable", name: source.name }, key: { kind: "literal", value: key } };
    } else {
      access = { kind: "objectDynamicAccess", objectName: source.name, key: { kind: "literal", value: key } };
    }
    const operation = lowerDestructuredValueBinding(context, element.name.text, access, element.initializer, working, lazyDefaults);
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

function lowerNestedObjectDestructuring(
  context: LoweringContext,
  pattern: ts.ObjectBindingPattern,
  sourceName: string,
  parentKey: string,
  working: Map<string, JsIrBindingValue>,
  operations: JsIrOperation[]
): Produced<boolean> {
  const parentAccess: JsIrValueExpression = { kind: "objectDynamicAccess", objectName: sourceName, key: { kind: "literal", value: parentKey } };
  for (const element of pattern.elements) {
    if (element.dotDotDotToken !== undefined || !ts.isIdentifier(element.name)) {
      return produced(false);
    }
    const key = destructuredPropertyKey(element);
    if (key === undefined) {
      return produced(false);
    }
    const access: JsIrValueExpression = { kind: "valueObjectDynamicAccess", value: parentAccess, key: { kind: "literal", value: key } };
    const operation = lowerDestructuredValueBinding(context, element.name.text, access, element.initializer, working);
    if (operation.kind !== "lowered") {
      return withRefusal(operation, produced(false));
    }
    operations.push(operation.operation);
    updateBindings(operation.operation, working);
  }
  return produced(true);
}
