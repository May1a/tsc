import {
  aggregateBindingForOperation,
  type JsIrCallArgument,
  type JsIrBindingValue,
  type JsIrCondition,
  type JsIrExpression,
  type JsIrFunctionParameter,
  type JsIrModule,
  type JsIrNumberExpression,
  type JsIrNumberOperator,
  type JsIrObjectValue,
  type JsIrOperation,
  type JsIrRuntimeArrayElement,
  type JsIrRuntimeObjectValue,
  type JsIrStringExpression,
  type JsIrValueExpression
} from "./ir.js";
import {
  createRuntimeHelperEmitter,
  emitRuntimeDeclarations,
  emitRuntimeDefinitions,
  useRuntimeHelper,
  type RuntimeHelper,
  type RuntimeHelperEmitter
} from "./runtime-helpers.js";

type EmitContext = {
  readonly bindings: Map<string, JsIrBindingValue>;
  readonly stringConstants: string[];
  readonly arrayGlobals: string[];
  readonly objectTypes: string[];
  readonly objectLayouts: Map<string, ObjectLayout>;
  readonly runtime: RuntimeHelperEmitter;
  readonly loopLabels: LoopLabels[];
  hasNumberPrint: boolean;
  printIndex: number;
  ifIndex: number;
  cmpIndex: number;
  numIndex: number;
  callIndex: number;
  loopIndex: number;
  logicIndex: number;
  boolIndex: number;
  stringIndex: number;
  arrayIndex: number;
  objectIndex: number;
  readonly optionalTargets: string[];
};

type ObjectLayout = ObjectValue;

type NumberValue = {
  readonly lines: readonly string[];
  readonly value: string;
};

type StringValue = {
  readonly lines: readonly string[];
  readonly value: string;
  readonly length: string;
};

type JsValue = {
  readonly lines: readonly string[];
  readonly value: string;
};

type ArrayValue = {
  readonly name: string;
  readonly length: number;
  readonly storageKind: "global" | "stack";
};

type RuntimeArrayValue = {
  readonly pointerName: string;
};

type ObjectValue = {
  readonly typeName: string;
  readonly pointerName: string;
  readonly runtimePointerName?: string;
  readonly value: JsIrObjectValue;
};

type RuntimeObjectValue = {
  readonly pointerName: string;
};

type LoopLabels = {
  readonly breakLabel: string;
  readonly continueLabel: string;
};

type FunctionDef = {
  readonly name: string;
  readonly parameters: readonly JsIrFunctionParameter[];
  readonly body: readonly JsIrOperation[];
  readonly outerBindings: Map<string, JsIrBindingValue>;
  returnType: LlvmReturnType;
};

type LlvmReturnType = "void" | "double" | "ptr" | "{ ptr, i64 }" | "i64";

const doubleQuoteByte = 34;
const backslashByte = 92;
const firstPrintableAsciiByte = 32;
const lastPrintableAsciiByte = 126;
const hexadecimalRadix = 16;
const noLines = 0;
const jsValueUndefined = "9222246136947933184";
const jsValueFalse = "9222246136947933185";
const jsValueTrue = "9222246136947933186";
const jsValueNull = "9222246136947933187";
const descriptorWritableFlag = 1;
const descriptorEnumerableFlag = 2;
const descriptorConfigurableFlag = 4;

const encodeCString = (value: string): { readonly value: string; readonly length: number } => {
  const bytes = [...Buffer.from(value, "utf8"), 0];
  const encoded = bytes
    .map((byte) => {
      if (byte === doubleQuoteByte) {
        return String.raw`\22`;
      }

      if (byte === backslashByte) {
        return String.raw`\5C`;
      }

      if (byte >= firstPrintableAsciiByte && byte <= lastPrintableAsciiByte) {
        return String.fromCharCode(byte);
      }

      return `\\${byte.toString(hexadecimalRadix).toUpperCase().padStart(2, "0")}`;
    })
    .join("");

  return {
    value: encoded,
    length: bytes.length
  };
};

export const emitLlvmIr = (module: JsIrModule): string => {
  const moduleComments = module.modules
    .map((sourceModule) => `; source ${sourceModule.fileName} statements=${sourceModule.statementCount}`)
    .join("\n");
  const context: EmitContext = {
    bindings: new Map(),
    stringConstants: [],
    arrayGlobals: [],
    objectTypes: [],
    objectLayouts: new Map(),
    runtime: createRuntimeHelperEmitter(),
    loopLabels: [],
    hasNumberPrint: false,
    printIndex: 0,
    ifIndex: 0,
    cmpIndex: 0,
    numIndex: 0,
    callIndex: 0,
    loopIndex: 0,
    logicIndex: 0,
    boolIndex: 0,
    stringIndex: 0,
    arrayIndex: 0,
    objectIndex: 0,
    optionalTargets: []
  };
  const functionDefs: FunctionDef[] = [];
  const mainOps: JsIrOperation[] = [];

  for (const sourceModule of module.modules) {
    for (const op of sourceModule.operations) {
      classifyAndProcessOperation(op, context, functionDefs, mainOps);
    }
  }

  const fnLines = functionDefs
    .flatMap((fn) => emitFunctionDefinition(fn, context))
    .join("\n");
  const mainLines = emitOperations(mainOps, context);
  const stringConstants = context.stringConstants.join("\n");
  const aggregateGlobals = [...context.objectTypes, ...context.arrayGlobals].join("\n");
  let numberFormat = "";
  if (context.hasNumberPrint) {
    numberFormat = String.raw`@.fmt.number = private unnamed_addr constant [4 x i8] c"%g\0A\00"`;
  }

  let mainBody = "";
  if (mainLines.length > noLines) {
    mainBody = `${mainLines.join("\n")}\n`;
  }

  const runtimeDeclarations = emitRuntimeDeclarations(context.runtime).join("\n");
  const runtimeDefinitions = emitRuntimeDefinitions(context.runtime).join("\n");

  return `; tscn textual LLVM IR placeholder
; entry ${module.entry}
${moduleComments}

declare i32 @puts(ptr)
declare i32 @printf(ptr, ...)
declare void @exit(i32)
${runtimeDeclarations}

${numberFormat}
${stringConstants}
${aggregateGlobals}
${runtimeDefinitions}
${fnLines}
define i32 @main() {
entry:
${mainBody}  ret i32 0
}
`;
};

function classifyAndProcessOperation(
  operation: JsIrOperation,
  context: EmitContext,
  functionDefs: FunctionDef[],
  mainOps: JsIrOperation[]
): void {
  if (operation.kind === "constNumber") {
    context.bindings.set(operation.name, { kind: "number", value: operation.value });
  } else if (operation.kind === "constBoolean") {
    context.bindings.set(operation.name, { kind: "boolean", value: operation.value });
  } else if (operation.kind === "constBooleanExpression") {
    context.bindings.set(operation.name, { kind: "booleanExpression", value: operation.value });
  } else if (operation.kind === "constValue") {
    context.bindings.set(operation.name, { kind: "value", value: operation.value });
  } else if (operation.kind === "constClosure") {
    context.bindings.set(operation.name, { kind: "closure", value: operation.value });
  } else if (operation.kind === "constString") {
    context.bindings.set(operation.name, { kind: "string", value: operation.value });
  } else if (operation.kind === "constStringExpression") {
    context.bindings.set(operation.name, { kind: "stringExpression", value: operation.value });
  } else if (operation.kind === "letNumber") {
    context.bindings.set(operation.name, { kind: "number", value: { kind: "variable", name: operation.name } });
  } else if (operation.kind === "letString") {
    context.bindings.set(operation.name, { kind: "stringVariable", name: operation.name });
  } else if (operation.kind === "letBoolean") {
    context.bindings.set(operation.name, { kind: "booleanVariable", name: operation.name });
  } else if (classifyAggregateOperation(operation, context)) {
    // Binding recorded; the operation still belongs in the emitted body below.
  } else if (operation.kind === "function") {
    const outerBindings = new Map(context.bindings);
    const returnClosure = operation.body.find((op) => op.kind === "returnClosure");
    if (returnClosure?.kind === "returnClosure") {
      functionDefs.push({
        name: returnClosure.functionName,
        parameters: [...returnClosure.captures, ...returnClosure.parameters].map((name) => ({ name, valueKind: "number" })),
        body: returnClosure.body,
        outerBindings: new Map(),
        returnType: "double"
      });
    }
    let returnType: LlvmReturnType = "void";
    if (operation.body.some((op) => op.kind === "returnNumber")) {
      returnType = "double";
    }
    if (operation.body.some((op) => op.kind === "returnString")) {
      returnType = "{ ptr, i64 }";
    }
    if (operation.body.some((op) => op.kind === "returnValue")) {
      returnType = "i64";
    }
    if (returnClosure !== undefined) {
      returnType = "ptr";
    }
    functionDefs.push({
      name: operation.name,
      parameters: operation.parameters,
      body: operation.body,
      outerBindings,
      returnType
    });
    return;
  }

  mainOps.push(operation);
}

function classifyAggregateOperation(operation: JsIrOperation, context: EmitContext): boolean {
  const binding = aggregateBindingForOperation(operation);
  if (binding !== undefined && "name" in operation) {
    context.bindings.set(operation.name, binding);
    return true;
  }
  return false;
}

function emitFunctionDefinition(fn: FunctionDef, context: EmitContext): string[] {
  const paramList = emitFunctionParameters(fn.parameters).join(", ");
  const lines: string[] = [`define ${fn.returnType} @${fn.name}(${paramList}) {`];
  const fnContext: EmitContext = {
    bindings: new Map(fn.outerBindings),
    stringConstants: context.stringConstants,
    arrayGlobals: context.arrayGlobals,
    objectTypes: context.objectTypes,
    objectLayouts: new Map(context.objectLayouts),
    runtime: context.runtime,
    loopLabels: [],
    hasNumberPrint: context.hasNumberPrint,
    printIndex: context.printIndex,
    ifIndex: 0,
    cmpIndex: 0,
    numIndex: 0,
    callIndex: 0,
    loopIndex: 0,
    logicIndex: 0,
    boolIndex: 0,
    stringIndex: 0,
    arrayIndex: context.arrayIndex,
    objectIndex: context.objectIndex,
    optionalTargets: []
  };
  for (let i = 0; i < fn.parameters.length; i++) {
    const parameter = fn.parameters[i];
    if (parameter.valueKind === "string") {
      fnContext.bindings.set(parameter.name, { kind: "stringVariable", name: parameter.name });
      continue;
    }
    if (parameter.valueKind === "value") {
      fnContext.bindings.set(parameter.name, { kind: "valueVariable", name: `%p${i}` });
      continue;
    }
    fnContext.bindings.set(parameter.name, {
      kind: "number",
      value: { kind: "parameter", name: `%p${i}` }
    });
  }
  const bodyLines = [...emitStringParameterStores(fn.parameters), ...emitOperations(fn.body, fnContext)];
  context.printIndex = fnContext.printIndex;
  context.hasNumberPrint = fnContext.hasNumberPrint;
  context.arrayIndex = fnContext.arrayIndex;
  context.objectIndex = fnContext.objectIndex;
  if (bodyLines.length > noLines) {
    lines.push("entry:", ...bodyLines);
  } else {
    lines.push("entry:");
  }
  if (fn.returnType === "void") {
    lines.push("  ret void");
  }
  lines.push("}", "");
  return lines;
}

function emitFunctionParameters(parameters: readonly JsIrFunctionParameter[]): string[] {
  return parameters.flatMap((parameter, index) => {
    if (parameter.valueKind === "string") {
      return [`i64 %p${index}.len`, `ptr %p${index}.ptr`];
    }
    if (parameter.valueKind === "value") {
      return [`i64 %p${index}`];
    }
    return [`double %p${index}`];
  });
}

function emitStringParameterStores(parameters: readonly JsIrFunctionParameter[]): string[] {
  const lines: string[] = [];
  for (let index = 0; index < parameters.length; index++) {
    const parameter = parameters[index];
    if (parameter.valueKind !== "string") {
      continue;
    }
    lines.push(
      `  ${variablePointerName(parameter.name)} = alloca ptr`,
      `  ${stringLengthPointerName(parameter.name)} = alloca i64`,
      `  store ptr %p${index}.ptr, ptr ${variablePointerName(parameter.name)}`,
      `  store i64 %p${index}.len, ptr ${stringLengthPointerName(parameter.name)}`
    );
  }
  return lines;
}

function emitOperations(operations: readonly JsIrOperation[], context: EmitContext): string[] {
  const lines: string[] = [];

  for (const operation of operations) {
    const emitted = emitOperation(operation, context);
    lines.push(...emitted);
  }

  return lines;
}

function emitOperation(operation: JsIrOperation, context: EmitContext): string[] {
  const bindingLines = emitBindingOperation(operation, context);
  if (bindingLines !== undefined) {
    return bindingLines;
  }

  const loopLines = emitLoopControlOperation(operation, context);
  if (loopLines !== undefined) {
    return loopLines;
  }

  if (operation.kind === "print") {
    return emitExpressionPrint(operation.expression, context);
  }

  if (operation.kind === "throwValue") {
    const value = emitValueExpression(operation.value, context);
    useRuntimeHelper(context.runtime, "valuePrint");
    return [...value.lines, `  call void @valuePrint(i64 ${value.value})`, "  call void @exit(i32 1)"];
  }

  if (operation.kind === "block") {
    return emitOperationsWithScopedBindings(operation.operations, context);
  }

  if (operation.kind === "if") {
    return emitIfOperation(operation, context);
  }

  if (operation.kind === "call") {
    return emitCallOperation(operation, context);
  }

  if (operation.kind === "returnNumber") {
    return emitNumberReturnOperation(operation, context);
  }

  if (operation.kind === "returnString") {
    return emitStringReturnOperation(operation, context);
  }

  if (operation.kind === "returnValue") {
    return emitValueReturnOperation(operation, context);
  }

  if (operation.kind === "returnClosure") {
    return ["  ret ptr null"];
  }

  return [];
}

function emitBindingOperation(operation: JsIrOperation, context: EmitContext): string[] | undefined {
  const constLines = emitConstBindingOperation(operation, context);
  if (constLines !== undefined) {
    return constLines;
  }

  if (operation.kind === "letNumber") {
    return emitLetNumberOperation(operation, context);
  }

  if (operation.kind === "letString") {
    return emitLetStringOperation(operation, context);
  }

  if (operation.kind === "letBoolean") {
    return emitLetBooleanOperation(operation, context);
  }

  const aggregateLines = emitAggregateBindingOperation(operation, context);
  if (aggregateLines !== undefined) {
    return aggregateLines;
  }

  return emitMutationOperation(operation, context);
}

function emitMutationOperation(operation: JsIrOperation, context: EmitContext): string[] | undefined {
  if (operation.kind === "assignNumber") {
    return emitAssignNumberOperation(operation, context);
  }

  if (operation.kind === "assignString") {
    return emitAssignStringOperation(operation, context);
  }

  if (operation.kind === "assignBoolean") {
    return emitAssignBooleanOperation(operation, context);
  }

  const arrayMutation = emitArrayMutationOperation(operation, context);
  if (arrayMutation !== undefined) {
    return arrayMutation;
  }

  return emitObjectMutationOperation(operation, context);
}

function emitArrayMutationOperation(operation: JsIrOperation, context: EmitContext): string[] | undefined {
  if (operation.kind === "arrayStore") {
    return emitArrayStoreOperation(operation, context);
  }

  if (operation.kind === "runtimeArrayStore") {
    return emitRuntimeArrayStoreOperation(operation, context);
  }

  if (operation.kind === "runtimeArrayNamedStore") {
    return emitRuntimeArrayNamedStoreOperation(operation, context);
  }

  if (operation.kind === "runtimeArrayDelete") {
    return emitRuntimeArrayDeleteOperation(operation, context);
  }

  if (operation.kind === "runtimeArrayNamedDelete") {
    return emitRuntimeArrayNamedDeleteOperation(operation, context);
  }

  if (operation.kind === "runtimeArraySetLength") {
    return emitRuntimeArraySetLengthOperation(operation, context);
  }

  if (operation.kind === "runtimeArrayPush" || operation.kind === "runtimeArrayUnshift") {
    return emitRuntimeArrayAppendOperation(operation, context);
  }

  if (operation.kind === "runtimeArrayPop" || operation.kind === "runtimeArrayShift") {
    return emitRuntimeArrayRemoveOperation(operation, context);
  }

  if (operation.kind === "runtimeArrayFill") {
    return emitRuntimeArrayFillOperation(operation, context);
  }

  if (operation.kind === "runtimeArrayReverse") {
    return emitRuntimeArrayReverseOperation(operation, context);
  }

  if (operation.kind === "runtimeArrayCopyWithin") {
    return emitRuntimeArrayCopyWithinOperation(operation, context);
  }

  return undefined;
}

