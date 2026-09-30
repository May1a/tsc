import type { JsIrCallArgument, JsIrFunctionObjectDefinition } from "./bindings.js";
import type { JsIrOperation } from "./types.js";

/**
 * The expression tiers of the IR: values, conditions, numbers and strings.
 *
 * They are separate unions because the lowering pass proves a static type at each of those
 * positions, which lets emission use a narrower runtime ABI than the general value tier. Every
 * variant here names something the emitter has to handle, and the emitter tier is still an
 * `if` chain, so totality over this file is a property of that chain and not a compile error.
 */
export type JsIrNumberOperator = "add" | "subtract" | "multiply" | "divide" | "remainder" | "bitAnd" | "bitOr" | "bitXor" | "shiftLeft" | "shiftRight" | "shiftRightUnsigned" | "power";
export type JsIrValueComparisonOperator = "==" | "!=" | "<" | "<=" | ">" | ">=";

export type JsIrValueExpression =
  | {
      readonly kind: "number";
      readonly value: JsIrNumberExpression;
    }
  | {
      readonly kind: "boolean";
      readonly value: JsIrCondition;
    }
  | {
      readonly kind: "undefined";
    }
  | {
      readonly kind: "null";
    }
  | {
      readonly kind: "string";
      readonly value: JsIrStringExpression;
    }
  | {
      readonly kind: "variable";
      readonly name: string;
    }
  | {
      readonly kind: "call";
      readonly name: string;
      readonly arguments: readonly JsIrCallArgument[];
    }
  | {
      readonly kind: "callValue";
      readonly callee: JsIrValueExpression;
      readonly arguments: readonly JsIrCallArgument[];
      readonly thisValue?: JsIrValueExpression;
      readonly methodReceiver?: JsIrValueExpression;
      readonly methodKey?: JsIrStringExpression;
      readonly spreadArguments?: readonly JsIrRuntimeArrayElement[];
      /**
       * An ECMAScript optional call, `callee?.(...)`. The callee is still evaluated, but a
       * nullish one skips the call and yields `undefined` instead of dispatching on it.
       */
      readonly optionalCallee?: true;
    }
  | {
      readonly kind: "functionObject";
      readonly definition: JsIrFunctionObjectDefinition;
    }
  | {
      readonly kind: "regexCompile";
      readonly pattern: JsIrStringExpression;
      readonly flags: JsIrStringExpression;
    }
  | {
      readonly kind: "regexExec";
      readonly regex: JsIrValueExpression;
      readonly input: JsIrStringExpression;
    }
  | {
      readonly kind: "regexMatch";
      readonly regex: JsIrValueExpression;
      readonly input: JsIrStringExpression;
    }
  | {
      readonly kind: "inlineCppValue";
      readonly symbol: string;
    }
  | {
      readonly kind: "ternary";
      readonly condition: JsIrCondition;
      readonly consequent: JsIrValueExpression;
      readonly alternate: JsIrValueExpression;
    }
  | {
      readonly kind: "lazyDefault";
      readonly value: JsIrValueExpression;
      readonly defaultValue: JsIrValueExpression;
    }
  | {
      readonly kind: "arrayAccess";
      readonly arrayName: string;
      readonly index: JsIrNumberExpression;
      readonly key?: JsIrStringExpression;
    }
  | {
      readonly kind: "arrayPop" | "arrayShift";
      readonly arrayName: string;
    }
  | {
      readonly kind: "arrayIncludes";
      readonly arrayName: string;
      readonly value: JsIrValueExpression;
    }
  | {
      readonly kind: "arrayAt";
      readonly arrayName: string;
      readonly index: JsIrNumberExpression;
    }
  | {
      readonly kind: "valuePlus";
      readonly left: JsIrValueExpression;
      readonly right: JsIrValueExpression;
    }
  | {
      readonly kind: "logicalValue";
      readonly operator: "&&" | "||";
      readonly left: JsIrValueExpression;
      readonly right: JsIrValueExpression;
    }
  | {
      readonly kind: "arrayFind" | "arrayForEach";
      readonly arrayName: string;
    }
  | {
      readonly kind: "objectRef" | "arrayRef";
      readonly name: string;
    }
  | {
      readonly kind: "objectLiteralValue";
      readonly value: JsIrRuntimeObjectValue;
    }
  | {
      readonly kind: "objectDynamicAccess";
      readonly objectName: string;
      readonly key: JsIrStringExpression;
    }
  | {
      readonly kind: "valueObjectDynamicAccess";
      readonly value: JsIrValueExpression;
      readonly key: JsIrStringExpression;
    }
  | {
      // Read of a private class field (`recv.#x`): brand-checks the receiver's
      // own properties for the class-mangled storage key and throws the given
      // TypeError message when the brand is absent.
      readonly kind: "privateFieldAccess";
      readonly receiver: JsIrValueExpression;
      readonly key: string;
      readonly message: string;
    }
  | {
      readonly kind: "valueArrayAccess";
      readonly value: JsIrValueExpression;
      readonly index: JsIrNumberExpression;
      readonly key: JsIrStringExpression;
    }
  | {
      readonly kind: "nullishCoalesce";
      readonly left: JsIrValueExpression;
      readonly right: JsIrValueExpression;
    }
  | {
      readonly kind: "jsonStringify";
      readonly value: JsIrValueExpression;
      readonly replacerName?: string;
      readonly indent: number;
    }
  | {
      readonly kind: "jsonParse";
      readonly text: JsIrValueExpression;
      readonly reviver?: JsIrValueExpression;
    }
  | {
      readonly kind: "runtimeMapGet";
      readonly mapName: string;
      readonly key: JsIrValueExpression;
    }
  | {
      readonly kind: "optionalChain";
      readonly guard: JsIrValueExpression;
      readonly access: JsIrValueExpression;
    }
  | {
      readonly kind: "optionalTarget";
    }
  | {
      readonly kind: "void";
      readonly expression: JsIrValueExpression;
    }
  | {
      readonly kind: "sequence";
      readonly left: JsIrValueExpression;
      readonly right: JsIrValueExpression;
    }
  | {
      readonly kind: "stringStartsWith" | "stringEndsWith";
      readonly receiver: JsIrStringExpression;
      readonly search: JsIrStringExpression;
      readonly position?: JsIrNumberExpression;
    }
  | {
      readonly kind: "stringCharCodeAt" | "stringCodePointAt" | "stringLocaleCompare";
      readonly receiver: JsIrStringExpression;
      readonly index: JsIrNumberExpression;
      readonly other?: JsIrStringExpression;
    }
  | {
      readonly kind: "stringIndexOf" | "stringLastIndexOf";
      readonly receiver: JsIrStringExpression;
      readonly search: JsIrStringExpression;
      readonly position?: JsIrNumberExpression;
    }
  | {
      readonly kind: "runtimeArrayValue";
      readonly elements: readonly JsIrValueExpression[];
    }
  | {
      readonly kind: "taggedTemplateValue";
      readonly tag: string;
      readonly head: string;
      readonly middleTexts: readonly string[];
      readonly expressions: readonly JsIrValueExpression[];
      readonly wrapValuesInRest?: boolean;
    }
  | {
      readonly kind: "boxedPrimitive";
      readonly inner: JsIrValueExpression;
      readonly storeLength?: boolean;
    }
  | {
      readonly kind: "boxedMethodCall";
      readonly receiver: JsIrValueExpression;
      readonly method: "valueOf" | "toString";
    }
  | {
      readonly kind: "newInstance";
      readonly className: string;
      readonly fieldCount: number;
      readonly prototypeName: string;
      readonly constructorName: string;
      readonly arguments: readonly JsIrCallArgument[];
    };

