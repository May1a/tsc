import { Chunk, Effect } from "effect";
import ts from "typescript";
import { Diagnostics } from "./diagnostics-service.js";
import type { CompilerDiagnostic } from "./diagnostics.js";

export type JsIrModule = {
  readonly entry: string;
  readonly modules: readonly JsIrSourceModule[];
};

export type JsIrSourceModule = {
  readonly fileName: string;
  readonly statementCount: number;
  readonly operations: readonly JsIrOperation[];
};

export type JsIrNumberOperator = "add" | "subtract" | "multiply" | "divide";

export type JsIrValueKind = "number" | "string" | "value";

export type JsIrFunctionParameter = {
  readonly name: string;
  readonly valueKind: JsIrValueKind;
};

export type JsIrCallArgument =
  | {
      readonly valueKind: "number";
      readonly value: JsIrNumberExpression;
    }
  | {
      readonly valueKind: "string";
      readonly value: JsIrStringExpression;
    }
  | {
      readonly valueKind: "value";
      readonly value: JsIrValueExpression;
    };

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
      readonly kind: "ternary";
      readonly condition: JsIrCondition;
      readonly consequent: JsIrValueExpression;
      readonly alternate: JsIrValueExpression;
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
      readonly kind: "valueArrayAccess";
      readonly value: JsIrValueExpression;
      readonly index: JsIrNumberExpression;
      readonly key: JsIrStringExpression;
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
    };

export type JsIrNumberExpression =
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
      readonly operator: "negate";
      readonly value: JsIrNumberExpression;
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
      readonly kind: "arrayPush" | "arrayUnshift";
      readonly arrayName: string;
      readonly values: readonly JsIrValueExpression[];
    }
  | {
      readonly kind: "arrayIndexOf";
      readonly arrayName: string;
      readonly value: JsIrValueExpression;
      readonly fromEnd?: boolean;
    }
  | {
      readonly kind: "objectAccess";
      readonly objectName: string;
      readonly path: readonly string[];
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

export type JsIrObjectField = {
  readonly name: string;
  readonly value: JsIrObjectFieldValue;
};

export type JsIrObjectValue = {
  readonly fields: readonly JsIrObjectField[];
};

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

export type JsIrRuntimeObjectValue = {
  readonly fields: readonly JsIrRuntimeObjectField[];
};

export type JsIrClosureValue = {
  readonly functionName: string;
  readonly captures: readonly JsIrNumberExpression[];
};

export type JsIrBindingValue =
  | {
      readonly kind: "string";
      readonly value: string;
    }
  | {
      readonly kind: "stringExpression";
      readonly value: JsIrStringExpression;
    }
  | {
      readonly kind: "stringVariable";
      readonly name: string;
    }
  | {
      readonly kind: "value";
      readonly value: JsIrValueExpression;
    }
  | {
      readonly kind: "valueVariable";
      readonly name: string;
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
      readonly kind: "booleanExpression";
      readonly value: JsIrCondition;
    }
  | {
      readonly kind: "booleanVariable";
      readonly name: string;
      readonly initialValue?: boolean;
    }
  | {
      readonly kind: "array";
      readonly name: string;
      readonly length: number;
    }
  | {
      readonly kind: "runtimeArray";
      readonly name: string;
    }
  | {
      readonly kind: "object";
      readonly value: JsIrObjectValue;
    }
  | {
      readonly kind: "runtimeObject";
      readonly name: string;
      readonly value?: JsIrRuntimeObjectValue;
    }
  | {
      readonly kind: "closure";
      readonly value: JsIrClosureValue;
    }
  | {
      readonly kind: "closureFactory";
      readonly functionName: string;
      readonly factoryParameters: readonly string[];
      readonly captureNames: readonly string[];
    }
  | {
      readonly kind: "function";
      readonly parameters: readonly JsIrFunctionParameter[];
      readonly returnKind: JsIrValueKind | "void";
    };

export type JsIrCondition =
  | {
      readonly kind: "boolean";
      readonly value: boolean;
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
      readonly kind: "valueTruthy";
      readonly value: JsIrValueExpression;
    }
  | {
      readonly kind: "runtimeObjectState";
      readonly objectName: string;
      readonly state: "isExtensible" | "isSealed" | "isFrozen";
    };

export type JsIrRuntimeDataDescriptor = {
  readonly key: JsIrStringExpression;
  readonly value: JsIrValueExpression;
  readonly writable: boolean;
  readonly enumerable: boolean;
  readonly configurable: boolean;
};

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

export type JsIrOperation =
  | {
      readonly kind: "constNumber";
      readonly name: string;
      readonly value: JsIrNumberExpression;
    }
  | {
      readonly kind: "constString";
      readonly name: string;
      readonly value: string;
    }
  | {
      readonly kind: "constStringExpression";
      readonly name: string;
      readonly value: JsIrStringExpression;
    }
  | {
      readonly kind: "constBoolean";
      readonly name: string;
      readonly value: boolean;
    }
  | {
      readonly kind: "constBooleanExpression";
      readonly name: string;
      readonly value: JsIrCondition;
    }
  | {
      readonly kind: "constValue";
      readonly name: string;
      readonly value: JsIrValueExpression;
    }
  | {
      readonly kind: "constClosure";
      readonly name: string;
      readonly value: JsIrClosureValue;
    }
  | {
      readonly kind: "letNumber";
      readonly name: string;
      readonly value: JsIrNumberExpression;
    }
  | {
      readonly kind: "letString";
      readonly name: string;
      readonly value: JsIrStringExpression;
    }
  | {
      readonly kind: "letBoolean";
      readonly name: string;
      readonly value: JsIrCondition;
    }
  | {
      readonly kind: "arrayLiteral";
      readonly name: string;
      readonly elements: readonly JsIrNumberExpression[];
    }
  | {
      readonly kind: "runtimeArrayLiteral";
      readonly name: string;
      readonly elements: readonly JsIrRuntimeArrayElement[];
    }
  | {
      readonly kind: "objectLiteral";
      readonly name: string;
      readonly value: JsIrObjectValue;
      readonly needsRuntimeShadow: boolean;
    }
  | {
      readonly kind: "runtimeObjectLiteral";
      readonly name: string;
      readonly value: JsIrRuntimeObjectValue;
    }
  | {
      readonly kind: "runtimeObjectCreate";
      readonly name: string;
      readonly prototypeName?: string;
    }
  | {
      readonly kind: "runtimeObjectKeys";
      readonly name: string;
      readonly targetName: string;
      readonly targetKind: "object" | "array" | "value";
    }
  | {
      readonly kind: "runtimeObjectValues";
      readonly name: string;
      readonly targetName: string;
      readonly targetKind: "object" | "array" | "value";
    }
  | {
      readonly kind: "runtimeObjectEntries";
      readonly name: string;
      readonly targetName: string;
      readonly targetKind: "object" | "array" | "value";
    }
  | {
      readonly kind: "runtimeObjectFromEntries";
      readonly name: string;
      readonly entriesName: string;
    }
  | {
      readonly kind: "runtimeObjectOwnPropertyDescriptor";
      readonly name: string;
      readonly targetName: string;
      readonly targetKind: "object" | "array" | "value";
      readonly key: JsIrStringExpression;
      readonly index?: JsIrNumberExpression;
      readonly isLength?: boolean;
    }
  | {
      readonly kind: "runtimeObjectOwnPropertyNames";
      readonly name: string;
      readonly targetName: string;
      readonly targetKind: "object" | "array" | "value";
    }
  | {
      readonly kind: "runtimeObjectOwnPropertyDescriptors";
      readonly name: string;
      readonly targetName: string;
      readonly targetKind: "object" | "array" | "value";
    }
  | {
      readonly kind: "runtimeArraySlice";
      readonly name: string;
      readonly arrayName: string;
      readonly start: JsIrNumberExpression;
      readonly end?: JsIrNumberExpression;
    }
  | {
      readonly kind: "runtimeArraySplice";
      readonly name: string;
      readonly arrayName: string;
      readonly start: JsIrNumberExpression;
      readonly deleteCount?: JsIrNumberExpression;
      readonly items: readonly JsIrValueExpression[];
    }
  | {
      readonly kind: "runtimeArraySpliceStatement";
      readonly arrayName: string;
      readonly start: JsIrNumberExpression;
      readonly deleteCount?: JsIrNumberExpression;
      readonly items: readonly JsIrValueExpression[];
    }
  | {
      readonly kind: "runtimeArrayFlat";
      readonly name: string;
      readonly arrayName: string;
      readonly depth: JsIrNumberExpression;
    }
  | {
      readonly kind: "runtimeArrayConcat";
      readonly name: string;
      readonly leftName: string;
      readonly values: readonly JsIrRuntimeArrayConcatElement[];
    }
  | {
      readonly kind: "runtimeArrayMutatorResult";
      readonly name: string;
      readonly arrayName: string;
      readonly mutation:
        | { readonly kind: "reverse" }
        | { readonly kind: "fill"; readonly value: JsIrValueExpression; readonly start?: JsIrNumberExpression; readonly end?: JsIrNumberExpression }
        | { readonly kind: "copyWithin"; readonly target: JsIrNumberExpression; readonly start: JsIrNumberExpression; readonly end?: JsIrNumberExpression };
    }
  | {
      readonly kind: "runtimeObjectGetPrototype";
      readonly name: string;
      readonly targetName: string;
      readonly targetKind: "object" | "array";
    }
  | {
      readonly kind: "assignNumber";
      readonly name: string;
      readonly value: JsIrNumberExpression;
    }
  | {
      readonly kind: "assignString";
      readonly name: string;
      readonly value: JsIrStringExpression;
    }
  | {
      readonly kind: "assignBoolean";
      readonly name: string;
      readonly value: JsIrCondition;
    }
  | {
      readonly kind: "arrayStore";
      readonly arrayName: string;
      readonly index: JsIrNumberExpression;
      readonly value: JsIrNumberExpression;
    }
  | {
      readonly kind: "runtimeArrayStore";
      readonly arrayName: string;
      readonly index: JsIrNumberExpression;
      readonly value: JsIrValueExpression;
    }
  | {
      readonly kind: "runtimeArrayNamedStore";
      readonly arrayName: string;
      readonly key: JsIrStringExpression;
      readonly value: JsIrValueExpression;
    }
  | {
      readonly kind: "runtimeArrayDelete";
      readonly arrayName: string;
      readonly index: JsIrNumberExpression;
    }
  | {
      readonly kind: "runtimeArrayNamedDelete";
      readonly arrayName: string;
      readonly key: JsIrStringExpression;
    }
  | {
      readonly kind: "runtimeArraySetLength";
      readonly arrayName: string;
      readonly length: JsIrNumberExpression;
    }
  | {
      readonly kind: "runtimeArrayPush" | "runtimeArrayUnshift";
      readonly arrayName: string;
      readonly values: readonly JsIrValueExpression[];
    }
  | {
      readonly kind: "runtimeArrayFill";
      readonly arrayName: string;
      readonly value: JsIrValueExpression;
      readonly start?: JsIrNumberExpression;
      readonly end?: JsIrNumberExpression;
    }
  | {
      readonly kind: "runtimeArrayReverse";
      readonly arrayName: string;
    }
  | {
      readonly kind: "runtimeArrayCopyWithin";
      readonly arrayName: string;
      readonly target: JsIrNumberExpression;
      readonly start: JsIrNumberExpression;
      readonly end?: JsIrNumberExpression;
    }
  | {
      readonly kind: "runtimeArrayPop" | "runtimeArrayShift";
      readonly arrayName: string;
    }
  | {
      readonly kind: "objectStore";
      readonly objectName: string;
      readonly path: readonly string[];
      readonly value: JsIrNumberExpression;
    }
  | {
      readonly kind: "runtimeObjectStore";
      readonly objectName: string;
      readonly key: JsIrStringExpression;
      readonly value: JsIrValueExpression;
    }
  | {
      readonly kind: "valueObjectStore";
      readonly targetName: string;
      readonly key: JsIrStringExpression;
      readonly value: JsIrValueExpression;
    }
  | {
      readonly kind: "valueArrayStore";
      readonly targetName: string;
      readonly index: JsIrNumberExpression;
      readonly value: JsIrValueExpression;
    }
  | {
      readonly kind: "valueArraySetLength";
      readonly targetName: string;
      readonly length: JsIrNumberExpression;
    }
  | {
      readonly kind: "runtimeObjectDelete";
      readonly objectName: string;
      readonly key: JsIrStringExpression;
    }
  | {
      readonly kind: "valueObjectDelete";
      readonly targetName: string;
      readonly key: JsIrStringExpression;
    }
  | {
      readonly kind: "valueArrayDelete";
      readonly targetName: string;
      readonly index: JsIrNumberExpression;
    }
  | {
      readonly kind: "runtimeObjectSetPrototype";
      readonly targetName: string;
      readonly targetKind: "object" | "array";
      readonly prototypeName?: string;
    }
  | {
      readonly kind: "runtimeObjectPreventExtensions" | "runtimeObjectSeal" | "runtimeObjectFreeze";
      readonly objectName: string;
    }
  | {
      readonly kind: "runtimeObjectAssign";
      readonly targetName: string;
      readonly sources: readonly JsIrObjectAssignSource[];
    }
  | {
      readonly kind: "runtimeObjectDefineDataProperty";
      readonly objectName: string;
      readonly descriptor: JsIrRuntimeDataDescriptor;
    }
  | {
      readonly kind: "runtimeObjectDefineDataProperties";
      readonly objectName: string;
      readonly descriptors: readonly JsIrRuntimeDataDescriptor[];
    }
  | {
      readonly kind: "print";
      readonly expression: JsIrExpression;
    }
  | {
      readonly kind: "if";
      readonly condition: JsIrCondition;
      readonly thenOperations: readonly JsIrOperation[];
      readonly elseOperations: readonly JsIrOperation[];
    }
  | {
      readonly kind: "while";
      readonly condition: JsIrCondition;
      readonly body: readonly JsIrOperation[];
    }
  | {
      readonly kind: "doWhile";
      readonly condition: JsIrCondition;
      readonly body: readonly JsIrOperation[];
    }
  | {
      readonly kind: "for";
      readonly initializer: JsIrOperation;
      readonly condition: JsIrCondition;
      readonly increment: JsIrOperation;
      readonly body: readonly JsIrOperation[];
    }
  | {
      readonly kind: "break";
    }
  | {
      readonly kind: "continue";
    }
  | {
      readonly kind: "function";
      readonly name: string;
      readonly parameters: readonly JsIrFunctionParameter[];
      readonly body: readonly JsIrOperation[];
    }
  | {
      readonly kind: "call";
      readonly name: string;
      readonly arguments: readonly JsIrCallArgument[];
    }
  | {
      readonly kind: "returnNumber";
      readonly expression: JsIrNumberExpression;
    }
  | {
      readonly kind: "returnString";
      readonly expression: JsIrStringExpression;
    }
  | {
      readonly kind: "returnValue";
      readonly expression: JsIrValueExpression;
    }
  | {
      readonly kind: "returnClosure";
      readonly functionName: string;
      readonly parameters: readonly string[];
      readonly captures: readonly string[];
      readonly body: readonly JsIrOperation[];
    };

export type JsIrResult = {
  readonly module: JsIrModule;
};

type ArrayLiteralClassification =
  | {
      readonly kind: "fixed";
      readonly elements: readonly JsIrNumberExpression[];
    }
  | {
      readonly kind: "runtime";
      readonly elements: readonly JsIrRuntimeArrayElement[];
    };

type ObjectLiteralClassification =
  | {
      readonly kind: "fixed";
      readonly value: JsIrObjectValue;
    }
  | {
      readonly kind: "runtime";
      readonly value: JsIrRuntimeObjectValue;
    };

const definePropertyArgumentCount = 3;
const arrayFillRangeArgumentCount = 3;
const arrayCopyWithinArgumentCount = 3;

// eslint-disable-next-line max-statements -- Aggregate binding classification is centralized during the runtime-shape transition.
export function aggregateBindingForOperation(operation: JsIrOperation): JsIrBindingValue | undefined {
  if (operation.kind === "arrayLiteral") {
    return { kind: "array", name: operation.name, length: operation.elements.length };
  }
  if (operation.kind === "runtimeArrayLiteral") {
    return { kind: "runtimeArray", name: operation.name };
  }
  if (operation.kind === "objectLiteral") {
    return { kind: "object", value: operation.value };
  }
  if (operation.kind === "runtimeObjectLiteral") {
    return { kind: "runtimeObject", name: operation.name, value: operation.value };
  }
  if (operation.kind === "runtimeObjectCreate") {
    return { kind: "runtimeObject", name: operation.name };
  }
  if (operation.kind === "runtimeObjectKeys") {
    return { kind: "runtimeArray", name: operation.name };
  }
  if (operation.kind === "runtimeObjectValues") {
    return { kind: "runtimeArray", name: operation.name };
  }
  if (operation.kind === "runtimeObjectEntries") {
    return { kind: "runtimeArray", name: operation.name };
  }
  if (operation.kind === "runtimeObjectFromEntries") {
    return { kind: "runtimeObject", name: operation.name };
  }
  if (operation.kind === "runtimeObjectOwnPropertyDescriptor") {
    return { kind: "valueVariable", name: operation.name };
  }
  if (operation.kind === "runtimeObjectOwnPropertyNames") {
    return { kind: "runtimeArray", name: operation.name };
  }
  if (operation.kind === "runtimeObjectOwnPropertyDescriptors") {
    return { kind: "runtimeObject", name: operation.name };
  }
  if (operation.kind === "runtimeArraySlice") {
    return { kind: "runtimeArray", name: operation.name };
  }
  if (operation.kind === "runtimeArraySplice") {
    return { kind: "runtimeArray", name: operation.name };
  }
  if (operation.kind === "runtimeArrayFlat") {
    return { kind: "runtimeArray", name: operation.name };
  }
  if (operation.kind === "runtimeArrayConcat") {
    return { kind: "runtimeArray", name: operation.name };
  }
  if (operation.kind === "runtimeArrayMutatorResult") {
    return { kind: "runtimeArray", name: operation.name };
  }
  if (operation.kind === "runtimeObjectGetPrototype") {
    return { kind: "runtimeObject", name: operation.name };
  }
  return undefined;
}

const sourceSpan = (sourceFile: ts.SourceFile, position: number) => {
  const lineAndCharacter = sourceFile.getLineAndCharacterOfPosition(position);

  return {
    fileName: sourceFile.fileName,
    line: lineAndCharacter.line + 1,
    column: lineAndCharacter.character + 1
  };
};

function collectPromotedAggregateNames(statements: ts.NodeArray<ts.Statement>): ReadonlySet<string> {
  const names = new Set<string>();
  for (const statement of statements) {
    if (!ts.isExpressionStatement(statement)) {
      continue;
    }
    const { expression } = statement;
    if (ts.isCallExpression(expression)) {
      if (ts.isPropertyAccessExpression(expression.expression) && ts.isIdentifier(expression.expression.expression)) {
        const method = expression.expression.name.text;
        if (method === "push" || method === "unshift" || method === "pop" || method === "shift" || method === "fill" || method === "reverse" || method === "copyWithin") {
          names.add(expression.expression.expression.text);
        }
      }
      if (ts.isPropertyAccessExpression(expression.expression) && ts.isIdentifier(expression.expression.expression) && expression.expression.expression.text === "Object" && expression.expression.name.text === "assign") {
        const [target] = expression.arguments;
        if (ts.isIdentifier(target)) {
          names.add(target.text);
        }
      }
    }
  }
  return names;
}

function lowerStatements(
  sourceFile: ts.SourceFile
): { readonly operations: readonly JsIrOperation[]; readonly diagnostics: Chunk.Chunk<CompilerDiagnostic> } {
  const operations: JsIrOperation[] = [];
  const bindings = new Map<string, JsIrBindingValue>();
  const diagnostics: CompilerDiagnostic[] = [];
  const promotedAggregates = collectPromotedAggregateNames(sourceFile.statements);

  for (const statement of sourceFile.statements) {
    if (isNonExecutableDeclaration(statement)) {
      continue;
    }

    const operation = lowerStatement(statement, bindings, promotedAggregates);
    if (operation) {
      operations.push(operation);
      updateBindings(operation, bindings);
      continue;
    }

    diagnostics.push({
      code: "TSCN1002",
      category: "error",
      message: unsupportedStatementMessage(statement),
      span: sourceSpan(sourceFile, statement.getStart(sourceFile))
    });
  }

  return { operations: markRuntimeObjectShadows(operations), diagnostics: Chunk.fromIterable(diagnostics) };
}

function updateBindings(
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
  if (operation.kind === "constClosure") {
    bindings.set(operation.name, { kind: "closure", value: operation.value });
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
      returnKind: functionReturnKind(operation.body)
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
}

function updateAggregateBindings(
  operation: JsIrOperation,
  bindings: Map<string, JsIrBindingValue>
): void {
  const binding = aggregateBindingForOperation(operation);
  if (binding !== undefined && "name" in operation) {
    bindings.set(operation.name, binding);
  }
}

function markRuntimeObjectShadows(operations: readonly JsIrOperation[]): readonly JsIrOperation[] {
  const shadowedObjects = new Set<string>();
  for (const operation of operations) {
    collectRuntimeShadowObjectNames(operation, shadowedObjects);
  }

  if (shadowedObjects.size === 0) {
    return operations;
  }

  return operations.map((operation) => markRuntimeObjectShadow(operation, shadowedObjects));
}

function markRuntimeObjectShadow(operation: JsIrOperation, shadowedObjects: ReadonlySet<string>): JsIrOperation {
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
  if (operation.kind === "while" || operation.kind === "doWhile") {
    return { ...operation, body: markRuntimeObjectShadows(operation.body) };
  }
  if (operation.kind === "for") {
    return {
      ...operation,
      initializer: markRuntimeObjectShadow(operation.initializer, shadowedObjects),
      body: markRuntimeObjectShadows(operation.body),
      increment: markRuntimeObjectShadow(operation.increment, shadowedObjects)
    };
  }
  if (operation.kind === "function") {
    return { ...operation, body: markRuntimeObjectShadows(operation.body) };
  }
  return operation;
}

function collectRuntimeShadowObjectNames(operation: JsIrOperation, names: Set<string>): void {
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
function collectOperationValueExpressions(operation: JsIrOperation, names: Set<string>): void {
  if (operation.kind === "constValue" || operation.kind === "runtimeArrayStore" || operation.kind === "runtimeArrayNamedStore" || operation.kind === "runtimeObjectStore" || operation.kind === "valueArrayStore" || operation.kind === "valueObjectStore") {
    collectValueExpressionObjectNames(operation.value, names);
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
  if (operation.kind === "while" || operation.kind === "doWhile" || operation.kind === "function") {
    for (const nested of operation.body) {
      collectRuntimeShadowObjectNames(nested, names);
    }
  }
  if (operation.kind === "for") {
    collectRuntimeShadowObjectNames(operation.initializer, names);
    for (const nested of operation.body) {
      collectRuntimeShadowObjectNames(nested, names);
    }
    collectRuntimeShadowObjectNames(operation.increment, names);
  }
}

function collectValueExpressionObjectNames(expression: JsIrValueExpression, names: Set<string>): void {
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
}

function functionReturnKind(operations: readonly JsIrOperation[]): JsIrValueKind | "void" {
  if (operations.some((operation) => operation.kind === "returnValue")) {
    return "value";
  }
  if (operations.some((operation) => operation.kind === "returnString")) {
    return "string";
  }
  if (operations.some((operation) => operation.kind === "returnNumber")) {
    return "number";
  }
  return "void";
}

function isNonExecutableDeclaration(statement: ts.Statement): boolean {
  if (
    ts.isImportDeclaration(statement) ||
    ts.isImportEqualsDeclaration(statement) ||
    ts.isExportDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement)
  ) {
    return true;
  }

  let modifiers: readonly ts.Modifier[] | undefined;
  if (ts.canHaveModifiers(statement)) {
    modifiers = ts.getModifiers(statement);
  }
  return Boolean(modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword));
}

function lowerStatement(
  statement: ts.Statement,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  promotedAggregates: ReadonlySet<string> = new Set()
): JsIrOperation | undefined {
  if (ts.isVariableStatement(statement)) {
    return lowerVariableBinding(statement, bindings, promotedAggregates);
  }

  if (ts.isIfStatement(statement)) {
    return lowerIfStatement(statement, bindings);
  }

  if (ts.isWhileStatement(statement)) {
    return lowerWhileStatement(statement, bindings);
  }

  if (ts.isForStatement(statement)) {
    return lowerForStatement(statement, bindings);
  }

  if (ts.isDoStatement(statement)) {
    return lowerDoWhileStatement(statement, bindings);
  }

  if (ts.isBreakStatement(statement)) {
    return { kind: "break" };
  }

  if (ts.isContinueStatement(statement)) {
    return { kind: "continue" };
  }

  if (ts.isFunctionDeclaration(statement)) {
    return lowerFunctionDeclaration(statement, bindings);
  }

  if (ts.isReturnStatement(statement)) {
    return lowerReturnStatement(statement, bindings);
  }

  if (ts.isExpressionStatement(statement)) {
    return lowerExpressionStatement(statement.expression, bindings);
  }

  return undefined;
}

function lowerExpressionStatement(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  const assignment = lowerAssignmentStatement(expression, bindings);
  if (assignment !== undefined) {
    return assignment;
  }

  const deletion = lowerDeleteExpression(expression, bindings);
  if (deletion !== undefined) {
    return deletion;
  }

  if (ts.isCallExpression(expression)) {
    const runtimeObjectCall = lowerRuntimeObjectCallStatement(expression, bindings);
    if (runtimeObjectCall !== undefined) {
      return runtimeObjectCall;
    }
    const runtimeArrayCall = lowerRuntimeArrayCallStatement(expression, bindings);
    if (runtimeArrayCall !== undefined) {
      return runtimeArrayCall;
    }
  }

  if (!ts.isCallExpression(expression) || !ts.isIdentifier(expression.expression)) {
    return undefined;
  }

  const callOp = lowerCallStatement(expression, bindings);
  if (callOp !== undefined) {
    return callOp;
  }

  if (expression.expression.text !== "print" || expression.arguments.length !== 1) {
    return undefined;
  }

  const [argument] = expression.arguments;
  const printExpression = lowerPrintExpression(argument, bindings);
  if (printExpression !== undefined) {
    return {
      kind: "print",
      expression: printExpression
    };
  }

  return undefined;
}

// eslint-disable-next-line complexity, max-statements -- Delete lowering handles fixed, runtime, and boxed aggregate targets in one place.
function lowerDeleteExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isDeleteExpression(expression)) {
    return undefined;
  }

  const target = expression.expression;
  if (ts.isPropertyAccessExpression(target) && ts.isIdentifier(target.expression)) {
    const binding = bindings.get(target.expression.text);
    if (binding?.kind === "runtimeObject") {
      return { kind: "runtimeObjectDelete", objectName: target.expression.text, key: { kind: "literal", value: target.name.text } };
    }
    if (isProvenBoxedAggregateBinding(binding)) {
      return { kind: "valueObjectDelete", targetName: target.expression.text, key: { kind: "literal", value: target.name.text } };
    }
  }

  if (ts.isElementAccessExpression(target) && ts.isIdentifier(target.expression)) {
    const binding = bindings.get(target.expression.text);
    if (binding?.kind === "runtimeArray") {
      const index = lowerNumberExpression(target.argumentExpression, bindings);
      if (index !== undefined) {
        return { kind: "runtimeArrayDelete", arrayName: target.expression.text, index };
      }
      const stringIndex = lowerCanonicalArrayIndexString(target.argumentExpression);
      if (stringIndex !== undefined) {
        return { kind: "runtimeArrayDelete", arrayName: target.expression.text, index: { kind: "literal", value: stringIndex } };
      }
      const key = lowerPropertyKeyExpression(target.argumentExpression, bindings);
      if (key !== undefined) {
        return { kind: "runtimeArrayNamedDelete", arrayName: target.expression.text, key };
      }
    }
    if (isProvenBoxedAggregateBinding(binding)) {
      const index = lowerNumberExpression(target.argumentExpression, bindings);
      const stringIndex = lowerCanonicalArrayIndexString(target.argumentExpression);
      if (index !== undefined) {
        return { kind: "valueArrayDelete", targetName: target.expression.text, index };
      }
      if (stringIndex !== undefined) {
        return { kind: "valueArrayDelete", targetName: target.expression.text, index: { kind: "literal", value: stringIndex } };
      }
      const key = lowerPropertyKeyExpression(target.argumentExpression, bindings);
      if (key !== undefined) {
        return { kind: "valueObjectDelete", targetName: target.expression.text, key };
      }
    }
    const key = lowerStringRuntimeExpression(target.argumentExpression, bindings);
    if (binding?.kind === "runtimeObject" && key !== undefined) {
      return { kind: "runtimeObjectDelete", objectName: target.expression.text, key };
    }
  }

  return undefined;
}

