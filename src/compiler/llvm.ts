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
  type JsIrRuntimeObjectValue,
  type JsIrStringExpression,
  type JsIrValueExpression
} from "./ir.js";
import {
  createRuntimeHelperEmitter,
  emitRuntimeDeclarations,
  emitRuntimeDefinitions,
  useRuntimeHelper,
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
    objectIndex: 0
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
    objectIndex: context.objectIndex
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

  if (operation.kind === "assignNumber") {
    return emitAssignNumberOperation(operation, context);
  }

  if (operation.kind === "assignString") {
    return emitAssignStringOperation(operation, context);
  }

  if (operation.kind === "assignBoolean") {
    return emitAssignBooleanOperation(operation, context);
  }

  if (operation.kind === "arrayStore") {
    return emitArrayStoreOperation(operation, context);
  }

  if (operation.kind === "runtimeArrayStore") {
    return emitRuntimeArrayStoreOperation(operation, context);
  }

  if (operation.kind === "objectStore") {
    return emitObjectStoreOperation(operation, context);
  }

  if (operation.kind === "runtimeObjectStore") {
    return emitRuntimeObjectStoreOperation(operation, context);
  }

  return undefined;
}

function emitAggregateBindingOperation(operation: JsIrOperation, context: EmitContext): string[] | undefined {
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

function emitRuntimeArrayLiteralOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayLiteral" }>,
  context: EmitContext
): string[] {
  useRuntimeHelper(context.runtime, "arrayNew");
  useRuntimeHelper(context.runtime, "arraySet");
  const pointerName = variablePointerName(operation.name);
  const arrayValue: RuntimeArrayValue = { pointerName };
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  const lines = [
    `  ${pointerName} = alloca ptr`,
    `  %${operation.name}.arr = call ptr @arrayNew(i64 ${operation.elements.length})`,
    `  store ptr %${operation.name}.arr, ptr ${arrayValue.pointerName}`
  ];
  for (let i = 0; i < operation.elements.length; i++) {
    const value = emitValueExpression(operation.elements[i], context);
    lines.push(...value.lines, `  call void @arraySet(ptr %${operation.name}.arr, i64 ${i}, i64 ${value.value})`);
  }
  return lines;
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

function knownShapeObjectToRuntimeValue(value: JsIrObjectValue): JsIrRuntimeObjectValue {
  return {
    fields: value.fields
      .flatMap((field) => {
        if (field.value.kind === "object") {
          throw new Error("Nested known-shape object fields cannot be converted to runtime JSValue dictionaries yet");
        }
        return [{ key: { kind: "literal" as const, value: field.name }, value: { kind: "number" as const, value: field.value.value } }];
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
  const lines = [`  ${pointerName} = alloca ptr`, `  ${objectName} = call ptr @objectNew(i64 ${value.fields.length})`, `  store ptr ${objectName}, ptr ${pointerName}`];
  for (const field of value.fields) {
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

function emitValueExpression(expression: JsIrValueExpression, context: EmitContext): JsValue {
  const primitive = emitPrimitiveValueExpression(expression, context);
  if (primitive !== undefined) {
    return primitive;
  }

  if (expression.kind === "variable") {
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

  throw new Error("Unsupported value expression");
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

function emitPrimitiveValueExpression(expression: JsIrValueExpression, context: EmitContext): JsValue | undefined {
  if (expression.kind === "undefined") {
    return { lines: [], value: jsValueUndefined };
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
      `  ${value} = call i64 @valueBoxString(ptr ${string.value})`
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
    return [`  call void @valuePrint(i64 ${binding.name})`];
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

  return undefined;
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

function emitNumberExpression(expression: JsIrNumberExpression, context: EmitContext): NumberValue {
  const simple = emitSimpleNumberExpression(expression, context);
  if (simple !== undefined) {
    return simple;
  }

  if (expression.kind === "call") {
    return emitCallExpressionResult(expression, context);
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

  return emitTernaryStringExpression(expression, context);
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