export type JsIrRuntimeArrayElement =
  | {
      readonly kind: "hole";
    }
  | {
      readonly kind: "value";
      readonly value: JsIrValueExpression;
    }
  | {
      readonly kind: "spread";
      readonly arrayName: string;
      readonly sourceKind?: "runtime" | "fixed";
    }
  | {
      readonly kind: "iterableSpread";
      readonly source: JsIrValueExpression;
      readonly notIterableMessage: string;
    };

export type JsIrArrayDestructureElement =
  | { readonly kind: "elision" }
  | { readonly kind: "binding"; readonly name: string; readonly defaultValue?: JsIrValueExpression }
  | { readonly kind: "nested"; readonly temporaryName: string; readonly operations: readonly JsIrOperation[] }
  | { readonly kind: "rest"; readonly name: string };

export type JsIrNumberExpression =
  | {
      readonly kind: "regexSearch";
      readonly regex: JsIrValueExpression;
      readonly input: JsIrStringExpression;
    }
  | {
      readonly kind: "literal";
      readonly value: number;
    }
  | {
      readonly kind: "nan";
    }
  | {
      readonly kind: "negatedZero";
    }
  | {
      readonly kind: "unary";
      readonly operator: "negate" | "bitNot";
      readonly value: JsIrNumberExpression;
    }
  | {
      readonly kind: "update";
      readonly name: string;
      readonly operator: "increment" | "decrement";
      readonly prefix: boolean;
    }
  | {
      readonly kind: "binary";
      readonly operator: JsIrNumberOperator;
      readonly left: JsIrNumberExpression;
      readonly right: JsIrNumberExpression;
    }
  | {
      readonly kind: "parameter";
      readonly name: string;
    }
  | {
      readonly kind: "variable";
      readonly name: string;
    }
  | {
      readonly kind: "call";
      readonly name: string;
      readonly arguments: readonly JsIrNumberExpression[];
    }
  | {
      readonly kind: "ternary";
      readonly condition: JsIrCondition;
      readonly consequent: JsIrNumberExpression;
      readonly alternate: JsIrNumberExpression;
    }
  | {
      readonly kind: "arrayAccess";
      readonly arrayName: string;
      readonly index: JsIrNumberExpression;
    }
  | {
      readonly kind: "arrayLength";
      readonly arrayName: string;
    }
  | {
      readonly kind: "valueArrayLength";
      readonly value: JsIrValueExpression;
    }
  | {
      readonly kind: "valueLength";
      readonly value: JsIrValueExpression;
    }
  | {
      readonly kind: "valueObjectLength";
      readonly value: JsIrValueExpression;
    }
  | {
      readonly kind: "arrayPush" | "arrayUnshift";
      readonly arrayName: string;
      readonly values: readonly JsIrValueExpression[];
    }
  | {
      readonly kind: "arrayIndexOf";
      readonly arrayName: string;
      readonly value: JsIrValueExpression;
      readonly fromEnd?: boolean;
      readonly fromIndex?: JsIrNumberExpression;
    }
  | {
      readonly kind: "arrayFindIndex";
      readonly arrayName: string;
    }
  | {
      readonly kind: "runtimeCollectionSize";
      readonly collectionName: string;
    }
  | {
      readonly kind: "objectAccess";
      readonly objectName: string;
      readonly path: readonly string[];
    }
  | {
      readonly kind: "valueToNumber";
      readonly value: JsIrValueExpression;
    }
  | {
      readonly kind: "mathCall";
      readonly method:
        | "abs"
        | "floor"
        | "ceil"
        | "trunc"
        | "round"
        | "sqrt"
        | "cbrt"
        | "pow"
        | "exp"
        | "log"
        | "log2"
        | "log10"
        | "hypot"
        | "min"
        | "max"
        | "random"
        | "fround"
        | "clz32"
        | "imul"
        | "sin"
        | "cos"
        | "tan"
        | "sign";
      readonly arguments: readonly JsIrNumberExpression[];
    }
  | {
      readonly kind: "parseInt" | "parseFloat";
      readonly value: JsIrStringExpression;
    };