function lowerForStatement(
  statement: ts.ForStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (
    statement.initializer === undefined ||
    statement.condition === undefined ||
    statement.incrementor === undefined ||
    !ts.isBlock(statement.statement)
  ) {
    return undefined;
  }

  const forBindings = new Map(bindings);
  const initializer = lowerForInitializer(statement.initializer, forBindings);
  if (initializer === undefined) {
    return undefined;
  }
  updateBindings(initializer, forBindings);

  const condition = lowerConditionExpression(statement.condition, forBindings);
  if (condition === undefined) {
    return undefined;
  }

  const increment = lowerAssignmentStatement(statement.incrementor, forBindings);
  if (increment === undefined) {
    return undefined;
  }

  const body = lowerBlockStatements(statement.statement, forBindings);
  if (body === undefined) {
    return undefined;
  }

  return {
    kind: "for",
    initializer,
    condition,
    increment,
    body
  };
}

function lowerForInitializer(
  initializer: ts.ForInitializer,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isVariableDeclarationList(initializer) || initializer.declarations.length !== 1) {
    return undefined;
  }

  const [declaration] = initializer.declarations;
  if (!ts.isIdentifier(declaration.name) || !declaration.initializer || (initializer.flags & ts.NodeFlags.Let) === 0) {
    return undefined;
  }

  const value = lowerNumberExpression(declaration.initializer, bindings);
  if (value === undefined) {
    return undefined;
  }

  return {
    kind: "letNumber",
    name: declaration.name.text,
    value
  };
}

function lowerWhileStatement(
  statement: ts.WhileStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  const condition = lowerConditionExpression(statement.expression, bindings);
  if (condition === undefined || !ts.isBlock(statement.statement)) {
    return undefined;
  }

  const body = lowerBlockStatements(statement.statement, bindings);
  if (body === undefined) {
    return undefined;
  }

  return {
    kind: "while",
    condition,
    body
  };
}

function lowerDoWhileStatement(
  statement: ts.DoStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  const condition = lowerConditionExpression(statement.expression, bindings);
  if (condition === undefined || !ts.isBlock(statement.statement)) {
    return undefined;
  }

  const body = lowerBlockStatements(statement.statement, bindings);
  if (body === undefined) {
    return undefined;
  }

  return {
    kind: "doWhile",
    condition,
    body
  };
}

function lowerPrintExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrExpression | undefined {
  if (ts.isIdentifier(expression) && bindings.has(expression.text)) {
    return {
      kind: "identifier",
      name: expression.text
    };
  }

  const stringPrintExpression = lowerStringPrintExpression(expression, bindings);
  if (stringPrintExpression !== undefined) {
    return stringPrintExpression;
  }

  const numberArgument = lowerNumberExpression(expression, bindings);
  if (numberArgument !== undefined) {
    return {
      kind: "number",
      value: numberArgument
    };
  }

  if (expression.kind === ts.SyntaxKind.TrueKeyword || expression.kind === ts.SyntaxKind.FalseKeyword) {
    return {
      kind: "boolean",
      value: expression.kind === ts.SyntaxKind.TrueKeyword
    };
  }

  const valuePrintExpression = lowerValuePrintExpression(expression, bindings);
  if (valuePrintExpression !== undefined) {
    return valuePrintExpression;
  }

  if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text !== "print") {
    const callee = bindings.get(expression.expression.text);
    const args: JsIrCallArgument[] = [];
    if (callee?.kind === "closure") {
      args.push(...callee.value.captures.map((value) => ({ valueKind: "number" as const, value })));
    }
    const loweredArgs = lowerCallArguments(expression.expression.text, expression.arguments, bindings);
    if (loweredArgs === undefined) {
      return undefined;
    }
    args.push(...loweredArgs);
    let name = expression.expression.text;
    if (callee?.kind === "closure") {
      name = callee.value.functionName;
    }
    return { kind: "call", name, arguments: args };
  }

  return undefined;
}

function lowerValuePrintExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrExpression | undefined {
  const valueArgument = lowerValueExpression(expression, bindings);
  if (valueArgument === undefined) {
    return undefined;
  }
  return { kind: "value", value: valueArgument };
}

function lowerStringPrintExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrExpression | undefined {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return { kind: "string", value: expression.text };
  }

  const stringArgument = lowerStringExpression(expression, bindings);
  if (stringArgument !== undefined) {
    return { kind: "string", value: stringArgument };
  }

  const stringExpression = lowerStringRuntimeExpression(expression, bindings);
  if (stringExpression !== undefined) {
    return { kind: "stringExpression", value: stringExpression };
  }

  return undefined;
}

function lowerIfStatement(
  statement: ts.IfStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  const condition = lowerConditionExpression(statement.expression, bindings);
  if (condition === undefined || !ts.isBlock(statement.thenStatement)) {
    return undefined;
  }

  const thenOperations = lowerBlockStatements(statement.thenStatement, bindings);
  if (thenOperations === undefined) {
    return undefined;
  }

  if (!statement.elseStatement) {
    return {
      kind: "if",
      condition,
      thenOperations,
      elseOperations: []
    };
  }

  if (!ts.isBlock(statement.elseStatement)) {
    return undefined;
  }

  const elseOperations = lowerBlockStatements(statement.elseStatement, bindings);
  if (elseOperations === undefined) {
    return undefined;
  }

  return {
    kind: "if",
    condition,
    thenOperations,
    elseOperations
  };
}

function lowerBlockStatements(
  block: ts.Block,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): readonly JsIrOperation[] | undefined {
  const operations: JsIrOperation[] = [];
  const blockBindings = new Map(bindings);

  for (const statement of block.statements) {
    if (isNonExecutableDeclaration(statement)) {
      continue;
    }

    const operation = lowerStatement(statement, blockBindings);
    if (!operation) {
      return undefined;
    }

    operations.push(operation);
    updateBindings(operation, blockBindings);
  }

  return operations;
}

