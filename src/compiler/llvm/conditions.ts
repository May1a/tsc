import { emitGeneratedJsCall } from "./completion.js";
import type { EmitContext, JsValue, NumberValue } from "./context.js";
import type { JsIrCondition } from "../ir/expressions.js";
import { jsValueTrue, legacyJsValue } from "./values.js";
import {
  emitRuntimeArrayPointer,
  emitRuntimeCollectionPointer,
  emitRuntimeObjectPointer
} from "./layout.js";
import { variablePointerName } from "./names.js";
import { emitArrayIndex } from "./numbers.js";
import { errorClassIds } from "./error-ids.js";

/**
 * The condition tier: one function per `JsIrCondition` shape.
 *
 * A condition produces a `double` 0/1 rather than an `i1`, because most of them come out of a runtime
 * comparison helper that returns a `double` and converting back would buy nothing. Only
 * `emitLogicalCondition` and `emitBooleanComparisonCondition` short-circuit, and both do it by
 * branching rather than by masking, so that the untaken side is not evaluated.
 *
 * The one structural fact worth naming: a condition is evaluated exactly once, at the point the
 * enclosing `if`/`while` needs it, and the result is bound to an SSA name that the branches share.
 * That is why there is no short-circuit protocol between a condition and its consumers — `&&` and `||`
 * inside the condition expression are themselves lowered to nested conditions by the value tier.
 */