export type JsIrStringExpression =
  | {
      readonly kind: "literal";
      readonly value: string;
    }
  | {
      readonly kind: "variable";
      readonly name: string;
    }
  | {
      readonly kind: "ternary";
      readonly condition: JsIrCondition;
      readonly consequent: JsIrStringExpression;
      readonly alternate: JsIrStringExpression;
    }
  | {
      readonly kind: "concat";
      readonly left: JsIrStringExpression;
      readonly right: JsIrStringExpression;
    }
  | {
      readonly kind: "call";
      readonly name: string;
      readonly arguments: readonly JsIrCallArgument[];
    }
  | {
      readonly kind: "arrayJoin";
      readonly arrayName: string;
      readonly separator: JsIrStringExpression;
    }
  | {
      readonly kind: "typeof";
      readonly value: string;
    }
  | {
      readonly kind: "stringConversion";
      readonly value: JsIrValueExpression;
    }
  | {
      readonly kind: "stringMethod";
      readonly method: "trim" | "trimStart" | "trimEnd" | "toUpperCase" | "toLowerCase" | "repeat" | "replace" | "replaceAll" | "padStart" | "padEnd" | "at" | "charAt" | "slice" | "substring" | "substr" | "normalize";
      readonly receiver: JsIrStringExpression;
      readonly count?: JsIrNumberExpression;
      readonly search?: JsIrStringExpression;
      readonly replacement?: JsIrStringExpression;
      readonly targetLength?: JsIrNumberExpression;
      readonly padString?: JsIrStringExpression;
      readonly position?: JsIrNumberExpression;
      readonly start?: JsIrNumberExpression;
      readonly end?: JsIrNumberExpression;
    }
  | {
      readonly kind: "stringFromCharCode";
      readonly codes: readonly JsIrNumberExpression[];
    }
  | {
      readonly kind: "taggedTemplate";
      readonly tag: string;
      readonly head: string;
      readonly middleTexts: readonly string[];
      readonly expressions: readonly JsIrValueExpression[];
    }
  | {
      readonly kind: "numberFormat";
      readonly method: "toFixed" | "toPrecision" | "toExponential" | "toString";
      readonly receiver: JsIrNumberExpression;
      readonly argument?: JsIrNumberExpression;
    }
  | {
      readonly kind: "errorToString";
      readonly objectName: string;
    }
  | {
      readonly kind: "regexReplace";
      readonly receiver: JsIrStringExpression;
      readonly regex: JsIrValueExpression;
      readonly replacement: JsIrStringExpression;
    };