function lowerFunctionDeclaration(
  statement: ts.FunctionDeclaration,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!statement.name || !statement.body || !ts.isBlock(statement.body)) {
    return undefined;
  }

  const parameters: JsIrFunctionParameter[] = [];
  const fnBindings = new Map(bindings);
  for (const param of statement.parameters) {
    if (!ts.isIdentifier(param.name)) {
      return undefined;
    }
    const valueKind = parameterValueKind(param);
    parameters.push({ name: param.name.text, valueKind });
    if (valueKind === "string") {
      fnBindings.set(param.name.text, { kind: "stringVariable", name: param.name.text });
    } else if (valueKind === "value") {
      fnBindings.set(param.name.text, { kind: "valueVariable", name: param.name.text });
    } else {
      fnBindings.set(param.name.text, {
        kind: "number",
        value: { kind: "parameter", name: param.name.text }
      });
    }
  }

  const body = lowerBlockStatements(statement.body, fnBindings);
  if (body === undefined) {
    return undefined;
  }

  return {
    kind: "function",
    name: statement.name.text,
    parameters,
    body
  };
}

function parameterValueKind(parameter: ts.ParameterDeclaration): JsIrValueKind {
  if (parameter.type?.kind === ts.SyntaxKind.StringKeyword) {
    return "string";
  }
  if (parameter.type?.kind === ts.SyntaxKind.UnknownKeyword || parameter.type?.kind === ts.SyntaxKind.AnyKeyword) {
    return "value";
  }
  return "number";
}

function lowerCallStatement(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isIdentifier(expression.expression)) {
    return undefined;
  }

  if (expression.expression.text === "print") {
    return undefined;
  }

  const args = lowerCallArguments(expression.expression.text, expression.arguments, bindings);
  if (args === undefined) {
    return undefined;
  }

  return {
    kind: "call",
    name: expression.expression.text,
    arguments: args
  };
}

function lowerRuntimeObjectCallStatement(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression)) {
    return undefined;
  }
  if (expression.expression.expression.text !== "Object") {
    return undefined;
  }

  if (expression.expression.name.text === "setPrototypeOf") {
    return lowerRuntimeSetPrototypeCall(expression, bindings);
  }
  if (expression.expression.name.text === "defineProperty") {
    return lowerRuntimeDefinePropertyCall(expression, bindings);
  }
  if (expression.expression.name.text === "defineProperties") {
    return lowerRuntimeDefinePropertiesCall(expression, bindings);
  }
  if (expression.expression.name.text === "preventExtensions") {
    return lowerUnaryRuntimeObjectCall(expression, bindings, "runtimeObjectPreventExtensions");
  }
  if (expression.expression.name.text === "seal") {
    return lowerUnaryRuntimeObjectCall(expression, bindings, "runtimeObjectSeal");
  }
  if (expression.expression.name.text === "freeze") {
    return lowerUnaryRuntimeObjectCall(expression, bindings, "runtimeObjectFreeze");
  }
  if (expression.expression.name.text === "assign") {
    return lowerRuntimeObjectAssignCall(expression, bindings);
  }
  return undefined;
}

function lowerUnaryRuntimeObjectCall(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  kind: "runtimeObjectPreventExtensions" | "runtimeObjectSeal" | "runtimeObjectFreeze"
): JsIrOperation | undefined {
  if (expression.arguments.length !== 1) {
    return undefined;
  }
  const [target] = expression.arguments;
  if (!ts.isIdentifier(target) || bindings.get(target.text)?.kind !== "runtimeObject") {
    return undefined;
  }
  return { kind, objectName: target.text };
}

function lowerRuntimeObjectAssignCall(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (expression.arguments.length < 2) {
    return undefined;
  }
  const [target, ...sourceExpressions] = expression.arguments;
  if (!ts.isIdentifier(target) || bindings.get(target.text)?.kind !== "runtimeObject") {
    return undefined;
  }
  const loweredSources: JsIrObjectAssignSource[] = [];
  for (const source of sourceExpressions) {
    if (!ts.isIdentifier(source)) {
      return undefined;
    }
    const binding = bindings.get(source.text);
    if (binding?.kind === "runtimeObject") {
      loweredSources.push({ kind: "runtimeObject", name: source.text });
      continue;
    }
    if (binding?.kind === "runtimeArray") {
      loweredSources.push({ kind: "runtimeArray", name: source.text });
      continue;
    }
    if (binding?.kind === "object" && !objectHasNestedFields(binding.value)) {
      loweredSources.push({ kind: "fixedObject", value: binding.value });
      continue;
    }
    if (binding?.kind === "array") {
      loweredSources.push({ kind: "fixedArray", name: source.text, length: binding.length });
      continue;
    }
    if (isProvenBoxedAggregateBinding(binding)) {
      const value = lowerValueExpression(source, bindings);
      if (value !== undefined) {
        loweredSources.push({ kind: "value", value });
        continue;
      }
    }
    return undefined;
  }
  return { kind: "runtimeObjectAssign", targetName: target.text, sources: loweredSources };
}

// eslint-disable-next-line complexity -- Runtime array statement methods are centralized while the method surface is small.
function lowerRuntimeArrayCallStatement(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression)) {
    return undefined;
  }
  const arrayName = expression.expression.expression.text;
  if (bindings.get(arrayName)?.kind !== "runtimeArray") {
    return undefined;
  }
  const method = expression.expression.name.text;
  if (method === "push" || method === "unshift") {
    const values = lowerArrayMethodValues(expression.arguments, bindings);
    if (values === undefined) {
      return undefined;
    }
    return { kind: runtimeArrayAppendOperationKind(method), arrayName, values };
  }
  if (method === "pop" || method === "shift") {
    return { kind: runtimeArrayRemoveOperationKind(method), arrayName };
  }
  if (method === "splice") {
    return lowerRuntimeArraySpliceStatement(arrayName, expression.arguments, bindings);
  }
  const fill = lowerRuntimeArrayFillCallStatement(arrayName, method, expression.arguments, bindings);
  if (fill !== undefined) {
    return fill;
  }
  if (method === "reverse") {
    return { kind: "runtimeArrayReverse", arrayName };
  }
  if (method === "copyWithin" && (expression.arguments.length === 2 || expression.arguments.length === arrayCopyWithinArgumentCount)) {
    const target = lowerNumberExpression(expression.arguments[0], bindings);
    const start = lowerNumberExpression(expression.arguments[1], bindings);
    let end: JsIrNumberExpression | undefined;
    if (expression.arguments.length === arrayCopyWithinArgumentCount) {
      end = lowerNumberExpression(expression.arguments[2], bindings);
    }
    if (target !== undefined && start !== undefined && (expression.arguments.length === 2 || end !== undefined)) {
      return { kind: "runtimeArrayCopyWithin", arrayName, target, start, end };
    }
  }
  return undefined;
}

function lowerRuntimeArrayFillCallStatement(
  arrayName: string,
  method: string,
  args: ts.NodeArray<ts.Expression>,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (method !== "fill" || (args.length !== 1 && args.length !== 2 && args.length !== arrayFillRangeArgumentCount)) {
    return undefined;
  }
  const value = lowerValueExpression(args[0], bindings);
  if (value === undefined) {
    return undefined;
  }
  if (args.length === 1) {
    return { kind: "runtimeArrayFill", arrayName, value };
  }
  const start = lowerNumberExpression(args[1], bindings);
  let end: JsIrNumberExpression | undefined;
  if (args.length === arrayFillRangeArgumentCount) {
    end = lowerNumberExpression(args[2], bindings);
  }
  if (start === undefined || (args.length === arrayFillRangeArgumentCount && end === undefined)) {
    return undefined;
  }
  return { kind: "runtimeArrayFill", arrayName, value, start, end };
}

function runtimeArrayAppendOperationKind(method: "push" | "unshift"): "runtimeArrayPush" | "runtimeArrayUnshift" {
  if (method === "push") {
    return "runtimeArrayPush";
  }
  return "runtimeArrayUnshift";
}

function runtimeArrayRemoveOperationKind(method: "pop" | "shift"): "runtimeArrayPop" | "runtimeArrayShift" {
  if (method === "pop") {
    return "runtimeArrayPop";
  }
  return "runtimeArrayShift";
}

function lowerArrayMethodValues(
  args: ts.NodeArray<ts.Expression>,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): readonly JsIrValueExpression[] | undefined {
  const values: JsIrValueExpression[] = [];
  for (const arg of args) {
    const value = lowerValueExpression(arg, bindings);
    if (value === undefined) {
      return undefined;
    }
    values.push(value);
  }
  return values;
}

function lowerRuntimeSetPrototypeCall(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (expression.arguments.length !== 2) {
    return undefined;
  }
  const [target, prototype] = expression.arguments;
  if (!ts.isIdentifier(target)) {
    return undefined;
  }
  const targetBinding = bindings.get(target.text);
  let targetKind: "object" | "array" | undefined;
  if (targetBinding?.kind === "runtimeObject") {
    targetKind = "object";
  }
  if (targetBinding?.kind === "runtimeArray") {
    targetKind = "array";
  }
  if (targetKind === undefined) {
    return undefined;
  }
  if (prototype.kind === ts.SyntaxKind.NullKeyword) {
    return { kind: "runtimeObjectSetPrototype", targetName: target.text, targetKind };
  }
  if (!ts.isIdentifier(prototype) || prototype.text === target.text) {
    return undefined;
  }
  const prototypeBinding = bindings.get(prototype.text);
  if (prototypeBinding?.kind !== "runtimeObject") {
    return undefined;
  }
  return { kind: "runtimeObjectSetPrototype", targetName: target.text, targetKind, prototypeName: prototype.text };
}

function lowerRuntimeDefinePropertyCall(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (expression.arguments.length !== definePropertyArgumentCount) {
    return undefined;
  }
  const [target, keyExpression, descriptorExpression] = expression.arguments;
  if (!ts.isIdentifier(target) || bindings.get(target.text)?.kind !== "runtimeObject") {
    return undefined;
  }
  const key = lowerPropertyKeyExpression(keyExpression, bindings);
  const descriptor = lowerRuntimeDataDescriptor(key, descriptorExpression, bindings);
  if (descriptor === undefined) {
    return undefined;
  }
  return { kind: "runtimeObjectDefineDataProperty", objectName: target.text, descriptor };
}

function lowerRuntimeDefinePropertiesCall(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (expression.arguments.length !== 2) {
    return undefined;
  }
  const [target, descriptorsExpression] = expression.arguments;
  if (!ts.isIdentifier(target) || bindings.get(target.text)?.kind !== "runtimeObject" || !ts.isObjectLiteralExpression(descriptorsExpression)) {
    return undefined;
  }
  const descriptors = lowerRuntimeDataDescriptorMap(descriptorsExpression, bindings);
  if (descriptors === undefined) {
    return undefined;
  }
  return { kind: "runtimeObjectDefineDataProperties", objectName: target.text, descriptors };
}

function lowerRuntimeDataDescriptorMap(
  expression: ts.ObjectLiteralExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): readonly JsIrRuntimeDataDescriptor[] | undefined {
  const descriptors: JsIrRuntimeDataDescriptor[] = [];
  for (const property of expression.properties) {
    if (ts.isSpreadAssignment(property)) {
      if (!ts.isIdentifier(property.expression)) {
        return undefined;
      }
      const source = bindings.get(property.expression.text);
      if (source?.kind !== "runtimeObject" || source.value === undefined) {
        return undefined;
      }
      const spreadDescriptors = lowerRuntimeDataDescriptorMapValue(source.value, bindings);
      if (spreadDescriptors === undefined) {
        return undefined;
      }
      descriptors.push(...spreadDescriptors);
      continue;
    }
    if (ts.isShorthandPropertyAssignment(property)) {
      const descriptor = lowerRuntimeDataDescriptor({ kind: "literal", value: property.name.text }, property.name, bindings);
      if (descriptor === undefined) {
        return undefined;
      }
      descriptors.push(descriptor);
      continue;
    }
    if (!ts.isPropertyAssignment(property)) {
      return undefined;
    }
    const key = lowerRuntimeObjectFieldName(property.name, bindings);
    const descriptor = lowerRuntimeDataDescriptor(key, property.initializer, bindings);
    if (descriptor === undefined) {
      return undefined;
    }
    descriptors.push(descriptor);
  }
  return descriptors;
}

function lowerRuntimeDataDescriptorMapValue(
  value: JsIrRuntimeObjectValue,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): readonly JsIrRuntimeDataDescriptor[] | undefined {
  const descriptors: JsIrRuntimeDataDescriptor[] = [];
  for (const field of value.fields) {
    if (field.kind === "spread" || field.key.kind !== "literal") {
      return undefined;
    }
    const descriptor = lowerRuntimeDataDescriptorValue(field.key, field.value, bindings);
    if (descriptor === undefined) {
      return undefined;
    }
    descriptors.push(descriptor);
  }
  return descriptors;
}

// eslint-disable-next-line complexity, max-statements -- Descriptor literal lowering keeps data descriptor validation in one place.
function lowerRuntimeDataDescriptor(
  key: JsIrStringExpression | undefined,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrRuntimeDataDescriptor | undefined {
  if (key === undefined || !ts.isObjectLiteralExpression(expression)) {
    if (key !== undefined && ts.isIdentifier(expression)) {
      const binding = bindings.get(expression.text);
      if (binding?.kind === "runtimeObject" && binding.value !== undefined) {
        return lowerRuntimeDataDescriptorValue(key, { kind: "objectRef", name: expression.text }, bindings, binding.value);
      }
    }
    return undefined;
  }
  let value: JsIrValueExpression | undefined;
  let writable = false;
  let enumerable = false;
  let configurable = false;
  for (const property of expression.properties) {
    if (ts.isShorthandPropertyAssignment(property)) {
      const booleanValue = lowerBooleanExpression(property.name, bindings);
      if (booleanValue === undefined) {
        return undefined;
      }
      if (property.name.text === "writable") {
        writable = booleanValue;
        continue;
      }
      if (property.name.text === "enumerable") {
        enumerable = booleanValue;
        continue;
      }
      if (property.name.text === "configurable") {
        configurable = booleanValue;
        continue;
      }
      return undefined;
    }
    if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) {
      return undefined;
    }
    if (property.name.text === "value") {
      value = lowerValueExpression(property.initializer, bindings);
      continue;
    }
    const booleanValue = lowerBooleanExpression(property.initializer, bindings);
    if (booleanValue === undefined) {
      return undefined;
    }
    if (property.name.text === "writable") {
      writable = booleanValue;
      continue;
    }
    if (property.name.text === "enumerable") {
      enumerable = booleanValue;
      continue;
    }
    if (property.name.text === "configurable") {
      configurable = booleanValue;
      continue;
    }
    return undefined;
  }
  if (value === undefined) {
    return undefined;
  }
  return { key, value, writable, enumerable, configurable };
}

function lowerRuntimeDataDescriptorValue(
  key: JsIrStringExpression,
  expression: JsIrValueExpression,
  _bindings: ReadonlyMap<string, JsIrBindingValue>,
  literalObject?: JsIrRuntimeObjectValue
): JsIrRuntimeDataDescriptor | undefined {
  const value = literalObject ?? descriptorObjectLiteralForExpression(expression, _bindings);
  if (value === undefined) {
    return undefined;
  }
  let descriptorValue: JsIrValueExpression | undefined;
  let writable = false;
  let enumerable = false;
  let configurable = false;
  for (const field of value.fields) {
    if (field.kind === "spread" || field.key.kind !== "literal") {
      return undefined;
    }
    if (field.key.value === "value") {
      descriptorValue = field.value;
      continue;
    }
    const booleanValue = literalBooleanValue(field.value, _bindings);
    if (booleanValue === undefined) {
      return undefined;
    }
    if (field.key.value === "writable") {
      writable = booleanValue;
      continue;
    }
    if (field.key.value === "enumerable") {
      enumerable = booleanValue;
      continue;
    }
    if (field.key.value === "configurable") {
      configurable = booleanValue;
      continue;
    }
    return undefined;
  }
  if (descriptorValue === undefined) {
    return undefined;
  }
  return { key, value: descriptorValue, writable, enumerable, configurable };
}

function descriptorObjectLiteralForExpression(
  expression: JsIrValueExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrRuntimeObjectValue | undefined {
  if (expression.kind === "objectLiteralValue") {
    return expression.value;
  }
  if (expression.kind !== "objectRef") {
    return undefined;
  }
  const binding = bindings.get(expression.name);
  if (binding?.kind !== "runtimeObject") {
    return undefined;
  }
  return binding.value;
}

function fixedObjectToRuntimeObjectValue(value: JsIrObjectValue): JsIrRuntimeObjectValue | undefined {
  const fields: JsIrRuntimeObjectField[] = [];
  for (const field of value.fields) {
    if (field.value.kind !== "number") {
      return undefined;
    }
    fields.push({ kind: "field", key: { kind: "literal", value: field.name }, value: { kind: "number", value: field.value.value } });
  }
  return { fields };
}

function literalBooleanValue(expression: JsIrValueExpression, bindings: ReadonlyMap<string, JsIrBindingValue>): boolean | undefined {
  if (expression.kind === "boolean" && expression.value.kind === "boolean") {
    return expression.value.value;
  }
  if (expression.kind === "variable") {
    const binding = bindings.get(expression.name);
    if (binding?.kind === "booleanVariable") {
      return binding.initialValue;
    }
  }
  return undefined;
}

function lowerReturnStatement(
  statement: ts.ReturnStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!statement.expression) {
    return undefined;
  }

  const closure = lowerReturnedFunctionExpression(statement.expression, bindings);
  if (closure !== undefined) {
    return closure;
  }

  const stringExpression = lowerStringRuntimeExpression(statement.expression, bindings);
  if (stringExpression !== undefined) {
    return {
      kind: "returnString",
      expression: stringExpression
    };
  }

  const expression = lowerNumberExpression(statement.expression, bindings);
  if (expression !== undefined) {
    return {
      kind: "returnNumber",
      expression
    };
  }

  const valueExpression = lowerValueExpression(statement.expression, bindings);
  if (valueExpression === undefined) {
    return undefined;
  }

  return {
    kind: "returnValue",
    expression: valueExpression
  };
}

function lowerReturnedFunctionExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isFunctionExpression(expression) || !expression.name) {
    return undefined;
  }

  const parameters: string[] = [];
  const nestedBindings = new Map(bindings);
  for (const param of expression.parameters) {
    if (!ts.isIdentifier(param.name)) {
      return undefined;
    }
    parameters.push(param.name.text);
    nestedBindings.set(param.name.text, {
      kind: "number",
      value: { kind: "parameter", name: param.name.text }
    });
  }

  const body = lowerBlockStatements(expression.body, nestedBindings);
  if (body === undefined) {
    return undefined;
  }

  return {
    kind: "returnClosure",
    functionName: expression.name.text,
    parameters,
    captures: collectCapturedParameterNames(body, new Set(parameters), bindings),
    body
  };
}

function collectCapturedParameterNames(
  operations: readonly JsIrOperation[],
  localParameters: ReadonlySet<string>,
  outerBindings: ReadonlyMap<string, JsIrBindingValue>
): readonly string[] {
  const captures: string[] = [];
  const seen = new Set<string>();
  const visitNumber = (expression: JsIrNumberExpression): void => {
    if (expression.kind === "parameter" && !localParameters.has(expression.name) && outerBindings.has(expression.name) && !seen.has(expression.name)) {
      seen.add(expression.name);
      captures.push(expression.name);
      return;
    }
    if (expression.kind === "unary") {
      visitNumber(expression.value);
      return;
    }
    if (expression.kind === "binary") {
      visitNumber(expression.left);
      visitNumber(expression.right);
      return;
    }
    if (expression.kind === "call") {
      for (const arg of expression.arguments) {
        visitNumber(arg);
      }
      return;
    }
    if (expression.kind === "ternary") {
      visitNumber(expression.consequent);
      visitNumber(expression.alternate);
    }
  };

  for (const operation of operations) {
    if (operation.kind === "returnNumber") {
      visitNumber(operation.expression);
    }
  }

  return captures;
}

function lowerVariableBinding(
  statement: ts.VariableStatement,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  promotedAggregates: ReadonlySet<string> = new Set()
): JsIrOperation | undefined {
  if (statement.declarationList.declarations.length !== 1) {
    return undefined;
  }

  const [declaration] = statement.declarationList.declarations;
  if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
    return undefined;
  }

  const isConst = (statement.declarationList.flags & ts.NodeFlags.Const) !== 0;
  const isLet = (statement.declarationList.flags & ts.NodeFlags.Let) !== 0;

  if (isLet) {
    return lowerLetVariableBinding(declaration.name.text, declaration.initializer, bindings);
  }

  if (!isConst) {
    return undefined;
  }

  return lowerConstVariableBinding(
    declaration.name.text,
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

function lowerLetVariableBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  const arrayLiteral = classifyArrayLiteral(initializer, bindings);
  if (arrayLiteral?.kind === "fixed") {
    return {
      kind: "arrayLiteral",
      name,
      elements: arrayLiteral.elements
    };
  }

  if (arrayLiteral?.kind === "runtime") {
    return {
      kind: "runtimeArrayLiteral",
      name,
      elements: arrayLiteral.elements
    };
  }

  const booleanValue = lowerConditionExpression(initializer, bindings);
  if (booleanValue !== undefined) {
    return {
      kind: "letBoolean",
      name,
      value: booleanValue
    };
  }

  const stringValue = lowerStringRuntimeExpression(initializer, bindings);
  if (stringValue !== undefined) {
    return {
      kind: "letString",
      name,
      value: stringValue
    };
  }

  const numberValue = lowerNumberExpression(initializer, bindings);
  if (numberValue === undefined) {
    return undefined;
  }

  return {
    kind: "letNumber",
    name,
    value: numberValue
  };
}

function lowerConstVariableBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  forceValue = false,
  forceRuntimeArray = false,
  forceRuntimeObject = false
): JsIrOperation | undefined {
  const unwrappedInitializer = unwrapTypeOnlyExpression(initializer);
  const aggregateValue = lowerConstAggregateBinding(name, unwrappedInitializer, bindings, forceRuntimeArray, forceRuntimeObject);
  if (aggregateValue !== undefined) {
    return aggregateValue;
  }

  if (forceValue) {
    const value = lowerValueExpression(unwrappedInitializer, bindings);
    if (value === undefined) {
      return undefined;
    }
    return { kind: "constValue", name, value };
  }

  const closureValue = lowerClosureFactoryCall(unwrappedInitializer, bindings);
  if (closureValue !== undefined) {
    return {
      kind: "constClosure",
      name,
      value: closureValue
    };
  }

  const stringValue = lowerStringExpression(unwrappedInitializer, bindings);
  if (stringValue !== undefined) {
    return {
      kind: "constString",
      name,
      value: stringValue
    };
  }

  const stringExpression = lowerStringRuntimeExpression(unwrappedInitializer, bindings);
  if (stringExpression !== undefined) {
    return {
      kind: "constStringExpression",
      name,
      value: stringExpression
    };
  }

  const numberValue = lowerNumberExpression(unwrappedInitializer, bindings);
  if (numberValue !== undefined) {
    return {
      kind: "constNumber",
      name,
      value: numberValue
    };
  }

  const booleanValue = lowerBooleanExpression(unwrappedInitializer, bindings);
  if (booleanValue !== undefined) {
    return {
      kind: "constBoolean",
      name,
      value: booleanValue
    };
  }

  const booleanCondition = lowerConditionExpression(unwrappedInitializer, bindings);
  if (booleanCondition !== undefined) {
    return {
      kind: "constBooleanExpression",
      name,
      value: booleanCondition
    };
  }

  return undefined;
}

function unwrapTypeOnlyExpression(expression: ts.Expression): ts.Expression {
  if (ts.isAsExpression(expression) || ts.isTypeAssertionExpression(expression) || ts.isNonNullExpression(expression)) {
    return unwrapTypeOnlyExpression(expression.expression);
  }
  return expression;
}

// eslint-disable-next-line complexity, max-statements -- Const aggregate binding routes the supported built-in constructors and inspectors.
function lowerConstAggregateBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  forceRuntimeArray = false,
  forceRuntimeObject = false
): JsIrOperation | undefined {
  const arrayLiteral = classifyArrayLiteral(initializer, bindings);
  if (forceRuntimeArray && arrayLiteral?.kind === "fixed") {
    return { kind: "runtimeArrayLiteral", name, elements: arrayLiteral.elements.map((value) => ({ kind: "value", value: { kind: "number", value } })) };
  }
  if (arrayLiteral?.kind === "fixed") {
    return { kind: "arrayLiteral", name, elements: arrayLiteral.elements };
  }
  if (arrayLiteral?.kind === "runtime") {
    return { kind: "runtimeArrayLiteral", name, elements: arrayLiteral.elements };
  }
  const objectLiteral = classifyObjectLiteral(initializer, bindings);
  if (forceRuntimeObject && objectLiteral?.kind === "fixed") {
    const value = fixedObjectToRuntimeObjectValue(objectLiteral.value);
    if (value === undefined) {
      return undefined;
    }
    return { kind: "runtimeObjectLiteral", name, value };
  }
  if (objectLiteral?.kind === "fixed") {
    return { kind: "objectLiteral", name, value: objectLiteral.value, needsRuntimeShadow: false };
  }
  if (objectLiteral?.kind === "runtime") {
    return { kind: "runtimeObjectLiteral", name, value: objectLiteral.value };
  }
  const objectCreate = lowerRuntimeObjectCreateBinding(name, initializer, bindings);
  if (objectCreate !== undefined) {
    return objectCreate;
  }
  const objectKeys = lowerRuntimeObjectKeysBinding(name, initializer, bindings);
  if (objectKeys !== undefined) {
    return objectKeys;
  }
  const objectValues = lowerRuntimeObjectValuesBinding(name, initializer, bindings);
  if (objectValues !== undefined) {
    return objectValues;
  }
  const runtimeExpansion = lowerRuntimeAggregateExpansionBinding(name, initializer, bindings);
  if (runtimeExpansion !== undefined) {
    return runtimeExpansion;
  }
  const descriptor = lowerRuntimeObjectOwnPropertyDescriptorBinding(name, initializer, bindings);
  if (descriptor !== undefined) {
    return descriptor;
  }
  const propertyNames = lowerRuntimeObjectOwnPropertyNamesBinding(name, initializer, bindings);
  if (propertyNames !== undefined) {
    return propertyNames;
  }
  const descriptors = lowerRuntimeObjectOwnPropertyDescriptorsBinding(name, initializer, bindings);
  if (descriptors !== undefined) {
    return descriptors;
  }
  const objectPrototype = lowerRuntimeObjectGetPrototypeBinding(name, initializer, bindings);
  if (objectPrototype !== undefined) {
    return objectPrototype;
  }
  return undefined;
}

function lowerRuntimeAggregateExpansionBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  const objectEntries = lowerRuntimeObjectEntriesBinding(name, initializer, bindings);
  if (objectEntries !== undefined) {
    return objectEntries;
  }
  const fromEntries = lowerRuntimeObjectFromEntriesBinding(name, initializer, bindings);
  if (fromEntries !== undefined) {
    return fromEntries;
  }
  const slice = lowerRuntimeArraySliceBinding(name, initializer, bindings);
  if (slice !== undefined) {
    return slice;
  }
  const concat = lowerRuntimeArrayConcatBinding(name, initializer, bindings);
  if (concat !== undefined) {
    return concat;
  }
  const splice = lowerRuntimeArraySpliceBinding(name, initializer, bindings);
  if (splice !== undefined) {
    return splice;
  }
  const flat = lowerRuntimeArrayFlatBinding(name, initializer, bindings);
  if (flat !== undefined) {
    return flat;
  }
  const mutator = lowerRuntimeArrayMutatorResultBinding(name, initializer, bindings);
  if (mutator !== undefined) {
    return mutator;
  }
  return undefined;
}

function lowerRuntimeArrayMutatorResultBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isCallExpression(initializer) || !ts.isPropertyAccessExpression(initializer.expression) || !ts.isIdentifier(initializer.expression.expression)) {
    return undefined;
  }
  const arrayName = initializer.expression.expression.text;
  if (bindings.get(arrayName)?.kind !== "runtimeArray") {
    return undefined;
  }
  const method = initializer.expression.name.text;
  if (method === "reverse") {
    return { kind: "runtimeArrayMutatorResult", name, arrayName, mutation: { kind: "reverse" } };
  }
  if (method === "fill") {
    const fill = lowerRuntimeArrayFillCallStatement(arrayName, method, initializer.arguments, bindings);
    if (fill?.kind === "runtimeArrayFill") {
      return { kind: "runtimeArrayMutatorResult", name, arrayName, mutation: { kind: "fill", value: fill.value, start: fill.start, end: fill.end } };
    }
  }
  if (method === "copyWithin" && (initializer.arguments.length === 2 || initializer.arguments.length === arrayCopyWithinArgumentCount)) {
    const target = lowerNumberExpression(initializer.arguments[0], bindings);
    const start = lowerNumberExpression(initializer.arguments[1], bindings);
    let end: JsIrNumberExpression | undefined;
    if (initializer.arguments.length === arrayCopyWithinArgumentCount) {
      end = lowerNumberExpression(initializer.arguments[2], bindings);
    }
    if (target !== undefined && start !== undefined && (initializer.arguments.length === 2 || end !== undefined)) {
      return { kind: "runtimeArrayMutatorResult", name, arrayName, mutation: { kind: "copyWithin", target, start, end } };
    }
  }
  return undefined;
}

function lowerRuntimeObjectKeysBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  const target = lowerUnaryObjectAggregateCall(initializer, bindings, "keys");
  if (target === undefined) {
    return undefined;
  }
  return { kind: "runtimeObjectKeys", name, targetName: target.name, targetKind: target.kind };
}

function lowerRuntimeObjectValuesBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  const target = lowerUnaryObjectAggregateCall(initializer, bindings, "values");
  if (target === undefined) {
    return undefined;
  }
  return { kind: "runtimeObjectValues", name, targetName: target.name, targetKind: target.kind };
}

function lowerRuntimeObjectEntriesBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  const target = lowerUnaryObjectAggregateCall(initializer, bindings, "entries");
  if (target === undefined) {
    return undefined;
  }
  return { kind: "runtimeObjectEntries", name, targetName: target.name, targetKind: target.kind };
}

function lowerRuntimeObjectFromEntriesBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isCallExpression(initializer) || initializer.arguments.length !== 1) {
    return undefined;
  }
  const callee = initializer.expression;
  if (!ts.isPropertyAccessExpression(callee) || !ts.isIdentifier(callee.expression) || callee.expression.text !== "Object" || callee.name.text !== "fromEntries") {
    return undefined;
  }
  const [entries] = initializer.arguments;
  if (!ts.isIdentifier(entries) || bindings.get(entries.text)?.kind !== "runtimeArray") {
    return undefined;
  }
  return { kind: "runtimeObjectFromEntries", name, entriesName: entries.text };
}

// eslint-disable-next-line complexity, max-statements -- Descriptor lowering handles object, array, and boxed aggregate receiver shapes.
function lowerRuntimeObjectOwnPropertyDescriptorBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isCallExpression(initializer) || initializer.arguments.length !== 2) {
    return undefined;
  }
  const callee = initializer.expression;
  if (!ts.isPropertyAccessExpression(callee) || !ts.isIdentifier(callee.expression) || callee.expression.text !== "Object" || callee.name.text !== "getOwnPropertyDescriptor") {
    return undefined;
  }
  const [target, keyExpression] = initializer.arguments;
  if (!ts.isIdentifier(target)) {
    return undefined;
  }
  const binding = bindings.get(target.text);
  if (binding?.kind === "runtimeObject" || (binding?.kind === "object" && !objectHasNestedFields(binding.value))) {
    const key = lowerPropertyKeyExpression(keyExpression, bindings);
    if (key !== undefined) {
      return { kind: "runtimeObjectOwnPropertyDescriptor", name, targetName: target.text, targetKind: "object", key };
    }
  }
  if (binding?.kind === "runtimeArray") {
    if (ts.isStringLiteral(keyExpression) && keyExpression.text === "length") {
      return { kind: "runtimeObjectOwnPropertyDescriptor", name, targetName: target.text, targetKind: "array", key: { kind: "literal", value: "length" }, isLength: true };
    }
    const key = lowerPropertyKeyExpression(keyExpression, bindings);
    if (key === undefined) {
      return undefined;
    }
    let index = lowerNumberExpression(keyExpression, bindings);
    const stringIndex = lowerCanonicalArrayIndexString(keyExpression);
    if (stringIndex !== undefined) {
      index = { kind: "literal", value: stringIndex };
    }
    index ??= { kind: "literal", value: -1 };
    return { kind: "runtimeObjectOwnPropertyDescriptor", name, targetName: target.text, targetKind: "array", key, index };
  }
  if (isBoxedAggregateCandidateBinding(binding)) {
    const key = lowerPropertyKeyExpression(keyExpression, bindings);
    if (key === undefined) {
      return undefined;
    }
    if (ts.isStringLiteral(keyExpression) && keyExpression.text === "length") {
      return { kind: "runtimeObjectOwnPropertyDescriptor", name, targetName: target.text, targetKind: "value", key, isLength: true };
    }
    let index = lowerNumberExpression(keyExpression, bindings);
    const stringIndex = lowerCanonicalArrayIndexString(keyExpression);
    if (stringIndex !== undefined) {
      index = { kind: "literal", value: stringIndex };
    }
    return { kind: "runtimeObjectOwnPropertyDescriptor", name, targetName: target.text, targetKind: "value", key, index };
  }
  return undefined;
}

function lowerRuntimeObjectOwnPropertyNamesBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  const target = lowerUnaryObjectAggregateCall(initializer, bindings, "getOwnPropertyNames");
  if (target === undefined) {
    return undefined;
  }
  return { kind: "runtimeObjectOwnPropertyNames", name, targetName: target.name, targetKind: target.kind };
}

function lowerRuntimeObjectOwnPropertyDescriptorsBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  const target = lowerUnaryObjectAggregateCall(initializer, bindings, "getOwnPropertyDescriptors");
  if (target === undefined) {
    return undefined;
  }
  return { kind: "runtimeObjectOwnPropertyDescriptors", name, targetName: target.name, targetKind: target.kind };
}

function lowerRuntimeArraySliceBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isCallExpression(initializer) || !ts.isPropertyAccessExpression(initializer.expression) || !ts.isIdentifier(initializer.expression.expression)) {
    return undefined;
  }
  const arrayName = initializer.expression.expression.text;
  if (initializer.expression.name.text !== "slice" || bindings.get(arrayName)?.kind !== "runtimeArray") {
    return undefined;
  }
  if (initializer.arguments.length > 2) {
    return undefined;
  }
  let start: JsIrNumberExpression | undefined = { kind: "literal", value: 0 };
  if (initializer.arguments.length > 0) {
    start = lowerNumberExpression(initializer.arguments[0], bindings);
  }
  let end: JsIrNumberExpression | undefined;
  if (initializer.arguments.length === 2) {
    end = lowerNumberExpression(initializer.arguments[1], bindings);
  }
  if (start === undefined || (initializer.arguments.length === 2 && end === undefined)) {
    return undefined;
  }
  return { kind: "runtimeArraySlice", name, arrayName, start, end };
}

function lowerRuntimeArrayConcatBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isCallExpression(initializer) || !ts.isPropertyAccessExpression(initializer.expression) || !ts.isIdentifier(initializer.expression.expression)) {
    return undefined;
  }
  const leftName = initializer.expression.expression.text;
  if (initializer.expression.name.text !== "concat" || bindings.get(leftName)?.kind !== "runtimeArray" || initializer.arguments.length === 0) {
    return undefined;
  }
  const values: JsIrRuntimeArrayConcatElement[] = [];
  for (const argument of initializer.arguments) {
    if (ts.isIdentifier(argument)) {
      const binding = bindings.get(argument.text);
      if (binding?.kind === "array") {
        values.push({ kind: "fixedArraySpread", arrayName: argument.text, length: binding.length });
        continue;
      }
    }
    const value = lowerValueExpression(argument, bindings);
    if (value === undefined) {
      return undefined;
    }
    values.push({ kind: "value", value });
  }
  return { kind: "runtimeArrayConcat", name, leftName, values };
}

function lowerRuntimeArraySpliceBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isCallExpression(initializer) || !ts.isPropertyAccessExpression(initializer.expression) || !ts.isIdentifier(initializer.expression.expression)) {
    return undefined;
  }
  const arrayName = initializer.expression.expression.text;
  if (initializer.expression.name.text !== "splice" || bindings.get(arrayName)?.kind !== "runtimeArray") {
    return undefined;
  }
  if (initializer.arguments.length === 0) {
    return undefined;
  }
  const start = lowerNumberExpression(initializer.arguments[0], bindings);
  if (start === undefined) {
    return undefined;
  }
  let deleteCount: JsIrNumberExpression | undefined;
  const items: JsIrValueExpression[] = [];
  for (let index = 1; index < initializer.arguments.length; index += 1) {
    const argument = initializer.arguments[index];
    if (deleteCount === undefined) {
      deleteCount = lowerNumberExpression(argument, bindings);
      if (deleteCount === undefined) {
        return undefined;
      }
      continue;
    }
    const value = lowerValueExpression(argument, bindings);
    if (value === undefined) {
      return undefined;
    }
    items.push(value);
  }
  return { kind: "runtimeArraySplice", name, arrayName, start, deleteCount, items };
}

function lowerRuntimeArraySpliceStatement(
  arrayName: string,
  args: ts.NodeArray<ts.Expression>,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (args.length === 0) {
    return undefined;
  }
  const start = lowerNumberExpression(args[0], bindings);
  if (start === undefined) {
    return undefined;
  }
  let deleteCount: JsIrNumberExpression | undefined;
  const items: JsIrValueExpression[] = [];
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    if (deleteCount === undefined) {
      deleteCount = lowerNumberExpression(argument, bindings);
      if (deleteCount === undefined) {
        return undefined;
      }
      continue;
    }
    const value = lowerValueExpression(argument, bindings);
    if (value === undefined) {
      return undefined;
    }
    items.push(value);
  }
  return { kind: "runtimeArraySpliceStatement", arrayName, start, deleteCount, items };
}

function lowerRuntimeArrayFlatBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isCallExpression(initializer) || !ts.isPropertyAccessExpression(initializer.expression) || !ts.isIdentifier(initializer.expression.expression)) {
    return undefined;
  }
  const arrayName = initializer.expression.expression.text;
  if (initializer.expression.name.text !== "flat" || bindings.get(arrayName)?.kind !== "runtimeArray") {
    return undefined;
  }
  if (initializer.arguments.length > 1) {
    return undefined;
  }
  let depth: JsIrNumberExpression = { kind: "literal", value: 1 };
  if (initializer.arguments.length === 1) {
    const loweredDepth = lowerNumberExpression(initializer.arguments[0], bindings);
    if (loweredDepth === undefined) {
      return undefined;
    }
    depth = loweredDepth;
  }
  return { kind: "runtimeArrayFlat", name, arrayName, depth };
}

function lowerUnaryObjectAggregateCall(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  method: string
): { readonly name: string; readonly kind: "object" | "array" | "value" } | undefined {
  if (!ts.isCallExpression(expression) || expression.arguments.length !== 1) {
    return undefined;
  }
  const callee = expression.expression;
  if (!ts.isPropertyAccessExpression(callee) || !ts.isIdentifier(callee.expression) || callee.expression.text !== "Object" || callee.name.text !== method) {
    return undefined;
  }
  const [target] = expression.arguments;
  if (!ts.isIdentifier(target)) {
    return undefined;
  }
  const binding = bindings.get(target.text);
  if (binding?.kind === "runtimeObject" || (binding?.kind === "object" && !objectHasNestedFields(binding.value))) {
    return { name: target.text, kind: "object" };
  }
  if (binding?.kind === "runtimeArray") {
    return { name: target.text, kind: "array" };
  }
  if (isBoxedAggregateCandidateBinding(binding)) {
    return { name: target.text, kind: "value" };
  }
  return undefined;
}

function lowerRuntimeObjectGetPrototypeBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isCallExpression(initializer) || initializer.arguments.length !== 1) {
    return undefined;
  }
  const callee = initializer.expression;
  if (!ts.isPropertyAccessExpression(callee) || !ts.isIdentifier(callee.expression) || callee.expression.text !== "Object" || callee.name.text !== "getPrototypeOf") {
    return undefined;
  }
  const [target] = initializer.arguments;
  if (!ts.isIdentifier(target)) {
    return undefined;
  }
  const binding = bindings.get(target.text);
  if (binding?.kind === "runtimeObject") {
    return { kind: "runtimeObjectGetPrototype", name, targetName: target.text, targetKind: "object" };
  }
  if (binding?.kind === "runtimeArray") {
    return { kind: "runtimeObjectGetPrototype", name, targetName: target.text, targetKind: "array" };
  }
  return undefined;
}

function lowerRuntimeObjectCreateBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isCallExpression(initializer) || initializer.arguments.length !== 1) {
    return undefined;
  }
  const callee = initializer.expression;
  if (!ts.isPropertyAccessExpression(callee) || !ts.isIdentifier(callee.expression) || callee.expression.text !== "Object" || callee.name.text !== "create") {
    return undefined;
  }
  const [prototype] = initializer.arguments;
  if (prototype.kind === ts.SyntaxKind.NullKeyword) {
    return { kind: "runtimeObjectCreate", name };
  }
  if (!ts.isIdentifier(prototype)) {
    return undefined;
  }
  const binding = bindings.get(prototype.text);
  if (binding?.kind !== "runtimeObject") {
    return undefined;
  }
  return { kind: "runtimeObjectCreate", name, prototypeName: prototype.text };
}

function lowerAssignmentStatement(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isBinaryExpression(expression) || expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken) {
    return undefined;
  }

  if (ts.isElementAccessExpression(expression.left)) {
    return lowerElementAssignment(expression.left, expression.right, bindings);
  }

  if (ts.isPropertyAccessExpression(expression.left)) {
    return lowerObjectPropertyAssignment(expression.left, expression.right, bindings);
  }

  if (!ts.isIdentifier(expression.left)) {
    return undefined;
  }

  const binding = bindings.get(expression.left.text);
  if (binding?.kind === "stringVariable") {
    const value = lowerStringRuntimeExpression(expression.right, bindings);
    if (value === undefined) {
      return undefined;
    }

    return {
      kind: "assignString",
      name: expression.left.text,
      value
    };
  }

  if (binding?.kind === "booleanVariable") {
    const value = lowerConditionExpression(expression.right, bindings);
    if (value === undefined) {
      return undefined;
    }

    return {
      kind: "assignBoolean",
      name: expression.left.text,
      value
    };
  }

  if (binding?.kind !== "number" || binding.value.kind !== "variable") {
    return undefined;
  }

  const value = lowerNumberExpression(expression.right, bindings);
  if (value === undefined) {
    return undefined;
  }

  return {
    kind: "assignNumber",
    name: expression.left.text,
    value
  };
}

// eslint-disable-next-line complexity, max-statements -- Element assignment handles fixed, runtime, and boxed aggregate targets.
function lowerElementAssignment(
  left: ts.ElementAccessExpression,
  right: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  const objectAccess = lowerObjectAccessPath(left, bindings);
  if (objectAccess !== undefined) {
    const objectValue = lowerNumberExpression(right, bindings);
    if (objectValue === undefined) {
      return undefined;
    }
    return { kind: "objectStore", objectName: objectAccess.objectName, path: objectAccess.path, value: objectValue };
  }

  if (!ts.isIdentifier(left.expression)) {
    return undefined;
  }

  const arrayBinding = bindings.get(left.expression.text);
  let index = lowerNumberExpression(left.argumentExpression, bindings);
  if (arrayBinding?.kind === "runtimeArray" && index === undefined) {
    const stringIndex = lowerCanonicalArrayIndexString(left.argumentExpression);
    if (stringIndex !== undefined) {
      index = { kind: "literal", value: stringIndex };
    }
  }
  const value = lowerNumberExpression(right, bindings);
  if (arrayBinding?.kind === "array" && index !== undefined && value !== undefined) {
    return { kind: "arrayStore", arrayName: left.expression.text, index, value };
  }

  const objectStore = lowerObjectElementAssignment(left, right, arrayBinding, bindings);
  if (objectStore !== undefined) {
    return objectStore;
  }

  const runtimeValue = lowerValueExpression(right, bindings);
  if (arrayBinding?.kind === "runtimeArray" && index !== undefined && runtimeValue !== undefined) {
    return { kind: "runtimeArrayStore", arrayName: left.expression.text, index, value: runtimeValue };
  }
  if (arrayBinding?.kind === "runtimeArray" && runtimeValue !== undefined) {
    const key = lowerPropertyKeyExpression(left.argumentExpression, bindings);
    if (key !== undefined) {
      return { kind: "runtimeArrayNamedStore", arrayName: left.expression.text, key, value: runtimeValue };
    }
  }
  if (isProvenBoxedAggregateBinding(arrayBinding) && runtimeValue !== undefined) {
    if (index !== undefined) {
      return { kind: "valueArrayStore", targetName: left.expression.text, index, value: runtimeValue };
    }
    const key = lowerPropertyKeyExpression(left.argumentExpression, bindings);
    if (key !== undefined) {
      return { kind: "valueObjectStore", targetName: left.expression.text, key, value: runtimeValue };
    }
  }

  return undefined;
}

function lowerObjectElementAssignment(
  left: ts.ElementAccessExpression,
  right: ts.Expression,
  binding: JsIrBindingValue | undefined,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (!ts.isIdentifier(left.expression)) {
    return undefined;
  }

  if (binding?.kind === "object") {
    const key = lowerStringExpression(left.argumentExpression, bindings);
    const objectValue = lowerNumberExpression(right, bindings);
    if (key !== undefined && objectValue !== undefined && objectPathExists(binding.value, [key])) {
      return { kind: "objectStore", objectName: left.expression.text, path: [key], value: objectValue };
    }
    return undefined;
  }

  if (binding?.kind !== "runtimeObject") {
    return undefined;
  }

  const key = lowerPropertyKeyExpression(left.argumentExpression, bindings);
  const runtimeValue = lowerValueExpression(right, bindings);
  if (key === undefined || runtimeValue === undefined) {
    return undefined;
  }
  return { kind: "runtimeObjectStore", objectName: left.expression.text, key, value: runtimeValue };
}

function lowerObjectPropertyAssignment(
  left: ts.PropertyAccessExpression,
  right: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrOperation | undefined {
  if (ts.isIdentifier(left.expression)) {
    const binding = bindings.get(left.expression.text);
    if (binding?.kind === "runtimeArray" && left.name.text === "length") {
      const length = lowerNumberExpression(right, bindings);
      if (length !== undefined) {
        return { kind: "runtimeArraySetLength", arrayName: left.expression.text, length };
      }
    }
    if (isProvenBoxedAggregateBinding(binding) && left.name.text === "length") {
      const length = lowerNumberExpression(right, bindings);
      if (length !== undefined) {
        return { kind: "valueArraySetLength", targetName: left.expression.text, length };
      }
    }
    if (binding?.kind === "runtimeObject") {
      const value = lowerValueExpression(right, bindings);
      if (value !== undefined) {
        return { kind: "runtimeObjectStore", objectName: left.expression.text, key: { kind: "literal", value: left.name.text }, value };
      }
    }
    if (isProvenBoxedAggregateBinding(binding)) {
      const value = lowerValueExpression(right, bindings);
      if (value !== undefined) {
        return { kind: "valueObjectStore", targetName: left.expression.text, key: { kind: "literal", value: left.name.text }, value };
      }
    }
  }

  const access = lowerObjectAccessPath(left, bindings);
  const value = lowerNumberExpression(right, bindings);
  if (access === undefined || value === undefined) {
    return undefined;
  }

  return { kind: "objectStore", objectName: access.objectName, path: access.path, value };
}

function lowerClosureFactoryCall(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrClosureValue | undefined {
  if (!ts.isCallExpression(expression) || !ts.isIdentifier(expression.expression)) {
    return undefined;
  }

  const factory = bindings.get(expression.expression.text);
  if (factory?.kind !== "closureFactory") {
    return undefined;
  }
  if (expression.arguments.length !== factory.factoryParameters.length) {
    return undefined;
  }

  const factoryArgs = new Map<string, JsIrNumberExpression>();
  for (let i = 0; i < factory.factoryParameters.length; i++) {
    const argument = expression.arguments[i];
    const lowered = lowerNumberExpression(argument, bindings);
    if (lowered === undefined) {
      return undefined;
    }
    factoryArgs.set(factory.factoryParameters[i], lowered);
  }

  const captures: JsIrNumberExpression[] = [];
  for (const captureName of factory.captureNames) {
    const capture = factoryArgs.get(captureName);
    if (capture === undefined) {
      return undefined;
    }
    captures.push(capture);
  }

  return {
    functionName: factory.functionName,
    captures
  };
}

function lowerStringExpression(expression: ts.Expression, bindings: ReadonlyMap<string, JsIrBindingValue>): string | undefined {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }

  if (ts.isIdentifier(expression)) {
    const binding = bindings.get(expression.text);
    if (binding?.kind !== "string") {
      return undefined;
    }
    return binding.value;
  }

  if (!ts.isBinaryExpression(expression) || expression.operatorToken.kind !== ts.SyntaxKind.PlusToken) {
    return undefined;
  }

  const left = lowerStringExpression(expression.left, bindings);
  const right = lowerStringExpression(expression.right, bindings);
  if (left === undefined || right === undefined) {
    return undefined;
  }

  return left + right;
}

// eslint-disable-next-line complexity, max-statements -- Runtime string lowering is centralized during the JSValue transition.
function lowerStringRuntimeExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrStringExpression | undefined {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return { kind: "literal", value: expression.text };
  }

  if (ts.isIdentifier(expression)) {
    const binding = bindings.get(expression.text);
    if (binding?.kind === "string") {
      return { kind: "literal", value: binding.value };
    }
    if (binding?.kind === "stringExpression") {
      return binding.value;
    }
    if (binding?.kind === "stringVariable") {
      return { kind: "variable", name: binding.name };
    }
  }

  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return lowerStringConcatExpression(expression, bindings);
  }

  if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text !== "print") {
    if (expression.expression.text === "String" && expression.arguments.length === 1) {
      const value = lowerValueExpression(expression.arguments[0], bindings);
      if (value !== undefined) {
        return { kind: "stringConversion", value };
      }
    }
    return lowerStringCallExpression(expression, bindings);
  }

  if (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression) && ts.isIdentifier(expression.expression.expression)) {
    const arrayName = expression.expression.expression.text;
    if (expression.expression.name.text === "join" && bindings.get(arrayName)?.kind === "runtimeArray" && expression.arguments.length === 1) {
      const separator = lowerStringRuntimeExpression(expression.arguments[0], bindings);
      if (separator !== undefined) {
        return { kind: "arrayJoin", arrayName, separator };
      }
    }
  }

  if (ts.isTypeOfExpression(expression)) {
    const typeName = lowerTypeOfResult(expression.expression, bindings);
    if (typeName !== undefined) {
      return { kind: "typeof", value: typeName };
    }
  }

  if (!ts.isConditionalExpression(expression)) {
    return undefined;
  }

  const condition = lowerConditionExpression(expression.condition, bindings);
  const consequent = lowerStringRuntimeExpression(expression.whenTrue, bindings);
  const alternate = lowerStringRuntimeExpression(expression.whenFalse, bindings);
  if (condition === undefined || consequent === undefined || alternate === undefined) {
    return undefined;
  }

  return {
    kind: "ternary",
    condition,
    consequent,
    alternate
  };
}

// eslint-disable-next-line complexity -- Mirrors supported typeof cases explicitly while unsupported expressions stay diagnostic-only.
function lowerTypeOfResult(expression: ts.Expression, bindings: ReadonlyMap<string, JsIrBindingValue>): string | undefined {
  if (expression.kind === ts.SyntaxKind.UndefinedKeyword || (ts.isIdentifier(expression) && expression.text === "undefined")) {
    return "undefined";
  }
  if (expression.kind === ts.SyntaxKind.NullKeyword) {
    return "object";
  }
  if (expression.kind === ts.SyntaxKind.TrueKeyword || expression.kind === ts.SyntaxKind.FalseKeyword) {
    return "boolean";
  }
  if (ts.isNumericLiteral(expression)) {
    return "number";
  }
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return "string";
  }
  if (ts.isIdentifier(expression)) {
    const binding = bindings.get(expression.text);
    if (binding?.kind === "value") {
      if (binding.value.kind === "undefined") return "undefined";
      if (binding.value.kind === "null") return "object";
      if (binding.value.kind === "boolean") return "boolean";
      if (binding.value.kind === "number") return "number";
      if (binding.value.kind === "string") return "string";
    }
    if (binding?.kind === "runtimeObject" || binding?.kind === "runtimeArray") {
      return "object";
    }
    if (binding?.kind === "string" || binding?.kind === "stringExpression" || binding?.kind === "stringVariable") return "string";
    if (binding?.kind === "number") return "number";
    if (binding?.kind === "boolean" || binding?.kind === "booleanExpression" || binding?.kind === "booleanVariable") return "boolean";
  }
  return undefined;
}

function lowerPropertyKeyExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrStringExpression | undefined {
  if (ts.isNumericLiteral(expression)) {
    return { kind: "literal", value: expression.text };
  }
  if (expression.kind === ts.SyntaxKind.TrueKeyword) {
    return { kind: "literal", value: "true" };
  }
  if (expression.kind === ts.SyntaxKind.FalseKeyword) {
    return { kind: "literal", value: "false" };
  }
  return lowerStringRuntimeExpression(expression, bindings);
}

function lowerStringConcatExpression(
  expression: ts.BinaryExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrStringExpression | undefined {
  const left = lowerStringRuntimeExpression(expression.left, bindings);
  const right = lowerStringRuntimeExpression(expression.right, bindings);
  if (left === undefined || right === undefined) {
    return undefined;
  }
  return { kind: "concat", left, right };
}

function lowerStringCallExpression(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrStringExpression | undefined {
  if (!ts.isIdentifier(expression.expression)) {
    return undefined;
  }
  const callee = bindings.get(expression.expression.text);
  if (callee?.kind !== "function" || callee.returnKind !== "string") {
    return undefined;
  }
  const args = lowerCallArguments(expression.expression.text, expression.arguments, bindings);
  if (args === undefined) {
    return undefined;
  }
  return { kind: "call", name: expression.expression.text, arguments: args };
}

function lowerBooleanExpression(expression: ts.Expression, bindings: ReadonlyMap<string, JsIrBindingValue>): boolean | undefined {
  if (expression.kind === ts.SyntaxKind.TrueKeyword || expression.kind === ts.SyntaxKind.FalseKeyword) {
    return expression.kind === ts.SyntaxKind.TrueKeyword;
  }

  if (ts.isIdentifier(expression)) {
    const binding = bindings.get(expression.text);
    if (binding?.kind === "boolean") {
      return binding.value;
    }
    if (binding?.kind === "booleanVariable") {
      return binding.initialValue;
    }
  }

  return undefined;
}

// eslint-disable-next-line complexity, max-statements -- Condition lowering is still centralized while runtime predicates are introduced.
function lowerConditionExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {
  if (ts.isPrefixUnaryExpression(expression) && expression.operator === ts.SyntaxKind.ExclamationToken) {
    const condition = lowerConditionExpression(expression.operand, bindings);
    if (condition === undefined) {
      return undefined;
    }

    return {
      kind: "negate",
      condition
    };
  }

  if (ts.isBinaryExpression(expression)) {
    const logicalCondition = lowerLogicalConditionExpression(expression, bindings);
    if (logicalCondition !== undefined) {
      return logicalCondition;
    }
    const presenceCondition = lowerPresenceConditionExpression(expression, bindings);
    if (presenceCondition !== undefined) {
      return presenceCondition;
    }
  }

  const hasOwnCondition = lowerHasOwnConditionExpression(expression, bindings);
  if (hasOwnCondition !== undefined) {
    return hasOwnCondition;
  }

  const methodSugar = lowerObjectMethodSugarConditionExpression(expression, bindings);
  if (methodSugar !== undefined) {
    return methodSugar;
  }

  const isArray = lowerArrayIsArrayConditionExpression(expression, bindings);
  if (isArray !== undefined) {
    return isArray;
  }

  const everySome = lowerRuntimeArrayEverySomeConditionExpression(expression, bindings);
  if (everySome !== undefined) {
    return everySome;
  }

  const objectIsCondition = lowerObjectIsConditionExpression(expression, bindings);
  if (objectIsCondition !== undefined) {
    return objectIsCondition;
  }

  const objectStateCondition = lowerRuntimeObjectStateCondition(expression, bindings);
  if (objectStateCondition !== undefined) {
    return objectStateCondition;
  }

  if (ts.isIdentifier(expression)) {
    const binding = bindings.get(expression.text);
    if (binding?.kind === "booleanExpression") {
      return binding.value;
    }
    if (binding?.kind === "booleanVariable") {
      return { kind: "booleanVariable", name: binding.name };
    }
  }

  const booleanValue = lowerBooleanExpression(expression, bindings);
  if (booleanValue !== undefined) {
    return {
      kind: "boolean",
      value: booleanValue
    };
  }

  const truthy = lowerTruthyConditionExpression(expression, bindings);
  if (truthy !== undefined) {
    return truthy;
  }

  if (!ts.isBinaryExpression(expression)) {
    return undefined;
  }

  return lowerComparisonConditionExpression(expression, bindings);
}

function lowerTruthyConditionExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {
  if (expression.kind === ts.SyntaxKind.UndefinedKeyword || (ts.isIdentifier(expression) && expression.text === "undefined")) {
    return { kind: "valueTruthy", value: { kind: "undefined" } };
  }
  if (expression.kind === ts.SyntaxKind.NullKeyword) {
    return { kind: "valueTruthy", value: { kind: "null" } };
  }
  if (!ts.isIdentifier(expression)) {
    return undefined;
  }
  const binding = bindings.get(expression.text);
  if (binding?.kind === "runtimeObject" || binding?.kind === "runtimeArray") {
    return { kind: "boolean", value: true };
  }
  if (binding?.kind === "value") {
    return { kind: "valueTruthy", value: binding.value };
  }
  if (binding?.kind === "valueVariable") {
    return { kind: "valueTruthy", value: { kind: "variable", name: binding.name } };
  }
  return undefined;
}

function lowerRuntimeObjectStateCondition(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {
  if (!ts.isCallExpression(expression) || expression.arguments.length !== 1) {
    return undefined;
  }
  const callee = expression.expression;
  if (!ts.isPropertyAccessExpression(callee) || !ts.isIdentifier(callee.expression) || callee.expression.text !== "Object") {
    return undefined;
  }
  const stateByName = new Map<string, "isExtensible" | "isSealed" | "isFrozen">([
    ["isExtensible", "isExtensible"],
    ["isSealed", "isSealed"],
    ["isFrozen", "isFrozen"]
  ]);
  const state = stateByName.get(callee.name.text);
  const [target] = expression.arguments;
  if (state === undefined || !ts.isIdentifier(target) || bindings.get(target.text)?.kind !== "runtimeObject") {
    return undefined;
  }
  return { kind: "runtimeObjectState", objectName: target.text, state };
}

function lowerPresenceConditionExpression(
  expression: ts.BinaryExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {
  if (expression.operatorToken.kind !== ts.SyntaxKind.InKeyword || !ts.isIdentifier(expression.right)) {
    return undefined;
  }
  const binding = bindings.get(expression.right.text);
  if (binding?.kind === "runtimeObject") {
    const key = lowerStringRuntimeExpression(expression.left, bindings);
    if (key !== undefined) {
      return { kind: "runtimeObjectHas", objectName: expression.right.text, key, ownOnly: false };
    }
  }
  if (binding?.kind === "runtimeArray") {
    let index = lowerNumberExpression(expression.left, bindings);
    let key: JsIrStringExpression | undefined;
      if (ts.isNumericLiteral(expression.left)) {
        key = { kind: "literal", value: expression.left.text };
      }
      const stringIndex = lowerCanonicalArrayIndexString(expression.left);
      if (stringIndex !== undefined) {
        index = { kind: "literal", value: stringIndex };
        key = { kind: "literal", value: String(stringIndex) };
      }
      if (index !== undefined) {
        return { kind: "runtimeArrayHas", arrayName: expression.right.text, index, key, ownOnly: false };
      }
      key = lowerPropertyKeyExpression(expression.left, bindings);
      if (key !== undefined) {
        return { kind: "runtimeArrayHas", arrayName: expression.right.text, index: { kind: "literal", value: -1 }, key, ownOnly: false };
      }
    }
  return undefined;
}

function lowerHasOwnConditionExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {
  if (!ts.isCallExpression(expression) || expression.arguments.length !== 2) {
    return undefined;
  }
  const callee = expression.expression;
  if (!ts.isPropertyAccessExpression(callee) || !ts.isIdentifier(callee.expression) || callee.expression.text !== "Object" || callee.name.text !== "hasOwn") {
    return undefined;
  }
  const [target, keyExpression] = expression.arguments;
  if (!ts.isIdentifier(target)) {
    return undefined;
  }
  const binding = bindings.get(target.text);
  if (binding?.kind === "runtimeObject") {
    const key = lowerStringRuntimeExpression(keyExpression, bindings);
    if (key !== undefined) {
      return { kind: "runtimeObjectHas", objectName: target.text, key, ownOnly: true, receiverKind: "object" };
    }
  }
  if (isBoxedAggregateCandidateBinding(binding)) {
    const key = lowerStringRuntimeExpression(keyExpression, bindings);
    if (key !== undefined) {
      return { kind: "runtimeObjectHas", objectName: target.text, key, ownOnly: true, receiverKind: "value" };
    }
  }
  if (binding?.kind === "runtimeArray") {
    let index = lowerNumberExpression(keyExpression, bindings);
    const stringIndex = lowerCanonicalArrayIndexString(keyExpression);
    if (stringIndex !== undefined) {
      index = { kind: "literal", value: stringIndex };
    }
    if (index !== undefined) {
      return { kind: "runtimeArrayHas", arrayName: target.text, index, ownOnly: true };
    }
    const key = lowerPropertyKeyExpression(keyExpression, bindings);
    if (key !== undefined) {
      return { kind: "runtimeArrayHas", arrayName: target.text, index: { kind: "literal", value: -1 }, key, ownOnly: true };
    }
  }
  return undefined;
}

function lowerObjectMethodSugarConditionExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {
  if (!ts.isCallExpression(expression) || expression.arguments.length !== 1 || !ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression)) {
    return undefined;
  }
  const receiver = expression.expression.expression.text;
  const method = expression.expression.name.text;
  if (method !== "hasOwnProperty" && method !== "propertyIsEnumerable") {
    return undefined;
  }
  const binding = bindings.get(receiver);
  const [keyExpression] = expression.arguments;
  if (binding?.kind === "runtimeObject") {
    const key = lowerPropertyKeyExpression(keyExpression, bindings);
    if (key === undefined) {
      return undefined;
    }
    if (method === "hasOwnProperty") {
      return { kind: "runtimeObjectHas", objectName: receiver, key, ownOnly: true };
    }
    return { kind: "runtimeObjectPropertyIsEnumerable", objectName: receiver, key };
  }
  if (binding?.kind === "runtimeArray") {
    let index = lowerNumberExpression(keyExpression, bindings);
    const stringIndex = lowerCanonicalArrayIndexString(keyExpression);
    if (stringIndex !== undefined) {
      index = { kind: "literal", value: stringIndex };
    }
    if (index !== undefined) {
      return { kind: "runtimeArrayHas", arrayName: receiver, index, ownOnly: true };
    }
    const key = lowerPropertyKeyExpression(keyExpression, bindings);
    if (key !== undefined) {
      return { kind: "runtimeArrayHas", arrayName: receiver, index: { kind: "literal", value: -1 }, key, ownOnly: true };
    }
  }
  return undefined;
}

// eslint-disable-next-line complexity -- Array.isArray classification mirrors supported receiver shapes explicitly.
function lowerArrayIsArrayConditionExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {
  if (!ts.isCallExpression(expression) || expression.arguments.length !== 1) {
    return undefined;
  }
  const callee = expression.expression;
  if (!ts.isPropertyAccessExpression(callee) || !ts.isIdentifier(callee.expression) || callee.expression.text !== "Array" || callee.name.text !== "isArray") {
    return undefined;
  }
  const [arg] = expression.arguments;
  if ((ts.isIdentifier(arg) && arg.text === "undefined") || arg.kind === ts.SyntaxKind.UndefinedKeyword || arg.kind === ts.SyntaxKind.NullKeyword || arg.kind === ts.SyntaxKind.TrueKeyword || arg.kind === ts.SyntaxKind.FalseKeyword || ts.isNumericLiteral(arg) || ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
    return { kind: "runtimeArrayIsArray", value: false };
  }
  if (!ts.isIdentifier(arg)) {
    const objectLiteral = classifyObjectLiteral(arg, bindings);
    if (objectLiteral !== undefined) {
      return { kind: "runtimeArrayIsArray", value: false };
    }
    const arrayLiteral = classifyArrayLiteral(arg, bindings);
    if (arrayLiteral !== undefined) {
      return { kind: "runtimeArrayIsArray", value: true };
    }
    return undefined;
  }
  const binding = bindings.get(arg.text);
  if (binding?.kind === "array") {
    return { kind: "runtimeArrayIsArray", value: true };
  }
  if (binding?.kind === "runtimeArray") {
    return { kind: "runtimeArrayIsArray", value: true };
  }
  if (binding?.kind === "runtimeObject") {
    return { kind: "runtimeArrayIsArray", value: false };
  }
  if (isBoxedAggregateCandidateBinding(binding)) {
    const value = lowerValueExpression(arg, bindings);
    if (value !== undefined) {
      return { kind: "runtimeArrayIsArray", value };
    }
  }
  return undefined;
}

function lowerRuntimeArrayEverySomeConditionExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {
  if (!ts.isCallExpression(expression)) {
    return undefined;
  }
  if (expression.arguments.length > 0) {
    return undefined;
  }
  const callee = expression.expression;
  if (!ts.isPropertyAccessExpression(callee)) {
    return undefined;
  }
  let receiver: ts.Expression = callee.expression;
  while (ts.isParenthesizedExpression(receiver)) {
    receiver = receiver.expression;
  }
  receiver = unwrapTypeOnlyExpression(receiver);
  if (!ts.isIdentifier(receiver)) {
    return undefined;
  }
  if (bindings.get(receiver.text)?.kind !== "runtimeArray") {
    return undefined;
  }
  if (callee.name.text === "every") {
    return { kind: "runtimeArrayEvery", arrayName: receiver.text };
  }
  if (callee.name.text === "some") {
    return { kind: "runtimeArraySome", arrayName: receiver.text };
  }
  return undefined;
}

function lowerObjectIsConditionExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {
  if (!ts.isCallExpression(expression) || expression.arguments.length !== 2) {
    return undefined;
  }
  const callee = expression.expression;
  if (!ts.isPropertyAccessExpression(callee) || !ts.isIdentifier(callee.expression) || callee.expression.text !== "Object" || callee.name.text !== "is") {
    return undefined;
  }
  const [leftArg, rightArg] = expression.arguments;
  let left: ts.Expression = leftArg;
  let right: ts.Expression = rightArg;
  while (ts.isParenthesizedExpression(left)) {
    left = left.expression;
  }
  while (ts.isParenthesizedExpression(right)) {
    right = right.expression;
  }
  left = unwrapTypeOnlyExpression(left);
  right = unwrapTypeOnlyExpression(right);
  const leftValue = lowerValueExpression(left, bindings);
  const rightValue = lowerValueExpression(right, bindings);
  if (leftValue === undefined || rightValue === undefined) {
    return undefined;
  }
  return { kind: "objectIs", left: leftValue, right: rightValue };
}

function lowerComparisonConditionExpression(
  expression: ts.BinaryExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {

  const operator = lowerComparisonOperator(expression.operatorToken.kind);
  if (operator === undefined) {
    return undefined;
  }

  const stringComparison = lowerStringComparisonExpression(expression, operator, bindings);
  if (stringComparison !== undefined) {
    return stringComparison;
  }

  const booleanComparison = lowerBooleanComparisonExpression(expression, operator, bindings);
  if (booleanComparison !== undefined) {
    return booleanComparison;
  }

  const left = lowerNumberExpression(expression.left, bindings);
  const right = lowerNumberExpression(expression.right, bindings);
  if (left !== undefined && right !== undefined) {
    return {
      kind: "numberComparison",
      operator,
      left,
      right
    };
  }

  return lowerValueComparisonExpression(expression, operator, bindings);
}

function lowerStringComparisonExpression(
  expression: ts.BinaryExpression,
  operator: "===" | "!==" | "<" | "<=" | ">" | ">=",
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {
  if (operator !== "===" && operator !== "!==") {
    return undefined;
  }

  const left = lowerStringExpression(expression.left, bindings);
  const right = lowerStringExpression(expression.right, bindings);
  if (left !== undefined && right !== undefined) {
    let value = left === right;
    if (operator === "!==") {
      value = !value;
    }

    return { kind: "boolean", value };
  }

  const runtimeLeft = lowerStringRuntimeExpression(expression.left, bindings);
  const runtimeRight = lowerStringRuntimeExpression(expression.right, bindings);
  if (runtimeLeft === undefined || runtimeRight === undefined) {
    return undefined;
  }

  return { kind: "stringComparison", operator, left: runtimeLeft, right: runtimeRight };
}

function lowerBooleanComparisonExpression(
  expression: ts.BinaryExpression,
  operator: "===" | "!==" | "<" | "<=" | ">" | ">=",
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {
  if (operator !== "===" && operator !== "!==") {
    return undefined;
  }

  const left = lowerBooleanOperandExpression(expression.left, bindings);
  const right = lowerBooleanOperandExpression(expression.right, bindings);
  if (left === undefined || right === undefined) {
    return undefined;
  }

  return { kind: "booleanComparison", operator, left, right };
}

function lowerBooleanOperandExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {
  if (expression.kind === ts.SyntaxKind.TrueKeyword || expression.kind === ts.SyntaxKind.FalseKeyword) {
    return { kind: "boolean", value: expression.kind === ts.SyntaxKind.TrueKeyword };
  }

  if (!ts.isIdentifier(expression)) {
    return undefined;
  }

  const binding = bindings.get(expression.text);
  if (binding?.kind === "boolean") {
    return { kind: "boolean", value: binding.value };
  }
  if (binding?.kind === "booleanExpression") {
    return binding.value;
  }
  if (binding?.kind === "booleanVariable") {
    return { kind: "booleanVariable", name: binding.name };
  }

  return undefined;
}

function lowerValueComparisonExpression(
  expression: ts.BinaryExpression,
  operator: "===" | "!==" | "<" | "<=" | ">" | ">=",
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {
  if (operator !== "===" && operator !== "!==") {
    return undefined;
  }

  const left = lowerValueExpression(expression.left, bindings);
  const right = lowerValueExpression(expression.right, bindings);
  if (left === undefined || right === undefined) {
    return undefined;
  }

  return { kind: "valueComparison", operator, left, right };
}

function lowerValueExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  const directValue = lowerDirectValueExpression(expression, bindings);
  if (directValue !== undefined) {
    return directValue;
  }

  const aggregateValue = lowerAggregateValueExpression(expression, bindings);
  if (aggregateValue !== undefined) {
    return aggregateValue;
  }

  const stringValue = lowerStringRuntimeExpression(expression, bindings);
  if (stringValue !== undefined) {
    return { kind: "string", value: stringValue };
  }

  const numberValue = lowerNumberExpression(expression, bindings);
  if (numberValue !== undefined) {
    return { kind: "number", value: numberValue };
  }

  const booleanValue = lowerConditionExpression(expression, bindings);
  if (booleanValue !== undefined) {
    return { kind: "boolean", value: booleanValue };
  }

  return undefined;
}

function lowerAggregateValueExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  if (ts.isObjectLiteralExpression(expression)) {
    const value = lowerRuntimeObjectLiteralExpression(expression, bindings);
    if (value !== undefined) {
      return { kind: "objectLiteralValue", value };
    }
  }

  if (ts.isElementAccessExpression(expression)) {
    if (ts.isIdentifier(expression.expression)) {
      const arrayAccess = lowerRuntimeArrayValueAccess(expression, bindings);
      if (arrayAccess !== undefined) {
        return arrayAccess;
      }
      const objectAccess = lowerRuntimeObjectElementValueAccess(expression, bindings);
      if (objectAccess !== undefined) {
        return objectAccess;
      }
    }
    const valueAccess = lowerValueElementAccess(expression, bindings);
    if (valueAccess !== undefined) {
      return valueAccess;
    }
  }

  if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
    const binding = bindings.get(expression.expression.text);
    if (binding?.kind === "runtimeObject") {
      return { kind: "objectDynamicAccess", objectName: expression.expression.text, key: { kind: "literal", value: expression.name.text } };
    }
    if (isBoxedAggregateCandidateBinding(binding)) {
      const value = lowerValueExpression(expression.expression, bindings);
      if (value !== undefined) {
        return { kind: "valueObjectDynamicAccess", value, key: { kind: "literal", value: expression.name.text } };
      }
    }
  }

  if (ts.isIdentifier(expression)) {
    const binding = bindings.get(expression.text);
    if (binding?.kind === "runtimeObject") {
      return { kind: "objectRef", name: expression.text };
    }
    if (binding?.kind === "runtimeArray") {
      return { kind: "arrayRef", name: expression.text };
    }
  }

  return undefined;
}

function lowerValueElementAccess(
  expression: ts.ElementAccessExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  const value = lowerValueElementReceiver(expression.expression, bindings);
  if (value === undefined) {
    return undefined;
  }
  let index = lowerNumberExpression(expression.argumentExpression, bindings);
  const stringIndex = lowerCanonicalArrayIndexString(expression.argumentExpression);
  if (stringIndex !== undefined) {
    index = { kind: "literal", value: stringIndex };
  }
  if (index !== undefined) {
    let keyValue = "0";
    if (index.kind === "literal") {
      keyValue = String(index.value);
    }
    return { kind: "valueArrayAccess", value, index, key: { kind: "literal", value: keyValue } };
  }
  const key = lowerPropertyKeyExpression(expression.argumentExpression, bindings);
  if (key !== undefined) {
    return { kind: "valueObjectDynamicAccess", value, key };
  }
  return undefined;
}

function lowerValueElementReceiver(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  if (ts.isElementAccessExpression(expression)) {
    return lowerValueExpression(expression, bindings);
  }
  if (!ts.isIdentifier(expression)) {
    return undefined;
  }
  const binding = bindings.get(expression.text);
  if (!isBoxedAggregateCandidateBinding(binding)) {
    return undefined;
  }
  return lowerValueExpression(expression, bindings);
}

function lowerRuntimeArrayValueAccess(
  expression: ts.ElementAccessExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  if (!ts.isIdentifier(expression.expression) || bindings.get(expression.expression.text)?.kind !== "runtimeArray") {
    return undefined;
  }
  let index = lowerNumberExpression(expression.argumentExpression, bindings);
  let key: JsIrStringExpression | undefined;
  const stringIndex = lowerCanonicalArrayIndexString(expression.argumentExpression);
  if (stringIndex !== undefined) {
    index = { kind: "literal", value: stringIndex };
    key = { kind: "literal", value: String(stringIndex) };
  }
  if (index !== undefined) {
    if (ts.isNumericLiteral(expression.argumentExpression)) {
      key = { kind: "literal", value: expression.argumentExpression.text };
    }
    return { kind: "arrayAccess", arrayName: expression.expression.text, index, key };
  }
  if (ts.isStringLiteral(expression.argumentExpression) && expression.argumentExpression.text === "length") {
    return { kind: "number", value: { kind: "arrayLength", arrayName: expression.expression.text } };
  }
  key = lowerPropertyKeyExpression(expression.argumentExpression, bindings);
  if (key !== undefined) {
    return { kind: "arrayAccess", arrayName: expression.expression.text, index: { kind: "literal", value: -1 }, key };
  }
  return undefined;
}

function lowerRuntimeObjectElementValueAccess(
  expression: ts.ElementAccessExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  if (!ts.isIdentifier(expression.expression)) {
    return undefined;
  }
  const binding = bindings.get(expression.expression.text);
  if (binding?.kind !== "object" && binding?.kind !== "runtimeObject") {
    return undefined;
  }
  if (binding.kind === "object" && objectHasNestedFields(binding.value)) {
    return undefined;
  }
  const key = lowerPropertyKeyExpression(expression.argumentExpression, bindings);
  if (key === undefined) {
    return undefined;
  }
  return { kind: "objectDynamicAccess", objectName: expression.expression.text, key };
}

function lowerDirectValueExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  if (expression.kind === ts.SyntaxKind.UndefinedKeyword || (ts.isIdentifier(expression) && expression.text === "undefined")) {
    return { kind: "undefined" };
  }

  if (expression.kind === ts.SyntaxKind.NullKeyword) {
    return { kind: "null" };
  }

  if (ts.isIdentifier(expression)) {
    const binding = bindings.get(expression.text);
    if (binding?.kind === "value") {
      return binding.value;
    }
    if (binding?.kind === "valueVariable") {
      return { kind: "variable", name: binding.name };
    }
  }

  if (ts.isConditionalExpression(expression)) {
    return lowerValueConditionalExpression(expression, bindings);
  }

  if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text !== "print") {
    return lowerValueCallExpression(expression, bindings);
  }

  if (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression)) {
    return lowerArrayValueMethodCall(expression, bindings);
  }

  return undefined;
}

function lowerArrayValueMethodCall(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  if (!ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression)) {
    return undefined;
  }
  const arrayName = expression.expression.expression.text;
  if (bindings.get(arrayName)?.kind !== "runtimeArray") {
    return undefined;
  }
  const method = expression.expression.name.text;
  if (method === "pop" || method === "shift") {
    return { kind: arrayRemoveValueExpressionKind(method), arrayName };
  }
  if (method === "includes" && expression.arguments.length === 1) {
    const value = lowerValueExpression(expression.arguments[0], bindings);
    if (value !== undefined) {
      return { kind: "arrayIncludes", arrayName, value };
    }
  }
  if (method === "at" && expression.arguments.length === 1) {
    const index = lowerNumberExpression(expression.arguments[0], bindings);
    if (index !== undefined) {
      return { kind: "arrayAt", arrayName, index };
    }
  }
  return undefined;
}

