import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import { type Lowered, loweredPayload, notApplicable, produced, unsupportedIn } from "./lowered.js";
import type { JsIrCondition, JsIrNumberOperator } from "./expressions.js";
import { lowerObjectAccessPath, objectPathExists } from "./builtins/object-producers.js";
import { lowerSymbolIteratorKeyExpression } from "./class-info.js";
import { lowerCanonicalArrayIndexString } from "./predicates.js";
import { lowerPropertyKeyExpression } from "./string-expressions.js";
import { isProvenBoxedAggregateBinding } from "./number-access.js";
import { lowerStringExpression } from "./string-constants.js";
import { lowerClassPrivateFieldStore } from "./class-values.js";
import { lowerClassPropertyAssignment } from "./class-mutations.js";
import { CLASS_THIS_NAME } from "./class-names.js";

// eslint-disable-next-line max-statements -- Assignment routing handles scalar, aggregate, nullish, and compound stores together.
export function lowerAssignmentStatement(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!ts.isBinaryExpression(expression)) {
    return notApplicable;
  }

  if (expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionEqualsToken) {
    return lowerNullishAssignmentStatement(context, expression, bindings);
  }

  const compound = lowerCompoundAssignmentStatement(context, expression, bindings);
  if (compound.kind !== "notApplicable") {
    return compound;
  }

  if (expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken) {
    return notApplicable;
  }

  if (ts.isElementAccessExpression(expression.left)) {
    return lowerElementAssignment(context, expression.left, expression.right, bindings);
  }

  if (ts.isPropertyAccessExpression(expression.left)) {
    return lowerObjectPropertyAssignment(context, expression.left, expression.right, bindings);
  }

  if (!ts.isIdentifier(expression.left)) {
    return notApplicable;
  }

  const binding = bindings.get(expression.left.text);
  if (binding?.kind === "stringVariable") {
    const value = context.lowerStringRuntimeExpression(context, expression.right, bindings);
    if (value.kind !== "lowered") {
      return value;
    }

    return produced({ kind: "assignString", name: expression.left.text, value: value.operation });
  }

  if (binding?.kind === "booleanVariable") {
    const value = context.lowerConditionExpression(context, expression.right, bindings);
    if (value.kind !== "lowered") {
      return value;
    }

    return produced({ kind: "assignBoolean", name: expression.left.text, value: value.operation });
  }

  if (binding?.kind !== "number" || binding.value.kind !== "variable") {
    return notApplicable;
  }

  const value = context.lowerNumberExpression(context, expression.right, bindings);
  if (value.kind !== "lowered") {
    return value;
  }

  return produced({ kind: "assignNumber", name: expression.left.text, value: value.operation });
}

function lowerCompoundAssignmentStatement(
  context: LoweringContext,
  expression: ts.BinaryExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const operator = lowerCompoundAssignmentOperator(expression.operatorToken.kind);
  if (operator === undefined || !ts.isIdentifier(expression.left)) {
    return notApplicable;
  }
  const binding = bindings.get(expression.left.text);
  if (binding?.kind !== "number" || binding.value.kind !== "variable") {
    return notApplicable;
  }
  const right = context.lowerNumberExpression(context, expression.right, bindings);
  if (right.kind !== "lowered") {
    return right;
  }
  return produced({
    kind: "assignNumber",
    name: expression.left.text,
    value: { kind: "binary", operator, left: { kind: "variable", name: expression.left.text }, right: right.operation }
  });
}

function lowerCompoundAssignmentOperator(kind: ts.SyntaxKind): JsIrNumberOperator | undefined {
  switch (kind) {
    case ts.SyntaxKind.PlusEqualsToken: { return "add"; }
    case ts.SyntaxKind.MinusEqualsToken: { return "subtract"; }
    case ts.SyntaxKind.AsteriskEqualsToken: { return "multiply"; }
    case ts.SyntaxKind.SlashEqualsToken: { return "divide"; }
    case ts.SyntaxKind.PercentEqualsToken: { return "remainder"; }
    case ts.SyntaxKind.AmpersandEqualsToken: { return "bitAnd"; }
    case ts.SyntaxKind.BarEqualsToken: { return "bitOr"; }
    case ts.SyntaxKind.CaretEqualsToken: { return "bitXor"; }
    case ts.SyntaxKind.LessThanLessThanEqualsToken: { return "shiftLeft"; }
    case ts.SyntaxKind.GreaterThanGreaterThanEqualsToken: { return "shiftRight"; }
    case ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken: { return "shiftRightUnsigned"; }
    case ts.SyntaxKind.AsteriskAsteriskEqualsToken: { return "power"; }
    default: { return undefined; }
  }
}