export type JsIrObjectFieldValue =
  | {
      readonly kind: "number";
      readonly value: JsIrNumberExpression;
    }
  | {
      readonly kind: "object";
      readonly value: JsIrObjectValue;
    };

export interface JsIrObjectField {
  readonly name: string;
  readonly value: JsIrObjectFieldValue;
}

export interface JsIrObjectValue {
  readonly fields: readonly JsIrObjectField[];
}

export type JsIrRuntimeObjectField =
  | {
      readonly kind: "field";
      readonly key: JsIrStringExpression;
      readonly value: JsIrValueExpression;
    }
  | {
      readonly kind: "spread";
      readonly sourceName: string;
    };

export interface JsIrRuntimeObjectValue {
  readonly fields: readonly JsIrRuntimeObjectField[];
}

export interface JsIrSwitchClause {
  readonly test?: JsIrValueExpression;
  readonly operations: readonly JsIrOperation[];
}

export interface JsIrClosureValue {
  readonly functionName: string;
  readonly captures: readonly JsIrNumberExpression[];
}

export type JsIrCondition =
  | {
      readonly kind: "boolean";
      readonly value: boolean;
    }
  | {
      readonly kind: "classInstanceOf";
      readonly value: JsIrValueExpression;
      readonly prototypeName: string;
    }
  | {
      readonly kind: "errorInstanceOf";
      readonly value: JsIrValueExpression;
      readonly errorName: string;
    }
  | {
      readonly kind: "regexTest";
      readonly regex: JsIrValueExpression;
      readonly input: JsIrStringExpression;
    }
  | {
      readonly kind: "numberComparison";
      readonly operator: "===" | "!==" | "<" | "<=" | ">" | ">=";
      readonly left: JsIrNumberExpression;
      readonly right: JsIrNumberExpression;
    }
  | {
      readonly kind: "negate";
      readonly condition: JsIrCondition;
    }
  | {
      readonly kind: "and";
      readonly left: JsIrCondition;
      readonly right: JsIrCondition;
    }
  | {
      readonly kind: "or";
      readonly left: JsIrCondition;
      readonly right: JsIrCondition;
    }
  | {
      readonly kind: "booleanVariable";
      readonly name: string;
    }
  | {
      readonly kind: "stringComparison";
      readonly operator: "===" | "!==";
      readonly left: JsIrStringExpression;
      readonly right: JsIrStringExpression;
    }
  | {
      readonly kind: "booleanComparison";
      readonly operator: "===" | "!==";
      readonly left: JsIrCondition;
      readonly right: JsIrCondition;
    }
  | {
      readonly kind: "valueComparison";
      readonly operator: "===" | "!==";
      readonly left: JsIrValueExpression;
      readonly right: JsIrValueExpression;
    }
  | {
      readonly kind: "runtimeObjectHas";
      readonly objectName: string;
      readonly key: JsIrStringExpression;
      readonly ownOnly: boolean;
      readonly receiverKind?: "object" | "value";
    }
  | {
      readonly kind: "runtimeArrayHas";
      readonly arrayName: string;
      readonly index: JsIrNumberExpression;
      readonly key?: JsIrStringExpression;
      readonly ownOnly: boolean;
    }
  | {
      readonly kind: "runtimeObjectPropertyIsEnumerable";
      readonly objectName: string;
      readonly key: JsIrStringExpression;
    }
  | {
      readonly kind: "runtimeArrayIsArray";
      readonly value: boolean | JsIrValueExpression;
    }
  | {
      readonly kind: "runtimeArrayEvery" | "runtimeArraySome";
      readonly arrayName: string;
    }
  | {
      readonly kind: "objectIs";
      readonly left: JsIrValueExpression;
      readonly right: JsIrValueExpression;
    }
  | {
      readonly kind: "runtimeCollectionHas" | "runtimeCollectionDelete";
      readonly collectionName: string;
      readonly key: JsIrValueExpression;
    }
  | {
      readonly kind: "runtimeCollectionIdentity";
      readonly operator: "===" | "!==";
      readonly leftName: string;
      readonly rightName: string;
    }
  | {
      readonly kind: "valueTruthy";
      readonly value: JsIrValueExpression;
    }
  | {
      readonly kind: "valueLooseComparison" | "valueRelationalComparison";
      readonly operator: JsIrValueComparisonOperator;
      readonly left: JsIrValueExpression;
      readonly right: JsIrValueExpression;
    }
  | {
      readonly kind: "numberPredicate";
      readonly predicate: "globalIsNaN" | "numberIsNaN" | "numberIsFinite" | "numberIsInteger" | "numberIsSafeInteger";
      readonly value: JsIrValueExpression;
    }
  | {
      readonly kind: "stringSearch";
      readonly method: "includes" | "startsWith" | "endsWith";
      readonly receiver: JsIrStringExpression;
      readonly search: JsIrStringExpression;
    }
  | {
      readonly kind: "runtimeObjectState";
      readonly objectName: string;
      readonly state: "isExtensible" | "isSealed" | "isFrozen";
    };