function emitObjectMutationOperation(operation: JsIrOperation, context: EmitContext): string[] | undefined {
  if (operation.kind === "objectStore") {
    return emitObjectStoreOperation(operation, context);
  }

  if (operation.kind === "runtimeObjectStore") {
    return emitRuntimeObjectStoreOperation(operation, context);
  }

  if (operation.kind === "runtimeObjectDelete") {
    return emitRuntimeObjectDeleteOperation(operation, context);
  }

  if (operation.kind === "valueObjectStore" || operation.kind === "valueArrayStore" || operation.kind === "valueArraySetLength") {
    return emitValueAggregateStoreOperation(operation, context);
  }

  if (operation.kind === "valueObjectDelete" || operation.kind === "valueArrayDelete") {
    return emitValueAggregateDeleteOperation(operation, context);
  }

  if (operation.kind === "runtimeObjectSetPrototype") {
    return emitRuntimeObjectSetPrototypeOperation(operation, context);
  }

  if (operation.kind === "runtimeObjectPreventExtensions" || operation.kind === "runtimeObjectSeal" || operation.kind === "runtimeObjectFreeze") {
    return emitRuntimeObjectStateMutationOperation(operation, context);
  }

  if (operation.kind === "runtimeObjectAssign") {
    return emitRuntimeObjectAssignOperation(operation, context);
  }

  if (operation.kind === "runtimeObjectDefineDataProperty") {
    return emitRuntimeObjectDefineDataPropertyOperation(operation, context);
  }

  if (operation.kind === "runtimeObjectDefineDataProperties") {
    return operation.descriptors.flatMap((descriptor) => emitRuntimeObjectDefineDataPropertyOperation({ kind: "runtimeObjectDefineDataProperty", objectName: operation.objectName, descriptor }, context));
  }

  return undefined;
}

// eslint-disable-next-line max-statements -- Aggregate built-in emission stays centralized during runtime-shape transition.
function emitAggregateLiteralBindingOperation(operation: JsIrOperation, context: EmitContext): string[] | undefined {
  if (operation.kind === "arrayLiteral") {
    return emitArrayLiteralOperation(operation, context);
  }

  if (operation.kind === "runtimeArrayLiteral") {
    return emitRuntimeArrayLiteralOperation(operation, context);
  }

  if (operation.kind === "objectLiteral") {
    return emitObjectLiteralOperation(operation, context);
  }

  if (operation.kind === "runtimeObjectLiteral") {
    return emitRuntimeObjectLiteralOperation(operation, context);
  }

  if (operation.kind === "runtimeObjectCreate") {
    return emitRuntimeObjectCreateOperation(operation, context);
  }

  if (operation.kind === "runtimeErrorLiteral") {
    return emitRuntimeErrorLiteralOperation(operation, context);
  }

  return undefined;
}

function emitAggregateBindingOperation(operation: JsIrOperation, context: EmitContext): string[] | undefined {
  const literalLines = emitAggregateLiteralBindingOperation(operation, context);
  if (literalLines !== undefined) {
    return literalLines;
  }

  if (operation.kind === "runtimeObjectKeys") {
    return emitRuntimeObjectKeysOperation(operation, context);
  }

  if (operation.kind === "runtimeObjectValues") {
    return emitRuntimeObjectValuesOperation(operation, context);
  }

  if (operation.kind === "runtimeObjectEntries") {
    return emitRuntimeObjectEntriesOperation(operation, context);
  }

  if (operation.kind === "runtimeObjectFromEntries") {
    return emitRuntimeObjectFromEntriesOperation(operation, context);
  }

  if (operation.kind === "runtimeObjectOwnPropertyDescriptor") {
    return emitRuntimeObjectOwnPropertyDescriptorOperation(operation, context);
  }

  if (operation.kind === "runtimeObjectOwnPropertyNames") {
    return emitRuntimeObjectOwnPropertyNamesOperation(operation, context);
  }

  if (operation.kind === "runtimeObjectOwnPropertyDescriptors") {
    return emitRuntimeObjectOwnPropertyDescriptorsOperation(operation, context);
  }

  return emitRuntimeArrayExpansionBindingOperation(operation, context);
}

function emitRuntimeArrayExpansionBindingOperation(operation: JsIrOperation, context: EmitContext): string[] | undefined {
  if (operation.kind === "runtimeArraySlice") {
    return emitRuntimeArraySliceOperation(operation, context);
  }

  if (operation.kind === "runtimeArraySplice") {
    return emitRuntimeArraySpliceOperation(operation, context);
  }

  if (operation.kind === "runtimeArraySpliceStatement") {
    return emitRuntimeArraySpliceStatementOperation(operation, context);
  }

  if (operation.kind === "runtimeArrayFlat") {
    return emitRuntimeArrayFlatOperation(operation, context);
  }

  if (operation.kind === "runtimeArrayConcat") {
    return emitRuntimeArrayConcatOperation(operation, context);
  }

  if (operation.kind === "runtimeArrayMutatorResult") {
    return emitRuntimeArrayMutatorResultOperation(operation, context);
  }

  if (operation.kind === "runtimeObjectGetPrototype") {
    return emitRuntimeObjectGetPrototypeOperation(operation, context);
  }

  return undefined;
}

function emitConstBindingOperation(operation: JsIrOperation, context: EmitContext): string[] | undefined {
  if (operation.kind === "constNumber") {
    context.bindings.set(operation.name, { kind: "number", value: operation.value });
    return [];
  }
  if (operation.kind === "constBoolean") {
    context.bindings.set(operation.name, { kind: "boolean", value: operation.value });
    return [];
  }
  if (operation.kind === "constBooleanExpression") {
    context.bindings.set(operation.name, { kind: "booleanExpression", value: operation.value });
    return [];
  }
  if (operation.kind === "constValue") {
    context.bindings.set(operation.name, { kind: "value", value: operation.value });
    return [];
  }
  if (operation.kind === "constClosure") {
    context.bindings.set(operation.name, { kind: "closure", value: operation.value });
    return [];
  }
  if (operation.kind === "constString") {
    context.bindings.set(operation.name, { kind: "string", value: operation.value });
    return [];
  }
  if (operation.kind === "constStringExpression") {
    context.bindings.set(operation.name, { kind: "stringExpression", value: operation.value });
    return [];
  }
  return undefined;
}

function emitLoopControlOperation(operation: JsIrOperation, context: EmitContext): string[] | undefined {
  if (operation.kind === "while") {
    return emitWhileOperation(operation, context);
  }

  if (operation.kind === "doWhile") {
    return emitDoWhileOperation(operation, context);
  }

  if (operation.kind === "for") {
    return emitForOperation(operation, context);
  }

  if (operation.kind === "break") {
    return emitBreakOperation(context);
  }

  if (operation.kind === "continue") {
    return emitContinueOperation(context);
  }

  return undefined;
}

function variablePointerName(name: string): string {
  return `%${name}.addr`;
}

function stringLengthPointerName(name: string): string {
  return `%${name}.len.addr`;
}

function emitLetNumberOperation(
  operation: Extract<JsIrOperation, { readonly kind: "letNumber" }>,
  context: EmitContext
): string[] {
  const result = emitNumberExpression(operation.value, context);
  const pointer = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "number", value: { kind: "variable", name: pointer } });
  return [...result.lines, `  ${pointer} = alloca double`, `  store double ${result.value}, ptr ${pointer}`];
}

function emitLetStringOperation(
  operation: Extract<JsIrOperation, { readonly kind: "letString" }>,
  context: EmitContext
): string[] {
  const result = emitStringExpression(operation.value, context);
  const pointer = variablePointerName(operation.name);
  const lengthPointer = stringLengthPointerName(operation.name);
  context.bindings.set(operation.name, { kind: "stringVariable", name: operation.name });
  return [
    ...result.lines,
    `  ${pointer} = alloca ptr`,
    `  ${lengthPointer} = alloca i64`,
    `  store ptr ${result.value}, ptr ${pointer}`,
    `  store i64 ${result.length}, ptr ${lengthPointer}`
  ];
}

function emitLetBooleanOperation(
  operation: Extract<JsIrOperation, { readonly kind: "letBoolean" }>,
  context: EmitContext
): string[] {
  const result = emitCondition(operation.value, context);
  const pointer = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "booleanVariable", name: operation.name });
  return [...result.lines, `  ${pointer} = alloca i1`, `  store i1 ${result.value}, ptr ${pointer}`];
}

function emitArrayLiteralOperation(
  operation: Extract<JsIrOperation, { readonly kind: "arrayLiteral" }>,
  context: EmitContext
): string[] {
  const index = context.arrayIndex;
  context.arrayIndex += 1;
  if (operation.elements.every((element) => element.kind === "literal")) {
    const globalName = `@arr.${index}`;
    const values = operation.elements.map((element) => `double ${llvmDoubleBitcastOperand(String(element.value))}`).join(", ");
    const arrayValue: ArrayValue = { name: globalName, length: operation.elements.length, storageKind: "global" };
    context.arrayGlobals.push(`${globalName} = global [${operation.elements.length} x double] [${values}]`);
    context.bindings.set(operation.name, { kind: "array", name: arrayValue.name, length: arrayValue.length });
    return [];
  }

  const pointerName = variablePointerName(operation.name);
  const arrayValue: ArrayValue = { name: pointerName, length: operation.elements.length, storageKind: "stack" };
  context.bindings.set(operation.name, { kind: "array", name: arrayValue.name, length: arrayValue.length });
  const lines = [`  ${pointerName} = alloca [${operation.elements.length} x double]`];
  for (let i = 0; i < operation.elements.length; i++) {
    const pointer = emitArrayElementPointer(operation.name, { kind: "literal", value: i }, context);
    const value = emitNumberExpression(operation.elements[i], context);
    lines.push(...pointer.lines, ...value.lines, `  store double ${value.value}, ptr ${pointer.value}`);
  }
  return lines;
}

// eslint-disable-next-line max-statements -- Runtime array literal emission handles holes, values, and spread materialization together.
function emitRuntimeArrayLiteralOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayLiteral" }>,
  context: EmitContext
): string[] {
  useRuntimeHelper(context.runtime, "arrayNew");
  useRuntimeHelper(context.runtime, "arraySet");
  useRuntimeHelper(context.runtime, "arrayPush");
  useRuntimeHelper(context.runtime, "arrayConcat");
  useRuntimeHelper(context.runtime, "valueBoxArray");
  const pointerName = variablePointerName(operation.name);
  const arrayValue: RuntimeArrayValue = { pointerName };
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  const lines = [
    `  ${pointerName} = alloca ptr`,
    `  %${operation.name}.arr = call ptr @arrayNew(i64 ${runtimeArrayLiteralInitialLength(operation.elements)})`,
    `  store ptr %${operation.name}.arr, ptr ${arrayValue.pointerName}`
  ];
  let fixedIndex = 0;
  for (let i = 0; i < operation.elements.length; i++) {
    const element = operation.elements[i];
    if (element.kind === "hole") {
      fixedIndex += 1;
      continue;
    }
    if (element.kind === "spread") {
      if (element.sourceKind === "fixed") {
        const binding = context.bindings.get(element.arrayName);
        if (binding?.kind !== "array") {
          throw new Error("Expected fixed array spread binding");
        }
        for (let spreadIndex = 0; spreadIndex < binding.length; spreadIndex++) {
          const value = emitValueExpression({ kind: "number", value: { kind: "arrayAccess", arrayName: element.arrayName, index: { kind: "literal", value: spreadIndex } } }, context);
          const current = `%${operation.name}.fixed.spread.current.${i}.${spreadIndex}`;
          lines.push(...value.lines, `  ${current} = load ptr, ptr ${arrayValue.pointerName}`, `  call i64 @arrayPush(ptr ${current}, i64 ${value.value})`);
        }
        continue;
      }
      const current = `%${operation.name}.spread.current.${i}`;
      const source = emitRuntimeArrayPointer(element.arrayName, context);
      const boxed = `%${operation.name}.spread.boxed.${i}`;
      const args = `%${operation.name}.spread.args.${i}`;
      const next = `%${operation.name}.spread.next.${i}`;
      lines.push(...source.lines, `  ${current} = load ptr, ptr ${arrayValue.pointerName}`, `  ${boxed} = call i64 @valueBoxArray(ptr ${source.value})`, `  ${args} = call ptr @arrayNew(i64 1)`, `  call void @arraySet(ptr ${args}, i64 0, i64 ${boxed})`, `  ${next} = call ptr @arrayConcat(ptr ${current}, ptr ${args})`, `  store ptr ${next}, ptr ${arrayValue.pointerName}`);
      continue;
    }
    const value = emitValueExpression(element.value, context);
    if (operation.elements.some((candidate) => candidate.kind === "spread")) {
      const current = `%${operation.name}.value.current.${i}`;
      lines.push(...value.lines, `  ${current} = load ptr, ptr ${arrayValue.pointerName}`, `  call i64 @arrayPush(ptr ${current}, i64 ${value.value})`);
    } else {
      lines.push(...value.lines, `  call void @arraySet(ptr %${operation.name}.arr, i64 ${fixedIndex}, i64 ${value.value})`);
      fixedIndex += 1;
    }
  }
  return lines;
}

function runtimeArrayLiteralInitialLength(elements: readonly JsIrRuntimeArrayElement[]): number {
  if (elements.some((element) => element.kind === "spread")) {
    return 0;
  }
  return elements.length;
}

function emitObjectLiteralOperation(
  operation: Extract<JsIrOperation, { readonly kind: "objectLiteral" }>,
  context: EmitContext
): string[] {
  const typeName = defineObjectType(operation.value, context);
  const pointerName = variablePointerName(operation.name);
  let runtimePointerName: string | undefined;
  if (operation.needsRuntimeShadow) {
    runtimePointerName = `%${operation.name}.obj.addr`;
  }
  context.objectLayouts.set(operation.name, { typeName, pointerName, runtimePointerName, value: operation.value });
  context.bindings.set(operation.name, { kind: "object", value: operation.value });
  const lines = [
    `  ${pointerName} = alloca ${typeName}`,
    ...emitObjectFieldStores(typeName, pointerName, operation.value, [], context)
  ];
  if (runtimePointerName !== undefined) {
    const runtimeValue = knownShapeObjectToRuntimeValue(operation.value);
    lines.push(...emitRuntimeObjectLiteralStorage(runtimePointerName, runtimeValue, context));
  }
  return lines;
}

function emitRuntimeObjectLiteralOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeObjectLiteral" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeObject", name: operation.name });
  const runtimeObject: RuntimeObjectValue = { pointerName };
  return emitRuntimeObjectLiteralStorage(runtimeObject.pointerName, operation.value, context);
}

function emitRuntimeObjectCreateOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeObjectCreate" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeObject", name: operation.name });
  useRuntimeHelper(context.runtime, "objectCreate");
  const prototypeLines: string[] = [];
  let prototype = "null";
  if (operation.prototypeName !== undefined) {
    const prototypeObject = emitRuntimeObjectPointer(operation.prototypeName, context);
    prototypeLines.push(...prototypeObject.lines);
    prototype = prototypeObject.value;
  }
  const objectName = `%obj.rt.${context.objectIndex}`;
  context.objectIndex += 1;
  return [
    `  ${pointerName} = alloca ptr`,
    ...prototypeLines,
    `  ${objectName} = call ptr @objectCreate(ptr ${prototype})`,
    `  store ptr ${objectName}, ptr ${pointerName}`
  ];
}

const errorClassIds = new Map<string, number>([["Error", 1]]);

function emitRuntimeErrorLiteralOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeErrorLiteral" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeObject", name: operation.name, errorName: operation.errorName });
  const classId = errorClassIds.get(operation.errorName) ?? 0;
  const nameConstant = addStringConstant(operation.errorName, context);
  const nameLength = utf8ByteLength(operation.errorName);
  const message = emitValueExpression(operation.message, context);
  const objectName = `%obj.rt.${context.objectIndex}`;
  context.objectIndex += 1;
  useRuntimeHelper(context.runtime, "errorNew");
  return [
    `  ${pointerName} = alloca ptr`,
    ...message.lines,
    `  ${objectName} = call ptr @errorNew(i64 ${classId}, i64 ${nameLength}, ptr ${nameConstant}, i64 ${message.value})`,
    `  store ptr ${objectName}, ptr ${pointerName}`
  ];
}

function emitRuntimeObjectKeysOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeObjectKeys" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  const object = emitRuntimeKeysTargetPointer(operation, context);
  const result = `%arr.rt.${context.arrayIndex}`;
  context.arrayIndex += 1;
  const helper = runtimeKeysHelper(operation.targetKind);
  const argumentType = runtimeAggregateArgumentType(operation.targetKind);
  useRuntimeHelper(context.runtime, helper);
  return [
    `  ${pointerName} = alloca ptr`,
    ...object.lines,
    `  ${result} = call ptr @${helper}(${argumentType} ${object.value})`,
    `  store ptr ${result}, ptr ${pointerName}`
  ];
}

function emitRuntimeObjectValuesOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeObjectValues" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  const target = emitRuntimeValuesTargetPointer(operation, context);
  const result = `%arr.rt.${context.arrayIndex}`;
  context.arrayIndex += 1;
  let helper: "arrayValues" | "objectValues" | "valueObjectValues" = "objectValues";
  if (operation.targetKind === "array") {
    helper = "arrayValues";
  } else if (operation.targetKind === "value") {
    helper = "valueObjectValues";
  }
  const argumentType = runtimeAggregateArgumentType(operation.targetKind);
  useRuntimeHelper(context.runtime, helper);
  return [`  ${pointerName} = alloca ptr`, ...target.lines, `  ${result} = call ptr @${helper}(${argumentType} ${target.value})`, `  store ptr ${result}, ptr ${pointerName}`];
}

function emitRuntimeObjectEntriesOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeObjectEntries" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  let target = emitRuntimeObjectPointer(operation.targetName, context);
  if (operation.targetKind === "array") {
    target = emitRuntimeArrayPointer(operation.targetName, context);
  } else if (operation.targetKind === "value") {
    target = emitNamedValueBinding(operation.targetName, context);
  }
  const result = `%arr.rt.${context.arrayIndex}`;
  context.arrayIndex += 1;
  let helper: "arrayEntries" | "objectEntries" | "valueObjectEntries" = "objectEntries";
  if (operation.targetKind === "array") {
    helper = "arrayEntries";
  } else if (operation.targetKind === "value") {
    helper = "valueObjectEntries";
  }
  const argumentType = runtimeAggregateArgumentType(operation.targetKind);
  useRuntimeHelper(context.runtime, helper);
  return [`  ${pointerName} = alloca ptr`, ...target.lines, `  ${result} = call ptr @${helper}(${argumentType} ${target.value})`, `  store ptr ${result}, ptr ${pointerName}`];
}

function emitRuntimeObjectFromEntriesOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeObjectFromEntries" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeObject", name: operation.name });
  const entries = emitRuntimeArrayPointer(operation.entriesName, context);
  const result = `%obj.rt.${context.objectIndex}`;
  context.objectIndex += 1;
  useRuntimeHelper(context.runtime, "objectFromEntries");
  return [`  ${pointerName} = alloca ptr`, ...entries.lines, `  ${result} = call ptr @objectFromEntries(ptr ${entries.value})`, `  store ptr ${result}, ptr ${pointerName}`];
}

function emitRuntimeObjectOwnPropertyDescriptorOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeObjectOwnPropertyDescriptor" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "valueVariable", name: operation.name });
  const result = `%value.${context.numIndex}`;
  context.numIndex += 1;
  if (operation.targetKind === "array") {
    const array = emitRuntimeArrayPointer(operation.targetName, context);
    if (operation.index === undefined) {
      useRuntimeHelper(context.runtime, "arrayLengthPropertyDescriptor");
      return [`  ${pointerName} = alloca i64`, ...array.lines, `  ${result} = call i64 @arrayLengthPropertyDescriptor(ptr ${array.value})`, `  store i64 ${result}, ptr ${pointerName}`];
    }
    const key = emitStringExpression(operation.key, context);
    const index = emitArrayIndex(operation.index ?? { kind: "literal", value: 0 }, context);
    useRuntimeHelper(context.runtime, "arrayOwnPropertyDescriptor");
    return [`  ${pointerName} = alloca i64`, ...array.lines, ...key.lines, ...index.lines, `  ${result} = call i64 @arrayOwnPropertyDescriptor(ptr ${array.value}, i64 ${key.length}, ptr ${key.value}, i64 ${index.value})`, `  store i64 ${result}, ptr ${pointerName}`];
  }
  if (operation.targetKind === "value") {
    const value = emitNamedValueBinding(operation.targetName, context);
    const key = emitStringExpression(operation.key, context);
    let index: NumberValue = { lines: [], value: "0" };
    if (operation.index !== undefined) {
      index = emitArrayIndex(operation.index, context);
    }
    let isLength = "false";
    if (operation.isLength === true) {
      isLength = "true";
    }
    useRuntimeHelper(context.runtime, "valueObjectOwnPropertyDescriptor");
    return [`  ${pointerName} = alloca i64`, ...value.lines, ...key.lines, ...index.lines, `  ${result} = call i64 @valueObjectOwnPropertyDescriptor(i64 ${value.value}, i64 ${key.length}, ptr ${key.value}, i64 ${index.value}, i1 ${isLength})`, `  store i64 ${result}, ptr ${pointerName}`];
  }
  const object = emitRuntimeObjectPointer(operation.targetName, context);
  const key = emitStringExpression(operation.key, context);
  useRuntimeHelper(context.runtime, "objectOwnPropertyDescriptor");
  return [`  ${pointerName} = alloca i64`, ...object.lines, ...key.lines, `  ${result} = call i64 @objectOwnPropertyDescriptor(ptr ${object.value}, i64 ${key.length}, ptr ${key.value})`, `  store i64 ${result}, ptr ${pointerName}`];
}

function emitRuntimeObjectOwnPropertyNamesOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeObjectOwnPropertyNames" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  const result = `%arr.rt.${context.arrayIndex}`;
  context.arrayIndex += 1;
  if (operation.targetKind === "array") {
    const array = emitRuntimeArrayPointer(operation.targetName, context);
    useRuntimeHelper(context.runtime, "arrayOwnPropertyNames");
    return [`  ${pointerName} = alloca ptr`, ...array.lines, `  ${result} = call ptr @arrayOwnPropertyNames(ptr ${array.value})`, `  store ptr ${result}, ptr ${pointerName}`];
  }
  if (operation.targetKind === "value") {
    const value = emitNamedValueBinding(operation.targetName, context);
    useRuntimeHelper(context.runtime, "valueObjectOwnPropertyNames");
    return [`  ${pointerName} = alloca ptr`, ...value.lines, `  ${result} = call ptr @valueObjectOwnPropertyNames(i64 ${value.value})`, `  store ptr ${result}, ptr ${pointerName}`];
  }
  const object = emitRuntimeObjectPointer(operation.targetName, context);
  useRuntimeHelper(context.runtime, "objectOwnPropertyNames");
  return [`  ${pointerName} = alloca ptr`, ...object.lines, `  ${result} = call ptr @objectOwnPropertyNames(ptr ${object.value})`, `  store ptr ${result}, ptr ${pointerName}`];
}

function emitRuntimeObjectOwnPropertyDescriptorsOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeObjectOwnPropertyDescriptors" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeObject", name: operation.name });
  const result = `%obj.rt.${context.objectIndex}`;
  context.objectIndex += 1;
  if (operation.targetKind === "value") {
    const value = emitNamedValueBinding(operation.targetName, context);
    useRuntimeHelper(context.runtime, "valueObjectOwnPropertyDescriptors");
    return [`  ${pointerName} = alloca ptr`, ...value.lines, `  ${result} = call ptr @valueObjectOwnPropertyDescriptors(i64 ${value.value})`, `  store ptr ${result}, ptr ${pointerName}`];
  }
  if (operation.targetKind === "array") {
    const array = emitRuntimeArrayPointer(operation.targetName, context);
    useRuntimeHelper(context.runtime, "arrayOwnPropertyDescriptors");
    return [`  ${pointerName} = alloca ptr`, ...array.lines, `  ${result} = call ptr @arrayOwnPropertyDescriptors(ptr ${array.value})`, `  store ptr ${result}, ptr ${pointerName}`];
  }
  const object = emitRuntimeObjectPointer(operation.targetName, context);
  useRuntimeHelper(context.runtime, "objectOwnPropertyDescriptors");
  return [`  ${pointerName} = alloca ptr`, ...object.lines, `  ${result} = call ptr @objectOwnPropertyDescriptors(ptr ${object.value})`, `  store ptr ${result}, ptr ${pointerName}`];
}

function emitRuntimeArraySliceOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArraySlice" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  const array = emitRuntimeArrayPointer(operation.arrayName, context);
  const start = emitArrayIndex(operation.start, context);
  let end: NumberValue;
  if (operation.end === undefined) {
    const length = `%arr.len.${context.numIndex}`;
    context.numIndex += 1;
    useRuntimeHelper(context.runtime, "arrayLength");
    end = { lines: [`  ${length} = call i64 @arrayLength(ptr ${array.value})`], value: length };
  } else {
    end = emitArrayIndex(operation.end, context);
  }
  const result = `%arr.rt.${context.arrayIndex}`;
  context.arrayIndex += 1;
  useRuntimeHelper(context.runtime, "arraySlice");
  return [`  ${pointerName} = alloca ptr`, ...array.lines, ...start.lines, ...end.lines, `  ${result} = call ptr @arraySlice(ptr ${array.value}, i64 ${start.value}, i64 ${end.value})`, `  store ptr ${result}, ptr ${pointerName}`];
}

function emitRuntimeArraySpliceOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArraySplice" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  const array = emitRuntimeArrayPointer(operation.arrayName, context);
  const start = emitArrayIndex(operation.start, context);
  const lines = [`  ${pointerName} = alloca ptr`, ...array.lines, ...start.lines];
  let deleteCountArg: string;
  if (operation.deleteCount === undefined) {
    const length = `%arr.len.${context.numIndex}`;
    context.numIndex += 1;
    useRuntimeHelper(context.runtime, "arrayLength");
    lines.push(`  ${length} = call i64 @arrayLength(ptr ${array.value})`);
    deleteCountArg = length;
  } else {
    const deleteCount = emitArrayIndex(operation.deleteCount, context);
    lines.push(...deleteCount.lines);
    deleteCountArg = deleteCount.value;
  }
  const items = operation.items.map((item) => emitValueExpression(item, context));
  const itemsName = `%arr.splice.items.${context.arrayIndex}`;
  context.arrayIndex += 1;
  lines.push(`  ${itemsName} = call ptr @arrayNew(i64 ${items.length})`);
  for (let index = 0; index < items.length; index += 1) {
    const value = items[index];
    lines.push(...value.lines, `  call void @arraySet(ptr ${itemsName}, i64 ${index}, i64 ${value.value})`);
  }
  const result = `%arr.rt.${context.arrayIndex}`;
  context.arrayIndex += 1;
  useRuntimeHelper(context.runtime, "arraySplice");
  return [
    ...lines,
    `  ${result} = call ptr @arraySplice(ptr ${array.value}, i64 ${start.value}, i64 ${deleteCountArg}, i64 ${items.length}, ptr ${itemsName})`,
    `  store ptr ${result}, ptr ${pointerName}`
  ];
}

function emitRuntimeArraySpliceStatementOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArraySpliceStatement" }>,
  context: EmitContext
): string[] {
  const array = emitRuntimeArrayPointer(operation.arrayName, context);
  const start = emitArrayIndex(operation.start, context);
  const lines = [...array.lines, ...start.lines];
  let deleteCountArg: string;
  if (operation.deleteCount === undefined) {
    const length = `%arr.len.${context.numIndex}`;
    context.numIndex += 1;
    useRuntimeHelper(context.runtime, "arrayLength");
    lines.push(`  ${length} = call i64 @arrayLength(ptr ${array.value})`);
    deleteCountArg = length;
  } else {
    const deleteCount = emitArrayIndex(operation.deleteCount, context);
    lines.push(...deleteCount.lines);
    deleteCountArg = deleteCount.value;
  }
  const items = operation.items.map((item) => emitValueExpression(item, context));
  const itemsName = `%arr.splice.items.${context.arrayIndex}`;
  context.arrayIndex += 1;
  lines.push(`  ${itemsName} = call ptr @arrayNew(i64 ${items.length})`);
  for (let index = 0; index < items.length; index += 1) {
    const value = items[index];
    lines.push(...value.lines, `  call void @arraySet(ptr ${itemsName}, i64 ${index}, i64 ${value.value})`);
  }
  useRuntimeHelper(context.runtime, "arraySplice");
  return [...lines, `  call ptr @arraySplice(ptr ${array.value}, i64 ${start.value}, i64 ${deleteCountArg}, i64 ${items.length}, ptr ${itemsName})`];
}

function emitRuntimeArrayFlatOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayFlat" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  const array = emitRuntimeArrayPointer(operation.arrayName, context);
  const depth = emitArrayIndex(operation.depth, context);
  const result = `%arr.rt.${context.arrayIndex}`;
  context.arrayIndex += 1;
  useRuntimeHelper(context.runtime, "arrayFlat");
  return [
    `  ${pointerName} = alloca ptr`,
    ...array.lines,
    ...depth.lines,
    `  ${result} = call ptr @arrayFlat(ptr ${array.value}, i64 ${depth.value})`,
    `  store ptr ${result}, ptr ${pointerName}`
  ];
}

function emitRuntimeArrayConcatOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayConcat" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  const left = emitRuntimeArrayPointer(operation.leftName, context);
  const values = operation.values.flatMap((value) => {
    if (value.kind === "value") {
      return [emitValueExpression(value.value, context)];
    }
    const elements: JsValue[] = [];
    for (let index = 0; index < value.length; index += 1) {
      elements.push(emitValueExpression({ kind: "number", value: { kind: "arrayAccess", arrayName: value.arrayName, index: { kind: "literal", value: index } } }, context));
    }
    return elements;
  });
  const argsName = `%arr.concat.args.${context.arrayIndex}`;
  context.arrayIndex += 1;
  const result = `%arr.rt.${context.arrayIndex}`;
  context.arrayIndex += 1;
  const lines = [`  ${pointerName} = alloca ptr`, ...left.lines, `  ${argsName} = call ptr @arrayNew(i64 ${values.length})`];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    lines.push(...value.lines, `  call void @arraySet(ptr ${argsName}, i64 ${index}, i64 ${value.value})`);
  }
  useRuntimeHelper(context.runtime, "arrayConcat");
  return [...lines, `  ${result} = call ptr @arrayConcat(ptr ${left.value}, ptr ${argsName})`, `  store ptr ${result}, ptr ${pointerName}`];
}

function emitRuntimeValuesTargetPointer(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeObjectValues" }>,
  context: EmitContext
): NumberValue {
  if (operation.targetKind === "value") {
    return emitNamedValueBinding(operation.targetName, context);
  }
  if (operation.targetKind === "array") {
    return emitRuntimeArrayPointer(operation.targetName, context);
  }
  return emitRuntimeObjectPointer(operation.targetName, context);
}

function emitRuntimeArrayMutatorResultOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayMutatorResult" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  const array = emitRuntimeArrayPointer(operation.arrayName, context);
  const lines = [`  ${pointerName} = alloca ptr`, ...array.lines];
  if (operation.mutation.kind === "reverse") {
    useRuntimeHelper(context.runtime, "arrayReverse");
    lines.push(`  call void @arrayReverse(ptr ${array.value})`);
  } else if (operation.mutation.kind === "fill") {
    const mutationLines = emitRuntimeArrayFillOperation({ kind: "runtimeArrayFill", arrayName: operation.arrayName, value: operation.mutation.value, start: operation.mutation.start, end: operation.mutation.end }, context);
    lines.push(...mutationLines);
  } else {
    const mutationLines = emitRuntimeArrayCopyWithinOperation({ kind: "runtimeArrayCopyWithin", arrayName: operation.arrayName, target: operation.mutation.target, start: operation.mutation.start, end: operation.mutation.end }, context);
    lines.push(...mutationLines);
  }
  lines.push(`  store ptr ${array.value}, ptr ${pointerName}`);
  return lines;
}

function emitRuntimeObjectGetPrototypeOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeObjectGetPrototype" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeObject", name: operation.name });
  const target = emitRuntimePrototypeTargetPointer(operation, context);
  const helper = runtimeGetPrototypeHelper(operation.targetKind);
  const result = `%obj.rt.${context.objectIndex}`;
  context.objectIndex += 1;
  useRuntimeHelper(context.runtime, helper);
  return [`  ${pointerName} = alloca ptr`, ...target.lines, `  ${result} = call ptr @${helper}(ptr ${target.value})`, `  store ptr ${result}, ptr ${pointerName}`];
}

function emitRuntimeKeysTargetPointer(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeObjectKeys" }>,
  context: EmitContext
): NumberValue {
  if (operation.targetKind === "value") {
    return emitNamedValueBinding(operation.targetName, context);
  }
  if (operation.targetKind === "array") {
    return emitRuntimeArrayPointer(operation.targetName, context);
  }
  return emitRuntimeObjectPointer(operation.targetName, context);
}

function runtimeKeysHelper(targetKind: "object" | "array" | "value"): "objectKeys" | "arrayKeys" | "valueObjectKeys" {
  if (targetKind === "array") {
    return "arrayKeys";
  }
  if (targetKind === "value") {
    return "valueObjectKeys";
  }
  return "objectKeys";
}

function runtimeAggregateArgumentType(targetKind: "object" | "array" | "value"): "ptr" | "i64" {
  if (targetKind === "value") {
    return "i64";
  }
  return "ptr";
}

function emitNamedValueBinding(name: string, context: EmitContext): JsValue {
  const binding = context.bindings.get(name);
  if (binding?.kind === "value") {
    return emitValueExpression(binding.value, context);
  }
  if (binding?.kind === "valueVariable") {
    return emitValueExpression({ kind: "variable", name: binding.name }, context);
  }
  throw new Error("Expected JSValue binding");
}

function emitRuntimePrototypeTargetPointer(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeObjectGetPrototype" }>,
  context: EmitContext
): NumberValue {
  if (operation.targetKind === "array") {
    return emitRuntimeArrayPointer(operation.targetName, context);
  }
  return emitRuntimeObjectPointer(operation.targetName, context);
}

function runtimeGetPrototypeHelper(targetKind: "object" | "array"): "objectGetPrototype" | "arrayGetPrototype" {
  if (targetKind === "array") {
    return "arrayGetPrototype";
  }
  return "objectGetPrototype";
}

