import type { JsIrBindingValue } from "./bindings.js";
import type { JsIrOperation } from "./types.js";

/** The aggregate Binding Value produced by an IR Operation, shared by Lowering and Emission. */
// eslint-disable-next-line complexity -- Each case classifies an IR Operation that introduces an aggregate Binding Value.
export function aggregateBindingForOperation(operation: JsIrOperation): JsIrBindingValue | undefined {
  switch (operation.kind) {
    case "arrayLiteral": {
      return { kind: "array", name: operation.name, length: operation.elements.length };
    }
    case "runtimeArrayLiteral":
    case "runtimeObjectKeys":
    case "runtimeObjectValues":
    case "runtimeObjectEntries":
    case "runtimeObjectOwnPropertyNames":
    case "runtimeArraySlice":
    case "runtimeArrayFlatMapCallback":
    case "runtimeArraySort":
    case "runtimeArrayFrom":
    case "runtimeArraySplice":
    case "runtimeArrayFlat":
    case "runtimeStringSplit":
    case "runtimeRegexSplit":
    case "runtimeArrayMapCallback":
    case "runtimeArrayMapFunctionObject":
    case "runtimeArrayFilterCallback":
    case "runtimeArrayConcat":
    case "runtimeArrayMutatorResult":
    case "runtimeArrayFromValue":
    case "runtimeArrayFromCollection": {
      return { kind: "runtimeArray", name: operation.name };
    }
    case "objectLiteral": {
      return { kind: "object", value: operation.value };
    }
    case "runtimeObjectLiteral": {
      return { kind: "runtimeObject", name: operation.name, value: operation.value };
    }
    case "runtimeObjectCreate":
    case "runtimeObjectFromEntries":
    case "runtimeObjectOwnPropertyDescriptors":
    case "runtimeObjectGetPrototype": {
      return { kind: "runtimeObject", name: operation.name };
    }
    case "runtimeErrorLiteral": {
      return { kind: "runtimeObject", name: operation.name, errorName: operation.errorName };
    }
    case "runtimeObjectOwnPropertyDescriptor":
    case "runtimeIteratorNew": {
      return { kind: "valueVariable", name: operation.name };
    }
    case "runtimeMapNew":
    case "runtimeMapFromArray":
    case "runtimeMapFromIterable":
    case "runtimeMapFromCollection":
    case "runtimeMapSetResult": {
      return { kind: "runtimeMap", name: operation.name };
    }
    case "runtimeSetNew":
    case "runtimeSetFromArray":
    case "runtimeSetFromIterable":
    case "runtimeSetFromCollection":
    case "runtimeSetAddResult": {
      return { kind: "runtimeSet", name: operation.name };
    }
    default: {
      return undefined;
    }
  }
}
