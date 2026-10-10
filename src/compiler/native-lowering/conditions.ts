import type { ResolvedCondition } from "../binding-resolution/index.js";
import { type VariantHandlers, type VariantOfKind, dispatchKind } from "../dispatch.js";
import { type LlvmValue, llvm } from "../llvm-ir/index.js";
import { branchValue } from "./expression-branches.js";
import { type ExpressionContext, boxString } from "./expression-context.js";
import { errorClassId } from "./error-classes.js";
import { numberIndex } from "./numbers.js";

type ConditionNode<K extends ResolvedCondition["kind"]> = VariantOfKind<ResolvedCondition, K>;
type ConditionVariants = { readonly [K in ResolvedCondition["kind"]]: ConditionNode<K> };
type BooleanValue = LlvmValue<typeof llvm.i1>;

const numberPredicates = { "===": "oeq", "!==": "une", "<": "olt", "<=": "ole", ">": "ogt", ">=": "oge" } as const;
const relationalCodes = { "<": 0n, "<=": 1n, ">": 2n, ">=": 3n, "==": 4n, "!=": 5n } as const;
const predicateHelpers = {
  globalIsNaN: "globalIsNaN", numberIsNaN: "numberIsNaN", numberIsFinite: "numberIsFinite",
  numberIsInteger: "numberIsInteger", numberIsSafeInteger: "numberIsSafeInteger"
} as const;
const searchHelpers = { includes: "stringIncludes", startsWith: "stringStartsWith", endsWith: "stringEndsWith" } as const;
const stateHelpers = { isExtensible: "objectIsExtensible", isSealed: "objectIsSealed", isFrozen: "objectIsFrozen" } as const;
const comparisonHelpers = { objectIs: "objectIs", valueComparison: "valueStrictEquals", valueLooseComparison: "valueLooseEquals" } as const;

function negate(value: BooleanValue, context: ExpressionContext): BooleanValue {
  const block = context.cursor.currentBlock();
  return block.xor(value, block.int(llvm.i1, 1n), context.cursor.uniqueName("condition.negate"));
}

function logical(condition: ConditionNode<"and" | "or">, context: ExpressionContext): BooleanValue {
  const left = context.expressions.condition(condition.left);
  const right = () => context.expressions.condition(condition.right);
  const short = () => context.cursor.currentBlock().int(llvm.i1, condition.kind === "or" ? 1n : 0n);
  return branchValue(context.cursor, left, llvm.i1, condition.kind === "and" ? right : short,
    condition.kind === "and" ? short : right, "condition.logical");
}

function compareValues(
  condition: ConditionNode<"valueComparison" | "valueLooseComparison" | "valueRelationalComparison" | "objectIs">,
  context: ExpressionContext
): BooleanValue {
  const left = context.expressions.value(condition.left);
  context.roots.push(left);
  const right = context.expressions.value(condition.right);
  if (condition.kind === "valueRelationalComparison") {
    return context.runtime.call("valueRelationalCompare", [left, right,
      context.cursor.currentBlock().int(llvm.i64, relationalCodes[condition.operator])], context.cursor.uniqueName("condition.compare"));
  }
  const helper = comparisonHelpers[condition.kind];
  const result = context.runtime.call(helper, [left, right], context.cursor.uniqueName("condition.compare"));
  return condition.kind !== "objectIs" && (condition.operator === "!==" || condition.operator === "!=") ? negate(result, context) : result;
}

function errorInstance(condition: ConditionNode<"errorInstanceOf">, context: ExpressionContext): BooleanValue {
  const value = context.expressions.value(condition.value);
  context.roots.push(value);
  const object = context.values.forBlock(context.cursor.currentBlock()).isReference(value, "object");
  return branchValue(context.cursor, object, llvm.i1, () => {
    const block = context.cursor.currentBlock();
    const pointer = context.values.forBlock(block).unboxReference(value);
    const field = block.gepBytes(pointer, block.int(llvm.i64, 48n), context.cursor.uniqueName("error.class.slot"));
    const classId = block.load(llvm.i64, field, context.cursor.uniqueName("error.class"));
    const expected = errorClassId(condition.errorName);
    return block.icmp(expected === 1 ? "ne" : "eq", classId, block.int(llvm.i64, expected === 1 ? 0n : BigInt(expected)),
      context.cursor.uniqueName("condition.instanceof"));
  }, () => context.cursor.currentBlock().int(llvm.i1, 0n), "error.instanceof");
}