function knownShapeObjectToRuntimeValue(value: JsIrObjectValue): JsIrRuntimeObjectValue {
  return {
    fields: value.fields
      .flatMap((field) => {
        if (field.value.kind === "object") {
          throw new Error("Nested known-shape object fields cannot be converted to runtime JSValue dictionaries yet");
        }
        return [{ kind: "field" as const, key: { kind: "literal" as const, value: field.name }, value: { kind: "number" as const, value: field.value.value } }];
      })
  };
}

function emitRuntimeObjectLiteralStorage(
  pointerName: string,
  value: JsIrRuntimeObjectValue,
  context: EmitContext
): string[] {
  useRuntimeHelper(context.runtime, "objectNew");
  useRuntimeHelper(context.runtime, "objectSet");
  const objectName = `%obj.rt.${context.objectIndex}`;
  context.objectIndex += 1;
  const ownFieldCount = value.fields.filter((field) => field.kind === "field").length;
  const lines = [`  ${pointerName} = alloca ptr`, `  ${objectName} = call ptr @objectNew(i64 ${ownFieldCount})`, `  store ptr ${objectName}, ptr ${pointerName}`];
  for (const field of value.fields) {
    if (field.kind === "spread") {
      const source = emitRuntimeObjectPointer(field.sourceName, context);
      useRuntimeHelper(context.runtime, "objectAssign");
      lines.push(...source.lines, `  call void @objectAssign(ptr ${objectName}, ptr ${source.value})`);
      continue;
    }
    const key = emitStringExpression(field.key, context);
    const fieldValue = emitValueExpression(field.value, context);
    lines.push(...key.lines, ...fieldValue.lines, `  call void @objectSet(ptr ${objectName}, i64 ${key.length}, ptr ${key.value}, i64 ${fieldValue.value})`);
  }
  return lines;
}

function emitAssignNumberOperation(
  operation: Extract<JsIrOperation, { readonly kind: "assignNumber" }>,
  context: EmitContext
): string[] {
  const binding = context.bindings.get(operation.name);
  if (binding?.kind !== "number" || binding.value.kind !== "variable") {
    return [];
  }

  const result = emitNumberExpression(operation.value, context);
  return [...result.lines, `  store double ${result.value}, ptr ${binding.value.name}`];
}

function emitAssignStringOperation(
  operation: Extract<JsIrOperation, { readonly kind: "assignString" }>,
  context: EmitContext
): string[] {
  const binding = context.bindings.get(operation.name);
  if (binding?.kind !== "stringVariable") {
    return [];
  }

  const result = emitStringExpression(operation.value, context);
  return [
    ...result.lines,
    `  store ptr ${result.value}, ptr ${variablePointerName(binding.name)}`,
    `  store i64 ${result.length}, ptr ${stringLengthPointerName(binding.name)}`
  ];
}

function emitAssignBooleanOperation(
  operation: Extract<JsIrOperation, { readonly kind: "assignBoolean" }>,
  context: EmitContext
): string[] {
  const binding = context.bindings.get(operation.name);
  if (binding?.kind !== "booleanVariable") {
    return [];
  }

  const result = emitCondition(operation.value, context);
  return [...result.lines, `  store i1 ${result.value}, ptr ${variablePointerName(binding.name)}`];
}

function emitArrayStoreOperation(
  operation: Extract<JsIrOperation, { readonly kind: "arrayStore" }>,
  context: EmitContext
): string[] {
  const pointer = emitArrayElementPointer(operation.arrayName, operation.index, context);
  const value = emitNumberExpression(operation.value, context);
  return [...pointer.lines, ...value.lines, `  store double ${value.value}, ptr ${pointer.value}`];
}

function emitRuntimeArrayStoreOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayStore" }>,
  context: EmitContext
): string[] {
  const array = emitRuntimeArrayPointer(operation.arrayName, context);
  const index = emitArrayIndex(operation.index, context);
  const value = emitValueExpression(operation.value, context);
  useRuntimeHelper(context.runtime, "arraySet");
  return [...array.lines, ...index.lines, ...value.lines, `  call void @arraySet(ptr ${array.value}, i64 ${index.value}, i64 ${value.value})`];
}

function emitRuntimeArrayNamedStoreOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayNamedStore" }>,
  context: EmitContext
): string[] {
  const array = emitRuntimeArrayPointer(operation.arrayName, context);
  const key = emitStringExpression(operation.key, context);
  const value = emitValueExpression(operation.value, context);
  useRuntimeHelper(context.runtime, "arraySetNamed");
  return [...array.lines, ...key.lines, ...value.lines, `  call void @arraySetNamed(ptr ${array.value}, i64 ${key.length}, ptr ${key.value}, i64 ${value.value})`];
}

function emitRuntimeArrayDeleteOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayDelete" }>,
  context: EmitContext
): string[] {
  const array = emitRuntimeArrayPointer(operation.arrayName, context);
  const index = emitArrayIndex(operation.index, context);
  useRuntimeHelper(context.runtime, "arrayDelete");
  return [...array.lines, ...index.lines, `  call void @arrayDelete(ptr ${array.value}, i64 ${index.value})`];
}

function emitRuntimeArrayNamedDeleteOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayNamedDelete" }>,
  context: EmitContext
): string[] {
  const array = emitRuntimeArrayPointer(operation.arrayName, context);
  const key = emitStringExpression(operation.key, context);
  useRuntimeHelper(context.runtime, "arrayDeleteNamed");
  return [...array.lines, ...key.lines, `  call void @arrayDeleteNamed(ptr ${array.value}, i64 ${key.length}, ptr ${key.value})`];
}

function emitRuntimeArraySetLengthOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArraySetLength" }>,
  context: EmitContext
): string[] {
  const array = emitRuntimeArrayPointer(operation.arrayName, context);
  const length = emitArrayIndex(operation.length, context);
  useRuntimeHelper(context.runtime, "arraySetLength");
  return [...array.lines, ...length.lines, `  call void @arraySetLength(ptr ${array.value}, i64 ${length.value})`];
}

function emitRuntimeArrayAppendOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayPush" | "runtimeArrayUnshift" }>,
  context: EmitContext
): string[] {
  const array = emitRuntimeArrayPointer(operation.arrayName, context);
  const values = operation.values.map((value) => emitValueExpression(value, context));
  const lines = [...array.lines];
  const helper = runtimeArrayAppendHelper(operation.kind);
  useRuntimeHelper(context.runtime, helper);
  for (const value of values) {
    lines.push(...value.lines, `  call i64 @${helper}(ptr ${array.value}, i64 ${value.value})`);
  }
  return lines;
}

function emitRuntimeArrayRemoveOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayPop" | "runtimeArrayShift" }>,
  context: EmitContext
): string[] {
  const array = emitRuntimeArrayPointer(operation.arrayName, context);
  const helper = runtimeArrayRemoveHelper(operation.kind);
  useRuntimeHelper(context.runtime, helper);
  return [...array.lines, `  call i64 @${helper}(ptr ${array.value})`];
}

function emitRuntimeArrayFillOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayFill" }>,
  context: EmitContext
): string[] {
  const array = emitRuntimeArrayPointer(operation.arrayName, context);
  const value = emitValueExpression(operation.value, context);
  let start: NumberValue = { lines: [], value: "0" };
  let end: NumberValue;
  if (operation.start !== undefined) {
    start = emitArrayIndex(operation.start, context);
  }
  if (operation.end === undefined) {
    const length = `%arr.len.${context.numIndex}`;
    context.numIndex += 1;
    useRuntimeHelper(context.runtime, "arrayLength");
    end = { lines: [`  ${length} = call i64 @arrayLength(ptr ${array.value})`], value: length };
  } else {
    end = emitArrayIndex(operation.end, context);
  }
  useRuntimeHelper(context.runtime, "arrayFill");
  return [...array.lines, ...value.lines, ...start.lines, ...end.lines, `  call void @arrayFill(ptr ${array.value}, i64 ${value.value}, i64 ${start.value}, i64 ${end.value})`];
}

function emitRuntimeArrayReverseOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayReverse" }>,
  context: EmitContext
): string[] {
  const array = emitRuntimeArrayPointer(operation.arrayName, context);
  useRuntimeHelper(context.runtime, "arrayReverse");
  return [...array.lines, `  call void @arrayReverse(ptr ${array.value})`];
}

function emitRuntimeArrayCopyWithinOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayCopyWithin" }>,
  context: EmitContext
): string[] {
  const array = emitRuntimeArrayPointer(operation.arrayName, context);
  const target = emitArrayIndex(operation.target, context);
  const start = emitArrayIndex(operation.start, context);
  let end: NumberValue;
  if (operation.end === undefined) {
    const length = `%arr.len.${context.numIndex}`;
    context.numIndex += 1;
    useRuntimeHelper(context.runtime, "arrayLength");
    end = { lines: [`  ${length} = call i64 @arrayLength(ptr ${array.value})`], value: length };
  } else {
    end = emitArrayIndex(operation.end, context);
  }
  useRuntimeHelper(context.runtime, "arrayCopyWithin");
  return [...array.lines, ...target.lines, ...start.lines, ...end.lines, `  call void @arrayCopyWithin(ptr ${array.value}, i64 ${target.value}, i64 ${start.value}, i64 ${end.value})`];
}

function runtimeArrayAppendHelper(kind: "runtimeArrayPush" | "runtimeArrayUnshift"): "arrayPush" | "arrayUnshift" {
  if (kind === "runtimeArrayPush") {
    return "arrayPush";
  }
  return "arrayUnshift";
}

function runtimeArrayRemoveHelper(kind: "runtimeArrayPop" | "runtimeArrayShift"): "arrayPop" | "arrayShift" {
  if (kind === "runtimeArrayPop") {
    return "arrayPop";
  }
  return "arrayShift";
}

function emitObjectStoreOperation(
  operation: Extract<JsIrOperation, { readonly kind: "objectStore" }>,
  context: EmitContext
): string[] {
  const pointer = emitObjectFieldPointer(operation.objectName, operation.path, context);
  if (pointer === undefined) {
    return [];
  }
  const value = emitNumberExpression(operation.value, context);
  const lines = [...pointer.lines, ...value.lines, `  store double ${value.value}, ptr ${pointer.value}`];
  const layout = context.objectLayouts.get(operation.objectName);
  if (layout?.runtimePointerName !== undefined && operation.path.length === 1) {
    const key = emitStringExpression({ kind: "literal", value: operation.path[0] }, context);
    const jsValue = emitNumberValueExpression({ kind: "number", value: operation.value }, context);
    const object = emitRuntimeObjectPointer(operation.objectName, context);
    useRuntimeHelper(context.runtime, "objectSet");
    lines.push(...key.lines, ...jsValue.lines, ...object.lines, `  call void @objectSet(ptr ${object.value}, i64 ${key.length}, ptr ${key.value}, i64 ${jsValue.value})`);
  }
  return lines;
}

function emitRuntimeObjectStoreOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeObjectStore" }>,
  context: EmitContext
): string[] {
  const object = emitRuntimeObjectPointer(operation.objectName, context);
  const key = emitStringExpression(operation.key, context);
  const value = emitValueExpression(operation.value, context);
  useRuntimeHelper(context.runtime, "objectSet");
  return [...object.lines, ...key.lines, ...value.lines, `  call void @objectSet(ptr ${object.value}, i64 ${key.length}, ptr ${key.value}, i64 ${value.value})`];
}

function emitRuntimeObjectDeleteOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeObjectDelete" }>,
  context: EmitContext
): string[] {
  const object = emitRuntimeObjectPointer(operation.objectName, context);
  const key = emitStringExpression(operation.key, context);
  useRuntimeHelper(context.runtime, "objectDelete");
  return [...object.lines, ...key.lines, `  call void @objectDelete(ptr ${object.value}, i64 ${key.length}, ptr ${key.value})`];
}

function emitValueAggregateStoreOperation(
  operation: Extract<JsIrOperation, { readonly kind: "valueObjectStore" | "valueArrayStore" | "valueArraySetLength" }>,
  context: EmitContext
): string[] {
  const receiver = emitNamedValueBinding(operation.targetName, context);
  if (operation.kind === "valueArraySetLength") {
    const length = emitArrayIndex(operation.length, context);
    useRuntimeHelper(context.runtime, "valueArraySetLength");
    return [...receiver.lines, ...length.lines, `  call void @valueArraySetLength(i64 ${receiver.value}, i64 ${length.value})`];
  }
  if (operation.kind === "valueArrayStore") {
    const index = emitArrayIndex(operation.index, context);
    const value = emitValueExpression(operation.value, context);
    useRuntimeHelper(context.runtime, "valueArraySet");
    return [...receiver.lines, ...index.lines, ...value.lines, `  call void @valueArraySet(i64 ${receiver.value}, i64 ${index.value}, i64 ${value.value})`];
  }
  const key = emitStringExpression(operation.key, context);
  const value = emitValueExpression(operation.value, context);
  useRuntimeHelper(context.runtime, "valueObjectSet");
  return [...receiver.lines, ...key.lines, ...value.lines, `  call void @valueObjectSet(i64 ${receiver.value}, i64 ${key.length}, ptr ${key.value}, i64 ${value.value})`];
}

function emitValueAggregateDeleteOperation(
  operation: Extract<JsIrOperation, { readonly kind: "valueObjectDelete" | "valueArrayDelete" }>,
  context: EmitContext
): string[] {
  const receiver = emitNamedValueBinding(operation.targetName, context);
  if (operation.kind === "valueArrayDelete") {
    const index = emitArrayIndex(operation.index, context);
    useRuntimeHelper(context.runtime, "valueArrayDelete");
    return [...receiver.lines, ...index.lines, `  call void @valueArrayDelete(i64 ${receiver.value}, i64 ${index.value})`];
  }
  const key = emitStringExpression(operation.key, context);
  useRuntimeHelper(context.runtime, "valueObjectDelete");
  return [...receiver.lines, ...key.lines, `  call void @valueObjectDelete(i64 ${receiver.value}, i64 ${key.length}, ptr ${key.value})`];
}

function emitRuntimeObjectSetPrototypeOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeObjectSetPrototype" }>,
  context: EmitContext
): string[] {
  let target = emitRuntimeObjectPointer(operation.targetName, context);
  if (operation.targetKind === "array") {
    target = emitRuntimeArrayPointer(operation.targetName, context);
  }
  const lines = [...target.lines];
  let prototype = "null";
  if (operation.prototypeName !== undefined) {
    const prototypeObject = emitRuntimeObjectPointer(operation.prototypeName, context);
    lines.push(...prototypeObject.lines);
    prototype = prototypeObject.value;
  }
  let helper: "arraySetPrototype" | "objectSetPrototype" = "objectSetPrototype";
  if (operation.targetKind === "array") {
    helper = "arraySetPrototype";
  }
  useRuntimeHelper(context.runtime, helper);
  lines.push(`  call void @${helper}(ptr ${target.value}, ptr ${prototype})`);
  return lines;
}

function emitRuntimeObjectDefineDataPropertyOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeObjectDefineDataProperty" }>,
  context: EmitContext
): string[] {
  const object = emitRuntimeObjectPointer(operation.objectName, context);
  const key = emitStringExpression(operation.descriptor.key, context);
  const value = emitValueExpression(operation.descriptor.value, context);
  const flags = descriptorFlags(operation.descriptor);
  useRuntimeHelper(context.runtime, "objectDefineDataProperty");
  return [
    ...object.lines,
    ...key.lines,
    ...value.lines,
    `  call void @objectDefineDataProperty(ptr ${object.value}, i64 ${key.length}, ptr ${key.value}, i64 ${value.value}, i64 ${flags})`
  ];
}

function emitRuntimeObjectStateMutationOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeObjectPreventExtensions" | "runtimeObjectSeal" | "runtimeObjectFreeze" }>,
  context: EmitContext
): string[] {
  const object = emitRuntimeObjectPointer(operation.objectName, context);
  const helperByKind = {
    runtimeObjectPreventExtensions: "objectPreventExtensions",
    runtimeObjectSeal: "objectSeal",
    runtimeObjectFreeze: "objectFreeze"
  } as const;
  const helper = helperByKind[operation.kind];
  useRuntimeHelper(context.runtime, helper);
  return [...object.lines, `  call void @${helper}(ptr ${object.value})`];
}

