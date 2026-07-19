import { jsValueAbi } from "./js-value-abi/index.js";
import { llvm, type LlvmModuleBuilder } from "./llvm-ir/index.js";

const legacyJsValue = jsValueAbi.forLegacyLlvm();

export type RuntimeHelper =
  | "malloc"
  | "memcpy"
  | "memcmp"
  | "sprintf"
  | "strConcat"
  | "strEquals"
  | "stringIncludes"
  | "stringStartsWith"
  | "stringEndsWith"
  | "stringTrim"
  | "stringTrimStart"
  | "stringTrimEnd"
  | "stringToUpperCase"
  | "stringToLowerCase"
  | "stringRepeat"
  | "stringReplace"
  | "stringReplaceAll"
  | "stringPadStart"
  | "stringPadEnd"
  | "stringSplit"
  | "stringAt"
  | "stringNormalize"
  | "stringCharCodeAt"
  | "regexCompile"
  | "regexValid"
  | "regexAtomEnd"
  | "regexDecodeUtf8"
  | "regexAtomMatches"
  | "regexAtomStep"
  | "regexQuantifierInfo"
  | "regexCaptureIndex"
  | "regexIsWordAt"
  | "regexGroupEnd"
  | "regexMatchHere"
  | "regexMatchAlternatives"
  | "regexUtf16Index"
  | "regexByteOffset"
  | "regexFind"
  | "regexSlice"
  | "regexTest"
  | "regexExec"
  | "regexMatch"
  | "regexSearch"
  | "regexSplit"
  | "regexExpandReplacement"
  | "regexReplace"
  | "stringStartsWithAt"
  | "valueStrictEquals"
  | "valueSameValueZero"
  | "valueLooseEquals"
  | "valueRelationalCompare"
  | "valueToNumber"
  | "valuePlus"
  | "globalIsNaN"
  | "numberIsNaN"
  | "numberIsFinite"
  | "numberIsInteger"
  | "numberIsSafeInteger"
  | "numberToFixed"
  | "numberToPrecision"
  | "numberToExponential"
  | "numberToStringRadix"
  | "parseInt"
  | "parseFloat"
  | "mathAbs"
  | "mathFloor"
  | "mathCeil"
  | "mathTrunc"
  | "mathRound"
  | "mathSqrt"
  | "mathCbrt"
  | "mathPow"
  | "mathExp"
  | "mathLog"
  | "mathLog2"
  | "mathLog10"
  | "mathHypot2"
  | "mathMin2"
  | "mathMax2"
  | "mathRandom"
  | "mathFround"
  | "mathClz32"
  | "mathImul"
  | "mathSin"
  | "mathCos"
  | "mathTan"
  | "mathSign"
  | "valueBoxString"
  | "valueStringPtr"
  | "valueStringLength"
  | "valueBoxObject"
  | "valueBoxArray"
  | "valueObjectPtr"
  | "valueArrayPtr"
  | "valueBoxFunction"
  | "valueFunctionPtr"
  | "functionObjectNew"
  | "functionObjectGet"
  | "jsCall"
  | "valueIsObject"
  | "valueIsArray"
  | "valueObjectGet"
  | "valueArrayGet"
  | "valueArrayLength"
  | "valueObjectSet"
  | "valueArraySet"
  | "valueArraySetLength"
  | "valueObjectDelete"
  | "valueArrayDelete"
  | "valueObjectHasOwn"
  | "valueObjectKeys"
  | "valueObjectValues"
  | "valueObjectEntries"
  | "valueObjectOwnPropertyDescriptor"
  | "valueObjectOwnPropertyNames"
  | "valueObjectOwnPropertyDescriptors"
  | "objectEntries"
  | "objectFromEntries"
  | "arrayEntries"
  | "objectOwnPropertyNames"
  | "arrayOwnPropertyNames"
  | "arrayOwnPropertyDescriptors"
  | "objectOwnPropertyDescriptors"
  | "objectIs"
  | "valueTruthy"
  | "valuePrint"
  | "valueToString"
  | "indexToString"
  | "arrayNew"
  | "arrayLength"
  | "arrayGet"
  | "arrayGetWithKey"
  | "arraySetNamed"
  | "arrayDeleteNamed"
  | "arraySet"
  | "arrayDelete"
  | "arraySetLength"
  | "arrayHasOwnIndex"
  | "arrayHas"
  | "arrayKeys"
  | "arrayValues"
  | "arrayOwnPropertyDescriptor"
  | "arrayLengthPropertyDescriptor"
  | "arrayIncludes"
  | "arrayIndexOf"
  | "arrayLastIndexOf"
  | "arrayFind"
  | "arrayFindIndex"
  | "arrayAt"
  | "arrayCopyWithin"
  | "arraySlice"
  | "arraySplice"
  | "arrayFlat"
  | "arrayFromArray"
  | "arrayFromObject"
  | "arraySortDefault"
  | "arrayJoin"
  | "arrayConcat"
  | "arrayAppendElements"
  | "arrayFill"
  | "arrayReverse"
  | "arrayPush"
  | "arrayPop"
  | "arrayUnshift"
  | "arrayShift"
  | "arraySetPrototype"
  | "arrayGetPrototype"
  | "collectionNew"
  | "collectionSize"
  | "collectionFind"
  | "collectionSet"
  | "collectionGet"
  | "collectionHas"
  | "collectionDelete"
  | "objectNew"
  | "errorNew"
  | "errorToString"
  | "jsonQuote"
  | "jsonPad"
  | "jsonFilterHas"
  | "jsonStringifyValue"
  | "jsonStringifyArray"
  | "jsonStringifyObject"
  | "jsonStringify"
  | "objectCreate"
  | "objectGetOwn"
  | "objectGet"
  | "objectHasOwn"
  | "objectHas"
  | "objectSetPrototype"
  | "objectWouldCreateCycle"
  | "objectGetPrototype"
  | "jsInstanceOf"
  | "objectPreventExtensions"
  | "objectIsExtensible"
  | "objectSeal"
  | "objectFreeze"
  | "objectIsSealed"
  | "objectIsFrozen"
  | "objectAssign"
  | "objectAssignArray"
  | "valueObjectAssign"
  | "objectDefineDataProperty"
  | "objectValues"
  | "objectOwnPropertyDescriptor"
  | "objectPropertyIsEnumerable"
  | "objectKeys"
  | "objectDelete"
  | "boxedValueOf"
  | "boxedToString"
  | "objectSet"
  | "gcInit"
  | "gcRootPush"
  | "gcRootPop"
  | "gcMarkValue"
  | "gcMarkObject"
  | "gcSweep"
  | "gcCollect"
  | "gcAlloc"
  | "environmentNew"
  | "environmentGet"
  | "environmentSet"
  | "valueIsFunction"
  | "valueIsString"
  | "valuePropertyGet"
  | "getIteratorValue"
  | "callIteratorNext"
  | "iteratorClose"
  | "createArrayIterator"
  | "createStringIterator"
  | "createCollectionIterator"
  | "getCollectionIterator"
  | "builtinIteratorNext"
  | "arrayIteratorMethod"
  | "stringIteratorMethod"
  | "mapFromIterable"
  | "setFromIterable"
  | "arrayFromValue"
  | "iteratorResultObject";

/**
 * Compiler-owned private-use property key for well-known `Symbol.iterator`.
 * Starts with U+F8FF (BMP private-use) so ordinary user-authored keys are
 * vanishingly unlikely to collide; general Symbol values remain out of scope.
 */
export const SYMBOL_ITERATOR_SENTINEL = "\uF8FFSymbol.iterator";

export type RuntimeHelperEmitter = {
  readonly used: Set<RuntimeHelper>;
};

export const createRuntimeHelperEmitter = (): RuntimeHelperEmitter => ({ used: new Set() });

export function defineStructuredRuntimeHelpers(module: LlvmModuleBuilder, runtime: RuntimeHelperEmitter): void {
  if (runtime.used.has("valueBoxObject")) {
    module.defineFunction(
      {
        name: "valueBoxObject",
        parameters: [{ name: "object", type: llvm.ptr }],
        returns: jsValueAbi.llvmBoundaryType
      },
      (fn) => {
        const object = fn.parameter(0, llvm.ptr);
        fn.block("entry", (block) => {
          block.ret(jsValueAbi.forLlvm(block).boxReference("object", object));
        });
      }
    );
  }
  module.defineFunction(
    { name: "valueBoxNumber", parameters: [{ name: "number", type: llvm.double }], returns: jsValueAbi.llvmBoundaryType },
    (fn) => {
      const number = fn.parameter(0, llvm.double);
      fn.block("entry", (block) => block.ret(jsValueAbi.forLlvm(block).boxNumber(number)));
    }
  );
  module.defineFunction(
    { name: "valueNumber", parameters: [{ name: "value", type: jsValueAbi.llvmBoundaryType }], returns: llvm.double },
    (fn) => {
      const value = fn.parameter(0, llvm.i64);
      fn.block("entry", (block) => {
        const values = jsValueAbi.forLlvm(block);
        block.ret(values.unboxNumber(values.fromBoundary(value)));
      });
    }
  );
}

const runtimeHelperDependencies = new Map<RuntimeHelper, readonly RuntimeHelper[]>([
  ["regexCompile", ["regexValid", "objectNew", "objectSet", "errorNew", "strConcat", "valueBoxObject", "valueBoxString", "valueStringPtr", "valueStringLength"]],
  ["regexValid", []],
  ["regexAtomEnd", []],
  ["regexDecodeUtf8", []],
  ["regexAtomMatches", ["regexAtomEnd", "regexDecodeUtf8"]],
  ["regexAtomStep", []],
  ["regexQuantifierInfo", []],
  ["regexCaptureIndex", []],
  ["regexIsWordAt", []],
  ["regexGroupEnd", []],
  ["regexMatchHere", ["regexAtomEnd", "regexAtomMatches", "regexAtomStep", "regexQuantifierInfo", "regexCaptureIndex", "regexIsWordAt", "regexGroupEnd", "regexMatchAlternatives", "memcmp"]],
  ["regexMatchAlternatives", ["regexMatchHere"]],
  ["regexUtf16Index", []],
  ["regexByteOffset", []],
  ["regexFind", ["objectGet", "objectSet", "valueObjectPtr", "valueStringPtr", "valueStringLength", "regexMatchAlternatives", "regexByteOffset", "regexUtf16Index"]],
  ["regexSlice", ["malloc", "memcpy", "valueBoxString", "valueStringPtr"]],
  ["regexTest", ["regexFind"]],
  ["regexExec", ["regexFind", "regexSlice", "regexUtf16Index", "regexCaptureIndex", "objectGet", "valueObjectPtr", "arrayNew", "arraySet", "arraySetNamed", "valueBoxArray", "valueStringPtr", "valueStringLength"]],
  ["regexMatch", ["regexExec", "regexFind", "regexSlice", "regexUtf16Index", "objectGet", "objectSet", "valueObjectPtr", "valueStringPtr", "valueStringLength", "arrayNew", "arrayPush", "arrayLength", "valueBoxArray"]],
  ["regexSearch", ["regexFind", "regexUtf16Index", "objectGet", "objectSet", "valueObjectPtr", "valueStringPtr"]],
  ["regexSplit", ["regexFind", "regexSlice", "regexUtf16Index", "regexCaptureIndex", "objectGet", "objectSet", "valueObjectPtr", "valueStringPtr", "valueStringLength", "arrayNew", "arrayPush", "arrayLength"]],
  ["regexExpandReplacement", ["valueStringPtr", "valueStringLength", "valueBoxString", "strConcat", "malloc"]],
  ["regexReplace", ["regexFind", "regexSlice", "regexUtf16Index", "regexExpandReplacement", "objectGet", "objectSet", "valueObjectPtr", "valueStringPtr", "valueStringLength", "valueBoxString", "strConcat", "malloc"]],
  ["strConcat", ["malloc", "memcpy"]],
  ["strEquals", ["memcmp"]],
  ["stringIncludes", ["memcmp"]],
  ["stringStartsWith", ["memcmp"]],
  ["stringStartsWithAt", ["memcmp"]],
  ["stringEndsWith", ["memcmp"]],
  ["stringTrim", ["malloc", "memcpy"]],
  ["stringTrimStart", ["malloc", "memcpy"]],
  ["stringTrimEnd", ["malloc", "memcpy"]],
  ["stringNormalize", ["malloc", "memcpy"]],
  ["stringToUpperCase", ["malloc"]],
  ["stringToLowerCase", ["malloc"]],
  ["stringRepeat", ["malloc", "memcpy"]],
  ["stringReplace", ["malloc", "memcpy", "memcmp"]],
  ["stringReplaceAll", ["malloc", "memcpy", "memcmp"]],
  ["stringPadStart", ["malloc", "memcpy"]],
  ["stringPadEnd", ["malloc", "memcpy"]],
  ["stringSplit", ["arrayNew", "arraySet", "valueBoxString", "malloc", "memcpy", "memcmp"]],
  ["valueStrictEquals", ["valueStringLength", "valueStringPtr", "memcmp"]],
  ["valueSameValueZero", ["valueStrictEquals", "valueStringLength", "valueStringPtr", "memcmp"]],
  ["valueLooseEquals", ["valueStrictEquals", "valueToNumber", "valueStringPtr", "valueStringLength", "memcmp"]],
  ["valueRelationalCompare", ["valueToNumber", "valueStringPtr", "valueStringLength", "memcmp"]],
  ["valueToNumber", ["valueStringPtr"]],
  ["valuePlus", ["valueToNumber", "valueToString", "valueBoxString", "strConcat"]],
  ["globalIsNaN", ["valueToNumber"]],
  ["numberIsNaN", []],
  ["numberIsFinite", []],
  ["numberIsInteger", ["numberIsFinite"]],
  ["numberIsSafeInteger", ["numberIsInteger", "mathAbs"]],
  ["numberToFixed", ["malloc", "sprintf"]],
  ["numberToPrecision", ["malloc", "sprintf"]],
  ["numberToExponential", ["malloc", "sprintf"]],
  ["numberToStringRadix", ["malloc", "sprintf"]],
  ["parseInt", []],
  ["parseFloat", []],
  ["mathAbs", []],
  ["mathFloor", []],
  ["mathCeil", []],
  ["mathTrunc", []],
  ["mathRound", []],
  ["mathSqrt", []],
  ["mathCbrt", ["mathAbs"]],
  ["mathPow", []],
  ["mathExp", []],
  ["mathLog", []],
  ["mathLog2", []],
  ["mathLog10", []],
  ["mathHypot2", ["mathSqrt"]],
  ["mathMin2", []],
  ["mathMax2", []],
  ["mathRandom", []],
  ["mathFround", []],
  ["mathClz32", []],
  ["mathImul", []],
  ["mathSin", []],
  ["mathCos", []],
  ["mathTan", []],
  ["mathSign", []],
  ["arrayNew", ["gcAlloc", "objectNew"]],
  ["objectNew", ["gcAlloc"]],
  ["collectionNew", ["gcAlloc"]],
  ["valueBoxString", ["gcAlloc"]],
  ["valuePrint", ["valueStringPtr", "valueObjectPtr", "errorToString"]],
  ["valueToString", ["valueStringPtr", "valueStringLength", "valueArrayPtr", "arrayJoin", "malloc", "sprintf"]],
  ["valueStringPtr", ["valueBoxString"]],
  ["valueStringLength", ["valueBoxString"]],
  ["valueBoxObject", []],
  ["valueBoxArray", []],
  ["valueBoxFunction", []],
  ["valueObjectPtr", []],
  ["valueArrayPtr", []],
  ["valueFunctionPtr", []],
  ["functionObjectNew", ["gcAlloc", "valueBoxFunction"]],
  ["functionObjectGet", ["valueFunctionPtr", "valueBoxString", "memcmp"]],
  ["jsCall", ["valueFunctionPtr"]],
  ["valueIsFunction", []],
  ["valueIsString", []],
  [
    "valuePropertyGet",
    [
      "valueIsObject",
      "valueIsArray",
      "valueIsString",
      "valueIsFunction",
      "valueObjectPtr",
      "valueArrayPtr",
      "functionObjectGet",
      "objectGet",
      "arrayGetWithKey",
      "arrayIteratorMethod",
      "stringIteratorMethod",
      "functionObjectNew",
      "memcmp"
    ]
  ],
  [
    "getIteratorValue",
    [
      "valueIsObject",
      "valueIsArray",
      "valueIsString",
      "valueIsFunction",
      "valuePropertyGet",
      "jsCall",
      "errorNew",
      "valueBoxObject",
      "valueBoxString",
      "gcRootPush"
    ]
  ],
  [
    "callIteratorNext",
    ["valueIsObject", "valueIsFunction", "valueObjectGet", "jsCall", "errorNew", "valueBoxObject", "valueBoxString", "valueToString", "strConcat", "gcRootPush"]
  ],
  [
    "iteratorClose",
    [
      "valueIsObject",
      "valueIsFunction",
      "valuePropertyGet",
      "jsCall",
      "errorNew",
      "valueBoxObject",
      "valueBoxString",
      "valueToString",
      "strConcat",
      "gcRootPush"
    ]
  ],
  [
    "createArrayIterator",
    ["gcAlloc", "functionObjectNew", "objectNew", "objectSet", "valueBoxObject", "valueBoxString", "builtinIteratorNext", "errorNew", "gcRootPush"]
  ],
  [
    "createStringIterator",
    ["gcAlloc", "functionObjectNew", "objectNew", "objectSet", "valueBoxObject", "valueBoxString", "builtinIteratorNext", "errorNew", "gcRootPush"]
  ],
  [
    "createCollectionIterator",
    ["gcAlloc", "functionObjectNew", "objectNew", "objectSet", "valueBoxObject", "valueBoxString", "builtinIteratorNext", "errorNew", "gcRootPush"]
  ],
  [
    "getCollectionIterator",
    ["createCollectionIterator", "valueIsFunction", "valueIsObject", "jsCall", "iteratorResultObject", "errorNew", "valueBoxObject", "valueBoxString", "valueToString", "strConcat", "gcRootPush"]
  ],
  [
    "builtinIteratorNext",
    [
      "arrayLength",
      "arrayGet",
      "valueArrayPtr",
      "valueStringPtr",
      "valueStringLength",
      "valueBoxString",
      "valueBoxArray",
      "valueBoxObject",
      "arrayNew",
      "arraySet",
      "objectNew",
      "objectSet",
      "iteratorResultObject",
      "malloc",
      "memcpy",
      "gcRootPush"
    ]
  ],
  ["arrayIteratorMethod", ["createArrayIterator", "gcRootPush"]],
  ["stringIteratorMethod", ["createStringIterator", "gcRootPush"]],
  [
    "mapFromIterable",
    [
      "getIteratorValue",
      "callIteratorNext",
      "collectionNew",
      "collectionSet",
      "valueIsObject",
      "valueIsArray",
      "valueObjectGet",
      "valueArrayGet",
      "valueTruthy",
      "valueBoxString",
      "errorNew",
      "valueBoxObject",
      "gcRootPush"
    ]
  ],
  [
    "setFromIterable",
    [
      "getIteratorValue",
      "callIteratorNext",
      "collectionNew",
      "collectionSet",
      "valueObjectGet",
      "valueTruthy",
      "valueBoxString",
      "errorNew",
      "valueBoxObject",
      "gcRootPush"
    ]
  ],
  [
    "arrayFromValue",
    [
      "valueIsObject",
      "valueIsArray",
      "valueIsFunction",
      "valuePropertyGet",
      "jsCall",
      "callIteratorNext",
      "arrayNew",
      "arrayPush",
      "arrayLength",
      "arrayGet",
      "arraySet",
      "arrayFromArray",
      "arrayFromObject",
      "valueArrayPtr",
      "valueObjectPtr",
      "valueObjectGet",
      "valueTruthy",
      "valueBoxArray",
      "valueBoxString",
      "errorNew",
      "valueBoxObject",
      "gcRootPush"
    ]
  ],
  ["iteratorResultObject", ["objectNew", "objectSet", "valueBoxObject"]],
  ["valueObjectGet", ["valueIsFunction", "functionObjectGet", "valueObjectPtr", "objectGet"]],
  ["valueArrayGet", ["valueArrayPtr", "arrayGetWithKey"]],
  ["valueArrayLength", ["valueArrayPtr", "arrayLength"]],
  ["valueObjectSet", ["valueObjectPtr", "objectSet"]],
  ["valueArraySet", ["valueArrayPtr", "arraySet"]],
  ["valueArraySetLength", ["valueArrayPtr", "arraySetLength"]],
  ["valueObjectDelete", ["valueObjectPtr", "objectDelete"]],
  ["valueArrayDelete", ["valueArrayPtr", "arrayDelete"]],
  ["valueObjectHasOwn", ["valueObjectPtr", "valueArrayPtr", "objectHasOwn", "arrayHasOwnIndex"]],
  ["valueObjectKeys", ["valueObjectPtr", "valueArrayPtr", "objectKeys", "arrayKeys", "arrayNew"]],
  ["valueObjectValues", ["valueObjectPtr", "valueArrayPtr", "objectValues", "arrayValues", "arrayNew"]],
  ["valueObjectEntries", ["valueObjectPtr", "valueArrayPtr", "objectEntries", "arrayEntries", "arrayNew"]],
  ["valueObjectOwnPropertyDescriptor", ["valueObjectPtr", "valueArrayPtr", "objectOwnPropertyDescriptor", "arrayOwnPropertyDescriptor", "arrayLengthPropertyDescriptor", "memcmp"]],
  ["valueObjectOwnPropertyNames", ["valueObjectPtr", "valueArrayPtr", "objectOwnPropertyNames", "arrayOwnPropertyNames", "arrayNew"]],
  ["valueObjectOwnPropertyDescriptors", ["valueObjectPtr", "valueArrayPtr", "objectOwnPropertyDescriptors", "arrayOwnPropertyDescriptors", "objectNew"]],
  ["objectEntries", ["arrayNew", "arraySet", "valueBoxString", "valueBoxArray"]],
  ["objectFromEntries", ["objectNew", "objectSet", "arrayLength", "arrayHasOwnIndex", "valueArrayPtr", "arrayGet", "valueStringPtr", "valueStringLength", "valueIsArray"]],
  ["arrayEntries", ["arrayLength", "arrayHasOwnIndex", "arrayNew", "arraySet", "indexToString", "valueBoxString", "valueBoxArray", "objectEntries", "arrayAppendElements"]],
  ["objectOwnPropertyNames", ["arrayNew", "arraySet", "valueBoxString"]],
  ["arrayOwnPropertyNames", ["arrayLength", "arrayHasOwnIndex", "arrayNew", "arraySet", "arrayPush", "valueBoxString", "indexToString", "objectOwnPropertyNames", "arrayAppendElements"]],
  ["objectOwnPropertyDescriptors", ["objectNew", "objectOwnPropertyDescriptor", "objectSet"]],
  ["objectIs", ["valueStringLength", "valueStringPtr", "memcmp", "valueObjectPtr", "valueArrayPtr", "valueFunctionPtr"]],
  ["valueTruthy", ["valueStringLength"]],
  ["indexToString", ["malloc"]],
  ["arrayGet", ["arrayLength"]],
  ["arrayGetWithKey", ["arrayLength", "arrayHasOwnIndex", "objectGet", "objectGetOwn", "memcmp"]],
  ["arraySetNamed", ["objectSet"]],
  ["arrayDeleteNamed", ["objectDelete"]],
  ["arraySet", ["arrayLength", "malloc", "memcpy"]],
  ["arrayDelete", ["arrayLength"]],
  ["arraySetLength", ["arrayLength", "malloc", "memcpy"]],
  ["arrayHasOwnIndex", ["arrayLength"]],
  ["arrayPush", ["arraySet", "arrayLength"]],
  ["arrayPop", ["arrayLength"]],
  ["arrayShift", ["arrayLength"]],
  ["arrayUnshift", ["arraySetLength", "arrayLength"]],
  ["arrayKeys", ["arrayNew", "arraySet", "arrayHasOwnIndex", "valueBoxString", "indexToString", "objectKeys", "arrayConcat"]],
  ["arrayValues", ["arrayNew", "arraySet", "arrayHasOwnIndex", "objectValues", "arrayAppendElements"]],
  ["arrayOwnPropertyDescriptor", ["arrayHasOwnIndex", "arrayGet", "objectNew", "objectSet", "objectOwnPropertyDescriptor", "valueBoxObject"]],
  ["arrayLengthPropertyDescriptor", ["arrayLength", "objectNew", "objectSet", "valueBoxObject"]],
  ["arrayOwnPropertyDescriptors", ["arrayLength", "arrayHasOwnIndex", "arrayOwnPropertyDescriptor", "arrayLengthPropertyDescriptor", "indexToString", "objectNew", "objectSet", "objectOwnPropertyDescriptors", "objectAssign"]],
  ["arrayIncludes", ["arrayLength", "arrayHasOwnIndex", "valueStrictEquals", "valueStringLength", "valueStringPtr", "memcmp"]],
  ["arrayIndexOf", ["arrayLength", "arrayHasOwnIndex", "arrayGet", "valueStrictEquals"]],
  ["arrayLastIndexOf", ["arrayLength", "arrayHasOwnIndex", "arrayGet", "valueStrictEquals"]],
  ["arrayFind", ["arrayLength", "arrayHasOwnIndex", "arrayGet"]],
  ["arrayFindIndex", ["arrayLength", "arrayHasOwnIndex"]],
  ["arrayAt", ["arrayLength"]],
  ["arrayCopyWithin", ["arrayLength", "arrayHasOwnIndex", "arraySet", "arrayDelete"]],
  ["arraySlice", ["arrayLength", "arrayNew", "arrayHasOwnIndex", "arraySet"]],
  ["arraySplice", ["arrayLength", "arrayNew", "arrayHasOwnIndex", "arraySet", "arrayGet", "arraySetLength", "arrayDelete"]],
  ["arrayFlat", ["arrayLength", "arrayNew", "arrayHasOwnIndex", "arrayGet", "valueIsArray", "valueArrayPtr", "arraySet"]],
  ["arrayFromArray", ["arrayLength", "arrayNew", "arrayGet", "arraySet"]],
  ["arrayFromObject", ["arrayNew", "arraySet", "objectGet", "valueToNumber", "indexToString"]],
  ["arraySortDefault", ["arrayLength", "arrayGet", "arraySet", "valueToString", "memcmp"]],
  ["arrayJoin", ["arrayLength", "arrayHasOwnIndex", "valueToString", "malloc", "memcpy"]],
  ["arrayConcat", ["arrayLength", "arrayNew", "arrayHasOwnIndex", "arraySet", "arrayGet", "valueIsArray", "valueArrayPtr"]],
  ["arrayAppendElements", ["arrayLength", "arrayHasOwnIndex", "arrayGet", "arrayPush"]],
  ["arrayFill", ["arrayLength", "arraySet"]],
  ["arrayReverse", ["arrayLength"]],
  ["arrayHas", ["arrayHasOwnIndex", "objectHas", "objectHasOwn", "objectGetOwn", "memcmp"]],
  ["arrayGetPrototype", ["arrayLength"]],
  ["collectionNew", ["gcAlloc"]],
  ["collectionSize", []],
  ["collectionFind", ["valueSameValueZero"]],
  ["collectionSet", ["collectionFind", "malloc", "memcpy"]],
  ["collectionGet", ["collectionFind"]],
  ["collectionHas", ["collectionFind"]],
  ["collectionDelete", ["collectionFind"]],
  ["objectCreate", ["objectNew"]],
  ["errorNew", ["objectNew", "valueBoxString", "objectDefineDataProperty"]],
  ["errorToString", ["objectGet", "valueToString", "malloc", "memcpy"]],
  ["jsonQuote", ["malloc"]],
  ["jsonPad", ["malloc"]],
  ["jsonFilterHas", ["arrayLength", "arrayGet", "valueStringPtr", "valueStringLength", "memcmp"]],
  ["jsonStringifyValue", ["jsonQuote", "jsonStringifyArray", "jsonStringifyObject", "valueStringPtr", "valueStringLength", "valueObjectPtr", "valueArrayPtr", "malloc", "sprintf"]],
  ["jsonStringifyArray", ["arrayLength", "arrayGet", "jsonStringifyValue", "jsonPad", "strConcat"]],
  ["jsonStringifyObject", ["jsonStringifyValue", "jsonQuote", "jsonPad", "jsonFilterHas", "strConcat"]],
  ["jsonStringify", ["jsonStringifyValue", "valueBoxString"]],
  ["objectGet", ["objectGetOwn"]],
  ["objectHasOwn", ["objectGetOwn"]],
  ["objectHas", ["objectHasOwn", "objectGetOwn", "memcmp"]],
  ["objectSetPrototype", ["objectWouldCreateCycle"]],
  ["jsInstanceOf", ["valueIsObject", "valueObjectPtr", "objectGetPrototype"]],
  ["objectKeys", ["arrayNew", "arraySet", "valueBoxString"]],
  ["objectValues", ["arrayNew", "arraySet"]],
  ["objectOwnPropertyDescriptor", ["objectNew", "objectSet", "valueBoxObject", "memcmp"]],
  ["objectPropertyIsEnumerable", ["memcmp"]],
  ["objectSeal", ["objectPreventExtensions"]],
  ["objectFreeze", ["objectPreventExtensions", "objectSeal"]],
  ["objectIsSealed", ["objectPreventExtensions", "objectIsExtensible"]],
  ["objectIsFrozen", ["objectPreventExtensions", "objectIsSealed"]],
  ["objectAssign", ["objectSet"]],
  ["objectAssignArray", ["arrayLength", "arrayHasOwnIndex", "arrayGet", "indexToString", "objectSet", "objectAssign"]],
  ["valueObjectAssign", ["valueObjectPtr", "valueArrayPtr", "objectAssign", "objectAssignArray"]],
  ["objectGetOwn", ["memcmp"]],
  ["objectSet", ["objectGet", "objectGetOwn", "memcmp", "malloc", "memcpy"]],
  ["objectDefineDataProperty", ["objectGet", "objectGetOwn", "memcmp", "malloc", "memcpy"]],
  ["objectDelete", ["memcmp"]],
  ["gcInit", ["malloc", "memcpy"]],
  ["gcRootPush", []],
  ["gcRootPop", []],
  ["gcMarkValue", ["gcMarkObject"]],
  ["gcMarkObject", []],
  ["gcSweep", []],
  ["gcCollect", ["gcMarkValue", "gcSweep"]],
  ["gcAlloc", ["gcCollect", "gcRootPush", "gcRootPop", "gcInit"]],
  ["environmentNew", ["gcAlloc", "malloc"]],
  ["environmentGet", []],
  ["environmentSet", []]
]);

export function useRuntimeHelper(runtime: RuntimeHelperEmitter, helper: RuntimeHelper): void {
  if (runtime.used.has(helper)) {
    return;
  }
  runtime.used.add(helper);
  for (const dependency of runtimeHelperDependencies.get(helper) ?? []) {
    useRuntimeHelper(runtime, dependency);
  }
}

// eslint-disable-next-line complexity -- Runtime declarations are emitted only for helpers used by the current module.
export function emitRuntimeDeclarations(runtime: RuntimeHelperEmitter): string[] {
  // gcInit is always emitted (see llvm.ts main prologue). Force the runtime
  // helper into `used` (transitively pulling malloc/memcpy so the arena + stack
  // allocation inside gcInit links) so the dependent libc declarations
  // (@getenv, @strtol) are emitted before the gcInit body references them.
  useRuntimeHelper(runtime, "gcInit");
  const declarations: string[] = [];
  const declarationByHelper = new Map<RuntimeHelper, string>([
    ["malloc", "declare ptr @malloc(i64)"],
    ["memcpy", "declare ptr @memcpy(ptr, ptr, i64)"],
    ["memcmp", "declare i32 @memcmp(ptr, ptr, i64)"],
    ["sprintf", "declare i32 @sprintf(ptr, ptr, ...)"]
  ]);

  for (const helper of ["malloc", "memcpy", "memcmp", "sprintf"] as const) {
    if (runtime.used.has(helper)) {
      const declaration = declarationByHelper.get(helper);
      if (declaration !== undefined) {
        declarations.push(declaration);
      }
    }
  }

  // GC runtime helpers (Phase B): getenv/strtol are needed by gcInit to honor
  // TSCN_GC_HEAP_SIZE. gcInit is always in `used` (forced above).
  if (runtime.used.has("gcInit")) {
    declarations.push("declare ptr @getenv(ptr)");
    declarations.push("declare i64 @strtol(ptr, ptr, i32)");
    // gcSweep frees the malloc'd backing buffers (object/array/collection entry
    // tables and owned string data) of reclaimed cells.
    declarations.push("declare void @free(ptr)");
  }

  if (runtime.used.has("mathAbs") || runtime.used.has("numberIsFinite")) declarations.push("declare double @llvm.fabs.f64(double)");
  if (runtime.used.has("mathFloor")) declarations.push("declare double @llvm.floor.f64(double)");
  if (runtime.used.has("mathCeil")) declarations.push("declare double @llvm.ceil.f64(double)");
  if (runtime.used.has("mathTrunc") || runtime.used.has("parseInt")) declarations.push("declare double @llvm.trunc.f64(double)");
  if (runtime.used.has("mathRound")) declarations.push("declare double @llvm.round.f64(double)");
  if (runtime.used.has("mathSqrt")) declarations.push("declare double @llvm.sqrt.f64(double)");
  if (runtime.used.has("mathPow")) declarations.push("declare double @llvm.pow.f64(double, double)");
  if (runtime.used.has("mathExp")) declarations.push("declare double @llvm.exp.f64(double)");
  if (runtime.used.has("mathLog")) declarations.push("declare double @llvm.log.f64(double)");
  if (runtime.used.has("mathLog2")) declarations.push("declare double @llvm.log2.f64(double)");
  if (runtime.used.has("mathLog10")) declarations.push("declare double @llvm.log10.f64(double)");
  if (runtime.used.has("mathSin") || runtime.used.has("mathTan")) declarations.push("declare double @llvm.sin.f64(double)");
  if (runtime.used.has("mathCos") || runtime.used.has("mathTan")) declarations.push("declare double @llvm.cos.f64(double)");
  if (runtime.used.has("mathClz32")) declarations.push("declare i32 @llvm.ctlz.i32(i32, i1)");
  if (runtime.used.has("parseInt") || runtime.used.has("parseFloat") || runtime.used.has("valueToNumber")) declarations.push("declare double @strtod(ptr, ptr)");

  return declarations;
}

// eslint-disable-next-line complexity, max-statements -- Generated helper emission stays centralized during the runtime ABI transition.
export function emitRuntimeDefinitions(runtime: RuntimeHelperEmitter): string[] {
  // The main prologue unconditionally calls @gcInit (see llvm.ts). Force the
  // runtime emission of the GC so that call links even for modules that never
  // allocate through @gcAlloc.
  useRuntimeHelper(runtime, "gcInit");
  const definitions: string[] = [];
  const regexRuntimeHelpers: readonly RuntimeHelper[] = ["regexCompile", "regexFind", "regexTest", "regexExec", "regexMatch", "regexSearch", "regexSplit", "regexReplace"];
  if (regexRuntimeHelpers.some((helper) => runtime.used.has(helper))) {
    definitions.push(`; Runtime RegExp object keys.
@.regex.source = private unnamed_addr constant [7 x i8] c"source\\00"
@.regex.flags = private unnamed_addr constant [6 x i8] c"flags\\00"
@.regex.global = private unnamed_addr constant [7 x i8] c"global\\00"
@.regex.ignore.case = private unnamed_addr constant [11 x i8] c"ignoreCase\\00"
@.regex.multiline = private unnamed_addr constant [10 x i8] c"multiline\\00"
@.regex.sticky = private unnamed_addr constant [7 x i8] c"sticky\\00"
@.regex.last.index = private unnamed_addr constant [10 x i8] c"lastIndex\\00"
@.regex.index = private unnamed_addr constant [6 x i8] c"index\\00"
@.regex.input = private unnamed_addr constant [6 x i8] c"input\\00"
@.regex.syntax.error.name = private unnamed_addr constant [12 x i8] c"SyntaxError\\00"
@.regex.syntax.error.prefix = private unnamed_addr constant [30 x i8] c"Invalid regular expression: /\\00"
@.regex.syntax.error.suffix = private unnamed_addr constant [32 x i8] c"/: Unterminated character class\\00"
@regex.capture.starts = internal global [10 x i64] zeroinitializer
@regex.capture.ends = internal global [10 x i64] zeroinitializer
`);
  }
  if (runtime.used.has("regexValid")) {
    definitions.push(`define i1 @regexValid(ptr %pattern, i64 %plen, ptr %flags, i64 %flen) {
entry:
  %flag.position.addr = alloca i64
  %flag.mask.addr = alloca i64
  store i64 0, ptr %flag.position.addr
  store i64 0, ptr %flag.mask.addr
  br label %flags.loop
flags.loop:
  %flag.position = load i64, ptr %flag.position.addr
  %flags.done = icmp uge i64 %flag.position, %flen
  br i1 %flags.done, label %pattern.init, label %flag
flag:
  %flag.ptr = getelementptr i8, ptr %flags, i64 %flag.position
  %flag.ch = load i8, ptr %flag.ptr
  %flag.g = icmp eq i8 %flag.ch, 103
  %flag.i = icmp eq i8 %flag.ch, 105
  %flag.m = icmp eq i8 %flag.ch, 109
  %flag.u = icmp eq i8 %flag.ch, 117
  %flag.y = icmp eq i8 %flag.ch, 121
  %known.0 = or i1 %flag.g, %flag.i
  %known.1 = or i1 %flag.m, %flag.u
  %known.2 = or i1 %known.0, %known.1
  %known = or i1 %known.2, %flag.y
  br i1 %known, label %flag.bit, label %invalid
flag.bit:
  %bit.g = select i1 %flag.g, i64 1, i64 0
  %bit.i = select i1 %flag.i, i64 2, i64 0
  %bit.m = select i1 %flag.m, i64 4, i64 0
  %bit.u = select i1 %flag.u, i64 8, i64 0
  %bit.y = select i1 %flag.y, i64 16, i64 0
  %bit.0 = or i64 %bit.g, %bit.i
  %bit.1 = or i64 %bit.m, %bit.u
  %bit.2 = or i64 %bit.0, %bit.1
  %bit = or i64 %bit.2, %bit.y
  %mask = load i64, ptr %flag.mask.addr
  %seen.bits = and i64 %mask, %bit
  %duplicate = icmp ne i64 %seen.bits, 0
  br i1 %duplicate, label %invalid, label %flag.step
flag.step:
  %next.mask = or i64 %mask, %bit
  %next.flag.position = add i64 %flag.position, 1
  store i64 %next.mask, ptr %flag.mask.addr
  store i64 %next.flag.position, ptr %flag.position.addr
  br label %flags.loop
pattern.init:
  %position.addr = alloca i64
  %class.addr = alloca i1
  %escape.addr = alloca i1
  %depth.addr = alloca i64
  store i64 0, ptr %position.addr
  store i1 false, ptr %class.addr
  store i1 false, ptr %escape.addr
  store i64 0, ptr %depth.addr
  br label %pattern.loop
pattern.loop:
  %position = load i64, ptr %position.addr
  %pattern.done = icmp uge i64 %position, %plen
  br i1 %pattern.done, label %pattern.finish, label %pattern.character
pattern.character:
  %pointer = getelementptr i8, ptr %pattern, i64 %position
  %character = load i8, ptr %pointer
  %escaped = load i1, ptr %escape.addr
  br i1 %escaped, label %pattern.clear.escape, label %pattern.syntax
pattern.clear.escape:
  store i1 false, ptr %escape.addr
  br label %pattern.step
pattern.syntax:
  %is.escape = icmp eq i8 %character, 92
  br i1 %is.escape, label %pattern.set.escape, label %pattern.class.start.check
pattern.set.escape:
  store i1 true, ptr %escape.addr
  br label %pattern.step
pattern.class.start.check:
  %in.class = load i1, ptr %class.addr
  %is.class.start = icmp eq i8 %character, 91
  %outside.class = xor i1 %in.class, true
  %start.class = and i1 %is.class.start, %outside.class
  br i1 %start.class, label %pattern.set.class, label %pattern.class.end.check
pattern.set.class:
  store i1 true, ptr %class.addr
  br label %pattern.step
pattern.class.end.check:
  %is.class.end = icmp eq i8 %character, 93
  br i1 %is.class.end, label %pattern.clear.class, label %pattern.group.check
pattern.clear.class:
  br i1 %in.class, label %pattern.clear.class.valid, label %invalid
pattern.clear.class.valid:
  store i1 false, ptr %class.addr
  br label %pattern.step
pattern.group.check:
  br i1 %in.class, label %pattern.step, label %pattern.group
pattern.group:
  %is.open = icmp eq i8 %character, 40
  %is.close = icmp eq i8 %character, 41
  %depth = load i64, ptr %depth.addr
  br i1 %is.open, label %pattern.open, label %pattern.close.check
pattern.open:
  %deeper = add i64 %depth, 1
  store i64 %deeper, ptr %depth.addr
  br label %pattern.step
pattern.close.check:
  br i1 %is.close, label %pattern.close, label %pattern.step
pattern.close:
  %can.close = icmp ugt i64 %depth, 0
  br i1 %can.close, label %pattern.close.valid, label %invalid
pattern.close.valid:
  %shallower = sub i64 %depth, 1
  store i64 %shallower, ptr %depth.addr
  br label %pattern.step
pattern.step:
  %next.position = add i64 %position, 1
  store i64 %next.position, ptr %position.addr
  br label %pattern.loop
pattern.finish:
  %final.class = load i1, ptr %class.addr
  %final.escape = load i1, ptr %escape.addr
  %final.depth = load i64, ptr %depth.addr
  %depth.valid = icmp eq i64 %final.depth, 0
  %class.valid = xor i1 %final.class, true
  %escape.valid = xor i1 %final.escape, true
  %valid.0 = and i1 %depth.valid, %class.valid
  %valid = and i1 %valid.0, %escape.valid
  ret i1 %valid
invalid:
  ret i1 false
}
`);
  }
  if (runtime.used.has("regexCompile")) {
    definitions.push(`define { i64, i1 } @regexCompile(i64 %pattern, i64 %flags) {
entry:
  %flags.ptr = call ptr @valueStringPtr(i64 %flags)
  %flags.len = call i64 @valueStringLength(i64 %flags)
  %pattern.ptr = call ptr @valueStringPtr(i64 %pattern)
  %pattern.len = call i64 @valueStringLength(i64 %pattern)
  %valid = call i1 @regexValid(ptr %pattern.ptr, i64 %pattern.len, ptr %flags.ptr, i64 %flags.len)
  br i1 %valid, label %build, label %invalid
invalid:
  %message.prefix = call ptr @strConcat(i64 29, ptr @.regex.syntax.error.prefix, i64 %pattern.len, ptr %pattern.ptr)
  %message.prefix.len = add i64 29, %pattern.len
  %message.ptr = call ptr @strConcat(i64 %message.prefix.len, ptr %message.prefix, i64 31, ptr @.regex.syntax.error.suffix)
  %message.len = add i64 %message.prefix.len, 31
  %message = call i64 @valueBoxString(ptr %message.ptr, i64 %message.len)
  %error = call ptr @errorNew(i64 6, i64 11, ptr @.regex.syntax.error.name, i64 %message)
  %error.value = call i64 @valueBoxObject(ptr %error)
  %invalid.result.0 = insertvalue { i64, i1 } undef, i64 %error.value, 0
  %invalid.result = insertvalue { i64, i1 } %invalid.result.0, i1 true, 1
  ret { i64, i1 } %invalid.result
build:
  %object = call ptr @objectNew(i64 8)
  call void @objectSet(ptr %object, i64 6, ptr @.regex.source, i64 %pattern)
  call void @objectSet(ptr %object, i64 5, ptr @.regex.flags, i64 %flags)
  %i.addr = alloca i64
  %global.addr = alloca i1
  %ignore.addr = alloca i1
  %multiline.addr = alloca i1
  %sticky.addr = alloca i1
  store i64 0, ptr %i.addr
  store i1 false, ptr %global.addr
  store i1 false, ptr %ignore.addr
  store i1 false, ptr %multiline.addr
  store i1 false, ptr %sticky.addr
  br label %scan
scan:
  %i = load i64, ptr %i.addr
  %more = icmp ult i64 %i, %flags.len
  br i1 %more, label %scan.body, label %finish
scan.body:
  %ch.ptr = getelementptr i8, ptr %flags.ptr, i64 %i
  %ch = load i8, ptr %ch.ptr
  %is.g = icmp eq i8 %ch, 103
  %is.i = icmp eq i8 %ch, 105
  %is.m = icmp eq i8 %ch, 109
  %is.y = icmp eq i8 %ch, 121
  br i1 %is.g, label %set.g, label %check.i
set.g:
  store i1 true, ptr %global.addr
  br label %step
check.i:
  br i1 %is.i, label %set.i, label %check.m
set.i:
  store i1 true, ptr %ignore.addr
  br label %step
check.m:
  br i1 %is.m, label %set.m, label %check.y
set.m:
  store i1 true, ptr %multiline.addr
  br label %step
check.y:
  br i1 %is.y, label %set.y, label %step
set.y:
  store i1 true, ptr %sticky.addr
  br label %step
step:
  %next = add i64 %i, 1
  store i64 %next, ptr %i.addr
  br label %scan
finish:
  %global = load i1, ptr %global.addr
  %ignore = load i1, ptr %ignore.addr
  %multiline = load i1, ptr %multiline.addr
  %sticky = load i1, ptr %sticky.addr
  %global.value = select i1 %global, i64 ${legacyJsValue.immediate("true")}, i64 ${legacyJsValue.immediate("false")}
  %ignore.value = select i1 %ignore, i64 ${legacyJsValue.immediate("true")}, i64 ${legacyJsValue.immediate("false")}
  %multiline.value = select i1 %multiline, i64 ${legacyJsValue.immediate("true")}, i64 ${legacyJsValue.immediate("false")}
  %sticky.value = select i1 %sticky, i64 ${legacyJsValue.immediate("true")}, i64 ${legacyJsValue.immediate("false")}
  %zero = call i64 @valueBoxNumber(double 0.0)
  call void @objectSet(ptr %object, i64 6, ptr @.regex.global, i64 %global.value)
  call void @objectSet(ptr %object, i64 10, ptr @.regex.ignore.case, i64 %ignore.value)
  call void @objectSet(ptr %object, i64 9, ptr @.regex.multiline, i64 %multiline.value)
  call void @objectSet(ptr %object, i64 6, ptr @.regex.sticky, i64 %sticky.value)
  call void @objectSet(ptr %object, i64 9, ptr @.regex.last.index, i64 %zero)
  %boxed = call i64 @valueBoxObject(ptr %object)
  %result.0 = insertvalue { i64, i1 } undef, i64 %boxed, 0
  %result = insertvalue { i64, i1 } %result.0, i1 false, 1
  ret { i64, i1 } %result
}
`);
  }
  if (runtime.used.has("regexAtomEnd")) {
    definitions.push(`define i64 @regexAtomEnd(ptr %pattern, i64 %plen, i64 %pi) {
entry:
  %p = getelementptr i8, ptr %pattern, i64 %pi
  %ch = load i8, ptr %p
  %escape = icmp eq i8 %ch, 92
  br i1 %escape, label %escaped, label %class.check
escaped:
  %escaped.end = add i64 %pi, 2
  ret i64 %escaped.end
class.check:
  %class = icmp eq i8 %ch, 91
  br i1 %class, label %class.init, label %single
single:
  %single.wide = zext i8 %ch to i64
  %single.ascii.bits = and i64 %single.wide, 128
  %single.ascii = icmp eq i64 %single.ascii.bits, 0
  %single.two.bits = and i64 %single.wide, 224
  %single.two = icmp eq i64 %single.two.bits, 192
  %single.three.bits = and i64 %single.wide, 240
  %single.three = icmp eq i64 %single.three.bits, 224
  %single.non.ascii.width = select i1 %single.two, i64 2, i64 4
  %single.encoded.width = select i1 %single.three, i64 3, i64 %single.non.ascii.width
  %single.width = select i1 %single.ascii, i64 1, i64 %single.encoded.width
  %single.end = add i64 %pi, %single.width
  ret i64 %single.end
class.init:
  %start = add i64 %pi, 1
  br label %class.loop
class.loop:
  %i = phi i64 [ %start, %class.init ], [ %next, %class.step ]
  %in.range = icmp ult i64 %i, %plen
  br i1 %in.range, label %class.body, label %class.unclosed
class.body:
  %cp = getelementptr i8, ptr %pattern, i64 %i
  %cc = load i8, ptr %cp
  %close = icmp eq i8 %cc, 93
  br i1 %close, label %class.closed, label %class.step
class.step:
  %next = add i64 %i, 1
  br label %class.loop
class.closed:
  %closed.end = add i64 %i, 1
  ret i64 %closed.end
class.unclosed:
  ret i64 %plen
}
`);
  }
  if (runtime.used.has("regexDecodeUtf8")) {
    definitions.push(`define i64 @regexDecodeUtf8(ptr %bytes, i64 %position) {
entry:
  %p0 = getelementptr i8, ptr %bytes, i64 %position
  %b0.raw = load i8, ptr %p0
  %b0 = zext i8 %b0.raw to i64
  %ascii = icmp ult i64 %b0, 128
  br i1 %ascii, label %return.ascii, label %encoded
encoded:
  %two.bits = and i64 %b0, 224
  %two = icmp eq i64 %two.bits, 192
  %three.bits = and i64 %b0, 240
  %three = icmp eq i64 %three.bits, 224
  br i1 %two, label %decode.two, label %decode.three.check
decode.two:
  %i1 = add i64 %position, 1
  %p1 = getelementptr i8, ptr %bytes, i64 %i1
  %b1.raw = load i8, ptr %p1
  %b1 = zext i8 %b1.raw to i64
  %two.high.raw = and i64 %b0, 31
  %two.high = shl i64 %two.high.raw, 6
  %two.low = and i64 %b1, 63
  %two.codepoint = or i64 %two.high, %two.low
  %two.width = shl i64 2, 32
  %two.result = or i64 %two.width, %two.codepoint
  ret i64 %two.result
decode.three.check:
  br i1 %three, label %decode.three, label %decode.four
decode.three:
  %three.i1 = add i64 %position, 1
  %three.i2 = add i64 %position, 2
  %three.p1 = getelementptr i8, ptr %bytes, i64 %three.i1
  %three.p2 = getelementptr i8, ptr %bytes, i64 %three.i2
  %three.b1.raw = load i8, ptr %three.p1
  %three.b2.raw = load i8, ptr %three.p2
  %three.b1 = zext i8 %three.b1.raw to i64
  %three.b2 = zext i8 %three.b2.raw to i64
  %three.a.raw = and i64 %b0, 15
  %three.a = shl i64 %three.a.raw, 12
  %three.b.raw = and i64 %three.b1, 63
  %three.b = shl i64 %three.b.raw, 6
  %three.c = and i64 %three.b2, 63
  %three.ab = or i64 %three.a, %three.b
  %three.codepoint = or i64 %three.ab, %three.c
  %three.width = shl i64 3, 32
  %three.result = or i64 %three.width, %three.codepoint
  ret i64 %three.result
decode.four:
  %four.i1 = add i64 %position, 1
  %four.i2 = add i64 %position, 2
  %four.i3 = add i64 %position, 3
  %four.p1 = getelementptr i8, ptr %bytes, i64 %four.i1
  %four.p2 = getelementptr i8, ptr %bytes, i64 %four.i2
  %four.p3 = getelementptr i8, ptr %bytes, i64 %four.i3
  %four.b1.raw = load i8, ptr %four.p1
  %four.b2.raw = load i8, ptr %four.p2
  %four.b3.raw = load i8, ptr %four.p3
  %four.b1 = zext i8 %four.b1.raw to i64
  %four.b2 = zext i8 %four.b2.raw to i64
  %four.b3 = zext i8 %four.b3.raw to i64
  %four.a.raw = and i64 %b0, 7
  %four.a = shl i64 %four.a.raw, 18
  %four.b.raw = and i64 %four.b1, 63
  %four.b = shl i64 %four.b.raw, 12
  %four.c.raw = and i64 %four.b2, 63
  %four.c = shl i64 %four.c.raw, 6
  %four.d = and i64 %four.b3, 63
  %four.ab = or i64 %four.a, %four.b
  %four.abc = or i64 %four.ab, %four.c
  %four.codepoint = or i64 %four.abc, %four.d
  %four.width = shl i64 4, 32
  %four.result = or i64 %four.width, %four.codepoint
  ret i64 %four.result
return.ascii:
  %ascii.width = shl i64 1, 32
  %ascii.result = or i64 %ascii.width, %b0
  ret i64 %ascii.result
}
`);
  }
  if (runtime.used.has("regexAtomMatches")) {
    definitions.push(`define i1 @regexAtomMatches(ptr %pattern, i64 %plen, i64 %pi, ptr %subject, i64 %si, i64 %flag.bits) {
entry:
  %subject.decoded = call i64 @regexDecodeUtf8(ptr %subject, i64 %si)
  %subject.codepoint = and i64 %subject.decoded, 4294967295
  %subject.ch = trunc i64 %subject.codepoint to i8
  %p = getelementptr i8, ptr %pattern, i64 %pi
  %ch = load i8, ptr %p
  %escape = icmp eq i8 %ch, 92
  br i1 %escape, label %escaped, label %dot.check
escaped:
  %ei = add i64 %pi, 1
  %ep = getelementptr i8, ptr %pattern, i64 %ei
  %ec = load i8, ptr %ep
  %digit.class = icmp eq i8 %ec, 100
  %not.digit.class = icmp eq i8 %ec, 68
  %word.class = icmp eq i8 %ec, 119
  %not.word.class = icmp eq i8 %ec, 87
  %space.class = icmp eq i8 %ec, 115
  %not.space.class = icmp eq i8 %ec, 83
  %digit.lo = icmp uge i8 %subject.ch, 48
  %digit.hi = icmp ule i8 %subject.ch, 57
  %digit = and i1 %digit.lo, %digit.hi
  %alpha.lo.a = icmp uge i8 %subject.ch, 65
  %alpha.hi.a = icmp ule i8 %subject.ch, 90
  %alpha.a = and i1 %alpha.lo.a, %alpha.hi.a
  %alpha.lo.b = icmp uge i8 %subject.ch, 97
  %alpha.hi.b = icmp ule i8 %subject.ch, 122
  %alpha.b = and i1 %alpha.lo.b, %alpha.hi.b
  %alpha = or i1 %alpha.a, %alpha.b
  %underscore = icmp eq i8 %subject.ch, 95
  %word.0 = or i1 %alpha, %digit
  %word = or i1 %word.0, %underscore
  %space.0 = icmp eq i8 %subject.ch, 32
  %space.1 = icmp eq i8 %subject.ch, 9
  %space.2 = icmp eq i8 %subject.ch, 10
  %space.3 = icmp eq i8 %subject.ch, 13
  %space.a = or i1 %space.0, %space.1
  %space.b = or i1 %space.2, %space.3
  %space = or i1 %space.a, %space.b
  br i1 %digit.class, label %return.digit, label %escaped.not.digit
escaped.not.digit:
  br i1 %not.digit.class, label %return.not.digit, label %escaped.word
escaped.word:
  br i1 %word.class, label %return.word, label %escaped.not.word
escaped.not.word:
  br i1 %not.word.class, label %return.not.word, label %escaped.space
escaped.space:
  br i1 %space.class, label %return.space, label %escaped.not.space
escaped.not.space:
  br i1 %not.space.class, label %return.not.space, label %literal.escape
return.digit:
  ret i1 %digit
return.not.digit:
  %not.digit = xor i1 %digit, true
  ret i1 %not.digit
return.word:
  ret i1 %word
return.not.word:
  %not.word = xor i1 %word, true
  ret i1 %not.word
return.space:
  ret i1 %space
return.not.space:
  %not.space = xor i1 %space, true
  ret i1 %not.space
literal.escape:
  %literal.escape.codepoint = zext i8 %ec to i64
  br label %literal
dot.check:
  %dot = icmp eq i8 %ch, 46
  br i1 %dot, label %dot.match, label %class.check
dot.match:
  %dot.line.feed = icmp eq i8 %subject.ch, 10
  %dot.carriage.return = icmp eq i8 %subject.ch, 13
  %dot.line.terminator = or i1 %dot.line.feed, %dot.carriage.return
  %dot.accepted = xor i1 %dot.line.terminator, true
  ret i1 %dot.accepted
class.check:
  %class = icmp eq i8 %ch, 91
  br i1 %class, label %class.init, label %literal.direct
class.init:
  %first.i = add i64 %pi, 1
  %first.p = getelementptr i8, ptr %pattern, i64 %first.i
  %first.c = load i8, ptr %first.p
  %negated = icmp eq i8 %first.c, 94
  %scan.start.0 = add i64 %first.i, 1
  %scan.start = select i1 %negated, i64 %scan.start.0, i64 %first.i
  br label %class.loop
class.loop:
  %ci = phi i64 [ %scan.start, %class.init ], [ %ci.next, %class.step ], [ %range.next, %class.loop.from.range ]
  %ci.in = icmp ult i64 %ci, %plen
  br i1 %ci.in, label %class.body, label %class.finish
class.body:
  %cip = getelementptr i8, ptr %pattern, i64 %ci
  %cic = load i8, ptr %cip
  %class.decoded = call i64 @regexDecodeUtf8(ptr %pattern, i64 %ci)
  %class.codepoint = and i64 %class.decoded, 4294967295
  %class.width = lshr i64 %class.decoded, 32
  %ci.close = icmp eq i64 %class.codepoint, 93
  br i1 %ci.close, label %class.finish, label %class.compare
class.compare:
  %after.one = add i64 %ci, %class.width
  %after.two = add i64 %after.one, 1
  %range.in = icmp ult i64 %after.two, %plen
  br i1 %range.in, label %range.check, label %single.compare
range.check:
  %dash.p = getelementptr i8, ptr %pattern, i64 %after.one
  %dash = load i8, ptr %dash.p
  %is.range = icmp eq i8 %dash, 45
  br i1 %is.range, label %range.compare, label %single.compare
range.compare:
  %end.p = getelementptr i8, ptr %pattern, i64 %after.two
  %end.c = load i8, ptr %end.p
  %end.decoded = call i64 @regexDecodeUtf8(ptr %pattern, i64 %after.two)
  %end.codepoint = and i64 %end.decoded, 4294967295
  %end.width = lshr i64 %end.decoded, 32
  %range.lo = icmp uge i64 %subject.codepoint, %class.codepoint
  %range.hi = icmp ule i64 %subject.codepoint, %end.codepoint
  %range.match = and i1 %range.lo, %range.hi
  br i1 %range.match, label %class.matched, label %range.step
range.step:
  %range.next = add i64 %after.two, %end.width
  br label %class.loop.from.range
class.loop.from.range:
  br label %class.loop
single.compare:
  %single.match = icmp eq i64 %subject.codepoint, %class.codepoint
  br i1 %single.match, label %class.matched, label %class.step
class.step:
  %ci.next = add i64 %ci, %class.width
  br label %class.loop
class.matched:
  %match.result = xor i1 %negated, true
  ret i1 %match.result
class.finish:
  ret i1 %negated
literal.direct:
  %literal.decoded = call i64 @regexDecodeUtf8(ptr %pattern, i64 %pi)
  %literal.direct.codepoint = and i64 %literal.decoded, 4294967295
  br label %literal
literal:
  %literal.codepoint = phi i64 [ %literal.escape.codepoint, %literal.escape ], [ %literal.direct.codepoint, %literal.direct ]
  %literal.ch = trunc i64 %literal.codepoint to i8
  %ignore.masked = and i64 %flag.bits, 1
  %ignore = icmp ne i64 %ignore.masked, 0
  %pat.upper.lo = icmp uge i8 %literal.ch, 65
  %pat.upper.hi = icmp ule i8 %literal.ch, 90
  %pat.upper = and i1 %pat.upper.lo, %pat.upper.hi
  %pat.lowered = add i8 %literal.ch, 32
  %pat.folded = select i1 %pat.upper, i8 %pat.lowered, i8 %literal.ch
  %sub.upper.lo = icmp uge i8 %subject.ch, 65
  %sub.upper.hi = icmp ule i8 %subject.ch, 90
  %sub.upper = and i1 %sub.upper.lo, %sub.upper.hi
  %sub.lowered = add i8 %subject.ch, 32
  %sub.folded = select i1 %sub.upper, i8 %sub.lowered, i8 %subject.ch
  %plain.eq = icmp eq i64 %literal.codepoint, %subject.codepoint
  %fold.eq = icmp eq i8 %pat.folded, %sub.folded
  %literal.eq = select i1 %ignore, i1 %fold.eq, i1 %plain.eq
  ret i1 %literal.eq
return.true:
  ret i1 true
}
`);
  }
  if (runtime.used.has("regexAtomStep")) {
    definitions.push(`define i64 @regexAtomStep(ptr %pattern, i64 %pi, ptr %subject, i64 %si, i64 %flag.bits) {
entry:
  %pattern.ptr = getelementptr i8, ptr %pattern, i64 %pi
  %pattern.ch = load i8, ptr %pattern.ptr
  %pattern.dot = icmp eq i8 %pattern.ch, 46
  %pattern.class = icmp eq i8 %pattern.ch, 91
  %pattern.code.unit.atom = or i1 %pattern.dot, %pattern.class
  %subject.ptr = getelementptr i8, ptr %subject, i64 %si
  %subject.ch = load i8, ptr %subject.ptr
  %wide = zext i8 %subject.ch to i64
  %ascii.bits = and i64 %wide, 128
  %ascii = icmp eq i64 %ascii.bits, 0
  br i1 %ascii, label %single, label %encoded
encoded:
  %four.bits = and i64 %wide, 240
  %four = icmp eq i64 %four.bits, 240
  %three.bits = and i64 %wide, 224
  %three = icmp eq i64 %three.bits, 224
  %two.bits = and i64 %wide, 192
  %two = icmp eq i64 %two.bits, 192
  %unicode.mask = and i64 %flag.bits, 4
  %unicode = icmp ne i64 %unicode.mask, 0
  %not.unicode = xor i1 %unicode, true
  %split.four = and i1 %pattern.code.unit.atom, %not.unicode
  %four.unicode.step = select i1 %split.four, i64 2, i64 4
  %three.or.two.step = select i1 %three, i64 3, i64 2
  %lead.step = select i1 %four, i64 %four.unicode.step, i64 %three.or.two.step
  %continuation.step = select i1 %two, i64 %lead.step, i64 2
  ret i64 %continuation.step
single:
  ret i64 1
}
`);
  }
  if (runtime.used.has("regexQuantifierInfo")) {
    definitions.push(`define { i64, i64, i64, i1, i1 } @regexQuantifierInfo(ptr %pattern, i64 %plen, i64 %atom.end) {
entry:
  %minimum.addr = alloca i64
  %maximum.addr = alloca i64
  %rest.addr = alloca i64
  %lazy.addr = alloca i1
  %valid.addr = alloca i1
  %position.addr = alloca i64
  %digits.addr = alloca i64
  %value.addr = alloca i64
  store i64 0, ptr %minimum.addr
  store i64 0, ptr %maximum.addr
  store i64 %atom.end, ptr %rest.addr
  store i1 false, ptr %lazy.addr
  store i1 false, ptr %valid.addr
  %in.range = icmp ult i64 %atom.end, %plen
  br i1 %in.range, label %load, label %return
load:
  %pointer = getelementptr i8, ptr %pattern, i64 %atom.end
  %character = load i8, ptr %pointer
  %star = icmp eq i8 %character, 42
  %plus = icmp eq i8 %character, 43
  %question = icmp eq i8 %character, 63
  %brace = icmp eq i8 %character, 123
  br i1 %star, label %simple.star, label %simple.plus.check
simple.star:
  store i64 0, ptr %minimum.addr
  store i64 -1, ptr %maximum.addr
  br label %simple.finish
simple.plus.check:
  br i1 %plus, label %simple.plus, label %simple.question.check
simple.plus:
  store i64 1, ptr %minimum.addr
  store i64 -1, ptr %maximum.addr
  br label %simple.finish
simple.question.check:
  br i1 %question, label %simple.question, label %brace.check
simple.question:
  store i64 0, ptr %minimum.addr
  store i64 1, ptr %maximum.addr
  br label %simple.finish
simple.finish:
  %simple.rest = add i64 %atom.end, 1
  store i64 %simple.rest, ptr %rest.addr
  store i1 true, ptr %valid.addr
  br label %lazy.check
brace.check:
  br i1 %brace, label %minimum.init, label %return
minimum.init:
  %minimum.start = add i64 %atom.end, 1
  store i64 %minimum.start, ptr %position.addr
  store i64 0, ptr %digits.addr
  store i64 0, ptr %value.addr
  br label %minimum.loop
minimum.loop:
  %minimum.position = load i64, ptr %position.addr
  %minimum.in.range = icmp ult i64 %minimum.position, %plen
  br i1 %minimum.in.range, label %minimum.character, label %return
minimum.character:
  %minimum.pointer = getelementptr i8, ptr %pattern, i64 %minimum.position
  %minimum.character.value = load i8, ptr %minimum.pointer
  %minimum.digit.low = icmp uge i8 %minimum.character.value, 48
  %minimum.digit.high = icmp ule i8 %minimum.character.value, 57
  %minimum.is.digit = and i1 %minimum.digit.low, %minimum.digit.high
  br i1 %minimum.is.digit, label %minimum.digit, label %minimum.separator
minimum.digit:
  %minimum.value = load i64, ptr %value.addr
  %minimum.times.ten = mul i64 %minimum.value, 10
  %minimum.raw = zext i8 %minimum.character.value to i64
  %minimum.decimal = sub i64 %minimum.raw, 48
  %minimum.next.value = add i64 %minimum.times.ten, %minimum.decimal
  %minimum.digits = load i64, ptr %digits.addr
  %minimum.next.digits = add i64 %minimum.digits, 1
  %minimum.next.position = add i64 %minimum.position, 1
  store i64 %minimum.next.value, ptr %value.addr
  store i64 %minimum.next.digits, ptr %digits.addr
  store i64 %minimum.next.position, ptr %position.addr
  br label %minimum.loop
minimum.separator:
  %minimum.digit.count = load i64, ptr %digits.addr
  %has.minimum = icmp ugt i64 %minimum.digit.count, 0
  br i1 %has.minimum, label %minimum.separator.valid, label %return
minimum.separator.valid:
  %parsed.minimum = load i64, ptr %value.addr
  store i64 %parsed.minimum, ptr %minimum.addr
  %is.close = icmp eq i8 %minimum.character.value, 125
  %is.comma = icmp eq i8 %minimum.character.value, 44
  br i1 %is.close, label %exact, label %comma.check
exact:
  store i64 %parsed.minimum, ptr %maximum.addr
  %exact.rest = add i64 %minimum.position, 1
  store i64 %exact.rest, ptr %rest.addr
  store i1 true, ptr %valid.addr
  br label %lazy.check
comma.check:
  br i1 %is.comma, label %maximum.init, label %return
maximum.init:
  %maximum.start = add i64 %minimum.position, 1
  store i64 %maximum.start, ptr %position.addr
  store i64 0, ptr %digits.addr
  store i64 0, ptr %value.addr
  br label %maximum.loop
maximum.loop:
  %maximum.position = load i64, ptr %position.addr
  %maximum.in.range = icmp ult i64 %maximum.position, %plen
  br i1 %maximum.in.range, label %maximum.character, label %return
maximum.character:
  %maximum.pointer = getelementptr i8, ptr %pattern, i64 %maximum.position
  %maximum.character.value = load i8, ptr %maximum.pointer
  %maximum.is.close = icmp eq i8 %maximum.character.value, 125
  br i1 %maximum.is.close, label %maximum.finish, label %maximum.digit.check
maximum.digit.check:
  %maximum.digit.low = icmp uge i8 %maximum.character.value, 48
  %maximum.digit.high = icmp ule i8 %maximum.character.value, 57
  %maximum.is.digit = and i1 %maximum.digit.low, %maximum.digit.high
  br i1 %maximum.is.digit, label %maximum.digit, label %return
maximum.digit:
  %maximum.value = load i64, ptr %value.addr
  %maximum.times.ten = mul i64 %maximum.value, 10
  %maximum.raw = zext i8 %maximum.character.value to i64
  %maximum.decimal = sub i64 %maximum.raw, 48
  %maximum.next.value = add i64 %maximum.times.ten, %maximum.decimal
  %maximum.digits = load i64, ptr %digits.addr
  %maximum.next.digits = add i64 %maximum.digits, 1
  %maximum.next.position = add i64 %maximum.position, 1
  store i64 %maximum.next.value, ptr %value.addr
  store i64 %maximum.next.digits, ptr %digits.addr
  store i64 %maximum.next.position, ptr %position.addr
  br label %maximum.loop
maximum.finish:
  %maximum.digit.count = load i64, ptr %digits.addr
  %has.maximum = icmp ugt i64 %maximum.digit.count, 0
  %parsed.maximum = load i64, ptr %value.addr
  %maximum = select i1 %has.maximum, i64 %parsed.maximum, i64 -1
  %minimum.for.range = load i64, ptr %minimum.addr
  %unbounded = icmp slt i64 %maximum, 0
  %ordered = icmp uge i64 %maximum, %minimum.for.range
  %range.valid = or i1 %unbounded, %ordered
  br i1 %range.valid, label %maximum.store, label %return
maximum.store:
  store i64 %maximum, ptr %maximum.addr
  %range.rest = add i64 %maximum.position, 1
  store i64 %range.rest, ptr %rest.addr
  store i1 true, ptr %valid.addr
  br label %lazy.check
lazy.check:
  %rest = load i64, ptr %rest.addr
  %has.lazy = icmp ult i64 %rest, %plen
  br i1 %has.lazy, label %lazy.load, label %return
lazy.load:
  %lazy.pointer = getelementptr i8, ptr %pattern, i64 %rest
  %lazy.character = load i8, ptr %lazy.pointer
  %lazy = icmp eq i8 %lazy.character, 63
  br i1 %lazy, label %lazy.store, label %return
lazy.store:
  %lazy.rest = add i64 %rest, 1
  store i64 %lazy.rest, ptr %rest.addr
  store i1 true, ptr %lazy.addr
  br label %return
return:
  %minimum.result = load i64, ptr %minimum.addr
  %maximum.result = load i64, ptr %maximum.addr
  %rest.result = load i64, ptr %rest.addr
  %lazy.result = load i1, ptr %lazy.addr
  %valid.result = load i1, ptr %valid.addr
  %result.0 = insertvalue { i64, i64, i64, i1, i1 } undef, i64 %minimum.result, 0
  %result.1 = insertvalue { i64, i64, i64, i1, i1 } %result.0, i64 %maximum.result, 1
  %result.2 = insertvalue { i64, i64, i64, i1, i1 } %result.1, i64 %rest.result, 2
  %result.3 = insertvalue { i64, i64, i64, i1, i1 } %result.2, i1 %lazy.result, 3
  %result = insertvalue { i64, i64, i64, i1, i1 } %result.3, i1 %valid.result, 4
  ret { i64, i64, i64, i1, i1 } %result
}
`);
  }
  if (runtime.used.has("regexCaptureIndex")) {
    definitions.push(`define i64 @regexCaptureIndex(ptr %pattern, i64 %limit, i8 %marker) {
entry:
  br label %loop
loop:
  %position = phi i64 [ 0, %entry ], [ %next, %step ]
  %count = phi i64 [ 0, %entry ], [ %next.count, %step ]
  %done = icmp uge i64 %position, %limit
  br i1 %done, label %return, label %body
body:
  %pointer = getelementptr i8, ptr %pattern, i64 %position
  %character = load i8, ptr %pointer
  %matches = icmp eq i8 %character, %marker
  %increment = zext i1 %matches to i64
  %next.count = add i64 %count, %increment
  br label %step
step:
  %next = add i64 %position, 1
  br label %loop
return:
  ret i64 %count
}
`);
  }
  if (runtime.used.has("regexIsWordAt")) {
    definitions.push(`define i1 @regexIsWordAt(ptr %subject, i64 %length, i64 %index) {
entry:
  %nonnegative = icmp sge i64 %index, 0
  %in.range = icmp ult i64 %index, %length
  %valid = and i1 %nonnegative, %in.range
  br i1 %valid, label %load, label %not.word
load:
  %pointer = getelementptr i8, ptr %subject, i64 %index
  %character = load i8, ptr %pointer
  %upper.low = icmp uge i8 %character, 65
  %upper.high = icmp ule i8 %character, 90
  %upper = and i1 %upper.low, %upper.high
  %lower.low = icmp uge i8 %character, 97
  %lower.high = icmp ule i8 %character, 122
  %lower = and i1 %lower.low, %lower.high
  %digit.low = icmp uge i8 %character, 48
  %digit.high = icmp ule i8 %character, 57
  %digit = and i1 %digit.low, %digit.high
  %alpha = or i1 %upper, %lower
  %alphanumeric = or i1 %alpha, %digit
  %underscore = icmp eq i8 %character, 95
  %word = or i1 %alphanumeric, %underscore
  ret i1 %word
not.word:
  ret i1 false
}
`);
  }
  if (runtime.used.has("regexGroupEnd")) {
    definitions.push(`define i64 @regexGroupEnd(ptr %pattern, i64 %plen, i64 %open) {
entry:
  %position.addr = alloca i64
  %depth.addr = alloca i64
  %class.addr = alloca i1
  %escape.addr = alloca i1
  %first = add i64 %open, 1
  store i64 %first, ptr %position.addr
  store i64 1, ptr %depth.addr
  store i1 false, ptr %class.addr
  store i1 false, ptr %escape.addr
  br label %scan
scan:
  %position = load i64, ptr %position.addr
  %done = icmp uge i64 %position, %plen
  br i1 %done, label %failure, label %character
character:
  %pointer = getelementptr i8, ptr %pattern, i64 %position
  %value = load i8, ptr %pointer
  %escaped = load i1, ptr %escape.addr
  br i1 %escaped, label %clear.escape, label %escape.check
clear.escape:
  store i1 false, ptr %escape.addr
  br label %step
escape.check:
  %is.escape = icmp eq i8 %value, 92
  br i1 %is.escape, label %set.escape, label %class.start.check
set.escape:
  store i1 true, ptr %escape.addr
  br label %step
class.start.check:
  %in.class = load i1, ptr %class.addr
  %is.class.start = icmp eq i8 %value, 91
  %outside.class = xor i1 %in.class, true
  %starts.class = and i1 %is.class.start, %outside.class
  br i1 %starts.class, label %set.class, label %class.end.check
set.class:
  store i1 true, ptr %class.addr
  br label %step
class.end.check:
  %is.class.end = icmp eq i8 %value, 93
  %ends.class = and i1 %is.class.end, %in.class
  br i1 %ends.class, label %clear.class, label %group.check
clear.class:
  store i1 false, ptr %class.addr
  br label %step
group.check:
  br i1 %in.class, label %step, label %group.syntax
group.syntax:
  %is.open = icmp eq i8 %value, 40
  %is.close = icmp eq i8 %value, 41
  br i1 %is.open, label %open.group, label %close.check
open.group:
  %depth = load i64, ptr %depth.addr
  %deeper = add i64 %depth, 1
  store i64 %deeper, ptr %depth.addr
  br label %step
close.check:
  br i1 %is.close, label %close.group, label %step
close.group:
  %close.depth = load i64, ptr %depth.addr
  %outer = icmp eq i64 %close.depth, 1
  br i1 %outer, label %success, label %close.nested
close.nested:
  %shallower = sub i64 %close.depth, 1
  store i64 %shallower, ptr %depth.addr
  br label %step
step:
  %next = add i64 %position, 1
  store i64 %next, ptr %position.addr
  br label %scan
success:
  ret i64 %position
failure:
  ret i64 -1
}
`);
  }
  if (runtime.used.has("regexMatchHere")) {
    definitions.push(`define i64 @regexMatchHere(ptr %pattern, i64 %plen, i64 %pi, ptr %subject, i64 %slen, i64 %si, i64 %flag.bits) {
entry:
  %pattern.done = icmp uge i64 %pi, %plen
  br i1 %pattern.done, label %success, label %anchor.start.check
anchor.start.check:
  %p = getelementptr i8, ptr %pattern, i64 %pi
  %ch = load i8, ptr %p
  %is.anchor.start = icmp eq i8 %ch, 94
  br i1 %is.anchor.start, label %anchor.start, label %anchor.end.check
anchor.start:
  %at.start = icmp eq i64 %si, 0
  %multiline.mask = and i64 %flag.bits, 2
  %multiline = icmp ne i64 %multiline.mask, 0
  %has.previous = icmp ugt i64 %si, 0
  %check.previous = and i1 %multiline, %has.previous
  br i1 %at.start, label %anchor.start.next, label %anchor.start.multiline
anchor.start.multiline:
  br i1 %check.previous, label %anchor.start.previous, label %failure
anchor.start.previous:
  %previous.i = sub i64 %si, 1
  %previous.p = getelementptr i8, ptr %subject, i64 %previous.i
  %previous.ch = load i8, ptr %previous.p
  %after.newline = icmp eq i8 %previous.ch, 10
  br i1 %after.newline, label %anchor.start.next, label %failure
anchor.start.next:
  %pi.after.start = add i64 %pi, 1
  %start.result = call i64 @regexMatchHere(ptr %pattern, i64 %plen, i64 %pi.after.start, ptr %subject, i64 %slen, i64 %si, i64 %flag.bits)
  ret i64 %start.result
anchor.end.check:
  %is.anchor.end = icmp eq i8 %ch, 36
  %last.pi = add i64 %pi, 1
  %anchor.is.last = icmp eq i64 %last.pi, %plen
  %use.end = and i1 %is.anchor.end, %anchor.is.last
  br i1 %use.end, label %anchor.end, label %group.check
anchor.end:
  %at.end = icmp eq i64 %si, %slen
  %end.multiline.mask = and i64 %flag.bits, 2
  %end.multiline = icmp ne i64 %end.multiline.mask, 0
  %before.subject.end = icmp ult i64 %si, %slen
  %can.check.newline = and i1 %end.multiline, %before.subject.end
  br i1 %at.end, label %success, label %anchor.end.multiline
anchor.end.multiline:
  br i1 %can.check.newline, label %anchor.end.current, label %failure
anchor.end.current:
  %current.p = getelementptr i8, ptr %subject, i64 %si
  %current.ch = load i8, ptr %current.p
  %before.newline = icmp eq i8 %current.ch, 10
  br i1 %before.newline, label %success, label %failure
group.check:
  %is.group.start = icmp eq i8 %ch, 40
  %is.group.end = icmp eq i8 %ch, 41
  br i1 %is.group.start, label %group.start, label %group.end.check
group.start:
  %group.close = call i64 @regexGroupEnd(ptr %pattern, i64 %plen, i64 %pi)
  %group.closed = icmp sge i64 %group.close, 0
  br i1 %group.closed, label %group.describe, label %failure
group.describe:
  %group.after.open = add i64 %pi, 1
  %group.prefix.remaining = sub i64 %plen, %group.after.open
  %group.has.prefix = icmp uge i64 %group.prefix.remaining, 2
  br i1 %group.has.prefix, label %group.prefix, label %group.capturing
group.prefix:
  %group.prefix.pointer = getelementptr i8, ptr %pattern, i64 %group.after.open
  %group.prefix.first = load i8, ptr %group.prefix.pointer
  %group.prefix.second.index = add i64 %group.after.open, 1
  %group.prefix.second.pointer = getelementptr i8, ptr %pattern, i64 %group.prefix.second.index
  %group.prefix.second = load i8, ptr %group.prefix.second.pointer
  %group.prefix.question = icmp eq i8 %group.prefix.first, 63
  %group.prefix.colon = icmp eq i8 %group.prefix.second, 58
  %group.non.capturing = and i1 %group.prefix.question, %group.prefix.colon
  br i1 %group.non.capturing, label %group.non.capturing.setup, label %group.capturing
group.non.capturing.setup:
  %group.non.capturing.start = add i64 %group.after.open, 2
  br label %group.ready
group.capturing:
  %prior.starts = call i64 @regexCaptureIndex(ptr %pattern, i64 %pi, i8 40)
  %group.number = add i64 %prior.starts, 1
  %group.in.range = icmp ult i64 %group.number, 10
  br i1 %group.in.range, label %group.capturing.setup, label %failure
group.capturing.setup:
  %group.start.slot = getelementptr [10 x i64], ptr @regex.capture.starts, i64 0, i64 %group.number
  %group.end.slot = getelementptr [10 x i64], ptr @regex.capture.ends, i64 0, i64 %group.number
  br label %group.ready
group.ready:
  %group.content.start = phi i64 [ %group.non.capturing.start, %group.non.capturing.setup ], [ %group.after.open, %group.capturing.setup ]
  %group.capture.start.slot = phi ptr [ null, %group.non.capturing.setup ], [ %group.start.slot, %group.capturing.setup ]
  %group.capture.end.slot = phi ptr [ null, %group.non.capturing.setup ], [ %group.end.slot, %group.capturing.setup ]
  %group.is.capturing = phi i1 [ false, %group.non.capturing.setup ], [ true, %group.capturing.setup ]
  %group.length = sub i64 %group.close, %group.content.start
  %group.pointer = getelementptr i8, ptr %pattern, i64 %group.content.start
  %group.atom.end = add i64 %group.close, 1
  %group.quant.info = call { i64, i64, i64, i1, i1 } @regexQuantifierInfo(ptr %pattern, i64 %plen, i64 %group.atom.end)
  %group.minimum = extractvalue { i64, i64, i64, i1, i1 } %group.quant.info, 0
  %group.maximum = extractvalue { i64, i64, i64, i1, i1 } %group.quant.info, 1
  %group.rest = extractvalue { i64, i64, i64, i1, i1 } %group.quant.info, 2
  %group.lazy = extractvalue { i64, i64, i64, i1, i1 } %group.quant.info, 3
  %group.quantified = extractvalue { i64, i64, i64, i1, i1 } %group.quant.info, 4
  br i1 %group.quantified, label %group.quant.init, label %group.once
group.once:
  br i1 %group.is.capturing, label %group.once.capture.start, label %group.once.match
group.once.capture.start:
  store i64 %si, ptr %group.capture.start.slot
  br label %group.once.match
group.once.match:
  %group.once.end = call i64 @regexMatchAlternatives(ptr %group.pointer, i64 %group.length, ptr %subject, i64 %slen, i64 %si, i64 %flag.bits)
  %group.once.matched = icmp sge i64 %group.once.end, 0
  br i1 %group.once.matched, label %group.once.finish, label %failure
group.once.finish:
  br i1 %group.is.capturing, label %group.once.capture.end, label %group.once.rest
group.once.capture.end:
  store i64 %group.once.end, ptr %group.capture.end.slot
  br label %group.once.rest
group.once.rest:
  %group.once.result = call i64 @regexMatchHere(ptr %pattern, i64 %plen, i64 %group.atom.end, ptr %subject, i64 %slen, i64 %group.once.end, i64 %flag.bits)
  ret i64 %group.once.result
group.quant.init:
  %group.positions.capacity = add i64 %slen, 2
  %group.positions = alloca i64, i64 %group.positions.capacity
  %group.position.addr = alloca i64
  %group.count.addr = alloca i64
  %group.initial.slot = getelementptr i64, ptr %group.positions, i64 0
  store i64 %si, ptr %group.initial.slot
  store i64 %si, ptr %group.position.addr
  store i64 0, ptr %group.count.addr
  br label %group.consume
group.consume:
  %group.position = load i64, ptr %group.position.addr
  %group.count = load i64, ptr %group.count.addr
  %group.bounded = icmp sge i64 %group.maximum, 0
  %group.at.maximum = icmp uge i64 %group.count, %group.maximum
  %group.maximum.reached = and i1 %group.bounded, %group.at.maximum
  br i1 %group.maximum.reached, label %group.choose, label %group.consume.capture
group.consume.capture:
  br i1 %group.is.capturing, label %group.consume.capture.start, label %group.consume.match
group.consume.capture.start:
  store i64 %group.position, ptr %group.capture.start.slot
  br label %group.consume.match
group.consume.match:
  %group.next.end = call i64 @regexMatchAlternatives(ptr %group.pointer, i64 %group.length, ptr %subject, i64 %slen, i64 %group.position, i64 %flag.bits)
  %group.next.matched = icmp sge i64 %group.next.end, 0
  %group.made.progress = icmp ugt i64 %group.next.end, %group.position
  %group.can.consume = and i1 %group.next.matched, %group.made.progress
  br i1 %group.can.consume, label %group.consume.store, label %group.choose
group.consume.store:
  %group.next.count = add i64 %group.count, 1
  %group.next.slot = getelementptr i64, ptr %group.positions, i64 %group.next.count
  store i64 %group.next.end, ptr %group.next.slot
  store i64 %group.next.end, ptr %group.position.addr
  store i64 %group.next.count, ptr %group.count.addr
  br i1 %group.is.capturing, label %group.consume.capture.end, label %group.consume
group.consume.capture.end:
  store i64 %group.next.end, ptr %group.capture.end.slot
  br label %group.consume
group.choose:
  %group.consumed = load i64, ptr %group.count.addr
  %group.minimum.met = icmp uge i64 %group.consumed, %group.minimum
  br i1 %group.minimum.met, label %group.choose.order, label %failure
group.choose.order:
  br i1 %group.lazy, label %group.lazy.init, label %group.greedy.init
group.greedy.init:
  %group.candidate.count.addr = alloca i64
  store i64 %group.consumed, ptr %group.candidate.count.addr
  br label %group.greedy
group.greedy:
  %group.candidate.count = load i64, ptr %group.candidate.count.addr
  %group.candidate.slot = getelementptr i64, ptr %group.positions, i64 %group.candidate.count
  %group.candidate.position = load i64, ptr %group.candidate.slot
  %group.candidate.result = call i64 @regexMatchHere(ptr %pattern, i64 %plen, i64 %group.rest, ptr %subject, i64 %slen, i64 %group.candidate.position, i64 %flag.bits)
  %group.candidate.ok = icmp sge i64 %group.candidate.result, 0
  br i1 %group.candidate.ok, label %group.return.greedy, label %group.greedy.more
group.greedy.more:
  %group.can.decrease = icmp ugt i64 %group.candidate.count, %group.minimum
  br i1 %group.can.decrease, label %group.greedy.step, label %failure
group.greedy.step:
  %group.previous.count = sub i64 %group.candidate.count, 1
  store i64 %group.previous.count, ptr %group.candidate.count.addr
  br label %group.greedy
group.lazy.init:
  %group.lazy.count.addr = alloca i64
  store i64 %group.minimum, ptr %group.lazy.count.addr
  br label %group.lazy.try
group.lazy.try:
  %group.lazy.count = load i64, ptr %group.lazy.count.addr
  %group.lazy.slot = getelementptr i64, ptr %group.positions, i64 %group.lazy.count
  %group.lazy.position = load i64, ptr %group.lazy.slot
  %group.lazy.result = call i64 @regexMatchHere(ptr %pattern, i64 %plen, i64 %group.rest, ptr %subject, i64 %slen, i64 %group.lazy.position, i64 %flag.bits)
  %group.lazy.ok = icmp sge i64 %group.lazy.result, 0
  br i1 %group.lazy.ok, label %group.return.lazy, label %group.lazy.more
group.lazy.more:
  %group.can.increase = icmp ult i64 %group.lazy.count, %group.consumed
  br i1 %group.can.increase, label %group.lazy.step, label %failure
group.lazy.step:
  %group.following.count = add i64 %group.lazy.count, 1
  store i64 %group.following.count, ptr %group.lazy.count.addr
  br label %group.lazy.try
group.return.greedy:
  ret i64 %group.candidate.result
group.return.lazy:
  ret i64 %group.lazy.result
group.end.check:
  br i1 %is.group.end, label %failure, label %backref.escape.check
backref.escape.check:
  %is.escape = icmp eq i8 %ch, 92
  %backref.next.pi = add i64 %pi, 1
  %backref.has.next = icmp ult i64 %backref.next.pi, %plen
  %can.be.backref = and i1 %is.escape, %backref.has.next
  br i1 %can.be.backref, label %backref.digit.check, label %atom
backref.digit.check:
  %backref.next.ptr = getelementptr i8, ptr %pattern, i64 %backref.next.pi
  %backref.next.ch = load i8, ptr %backref.next.ptr
  %boundary.positive = icmp eq i8 %backref.next.ch, 98
  %boundary.negative = icmp eq i8 %backref.next.ch, 66
  %is.boundary.escape = or i1 %boundary.positive, %boundary.negative
  br i1 %is.boundary.escape, label %boundary, label %backref.number.check
boundary:
  %previous.index = sub i64 %si, 1
  %previous.word = call i1 @regexIsWordAt(ptr %subject, i64 %slen, i64 %previous.index)
  %current.word = call i1 @regexIsWordAt(ptr %subject, i64 %slen, i64 %si)
  %at.boundary = xor i1 %previous.word, %current.word
  %boundary.accepted = icmp eq i1 %at.boundary, %boundary.positive
  br i1 %boundary.accepted, label %boundary.next, label %failure
boundary.next:
  %after.boundary = add i64 %pi, 2
  %boundary.result = call i64 @regexMatchHere(ptr %pattern, i64 %plen, i64 %after.boundary, ptr %subject, i64 %slen, i64 %si, i64 %flag.bits)
  ret i64 %boundary.result
backref.number.check:
  %backref.digit.low = icmp uge i8 %backref.next.ch, 49
  %backref.digit.high = icmp ule i8 %backref.next.ch, 57
  %is.backref = and i1 %backref.digit.low, %backref.digit.high
  br i1 %is.backref, label %backref, label %atom
backref:
  %backref.raw = zext i8 %backref.next.ch to i64
  %backref.number = sub i64 %backref.raw, 48
  %backref.start.slot = getelementptr [10 x i64], ptr @regex.capture.starts, i64 0, i64 %backref.number
  %backref.end.slot = getelementptr [10 x i64], ptr @regex.capture.ends, i64 0, i64 %backref.number
  %backref.start = load i64, ptr %backref.start.slot
  %backref.end = load i64, ptr %backref.end.slot
  %backref.captured = icmp sge i64 %backref.start, 0
  %backref.length = sub i64 %backref.end, %backref.start
  %backref.subject.end = add i64 %si, %backref.length
  %backref.in.range = icmp ule i64 %backref.subject.end, %slen
  %backref.can.compare = and i1 %backref.captured, %backref.in.range
  br i1 %backref.can.compare, label %backref.compare, label %failure
backref.compare:
  %backref.expected = getelementptr i8, ptr %subject, i64 %backref.start
  %backref.actual = getelementptr i8, ptr %subject, i64 %si
  %backref.comparison = call i32 @memcmp(ptr %backref.expected, ptr %backref.actual, i64 %backref.length)
  %backref.matches = icmp eq i32 %backref.comparison, 0
  br i1 %backref.matches, label %backref.next, label %failure
backref.next:
  %after.backref = add i64 %pi, 2
  %backref.result = call i64 @regexMatchHere(ptr %pattern, i64 %plen, i64 %after.backref, ptr %subject, i64 %slen, i64 %backref.subject.end, i64 %flag.bits)
  ret i64 %backref.result
atom:
  %atom.end = call i64 @regexAtomEnd(ptr %pattern, i64 %plen, i64 %pi)
  %has.quant = icmp ult i64 %atom.end, %plen
  br i1 %has.quant, label %quant.load, label %single
quant.load:
  %quant.info = call { i64, i64, i64, i1, i1 } @regexQuantifierInfo(ptr %pattern, i64 %plen, i64 %atom.end)
  %minimum = extractvalue { i64, i64, i64, i1, i1 } %quant.info, 0
  %maximum = extractvalue { i64, i64, i64, i1, i1 } %quant.info, 1
  %rest.pi = extractvalue { i64, i64, i64, i1, i1 } %quant.info, 2
  %lazy = extractvalue { i64, i64, i64, i1, i1 } %quant.info, 3
  %quantified = extractvalue { i64, i64, i64, i1, i1 } %quant.info, 4
  br i1 %quantified, label %quant.init, label %single
single:
  %subject.done = icmp uge i64 %si, %slen
  br i1 %subject.done, label %failure, label %single.match
single.match:
  %sp = getelementptr i8, ptr %subject, i64 %si
  %sc = load i8, ptr %sp
  %matches = call i1 @regexAtomMatches(ptr %pattern, i64 %plen, i64 %pi, ptr %subject, i64 %si, i64 %flag.bits)
  br i1 %matches, label %single.next, label %failure
single.next:
  %single.step = call i64 @regexAtomStep(ptr %pattern, i64 %pi, ptr %subject, i64 %si, i64 %flag.bits)
  %next.si = add i64 %si, %single.step
  %single.result = call i64 @regexMatchHere(ptr %pattern, i64 %plen, i64 %atom.end, ptr %subject, i64 %slen, i64 %next.si, i64 %flag.bits)
  ret i64 %single.result
quant.init:
  %quant.position.addr = alloca i64
  %quant.count.addr = alloca i64
  store i64 %si, ptr %quant.position.addr
  store i64 0, ptr %quant.count.addr
  br label %consume
consume:
  %position = load i64, ptr %quant.position.addr
  %count = load i64, ptr %quant.count.addr
  %bounded = icmp sge i64 %maximum, 0
  %at.maximum = icmp uge i64 %count, %maximum
  %maximum.reached = and i1 %bounded, %at.maximum
  br i1 %maximum.reached, label %backtrack.init, label %consume.range
consume.range:
  %position.in = icmp ult i64 %position, %slen
  br i1 %position.in, label %consume.match, label %backtrack.init
consume.match:
  %consume.p = getelementptr i8, ptr %subject, i64 %position
  %consume.ch = load i8, ptr %consume.p
  %consume.matches = call i1 @regexAtomMatches(ptr %pattern, i64 %plen, i64 %pi, ptr %subject, i64 %position, i64 %flag.bits)
  br i1 %consume.matches, label %consume.step, label %backtrack.init
consume.step:
  %consume.step.size = call i64 @regexAtomStep(ptr %pattern, i64 %pi, ptr %subject, i64 %position, i64 %flag.bits)
  %position.next = add i64 %position, %consume.step.size
  %count.next = add i64 %count, 1
  store i64 %position.next, ptr %quant.position.addr
  store i64 %count.next, ptr %quant.count.addr
  br label %consume
backtrack.init:
  %consumed.count = load i64, ptr %quant.count.addr
  %minimum.met = icmp uge i64 %consumed.count, %minimum
  br i1 %minimum.met, label %backtrack.choose, label %failure
backtrack.choose:
  %max.position = load i64, ptr %quant.position.addr
  %minimum.position = add i64 %si, %minimum
  br i1 %lazy, label %lazy.init, label %greedy.init
greedy.init:
  %greedy.candidate.addr = alloca i64
  store i64 %max.position, ptr %greedy.candidate.addr
  br label %greedy.backtrack
greedy.backtrack:
  %candidate = load i64, ptr %greedy.candidate.addr
  %candidate.result = call i64 @regexMatchHere(ptr %pattern, i64 %plen, i64 %rest.pi, ptr %subject, i64 %slen, i64 %candidate, i64 %flag.bits)
  %candidate.ok = icmp sge i64 %candidate.result, 0
  br i1 %candidate.ok, label %return.candidate, label %greedy.check
greedy.check:
  %can.backtrack = icmp ugt i64 %candidate, %minimum.position
  br i1 %can.backtrack, label %greedy.step, label %failure
greedy.step:
  %candidate.prev = sub i64 %candidate, 1
  store i64 %candidate.prev, ptr %greedy.candidate.addr
  br label %greedy.backtrack
lazy.init:
  %lazy.candidate.addr = alloca i64
  store i64 %minimum.position, ptr %lazy.candidate.addr
  br label %lazy.backtrack
lazy.backtrack:
  %lazy.candidate = load i64, ptr %lazy.candidate.addr
  %lazy.candidate.result = call i64 @regexMatchHere(ptr %pattern, i64 %plen, i64 %rest.pi, ptr %subject, i64 %slen, i64 %lazy.candidate, i64 %flag.bits)
  %lazy.candidate.ok = icmp sge i64 %lazy.candidate.result, 0
  br i1 %lazy.candidate.ok, label %return.lazy.candidate, label %lazy.check.more
lazy.check.more:
  %lazy.can.advance = icmp ult i64 %lazy.candidate, %max.position
  br i1 %lazy.can.advance, label %lazy.step, label %failure
lazy.step:
  %lazy.candidate.next = add i64 %lazy.candidate, 1
  store i64 %lazy.candidate.next, ptr %lazy.candidate.addr
  br label %lazy.backtrack
return.candidate:
  ret i64 %candidate.result
return.lazy.candidate:
  ret i64 %lazy.candidate.result
success:
  ret i64 %si
failure:
  ret i64 -1
}
`);
  }
  if (runtime.used.has("regexMatchAlternatives")) {
    definitions.push(`define i64 @regexMatchAlternatives(ptr %pattern, i64 %plen, ptr %subject, i64 %slen, i64 %si, i64 %flag.bits) {
entry:
  %start.addr = alloca i64
  %position.addr = alloca i64
  %class.addr = alloca i1
  %escape.addr = alloca i1
  %depth.addr = alloca i64
  store i64 0, ptr %start.addr
  store i64 0, ptr %position.addr
  store i1 false, ptr %class.addr
  store i1 false, ptr %escape.addr
  store i64 0, ptr %depth.addr
  br label %scan
scan:
  %position = load i64, ptr %position.addr
  %at.end = icmp uge i64 %position, %plen
  br i1 %at.end, label %attempt, label %character
character:
  %pointer = getelementptr i8, ptr %pattern, i64 %position
  %character.value = load i8, ptr %pointer
  %escaped = load i1, ptr %escape.addr
  br i1 %escaped, label %clear.escape, label %syntax
clear.escape:
  store i1 false, ptr %escape.addr
  br label %step
syntax:
  %is.escape = icmp eq i8 %character.value, 92
  br i1 %is.escape, label %set.escape, label %class.start.check
set.escape:
  store i1 true, ptr %escape.addr
  br label %step
class.start.check:
  %is.class.start = icmp eq i8 %character.value, 91
  br i1 %is.class.start, label %set.class, label %class.end.check
set.class:
  store i1 true, ptr %class.addr
  br label %step
class.end.check:
  %is.class.end = icmp eq i8 %character.value, 93
  br i1 %is.class.end, label %clear.class, label %group.check
clear.class:
  store i1 false, ptr %class.addr
  br label %step
group.check:
  %group.in.class = load i1, ptr %class.addr
  br i1 %group.in.class, label %step, label %group.syntax
group.syntax:
  %is.group.open = icmp eq i8 %character.value, 40
  %is.group.close = icmp eq i8 %character.value, 41
  br i1 %is.group.open, label %group.open, label %group.close.check
group.open:
  %group.depth = load i64, ptr %depth.addr
  %group.deeper = add i64 %group.depth, 1
  store i64 %group.deeper, ptr %depth.addr
  br label %step
group.close.check:
  br i1 %is.group.close, label %group.close, label %alternative.check
group.close:
  %group.close.depth = load i64, ptr %depth.addr
  %group.has.parent = icmp ugt i64 %group.close.depth, 0
  br i1 %group.has.parent, label %group.close.valid, label %step
group.close.valid:
  %group.shallower = sub i64 %group.close.depth, 1
  store i64 %group.shallower, ptr %depth.addr
  br label %step
alternative.check:
  %in.class = load i1, ptr %class.addr
  %alternative.depth = load i64, ptr %depth.addr
  %is.bar = icmp eq i8 %character.value, 124
  %outside.class = xor i1 %in.class, true
  %outside.group = icmp eq i64 %alternative.depth, 0
  %bar.outside.class = and i1 %is.bar, %outside.class
  %is.alternative = and i1 %bar.outside.class, %outside.group
  br i1 %is.alternative, label %attempt, label %step
step:
  %next.position = add i64 %position, 1
  store i64 %next.position, ptr %position.addr
  br label %scan
attempt:
  %start = load i64, ptr %start.addr
  %segment.len = sub i64 %position, %start
  %segment.ptr = getelementptr i8, ptr %pattern, i64 %start
  %result = call i64 @regexMatchHere(ptr %segment.ptr, i64 %segment.len, i64 0, ptr %subject, i64 %slen, i64 %si, i64 %flag.bits)
  %matched = icmp sge i64 %result, 0
  br i1 %matched, label %return, label %next.alternative
next.alternative:
  br i1 %at.end, label %failure, label %advance.alternative
advance.alternative:
  %next.start = add i64 %position, 1
  store i64 %next.start, ptr %start.addr
  store i64 %next.start, ptr %position.addr
  br label %scan
return:
  ret i64 %result
failure:
  ret i64 -1
}
`);
  }
  if (runtime.used.has("regexUtf16Index")) {
    definitions.push(`define i64 @regexUtf16Index(ptr %bytes, i64 %byte.offset) {
entry:
  br label %loop
loop:
  %position = phi i64 [ 0, %entry ], [ %next.position, %step ]
  %units = phi i64 [ 0, %entry ], [ %next.units, %step ]
  %done = icmp uge i64 %position, %byte.offset
  br i1 %done, label %return, label %decode
decode:
  %pointer = getelementptr i8, ptr %bytes, i64 %position
  %byte = load i8, ptr %pointer
  %wide = zext i8 %byte to i64
  %ascii.bits = and i64 %wide, 128
  %ascii = icmp eq i64 %ascii.bits, 0
  %four.bits = and i64 %wide, 240
  %four = icmp eq i64 %four.bits, 240
  %three.bits = and i64 %wide, 224
  %three = icmp eq i64 %three.bits, 224
  %non.ascii.step = select i1 %three, i64 3, i64 2
  %encoded.step = select i1 %four, i64 4, i64 %non.ascii.step
  %byte.step = select i1 %ascii, i64 1, i64 %encoded.step
  %unit.step = select i1 %four, i64 2, i64 1
  br label %step
step:
  %next.position = add i64 %position, %byte.step
  %next.units = add i64 %units, %unit.step
  br label %loop
return:
  ret i64 %units
}
`);
  }
  if (runtime.used.has("regexByteOffset")) {
    definitions.push(`define i64 @regexByteOffset(ptr %bytes, i64 %byte.length, i64 %unit.offset) {
entry:
  br label %loop
loop:
  %position = phi i64 [ 0, %entry ], [ %next.position, %step ]
  %units = phi i64 [ 0, %entry ], [ %next.units, %step ]
  %unit.done = icmp uge i64 %units, %unit.offset
  %byte.done = icmp uge i64 %position, %byte.length
  %done = or i1 %unit.done, %byte.done
  br i1 %done, label %return, label %decode
decode:
  %pointer = getelementptr i8, ptr %bytes, i64 %position
  %byte = load i8, ptr %pointer
  %wide = zext i8 %byte to i64
  %ascii.bits = and i64 %wide, 128
  %ascii = icmp eq i64 %ascii.bits, 0
  %four.bits = and i64 %wide, 240
  %four = icmp eq i64 %four.bits, 240
  %three.bits = and i64 %wide, 224
  %three = icmp eq i64 %three.bits, 224
  %non.ascii.step = select i1 %three, i64 3, i64 2
  %encoded.step = select i1 %four, i64 4, i64 %non.ascii.step
  %byte.step = select i1 %ascii, i64 1, i64 %encoded.step
  %unit.step = select i1 %four, i64 2, i64 1
  br label %step
step:
  %next.position = add i64 %position, %byte.step
  %next.units = add i64 %units, %unit.step
  br label %loop
return:
  ret i64 %position
}
`);
  }
  if (runtime.used.has("regexFind")) {
    // ADR 0008: regexFind keeps a raw i64 return because it cannot produce a
    // JS-observable exception. It only reads RegExp slots, coerces the
    // engine-maintained lastIndex number, and runs the byte matcher; every
    // callee (objectGet/objectSet, valueString*, valueNumber, valueBoxNumber,
    // regexByteOffset, regexUtf16Index, regexMatchAlternatives) is a
    // non-throwing scalar helper with no error channel.
    definitions.push(`define i64 @regexFind(i64 %regex, i64 %input) {
entry:
  %object = call ptr @valueObjectPtr(i64 %regex)
  %source.value = call i64 @objectGet(ptr %object, i64 6, ptr @.regex.source)
  %flags.value = call i64 @objectGet(ptr %object, i64 5, ptr @.regex.flags)
  %last.value = call i64 @objectGet(ptr %object, i64 9, ptr @.regex.last.index)
  %global.value = call i64 @objectGet(ptr %object, i64 6, ptr @.regex.global)
  %sticky.value = call i64 @objectGet(ptr %object, i64 6, ptr @.regex.sticky)
  %ignore.value = call i64 @objectGet(ptr %object, i64 10, ptr @.regex.ignore.case)
  %multiline.value = call i64 @objectGet(ptr %object, i64 9, ptr @.regex.multiline)
  %source.ptr = call ptr @valueStringPtr(i64 %source.value)
  %source.len = call i64 @valueStringLength(i64 %source.value)
  %input.ptr = call ptr @valueStringPtr(i64 %input)
  %input.len = call i64 @valueStringLength(i64 %input)
  %last.number = call double @valueNumber(i64 %last.value)
  %last.index = fptoui double %last.number to i64
  %is.global = icmp eq i64 %global.value, ${legacyJsValue.immediate("true")}
  %is.sticky = icmp eq i64 %sticky.value, ${legacyJsValue.immediate("true")}
  %uses.last = or i1 %is.global, %is.sticky
  %last.byte = call i64 @regexByteOffset(ptr %input.ptr, i64 %input.len, i64 %last.index)
  %start = select i1 %uses.last, i64 %last.byte, i64 0
  %ignore = icmp eq i64 %ignore.value, ${legacyJsValue.immediate("true")}
  %multiline = icmp eq i64 %multiline.value, ${legacyJsValue.immediate("true")}
  %ignore.bit = zext i1 %ignore to i64
  %multiline.raw = zext i1 %multiline to i64
  %multiline.bit = shl i64 %multiline.raw, 1
  %flag.bits.0 = or i64 %ignore.bit, %multiline.bit
  %flags.ptr = call ptr @valueStringPtr(i64 %flags.value)
  %flags.len = call i64 @valueStringLength(i64 %flags.value)
  %flag.scan.addr = alloca i64
  %unicode.addr = alloca i1
  store i64 0, ptr %flag.scan.addr
  store i1 false, ptr %unicode.addr
  br label %flag.scan
flag.scan:
  %flag.scan.index = load i64, ptr %flag.scan.addr
  %flag.scan.done = icmp uge i64 %flag.scan.index, %flags.len
  br i1 %flag.scan.done, label %flag.scanned, label %flag.scan.body
flag.scan.body:
  %flag.scan.ptr = getelementptr i8, ptr %flags.ptr, i64 %flag.scan.index
  %flag.scan.ch = load i8, ptr %flag.scan.ptr
  %flag.scan.is.u = icmp eq i8 %flag.scan.ch, 117
  br i1 %flag.scan.is.u, label %flag.scan.found, label %flag.scan.step
flag.scan.found:
  store i1 true, ptr %unicode.addr
  br label %flag.scanned
flag.scan.step:
  %flag.scan.next = add i64 %flag.scan.index, 1
  store i64 %flag.scan.next, ptr %flag.scan.addr
  br label %flag.scan
flag.scanned:
  ; The u flag is derived from the stored flags string rather than a RegExp
  ; property so that .unicode is not JS-observable; the matcher still needs
  ; the bit for astral-plane stepping until Unicode semantics land in #31.
  %unicode = load i1, ptr %unicode.addr
  %unicode.raw = zext i1 %unicode to i64
  %unicode.bit = shl i64 %unicode.raw, 2
  %flag.bits = or i64 %flag.bits.0, %unicode.bit
  br label %search
search:
  %position = phi i64 [ %start, %flag.scanned ], [ %next.position, %advance ]
  %in.range = icmp ule i64 %position, %input.len
  br i1 %in.range, label %attempt, label %not.found
attempt:
  br label %capture.clear
capture.clear:
  %capture.index = phi i64 [ 0, %attempt ], [ %capture.next, %capture.clear.step ]
  %captures.done = icmp uge i64 %capture.index, 10
  br i1 %captures.done, label %attempt.match, label %capture.clear.body
capture.clear.body:
  %capture.start.slot = getelementptr [10 x i64], ptr @regex.capture.starts, i64 0, i64 %capture.index
  %capture.end.slot = getelementptr [10 x i64], ptr @regex.capture.ends, i64 0, i64 %capture.index
  store i64 -1, ptr %capture.start.slot
  store i64 -1, ptr %capture.end.slot
  br label %capture.clear.step
capture.clear.step:
  %capture.next = add i64 %capture.index, 1
  br label %capture.clear
attempt.match:
  %end = call i64 @regexMatchAlternatives(ptr %source.ptr, i64 %source.len, ptr %input.ptr, i64 %input.len, i64 %position, i64 %flag.bits)
  %matched = icmp sge i64 %end, 0
  br i1 %matched, label %found, label %sticky.check
sticky.check:
  br i1 %is.sticky, label %not.found, label %advance
advance:
  %next.position = add i64 %position, 1
  br label %search
found:
  br i1 %uses.last, label %update.success, label %pack
update.success:
  %end.units = call i64 @regexUtf16Index(ptr %input.ptr, i64 %end)
  %end.number = uitofp i64 %end.units to double
  %end.value = call i64 @valueBoxNumber(double %end.number)
  call void @objectSet(ptr %object, i64 9, ptr @.regex.last.index, i64 %end.value)
  br label %pack
pack:
  %start.low = and i64 %position, 4294967295
  %start.high = shl i64 %start.low, 32
  %end.low = and i64 %end, 4294967295
  %packed = or i64 %start.high, %end.low
  ret i64 %packed
not.found:
  br i1 %uses.last, label %reset, label %return.missing
reset:
  %zero = call i64 @valueBoxNumber(double 0.0)
  call void @objectSet(ptr %object, i64 9, ptr @.regex.last.index, i64 %zero)
  br label %return.missing
return.missing:
  ret i64 -1
}
`);
  }
  if (runtime.used.has("regexSlice")) {
    definitions.push(`define i64 @regexSlice(i64 %input, i64 %start, i64 %end) {
entry:
  %input.ptr = call ptr @valueStringPtr(i64 %input)
  %len = sub i64 %end, %start
  %alloc.len = add i64 %len, 1
  %out = call ptr @malloc(i64 %alloc.len)
  %source = getelementptr i8, ptr %input.ptr, i64 %start
  call ptr @memcpy(ptr %out, ptr %source, i64 %len)
  %nul = getelementptr i8, ptr %out, i64 %len
  store i8 0, ptr %nul
  %boxed = call i64 @valueBoxString(ptr %out, i64 %len)
  ret i64 %boxed
}
`);
  }
  if (runtime.used.has("regexTest")) {
    definitions.push(`define { i64, i1 } @regexTest(i64 %regex, i64 %input) {
entry:
  %match = call i64 @regexFind(i64 %regex, i64 %input)
  %found = icmp sge i64 %match, 0
  %value = select i1 %found, i64 ${legacyJsValue.immediate("true")}, i64 ${legacyJsValue.immediate("false")}
  %result.0 = insertvalue { i64, i1 } undef, i64 %value, 0
  %result = insertvalue { i64, i1 } %result.0, i1 false, 1
  ret { i64, i1 } %result
}
`);
  }
  if (runtime.used.has("regexExec")) {
    definitions.push(`define { i64, i1 } @regexExec(i64 %regex, i64 %input) {
entry:
  %match = call i64 @regexFind(i64 %regex, i64 %input)
  %found = icmp sge i64 %match, 0
  br i1 %found, label %build, label %missing
build:
  %start = lshr i64 %match, 32
  %end = and i64 %match, 4294967295
  %text = call i64 @regexSlice(i64 %input, i64 %start, i64 %end)
  %regex.object = call ptr @valueObjectPtr(i64 %regex)
  %source.value = call i64 @objectGet(ptr %regex.object, i64 6, ptr @.regex.source)
  %source.ptr = call ptr @valueStringPtr(i64 %source.value)
  %source.len = call i64 @valueStringLength(i64 %source.value)
  %capture.count = call i64 @regexCaptureIndex(ptr %source.ptr, i64 %source.len, i8 40)
  %result.length = add i64 %capture.count, 1
  %array = call ptr @arrayNew(i64 %result.length)
  call void @arraySet(ptr %array, i64 0, i64 %text)
  br label %captures
captures:
  %capture.number = phi i64 [ 1, %build ], [ %next.capture, %capture.store ]
  %captures.complete = icmp ugt i64 %capture.number, %capture.count
  br i1 %captures.complete, label %properties, label %capture.load
capture.load:
  %capture.start.slot = getelementptr [10 x i64], ptr @regex.capture.starts, i64 0, i64 %capture.number
  %capture.end.slot = getelementptr [10 x i64], ptr @regex.capture.ends, i64 0, i64 %capture.number
  %capture.start = load i64, ptr %capture.start.slot
  %capture.end = load i64, ptr %capture.end.slot
  %capture.matched = icmp sge i64 %capture.start, 0
  br i1 %capture.matched, label %capture.slice, label %capture.missing
capture.slice:
  %capture.text = call i64 @regexSlice(i64 %input, i64 %capture.start, i64 %capture.end)
  br label %capture.store
capture.missing:
  br label %capture.store
capture.store:
  %capture.value = phi i64 [ %capture.text, %capture.slice ], [ ${legacyJsValue.immediate("undefined")}, %capture.missing ]
  call void @arraySet(ptr %array, i64 %capture.number, i64 %capture.value)
  %next.capture = add i64 %capture.number, 1
  br label %captures
properties:
  %input.ptr = call ptr @valueStringPtr(i64 %input)
  %start.units = call i64 @regexUtf16Index(ptr %input.ptr, i64 %start)
  %start.number = uitofp i64 %start.units to double
  %start.value = call i64 @valueBoxNumber(double %start.number)
  call void @arraySetNamed(ptr %array, i64 5, ptr @.regex.index, i64 %start.value)
  call void @arraySetNamed(ptr %array, i64 5, ptr @.regex.input, i64 %input)
  %boxed = call i64 @valueBoxArray(ptr %array)
  br label %return
missing:
  br label %return
return:
  %value = phi i64 [ %boxed, %properties ], [ ${legacyJsValue.immediate("null")}, %missing ]
  %result.0 = insertvalue { i64, i1 } undef, i64 %value, 0
  %result = insertvalue { i64, i1 } %result.0, i1 false, 1
  ret { i64, i1 } %result
}
`);
  }
  if (runtime.used.has("regexMatch")) {
    definitions.push(`define { i64, i1 } @regexMatch(i64 %regex, i64 %input) {
entry:
  %object = call ptr @valueObjectPtr(i64 %regex)
  %global.value = call i64 @objectGet(ptr %object, i64 6, ptr @.regex.global)
  %is.global = icmp eq i64 %global.value, ${legacyJsValue.immediate("true")}
  br i1 %is.global, label %global, label %single
single:
  %single.result = call { i64, i1 } @regexExec(i64 %regex, i64 %input)
  ret { i64, i1 } %single.result
global:
  %zero = call i64 @valueBoxNumber(double 0.0)
  call void @objectSet(ptr %object, i64 9, ptr @.regex.last.index, i64 %zero)
  %input.ptr = call ptr @valueStringPtr(i64 %input)
  %input.len = call i64 @valueStringLength(i64 %input)
  %array = call ptr @arrayNew(i64 0)
  br label %loop
loop:
  %match = call i64 @regexFind(i64 %regex, i64 %input)
  %found = icmp sge i64 %match, 0
  br i1 %found, label %append, label %complete
append:
  %start = lshr i64 %match, 32
  %end = and i64 %match, 4294967295
  %text = call i64 @regexSlice(i64 %input, i64 %start, i64 %end)
  call i64 @arrayPush(ptr %array, i64 %text)
  %empty = icmp eq i64 %start, %end
  br i1 %empty, label %advance.empty, label %loop
advance.empty:
  %empty.at.input.end = icmp uge i64 %end, %input.len
  br i1 %empty.at.input.end, label %empty.complete, label %empty.update
empty.update:
  %end.units = call i64 @regexUtf16Index(ptr %input.ptr, i64 %end)
  %next.units = add i64 %end.units, 1
  %next.number = uitofp i64 %next.units to double
  %next.value = call i64 @valueBoxNumber(double %next.number)
  call void @objectSet(ptr %object, i64 9, ptr @.regex.last.index, i64 %next.value)
  br label %loop
empty.complete:
  call void @objectSet(ptr %object, i64 9, ptr @.regex.last.index, i64 %zero)
  br label %complete
complete:
  %length = call i64 @arrayLength(ptr %array)
  %has.matches = icmp ugt i64 %length, 0
  br i1 %has.matches, label %box.array, label %return.null
box.array:
  %boxed = call i64 @valueBoxArray(ptr %array)
  br label %return
return.null:
  br label %return
return:
  %value = phi i64 [ %boxed, %box.array ], [ ${legacyJsValue.immediate("null")}, %return.null ]
  %result.0 = insertvalue { i64, i1 } undef, i64 %value, 0
  %result = insertvalue { i64, i1 } %result.0, i1 false, 1
  ret { i64, i1 } %result
}
`);
  }
  if (runtime.used.has("regexSearch")) {
    definitions.push(`define { i64, i1 } @regexSearch(i64 %regex, i64 %input) {
entry:
  %object = call ptr @valueObjectPtr(i64 %regex)
  %saved.last.index = call i64 @objectGet(ptr %object, i64 9, ptr @.regex.last.index)
  %zero = call i64 @valueBoxNumber(double 0.0)
  call void @objectSet(ptr %object, i64 9, ptr @.regex.last.index, i64 %zero)
  %match = call i64 @regexFind(i64 %regex, i64 %input)
  call void @objectSet(ptr %object, i64 9, ptr @.regex.last.index, i64 %saved.last.index)
  %found = icmp sge i64 %match, 0
  br i1 %found, label %matched, label %missing
matched:
  %start = lshr i64 %match, 32
  %input.ptr = call ptr @valueStringPtr(i64 %input)
  %start.units = call i64 @regexUtf16Index(ptr %input.ptr, i64 %start)
  %start.number = uitofp i64 %start.units to double
  br label %box
missing:
  br label %box
box:
  %number = phi double [ %start.number, %matched ], [ -1.0, %missing ]
  %value = call i64 @valueBoxNumber(double %number)
  %result.0 = insertvalue { i64, i1 } undef, i64 %value, 0
  %result = insertvalue { i64, i1 } %result.0, i1 false, 1
  ret { i64, i1 } %result
}
`);
  }
  if (runtime.used.has("regexSplit")) {
    // ADR 0008: regexSplit keeps a raw ptr return because it cannot produce a
    // JS-observable exception. The limit is already coerced to i64 at the call
    // site (see emitRuntimeRegexSplitOperation in llvm.ts), lastIndex/global
    // are saved and restored around plain integer compares, and allocation
    // goes through arrayNew/arrayPush whose failure is fatal to the process,
    // not a JS exception. Every callee is a non-throwing scalar helper.
    definitions.push(`define ptr @regexSplit(i64 %regex, i64 %input, i64 %limit) {
entry:
  %object = call ptr @valueObjectPtr(i64 %regex)
  %saved.last.index = call i64 @objectGet(ptr %object, i64 9, ptr @.regex.last.index)
  %saved.global = call i64 @objectGet(ptr %object, i64 6, ptr @.regex.global)
  call void @objectSet(ptr %object, i64 6, ptr @.regex.global, i64 ${legacyJsValue.immediate("true")})
  %input.ptr = call ptr @valueStringPtr(i64 %input)
  %input.len = call i64 @valueStringLength(i64 %input)
  %source.value = call i64 @objectGet(ptr %object, i64 6, ptr @.regex.source)
  %source.ptr = call ptr @valueStringPtr(i64 %source.value)
  %source.len = call i64 @valueStringLength(i64 %source.value)
  %capture.count = call i64 @regexCaptureIndex(ptr %source.ptr, i64 %source.len, i8 40)
  %array = call ptr @arrayNew(i64 0)
  %cursor.addr = alloca i64
  %search.addr = alloca i64
  %capture.addr = alloca i64
  store i64 0, ptr %cursor.addr
  store i64 0, ptr %search.addr
  br label %loop
loop:
  %search = load i64, ptr %search.addr
  %search.in.range = icmp ule i64 %search, %input.len
  br i1 %search.in.range, label %limit.check, label %restore
limit.check:
  %length = call i64 @arrayLength(ptr %array)
  %unlimited = icmp slt i64 %limit, 0
  %below.limit = icmp ult i64 %length, %limit
  %can.push = or i1 %unlimited, %below.limit
  br i1 %can.push, label %find, label %restore
find:
  %search.units = call i64 @regexUtf16Index(ptr %input.ptr, i64 %search)
  %search.number = uitofp i64 %search.units to double
  %search.value = call i64 @valueBoxNumber(double %search.number)
  call void @objectSet(ptr %object, i64 9, ptr @.regex.last.index, i64 %search.value)
  %match = call i64 @regexFind(i64 %regex, i64 %input)
  %found = icmp sge i64 %match, 0
  br i1 %found, label %matched, label %missing
matched:
  %start = lshr i64 %match, 32
  %end = and i64 %match, 4294967295
  %cursor = load i64, ptr %cursor.addr
  %prefix = call i64 @regexSlice(i64 %input, i64 %cursor, i64 %start)
  call i64 @arrayPush(ptr %array, i64 %prefix)
  store i64 1, ptr %capture.addr
  br label %captures
captures:
  %capture.number = load i64, ptr %capture.addr
  %captures.done = icmp ugt i64 %capture.number, %capture.count
  br i1 %captures.done, label %advance, label %capture.limit
capture.limit:
  %capture.array.length = call i64 @arrayLength(ptr %array)
  %capture.below.limit = icmp ult i64 %capture.array.length, %limit
  %capture.can.push = or i1 %unlimited, %capture.below.limit
  br i1 %capture.can.push, label %capture.load, label %restore
capture.load:
  %capture.start.slot = getelementptr [10 x i64], ptr @regex.capture.starts, i64 0, i64 %capture.number
  %capture.end.slot = getelementptr [10 x i64], ptr @regex.capture.ends, i64 0, i64 %capture.number
  %capture.start = load i64, ptr %capture.start.slot
  %capture.end = load i64, ptr %capture.end.slot
  %capture.matched = icmp sge i64 %capture.start, 0
  br i1 %capture.matched, label %capture.slice, label %capture.missing
capture.slice:
  %capture.text = call i64 @regexSlice(i64 %input, i64 %capture.start, i64 %capture.end)
  br label %capture.push
capture.missing:
  br label %capture.push
capture.push:
  %capture.value = phi i64 [ %capture.text, %capture.slice ], [ ${legacyJsValue.immediate("undefined")}, %capture.missing ]
  call i64 @arrayPush(ptr %array, i64 %capture.value)
  %next.capture = add i64 %capture.number, 1
  store i64 %next.capture, ptr %capture.addr
  br label %captures
advance:
  store i64 %end, ptr %cursor.addr
  %empty = icmp eq i64 %start, %end
  %before.end = icmp ult i64 %end, %input.len
  %empty.can.advance = and i1 %empty, %before.end
  %advanced = add i64 %end, 1
  %next.search = select i1 %empty.can.advance, i64 %advanced, i64 %end
  store i64 %next.search, ptr %search.addr
  %not.before.end = xor i1 %before.end, true
  %empty.at.end = and i1 %empty, %not.before.end
  br i1 %empty.at.end, label %restore, label %loop
missing:
  %suffix.cursor = load i64, ptr %cursor.addr
  %suffix = call i64 @regexSlice(i64 %input, i64 %suffix.cursor, i64 %input.len)
  call i64 @arrayPush(ptr %array, i64 %suffix)
  br label %restore
restore:
  call void @objectSet(ptr %object, i64 6, ptr @.regex.global, i64 %saved.global)
  call void @objectSet(ptr %object, i64 9, ptr @.regex.last.index, i64 %saved.last.index)
  ret ptr %array
}
`);
  }
  if (runtime.used.has("regexExpandReplacement")) {
    definitions.push(`define i64 @regexExpandReplacement(i64 %input, i64 %replacement, i64 %start, i64 %end) {
entry:
  %input.ptr = call ptr @valueStringPtr(i64 %input)
  %input.len = call i64 @valueStringLength(i64 %input)
  %replacement.ptr = call ptr @valueStringPtr(i64 %replacement)
  %replacement.len = call i64 @valueStringLength(i64 %replacement)
  %empty = call ptr @malloc(i64 1)
  store i8 0, ptr %empty
  %acc.ptr.addr = alloca ptr
  %acc.len.addr = alloca i64
  %position.addr = alloca i64
  %chunk.ptr.addr = alloca ptr
  %chunk.len.addr = alloca i64
  %next.addr = alloca i64
  store ptr %empty, ptr %acc.ptr.addr
  store i64 0, ptr %acc.len.addr
  store i64 0, ptr %position.addr
  br label %loop
loop:
  %position = load i64, ptr %position.addr
  %done = icmp uge i64 %position, %replacement.len
  br i1 %done, label %finish, label %character
character:
  %character.ptr = getelementptr i8, ptr %replacement.ptr, i64 %position
  %character.value = load i8, ptr %character.ptr
  %is.dollar = icmp eq i8 %character.value, 36
  %after.position = add i64 %position, 1
  %has.next = icmp ult i64 %after.position, %replacement.len
  %has.token = and i1 %is.dollar, %has.next
  br i1 %has.token, label %token, label %literal
literal:
  store ptr %character.ptr, ptr %chunk.ptr.addr
  store i64 1, ptr %chunk.len.addr
  store i64 %after.position, ptr %next.addr
  br label %append
token:
  %token.ptr = getelementptr i8, ptr %replacement.ptr, i64 %after.position
  %token.value = load i8, ptr %token.ptr
  %token.dollar = icmp eq i8 %token.value, 36
  %token.match = icmp eq i8 %token.value, 38
  %token.prefix = icmp eq i8 %token.value, 96
  %token.suffix = icmp eq i8 %token.value, 39
  %token.digit.low = icmp uge i8 %token.value, 49
  %token.digit.high = icmp ule i8 %token.value, 57
  %token.digit = and i1 %token.digit.low, %token.digit.high
  br i1 %token.dollar, label %sub.dollar, label %token.match.check
token.match.check:
  br i1 %token.match, label %sub.match, label %token.prefix.check
token.prefix.check:
  br i1 %token.prefix, label %sub.prefix, label %token.suffix.check
token.suffix.check:
  br i1 %token.suffix, label %sub.suffix, label %token.capture.check
token.capture.check:
  br i1 %token.digit, label %sub.capture, label %literal
sub.dollar:
  store ptr %token.ptr, ptr %chunk.ptr.addr
  store i64 1, ptr %chunk.len.addr
  br label %sub.advance
sub.match:
  %match.ptr = getelementptr i8, ptr %input.ptr, i64 %start
  %match.len = sub i64 %end, %start
  store ptr %match.ptr, ptr %chunk.ptr.addr
  store i64 %match.len, ptr %chunk.len.addr
  br label %sub.advance
sub.prefix:
  store ptr %input.ptr, ptr %chunk.ptr.addr
  store i64 %start, ptr %chunk.len.addr
  br label %sub.advance
sub.suffix:
  %suffix.ptr = getelementptr i8, ptr %input.ptr, i64 %end
  %suffix.len = sub i64 %input.len, %end
  store ptr %suffix.ptr, ptr %chunk.ptr.addr
  store i64 %suffix.len, ptr %chunk.len.addr
  br label %sub.advance
sub.capture:
  %capture.raw = zext i8 %token.value to i64
  %capture.number = sub i64 %capture.raw, 48
  %capture.start.slot = getelementptr [10 x i64], ptr @regex.capture.starts, i64 0, i64 %capture.number
  %capture.end.slot = getelementptr [10 x i64], ptr @regex.capture.ends, i64 0, i64 %capture.number
  %capture.start = load i64, ptr %capture.start.slot
  %capture.end = load i64, ptr %capture.end.slot
  %capture.matched = icmp sge i64 %capture.start, 0
  br i1 %capture.matched, label %sub.capture.matched, label %sub.capture.missing
sub.capture.matched:
  %capture.ptr = getelementptr i8, ptr %input.ptr, i64 %capture.start
  %capture.len = sub i64 %capture.end, %capture.start
  store ptr %capture.ptr, ptr %chunk.ptr.addr
  store i64 %capture.len, ptr %chunk.len.addr
  br label %sub.advance
sub.capture.missing:
  store ptr %input.ptr, ptr %chunk.ptr.addr
  store i64 0, ptr %chunk.len.addr
  br label %sub.advance
sub.advance:
  %after.token = add i64 %position, 2
  store i64 %after.token, ptr %next.addr
  br label %append
append:
  %acc.ptr = load ptr, ptr %acc.ptr.addr
  %acc.len = load i64, ptr %acc.len.addr
  %chunk.ptr = load ptr, ptr %chunk.ptr.addr
  %chunk.len = load i64, ptr %chunk.len.addr
  %joined = call ptr @strConcat(i64 %acc.len, ptr %acc.ptr, i64 %chunk.len, ptr %chunk.ptr)
  %joined.len = add i64 %acc.len, %chunk.len
  %next = load i64, ptr %next.addr
  store ptr %joined, ptr %acc.ptr.addr
  store i64 %joined.len, ptr %acc.len.addr
  store i64 %next, ptr %position.addr
  br label %loop
finish:
  %result.ptr = load ptr, ptr %acc.ptr.addr
  %result.len = load i64, ptr %acc.len.addr
  %result = call i64 @valueBoxString(ptr %result.ptr, i64 %result.len)
  ret i64 %result
}
`);
  }
  if (runtime.used.has("regexReplace")) {
    definitions.push(`define { i64, i1 } @regexReplace(i64 %regex, i64 %input, i64 %replacement) {
entry:
  %object = call ptr @valueObjectPtr(i64 %regex)
  %global.value = call i64 @objectGet(ptr %object, i64 6, ptr @.regex.global)
  %is.global = icmp eq i64 %global.value, ${legacyJsValue.immediate("true")}
  %saved.last.index = call i64 @objectGet(ptr %object, i64 9, ptr @.regex.last.index)
  %zero = call i64 @valueBoxNumber(double 0.0)
  br i1 %is.global, label %reset.global, label %initialize
reset.global:
  call void @objectSet(ptr %object, i64 9, ptr @.regex.last.index, i64 %zero)
  br label %initialize
initialize:
  %input.ptr = call ptr @valueStringPtr(i64 %input)
  %input.len = call i64 @valueStringLength(i64 %input)
  %empty.ptr = call ptr @malloc(i64 1)
  store i8 0, ptr %empty.ptr
  %acc.ptr.addr = alloca ptr
  %acc.len.addr = alloca i64
  %cursor.addr = alloca i64
  %matched.addr = alloca i1
  store ptr %empty.ptr, ptr %acc.ptr.addr
  store i64 0, ptr %acc.len.addr
  store i64 0, ptr %cursor.addr
  store i1 false, ptr %matched.addr
  br label %find
find:
  %match = call i64 @regexFind(i64 %regex, i64 %input)
  %found = icmp sge i64 %match, 0
  br i1 %found, label %replace, label %finish
replace:
  store i1 true, ptr %matched.addr
  %start = lshr i64 %match, 32
  %end = and i64 %match, 4294967295
  %cursor = load i64, ptr %cursor.addr
  %prefix.ptr = getelementptr i8, ptr %input.ptr, i64 %cursor
  %prefix.len = sub i64 %start, %cursor
  %acc.ptr.0 = load ptr, ptr %acc.ptr.addr
  %acc.len.0 = load i64, ptr %acc.len.addr
  %with.prefix = call ptr @strConcat(i64 %acc.len.0, ptr %acc.ptr.0, i64 %prefix.len, ptr %prefix.ptr)
  %with.prefix.len = add i64 %acc.len.0, %prefix.len
  %expanded = call i64 @regexExpandReplacement(i64 %input, i64 %replacement, i64 %start, i64 %end)
  %expanded.ptr = call ptr @valueStringPtr(i64 %expanded)
  %expanded.len = call i64 @valueStringLength(i64 %expanded)
  %with.replacement = call ptr @strConcat(i64 %with.prefix.len, ptr %with.prefix, i64 %expanded.len, ptr %expanded.ptr)
  %with.replacement.len = add i64 %with.prefix.len, %expanded.len
  store ptr %with.replacement, ptr %acc.ptr.addr
  store i64 %with.replacement.len, ptr %acc.len.addr
  store i64 %end, ptr %cursor.addr
  br i1 %is.global, label %global.advance, label %finish
global.advance:
  %empty.match = icmp eq i64 %start, %end
  br i1 %empty.match, label %empty.advance, label %find
empty.advance:
  %at.end = icmp uge i64 %end, %input.len
  br i1 %at.end, label %finish, label %empty.update
empty.update:
  %end.units = call i64 @regexUtf16Index(ptr %input.ptr, i64 %end)
  %next.units = add i64 %end.units, 1
  %next.number = uitofp i64 %next.units to double
  %next.value = call i64 @valueBoxNumber(double %next.number)
  call void @objectSet(ptr %object, i64 9, ptr @.regex.last.index, i64 %next.value)
  br label %find
finish:
  %cursor.final = load i64, ptr %cursor.addr
  %suffix.ptr = getelementptr i8, ptr %input.ptr, i64 %cursor.final
  %suffix.len = sub i64 %input.len, %cursor.final
  %acc.ptr.final = load ptr, ptr %acc.ptr.addr
  %acc.len.final = load i64, ptr %acc.len.addr
  %output.ptr = call ptr @strConcat(i64 %acc.len.final, ptr %acc.ptr.final, i64 %suffix.len, ptr %suffix.ptr)
  %output.len = add i64 %acc.len.final, %suffix.len
  %output = call i64 @valueBoxString(ptr %output.ptr, i64 %output.len)
  br i1 %is.global, label %restore.global, label %restore.single
restore.global:
  call void @objectSet(ptr %object, i64 9, ptr @.regex.last.index, i64 %zero)
  br label %return
restore.single:
  call void @objectSet(ptr %object, i64 9, ptr @.regex.last.index, i64 %saved.last.index)
  br label %return
return:
  %result.0 = insertvalue { i64, i1 } undef, i64 %output, 0
  %result = insertvalue { i64, i1 } %result.0, i1 false, 1
  ret { i64, i1 } %result
}
`);
  }
  if (runtime.used.has("gcInit") || runtime.used.has("gcAlloc")) {
    // GC global state and constants. One arena allocated by gcInit; per-tag free
    // lists repurpose the first 8 bytes of a freed cell's payload as a next-pointer.
    definitions.push(`; GC arena + bookkeeping (Phase B: strings only).
@gcArenaBase = internal global ptr null
@gcArenaEnd = internal global ptr null
@gcBumpPtr = internal global ptr null
@gcBytesAllocd = internal global i64 0
@gcNextCollectAt = internal global i64 1048576
@gcCollectPending = internal global i64 0
@gcCollections = internal global i64 0
@gcLiveBytes = internal global i64 0
@gcFreeString = internal global ptr null
@gcFreeObject = internal global ptr null
@gcFreeArray = internal global ptr null
@gcFreeCollection = internal global ptr null
@gcFreeFunction = internal global ptr null
@gcFreeEnvironment = internal global ptr null
@gcFreeIterator = internal global ptr null
@gcMarkStack = internal global ptr null
@gcMarkStackCount = internal global i64 0
@gcMarkStackCap = internal global i64 0
@gcRootStack = internal global ptr null
@gcRootStackCount = internal global i64 0
@gcRootStackCap = internal global i64 0
@gcTrace = internal global i64 0

@.gc.env.name = private unnamed_addr constant [18 x i8] c"TSCN_GC_HEAP_SIZE\\00"
@.gc.trace.env = private unnamed_addr constant [14 x i8] c"TSCN_GC_TRACE\\00"
@.gc.trace.fmt = private unnamed_addr constant [25 x i8] c"gc: coll=%lld live=%lld\\0A\\00"
`);
  }
  if (runtime.used.has("gcInit")) {
    definitions.push(`define void @gcInit() {
entry:
  %env.ptr = call ptr @getenv(ptr @.gc.env.name)
  %env.set = icmp ne ptr %env.ptr, null
  br i1 %env.set, label %parse.env, label %use.default
parse.env:
  %parsed = call i64 @strtol(ptr %env.ptr, ptr null, i32 10)
  br label %init
use.default:
  br label %init
init:
  %heap.size = phi i64 [ %parsed, %parse.env ], [ 4194304, %use.default ]
  %arena = call ptr @malloc(i64 %heap.size)
  store ptr %arena, ptr @gcArenaBase
  %arena.end = getelementptr i8, ptr %arena, i64 %heap.size
  store ptr %arena.end, ptr @gcArenaEnd
  store ptr %arena, ptr @gcBumpPtr
  store i64 0, ptr @gcBytesAllocd
  store i64 1048576, ptr @gcNextCollectAt
  store i64 0, ptr @gcCollectPending
  store i64 0, ptr @gcCollections
  store i64 0, ptr @gcLiveBytes
  store ptr null, ptr @gcFreeString
  store ptr null, ptr @gcFreeObject
  store ptr null, ptr @gcFreeArray
  store ptr null, ptr @gcFreeCollection
  store ptr null, ptr @gcFreeFunction
  store ptr null, ptr @gcFreeEnvironment
  store ptr null, ptr @gcFreeIterator
  %root.cap.bytes = mul i64 64, 8
  %root.stack = call ptr @malloc(i64 %root.cap.bytes)
  store ptr %root.stack, ptr @gcRootStack
  store i64 0, ptr @gcRootStackCount
  store i64 64, ptr @gcRootStackCap
  %mark.cap.bytes = mul i64 64, 8
  %mark.stack = call ptr @malloc(i64 %mark.cap.bytes)
  store ptr %mark.stack, ptr @gcMarkStack
  store i64 0, ptr @gcMarkStackCount
  store i64 64, ptr @gcMarkStackCap
  %trace.env = call ptr @getenv(ptr @.gc.trace.env)
  %trace.set = icmp ne ptr %trace.env, null
  %trace.flag = zext i1 %trace.set to i64
  store i64 %trace.flag, ptr @gcTrace
  ret void
}

define void @gcRootPush(i64 %value) {
entry:
  %count = load i64, ptr @gcRootStackCount
  %cap = load i64, ptr @gcRootStackCap
  %need.grow = icmp eq i64 %count, %cap
  br i1 %need.grow, label %grow, label %store
grow:
  %new.cap = mul i64 %cap, 2
  %old.bytes = mul i64 %cap, 8
  %new.bytes = mul i64 %new.cap, 8
  %old.stack = load ptr, ptr @gcRootStack
  %new.stack = call ptr @malloc(i64 %new.bytes)
  call ptr @memcpy(ptr %new.stack, ptr %old.stack, i64 %old.bytes)
  store ptr %new.stack, ptr @gcRootStack
  store i64 %new.cap, ptr @gcRootStackCap
  br label %store
store:
  %stack = load ptr, ptr @gcRootStack
  %slot.bytes = mul i64 %count, 8
  %slot = getelementptr i8, ptr %stack, i64 %slot.bytes
  store i64 %value, ptr %slot
  %next = add i64 %count, 1
  store i64 %next, ptr @gcRootStackCount
  ret void
}

define void @gcRootPop() {
entry:
  %count = load i64, ptr @gcRootStackCount
  %is.empty = icmp eq i64 %count, 0
  br i1 %is.empty, label %underflow, label %ok
underflow:
  call void @exit(i32 1)
  ret void
ok:
  %next = sub i64 %count, 1
  store i64 %next, ptr @gcRootStackCount
  ret void
}

define i64 @gcRootSave() {
entry:
  %count = load i64, ptr @gcRootStackCount
  ret i64 %count
}

define void @gcRootRestore(i64 %depth) {
entry:
  store i64 %depth, ptr @gcRootStackCount
  ret void
}

define void @gcSafepoint() {
entry:
  %pending = load i64, ptr @gcCollectPending
  %do = icmp ne i64 %pending, 0
  br i1 %do, label %collect, label %skip
collect:
  store i64 0, ptr @gcCollectPending
  call void @gcCollect()
  br label %skip
skip:
  ret void
}

define void @gcMarkValue(i64 %value) {
entry:
  %tag = and i64 %value, ${legacyJsValue.tagMask()}
  %is.string = icmp eq i64 %tag, ${legacyJsValue.referenceTag("string")}
  %is.object = icmp eq i64 %tag, ${legacyJsValue.referenceTag("object")}
  %is.array = icmp eq i64 %tag, ${legacyJsValue.referenceTag("array")}
  %is.function = icmp eq i64 %tag, ${legacyJsValue.referenceTag("function")}
  br i1 %is.string, label %mark.string, label %check.heap
check.heap:
  %is.object.or.array = or i1 %is.object, %is.array
  %is.heap = or i1 %is.object.or.array, %is.function
  br i1 %is.heap, label %mark.heap, label %skip
mark.string:
  %str.bits = and i64 %value, ${legacyJsValue.payloadMask()}
  %str.cell = inttoptr i64 %str.bits to ptr
  %str.color.ptr = getelementptr i8, ptr %str.cell, i64 1
  %str.color = load i8, ptr %str.color.ptr
  %str.is.black = icmp eq i8 %str.color, 2
  br i1 %str.is.black, label %skip, label %mark.string.set
mark.string.set:
  store i8 2, ptr %str.color.ptr
  br label %skip
mark.heap:
  %bits = and i64 %value, ${legacyJsValue.payloadMask()}
  %payload = inttoptr i64 %bits to ptr
  %cell = getelementptr i8, ptr %payload, i64 -8
  %color.ptr = getelementptr i8, ptr %cell, i64 1
  %color = load i8, ptr %color.ptr
  %is.black = icmp eq i8 %color, 2
  %is.gray = icmp eq i8 %color, 1
  %is.marked = or i1 %is.black, %is.gray
  br i1 %is.marked, label %skip, label %push.mark
push.mark:
  %count = load i64, ptr @gcMarkStackCount
  %cap = load i64, ptr @gcMarkStackCap
  %need.grow = icmp eq i64 %count, %cap
  br i1 %need.grow, label %push.grow, label %push.store
push.grow:
  %new.cap = mul i64 %cap, 2
  %old.bytes = mul i64 %cap, 8
  %new.bytes = mul i64 %new.cap, 8
  %old.stack = load ptr, ptr @gcMarkStack
  %new.stack = call ptr @malloc(i64 %new.bytes)
  call ptr @memcpy(ptr %new.stack, ptr %old.stack, i64 %old.bytes)
  store ptr %new.stack, ptr @gcMarkStack
  store i64 %new.cap, ptr @gcMarkStackCap
  br label %push.store
push.store:
  %stack = load ptr, ptr @gcMarkStack
  %slot.bytes = mul i64 %count, 8
  %slot = getelementptr i8, ptr %stack, i64 %slot.bytes
  store ptr %cell, ptr %slot
  %next.count = add i64 %count, 1
  store i64 %next.count, ptr @gcMarkStackCount
  store i8 1, ptr %color.ptr
  br label %skip
skip:
  ret void
}

; Mark a child reached through a raw GC payload pointer (object/array prototypes and
; array property bags are stored as cell+8 payload pointers, not boxed JSValues).
; Null-safe; greys the cell and pushes it for the iterative drain just like the heap
; path of gcMarkValue.
define void @gcMarkPayloadPtr(ptr %payload) {
entry:
  %is.null = icmp eq ptr %payload, null
  br i1 %is.null, label %done, label %mark
mark:
  %cell = getelementptr i8, ptr %payload, i64 -8
  %color.ptr = getelementptr i8, ptr %cell, i64 1
  %color = load i8, ptr %color.ptr
  %is.black = icmp eq i8 %color, 2
  %is.gray = icmp eq i8 %color, 1
  %is.marked = or i1 %is.black, %is.gray
  br i1 %is.marked, label %done, label %push
push:
  %count = load i64, ptr @gcMarkStackCount
  %cap = load i64, ptr @gcMarkStackCap
  %need.grow = icmp eq i64 %count, %cap
  br i1 %need.grow, label %grow, label %store
grow:
  %new.cap = mul i64 %cap, 2
  %old.bytes = mul i64 %cap, 8
  %new.bytes = mul i64 %new.cap, 8
  %old.stack = load ptr, ptr @gcMarkStack
  %new.stack = call ptr @malloc(i64 %new.bytes)
  call ptr @memcpy(ptr %new.stack, ptr %old.stack, i64 %old.bytes)
  store ptr %new.stack, ptr @gcMarkStack
  store i64 %new.cap, ptr @gcMarkStackCap
  br label %store
store:
  %stack = load ptr, ptr @gcMarkStack
  %slot.bytes = mul i64 %count, 8
  %slot = getelementptr i8, ptr %stack, i64 %slot.bytes
  store ptr %cell, ptr %slot
  %next.count = add i64 %count, 1
  store i64 %next.count, ptr @gcMarkStackCount
  store i8 1, ptr %color.ptr
  br label %done
done:
  ret void
}

define void @gcMarkObject(ptr %cell) {
entry:
  %color.ptr = getelementptr i8, ptr %cell, i64 1
  %prev.color = load i8, ptr %color.ptr
  store i8 2, ptr %color.ptr
  %was.gray = icmp eq i8 %prev.color, 1
  br i1 %was.gray, label %walk, label %skip
walk:
  %tag.ptr = getelementptr i8, ptr %cell, i64 0
  %tag = load i8, ptr %tag.ptr
  %is.string = icmp eq i8 %tag, 1
  %is.object = icmp eq i8 %tag, 2
  %is.array = icmp eq i8 %tag, 3
  %is.collection = icmp eq i8 %tag, 4
  %is.function = icmp eq i8 %tag, 5
  %is.environment = icmp eq i8 %tag, 6
  %is.iterator = icmp eq i8 %tag, 7
  br i1 %is.string, label %skip, label %check.object
check.object:
  br i1 %is.object, label %walk.object, label %check.array
check.array:
  br i1 %is.array, label %walk.array, label %check.collection
check.collection:
  br i1 %is.collection, label %walk.collection, label %check.function
check.function:
  br i1 %is.function, label %walk.function, label %check.environment
check.environment:
  br i1 %is.environment, label %walk.environment, label %check.iterator
check.iterator:
  br i1 %is.iterator, label %walk.iterator, label %skip
walk.object:
  %obj.count.ptr = getelementptr i8, ptr %cell, i64 8
  %obj.count = load i64, ptr %obj.count.ptr
  %obj.entries.ptr = getelementptr i8, ptr %cell, i64 24
  %obj.entries = load ptr, ptr %obj.entries.ptr
  br label %walk.object.loop
walk.object.loop:
  %oi = phi i64 [ 0, %walk.object ], [ %oi.next, %walk.object.next ]
  %odone = icmp eq i64 %oi, %obj.count
  br i1 %odone, label %walk.object.proto, label %walk.object.body
walk.object.body:
  %oentry.bytes = mul i64 %oi, 32
  %oentry.ptr = getelementptr i8, ptr %obj.entries, i64 %oentry.bytes
  %olen = load i64, ptr %oentry.ptr
  %olive = icmp sge i64 %olen, 0
  br i1 %olive, label %walk.object.mark, label %walk.object.next
walk.object.mark:
  %ovalue.slot = getelementptr i8, ptr %oentry.ptr, i64 16
  %ovalue = load i64, ptr %ovalue.slot
  call void @gcMarkValue(i64 %ovalue)
  br label %walk.object.next
walk.object.next:
  %oi.next = add i64 %oi, 1
  br label %walk.object.loop
walk.object.proto:
  %obj.proto.ptr = getelementptr i8, ptr %cell, i64 40
  %obj.proto = load ptr, ptr %obj.proto.ptr
  call void @gcMarkPayloadPtr(ptr %obj.proto)
  br label %skip
walk.array:
  %arr.length.ptr = getelementptr i8, ptr %cell, i64 8
  %arr.length = load i64, ptr %arr.length.ptr
  %arr.elements.ptr = getelementptr i8, ptr %cell, i64 24
  %arr.elements = load ptr, ptr %arr.elements.ptr
  br label %walk.array.loop
walk.array.loop:
  %ai = phi i64 [ 0, %walk.array ], [ %ai.next, %walk.array.body ]
  %adone = icmp eq i64 %ai, %arr.length
  br i1 %adone, label %walk.array.proto, label %walk.array.body
walk.array.body:
  %aslot.bytes = mul i64 %ai, 8
  %aslot = getelementptr i8, ptr %arr.elements, i64 %aslot.bytes
  %avalue = load i64, ptr %aslot
  call void @gcMarkValue(i64 %avalue)
  %ai.next = add i64 %ai, 1
  br label %walk.array.loop
walk.array.proto:
  %arr.proto.ptr = getelementptr i8, ptr %cell, i64 32
  %arr.proto = load ptr, ptr %arr.proto.ptr
  call void @gcMarkPayloadPtr(ptr %arr.proto)
  %arr.props.ptr = getelementptr i8, ptr %cell, i64 40
  %arr.props = load ptr, ptr %arr.props.ptr
  call void @gcMarkPayloadPtr(ptr %arr.props)
  br label %skip
walk.collection:
  %col.used.ptr = getelementptr i8, ptr %cell, i64 16
  %col.used = load i64, ptr %col.used.ptr
  %col.entries.ptr = getelementptr i8, ptr %cell, i64 32
  %col.entries = load ptr, ptr %col.entries.ptr
  %col.iterator.ptr = getelementptr i8, ptr %cell, i64 40
  %col.iterator = load i64, ptr %col.iterator.ptr
  call void @gcMarkValue(i64 %col.iterator)
  br label %walk.collection.loop
walk.collection.loop:
  %ci = phi i64 [ 0, %walk.collection ], [ %ci.next, %walk.collection.skip ]
  %cdone = icmp eq i64 %ci, %col.used
  br i1 %cdone, label %skip, label %walk.collection.body
walk.collection.body:
  %centry.bytes = mul i64 %ci, 24
  %centry.ptr = getelementptr i8, ptr %col.entries, i64 %centry.bytes
  %cactive = load i64, ptr %centry.ptr
  %cis.active = icmp ne i64 %cactive, 0
  br i1 %cis.active, label %walk.collection.active, label %walk.collection.skip
walk.collection.active:
  %ckey.slot = getelementptr i8, ptr %centry.ptr, i64 8
  %ckey = load i64, ptr %ckey.slot
  call void @gcMarkValue(i64 %ckey)
  %cvalue.slot = getelementptr i8, ptr %centry.ptr, i64 16
  %cvalue = load i64, ptr %cvalue.slot
  call void @gcMarkValue(i64 %cvalue)
  br label %walk.collection.skip
walk.collection.skip:
  %ci.next = add i64 %ci, 1
  br label %walk.collection.loop
walk.function:
  %fn.env.ptr = getelementptr i8, ptr %cell, i64 16
  %fn.env = load ptr, ptr %fn.env.ptr
  call void @gcMarkPayloadPtr(ptr %fn.env)
  %fn.this.ptr = getelementptr i8, ptr %cell, i64 24
  %fn.this = load i64, ptr %fn.this.ptr
  call void @gcMarkValue(i64 %fn.this)
  %fn.proto.ptr = getelementptr i8, ptr %cell, i64 32
  %fn.proto = load ptr, ptr %fn.proto.ptr
  call void @gcMarkPayloadPtr(ptr %fn.proto)
  %fn.name.ptr = getelementptr i8, ptr %cell, i64 40
  %fn.name = load i64, ptr %fn.name.ptr
  call void @gcMarkValue(i64 %fn.name)
  br label %skip
walk.environment:
  ; Environment cell: payload+0 holds slot count (i64), payload+8 holds a pointer
  ; to a malloc'd slots buffer (count * 8 bytes of boxed JSValues). Mark every slot.
  %env.count.ptr = getelementptr i8, ptr %cell, i64 8
  %env.count = load i64, ptr %env.count.ptr
  %env.slots.ptr = getelementptr i8, ptr %cell, i64 16
  %env.slots = load ptr, ptr %env.slots.ptr
  br label %walk.environment.loop
walk.environment.loop:
  %ei = phi i64 [ 0, %walk.environment ], [ %ei.next, %walk.environment.body ]
  %edone = icmp eq i64 %ei, %env.count
  br i1 %edone, label %skip, label %walk.environment.body
walk.environment.body:
  %eslot.bytes = mul i64 %ei, 8
  %eslot = getelementptr i8, ptr %env.slots, i64 %eslot.bytes
  %evalue = load i64, ptr %eslot
  call void @gcMarkValue(i64 %evalue)
  %ei.next = add i64 %ei, 1
  br label %walk.environment.loop
walk.iterator:
  ; Iterator state cell: +0 index, +8 sourceKind, +16 iterationKind, +24 sourceBits, +32 done.
  ; sourceKind 0/1 (array/string) store a JSValue; 2/3 (map/set) store a collection payload ptr.
  %it.kind.ptr = getelementptr i8, ptr %cell, i64 16
  %it.kind = load i64, ptr %it.kind.ptr
  %it.source.ptr = getelementptr i8, ptr %cell, i64 32
  %it.source = load i64, ptr %it.source.ptr
  %it.is.array = icmp eq i64 %it.kind, 0
  %it.is.string = icmp eq i64 %it.kind, 1
  %it.is.boxed = or i1 %it.is.array, %it.is.string
  br i1 %it.is.boxed, label %walk.iterator.boxed, label %walk.iterator.collection
walk.iterator.boxed:
  call void @gcMarkValue(i64 %it.source)
  br label %skip
walk.iterator.collection:
  %it.collection = inttoptr i64 %it.source to ptr
  call void @gcMarkPayloadPtr(ptr %it.collection)
  br label %skip
skip:
  ret void
}

define void @gcSweep() {
entry:
  %arena = load ptr, ptr @gcArenaBase
  %bump = load ptr, ptr @gcBumpPtr
  ; Recompute the surviving (black) byte total from scratch this cycle.
  store i64 0, ptr @gcLiveBytes
  br label %loop
loop:
  %cur = phi ptr [ %arena, %entry ], [ %step.cur, %advance ]
  %done = icmp uge ptr %cur, %bump
  br i1 %done, label %exit, label %check
check:
  %color.ptr = getelementptr i8, ptr %cur, i64 1
  %color = load i8, ptr %color.ptr
  %is.white = icmp eq i8 %color, 0
  %is.black = icmp eq i8 %color, 2
  br i1 %is.white, label %white, label %check.black
check.black:
  br i1 %is.black, label %black, label %advance
white:
  %tag.ptr = getelementptr i8, ptr %cur, i64 0
  %tag = load i8, ptr %tag.ptr
  %is.string = icmp eq i8 %tag, 1
  %is.object = icmp eq i8 %tag, 2
  %is.array = icmp eq i8 %tag, 3
  %is.collection = icmp eq i8 %tag, 4
  %is.function = icmp eq i8 %tag, 5
  %is.environment = icmp eq i8 %tag, 6
  %is.iterator = icmp eq i8 %tag, 7
  br i1 %is.string, label %free.string, label %check.free.object
check.free.object:
  br i1 %is.object, label %free.object, label %check.free.array
check.free.array:
  br i1 %is.array, label %free.array, label %check.free.collection
check.free.collection:
  br i1 %is.collection, label %free.collection, label %check.free.function
check.free.function:
  br i1 %is.function, label %free.function, label %check.free.environment
check.free.environment:
  br i1 %is.environment, label %free.environment, label %check.free.iterator
check.free.iterator:
  br i1 %is.iterator, label %free.iterator, label %advance
free.string:
  ; The string data buffer is owned by this cell only when the owns-flag (header
  ; byte +4) is set: literal-backed strings borrow constant data and must not be
  ; freed. Free before reusing the +8 payload word as the free-list next pointer.
  %s.owns.ptr = getelementptr i8, ptr %cur, i64 4
  %s.owns = load i8, ptr %s.owns.ptr
  %s.owned = icmp ne i8 %s.owns, 0
  br i1 %s.owned, label %free.string.buf, label %free.string.link
free.string.buf:
  %s.data.ptr = getelementptr i8, ptr %cur, i64 8
  %s.data = load ptr, ptr %s.data.ptr
  call void @free(ptr %s.data)
  br label %free.string.link
free.string.link:
  %sh = load ptr, ptr @gcFreeString
  %snf = getelementptr i8, ptr %cur, i64 8
  store ptr %sh, ptr %snf
  store ptr %cur, ptr @gcFreeString
  store i8 3, ptr %color.ptr
  br label %advance
free.object:
  ; Entry table (payload +16 => cell +24) is always a private malloc; free it.
  %o.entries.ptr = getelementptr i8, ptr %cur, i64 24
  %o.entries = load ptr, ptr %o.entries.ptr
  call void @free(ptr %o.entries)
  %oh = load ptr, ptr @gcFreeObject
  %onf = getelementptr i8, ptr %cur, i64 8
  store ptr %oh, ptr %onf
  store ptr %cur, ptr @gcFreeObject
  store i8 3, ptr %color.ptr
  br label %advance
free.array:
  ; Element buffer (payload +16 => cell +24) is a private malloc; free it. The
  ; properties object (cell +40) is a separate GC cell, reclaimed on its own sweep.
  %a.elems.ptr = getelementptr i8, ptr %cur, i64 24
  %a.elems = load ptr, ptr %a.elems.ptr
  call void @free(ptr %a.elems)
  %ah = load ptr, ptr @gcFreeArray
  %anf = getelementptr i8, ptr %cur, i64 8
  store ptr %ah, ptr %anf
  store ptr %cur, ptr @gcFreeArray
  store i8 3, ptr %color.ptr
  br label %advance
free.collection:
  ; Entry buffer (payload +24 => cell +32) is a private malloc; free it.
  %c.entries.ptr = getelementptr i8, ptr %cur, i64 32
  %c.entries = load ptr, ptr %c.entries.ptr
  call void @free(ptr %c.entries)
  %ch = load ptr, ptr @gcFreeCollection
  %cnf = getelementptr i8, ptr %cur, i64 8
  store ptr %ch, ptr %cnf
  store ptr %cur, ptr @gcFreeCollection
  store i8 3, ptr %color.ptr
  br label %advance
free.function:
  %fh = load ptr, ptr @gcFreeFunction
  %fnf = getelementptr i8, ptr %cur, i64 8
  store ptr %fh, ptr %fnf
  store ptr %cur, ptr @gcFreeFunction
  store i8 3, ptr %color.ptr
  br label %advance
free.environment:
  ; Slots buffer (cell +16) is a private malloc owned by this env cell. Free it
  ; before recycling the cell into @gcFreeEnvironment via the payload +8 next ptr.
  %e.slots.ptr = getelementptr i8, ptr %cur, i64 16
  %e.slots = load ptr, ptr %e.slots.ptr
  call void @free(ptr %e.slots)
  %eh = load ptr, ptr @gcFreeEnvironment
  %enf = getelementptr i8, ptr %cur, i64 8
  store ptr %eh, ptr %enf
  store ptr %cur, ptr @gcFreeEnvironment
  store i8 3, ptr %color.ptr
  br label %advance
free.iterator:
  %ih = load ptr, ptr @gcFreeIterator
  %inf = getelementptr i8, ptr %cur, i64 8
  store ptr %ih, ptr %inf
  store ptr %cur, ptr @gcFreeIterator
  store i8 3, ptr %color.ptr
  br label %advance
black:
  store i8 0, ptr %color.ptr
  ; Survivor: add its full cell footprint (header + payload) to the live total.
  %b.size.ptr = getelementptr i8, ptr %cur, i64 2
  %b.size.i16 = load i16, ptr %b.size.ptr
  %b.size = zext i16 %b.size.i16 to i64
  %b.cell.bytes = add i64 %b.size, 8
  %b.live = load i64, ptr @gcLiveBytes
  %b.live.next = add i64 %b.live, %b.cell.bytes
  store i64 %b.live.next, ptr @gcLiveBytes
  br label %advance
advance:
  %size.ptr = getelementptr i8, ptr %cur, i64 2
  %size.i16 = load i16, ptr %size.ptr
  %size = zext i16 %size.i16 to i64
  %step.bytes = add i64 %size, 8
  %step.cur = getelementptr i8, ptr %cur, i64 %step.bytes
  br label %loop
exit:
  ret void
}

define void @gcCollect() {
entry:
  br label %root.loop
root.loop:
  %i = phi i64 [ 0, %entry ], [ %i.next, %root.advance ]
  %count = load i64, ptr @gcRootStackCount
  %done = icmp uge i64 %i, %count
  br i1 %done, label %drain.mark, label %mark.root
mark.root:
  %stack = load ptr, ptr @gcRootStack
  %slot.bytes = mul i64 %i, 8
  %slot = getelementptr i8, ptr %stack, i64 %slot.bytes
  %root = load i64, ptr %slot
  call void @gcMarkValue(i64 %root)
  br label %root.advance
root.advance:
  %i.next = add i64 %i, 1
  br label %root.loop
drain.mark:
  br label %drain.loop
drain.loop:
  %dcount = load i64, ptr @gcMarkStackCount
  %ddone = icmp eq i64 %dcount, 0
  br i1 %ddone, label %after.mark, label %drain.pop
drain.pop:
  %dcount2 = load i64, ptr @gcMarkStackCount
  %didx = sub i64 %dcount2, 1
  store i64 %didx, ptr @gcMarkStackCount
  %dstack = load ptr, ptr @gcMarkStack
  %dslot.bytes = mul i64 %didx, 8
  %dslot = getelementptr i8, ptr %dstack, i64 %dslot.bytes
  %dcell = load ptr, ptr %dslot
  call void @gcMarkObject(ptr %dcell)
  br label %drain.loop
after.mark:
  call void @gcSweep()
  store i64 0, ptr @gcBytesAllocd
  %colls = load i64, ptr @gcCollections
  %colls.next = add i64 %colls, 1
  store i64 %colls.next, ptr @gcCollections
  %trace = load i64, ptr @gcTrace
  %trace.on = icmp ne i64 %trace, 0
  br i1 %trace.on, label %trace.emit, label %ret
trace.emit:
  %live = load i64, ptr @gcLiveBytes
  %colls.print = load i64, ptr @gcCollections
  call i32 (ptr, ...) @printf(ptr @.gc.trace.fmt, i64 %colls.print, i64 %live)
  br label %ret
ret:
  ret void
}

define ptr @gcAlloc(i64 %tag, i64 %size) {
entry:
  %bytes = add i64 %size, 8
  %is.string = icmp eq i64 %tag, 1
  %is.object = icmp eq i64 %tag, 2
  %is.array = icmp eq i64 %tag, 3
  %is.collection = icmp eq i64 %tag, 4
  %is.function = icmp eq i64 %tag, 5
  %is.environment = icmp eq i64 %tag, 6
  %is.iterator = icmp eq i64 %tag, 7
  br i1 %is.string, label %try.string, label %try.object
try.string:
  %sh = load ptr, ptr @gcFreeString
  %se = icmp eq ptr %sh, null
  br i1 %se, label %bump.alloc, label %reuse.string
reuse.string:
  %snf = getelementptr i8, ptr %sh, i64 8
  %sn = load ptr, ptr %snf
  store ptr %sn, ptr @gcFreeString
  br label %init.header
try.object:
  br i1 %is.object, label %try.object.body, label %try.array
try.object.body:
  %oh = load ptr, ptr @gcFreeObject
  %oe = icmp eq ptr %oh, null
  br i1 %oe, label %bump.alloc, label %reuse.object
reuse.object:
  %onf = getelementptr i8, ptr %oh, i64 8
  %on = load ptr, ptr %onf
  store ptr %on, ptr @gcFreeObject
  br label %init.header
try.array:
  br i1 %is.array, label %try.array.body, label %try.collection
try.array.body:
  %ah = load ptr, ptr @gcFreeArray
  %ae = icmp eq ptr %ah, null
  br i1 %ae, label %bump.alloc, label %reuse.array
reuse.array:
  %anf = getelementptr i8, ptr %ah, i64 8
  %an = load ptr, ptr %anf
  store ptr %an, ptr @gcFreeArray
  br label %init.header
try.collection:
  br i1 %is.collection, label %try.collection.body, label %try.function
try.collection.body:
  %ch = load ptr, ptr @gcFreeCollection
  %ce = icmp eq ptr %ch, null
  br i1 %ce, label %bump.alloc, label %reuse.collection
reuse.collection:
  %cnf = getelementptr i8, ptr %ch, i64 8
  %cn = load ptr, ptr %cnf
  store ptr %cn, ptr @gcFreeCollection
  br label %init.header
try.function:
  br i1 %is.function, label %try.function.body, label %try.environment
try.function.body:
  %fh = load ptr, ptr @gcFreeFunction
  %fe = icmp eq ptr %fh, null
  br i1 %fe, label %bump.alloc, label %reuse.function
reuse.function:
  %fnf = getelementptr i8, ptr %fh, i64 8
  %fn = load ptr, ptr %fnf
  store ptr %fn, ptr @gcFreeFunction
  br label %init.header
try.environment:
  br i1 %is.environment, label %try.environment.body, label %try.iterator
try.environment.body:
  %eh = load ptr, ptr @gcFreeEnvironment
  %ee = icmp eq ptr %eh, null
  br i1 %ee, label %bump.alloc, label %reuse.environment
reuse.environment:
  %enf = getelementptr i8, ptr %eh, i64 8
  %en = load ptr, ptr %enf
  store ptr %en, ptr @gcFreeEnvironment
  br label %init.header
try.iterator:
  br i1 %is.iterator, label %try.iterator.body, label %bump.alloc
try.iterator.body:
  %ih = load ptr, ptr @gcFreeIterator
  %ie = icmp eq ptr %ih, null
  br i1 %ie, label %bump.alloc, label %reuse.iterator
reuse.iterator:
  %inf = getelementptr i8, ptr %ih, i64 8
  %in = load ptr, ptr %inf
  store ptr %in, ptr @gcFreeIterator
  br label %init.header
bump.alloc:
  %bump = load ptr, ptr @gcBumpPtr
  %arena.end = load ptr, ptr @gcArenaEnd
  %new.bump = getelementptr i8, ptr %bump, i64 %bytes
  %will.fit = icmp ule ptr %new.bump, %arena.end
  br i1 %will.fit, label %do.bump, label %oom
do.bump:
  store ptr %new.bump, ptr @gcBumpPtr
  br label %init.header
oom:
  call void @exit(i32 1)
  ret ptr null
init.header:
  %cell = phi ptr [ %sh, %reuse.string ], [ %oh, %reuse.object ], [ %ah, %reuse.array ], [ %ch, %reuse.collection ], [ %fh, %reuse.function ], [ %eh, %reuse.environment ], [ %ih, %reuse.iterator ], [ %bump, %do.bump ]
  %tag.i8 = trunc i64 %tag to i8
  store i8 %tag.i8, ptr %cell
  %color.slot = getelementptr i8, ptr %cell, i64 1
  store i8 0, ptr %color.slot
  %size.slot = getelementptr i8, ptr %cell, i64 2
  %size.i16 = trunc i64 %size to i16
  store i16 %size.i16, ptr %size.slot
  ; Clear the reserved header word (+4..+7). Bit 0 is the "owns external buffer"
  ; flag read by gcSweep for strings; zeroing here keeps a reused free-list cell
  ; from inheriting a stale owns flag.
  %reserved.slot = getelementptr i8, ptr %cell, i64 4
  store i32 0, ptr %reserved.slot
  %old.bytes = load i64, ptr @gcBytesAllocd
  %new.bytes = add i64 %old.bytes, %bytes
  store i64 %new.bytes, ptr @gcBytesAllocd
  %threshold = load i64, ptr @gcNextCollectAt
  %over.threshold = icmp sgt i64 %new.bytes, %threshold
  br i1 %over.threshold, label %mark.pending, label %done.alloc
mark.pending:
  store i64 1, ptr @gcCollectPending
  br label %done.alloc
done.alloc:
  ret ptr %cell
}

define i64 @gcStatsLiveBytes() {
entry:
  %live = load i64, ptr @gcLiveBytes
  ret i64 %live
}

define i64 @gcStatsCollections() {
entry:
  %colls = load i64, ptr @gcCollections
  ret i64 %colls
}
`);
    if (runtime.used.has("gcCollect")) {
      definitions.push(`; gcCollect emits a trace line on stderr when TSCN_GC_TRACE is set.
`);
    }
  }
  if (runtime.used.has("strConcat")) {
    definitions.push(`define ptr @strConcat(i64 %left.len, ptr %left.ptr, i64 %right.len, ptr %right.ptr) {
entry:
  %total = add i64 %left.len, %right.len
  %alloc.size = add i64 %total, 1
  %out = call ptr @malloc(i64 %alloc.size)
  call ptr @memcpy(ptr %out, ptr %left.ptr, i64 %left.len)
  %right.dst = getelementptr i8, ptr %out, i64 %left.len
  call ptr @memcpy(ptr %right.dst, ptr %right.ptr, i64 %right.len)
  %nul.ptr = getelementptr i8, ptr %out, i64 %total
  store i8 0, ptr %nul.ptr
  ret ptr %out
}
`);
  }
  if (runtime.used.has("strEquals")) {
    definitions.push(`define i1 @strEquals(i64 %left.len, ptr %left.ptr, i64 %right.len, ptr %right.ptr) {
entry:
  %same.len = icmp eq i64 %left.len, %right.len
  br i1 %same.len, label %compare, label %not.equal
compare:
  %cmp = call i32 @memcmp(ptr %left.ptr, ptr %right.ptr, i64 %left.len)
  %same.bytes = icmp eq i32 %cmp, 0
  br i1 %same.bytes, label %equal, label %not.equal
equal:
  ret i1 true
not.equal:
  ret i1 false
}
`);
  }
  if (runtime.used.has("stringIncludes")) {
    definitions.push(`define i1 @stringIncludes(i64 %hay.len, ptr %hay.ptr, i64 %needle.len, ptr %needle.ptr) {
entry:
  %empty = icmp eq i64 %needle.len, 0
  br i1 %empty, label %true, label %loop
loop:
  %i = phi i64 [ 0, %entry ], [ %next, %continue ]
  %remaining = sub i64 %hay.len, %i
  %enough = icmp uge i64 %remaining, %needle.len
  br i1 %enough, label %compare, label %false
compare:
  %ptr = getelementptr i8, ptr %hay.ptr, i64 %i
  %cmp = call i32 @memcmp(ptr %ptr, ptr %needle.ptr, i64 %needle.len)
  %same = icmp eq i32 %cmp, 0
  br i1 %same, label %true, label %continue
continue:
  %next = add i64 %i, 1
  br label %loop
true:
  ret i1 true
false:
  ret i1 false
}
`);
  }
  if (runtime.used.has("stringStartsWith") || runtime.used.has("stringStartsWithAt")) {
    definitions.push(`define i1 @stringStartsWith(i64 %value.len, ptr %value.ptr, i64 %search.len, ptr %search.ptr) {
entry:
  %enough = icmp uge i64 %value.len, %search.len
  br i1 %enough, label %compare, label %false
compare:
  %cmp = call i32 @memcmp(ptr %value.ptr, ptr %search.ptr, i64 %search.len)
  %same = icmp eq i32 %cmp, 0
  ret i1 %same
false:
  ret i1 false
}
`);
  }
  if (runtime.used.has("stringStartsWithAt")) {
    definitions.push(`define i1 @stringStartsWithAt(i64 %value.len, ptr %value.ptr, i64 %search.len, ptr %search.ptr, i64 %position) {
entry:
  %remaining = sub i64 %value.len, %position
  %enough = icmp uge i64 %remaining, %search.len
  br i1 %enough, label %compare, label %false
compare:
  %start = getelementptr i8, ptr %value.ptr, i64 %position
  %cmp = call i32 @memcmp(ptr %start, ptr %search.ptr, i64 %search.len)
  %same = icmp eq i32 %cmp, 0
  ret i1 %same
false:
  ret i1 false
}
`);
  }
  if (runtime.used.has("stringEndsWith")) {
    definitions.push(`define i1 @stringEndsWith(i64 %value.len, ptr %value.ptr, i64 %search.len, ptr %search.ptr) {
entry:
  %enough = icmp uge i64 %value.len, %search.len
  br i1 %enough, label %compare, label %false
compare:
  %offset = sub i64 %value.len, %search.len
  %ptr = getelementptr i8, ptr %value.ptr, i64 %offset
  %cmp = call i32 @memcmp(ptr %ptr, ptr %search.ptr, i64 %search.len)
  %same = icmp eq i32 %cmp, 0
  ret i1 %same
false:
  ret i1 false
}
`);
  }
  if (runtime.used.has("stringAt")) {
    definitions.push(`define { ptr, i64 } @stringAt(i64 %value.len, ptr %value.ptr, i64 %position) {
entry:
  %neg = icmp slt i64 %position, 0
  br i1 %neg, label %negative, label %positive
negative:
  %adjusted = add i64 %position, %value.len
  br label %check
positive:
  br label %check
check:
  %index = phi i64 [ %adjusted, %negative ], [ %position, %positive ]
  %in.range = icmp ult i64 %index, %value.len
  br i1 %in.range, label %hit, label %miss
hit:
  %char.ptr = getelementptr i8, ptr %value.ptr, i64 %index
  %out = call ptr @malloc(i64 2)
  %byte = load i8, ptr %char.ptr
  store i8 %byte, ptr %out
  %nul = getelementptr i8, ptr %out, i64 1
  store i8 0, ptr %nul
  %r0 = insertvalue { ptr, i64 } undef, ptr %out, 0
  %r1 = insertvalue { ptr, i64 } %r0, i64 1, 1
  ret { ptr, i64 } %r1
miss:
  ret { ptr, i64 } { ptr null, i64 0 }
}
`);
  }
  if (runtime.used.has("stringNormalize")) {
    definitions.push(`define { ptr, i64 } @stringNormalize(i64 %value.len, ptr %value.ptr) {
entry:
  %out = call ptr @malloc(i64 %value.len)
  call ptr @memcpy(ptr %out, ptr %value.ptr, i64 %value.len)
  %r0 = insertvalue { ptr, i64 } undef, ptr %out, 0
  %r1 = insertvalue { ptr, i64 } %r0, i64 %value.len, 1
  ret { ptr, i64 } %r1
}
`);
  }
  if (runtime.used.has("stringCharCodeAt")) {
    definitions.push(`define double @stringCharCodeAt(i64 %value.len, ptr %value.ptr, i64 %index) {
entry:
  %neg = icmp slt i64 %index, 0
  br i1 %neg, label %negative, label %positive
negative:
  %adjusted = add i64 %index, %value.len
  br label %check
positive:
  br label %check
check:
  %real = phi i64 [ %adjusted, %negative ], [ %index, %positive ]
  %in.range = icmp ult i64 %real, %value.len
  br i1 %in.range, label %hit, label %miss
hit:
  %byte.ptr = getelementptr i8, ptr %value.ptr, i64 %real
  %byte = load i8, ptr %byte.ptr
  %code = zext i8 %byte to i64
  %as.double = sitofp i64 %code to double
  ret double %as.double
miss:
  ret double 0x7FF8000000000000
}
`);
  }
  if (runtime.used.has("stringTrim") || runtime.used.has("stringTrimStart") || runtime.used.has("stringTrimEnd")) {
    definitions.push(`define i1 @stringIsAsciiWhitespace(i8 %byte) {
entry:
  %space = icmp eq i8 %byte, 32
  %tab = icmp eq i8 %byte, 9
  %lf = icmp eq i8 %byte, 10
  %cr = icmp eq i8 %byte, 13
  %a = or i1 %space, %tab
  %b = or i1 %lf, %cr
  %result = or i1 %a, %b
  ret i1 %result
}

define { ptr, i64 } @stringSliceCopy(ptr %value.ptr, i64 %start, i64 %len) {
entry:
  %alloc.size = add i64 %len, 1
  %out = call ptr @malloc(i64 %alloc.size)
  %src = getelementptr i8, ptr %value.ptr, i64 %start
  call ptr @memcpy(ptr %out, ptr %src, i64 %len)
  %nul = getelementptr i8, ptr %out, i64 %len
  store i8 0, ptr %nul
  %r0 = insertvalue { ptr, i64 } undef, ptr %out, 0
  %r1 = insertvalue { ptr, i64 } %r0, i64 %len, 1
  ret { ptr, i64 } %r1
}
`);
  }
  if (runtime.used.has("stringTrim") || runtime.used.has("stringTrimStart")) {
    definitions.push(`define i64 @stringTrimStartIndex(i64 %value.len, ptr %value.ptr) {
entry:
  br label %loop
loop:
  %i = phi i64 [ 0, %entry ], [ %next, %ws ]
  %done = icmp uge i64 %i, %value.len
  br i1 %done, label %end, label %check
check:
  %ptr = getelementptr i8, ptr %value.ptr, i64 %i
  %byte = load i8, ptr %ptr
  %is.ws = call i1 @stringIsAsciiWhitespace(i8 %byte)
  br i1 %is.ws, label %ws, label %end
ws:
  %next = add i64 %i, 1
  br label %loop
end:
  ret i64 %i
}
`);
  }
  if (runtime.used.has("stringTrim") || runtime.used.has("stringTrimEnd")) {
    definitions.push(`define i64 @stringTrimEndIndex(i64 %value.len, ptr %value.ptr) {
entry:
  br label %loop
loop:
  %i = phi i64 [ %value.len, %entry ], [ %prev, %ws ]
  %done = icmp eq i64 %i, 0
  br i1 %done, label %end, label %check
check:
  %prev = sub i64 %i, 1
  %ptr = getelementptr i8, ptr %value.ptr, i64 %prev
  %byte = load i8, ptr %ptr
  %is.ws = call i1 @stringIsAsciiWhitespace(i8 %byte)
  br i1 %is.ws, label %ws, label %end
ws:
  br label %loop
end:
  ret i64 %i
}
`);
  }
  if (runtime.used.has("stringTrim")) {
    definitions.push(`define { ptr, i64 } @stringTrim(i64 %value.len, ptr %value.ptr) {
entry:
  %start = call i64 @stringTrimStartIndex(i64 %value.len, ptr %value.ptr)
  %end = call i64 @stringTrimEndIndex(i64 %value.len, ptr %value.ptr)
  %raw.len = sub i64 %end, %start
  %negative = icmp slt i64 %raw.len, 0
  %len = select i1 %negative, i64 0, i64 %raw.len
  %result = call { ptr, i64 } @stringSliceCopy(ptr %value.ptr, i64 %start, i64 %len)
  ret { ptr, i64 } %result
}
`);
  }
  if (runtime.used.has("stringTrimStart")) {
    definitions.push(`define { ptr, i64 } @stringTrimStart(i64 %value.len, ptr %value.ptr) {
entry:
  %start = call i64 @stringTrimStartIndex(i64 %value.len, ptr %value.ptr)
  %len = sub i64 %value.len, %start
  %result = call { ptr, i64 } @stringSliceCopy(ptr %value.ptr, i64 %start, i64 %len)
  ret { ptr, i64 } %result
}
`);
  }
  if (runtime.used.has("stringTrimEnd")) {
    definitions.push(`define { ptr, i64 } @stringTrimEnd(i64 %value.len, ptr %value.ptr) {
entry:
  %end = call i64 @stringTrimEndIndex(i64 %value.len, ptr %value.ptr)
  %result = call { ptr, i64 } @stringSliceCopy(ptr %value.ptr, i64 0, i64 %end)
  ret { ptr, i64 } %result
}
`);
  }
  if (runtime.used.has("stringToUpperCase")) {
    definitions.push(`define { ptr, i64 } @stringToUpperCase(i64 %value.len, ptr %value.ptr) {
entry:
  %alloc.size = add i64 %value.len, 1
  %out = call ptr @malloc(i64 %alloc.size)
  br label %loop
loop:
  %i = phi i64 [ 0, %entry ], [ %next, %store ]
  %done = icmp eq i64 %i, %value.len
  br i1 %done, label %exit, label %body
body:
  %src = getelementptr i8, ptr %value.ptr, i64 %i
  %byte = load i8, ptr %src
  %ge.a = icmp uge i8 %byte, 97
  %le.z = icmp ule i8 %byte, 122
  %is.lower = and i1 %ge.a, %le.z
  %upper = sub i8 %byte, 32
  %result = select i1 %is.lower, i8 %upper, i8 %byte
  br label %store
store:
  %dst = getelementptr i8, ptr %out, i64 %i
  store i8 %result, ptr %dst
  %next = add i64 %i, 1
  br label %loop
exit:
  %nul = getelementptr i8, ptr %out, i64 %value.len
  store i8 0, ptr %nul
  %r0 = insertvalue { ptr, i64 } undef, ptr %out, 0
  %r1 = insertvalue { ptr, i64 } %r0, i64 %value.len, 1
  ret { ptr, i64 } %r1
}
`);
  }
  if (runtime.used.has("stringToLowerCase")) {
    definitions.push(`define { ptr, i64 } @stringToLowerCase(i64 %value.len, ptr %value.ptr) {
entry:
  %alloc.size = add i64 %value.len, 1
  %out = call ptr @malloc(i64 %alloc.size)
  br label %loop
loop:
  %i = phi i64 [ 0, %entry ], [ %next, %store ]
  %done = icmp eq i64 %i, %value.len
  br i1 %done, label %exit, label %body
body:
  %src = getelementptr i8, ptr %value.ptr, i64 %i
  %byte = load i8, ptr %src
  %ge.a = icmp uge i8 %byte, 65
  %le.z = icmp ule i8 %byte, 90
  %is.upper = and i1 %ge.a, %le.z
  %lower = add i8 %byte, 32
  %result = select i1 %is.upper, i8 %lower, i8 %byte
  br label %store
store:
  %dst = getelementptr i8, ptr %out, i64 %i
  store i8 %result, ptr %dst
  %next = add i64 %i, 1
  br label %loop
exit:
  %nul = getelementptr i8, ptr %out, i64 %value.len
  store i8 0, ptr %nul
  %r0 = insertvalue { ptr, i64 } undef, ptr %out, 0
  %r1 = insertvalue { ptr, i64 } %r0, i64 %value.len, 1
  ret { ptr, i64 } %r1
}
`);
  }
  if (runtime.used.has("stringRepeat")) {
    definitions.push(`define { ptr, i64 } @stringRepeat(i64 %value.len, ptr %value.ptr, i64 %count) {
entry:
  %nonpositive = icmp sle i64 %count, 0
  br i1 %nonpositive, label %empty, label %alloc
empty:
  %empty.out = call ptr @malloc(i64 1)
  store i8 0, ptr %empty.out
  %e0 = insertvalue { ptr, i64 } undef, ptr %empty.out, 0
  %e1 = insertvalue { ptr, i64 } %e0, i64 0, 1
  ret { ptr, i64 } %e1
alloc:
  %total = mul i64 %value.len, %count
  %alloc.size = add i64 %total, 1
  %out = call ptr @malloc(i64 %alloc.size)
  br label %loop
loop:
  %i = phi i64 [ 0, %alloc ], [ %next, %copy ]
  %done = icmp eq i64 %i, %count
  br i1 %done, label %exit, label %copy
copy:
  %offset = mul i64 %i, %value.len
  %dst = getelementptr i8, ptr %out, i64 %offset
  call ptr @memcpy(ptr %dst, ptr %value.ptr, i64 %value.len)
  %next = add i64 %i, 1
  br label %loop
exit:
  %nul = getelementptr i8, ptr %out, i64 %total
  store i8 0, ptr %nul
  %r0 = insertvalue { ptr, i64 } undef, ptr %out, 0
  %r1 = insertvalue { ptr, i64 } %r0, i64 %total, 1
  ret { ptr, i64 } %r1
}
`);
  }
  if (runtime.used.has("stringReplace")) {
    definitions.push(`define { ptr, i64 } @stringReplace(i64 %value.len, ptr %value.ptr, i64 %search.len, ptr %search.ptr, i64 %replacement.len, ptr %replacement.ptr) {
entry:
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %remaining = sub i64 %value.len, %i
  %enough = icmp uge i64 %remaining, %search.len
  br i1 %enough, label %compare, label %not.found
compare:
  %candidate = getelementptr i8, ptr %value.ptr, i64 %i
  %cmp = call i32 @memcmp(ptr %candidate, ptr %search.ptr, i64 %search.len)
  %same = icmp eq i32 %cmp, 0
  br i1 %same, label %found, label %advance
advance:
  %next = add i64 %i, 1
  br label %scan
not.found:
  %copy.size = add i64 %value.len, 1
  %copy = call ptr @malloc(i64 %copy.size)
  call ptr @memcpy(ptr %copy, ptr %value.ptr, i64 %value.len)
  %copy.nul = getelementptr i8, ptr %copy, i64 %value.len
  store i8 0, ptr %copy.nul
  %n0 = insertvalue { ptr, i64 } undef, ptr %copy, 0
  %n1 = insertvalue { ptr, i64 } %n0, i64 %value.len, 1
  ret { ptr, i64 } %n1
found:
  %without.search = sub i64 %value.len, %search.len
  %out.len = add i64 %without.search, %replacement.len
  %alloc.size = add i64 %out.len, 1
  %out = call ptr @malloc(i64 %alloc.size)
  call ptr @memcpy(ptr %out, ptr %value.ptr, i64 %i)
  %replacement.dst = getelementptr i8, ptr %out, i64 %i
  call ptr @memcpy(ptr %replacement.dst, ptr %replacement.ptr, i64 %replacement.len)
  %suffix.src.offset = add i64 %i, %search.len
  %suffix.src = getelementptr i8, ptr %value.ptr, i64 %suffix.src.offset
  %suffix.dst.offset = add i64 %i, %replacement.len
  %suffix.dst = getelementptr i8, ptr %out, i64 %suffix.dst.offset
  %suffix.len = sub i64 %value.len, %suffix.src.offset
  call ptr @memcpy(ptr %suffix.dst, ptr %suffix.src, i64 %suffix.len)
  %nul = getelementptr i8, ptr %out, i64 %out.len
  store i8 0, ptr %nul
  %r0 = insertvalue { ptr, i64 } undef, ptr %out, 0
  %r1 = insertvalue { ptr, i64 } %r0, i64 %out.len, 1
  ret { ptr, i64 } %r1
}
`);
  }
  if (runtime.used.has("stringReplaceAll")) {
    definitions.push(`define { ptr, i64 } @stringReplaceAll(i64 %value.len, ptr %value.ptr, i64 %search.len, ptr %search.ptr, i64 %replacement.len, ptr %replacement.ptr) {
entry:
  %empty.search = icmp eq i64 %search.len, 0
  br i1 %empty.search, label %copy.original, label %count.loop
copy.original:
  %copy.size = add i64 %value.len, 1
  %copy = call ptr @malloc(i64 %copy.size)
  call ptr @memcpy(ptr %copy, ptr %value.ptr, i64 %value.len)
  %copy.nul = getelementptr i8, ptr %copy, i64 %value.len
  store i8 0, ptr %copy.nul
  %c0 = insertvalue { ptr, i64 } undef, ptr %copy, 0
  %c1 = insertvalue { ptr, i64 } %c0, i64 %value.len, 1
  ret { ptr, i64 } %c1
count.loop:
  %ci = phi i64 [ 0, %entry ], [ %ci.next, %count.advance ], [ %ci.after.match, %count.match ]
  %count = phi i64 [ 0, %entry ], [ %count, %count.advance ], [ %count.next, %count.match ]
  %remaining = sub i64 %value.len, %ci
  %enough = icmp uge i64 %remaining, %search.len
  br i1 %enough, label %count.compare, label %alloc
count.compare:
  %candidate = getelementptr i8, ptr %value.ptr, i64 %ci
  %cmp = call i32 @memcmp(ptr %candidate, ptr %search.ptr, i64 %search.len)
  %same = icmp eq i32 %cmp, 0
  br i1 %same, label %count.match, label %count.advance
count.match:
  %count.next = add i64 %count, 1
  %ci.after.match = add i64 %ci, %search.len
  br label %count.loop
count.advance:
  %ci.next = add i64 %ci, 1
  br label %count.loop
alloc:
  %delta = sub i64 %replacement.len, %search.len
  %growth = mul i64 %delta, %count
  %out.len = add i64 %value.len, %growth
  %alloc.size = add i64 %out.len, 1
  %out = call ptr @malloc(i64 %alloc.size)
  br label %copy.loop
copy.loop:
  %si = phi i64 [ 0, %alloc ], [ %si.next, %copy.char ], [ %si.after.match, %copy.match ]
  %di = phi i64 [ 0, %alloc ], [ %di.next, %copy.char ], [ %di.after.match, %copy.match ]
  %done = icmp eq i64 %si, %value.len
  br i1 %done, label %exit, label %copy.check
copy.check:
  %remaining.copy = sub i64 %value.len, %si
  %enough.copy = icmp uge i64 %remaining.copy, %search.len
  br i1 %enough.copy, label %copy.compare, label %copy.char
copy.compare:
  %candidate.copy = getelementptr i8, ptr %value.ptr, i64 %si
  %cmp.copy = call i32 @memcmp(ptr %candidate.copy, ptr %search.ptr, i64 %search.len)
  %same.copy = icmp eq i32 %cmp.copy, 0
  br i1 %same.copy, label %copy.match, label %copy.char
copy.match:
  %replacement.dst = getelementptr i8, ptr %out, i64 %di
  call ptr @memcpy(ptr %replacement.dst, ptr %replacement.ptr, i64 %replacement.len)
  %si.after.match = add i64 %si, %search.len
  %di.after.match = add i64 %di, %replacement.len
  br label %copy.loop
copy.char:
  %src = getelementptr i8, ptr %value.ptr, i64 %si
  %byte = load i8, ptr %src
  %dst = getelementptr i8, ptr %out, i64 %di
  store i8 %byte, ptr %dst
  %si.next = add i64 %si, 1
  %di.next = add i64 %di, 1
  br label %copy.loop
exit:
  %nul = getelementptr i8, ptr %out, i64 %out.len
  store i8 0, ptr %nul
  %r0 = insertvalue { ptr, i64 } undef, ptr %out, 0
  %r1 = insertvalue { ptr, i64 } %r0, i64 %out.len, 1
  ret { ptr, i64 } %r1
}
`);
  }
  if (runtime.used.has("stringPadStart") || runtime.used.has("stringPadEnd")) {
    definitions.push(`define { ptr, i64 } @stringPad(i64 %value.len, ptr %value.ptr, i64 %target.len, i64 %pad.len, ptr %pad.ptr, i1 %at.start) {
entry:
  %needs.pad = icmp sgt i64 %target.len, %value.len
  %empty.pad = icmp eq i64 %pad.len, 0
  %not.needs.pad = xor i1 %needs.pad, true
  %skip.pad = or i1 %not.needs.pad, %empty.pad
  br i1 %skip.pad, label %copy.original, label %alloc
copy.original:
  %copy.size = add i64 %value.len, 1
  %copy = call ptr @malloc(i64 %copy.size)
  call ptr @memcpy(ptr %copy, ptr %value.ptr, i64 %value.len)
  %copy.nul = getelementptr i8, ptr %copy, i64 %value.len
  store i8 0, ptr %copy.nul
  %c0 = insertvalue { ptr, i64 } undef, ptr %copy, 0
  %c1 = insertvalue { ptr, i64 } %c0, i64 %value.len, 1
  ret { ptr, i64 } %c1
alloc:
  %needed = sub i64 %target.len, %value.len
  %alloc.size = add i64 %target.len, 1
  %out = call ptr @malloc(i64 %alloc.size)
  br i1 %at.start, label %pad.first, label %value.first
pad.first:
  br label %pad.loop
value.first:
  call ptr @memcpy(ptr %out, ptr %value.ptr, i64 %value.len)
  br label %pad.loop
pad.loop:
  %i = phi i64 [ 0, %pad.first ], [ 0, %value.first ], [ %next, %pad.store ]
  %done = icmp eq i64 %i, %needed
  br i1 %done, label %after.pad, label %pad.store
pad.store:
  %pad.index = urem i64 %i, %pad.len
  %pad.src = getelementptr i8, ptr %pad.ptr, i64 %pad.index
  %byte = load i8, ptr %pad.src
  %end.dst = add i64 %value.len, %i
  %dst.index = select i1 %at.start, i64 %i, i64 %end.dst
  %dst = getelementptr i8, ptr %out, i64 %dst.index
  store i8 %byte, ptr %dst
  %next = add i64 %i, 1
  br label %pad.loop
after.pad:
  br i1 %at.start, label %copy.value.after, label %finish
copy.value.after:
  %value.dst = getelementptr i8, ptr %out, i64 %needed
  call ptr @memcpy(ptr %value.dst, ptr %value.ptr, i64 %value.len)
  br label %finish
finish:
  %nul = getelementptr i8, ptr %out, i64 %target.len
  store i8 0, ptr %nul
  %r0 = insertvalue { ptr, i64 } undef, ptr %out, 0
  %r1 = insertvalue { ptr, i64 } %r0, i64 %target.len, 1
  ret { ptr, i64 } %r1
}
`);
  }
  if (runtime.used.has("stringPadStart")) {
    definitions.push(`define { ptr, i64 } @stringPadStart(i64 %value.len, ptr %value.ptr, i64 %target.len, i64 %pad.len, ptr %pad.ptr) {
entry:
  %result = call { ptr, i64 } @stringPad(i64 %value.len, ptr %value.ptr, i64 %target.len, i64 %pad.len, ptr %pad.ptr, i1 true)
  ret { ptr, i64 } %result
}
`);
  }
  if (runtime.used.has("stringPadEnd")) {
    definitions.push(`define { ptr, i64 } @stringPadEnd(i64 %value.len, ptr %value.ptr, i64 %target.len, i64 %pad.len, ptr %pad.ptr) {
entry:
  %result = call { ptr, i64 } @stringPad(i64 %value.len, ptr %value.ptr, i64 %target.len, i64 %pad.len, ptr %pad.ptr, i1 false)
  ret { ptr, i64 } %result
}
`);
  }
  if (runtime.used.has("stringSplit")) {
    definitions.push(`define ptr @stringSplit(i64 %value.len, ptr %value.ptr, i64 %separator.len, ptr %separator.ptr, i64 %limit) {
entry:
  %zero.limit = icmp eq i64 %limit, 0
  br i1 %zero.limit, label %empty.result, label %dispatch
empty.result:
  %empty = call ptr @arrayNew(i64 0)
  ret ptr %empty
dispatch:
  %empty.separator = icmp eq i64 %separator.len, 0
  br i1 %empty.separator, label %split.chars, label %split.separator
split.chars:
  %unlimited.chars = icmp slt i64 %limit, 0
  %len.lt.limit = icmp slt i64 %value.len, %limit
  %limit.bound = select i1 %len.lt.limit, i64 %value.len, i64 %limit
  %char.count = select i1 %unlimited.chars, i64 %value.len, i64 %limit.bound
  %char.array = call ptr @arrayNew(i64 0)
  br label %char.loop
char.loop:
  %char.i = phi i64 [ 0, %split.chars ], [ %char.next, %char.body ]
  %char.done = icmp eq i64 %char.i, %char.count
  br i1 %char.done, label %char.exit, label %char.body
char.body:
  %char.copy = call ptr @malloc(i64 2)
  %char.src = getelementptr i8, ptr %value.ptr, i64 %char.i
  %char.byte = load i8, ptr %char.src
  store i8 %char.byte, ptr %char.copy
  %char.nul = getelementptr i8, ptr %char.copy, i64 1
  store i8 0, ptr %char.nul
  %char.boxed = call i64 @valueBoxString(ptr %char.copy, i64 1)
  call void @arraySet(ptr %char.array, i64 %char.i, i64 %char.boxed)
  %char.next = add i64 %char.i, 1
  br label %char.loop
char.exit:
  ret ptr %char.array
split.separator:
  %array = call ptr @arrayNew(i64 0)
  br label %scan
scan:
  %start = phi i64 [ 0, %split.separator ], [ %next.start, %emit ]
  %out.index = phi i64 [ 0, %split.separator ], [ %next.out, %emit ]
  %at.limit = icmp eq i64 %out.index, %limit
  %limited = icmp sge i64 %limit, 0
  %limit.done = and i1 %limited, %at.limit
  br i1 %limit.done, label %exit, label %find
find:
  br label %find.loop
find.loop:
  %i = phi i64 [ %start, %find ], [ %find.next, %find.advance ]
  %remaining = sub i64 %value.len, %i
  %enough = icmp uge i64 %remaining, %separator.len
  br i1 %enough, label %find.compare, label %emit.end
find.compare:
  %candidate = getelementptr i8, ptr %value.ptr, i64 %i
  %cmp = call i32 @memcmp(ptr %candidate, ptr %separator.ptr, i64 %separator.len)
  %same = icmp eq i32 %cmp, 0
  br i1 %same, label %emit.match, label %find.advance
find.advance:
  %find.next = add i64 %i, 1
  br label %find.loop
emit.match:
  br label %emit
emit.end:
  br label %emit
emit:
  %end = phi i64 [ %i, %emit.match ], [ %value.len, %emit.end ]
  %is.end = phi i1 [ false, %emit.match ], [ true, %emit.end ]
  %part.len = sub i64 %end, %start
  %part.size = add i64 %part.len, 1
  %part.ptr = call ptr @malloc(i64 %part.size)
  %part.src = getelementptr i8, ptr %value.ptr, i64 %start
  call ptr @memcpy(ptr %part.ptr, ptr %part.src, i64 %part.len)
  %part.nul = getelementptr i8, ptr %part.ptr, i64 %part.len
  store i8 0, ptr %part.nul
  %boxed = call i64 @valueBoxString(ptr %part.ptr, i64 %part.len)
  call void @arraySet(ptr %array, i64 %out.index, i64 %boxed)
  %next.out = add i64 %out.index, 1
  %next.start = add i64 %end, %separator.len
  br i1 %is.end, label %exit, label %scan
exit:
  ret ptr %array
}
`);
  }
  if (runtime.used.has("valueStrictEquals")) {
    definitions.push(`define i1 @valueStrictEquals(i64 %left, i64 %right) {
entry:
  %same = icmp eq i64 %left, %right
  br i1 %same, label %equal, label %check.strings
check.strings:
  %left.tag = and i64 %left, ${legacyJsValue.tagMask()}
  %right.tag = and i64 %right, ${legacyJsValue.tagMask()}
  %left.string = icmp eq i64 %left.tag, ${legacyJsValue.referenceTag("string")}
  %right.string = icmp eq i64 %right.tag, ${legacyJsValue.referenceTag("string")}
  %both.strings = and i1 %left.string, %right.string
  br i1 %both.strings, label %string.compare, label %not.equal
string.compare:
  %left.len = call i64 @valueStringLength(i64 %left)
  %right.len = call i64 @valueStringLength(i64 %right)
  %same.len = icmp eq i64 %left.len, %right.len
  br i1 %same.len, label %string.bytes, label %not.equal
string.bytes:
  %left.ptr = call ptr @valueStringPtr(i64 %left)
  %right.ptr = call ptr @valueStringPtr(i64 %right)
  %cmp = call i32 @memcmp(ptr %left.ptr, ptr %right.ptr, i64 %left.len)
  %same.bytes = icmp eq i32 %cmp, 0
  br i1 %same.bytes, label %equal, label %not.equal
equal:
  ret i1 true
not.equal:
  ret i1 false
}
`);
  }
  if (runtime.used.has("valueSameValueZero")) {
    definitions.push(`define i1 @valueIsNumberForSameValueZero(i64 %value) {
entry:
  %is.undefined = icmp eq i64 %value, ${legacyJsValue.immediate("undefined")}
  br i1 %is.undefined, label %false, label %check.false
check.false:
  %is.false = icmp eq i64 %value, ${legacyJsValue.immediate("false")}
  br i1 %is.false, label %false, label %check.true
check.true:
  %is.true = icmp eq i64 %value, ${legacyJsValue.immediate("true")}
  br i1 %is.true, label %false, label %check.null
check.null:
  %is.null = icmp eq i64 %value, ${legacyJsValue.immediate("null")}
  br i1 %is.null, label %false, label %check.hole
check.hole:
  %is.hole = icmp eq i64 %value, ${legacyJsValue.arrayHole()}
  br i1 %is.hole, label %false, label %check.tag
check.tag:
  %tag = and i64 %value, ${legacyJsValue.tagMask()}
  %is.object = icmp eq i64 %tag, ${legacyJsValue.referenceTag("object")}
  %is.array = icmp eq i64 %tag, ${legacyJsValue.referenceTag("array")}
  %is.string = icmp eq i64 %tag, ${legacyJsValue.referenceTag("string")}
  %is.function = icmp eq i64 %tag, ${legacyJsValue.referenceTag("function")}
  %is.object.or.array = or i1 %is.object, %is.array
  %is.aggregate.or.string = or i1 %is.object.or.array, %is.string
  %is.boxed = or i1 %is.aggregate.or.string, %is.function
  br i1 %is.boxed, label %false, label %true
true:
  ret i1 true
false:
  ret i1 false
}

define i1 @valueSameValueZero(i64 %left, i64 %right) {
entry:
  %strict = call i1 @valueStrictEquals(i64 %left, i64 %right)
  br i1 %strict, label %true, label %number.guard
number.guard:
  %left.number = call i1 @valueIsNumberForSameValueZero(i64 %left)
  %right.number = call i1 @valueIsNumberForSameValueZero(i64 %right)
  %both.number = and i1 %left.number, %right.number
  br i1 %both.number, label %number.compare, label %false
number.compare:
  %left.d = call double @valueNumber(i64 %left)
  %right.d = call double @valueNumber(i64 %right)
  %numeric.equal = fcmp oeq double %left.d, %right.d
  br i1 %numeric.equal, label %true, label %nan.compare
nan.compare:
  %left.nan = fcmp uno double %left.d, %left.d
  %right.nan = fcmp uno double %right.d, %right.d
  %both.nan = and i1 %left.nan, %right.nan
  br i1 %both.nan, label %true, label %false
true:
  ret i1 true
false:
  ret i1 false
}
`);
  }
  if (runtime.used.has("valueToNumber")) {
    definitions.push(`define double @valueToNumber(i64 %value) {
entry:
  %is.undefined = icmp eq i64 %value, ${legacyJsValue.immediate("undefined")}
  br i1 %is.undefined, label %nan, label %check.null
check.null:
  %is.null = icmp eq i64 %value, ${legacyJsValue.immediate("null")}
  br i1 %is.null, label %zero, label %check.false
check.false:
  %is.false = icmp eq i64 %value, ${legacyJsValue.immediate("false")}
  br i1 %is.false, label %zero, label %check.true
check.true:
  %is.true = icmp eq i64 %value, ${legacyJsValue.immediate("true")}
  br i1 %is.true, label %one, label %check.string
check.string:
  %tag = and i64 %value, ${legacyJsValue.tagMask()}
  %is.string = icmp eq i64 %tag, ${legacyJsValue.referenceTag("string")}
  br i1 %is.string, label %string, label %check.aggregate
check.aggregate:
  %is.object = icmp eq i64 %tag, ${legacyJsValue.referenceTag("object")}
  %is.array = icmp eq i64 %tag, ${legacyJsValue.referenceTag("array")}
  %is.aggregate = or i1 %is.object, %is.array
  br i1 %is.aggregate, label %nan, label %as.number
string:
  %ptr = call ptr @valueStringPtr(i64 %value)
  br label %string.skip.ws
string.skip.ws:
  %scan.i = phi i64 [ 0, %string ], [ %scan.next, %scan_ws ]
  %scan.ptr = getelementptr i8, ptr %ptr, i64 %scan.i
  %scan.byte = load i8, ptr %scan.ptr
  %scan.is.space = icmp eq i8 %scan.byte, 32
  %scan.is.tab = icmp eq i8 %scan.byte, 9
  %scan.is.lf = icmp eq i8 %scan.byte, 10
  %scan.is.ws.0 = or i1 %scan.is.space, %scan.is.tab
  %scan.is.ws = or i1 %scan.is.ws.0, %scan.is.lf
  br i1 %scan.is.ws, label %scan_ws, label %string.validate
scan_ws:
  %scan.next = add i64 %scan.i, 1
  br label %string.skip.ws
string.validate:
  %is.digit.low = icmp uge i8 %scan.byte, 48
  %is.digit.high = icmp ule i8 %scan.byte, 57
  %is.digit = and i1 %is.digit.low, %is.digit.high
  %is.plus = icmp eq i8 %scan.byte, 43
  %is.minus = icmp eq i8 %scan.byte, 45
  %is.dot = icmp eq i8 %scan.byte, 46
  %sign = or i1 %is.plus, %is.minus
  %numeric.start.0 = or i1 %is.digit, %sign
  %numeric.start = or i1 %numeric.start.0, %is.dot
  br i1 %numeric.start, label %string.parse, label %nan
string.parse:
  %parsed = call double @strtod(ptr %ptr, ptr null)
  ret double %parsed
as.number:
  %number = call double @valueNumber(i64 %value)
  ret double %number
zero:
  ret double 0.0
one:
  ret double 1.0
nan:
  ret double 0x7FF5000000000000
}
`);
  }
  if (runtime.used.has("valueLooseEquals")) {
    definitions.push(`define i1 @valueLooseEquals(i64 %left, i64 %right) {
entry:
  %strict = call i1 @valueStrictEquals(i64 %left, i64 %right)
  br i1 %strict, label %true, label %nullish
nullish:
  %left.null = icmp eq i64 %left, ${legacyJsValue.immediate("null")}
  %left.undefined = icmp eq i64 %left, ${legacyJsValue.immediate("undefined")}
  %right.null = icmp eq i64 %right, ${legacyJsValue.immediate("null")}
  %right.undefined = icmp eq i64 %right, ${legacyJsValue.immediate("undefined")}
  %left.nullish = or i1 %left.null, %left.undefined
  %right.nullish = or i1 %right.null, %right.undefined
  %both.nullish = and i1 %left.nullish, %right.nullish
  br i1 %both.nullish, label %true, label %one.nullish
one.nullish:
  %either.nullish = or i1 %left.nullish, %right.nullish
  br i1 %either.nullish, label %false, label %numeric
numeric:
  %left.num = call double @valueToNumber(i64 %left)
  %right.num = call double @valueToNumber(i64 %right)
  %same = fcmp oeq double %left.num, %right.num
  ret i1 %same
true:
  ret i1 true
false:
  ret i1 false
}
`);
  }
  if (runtime.used.has("valueRelationalCompare")) {
    definitions.push(`define i1 @valueRelationalCompare(i64 %left, i64 %right, i64 %operator) {
entry:
  %left.tag = and i64 %left, ${legacyJsValue.tagMask()}
  %right.tag = and i64 %right, ${legacyJsValue.tagMask()}
  %left.string = icmp eq i64 %left.tag, ${legacyJsValue.referenceTag("string")}
  %right.string = icmp eq i64 %right.tag, ${legacyJsValue.referenceTag("string")}
  %both.strings = and i1 %left.string, %right.string
  br i1 %both.strings, label %strings, label %numbers
strings:
  %left.ptr = call ptr @valueStringPtr(i64 %left)
  %right.ptr = call ptr @valueStringPtr(i64 %right)
  %left.len = call i64 @valueStringLength(i64 %left)
  %right.len = call i64 @valueStringLength(i64 %right)
  %min.cmp = icmp ult i64 %left.len, %right.len
  %min = select i1 %min.cmp, i64 %left.len, i64 %right.len
  %byte.cmp = call i32 @memcmp(ptr %left.ptr, ptr %right.ptr, i64 %min)
  %byte.lt = icmp slt i32 %byte.cmp, 0
  %byte.gt = icmp sgt i32 %byte.cmp, 0
  %len.lt = icmp ult i64 %left.len, %right.len
  %len.gt = icmp ugt i64 %left.len, %right.len
  %lt.when.prefix = and i1 %len.lt, true
  %gt.when.prefix = and i1 %len.gt, true
  %bytes.equal = icmp eq i32 %byte.cmp, 0
  %prefix.lt = and i1 %bytes.equal, %lt.when.prefix
  %prefix.gt = and i1 %bytes.equal, %gt.when.prefix
  %str.lt = or i1 %byte.lt, %prefix.lt
  %str.gt = or i1 %byte.gt, %prefix.gt
  br label %select
numbers:
  %left.num = call double @valueToNumber(i64 %left)
  %right.num = call double @valueToNumber(i64 %right)
  %num.lt = fcmp olt double %left.num, %right.num
  %num.gt = fcmp ogt double %left.num, %right.num
  br label %select
select:
  %lt = phi i1 [ %str.lt, %strings ], [ %num.lt, %numbers ]
  %gt = phi i1 [ %str.gt, %strings ], [ %num.gt, %numbers ]
  %not.lt = xor i1 %lt, true
  %not.gt = xor i1 %gt, true
  %eq = and i1 %not.lt, %not.gt
  %op.lt = icmp eq i64 %operator, 0
  %op.le = icmp eq i64 %operator, 1
  %op.gt = icmp eq i64 %operator, 2
  %op.ge = icmp eq i64 %operator, 3
  %le = or i1 %lt, %eq
  %ge = or i1 %gt, %eq
  %r0 = select i1 %op.lt, i1 %lt, i1 false
  %r1 = select i1 %op.le, i1 %le, i1 %r0
  %r2 = select i1 %op.gt, i1 %gt, i1 %r1
  %r3 = select i1 %op.ge, i1 %ge, i1 %r2
  ret i1 %r3
}
`);
  }
  if (runtime.used.has("valuePlus")) {
    definitions.push(`define i64 @valuePlus(i64 %left, i64 %right) {
entry:
  %left.tag = and i64 %left, ${legacyJsValue.tagMask()}
  %right.tag = and i64 %right, ${legacyJsValue.tagMask()}
  %left.string = icmp eq i64 %left.tag, ${legacyJsValue.referenceTag("string")}
  %right.string = icmp eq i64 %right.tag, ${legacyJsValue.referenceTag("string")}
  %left.object = icmp eq i64 %left.tag, ${legacyJsValue.referenceTag("object")}
  %right.object = icmp eq i64 %right.tag, ${legacyJsValue.referenceTag("object")}
  %left.array = icmp eq i64 %left.tag, ${legacyJsValue.referenceTag("array")}
  %right.array = icmp eq i64 %right.tag, ${legacyJsValue.referenceTag("array")}
  %left.aggregate = or i1 %left.object, %left.array
  %right.aggregate = or i1 %right.object, %right.array
  %has.string.0 = or i1 %left.string, %right.string
  %has.aggregate = or i1 %left.aggregate, %right.aggregate
  %concat = or i1 %has.string.0, %has.aggregate
  br i1 %concat, label %strings, label %numbers
strings:
  %left.str = call { ptr, i64 } @valueToString(i64 %left)
  %left.ptr = extractvalue { ptr, i64 } %left.str, 0
  %left.len = extractvalue { ptr, i64 } %left.str, 1
  %right.str = call { ptr, i64 } @valueToString(i64 %right)
  %right.ptr = extractvalue { ptr, i64 } %right.str, 0
  %right.len = extractvalue { ptr, i64 } %right.str, 1
  %concat.ptr = call ptr @strConcat(i64 %left.len, ptr %left.ptr, i64 %right.len, ptr %right.ptr)
  %total = add i64 %left.len, %right.len
  %boxed = call i64 @valueBoxString(ptr %concat.ptr, i64 %total)
  ret i64 %boxed
numbers:
  %left.num = call double @valueToNumber(i64 %left)
  %right.num = call double @valueToNumber(i64 %right)
  %sum = fadd double %left.num, %right.num
  %sum.is.nan = fcmp uno double %sum, %sum
  %safe.sum = select i1 %sum.is.nan, double 0x7FF5000000000000, double %sum
  %boxed.num = call i64 @valueBoxNumber(double %safe.sum)
  ret i64 %boxed.num
}
`);
  }
  if (runtime.used.has("globalIsNaN")) {
    definitions.push(`define i1 @globalIsNaN(i64 %value) {
entry:
  %number = call double @valueToNumber(i64 %value)
  %ordered = fcmp ord double %number, %number
  %is.nan = xor i1 %ordered, true
  ret i1 %is.nan
}
`);
  }
  if (runtime.used.has("numberIsNaN")) {
    definitions.push(`define i1 @numberIsNaN(i64 %value) {
entry:
  %tag = and i64 %value, ${legacyJsValue.tagMask()}
  %is.boxed = icmp eq i64 %tag, ${legacyJsValue.referenceTag("string")}
  br i1 %is.boxed, label %false, label %as.number
as.number:
  %number = call double @valueNumber(i64 %value)
  %ordered = fcmp ord double %number, %number
  %is.nan = xor i1 %ordered, true
  ret i1 %is.nan
false:
  ret i1 false
}
`);
  }
  if (runtime.used.has("numberIsFinite")) {
    definitions.push(`define i1 @numberIsFinite(i64 %value) {
entry:
  %tag = and i64 %value, ${legacyJsValue.tagMask()}
  %is.boxed = icmp eq i64 %tag, ${legacyJsValue.referenceTag("string")}
  br i1 %is.boxed, label %false, label %as.number
as.number:
  %number = call double @valueNumber(i64 %value)
  %not.nan = fcmp ord double %number, %number
  %lt.zero = fcmp olt double %number, 0.0
  %neg = fneg double %number
  %abs = select i1 %lt.zero, double %neg, double %number
  %finite = fcmp olt double %abs, 0x7FF0000000000000
  %result = and i1 %not.nan, %finite
  ret i1 %result
false:
  ret i1 false
}
`);
  }
  if (runtime.used.has("numberIsInteger")) {
    definitions.push(`define i1 @numberIsInteger(i64 %value) {
entry:
  %finite = call i1 @numberIsFinite(i64 %value)
  br i1 %finite, label %check, label %false
check:
  %number = call double @valueNumber(i64 %value)
  %int = fptosi double %number to i64
  %truncated = sitofp i64 %int to double
  %is.integer = fcmp oeq double %number, %truncated
  ret i1 %is.integer
false:
  ret i1 false
}
`);
  }
  if (runtime.used.has("numberIsSafeInteger")) {
    definitions.push(`define i1 @numberIsSafeInteger(i64 %value) {
entry:
  %integer = call i1 @numberIsInteger(i64 %value)
  br i1 %integer, label %check, label %false
check:
  %number = call double @valueNumber(i64 %value)
  %abs = call double @mathAbs(double %number)
  %safe = fcmp ole double %abs, 9007199254740991.0
  ret i1 %safe
false:
  ret i1 false
}
`);
  }
  if (runtime.used.has("numberToFixed")) {
    definitions.push(`@.number.fmt.fixed = private unnamed_addr constant [5 x i8] c"%.*f\\00"

define { ptr, i64 } @numberToFixed(double %value, double %digits) {
entry:
  %buffer = call ptr @malloc(i64 128)
  %digits.i = fptosi double %digits to i32
  %written = call i32 (ptr, ptr, ...) @sprintf(ptr %buffer, ptr @.number.fmt.fixed, i32 %digits.i, double %value)
  %len = sext i32 %written to i64
  %result.0 = insertvalue { ptr, i64 } undef, ptr %buffer, 0
  %result.1 = insertvalue { ptr, i64 } %result.0, i64 %len, 1
  ret { ptr, i64 } %result.1
}
`);
  }
  if (runtime.used.has("numberToPrecision")) {
    definitions.push(`@.number.fmt.precision = private unnamed_addr constant [5 x i8] c"%.*g\\00"

define { ptr, i64 } @numberToPrecision(double %value, double %precision) {
entry:
  %buffer = call ptr @malloc(i64 128)
  %precision.i = fptosi double %precision to i32
  %written = call i32 (ptr, ptr, ...) @sprintf(ptr %buffer, ptr @.number.fmt.precision, i32 %precision.i, double %value)
  %len = sext i32 %written to i64
  br label %normalize
normalize:
  %has.exp.room = icmp sgt i64 %len, 4
  br i1 %has.exp.room, label %check.sign, label %ret.original
check.sign:
  %sign.index = sub i64 %len, 3
  %zero.index = sub i64 %len, 2
  %last.index = sub i64 %len, 1
  %sign.ptr = getelementptr i8, ptr %buffer, i64 %sign.index
  %zero.ptr = getelementptr i8, ptr %buffer, i64 %zero.index
  %last.ptr = getelementptr i8, ptr %buffer, i64 %last.index
  %sign = load i8, ptr %sign.ptr
  %zero = load i8, ptr %zero.ptr
  %last = load i8, ptr %last.ptr
  %is.plus = icmp eq i8 %sign, 43
  %is.minus = icmp eq i8 %sign, 45
  %is.sign = or i1 %is.plus, %is.minus
  %is.zero = icmp eq i8 %zero, 48
  %trim = and i1 %is.sign, %is.zero
  br i1 %trim, label %ret.trimmed, label %ret.original
ret.trimmed:
  store i8 %last, ptr %zero.ptr
  store i8 0, ptr %last.ptr
  %trimmed.len = sub i64 %len, 1
  %trimmed.0 = insertvalue { ptr, i64 } undef, ptr %buffer, 0
  %trimmed.1 = insertvalue { ptr, i64 } %trimmed.0, i64 %trimmed.len, 1
  ret { ptr, i64 } %trimmed.1
ret.original:
  %result.0 = insertvalue { ptr, i64 } undef, ptr %buffer, 0
  %result.1 = insertvalue { ptr, i64 } %result.0, i64 %len, 1
  ret { ptr, i64 } %result.1
}
`);
  }
  if (runtime.used.has("numberToExponential")) {
    definitions.push(`@.number.fmt.exponential = private unnamed_addr constant [5 x i8] c"%.*e\\00"

define { ptr, i64 } @numberToExponential(double %value, double %digits) {
entry:
  %buffer = call ptr @malloc(i64 128)
  %digits.i = fptosi double %digits to i32
  %written = call i32 (ptr, ptr, ...) @sprintf(ptr %buffer, ptr @.number.fmt.exponential, i32 %digits.i, double %value)
  %len = sext i32 %written to i64
  %sign.index = sub i64 %len, 3
  %zero.index = sub i64 %len, 2
  %last.index = sub i64 %len, 1
  %sign.ptr = getelementptr i8, ptr %buffer, i64 %sign.index
  %zero.ptr = getelementptr i8, ptr %buffer, i64 %zero.index
  %last.ptr = getelementptr i8, ptr %buffer, i64 %last.index
  %sign = load i8, ptr %sign.ptr
  %zero = load i8, ptr %zero.ptr
  %last = load i8, ptr %last.ptr
  %is.plus = icmp eq i8 %sign, 43
  %is.minus = icmp eq i8 %sign, 45
  %is.sign = or i1 %is.plus, %is.minus
  %is.zero = icmp eq i8 %zero, 48
  %trim = and i1 %is.sign, %is.zero
  br i1 %trim, label %ret.trimmed, label %ret.original
ret.trimmed:
  store i8 %last, ptr %zero.ptr
  store i8 0, ptr %last.ptr
  %trimmed.len = sub i64 %len, 1
  %trimmed.0 = insertvalue { ptr, i64 } undef, ptr %buffer, 0
  %trimmed.1 = insertvalue { ptr, i64 } %trimmed.0, i64 %trimmed.len, 1
  ret { ptr, i64 } %trimmed.1
ret.original:
  %result.0 = insertvalue { ptr, i64 } undef, ptr %buffer, 0
  %result.1 = insertvalue { ptr, i64 } %result.0, i64 %len, 1
  ret { ptr, i64 } %result.1
}
`);
  }
  if (runtime.used.has("numberToStringRadix")) {
    definitions.push(`@.number.fmt.default = private unnamed_addr constant [3 x i8] c"%g\\00"
@.number.radix.digits = private unnamed_addr constant [37 x i8] c"0123456789abcdefghijklmnopqrstuvwxyz\\00"

define { ptr, i64 } @numberToStringRadix(double %value, double %radix.value) {
entry:
  %radix = fptosi double %radix.value to i64
  %is.decimal = icmp eq i64 %radix, 10
  br i1 %is.decimal, label %decimal, label %convert
decimal:
  %decimal.buffer = call ptr @malloc(i64 128)
  %written = call i32 (ptr, ptr, ...) @sprintf(ptr %decimal.buffer, ptr @.number.fmt.default, double %value)
  %decimal.len = sext i32 %written to i64
  %decimal.0 = insertvalue { ptr, i64 } undef, ptr %decimal.buffer, 0
  %decimal.1 = insertvalue { ptr, i64 } %decimal.0, i64 %decimal.len, 1
  ret { ptr, i64 } %decimal.1
convert:
  %raw = fptosi double %value to i64
  %negative = icmp slt i64 %raw, 0
  %negated = sub i64 0, %raw
  %abs = select i1 %negative, i64 %negated, i64 %raw
  %scratch = call ptr @malloc(i64 128)
  %out = call ptr @malloc(i64 128)
  %is.zero = icmp eq i64 %abs, 0
  br i1 %is.zero, label %zero, label %digits.loop
zero:
  store i8 48, ptr %out
  %zero.end = getelementptr i8, ptr %out, i64 1
  store i8 0, ptr %zero.end
  %zero.0 = insertvalue { ptr, i64 } undef, ptr %out, 0
  %zero.1 = insertvalue { ptr, i64 } %zero.0, i64 1, 1
  ret { ptr, i64 } %zero.1
digits.loop:
  %n = phi i64 [ %abs, %convert ], [ %next.n, %digits.more ]
  %count = phi i64 [ 0, %convert ], [ %next.count, %digits.more ]
  %done = icmp eq i64 %n, 0
  br i1 %done, label %copy.setup, label %digits.more
digits.more:
  %rem = srem i64 %n, %radix
  %digit.ptr = getelementptr [37 x i8], ptr @.number.radix.digits, i64 0, i64 %rem
  %digit = load i8, ptr %digit.ptr
  %scratch.slot = getelementptr i8, ptr %scratch, i64 %count
  store i8 %digit, ptr %scratch.slot
  %next.n = sdiv i64 %n, %radix
  %next.count = add i64 %count, 1
  br label %digits.loop
copy.setup:
  br i1 %negative, label %copy.sign, label %copy.loop
copy.sign:
  store i8 45, ptr %out
  br label %copy.loop
copy.loop:
  %copy.i = phi i64 [ 0, %copy.setup ], [ 0, %copy.sign ], [ %copy.next, %copy.body ]
  %prefix = phi i64 [ 0, %copy.setup ], [ 1, %copy.sign ], [ %prefix, %copy.body ]
  %copy.done = icmp eq i64 %copy.i, %count
  br i1 %copy.done, label %copy.end, label %copy.body
copy.body:
  %rev.offset = sub i64 %count, %copy.i
  %src.index = sub i64 %rev.offset, 1
  %src = getelementptr i8, ptr %scratch, i64 %src.index
  %char = load i8, ptr %src
  %dst.index = add i64 %prefix, %copy.i
  %dst = getelementptr i8, ptr %out, i64 %dst.index
  store i8 %char, ptr %dst
  %copy.next = add i64 %copy.i, 1
  br label %copy.loop
copy.end:
  %len = add i64 %prefix, %count
  %nul = getelementptr i8, ptr %out, i64 %len
  store i8 0, ptr %nul
  %result.0 = insertvalue { ptr, i64 } undef, ptr %out, 0
  %result.1 = insertvalue { ptr, i64 } %result.0, i64 %len, 1
  ret { ptr, i64 } %result.1
}
`);
  }
  if (runtime.used.has("parseInt")) {
    definitions.push(`define double @parseInt(i64 %value.len, ptr %value.ptr) {
entry:
  %parsed = call double @strtod(ptr %value.ptr, ptr null)
  %int = fptosi double %parsed to i64
  %truncated = sitofp i64 %int to double
  ret double %truncated
}
`);
  }
  if (runtime.used.has("parseFloat")) {
    definitions.push(`define double @parseFloat(i64 %value.len, ptr %value.ptr) {
entry:
  %parsed = call double @strtod(ptr %value.ptr, ptr null)
  ret double %parsed
}
`);
  }
  if (runtime.used.has("mathAbs")) {
    definitions.push(`define double @mathAbs(double %value) {
entry:
  %lt = fcmp olt double %value, 0.0
  %neg = fneg double %value
  %result = select i1 %lt, double %neg, double %value
  ret double %result
}
`);
  }
  if (runtime.used.has("mathFloor")) {
    definitions.push(`define double @mathFloor(double %value) {
entry:
  %int = fptosi double %value to i64
  %result = sitofp i64 %int to double
  ret double %result
}
`);
  }
  if (runtime.used.has("mathCeil")) {
    definitions.push(`define double @mathCeil(double %value) {
entry:
  %int = fptosi double %value to i64
  %trunc = sitofp i64 %int to double
  %has.frac = fcmp ogt double %value, %trunc
  %next = add i64 %int, 1
  %ceil.int = select i1 %has.frac, i64 %next, i64 %int
  %result = sitofp i64 %ceil.int to double
  ret double %result
}
`);
  }
  if (runtime.used.has("mathTrunc")) {
    definitions.push(`define double @mathTrunc(double %value) {
entry:
  %int = fptosi double %value to i64
  %result = sitofp i64 %int to double
  ret double %result
}
`);
  }
  if (runtime.used.has("mathRound")) {
    definitions.push(`define double @mathRound(double %value) {
entry:
  %biased = fadd double %value, 5.000000e-01
  %int = fptosi double %biased to i64
  %result = sitofp i64 %int to double
  ret double %result
}
`);
  }
  if (runtime.used.has("mathSqrt")) {
    definitions.push(`define double @mathSqrt(double %value) {
entry:
  br label %loop
loop:
  %i = phi i64 [ 0, %entry ], [ %next.i, %loop ]
  %guess = phi double [ %value, %entry ], [ %next.guess, %loop ]
  %div = fdiv double %value, %guess
  %sum = fadd double %guess, %div
  %next.guess = fmul double %sum, 5.000000e-01
  %next.i = add i64 %i, 1
  %done = icmp eq i64 %next.i, 8
  br i1 %done, label %end, label %loop
end:
  ret double %next.guess
}
`);
  }
  if (runtime.used.has("mathPow")) {
    definitions.push(`define double @mathPow(double %base, double %exponent) {
entry:
  %result = call double @llvm.pow.f64(double %base, double %exponent)
  ret double %result
}
`);
  }
  if (runtime.used.has("mathCbrt")) {
    definitions.push(`define double @mathCbrt(double %value) {
entry:
  %negative = fcmp olt double %value, 0.0
  %abs = call double @mathAbs(double %value)
  br label %loop
loop:
  %i = phi i64 [ 0, %entry ], [ %next.i, %loop ]
  %guess = phi double [ %abs, %entry ], [ %next.guess, %loop ]
  %guess.sq = fmul double %guess, %guess
  %div = fdiv double %abs, %guess.sq
  %double.guess = fmul double %guess, 2.0
  %sum = fadd double %double.guess, %div
  %next.guess = fdiv double %sum, 3.0
  %next.i = add i64 %i, 1
  %done = icmp eq i64 %next.i, 12
  br i1 %done, label %end, label %loop
end:
  %negated = fneg double %next.guess
  %result = select i1 %negative, double %negated, double %next.guess
  ret double %result
}
`);
  }
  if (runtime.used.has("mathExp")) {
    definitions.push(`define double @mathExp(double %value) {
entry:
  %result = call double @llvm.exp.f64(double %value)
  ret double %result
}
`);
  }
  if (runtime.used.has("mathLog")) {
    definitions.push(`define double @mathLog(double %value) {
entry:
  %result = call double @llvm.log.f64(double %value)
  ret double %result
}
`);
  }
  if (runtime.used.has("mathLog2")) {
    definitions.push(`define double @mathLog2(double %value) {
entry:
  %result = call double @llvm.log2.f64(double %value)
  ret double %result
}
`);
  }
  if (runtime.used.has("mathLog10")) {
    definitions.push(`define double @mathLog10(double %value) {
entry:
  %result = call double @llvm.log10.f64(double %value)
  ret double %result
}
`);
  }
  if (runtime.used.has("mathHypot2")) {
    definitions.push(`define double @mathHypot2(double %left, double %right) {
entry:
  %left.sq = fmul double %left, %left
  %right.sq = fmul double %right, %right
  %sum = fadd double %left.sq, %right.sq
  %result = call double @mathSqrt(double %sum)
  ret double %result
}
`);
  }
  if (runtime.used.has("mathMin2")) {
    definitions.push(`define double @mathMin2(double %left, double %right) {
entry:
  %cmp = fcmp olt double %left, %right
  %result = select i1 %cmp, double %left, double %right
  ret double %result
}
`);
  }
  if (runtime.used.has("mathMax2")) {
    definitions.push(`define double @mathMax2(double %left, double %right) {
entry:
  %cmp = fcmp ogt double %left, %right
  %result = select i1 %cmp, double %left, double %right
  ret double %result
}
`);
  }
  if (runtime.used.has("mathSign")) {
    definitions.push(`define double @mathSign(double %value) {
entry:
  %lt = fcmp olt double %value, 0.0
  %gt = fcmp ogt double %value, 0.0
  %positive = select i1 %gt, double 1.0, double 0.0
  %result = select i1 %lt, double -1.0, double %positive
  ret double %result
}
`);
  }
  if (runtime.used.has("mathRandom")) {
    definitions.push(`@math.random.state = internal global i64 88172645463393265

define double @mathRandom() {
entry:
  %state = load i64, ptr @math.random.state
  %mul = mul i64 %state, 2862933555777941757
  %next = add i64 %mul, 3037000493
  store i64 %next, ptr @math.random.state
  %mantissa = lshr i64 %next, 12
  %as.double = uitofp i64 %mantissa to double
  %result = fdiv double %as.double, 4.503599627370496e+15
  ret double %result
}
`);
  }
  if (runtime.used.has("mathFround")) {
    definitions.push(`define double @mathFround(double %value) {
entry:
  %float = fptrunc double %value to float
  %result = fpext float %float to double
  ret double %result
}
`);
  }
  if (runtime.used.has("mathClz32")) {
    definitions.push(`define double @mathClz32(double %value) {
entry:
  %int = fptoui double %value to i32
  %count = call i32 @llvm.ctlz.i32(i32 %int, i1 false)
  %result = uitofp i32 %count to double
  ret double %result
}
`);
  }
  if (runtime.used.has("mathImul")) {
    definitions.push(`define double @mathImul(double %left, double %right) {
entry:
  %left.i = fptosi double %left to i32
  %right.i = fptosi double %right to i32
  %product = mul i32 %left.i, %right.i
  %result = sitofp i32 %product to double
  ret double %result
}
`);
  }
  if (runtime.used.has("mathSin")) {
    definitions.push(`define double @mathSin(double %value) {
entry:
  %result = call double @llvm.sin.f64(double %value)
  ret double %result
}
`);
  }
  if (runtime.used.has("mathCos")) {
    definitions.push(`define double @mathCos(double %value) {
entry:
  %result = call double @llvm.cos.f64(double %value)
  ret double %result
}
`);
  }
  if (runtime.used.has("mathTan")) {
    definitions.push(`define double @mathTan(double %value) {
entry:
  %sin = call double @llvm.sin.f64(double %value)
  %cos = call double @llvm.cos.f64(double %value)
  %result = fdiv double %sin, %cos
  ret double %result
}
`);
  }
  if (runtime.used.has("valueBoxString")) {
    // Phase B: the cell is allocated through gcAlloc so the 8-byte header is
    // present and the payload (ptr, len) starts at offset 8. valueStringPtr
    // and valueStringLength add 8 to the unboxed cell pointer.
    definitions.push(`define i64 @valueBoxString(ptr %string.ptr, i64 %string.len) {
entry:
  %cell = call ptr @gcAlloc(i64 1, i64 16)
  %payload = getelementptr i8, ptr %cell, i64 8
  store ptr %string.ptr, ptr %payload
  %len.slot = getelementptr i8, ptr %payload, i64 8
  store i64 %string.len, ptr %len.slot
  %box.bits = ptrtoint ptr %cell to i64
  %payload.bits = and i64 %box.bits, ${legacyJsValue.payloadMask()}
  %value = or i64 %payload.bits, ${legacyJsValue.referenceTag("string")}
  ret i64 %value
}
`);
  }
  if (runtime.used.has("valueStringPtr")) {
    definitions.push(`define ptr @valueStringPtr(i64 %value) {
entry:
  %box.bits = and i64 %value, ${legacyJsValue.payloadMask()}
  %box = inttoptr i64 %box.bits to ptr
  %payload = getelementptr i8, ptr %box, i64 8
  %ptr = load ptr, ptr %payload
  ret ptr %ptr
}
`);
  }
  if (runtime.used.has("valueStringLength")) {
    definitions.push(`define i64 @valueStringLength(i64 %value) {
entry:
  %box.bits = and i64 %value, ${legacyJsValue.payloadMask()}
  %box = inttoptr i64 %box.bits to ptr
  %payload = getelementptr i8, ptr %box, i64 8
  %len.slot = getelementptr i8, ptr %payload, i64 8
  %len = load i64, ptr %len.slot
  ret i64 %len
}
`);
  }
  if (runtime.used.has("valueBoxArray")) {
    definitions.push(`define i64 @valueBoxArray(ptr %array) {
entry:
  %bits = ptrtoint ptr %array to i64
  %payload = and i64 %bits, ${legacyJsValue.payloadMask()}
  %value = or i64 %payload, ${legacyJsValue.referenceTag("array")}
  ret i64 %value
}
`);
  }
  if (runtime.used.has("valueBoxFunction")) {
    definitions.push(`define i64 @valueBoxFunction(ptr %function) {
entry:
  %bits = ptrtoint ptr %function to i64
  %payload = and i64 %bits, ${legacyJsValue.payloadMask()}
  %value = or i64 %payload, ${legacyJsValue.referenceTag("function")}
  ret i64 %value
}
`);
  }
  if (runtime.used.has("valueObjectPtr")) {
    definitions.push(`define ptr @valueObjectPtr(i64 %value) {
entry:
  %bits = and i64 %value, ${legacyJsValue.payloadMask()}
  %ptr = inttoptr i64 %bits to ptr
  ret ptr %ptr
}
`);
  }
  if (runtime.used.has("valueArrayPtr")) {
    definitions.push(`define ptr @valueArrayPtr(i64 %value) {
entry:
  %bits = and i64 %value, ${legacyJsValue.payloadMask()}
  %ptr = inttoptr i64 %bits to ptr
  ret ptr %ptr
}
`);
  }
  if (runtime.used.has("valueFunctionPtr")) {
    definitions.push(`define ptr @valueFunctionPtr(i64 %value) {
entry:
  %bits = and i64 %value, ${legacyJsValue.payloadMask()}
  %ptr = inttoptr i64 %bits to ptr
  ret ptr %ptr
}
`);
  }
  if (runtime.used.has("functionObjectNew")) {
    definitions.push(`define i64 @functionObjectNew(ptr %code, ptr %env, i64 %boundThis, i64 %name.value) {
entry:
  %cell = call ptr @gcAlloc(i64 5, i64 48)
  %payload = getelementptr i8, ptr %cell, i64 8
  store ptr %code, ptr %payload
  %env.slot = getelementptr i8, ptr %payload, i64 8
  store ptr %env, ptr %env.slot
  %this.slot = getelementptr i8, ptr %payload, i64 16
  store i64 %boundThis, ptr %this.slot
  %prototype.slot = getelementptr i8, ptr %payload, i64 24
  store ptr null, ptr %prototype.slot
  %name.slot = getelementptr i8, ptr %payload, i64 32
  store i64 %name.value, ptr %name.slot
  %flags.slot = getelementptr i8, ptr %payload, i64 40
  store i64 0, ptr %flags.slot
  %value = call i64 @valueBoxFunction(ptr %payload)
  ret i64 %value
}
`);
  }
  if (runtime.used.has("jsCall")) {
    definitions.push(`define { i64, i1 } @jsCall(i64 %fn.value, i64 %argc, ptr %argv, i64 %callThis) {
entry:
  %function = call ptr @valueFunctionPtr(i64 %fn.value)
  %code = load ptr, ptr %function
  %env.slot = getelementptr i8, ptr %function, i64 8
  %env = load ptr, ptr %env.slot
  %this.slot = getelementptr i8, ptr %function, i64 16
  %boundThis = load i64, ptr %this.slot
  %has.bound.this = icmp ne i64 %boundThis, ${legacyJsValue.immediate("undefined")}
  %this.value = select i1 %has.bound.this, i64 %boundThis, i64 %callThis
  %result = call { i64, i1 } %code(i64 %argc, ptr %argv, ptr %env, i64 %this.value)
  ret { i64, i1 } %result
}
`);
  }
  if (runtime.used.has("environmentNew")) {
    definitions.push(`define ptr @environmentNew(i64 %count) {
entry:
  %slots.bytes = mul i64 %count, 8
  %slots = call ptr @malloc(i64 %slots.bytes)
  %cell = call ptr @gcAlloc(i64 6, i64 16)
  %env = getelementptr i8, ptr %cell, i64 8
  %count.slot = getelementptr i8, ptr %env, i64 0
  store i64 %count, ptr %count.slot
  %slots.slot = getelementptr i8, ptr %env, i64 8
  store ptr %slots, ptr %slots.slot
  ret ptr %env
}
`);
  }
  if (runtime.used.has("environmentGet")) {
    definitions.push(`define i64 @environmentGet(ptr %env, i64 %index) {
entry:
  %slots.slot = getelementptr i8, ptr %env, i64 8
  %slots = load ptr, ptr %slots.slot
  %slot.bytes = mul i64 %index, 8
  %slot = getelementptr i8, ptr %slots, i64 %slot.bytes
  %value = load i64, ptr %slot
  ret i64 %value
}
`);
  }
  if (runtime.used.has("environmentSet")) {
    definitions.push(`define void @environmentSet(ptr %env, i64 %index, i64 %value) {
entry:
  %slots.slot = getelementptr i8, ptr %env, i64 8
  %slots = load ptr, ptr %slots.slot
  %slot.bytes = mul i64 %index, 8
  %slot = getelementptr i8, ptr %slots, i64 %slot.bytes
  store i64 %value, ptr %slot
  ret void
}
`);
  }
  if (runtime.used.has("valueIsObject")) {
    definitions.push(`define i1 @valueIsObject(i64 %value) {
entry:
  %tag = and i64 %value, ${legacyJsValue.tagMask()}
  %is.object = icmp eq i64 %tag, ${legacyJsValue.referenceTag("object")}
  ret i1 %is.object
}
`);
  }
  if (runtime.used.has("valueIsArray")) {
    definitions.push(`define i1 @valueIsArray(i64 %value) {
entry:
  %tag = and i64 %value, ${legacyJsValue.tagMask()}
  %is.array = icmp eq i64 %tag, ${legacyJsValue.referenceTag("array")}
  ret i1 %is.array
}
`);
  }
  if (runtime.used.has("valueIsFunction")) {
    definitions.push(`define i1 @valueIsFunction(i64 %value) {
entry:
  %tag = and i64 %value, ${legacyJsValue.tagMask()}
  %is.function = icmp eq i64 %tag, ${legacyJsValue.referenceTag("function")}
  ret i1 %is.function
}
`);
  }
  if (runtime.used.has("valueIsString")) {
    definitions.push(`define i1 @valueIsString(i64 %value) {
entry:
  %tag = and i64 %value, ${legacyJsValue.tagMask()}
  %is.string = icmp eq i64 %tag, ${legacyJsValue.referenceTag("string")}
  ret i1 %is.string
}
`);
  }
  if (runtime.used.has("functionObjectGet")) {
    definitions.push(`@.function.name.key = private unnamed_addr constant [5 x i8] c"name\\00"
@.function.empty.name = private unnamed_addr constant [1 x i8] c"\\00"

define i64 @functionObjectGet(i64 %value, i64 %key.len, ptr %key.ptr) {
entry:
  %is.name.length = icmp eq i64 %key.len, 4
  br i1 %is.name.length, label %name.compare, label %missing
name.compare:
  %name.cmp = call i32 @memcmp(ptr %key.ptr, ptr @.function.name.key, i64 4)
  %is.name = icmp eq i32 %name.cmp, 0
  br i1 %is.name, label %name.load, label %missing
name.load:
  %function.ptr = call ptr @valueFunctionPtr(i64 %value)
  %name.slot = getelementptr i8, ptr %function.ptr, i64 32
  %name = load i64, ptr %name.slot
  %name.missing = icmp eq i64 %name, ${legacyJsValue.immediate("undefined")}
  br i1 %name.missing, label %name.empty, label %name.found
name.empty:
  %empty.name = call i64 @valueBoxString(ptr @.function.empty.name, i64 0)
  ret i64 %empty.name
name.found:
  ret i64 %name
missing:
  ret i64 ${legacyJsValue.immediate("undefined")}
}
`);
  }
  if (
    runtime.used.has("getIteratorValue") ||
    runtime.used.has("callIteratorNext") ||
    runtime.used.has("iteratorClose") ||
    runtime.used.has("valuePropertyGet") ||
    runtime.used.has("createArrayIterator") ||
    runtime.used.has("createStringIterator") ||
    runtime.used.has("createCollectionIterator") ||
    runtime.used.has("getCollectionIterator") ||
    runtime.used.has("builtinIteratorNext") ||
    runtime.used.has("arrayIteratorMethod") ||
    runtime.used.has("stringIteratorMethod") ||
    runtime.used.has("iteratorResultObject") ||
    runtime.used.has("mapFromIterable") ||
    runtime.used.has("setFromIterable") ||
    runtime.used.has("arrayFromValue")
  ) {
    const firstPrintableAscii = 32;
    const lastPrintableAscii = 126;
    const doubleQuote = 34;
    const backslash = 92;
    const hexRadix = 16;
    const iteratorKey = Buffer.from(SYMBOL_ITERATOR_SENTINEL, "utf8");
    const iteratorKeyEncoded = [...iteratorKey, 0]
      .map((byte) => {
        if (byte >= firstPrintableAscii && byte <= lastPrintableAscii && byte !== doubleQuote && byte !== backslash) {
          return String.fromCharCode(byte);
        }
        return `\\${byte.toString(hexRadix).toUpperCase().padStart(2, "0")}`;
      })
      .join("");
    const iteratorKeyLen = iteratorKey.length;
    definitions.push(`@.symbol.iterator.key = private unnamed_addr constant [${iteratorKeyLen + 1} x i8] c"${iteratorKeyEncoded}"
@.iter.key.next = private unnamed_addr constant [5 x i8] c"next\\00"
@.iter.key.return = private unnamed_addr constant [7 x i8] c"return\\00"
@.iter.key.value = private unnamed_addr constant [6 x i8] c"value\\00"
@.iter.key.done = private unnamed_addr constant [5 x i8] c"done\\00"
@.iter.key.0 = private unnamed_addr constant [2 x i8] c"0\\00"
@.iter.key.1 = private unnamed_addr constant [2 x i8] c"1\\00"
@.iter.err.name = private unnamed_addr constant [10 x i8] c"TypeError\\00"
@.iter.msg.iter.not.object = private unnamed_addr constant [54 x i8] c"Result of the Symbol.iterator method is not an object\\00"
@.iter.msg.prefix.number = private unnamed_addr constant [8 x i8] c"number \\00"
@.iter.msg.prefix.boolean = private unnamed_addr constant [9 x i8] c"boolean \\00"
@.iter.msg.prefix.object = private unnamed_addr constant [8 x i8] c"object \\00"
@.iter.msg.prefix.string = private unnamed_addr constant [9 x i8] c"string \\22\\00"
@.iter.msg.object.not.fn = private unnamed_addr constant [25 x i8] c"object is not a function\\00"
@.iter.msg.not.fn = private unnamed_addr constant [19 x i8] c" is not a function\\00"
@.iter.msg.quoted.not.fn = private unnamed_addr constant [20 x i8] c"\\22 is not a function\\00"
@.iter.msg.result.prefix = private unnamed_addr constant [17 x i8] c"Iterator result \\00"
@.iter.msg.not.object = private unnamed_addr constant [18 x i8] c" is not an object\\00"
@.iter.msg.entry.prefix = private unnamed_addr constant [16 x i8] c"Iterator value \\00"
@.iter.msg.entry.suffix = private unnamed_addr constant [24 x i8] c" is not an entry object\\00"
@.iter.msg.from.undefined = private unnamed_addr constant [73 x i8] c"undefined is not iterable (cannot read property Symbol(Symbol.iterator))\\00"
@.iter.msg.from.null = private unnamed_addr constant [75 x i8] c"object null is not iterable (cannot read property Symbol(Symbol.iterator))\\00"

define { i64, i1 } @iteratorTypeError(i64 %message) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %message)
  %error = call ptr @errorNew(i64 2, i64 9, ptr @.iter.err.name, i64 %message)
  %error.value = call i64 @valueBoxObject(ptr %error)
  %result.0 = insertvalue { i64, i1 } undef, i64 %error.value, 0
  %result.1 = insertvalue { i64, i1 } %result.0, i1 true, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %result.1
}
`);
    if (runtime.used.has("iteratorResultObject") || runtime.used.has("builtinIteratorNext")) {
      definitions.push(`define i64 @iteratorResultObject(i64 %value, i1 %done) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %value)
  %object = call ptr @objectNew(i64 2)
  call void @objectSet(ptr %object, i64 5, ptr @.iter.key.value, i64 %value)
  %done.value = select i1 %done, i64 ${legacyJsValue.immediate("true")}, i64 ${legacyJsValue.immediate("false")}
  call void @objectSet(ptr %object, i64 4, ptr @.iter.key.done, i64 %done.value)
  %boxed = call i64 @valueBoxObject(ptr %object)
  call void @gcRootRestore(i64 %frame)
  ret i64 %boxed
}
`);
    }
    if (
      runtime.used.has("createArrayIterator") ||
      runtime.used.has("createStringIterator") ||
      runtime.used.has("createCollectionIterator") ||
      runtime.used.has("builtinIteratorNext")
    ) {
      definitions.push(`define i64 @createIteratorObject(i64 %source.bits, i64 %source.kind, i64 %iteration.kind) {
entry:
  %frame = call i64 @gcRootSave()
  ; Only array/string sources are JSValues safe to root. Map/Set pass a raw
  ; collection payload pointer that the iterator state cell keeps alive via GC.
  %is.array = icmp eq i64 %source.kind, 0
  %is.string = icmp eq i64 %source.kind, 1
  %is.boxed = or i1 %is.array, %is.string
  br i1 %is.boxed, label %root.source, label %alloc
root.source:
  call void @gcRootPush(i64 %source.bits)
  br label %alloc
alloc:
  %cell = call ptr @gcAlloc(i64 7, i64 40)
  %state = getelementptr i8, ptr %cell, i64 8
  store i64 0, ptr %state
  %kind.slot = getelementptr i8, ptr %state, i64 8
  store i64 %source.kind, ptr %kind.slot
  %iter.slot = getelementptr i8, ptr %state, i64 16
  store i64 %iteration.kind, ptr %iter.slot
  %source.slot = getelementptr i8, ptr %state, i64 24
  store i64 %source.bits, ptr %source.slot
  %done.slot = getelementptr i8, ptr %state, i64 32
  store i64 0, ptr %done.slot
  %next.fn = call i64 @functionObjectNew(ptr @builtinIteratorNext, ptr %state, i64 ${legacyJsValue.immediate("undefined")}, i64 ${legacyJsValue.immediate("undefined")})
  call void @gcRootPush(i64 %next.fn)
  %object = call ptr @objectNew(i64 1)
  call void @objectSet(ptr %object, i64 4, ptr @.iter.key.next, i64 %next.fn)
  %boxed = call i64 @valueBoxObject(ptr %object)
  call void @gcRootRestore(i64 %frame)
  ret i64 %boxed
}

define i64 @createArrayIterator(i64 %array.value) {
entry:
  %result = call i64 @createIteratorObject(i64 %array.value, i64 0, i64 1)
  ret i64 %result
}

define i64 @createStringIterator(i64 %string.value) {
entry:
  %result = call i64 @createIteratorObject(i64 %string.value, i64 1, i64 1)
  ret i64 %result
}

define i64 @createCollectionIterator(ptr %collection, i64 %source.kind, i64 %iteration.kind) {
entry:
  %bits = ptrtoint ptr %collection to i64
  %result = call i64 @createIteratorObject(i64 %bits, i64 %source.kind, i64 %iteration.kind)
  ret i64 %result
}
`);
    }
    if (runtime.used.has("getCollectionIterator")) {
      definitions.push(`define { i64, i1 } @getCollectionIterator(ptr %collection, i64 %source.kind, i64 %iteration.kind) {
entry:
  %frame = call i64 @gcRootSave()
  %method.slot = getelementptr i8, ptr %collection, i64 32
  %method = load i64, ptr %method.slot
  call void @gcRootPush(i64 %method)
  %missing = icmp eq i64 %method, ${legacyJsValue.immediate("undefined")}
  br i1 %missing, label %default, label %check.method
default:
  %default.iterator = call i64 @createCollectionIterator(ptr %collection, i64 %source.kind, i64 %iteration.kind)
  br label %success
check.method:
  %callable = call i1 @valueIsFunction(i64 %method)
  br i1 %callable, label %call.method, label %not.callable
call.method:
  %argv = alloca i64, i64 0
  %call = call { i64, i1 } @jsCall(i64 %method, i64 0, ptr %argv, i64 ${legacyJsValue.immediate("undefined")})
  %custom.iterator = extractvalue { i64, i1 } %call, 0
  %call.exc = extractvalue { i64, i1 } %call, 1
  call void @gcRootPush(i64 %custom.iterator)
  br i1 %call.exc, label %propagate, label %check.result
check.result:
  %is.object = call i1 @valueIsObject(i64 %custom.iterator)
  br i1 %is.object, label %success, label %not.object
success:
  %iterator = phi i64 [ %default.iterator, %default ], [ %custom.iterator, %check.result ]
  %ok.0 = insertvalue { i64, i1 } undef, i64 %iterator, 0
  %ok.1 = insertvalue { i64, i1 } %ok.0, i1 false, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %ok.1
propagate:
  %prop.0 = insertvalue { i64, i1 } undef, i64 %custom.iterator, 0
  %prop.1 = insertvalue { i64, i1 } %prop.0, i1 true, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %prop.1
not.callable:
  %callable.msg = call i64 @iteratorNotCallableMessage(i64 %method)
  %callable.error = call { i64, i1 } @iteratorTypeError(i64 %callable.msg)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %callable.error
not.object:
  %object.msg = call i64 @valueBoxString(ptr @.iter.msg.iter.not.object, i64 53)
  %object.error = call { i64, i1 } @iteratorTypeError(i64 %object.msg)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %object.error
}
`);
    }
    if (runtime.used.has("arrayIteratorMethod") || runtime.used.has("valuePropertyGet")) {
      definitions.push(`define { i64, i1 } @arrayIteratorMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %iterator = call i64 @createArrayIterator(i64 %this.value)
  %ok.0 = insertvalue { i64, i1 } undef, i64 %iterator, 0
  %ok.1 = insertvalue { i64, i1 } %ok.0, i1 false, 1
  ret { i64, i1 } %ok.1
}
`);
    }
    if (runtime.used.has("stringIteratorMethod") || runtime.used.has("valuePropertyGet")) {
      definitions.push(`define { i64, i1 } @stringIteratorMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %iterator = call i64 @createStringIterator(i64 %this.value)
  %ok.0 = insertvalue { i64, i1 } undef, i64 %iterator, 0
  %ok.1 = insertvalue { i64, i1 } %ok.0, i1 false, 1
  ret { i64, i1 } %ok.1
}
`);
    }
    if (runtime.used.has("builtinIteratorNext")) {
      definitions.push(`define { i64, i1 } @builtinIteratorNext(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %frame = call i64 @gcRootSave()
  %done.slot = getelementptr i8, ptr %env, i64 32
  %done.flag = load i64, ptr %done.slot
  %is.done = icmp ne i64 %done.flag, 0
  br i1 %is.done, label %exhausted, label %load.state
load.state:
  %index = load i64, ptr %env
  %kind.slot = getelementptr i8, ptr %env, i64 8
  %source.kind = load i64, ptr %kind.slot
  %iter.slot = getelementptr i8, ptr %env, i64 16
  %iteration.kind = load i64, ptr %iter.slot
  %source.slot = getelementptr i8, ptr %env, i64 24
  %source.bits = load i64, ptr %source.slot
  %is.array = icmp eq i64 %source.kind, 0
  br i1 %is.array, label %array, label %check.string
check.string:
  %is.string = icmp eq i64 %source.kind, 1
  br i1 %is.string, label %string, label %collection
array:
  %array.ptr = call ptr @valueArrayPtr(i64 %source.bits)
  %array.len = call i64 @arrayLength(ptr %array.ptr)
  %array.done = icmp uge i64 %index, %array.len
  br i1 %array.done, label %mark.done, label %array.yield
array.yield:
  %array.value = call i64 @arrayGet(ptr %array.ptr, i64 %index)
  call void @gcRootPush(i64 %array.value)
  %array.next = add i64 %index, 1
  store i64 %array.next, ptr %env
  %array.result = call i64 @iteratorResultObject(i64 %array.value, i1 false)
  br label %success
string:
  %str.ptr = call ptr @valueStringPtr(i64 %source.bits)
  %str.len = call i64 @valueStringLength(i64 %source.bits)
  %string.done = icmp uge i64 %index, %str.len
  br i1 %string.done, label %mark.done, label %string.decode
string.decode:
  %byte.ptr = getelementptr i8, ptr %str.ptr, i64 %index
  %byte0 = load i8, ptr %byte.ptr
  %b0 = zext i8 %byte0 to i64
  %is.ascii = icmp ult i8 %byte0, 128
  br i1 %is.ascii, label %string.ascii, label %string.multi
string.ascii:
  %ascii.out = call ptr @malloc(i64 2)
  store i8 %byte0, ptr %ascii.out
  %ascii.nul = getelementptr i8, ptr %ascii.out, i64 1
  store i8 0, ptr %ascii.nul
  %ascii.next = add i64 %index, 1
  store i64 %ascii.next, ptr %env
  %ascii.value = call i64 @valueBoxString(ptr %ascii.out, i64 1)
  call void @gcRootPush(i64 %ascii.value)
  %ascii.result = call i64 @iteratorResultObject(i64 %ascii.value, i1 false)
  br label %success
string.multi:
  %is.2 = icmp ult i8 %byte0, 224
  %is.3 = icmp ult i8 %byte0, 240
  br i1 %is.2, label %string.2, label %string.check3
string.check3:
  br i1 %is.3, label %string.3, label %string.4
string.2:
  %seq.len.2 = add i64 0, 2
  br label %string.copy
string.3:
  %seq.len.3 = add i64 0, 3
  br label %string.copy
string.4:
  %seq.len.4 = add i64 0, 4
  br label %string.copy
string.copy:
  %seq.len = phi i64 [ %seq.len.2, %string.2 ], [ %seq.len.3, %string.3 ], [ %seq.len.4, %string.4 ]
  %remain = sub i64 %str.len, %index
  %fits = icmp ule i64 %seq.len, %remain
  %copy.len = select i1 %fits, i64 %seq.len, i64 1
  %alloc.size = add i64 %copy.len, 1
  %seq.out = call ptr @malloc(i64 %alloc.size)
  %seq.src = getelementptr i8, ptr %str.ptr, i64 %index
  call ptr @memcpy(ptr %seq.out, ptr %seq.src, i64 %copy.len)
  %seq.nul = getelementptr i8, ptr %seq.out, i64 %copy.len
  store i8 0, ptr %seq.nul
  %seq.next = add i64 %index, %copy.len
  store i64 %seq.next, ptr %env
  %seq.value = call i64 @valueBoxString(ptr %seq.out, i64 %copy.len)
  call void @gcRootPush(i64 %seq.value)
  %seq.result = call i64 @iteratorResultObject(i64 %seq.value, i1 false)
  br label %success
collection:
  %col.ptr = inttoptr i64 %source.bits to ptr
  br label %collection.scan
collection.scan:
  %scan.index = phi i64 [ %index, %collection ], [ %scan.next, %collection.advance ]
  %used.slot = getelementptr i8, ptr %col.ptr, i64 8
  %used = load i64, ptr %used.slot
  %in.range = icmp ult i64 %scan.index, %used
  br i1 %in.range, label %collection.check, label %mark.done
collection.check:
  %entries.slot = getelementptr i8, ptr %col.ptr, i64 24
  %entries = load ptr, ptr %entries.slot
  %entry.bytes = mul i64 %scan.index, 24
  %entry.ptr = getelementptr i8, ptr %entries, i64 %entry.bytes
  %active = load i64, ptr %entry.ptr
  %is.active = icmp ne i64 %active, 0
  br i1 %is.active, label %collection.found, label %collection.advance
collection.advance:
  %scan.next = add i64 %scan.index, 1
  br label %collection.scan
collection.found:
  %found.next = add i64 %scan.index, 1
  store i64 %found.next, ptr %env
  %key.slot = getelementptr i8, ptr %entry.ptr, i64 8
  %key = load i64, ptr %key.slot
  call void @gcRootPush(i64 %key)
  %is.keys = icmp eq i64 %iteration.kind, 0
  br i1 %is.keys, label %collection.keys, label %collection.not.keys
collection.not.keys:
  %is.map = icmp eq i64 %source.kind, 2
  br i1 %is.map, label %collection.map.value, label %collection.set.value
collection.map.value:
  %value.slot = getelementptr i8, ptr %entry.ptr, i64 16
  %map.value = load i64, ptr %value.slot
  call void @gcRootPush(i64 %map.value)
  %is.values = icmp eq i64 %iteration.kind, 1
  br i1 %is.values, label %collection.values.map, label %collection.entries.map
collection.set.value:
  %is.values.set = icmp eq i64 %iteration.kind, 1
  br i1 %is.values.set, label %collection.values.set, label %collection.entries.set
collection.keys:
  %keys.result = call i64 @iteratorResultObject(i64 %key, i1 false)
  br label %success
collection.values.map:
  %values.map.result = call i64 @iteratorResultObject(i64 %map.value, i1 false)
  br label %success
collection.values.set:
  %values.set.result = call i64 @iteratorResultObject(i64 %key, i1 false)
  br label %success
collection.entries.map:
  %pair.map = call ptr @arrayNew(i64 2)
  call void @arraySet(ptr %pair.map, i64 0, i64 %key)
  call void @arraySet(ptr %pair.map, i64 1, i64 %map.value)
  %pair.map.boxed = call i64 @valueBoxArray(ptr %pair.map)
  call void @gcRootPush(i64 %pair.map.boxed)
  %entries.map.result = call i64 @iteratorResultObject(i64 %pair.map.boxed, i1 false)
  br label %success
collection.entries.set:
  %pair.set = call ptr @arrayNew(i64 2)
  call void @arraySet(ptr %pair.set, i64 0, i64 %key)
  call void @arraySet(ptr %pair.set, i64 1, i64 %key)
  %pair.set.boxed = call i64 @valueBoxArray(ptr %pair.set)
  call void @gcRootPush(i64 %pair.set.boxed)
  %entries.set.result = call i64 @iteratorResultObject(i64 %pair.set.boxed, i1 false)
  br label %success
mark.done:
  store i64 1, ptr %done.slot
  br label %exhausted
exhausted:
  %exhausted.result = call i64 @iteratorResultObject(i64 ${legacyJsValue.immediate("undefined")}, i1 true)
  br label %success
success:
  %result.value = phi i64 [ %array.result, %array.yield ], [ %ascii.result, %string.ascii ], [ %seq.result, %string.copy ], [ %keys.result, %collection.keys ], [ %values.map.result, %collection.values.map ], [ %values.set.result, %collection.values.set ], [ %entries.map.result, %collection.entries.map ], [ %entries.set.result, %collection.entries.set ], [ %exhausted.result, %exhausted ]
  %ok.0 = insertvalue { i64, i1 } undef, i64 %result.value, 0
  %ok.1 = insertvalue { i64, i1 } %ok.0, i1 false, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %ok.1
}
`);
    }
    if (runtime.used.has("valuePropertyGet")) {
      definitions.push(`define i64 @valuePropertyGet(i64 %value, i64 %key.len, ptr %key.ptr) {
entry:
  %is.function = call i1 @valueIsFunction(i64 %value)
  br i1 %is.function, label %function, label %check.object
function:
  %function.result = call i64 @functionObjectGet(i64 %value, i64 %key.len, ptr %key.ptr)
  ret i64 %function.result
check.object:
  %is.object = call i1 @valueIsObject(i64 %value)
  br i1 %is.object, label %object, label %check.array
object:
  %object.ptr = call ptr @valueObjectPtr(i64 %value)
  %object.result = call i64 @objectGet(ptr %object.ptr, i64 %key.len, ptr %key.ptr)
  ret i64 %object.result
check.array:
  %is.array = call i1 @valueIsArray(i64 %value)
  br i1 %is.array, label %array, label %check.string
array:
  %array.ptr = call ptr @valueArrayPtr(i64 %value)
  %array.result = call i64 @arrayGetWithKey(ptr %array.ptr, i64 -1, i64 %key.len, ptr %key.ptr)
  %array.missing = icmp eq i64 %array.result, ${legacyJsValue.immediate("undefined")}
  br i1 %array.missing, label %array.builtin, label %array.hit
array.hit:
  ret i64 %array.result
array.builtin:
  %array.is.iter = icmp eq i64 %key.len, ${iteratorKeyLen}
  br i1 %array.is.iter, label %array.iter.cmp, label %missing
array.iter.cmp:
  %array.key.cmp = call i32 @memcmp(ptr %key.ptr, ptr @.symbol.iterator.key, i64 ${iteratorKeyLen})
  %array.key.same = icmp eq i32 %array.key.cmp, 0
  br i1 %array.key.same, label %array.iter, label %missing
array.iter:
  %array.method = call i64 @functionObjectNew(ptr @arrayIteratorMethod, ptr null, i64 ${legacyJsValue.immediate("undefined")}, i64 ${legacyJsValue.immediate("undefined")})
  ret i64 %array.method
check.string:
  %is.string = call i1 @valueIsString(i64 %value)
  br i1 %is.string, label %string.builtin, label %missing
string.builtin:
  %string.is.iter = icmp eq i64 %key.len, ${iteratorKeyLen}
  br i1 %string.is.iter, label %string.iter.cmp, label %missing
string.iter.cmp:
  %string.key.cmp = call i32 @memcmp(ptr %key.ptr, ptr @.symbol.iterator.key, i64 ${iteratorKeyLen})
  %string.key.same = icmp eq i32 %string.key.cmp, 0
  br i1 %string.key.same, label %string.iter, label %missing
string.iter:
  %string.method = call i64 @functionObjectNew(ptr @stringIteratorMethod, ptr null, i64 ${legacyJsValue.immediate("undefined")}, i64 ${legacyJsValue.immediate("undefined")})
  ret i64 %string.method
missing:
  ret i64 ${legacyJsValue.immediate("undefined")}
}
`);
    }
    if (runtime.used.has("getIteratorValue")) {
      definitions.push(`define { i64, i1 } @getIteratorValue(i64 %iterable, i64 %not.iterable.message) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %iterable)
  call void @gcRootPush(i64 %not.iterable.message)
  %is.object = call i1 @valueIsObject(i64 %iterable)
  %is.array = call i1 @valueIsArray(i64 %iterable)
  %is.string = call i1 @valueIsString(i64 %iterable)
  %is.obj.or.arr = or i1 %is.object, %is.array
  %is.iterable.tag = or i1 %is.obj.or.arr, %is.string
  br i1 %is.iterable.tag, label %lookup, label %not.iterable
lookup:
  %method = call i64 @valuePropertyGet(i64 %iterable, i64 ${iteratorKeyLen}, ptr @.symbol.iterator.key)
  call void @gcRootPush(i64 %method)
  %is.fn = call i1 @valueIsFunction(i64 %method)
  br i1 %is.fn, label %call.method, label %not.iterable
call.method:
  %argv = alloca i64, i64 0
  %call = call { i64, i1 } @jsCall(i64 %method, i64 0, ptr %argv, i64 %iterable)
  %call.payload = extractvalue { i64, i1 } %call, 0
  %call.exc = extractvalue { i64, i1 } %call, 1
  call void @gcRootPush(i64 %call.payload)
  br i1 %call.exc, label %propagate, label %check.iterator
propagate:
  %prop.0 = insertvalue { i64, i1 } undef, i64 %call.payload, 0
  %prop.1 = insertvalue { i64, i1 } %prop.0, i1 true, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %prop.1
check.iterator:
  %iter.is.object = call i1 @valueIsObject(i64 %call.payload)
  br i1 %iter.is.object, label %success, label %iter.not.object
success:
  %ok.0 = insertvalue { i64, i1 } undef, i64 %call.payload, 0
  %ok.1 = insertvalue { i64, i1 } %ok.0, i1 false, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %ok.1
not.iterable:
  %not.iterable.error = call { i64, i1 } @iteratorTypeError(i64 %not.iterable.message)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %not.iterable.error
iter.not.object:
  %msg.ino = call i64 @valueBoxString(ptr @.iter.msg.iter.not.object, i64 53)
  %iter.not.object.error = call { i64, i1 } @iteratorTypeError(i64 %msg.ino)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %iter.not.object.error
}
`);
    }
    if (runtime.used.has("callIteratorNext") || runtime.used.has("getCollectionIterator") || runtime.used.has("iteratorClose")) {
      definitions.push(`define i64 @iteratorNotCallableMessage(i64 %value) {
entry:
  %raw = call { ptr, i64 } @valueToString(i64 %value)
  %raw.ptr = extractvalue { ptr, i64 } %raw, 0
  %raw.len = extractvalue { ptr, i64 } %raw, 1
  %tag = and i64 %value, ${legacyJsValue.tagMask()}
  %is.string = icmp eq i64 %tag, ${legacyJsValue.referenceTag("string")}
  br i1 %is.string, label %string, label %check.undefined
check.undefined:
  %is.undefined = icmp eq i64 %value, ${legacyJsValue.immediate("undefined")}
  br i1 %is.undefined, label %without.prefix, label %check.null
check.null:
  %is.null = icmp eq i64 %value, ${legacyJsValue.immediate("null")}
  br i1 %is.null, label %null, label %check.boolean
check.boolean:
  %is.false = icmp eq i64 %value, ${legacyJsValue.immediate("false")}
  %is.true = icmp eq i64 %value, ${legacyJsValue.immediate("true")}
  %is.boolean = or i1 %is.false, %is.true
  br i1 %is.boolean, label %boolean, label %check.reference
check.reference:
  %is.object = icmp eq i64 %tag, ${legacyJsValue.referenceTag("object")}
  %is.array = icmp eq i64 %tag, ${legacyJsValue.referenceTag("array")}
  %is.reference = or i1 %is.object, %is.array
  br i1 %is.reference, label %object, label %number
null:
  br label %with.prefix
boolean:
  br label %with.prefix
number:
  br label %with.prefix
with.prefix:
  %prefix.ptr = phi ptr [ @.iter.msg.prefix.object, %null ], [ @.iter.msg.prefix.boolean, %boolean ], [ @.iter.msg.prefix.number, %number ]
  %prefix.len = phi i64 [ 7, %null ], [ 8, %boolean ], [ 7, %number ]
  %prefixed.ptr = call ptr @strConcat(i64 %prefix.len, ptr %prefix.ptr, i64 %raw.len, ptr %raw.ptr)
  %prefixed.len = add i64 %prefix.len, %raw.len
  br label %append.suffix
without.prefix:
  br label %append.suffix
append.suffix:
  %base.ptr = phi ptr [ %prefixed.ptr, %with.prefix ], [ %raw.ptr, %without.prefix ]
  %base.len = phi i64 [ %prefixed.len, %with.prefix ], [ %raw.len, %without.prefix ]
  %message.ptr = call ptr @strConcat(i64 %base.len, ptr %base.ptr, i64 18, ptr @.iter.msg.not.fn)
  %message.len = add i64 %base.len, 18
  %message = call i64 @valueBoxString(ptr %message.ptr, i64 %message.len)
  ret i64 %message
string:
  %quoted.ptr = call ptr @strConcat(i64 8, ptr @.iter.msg.prefix.string, i64 %raw.len, ptr %raw.ptr)
  %quoted.len = add i64 %raw.len, 8
  %string.message.ptr = call ptr @strConcat(i64 %quoted.len, ptr %quoted.ptr, i64 19, ptr @.iter.msg.quoted.not.fn)
  %string.message.len = add i64 %quoted.len, 19
  %string.message = call i64 @valueBoxString(ptr %string.message.ptr, i64 %string.message.len)
  ret i64 %string.message
object:
  %object.message = call i64 @valueBoxString(ptr @.iter.msg.object.not.fn, i64 24)
  ret i64 %object.message
}

define i64 @iteratorResultNotObjectMessage(i64 %value) {
entry:
  %raw = call { ptr, i64 } @valueToString(i64 %value)
  %raw.ptr = extractvalue { ptr, i64 } %raw, 0
  %raw.len = extractvalue { ptr, i64 } %raw, 1
  %prefixed.ptr = call ptr @strConcat(i64 16, ptr @.iter.msg.result.prefix, i64 %raw.len, ptr %raw.ptr)
  %prefixed.len = add i64 %raw.len, 16
  %message.ptr = call ptr @strConcat(i64 %prefixed.len, ptr %prefixed.ptr, i64 17, ptr @.iter.msg.not.object)
  %message.len = add i64 %prefixed.len, 17
  %message = call i64 @valueBoxString(ptr %message.ptr, i64 %message.len)
  ret i64 %message
}

define i64 @iteratorEntryNotObjectMessage(i64 %value) {
entry:
  %raw = call { ptr, i64 } @valueToString(i64 %value)
  %raw.ptr = extractvalue { ptr, i64 } %raw, 0
  %raw.len = extractvalue { ptr, i64 } %raw, 1
  %prefixed.ptr = call ptr @strConcat(i64 15, ptr @.iter.msg.entry.prefix, i64 %raw.len, ptr %raw.ptr)
  %prefixed.len = add i64 %raw.len, 15
  %message.ptr = call ptr @strConcat(i64 %prefixed.len, ptr %prefixed.ptr, i64 23, ptr @.iter.msg.entry.suffix)
  %message.len = add i64 %prefixed.len, 23
  %message = call i64 @valueBoxString(ptr %message.ptr, i64 %message.len)
  ret i64 %message
}

define { i64, i1 } @callIteratorNext(i64 %iterator) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %iterator)
  %is.object = call i1 @valueIsObject(i64 %iterator)
  br i1 %is.object, label %lookup, label %result.not.object
lookup:
  %next = call i64 @valueObjectGet(i64 %iterator, i64 4, ptr @.iter.key.next)
  call void @gcRootPush(i64 %next)
  %is.fn = call i1 @valueIsFunction(i64 %next)
  br i1 %is.fn, label %call.next, label %next.not.fn
call.next:
  %argv = alloca i64, i64 0
  %call = call { i64, i1 } @jsCall(i64 %next, i64 0, ptr %argv, i64 %iterator)
  %call.payload = extractvalue { i64, i1 } %call, 0
  %call.exc = extractvalue { i64, i1 } %call, 1
  call void @gcRootPush(i64 %call.payload)
  br i1 %call.exc, label %propagate, label %check.result
propagate:
  %prop.0 = insertvalue { i64, i1 } undef, i64 %call.payload, 0
  %prop.1 = insertvalue { i64, i1 } %prop.0, i1 true, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %prop.1
check.result:
  %res.is.object = call i1 @valueIsObject(i64 %call.payload)
  br i1 %res.is.object, label %success, label %result.not.object
success:
  %ok.0 = insertvalue { i64, i1 } undef, i64 %call.payload, 0
  %ok.1 = insertvalue { i64, i1 } %ok.0, i1 false, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %ok.1
next.not.fn:
  %msg.nn = call i64 @iteratorNotCallableMessage(i64 %next)
  %next.not.fn.error = call { i64, i1 } @iteratorTypeError(i64 %msg.nn)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %next.not.fn.error
result.not.object:
  %invalid.result = phi i64 [ %iterator, %entry ], [ %call.payload, %check.result ]
  %msg.rno = call i64 @iteratorResultNotObjectMessage(i64 %invalid.result)
  %result.not.object.error = call { i64, i1 } @iteratorTypeError(i64 %msg.rno)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %result.not.object.error
}
`);
    }
    if (runtime.used.has("iteratorClose")) {
      // IteratorClose protocol mechanics only. Resolution against a pending throw
      // completion is owned by compiler control flow (ES IteratorClose steps 5–7).
      definitions.push(`define { i64, i1 } @iteratorClose(i64 %iterator) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %iterator)
  %return.method = call i64 @valuePropertyGet(i64 %iterator, i64 6, ptr @.iter.key.return)
  call void @gcRootPush(i64 %return.method)
  %is.undefined = icmp eq i64 %return.method, ${legacyJsValue.immediate("undefined")}
  br i1 %is.undefined, label %absent, label %check.null
check.null:
  %is.null = icmp eq i64 %return.method, ${legacyJsValue.immediate("null")}
  br i1 %is.null, label %absent, label %check.callable
absent:
  %abs.0 = insertvalue { i64, i1 } undef, i64 ${legacyJsValue.immediate("undefined")}, 0
  %abs.1 = insertvalue { i64, i1 } %abs.0, i1 false, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %abs.1
check.callable:
  %is.fn = call i1 @valueIsFunction(i64 %return.method)
  br i1 %is.fn, label %call.return, label %not.callable
call.return:
  %argv = alloca i64, i64 0
  %call = call { i64, i1 } @jsCall(i64 %return.method, i64 0, ptr %argv, i64 %iterator)
  %call.payload = extractvalue { i64, i1 } %call, 0
  %call.exc = extractvalue { i64, i1 } %call, 1
  call void @gcRootPush(i64 %call.payload)
  br i1 %call.exc, label %propagate, label %check.result
propagate:
  %prop.0 = insertvalue { i64, i1 } undef, i64 %call.payload, 0
  %prop.1 = insertvalue { i64, i1 } %prop.0, i1 true, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %prop.1
check.result:
  %res.is.object = call i1 @valueIsObject(i64 %call.payload)
  br i1 %res.is.object, label %success, label %result.not.object
success:
  %ok.0 = insertvalue { i64, i1 } undef, i64 %call.payload, 0
  %ok.1 = insertvalue { i64, i1 } %ok.0, i1 false, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %ok.1
not.callable:
  %msg.nc = call i64 @iteratorNotCallableMessage(i64 %return.method)
  %not.callable.error = call { i64, i1 } @iteratorTypeError(i64 %msg.nc)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %not.callable.error
result.not.object:
  %msg.rno = call i64 @iteratorResultNotObjectMessage(i64 %call.payload)
  %result.not.object.error = call { i64, i1 } @iteratorTypeError(i64 %msg.rno)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %result.not.object.error
}
`);
    }
    if (runtime.used.has("mapFromIterable")) {
      definitions.push(`define { i64, i1 } @mapFromIterable(i64 %iterable, i64 %not.iterable.message) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %iterable)
  call void @gcRootPush(i64 %not.iterable.message)
  %iter.call = call { i64, i1 } @getIteratorValue(i64 %iterable, i64 %not.iterable.message)
  %iter = extractvalue { i64, i1 } %iter.call, 0
  %iter.exc = extractvalue { i64, i1 } %iter.call, 1
  call void @gcRootPush(i64 %iter)
  br i1 %iter.exc, label %fail, label %create
create:
  %collection = call ptr @collectionNew()
  %collection.root = call i64 @valueBoxObject(ptr %collection)
  call void @gcRootPush(i64 %collection.root)
  %loop.frame = call i64 @gcRootSave()
  br label %loop
loop:
  call void @gcRootRestore(i64 %loop.frame)
  call void @gcSafepoint()
  %next.call = call { i64, i1 } @callIteratorNext(i64 %iter)
  %next = extractvalue { i64, i1 } %next.call, 0
  %next.exc = extractvalue { i64, i1 } %next.call, 1
  call void @gcRootPush(i64 %next)
  br i1 %next.exc, label %fail.next, label %check.done
check.done:
  %done.value = call i64 @valueObjectGet(i64 %next, i64 4, ptr @.iter.key.done)
  %is.done = call i1 @valueTruthy(i64 %done.value)
  br i1 %is.done, label %success, label %read.value
read.value:
  %entry.value = call i64 @valueObjectGet(i64 %next, i64 5, ptr @.iter.key.value)
  call void @gcRootPush(i64 %entry.value)
  %entry.is.object = call i1 @valueIsObject(i64 %entry.value)
  %entry.is.array = call i1 @valueIsArray(i64 %entry.value)
  %entry.ok = or i1 %entry.is.object, %entry.is.array
  br i1 %entry.ok, label %read.entry, label %bad.entry
read.entry:
  br i1 %entry.is.array, label %entry.array, label %entry.object
entry.array:
  %key.a = call i64 @valueArrayGet(i64 %entry.value, i64 0, i64 1, ptr @.iter.key.0)
  %val.a = call i64 @valueArrayGet(i64 %entry.value, i64 1, i64 1, ptr @.iter.key.1)
  call void @gcRootPush(i64 %key.a)
  call void @gcRootPush(i64 %val.a)
  call void @collectionSet(ptr %collection, i64 %key.a, i64 %val.a)
  br label %loop
entry.object:
  %key.o = call i64 @valueObjectGet(i64 %entry.value, i64 1, ptr @.iter.key.0)
  %val.o = call i64 @valueObjectGet(i64 %entry.value, i64 1, ptr @.iter.key.1)
  call void @gcRootPush(i64 %key.o)
  call void @gcRootPush(i64 %val.o)
  call void @collectionSet(ptr %collection, i64 %key.o, i64 %val.o)
  br label %loop
bad.entry:
  %entry.msg = call i64 @iteratorEntryNotObjectMessage(i64 %entry.value)
  %entry.err = call { i64, i1 } @iteratorTypeError(i64 %entry.msg)
  %entry.err.value = extractvalue { i64, i1 } %entry.err, 0
  br label %fail.payload
success:
  %collection.bits = ptrtoint ptr %collection to i64
  %ok.0 = insertvalue { i64, i1 } undef, i64 %collection.bits, 0
  %ok.1 = insertvalue { i64, i1 } %ok.0, i1 false, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %ok.1
fail:
  br label %fail.payload
fail.next:
  br label %fail.payload
fail.payload:
  %err = phi i64 [ %iter, %fail ], [ %next, %fail.next ], [ %entry.err.value, %bad.entry ]
  %fail.0 = insertvalue { i64, i1 } undef, i64 %err, 0
  %fail.1 = insertvalue { i64, i1 } %fail.0, i1 true, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %fail.1
}
`);
    }
    if (runtime.used.has("setFromIterable")) {
      definitions.push(`define { i64, i1 } @setFromIterable(i64 %iterable, i64 %not.iterable.message) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %iterable)
  call void @gcRootPush(i64 %not.iterable.message)
  %iter.call = call { i64, i1 } @getIteratorValue(i64 %iterable, i64 %not.iterable.message)
  %iter = extractvalue { i64, i1 } %iter.call, 0
  %iter.exc = extractvalue { i64, i1 } %iter.call, 1
  call void @gcRootPush(i64 %iter)
  br i1 %iter.exc, label %fail, label %create
create:
  %collection = call ptr @collectionNew()
  %collection.root = call i64 @valueBoxObject(ptr %collection)
  call void @gcRootPush(i64 %collection.root)
  %loop.frame = call i64 @gcRootSave()
  br label %loop
loop:
  call void @gcRootRestore(i64 %loop.frame)
  call void @gcSafepoint()
  %next.call = call { i64, i1 } @callIteratorNext(i64 %iter)
  %next = extractvalue { i64, i1 } %next.call, 0
  %next.exc = extractvalue { i64, i1 } %next.call, 1
  call void @gcRootPush(i64 %next)
  br i1 %next.exc, label %fail.next, label %check.done
check.done:
  %done.value = call i64 @valueObjectGet(i64 %next, i64 4, ptr @.iter.key.done)
  %is.done = call i1 @valueTruthy(i64 %done.value)
  br i1 %is.done, label %success, label %read.value
read.value:
  %item = call i64 @valueObjectGet(i64 %next, i64 5, ptr @.iter.key.value)
  call void @gcRootPush(i64 %item)
  call void @collectionSet(ptr %collection, i64 %item, i64 ${legacyJsValue.immediate("true")})
  br label %loop
success:
  %collection.bits = ptrtoint ptr %collection to i64
  %ok.0 = insertvalue { i64, i1 } undef, i64 %collection.bits, 0
  %ok.1 = insertvalue { i64, i1 } %ok.0, i1 false, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %ok.1
fail:
  br label %fail.payload
fail.next:
  br label %fail.payload
fail.payload:
  %err = phi i64 [ %iter, %fail ], [ %next, %fail.next ]
  %fail.0 = insertvalue { i64, i1 } undef, i64 %err, 0
  %fail.1 = insertvalue { i64, i1 } %fail.0, i1 true, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %fail.1
}
`);
    }
    if (runtime.used.has("arrayFromValue")) {
      definitions.push(`define { i64, i1 } @arrayFromValue(i64 %source, i64 %mapper, i64 %this.arg) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %source)
  call void @gcRootPush(i64 %mapper)
  call void @gcRootPush(i64 %this.arg)
  %is.undefined = icmp eq i64 %source, ${legacyJsValue.immediate("undefined")}
  %is.null = icmp eq i64 %source, ${legacyJsValue.immediate("null")}
  br i1 %is.undefined, label %undefined.source, label %check.null
check.null:
  br i1 %is.null, label %null.source, label %check.mapper
undefined.source:
  %undefined.msg = call i64 @valueBoxString(ptr @.iter.msg.from.undefined, i64 72)
  %undefined.err = call { i64, i1 } @iteratorTypeError(i64 %undefined.msg)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %undefined.err
null.source:
  %null.msg = call i64 @valueBoxString(ptr @.iter.msg.from.null, i64 74)
  %null.err = call { i64, i1 } @iteratorTypeError(i64 %null.msg)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %null.err
check.mapper:
  %mapper.missing = icmp eq i64 %mapper, ${legacyJsValue.immediate("undefined")}
  br i1 %mapper.missing, label %lookup.method, label %validate.mapper
validate.mapper:
  %mapper.is.fn = call i1 @valueIsFunction(i64 %mapper)
  br i1 %mapper.is.fn, label %lookup.method, label %mapper.not.fn
mapper.not.fn:
  %mapper.msg = call i64 @iteratorNotCallableMessage(i64 %mapper)
  %mapper.err = call { i64, i1 } @iteratorTypeError(i64 %mapper.msg)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %mapper.err
lookup.method:
  %method = call i64 @valuePropertyGet(i64 %source, i64 ${iteratorKeyLen}, ptr @.symbol.iterator.key)
  call void @gcRootPush(i64 %method)
  %is.undefined.method = icmp eq i64 %method, ${legacyJsValue.immediate("undefined")}
  %is.null.method = icmp eq i64 %method, ${legacyJsValue.immediate("null")}
  %method.missing = or i1 %is.undefined.method, %is.null.method
  br i1 %method.missing, label %array.like, label %check.method
check.method:
  %is.fn = call i1 @valueIsFunction(i64 %method)
  br i1 %is.fn, label %call.method, label %method.not.fn
method.not.fn:
  %msg.nn = call i64 @iteratorNotCallableMessage(i64 %method)
  %method.err = call { i64, i1 } @iteratorTypeError(i64 %msg.nn)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %method.err
call.method:
  %argv = alloca i64, i64 0
  %call = call { i64, i1 } @jsCall(i64 %method, i64 0, ptr %argv, i64 %source)
  %iter = extractvalue { i64, i1 } %call, 0
  %call.exc = extractvalue { i64, i1 } %call, 1
  call void @gcRootPush(i64 %iter)
  br i1 %call.exc, label %fail, label %check.iter
check.iter:
  %iter.is.object = call i1 @valueIsObject(i64 %iter)
  br i1 %iter.is.object, label %create.array, label %iter.not.object
iter.not.object:
  %msg.ino = call i64 @valueBoxString(ptr @.iter.msg.iter.not.object, i64 53)
  %iter.err = call { i64, i1 } @iteratorTypeError(i64 %msg.ino)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %iter.err
create.array:
  %out = call ptr @arrayNew(i64 0)
  %out.root = call i64 @valueBoxArray(ptr %out)
  call void @gcRootPush(i64 %out.root)
  %index.addr = alloca i64
  store i64 0, ptr %index.addr
  %loop.frame = call i64 @gcRootSave()
  br label %loop
loop:
  call void @gcRootRestore(i64 %loop.frame)
  call void @gcSafepoint()
  %next.call = call { i64, i1 } @callIteratorNext(i64 %iter)
  %next = extractvalue { i64, i1 } %next.call, 0
  %next.exc = extractvalue { i64, i1 } %next.call, 1
  call void @gcRootPush(i64 %next)
  br i1 %next.exc, label %fail.next, label %check.done
check.done:
  %done.value = call i64 @valueObjectGet(i64 %next, i64 4, ptr @.iter.key.done)
  %is.done = call i1 @valueTruthy(i64 %done.value)
  br i1 %is.done, label %success, label %read.item
read.item:
  %item = call i64 @valueObjectGet(i64 %next, i64 5, ptr @.iter.key.value)
  call void @gcRootPush(i64 %item)
  %index = load i64, ptr %index.addr
  br i1 %mapper.missing, label %push.item, label %map.item
map.item:
  %index.number = uitofp i64 %index to double
  %index.value = call i64 @valueBoxNumber(double %index.number)
  %map.argv = alloca i64, i64 2
  %map.arg0 = getelementptr i64, ptr %map.argv, i64 0
  store i64 %item, ptr %map.arg0
  %map.arg1 = getelementptr i64, ptr %map.argv, i64 1
  store i64 %index.value, ptr %map.arg1
  %map.call = call { i64, i1 } @jsCall(i64 %mapper, i64 2, ptr %map.argv, i64 %this.arg)
  %mapped = extractvalue { i64, i1 } %map.call, 0
  %map.exc = extractvalue { i64, i1 } %map.call, 1
  call void @gcRootPush(i64 %mapped)
  br i1 %map.exc, label %fail.map, label %push.mapped
push.item:
  br label %push.value
push.mapped:
  br label %push.value
push.value:
  %pushed = phi i64 [ %item, %push.item ], [ %mapped, %push.mapped ]
  call i64 @arrayPush(ptr %out, i64 %pushed)
  %index.next = add i64 %index, 1
  store i64 %index.next, ptr %index.addr
  br label %loop
success:
  %boxed = call i64 @valueBoxArray(ptr %out)
  %ok.0 = insertvalue { i64, i1 } undef, i64 %boxed, 0
  %ok.1 = insertvalue { i64, i1 } %ok.0, i1 false, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %ok.1
array.like:
  %is.array = call i1 @valueIsArray(i64 %source)
  br i1 %is.array, label %from.array, label %from.object
from.array:
  %array.ptr = call ptr @valueArrayPtr(i64 %source)
  %copied.array = call ptr @arrayFromArray(ptr %array.ptr)
  br label %array.like.ready
from.object:
  %is.object = call i1 @valueIsObject(i64 %source)
  br i1 %is.object, label %from.object.body, label %from.empty
from.object.body:
  %object.ptr = call ptr @valueObjectPtr(i64 %source)
  %copied.object = call ptr @arrayFromObject(ptr %object.ptr)
  br label %array.like.ready
from.empty:
  %empty = call ptr @arrayNew(i64 0)
  br label %array.like.ready
array.like.ready:
  %array.like.out = phi ptr [ %copied.array, %from.array ], [ %copied.object, %from.object.body ], [ %empty, %from.empty ]
  %array.like.root = call i64 @valueBoxArray(ptr %array.like.out)
  call void @gcRootPush(i64 %array.like.root)
  br i1 %mapper.missing, label %array.like.success, label %array.like.map.init
array.like.map.init:
  %array.like.length = call i64 @arrayLength(ptr %array.like.out)
  %array.like.index.addr = alloca i64
  store i64 0, ptr %array.like.index.addr
  %array.like.loop.frame = call i64 @gcRootSave()
  br label %array.like.map.cond
array.like.map.cond:
  %array.like.index = load i64, ptr %array.like.index.addr
  %array.like.done = icmp uge i64 %array.like.index, %array.like.length
  br i1 %array.like.done, label %array.like.success, label %array.like.map.body
array.like.map.body:
  call void @gcRootRestore(i64 %array.like.loop.frame)
  %array.like.item = call i64 @arrayGet(ptr %array.like.out, i64 %array.like.index)
  %array.like.index.number = uitofp i64 %array.like.index to double
  %array.like.index.value = call i64 @valueBoxNumber(double %array.like.index.number)
  %array.like.argv = alloca i64, i64 2
  %array.like.arg0 = getelementptr i64, ptr %array.like.argv, i64 0
  store i64 %array.like.item, ptr %array.like.arg0
  %array.like.arg1 = getelementptr i64, ptr %array.like.argv, i64 1
  store i64 %array.like.index.value, ptr %array.like.arg1
  %array.like.call = call { i64, i1 } @jsCall(i64 %mapper, i64 2, ptr %array.like.argv, i64 %this.arg)
  %array.like.mapped = extractvalue { i64, i1 } %array.like.call, 0
  %array.like.exc = extractvalue { i64, i1 } %array.like.call, 1
  br i1 %array.like.exc, label %fail.array.like.map, label %array.like.store
array.like.store:
  call void @arraySet(ptr %array.like.out, i64 %array.like.index, i64 %array.like.mapped)
  %array.like.next = add i64 %array.like.index, 1
  store i64 %array.like.next, ptr %array.like.index.addr
  br label %array.like.map.cond
array.like.success:
  %array.like.boxed = call i64 @valueBoxArray(ptr %array.like.out)
  %array.like.ok.0 = insertvalue { i64, i1 } undef, i64 %array.like.boxed, 0
  %array.like.ok.1 = insertvalue { i64, i1 } %array.like.ok.0, i1 false, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %array.like.ok.1
fail:
  br label %fail.payload
fail.next:
  br label %fail.payload
fail.map:
  br label %fail.payload
fail.array.like.map:
  br label %fail.payload
fail.payload:
  %failure = phi i64 [ %iter, %fail ], [ %next, %fail.next ], [ %mapped, %fail.map ], [ %array.like.mapped, %fail.array.like.map ]
  %fail.0 = insertvalue { i64, i1 } undef, i64 %failure, 0
  %fail.1 = insertvalue { i64, i1 } %fail.0, i1 true, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %fail.1
}
`);
    }
  }
  if (runtime.used.has("valueObjectGet")) {
    definitions.push(`define i64 @valueObjectGet(i64 %value, i64 %key.len, ptr %key.ptr) {
entry:
  %is.function = call i1 @valueIsFunction(i64 %value)
  br i1 %is.function, label %function, label %object
function:
  %function.result = call i64 @functionObjectGet(i64 %value, i64 %key.len, ptr %key.ptr)
  ret i64 %function.result
object:
  %object.ptr = call ptr @valueObjectPtr(i64 %value)
  %result = call i64 @objectGet(ptr %object.ptr, i64 %key.len, ptr %key.ptr)
  ret i64 %result
}
`);
  }
  if (runtime.used.has("valueArrayGet")) {
    definitions.push(`define i64 @valueArrayGet(i64 %value, i64 %index, i64 %key.len, ptr %key.ptr) {
entry:
  %array = call ptr @valueArrayPtr(i64 %value)
  %result = call i64 @arrayGetWithKey(ptr %array, i64 %index, i64 %key.len, ptr %key.ptr)
  ret i64 %result
}
`);
  }
  if (runtime.used.has("valueArrayLength")) {
    definitions.push(`define i64 @valueArrayLength(i64 %value) {
entry:
  %array = call ptr @valueArrayPtr(i64 %value)
  %length = call i64 @arrayLength(ptr %array)
  ret i64 %length
}
`);
  }
  if (runtime.used.has("valueObjectSet")) {
    definitions.push(`define void @valueObjectSet(i64 %value, i64 %key.len, ptr %key.ptr, i64 %stored) {
entry:
  %object = call ptr @valueObjectPtr(i64 %value)
  call void @objectSet(ptr %object, i64 %key.len, ptr %key.ptr, i64 %stored)
  ret void
}
`);
  }
  if (runtime.used.has("valueArraySet")) {
    definitions.push(`define void @valueArraySet(i64 %value, i64 %index, i64 %stored) {
entry:
  %array = call ptr @valueArrayPtr(i64 %value)
  call void @arraySet(ptr %array, i64 %index, i64 %stored)
  ret void
}
`);
  }
  if (runtime.used.has("valueArraySetLength")) {
    definitions.push(`define void @valueArraySetLength(i64 %value, i64 %length) {
entry:
  %array = call ptr @valueArrayPtr(i64 %value)
  call void @arraySetLength(ptr %array, i64 %length)
  ret void
}
`);
  }
  if (runtime.used.has("valueObjectDelete")) {
    definitions.push(`define void @valueObjectDelete(i64 %value, i64 %key.len, ptr %key.ptr) {
entry:
  %object = call ptr @valueObjectPtr(i64 %value)
  call void @objectDelete(ptr %object, i64 %key.len, ptr %key.ptr)
  ret void
}
`);
  }
  if (runtime.used.has("valueArrayDelete")) {
    definitions.push(`define void @valueArrayDelete(i64 %value, i64 %index) {
entry:
  %array = call ptr @valueArrayPtr(i64 %value)
  call void @arrayDelete(ptr %array, i64 %index)
  ret void
}
`);
  }
  if (runtime.used.has("valueObjectHasOwn")) {
    definitions.push(`define i1 @valueObjectHasOwn(i64 %value, i64 %key.len, ptr %key.ptr) {
entry:
  %tag = and i64 %value, ${legacyJsValue.tagMask()}
  %is.object = icmp eq i64 %tag, ${legacyJsValue.referenceTag("object")}
  br i1 %is.object, label %object, label %check.array
object:
  %object.ptr = call ptr @valueObjectPtr(i64 %value)
  %object.has = call i1 @objectHasOwn(ptr %object.ptr, i64 %key.len, ptr %key.ptr)
  ret i1 %object.has
check.array:
  %is.array = icmp eq i64 %tag, ${legacyJsValue.referenceTag("array")}
  br i1 %is.array, label %array, label %missing
array:
  %array.ptr = call ptr @valueArrayPtr(i64 %value)
  %empty.key = icmp eq i64 %key.len, 0
  br i1 %empty.key, label %missing, label %array.leading.zero
array.leading.zero:
  %first.byte = load i8, ptr %key.ptr
  %first.zero = icmp eq i8 %first.byte, 48
  %multi.char = icmp ugt i64 %key.len, 1
  %leading.zero = and i1 %first.zero, %multi.char
  br i1 %leading.zero, label %missing, label %array.parse
array.parse:
  br label %array.parse.loop
array.parse.loop:
  %parse.i = phi i64 [ 0, %array.parse ], [ %parse.next, %array.parse.advance ]
  %index = phi i64 [ 0, %array.parse ], [ %next.index, %array.parse.advance ]
  %parse.done = icmp eq i64 %parse.i, %key.len
  br i1 %parse.done, label %array.has.index, label %array.parse.digit
array.parse.digit:
  %char.ptr = getelementptr i8, ptr %key.ptr, i64 %parse.i
  %char = load i8, ptr %char.ptr
  %above.lower = icmp uge i8 %char, 48
  %below.upper = icmp ule i8 %char, 57
  %is.digit = and i1 %above.lower, %below.upper
  br i1 %is.digit, label %array.parse.advance, label %missing
array.parse.advance:
  %digit.i8 = sub i8 %char, 48
  %digit = zext i8 %digit.i8 to i64
  %shifted.index = mul i64 %index, 10
  %next.index = add i64 %shifted.index, %digit
  %parse.next = add i64 %parse.i, 1
  br label %array.parse.loop
array.has.index:
  %array.has = call i1 @arrayHasOwnIndex(ptr %array.ptr, i64 %index)
  ret i1 %array.has
missing:
  ret i1 false
}
`);
  }
  if (runtime.used.has("valueObjectKeys")) {
    definitions.push(`define ptr @valueObjectKeys(i64 %value) {
entry:
  %tag = and i64 %value, ${legacyJsValue.tagMask()}
  %is.object = icmp eq i64 %tag, ${legacyJsValue.referenceTag("object")}
  br i1 %is.object, label %object, label %check.array
object:
  %object.ptr = call ptr @valueObjectPtr(i64 %value)
  %object.keys = call ptr @objectKeys(ptr %object.ptr)
  ret ptr %object.keys
check.array:
  %is.array = icmp eq i64 %tag, ${legacyJsValue.referenceTag("array")}
  br i1 %is.array, label %array, label %primitive
array:
  %array.ptr = call ptr @valueArrayPtr(i64 %value)
  %array.keys = call ptr @arrayKeys(ptr %array.ptr)
  ret ptr %array.keys
primitive:
  %empty = call ptr @arrayNew(i64 0)
  ret ptr %empty
}
`);
  }
  if (runtime.used.has("valueObjectValues")) {
    definitions.push(`define ptr @valueObjectValues(i64 %value) {
entry:
  %tag = and i64 %value, ${legacyJsValue.tagMask()}
  %is.object = icmp eq i64 %tag, ${legacyJsValue.referenceTag("object")}
  br i1 %is.object, label %object, label %check.array
object:
  %object.ptr = call ptr @valueObjectPtr(i64 %value)
  %object.values = call ptr @objectValues(ptr %object.ptr)
  ret ptr %object.values
check.array:
  %is.array = icmp eq i64 %tag, ${legacyJsValue.referenceTag("array")}
  br i1 %is.array, label %array, label %primitive
array:
  %array.ptr = call ptr @valueArrayPtr(i64 %value)
  %array.values = call ptr @arrayValues(ptr %array.ptr)
  ret ptr %array.values
primitive:
  %empty = call ptr @arrayNew(i64 0)
  ret ptr %empty
}
`);
  }
  if (runtime.used.has("valueObjectEntries")) {
    definitions.push(`define ptr @valueObjectEntries(i64 %value) {
entry:
  %tag = and i64 %value, ${legacyJsValue.tagMask()}
  %is.object = icmp eq i64 %tag, ${legacyJsValue.referenceTag("object")}
  br i1 %is.object, label %object, label %check.array
object:
  %object.ptr = call ptr @valueObjectPtr(i64 %value)
  %object.entries = call ptr @objectEntries(ptr %object.ptr)
  ret ptr %object.entries
check.array:
  %is.array = icmp eq i64 %tag, ${legacyJsValue.referenceTag("array")}
  br i1 %is.array, label %array, label %primitive
array:
  %array.ptr = call ptr @valueArrayPtr(i64 %value)
  %array.entries = call ptr @arrayEntries(ptr %array.ptr)
  ret ptr %array.entries
primitive:
  %empty = call ptr @arrayNew(i64 0)
  ret ptr %empty
}
`);
  }
  if (runtime.used.has("valueObjectOwnPropertyDescriptor")) {
    definitions.push(`@.value.desc.length = private unnamed_addr constant [7 x i8] c"length\\00"

define i64 @valueObjectOwnPropertyDescriptor(i64 %value, i64 %key.len, ptr %key.ptr, i64 %index, i1 %is.length) {
entry:
  %tag = and i64 %value, ${legacyJsValue.tagMask()}
  %is.object = icmp eq i64 %tag, ${legacyJsValue.referenceTag("object")}
  br i1 %is.object, label %object, label %check.array
object:
  %object.ptr = call ptr @valueObjectPtr(i64 %value)
  %object.desc = call i64 @objectOwnPropertyDescriptor(ptr %object.ptr, i64 %key.len, ptr %key.ptr)
  ret i64 %object.desc
check.array:
  %is.array = icmp eq i64 %tag, ${legacyJsValue.referenceTag("array")}
  br i1 %is.array, label %array, label %primitive
array:
  %array.ptr = call ptr @valueArrayPtr(i64 %value)
  br i1 %is.length, label %array.length, label %array.index
array.length:
  %length.desc = call i64 @arrayLengthPropertyDescriptor(ptr %array.ptr)
  ret i64 %length.desc
array.index:
  %array.desc = call i64 @arrayOwnPropertyDescriptor(ptr %array.ptr, i64 %key.len, ptr %key.ptr, i64 %index)
  ret i64 %array.desc
primitive:
  ret i64 ${legacyJsValue.immediate("undefined")}
}
`);
  }
  if (runtime.used.has("valueObjectOwnPropertyNames")) {
    definitions.push(`define ptr @valueObjectOwnPropertyNames(i64 %value) {
entry:
  %tag = and i64 %value, ${legacyJsValue.tagMask()}
  %is.object = icmp eq i64 %tag, ${legacyJsValue.referenceTag("object")}
  br i1 %is.object, label %object, label %check.array
object:
  %object.ptr = call ptr @valueObjectPtr(i64 %value)
  %object.names = call ptr @objectOwnPropertyNames(ptr %object.ptr)
  ret ptr %object.names
check.array:
  %is.array = icmp eq i64 %tag, ${legacyJsValue.referenceTag("array")}
  br i1 %is.array, label %array, label %primitive
array:
  %array.ptr = call ptr @valueArrayPtr(i64 %value)
  %array.names = call ptr @arrayOwnPropertyNames(ptr %array.ptr)
  ret ptr %array.names
primitive:
  %empty = call ptr @arrayNew(i64 0)
  ret ptr %empty
}
`);
  }
  if (runtime.used.has("valueObjectOwnPropertyDescriptors")) {
    definitions.push(`define ptr @valueObjectOwnPropertyDescriptors(i64 %value) {
entry:
  %tag = and i64 %value, ${legacyJsValue.tagMask()}
  %is.object = icmp eq i64 %tag, ${legacyJsValue.referenceTag("object")}
  br i1 %is.object, label %object, label %check.array
object:
  %object.ptr = call ptr @valueObjectPtr(i64 %value)
  %object.descriptors = call ptr @objectOwnPropertyDescriptors(ptr %object.ptr)
  ret ptr %object.descriptors
check.array:
  %is.array = icmp eq i64 %tag, ${legacyJsValue.referenceTag("array")}
  br i1 %is.array, label %array, label %empty
array:
  %array.ptr = call ptr @valueArrayPtr(i64 %value)
  %array.descriptors = call ptr @arrayOwnPropertyDescriptors(ptr %array.ptr)
  ret ptr %array.descriptors
empty:
  %empty.descriptors = call ptr @objectNew(i64 0)
  ret ptr %empty.descriptors
}
`);
  }
  if (runtime.used.has("valueTruthy")) {
    definitions.push(`define i1 @valueTruthy(i64 %value) {
entry:
  %is.undefined = icmp eq i64 %value, ${legacyJsValue.immediate("undefined")}
  br i1 %is.undefined, label %false, label %check.null
check.null:
  %is.null = icmp eq i64 %value, ${legacyJsValue.immediate("null")}
  br i1 %is.null, label %false, label %check.false
check.false:
  %is.false = icmp eq i64 %value, ${legacyJsValue.immediate("false")}
  br i1 %is.false, label %false, label %check.true
check.true:
  %is.true = icmp eq i64 %value, ${legacyJsValue.immediate("true")}
  br i1 %is.true, label %true, label %check.string
check.string:
  %tagged = and i64 %value, ${legacyJsValue.tagMask()}
  %is.string = icmp eq i64 %tagged, ${legacyJsValue.referenceTag("string")}
  br i1 %is.string, label %string, label %check.aggregate
string:
  %len = call i64 @valueStringLength(i64 %value)
  %nonempty = icmp ne i64 %len, 0
  ret i1 %nonempty
check.aggregate:
  %is.object = icmp eq i64 %tagged, ${legacyJsValue.referenceTag("object")}
  %is.array = icmp eq i64 %tagged, ${legacyJsValue.referenceTag("array")}
  %is.aggregate = or i1 %is.object, %is.array
  br i1 %is.aggregate, label %true, label %check.function
check.function:
  %is.function = icmp eq i64 %tagged, ${legacyJsValue.referenceTag("function")}
  br i1 %is.function, label %true, label %number.block
number.block:
  %number.value = call double @valueNumber(i64 %value)
  %nonzero = fcmp one double %number.value, 0.0
  ret i1 %nonzero
true:
  ret i1 true
false:
  ret i1 false
}
`);
  }
  if (runtime.used.has("valuePrint")) {
    definitions.push(`@.value.fmt.number = private unnamed_addr constant [4 x i8] c"%g\\0A\\00"
@.value.number.nan = private unnamed_addr constant [4 x i8] c"NaN\\00"
@.value.number.infinity = private unnamed_addr constant [9 x i8] c"Infinity\\00"
@.value.number.negative-infinity = private unnamed_addr constant [10 x i8] c"-Infinity\\00"
@.value.true = private unnamed_addr constant [5 x i8] c"true\\00"
@.value.false = private unnamed_addr constant [6 x i8] c"false\\00"
@.value.undefined = private unnamed_addr constant [10 x i8] c"undefined\\00"
@.value.null = private unnamed_addr constant [5 x i8] c"null\\00"
@.value.object = private unnamed_addr constant [16 x i8] c"[object Object]\\00"
@.value.array = private unnamed_addr constant [15 x i8] c"[object Array]\\00"

define void @valuePrint(i64 %value) {
entry:
  %is.undefined = icmp eq i64 %value, ${legacyJsValue.immediate("undefined")}
  br i1 %is.undefined, label %print.undefined, label %check.false
check.false:
  %is.false = icmp eq i64 %value, ${legacyJsValue.immediate("false")}
  br i1 %is.false, label %print.false, label %check.true
check.true:
  %is.true = icmp eq i64 %value, ${legacyJsValue.immediate("true")}
  br i1 %is.true, label %print.true, label %check.null
check.null:
  %is.null = icmp eq i64 %value, ${legacyJsValue.immediate("null")}
  br i1 %is.null, label %print.null, label %check.object
check.object:
  %tagged.object = and i64 %value, ${legacyJsValue.tagMask()}
  %is.object = icmp eq i64 %tagged.object, ${legacyJsValue.referenceTag("object")}
  br i1 %is.object, label %check.error, label %check.array
check.error:
  %object.ptr = call ptr @valueObjectPtr(i64 %value)
  %object.class.slot = getelementptr i8, ptr %object.ptr, i64 48
  %object.class = load i64, ptr %object.class.slot
  %is.error = icmp ne i64 %object.class, 0
  br i1 %is.error, label %print.error, label %print.object
check.array:
  %tagged.array = and i64 %value, ${legacyJsValue.tagMask()}
  %is.array = icmp eq i64 %tagged.array, ${legacyJsValue.referenceTag("array")}
  br i1 %is.array, label %print.array, label %check.string
check.string:
  %tagged = and i64 %value, ${legacyJsValue.tagMask()}
  %is.string = icmp eq i64 %tagged, ${legacyJsValue.referenceTag("string")}
  br i1 %is.string, label %print.string, label %print.number
print.undefined:
  call i32 @puts(ptr @.value.undefined)
  ret void
print.false:
  call i32 @puts(ptr @.value.false)
  ret void
print.true:
  call i32 @puts(ptr @.value.true)
  ret void
print.null:
  call i32 @puts(ptr @.value.null)
  ret void
print.object:
  call i32 @puts(ptr @.value.object)
  ret void
print.error:
  %error.string = call { ptr, i64 } @errorToString(ptr %object.ptr)
  %error.ptr = extractvalue { ptr, i64 } %error.string, 0
  call i32 @puts(ptr %error.ptr)
  ret void
print.array:
  call i32 @puts(ptr @.value.array)
  ret void
print.string:
  %ptr = call ptr @valueStringPtr(i64 %value)
  call i32 @puts(ptr %ptr)
  ret void
print.number:
  %number = call double @valueNumber(i64 %value)
  %number.is.nan = fcmp uno double %number, %number
  br i1 %number.is.nan, label %print.number.nan, label %check.number.infinity
check.number.infinity:
  %number.absolute-bits = and i64 %value, 9223372036854775807
  %number.is.infinity = icmp eq i64 %number.absolute-bits, 9218868437227405312
  br i1 %number.is.infinity, label %print.number.infinity, label %print.number.finite
print.number.nan:
  call i32 @puts(ptr @.value.number.nan)
  ret void
print.number.infinity:
  %number.is.negative = icmp slt i64 %value, 0
  br i1 %number.is.negative, label %print.number.negative-infinity, label %print.number.positive-infinity
print.number.negative-infinity:
  call i32 @puts(ptr @.value.number.negative-infinity)
  ret void
print.number.positive-infinity:
  call i32 @puts(ptr @.value.number.infinity)
  ret void
print.number.finite:
  call i32 (ptr, ...) @printf(ptr @.value.fmt.number, double %number)
  ret void
}
`);
  }
  if (runtime.used.has("valueToString")) {
    definitions.push(`@.tostring.fmt.number = private unnamed_addr constant [3 x i8] c"%g\\00"
@.tostring.true = private unnamed_addr constant [5 x i8] c"true\\00"
@.tostring.false = private unnamed_addr constant [6 x i8] c"false\\00"
@.tostring.undefined = private unnamed_addr constant [10 x i8] c"undefined\\00"
@.tostring.null = private unnamed_addr constant [5 x i8] c"null\\00"
@.tostring.object = private unnamed_addr constant [16 x i8] c"[object Object]\\00"
@.tostring.array = private unnamed_addr constant [15 x i8] c"[object Array]\\00"
@.tostring.comma = private unnamed_addr constant [2 x i8] c",\\00"

define { ptr, i64 } @valueToString(i64 %value) {
entry:
  %is.undefined = icmp eq i64 %value, ${legacyJsValue.immediate("undefined")}
  br i1 %is.undefined, label %undefined, label %check.false
check.false:
  %is.false = icmp eq i64 %value, ${legacyJsValue.immediate("false")}
  br i1 %is.false, label %false, label %check.true
check.true:
  %is.true = icmp eq i64 %value, ${legacyJsValue.immediate("true")}
  br i1 %is.true, label %true, label %check.null
check.null:
  %is.null = icmp eq i64 %value, ${legacyJsValue.immediate("null")}
  br i1 %is.null, label %null, label %check.object
check.object:
  %tagged.object = and i64 %value, ${legacyJsValue.tagMask()}
  %is.object = icmp eq i64 %tagged.object, ${legacyJsValue.referenceTag("object")}
  br i1 %is.object, label %object, label %check.array
check.array:
  %tagged.array = and i64 %value, ${legacyJsValue.tagMask()}
  %is.array = icmp eq i64 %tagged.array, ${legacyJsValue.referenceTag("array")}
  br i1 %is.array, label %array, label %check.string
check.string:
  %tagged.string = and i64 %value, ${legacyJsValue.tagMask()}
  %is.string = icmp eq i64 %tagged.string, ${legacyJsValue.referenceTag("string")}
  br i1 %is.string, label %string, label %number
undefined:
  %undefined.0 = insertvalue { ptr, i64 } undef, ptr @.tostring.undefined, 0
  %undefined.1 = insertvalue { ptr, i64 } %undefined.0, i64 9, 1
  ret { ptr, i64 } %undefined.1
false:
  %false.0 = insertvalue { ptr, i64 } undef, ptr @.tostring.false, 0
  %false.1 = insertvalue { ptr, i64 } %false.0, i64 5, 1
  ret { ptr, i64 } %false.1
true:
  %true.0 = insertvalue { ptr, i64 } undef, ptr @.tostring.true, 0
  %true.1 = insertvalue { ptr, i64 } %true.0, i64 4, 1
  ret { ptr, i64 } %true.1
null:
  %null.0 = insertvalue { ptr, i64 } undef, ptr @.tostring.null, 0
  %null.1 = insertvalue { ptr, i64 } %null.0, i64 4, 1
  ret { ptr, i64 } %null.1
object:
  %object.0 = insertvalue { ptr, i64 } undef, ptr @.tostring.object, 0
  %object.1 = insertvalue { ptr, i64 } %object.0, i64 15, 1
  ret { ptr, i64 } %object.1
array:
  %array.ptr = call ptr @valueArrayPtr(i64 %value)
  %joined = call ptr @arrayJoin(ptr %array.ptr, i64 1, ptr @.tostring.comma)
  br label %array.len.scan
array.len.scan:
  %array.len = phi i64 [ 0, %array ], [ %array.len.next, %array.len.more ]
  %array.char = getelementptr i8, ptr %joined, i64 %array.len
  %array.byte = load i8, ptr %array.char
  %array.done = icmp eq i8 %array.byte, 0
  br i1 %array.done, label %array.ret, label %array.len.more
array.len.more:
  %array.len.next = add i64 %array.len, 1
  br label %array.len.scan
array.ret:
  %array.0 = insertvalue { ptr, i64 } undef, ptr %joined, 0
  %array.1 = insertvalue { ptr, i64 } %array.0, i64 %array.len, 1
  ret { ptr, i64 } %array.1
string:
  %string.ptr = call ptr @valueStringPtr(i64 %value)
  %string.len = call i64 @valueStringLength(i64 %value)
  %string.0 = insertvalue { ptr, i64 } undef, ptr %string.ptr, 0
  %string.1 = insertvalue { ptr, i64 } %string.0, i64 %string.len, 1
  ret { ptr, i64 } %string.1
number:
  %number.ptr = call ptr @malloc(i64 32)
  %number.value = call double @valueNumber(i64 %value)
  %written = call i32 (ptr, ptr, ...) @sprintf(ptr %number.ptr, ptr @.tostring.fmt.number, double %number.value)
  %number.len = sext i32 %written to i64
  %number.0 = insertvalue { ptr, i64 } undef, ptr %number.ptr, 0
  %number.1 = insertvalue { ptr, i64 } %number.0, i64 %number.len, 1
  ret { ptr, i64 } %number.1
}
`);
  }
  if (runtime.used.has("arrayNew")) {
    definitions.push(`define ptr @arrayNew(i64 %length) {
entry:
  %empty = icmp eq i64 %length, 0
  br i1 %empty, label %capacity.empty, label %capacity.initial
capacity.empty:
  br label %alloc
capacity.initial:
  br label %alloc
alloc:
  %capacity = phi i64 [ 1, %capacity.empty ], [ %length, %capacity.initial ]
  %cell = call ptr @gcAlloc(i64 3, i64 48)
  %array = getelementptr i8, ptr %cell, i64 8
  %properties = call ptr @objectNew(i64 0)
  %payload.bytes = mul i64 %capacity, 8
  %elements = call ptr @malloc(i64 %payload.bytes)
  store i64 %length, ptr %array
  %capacity.slot = getelementptr i8, ptr %array, i64 8
  store i64 %capacity, ptr %capacity.slot
  %elements.slot = getelementptr i8, ptr %array, i64 16
  store ptr %elements, ptr %elements.slot
  %prototype.slot = getelementptr i8, ptr %array, i64 24
  store ptr null, ptr %prototype.slot
  %properties.slot = getelementptr i8, ptr %array, i64 32
  store ptr %properties, ptr %properties.slot
  br label %fill.cond
fill.cond:
  %i = phi i64 [ 0, %alloc ], [ %next, %fill.body ]
  %done = icmp eq i64 %i, %capacity
  br i1 %done, label %exit, label %fill.body
fill.body:
  %slot.bytes = mul i64 %i, 8
  %slot = getelementptr i8, ptr %elements, i64 %slot.bytes
  store i64 ${legacyJsValue.arrayHole()}, ptr %slot
  %next = add i64 %i, 1
  br label %fill.cond
exit:
  ret ptr %array
}
`);
  }
  if (runtime.used.has("arrayLength")) {
    definitions.push(`define i64 @arrayLength(ptr %array) {
entry:
  %length = load i64, ptr %array
  ret i64 %length
}
`);
  }
  if (runtime.used.has("arrayGet")) {
    definitions.push(`define i64 @arrayGet(ptr %array, i64 %index) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  %in.bounds = icmp ult i64 %index, %length
  br i1 %in.bounds, label %load, label %missing
load:
  %elements.slot = getelementptr i8, ptr %array, i64 16
  %elements = load ptr, ptr %elements.slot
  %slot.bytes = mul i64 %index, 8
  %slot = getelementptr i8, ptr %elements, i64 %slot.bytes
  %value = load i64, ptr %slot
  %is.hole = icmp eq i64 %value, ${legacyJsValue.arrayHole()}
  br i1 %is.hole, label %missing, label %found
found:
  ret i64 %value
missing:
  ret i64 ${legacyJsValue.immediate("undefined")}
}
`);
  }
  if (runtime.used.has("arrayGetWithKey")) {
    definitions.push(`define i64 @arrayGetWithKey(ptr %array, i64 %index, i64 %key.len, ptr %key.ptr) {
entry:
  %has.own = call i1 @arrayHasOwnIndex(ptr %array, i64 %index)
  br i1 %has.own, label %own, label %check.prototype
own:
  %elements.slot = getelementptr i8, ptr %array, i64 16
  %elements = load ptr, ptr %elements.slot
  %slot.bytes = mul i64 %index, 8
  %slot = getelementptr i8, ptr %elements, i64 %slot.bytes
  %value = load i64, ptr %slot
  ret i64 %value
check.prototype:
  %properties.slot = getelementptr i8, ptr %array, i64 32
  %properties = load ptr, ptr %properties.slot
  %named = call i64 @objectGet(ptr %properties, i64 %key.len, ptr %key.ptr)
  %has.named = icmp ne i64 %named, ${legacyJsValue.immediate("undefined")}
  br i1 %has.named, label %array.named, label %prototype.check
array.named:
  ret i64 %named
prototype.check:
  %prototype.slot = getelementptr i8, ptr %array, i64 24
  %prototype = load ptr, ptr %prototype.slot
  %has.prototype = icmp ne ptr %prototype, null
  br i1 %has.prototype, label %prototype.lookup, label %missing
prototype.lookup:
  %prototype.value = call i64 @objectGet(ptr %prototype, i64 %key.len, ptr %key.ptr)
  ret i64 %prototype.value
missing:
  ret i64 ${legacyJsValue.immediate("undefined")}
}
`);
  }
  if (runtime.used.has("arraySetNamed")) {
    definitions.push(`define void @arraySetNamed(ptr %array, i64 %key.len, ptr %key.ptr, i64 %value) {
entry:
  %properties.slot = getelementptr i8, ptr %array, i64 32
  %properties = load ptr, ptr %properties.slot
  call void @objectSet(ptr %properties, i64 %key.len, ptr %key.ptr, i64 %value)
  ret void
}
`);
  }
  if (runtime.used.has("arrayDeleteNamed")) {
    definitions.push(`define void @arrayDeleteNamed(ptr %array, i64 %key.len, ptr %key.ptr) {
entry:
  %properties.slot = getelementptr i8, ptr %array, i64 32
  %properties = load ptr, ptr %properties.slot
  call void @objectDelete(ptr %properties, i64 %key.len, ptr %key.ptr)
  ret void
}
`);
  }
  if (runtime.used.has("arrayHasOwnIndex")) {
    definitions.push(`define i1 @arrayHasOwnIndex(ptr %array, i64 %index) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  %in.bounds = icmp ult i64 %index, %length
  br i1 %in.bounds, label %load, label %missing
load:
  %elements.slot = getelementptr i8, ptr %array, i64 16
  %elements = load ptr, ptr %elements.slot
  %slot.bytes = mul i64 %index, 8
  %slot = getelementptr i8, ptr %elements, i64 %slot.bytes
  %value = load i64, ptr %slot
  %is.hole = icmp eq i64 %value, ${legacyJsValue.arrayHole()}
  br i1 %is.hole, label %missing, label %found
found:
  ret i1 true
missing:
  ret i1 false
}
`);
  }
  if (runtime.used.has("arraySet")) {
    definitions.push(`define void @arraySet(ptr %array, i64 %index, i64 %value) {
entry:
  %length = load i64, ptr %array
  %capacity.slot = getelementptr i8, ptr %array, i64 8
  %capacity = load i64, ptr %capacity.slot
  %elements.slot = getelementptr i8, ptr %array, i64 16
  %elements = load ptr, ptr %elements.slot
  %extends = icmp uge i64 %index, %length
  br i1 %extends, label %ensure.capacity, label %store.existing
store.existing:
  %slot.bytes = mul i64 %index, 8
  %slot = getelementptr i8, ptr %elements, i64 %slot.bytes
  store i64 %value, ptr %slot
  ret void
ensure.capacity:
  %next.length = add i64 %index, 1
  %has.capacity = icmp ult i64 %index, %capacity
  br i1 %has.capacity, label %fill.gap, label %grow
grow:
  %double.capacity = mul i64 %capacity, 2
  %needs.target.capacity = icmp ult i64 %double.capacity, %next.length
  %new.capacity = select i1 %needs.target.capacity, i64 %next.length, i64 %double.capacity
  %new.elements.bytes = mul i64 %new.capacity, 8
  %new.elements = call ptr @malloc(i64 %new.elements.bytes)
  %old.elements.bytes = mul i64 %length, 8
  call ptr @memcpy(ptr %new.elements, ptr %elements, i64 %old.elements.bytes)
  store i64 %new.capacity, ptr %capacity.slot
  store ptr %new.elements, ptr %elements.slot
  br label %fill.gap
fill.gap:
  %active.elements = phi ptr [ %elements, %ensure.capacity ], [ %new.elements, %grow ]
  br label %fill.cond
fill.cond:
  %i = phi i64 [ %length, %fill.gap ], [ %gap.next, %fill.body ]
  %gap.done = icmp eq i64 %i, %index
  br i1 %gap.done, label %store.grown, label %fill.body
fill.body:
  %gap.slot.bytes = mul i64 %i, 8
  %gap.slot = getelementptr i8, ptr %active.elements, i64 %gap.slot.bytes
  store i64 ${legacyJsValue.arrayHole()}, ptr %gap.slot
  %gap.next = add i64 %i, 1
  br label %fill.cond
store.grown:
  %grown.slot.bytes = mul i64 %index, 8
  %grown.slot = getelementptr i8, ptr %active.elements, i64 %grown.slot.bytes
  store i64 %value, ptr %grown.slot
  store i64 %next.length, ptr %array
  ret void
}
`);
  }
  if (runtime.used.has("arrayDelete")) {
    definitions.push(`define void @arrayDelete(ptr %array, i64 %index) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  %in.bounds = icmp ult i64 %index, %length
  br i1 %in.bounds, label %delete, label %exit
delete:
  %elements.slot = getelementptr i8, ptr %array, i64 16
  %elements = load ptr, ptr %elements.slot
  %slot.bytes = mul i64 %index, 8
  %slot = getelementptr i8, ptr %elements, i64 %slot.bytes
  store i64 ${legacyJsValue.arrayHole()}, ptr %slot
  ret void
exit:
  ret void
}
`);
  }
  if (runtime.used.has("arraySetLength")) {
    definitions.push(`define void @arraySetLength(ptr %array, i64 %new.length) {
entry:
  %old.length = load i64, ptr %array
  %capacity.slot = getelementptr i8, ptr %array, i64 8
  %capacity = load i64, ptr %capacity.slot
  %elements.slot = getelementptr i8, ptr %array, i64 16
  %elements = load ptr, ptr %elements.slot
  %grows = icmp ugt i64 %new.length, %old.length
  br i1 %grows, label %ensure.capacity, label %shrink.fill
ensure.capacity:
  %has.capacity = icmp ule i64 %new.length, %capacity
  br i1 %has.capacity, label %grow.fill, label %grow
grow:
  %double.capacity = mul i64 %capacity, 2
  %needs.target.capacity = icmp ult i64 %double.capacity, %new.length
  %new.capacity = select i1 %needs.target.capacity, i64 %new.length, i64 %double.capacity
  %new.elements.bytes = mul i64 %new.capacity, 8
  %new.elements = call ptr @malloc(i64 %new.elements.bytes)
  %old.elements.bytes = mul i64 %old.length, 8
  call ptr @memcpy(ptr %new.elements, ptr %elements, i64 %old.elements.bytes)
  store i64 %new.capacity, ptr %capacity.slot
  store ptr %new.elements, ptr %elements.slot
  br label %grow.fill
grow.fill:
  %grow.elements = phi ptr [ %elements, %ensure.capacity ], [ %new.elements, %grow ]
  br label %grow.fill.cond
grow.fill.cond:
  %grow.i = phi i64 [ %old.length, %grow.fill ], [ %grow.next, %grow.fill.body ]
  %grow.done = icmp eq i64 %grow.i, %new.length
  br i1 %grow.done, label %store.length, label %grow.fill.body
grow.fill.body:
  %grow.slot.bytes = mul i64 %grow.i, 8
  %grow.slot = getelementptr i8, ptr %grow.elements, i64 %grow.slot.bytes
  store i64 ${legacyJsValue.arrayHole()}, ptr %grow.slot
  %grow.next = add i64 %grow.i, 1
  br label %grow.fill.cond
shrink.fill:
  br label %shrink.fill.cond
shrink.fill.cond:
  %shrink.i = phi i64 [ %new.length, %shrink.fill ], [ %shrink.next, %shrink.fill.body ]
  %shrink.done = icmp eq i64 %shrink.i, %old.length
  br i1 %shrink.done, label %store.length, label %shrink.fill.body
shrink.fill.body:
  %shrink.slot.bytes = mul i64 %shrink.i, 8
  %shrink.slot = getelementptr i8, ptr %elements, i64 %shrink.slot.bytes
  store i64 ${legacyJsValue.arrayHole()}, ptr %shrink.slot
  %shrink.next = add i64 %shrink.i, 1
  br label %shrink.fill.cond
store.length:
  store i64 %new.length, ptr %array
  ret void
}
`);
  }
  if (runtime.used.has("indexToString")) {
    definitions.push(`define ptr @indexToString(i64 %index) {
entry:
  br label %count.loop
count.loop:
  %count.value = phi i64 [ %index, %entry ], [ %count.next.value, %count.more ]
  %digits = phi i64 [ 1, %entry ], [ %digits.next, %count.more ]
  %count.more.check = icmp uge i64 %count.value, 10
  br i1 %count.more.check, label %count.more, label %alloc
count.more:
  %count.next.value = udiv i64 %count.value, 10
  %digits.next = add i64 %digits, 1
  br label %count.loop
alloc:
  %alloc.size = add i64 %digits, 1
  %out = call ptr @malloc(i64 %alloc.size)
  %nul = getelementptr i8, ptr %out, i64 %digits
  store i8 0, ptr %nul
  br label %fill.loop
fill.loop:
  %fill.value = phi i64 [ %index, %alloc ], [ %fill.next.value, %fill.body ]
  %pos = phi i64 [ %digits, %alloc ], [ %next.pos, %fill.body ]
  %done = icmp eq i64 %pos, 0
  br i1 %done, label %exit, label %fill.body
fill.body:
  %next.pos = sub i64 %pos, 1
  %quotient = udiv i64 %fill.value, 10
  %q10 = mul i64 %quotient, 10
  %remainder = sub i64 %fill.value, %q10
  %digit = add i64 %remainder, 48
  %byte = trunc i64 %digit to i8
  %slot = getelementptr i8, ptr %out, i64 %next.pos
  store i8 %byte, ptr %slot
  %fill.next.value = udiv i64 %fill.value, 10
  br label %fill.loop
exit:
  ret ptr %out
}
`);
  }
  if (runtime.used.has("arrayHas")) {
    definitions.push(`define i1 @arrayHas(ptr %array, i64 %index, i64 %key.len, ptr %key.ptr) {
entry:
  %own = call i1 @arrayHasOwnIndex(ptr %array, i64 %index)
  br i1 %own, label %found, label %check.prototype
found:
  ret i1 true
check.prototype:
  %properties.slot = getelementptr i8, ptr %array, i64 32
  %properties = load ptr, ptr %properties.slot
  %named.own = call i1 @objectHasOwn(ptr %properties, i64 %key.len, ptr %key.ptr)
  br i1 %named.own, label %found, label %prototype.check
prototype.check:
  %prototype.slot = getelementptr i8, ptr %array, i64 24
  %prototype = load ptr, ptr %prototype.slot
  %has.prototype = icmp ne ptr %prototype, null
  br i1 %has.prototype, label %prototype.lookup, label %missing
prototype.lookup:
  %prototype.has = call i1 @objectHas(ptr %prototype, i64 %key.len, ptr %key.ptr)
  ret i1 %prototype.has
missing:
  ret i1 false
}
`);
  }
  if (runtime.used.has("arrayKeys")) {
    definitions.push(`define ptr @arrayKeys(ptr %array) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  br label %count.scan
count.scan:
  %count.i = phi i64 [ 0, %entry ], [ %count.next, %count.advance ]
  %key.count = phi i64 [ 0, %entry ], [ %key.count.next, %count.advance ]
  %count.done = icmp eq i64 %count.i, %length
  br i1 %count.done, label %alloc, label %count.check
count.check:
  %has.own = call i1 @arrayHasOwnIndex(ptr %array, i64 %count.i)
  br i1 %has.own, label %count.include, label %count.skip
count.include:
  %included.count = add i64 %key.count, 1
  br label %count.advance
count.skip:
  br label %count.advance
count.advance:
  %key.count.next = phi i64 [ %included.count, %count.include ], [ %key.count, %count.skip ]
  %count.next = add i64 %count.i, 1
  br label %count.scan
alloc:
  %out = call ptr @arrayNew(i64 %key.count)
  br label %fill.scan
fill.scan:
  %fill.i = phi i64 [ 0, %alloc ], [ %fill.next, %fill.advance ]
  %out.i = phi i64 [ 0, %alloc ], [ %out.next, %fill.advance ]
  %fill.done = icmp eq i64 %fill.i, %length
  br i1 %fill.done, label %exit, label %fill.check
fill.check:
  %fill.has.own = call i1 @arrayHasOwnIndex(ptr %array, i64 %fill.i)
  br i1 %fill.has.own, label %fill.include, label %fill.skip
fill.include:
  %key.ptr = call ptr @indexToString(i64 %fill.i)
  br label %digit.count
digit.count:
  %digit.value = phi i64 [ %fill.i, %fill.include ], [ %digit.next.value, %digit.more ]
  %digit.len = phi i64 [ 1, %fill.include ], [ %digit.len.next, %digit.more ]
  %digit.more.check = icmp uge i64 %digit.value, 10
  br i1 %digit.more.check, label %digit.more, label %box.key
digit.more:
  %digit.next.value = udiv i64 %digit.value, 10
  %digit.len.next = add i64 %digit.len, 1
  br label %digit.count
box.key:
  %key.value = call i64 @valueBoxString(ptr %key.ptr, i64 %digit.len)
  call void @arraySet(ptr %out, i64 %out.i, i64 %key.value)
  %included.out = add i64 %out.i, 1
  br label %fill.advance
fill.skip:
  br label %fill.advance
fill.advance:
  %out.next = phi i64 [ %included.out, %box.key ], [ %out.i, %fill.skip ]
  %fill.next = add i64 %fill.i, 1
  br label %fill.scan
exit:
  %properties.slot = getelementptr i8, ptr %array, i64 32
  %properties = load ptr, ptr %properties.slot
  %named.keys = call ptr @objectKeys(ptr %properties)
  %combined = call ptr @arrayConcat(ptr %out, ptr %named.keys)
  ret ptr %combined
}
`);
  }
  if (runtime.used.has("arrayValues")) {
    definitions.push(`define ptr @arrayValues(ptr %array) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  br label %count.scan
count.scan:
  %count.i = phi i64 [ 0, %entry ], [ %count.next, %count.advance ]
  %value.count = phi i64 [ 0, %entry ], [ %value.count.next, %count.advance ]
  %count.done = icmp eq i64 %count.i, %length
  br i1 %count.done, label %alloc, label %count.check
count.check:
  %has.own = call i1 @arrayHasOwnIndex(ptr %array, i64 %count.i)
  br i1 %has.own, label %count.include, label %count.skip
count.include:
  %included.count = add i64 %value.count, 1
  br label %count.advance
count.skip:
  br label %count.advance
count.advance:
  %value.count.next = phi i64 [ %included.count, %count.include ], [ %value.count, %count.skip ]
  %count.next = add i64 %count.i, 1
  br label %count.scan
alloc:
  %out = call ptr @arrayNew(i64 %value.count)
  %elements.slot = getelementptr i8, ptr %array, i64 16
  %elements = load ptr, ptr %elements.slot
  br label %fill.scan
fill.scan:
  %fill.i = phi i64 [ 0, %alloc ], [ %fill.next, %fill.advance ]
  %out.i = phi i64 [ 0, %alloc ], [ %out.next, %fill.advance ]
  %fill.done = icmp eq i64 %fill.i, %length
  br i1 %fill.done, label %exit, label %fill.check
fill.check:
  %fill.has.own = call i1 @arrayHasOwnIndex(ptr %array, i64 %fill.i)
  br i1 %fill.has.own, label %fill.include, label %fill.skip
fill.include:
  %slot.bytes = mul i64 %fill.i, 8
  %slot = getelementptr i8, ptr %elements, i64 %slot.bytes
  %value = load i64, ptr %slot
  call void @arraySet(ptr %out, i64 %out.i, i64 %value)
  %included.out = add i64 %out.i, 1
  br label %fill.advance
fill.skip:
  br label %fill.advance
fill.advance:
  %out.next = phi i64 [ %included.out, %fill.include ], [ %out.i, %fill.skip ]
  %fill.next = add i64 %fill.i, 1
  br label %fill.scan
exit:
  %properties.slot = getelementptr i8, ptr %array, i64 32
  %properties = load ptr, ptr %properties.slot
  %named.values = call ptr @objectValues(ptr %properties)
  call void @arrayAppendElements(ptr %out, ptr %named.values)
  ret ptr %out
}
`);
  }
  if (runtime.used.has("arrayEntries")) {
    definitions.push(`define ptr @arrayEntries(ptr %array) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  br label %count.scan
count.scan:
  %count.i = phi i64 [ 0, %entry ], [ %count.next, %count.advance ]
  %entry.count = phi i64 [ 0, %entry ], [ %entry.count.next, %count.advance ]
  %count.done = icmp eq i64 %count.i, %length
  br i1 %count.done, label %alloc, label %count.check
count.check:
  %has.own = call i1 @arrayHasOwnIndex(ptr %array, i64 %count.i)
  br i1 %has.own, label %count.include, label %count.skip
count.include:
  %included.count = add i64 %entry.count, 1
  br label %count.advance
count.skip:
  br label %count.advance
count.advance:
  %entry.count.next = phi i64 [ %included.count, %count.include ], [ %entry.count, %count.skip ]
  %count.next = add i64 %count.i, 1
  br label %count.scan
alloc:
  %out = call ptr @arrayNew(i64 %entry.count)
  %elements.slot = getelementptr i8, ptr %array, i64 16
  %elements = load ptr, ptr %elements.slot
  br label %fill.scan
fill.scan:
  %fill.i = phi i64 [ 0, %alloc ], [ %fill.next, %fill.advance ]
  %out.i = phi i64 [ 0, %alloc ], [ %out.next, %fill.advance ]
  %fill.done = icmp eq i64 %fill.i, %length
  br i1 %fill.done, label %exit, label %fill.check
fill.check:
  %fill.has.own = call i1 @arrayHasOwnIndex(ptr %array, i64 %fill.i)
  br i1 %fill.has.own, label %fill.include, label %fill.skip
fill.include:
  %pair = call ptr @arrayNew(i64 2)
  %key.ptr = call ptr @indexToString(i64 %fill.i)
  br label %digit.count
digit.count:
  %digit.value = phi i64 [ %fill.i, %fill.include ], [ %digit.next.value, %digit.more ]
  %digit.len = phi i64 [ 1, %fill.include ], [ %digit.len.next, %digit.more ]
  %digit.more.check = icmp uge i64 %digit.value, 10
  br i1 %digit.more.check, label %digit.more, label %box.key
digit.more:
  %digit.next.value = udiv i64 %digit.value, 10
  %digit.len.next = add i64 %digit.len, 1
  br label %digit.count
box.key:
  %key.value = call i64 @valueBoxString(ptr %key.ptr, i64 %digit.len)
  %slot.bytes = mul i64 %fill.i, 8
  %slot = getelementptr i8, ptr %elements, i64 %slot.bytes
  %value = load i64, ptr %slot
  call void @arraySet(ptr %pair, i64 0, i64 %key.value)
  call void @arraySet(ptr %pair, i64 1, i64 %value)
  %pair.value = call i64 @valueBoxArray(ptr %pair)
  call void @arraySet(ptr %out, i64 %out.i, i64 %pair.value)
  %included.out = add i64 %out.i, 1
  br label %fill.advance
fill.skip:
  br label %fill.advance
fill.advance:
  %out.next = phi i64 [ %included.out, %box.key ], [ %out.i, %fill.skip ]
  %fill.next = add i64 %fill.i, 1
  br label %fill.scan
exit:
  %properties.slot = getelementptr i8, ptr %array, i64 32
  %properties = load ptr, ptr %properties.slot
  %named.entries = call ptr @objectEntries(ptr %properties)
  call void @arrayAppendElements(ptr %out, ptr %named.entries)
  ret ptr %out
}
`);
  }
  if (runtime.used.has("arrayOwnPropertyDescriptor")) {
    definitions.push(`define i64 @arrayOwnPropertyDescriptor(ptr %array, i64 %key.len, ptr %key.ptr, i64 %index) {
entry:
  %is.index = icmp sge i64 %index, 0
  br i1 %is.index, label %check.index, label %named
check.index:
  %has = call i1 @arrayHasOwnIndex(ptr %array, i64 %index)
  br i1 %has, label %present, label %named
present:
  %value = call i64 @arrayGet(ptr %array, i64 %index)
  %desc = call ptr @objectNew(i64 4)
  call void @objectSet(ptr %desc, i64 5, ptr @.desc.value, i64 %value)
  call void @objectSet(ptr %desc, i64 8, ptr @.desc.writable, i64 ${legacyJsValue.immediate("true")})
  call void @objectSet(ptr %desc, i64 10, ptr @.desc.enumerable, i64 ${legacyJsValue.immediate("true")})
  call void @objectSet(ptr %desc, i64 12, ptr @.desc.configurable, i64 ${legacyJsValue.immediate("true")})
  %boxed = call i64 @valueBoxObject(ptr %desc)
  ret i64 %boxed
named:
  %properties.slot = getelementptr i8, ptr %array, i64 32
  %properties = load ptr, ptr %properties.slot
  %named.desc = call i64 @objectOwnPropertyDescriptor(ptr %properties, i64 %key.len, ptr %key.ptr)
  ret i64 %named.desc
}
`);
  }
  if (runtime.used.has("arrayLengthPropertyDescriptor")) {
    definitions.push(`define i64 @arrayLengthPropertyDescriptor(ptr %array) {
entry:
  %length.i = call i64 @arrayLength(ptr %array)
  %length = uitofp i64 %length.i to double
  %length.value = call i64 @valueBoxNumber(double %length)
  %desc = call ptr @objectNew(i64 4)
  call void @objectSet(ptr %desc, i64 5, ptr @.desc.value, i64 %length.value)
  call void @objectSet(ptr %desc, i64 8, ptr @.desc.writable, i64 ${legacyJsValue.immediate("true")})
  call void @objectSet(ptr %desc, i64 10, ptr @.desc.enumerable, i64 ${legacyJsValue.immediate("false")})
  call void @objectSet(ptr %desc, i64 12, ptr @.desc.configurable, i64 ${legacyJsValue.immediate("false")})
  %boxed = call i64 @valueBoxObject(ptr %desc)
  ret i64 %boxed
}
`);
  }
  if (runtime.used.has("arrayOwnPropertyDescriptors")) {
    definitions.push(`@.array.desc.length = private unnamed_addr constant [7 x i8] c"length\\00"

define ptr @arrayOwnPropertyDescriptors(ptr %array) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  %out = call ptr @objectNew(i64 0)
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %length
  br i1 %done, label %length.desc, label %check
check:
  %has = call i1 @arrayHasOwnIndex(ptr %array, i64 %i)
  br i1 %has, label %copy, label %advance
copy:
  %key = call ptr @indexToString(i64 %i)
  %desc = call i64 @arrayOwnPropertyDescriptor(ptr %array, i64 1, ptr %key, i64 %i)
  call void @objectSet(ptr %out, i64 1, ptr %key, i64 %desc)
  br label %advance
advance:
  %next = add i64 %i, 1
  br label %scan
length.desc:
  %length.desc.value = call i64 @arrayLengthPropertyDescriptor(ptr %array)
  call void @objectSet(ptr %out, i64 6, ptr @.array.desc.length, i64 %length.desc.value)
  %properties.slot = getelementptr i8, ptr %array, i64 32
  %properties = load ptr, ptr %properties.slot
  %named.descriptors = call ptr @objectOwnPropertyDescriptors(ptr %properties)
  call void @objectAssign(ptr %out, ptr %named.descriptors)
  ret ptr %out
}
`);
  }
  if (runtime.used.has("arrayIncludes")) {
    definitions.push(`define i1 @arrayIncludes(ptr %array, i64 %needle) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %length
  br i1 %done, label %missing, label %check
check:
  %has = call i1 @arrayHasOwnIndex(ptr %array, i64 %i)
  br i1 %has, label %load, label %hole
load:
  %elements.slot = getelementptr i8, ptr %array, i64 16
  %elements = load ptr, ptr %elements.slot
  %slot.bytes = mul i64 %i, 8
  %slot = getelementptr i8, ptr %elements, i64 %slot.bytes
  %value = load i64, ptr %slot
  br label %compare
hole:
  br label %compare
compare:
  %candidate = phi i64 [ %value, %load ], [ ${legacyJsValue.immediate("undefined")}, %hole ]
  %same = call i1 @valueStrictEquals(i64 %candidate, i64 %needle)
  br i1 %same, label %found, label %string.check
string.check:
  %candidate.tag = and i64 %candidate, ${legacyJsValue.tagMask()}
  %needle.tag = and i64 %needle, ${legacyJsValue.tagMask()}
  %candidate.string = icmp eq i64 %candidate.tag, ${legacyJsValue.referenceTag("string")}
  %needle.string = icmp eq i64 %needle.tag, ${legacyJsValue.referenceTag("string")}
  %both.strings = and i1 %candidate.string, %needle.string
  br i1 %both.strings, label %string.compare, label %advance
string.compare:
  %candidate.len = call i64 @valueStringLength(i64 %candidate)
  %needle.len = call i64 @valueStringLength(i64 %needle)
  %same.len = icmp eq i64 %candidate.len, %needle.len
  br i1 %same.len, label %string.bytes, label %advance
string.bytes:
  %candidate.ptr = call ptr @valueStringPtr(i64 %candidate)
  %needle.ptr = call ptr @valueStringPtr(i64 %needle)
  %string.cmp = call i32 @memcmp(ptr %candidate.ptr, ptr %needle.ptr, i64 %candidate.len)
  %same.string = icmp eq i32 %string.cmp, 0
  br i1 %same.string, label %found, label %advance
advance:
  %next = add i64 %i, 1
  br label %scan
found:
  ret i1 true
missing:
  ret i1 false
}
`);
  }
  if (runtime.used.has("arrayIndexOf")) {
    definitions.push(`define i64 @arrayIndexOf(ptr %array, i64 %needle, i64 %fromIndex) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  %from.negative = icmp slt i64 %fromIndex, 0
  %from.low = select i1 %from.negative, i64 0, i64 %fromIndex
  %from.high = icmp sgt i64 %from.low, %length
  %from = select i1 %from.high, i64 %length, i64 %from.low
  br label %scan
scan:
  %i = phi i64 [ %from, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %length
  br i1 %done, label %missing, label %check
check:
  %has = call i1 @arrayHasOwnIndex(ptr %array, i64 %i)
  br i1 %has, label %load, label %advance
load:
  %value = call i64 @arrayGet(ptr %array, i64 %i)
  %same = call i1 @valueStrictEquals(i64 %value, i64 %needle)
  br i1 %same, label %found, label %advance
advance:
  %next = add i64 %i, 1
  br label %scan
found:
  ret i64 %i
missing:
  ret i64 -1
}
`);
  }
  if (runtime.used.has("arrayLastIndexOf")) {
    definitions.push(`define i64 @arrayLastIndexOf(ptr %array, i64 %needle, i64 %fromIndex) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  %empty = icmp eq i64 %length, 0
  br i1 %empty, label %missing, label %bounds
bounds:
  %last = sub i64 %length, 1
  %from.negative = icmp slt i64 %fromIndex, 0
  %from.low = select i1 %from.negative, i64 0, i64 %fromIndex
  %from.high = icmp sgt i64 %from.low, %last
  %from = select i1 %from.high, i64 %last, i64 %from.low
  %initial = add i64 %from, 1
  br label %scan
scan:
  %i = phi i64 [ %initial, %bounds ], [ %prev, %advance ]
  %done = icmp eq i64 %i, 0
  br i1 %done, label %missing, label %check
check:
  %index = sub i64 %i, 1
  %has = call i1 @arrayHasOwnIndex(ptr %array, i64 %index)
  br i1 %has, label %load, label %advance
load:
  %value = call i64 @arrayGet(ptr %array, i64 %index)
  %same = call i1 @valueStrictEquals(i64 %value, i64 %needle)
  br i1 %same, label %found, label %advance
advance:
  %prev = sub i64 %i, 1
  br label %scan
found:
  ret i64 %index
missing:
  ret i64 -1
}
`);
  }
  if (runtime.used.has("arrayFind")) {
    definitions.push(`define i64 @arrayFind(ptr %array) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %length
  br i1 %done, label %missing, label %check
check:
  %has = call i1 @arrayHasOwnIndex(ptr %array, i64 %i)
  br i1 %has, label %found, label %advance
advance:
  %next = add i64 %i, 1
  br label %scan
found:
  %value = call i64 @arrayGet(ptr %array, i64 %i)
  ret i64 %value
missing:
  ret i64 ${legacyJsValue.immediate("undefined")}
}
`);
  }
  if (runtime.used.has("arrayFindIndex")) {
    definitions.push(`define i64 @arrayFindIndex(ptr %array) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %length
  br i1 %done, label %missing, label %check
check:
  %has = call i1 @arrayHasOwnIndex(ptr %array, i64 %i)
  br i1 %has, label %found, label %advance
advance:
  %next = add i64 %i, 1
  br label %scan
found:
  ret i64 %i
missing:
  ret i64 -1
}
`);
  }
  if (runtime.used.has("arrayAt")) {
    definitions.push(`define i64 @arrayAt(ptr %array, i64 %index) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  %negative = icmp slt i64 %index, 0
  %from.end = add i64 %length, %index
  %actual = select i1 %negative, i64 %from.end, i64 %index
  %below.zero = icmp slt i64 %actual, 0
  br i1 %below.zero, label %missing, label %load
load:
  %in.bounds = icmp ult i64 %actual, %length
  br i1 %in.bounds, label %load.slot, label %missing
load.slot:
  %elements.slot = getelementptr i8, ptr %array, i64 16
  %elements = load ptr, ptr %elements.slot
  %slot.bytes = mul i64 %actual, 8
  %slot = getelementptr i8, ptr %elements, i64 %slot.bytes
  %stored = load i64, ptr %slot
  %is.hole = icmp eq i64 %stored, ${legacyJsValue.arrayHole()}
  br i1 %is.hole, label %missing, label %found
found:
  ret i64 %stored
missing:
  ret i64 ${legacyJsValue.immediate("undefined")}
}
`);
  }
  if (runtime.used.has("arrayCopyWithin")) {
    definitions.push(`define void @arrayCopyWithin(ptr %array, i64 %target, i64 %start, i64 %end) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  %target.negative = icmp slt i64 %target, 0
  %target.from.end = add i64 %length, %target
  %target.normalized = select i1 %target.negative, i64 %target.from.end, i64 %target
  %target.low = icmp slt i64 %target.normalized, 0
  %target.clamped.low = select i1 %target.low, i64 0, i64 %target.normalized
  %target.high = icmp sgt i64 %target.clamped.low, %length
  %to = select i1 %target.high, i64 %length, i64 %target.clamped.low
  %start.negative = icmp slt i64 %start, 0
  %start.from.end = add i64 %length, %start
  %start.normalized = select i1 %start.negative, i64 %start.from.end, i64 %start
  %start.low = icmp slt i64 %start.normalized, 0
  %start.clamped.low = select i1 %start.low, i64 0, i64 %start.normalized
  %start.high = icmp sgt i64 %start.clamped.low, %length
  %from = select i1 %start.high, i64 %length, i64 %start.clamped.low
  %end.negative = icmp slt i64 %end, 0
  %end.from.end = add i64 %length, %end
  %end.normalized = select i1 %end.negative, i64 %end.from.end, i64 %end
  %end.low = icmp slt i64 %end.normalized, 0
  %end.clamped.low = select i1 %end.low, i64 0, i64 %end.normalized
  %end.high = icmp sgt i64 %end.clamped.low, %length
  %final = select i1 %end.high, i64 %length, i64 %end.clamped.low
  %available = sub i64 %final, %from
  %available.negative = icmp slt i64 %available, 0
  %positive.available = select i1 %available.negative, i64 0, i64 %available
  %room = sub i64 %length, %to
  %room.less = icmp slt i64 %room, %positive.available
  %count = select i1 %room.less, i64 %room, i64 %positive.available
  %elements.slot = getelementptr i8, ptr %array, i64 16
  %elements = load ptr, ptr %elements.slot
  %source.end = add i64 %from, %count
  %target.after.source.start = icmp sgt i64 %to, %from
  %target.before.source.end = icmp slt i64 %to, %source.end
  %copy.backward = and i1 %target.after.source.start, %target.before.source.end
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %count
  br i1 %done, label %exit, label %copy
copy:
  %reverse.base = sub i64 %count, 1
  %reverse.offset = sub i64 %reverse.base, %i
  %offset = select i1 %copy.backward, i64 %reverse.offset, i64 %i
  %from.index = add i64 %from, %offset
  %to.index = add i64 %to, %offset
  %from.has = call i1 @arrayHasOwnIndex(ptr %array, i64 %from.index)
  br i1 %from.has, label %copy.present, label %copy.hole
copy.present:
  %from.bytes = mul i64 %from.index, 8
  %from.ptr = getelementptr i8, ptr %elements, i64 %from.bytes
  %value = load i64, ptr %from.ptr
  call void @arraySet(ptr %array, i64 %to.index, i64 %value)
  br label %advance
copy.hole:
  call void @arrayDelete(ptr %array, i64 %to.index)
  br label %advance
advance:
  %next = add i64 %i, 1
  br label %scan
exit:
  ret void
}
`);
  }
  if (runtime.used.has("arraySlice")) {
    definitions.push(`define ptr @arraySlice(ptr %array, i64 %start, i64 %end) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  %start.negative = icmp slt i64 %start, 0
  %start.from.end = add i64 %length, %start
  %start.normalized = select i1 %start.negative, i64 %start.from.end, i64 %start
  %start.low = icmp slt i64 %start.normalized, 0
  %start.clamped.low = select i1 %start.low, i64 0, i64 %start.normalized
  %start.high = icmp sgt i64 %start.clamped.low, %length
  %from = select i1 %start.high, i64 %length, i64 %start.clamped.low
  %end.negative = icmp slt i64 %end, 0
  %end.from.end = add i64 %length, %end
  %end.normalized = select i1 %end.negative, i64 %end.from.end, i64 %end
  %end.low = icmp slt i64 %end.normalized, 0
  %end.clamped.low = select i1 %end.low, i64 0, i64 %end.normalized
  %end.high = icmp sgt i64 %end.clamped.low, %length
  %final = select i1 %end.high, i64 %length, i64 %end.clamped.low
  %raw.out.length = sub i64 %final, %from
  %empty.range = icmp slt i64 %raw.out.length, 0
  %out.length = select i1 %empty.range, i64 0, i64 %raw.out.length
  %out = call ptr @arrayNew(i64 %out.length)
  %elements.slot = getelementptr i8, ptr %array, i64 16
  %elements = load ptr, ptr %elements.slot
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %out.length
  br i1 %done, label %exit, label %check
check:
  %source.index = add i64 %from, %i
  %has = call i1 @arrayHasOwnIndex(ptr %array, i64 %source.index)
  br i1 %has, label %copy, label %advance
copy:
  %slot.bytes = mul i64 %source.index, 8
  %slot = getelementptr i8, ptr %elements, i64 %slot.bytes
  %value = load i64, ptr %slot
  call void @arraySet(ptr %out, i64 %i, i64 %value)
  br label %advance
advance:
  %next = add i64 %i, 1
  br label %scan
exit:
  ret ptr %out
}
`);
  }
  if (runtime.used.has("arraySplice")) {
    definitions.push(`define ptr @arraySplice(ptr %array, i64 %start, i64 %deleteCount, i64 %itemCount, ptr %items) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  %start.negative = icmp slt i64 %start, 0
  %start.from.end = add i64 %length, %start
  %start.normalized = select i1 %start.negative, i64 %start.from.end, i64 %start
  %start.low = icmp slt i64 %start.normalized, 0
  %start.clamped.low = select i1 %start.low, i64 0, i64 %start.normalized
  %start.high = icmp sgt i64 %start.clamped.low, %length
  %from = select i1 %start.high, i64 %length, i64 %start.clamped.low
  %delete.too.negative = icmp slt i64 %deleteCount, 0
  %delete.negative = select i1 %delete.too.negative, i64 0, i64 %deleteCount
  %remaining = sub i64 %length, %from
  %delete.too.big = icmp sgt i64 %delete.negative, %remaining
  %actual.delete = select i1 %delete.too.big, i64 %remaining, i64 %delete.negative
  %removed = call ptr @arrayNew(i64 %actual.delete)
  br label %removed.scan
removed.scan:
  %r.i = phi i64 [ 0, %entry ], [ %r.next, %r.advance ]
  %r.done = icmp eq i64 %r.i, %actual.delete
  br i1 %r.done, label %shift, label %r.copy
r.copy:
  %src.index = add i64 %from, %r.i
  %r.has = call i1 @arrayHasOwnIndex(ptr %array, i64 %src.index)
  br i1 %r.has, label %r.copy.present, label %r.copy.hole
r.copy.present:
  %r.value = call i64 @arrayGet(ptr %array, i64 %src.index)
  br label %r.copy.store
r.copy.hole:
  %r.value.hole = call i64 @arrayGet(ptr %array, i64 %src.index)
  br label %r.copy.store
r.copy.store:
  %r.candidate = phi i64 [ %r.value, %r.copy.present ], [ %r.value.hole, %r.copy.hole ]
  call void @arraySet(ptr %removed, i64 %r.i, i64 %r.candidate)
  br label %r.advance
r.advance:
  %r.next = add i64 %r.i, 1
  br label %removed.scan
shift:
  %tail.count = sub i64 %length, %from
  %tail.count.sub.delete = sub i64 %tail.count, %actual.delete
  br label %tail.scan
tail.scan:
  %t.i = phi i64 [ 0, %shift ], [ %t.next, %t.advance ]
  %t.done = icmp eq i64 %t.i, %tail.count.sub.delete
  br i1 %t.done, label %insert, label %t.body
t.body:
  %t.from = add i64 %from, %actual.delete
  %t.src = add i64 %t.from, %t.i
  %t.dst = add i64 %from, %t.i
  %t.has = call i1 @arrayHasOwnIndex(ptr %array, i64 %t.src)
  br i1 %t.has, label %t.copy, label %t.delete
t.copy:
  %t.value = call i64 @arrayGet(ptr %array, i64 %t.src)
  call void @arraySet(ptr %array, i64 %t.dst, i64 %t.value)
  br label %t.advance
t.delete:
  call void @arrayDelete(ptr %array, i64 %t.dst)
  br label %t.advance
t.advance:
  %t.next = add i64 %t.i, 1
  br label %tail.scan
insert:
  %new.length.base = sub i64 %length, %actual.delete
  %new.length = add i64 %new.length.base, %itemCount
  call void @arraySetLength(ptr %array, i64 %new.length)
  %shift.back.count = sub i64 %new.length.base, %from
  br label %shift.back.scan
shift.back.scan:
  %b.i = phi i64 [ 0, %insert ], [ %b.next, %b.advance ]
  %b.done = icmp eq i64 %b.i, %shift.back.count
  br i1 %b.done, label %write.items, label %b.body
b.body:
  %b.reverse = sub i64 %shift.back.count, 1
  %b.offset = sub i64 %b.reverse, %b.i
  %b.from = add i64 %from, %b.offset
  %b.to = add i64 %from, %itemCount
  %b.to.add = add i64 %b.to, %b.offset
  %b.has = call i1 @arrayHasOwnIndex(ptr %array, i64 %b.from)
  br i1 %b.has, label %b.copy, label %b.delete
b.copy:
  %b.value = call i64 @arrayGet(ptr %array, i64 %b.from)
  call void @arraySet(ptr %array, i64 %b.to.add, i64 %b.value)
  br label %b.advance
b.delete:
  call void @arrayDelete(ptr %array, i64 %b.to.add)
  br label %b.advance
b.advance:
  %b.next = add i64 %b.i, 1
  br label %shift.back.scan
write.items:
  br label %items.scan
items.scan:
  %i.i = phi i64 [ 0, %write.items ], [ %i.next, %i.advance ]
  %i.done = icmp eq i64 %i.i, %itemCount
  br i1 %i.done, label %done, label %i.body
i.body:
  %i.dst = add i64 %from, %i.i
  %i.has = call i1 @arrayHasOwnIndex(ptr %items, i64 %i.i)
  br i1 %i.has, label %i.copy, label %i.advance
i.copy:
  %i.value = call i64 @arrayGet(ptr %items, i64 %i.i)
  call void @arraySet(ptr %array, i64 %i.dst, i64 %i.value)
  br label %i.advance
i.advance:
  %i.next = add i64 %i.i, 1
  br label %items.scan
done:
  ret ptr %removed
}
`);
  }
  if (runtime.used.has("arrayFlat")) {
    definitions.push(`define ptr @arrayFlat(ptr %array, i64 %depth) {
entry:
  %out = call ptr @arrayNew(i64 0)
  %out.length = alloca i64
  store i64 0, ptr %out.length
  %length = call i64 @arrayLength(ptr %array)
  br label %outer.scan
outer.scan:
  %o.i = phi i64 [ 0, %entry ], [ %o.next, %o.advance ]
  %o.done = icmp eq i64 %o.i, %length
  br i1 %o.done, label %exit, label %o.body
o.body:
  %o.has = call i1 @arrayHasOwnIndex(ptr %array, i64 %o.i)
  br i1 %o.has, label %o.present, label %o.advance
o.present:
  %o.value = call i64 @arrayGet(ptr %array, i64 %o.i)
  %o.is.array = call i1 @valueIsArray(i64 %o.value)
  br i1 %o.is.array, label %o.flatten, label %o.copy
o.copy:
  %cur = load i64, ptr %out.length
  call void @arraySet(ptr %out, i64 %cur, i64 %o.value)
  %next.cur = add i64 %cur, 1
  store i64 %next.cur, ptr %out.length
  br label %o.advance
o.advance:
  %o.next = add i64 %o.i, 1
  br label %outer.scan
o.flatten:
  %depth.positive = icmp sgt i64 %depth, 0
  br i1 %depth.positive, label %o.spread, label %o.copy
o.spread:
  %o.inner = call ptr @valueArrayPtr(i64 %o.value)
  %o.inner.length = call i64 @arrayLength(ptr %o.inner)
  br label %o.inner.scan
o.inner.scan:
  %i.i = phi i64 [ 0, %o.spread ], [ %i.next, %i.advance ]
  %i.done = icmp eq i64 %i.i, %o.inner.length
  br i1 %i.done, label %o.advance, label %i.body
i.body:
  %i.has = call i1 @arrayHasOwnIndex(ptr %o.inner, i64 %i.i)
  br i1 %i.has, label %i.copy, label %i.advance
i.copy:
  %i.value = call i64 @arrayGet(ptr %o.inner, i64 %i.i)
  %cur.i = load i64, ptr %out.length
  call void @arraySet(ptr %out, i64 %cur.i, i64 %i.value)
  %next.cur.i = add i64 %cur.i, 1
  store i64 %next.cur.i, ptr %out.length
  br label %i.advance
i.advance:
  %i.next = add i64 %i.i, 1
  br label %o.inner.scan
exit:
  ret ptr %out
}
`);
  }
  if (runtime.used.has("arrayConcat")) {
    definitions.push(`define ptr @arrayConcat(ptr %left, ptr %args) {
entry:
  %left.length = call i64 @arrayLength(ptr %left)
  %args.length = call i64 @arrayLength(ptr %args)
  %out = call ptr @arrayNew(i64 %left.length)
  br label %left.scan
left.scan:
  %left.i = phi i64 [ 0, %entry ], [ %left.next, %left.advance ]
  %left.done = icmp eq i64 %left.i, %left.length
  br i1 %left.done, label %args.scan, label %left.check
left.check:
  %left.has = call i1 @arrayHasOwnIndex(ptr %left, i64 %left.i)
  br i1 %left.has, label %left.copy, label %left.advance
left.copy:
  %left.value = call i64 @arrayGet(ptr %left, i64 %left.i)
  call void @arraySet(ptr %out, i64 %left.i, i64 %left.value)
  br label %left.advance
left.advance:
  %left.next = add i64 %left.i, 1
  br label %left.scan
args.scan:
  %arg.i = phi i64 [ 0, %left.scan ], [ %arg.next, %arg.advance ]
  %out.index = phi i64 [ %left.length, %left.scan ], [ %out.next, %arg.advance ]
  %args.done = icmp eq i64 %arg.i, %args.length
  br i1 %args.done, label %exit, label %arg.load
arg.load:
  %arg.value = call i64 @arrayGet(ptr %args, i64 %arg.i)
  %arg.is.array = call i1 @valueIsArray(i64 %arg.value)
  br i1 %arg.is.array, label %spread.entry, label %append.scalar
append.scalar:
  call void @arraySet(ptr %out, i64 %out.index, i64 %arg.value)
  %scalar.next = add i64 %out.index, 1
  br label %arg.advance
spread.entry:
  %spread.array = call ptr @valueArrayPtr(i64 %arg.value)
  %spread.length = call i64 @arrayLength(ptr %spread.array)
  br label %spread.scan
spread.scan:
  %spread.i = phi i64 [ 0, %spread.entry ], [ %spread.next, %spread.advance ]
  %spread.done = icmp eq i64 %spread.i, %spread.length
  br i1 %spread.done, label %spread.done.block, label %spread.check
spread.check:
  %spread.has = call i1 @arrayHasOwnIndex(ptr %spread.array, i64 %spread.i)
  br i1 %spread.has, label %spread.copy, label %spread.advance
spread.copy:
  %spread.value = call i64 @arrayGet(ptr %spread.array, i64 %spread.i)
  %spread.out.index = add i64 %out.index, %spread.i
  call void @arraySet(ptr %out, i64 %spread.out.index, i64 %spread.value)
  br label %spread.advance
spread.advance:
  %spread.next = add i64 %spread.i, 1
  br label %spread.scan
spread.done.block:
  %spread.out.next = add i64 %out.index, %spread.length
  br label %arg.advance
arg.advance:
  %out.next = phi i64 [ %scalar.next, %append.scalar ], [ %spread.out.next, %spread.done.block ]
  %arg.next = add i64 %arg.i, 1
  br label %args.scan
exit:
  ret ptr %out
}
`);
  }
  if (runtime.used.has("arrayFill")) {
    definitions.push(`define void @arrayFill(ptr %array, i64 %value, i64 %start, i64 %end) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  %start.negative = icmp slt i64 %start, 0
  %start.from.end = add i64 %length, %start
  %start.normalized = select i1 %start.negative, i64 %start.from.end, i64 %start
  %start.low = icmp slt i64 %start.normalized, 0
  %start.clamped.low = select i1 %start.low, i64 0, i64 %start.normalized
  %start.high = icmp sgt i64 %start.clamped.low, %length
  %from = select i1 %start.high, i64 %length, i64 %start.clamped.low
  %end.negative = icmp slt i64 %end, 0
  %end.from.end = add i64 %length, %end
  %end.normalized = select i1 %end.negative, i64 %end.from.end, i64 %end
  %end.low = icmp slt i64 %end.normalized, 0
  %end.clamped.low = select i1 %end.low, i64 0, i64 %end.normalized
  %end.high = icmp sgt i64 %end.clamped.low, %length
  %final = select i1 %end.high, i64 %length, i64 %end.clamped.low
  br label %scan
scan:
  %i = phi i64 [ %from, %entry ], [ %next, %body ]
  %done = icmp uge i64 %i, %final
  br i1 %done, label %exit, label %body
body:
  call void @arraySet(ptr %array, i64 %i, i64 %value)
  %next = add i64 %i, 1
  br label %scan
exit:
  ret void
}
`);
  }
  if (runtime.used.has("arrayReverse")) {
    definitions.push(`define void @arrayReverse(ptr %array) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  %empty = icmp eq i64 %length, 0
  br i1 %empty, label %exit, label %scan
scan:
  %left = phi i64 [ 0, %entry ], [ %left.next, %swap ]
  %right = phi i64 [ %length, %entry ], [ %right.next, %swap ]
  %right.index = sub i64 %right, 1
  %done = icmp uge i64 %left, %right.index
  br i1 %done, label %exit, label %swap
swap:
  %elements.slot = getelementptr i8, ptr %array, i64 16
  %elements = load ptr, ptr %elements.slot
  %left.bytes = mul i64 %left, 8
  %right.bytes = mul i64 %right.index, 8
  %left.slot = getelementptr i8, ptr %elements, i64 %left.bytes
  %right.slot = getelementptr i8, ptr %elements, i64 %right.bytes
  %left.value = load i64, ptr %left.slot
  %right.value = load i64, ptr %right.slot
  store i64 %right.value, ptr %left.slot
  store i64 %left.value, ptr %right.slot
  %left.next = add i64 %left, 1
  %right.next = sub i64 %right, 1
  br label %scan
exit:
  ret void
}
`);
  }
  if (runtime.used.has("arrayFromArray")) {
    definitions.push(`define ptr @arrayFromArray(ptr %source) {
entry:
  %length = call i64 @arrayLength(ptr %source)
  %out = call ptr @arrayNew(i64 %length)
  br label %loop
loop:
  %i = phi i64 [ 0, %entry ], [ %next, %body ]
  %done = icmp eq i64 %i, %length
  br i1 %done, label %exit, label %body
body:
  %value = call i64 @arrayGet(ptr %source, i64 %i)
  call void @arraySet(ptr %out, i64 %i, i64 %value)
  %next = add i64 %i, 1
  br label %loop
exit:
  ret ptr %out
}
`);
  }
  if (runtime.used.has("arrayFromObject")) {
    definitions.push(`@.array.from.length = private unnamed_addr constant [7 x i8] c"length\\00"

define ptr @arrayFromObject(ptr %source) {
entry:
  %length.value = call i64 @objectGet(ptr %source, i64 6, ptr @.array.from.length)
  %length.number = call double @valueToNumber(i64 %length.value)
  %length = fptosi double %length.number to i64
  %out = call ptr @arrayNew(i64 %length)
  br label %loop
loop:
  %i = phi i64 [ 0, %entry ], [ %next, %get ]
  %done = icmp eq i64 %i, %length
  br i1 %done, label %exit, label %body
body:
  %key = call ptr @indexToString(i64 %i)
  br label %key.len.loop
key.len.loop:
  %key.len = phi i64 [ 0, %body ], [ %key.len.next, %key.len.more ]
  %key.char.ptr = getelementptr i8, ptr %key, i64 %key.len
  %key.char = load i8, ptr %key.char.ptr
  %key.done = icmp eq i8 %key.char, 0
  br i1 %key.done, label %get, label %key.len.more
key.len.more:
  %key.len.next = add i64 %key.len, 1
  br label %key.len.loop
get:
  %value = call i64 @objectGet(ptr %source, i64 %key.len, ptr %key)
  call void @arraySet(ptr %out, i64 %i, i64 %value)
  %next = add i64 %i, 1
  br label %loop
exit:
  ret ptr %out
}
`);
  }
  if (runtime.used.has("arraySortDefault")) {
    definitions.push(`define void @arraySortDefault(ptr %array) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  br label %outer.cond
outer.cond:
  %i = phi i64 [ 0, %entry ], [ %next.i, %outer.advance ]
  %outer.done = icmp uge i64 %i, %length
  br i1 %outer.done, label %exit, label %outer.body
outer.body:
  br label %inner.cond
inner.cond:
  %j = phi i64 [ 0, %outer.body ], [ %next.j, %advance ]
  %limit = sub i64 %length, 1
  %inner.done = icmp uge i64 %j, %limit
  br i1 %inner.done, label %outer.advance, label %inner.body
inner.body:
  %next.j = add i64 %j, 1
  %left = call i64 @arrayGet(ptr %array, i64 %j)
  %right = call i64 @arrayGet(ptr %array, i64 %next.j)
  %left.str = call { ptr, i64 } @valueToString(i64 %left)
  %left.ptr = extractvalue { ptr, i64 } %left.str, 0
  %left.len = extractvalue { ptr, i64 } %left.str, 1
  %right.str = call { ptr, i64 } @valueToString(i64 %right)
  %right.ptr = extractvalue { ptr, i64 } %right.str, 0
  %right.len = extractvalue { ptr, i64 } %right.str, 1
  %left.shorter = icmp ult i64 %left.len, %right.len
  %min.len = select i1 %left.shorter, i64 %left.len, i64 %right.len
  %cmp = call i32 @memcmp(ptr %left.ptr, ptr %right.ptr, i64 %min.len)
  %byte.gt = icmp sgt i32 %cmp, 0
  %bytes.eq = icmp eq i32 %cmp, 0
  %left.longer = icmp ugt i64 %left.len, %right.len
  %prefix.gt = and i1 %bytes.eq, %left.longer
  %swap = or i1 %byte.gt, %prefix.gt
  br i1 %swap, label %swap.block, label %advance
swap.block:
  call void @arraySet(ptr %array, i64 %j, i64 %right)
  call void @arraySet(ptr %array, i64 %next.j, i64 %left)
  br label %advance
advance:
  br label %inner.cond
outer.advance:
  %next.i = add i64 %i, 1
  br label %outer.cond
exit:
  ret void
}
`);
  }
  if (runtime.used.has("arrayJoin")) {
    definitions.push(`define ptr @arrayJoin(ptr %array, i64 %sep.len, ptr %sep.ptr) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  br label %size.scan
size.scan:
  %size.i = phi i64 [ 0, %entry ], [ %size.next, %size.advance ]
  %total = phi i64 [ 0, %entry ], [ %total.next, %size.advance ]
  %size.done = icmp eq i64 %size.i, %length
  br i1 %size.done, label %alloc, label %size.element
size.element:
  %with.sep = icmp ne i64 %size.i, 0
  %sep.add = select i1 %with.sep, i64 %sep.len, i64 0
  %after.sep = add i64 %total, %sep.add
  %has = call i1 @arrayHasOwnIndex(ptr %array, i64 %size.i)
  br i1 %has, label %size.present, label %size.advance.empty
size.present:
  %elements.slot.s = getelementptr i8, ptr %array, i64 16
  %elements.s = load ptr, ptr %elements.slot.s
  %slot.bytes.s = mul i64 %size.i, 8
  %slot.s = getelementptr i8, ptr %elements.s, i64 %slot.bytes.s
  %value.s = load i64, ptr %slot.s
  %is.undefined.s = icmp eq i64 %value.s, ${legacyJsValue.immediate("undefined")}
  br i1 %is.undefined.s, label %size.advance.empty, label %size.string
size.string:
  %string.s = call { ptr, i64 } @valueToString(i64 %value.s)
  %value.len = extractvalue { ptr, i64 } %string.s, 1
  %with.value = add i64 %after.sep, %value.len
  br label %size.advance
size.advance.empty:
  br label %size.advance
size.advance:
  %total.next = phi i64 [ %with.value, %size.string ], [ %after.sep, %size.advance.empty ]
  %size.next = add i64 %size.i, 1
  br label %size.scan
alloc:
  %alloc.size = add i64 %total, 1
  %out = call ptr @malloc(i64 %alloc.size)
  br label %fill.scan
fill.scan:
  %fill.i = phi i64 [ 0, %alloc ], [ %fill.next, %fill.advance ]
  %offset = phi i64 [ 0, %alloc ], [ %offset.next, %fill.advance ]
  %fill.done = icmp eq i64 %fill.i, %length
  br i1 %fill.done, label %finish, label %fill.sep
fill.sep:
  %needs.sep = icmp ne i64 %fill.i, 0
  br i1 %needs.sep, label %copy.sep, label %fill.element
copy.sep:
  %sep.dst = getelementptr i8, ptr %out, i64 %offset
  call ptr @memcpy(ptr %sep.dst, ptr %sep.ptr, i64 %sep.len)
  %after.sep.offset = add i64 %offset, %sep.len
  br label %fill.element
fill.element:
  %element.offset = phi i64 [ %after.sep.offset, %copy.sep ], [ %offset, %fill.sep ]
  %has.f = call i1 @arrayHasOwnIndex(ptr %array, i64 %fill.i)
  br i1 %has.f, label %fill.present, label %fill.advance.empty
fill.present:
  %elements.slot.f = getelementptr i8, ptr %array, i64 16
  %elements.f = load ptr, ptr %elements.slot.f
  %slot.bytes.f = mul i64 %fill.i, 8
  %slot.f = getelementptr i8, ptr %elements.f, i64 %slot.bytes.f
  %value.f = load i64, ptr %slot.f
  %is.undefined.f = icmp eq i64 %value.f, ${legacyJsValue.immediate("undefined")}
  br i1 %is.undefined.f, label %fill.advance.empty, label %copy.value
copy.value:
  %string.f = call { ptr, i64 } @valueToString(i64 %value.f)
  %value.ptr = extractvalue { ptr, i64 } %string.f, 0
  %value.len.f = extractvalue { ptr, i64 } %string.f, 1
  %value.dst = getelementptr i8, ptr %out, i64 %element.offset
  call ptr @memcpy(ptr %value.dst, ptr %value.ptr, i64 %value.len.f)
  %after.value.offset = add i64 %element.offset, %value.len.f
  br label %fill.advance
fill.advance.empty:
  br label %fill.advance
fill.advance:
  %offset.next = phi i64 [ %after.value.offset, %copy.value ], [ %element.offset, %fill.advance.empty ]
  %fill.next = add i64 %fill.i, 1
  br label %fill.scan
finish:
  %nul = getelementptr i8, ptr %out, i64 %offset
  store i8 0, ptr %nul
  ret ptr %out
}
`);
  }
  if (runtime.used.has("arrayPush")) {
    definitions.push(`define i64 @arrayPush(ptr %array, i64 %value) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  call void @arraySet(ptr %array, i64 %length, i64 %value)
  %next.length = add i64 %length, 1
  ret i64 %next.length
}
`);
  }
  if (runtime.used.has("arrayPop")) {
    definitions.push(`define i64 @arrayPop(ptr %array) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  %empty = icmp eq i64 %length, 0
  br i1 %empty, label %empty.return, label %pop
pop:
  %index = sub i64 %length, 1
  %elements.slot = getelementptr i8, ptr %array, i64 16
  %elements = load ptr, ptr %elements.slot
  %slot.bytes = mul i64 %index, 8
  %slot = getelementptr i8, ptr %elements, i64 %slot.bytes
  %stored = load i64, ptr %slot
  %is.hole = icmp eq i64 %stored, ${legacyJsValue.arrayHole()}
  %value = select i1 %is.hole, i64 ${legacyJsValue.immediate("undefined")}, i64 %stored
  store i64 ${legacyJsValue.arrayHole()}, ptr %slot
  store i64 %index, ptr %array
  ret i64 %value
empty.return:
  ret i64 ${legacyJsValue.immediate("undefined")}
}
`);
  }
  if (runtime.used.has("arrayUnshift")) {
    definitions.push(`define i64 @arrayUnshift(ptr %array, i64 %value) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  %new.length = add i64 %length, 1
  call void @arraySetLength(ptr %array, i64 %new.length)
  %elements.slot = getelementptr i8, ptr %array, i64 16
  %elements = load ptr, ptr %elements.slot
  br label %shift.cond
shift.cond:
  %i = phi i64 [ %length, %entry ], [ %prev, %shift.body ]
  %done = icmp eq i64 %i, 0
  br i1 %done, label %store.first, label %shift.body
shift.body:
  %prev = sub i64 %i, 1
  %from.bytes = mul i64 %prev, 8
  %to.bytes = mul i64 %i, 8
  %from = getelementptr i8, ptr %elements, i64 %from.bytes
  %to = getelementptr i8, ptr %elements, i64 %to.bytes
  %moved = load i64, ptr %from
  store i64 %moved, ptr %to
  br label %shift.cond
store.first:
  store i64 %value, ptr %elements
  ret i64 %new.length
}
`);
  }
  if (runtime.used.has("arrayShift")) {
    definitions.push(`define i64 @arrayShift(ptr %array) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  %empty = icmp eq i64 %length, 0
  br i1 %empty, label %empty.return, label %shift
shift:
  %elements.slot = getelementptr i8, ptr %array, i64 16
  %elements = load ptr, ptr %elements.slot
  %first = load i64, ptr %elements
  %first.hole = icmp eq i64 %first, ${legacyJsValue.arrayHole()}
  %value = select i1 %first.hole, i64 ${legacyJsValue.immediate("undefined")}, i64 %first
  %new.length = sub i64 %length, 1
  br label %loop.cond
loop.cond:
  %i = phi i64 [ 0, %shift ], [ %next, %loop.body ]
  %done = icmp eq i64 %i, %new.length
  br i1 %done, label %clear.tail, label %loop.body
loop.body:
  %next = add i64 %i, 1
  %from.bytes = mul i64 %next, 8
  %to.bytes = mul i64 %i, 8
  %from = getelementptr i8, ptr %elements, i64 %from.bytes
  %to = getelementptr i8, ptr %elements, i64 %to.bytes
  %moved = load i64, ptr %from
  store i64 %moved, ptr %to
  br label %loop.cond
clear.tail:
  %tail.bytes = mul i64 %new.length, 8
  %tail = getelementptr i8, ptr %elements, i64 %tail.bytes
  store i64 ${legacyJsValue.arrayHole()}, ptr %tail
  store i64 %new.length, ptr %array
  ret i64 %value
empty.return:
  ret i64 ${legacyJsValue.immediate("undefined")}
}
`);
  }
  if (runtime.used.has("arraySetPrototype")) {
    definitions.push(`define void @arraySetPrototype(ptr %array, ptr %prototype) {
entry:
  %prototype.slot = getelementptr i8, ptr %array, i64 24
  store ptr %prototype, ptr %prototype.slot
  ret void
}
`);
  }
  if (runtime.used.has("arrayGetPrototype")) {
    definitions.push(`define ptr @arrayGetPrototype(ptr %array) {
entry:
  %prototype.slot = getelementptr i8, ptr %array, i64 24
  %prototype = load ptr, ptr %prototype.slot
  ret ptr %prototype
}
`);
  }
  if (runtime.used.has("collectionNew")) {
    definitions.push(`define ptr @collectionNew() {
entry:
  %cell = call ptr @gcAlloc(i64 4, i64 40)
  %collection = getelementptr i8, ptr %cell, i64 8
  %entries = call ptr @malloc(i64 96)
  store i64 0, ptr %collection
  %used.slot = getelementptr i8, ptr %collection, i64 8
  store i64 0, ptr %used.slot
  %capacity.slot = getelementptr i8, ptr %collection, i64 16
  store i64 4, ptr %capacity.slot
  %entries.slot = getelementptr i8, ptr %collection, i64 24
  store ptr %entries, ptr %entries.slot
  %iterator.slot = getelementptr i8, ptr %collection, i64 32
  store i64 ${legacyJsValue.immediate("undefined")}, ptr %iterator.slot
  ret ptr %collection
}
`);
  }
  if (runtime.used.has("collectionSize")) {
    definitions.push(`define i64 @collectionSize(ptr %collection) {
entry:
  %size = load i64, ptr %collection
  ret i64 %size
}
`);
  }
  if (runtime.used.has("collectionFind")) {
    definitions.push(`define i64 @collectionFind(ptr %collection, i64 %key) {
entry:
  %used.slot = getelementptr i8, ptr %collection, i64 8
  %used = load i64, ptr %used.slot
  %entries.slot = getelementptr i8, ptr %collection, i64 24
  %entries = load ptr, ptr %entries.slot
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %used
  br i1 %done, label %missing, label %check
check:
  %entry.bytes = mul i64 %i, 24
  %entry.ptr = getelementptr i8, ptr %entries, i64 %entry.bytes
  %active = load i64, ptr %entry.ptr
  %is.active = icmp ne i64 %active, 0
  br i1 %is.active, label %compare, label %advance
compare:
  %key.slot = getelementptr i8, ptr %entry.ptr, i64 8
  %stored.key = load i64, ptr %key.slot
  %same = call i1 @valueSameValueZero(i64 %stored.key, i64 %key)
  br i1 %same, label %found, label %advance
advance:
  %next = add i64 %i, 1
  br label %scan
found:
  ret i64 %i
missing:
  ret i64 -1
}
`);
  }
  if (runtime.used.has("collectionSet")) {
    definitions.push(`define void @collectionSet(ptr %collection, i64 %key, i64 %value) {
entry:
  %found = call i64 @collectionFind(ptr %collection, i64 %key)
  %has = icmp sge i64 %found, 0
  br i1 %has, label %update, label %append
update:
  %entries.slot.u = getelementptr i8, ptr %collection, i64 24
  %entries.u = load ptr, ptr %entries.slot.u
  %entry.bytes.u = mul i64 %found, 24
  %entry.ptr.u = getelementptr i8, ptr %entries.u, i64 %entry.bytes.u
  %value.slot.u = getelementptr i8, ptr %entry.ptr.u, i64 16
  store i64 %value, ptr %value.slot.u
  ret void
append:
  %used.slot = getelementptr i8, ptr %collection, i64 8
  %used = load i64, ptr %used.slot
  %capacity.slot = getelementptr i8, ptr %collection, i64 16
  %capacity = load i64, ptr %capacity.slot
  %entries.slot = getelementptr i8, ptr %collection, i64 24
  %entries = load ptr, ptr %entries.slot
  %has.capacity = icmp ult i64 %used, %capacity
  br i1 %has.capacity, label %store, label %grow
grow:
  %new.capacity = mul i64 %capacity, 2
  %new.bytes = mul i64 %new.capacity, 24
  %new.entries = call ptr @malloc(i64 %new.bytes)
  %old.bytes = mul i64 %used, 24
  call ptr @memcpy(ptr %new.entries, ptr %entries, i64 %old.bytes)
  store i64 %new.capacity, ptr %capacity.slot
  store ptr %new.entries, ptr %entries.slot
  br label %store
store:
  %active.entries = phi ptr [ %entries, %append ], [ %new.entries, %grow ]
  %entry.bytes = mul i64 %used, 24
  %entry.ptr = getelementptr i8, ptr %active.entries, i64 %entry.bytes
  store i64 1, ptr %entry.ptr
  %key.slot = getelementptr i8, ptr %entry.ptr, i64 8
  store i64 %key, ptr %key.slot
  %value.slot = getelementptr i8, ptr %entry.ptr, i64 16
  store i64 %value, ptr %value.slot
  %next.used = add i64 %used, 1
  store i64 %next.used, ptr %used.slot
  %size = load i64, ptr %collection
  %next.size = add i64 %size, 1
  store i64 %next.size, ptr %collection
  ret void
}
`);
  }
  if (runtime.used.has("collectionGet")) {
    definitions.push(`define i64 @collectionGet(ptr %collection, i64 %key) {
entry:
  %found = call i64 @collectionFind(ptr %collection, i64 %key)
  %has = icmp sge i64 %found, 0
  br i1 %has, label %load, label %missing
load:
  %entries.slot = getelementptr i8, ptr %collection, i64 24
  %entries = load ptr, ptr %entries.slot
  %entry.bytes = mul i64 %found, 24
  %entry.ptr = getelementptr i8, ptr %entries, i64 %entry.bytes
  %value.slot = getelementptr i8, ptr %entry.ptr, i64 16
  %value = load i64, ptr %value.slot
  ret i64 %value
missing:
  ret i64 ${legacyJsValue.immediate("undefined")}
}
`);
  }
  if (runtime.used.has("collectionHas")) {
    definitions.push(`define i1 @collectionHas(ptr %collection, i64 %key) {
entry:
  %found = call i64 @collectionFind(ptr %collection, i64 %key)
  %has = icmp sge i64 %found, 0
  ret i1 %has
}
`);
  }
  if (runtime.used.has("collectionDelete")) {
    definitions.push(`define i1 @collectionDelete(ptr %collection, i64 %key) {
entry:
  %found = call i64 @collectionFind(ptr %collection, i64 %key)
  %has = icmp sge i64 %found, 0
  br i1 %has, label %delete, label %missing
delete:
  %entries.slot = getelementptr i8, ptr %collection, i64 24
  %entries = load ptr, ptr %entries.slot
  %entry.bytes = mul i64 %found, 24
  %entry.ptr = getelementptr i8, ptr %entries, i64 %entry.bytes
  store i64 0, ptr %entry.ptr
  %size = load i64, ptr %collection
  %next.size = sub i64 %size, 1
  store i64 %next.size, ptr %collection
  ret i1 true
missing:
  ret i1 false
}
`);
  }
  if (runtime.used.has("objectNew")) {
    definitions.push(`define ptr @objectNew(i64 %capacity) {
entry:
  %entries.bytes = mul i64 %capacity, 32
  %cell = call ptr @gcAlloc(i64 2, i64 64)
  %object = getelementptr i8, ptr %cell, i64 8
  %entries = call ptr @malloc(i64 %entries.bytes)
  store i64 0, ptr %object
  %capacity.slot = getelementptr i8, ptr %object, i64 8
  store i64 %capacity, ptr %capacity.slot
  %entries.slot = getelementptr i8, ptr %object, i64 16
  store ptr %entries, ptr %entries.slot
  %shape.version.slot = getelementptr i8, ptr %object, i64 24
  store i64 0, ptr %shape.version.slot
  %prototype.slot = getelementptr i8, ptr %object, i64 32
  store ptr null, ptr %prototype.slot
  %flags.slot = getelementptr i8, ptr %object, i64 40
  store i64 1, ptr %flags.slot
  %class.slot = getelementptr i8, ptr %object, i64 48
  store i64 0, ptr %class.slot
  ret ptr %object
}
`);
  }
  if (runtime.used.has("errorNew")) {
    definitions.push(`@.error.key.name = private unnamed_addr constant [5 x i8] c"name\\00"
@.error.key.message = private unnamed_addr constant [8 x i8] c"message\\00"

define ptr @errorNew(i64 %class.id, i64 %name.len, ptr %name.ptr, i64 %message) {
entry:
  %object = call ptr @objectNew(i64 2)
  %class.slot = getelementptr i8, ptr %object, i64 48
  store i64 %class.id, ptr %class.slot
  %name.value = call i64 @valueBoxString(ptr %name.ptr, i64 %name.len)
  call void @objectDefineDataProperty(ptr %object, i64 4, ptr @.error.key.name, i64 %name.value, i64 5)
  call void @objectDefineDataProperty(ptr %object, i64 7, ptr @.error.key.message, i64 %message, i64 5)
  ret ptr %object
}
`);
  }
  if (runtime.used.has("errorToString")) {
    definitions.push(`@.error.tostring.key.name = private unnamed_addr constant [5 x i8] c"name\\00"
@.error.tostring.key.message = private unnamed_addr constant [8 x i8] c"message\\00"

define { ptr, i64 } @errorToString(ptr %object) {
entry:
  %name.value = call i64 @objectGet(ptr %object, i64 4, ptr @.error.tostring.key.name)
  %name.str = call { ptr, i64 } @valueToString(i64 %name.value)
  %name.ptr = extractvalue { ptr, i64 } %name.str, 0
  %name.len = extractvalue { ptr, i64 } %name.str, 1
  %message.value = call i64 @objectGet(ptr %object, i64 7, ptr @.error.tostring.key.message)
  %message.str = call { ptr, i64 } @valueToString(i64 %message.value)
  %message.ptr = extractvalue { ptr, i64 } %message.str, 0
  %message.len = extractvalue { ptr, i64 } %message.str, 1
  %message.empty = icmp eq i64 %message.len, 0
  br i1 %message.empty, label %name.only, label %joined
name.only:
  ret { ptr, i64 } %name.str
joined:
  %prefix.len = add i64 %name.len, 2
  %total = add i64 %prefix.len, %message.len
  %alloc.len = add i64 %total, 1
  %buffer = call ptr @malloc(i64 %alloc.len)
  call ptr @memcpy(ptr %buffer, ptr %name.ptr, i64 %name.len)
  %colon.slot = getelementptr i8, ptr %buffer, i64 %name.len
  store i8 58, ptr %colon.slot
  %space.index = add i64 %name.len, 1
  %space.slot = getelementptr i8, ptr %buffer, i64 %space.index
  store i8 32, ptr %space.slot
  %message.slot = getelementptr i8, ptr %buffer, i64 %prefix.len
  call ptr @memcpy(ptr %message.slot, ptr %message.ptr, i64 %message.len)
  %nul.slot = getelementptr i8, ptr %buffer, i64 %total
  store i8 0, ptr %nul.slot
  %joined.0 = insertvalue { ptr, i64 } undef, ptr %buffer, 0
  %joined.1 = insertvalue { ptr, i64 } %joined.0, i64 %total, 1
  ret { ptr, i64 } %joined.1
}
`);
  }
  if (runtime.used.has("jsonQuote")) {
    definitions.push(`define { ptr, i64 } @jsonQuote(i64 %len, ptr %p) {
entry:
  %worst = mul i64 %len, 6
  %alloc = add i64 %worst, 3
  %out = call ptr @malloc(i64 %alloc)
  store i8 34, ptr %out
  br label %loop
loop:
  %i = phi i64 [ 0, %entry ], [ %i.next, %advance ]
  %o = phi i64 [ 1, %entry ], [ %o.next, %advance ]
  %done = icmp eq i64 %i, %len
  br i1 %done, label %close, label %body
body:
  %c.ptr = getelementptr i8, ptr %p, i64 %i
  %c = load i8, ptr %c.ptr
  switch i8 %c, label %check.control [
    i8 34, label %escape.quote
    i8 92, label %escape.backslash
    i8 10, label %escape.n
    i8 13, label %escape.r
    i8 9, label %escape.t
    i8 8, label %escape.b
    i8 12, label %escape.f
  ]
escape.quote:
  br label %two.char
escape.backslash:
  br label %two.char
escape.n:
  br label %two.char
escape.r:
  br label %two.char
escape.t:
  br label %two.char
escape.b:
  br label %two.char
escape.f:
  br label %two.char
two.char:
  %escaped = phi i8 [ 34, %escape.quote ], [ 92, %escape.backslash ], [ 110, %escape.n ], [ 114, %escape.r ], [ 116, %escape.t ], [ 98, %escape.b ], [ 102, %escape.f ]
  %two.slot = getelementptr i8, ptr %out, i64 %o
  store i8 92, ptr %two.slot
  %two.o1 = add i64 %o, 1
  %two.slot1 = getelementptr i8, ptr %out, i64 %two.o1
  store i8 %escaped, ptr %two.slot1
  %two.o.next = add i64 %o, 2
  br label %advance
check.control:
  %is.control = icmp ult i8 %c, 32
  br i1 %is.control, label %unicode, label %plain
unicode:
  %u.slot0 = getelementptr i8, ptr %out, i64 %o
  store i8 92, ptr %u.slot0
  %u.o1 = add i64 %o, 1
  %u.slot1 = getelementptr i8, ptr %out, i64 %u.o1
  store i8 117, ptr %u.slot1
  %u.o2 = add i64 %o, 2
  %u.slot2 = getelementptr i8, ptr %out, i64 %u.o2
  store i8 48, ptr %u.slot2
  %u.o3 = add i64 %o, 3
  %u.slot3 = getelementptr i8, ptr %out, i64 %u.o3
  store i8 48, ptr %u.slot3
  %hi = lshr i8 %c, 4
  %hi.small = icmp ult i8 %hi, 10
  %hi.digit.base = select i1 %hi.small, i8 48, i8 87
  %hi.digit = add i8 %hi.digit.base, %hi
  %u.o4 = add i64 %o, 4
  %u.slot4 = getelementptr i8, ptr %out, i64 %u.o4
  store i8 %hi.digit, ptr %u.slot4
  %lo = and i8 %c, 15
  %lo.small = icmp ult i8 %lo, 10
  %lo.digit.base = select i1 %lo.small, i8 48, i8 87
  %lo.digit = add i8 %lo.digit.base, %lo
  %u.o5 = add i64 %o, 5
  %u.slot5 = getelementptr i8, ptr %out, i64 %u.o5
  store i8 %lo.digit, ptr %u.slot5
  %u.o.next = add i64 %o, 6
  br label %advance
plain:
  %plain.slot = getelementptr i8, ptr %out, i64 %o
  store i8 %c, ptr %plain.slot
  %plain.o.next = add i64 %o, 1
  br label %advance
advance:
  %o.next = phi i64 [ %two.o.next, %two.char ], [ %u.o.next, %unicode ], [ %plain.o.next, %plain ]
  %i.next = add i64 %i, 1
  br label %loop
close:
  %close.slot = getelementptr i8, ptr %out, i64 %o
  store i8 34, ptr %close.slot
  %total = add i64 %o, 1
  %nul.slot = getelementptr i8, ptr %out, i64 %total
  store i8 0, ptr %nul.slot
  %result.0 = insertvalue { ptr, i64 } undef, ptr %out, 0
  %result.1 = insertvalue { ptr, i64 } %result.0, i64 %total, 1
  ret { ptr, i64 } %result.1
}
`);
  }
  if (runtime.used.has("jsonPad")) {
    definitions.push(`define { ptr, i64 } @jsonPad(i64 %indent, i64 %depth) {
entry:
  %count = mul i64 %indent, %depth
  %alloc = add i64 %count, 1
  %out = call ptr @malloc(i64 %alloc)
  br label %loop
loop:
  %i = phi i64 [ 0, %entry ], [ %next, %body ]
  %done = icmp eq i64 %i, %count
  br i1 %done, label %exit, label %body
body:
  %slot = getelementptr i8, ptr %out, i64 %i
  store i8 32, ptr %slot
  %next = add i64 %i, 1
  br label %loop
exit:
  %nul.slot = getelementptr i8, ptr %out, i64 %count
  store i8 0, ptr %nul.slot
  %result.0 = insertvalue { ptr, i64 } undef, ptr %out, 0
  %result.1 = insertvalue { ptr, i64 } %result.0, i64 %count, 1
  ret { ptr, i64 } %result.1
}
`);
  }
  if (runtime.used.has("jsonFilterHas")) {
    definitions.push(`define i1 @jsonFilterHas(ptr %filter, i64 %key.len, ptr %key.ptr) {
entry:
  %length = call i64 @arrayLength(ptr %filter)
  br label %loop
loop:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %length
  br i1 %done, label %missing, label %body
body:
  %entry.value = call i64 @arrayGet(ptr %filter, i64 %i)
  %tagged = and i64 %entry.value, ${legacyJsValue.tagMask()}
  %is.string = icmp eq i64 %tagged, ${legacyJsValue.referenceTag("string")}
  br i1 %is.string, label %compare.len, label %advance
compare.len:
  %entry.len = call i64 @valueStringLength(i64 %entry.value)
  %same.len = icmp eq i64 %entry.len, %key.len
  br i1 %same.len, label %compare, label %advance
compare:
  %entry.ptr = call ptr @valueStringPtr(i64 %entry.value)
  %cmp = call i32 @memcmp(ptr %entry.ptr, ptr %key.ptr, i64 %key.len)
  %same = icmp eq i32 %cmp, 0
  br i1 %same, label %found, label %advance
found:
  ret i1 true
advance:
  %next = add i64 %i, 1
  br label %loop
missing:
  ret i1 false
}
`);
  }
  if (runtime.used.has("jsonStringifyValue")) {
    definitions.push(`@.json.null = private unnamed_addr constant [5 x i8] c"null\\00"
@.json.true = private unnamed_addr constant [5 x i8] c"true\\00"
@.json.false = private unnamed_addr constant [6 x i8] c"false\\00"
@.json.cycle = private unnamed_addr constant [49 x i8] c"TypeError: Converting circular structure to JSON\\00"
@.json.fmt.number = private unnamed_addr constant [3 x i8] c"%g\\00"

define { ptr, i64 } @jsonStringifyValue(i64 %value, ptr %filter, i64 %indent, i64 %depth) {
entry:
  %too.deep = icmp ugt i64 %depth, 256
  br i1 %too.deep, label %cycle, label %check.undefined
cycle:
  call i32 @puts(ptr @.json.cycle)
  call void @exit(i32 1)
  unreachable
check.undefined:
  %is.undefined = icmp eq i64 %value, ${legacyJsValue.immediate("undefined")}
  br i1 %is.undefined, label %skip, label %check.null
skip:
  %skip.0 = insertvalue { ptr, i64 } undef, ptr null, 0
  %skip.1 = insertvalue { ptr, i64 } %skip.0, i64 0, 1
  ret { ptr, i64 } %skip.1
check.null:
  %is.null = icmp eq i64 %value, ${legacyJsValue.immediate("null")}
  br i1 %is.null, label %null, label %check.true
null:
  %null.0 = insertvalue { ptr, i64 } undef, ptr @.json.null, 0
  %null.1 = insertvalue { ptr, i64 } %null.0, i64 4, 1
  ret { ptr, i64 } %null.1
check.true:
  %is.true = icmp eq i64 %value, ${legacyJsValue.immediate("true")}
  br i1 %is.true, label %true, label %check.false
true:
  %true.0 = insertvalue { ptr, i64 } undef, ptr @.json.true, 0
  %true.1 = insertvalue { ptr, i64 } %true.0, i64 4, 1
  ret { ptr, i64 } %true.1
check.false:
  %is.false = icmp eq i64 %value, ${legacyJsValue.immediate("false")}
  br i1 %is.false, label %false, label %check.string
false:
  %false.0 = insertvalue { ptr, i64 } undef, ptr @.json.false, 0
  %false.1 = insertvalue { ptr, i64 } %false.0, i64 5, 1
  ret { ptr, i64 } %false.1
check.string:
  %tagged = and i64 %value, ${legacyJsValue.tagMask()}
  %is.string = icmp eq i64 %tagged, ${legacyJsValue.referenceTag("string")}
  br i1 %is.string, label %string, label %check.object
string:
  %string.len = call i64 @valueStringLength(i64 %value)
  %string.ptr = call ptr @valueStringPtr(i64 %value)
  %quoted = call { ptr, i64 } @jsonQuote(i64 %string.len, ptr %string.ptr)
  ret { ptr, i64 } %quoted
check.object:
  %is.object = icmp eq i64 %tagged, ${legacyJsValue.referenceTag("object")}
  br i1 %is.object, label %object, label %check.array
object:
  %object.ptr = call ptr @valueObjectPtr(i64 %value)
  %next.depth.obj = add i64 %depth, 1
  %object.json = call { ptr, i64 } @jsonStringifyObject(ptr %object.ptr, ptr %filter, i64 %indent, i64 %next.depth.obj)
  ret { ptr, i64 } %object.json
check.array:
  %is.array = icmp eq i64 %tagged, ${legacyJsValue.referenceTag("array")}
  br i1 %is.array, label %array, label %number
array:
  %array.ptr = call ptr @valueArrayPtr(i64 %value)
  %next.depth.arr = add i64 %depth, 1
  %array.json = call { ptr, i64 } @jsonStringifyArray(ptr %array.ptr, ptr %filter, i64 %indent, i64 %next.depth.arr)
  ret { ptr, i64 } %array.json
number:
  %number.value = call double @valueNumber(i64 %value)
  %is.nan = fcmp uno double %number.value, %number.value
  br i1 %is.nan, label %null, label %check.infinite
check.infinite:
  %abs.bits = and i64 %value, 9223372036854775807
  %is.infinite = icmp eq i64 %abs.bits, 9218868437227405312
  br i1 %is.infinite, label %null, label %finite
finite:
  %buffer = call ptr @malloc(i64 32)
  %written = call i32 (ptr, ptr, ...) @sprintf(ptr %buffer, ptr @.json.fmt.number, double %number.value)
  %written.len = sext i32 %written to i64
  %finite.0 = insertvalue { ptr, i64 } undef, ptr %buffer, 0
  %finite.1 = insertvalue { ptr, i64 } %finite.0, i64 %written.len, 1
  ret { ptr, i64 } %finite.1
}
`);
  }
  if (runtime.used.has("jsonStringifyArray")) {
    definitions.push(`@.json.arr.null = private unnamed_addr constant [5 x i8] c"null\\00"
@.json.arr.open = private unnamed_addr constant [2 x i8] c"[\\00"
@.json.arr.close = private unnamed_addr constant [2 x i8] c"]\\00"
@.json.arr.comma = private unnamed_addr constant [2 x i8] c",\\00"
@.json.arr.newline = private unnamed_addr constant [2 x i8] c"\\0A\\00"

define { ptr, i64 } @jsonStringifyArray(ptr %array, ptr %filter, i64 %indent, i64 %depth) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  %empty = icmp eq i64 %length, 0
  br i1 %empty, label %empty.result, label %setup
empty.result:
  %empty.str = call ptr @strConcat(i64 1, ptr @.json.arr.open, i64 1, ptr @.json.arr.close)
  %empty.0 = insertvalue { ptr, i64 } undef, ptr %empty.str, 0
  %empty.1 = insertvalue { ptr, i64 } %empty.0, i64 2, 1
  ret { ptr, i64 } %empty.1
setup:
  %pretty = icmp ugt i64 %indent, 0
  %pad = call { ptr, i64 } @jsonPad(i64 %indent, i64 %depth)
  %pad.ptr = extractvalue { ptr, i64 } %pad, 0
  %pad.len = extractvalue { ptr, i64 } %pad, 1
  %parent.depth = sub i64 %depth, 1
  %close.pad = call { ptr, i64 } @jsonPad(i64 %indent, i64 %parent.depth)
  %close.pad.ptr = extractvalue { ptr, i64 } %close.pad, 0
  %close.pad.len = extractvalue { ptr, i64 } %close.pad, 1
  br label %loop
loop:
  %i = phi i64 [ 0, %setup ], [ %i.next, %append ]
  %acc.ptr = phi ptr [ @.json.arr.open, %setup ], [ %next.acc.ptr, %append ]
  %acc.len = phi i64 [ 1, %setup ], [ %next.acc.len, %append ]
  %done = icmp eq i64 %i, %length
  br i1 %done, label %finish, label %element
element:
  %elem.value = call i64 @arrayGet(ptr %array, i64 %i)
  %elem.json = call { ptr, i64 } @jsonStringifyValue(i64 %elem.value, ptr %filter, i64 %indent, i64 %depth)
  %elem.ptr.raw = extractvalue { ptr, i64 } %elem.json, 0
  %elem.len.raw = extractvalue { ptr, i64 } %elem.json, 1
  %elem.skipped = icmp eq ptr %elem.ptr.raw, null
  %elem.ptr = select i1 %elem.skipped, ptr @.json.arr.null, ptr %elem.ptr.raw
  %elem.len = select i1 %elem.skipped, i64 4, i64 %elem.len.raw
  %first = icmp eq i64 %i, 0
  br i1 %first, label %separator.done, label %separator
separator:
  %with.comma = call ptr @strConcat(i64 %acc.len, ptr %acc.ptr, i64 1, ptr @.json.arr.comma)
  %with.comma.len = add i64 %acc.len, 1
  br label %separator.done
separator.done:
  %sep.ptr = phi ptr [ %acc.ptr, %element ], [ %with.comma, %separator ]
  %sep.len = phi i64 [ %acc.len, %element ], [ %with.comma.len, %separator ]
  br i1 %pretty, label %pad.element, label %plain.element
pad.element:
  %with.nl = call ptr @strConcat(i64 %sep.len, ptr %sep.ptr, i64 1, ptr @.json.arr.newline)
  %with.nl.len = add i64 %sep.len, 1
  %with.pad = call ptr @strConcat(i64 %with.nl.len, ptr %with.nl, i64 %pad.len, ptr %pad.ptr)
  %with.pad.len = add i64 %with.nl.len, %pad.len
  br label %emit
plain.element:
  br label %emit
emit:
  %emit.ptr = phi ptr [ %with.pad, %pad.element ], [ %sep.ptr, %plain.element ]
  %emit.len = phi i64 [ %with.pad.len, %pad.element ], [ %sep.len, %plain.element ]
  %appended = call ptr @strConcat(i64 %emit.len, ptr %emit.ptr, i64 %elem.len, ptr %elem.ptr)
  %appended.len = add i64 %emit.len, %elem.len
  br label %append
append:
  %next.acc.ptr = phi ptr [ %appended, %emit ]
  %next.acc.len = phi i64 [ %appended.len, %emit ]
  %i.next = add i64 %i, 1
  br label %loop
finish:
  br i1 %pretty, label %finish.pretty, label %finish.plain
finish.pretty:
  %final.nl = call ptr @strConcat(i64 %acc.len, ptr %acc.ptr, i64 1, ptr @.json.arr.newline)
  %final.nl.len = add i64 %acc.len, 1
  %final.pad = call ptr @strConcat(i64 %final.nl.len, ptr %final.nl, i64 %close.pad.len, ptr %close.pad.ptr)
  %final.pad.len = add i64 %final.nl.len, %close.pad.len
  br label %close
finish.plain:
  br label %close
close:
  %close.in.ptr = phi ptr [ %final.pad, %finish.pretty ], [ %acc.ptr, %finish.plain ]
  %close.in.len = phi i64 [ %final.pad.len, %finish.pretty ], [ %acc.len, %finish.plain ]
  %closed = call ptr @strConcat(i64 %close.in.len, ptr %close.in.ptr, i64 1, ptr @.json.arr.close)
  %closed.len = add i64 %close.in.len, 1
  %result.0 = insertvalue { ptr, i64 } undef, ptr %closed, 0
  %result.1 = insertvalue { ptr, i64 } %result.0, i64 %closed.len, 1
  ret { ptr, i64 } %result.1
}
`);
  }
  if (runtime.used.has("jsonStringifyObject")) {
    definitions.push(`@.json.obj.open = private unnamed_addr constant [2 x i8] c"{\\00"
@.json.obj.close = private unnamed_addr constant [2 x i8] c"}\\00"
@.json.obj.comma = private unnamed_addr constant [2 x i8] c",\\00"
@.json.obj.newline = private unnamed_addr constant [2 x i8] c"\\0A\\00"
@.json.obj.colon = private unnamed_addr constant [2 x i8] c":\\00"
@.json.obj.colon.space = private unnamed_addr constant [3 x i8] c": \\00"

define { ptr, i64 } @jsonStringifyObject(ptr %object, ptr %filter, i64 %indent, i64 %depth) {
entry:
  %count = load i64, ptr %object
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  %pretty = icmp ugt i64 %indent, 0
  %pad = call { ptr, i64 } @jsonPad(i64 %indent, i64 %depth)
  %pad.ptr = extractvalue { ptr, i64 } %pad, 0
  %pad.len = extractvalue { ptr, i64 } %pad, 1
  %parent.depth = sub i64 %depth, 1
  %close.pad = call { ptr, i64 } @jsonPad(i64 %indent, i64 %parent.depth)
  %close.pad.ptr = extractvalue { ptr, i64 } %close.pad, 0
  %close.pad.len = extractvalue { ptr, i64 } %close.pad, 1
  br label %loop
loop:
  %i = phi i64 [ 0, %entry ], [ %i.next, %advance ]
  %acc.ptr = phi ptr [ @.json.obj.open, %entry ], [ %next.acc.ptr, %advance ]
  %acc.len = phi i64 [ 1, %entry ], [ %next.acc.len, %advance ]
  %emitted = phi i64 [ 0, %entry ], [ %next.emitted, %advance ]
  %done = icmp eq i64 %i, %count
  br i1 %done, label %finish, label %body
body:
  %entry.bytes = mul i64 %i, 32
  %entry.ptr = getelementptr i8, ptr %entries, i64 %entry.bytes
  %descriptor.slot = getelementptr i8, ptr %entry.ptr, i64 24
  %descriptor = load i64, ptr %descriptor.slot
  %enumerable.bit = and i64 %descriptor, 2
  %is.enumerable = icmp ne i64 %enumerable.bit, 0
  br i1 %is.enumerable, label %check.filter, label %skip
check.filter:
  %key.len = load i64, ptr %entry.ptr
  %key.slot = getelementptr i8, ptr %entry.ptr, i64 8
  %key.ptr = load ptr, ptr %key.slot
  %no.filter = icmp eq ptr %filter, null
  br i1 %no.filter, label %stringify, label %filter.check
filter.check:
  %in.filter = call i1 @jsonFilterHas(ptr %filter, i64 %key.len, ptr %key.ptr)
  br i1 %in.filter, label %stringify, label %skip
stringify:
  %value.slot = getelementptr i8, ptr %entry.ptr, i64 16
  %entry.value = load i64, ptr %value.slot
  %value.json = call { ptr, i64 } @jsonStringifyValue(i64 %entry.value, ptr %filter, i64 %indent, i64 %depth)
  %value.ptr = extractvalue { ptr, i64 } %value.json, 0
  %value.len = extractvalue { ptr, i64 } %value.json, 1
  %value.skipped = icmp eq ptr %value.ptr, null
  br i1 %value.skipped, label %skip, label %emit.pair
emit.pair:
  %first = icmp eq i64 %emitted, 0
  br i1 %first, label %separator.done, label %separator
separator:
  %with.comma = call ptr @strConcat(i64 %acc.len, ptr %acc.ptr, i64 1, ptr @.json.obj.comma)
  %with.comma.len = add i64 %acc.len, 1
  br label %separator.done
separator.done:
  %sep.ptr = phi ptr [ %acc.ptr, %emit.pair ], [ %with.comma, %separator ]
  %sep.len = phi i64 [ %acc.len, %emit.pair ], [ %with.comma.len, %separator ]
  br i1 %pretty, label %pad.pair, label %plain.pair
pad.pair:
  %with.nl = call ptr @strConcat(i64 %sep.len, ptr %sep.ptr, i64 1, ptr @.json.obj.newline)
  %with.nl.len = add i64 %sep.len, 1
  %with.pad = call ptr @strConcat(i64 %with.nl.len, ptr %with.nl, i64 %pad.len, ptr %pad.ptr)
  %with.pad.len = add i64 %with.nl.len, %pad.len
  br label %emit.key
plain.pair:
  br label %emit.key
emit.key:
  %base.ptr = phi ptr [ %with.pad, %pad.pair ], [ %sep.ptr, %plain.pair ]
  %base.len = phi i64 [ %with.pad.len, %pad.pair ], [ %sep.len, %plain.pair ]
  %quoted.key = call { ptr, i64 } @jsonQuote(i64 %key.len, ptr %key.ptr)
  %quoted.key.ptr = extractvalue { ptr, i64 } %quoted.key, 0
  %quoted.key.len = extractvalue { ptr, i64 } %quoted.key, 1
  %with.key = call ptr @strConcat(i64 %base.len, ptr %base.ptr, i64 %quoted.key.len, ptr %quoted.key.ptr)
  %with.key.len = add i64 %base.len, %quoted.key.len
  %colon.ptr = select i1 %pretty, ptr @.json.obj.colon.space, ptr @.json.obj.colon
  %colon.len = select i1 %pretty, i64 2, i64 1
  %with.colon = call ptr @strConcat(i64 %with.key.len, ptr %with.key, i64 %colon.len, ptr %colon.ptr)
  %with.colon.len = add i64 %with.key.len, %colon.len
  %with.value = call ptr @strConcat(i64 %with.colon.len, ptr %with.colon, i64 %value.len, ptr %value.ptr)
  %with.value.len = add i64 %with.colon.len, %value.len
  br label %advance
skip:
  br label %advance
advance:
  %next.acc.ptr = phi ptr [ %with.value, %emit.key ], [ %acc.ptr, %skip ]
  %next.acc.len = phi i64 [ %with.value.len, %emit.key ], [ %acc.len, %skip ]
  %emitted.increment = phi i64 [ 1, %emit.key ], [ 0, %skip ]
  %next.emitted = add i64 %emitted, %emitted.increment
  %i.next = add i64 %i, 1
  br label %loop
finish:
  %has.pairs = icmp ugt i64 %emitted, 0
  %wants.pretty.close = and i1 %pretty, %has.pairs
  br i1 %wants.pretty.close, label %finish.pretty, label %finish.plain
finish.pretty:
  %final.nl = call ptr @strConcat(i64 %acc.len, ptr %acc.ptr, i64 1, ptr @.json.obj.newline)
  %final.nl.len = add i64 %acc.len, 1
  %final.pad = call ptr @strConcat(i64 %final.nl.len, ptr %final.nl, i64 %close.pad.len, ptr %close.pad.ptr)
  %final.pad.len = add i64 %final.nl.len, %close.pad.len
  br label %close
finish.plain:
  br label %close
close:
  %close.in.ptr = phi ptr [ %final.pad, %finish.pretty ], [ %acc.ptr, %finish.plain ]
  %close.in.len = phi i64 [ %final.pad.len, %finish.pretty ], [ %acc.len, %finish.plain ]
  %closed = call ptr @strConcat(i64 %close.in.len, ptr %close.in.ptr, i64 1, ptr @.json.obj.close)
  %closed.len = add i64 %close.in.len, 1
  %result.0 = insertvalue { ptr, i64 } undef, ptr %closed, 0
  %result.1 = insertvalue { ptr, i64 } %result.0, i64 %closed.len, 1
  ret { ptr, i64 } %result.1
}
`);
  }
  if (runtime.used.has("jsonStringify")) {
    definitions.push(`define i64 @jsonStringify(i64 %value, ptr %filter, i64 %indent) {
entry:
  %json = call { ptr, i64 } @jsonStringifyValue(i64 %value, ptr %filter, i64 %indent, i64 0)
  %json.ptr = extractvalue { ptr, i64 } %json, 0
  %json.len = extractvalue { ptr, i64 } %json, 1
  %skipped = icmp eq ptr %json.ptr, null
  br i1 %skipped, label %undefined, label %boxed
undefined:
  ret i64 ${legacyJsValue.immediate("undefined")}
boxed:
  %result = call i64 @valueBoxString(ptr %json.ptr, i64 %json.len)
  ret i64 %result
}
`);
  }
  if (runtime.used.has("objectCreate")) {
    definitions.push(`define ptr @objectCreate(ptr %prototype) {
entry:
  %object = call ptr @objectNew(i64 0)
  %prototype.slot = getelementptr i8, ptr %object, i64 32
  store ptr %prototype, ptr %prototype.slot
  ret ptr %object
}
`);
  }
  if (runtime.used.has("objectGetOwn")) {
    definitions.push(`define { i64, i64 } @objectGetOwn(ptr %object, i64 %key.len, ptr %key.ptr) {
entry:
  %count = load i64, ptr %object
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %count
  br i1 %done, label %missing, label %check
check:
  %entry.bytes = mul i64 %i, 32
  %entry.ptr = getelementptr i8, ptr %entries, i64 %entry.bytes
  %stored.len = load i64, ptr %entry.ptr
  %same.len = icmp eq i64 %stored.len, %key.len
  br i1 %same.len, label %compare, label %advance
compare:
  %key.slot = getelementptr i8, ptr %entry.ptr, i64 8
  %stored.key = load ptr, ptr %key.slot
  %cmp = call i32 @memcmp(ptr %stored.key, ptr %key.ptr, i64 %key.len)
  %same.key = icmp eq i32 %cmp, 0
  br i1 %same.key, label %found, label %advance
found:
  %value.slot = getelementptr i8, ptr %entry.ptr, i64 16
  %value = load i64, ptr %value.slot
  %found.0 = insertvalue { i64, i64 } undef, i64 1, 0
  %found.1 = insertvalue { i64, i64 } %found.0, i64 %value, 1
  ret { i64, i64 } %found.1
advance:
  %next = add i64 %i, 1
  br label %scan
missing:
  %missing.0 = insertvalue { i64, i64 } undef, i64 0, 0
  %missing.1 = insertvalue { i64, i64 } %missing.0, i64 ${legacyJsValue.immediate("undefined")}, 1
  ret { i64, i64 } %missing.1
}
`);
  }
  if (runtime.used.has("objectGet")) {
    definitions.push(`define i64 @objectGet(ptr %object, i64 %key.len, ptr %key.ptr) {
entry:
  br label %lookup
lookup:
  %current = phi ptr [ %object, %entry ], [ %prototype, %advance.prototype ]
  %own = call { i64, i64 } @objectGetOwn(ptr %current, i64 %key.len, ptr %key.ptr)
  %found = extractvalue { i64, i64 } %own, 0
  %value = extractvalue { i64, i64 } %own, 1
  %has.own = icmp ne i64 %found, 0
  br i1 %has.own, label %own.found, label %check.prototype
own.found:
  ret i64 %value
check.prototype:
  %prototype.slot = getelementptr i8, ptr %current, i64 32
  %prototype = load ptr, ptr %prototype.slot
  %has.prototype = icmp ne ptr %prototype, null
  br i1 %has.prototype, label %advance.prototype, label %missing
advance.prototype:
  br label %lookup
missing:
  ret i64 ${legacyJsValue.immediate("undefined")}
}
`);
  }
  if (runtime.used.has("objectHasOwn")) {
    definitions.push(`define i1 @objectHasOwn(ptr %object, i64 %key.len, ptr %key.ptr) {
entry:
  %own = call { i64, i64 } @objectGetOwn(ptr %object, i64 %key.len, ptr %key.ptr)
  %found = extractvalue { i64, i64 } %own, 0
  %has.own = icmp ne i64 %found, 0
  ret i1 %has.own
}
`);
  }
  if (runtime.used.has("objectHas")) {
    definitions.push(`define i1 @objectHas(ptr %object, i64 %key.len, ptr %key.ptr) {
entry:
  br label %lookup
lookup:
  %current = phi ptr [ %object, %entry ], [ %prototype, %advance.prototype ]
  %has.own = call i1 @objectHasOwn(ptr %current, i64 %key.len, ptr %key.ptr)
  br i1 %has.own, label %found, label %check.prototype
found:
  ret i1 true
check.prototype:
  %prototype.slot = getelementptr i8, ptr %current, i64 32
  %prototype = load ptr, ptr %prototype.slot
  %has.prototype = icmp ne ptr %prototype, null
  br i1 %has.prototype, label %advance.prototype, label %missing
advance.prototype:
  br label %lookup
missing:
  ret i1 false
}
`);
  }
  if (runtime.used.has("objectSetPrototype")) {
    definitions.push(`define void @objectSetPrototype(ptr %object, ptr %prototype) {
entry:
  %is.null = icmp eq ptr %prototype, null
  br i1 %is.null, label %store, label %check.cycle
check.cycle:
  %cycle = call i1 @objectWouldCreateCycle(ptr %object, ptr %prototype)
  br i1 %cycle, label %exit, label %store
store:
  %prototype.slot = getelementptr i8, ptr %object, i64 32
  store ptr %prototype, ptr %prototype.slot
  ret void
exit:
  ret void
}
`);
  }
  if (runtime.used.has("objectWouldCreateCycle")) {
    definitions.push(`define i1 @objectWouldCreateCycle(ptr %object, ptr %prototype) {
entry:
  br label %lookup
lookup:
  %current = phi ptr [ %prototype, %entry ], [ %next, %advance ]
  %is.object = icmp eq ptr %current, %object
  br i1 %is.object, label %cycle, label %check.next
check.next:
  %prototype.slot = getelementptr i8, ptr %current, i64 32
  %next = load ptr, ptr %prototype.slot
  %has.next = icmp ne ptr %next, null
  br i1 %has.next, label %advance, label %ok
advance:
  br label %lookup
cycle:
  ret i1 true
ok:
  ret i1 false
}
`);
  }
  if (runtime.used.has("objectGetPrototype")) {
    definitions.push(`define ptr @objectGetPrototype(ptr %object) {
entry:
  %prototype.slot = getelementptr i8, ptr %object, i64 32
  %prototype = load ptr, ptr %prototype.slot
  ret ptr %prototype
}
`);
  }
  if (runtime.used.has("jsInstanceOf")) {
    definitions.push(`define i1 @jsInstanceOf(i64 %value, ptr %target.prototype) {
entry:
  %is.object = call i1 @valueIsObject(i64 %value)
  br i1 %is.object, label %start, label %missing
start:
  %object = call ptr @valueObjectPtr(i64 %value)
  %first = call ptr @objectGetPrototype(ptr %object)
  br label %lookup
lookup:
  %current = phi ptr [ %first, %start ], [ %next, %advance ]
  %is.null = icmp eq ptr %current, null
  br i1 %is.null, label %missing, label %compare
compare:
  %matches = icmp eq ptr %current, %target.prototype
  br i1 %matches, label %found, label %advance
advance:
  %next = call ptr @objectGetPrototype(ptr %current)
  br label %lookup
found:
  ret i1 true
missing:
  ret i1 false
}
`);
  }
  if (runtime.used.has("objectPreventExtensions")) {
    definitions.push(`define void @objectPreventExtensions(ptr %object) {
entry:
  %flags.slot = getelementptr i8, ptr %object, i64 40
  %flags = load i64, ptr %flags.slot
  %next.flags = and i64 %flags, -2
  store i64 %next.flags, ptr %flags.slot
  ret void
}
`);
  }
  if (runtime.used.has("objectIsExtensible")) {
    definitions.push(`define i1 @objectIsExtensible(ptr %object) {
entry:
  %ext.flags.slot = getelementptr i8, ptr %object, i64 40
  %ext.flags = load i64, ptr %ext.flags.slot
  %extensible.bit = and i64 %ext.flags, 1
  %is.extensible = icmp ne i64 %extensible.bit, 0
  ret i1 %is.extensible
}
`);
  }
  if (runtime.used.has("objectSeal")) {
    definitions.push(`define void @objectSeal(ptr %object) {
entry:
  call void @objectPreventExtensions(ptr %object)
  %count = load i64, ptr %object
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %count
  br i1 %done, label %exit, label %check
check:
  %entry.bytes = mul i64 %i, 32
  %entry.ptr = getelementptr i8, ptr %entries, i64 %entry.bytes
  %stored.len = load i64, ptr %entry.ptr
  %active = icmp sge i64 %stored.len, 0
  br i1 %active, label %clear, label %advance
clear:
  %descriptor.slot = getelementptr i8, ptr %entry.ptr, i64 24
  %descriptor = load i64, ptr %descriptor.slot
  %sealed = and i64 %descriptor, -5
  store i64 %sealed, ptr %descriptor.slot
  br label %advance
advance:
  %next = add i64 %i, 1
  br label %scan
exit:
  ret void
}
`);
  }
  if (runtime.used.has("objectFreeze")) {
    definitions.push(`define void @objectFreeze(ptr %object) {
entry:
  call void @objectSeal(ptr %object)
  %count = load i64, ptr %object
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %count
  br i1 %done, label %exit, label %check
check:
  %entry.bytes = mul i64 %i, 32
  %entry.ptr = getelementptr i8, ptr %entries, i64 %entry.bytes
  %stored.len = load i64, ptr %entry.ptr
  %active = icmp sge i64 %stored.len, 0
  br i1 %active, label %clear, label %advance
clear:
  %descriptor.slot = getelementptr i8, ptr %entry.ptr, i64 24
  %descriptor = load i64, ptr %descriptor.slot
  %frozen = and i64 %descriptor, -2
  store i64 %frozen, ptr %descriptor.slot
  br label %advance
advance:
  %next = add i64 %i, 1
  br label %scan
exit:
  ret void
}
`);
  }
  if (runtime.used.has("objectIsSealed")) {
    definitions.push(`define i1 @objectIsSealed(ptr %object) {
entry:
  %is.extensible = call i1 @objectIsExtensible(ptr %object)
  br i1 %is.extensible, label %no, label %scan.entry
scan.entry:
  %count = load i64, ptr %object
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  br label %scan
scan:
  %i = phi i64 [ 0, %scan.entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %count
  br i1 %done, label %yes, label %check
check:
  %entry.bytes = mul i64 %i, 32
  %entry.ptr = getelementptr i8, ptr %entries, i64 %entry.bytes
  %stored.len = load i64, ptr %entry.ptr
  %active = icmp sge i64 %stored.len, 0
  br i1 %active, label %descriptor.block, label %advance
descriptor.block:
  %descriptor.slot = getelementptr i8, ptr %entry.ptr, i64 24
  %descriptor = load i64, ptr %descriptor.slot
  %configurable.bit = and i64 %descriptor, 4
  %configurable = icmp ne i64 %configurable.bit, 0
  br i1 %configurable, label %no, label %advance
advance:
  %next = add i64 %i, 1
  br label %scan
yes:
  ret i1 true
no:
  ret i1 false
}
`);
  }
  if (runtime.used.has("objectIsFrozen")) {
    definitions.push(`define i1 @objectIsFrozen(ptr %object) {
entry:
  %sealed = call i1 @objectIsSealed(ptr %object)
  br i1 %sealed, label %scan.entry, label %no
scan.entry:
  %count = load i64, ptr %object
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  br label %scan
scan:
  %i = phi i64 [ 0, %scan.entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %count
  br i1 %done, label %yes, label %check
check:
  %entry.bytes = mul i64 %i, 32
  %entry.ptr = getelementptr i8, ptr %entries, i64 %entry.bytes
  %stored.len = load i64, ptr %entry.ptr
  %active = icmp sge i64 %stored.len, 0
  br i1 %active, label %descriptor.block, label %advance
descriptor.block:
  %descriptor.slot = getelementptr i8, ptr %entry.ptr, i64 24
  %descriptor = load i64, ptr %descriptor.slot
  %writable.bit = and i64 %descriptor, 1
  %writable = icmp ne i64 %writable.bit, 0
  br i1 %writable, label %no, label %advance
advance:
  %next = add i64 %i, 1
  br label %scan
yes:
  ret i1 true
no:
  ret i1 false
}
`);
  }
  if (runtime.used.has("objectDefineDataProperty")) {
    definitions.push(`define void @objectDefineDataProperty(ptr %object, i64 %key.len, ptr %key.ptr, i64 %value, i64 %flags) {
entry:
  %count = load i64, ptr %object
  %capacity.slot = getelementptr i8, ptr %object, i64 8
  %capacity = load i64, ptr %capacity.slot
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %count
  br i1 %done, label %ensure.capacity, label %check
check:
  %entry.bytes = mul i64 %i, 32
  %entry.ptr = getelementptr i8, ptr %entries, i64 %entry.bytes
  %stored.len = load i64, ptr %entry.ptr
  %same.len = icmp eq i64 %stored.len, %key.len
  br i1 %same.len, label %compare, label %advance
compare:
  %key.slot = getelementptr i8, ptr %entry.ptr, i64 8
  %stored.key = load ptr, ptr %key.slot
  %cmp = call i32 @memcmp(ptr %stored.key, ptr %key.ptr, i64 %key.len)
  %same.key = icmp eq i32 %cmp, 0
  br i1 %same.key, label %replace, label %advance
replace:
  %descriptor.slot = getelementptr i8, ptr %entry.ptr, i64 24
  %descriptor = load i64, ptr %descriptor.slot
  %configurable.bit = and i64 %descriptor, 4
  %is.configurable = icmp ne i64 %configurable.bit, 0
  br i1 %is.configurable, label %replace.configurable, label %exit
replace.configurable:
  %replace.value.slot = getelementptr i8, ptr %entry.ptr, i64 16
  store i64 %value, ptr %replace.value.slot
  store i64 %flags, ptr %descriptor.slot
  ret void
advance:
  %next = add i64 %i, 1
  br label %scan
ensure.capacity:
  %object.flags.slot = getelementptr i8, ptr %object, i64 40
  %object.flags = load i64, ptr %object.flags.slot
  %extensible.bit = and i64 %object.flags, 1
  %is.extensible = icmp ne i64 %extensible.bit, 0
  br i1 %is.extensible, label %ensure.capacity.extensible, label %exit
ensure.capacity.extensible:
  %has.capacity = icmp ult i64 %count, %capacity
  br i1 %has.capacity, label %append, label %grow
grow:
  %capacity.zero = icmp eq i64 %capacity, 0
  br i1 %capacity.zero, label %grow.empty, label %grow.double
grow.empty:
  br label %grow.copy
grow.double:
  %double.capacity = mul i64 %capacity, 2
  br label %grow.copy
grow.copy:
  %next.capacity = phi i64 [ 1, %grow.empty ], [ %double.capacity, %grow.double ]
  %new.entries.bytes = mul i64 %next.capacity, 32
  %new.entries = call ptr @malloc(i64 %new.entries.bytes)
  %old.entries.bytes = mul i64 %count, 32
  call ptr @memcpy(ptr %new.entries, ptr %entries, i64 %old.entries.bytes)
  store i64 %next.capacity, ptr %capacity.slot
  store ptr %new.entries, ptr %entries.slot
  br label %append
append:
  %append.entries = phi ptr [ %entries, %ensure.capacity.extensible ], [ %new.entries, %grow.copy ]
  %append.bytes = mul i64 %count, 32
  %append.ptr = getelementptr i8, ptr %append.entries, i64 %append.bytes
  store i64 %key.len, ptr %append.ptr
  %append.key.slot = getelementptr i8, ptr %append.ptr, i64 8
  store ptr %key.ptr, ptr %append.key.slot
  %append.value.slot = getelementptr i8, ptr %append.ptr, i64 16
  store i64 %value, ptr %append.value.slot
  %append.descriptor.slot = getelementptr i8, ptr %append.ptr, i64 24
  store i64 %flags, ptr %append.descriptor.slot
  %next.count = add i64 %count, 1
  store i64 %next.count, ptr %object
  %shape.version.slot = getelementptr i8, ptr %object, i64 24
  %shape.version = load i64, ptr %shape.version.slot
  %next.shape.version = add i64 %shape.version, 1
  store i64 %next.shape.version, ptr %shape.version.slot
  ret void
exit:
  ret void
}
`);
  }
  if (runtime.used.has("objectSet")) {
    definitions.push(`define void @objectSet(ptr %object, i64 %key.len, ptr %key.ptr, i64 %value) {
entry:
  %count = load i64, ptr %object
  %capacity.slot = getelementptr i8, ptr %object, i64 8
  %capacity = load i64, ptr %capacity.slot
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %count
  br i1 %done, label %ensure.capacity, label %check
check:
  %entry.bytes = mul i64 %i, 32
  %entry.ptr = getelementptr i8, ptr %entries, i64 %entry.bytes
  %stored.len = load i64, ptr %entry.ptr
  %same.len = icmp eq i64 %stored.len, %key.len
  br i1 %same.len, label %compare, label %advance
compare:
  %key.slot = getelementptr i8, ptr %entry.ptr, i64 8
  %stored.key = load ptr, ptr %key.slot
  %cmp = call i32 @memcmp(ptr %stored.key, ptr %key.ptr, i64 %key.len)
  %same.key = icmp eq i32 %cmp, 0
  br i1 %same.key, label %replace, label %advance
replace:
  %descriptor.slot = getelementptr i8, ptr %entry.ptr, i64 24
  %descriptor = load i64, ptr %descriptor.slot
  %writable.bit = and i64 %descriptor, 1
  %is.writable = icmp ne i64 %writable.bit, 0
  br i1 %is.writable, label %replace.writable, label %exit
replace.writable:
  %replace.value.slot = getelementptr i8, ptr %entry.ptr, i64 16
  store i64 %value, ptr %replace.value.slot
  ret void
advance:
  %next = add i64 %i, 1
  br label %scan
ensure.capacity:
  %flags.slot = getelementptr i8, ptr %object, i64 40
  %flags = load i64, ptr %flags.slot
  %extensible.bit = and i64 %flags, 1
  %is.extensible = icmp ne i64 %extensible.bit, 0
  br i1 %is.extensible, label %ensure.capacity.extensible, label %exit
ensure.capacity.extensible:
  %has.capacity = icmp ult i64 %count, %capacity
  br i1 %has.capacity, label %append, label %grow
grow:
  %capacity.zero = icmp eq i64 %capacity, 0
  br i1 %capacity.zero, label %grow.empty, label %grow.double
grow.empty:
  br label %grow.copy
grow.double:
  %double.capacity = mul i64 %capacity, 2
  br label %grow.copy
grow.copy:
  %next.capacity = phi i64 [ 1, %grow.empty ], [ %double.capacity, %grow.double ]
  %new.entries.bytes = mul i64 %next.capacity, 32
  %new.entries = call ptr @malloc(i64 %new.entries.bytes)
  %old.entries.bytes = mul i64 %count, 32
  call ptr @memcpy(ptr %new.entries, ptr %entries, i64 %old.entries.bytes)
  store i64 %next.capacity, ptr %capacity.slot
  store ptr %new.entries, ptr %entries.slot
  br label %append
append:
  %append.entries = phi ptr [ %entries, %ensure.capacity.extensible ], [ %new.entries, %grow.copy ]
  %append.bytes = mul i64 %count, 32
  %append.ptr = getelementptr i8, ptr %append.entries, i64 %append.bytes
  store i64 %key.len, ptr %append.ptr
  %append.key.slot = getelementptr i8, ptr %append.ptr, i64 8
  store ptr %key.ptr, ptr %append.key.slot
  %append.value.slot = getelementptr i8, ptr %append.ptr, i64 16
  store i64 %value, ptr %append.value.slot
  %append.descriptor.slot = getelementptr i8, ptr %append.ptr, i64 24
  store i64 7, ptr %append.descriptor.slot
  %next.count = add i64 %count, 1
  store i64 %next.count, ptr %object
  %shape.version.slot = getelementptr i8, ptr %object, i64 24
  %shape.version = load i64, ptr %shape.version.slot
  %next.shape.version = add i64 %shape.version, 1
  store i64 %next.shape.version, ptr %shape.version.slot
  ret void
exit:
  ret void
}
`);
  }
  if (runtime.used.has("objectDelete")) {
    definitions.push(`define void @objectDelete(ptr %object, i64 %key.len, ptr %key.ptr) {
entry:
  %count = load i64, ptr %object
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %count
  br i1 %done, label %exit, label %check
check:
  %entry.bytes = mul i64 %i, 32
  %entry.ptr = getelementptr i8, ptr %entries, i64 %entry.bytes
  %stored.len = load i64, ptr %entry.ptr
  %same.len = icmp eq i64 %stored.len, %key.len
  br i1 %same.len, label %compare, label %advance
compare:
  %key.slot = getelementptr i8, ptr %entry.ptr, i64 8
  %stored.key = load ptr, ptr %key.slot
  %cmp = call i32 @memcmp(ptr %stored.key, ptr %key.ptr, i64 %key.len)
  %same.key = icmp eq i32 %cmp, 0
  br i1 %same.key, label %delete, label %advance
delete:
  %descriptor.slot = getelementptr i8, ptr %entry.ptr, i64 24
  %descriptor = load i64, ptr %descriptor.slot
  %configurable.bit = and i64 %descriptor, 4
  %is.configurable = icmp ne i64 %configurable.bit, 0
  br i1 %is.configurable, label %delete.configurable, label %exit
delete.configurable:
  store i64 -1, ptr %entry.ptr
  %shape.version.slot = getelementptr i8, ptr %object, i64 24
  %shape.version = load i64, ptr %shape.version.slot
  %next.shape.version = add i64 %shape.version, 1
  store i64 %next.shape.version, ptr %shape.version.slot
  ret void
advance:
  %next = add i64 %i, 1
  br label %scan
exit:
  ret void
}
`);
  }
  if (runtime.used.has("boxedValueOf")) {
    definitions.push(`define i64 @boxedValueOf(ptr %object) {
entry:
  %count = load i64, ptr %object
  %is.empty = icmp eq i64 %count, 0
  br i1 %is.empty, label %miss, label %load
load:
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  %value.slot = getelementptr i8, ptr %entries, i64 16
  %value = load i64, ptr %value.slot
  ret i64 %value
miss:
  ret i64 ${legacyJsValue.immediate("undefined")}
}
`);
  }
  if (runtime.used.has("boxedToString")) {
    definitions.push(`define { ptr, i64 } @boxedToString(ptr %object) {
entry:
  %count = load i64, ptr %object
  %is.empty = icmp eq i64 %count, 0
  br i1 %is.empty, label %miss, label %load
load:
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  %value.slot = getelementptr i8, ptr %entries, i64 16
  %value = load i64, ptr %value.slot
  %raw = call { ptr, i64 } @valueToString(i64 %value)
  ret { ptr, i64 } %raw
miss:
  ret { ptr, i64 } { ptr null, i64 0 }
}
`);
  }
  if (runtime.used.has("objectAssign")) {
    definitions.push(`define void @objectAssign(ptr %target, ptr %source) {
entry:
  %count = load i64, ptr %source
  %entries.slot = getelementptr i8, ptr %source, i64 16
  %entries = load ptr, ptr %entries.slot
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %count
  br i1 %done, label %exit, label %check
check:
  %entry.bytes = mul i64 %i, 32
  %entry.ptr = getelementptr i8, ptr %entries, i64 %entry.bytes
  %stored.len = load i64, ptr %entry.ptr
  %active = icmp sge i64 %stored.len, 0
  br i1 %active, label %descriptor.block, label %advance
descriptor.block:
  %descriptor.slot = getelementptr i8, ptr %entry.ptr, i64 24
  %descriptor = load i64, ptr %descriptor.slot
  %enumerable.bit = and i64 %descriptor, 2
  %enumerable = icmp ne i64 %enumerable.bit, 0
  br i1 %enumerable, label %copy, label %advance
copy:
  %key.slot = getelementptr i8, ptr %entry.ptr, i64 8
  %key.ptr = load ptr, ptr %key.slot
  %value.slot = getelementptr i8, ptr %entry.ptr, i64 16
  %value = load i64, ptr %value.slot
  call void @objectSet(ptr %target, i64 %stored.len, ptr %key.ptr, i64 %value)
  br label %advance
advance:
  %next = add i64 %i, 1
  br label %scan
exit:
  ret void
}
`);
  }
  if (runtime.used.has("objectAssignArray")) {
    definitions.push(`define void @objectAssignArray(ptr %target, ptr %source) {
entry:
  %length = call i64 @arrayLength(ptr %source)
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %length
  br i1 %done, label %named, label %check
check:
  %has = call i1 @arrayHasOwnIndex(ptr %source, i64 %i)
  br i1 %has, label %copy, label %advance
copy:
  %key.ptr = call ptr @indexToString(i64 %i)
  br label %digit.count
digit.count:
  %digit.value = phi i64 [ %i, %copy ], [ %digit.next.value, %digit.more ]
  %digit.len = phi i64 [ 1, %copy ], [ %digit.len.next, %digit.more ]
  %digit.more.check = icmp uge i64 %digit.value, 10
  br i1 %digit.more.check, label %digit.more, label %store
digit.more:
  %digit.next.value = udiv i64 %digit.value, 10
  %digit.len.next = add i64 %digit.len, 1
  br label %digit.count
store:
  %value = call i64 @arrayGet(ptr %source, i64 %i)
  call void @objectSet(ptr %target, i64 %digit.len, ptr %key.ptr, i64 %value)
  br label %advance
advance:
  %next = add i64 %i, 1
  br label %scan
named:
  %properties.slot = getelementptr i8, ptr %source, i64 32
  %properties = load ptr, ptr %properties.slot
  call void @objectAssign(ptr %target, ptr %properties)
  ret void
}
`);
  }
  if (runtime.used.has("valueObjectAssign")) {
    definitions.push(`define void @valueObjectAssign(ptr %target, i64 %source) {
entry:
  %tag = and i64 %source, ${legacyJsValue.tagMask()}
  %is.object = icmp eq i64 %tag, ${legacyJsValue.referenceTag("object")}
  br i1 %is.object, label %object, label %check.array
object:
  %object.ptr = call ptr @valueObjectPtr(i64 %source)
  call void @objectAssign(ptr %target, ptr %object.ptr)
  ret void
check.array:
  %is.array = icmp eq i64 %tag, ${legacyJsValue.referenceTag("array")}
  br i1 %is.array, label %array, label %exit
array:
  %array.ptr = call ptr @valueArrayPtr(i64 %source)
  call void @objectAssignArray(ptr %target, ptr %array.ptr)
  ret void
exit:
  ret void
}
`);
  }
  if (runtime.used.has("objectValues")) {
    definitions.push(`define ptr @objectValues(ptr %object) {
entry:
  %count = load i64, ptr %object
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  br label %count.scan
count.scan:
  %count.i = phi i64 [ 0, %entry ], [ %count.next, %count.advance ]
  %value.count = phi i64 [ 0, %entry ], [ %value.count.next, %count.advance ]
  %count.done = icmp eq i64 %count.i, %count
  br i1 %count.done, label %alloc, label %count.check
count.check:
  %count.entry.bytes = mul i64 %count.i, 32
  %count.entry.ptr = getelementptr i8, ptr %entries, i64 %count.entry.bytes
  %count.stored.len = load i64, ptr %count.entry.ptr
  %count.active = icmp sge i64 %count.stored.len, 0
  br i1 %count.active, label %count.descriptor.block, label %count.skip
count.descriptor.block:
  %count.descriptor.slot = getelementptr i8, ptr %count.entry.ptr, i64 24
  %count.descriptor = load i64, ptr %count.descriptor.slot
  %count.enumerable.bit = and i64 %count.descriptor, 2
  %count.enumerable = icmp ne i64 %count.enumerable.bit, 0
  br i1 %count.enumerable, label %count.include, label %count.skip
count.include:
  %included.count = add i64 %value.count, 1
  br label %count.advance
count.skip:
  br label %count.advance
count.advance:
  %value.count.next = phi i64 [ %included.count, %count.include ], [ %value.count, %count.skip ]
  %count.next = add i64 %count.i, 1
  br label %count.scan
alloc:
  %array = call ptr @arrayNew(i64 %value.count)
  br label %fill.scan
fill.scan:
  %fill.i = phi i64 [ 0, %alloc ], [ %fill.next, %fill.advance ]
  %out.i = phi i64 [ 0, %alloc ], [ %out.next, %fill.advance ]
  %fill.done = icmp eq i64 %fill.i, %count
  br i1 %fill.done, label %exit, label %fill.check
fill.check:
  %fill.entry.bytes = mul i64 %fill.i, 32
  %fill.entry.ptr = getelementptr i8, ptr %entries, i64 %fill.entry.bytes
  %fill.stored.len = load i64, ptr %fill.entry.ptr
  %fill.active = icmp sge i64 %fill.stored.len, 0
  br i1 %fill.active, label %fill.descriptor.block, label %fill.skip
fill.descriptor.block:
  %fill.descriptor.slot = getelementptr i8, ptr %fill.entry.ptr, i64 24
  %fill.descriptor = load i64, ptr %fill.descriptor.slot
  %fill.enumerable.bit = and i64 %fill.descriptor, 2
  %fill.enumerable = icmp ne i64 %fill.enumerable.bit, 0
  br i1 %fill.enumerable, label %fill.include, label %fill.skip
fill.include:
  %value.slot = getelementptr i8, ptr %fill.entry.ptr, i64 16
  %value = load i64, ptr %value.slot
  call void @arraySet(ptr %array, i64 %out.i, i64 %value)
  %included.out = add i64 %out.i, 1
  br label %fill.advance
fill.skip:
  br label %fill.advance
fill.advance:
  %out.next = phi i64 [ %included.out, %fill.include ], [ %out.i, %fill.skip ]
  %fill.next = add i64 %fill.i, 1
  br label %fill.scan
exit:
  ret ptr %array
}
`);
  }
  if (runtime.used.has("objectOwnPropertyDescriptor") || runtime.used.has("arrayOwnPropertyDescriptor") || runtime.used.has("arrayLengthPropertyDescriptor")) {
    definitions.push(`@.desc.value = private unnamed_addr constant [6 x i8] c"value\\00"
@.desc.writable = private unnamed_addr constant [9 x i8] c"writable\\00"
@.desc.enumerable = private unnamed_addr constant [11 x i8] c"enumerable\\00"
@.desc.configurable = private unnamed_addr constant [13 x i8] c"configurable\\00"
`);
  }
  if (runtime.used.has("objectOwnPropertyDescriptor")) {
    definitions.push(`define i64 @objectOwnPropertyDescriptor(ptr %object, i64 %key.len, ptr %key.ptr) {
entry:
  %count = load i64, ptr %object
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %count
  br i1 %done, label %missing, label %check
check:
  %entry.bytes = mul i64 %i, 32
  %entry.ptr = getelementptr i8, ptr %entries, i64 %entry.bytes
  %stored.len = load i64, ptr %entry.ptr
  %same.len = icmp eq i64 %stored.len, %key.len
  br i1 %same.len, label %compare, label %advance
compare:
  %key.slot = getelementptr i8, ptr %entry.ptr, i64 8
  %stored.key = load ptr, ptr %key.slot
  %cmp = call i32 @memcmp(ptr %stored.key, ptr %key.ptr, i64 %key.len)
  %same.key = icmp eq i32 %cmp, 0
  br i1 %same.key, label %found, label %advance
found:
  %value.slot = getelementptr i8, ptr %entry.ptr, i64 16
  %value = load i64, ptr %value.slot
  %descriptor.slot = getelementptr i8, ptr %entry.ptr, i64 24
  %flags = load i64, ptr %descriptor.slot
  %writable.bit = and i64 %flags, 1
  %enumerable.bit = and i64 %flags, 2
  %configurable.bit = and i64 %flags, 4
  %writable.ok = icmp ne i64 %writable.bit, 0
  %enumerable.ok = icmp ne i64 %enumerable.bit, 0
  %configurable.ok = icmp ne i64 %configurable.bit, 0
  %writable.value = select i1 %writable.ok, i64 ${legacyJsValue.immediate("true")}, i64 ${legacyJsValue.immediate("false")}
  %enumerable.value = select i1 %enumerable.ok, i64 ${legacyJsValue.immediate("true")}, i64 ${legacyJsValue.immediate("false")}
  %configurable.value = select i1 %configurable.ok, i64 ${legacyJsValue.immediate("true")}, i64 ${legacyJsValue.immediate("false")}
  %desc = call ptr @objectNew(i64 4)
  call void @objectSet(ptr %desc, i64 5, ptr @.desc.value, i64 %value)
  call void @objectSet(ptr %desc, i64 8, ptr @.desc.writable, i64 %writable.value)
  call void @objectSet(ptr %desc, i64 10, ptr @.desc.enumerable, i64 %enumerable.value)
  call void @objectSet(ptr %desc, i64 12, ptr @.desc.configurable, i64 %configurable.value)
  %boxed = call i64 @valueBoxObject(ptr %desc)
  ret i64 %boxed
advance:
  %next = add i64 %i, 1
  br label %scan
missing:
  ret i64 ${legacyJsValue.immediate("undefined")}
}
`);
  }
  if (runtime.used.has("objectEntries")) {
    definitions.push(`define ptr @objectEntries(ptr %object) {
entry:
  %count = load i64, ptr %object
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  br label %count.scan
count.scan:
  %count.i = phi i64 [ 0, %entry ], [ %count.next, %count.advance ]
  %entry.count = phi i64 [ 0, %entry ], [ %entry.count.next, %count.advance ]
  %count.done = icmp eq i64 %count.i, %count
  br i1 %count.done, label %alloc, label %count.check
count.check:
  %count.entry.bytes = mul i64 %count.i, 32
  %count.entry.ptr = getelementptr i8, ptr %entries, i64 %count.entry.bytes
  %count.stored.len = load i64, ptr %count.entry.ptr
  %count.active = icmp sge i64 %count.stored.len, 0
  br i1 %count.active, label %count.descriptor.block, label %count.skip
count.descriptor.block:
  %count.descriptor.slot = getelementptr i8, ptr %count.entry.ptr, i64 24
  %count.descriptor = load i64, ptr %count.descriptor.slot
  %count.enumerable.bit = and i64 %count.descriptor, 2
  %count.enumerable = icmp ne i64 %count.enumerable.bit, 0
  br i1 %count.enumerable, label %count.include, label %count.skip
count.include:
  %included.count = add i64 %entry.count, 1
  br label %count.advance
count.skip:
  br label %count.advance
count.advance:
  %entry.count.next = phi i64 [ %included.count, %count.include ], [ %entry.count, %count.skip ]
  %count.next = add i64 %count.i, 1
  br label %count.scan
alloc:
  %array = call ptr @arrayNew(i64 %entry.count)
  br label %fill.scan
fill.scan:
  %fill.i = phi i64 [ 0, %alloc ], [ %fill.next, %fill.advance ]
  %out.i = phi i64 [ 0, %alloc ], [ %out.next, %fill.advance ]
  %fill.done = icmp eq i64 %fill.i, %count
  br i1 %fill.done, label %exit, label %fill.check
fill.check:
  %fill.entry.bytes = mul i64 %fill.i, 32
  %fill.entry.ptr = getelementptr i8, ptr %entries, i64 %fill.entry.bytes
  %fill.stored.len = load i64, ptr %fill.entry.ptr
  %fill.active = icmp sge i64 %fill.stored.len, 0
  br i1 %fill.active, label %fill.descriptor.block, label %fill.skip
fill.descriptor.block:
  %fill.descriptor.slot = getelementptr i8, ptr %fill.entry.ptr, i64 24
  %fill.descriptor = load i64, ptr %fill.descriptor.slot
  %fill.enumerable.bit = and i64 %fill.descriptor, 2
  %fill.enumerable = icmp ne i64 %fill.enumerable.bit, 0
  br i1 %fill.enumerable, label %fill.include, label %fill.skip
fill.include:
  %pair = call ptr @arrayNew(i64 2)
  %key.slot = getelementptr i8, ptr %fill.entry.ptr, i64 8
  %key.ptr = load ptr, ptr %key.slot
  %key.value = call i64 @valueBoxString(ptr %key.ptr, i64 %fill.stored.len)
  %value.slot = getelementptr i8, ptr %fill.entry.ptr, i64 16
  %value = load i64, ptr %value.slot
  call void @arraySet(ptr %pair, i64 0, i64 %key.value)
  call void @arraySet(ptr %pair, i64 1, i64 %value)
  %pair.value = call i64 @valueBoxArray(ptr %pair)
  call void @arraySet(ptr %array, i64 %out.i, i64 %pair.value)
  %included.out = add i64 %out.i, 1
  br label %fill.advance
fill.skip:
  br label %fill.advance
fill.advance:
  %out.next = phi i64 [ %included.out, %fill.include ], [ %out.i, %fill.skip ]
  %fill.next = add i64 %fill.i, 1
  br label %fill.scan
exit:
  ret ptr %array
}
`);
  }
  if (runtime.used.has("objectFromEntries")) {
    definitions.push(`define ptr @objectFromEntries(ptr %entries.array) {
entry:
  %out = call ptr @objectNew(i64 0)
  %length = call i64 @arrayLength(ptr %entries.array)
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %length
  br i1 %done, label %exit, label %check
check:
  %has = call i1 @arrayHasOwnIndex(ptr %entries.array, i64 %i)
  br i1 %has, label %load.entry, label %advance
load.entry:
  %entry.value = call i64 @arrayGet(ptr %entries.array, i64 %i)
  %entry.is.array = call i1 @valueIsArray(i64 %entry.value)
  br i1 %entry.is.array, label %entry.array, label %advance
entry.array:
  %entry.ptr = call ptr @valueArrayPtr(i64 %entry.value)
  %entry.length = call i64 @arrayLength(ptr %entry.ptr)
  %has.pair = icmp uge i64 %entry.length, 2
  br i1 %has.pair, label %entry.key, label %advance
entry.key:
  %key.value = call i64 @arrayGet(ptr %entry.ptr, i64 0)
  %key.tag = and i64 %key.value, ${legacyJsValue.tagMask()}
  %key.is.string = icmp eq i64 %key.tag, ${legacyJsValue.referenceTag("string")}
  br i1 %key.is.string, label %entry.store, label %advance
entry.store:
  %value = call i64 @arrayGet(ptr %entry.ptr, i64 1)
  %key.ptr = call ptr @valueStringPtr(i64 %key.value)
  %key.len = call i64 @valueStringLength(i64 %key.value)
  call void @objectSet(ptr %out, i64 %key.len, ptr %key.ptr, i64 %value)
  br label %advance
advance:
  %next = add i64 %i, 1
  br label %scan
exit:
  ret ptr %out
}
`);
  }
  if (runtime.used.has("objectPropertyIsEnumerable")) {
    definitions.push(`define i1 @objectPropertyIsEnumerable(ptr %object, i64 %key.len, ptr %key.ptr) {
entry:
  %count = load i64, ptr %object
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %count
  br i1 %done, label %missing, label %check
check:
  %entry.bytes = mul i64 %i, 32
  %entry.ptr = getelementptr i8, ptr %entries, i64 %entry.bytes
  %stored.len = load i64, ptr %entry.ptr
  %same.len = icmp eq i64 %stored.len, %key.len
  br i1 %same.len, label %compare, label %advance
compare:
  %key.slot = getelementptr i8, ptr %entry.ptr, i64 8
  %stored.key = load ptr, ptr %key.slot
  %cmp = call i32 @memcmp(ptr %stored.key, ptr %key.ptr, i64 %key.len)
  %same.key = icmp eq i32 %cmp, 0
  br i1 %same.key, label %found, label %advance
found:
  %descriptor.slot = getelementptr i8, ptr %entry.ptr, i64 24
  %flags = load i64, ptr %descriptor.slot
  %enumerable.bit = and i64 %flags, 2
  %enumerable = icmp ne i64 %enumerable.bit, 0
  ret i1 %enumerable
advance:
  %next = add i64 %i, 1
  br label %scan
missing:
  ret i1 false
}
`);
  }
  if (runtime.used.has("objectOwnPropertyNames")) {
    definitions.push(`define ptr @objectOwnPropertyNames(ptr %object) {
entry:
  %count = load i64, ptr %object
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  br label %count.scan
count.scan:
  %count.i = phi i64 [ 0, %entry ], [ %count.next, %count.advance ]
  %key.count = phi i64 [ 0, %entry ], [ %key.count.next, %count.advance ]
  %count.done = icmp eq i64 %count.i, %count
  br i1 %count.done, label %alloc, label %count.check
count.check:
  %count.entry.bytes = mul i64 %count.i, 32
  %count.entry.ptr = getelementptr i8, ptr %entries, i64 %count.entry.bytes
  %count.stored.len = load i64, ptr %count.entry.ptr
  %count.active = icmp sge i64 %count.stored.len, 0
  %included.count = add i64 %key.count, 1
  br label %count.advance
count.advance:
  %key.count.next = select i1 %count.active, i64 %included.count, i64 %key.count
  %count.next = add i64 %count.i, 1
  br label %count.scan
alloc:
  %array = call ptr @arrayNew(i64 %key.count)
  br label %fill.scan
fill.scan:
  %fill.i = phi i64 [ 0, %alloc ], [ %fill.next, %fill.advance ]
  %out.i = phi i64 [ 0, %alloc ], [ %out.next, %fill.advance ]
  %fill.done = icmp eq i64 %fill.i, %count
  br i1 %fill.done, label %exit, label %fill.check
fill.check:
  %fill.entry.bytes = mul i64 %fill.i, 32
  %fill.entry.ptr = getelementptr i8, ptr %entries, i64 %fill.entry.bytes
  %fill.stored.len = load i64, ptr %fill.entry.ptr
  %fill.active = icmp sge i64 %fill.stored.len, 0
  br i1 %fill.active, label %fill.include, label %fill.skip
fill.include:
  %key.slot = getelementptr i8, ptr %fill.entry.ptr, i64 8
  %key.ptr = load ptr, ptr %key.slot
  %key.value = call i64 @valueBoxString(ptr %key.ptr, i64 %fill.stored.len)
  call void @arraySet(ptr %array, i64 %out.i, i64 %key.value)
  %included.out = add i64 %out.i, 1
  br label %fill.advance
fill.skip:
  br label %fill.advance
fill.advance:
  %out.next = phi i64 [ %included.out, %fill.include ], [ %out.i, %fill.skip ]
  %fill.next = add i64 %fill.i, 1
  br label %fill.scan
exit:
  ret ptr %array
}
`);
  }
  if (runtime.used.has("arrayOwnPropertyNames")) {
    definitions.push(`@.array.name.length = private unnamed_addr constant [7 x i8] c"length\\00"

define ptr @arrayOwnPropertyNames(ptr %array) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  br label %count.scan
count.scan:
  %count.i = phi i64 [ 0, %entry ], [ %count.next, %count.advance ]
  %key.count = phi i64 [ 0, %entry ], [ %key.count.next, %count.advance ]
  %count.done = icmp eq i64 %count.i, %length
  br i1 %count.done, label %alloc, label %count.check
count.check:
  %has.own = call i1 @arrayHasOwnIndex(ptr %array, i64 %count.i)
  br i1 %has.own, label %count.include, label %count.skip
count.include:
  %included.count = add i64 %key.count, 1
  br label %count.advance
count.skip:
  br label %count.advance
count.advance:
  %key.count.next = phi i64 [ %included.count, %count.include ], [ %key.count, %count.skip ]
  %count.next = add i64 %count.i, 1
  br label %count.scan
alloc:
  %keys = call ptr @arrayNew(i64 %key.count)
  br label %fill.scan
fill.scan:
  %fill.i = phi i64 [ 0, %alloc ], [ %fill.next, %fill.advance ]
  %out.i = phi i64 [ 0, %alloc ], [ %out.next, %fill.advance ]
  %fill.done = icmp eq i64 %fill.i, %length
  br i1 %fill.done, label %push.length.key, label %fill.check
fill.check:
  %fill.has.own = call i1 @arrayHasOwnIndex(ptr %array, i64 %fill.i)
  br i1 %fill.has.own, label %fill.include, label %fill.skip
fill.include:
  %key.ptr = call ptr @indexToString(i64 %fill.i)
  br label %digit.count
digit.count:
  %digit.value = phi i64 [ %fill.i, %fill.include ], [ %digit.next.value, %digit.more ]
  %digit.len = phi i64 [ 1, %fill.include ], [ %digit.len.next, %digit.more ]
  %digit.more.check = icmp uge i64 %digit.value, 10
  br i1 %digit.more.check, label %digit.more, label %box.key
digit.more:
  %digit.next.value = udiv i64 %digit.value, 10
  %digit.len.next = add i64 %digit.len, 1
  br label %digit.count
box.key:
  %key.value = call i64 @valueBoxString(ptr %key.ptr, i64 %digit.len)
  call void @arraySet(ptr %keys, i64 %out.i, i64 %key.value)
  %included.out = add i64 %out.i, 1
  br label %fill.advance
fill.skip:
  br label %fill.advance
fill.advance:
  %out.next = phi i64 [ %included.out, %box.key ], [ %out.i, %fill.skip ]
  %fill.next = add i64 %fill.i, 1
  br label %fill.scan
push.length.key:
  %length.key = call i64 @valueBoxString(ptr @.array.name.length, i64 6)
  call i64 @arrayPush(ptr %keys, i64 %length.key)
  %properties.slot = getelementptr i8, ptr %array, i64 32
  %properties = load ptr, ptr %properties.slot
  %named.keys = call ptr @objectOwnPropertyNames(ptr %properties)
  call void @arrayAppendElements(ptr %keys, ptr %named.keys)
  ret ptr %keys
}
`);
  }
  if (runtime.used.has("arrayAppendElements")) {
    definitions.push(`define void @arrayAppendElements(ptr %target, ptr %source) {
entry:
  %length = call i64 @arrayLength(ptr %source)
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %length
  br i1 %done, label %exit, label %check
check:
  %has = call i1 @arrayHasOwnIndex(ptr %source, i64 %i)
  br i1 %has, label %append, label %advance
append:
  %value = call i64 @arrayGet(ptr %source, i64 %i)
  call i64 @arrayPush(ptr %target, i64 %value)
  br label %advance
advance:
  %next = add i64 %i, 1
  br label %scan
exit:
  ret void
}
`);
  }
  if (runtime.used.has("objectOwnPropertyDescriptors")) {
    definitions.push(`define ptr @objectOwnPropertyDescriptors(ptr %object) {
entry:
  %out = call ptr @objectNew(i64 0)
  %count = load i64, ptr %object
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %count
  br i1 %done, label %exit, label %check
check:
  %entry.bytes = mul i64 %i, 32
  %entry.ptr = getelementptr i8, ptr %entries, i64 %entry.bytes
  %stored.len = load i64, ptr %entry.ptr
  %active = icmp sge i64 %stored.len, 0
  br i1 %active, label %include, label %advance
include:
  %key.slot = getelementptr i8, ptr %entry.ptr, i64 8
  %key.ptr = load ptr, ptr %key.slot
  %desc = call i64 @objectOwnPropertyDescriptor(ptr %object, i64 %stored.len, ptr %key.ptr)
  call void @objectSet(ptr %out, i64 %stored.len, ptr %key.ptr, i64 %desc)
  br label %advance
advance:
  %next = add i64 %i, 1
  br label %scan
exit:
  ret ptr %out
}
`);
  }
  if (runtime.used.has("objectIs")) {
    definitions.push(`define i1 @objectIs(i64 %left, i64 %right) {
entry:
  %left.d = call double @valueNumber(i64 %left)
  %right.d = call double @valueNumber(i64 %right)
  %same.bits = icmp eq i64 %left, %right
  br i1 %same.bits, label %check.signed.zero, label %check.strings
check.signed.zero:
  %is.zero.l = fcmp oeq double %left.d, 0.0
  %is.zero.r = fcmp oeq double %right.d, 0.0
  %both.zero = and i1 %is.zero.l, %is.zero.r
  br i1 %both.zero, label %check.signs, label %true
check.signs:
  %left.sign = and i64 %left, -9223372036854775808
  %right.sign = and i64 %right, -9223372036854775808
  %same.sign = icmp eq i64 %left.sign, %right.sign
  br i1 %same.sign, label %true, label %false
check.strings:
  %left.tag = and i64 %left, ${legacyJsValue.tagMask()}
  %right.tag = and i64 %right, ${legacyJsValue.tagMask()}
  %left.string = icmp eq i64 %left.tag, ${legacyJsValue.referenceTag("string")}
  %right.string = icmp eq i64 %right.tag, ${legacyJsValue.referenceTag("string")}
  %both.strings = and i1 %left.string, %right.string
  br i1 %both.strings, label %string.compare, label %check.objects
string.compare:
  %left.len = call i64 @valueStringLength(i64 %left)
  %right.len = call i64 @valueStringLength(i64 %right)
  %same.len = icmp eq i64 %left.len, %right.len
  br i1 %same.len, label %string.bytes, label %false
string.bytes:
  %left.ptr = call ptr @valueStringPtr(i64 %left)
  %right.ptr = call ptr @valueStringPtr(i64 %right)
  %cmp = call i32 @memcmp(ptr %left.ptr, ptr %right.ptr, i64 %left.len)
  %same.bytes = icmp eq i32 %cmp, 0
  br i1 %same.bytes, label %true, label %false
check.objects:
  %left.object = icmp eq i64 %left.tag, ${legacyJsValue.referenceTag("object")}
  %right.object = icmp eq i64 %right.tag, ${legacyJsValue.referenceTag("object")}
  %both.objects = and i1 %left.object, %right.object
  br i1 %both.objects, label %object.compare, label %check.arrays
object.compare:
  %left.obj.ptr = call ptr @valueObjectPtr(i64 %left)
  %right.obj.ptr = call ptr @valueObjectPtr(i64 %right)
  %same.obj.ptr = icmp eq ptr %left.obj.ptr, %right.obj.ptr
  br i1 %same.obj.ptr, label %true, label %false
check.arrays:
  %left.array = icmp eq i64 %left.tag, ${legacyJsValue.referenceTag("array")}
  %right.array = icmp eq i64 %right.tag, ${legacyJsValue.referenceTag("array")}
  %both.arrays = and i1 %left.array, %right.array
  br i1 %both.arrays, label %array.compare, label %check.functions
array.compare:
  %left.arr.ptr = call ptr @valueArrayPtr(i64 %left)
  %right.arr.ptr = call ptr @valueArrayPtr(i64 %right)
  %same.arr.ptr = icmp eq ptr %left.arr.ptr, %right.arr.ptr
  br i1 %same.arr.ptr, label %true, label %false
check.functions:
  %left.function = icmp eq i64 %left.tag, ${legacyJsValue.referenceTag("function")}
  %right.function = icmp eq i64 %right.tag, ${legacyJsValue.referenceTag("function")}
  %both.functions = and i1 %left.function, %right.function
  br i1 %both.functions, label %function.compare, label %check.nan
function.compare:
  %left.fn.ptr = call ptr @valueFunctionPtr(i64 %left)
  %right.fn.ptr = call ptr @valueFunctionPtr(i64 %right)
  %same.fn.ptr = icmp eq ptr %left.fn.ptr, %right.fn.ptr
  br i1 %same.fn.ptr, label %true, label %false
check.nan:
  %left.nan = fcmp uno double %left.d, 0.0
  %right.nan = fcmp uno double %right.d, 0.0
  %both.nan = and i1 %left.nan, %right.nan
  br i1 %both.nan, label %true, label %false
true:
  ret i1 true
false:
  ret i1 false
}
`);
  }
  if (runtime.used.has("objectKeys")) {
    definitions.push(`define ptr @objectKeys(ptr %object) {
entry:
  %count = load i64, ptr %object
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  br label %count.scan
count.scan:
  %count.i = phi i64 [ 0, %entry ], [ %count.next, %count.advance ]
  %key.count = phi i64 [ 0, %entry ], [ %key.count.next, %count.advance ]
  %count.done = icmp eq i64 %count.i, %count
  br i1 %count.done, label %alloc, label %count.check
count.check:
  %count.entry.bytes = mul i64 %count.i, 32
  %count.entry.ptr = getelementptr i8, ptr %entries, i64 %count.entry.bytes
  %count.stored.len = load i64, ptr %count.entry.ptr
  %count.active = icmp sge i64 %count.stored.len, 0
  br i1 %count.active, label %count.descriptor.block, label %count.skip
count.descriptor.block:
  %count.descriptor.slot = getelementptr i8, ptr %count.entry.ptr, i64 24
  %count.descriptor = load i64, ptr %count.descriptor.slot
  %count.enumerable.bit = and i64 %count.descriptor, 2
  %count.enumerable = icmp ne i64 %count.enumerable.bit, 0
  br i1 %count.enumerable, label %count.include, label %count.skip
count.include:
  %included.count = add i64 %key.count, 1
  br label %count.advance
count.skip:
  br label %count.advance
count.advance:
  %key.count.next = phi i64 [ %included.count, %count.include ], [ %key.count, %count.skip ]
  %count.next = add i64 %count.i, 1
  br label %count.scan
alloc:
  %array = call ptr @arrayNew(i64 %key.count)
  br label %fill.scan
fill.scan:
  %fill.i = phi i64 [ 0, %alloc ], [ %fill.next, %fill.advance ]
  %out.i = phi i64 [ 0, %alloc ], [ %out.next, %fill.advance ]
  %fill.done = icmp eq i64 %fill.i, %count
  br i1 %fill.done, label %exit, label %fill.check
fill.check:
  %fill.entry.bytes = mul i64 %fill.i, 32
  %fill.entry.ptr = getelementptr i8, ptr %entries, i64 %fill.entry.bytes
  %fill.stored.len = load i64, ptr %fill.entry.ptr
  %fill.active = icmp sge i64 %fill.stored.len, 0
  br i1 %fill.active, label %fill.descriptor.block, label %fill.skip
fill.descriptor.block:
  %fill.descriptor.slot = getelementptr i8, ptr %fill.entry.ptr, i64 24
  %fill.descriptor = load i64, ptr %fill.descriptor.slot
  %fill.enumerable.bit = and i64 %fill.descriptor, 2
  %fill.enumerable = icmp ne i64 %fill.enumerable.bit, 0
  br i1 %fill.enumerable, label %fill.include, label %fill.skip
fill.include:
  %key.slot = getelementptr i8, ptr %fill.entry.ptr, i64 8
  %key.ptr = load ptr, ptr %key.slot
  %key.value = call i64 @valueBoxString(ptr %key.ptr, i64 %fill.stored.len)
  call void @arraySet(ptr %array, i64 %out.i, i64 %key.value)
  %included.out = add i64 %out.i, 1
  br label %fill.advance
fill.skip:
  br label %fill.advance
fill.advance:
  %out.next = phi i64 [ %included.out, %fill.include ], [ %out.i, %fill.skip ]
  %fill.next = add i64 %fill.i, 1
  br label %fill.scan
exit:
  ret ptr %array
}
`);
  }
  return definitions;
}