function lowerNullishAssignmentStatement(
  context: LoweringContext,
  expression: ts.BinaryExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const currentValue = context.lowerValueExpression(context, expression.left, bindings);
  if (currentValue.kind !== "lowered") {
    return currentValue;
  }
  let store: Lowered;
  if (ts.isElementAccessExpression(expression.left)) {
    store = lowerElementAssignment(context, expression.left, expression.right, bindings);
  } else if (ts.isPropertyAccessExpression(expression.left)) {
    store = lowerObjectPropertyAssignment(context, expression.left, expression.right, bindings);
  } else {
    return notApplicable;
  }
  if (store.kind === "unsupported") {
    return store;
  }
  if (store.kind !== "lowered") {
    return notApplicable;
  }
  const condition: JsIrCondition = {
    kind: "or",
    left: { kind: "valueComparison", operator: "===", left: currentValue.operation, right: { kind: "null" } },
    right: { kind: "valueComparison", operator: "===", left: currentValue.operation, right: { kind: "undefined" } }
  };
  return produced({ kind: "if", condition, thenOperations: [store.operation], elseOperations: [] });
}

// eslint-disable-next-line complexity, max-statements -- Element assignment handles fixed, runtime, and boxed aggregate targets.
function lowerElementAssignment(
  context: LoweringContext,
  left: ts.ElementAccessExpression,
  right: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const objectAccess = lowerObjectAccessPath(left, bindings);
  if (objectAccess !== undefined) {
    const objectValue = context.lowerNumberExpression(context, right, bindings);
    if (objectValue.kind !== "lowered") {
      return objectValue;
    }
    return produced({ kind: "objectStore", objectName: objectAccess.objectName, path: objectAccess.path, value: objectValue.operation });
  }

  if (!ts.isIdentifier(left.expression)) {
    return notApplicable;
  }

  const arrayBinding = bindings.get(left.expression.text);
  if (
    (arrayBinding?.kind === "runtimeMap" || arrayBinding?.kind === "runtimeSet") &&
    lowerSymbolIteratorKeyExpression(left.argumentExpression, bindings) !== undefined
  ) {
    const iteratorMethod = context.lowerValueExpression(context, right, bindings);
    if (iteratorMethod.kind === "unsupported") {
      return iteratorMethod;
    }
    if (iteratorMethod.kind === "lowered") {
      return produced({ kind: "runtimeCollectionSetIterator", collectionName: arrayBinding.name, value: iteratorMethod.operation });
    }
  }
  const indexResult = context.lowerNumberExpression(context, left.argumentExpression, bindings);
  if (indexResult.kind === "unsupported") {
    return indexResult;
  }
  let index = loweredPayload(indexResult);
  if (arrayBinding?.kind === "runtimeArray" && index === undefined) {
    const stringIndex = lowerCanonicalArrayIndexString(left.argumentExpression);
    if (stringIndex !== undefined) {
      index = { kind: "literal", value: stringIndex };
    }
  }
  const valueResult = context.lowerNumberExpression(context, right, bindings);
  if (valueResult.kind === "unsupported") {
    return valueResult;
  }
  const value = loweredPayload(valueResult);
  if (arrayBinding?.kind === "array" && index !== undefined && value !== undefined) {
    return produced({ kind: "arrayStore", arrayName: left.expression.text, index, value });
  }

  const objectStore = lowerObjectElementAssignment(context, left, right, arrayBinding, bindings);
  if (objectStore.kind !== "notApplicable") {
    return objectStore;
  }

  const runtimeValueResult = context.lowerValueExpression(context, right, bindings);
  if (runtimeValueResult.kind === "unsupported") {
    return runtimeValueResult;
  }
  const runtimeValue = loweredPayload(runtimeValueResult);
  if (arrayBinding?.kind === "runtimeArray" && index !== undefined && runtimeValue !== undefined) {
    return produced({ kind: "runtimeArrayStore", arrayName: left.expression.text, index, value: runtimeValue });
  }
  if (arrayBinding?.kind === "runtimeArray" && runtimeValue !== undefined) {
    const key = lowerPropertyKeyExpression(context, left.argumentExpression, bindings);
    if (key.kind === "unsupported") {
      return key;
    }
    if (key.kind === "lowered") {
      return produced({ kind: "runtimeArrayNamedStore", arrayName: left.expression.text, key: key.operation, value: runtimeValue });
    }
  }
  if (isProvenBoxedAggregateBinding(arrayBinding) && runtimeValue !== undefined) {
    if (index !== undefined) {
      return produced({ kind: "valueArrayStore", targetName: left.expression.text, index, value: runtimeValue });
    }
    const key = lowerPropertyKeyExpression(context, left.argumentExpression, bindings);
    if (key.kind === "unsupported") {
      return key;
    }
    if (key.kind === "lowered") {
      return produced({ kind: "valueObjectStore", targetName: left.expression.text, key: key.operation, value: runtimeValue });
    }
  }

  return notApplicable;
}