// eslint-disable-next-line max-statements -- Object.assign emission handles each supported source shape explicitly.
function emitRuntimeObjectAssignOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeObjectAssign" }>,
  context: EmitContext
): string[] {
  const target = emitRuntimeObjectPointer(operation.targetName, context);
  const lines = [...target.lines];
  for (const source of operation.sources) {
    if (source.kind === "runtimeObject") {
      const sourceObject = emitRuntimeObjectPointer(source.name, context);
      useRuntimeHelper(context.runtime, "objectAssign");
      lines.push(...sourceObject.lines, `  call void @objectAssign(ptr ${target.value}, ptr ${sourceObject.value})`);
      continue;
    }
    if (source.kind === "runtimeArray") {
      const sourceArray = emitRuntimeArrayPointer(source.name, context);
      useRuntimeHelper(context.runtime, "objectAssignArray");
      lines.push(...sourceArray.lines, `  call void @objectAssignArray(ptr ${target.value}, ptr ${sourceArray.value})`);
      continue;
    }
    if (source.kind === "fixedObject") {
      const pointerName = `%obj.assign.${context.objectIndex}`;
      const loadedName = `%obj.assign.ptr.${context.objectIndex}`;
      context.objectIndex += 1;
      lines.push(...emitRuntimeObjectLiteralStorage(pointerName, knownShapeObjectToRuntimeValue(source.value), context));
      useRuntimeHelper(context.runtime, "objectAssign");
      lines.push(`  ${loadedName} = load ptr, ptr ${pointerName}`, `  call void @objectAssign(ptr ${target.value}, ptr ${loadedName})`);
      continue;
    }
    if (source.kind === "fixedArray") {
      useRuntimeHelper(context.runtime, "objectSet");
      useRuntimeHelper(context.runtime, "indexToString");
      for (let index = 0; index < source.length; index += 1) {
        const keyName = `%assign.key.${context.numIndex}`;
        const value = emitNumberValueExpression({ kind: "number", value: { kind: "arrayAccess", arrayName: source.name, index: { kind: "literal", value: index } } }, context);
        context.numIndex += 1;
        lines.push(`  ${keyName} = call ptr @indexToString(i64 ${index})`, ...value.lines, `  call void @objectSet(ptr ${target.value}, i64 ${String(index).length}, ptr ${keyName}, i64 ${value.value})`);
      }
      continue;
    }
    const value = emitValueExpression(source.value, context);
    useRuntimeHelper(context.runtime, "valueObjectAssign");
    lines.push(...value.lines, `  call void @valueObjectAssign(ptr ${target.value}, i64 ${value.value})`);
  }
  return lines;
}

function descriptorFlags(descriptor: Extract<JsIrOperation, { readonly kind: "runtimeObjectDefineDataProperty" }>["descriptor"]): number {
  let flags = 0;
  if (descriptor.writable) {
    flags += descriptorWritableFlag;
  }
  if (descriptor.enumerable) {
    flags += descriptorEnumerableFlag;
  }
  if (descriptor.configurable) {
    flags += descriptorConfigurableFlag;
  }
  return flags;
}

function emitCallOperation(operation: { readonly kind: "call"; readonly name: string; readonly arguments: readonly JsIrCallArgument[] }, context: EmitContext): string[] {
  const returnType = "void";
  const args = emitCallArguments(operation.arguments, context);
  const argValues = args.values.join(", ");
  return [...args.lines, `  call ${returnType} @${operation.name}(${argValues})`];
}

function emitCallExpressionResult(expression: { readonly kind: "call"; readonly name: string; readonly arguments: readonly JsIrNumberExpression[] }, context: EmitContext): { readonly lines: string[]; readonly value: string } {
  const lines: string[] = [];
  const argValues: string[] = [];
  for (const arg of expression.arguments) {
    const result = emitNumberExpression(arg, context);
    lines.push(...result.lines);
    argValues.push(`double ${result.value}`);
  }
  const args = argValues.join(", ");
  const index = context.callIndex;
  context.callIndex += 1;
  const name = `%call.${index}`;
  lines.push(`  ${name} = call double @${expression.name}(${args})`);
  return { lines, value: name };
}

function emitNumberCallExpressionResult(expression: { readonly kind: "call"; readonly name: string; readonly arguments: readonly JsIrCallArgument[] }, context: EmitContext): { readonly lines: string[]; readonly value: string } {
  const args = emitCallArguments(expression.arguments, context);
  const index = context.callIndex;
  context.callIndex += 1;
  const name = `%call.${index}`;
  return { lines: [...args.lines, `  ${name} = call double @${expression.name}(${args.values.join(", ")})`], value: name };
}

function emitStringCallExpressionResult(expression: { readonly kind: "call"; readonly name: string; readonly arguments: readonly JsIrCallArgument[] }, context: EmitContext): StringValue {
  const args = emitCallArguments(expression.arguments, context);
  const index = context.callIndex;
  context.callIndex += 1;
  const result = `%call.${index}`;
  const value = `%call.${index}.ptr`;
  const length = `%call.${index}.len`;
  return {
    lines: [
      ...args.lines,
      `  ${result} = call { ptr, i64 } @${expression.name}(${args.values.join(", ")})`,
      `  ${value} = extractvalue { ptr, i64 } ${result}, 0`,
      `  ${length} = extractvalue { ptr, i64 } ${result}, 1`
    ],
    value,
    length
  };
}

function emitCallArguments(args: readonly JsIrCallArgument[], context: EmitContext): { readonly lines: string[]; readonly values: string[] } {
  const lines: string[] = [];
  const values: string[] = [];
  for (const arg of args) {
    if (arg.valueKind === "string") {
      const result = emitStringExpression(arg.value, context);
      lines.push(...result.lines);
      values.push(`i64 ${result.length}`, `ptr ${result.value}`);
      continue;
    }
    if (arg.valueKind === "value") {
      const result = emitValueExpression(arg.value, context);
      lines.push(...result.lines);
      values.push(`i64 ${result.value}`);
      continue;
    }
    const result = emitNumberExpression(arg.value, context);
    lines.push(...result.lines);
    values.push(`double ${result.value}`);
  }
  return { lines, values };
}

function emitNumberReturnOperation(operation: { readonly kind: "returnNumber"; readonly expression: JsIrNumberExpression }, context: EmitContext): string[] {
  const result = emitNumberExpression(operation.expression, context);
  return [...result.lines, `  ret double ${result.value}`];
}

function emitStringReturnOperation(operation: { readonly kind: "returnString"; readonly expression: JsIrStringExpression }, context: EmitContext): string[] {
  const result = emitStringExpression(operation.expression, context);
  return [
    ...result.lines,
    `  %ret.str.0 = insertvalue { ptr, i64 } undef, ptr ${result.value}, 0`,
    `  %ret.str.1 = insertvalue { ptr, i64 } %ret.str.0, i64 ${result.length}, 1`,
    "  ret { ptr, i64 } %ret.str.1"
  ];
}

function emitValueReturnOperation(operation: { readonly kind: "returnValue"; readonly expression: JsIrValueExpression }, context: EmitContext): string[] {
  const result = emitValueExpression(operation.expression, context);
  return [...result.lines, `  ret i64 ${result.value}`];
}

// eslint-disable-next-line complexity, max-statements -- Transitional JSValue emission remains centralized during aggregate boxing.
function emitValueExpression(expression: JsIrValueExpression, context: EmitContext): JsValue {
  const primitive = emitPrimitiveValueExpression(expression, context);
  if (primitive !== undefined) {
    return primitive;
  }

  if (expression.kind === "variable") {
    if (!expression.name.startsWith("%")) {
      const value = `%value.${context.numIndex}`;
      context.numIndex += 1;
      return { lines: [`  ${value} = load i64, ptr ${variablePointerName(expression.name)}`], value };
    }
    return { lines: [], value: expression.name };
  }

  if (expression.kind === "call") {
    const args = emitCallArguments(expression.arguments, context);
    const index = context.callIndex;
    context.callIndex += 1;
    const value = `%call.${index}`;
    return { lines: [...args.lines, `  ${value} = call i64 @${expression.name}(${args.values.join(", ")})`], value };
  }

  if (expression.kind === "ternary") {
    return emitTernaryValueExpression(expression, context);
  }

  if (expression.kind === "arrayAccess") {
    return emitRuntimeArrayValueExpression(expression, context);
  }

  if (expression.kind === "objectDynamicAccess") {
    return emitRuntimeObjectValueExpression(expression, context);
  }

  if (expression.kind === "valueObjectDynamicAccess") {
    return emitValueObjectValueExpression(expression, context);
  }

  if (expression.kind === "valueArrayAccess") {
    return emitValueArrayValueExpression(expression, context);
  }

  if (expression.kind === "arrayPop" || expression.kind === "arrayShift") {
    return emitRuntimeArrayRemoveValueExpression(expression, context);
  }

  if (expression.kind === "arrayIncludes") {
    const condition = emitRuntimeArrayIncludesCondition(expression, context);
    const index = context.numIndex;
    context.numIndex += 1;
    const value = `%value.${index}`;
    return { lines: [...condition.lines, `  ${value} = select i1 ${condition.value}, i64 ${jsValueTrue}, i64 ${jsValueFalse}`], value };
  }

  if (expression.kind === "arrayAt") {
    const array = emitRuntimeArrayPointer(expression.arrayName, context);
    const atIndex = emitArrayIndex(expression.index, context);
    const value = `%value.${context.numIndex}`;
    context.numIndex += 1;
    useRuntimeHelper(context.runtime, "arrayAt");
    return { lines: [...array.lines, ...atIndex.lines, `  ${value} = call i64 @arrayAt(ptr ${array.value}, i64 ${atIndex.value})`], value };
  }

  if (expression.kind === "valuePlus") {
    const left = emitValueExpression(expression.left, context);
    const right = emitValueExpression(expression.right, context);
    const value = `%value.${context.numIndex}`;
    context.numIndex += 1;
    useRuntimeHelper(context.runtime, "valuePlus");
    return { lines: [...left.lines, ...right.lines, `  ${value} = call i64 @valuePlus(i64 ${left.value}, i64 ${right.value})`], value };
  }

  if (expression.kind === "logicalValue") {
    return emitLogicalValueExpression(expression, context);
  }

  if (expression.kind === "nullishCoalesce") {
    return emitNullishCoalesceValueExpression(expression, context);
  }

  if (expression.kind === "optionalChain") {
    return emitOptionalChainValueExpression(expression, context);
  }

  if (expression.kind === "optionalTarget") {
    const target = context.optionalTargets.at(-1);
    if (target === undefined) {
      throw new Error("Optional chain target referenced outside an optional chain");
    }
    return { lines: [], value: target };
  }

  if (expression.kind === "arrayFind") {
    const array = emitRuntimeArrayPointer(expression.arrayName, context);
    const value = `%value.${context.numIndex}`;
    context.numIndex += 1;
    useRuntimeHelper(context.runtime, "arrayFind");
    return { lines: [...array.lines, `  ${value} = call i64 @arrayFind(ptr ${array.value})`], value };
  }

  if (expression.kind === "arrayForEach") {
    return { lines: [], value: jsValueUndefined };
  }

  if (expression.kind === "objectRef") {
    const object = emitRuntimeObjectPointer(expression.name, context);
    const value = `%value.${context.numIndex}`;
    context.numIndex += 1;
    useRuntimeHelper(context.runtime, "valueBoxObject");
    return { lines: [...object.lines, `  ${value} = call i64 @valueBoxObject(ptr ${object.value})`], value };
  }

  if (expression.kind === "objectLiteralValue") {
    const pointerName = `%obj.value.${context.objectIndex}.addr`;
    const lines = emitRuntimeObjectLiteralStorage(pointerName, expression.value, context);
    const object = `%obj.value.${context.objectIndex}.ptr`;
    const value = `%value.${context.numIndex}`;
    context.numIndex += 1;
    useRuntimeHelper(context.runtime, "valueBoxObject");
    return { lines: [...lines, `  ${object} = load ptr, ptr ${pointerName}`, `  ${value} = call i64 @valueBoxObject(ptr ${object})`], value };
  }

  if (expression.kind === "arrayRef") {
    const array = emitRuntimeArrayPointer(expression.name, context);
    const value = `%value.${context.numIndex}`;
    context.numIndex += 1;
    useRuntimeHelper(context.runtime, "valueBoxArray");
    return { lines: [...array.lines, `  ${value} = call i64 @valueBoxArray(ptr ${array.value})`], value };
  }

  throw new Error("Unsupported value expression");
}

function emitRuntimeArrayRemoveValueExpression(
  expression: Extract<JsIrValueExpression, { readonly kind: "arrayPop" | "arrayShift" }>,
  context: EmitContext
): JsValue {
  const array = emitRuntimeArrayPointer(expression.arrayName, context);
  const valueIndex = context.numIndex;
  context.numIndex += 1;
  const value = `%value.${valueIndex}`;
  const helper = arrayValueRemoveHelper(expression.kind);
  useRuntimeHelper(context.runtime, helper);
  return { lines: [...array.lines, `  ${value} = call i64 @${helper}(ptr ${array.value})`], value };
}

function arrayValueRemoveHelper(kind: "arrayPop" | "arrayShift"): "arrayPop" | "arrayShift" {
  if (kind === "arrayPop") {
    return "arrayPop";
  }
  return "arrayShift";
}

function emitRuntimeArrayValueExpression(
  expression: Extract<JsIrValueExpression, { readonly kind: "arrayAccess" }>,
  context: EmitContext
): JsValue {
  const array = emitRuntimeArrayPointer(expression.arrayName, context);
  const index = emitArrayIndex(expression.index, context);
  const valueIndex = context.numIndex;
  context.numIndex += 1;
  const value = `%value.${valueIndex}`;
  if (expression.key !== undefined) {
    const key = emitStringExpression(expression.key, context);
    useRuntimeHelper(context.runtime, "arrayGetWithKey");
    return {
      lines: [...array.lines, ...index.lines, ...key.lines, `  ${value} = call i64 @arrayGetWithKey(ptr ${array.value}, i64 ${index.value}, i64 ${key.length}, ptr ${key.value})`],
      value
    };
  }
  useRuntimeHelper(context.runtime, "arrayGet");
  return { lines: [...array.lines, ...index.lines, `  ${value} = call i64 @arrayGet(ptr ${array.value}, i64 ${index.value})`], value };
}

function emitRuntimeObjectValueExpression(
  expression: Extract<JsIrValueExpression, { readonly kind: "objectDynamicAccess" }>,
  context: EmitContext
): JsValue {
  const object = emitRuntimeObjectPointer(expression.objectName, context);
  const key = emitStringExpression(expression.key, context);
  const valueIndex = context.numIndex;
  context.numIndex += 1;
  const value = `%value.${valueIndex}`;
  useRuntimeHelper(context.runtime, "objectGet");
  return {
    lines: [...object.lines, ...key.lines, `  ${value} = call i64 @objectGet(ptr ${object.value}, i64 ${key.length}, ptr ${key.value})`],
    value
  };
}

function emitValueObjectValueExpression(
  expression: Extract<JsIrValueExpression, { readonly kind: "valueObjectDynamicAccess" }>,
  context: EmitContext
): JsValue {
  const receiver = emitValueExpression(expression.value, context);
  const key = emitStringExpression(expression.key, context);
  const valueIndex = context.numIndex;
  context.numIndex += 1;
  const value = `%value.${valueIndex}`;
  useRuntimeHelper(context.runtime, "valueObjectGet");
  return {
    lines: [...receiver.lines, ...key.lines, `  ${value} = call i64 @valueObjectGet(i64 ${receiver.value}, i64 ${key.length}, ptr ${key.value})`],
    value
  };
}

function emitValueArrayValueExpression(
  expression: Extract<JsIrValueExpression, { readonly kind: "valueArrayAccess" }>,
  context: EmitContext
): JsValue {
  const receiver = emitValueExpression(expression.value, context);
  const index = emitArrayIndex(expression.index, context);
  const key = emitStringExpression(expression.key, context);
  const valueIndex = context.numIndex;
  context.numIndex += 1;
  const value = `%value.${valueIndex}`;
  useRuntimeHelper(context.runtime, "valueArrayGet");
  return {
    lines: [...receiver.lines, ...index.lines, ...key.lines, `  ${value} = call i64 @valueArrayGet(i64 ${receiver.value}, i64 ${index.value}, i64 ${key.length}, ptr ${key.value})`],
    value
  };
}

function emitPrimitiveValueExpression(expression: JsIrValueExpression, context: EmitContext): JsValue | undefined {
  if (expression.kind === "undefined") {
    return { lines: [], value: jsValueUndefined };
  }

  if (expression.kind === "null") {
    return { lines: [], value: jsValueNull };
  }

  if (expression.kind === "number") {
    return emitNumberValueExpression(expression, context);
  }

  if (expression.kind === "boolean") {
    return emitBooleanValueExpression(expression, context);
  }

  if (expression.kind === "string") {
    return emitStringValueExpression(expression, context);
  }

  return undefined;
}

function emitNumberValueExpression(expression: Extract<JsIrValueExpression, { readonly kind: "number" }>, context: EmitContext): JsValue {
  const number = emitNumberExpression(expression.value, context);
  const index = context.numIndex;
  context.numIndex += 1;
  const value = `%value.${index}`;
  return { lines: [...number.lines, `  ${value} = bitcast double ${llvmDoubleBitcastOperand(number.value)} to i64`], value };
}

function emitBooleanValueExpression(expression: Extract<JsIrValueExpression, { readonly kind: "boolean" }>, context: EmitContext): JsValue {
  const condition = emitCondition(expression.value, context);
  const index = context.numIndex;
  context.numIndex += 1;
  const value = `%value.${index}`;
  return { lines: [...condition.lines, `  ${value} = select i1 ${condition.value}, i64 ${jsValueTrue}, i64 ${jsValueFalse}`], value };
}

function emitStringValueExpression(expression: Extract<JsIrValueExpression, { readonly kind: "string" }>, context: EmitContext): JsValue {
  const string = emitStringExpression(expression.value, context);
  const index = context.numIndex;
  context.numIndex += 1;
  const value = `%value.${index}`;
  useRuntimeHelper(context.runtime, "valueBoxString");
  return {
    lines: [
      ...string.lines,
      `  ${value} = call i64 @valueBoxString(ptr ${string.value}, i64 ${string.length})`
    ],
    value
  };
}