export function emitNamedValueBinding(name: string, context: EmitContext): JsValue {
  const binding = context.bindings.get(name);
  if (binding?.kind === "value") {
    return context.emitValue(binding.value);
  }
  if (binding?.kind === "valueVariable") {
    return context.emitValue({ kind: "variable", name: binding.name });
  }
  throw new Error("Expected JSValue binding");
}
// eslint-disable-next-line max-statements -- Typed condition emission keeps specialized RegExp and class predicates beside numeric comparisons.
export function emitCondition(condition: JsIrCondition, context: EmitContext): NumberValue {
  if (condition.kind === "regexTest") {
    const regex = context.emitValue(condition.regex);
    const input = context.emitStringExpression(condition.input);
    const inputValue = `%regex.test.input.${context.callIndex}`;
    const call = emitGeneratedJsCall("regexTest", [`i64 ${regex.value}`, `i64 ${inputValue}`], context);
    const result = `%regex.test.${context.cmpIndex}`;
    context.cmpIndex += 1;
    return {
      lines: [
        ...regex.lines,
        `  call void @gcRootPush(i64 ${regex.value})`,
        ...input.lines,
        `  ${inputValue} = call i64 @valueBoxString(ptr ${input.value}, i64 ${input.length})`,
        ...call.lines,
        `  ${result} = icmp eq i64 ${call.value}, ${jsValueTrue}`
      ],
      value: result
    };
  }
  if (condition.kind === "classInstanceOf") {
    const value = context.emitValue(condition.value);
    const prototype = emitNamedValueBinding(condition.prototypeName, context);
    const prototypePointer = `%instanceof.prototype.${context.objectIndex}`;
    const result = `%cmp.${context.cmpIndex}`;
    context.objectIndex += 1;
    context.cmpIndex += 1;
    return {
      lines: [
        ...value.lines,
        ...prototype.lines,
        `  ${prototypePointer} = call ptr @valueObjectPtr(i64 ${prototype.value})`,
        `  ${result} = call i1 @jsInstanceOf(i64 ${value.value}, ptr ${prototypePointer})`
      ],
      value: result
    };
  }
  if (condition.kind === "errorInstanceOf") {
    const value = context.emitValue(condition.value);
    const index = context.cmpIndex;
    context.cmpIndex += 1;
    const classId = errorClassIds.get(condition.errorName) ?? 0;
    const tagged = `%instanceof.error.tagged.${index}`;
    const isObject = `%instanceof.error.is.object.${index}`;
    const objectPointer = `%instanceof.error.ptr.${index}`;
    const fallbackSlot = `%instanceof.error.fallback.${index}`;
    const classSlot = `%instanceof.error.slot.${index}`;
    const selectedSlot = `%instanceof.error.selected.${index}`;
    const classValue = `%instanceof.error.class.${index}`;
    const result = `%cmp.${index}`;
    // `instanceof Error` matches every built-in error class; subclasses match their own id.
    // The class slot is only readable on objects, so non-objects select a zeroed
    // fallback slot (class id 0 matches nothing) instead of branching.
    let comparison = `  ${result} = icmp eq i64 ${classValue}, ${classId}`;
    if (classId === 1) {
      comparison = `  ${result} = icmp ne i64 ${classValue}, 0`;
    }
    return {
      lines: [
        ...value.lines,
        `  ${tagged} = and i64 ${value.value}, ${legacyJsValue.tagMask()}`,
        `  ${isObject} = icmp eq i64 ${tagged}, ${legacyJsValue.referenceTag("object")}`,
        `  ${objectPointer} = call ptr @valueObjectPtr(i64 ${value.value})`,
        `  ${fallbackSlot} = alloca i64`,
        `  store i64 0, ptr ${fallbackSlot}`,
        `  ${classSlot} = getelementptr i8, ptr ${objectPointer}, i64 48`,
        `  ${selectedSlot} = select i1 ${isObject}, ptr ${classSlot}, ptr ${fallbackSlot}`,
        `  ${classValue} = load i64, ptr ${selectedSlot}`,
        comparison
      ],
      value: result
    };
  }
  if (condition.kind === "boolean") {
    return {
      lines: [],
      value: String(condition.value)
    };
  }

  if (condition.kind === "negate") {
    const inner = context.emitCondition(condition.condition);
    const index = context.cmpIndex;
    context.cmpIndex += 1;
    const name = `%cmp.${index}`;
    return {
      lines: [...inner.lines, `  ${name} = xor i1 ${inner.value}, true`],
      value: name
    };
  }

  if (condition.kind === "and" || condition.kind === "or") {
    return emitLogicalCondition(condition, context);
  }

  const runtime = emitRuntimeCondition(condition, context);
  if (runtime !== undefined) {
    return runtime;
  }

  if (condition.kind !== "numberComparison") {
    // Defensive; see the note at the end of emitValueExpression.
    throw new Error(`Unhandled JsIrCondition variant: ${condition.kind}`);
  }

  const index = context.cmpIndex;
  context.cmpIndex += 1;
  const name = `%cmp.${index}`;
  const left = context.emitNumberExpression(condition.left);
  const right = context.emitNumberExpression(condition.right);

  return {
    lines: [...left.lines, ...right.lines, `  ${name} = ${llvmComparisonInstruction(condition.operator)} double ${left.value}, ${right.value}`],
    value: name
  };
}
// eslint-disable-next-line complexity, max-statements -- Runtime condition dispatch is centralized while predicates are transitional.
export function emitRuntimeCondition(condition: JsIrCondition, context: EmitContext): NumberValue | undefined {
  if (condition.kind === "booleanVariable") {
    const index = context.boolIndex;
    context.boolIndex += 1;
    const name = `%bool.${index}`;
    return { lines: [`  ${name} = load i1, ptr ${variablePointerName(condition.name)}`], value: name };
  }

  if (condition.kind === "stringComparison") {
    return emitStringComparisonCondition(condition, context);
  }

  if (condition.kind === "booleanComparison") {
    return emitBooleanComparisonCondition(condition, context);
  }

  if (condition.kind === "valueComparison") {
    return emitValueComparisonCondition(condition, context);
  }

  if (condition.kind === "valueLooseComparison" || condition.kind === "valueRelationalComparison") {
    const left = context.emitValue(condition.left);
    const right = context.emitValue(condition.right);
    const index = context.cmpIndex;
    const name = `%cmp.${index}`;
    context.cmpIndex += 1;
    if (condition.kind === "valueLooseComparison") {
      const equals = `%value.eq.${index}`;
      let predicate = "eq";
      if (condition.operator === "!=") {
        predicate = "ne";
      }
      return { lines: [...left.lines, ...right.lines, `  ${equals} = call i1 @valueLooseEquals(i64 ${left.value}, i64 ${right.value})`, `  ${name} = icmp ${predicate} i1 ${equals}, true`], value: name };
    }
    return { lines: [...left.lines, ...right.lines, `  ${name} = call i1 @valueRelationalCompare(i64 ${left.value}, i64 ${right.value}, i64 ${valueComparisonOperatorCode(condition.operator)})`], value: name };
  }

  if (condition.kind === "runtimeObjectHas") {
    return emitRuntimeObjectHasCondition(condition, context);
  }

  if (condition.kind === "runtimeCollectionHas" || condition.kind === "runtimeCollectionDelete") {
    return emitRuntimeCollectionCondition(condition, context);
  }

  if (condition.kind === "runtimeCollectionIdentity") {
    const left = emitRuntimeCollectionPointer(condition.leftName, context);
    const right = emitRuntimeCollectionPointer(condition.rightName, context);
    const name = `%cmp.${context.cmpIndex}`;
    context.cmpIndex += 1;
    let predicate = "ne";
    if (condition.operator === "===") {
      predicate = "eq";
    }
    return { lines: [...left.lines, ...right.lines, `  ${name} = icmp ${predicate} ptr ${left.value}, ${right.value}`], value: name };
  }

  if (condition.kind === "runtimeArrayHas") {
    return emitRuntimeArrayHasCondition(condition, context);
  }

  if (condition.kind === "runtimeObjectState") {
    return emitRuntimeObjectStateCondition(condition, context);
  }

  if (condition.kind === "runtimeObjectPropertyIsEnumerable") {
    const object = emitRuntimeObjectPointer(condition.objectName, context);
    const key = context.emitStringExpression(condition.key);
    const name = `%cmp.${context.cmpIndex}`;
    context.cmpIndex += 1;
    return { lines: [...object.lines, ...key.lines, `  ${name} = call i1 @objectPropertyIsEnumerable(ptr ${object.value}, i64 ${key.length}, ptr ${key.value})`], value: name };
  }

  if (condition.kind === "runtimeArrayIsArray") {
    if (typeof condition.value === "boolean") {
      return { lines: [], value: String(condition.value) };
    }
    const value = context.emitValue(condition.value);
    const name = `%cmp.${context.cmpIndex}`;
    context.cmpIndex += 1;
    return { lines: [...value.lines, `  ${name} = call i1 @valueIsArray(i64 ${value.value})`], value: name };
  }

  if (condition.kind === "valueTruthy") {
    const value = context.emitValue(condition.value);
    const name = `%cmp.${context.cmpIndex}`;
    context.cmpIndex += 1;
    return { lines: [...value.lines, `  ${name} = call i1 @valueTruthy(i64 ${value.value})`], value: name };
  }

  if (condition.kind === "numberPredicate") {
    const value = context.emitValue(condition.value);
    const name = `%cmp.${context.cmpIndex}`;
    context.cmpIndex += 1;
    const helperByPredicate = {
      globalIsNaN: "globalIsNaN",
      numberIsNaN: "numberIsNaN",
      numberIsFinite: "numberIsFinite",
      numberIsInteger: "numberIsInteger",
      numberIsSafeInteger: "numberIsSafeInteger"
    } as const;
    const helper = helperByPredicate[condition.predicate];
    return { lines: [...value.lines, `  ${name} = call i1 @${helper}(i64 ${value.value})`], value: name };
  }

  if (condition.kind === "stringSearch") {
    const receiver = context.emitStringExpression(condition.receiver);
    const search = context.emitStringExpression(condition.search);
    const name = `%cmp.${context.cmpIndex}`;
    context.cmpIndex += 1;
    const helperByMethod: Record<typeof condition.method, "stringEndsWith" | "stringIncludes" | "stringStartsWith"> = {
      includes: "stringIncludes",
      startsWith: "stringStartsWith",
      endsWith: "stringEndsWith"
    };
    const helper = helperByMethod[condition.method];
    return { lines: [...receiver.lines, ...search.lines, `  ${name} = call i1 @${helper}(i64 ${receiver.length}, ptr ${receiver.value}, i64 ${search.length}, ptr ${search.value})`], value: name };
  }

  if (condition.kind === "runtimeArrayEvery" || condition.kind === "runtimeArraySome") {
    const array = emitRuntimeArrayPointer(condition.arrayName, context);
    const length = `%arr.len.${context.numIndex}`;
    context.numIndex += 1;
    const isEmpty = `%cmp.${context.cmpIndex}`;
    context.cmpIndex += 1;
    const lines = [...array.lines, `  ${length} = call i64 @arrayLength(ptr ${array.value})`, `  ${isEmpty} = icmp eq i64 ${length}, 0`];
    if (condition.kind === "runtimeArrayEvery") {
      return { lines, value: isEmpty };
    }
    return { lines, value: "false" };
  }

  if (condition.kind === "objectIs") {
    const left = context.emitValue(condition.left);
    const right = context.emitValue(condition.right);
    const name = `%cmp.${context.cmpIndex}`;
    context.cmpIndex += 1;
    return { lines: [...left.lines, ...right.lines, `  ${name} = call i1 @objectIs(i64 ${left.value}, i64 ${right.value})`], value: name };
  }

  return undefined;
}
export function emitRuntimeCollectionCondition(
  condition: Extract<JsIrCondition, { readonly kind: "runtimeCollectionHas" | "runtimeCollectionDelete" }>,
  context: EmitContext
): NumberValue {
  const collection = emitRuntimeCollectionPointer(condition.collectionName, context);
  const key = context.emitValue(condition.key);
  const name = `%cmp.${context.cmpIndex}`;
  context.cmpIndex += 1;
  let helper: "collectionDelete" | "collectionHas" = "collectionDelete";
  if (condition.kind === "runtimeCollectionHas") {
    helper = "collectionHas";
  }
  return { lines: [...collection.lines, ...key.lines, `  ${name} = call i1 @${helper}(ptr ${collection.value}, i64 ${key.value})`], value: name };
}
export function valueComparisonOperatorCode(operator: "==" | "!=" | "<" | "<=" | ">" | ">="): number {
  const lessThanCode = 0;
  const lessThanOrEqualCode = 1;
  const greaterThanCode = 2;
  const greaterThanOrEqualCode = 3;
  const looseEqualCode = 4;
  const looseNotEqualCode = 5;
  switch (operator) {
    case "<": {
      return lessThanCode;
    }
    case "<=": {
      return lessThanOrEqualCode;
    }
    case ">": {
      return greaterThanCode;
    }
    case ">=": {
      return greaterThanOrEqualCode;
    }
    case "==": {
      return looseEqualCode;
    }
    case "!=": {
      return looseNotEqualCode;
    }
    default: {
      const unsupported: never = operator;
      throw new Error(`Unsupported value comparison operator: ${String(unsupported)}`);
    }
  }
}
export function emitRuntimeObjectHasCondition(
  condition: Extract<JsIrCondition, { readonly kind: "runtimeObjectHas" }>,
  context: EmitContext
): NumberValue {
  let object = emitRuntimeObjectPointer(condition.objectName, context);
  if (condition.receiverKind === "value") {
    object = emitNamedValueBinding(condition.objectName, context);
  }
  const key = context.emitStringExpression(condition.key);
  const index = context.cmpIndex;
  context.cmpIndex += 1;
  const name = `%cmp.${index}`;
  if (condition.receiverKind === "value") {
    return { lines: [...object.lines, ...key.lines, `  ${name} = call i1 @valueObjectHasOwn(i64 ${object.value}, i64 ${key.length}, ptr ${key.value})`], value: name };
  }
  let helper: "objectHasOwn" | "objectHas" = "objectHas";
  if (condition.ownOnly) {
    helper = "objectHasOwn";
  }
  return { lines: [...object.lines, ...key.lines, `  ${name} = call i1 @${helper}(ptr ${object.value}, i64 ${key.length}, ptr ${key.value})`], value: name };
}
export function emitRuntimeArrayHasCondition(
  condition: Extract<JsIrCondition, { readonly kind: "runtimeArrayHas" }>,
  context: EmitContext
): NumberValue {
  const array = emitRuntimeArrayPointer(condition.arrayName, context);
  const index = emitArrayIndex(condition.index, context);
  const { cmpIndex } = context;
  context.cmpIndex += 1;
  const name = `%cmp.${cmpIndex}`;
  if (condition.ownOnly && condition.key === undefined) {
    return { lines: [...array.lines, ...index.lines, `  ${name} = call i1 @arrayHasOwnIndex(ptr ${array.value}, i64 ${index.value})`], value: name };
  }
  if (condition.key === undefined) {
    return { lines: [...array.lines, ...index.lines, `  ${name} = call i1 @arrayHasOwnIndex(ptr ${array.value}, i64 ${index.value})`], value: name };
  }
  const key = context.emitStringExpression(condition.key);
  if (condition.ownOnly) {
    const propertiesSlot = `%arr.props.slot.${context.objectIndex}`;
    const properties = `%arr.props.${context.objectIndex}`;
    context.objectIndex += 1;
    return {
      lines: [
        ...array.lines,
        ...key.lines,
        `  ${propertiesSlot} = getelementptr i8, ptr ${array.value}, i64 32`,
        `  ${properties} = load ptr, ptr ${propertiesSlot}`,
        `  ${name} = call i1 @objectHasOwn(ptr ${properties}, i64 ${key.length}, ptr ${key.value})`
      ],
      value: name
    };
  }
  return { lines: [...array.lines, ...index.lines, ...key.lines, `  ${name} = call i1 @arrayHas(ptr ${array.value}, i64 ${index.value}, i64 ${key.length}, ptr ${key.value})`], value: name };
}
export function emitRuntimeObjectStateCondition(
  condition: Extract<JsIrCondition, { readonly kind: "runtimeObjectState" }>,
  context: EmitContext
): NumberValue {
  const object = emitRuntimeObjectPointer(condition.objectName, context);
  const helperByState = {
    isExtensible: "objectIsExtensible",
    isSealed: "objectIsSealed",
    isFrozen: "objectIsFrozen"
  } as const;
  const helper = helperByState[condition.state];
  const index = context.cmpIndex;
  context.cmpIndex += 1;
  const name = `%cmp.${index}`;
  return { lines: [...object.lines, `  ${name} = call i1 @${helper}(ptr ${object.value})`], value: name };
}
export function emitStringComparisonCondition(
  condition: Extract<JsIrCondition, { readonly kind: "stringComparison" }>,
  context: EmitContext
): NumberValue {
  const index = context.cmpIndex;
  context.cmpIndex += 1;
  const name = `%cmp.${index}`;
  const left = context.emitStringExpression(condition.left);
  const right = context.emitStringExpression(condition.right);
  const equals = `%str.eq.${index}`;
  let resultLine = `  ${name} = icmp eq i1 ${equals}, true`;
  if (condition.operator === "!==") {
    resultLine = `  ${name} = icmp ne i1 ${equals}, true`;
  }
  return {
    lines: [
      ...left.lines,
      ...right.lines,
      `  ${equals} = call i1 @strEquals(i64 ${left.length}, ptr ${left.value}, i64 ${right.length}, ptr ${right.value})`,
      resultLine
    ],
    value: name
  };
}
export function emitBooleanComparisonCondition(
  condition: Extract<JsIrCondition, { readonly kind: "booleanComparison" }>,
  context: EmitContext
): NumberValue {
  const index = context.cmpIndex;
  context.cmpIndex += 1;
  const name = `%cmp.${index}`;
  const left = context.emitCondition(condition.left);
  const right = context.emitCondition(condition.right);
  let predicate = "eq";
  if (condition.operator === "!==") {
    predicate = "ne";
  }
  return { lines: [...left.lines, ...right.lines, `  ${name} = icmp ${predicate} i1 ${left.value}, ${right.value}`], value: name };
}
export function emitValueComparisonCondition(
  condition: Extract<JsIrCondition, { readonly kind: "valueComparison" }>,
  context: EmitContext
): NumberValue {
  const index = context.cmpIndex;
  context.cmpIndex += 1;
  const left = context.emitValue(condition.left);
  const right = context.emitValue(condition.right);
  const equals = `%value.eq.${index}`;
  const name = `%cmp.${index}`;
  let predicate = "eq";
  if (condition.operator === "!==") {
    predicate = "ne";
  }
  return {
    lines: [
      ...left.lines,
      ...right.lines,
      `  ${equals} = call i1 @valueStrictEquals(i64 ${left.value}, i64 ${right.value})`,
      `  ${name} = icmp ${predicate} i1 ${equals}, true`
    ],
    value: name
  };
}
export function emitLogicalCondition(
  condition: Extract<JsIrCondition, { readonly kind: "and" | "or" }>,
  context: EmitContext
): NumberValue {
  const index = context.logicIndex;
  context.logicIndex += 1;
  const leftLabel = `logic.left.${index}`;
  const leftJoinLabel = `logic.left.join.${index}`;
  const rightJoinLabel = `logic.rhs.join.${index}`;
  const rhsLabel = `logic.rhs.${index}`;
  const endLabel = `logic.end.${index}`;
  const left = context.emitCondition(condition.left);
  const right = context.emitCondition(condition.right);
  const value = `%logic.${index}`;
  let shortCircuitValue = "true";
  let leftTrueLabel = endLabel;
  let leftFalseLabel = rhsLabel;
  if (condition.kind === "and") {
    shortCircuitValue = "false";
    leftTrueLabel = rhsLabel;
    leftFalseLabel = endLabel;
  }

  return {
    lines: [
      `  br label %${leftLabel}`,
      `${leftLabel}:`,
      ...left.lines,
      `  br label %${leftJoinLabel}`,
      `${leftJoinLabel}:`,
      `  br i1 ${left.value}, label %${leftTrueLabel}, label %${leftFalseLabel}`,
      `${rhsLabel}:`,
      ...right.lines,
      `  br label %${rightJoinLabel}`,
      `${rightJoinLabel}:`,
      `  br label %${endLabel}`,
      `${endLabel}:`,
      `  ${value} = phi i1 [ ${shortCircuitValue}, %${leftJoinLabel} ], [ ${right.value}, %${rightJoinLabel} ]`
    ],
    value
  };
}
export function llvmComparisonInstruction(operator: "===" | "!==" | "<" | "<=" | ">" | ">="): string {
  switch (operator) {
    case "===": {
      return "fcmp oeq";
    }
    case "!==": {
      return "fcmp one";
    }
    case "<": {
      return "fcmp olt";
    }
    case "<=": {
      return "fcmp ole";
    }
    case ">": {
      return "fcmp ogt";
    }
    case ">=": {
      return "fcmp oge";
    }
    default: {
      const unsupported: never = operator;
      throw new Error(`Unsupported comparison operator: ${String(unsupported)}`);
    }
  }
}