export interface JsIrRuntimeDataDescriptor {
  readonly key: JsIrStringExpression;
  readonly value: JsIrValueExpression;
  readonly writable: boolean;
  readonly enumerable: boolean;
  readonly configurable: boolean;
}

export type JsIrRuntimeArrayConcatElement =
  | {
      readonly kind: "value";
      readonly value: JsIrValueExpression;
    }
  | {
      readonly kind: "fixedArraySpread";
      readonly arrayName: string;
      readonly length: number;
    };

export type JsIrObjectAssignSource =
  | {
      readonly kind: "runtimeObject";
      readonly name: string;
    }
  | {
      readonly kind: "runtimeArray";
      readonly name: string;
    }
  | {
      readonly kind: "fixedObject";
      readonly value: JsIrObjectValue;
    }
  | {
      readonly kind: "fixedArray";
      readonly name: string;
      readonly length: number;
    }
  | {
      readonly kind: "value";
      readonly value: JsIrValueExpression;
    };

export type JsIrExpression =
  | {
      readonly kind: "string";
      readonly value: string;
    }
  | {
      readonly kind: "stringExpression";
      readonly value: JsIrStringExpression;
    }
  | {
      readonly kind: "number";
      readonly value: JsIrNumberExpression;
    }
  | {
      readonly kind: "boolean";
      readonly value: boolean;
    }
  | {
      readonly kind: "identifier";
      readonly name: string;
    }
  | {
      readonly kind: "call";
      readonly name: string;
      readonly arguments: readonly JsIrCallArgument[];
    }
  | {
      readonly kind: "value";
      readonly value: JsIrValueExpression;
    };