function llvmDoubleBitcastOperand(value: string): string {
  if (/^-?\d+$/.test(value)) {
    return `${value}.0`;
  }
  return value;
}

function llvmDoubleLiteral(value: number): string {
  if (value === Number.POSITIVE_INFINITY) {
    return "0x7FF0000000000000";
  }
  if (value === Number.NEGATIVE_INFINITY) {
    return "0xFFF0000000000000";
  }
  return llvmDoubleBitcastOperand(String(value));
}

function emitTernaryValueExpression(
  expression: Extract<JsIrValueExpression, { readonly kind: "ternary" }>,
  context: EmitContext
): JsValue {
  const condition = emitCondition(expression.condition, context);
  const consequent = emitValueExpression(expression.consequent, context);
  const alternate = emitValueExpression(expression.alternate, context);
  const index = context.numIndex;
  context.numIndex += 1;
  const value = `%value.${index}`;
  return {
    lines: [
      ...condition.lines,
      ...consequent.lines,
      ...alternate.lines,
      `  ${value} = select i1 ${condition.value}, i64 ${consequent.value}, i64 ${alternate.value}`
    ],
    value
  };
}

function emitLogicalValueExpression(
  expression: Extract<JsIrValueExpression, { readonly kind: "logicalValue" }>,
  context: EmitContext
): JsValue {
  const index = context.logicIndex;
  context.logicIndex += 1;
  const leftLabel = `value.logic.left.${index}`;
  const rhsLabel = `value.logic.rhs.${index}`;
  const endLabel = `value.logic.end.${index}`;
  const left = emitValueExpression(expression.left, context);
  const leftTruthy = `%cmp.${context.cmpIndex}`;
  context.cmpIndex += 1;
  const right = emitValueExpression(expression.right, context);
  const value = `%value.${context.numIndex}`;
  context.numIndex += 1;
  let leftTrueLabel = endLabel;
  let leftFalseLabel = rhsLabel;
  if (expression.operator === "&&") {
    leftTrueLabel = rhsLabel;
    leftFalseLabel = endLabel;
  }
  useRuntimeHelper(context.runtime, "valueTruthy");
  return {
    lines: [
      `  br label %${leftLabel}`,
      `${leftLabel}:`,
      ...left.lines,
      `  ${leftTruthy} = call i1 @valueTruthy(i64 ${left.value})`,
      `  br i1 ${leftTruthy}, label %${leftTrueLabel}, label %${leftFalseLabel}`,
      `${rhsLabel}:`,
      ...right.lines,
      `  br label %${endLabel}`,
      `${endLabel}:`,
      `  ${value} = phi i64 [ ${left.value}, %${leftLabel} ], [ ${right.value}, %${rhsLabel} ]`
    ],
    value
  };
}

function emitNullishTest(value: string, context: EmitContext): { readonly lines: readonly string[]; readonly value: string } {
  const nullIndex = context.cmpIndex;
  context.cmpIndex += 3;
  const isUndefined = `%cmp.${nullIndex}`;
  const isNull = `%cmp.${nullIndex + 1}`;
  const isNullish = `%cmp.${nullIndex + 2}`;
  return {
    lines: [
      `  ${isUndefined} = icmp eq i64 ${value}, ${jsValueUndefined}`,
      `  ${isNull} = icmp eq i64 ${value}, ${jsValueNull}`,
      `  ${isNullish} = or i1 ${isUndefined}, ${isNull}`
    ],
    value: isNullish
  };
}

function emitNullishCoalesceValueExpression(
  expression: Extract<JsIrValueExpression, { readonly kind: "nullishCoalesce" }>,
  context: EmitContext
): JsValue {
  const index = context.logicIndex;
  context.logicIndex += 1;
  const leftLabel = `nullish.left.${index}`;
  const checkLabel = `nullish.check.${index}`;
  const rightLabel = `nullish.right.${index}`;
  const joinLabel = `nullish.join.${index}`;
  const endLabel = `nullish.end.${index}`;
  const left = emitValueExpression(expression.left, context);
  const nullish = emitNullishTest(left.value, context);
  const right = emitValueExpression(expression.right, context);
  const value = `%value.${context.numIndex}`;
  context.numIndex += 1;
  return {
    lines: [
      `  br label %${leftLabel}`,
      `${leftLabel}:`,
      ...left.lines,
      `  br label %${checkLabel}`,
      `${checkLabel}:`,
      ...nullish.lines,
      `  br i1 ${nullish.value}, label %${rightLabel}, label %${endLabel}`,
      `${rightLabel}:`,
      ...right.lines,
      `  br label %${joinLabel}`,
      `${joinLabel}:`,
      `  br label %${endLabel}`,
      `${endLabel}:`,
      `  ${value} = phi i64 [ ${left.value}, %${checkLabel} ], [ ${right.value}, %${joinLabel} ]`
    ],
    value
  };
}

function emitOptionalChainValueExpression(
  expression: Extract<JsIrValueExpression, { readonly kind: "optionalChain" }>,
  context: EmitContext
): JsValue {
  const index = context.logicIndex;
  context.logicIndex += 1;
  const guardLabel = `optional.guard.${index}`;
  const checkLabel = `optional.check.${index}`;
  const accessLabel = `optional.access.${index}`;
  const joinLabel = `optional.join.${index}`;
  const endLabel = `optional.end.${index}`;
  const guard = emitValueExpression(expression.guard, context);
  const nullish = emitNullishTest(guard.value, context);
  context.optionalTargets.push(guard.value);
  const access = emitValueExpression(expression.access, context);
  context.optionalTargets.pop();
  const value = `%value.${context.numIndex}`;
  context.numIndex += 1;
  return {
    lines: [
      `  br label %${guardLabel}`,
      `${guardLabel}:`,
      ...guard.lines,
      `  br label %${checkLabel}`,
      `${checkLabel}:`,
      ...nullish.lines,
      `  br i1 ${nullish.value}, label %${endLabel}, label %${accessLabel}`,
      `${accessLabel}:`,
      ...access.lines,
      `  br label %${joinLabel}`,
      `${joinLabel}:`,
      `  br label %${endLabel}`,
      `${endLabel}:`,
      `  ${value} = phi i64 [ ${jsValueUndefined}, %${checkLabel} ], [ ${access.value}, %${joinLabel} ]`
    ],
    value
  };
}

function emitExpressionPrint(expression: JsIrExpression, context: EmitContext): string[] {
  if (expression.kind === "string") {
    return [emitStringPrint(expression.value, context)];
  }

  if (expression.kind === "stringExpression") {
    const result = emitStringExpression(expression.value, context);
    return [...result.lines, emitStringPointerPrint(result.value, context)];
  }

  if (expression.kind === "number") {
    const result = emitNumberExpression(expression.value, context);
    return [...result.lines, emitNumberPrint(result.value, context)];
  }

  if (expression.kind === "boolean") {
    return [emitStringPrint(String(expression.value), context)];
  }

  if (expression.kind === "call") {
    const result = emitNumberCallExpressionResult(expression, context);
    return [...result.lines, emitNumberPrint(result.value, context)];
  }

  if (expression.kind === "value") {
    const result = emitValueExpression(expression.value, context);
    useRuntimeHelper(context.runtime, "valuePrint");
    return [...result.lines, `  call void @valuePrint(i64 ${result.value})`];
  }

  const binding = context.bindings.get(expression.name);
  if (binding === undefined) {
    return [];
  }

  return emitBindingPrint(binding, context);
}

// eslint-disable-next-line max-statements -- Print lowering handles all current binding variants in one dispatch.
function emitBindingPrint(binding: JsIrBindingValue, context: EmitContext): string[] {
  if (binding.kind === "number") {
    const result = emitNumberExpression(binding.value, context);
    return [...result.lines, emitNumberPrint(result.value, context)];
  }

  if (binding.kind === "boolean") {
    return [emitStringPrint(String(binding.value), context)];
  }

  if (binding.kind === "booleanExpression") {
    const result = emitCondition(binding.value, context);
    return [...result.lines, ...emitBooleanValuePrint(result.value, context)];
  }

  if (binding.kind === "booleanVariable") {
    const result = emitCondition({ kind: "booleanVariable", name: binding.name }, context);
    return [...result.lines, ...emitBooleanValuePrint(result.value, context)];
  }

  if (binding.kind === "string") {
    return [emitStringPrint(binding.value, context)];
  }

  if (binding.kind === "stringExpression") {
    const result = emitStringExpression(binding.value, context);
    return [...result.lines, emitStringPointerPrint(result.value, context)];
  }

  if (binding.kind === "stringVariable") {
    const result = emitStringExpression({ kind: "variable", name: binding.name }, context);
    return [...result.lines, emitStringPointerPrint(result.value, context)];
  }

  if (binding.kind === "value") {
    const result = emitValueExpression(binding.value, context);
    useRuntimeHelper(context.runtime, "valuePrint");
    return [...result.lines, `  call void @valuePrint(i64 ${result.value})`];
  }

  if (binding.kind === "valueVariable") {
    useRuntimeHelper(context.runtime, "valuePrint");
    const value = emitValueExpression({ kind: "variable", name: binding.name }, context);
    return [...value.lines, `  call void @valuePrint(i64 ${value.value})`];
  }

  if (binding.kind === "runtimeObject") {
    const result = emitValueExpression({ kind: "objectRef", name: binding.name }, context);
    useRuntimeHelper(context.runtime, "valuePrint");
    return [...result.lines, `  call void @valuePrint(i64 ${result.value})`];
  }

  if (binding.kind === "runtimeArray") {
    const result = emitValueExpression({ kind: "arrayRef", name: binding.name }, context);
    useRuntimeHelper(context.runtime, "valuePrint");
    return [...result.lines, `  call void @valuePrint(i64 ${result.value})`];
  }

  return [];
}

function emitIfOperation(operation: Extract<JsIrOperation, { readonly kind: "if" }>, context: EmitContext): string[] {
  const {condition, thenOperations, elseOperations} = operation;
  const {ifIndex} = context;
  context.ifIndex += 1;
  const thenLabel = `if.then.${ifIndex}`;
  const elseLabel = `if.else.${ifIndex}`;
  const endLabel = `if.end.${ifIndex}`;
  let falseLabel = endLabel;
  if (elseOperations.length > noLines) {
    falseLabel = elseLabel;
  }
  const emittedCondition = emitCondition(condition, context);
  const lines = [
    ...emittedCondition.lines,
    `  br i1 ${emittedCondition.value}, label %${thenLabel}, label %${falseLabel}`,
    `${thenLabel}:`
  ];

  lines.push(...emitOperationsWithScopedBindings(thenOperations, context));
  lines.push(`  br label %${endLabel}`);

  if (elseOperations.length > noLines) {
    lines.push(`${elseLabel}:`);
    lines.push(...emitOperationsWithScopedBindings(elseOperations, context));
    lines.push(`  br label %${endLabel}`);
  }

  lines.push(`${endLabel}:`);
  return lines;
}

function emitWhileOperation(operation: Extract<JsIrOperation, { readonly kind: "while" }>, context: EmitContext): string[] {
  const { loopIndex } = context;
  context.loopIndex += 1;
  const condLabel = `while.cond.${loopIndex}`;
  const bodyLabel = `while.body.${loopIndex}`;
  const endLabel = `while.end.${loopIndex}`;
  const emittedCondition = emitCondition(operation.condition, context);
  context.loopLabels.push({ breakLabel: endLabel, continueLabel: condLabel });
  const bodyLines = emitOperations(operation.body, context);
  context.loopLabels.pop();

  return [
    `  br label %${condLabel}`,
    `${condLabel}:`,
    ...emittedCondition.lines,
    `  br i1 ${emittedCondition.value}, label %${bodyLabel}, label %${endLabel}`,
    `${bodyLabel}:`,
    ...bodyLines,
    `  br label %${condLabel}`,
    `${endLabel}:`
  ];
}

function emitDoWhileOperation(operation: Extract<JsIrOperation, { readonly kind: "doWhile" }>, context: EmitContext): string[] {
  const { loopIndex } = context;
  context.loopIndex += 1;
  const bodyLabel = `do.body.${loopIndex}`;
  const condLabel = `do.cond.${loopIndex}`;
  const endLabel = `do.end.${loopIndex}`;
  context.loopLabels.push({ breakLabel: endLabel, continueLabel: condLabel });
  const bodyLines = emitOperations(operation.body, context);
  context.loopLabels.pop();
  const emittedCondition = emitCondition(operation.condition, context);

  return [
    `  br label %${bodyLabel}`,
    `${bodyLabel}:`,
    ...bodyLines,
    `  br label %${condLabel}`,
    `${condLabel}:`,
    ...emittedCondition.lines,
    `  br i1 ${emittedCondition.value}, label %${bodyLabel}, label %${endLabel}`,
    `${endLabel}:`
  ];
}

function emitForOperation(operation: Extract<JsIrOperation, { readonly kind: "for" }>, context: EmitContext): string[] {
  const { loopIndex } = context;
  context.loopIndex += 1;
  const condLabel = `for.cond.${loopIndex}`;
  const bodyLabel = `for.body.${loopIndex}`;
  const stepLabel = `for.step.${loopIndex}`;
  const endLabel = `for.end.${loopIndex}`;
  const initializerLines = emitOperation(operation.initializer, context);
  const emittedCondition = emitCondition(operation.condition, context);
  context.loopLabels.push({ breakLabel: endLabel, continueLabel: stepLabel });
  const bodyLines = emitOperations(operation.body, context);
  context.loopLabels.pop();
  const incrementLines = emitOperation(operation.increment, context);

  return [
    ...initializerLines,
    `  br label %${condLabel}`,
    `${condLabel}:`,
    ...emittedCondition.lines,
    `  br i1 ${emittedCondition.value}, label %${bodyLabel}, label %${endLabel}`,
    `${bodyLabel}:`,
    ...bodyLines,
    `  br label %${stepLabel}`,
    `${stepLabel}:`,
    ...incrementLines,
    `  br label %${condLabel}`,
    `${endLabel}:`
  ];
}

function emitBreakOperation(context: EmitContext): string[] {
  const labels = context.loopLabels.at(-1);
  if (labels === undefined) {
    return [];
  }

  return [`  br label %${labels.breakLabel}`];
}

function emitContinueOperation(context: EmitContext): string[] {
  const labels = context.loopLabels.at(-1);
  if (labels === undefined) {
    return [];
  }

  return [`  br label %${labels.continueLabel}`];
}

function defineObjectType(value: JsIrObjectValue, context: EmitContext): string {
  const typeName = `%obj.${context.objectIndex}`;
  context.objectIndex += 1;
  const fieldTypes = value.fields
    .map((field) => {
      if (field.value.kind === "number") {
        return "double";
      }
      return defineObjectType(field.value.value, context);
    })
    .join(", ");
  context.objectTypes.push(`${typeName} = type { ${fieldTypes} }`);
  return typeName;
}

function emitObjectFieldStores(
  rootType: string,
  rootPointer: string,
  value: JsIrObjectValue,
  path: readonly number[],
  context: EmitContext
): string[] {
  const lines: string[] = [];
  for (let i = 0; i < value.fields.length; i++) {
    const field = value.fields[i];
    const nextPath = [...path, i];
    if (field.value.kind === "object") {
      lines.push(...emitObjectFieldStores(rootType, rootPointer, field.value.value, nextPath, context));
      continue;
    }
    const pointer = emitObjectIndexedPointer(rootType, rootPointer, nextPath, context);
    const number = emitNumberExpression(field.value.value, context);
    lines.push(...pointer.lines, ...number.lines, `  store double ${number.value}, ptr ${pointer.value}`);
  }
  return lines;
}

function emitObjectFieldPointer(
  objectName: string,
  path: readonly string[],
  context: EmitContext
): { readonly lines: string[]; readonly value: string } | undefined {
  const layout = context.objectLayouts.get(objectName);
  if (layout === undefined) {
    return undefined;
  }
  const indexes = objectPathToIndexes(layout.value, path);
  if (indexes === undefined) {
    return undefined;
  }
  return emitObjectIndexedPointer(layout.typeName, layout.pointerName, indexes, context);
}

function emitObjectIndexedPointer(
  rootType: string,
  rootPointer: string,
  indexes: readonly number[],
  context: EmitContext
): { readonly lines: string[]; readonly value: string } {
  const index = context.objectIndex;
  context.objectIndex += 1;
  const name = `%obj.gep.${index}`;
  const gepIndexes = indexes.map((item) => `i32 ${item}`).join(", ");
  return { lines: [`  ${name} = getelementptr ${rootType}, ptr ${rootPointer}, i32 0, ${gepIndexes}`], value: name };
}

function objectPathToIndexes(value: JsIrObjectValue, path: readonly string[]): readonly number[] | undefined {
  const indexes: number[] = [];
  let current = value;
  for (const segment of path) {
    const index = current.fields.findIndex((field) => field.name === segment);
    if (index === -1) {
      return undefined;
    }
    indexes.push(index);
    const field = current.fields[index];
    if (field.value.kind === "object") {
      current = field.value.value;
    }
  }
  return indexes;
}