function arrayRemoveValueExpressionKind(method: "pop" | "shift"): "arrayPop" | "arrayShift" {
  if (method === "pop") {
    return "arrayPop";
  }
  return "arrayShift";
}

function lowerValueConditionalExpression(
  expression: ts.ConditionalExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  const condition = lowerConditionExpression(expression.condition, bindings);
  const consequent = lowerValueExpression(expression.whenTrue, bindings);
  const alternate = lowerValueExpression(expression.whenFalse, bindings);
  if (condition === undefined || consequent === undefined || alternate === undefined) {
    return undefined;
  }
  return { kind: "ternary", condition, consequent, alternate };
}

function lowerValueCallExpression(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrValueExpression | undefined {
  if (!ts.isIdentifier(expression.expression)) {
    return undefined;
  }
  const callee = bindings.get(expression.expression.text);
  if (callee?.kind !== "function" || callee.returnKind !== "value") {
    return undefined;
  }
  const args = lowerCallArguments(expression.expression.text, expression.arguments, bindings);
  if (args === undefined) {
    return undefined;
  }
  return { kind: "call", name: expression.expression.text, arguments: args };
}

function lowerLogicalConditionExpression(
  expression: ts.BinaryExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCondition | undefined {
  if (
    expression.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken &&
    expression.operatorToken.kind !== ts.SyntaxKind.BarBarToken
  ) {
    return undefined;
  }

  const left = lowerConditionExpression(expression.left, bindings);
  const right = lowerConditionExpression(expression.right, bindings);
  if (left === undefined || right === undefined) {
    return undefined;
  }

  if (expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    return { kind: "and", left, right };
  }

  return { kind: "or", left, right };
}

function lowerComparisonOperator(kind: ts.SyntaxKind): "===" | "!==" | "<" | "<=" | ">" | ">=" | undefined {
  switch (kind) {
    case ts.SyntaxKind.EqualsEqualsEqualsToken: {
      return "===";
    }
    case ts.SyntaxKind.ExclamationEqualsEqualsToken: {
      return "!==";
    }
    case ts.SyntaxKind.LessThanToken: {
      return "<";
    }
    case ts.SyntaxKind.LessThanEqualsToken: {
      return "<=";
    }
    case ts.SyntaxKind.GreaterThanToken: {
      return ">";
    }
    case ts.SyntaxKind.GreaterThanEqualsToken: {
      return ">=";
    }
    default: {
      return undefined;
    }
  }
}

// eslint-disable-next-line complexity -- Numeric literal/identifier/NaN/prefix-unary recognition centralizes the canonical JSValue conversion paths.
function lowerNumberExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrNumberExpression | undefined {
  if (ts.isNumericLiteral(expression)) {
    return {
      kind: "literal",
      value: Number(expression.text)
    };
  }

  if (ts.isIdentifier(expression)) {
    if (expression.text === "NaN") {
      return { kind: "nan" };
    }
    const binding = bindings.get(expression.text);
    if (binding?.kind !== "number") {
      return undefined;
    }
    return binding.value;
  }

  if (
    ts.isPrefixUnaryExpression(expression) &&
    expression.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(expression.operand) &&
    expression.operand.text === "0"
  ) {
    return { kind: "negatedZero" };
  }

  if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text !== "print") {
    return lowerNumberCallExpression(expression, bindings);
  }

  if (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression)) {
    const method = lowerArrayNumberMethodCall(expression, bindings);
    if (method !== undefined) {
      return method;
    }
  }

  const access = lowerNumberAccessExpression(expression, bindings);
  if (access !== undefined) {
    return access;
  }

  if (ts.isPrefixUnaryExpression(expression) && expression.operator === ts.SyntaxKind.MinusToken) {
    const value = lowerNumberExpression(expression.operand, bindings);
    if (value === undefined) {
      return undefined;
    }

    return {
      kind: "unary",
      operator: "negate",
      value
    };
  }

  if (ts.isConditionalExpression(expression)) {
    return lowerNumberConditionalExpression(expression, bindings);
  }

  if (!ts.isBinaryExpression(expression)) {
    return undefined;
  }

  return lowerNumberBinaryExpression(expression, bindings);
}

function lowerArrayNumberMethodCall(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrNumberExpression | undefined {
  if (!ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression)) {
    return undefined;
  }
  const arrayName = expression.expression.expression.text;
  if (bindings.get(arrayName)?.kind !== "runtimeArray") {
    return undefined;
  }
  const method = expression.expression.name.text;
  if (method !== "push" && method !== "unshift") {
    if ((method === "indexOf" || method === "lastIndexOf") && expression.arguments.length === 1) {
      const value = lowerValueExpression(expression.arguments[0], bindings);
      if (value !== undefined) {
        return { kind: "arrayIndexOf", arrayName, value, fromEnd: method === "lastIndexOf" };
      }
    }
    return undefined;
  }
  const values = lowerArrayMethodValues(expression.arguments, bindings);
  if (values === undefined) {
    return undefined;
  }
  return { kind: arrayAppendNumberExpressionKind(method), arrayName, values };
}

function arrayAppendNumberExpressionKind(method: "push" | "unshift"): "arrayPush" | "arrayUnshift" {
  if (method === "push") {
    return "arrayPush";
  }
  return "arrayUnshift";
}

function lowerNumberAccessExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrNumberExpression | undefined {
  if (ts.isElementAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
    const binding = bindings.get(expression.expression.text);
    const index = lowerNumberExpression(expression.argumentExpression, bindings);
    if (binding?.kind === "array" && index !== undefined) {
      return { kind: "arrayAccess", arrayName: expression.expression.text, index };
    }

    const access = lowerObjectAccessPath(expression, bindings);
    if (access !== undefined) {
      return { kind: "objectAccess", objectName: access.objectName, path: access.path };
    }
  }

  if (ts.isPropertyAccessExpression(expression)) {
    const access = lowerObjectAccessPath(expression, bindings);
    if (access !== undefined) {
      return { kind: "objectAccess", objectName: access.objectName, path: access.path };
    }
    if (expression.name.text === "length" && ts.isIdentifier(expression.expression)) {
      const binding = bindings.get(expression.expression.text);
      if (binding?.kind === "array" || binding?.kind === "runtimeArray") {
        return { kind: "arrayLength", arrayName: expression.expression.text };
      }
      if (isBoxedAggregateCandidateBinding(binding)) {
        const value = lowerValueExpression(expression.expression, bindings);
        if (value !== undefined) {
          return { kind: "valueArrayLength", value };
        }
      }
    }
  }

  return undefined;
}

function isBoxedAggregateCandidateBinding(binding: JsIrBindingValue | undefined): boolean {
  if (binding?.kind === "valueVariable") {
    return true;
  }
  if (binding?.kind !== "value") {
    return false;
  }
  return binding.value.kind === "objectRef" || binding.value.kind === "arrayRef" || binding.value.kind === "objectDynamicAccess" || binding.value.kind === "arrayAccess" || binding.value.kind === "valueObjectDynamicAccess" || binding.value.kind === "valueArrayAccess";
}

function isProvenBoxedAggregateBinding(binding: JsIrBindingValue | undefined): boolean {
  if (binding?.kind !== "value") {
    return false;
  }
  return binding.value.kind === "objectRef" || binding.value.kind === "arrayRef" || binding.value.kind === "objectDynamicAccess" || binding.value.kind === "arrayAccess" || binding.value.kind === "valueObjectDynamicAccess" || binding.value.kind === "valueArrayAccess";
}