function lowerObjectElementAssignment(
  context: LoweringContext,
  left: ts.ElementAccessExpression,
  right: ts.Expression,
  binding: JsIrBindingValue | undefined,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!ts.isIdentifier(left.expression)) {
    return notApplicable;
  }

  if (binding?.kind === "object") {
    const key = lowerStringExpression(left.argumentExpression, bindings);
    const objectValueResult = context.lowerNumberExpression(context, right, bindings);
    if (objectValueResult.kind === "unsupported") {
      return objectValueResult;
    }
    const objectValue = loweredPayload(objectValueResult);
    if (key !== undefined && objectValue !== undefined && objectPathExists(binding.value, [key])) {
      return produced({ kind: "objectStore", objectName: left.expression.text, path: [key], value: objectValue });
    }
    return notApplicable;
  }

  if (binding?.kind !== "runtimeObject") {
    return notApplicable;
  }

  const keyResult = lowerPropertyKeyExpression(context, left.argumentExpression, bindings);
  if (keyResult.kind === "unsupported") {
    return keyResult;
  }
  const key = loweredPayload(keyResult);
  const runtimeValueResult2 = context.lowerValueExpression(context, right, bindings);
  if (runtimeValueResult2.kind === "unsupported") {
    return runtimeValueResult2;
  }
  const runtimeValue = loweredPayload(runtimeValueResult2);
  if (key === undefined || runtimeValue === undefined) {
    return notApplicable;
  }
  return produced({ kind: "runtimeObjectStore", objectName: left.expression.text, key, value: runtimeValue });
}

// eslint-disable-next-line complexity, max-statements -- Property-assignment routing dispatches class, runtime, boxed, and fixed targets in one place.
function lowerObjectPropertyAssignment(
  context: LoweringContext,
  left: ts.PropertyAccessExpression,
  right: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const privateStore = lowerClassPrivateFieldStore(context, left, right, bindings);
  if (privateStore.kind !== "notApplicable") {
    return privateStore;
  }

  const thisStore = lowerThisPropertyAssignment(context, left, right, bindings);
  if (thisStore.kind !== "notApplicable") {
    return thisStore;
  }

  const classAssignment = lowerClassPropertyAssignment(context, left, right, bindings);
  if (classAssignment.kind !== "notApplicable") {
    return classAssignment;
  }

  if (ts.isIdentifier(left.expression)) {
    const binding = bindings.get(left.expression.text);
    if (binding?.kind === "runtimeArray" && left.name.text === "length") {
      const length = context.lowerNumberExpression(context, right, bindings);
      if (length.kind === "unsupported") {
        return length;
      }
      if (length.kind === "lowered") {
        return produced({ kind: "runtimeArraySetLength", arrayName: left.expression.text, length: length.operation });
      }
    }
    if (isProvenBoxedAggregateBinding(binding) && left.name.text === "length") {
      const length = context.lowerNumberExpression(context, right, bindings);
      if (length.kind === "unsupported") {
        return length;
      }
      if (length.kind === "lowered") {
        return produced({ kind: "valueArraySetLength", targetName: left.expression.text, length: length.operation });
      }
    }
    if (binding?.kind === "runtimeObject") {
      const value = context.lowerValueExpression(context, right, bindings);
      if (value.kind === "unsupported") {
        return value;
      }
      if (value.kind === "lowered") {
        return produced({ kind: "runtimeObjectStore", objectName: left.expression.text, key: { kind: "literal", value: left.name.text }, value: value.operation });
      }
    }
    if (isProvenBoxedAggregateBinding(binding)) {
      const value = context.lowerValueExpression(context, right, bindings);
      if (value.kind === "unsupported") {
        return value;
      }
      if (value.kind === "lowered") {
        return produced({ kind: "valueObjectStore", targetName: left.expression.text, key: { kind: "literal", value: left.name.text }, value: value.operation });
      }
    }
  }

  const access = lowerObjectAccessPath(left, bindings);
  const valueResult2 = context.lowerNumberExpression(context, right, bindings);
  if (valueResult2.kind === "unsupported") {
    return valueResult2;
  }
  const value = loweredPayload(valueResult2);
  if (access === undefined || value === undefined) {
    return notApplicable;
  }

  return produced({ kind: "objectStore", objectName: access.objectName, path: access.path, value });
}

function lowerThisPropertyAssignment(
  context: LoweringContext,
  left: ts.PropertyAccessExpression,
  right: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  // Object-literal methods and class methods both bind `this` as a valueVariable.
  if (left.expression.kind !== ts.SyntaxKind.ThisKeyword || bindings.get(CLASS_THIS_NAME)?.kind !== "valueVariable") {
    return notApplicable;
  }
  const value = context.lowerValueExpression(context, right, bindings);
  if (value.kind !== "lowered") {
    if (value.kind === "unsupported") {
      return value;
    }
    if (context.classThisInScope) {
      return unsupportedIn(`The value written to \`this.${left.name.text}\` is not an expression this build can evaluate`);
    }
    return notApplicable;
  }
  return produced({
    kind: "valueObjectStore",
    targetName: CLASS_THIS_NAME,
    key: { kind: "literal", value: left.name.text },
    value: value.operation
  });
}