function emitCondition(condition: JsIrCondition, context: EmitContext): NumberValue {
  if (condition.kind === "boolean") {
    return {
      lines: [],
      value: String(condition.value)
    };
  }

  if (condition.kind === "negate") {
    const inner = emitCondition(condition.condition, context);
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
    throw new Error("Unsupported condition");
  }

  const index = context.cmpIndex;
  context.cmpIndex += 1;
  const name = `%cmp.${index}`;
  const left = emitNumberExpression(condition.left, context);
  const right = emitNumberExpression(condition.right, context);

  return {
    lines: [...left.lines, ...right.lines, `  ${name} = ${llvmComparisonInstruction(condition.operator)} double ${left.value}, ${right.value}`],
    value: name
  };
}

// eslint-disable-next-line complexity, max-statements -- Runtime condition dispatch is centralized while predicates are transitional.
function emitRuntimeCondition(condition: JsIrCondition, context: EmitContext): NumberValue | undefined {
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
    const left = emitValueExpression(condition.left, context);
    const right = emitValueExpression(condition.right, context);
    const index = context.cmpIndex;
    const name = `%cmp.${index}`;
    context.cmpIndex += 1;
    let helper: RuntimeHelper = "valueRelationalCompare";
    if (condition.kind === "valueLooseComparison") {
      helper = "valueLooseEquals";
    }
    useRuntimeHelper(context.runtime, helper);
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

  if (condition.kind === "runtimeArrayHas") {
    return emitRuntimeArrayHasCondition(condition, context);
  }

  if (condition.kind === "runtimeObjectState") {
    return emitRuntimeObjectStateCondition(condition, context);
  }

  if (condition.kind === "runtimeObjectPropertyIsEnumerable") {
    const object = emitRuntimeObjectPointer(condition.objectName, context);
    const key = emitStringExpression(condition.key, context);
    const name = `%cmp.${context.cmpIndex}`;
    context.cmpIndex += 1;
    useRuntimeHelper(context.runtime, "objectPropertyIsEnumerable");
    return { lines: [...object.lines, ...key.lines, `  ${name} = call i1 @objectPropertyIsEnumerable(ptr ${object.value}, i64 ${key.length}, ptr ${key.value})`], value: name };
  }

  if (condition.kind === "runtimeArrayIsArray") {
    if (typeof condition.value === "boolean") {
      return { lines: [], value: String(condition.value) };
    }
    const value = emitValueExpression(condition.value, context);
    const name = `%cmp.${context.cmpIndex}`;
    context.cmpIndex += 1;
    useRuntimeHelper(context.runtime, "valueIsArray");
    return { lines: [...value.lines, `  ${name} = call i1 @valueIsArray(i64 ${value.value})`], value: name };
  }

  if (condition.kind === "valueTruthy") {
    const value = emitValueExpression(condition.value, context);
    const name = `%cmp.${context.cmpIndex}`;
    context.cmpIndex += 1;
    useRuntimeHelper(context.runtime, "valueTruthy");
    return { lines: [...value.lines, `  ${name} = call i1 @valueTruthy(i64 ${value.value})`], value: name };
  }

  if (condition.kind === "numberPredicate") {
    const value = emitValueExpression(condition.value, context);
    const name = `%cmp.${context.cmpIndex}`;
    context.cmpIndex += 1;
    const helperByPredicate = {
      globalIsNaN: "globalIsNaN",
      numberIsNaN: "numberIsNaN",
      numberIsFinite: "numberIsFinite"
    } as const;
    const helper = helperByPredicate[condition.predicate];
    useRuntimeHelper(context.runtime, helper);
    return { lines: [...value.lines, `  ${name} = call i1 @${helper}(i64 ${value.value})`], value: name };
  }

  if (condition.kind === "stringSearch") {
    const receiver = emitStringExpression(condition.receiver, context);
    const search = emitStringExpression(condition.search, context);
    const name = `%cmp.${context.cmpIndex}`;
    context.cmpIndex += 1;
    const helperByMethod: Record<typeof condition.method, RuntimeHelper> = {
      includes: "stringIncludes",
      startsWith: "stringStartsWith",
      endsWith: "stringEndsWith"
    };
    const helper = helperByMethod[condition.method];
    useRuntimeHelper(context.runtime, helper);
    return { lines: [...receiver.lines, ...search.lines, `  ${name} = call i1 @${helper}(i64 ${receiver.length}, ptr ${receiver.value}, i64 ${search.length}, ptr ${search.value})`], value: name };
  }

  if (condition.kind === "runtimeArrayEvery" || condition.kind === "runtimeArraySome") {
    const array = emitRuntimeArrayPointer(condition.arrayName, context);
    const length = `%arr.len.${context.numIndex}`;
    context.numIndex += 1;
    const isEmpty = `%cmp.${context.cmpIndex}`;
    context.cmpIndex += 1;
    useRuntimeHelper(context.runtime, "arrayLength");
    const lines = [...array.lines, `  ${length} = call i64 @arrayLength(ptr ${array.value})`, `  ${isEmpty} = icmp eq i64 ${length}, 0`];
    if (condition.kind === "runtimeArrayEvery") {
      return { lines, value: isEmpty };
    }
    return { lines, value: "false" };
  }

  if (condition.kind === "objectIs") {
    const left = emitValueExpression(condition.left, context);
    const right = emitValueExpression(condition.right, context);
    const name = `%cmp.${context.cmpIndex}`;
    context.cmpIndex += 1;
    useRuntimeHelper(context.runtime, "objectIs");
    return { lines: [...left.lines, ...right.lines, `  ${name} = call i1 @objectIs(i64 ${left.value}, i64 ${right.value})`], value: name };
  }

  return undefined;
}

function valueComparisonOperatorCode(operator: "==" | "!=" | "<" | "<=" | ">" | ">="): number {
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
  }
  const unsupported: never = operator;
  void unsupported;
  throw new Error("Unsupported value comparison operator");
}

function emitRuntimeObjectHasCondition(
  condition: Extract<JsIrCondition, { readonly kind: "runtimeObjectHas" }>,
  context: EmitContext
): NumberValue {
  let object = emitRuntimeObjectPointer(condition.objectName, context);
  if (condition.receiverKind === "value") {
    object = emitNamedValueBinding(condition.objectName, context);
  }
  const key = emitStringExpression(condition.key, context);
  const index = context.cmpIndex;
  context.cmpIndex += 1;
  const name = `%cmp.${index}`;
  if (condition.receiverKind === "value") {
    useRuntimeHelper(context.runtime, "valueObjectHasOwn");
    return { lines: [...object.lines, ...key.lines, `  ${name} = call i1 @valueObjectHasOwn(i64 ${object.value}, i64 ${key.length}, ptr ${key.value})`], value: name };
  }
  let helper: "objectHasOwn" | "objectHas" = "objectHas";
  if (condition.ownOnly) {
    helper = "objectHasOwn";
  }
  useRuntimeHelper(context.runtime, helper);
  return { lines: [...object.lines, ...key.lines, `  ${name} = call i1 @${helper}(ptr ${object.value}, i64 ${key.length}, ptr ${key.value})`], value: name };
}

function emitRuntimeArrayHasCondition(
  condition: Extract<JsIrCondition, { readonly kind: "runtimeArrayHas" }>,
  context: EmitContext
): NumberValue {
  const array = emitRuntimeArrayPointer(condition.arrayName, context);
  const index = emitArrayIndex(condition.index, context);
  const { cmpIndex } = context;
  context.cmpIndex += 1;
  const name = `%cmp.${cmpIndex}`;
  if (condition.ownOnly && condition.key === undefined) {
    useRuntimeHelper(context.runtime, "arrayHasOwnIndex");
    return { lines: [...array.lines, ...index.lines, `  ${name} = call i1 @arrayHasOwnIndex(ptr ${array.value}, i64 ${index.value})`], value: name };
  }
  if (condition.key === undefined) {
    useRuntimeHelper(context.runtime, "arrayHasOwnIndex");
    return { lines: [...array.lines, ...index.lines, `  ${name} = call i1 @arrayHasOwnIndex(ptr ${array.value}, i64 ${index.value})`], value: name };
  }
  const key = emitStringExpression(condition.key, context);
  if (condition.ownOnly) {
    const propertiesSlot = `%arr.props.slot.${context.objectIndex}`;
    const properties = `%arr.props.${context.objectIndex}`;
    context.objectIndex += 1;
    useRuntimeHelper(context.runtime, "objectHasOwn");
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
  useRuntimeHelper(context.runtime, "arrayHas");
  return { lines: [...array.lines, ...index.lines, ...key.lines, `  ${name} = call i1 @arrayHas(ptr ${array.value}, i64 ${index.value}, i64 ${key.length}, ptr ${key.value})`], value: name };
}

function emitRuntimeArrayIncludesCondition(
  expression: Extract<JsIrValueExpression, { readonly kind: "arrayIncludes" }>,
  context: EmitContext
): NumberValue {
  const array = emitRuntimeArrayPointer(expression.arrayName, context);
  const value = emitValueExpression(expression.value, context);
  const name = `%cmp.${context.cmpIndex}`;
  context.cmpIndex += 1;
  useRuntimeHelper(context.runtime, "arrayIncludes");
  return { lines: [...array.lines, ...value.lines, `  ${name} = call i1 @arrayIncludes(ptr ${array.value}, i64 ${value.value})`], value: name };
}

function emitRuntimeObjectStateCondition(
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
  useRuntimeHelper(context.runtime, helper);
  return { lines: [...object.lines, `  ${name} = call i1 @${helper}(ptr ${object.value})`], value: name };
}

function emitStringComparisonCondition(
  condition: Extract<JsIrCondition, { readonly kind: "stringComparison" }>,
  context: EmitContext
): NumberValue {
  const index = context.cmpIndex;
  context.cmpIndex += 1;
  const name = `%cmp.${index}`;
  const left = emitStringExpression(condition.left, context);
  const right = emitStringExpression(condition.right, context);
  useRuntimeHelper(context.runtime, "strEquals");
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

function emitBooleanComparisonCondition(
  condition: Extract<JsIrCondition, { readonly kind: "booleanComparison" }>,
  context: EmitContext
): NumberValue {
  const index = context.cmpIndex;
  context.cmpIndex += 1;
  const name = `%cmp.${index}`;
  const left = emitCondition(condition.left, context);
  const right = emitCondition(condition.right, context);
  let predicate = "eq";
  if (condition.operator === "!==") {
    predicate = "ne";
  }
  return { lines: [...left.lines, ...right.lines, `  ${name} = icmp ${predicate} i1 ${left.value}, ${right.value}`], value: name };
}

function emitValueComparisonCondition(
  condition: Extract<JsIrCondition, { readonly kind: "valueComparison" }>,
  context: EmitContext
): NumberValue {
  const index = context.cmpIndex;
  context.cmpIndex += 1;
  const left = emitValueExpression(condition.left, context);
  const right = emitValueExpression(condition.right, context);
  useRuntimeHelper(context.runtime, "valueStrictEquals");
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

function emitLogicalCondition(
  condition: Extract<JsIrCondition, { readonly kind: "and" | "or" }>,
  context: EmitContext
): NumberValue {
  const index = context.logicIndex;
  context.logicIndex += 1;
  const leftLabel = `logic.left.${index}`;
  const rhsLabel = `logic.rhs.${index}`;
  const endLabel = `logic.end.${index}`;
  const left = emitCondition(condition.left, context);
  const right = emitCondition(condition.right, context);
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
      `  br i1 ${left.value}, label %${leftTrueLabel}, label %${leftFalseLabel}`,
      `${rhsLabel}:`,
      ...right.lines,
      `  br label %${endLabel}`,
      `${endLabel}:`,
      `  ${value} = phi i1 [ ${shortCircuitValue}, %${leftLabel} ], [ ${right.value}, %${rhsLabel} ]`
    ],
    value
  };
}

function llvmComparisonInstruction(operator: "===" | "!==" | "<" | "<=" | ">" | ">="): string {
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
  }

  const unsupported: never = operator;
  void unsupported;
  throw new Error("Unsupported comparison operator");
}

// eslint-disable-next-line max-statements -- Number expression lowering includes temporary runtime array method branches.
function emitNumberExpression(expression: JsIrNumberExpression, context: EmitContext): NumberValue {
  const simple = emitSimpleNumberExpression(expression, context);
  if (simple !== undefined) {
    return simple;
  }

  if (expression.kind === "call") {
    return emitCallExpressionResult(expression, context);
  }

  if (expression.kind === "arrayPush" || expression.kind === "arrayUnshift") {
    return emitRuntimeArrayAppendNumberExpression(expression, context);
  }

  if (expression.kind === "arrayIndexOf") {
    const array = emitRuntimeArrayPointer(expression.arrayName, context);
    const needle = emitValueExpression(expression.value, context);
    let fromIndex: NumberValue = { lines: [], value: "0" };
    if (expression.fromEnd === true) {
      fromIndex = { lines: [], value: "9223372036854775807" };
    }
    if (expression.fromIndex !== undefined) {
      fromIndex = emitArrayIndex(expression.fromIndex, context);
    }
    const raw = `%arr.index.${context.arrayIndex}`;
    context.arrayIndex += 1;
    const number = `%num.${context.numIndex}`;
    context.numIndex += 1;
    let helper: "arrayIndexOf" | "arrayLastIndexOf" = "arrayIndexOf";
    if (expression.fromEnd === true) {
      helper = "arrayLastIndexOf";
    }
    useRuntimeHelper(context.runtime, helper);
    return { lines: [...array.lines, ...needle.lines, ...fromIndex.lines, `  ${raw} = call i64 @${helper}(ptr ${array.value}, i64 ${needle.value}, i64 ${fromIndex.value})`, `  ${number} = sitofp i64 ${raw} to double`], value: number };
  }

  if (expression.kind === "arrayFindIndex") {
    const array = emitRuntimeArrayPointer(expression.arrayName, context);
    const raw = `%arr.index.${context.arrayIndex}`;
    context.arrayIndex += 1;
    const number = `%num.${context.numIndex}`;
    context.numIndex += 1;
    useRuntimeHelper(context.runtime, "arrayFindIndex");
    return { lines: [...array.lines, `  ${raw} = call i64 @arrayFindIndex(ptr ${array.value})`, `  ${number} = sitofp i64 ${raw} to double`], value: number };
  }

  if (expression.kind === "valueToNumber") {
    const value = emitValueExpression(expression.value, context);
    const number = `%num.${context.numIndex}`;
    context.numIndex += 1;
    useRuntimeHelper(context.runtime, "valueToNumber");
    return { lines: [...value.lines, `  ${number} = call double @valueToNumber(i64 ${value.value})`], value: number };
  }

  if (expression.kind === "mathCall") {
    return emitMathCallNumberExpression(expression, context);
  }

  if (expression.kind === "parseInt" || expression.kind === "parseFloat") {
    const source = emitStringExpression(expression.value, context);
    const number = `%num.${context.numIndex}`;
    context.numIndex += 1;
    useRuntimeHelper(context.runtime, expression.kind);
    return { lines: [...source.lines, `  ${number} = call double @${expression.kind}(i64 ${source.length}, ptr ${source.value})`], value: number };
  }

  if (expression.kind === "ternary") {
    return emitTernaryNumberExpression(expression, context);
  }

  const aggregate = emitAggregateNumberExpression(expression, context);
  if (aggregate !== undefined) {
    return aggregate;
  }

  if (expression.kind === "unary") {
    const value = emitNumberExpression(expression.value, context);
    const index = context.numIndex;
    context.numIndex += 1;
    const name = `%num.${index}`;

    return {
      lines: [...value.lines, `  ${name} = fneg double ${value.value}`],
      value: name
    };
  }

  if (expression.kind !== "binary") {
    throw new Error("Unsupported number expression");
  }

  const left = emitNumberExpression(expression.left, context);
  const right = emitNumberExpression(expression.right, context);
  const index = context.numIndex;
  context.numIndex += 1;
  const name = `%num.${index}`;

  return {
    lines: [...left.lines, ...right.lines, `  ${name} = ${llvmNumberOperator(expression.operator)} double ${left.value}, ${right.value}`],
    value: name
  };
}

function emitRuntimeArrayAppendNumberExpression(
  expression: Extract<JsIrNumberExpression, { readonly kind: "arrayPush" | "arrayUnshift" }>,
  context: EmitContext
): NumberValue {
  const array = emitRuntimeArrayPointer(expression.arrayName, context);
  const values = expression.values.map((value) => emitValueExpression(value, context));
  const lines = [...array.lines];
  const helper = arrayNumberAppendHelper(expression.kind);
  useRuntimeHelper(context.runtime, helper);
  let result = "0";
  for (const value of values) {
    const index = context.arrayIndex;
    context.arrayIndex += 1;
    result = `%arr.method.${index}`;
    lines.push(...value.lines, `  ${result} = call i64 @${helper}(ptr ${array.value}, i64 ${value.value})`);
  }
  const { numIndex } = context;
  context.numIndex += 1;
  const number = `%num.${numIndex}`;
  lines.push(`  ${number} = uitofp i64 ${result} to double`);
  return { lines, value: number };
}