function arrayHas(condition: ConditionNode<"runtimeArrayHas">, context: ExpressionContext): BooleanValue {
  const array = context.bindings.pointer(condition.arrayName);
  const index = numberIndex(condition.index, context);
  if (condition.key === undefined) {
    return context.runtime.call("arrayHasOwnIndex", [array, index], context.cursor.uniqueName("array.has"));
  }
  const key = context.expressions.string(condition.key);
  if (condition.ownOnly) {
    const block = context.cursor.currentBlock();
    const propertiesSlot = block.gepBytes(array, block.int(llvm.i64, 32n), context.cursor.uniqueName("array.properties.slot"));
    const properties = block.load(llvm.ptr, propertiesSlot, context.cursor.uniqueName("array.properties"));
    return context.runtime.call("objectHasOwn", [properties, key.length, key.bytes], context.cursor.uniqueName("array.has"));
  }
  return context.runtime.call("arrayHas", [array, index, key.length, key.bytes], context.cursor.uniqueName("array.has"));
}

const handlers: VariantHandlers<ConditionVariants, ExpressionContext, BooleanValue> = {
  boolean: (condition, context) => context.cursor.currentBlock().int(llvm.i1, condition.value ? 1n : 0n),
  booleanVariable: (condition, context) => context.bindings.boolean(condition.name),
  negate: (condition, context) => negate(context.expressions.condition(condition.condition), context),
  and: logical, or: logical,
  numberComparison: (condition, context) => {
    const left = context.expressions.number(condition.left);
    const right = context.expressions.number(condition.right);
    return context.cursor.currentBlock().fcmp(numberPredicates[condition.operator], left, right, context.cursor.uniqueName("condition.number"));
  },
  booleanComparison: (condition, context) => {
    const left = context.expressions.condition(condition.left);
    const right = context.expressions.condition(condition.right);
    return context.cursor.currentBlock().icmp(condition.operator === "===" ? "eq" : "ne", left, right, context.cursor.uniqueName("condition.boolean"));
  },
  stringComparison: (condition, context) => {
    const left = context.expressions.string(condition.left);
    boxString(left, context);
    const right = context.expressions.string(condition.right);
    const result = context.runtime.call("strEquals", [left.length, left.bytes, right.length, right.bytes], context.cursor.uniqueName("condition.string"));
    return condition.operator === "!==" ? negate(result, context) : result;
  },
  valueComparison: compareValues, valueLooseComparison: compareValues, valueRelationalComparison: compareValues, objectIs: compareValues,
  valueTruthy: (condition, context) => context.runtime.call("valueTruthy", [context.expressions.value(condition.value)], context.cursor.uniqueName("condition.truthy")),
  classInstanceOf: (condition, context) => {
    const value = context.expressions.value(condition.value);
    context.roots.push(value);
    const prototype = context.bindings.pointer(condition.prototypeName);
    return context.runtime.call("jsInstanceOf", [value, prototype], context.cursor.uniqueName("condition.instanceof"));
  },
  errorInstanceOf: errorInstance,
  regexTest: (condition, context) => {
    const regex = context.expressions.value(condition.regex);
    context.roots.push(regex);
    const input = boxString(context.expressions.string(condition.input), context);
    const result = context.runtime.callWithCompletion("regexTest", [regex, input], context.cursor.uniqueName("regex.test"), context.exceptionTarget());
    return context.runtime.call("valueTruthy", [result], context.cursor.uniqueName("condition.regex"));
  },
  numberPredicate: (condition, context) => context.runtime.call(predicateHelpers[condition.predicate],
    [context.expressions.value(condition.value)], context.cursor.uniqueName("condition.number")),
  runtimeArrayIsArray: (condition, context) => typeof condition.value === "boolean"
    ? context.cursor.currentBlock().int(llvm.i1, condition.value ? 1n : 0n)
    : context.runtime.call("valueIsArray", [context.expressions.value(condition.value)], context.cursor.uniqueName("condition.array")),
  runtimeObjectHas: (condition, context) => {
    const receiver = context.bindings.value(condition.objectName);
    context.roots.push(receiver);
    const key = context.expressions.string(condition.key);
    if (condition.ownOnly || condition.receiverKind === "value") {
      return context.runtime.call("valueObjectHasOwn", [receiver, key.length, key.bytes], context.cursor.uniqueName("object.has.own"));
    }
    return branchValue(context.cursor, context.runtime.call("valueIsFunction", [receiver], context.cursor.uniqueName("object.is.function")), llvm.i1,
      () => context.runtime.call("functionObjectHasOwn", [receiver, key.length, key.bytes], context.cursor.uniqueName("function.has")),
      () => {
        const pointer = context.runtime.callPointer("valueObjectPtr", [receiver], context.cursor.uniqueName("object.pointer"));
        return context.runtime.call("objectHas", [pointer, key.length, key.bytes], context.cursor.uniqueName("object.has"));
      }, "object.has");
  },
  runtimeArrayHas: arrayHas,
  runtimeObjectPropertyIsEnumerable: (condition, context) => {
    const object = context.bindings.pointer(condition.objectName);
    const key = context.expressions.string(condition.key);
    return context.runtime.call("objectPropertyIsEnumerable", [object, key.length, key.bytes], context.cursor.uniqueName("object.enumerable"));
  },
  runtimeObjectState: (condition, context) => context.runtime.call(stateHelpers[condition.state],
    [context.bindings.pointer(condition.objectName)], context.cursor.uniqueName("object.state")),
  runtimeArrayEvery: (condition, context) => {
    const length = context.runtime.call("arrayLength", [context.bindings.pointer(condition.arrayName)], context.cursor.uniqueName("array.length"));
    return context.cursor.currentBlock().icmp("eq", length, context.cursor.currentBlock().int(llvm.i64, 0n), context.cursor.uniqueName("array.empty"));
  },
  runtimeArraySome: (_condition, context) => context.cursor.currentBlock().int(llvm.i1, 0n),
  runtimeCollectionHas: (condition, context) => {
    const collection = context.bindings.pointer(condition.collectionName);
    return context.runtime.call("collectionHas", [collection, context.expressions.value(condition.key)], context.cursor.uniqueName("collection.has"));
  },
  runtimeCollectionDelete: (condition, context) => {
    const collection = context.bindings.pointer(condition.collectionName);
    return context.runtime.call("collectionDelete", [collection, context.expressions.value(condition.key)], context.cursor.uniqueName("collection.delete"));
  },
  runtimeCollectionIdentity: (condition, context) => {
    const left = context.bindings.pointer(condition.leftName);
    const right = context.bindings.pointer(condition.rightName);
    const block = context.cursor.currentBlock();
    const a = block.ptrToInt(left, llvm.i64, context.cursor.uniqueName("collection.left"));
    const b = block.ptrToInt(right, llvm.i64, context.cursor.uniqueName("collection.right"));
    return block.icmp(condition.operator === "===" ? "eq" : "ne", a, b, context.cursor.uniqueName("collection.identity"));
  },
  stringSearch: (condition, context) => {
    const receiver = context.expressions.string(condition.receiver);
    boxString(receiver, context);
    const search = context.expressions.string(condition.search);
    return context.runtime.call(searchHelpers[condition.method], [receiver.length, receiver.bytes, search.length, search.bytes],
      context.cursor.uniqueName("string.search"));
  }
};

export function lowerCondition(condition: ResolvedCondition, context: ExpressionContext): BooleanValue {
  return dispatchKind(handlers, condition, context);
}