function lowerNumberBinaryExpression(
  expression: ts.BinaryExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrNumberExpression | undefined {
  const left = lowerNumberExpression(expression.left, bindings);
  const right = lowerNumberExpression(expression.right, bindings);
  if (left === undefined || right === undefined) {
    return undefined;
  }

  const operator = lowerNumberOperator(expression.operatorToken.kind);
  if (operator === undefined) {
    return undefined;
  }

  return {
    kind: "binary",
    operator,
    left,
    right
  };
}

function lowerNumberConditionalExpression(
  expression: ts.ConditionalExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrNumberExpression | undefined {
  const condition = lowerConditionExpression(expression.condition, bindings);
  const consequent = lowerNumberExpression(expression.whenTrue, bindings);
  const alternate = lowerNumberExpression(expression.whenFalse, bindings);
  if (condition === undefined || consequent === undefined || alternate === undefined) {
    return undefined;
  }

  return {
    kind: "ternary",
    condition,
    consequent,
    alternate
  };
}

function lowerNumberCallExpression(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrNumberExpression | undefined {
  if (!ts.isIdentifier(expression.expression)) {
    return undefined;
  }

  const callee = bindings.get(expression.expression.text);
  const args: JsIrNumberExpression[] = [];
  let name = expression.expression.text;
  if (callee?.kind === "closure") {
    args.push(...callee.value.captures);
    name = callee.value.functionName;
  } else if (callee?.kind === "function" && (callee.returnKind === "string" || callee.returnKind === "value")) {
    return undefined;
  }

  const loweredArgs = lowerCallArguments(expression.expression.text, expression.arguments, bindings);
  if (loweredArgs === undefined) {
    return undefined;
  }
  for (const arg of loweredArgs) {
    if (arg.valueKind !== "number") {
      return undefined;
    }
    args.push(arg.value);
  }

  return { kind: "call", name, arguments: args };
}

function lowerCallArguments(
  name: string,
  args: ts.NodeArray<ts.Expression>,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): readonly JsIrCallArgument[] | undefined {
  const callee = bindings.get(name);
  if (callee?.kind === "function") {
    return lowerTypedCallArguments(callee.parameters, args, bindings);
  }

  const lowered: JsIrCallArgument[] = [];
  for (const arg of args) {
    const value = lowerNumberExpression(arg, bindings);
    if (value === undefined) {
      return undefined;
    }
    lowered.push({ valueKind: "number", value });
  }
  return lowered;
}

function lowerTypedCallArguments(
  parameters: readonly JsIrFunctionParameter[],
  args: ts.NodeArray<ts.Expression>,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): readonly JsIrCallArgument[] | undefined {
  if (parameters.length !== args.length) {
    return undefined;
  }
  const lowered: JsIrCallArgument[] = [];
  for (let i = 0; i < parameters.length; i++) {
    const parameter = parameters[i];
    const arg = args[i];
    const value = lowerTypedCallArgument(parameter, arg, bindings);
    if (value === undefined) {
      return undefined;
    }
    lowered.push(value);
  }
  return lowered;
}

function lowerTypedCallArgument(
  parameter: JsIrFunctionParameter,
  arg: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrCallArgument | undefined {
  if (parameter.valueKind === "string") {
    const value = lowerStringRuntimeExpression(arg, bindings);
    if (value === undefined) {
      return undefined;
    }
    return { valueKind: "string", value };
  }
  if (parameter.valueKind === "value") {
    const value = lowerValueExpression(arg, bindings);
    if (value === undefined) {
      return undefined;
    }
    return { valueKind: "value", value };
  }
  const value = lowerNumberExpression(arg, bindings);
  if (value === undefined) {
    return undefined;
  }
  return { valueKind: "number", value };
}

function lowerNumberOperator(kind: ts.SyntaxKind): JsIrNumberOperator | undefined {
  switch (kind) {
    case ts.SyntaxKind.PlusToken: {
      return "add";
    }
    case ts.SyntaxKind.MinusToken: {
      return "subtract";
    }
    case ts.SyntaxKind.AsteriskToken: {
      return "multiply";
    }
    case ts.SyntaxKind.SlashToken: {
      return "divide";
    }
    default: {
      return undefined;
    }
  }
}

function lowerCanonicalArrayIndexString(expression: ts.Expression): number | undefined {
  if (!ts.isStringLiteral(expression)) {
    return undefined;
  }
  if (expression.text === "0") {
    return 0;
  }
  if (!/^[1-9][0-9]*$/.test(expression.text)) {
    return undefined;
  }
  const value = Number(expression.text);
  if (!Number.isSafeInteger(value)) {
    return undefined;
  }
  return value;
}

function lowerArrayLiteralExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): readonly JsIrNumberExpression[] | undefined {
  if (!ts.isArrayLiteralExpression(expression)) {
    return undefined;
  }

  const elements: JsIrNumberExpression[] = [];
  for (const element of expression.elements) {
    if (ts.isSpreadElement(element) && ts.isIdentifier(element.expression)) {
      const binding = bindings.get(element.expression.text);
      if (binding?.kind !== "array") {
        return undefined;
      }
      for (let index = 0; index < binding.length; index++) {
        elements.push({ kind: "arrayAccess", arrayName: element.expression.text, index: { kind: "literal", value: index } });
      }
      continue;
    }
    const value = lowerNumberExpression(element, bindings);
    if (value === undefined) {
      return undefined;
    }
    elements.push(value);
  }
  return elements;
}

function classifyArrayLiteral(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): ArrayLiteralClassification | undefined {
  const fixed = lowerArrayLiteralExpression(expression, bindings);
  if (fixed !== undefined) {
    return { kind: "fixed", elements: fixed };
  }

  const runtime = lowerRuntimeArrayLiteralExpression(expression, bindings);
  if (runtime !== undefined) {
    return { kind: "runtime", elements: runtime };
  }

  return undefined;
}

// eslint-disable-next-line max-statements -- Runtime array literal classification handles holes plus fixed/runtime spreads.
function lowerRuntimeArrayLiteralExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): readonly JsIrRuntimeArrayElement[] | undefined {
  if (!ts.isArrayLiteralExpression(expression)) {
    return undefined;
  }

  const elements: JsIrRuntimeArrayElement[] = [];
  let needsRuntimeArray = false;
  for (const element of expression.elements) {
    if (ts.isSpreadElement(element)) {
      if (!ts.isIdentifier(element.expression)) {
        return undefined;
      }
      const binding = bindings.get(element.expression.text);
      if (binding?.kind !== "runtimeArray" && binding?.kind !== "array") {
        return undefined;
      }
      let sourceKind: "runtime" | "fixed" = "runtime";
      if (binding.kind === "array") {
        sourceKind = "fixed";
      }
      elements.push({ kind: "spread", arrayName: element.expression.text, sourceKind });
      needsRuntimeArray = true;
      continue;
    }
    if (ts.isOmittedExpression(element)) {
      elements.push({ kind: "hole" });
      needsRuntimeArray = true;
      continue;
    }
    const number = lowerNumberExpression(element, bindings);
    const value = lowerValueExpression(element, bindings);
    if (value === undefined) {
      return undefined;
    }
    if (number === undefined) {
      needsRuntimeArray = true;
    }
    elements.push({ kind: "value", value });
  }

  if (!needsRuntimeArray) {
    return undefined;
  }
  return elements;
}

function classifyObjectLiteral(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): ObjectLiteralClassification | undefined {
  const fixed = lowerObjectLiteralExpression(expression, bindings);
  if (fixed !== undefined) {
    if (fixed.fields.length === 0) {
      return { kind: "runtime", value: { fields: [] } };
    }
    return { kind: "fixed", value: fixed };
  }

  const runtime = lowerRuntimeObjectLiteralExpression(expression, bindings);
  if (runtime !== undefined) {
    return { kind: "runtime", value: runtime };
  }

  return undefined;
}

function lowerObjectLiteralExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrObjectValue | undefined {
  if (!ts.isObjectLiteralExpression(expression)) {
    return undefined;
  }

  const fields: JsIrObjectField[] = [];
  for (const property of expression.properties) {
    if (!ts.isPropertyAssignment(property)) {
      return undefined;
    }
    const fieldName = lowerObjectFieldName(property.name);
    if (fieldName === undefined) {
      return undefined;
    }
    const objectValue = lowerObjectLiteralExpression(property.initializer, bindings);
    if (objectValue !== undefined) {
      fields.push({ name: fieldName, value: { kind: "object", value: objectValue } });
      continue;
    }
    const numberValue = lowerNumberExpression(property.initializer, bindings);
    if (numberValue === undefined) {
      return undefined;
    }
    fields.push({ name: fieldName, value: { kind: "number", value: numberValue } });
  }
  return { fields };
}

function lowerRuntimeObjectLiteralExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrRuntimeObjectValue | undefined {
  if (!ts.isObjectLiteralExpression(expression)) {
    return undefined;
  }

  const fields: JsIrRuntimeObjectField[] = [];
  for (const property of expression.properties) {
    if (ts.isSpreadAssignment(property)) {
      if (!ts.isIdentifier(property.expression)) {
        return undefined;
      }
      const sourceBinding = bindings.get(property.expression.text);
      if (sourceBinding?.kind !== "runtimeObject" && sourceBinding?.kind !== "object") {
        return undefined;
      }
      fields.push({ kind: "spread", sourceName: property.expression.text });
      continue;
    }
    if (ts.isShorthandPropertyAssignment(property)) {
      const value = lowerValueExpression(property.name, bindings);
      if (value === undefined) {
        return undefined;
      }
      fields.push({ kind: "field", key: { kind: "literal", value: property.name.text }, value });
      continue;
    }
    if (!ts.isPropertyAssignment(property)) {
      return undefined;
    }
    const key = lowerRuntimeObjectFieldName(property.name, bindings);
    const value = lowerValueExpression(property.initializer, bindings);
    if (key === undefined || value === undefined) {
      return undefined;
    }
    fields.push({ kind: "field", key, value });
  }
  return { fields };
}

function lowerRuntimeObjectFieldName(
  name: ts.PropertyName,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): JsIrStringExpression | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
    return { kind: "literal", value: name.text };
  }
  if (!ts.isComputedPropertyName(name)) {
    return undefined;
  }
    return lowerPropertyKeyExpression(name.expression, bindings);
}

function lowerObjectFieldName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
    return name.text;
  }
  return undefined;
}

function unsupportedStatementMessage(statement: ts.Statement): string {
  if (ts.isVariableStatement(statement)) {
    const [declaration] = statement.declarationList.declarations;
    if (declaration.initializer !== undefined) {
      const message = unsupportedExpressionMessage(declaration.initializer);
      if (message !== undefined) {
        return message;
      }
    }
  }

  if (ts.isFunctionDeclaration(statement)) {
    if (statement.parameters.some((parameter) => parameter.type?.kind === ts.SyntaxKind.StringKeyword)) {
      return "String parameters in function declarations are not supported by the current runtime string ABI";
    }
    if (statement.body?.statements.some((bodyStatement) => ts.isReturnStatement(bodyStatement) && bodyStatement.expression !== undefined && unsupportedStringExpression(bodyStatement.expression))) {
      return "String returns from functions are not supported by the current runtime string ABI";
    }
  }

  if (ts.isExpressionStatement(statement)) {
    const message = unsupportedExpressionMessage(statement.expression);
    if (message !== undefined) {
      return message;
    }
  }

  return "Only top-level const string, number, or boolean bindings, print calls, and if statements are supported by the current lowering slice";
}

function unsupportedExpressionMessage(expression: ts.Expression): string | undefined {
  const runtimeBoundary = unsupportedRuntimeBoundaryMessage(expression);
  if (runtimeBoundary !== undefined) {
    return runtimeBoundary;
  }
  if (ts.isArrayLiteralExpression(expression)) {
    return unsupportedArrayLiteralMessage(expression);
  }
  if (ts.isObjectLiteralExpression(expression)) {
    return unsupportedObjectLiteralMessage(expression);
  }
  if (unsupportedStringExpression(expression)) {
    return "Unsupported string expression in the current runtime string lowering slice";
  }
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    return unsupportedExpressionMessage(expression.right);
  }
  if (ts.isCallExpression(expression)) {
    for (const argument of expression.arguments) {
      const message = unsupportedExpressionMessage(argument);
      if (message !== undefined) {
        return message;
      }
    }
  }
  if (ts.isElementAccessExpression(expression) && !ts.isStringLiteral(expression.argumentExpression)) {
    if (containsNestedObjectElementAccess(expression)) {
      return "Dynamic computed object keys on nested known-shape objects are not supported yet";
    }
    return "Dynamic computed object keys are not supported by known-shape numeric objects";
  }
  return undefined;
}

function unsupportedRuntimeBoundaryMessage(expression: ts.Expression): string | undefined {
  if (ts.isElementAccessExpression(expression) && ts.isStringLiteral(expression.argumentExpression)) {
    const key = expression.argumentExpression.text;
    if (key !== "length" && lowerCanonicalArrayIndexString(expression.argumentExpression) === undefined) {
      return `Runtime array string key "${key}" is not supported; only canonical non-negative integer string literals are supported`;
    }
  }
  if (!ts.isCallExpression(expression)) {
    return undefined;
  }
  const callee = expression.expression;
  if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)) {
    if (callee.expression.text === "Object") {
      if (callee.name.text === "defineProperty") {
        return unsupportedDefinePropertyMessage(expression);
      }
      if (callee.name.text === "keys") {
        return "Object.keys is only supported for runtime dictionary objects and runtime arrays";
      }
      if (callee.name.text === "assign") {
        return "Object.assign is only supported for runtime dictionary object targets and sources";
      }
    }
    if (callee.name.text === "push" || callee.name.text === "pop" || callee.name.text === "shift" || callee.name.text === "unshift") {
      return "Array method calls are only supported on runtime arrays";
    }
    if (callee.name.text === "every" || callee.name.text === "some") {
      return "Array.prototype.every and Array.prototype.some are only supported without a callback argument in the current runtime lowering slice";
    }
  }
  return undefined;
}

function unsupportedDefinePropertyMessage(expression: ts.CallExpression): string | undefined {
  if (expression.arguments.length !== definePropertyArgumentCount) {
    return undefined;
  }
  const [_targetExpression, _keyExpression, descriptor] = expression.arguments;
  if (!ts.isObjectLiteralExpression(descriptor)) {
    return undefined;
  }
  for (const property of descriptor.properties) {
    if (ts.isGetAccessorDeclaration(property) || ts.isSetAccessorDeclaration(property) || ts.isMethodDeclaration(property)) {
      return "Object.defineProperty accessor descriptors are not supported yet";
    }
    if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && (property.name.text === "writable" || property.name.text === "enumerable" || property.name.text === "configurable")) {
      if (property.initializer.kind !== ts.SyntaxKind.TrueKeyword && property.initializer.kind !== ts.SyntaxKind.FalseKeyword) {
        return "Object.defineProperty descriptor booleans must be literal true or false";
      }
    }
  }
  return undefined;
}

function containsNestedObjectElementAccess(expression: ts.Expression): boolean {
  if (ts.isElementAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
    return true;
  }
  if (ts.isCallExpression(expression)) {
    return expression.arguments.some((argument) => containsNestedObjectElementAccess(argument));
  }
  if (ts.isBinaryExpression(expression)) {
    return containsNestedObjectElementAccess(expression.left) || containsNestedObjectElementAccess(expression.right);
  }
  return false;
}

function unsupportedArrayLiteralMessage(expression: ts.ArrayLiteralExpression): string | undefined {
  for (const element of expression.elements) {
    if (ts.isOmittedExpression(element)) {
      return "Array holes are not supported; fixed numeric arrays require every element to be present";
    }
    if (ts.isSpreadElement(element)) {
      return "Array spread elements are not supported in fixed numeric arrays";
    }
    if (ts.isArrayLiteralExpression(element) || ts.isObjectLiteralExpression(element) || unsupportedStringExpression(element)) {
      return "Non-numeric array elements are not supported; fixed numeric arrays only store numbers";
    }
  }
  return undefined;
}

function unsupportedObjectLiteralMessage(expression: ts.ObjectLiteralExpression): string | undefined {
  for (const property of expression.properties) {
    if (ts.isSpreadAssignment(property)) {
      return "Object spread properties are not supported by known-shape numeric objects";
    }
    if (ts.isShorthandPropertyAssignment(property)) {
      return "Object shorthand properties are not supported by known-shape numeric objects";
    }
    if (ts.isMethodDeclaration(property)) {
      return "Object methods are not supported by known-shape numeric objects";
    }
    if (ts.isPropertyAssignment(property)) {
      if (ts.isComputedPropertyName(property.name)) {
        return "Dynamic computed object keys are not supported by known-shape numeric objects";
      }
      if (unsupportedStringExpression(property.initializer) || property.initializer.kind === ts.SyntaxKind.TrueKeyword || property.initializer.kind === ts.SyntaxKind.FalseKeyword) {
        return "Non-number object fields are not supported by known-shape numeric objects";
      }
      if (ts.isObjectLiteralExpression(property.initializer)) {
        const nested = unsupportedObjectLiteralMessage(property.initializer);
        if (nested !== undefined) {
          return nested;
        }
      }
    }
  }
  return undefined;
}

function unsupportedStringExpression(expression: ts.Expression): boolean {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return true;
  }
  if (ts.isBinaryExpression(expression)) {
    return unsupportedStringExpression(expression.left) || unsupportedStringExpression(expression.right);
  }
  if (ts.isConditionalExpression(expression)) {
    return unsupportedStringExpression(expression.whenTrue) || unsupportedStringExpression(expression.whenFalse);
  }
  return false;
}

function lowerObjectAccessPath(
  expression: ts.PropertyAccessExpression | ts.ElementAccessExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): { readonly objectName: string; readonly path: readonly string[] } | undefined {
  const names: string[] = [];
  let current: ts.Expression = expression;
  while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    if (ts.isPropertyAccessExpression(current)) {
      names.unshift(current.name.text);
      current = current.expression;
      continue;
    }
    if (!ts.isStringLiteral(current.argumentExpression)) {
      return undefined;
    }
    names.unshift(current.argumentExpression.text);
    current = current.expression;
  }

  if (!ts.isIdentifier(current)) {
    return undefined;
  }

  const binding = bindings.get(current.text);
  if (binding?.kind !== "object" || !objectPathExists(binding.value, names)) {
    return undefined;
  }

  return { objectName: current.text, path: names };
}

function objectPathExists(value: JsIrObjectValue, path: readonly string[]): boolean {
  let current: JsIrObjectValue = value;
  for (let i = 0; i < path.length; i++) {
    const field = current.fields.find((item) => item.name === path[i]);
    if (field === undefined) {
      return false;
    }
    if (i === path.length - 1) {
      return field.value.kind === "number";
    }
    if (field.value.kind !== "object") {
      return false;
    }
    current = field.value.value;
  }
  return false;
}

function objectHasNestedFields(value: JsIrObjectValue): boolean {
  return value.fields.some((field) => field.value.kind === "object");
}

export const lowerToJsIr = (
  entry: string,
  sourceFiles: readonly ts.SourceFile[]
): Effect.Effect<JsIrResult, never, Diagnostics> =>
  Effect.gen(function* lowerToJsIrEffect() {
    const diagnostics = yield* Diagnostics;
    const allDiagnostics: CompilerDiagnostic[] = [];
    const modules = sourceFiles.map((sourceFile) => {
      const lowered = lowerStatements(sourceFile);
      allDiagnostics.push(...lowered.diagnostics);
      return {
        fileName: sourceFile.fileName,
        statementCount: sourceFile.statements.length,
        operations: lowered.operations
      };
    });
    yield* Effect.forEach(allDiagnostics, (diagnostic) => diagnostics.add(diagnostic), { discard: true });
    return {
      module: {
        entry,
        modules
      }
    };
  });