function emitMathCallNumberExpression(
  expression: Extract<JsIrNumberExpression, { readonly kind: "mathCall" }>,
  context: EmitContext
): NumberValue {
  const args = expression.arguments.map((argument) => emitNumberExpression(argument, context));
  const number = `%num.${context.numIndex}`;
  context.numIndex += 1;
  const lines = args.flatMap((argument) => argument.lines);
  if (expression.method === "min" || expression.method === "max") {
    if (args.length === 0) {
      if (expression.method === "min") {
        return { lines, value: "0x7FF0000000000000" };
      }
      return { lines, value: "0xFFF0000000000000" };
    }
    let helper: RuntimeHelper = "mathMax2";
    if (expression.method === "min") {
      helper = "mathMin2";
    }
    useRuntimeHelper(context.runtime, helper);
    let current = args[0].value;
    for (let i = 1; i < args.length; i++) {
      const next = `%num.${context.numIndex}`;
      context.numIndex += 1;
      lines.push(`  ${next} = call double @${helper}(double ${current}, double ${args[i].value})`);
      current = next;
    }
    return { lines, value: current };
  }
  if (expression.method === "pow") {
    useRuntimeHelper(context.runtime, "mathPow");
    const base = args[0]?.value ?? "0.0";
    const exponent = args[1]?.value ?? "0.0";
    return { lines: [...lines, `  ${number} = call double @mathPow(double ${base}, double ${exponent})`], value: number };
  }
  const helperByMethod = {
    abs: "mathAbs",
    floor: "mathFloor",
    ceil: "mathCeil",
    trunc: "mathTrunc",
    round: "mathRound",
    sqrt: "mathSqrt",
    sign: "mathSign"
  } as const;
  const helper = helperByMethod[expression.method];
  useRuntimeHelper(context.runtime, helper);
  const argument = args[0]?.value ?? "0.0";
  return { lines: [...lines, `  ${number} = call double @${runtimeMathFunctionName(helper)}(double ${argument})`], value: number };
}

function runtimeMathFunctionName(helper: "mathAbs" | "mathFloor" | "mathCeil" | "mathTrunc" | "mathRound" | "mathSqrt" | "mathSign"): string {
  return helper;
}

function arrayNumberAppendHelper(kind: "arrayPush" | "arrayUnshift"): "arrayPush" | "arrayUnshift" {
  if (kind === "arrayPush") {
    return "arrayPush";
  }
  return "arrayUnshift";
}

function emitAggregateNumberExpression(
  expression: JsIrNumberExpression,
  context: EmitContext
): NumberValue | undefined {
  if (expression.kind === "arrayAccess") {
    const pointer = emitArrayElementPointer(expression.arrayName, expression.index, context);
    const index = context.numIndex;
    context.numIndex += 1;
    const name = `%num.${index}`;
    return { lines: [...pointer.lines, `  ${name} = load double, ptr ${pointer.value}`], value: name };
  }

  if (expression.kind === "arrayLength") {
    const binding = context.bindings.get(expression.arrayName);
    if (binding?.kind === "array") {
      return { lines: [], value: llvmDoubleLiteral(binding.length) };
    }
    if (binding?.kind === "runtimeArray") {
      const array = emitRuntimeArrayPointer(expression.arrayName, context);
      const index = context.numIndex;
      context.numIndex += 1;
      const length = `%arr.len.${index}`;
      const value = `%num.${index}`;
      useRuntimeHelper(context.runtime, "arrayLength");
      return { lines: [...array.lines, `  ${length} = call i64 @arrayLength(ptr ${array.value})`, `  ${value} = uitofp i64 ${length} to double`], value };
    }
  }

  if (expression.kind === "valueArrayLength") {
    const receiver = emitValueExpression(expression.value, context);
    const index = context.numIndex;
    context.numIndex += 1;
    const length = `%arr.len.${index}`;
    const value = `%num.${index}`;
    useRuntimeHelper(context.runtime, "valueArrayLength");
    return { lines: [...receiver.lines, `  ${length} = call i64 @valueArrayLength(i64 ${receiver.value})`, `  ${value} = uitofp i64 ${length} to double`], value };
  }

  if (expression.kind === "objectAccess") {
    return emitObjectNumberExpression(expression, context);
  }

  return undefined;
}

function emitObjectNumberExpression(
  expression: Extract<JsIrNumberExpression, { readonly kind: "objectAccess" }>,
  context: EmitContext
): NumberValue | undefined {
  const pointer = emitObjectFieldPointer(expression.objectName, expression.path, context);
  const index = context.numIndex;
  context.numIndex += 1;
  const name = `%num.${index}`;
  if (pointer === undefined) {
    return undefined;
  }
  return { lines: [...pointer.lines, `  ${name} = load double, ptr ${pointer.value}`], value: name };
}

function emitArrayElementPointer(
  arrayName: string,
  indexExpression: JsIrNumberExpression,
  context: EmitContext
): NumberValue {
  const binding = context.bindings.get(arrayName);
  let arrayPointer = arrayName;
  let length = 0;
  if (binding?.kind === "array") {
    const { name, length: arrayLength } = binding;
    arrayPointer = name;
    length = arrayLength;
  }
  const index = emitArrayIndex(indexExpression, context);
  const gepIndex = context.arrayIndex;
  context.arrayIndex += 1;
  const name = `%arr.gep.${gepIndex}`;
  return {
    lines: [...index.lines, `  ${name} = getelementptr [${length} x double], ptr ${arrayPointer}, i64 0, i64 ${index.value}`],
    value: name
  };
}

function emitRuntimeArrayPointer(arrayName: string, context: EmitContext): NumberValue {
  const index = context.arrayIndex;
  context.arrayIndex += 1;
  const value = `%arr.ptr.${index}`;
  return { lines: [`  ${value} = load ptr, ptr ${variablePointerName(arrayName)}`], value };
}

function emitRuntimeObjectPointer(objectName: string, context: EmitContext): NumberValue {
  const layout = context.objectLayouts.get(objectName);
  const pointerName = layout?.runtimePointerName ?? variablePointerName(objectName);
  const index = context.objectIndex;
  context.objectIndex += 1;
  const value = `%obj.ptr.${index}`;
  return { lines: [`  ${value} = load ptr, ptr ${pointerName}`], value };
}

function emitArrayIndex(expression: JsIrNumberExpression, context: EmitContext): NumberValue {
  if (expression.kind === "literal") {
    return { lines: [], value: String(expression.value) };
  }
  const number = emitNumberExpression(expression, context);
  const index = context.arrayIndex;
  context.arrayIndex += 1;
  const name = `%arr.idx.${index}`;
  return { lines: [...number.lines, `  ${name} = fptosi double ${number.value} to i64`], value: name };
}

function emitSimpleNumberExpression(
  expression: JsIrNumberExpression,
  context: EmitContext
): NumberValue | undefined {
  if (expression.kind === "literal") {
    return {
      lines: [],
      value: llvmDoubleLiteral(expression.value)
    };
  }

  if (expression.kind === "nan") {
    return {
      lines: [],
      value: "0x7FF4000000000000"
    };
  }

  if (expression.kind === "negatedZero") {
    return {
      lines: [],
      value: "0x8000000000000000"
    };
  }

  if (expression.kind === "parameter") {
    const binding = context.bindings.get(expression.name);
    if (binding?.kind === "number" && binding.value.kind === "parameter") {
      return {
        lines: [],
        value: binding.value.name
      };
    }
    return {
      lines: [],
      value: expression.name
    };
  }

  if (expression.kind !== "variable") {
    return undefined;
  }

  const binding = context.bindings.get(expression.name);
  let pointer = expression.name;
  if (binding?.kind === "number" && binding.value.kind === "variable") {
    pointer = binding.value.name;
  }
  const index = context.numIndex;
  context.numIndex += 1;
  const name = `%num.${index}`;

  return {
    lines: [`  ${name} = load double, ptr ${pointer}`],
    value: name
  };
}

function emitTernaryNumberExpression(
  expression: Extract<JsIrNumberExpression, { readonly kind: "ternary" }>,
  context: EmitContext
): NumberValue {
  const condition = emitCondition(expression.condition, context);
  const consequent = emitNumberExpression(expression.consequent, context);
  const alternate = emitNumberExpression(expression.alternate, context);
  const index = context.numIndex;
  context.numIndex += 1;
  const name = `%num.${index}`;

  return {
    lines: [
      ...condition.lines,
      ...consequent.lines,
      ...alternate.lines,
      `  ${name} = select i1 ${condition.value}, double ${consequent.value}, double ${alternate.value}`
    ],
    value: name
  };
}

// eslint-disable-next-line max-statements -- Runtime string expression emission is centralized during the JSValue transition.
function emitStringExpression(expression: JsIrStringExpression, context: EmitContext): StringValue {
  if (expression.kind === "literal") {
    return { lines: [], value: addStringConstant(expression.value, context), length: String(utf8ByteLength(expression.value)) };
  }

  if (expression.kind === "variable") {
    const index = context.stringIndex;
    context.stringIndex += 1;
    const name = `%str.${index}`;
    const length = `%str.len.${index}`;
    return {
      lines: [
        `  ${name} = load ptr, ptr ${variablePointerName(expression.name)}`,
        `  ${length} = load i64, ptr ${stringLengthPointerName(expression.name)}`
      ],
      value: name,
      length
    };
  }

  if (expression.kind === "concat") {
    return emitConcatStringExpression(expression, context);
  }

  if (expression.kind === "call") {
    return emitStringCallExpressionResult(expression, context);
  }

  if (expression.kind === "arrayJoin") {
    const array = emitRuntimeArrayPointer(expression.arrayName, context);
    const separator = emitStringExpression(expression.separator, context);
    const name = `%str.${context.stringIndex}`;
    context.stringIndex += 1;
    useRuntimeHelper(context.runtime, "arrayJoin");
    return { lines: [...array.lines, ...separator.lines, `  ${name} = call ptr @arrayJoin(ptr ${array.value}, i64 ${separator.length}, ptr ${separator.value})`], value: name, length: "0" };
  }

  if (expression.kind === "typeof") {
    return { lines: [], value: addStringConstant(expression.value, context), length: String(utf8ByteLength(expression.value)) };
  }

  if (expression.kind === "stringConversion") {
    return emitStringConversionExpression(expression, context);
  }

  if (expression.kind === "errorToString") {
    const object = emitRuntimeObjectPointer(expression.objectName, context);
    const index = context.stringIndex;
    context.stringIndex += 1;
    const raw = `%str.result.${index}`;
    const value = `%str.${index}`;
    const length = `%str.len.${index}`;
    useRuntimeHelper(context.runtime, "errorToString");
    return {
      lines: [
        ...object.lines,
        `  ${raw} = call { ptr, i64 } @errorToString(ptr ${object.value})`,
        `  ${value} = extractvalue { ptr, i64 } ${raw}, 0`,
        `  ${length} = extractvalue { ptr, i64 } ${raw}, 1`
      ],
      value,
      length
    };
  }

  if (expression.kind === "stringMethod") {
    const receiver = emitStringExpression(expression.receiver, context);
    const index = context.stringIndex;
    context.stringIndex += 1;
    const raw = `%str.result.${index}`;
    const value = `%str.${index}`;
    const length = `%str.len.${index}`;
    const helperByMethod = {
      trim: "stringTrim",
      trimStart: "stringTrimStart",
      trimEnd: "stringTrimEnd"
    } as const;
    const helper = helperByMethod[expression.method];
    useRuntimeHelper(context.runtime, helper);
    return {
      lines: [
        ...receiver.lines,
        `  ${raw} = call { ptr, i64 } @${helper}(i64 ${receiver.length}, ptr ${receiver.value})`,
        `  ${value} = extractvalue { ptr, i64 } ${raw}, 0`,
        `  ${length} = extractvalue { ptr, i64 } ${raw}, 1`
      ],
      value,
      length
    };
  }

  return emitTernaryStringExpression(expression, context);
}

function emitStringConversionExpression(
  expression: Extract<JsIrStringExpression, { readonly kind: "stringConversion" }>,
  context: EmitContext
): StringValue {
  const source = emitValueExpression(expression.value, context);
  const index = context.stringIndex;
  context.stringIndex += 1;
  const raw = `%str.result.${index}`;
  const value = `%str.${index}`;
  const length = `%str.len.${index}`;
  useRuntimeHelper(context.runtime, "valueToString");
  return {
    lines: [
      ...source.lines,
      `  ${raw} = call { ptr, i64 } @valueToString(i64 ${source.value})`,
      `  ${value} = extractvalue { ptr, i64 } ${raw}, 0`,
      `  ${length} = extractvalue { ptr, i64 } ${raw}, 1`
    ],
    value,
    length
  };
}

function emitConcatStringExpression(
  expression: Extract<JsIrStringExpression, { readonly kind: "concat" }>,
  context: EmitContext
): StringValue {
  const left = emitStringExpression(expression.left, context);
  const right = emitStringExpression(expression.right, context);
  const index = context.stringIndex;
  context.stringIndex += 1;
  useRuntimeHelper(context.runtime, "strConcat");
  const name = `%str.${index}`;
  const length = `%str.len.${index}`;
  return {
    lines: [
      ...left.lines,
      ...right.lines,
      `  ${length} = add i64 ${left.length}, ${right.length}`,
      `  ${name} = call ptr @strConcat(i64 ${left.length}, ptr ${left.value}, i64 ${right.length}, ptr ${right.value})`
    ],
    value: name,
    length
  };
}

function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function emitTernaryStringExpression(
  expression: Extract<JsIrStringExpression, { readonly kind: "ternary" }>,
  context: EmitContext
): StringValue {
  const index = context.stringIndex;
  context.stringIndex += 1;
  const thenLabel = `str.then.${index}`;
  const elseLabel = `str.else.${index}`;
  const endLabel = `str.end.${index}`;
  const value = `%str.${index}`;
  const length = `%str.len.${index}`;
  const condition = emitCondition(expression.condition, context);
  const consequent = emitStringExpression(expression.consequent, context);
  const alternate = emitStringExpression(expression.alternate, context);

  return {
    lines: [
      ...condition.lines,
      `  br i1 ${condition.value}, label %${thenLabel}, label %${elseLabel}`,
      `${thenLabel}:`,
      ...consequent.lines,
      `  br label %${endLabel}`,
      `${elseLabel}:`,
      ...alternate.lines,
      `  br label %${endLabel}`,
      `${endLabel}:`,
      `  ${value} = phi ptr [ ${consequent.value}, %${thenLabel} ], [ ${alternate.value}, %${elseLabel} ]`,
      `  ${length} = phi i64 [ ${consequent.length}, %${thenLabel} ], [ ${alternate.length}, %${elseLabel} ]`
    ],
    value,
    length
  };
}

function llvmNumberOperator(operator: JsIrNumberOperator): string {
  switch (operator) {
    case "add": {
      return "fadd";
    }
    case "subtract": {
      return "fsub";
    }
    case "multiply": {
      return "fmul";
    }
    case "divide": {
      return "fdiv";
    }
  }

  const unsupported: never = operator;
  void unsupported;
  throw new Error("Unsupported number operator");
}

function emitOperationsWithScopedBindings(operations: readonly JsIrOperation[], context: EmitContext): string[] {
  const previousBindings = new Map(context.bindings);
  const previousObjectLayouts = new Map(context.objectLayouts);
  const lines = emitOperations(operations, context);
  context.bindings.clear();
  for (const [name, value] of previousBindings) {
    context.bindings.set(name, value);
  }
  context.objectLayouts.clear();
  for (const [name, value] of previousObjectLayouts) {
    context.objectLayouts.set(name, value);
  }
  return lines;
}

function emitStringPrint(value: string, context: EmitContext): string {
  const index = context.printIndex;
  context.printIndex += 1;
  const encoded = encodeCString(value);
  context.stringConstants.push(`@.str.${index} = private unnamed_addr constant [${encoded.length} x i8] c"${encoded.value}"`);
  return `  %print.${index} = call i32 @puts(ptr @.str.${index})`;
}

function emitStringPointerPrint(value: string, context: EmitContext): string {
  const index = context.printIndex;
  context.printIndex += 1;
  return `  %print.${index} = call i32 @puts(ptr ${value})`;
}

function addStringConstant(value: string, context: EmitContext): string {
  const index = context.printIndex;
  context.printIndex += 1;
  const encoded = encodeCString(value);
  context.stringConstants.push(`@.str.${index} = private unnamed_addr constant [${encoded.length} x i8] c"${encoded.value}"`);
  return `@.str.${index}`;
}


function emitNumberPrint(value: string, context: EmitContext): string {
  const index = context.printIndex;
  context.printIndex += 1;
  context.hasNumberPrint = true;
  return `  %print.${index} = call i32 (ptr, ...) @printf(ptr @.fmt.number, double ${value})`;
}

function emitBooleanValuePrint(value: string, context: EmitContext): string[] {
  const index = context.boolIndex;
  context.boolIndex += 1;
  const truePrint = emitStringPrint("true", context);
  const falsePrint = emitStringPrint("false", context);
  const trueLabel = `bool.true.${index}`;
  const falseLabel = `bool.false.${index}`;
  const endLabel = `bool.end.${index}`;

  return [
    `  br i1 ${value}, label %${trueLabel}, label %${falseLabel}`,
    `${trueLabel}:`,
    truePrint,
    `  br label %${endLabel}`,
    `${falseLabel}:`,
    falsePrint,
    `  br label %${endLabel}`,
    `${endLabel}:`
  ];
}

export const emitTraceMap = (module: JsIrModule): string =>
  JSON.stringify(
    {
      entry: module.entry,
      modules: module.modules
    },
    undefined,
    2
  );
