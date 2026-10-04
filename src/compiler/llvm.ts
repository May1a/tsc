import {
  type JsIrBindingValue,
  type JsIrCallArgument,
  type JsIrFunctionObjectDefinition,
  type JsIrFunctionParameter,
  type JsIrModule,
  type JsIrNumberExpression,
  type JsIrOperation,
  type JsIrRuntimeArrayElement,
  type JsIrStringExpression,
  type JsIrValueExpression,
  aggregateBindingForOperation,
  visitJsIrOperations
} from "./ir.js";
import type {
  ArrayValue,
  EmitContext,
  FunctionDef,
  JsValue,
  NumberValue,
  OperationOf,
  RuntimeArrayValue,
} from "./llvm/context.js";

import type { CompilerDiagnostic } from "./diagnostics.js";
import { type TraceMapV1, buildTraceMap } from "./trace.js";
import { traceEndLine, traceStartLine, wrapFunctionTrace } from "./llvm/trace.js";
import {
  emitRuntimeArrayPointer,
  emitRuntimeCollectionPointer
} from "./llvm/layout.js";
import {
  emitArrayElementPointer,
  emitArrayIndex,
  emitNumberExpression,
  llvmDoubleBitcastOperand,
} from "./llvm/numbers.js";
import { emitStringExpression } from "./llvm/string-expressions.js";
import { emitRuntimeCollectionFromArrayOperation, emitRuntimeCollectionFromCollectionOperation, emitRuntimeCollectionFromIterableOperation, emitRuntimeCollectionMutationOperation, emitRuntimeCollectionNewOperation, emitRuntimeCollectionResultOperation } from "./llvm/collections.js";
import { emitRuntimeObjectAssignOperation, emitRuntimeObjectCreateOperation, emitRuntimeObjectDefineDataPropertyOperation, emitRuntimeObjectDeleteOperation, emitRuntimeObjectEntriesOperation, emitRuntimeObjectFromEntriesOperation, emitRuntimeObjectGetPrototypeOperation, emitRuntimeObjectKeysOperation, emitRuntimeObjectLiteralOperation, emitRuntimeObjectOwnPropertyDescriptorOperation, emitRuntimeObjectOwnPropertyDescriptorsOperation, emitRuntimeObjectOwnPropertyNamesOperation, emitRuntimeObjectSetPrototypeOperation, emitRuntimeObjectStateMutationOperation, emitRuntimeObjectStoreOperation, emitRuntimeObjectValuesOperation } from "./llvm/objects.js";
import { emitPrintOperation } from "./llvm/print.js";
import { emitDoWhileOperation, emitForInArrayOperation, emitForInObjectOperation, emitForOfArrayOperation, emitForOfMapOperation, emitForOfProtocolOperation, emitForOfSetOperation, emitForOfStringOperation, emitForOperation, emitWhileOperation } from "./llvm/loop-statements.js";
import { emitBreakOperation, emitContinueOperation, emitIfOperation, emitOperationsWithScopedBindings, emitSwitchOperation, emitTryCatchOperation, noLines } from "./llvm/branches.js";
import { emitRuntimeArrayAppendOperation, emitRuntimeArrayCopyWithinOperation, emitRuntimeArrayDeleteOperation, emitRuntimeArrayFillOperation, emitRuntimeArrayRemoveOperation, emitRuntimeArrayReverseOperation, emitRuntimeArraySetLengthOperation, emitRuntimeArrayStoreOperation } from "./llvm/array-mutators.js";
import { emitRuntimeArrayFilterCallbackOperation,
  emitRuntimeArrayFlatMapCallbackOperation,
  emitRuntimeArrayFlatOperation,
  emitRuntimeArrayForEachCallbackOperation,
  emitRuntimeArrayFromFamilyOperation,
  emitRuntimeArrayMapCallbackOperation,
  emitRuntimeArrayMapFunctionObjectOperation,
  emitRuntimeArrayScalarCallbackOperation,
  emitRuntimeArraySortOperation
} from "./llvm/array-callbacks.js";
import { emitObjectLiteralOperation, emitValueObjectSetPrototypeOperation } from "./llvm/known-shape-objects.js";
import { functionObjectExpectedArgumentCount, internedFunctionGlobal } from "./llvm/function-objects.js";
import {
  emitIterableAppend,
  emitValueCallExpression
} from "./llvm/value-calls.js";
import { emitValueExpression } from "./llvm/value-expressions.js";
import { emitArrayDestructureProtocolOperation, emitArrayStoreOperation, emitAssignBooleanOperation, emitAssignNumberOperation, emitAssignStringOperation, emitLetBooleanOperation, emitLetNumberOperation, emitLetStringOperation, emitLetValueOperation, emitObjectStoreOperation, emitPrivateFieldStoreOperation, emitValueAggregateDeleteOperation, emitValueAggregateStoreOperation } from "./llvm/bindings.js";
import { emitInlineCppDeclarations } from "./llvm/inline-cpp.js";
import { operationListTerminates } from "./llvm/loops.js";
import { emitCondition } from "./llvm/conditions.js";
import { errorClassIds } from "./llvm/error-ids.js";
import { emitCallArguments, emitCallExpressionResult, emitStringCallExpressionResult } from "./llvm/calls.js";
import { addStringConstant, utf8ByteLength } from "./llvm/strings.js";
import {
  runtimeIteratorKindCode,
  stringLengthPointerName,
  variablePointerName
} from "./llvm/names.js";
import { defineStructuredRuntimeHelpers, runtimeIrText } from "./runtime-ir.js";
import {
  COMPLETION_NORMAL,
  emitExceptionReturnBlock,
  emitGeneratedJsCall,
  emitNormalGeneratedReturn,
  emitPackedGeneratedReturn,
  emitRootStackPush,
  generatedReturnType
} from "./llvm/completion.js";
import {

  jsValueUndefined
} from "./llvm/values.js";
import { type LegacyLlvmTraceMarker, type RenderedLlvmModule, createLlvmModule } from "./llvm-ir/index.js";











function createMainEmitContext(): EmitContext {
  // The four dispatch bindings close over `context` itself, which is safe because they are only
  // called once emission is under way — the object is complete by then.
  const context: EmitContext = {
    emitValue: (expression) => emitValueExpression(expression, context),
    emitOperations: (operations) => emitOperations(operations, context),
    emitCondition: (condition) => emitCondition(condition, context),
    emitOperation: (operation) => emitOperation(operation, context),
    emitNumberExpression: (expression) => emitNumberExpression(expression, context),
    emitStringExpression: (expression) => emitStringExpression(expression, context),
    emitCallArguments: (args) => emitCallArguments(args, context),
    emitCallExpressionResult: (expression) => emitCallExpressionResult(expression, context),
    emitStringCallExpressionResult: (expression) => emitStringCallExpressionResult(expression, context),
    bindings: new Map(),
    stringConstants: [],
    arrayGlobals: [],
    objectTypes: [],
    objectLayouts: new Map(),
    valueGlobals: new Set(),
    loopLabels: [],
    cleanupStack: [],
    activeCleanupBodies: [],
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
    tryIndex: 0,
    cleanupSeq: 0,
    optionalTargets: [],
    exceptionTarget: "main.unhandled",
    exceptionSlot: "%main.exception.slot",
    completionSlots: {
      kind: "%main.completion.kind",
      value: "%main.completion.value",
      destination: "%main.completion.dest",
      until: "%main.completion.until"
    },
    nextDestId: 0,
    isMain: true,
    normalExitLabel: "main.normal",
    gcFrameName: "%gc.main.frame",
    traceMarkers: new Map()
  };
  return context;
}

function createFunctionEmitContext(fn: FunctionDef, parent: EmitContext): EmitContext {
  const context: EmitContext = {
    emitValue: (expression) => emitValueExpression(expression, context),
    emitOperations: (operations) => emitOperations(operations, context),
    emitCondition: (condition) => emitCondition(condition, context),
    emitOperation: (operation) => emitOperation(operation, context),
    emitNumberExpression: (expression) => emitNumberExpression(expression, context),
    emitStringExpression: (expression) => emitStringExpression(expression, context),
    emitCallArguments: (args) => emitCallArguments(args, context),
    emitCallExpressionResult: (expression) => emitCallExpressionResult(expression, context),
    emitStringCallExpressionResult: (expression) => emitStringCallExpressionResult(expression, context),
    bindings: new Map(fn.outerBindings),
    stringConstants: parent.stringConstants,
    arrayGlobals: parent.arrayGlobals,
    objectTypes: parent.objectTypes,
    objectLayouts: new Map(parent.objectLayouts),
    valueGlobals: parent.valueGlobals,
    loopLabels: [],
    cleanupStack: [],
    activeCleanupBodies: [],
    hasNumberPrint: parent.hasNumberPrint,
    printIndex: parent.printIndex,
    ifIndex: 0,
    cmpIndex: 0,
    numIndex: 0,
    callIndex: 0,
    loopIndex: 0,
    logicIndex: 0,
    boolIndex: 0,
    stringIndex: 0,
    arrayIndex: parent.arrayIndex,
    objectIndex: parent.objectIndex,
    tryIndex: 0,
    cleanupSeq: 0,
    optionalTargets: [],
    exceptionTarget: "fn.exception",
    exceptionSlot: "%fn.exception.slot",
    completionSlots: {
      kind: "%fn.completion.kind",
      value: "%fn.completion.value",
      destination: "%fn.completion.dest",
      until: "%fn.completion.until"
    },
    nextDestId: 0,
    isMain: false,
    gcFrameName: "%gc.frame",
    traceMarkers: parent.traceMarkers,
    suppressTrace: fn.traceOperation === undefined
  };
  return context;
}
















































interface LlvmIrEmission {
  readonly rendered: RenderedLlvmModule;
  readonly diagnostics: readonly CompilerDiagnostic[];
}

// eslint-disable-next-line max-statements -- Legacy section assembly and tracked builder composition remain together during incremental migration.
function emitLlvmIr(module: JsIrModule): LlvmIrEmission {
  const moduleComments = module.modules
    .map((sourceModule) => `; source ${sourceModule.fileName} statements=${sourceModule.statementCount}`)
    .join("\n");
  const context = createMainEmitContext();
  const functionDefs: FunctionDef[] = [];
  const functionObjectThunks: JsIrFunctionObjectDefinition[] = [];
  const mainOps: JsIrOperation[] = [];
  const definedFunctionNames = new Set<string>();
  const diagnostics: CompilerDiagnostic[] = [];

  const registerFunctionDef = (definition: FunctionDef): void => {
    if (definedFunctionNames.has(definition.name)) {
      diagnostics.push(functionDefinitionDiagnostic(
        `Duplicate function definition '${definition.name}'`,
        definition.traceOperation
      ));
      return;
    }
    definedFunctionNames.add(definition.name);
    functionDefs.push(definition);
  };

  for (const sourceModule of module.modules) {
    for (const definition of sourceModule.functionObjects) {
      if (definition.body === undefined) {
        functionObjectThunks.push(definition);
      } else {
        registerFunctionDef({
          name: definition.codeName,
          parameters: definition.parameters,
          body: definition.body,
          outerBindings: new Map(),
          callingConvention: "functionObject",
          usesDynamicThis: definition.functionKind === "ordinary",
          captures: definition.captures,
          returnType: "aggregate"
        });
      }
    }
    for (const op of sourceModule.operations) {
      classifyAndProcessOperation(op, context, registerFunctionDef, mainOps);
    }
    // Nested `function` ops (and nested callback objects) live inside enclosing
    // bodies. Top-level classification only sees module-scope operations, so collect
    // nested definitions here and hoist them to module-level `define`s.
    visitJsIrOperations(sourceModule.operations, (operation, parent) => {
      if (parent === undefined) {
        return;
      }
      if (operation.kind === "runtimeArrayMapFunctionObject") {
        registerFunctionDef(functionObjectDefinition(operation));
        return;
      }
      if (operation.kind === "function") {
        const unsupportedCaptures = operation.enclosingCaptureNames ?? [];
        if (unsupportedCaptures.length > 0) {
          diagnostics.push(functionDefinitionDiagnostic(
            `Nested function '${operation.name}' captures unsupported enclosing bindings: ${unsupportedCaptures.join(", ")}`,
            operation
          ));
          return;
        }
        for (const definition of functionDefinitionsFromOperation(operation, new Map(context.bindings))) {
          registerFunctionDef(definition);
        }
      }
    });
  }

  const fnLines = [
    ...functionObjectThunks.flatMap((definition) => emitFunctionObjectThunk(definition, context)),
    ...functionDefs.flatMap((fn) => emitFunctionDefinition(fn, context))
  ];
  const internedFunctions = new Map<string, JsIrFunctionObjectDefinition>();
  for (const sourceModule of module.modules) {
    for (const definition of sourceModule.functionObjects) {
      if (definition.directTarget !== undefined && (definition.captures?.length ?? 0) === 0 && !internedFunctions.has(definition.directTarget)) {
        internedFunctions.set(definition.directTarget, definition);
      }
    }
  }
  const mainLines = context.emitOperations(mainOps);
  const functionObjectGlobals = [...internedFunctions].map(([target]) => `@${internedFunctionGlobal(target)} = internal global i64 ${jsValueUndefined}`);
  const valueGlobals = [...context.valueGlobals].map((name) => `@${name}.value = internal global i64 ${jsValueUndefined}`);
  const aggregateGlobals = [...context.objectTypes, ...context.arrayGlobals, ...functionObjectGlobals, ...valueGlobals].join("\n");

  // Phase A: invoke the GC initializer before any user statement so that the
  // call to gcInit lands at the start of @main's entry block. Immediately record
  // the root-stack baseline so top-level roots are released before @main returns
  // (otherwise straight-line top-level temporaries stay pinned until process exit).
  const mainInit = [
    "  call void @gcInit()",
    "  %gc.main.frame = call i64 @gcRootSave()",
    ...[...internedFunctions].flatMap(([target, definition], index) => {
      const value = `%fnobj.intern.${index}`;
      // The interned object stands in for a function declaration reference, so
      // it carries the declaration's own name and expected argument count.
      const name = addStringConstant(target, context);
      const nameLength = utf8ByteLength(target);
      const nameValue = `%fnobj.intern.name.${index}`;
      const length = functionObjectExpectedArgumentCount(definition.parameters);
      return [
        `  ${nameValue} = call i64 @valueBoxString(ptr ${name}, i64 ${nameLength})`,
        `  ${value} = call i64 @functionObjectNew(ptr @${definition.codeName}, ptr null, i64 ${jsValueUndefined}, i64 ${nameValue}, i64 ${length})`,
        `  store i64 ${value}, ptr @${internedFunctionGlobal(target)}`,
        `  call void @gcRootPush(i64 ${value})`
      ];
    })
  ];

  const runtimeIr = runtimeIrText();
  const inlineCppDeclarations = emitInlineCppDeclarations(module.inlineCppBlocks);
  const traceMarkers: LegacyLlvmTraceMarker[] = [];
  const legacyLines: string[] = [];
  const appendLines = (lines: readonly string[]): void => {
    for (const sourceLine of lines) {
      for (const line of sourceLine.split("\n")) {
        const marker = context.traceMarkers.get(line);
        if (marker !== undefined) {
          traceMarkers.push({ ...marker, line: legacyLines.length + 1 });
        }
        legacyLines.push(line);
      }
    }
  };
  const appendText = (text: string): void => {
    if (text.length > 0) {
      appendLines(text.split("\n"));
    }
  };
  // Joined lazily after mainInit so name constants for interned function
  // objects (added while mainInit is constructed) are included.
  const stringConstants = context.stringConstants.join("\n");
  appendLines([`; tscn textual LLVM IR placeholder`, `; entry ${module.entry}`]);
  appendText(moduleComments);
  appendLines(["", "declare i32 @puts(ptr)", "declare i32 @printf(ptr, ...)", "declare void @exit(i32)"]);
  appendLines(inlineCppDeclarations);
  appendLines([""]);
  appendText(stringConstants);
  appendText(aggregateGlobals);
  appendText(runtimeIr);
  appendLines(fnLines);
  appendLines([
    "define i32 @main() {",
    "entry:",
    ...mainInit,
    `  ${context.exceptionSlot} = alloca i64`,
    `  ${context.completionSlots.kind} = alloca i8`,
    `  ${context.completionSlots.value} = alloca i64`,
    `  ${context.completionSlots.destination} = alloca i32`,
    `  ${context.completionSlots.until} = alloca i32`,
    `  store i8 ${COMPLETION_NORMAL}, ptr ${context.completionSlots.kind}`,
    `  store i64 ${jsValueUndefined}, ptr ${context.completionSlots.value}`,
    `  store i32 0, ptr ${context.completionSlots.destination}`,
    `  store i32 0, ptr ${context.completionSlots.until}`
  ]);
  if (mainLines.length > noLines) {
    appendLines(mainLines);
  }
  if (!operationListTerminates(mainOps)) {
    appendLines(["  br label %main.normal"]);
  }
  appendLines([
    "main.normal:",
    "  call void @gcRootRestore(i64 %gc.main.frame)",
    "  ret i32 0",
    "main.unhandled:",
    `  %main.unhandled.value = load i64, ptr ${context.exceptionSlot}`,
    "  call void @valuePrint(i64 %main.unhandled.value)",
    "  call void @gcRootRestore(i64 %gc.main.frame)",
    "  call void @exit(i32 1)",
    "  ret i32 1",
    "}"
  ]);
  const legacyText = `${legacyLines.join("\n")}\n`;
  const llvmModule = createLlvmModule();
  llvmModule.addLegacyModuleText({ origin: "legacy LLVM backend", text: legacyText, traceMarkers });
  defineStructuredRuntimeHelpers(llvmModule);
  return { rendered: llvmModule.render(), diagnostics };
}

function functionDefinitionDiagnostic(message: string, operation: JsIrOperation | undefined): CompilerDiagnostic {
  const diagnostic: CompilerDiagnostic = { code: "TSCN1002", category: "error", message };
  const span = operation?.trace?.source;
  if (span === undefined) {
    return diagnostic;
  }
  return { ...diagnostic, span };
}

export interface LlvmEmission {
  readonly llvmIr: string;
  readonly traceMap: TraceMapV1;
  readonly diagnostics: readonly CompilerDiagnostic[];
}

export function emitLlvmModule(module: JsIrModule): LlvmEmission {
  const { rendered, diagnostics } = emitLlvmIr(module);
  return {
    llvmIr: rendered.text,
    traceMap: buildTraceMap(module, rendered.traceRanges),
    diagnostics
  };
}

function functionDefinitionsFromOperation(
  operation: Extract<JsIrOperation, { readonly kind: "function" }>,
  outerBindings: Map<string, JsIrBindingValue>
): readonly FunctionDef[] {
  const definitions: FunctionDef[] = [];
  const returnClosure = operation.body.find((op) => op.kind === "returnClosure");
  if (returnClosure?.kind === "returnClosure") {
    definitions.push({
      name: returnClosure.functionName,
      parameters: [...returnClosure.captures, ...returnClosure.parameters].map((name) => ({ name, valueKind: "number" })),
      body: returnClosure.body,
      outerBindings: new Map(),
      traceOperation: returnClosure,
      returnType: "aggregate"
    });
  }
  definitions.push({
    name: operation.name,
    parameters: operation.parameters,
    body: operation.body,
    outerBindings,
    traceOperation: operation,
    returnType: "aggregate"
  });
  return definitions;
}

// eslint-disable-next-line complexity, max-statements -- Top-level operation classification is an explicit dispatch table.
function classifyAndProcessOperation(
  operation: JsIrOperation,
  context: EmitContext,
  registerFunctionDef: (definition: FunctionDef) => void,
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
  } else if (operation.kind === "letValue") {
    let valueType: "function" | undefined;
    if (operation.value.kind === "functionObject") {
      valueType = "function";
    }
    context.bindings.set(operation.name, { kind: "valueVariable", name: operation.name, valueType });
    if (operation.moduleGlobal === true) {
      context.valueGlobals.add(operation.name);
    }
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
  } else if (operation.kind === "runtimeArrayMapFunctionObject") {
    registerFunctionDef(functionObjectDefinition(operation));
  } else if (classifyAggregateOperation(operation, context)) {
    // Binding recorded; the operation still belongs in the emitted body below.
  } else if (operation.kind === "function") {
    for (const definition of functionDefinitionsFromOperation(operation, new Map(context.bindings))) {
      registerFunctionDef(definition);
    }
    return;
  }

  mainOps.push(operation);
}

function functionObjectDefinition(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayMapFunctionObject" }>
): FunctionDef {
  return {
    name: operation.callbackName,
    parameters: operation.callbackParameters,
    body: operation.callbackBody,
    outerBindings: new Map(),
    traceOperation: operation,
    callingConvention: "functionObject",
    usesDynamicThis: operation.callbackKind === "ordinary",
    captures: operation.captures,
    returnType: "aggregate"
  };
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
  if (fn.callingConvention === "functionObject") {
    return emitFunctionObjectDefinition(fn, context);
  }
  const paramList = emitFunctionParameters(fn.parameters).join(", ");
  const lines: string[] = [`define ${generatedReturnType} @${fn.name}(${paramList}) {`];
  const fnContext = createFunctionEmitContext(fn, context);
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
      value: { kind: "parameter", name: `%p${i}.num` }
    });
  }
  const bodyLines = [
    // Record the root-stack baseline first; every ret/throw restores to it.
    `  ${fnContext.gcFrameName} = call i64 @gcRootSave()`,
    `  ${fnContext.exceptionSlot} = alloca i64`,
    `  ${fnContext.completionSlots.kind} = alloca i8`,
    `  ${fnContext.completionSlots.value} = alloca i64`,
    `  ${fnContext.completionSlots.destination} = alloca i32`,
    `  ${fnContext.completionSlots.until} = alloca i32`,
    `  store i8 ${COMPLETION_NORMAL}, ptr ${fnContext.completionSlots.kind}`,
    `  store i64 ${jsValueUndefined}, ptr ${fnContext.completionSlots.value}`,
    `  store i32 0, ptr ${fnContext.completionSlots.destination}`,
    `  store i32 0, ptr ${fnContext.completionSlots.until}`,
    // Pin heap-capable parameters for the whole call so an internal safepoint (e.g. a
    // loop back-edge) cannot collect a value the body still uses. Released by the
    // restore on return.
    ...emitParameterRoots(fn.parameters),
    ...emitStringParameterStores(fn.parameters, fnContext),
    ...emitNumberParameterUnbox(fn.parameters),
    ...fnContext.emitOperations(fn.body)
  ];
  context.printIndex = fnContext.printIndex;
  context.hasNumberPrint = fnContext.hasNumberPrint;
  context.arrayIndex = fnContext.arrayIndex;
  context.objectIndex = fnContext.objectIndex;
  lines.push("entry:", ...bodyLines);
  if (!operationListTerminates(fn.body)) {
    lines.push(...emitNormalGeneratedReturn(jsValueUndefined, fnContext));
  }
  lines.push(...emitExceptionReturnBlock(fnContext), "}", "");
  if (fn.traceOperation === undefined) {
    return lines;
  }
  return wrapFunctionTrace(fn.traceOperation, lines, context);
}

// eslint-disable-next-line max-statements -- Function-object prologue materializes this, captures, and typed argv bindings together.
function emitFunctionObjectDefinition(fn: FunctionDef, context: EmitContext): string[] {
  const lines: string[] = [`define ${generatedReturnType} @${fn.name}(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {`];
  const fnContext = createFunctionEmitContext(fn, context);
  const bodyLines = [
    `  ${fnContext.gcFrameName} = call i64 @gcRootSave()`,
    `  ${fnContext.exceptionSlot} = alloca i64`,
    `  ${fnContext.completionSlots.kind} = alloca i8`,
    `  ${fnContext.completionSlots.value} = alloca i64`,
    `  ${fnContext.completionSlots.destination} = alloca i32`,
    `  ${fnContext.completionSlots.until} = alloca i32`,
    `  store i8 ${COMPLETION_NORMAL}, ptr ${fnContext.completionSlots.kind}`,
    `  store i64 ${jsValueUndefined}, ptr ${fnContext.completionSlots.value}`,
    `  store i32 0, ptr ${fnContext.completionSlots.destination}`,
    `  store i32 0, ptr ${fnContext.completionSlots.until}`
  ];
  if (fn.usesDynamicThis === true) {
    bodyLines.push("  call void @gcRootPush(i64 %this.value)");
    fnContext.bindings.set("this", { kind: "valueVariable", name: "%this.value" });
  }
  for (let i = 0; i < (fn.captures?.length ?? 0); i += 1) {
    const capture = fn.captures?.[i];
    if (capture === undefined) {
      continue;
    }
    const value = `%fnobj.capture.${i}`;
    bodyLines.push(`  ${value} = call i64 @environmentGet(ptr %env, i64 ${i})`, `  call void @gcRootPush(i64 ${value})`);
    if (capture.valueKind === "number") {
      const number = `%fnobj.capture.${i}.num`;
      bodyLines.push(`  ${number} = call double @valueNumber(i64 ${value})`);
      fnContext.bindings.set(capture.name, { kind: "number", value: { kind: "parameter", name: number } });
      continue;
    }
    if (capture.valueKind === "string") {
      const pointer = `%fnobj.capture.${i}.ptr`;
      const length = `%fnobj.capture.${i}.len`;
      bodyLines.push(
        `  ${pointer} = call ptr @valueStringPtr(i64 ${value})`,
        `  ${length} = call i64 @valueStringLength(i64 ${value})`,
        `  ${variablePointerName(capture.name)} = alloca ptr`,
        `  ${stringLengthPointerName(capture.name)} = alloca i64`,
        `  store ptr ${pointer}, ptr ${variablePointerName(capture.name)}`,
        `  store i64 ${length}, ptr ${stringLengthPointerName(capture.name)}`
      );
      fnContext.bindings.set(capture.name, { kind: "stringVariable", name: capture.name });
      continue;
    }
    fnContext.bindings.set(capture.name, { kind: "valueVariable", name: value });
  }
  for (let i = 0; i < fn.parameters.length; i += 1) {
    const parameter = fn.parameters[i];
    const slot = `%fnobj.arg.${i}.slot`;
    const value = `%fnobj.arg.${i}`;
    bodyLines.push(`  ${slot} = getelementptr i64, ptr %argv, i64 ${i}`, `  ${value} = load i64, ptr ${slot}`, `  call void @gcRootPush(i64 ${value})`);
    if (parameter.valueKind === "number") {
      const number = `%fnobj.arg.${i}.num`;
      bodyLines.push(`  ${number} = call double @valueNumber(i64 ${value})`);
      fnContext.bindings.set(parameter.name, { kind: "number", value: { kind: "parameter", name: number } });
      continue;
    }
    if (parameter.valueKind === "string") {
      const pointer = `%fnobj.arg.${i}.ptr`;
      const length = `%fnobj.arg.${i}.len`;
      bodyLines.push(
        `  ${pointer} = call ptr @valueStringPtr(i64 ${value})`,
        `  ${length} = call i64 @valueStringLength(i64 ${value})`,
        `  ${variablePointerName(parameter.name)} = alloca ptr`,
        `  ${stringLengthPointerName(parameter.name)} = alloca i64`,
        `  store ptr ${pointer}, ptr ${variablePointerName(parameter.name)}`,
        `  store i64 ${length}, ptr ${stringLengthPointerName(parameter.name)}`
      );
      fnContext.bindings.set(parameter.name, { kind: "stringVariable", name: parameter.name });
      continue;
    }
    fnContext.bindings.set(parameter.name, { kind: "valueVariable", name: value });
  }
  bodyLines.push(...fnContext.emitOperations(fn.body));
  context.printIndex = fnContext.printIndex;
  context.hasNumberPrint = fnContext.hasNumberPrint;
  context.arrayIndex = fnContext.arrayIndex;
  context.objectIndex = fnContext.objectIndex;
  lines.push("entry:", ...bodyLines);
  if (!operationListTerminates(fn.body)) {
    lines.push(...emitNormalGeneratedReturn(jsValueUndefined, fnContext));
  }
  lines.push(...emitExceptionReturnBlock(fnContext), "}", "");
  if (fn.traceOperation === undefined) {
    return lines;
  }
  return wrapFunctionTrace(fn.traceOperation, lines, context);
}

function emitFunctionObjectThunk(definition: JsIrFunctionObjectDefinition, context: EmitContext): string[] {
  const target = definition.directTarget;
  if (target === undefined) {
    return [];
  }
  const result = "%fnobj.thunk.result";
  const payload = "%fnobj.thunk.payload";
  const exception = "%fnobj.thunk.status";
  const callArguments: string[] = [];
  const lines = [
    `define ${generatedReturnType} @${definition.codeName}(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {`,
    "entry:",
    "  %gc.frame = call i64 @gcRootSave()",
    "  %fnobj.thunk.exception.slot = alloca i64",
    "  call void @gcRootPush(i64 %this.value)"
  ];
  for (let index = 0; index < definition.parameters.length; index += 1) {
    const parameter = definition.parameters[index];
    if (parameter.isRest === true) {
      // A direct call passes a rest parameter as an already-built array, so the thunk has to
      // materialize one out of the shared argument buffer. Reading argv slot by slot instead
      // handed the target a single element no matter how many arguments the caller passed.
      const array = `%fnobj.thunk.rest.array.${index}`;
      const boxIndex = context.numIndex;
      context.numIndex += 1;
      const box = `%value.${boxIndex}`;
      lines.push(
        `  ${array} = call ptr @arrayFromArgv(i64 %argc, ptr %argv, i64 ${index})`,
        `  ${box} = call i64 @valueBoxArray(ptr ${array})`,
        emitRootStackPush(box, context)
      );
      callArguments.push(`i64 ${box}`);
      continue;
    }
    const slot = `%fnobj.thunk.arg.${index}.slot`;
    const value = `%fnobj.thunk.arg.${index}`;
    lines.push(`  ${slot} = getelementptr i64, ptr %argv, i64 ${index}`, `  ${value} = load i64, ptr ${slot}`, `  call void @gcRootPush(i64 ${value})`);
    callArguments.push(`i64 ${value}`);
  }
  lines.push(
    `  ${result} = call ${generatedReturnType} @${target}(${callArguments.join(", ")})`,
    `  ${payload} = extractvalue ${generatedReturnType} ${result}, 0`,
    `  ${exception} = extractvalue ${generatedReturnType} ${result}, 1`,
    emitRootStackPush(payload, context),
    `  store i64 ${payload}, ptr %fnobj.thunk.exception.slot`,
    `  br i1 ${exception}, label %fnobj.thunk.exception, label %fnobj.thunk.continue`,
    "fnobj.thunk.continue:",
    "  call void @gcRootRestore(i64 %gc.frame)"
  );
  let normalValue = payload;
  if (definition.returnKind === "void") {
    normalValue = jsValueUndefined;
  }
  lines.push(...emitPackedGeneratedReturn(normalValue, "false", context, "fnobj.thunk.normal"));
  lines.push(
    "fnobj.thunk.exception:",
    "  %fnobj.thunk.exception.value = load i64, ptr %fnobj.thunk.exception.slot",
    "  call void @gcRootRestore(i64 %gc.frame)"
  );
  lines.push(...emitPackedGeneratedReturn("%fnobj.thunk.exception.value", "true", context, "fnobj.thunk.exception"), "}", "");
  return lines;
}

// Push heap-capable parameters (strings and arbitrary JSValues) onto the GC root
// stack at function entry. Numbers are NaN-boxed non-pointers, so they are skipped.
function emitParameterRoots(parameters: readonly JsIrFunctionParameter[]): string[] {
  const lines: string[] = [];
  for (let index = 0; index < parameters.length; index++) {
    const parameter = parameters[index];
    if (parameter.valueKind === "string" || parameter.valueKind === "value") {
      lines.push(`  call void @gcRootPush(i64 %p${index})`);
    }
  }
  return lines;
}

function emitFunctionParameters(parameters: readonly JsIrFunctionParameter[]): string[] {
  // Every parameter now uses the uniform i64 NaN-boxed JSValue ABI. Numbers and
  // strings are unboxed back into their backend-local working forms in the
  // function prologue (emitNumberParameterUnbox / emitStringParameterStores).
  return parameters.map((_parameter, index) => `i64 %p${index}`);
}

// Unboxes i64 JSValue number parameters back into raw doubles at function entry,
// mirroring emitStringParameterStores. A number parameter %pN is bound to the
// recovered double register %pN.num (see the parameter binding in
// emitFunctionDefinition).
function emitNumberParameterUnbox(parameters: readonly JsIrFunctionParameter[]): string[] {
  const lines: string[] = [];
  for (let index = 0; index < parameters.length; index++) {
    const parameter = parameters[index];
    if (parameter.valueKind === "string" || parameter.valueKind === "value") {
      continue;
    }
    lines.push(`  %p${index}.num = call double @valueNumber(i64 %p${index})`);
  }
  return lines;
}

function emitStringParameterStores(parameters: readonly JsIrFunctionParameter[], _context: EmitContext): string[] {
  const lines: string[] = [];
  for (let index = 0; index < parameters.length; index++) {
    const parameter = parameters[index];
    if (parameter.valueKind !== "string") {
      continue;
    }
    // String parameters arrive as a single i64 NaN-boxed reference. Unbox it back
    // into the backend-local (ptr, length) working form held in twin allocas.
    lines.push(
      `  %p${index}.ptr = call ptr @valueStringPtr(i64 %p${index})`,
      `  %p${index}.len = call i64 @valueStringLength(i64 %p${index})`,
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
    const emitted = context.emitOperation(operation);
    if (context.suppressTrace === true) {
      lines.push(...emitted);
    } else {
      lines.push(traceStartLine(operation, context), ...emitted, traceEndLine(operation, context));
    }
    if (operationListTerminates([operation])) {
      break;
    }
  }

  return lines;
}




/**
 * Emits one operation kind. The narrowed parameter means a handler cannot read a field its
 * kind does not have, which is what lets a single handler serve several kinds.
 */
type OperationEmitter<T extends JsIrOperation["kind"]> = (operation: OperationOf<T>, context: EmitContext) => string[];

/**
 * Builds the emitter table, proving at compile time that it routes every kind it is given.
 * A new operation kind is a compile error here until something emits it, which is the
 * closed-world property the `if` chain could not state: a kind that matched no branch used
 * to emit nothing and say so nowhere.
 */
function operationEmitters<T extends JsIrOperation["kind"]>(handlers: {
  readonly [K in T]: OperationEmitter<K>;
}): { readonly [K in T]: OperationEmitter<K> } {
  return handlers;
}

const operationEmittersByKind = operationEmitters({
  // Bindings. A `const` has no runtime effect; it only records how later operations read the name.
  constNumber: (operation, context) => {
    context.bindings.set(operation.name, { kind: "number", value: operation.value });
    return [];
  },
  constBoolean: (operation, context) => {
    context.bindings.set(operation.name, { kind: "boolean", value: operation.value });
    return [];
  },
  constBooleanExpression: (operation, context) => {
    context.bindings.set(operation.name, { kind: "booleanExpression", value: operation.value });
    return [];
  },
  constValue: (operation, context) => {
    context.bindings.set(operation.name, { kind: "value", value: operation.value });
    return [];
  },
  letValue: emitLetValueOperation,
  constClosure: (operation, context) => {
    context.bindings.set(operation.name, { kind: "closure", value: operation.value });
    return [];
  },
  constString: (operation, context) => {
    context.bindings.set(operation.name, { kind: "string", value: operation.value });
    return [];
  },
  constStringExpression: (operation, context) => {
    context.bindings.set(operation.name, { kind: "stringExpression", value: operation.value });
    return [];
  },
  letNumber: emitLetNumberOperation,
  letString: emitLetStringOperation,
  letBoolean: emitLetBooleanOperation,

  // Aggregate literals and the runtime shapes they build.
  arrayLiteral: emitArrayLiteralOperation,
  runtimeArrayLiteral: emitRuntimeArrayLiteralOperation,
  objectLiteral: emitObjectLiteralOperation,
  runtimeObjectLiteral: emitRuntimeObjectLiteralOperation,
  runtimeObjectCreate: emitRuntimeObjectCreateOperation,
  runtimeErrorLiteral: emitRuntimeErrorLiteralOperation,
  runtimeMapNew: emitRuntimeCollectionNewOperation,
  runtimeSetNew: emitRuntimeCollectionNewOperation,
  runtimeMapFromArray: emitRuntimeCollectionFromArrayOperation,
  runtimeSetFromArray: emitRuntimeCollectionFromArrayOperation,
  runtimeMapFromIterable: emitRuntimeCollectionFromIterableOperation,
  runtimeSetFromIterable: emitRuntimeCollectionFromIterableOperation,
  runtimeMapFromCollection: emitRuntimeCollectionFromCollectionOperation,
  runtimeSetFromCollection: emitRuntimeCollectionFromCollectionOperation,
  runtimeObjectKeys: emitRuntimeObjectKeysOperation,
  runtimeObjectValues: emitRuntimeObjectValuesOperation,
  runtimeObjectEntries: emitRuntimeObjectEntriesOperation,
  runtimeObjectFromEntries: emitRuntimeObjectFromEntriesOperation,
  runtimeObjectOwnPropertyDescriptor: emitRuntimeObjectOwnPropertyDescriptorOperation,
  runtimeObjectOwnPropertyNames: emitRuntimeObjectOwnPropertyNamesOperation,
  runtimeObjectOwnPropertyDescriptors: emitRuntimeObjectOwnPropertyDescriptorsOperation,
  runtimeIteratorNew: emitRuntimeIteratorNewOperation,

  // Array- and string-producing operations.
  runtimeArraySlice: emitRuntimeArraySliceOperation,
  runtimeArraySplice: emitRuntimeArraySpliceOperation,
  runtimeArraySpliceStatement: emitRuntimeArraySpliceStatementOperation,
  runtimeArrayFlat: emitRuntimeArrayFlatOperation,
  runtimeStringSplit: emitRuntimeStringSplitOperation,
  runtimeRegexSplit: emitRuntimeRegexSplitOperation,
  runtimeArrayMapCallback: emitRuntimeArrayMapCallbackOperation,
  runtimeArrayMapFunctionObject: emitRuntimeArrayMapFunctionObjectOperation,
  runtimeArrayFlatMapCallback: emitRuntimeArrayFlatMapCallbackOperation,
  runtimeArrayFilterCallback: emitRuntimeArrayFilterCallbackOperation,
  runtimeArrayConcat: emitRuntimeArrayConcatOperation,
  runtimeArrayMutatorResult: emitRuntimeArrayMutatorResultOperation,
  runtimeArraySort: emitRuntimeArraySortOperation,
  runtimeArrayFrom: emitRuntimeArrayFromFamilyOperation,
  runtimeArrayFromValue: emitRuntimeArrayFromFamilyOperation,
  runtimeArrayFromCollection: emitRuntimeArrayFromFamilyOperation,
  runtimeArrayFindCallback: emitRuntimeArrayScalarCallbackOperation,
  runtimeArrayFindIndexCallback: emitRuntimeArrayScalarCallbackOperation,
  runtimeArrayReduceCallback: emitRuntimeArrayScalarCallbackOperation,
  runtimeObjectGetPrototype: emitRuntimeObjectGetPrototypeOperation,

  // Assignments and stores.
  assignNumber: emitAssignNumberOperation,
  assignString: emitAssignStringOperation,
  assignBoolean: emitAssignBooleanOperation,
  arrayStore: emitArrayStoreOperation,
  runtimeArrayStore: emitRuntimeArrayStoreOperation,
  runtimeArrayNamedStore: emitRuntimeArrayNamedStoreOperation,
  runtimeArrayDelete: emitRuntimeArrayDeleteOperation,
  runtimeArrayNamedDelete: emitRuntimeArrayNamedDeleteOperation,
  runtimeArraySetLength: emitRuntimeArraySetLengthOperation,
  runtimeArrayPush: emitRuntimeArrayAppendOperation,
  runtimeArrayUnshift: emitRuntimeArrayAppendOperation,
  runtimeArrayPop: emitRuntimeArrayRemoveOperation,
  runtimeArrayShift: emitRuntimeArrayRemoveOperation,
  runtimeArrayFill: emitRuntimeArrayFillOperation,
  runtimeArrayReverse: emitRuntimeArrayReverseOperation,
  runtimeArrayForEachCallback: emitRuntimeArrayForEachCallbackOperation,
  runtimeArrayCopyWithin: emitRuntimeArrayCopyWithinOperation,
  objectStore: emitObjectStoreOperation,
  runtimeObjectStore: emitRuntimeObjectStoreOperation,
  runtimeObjectDelete: emitRuntimeObjectDeleteOperation,
  valueObjectStore: emitValueAggregateStoreOperation,
  valueArrayStore: emitValueAggregateStoreOperation,
  valueArraySetLength: emitValueAggregateStoreOperation,
  privateFieldStore: emitPrivateFieldStoreOperation,
  valueObjectDelete: emitValueAggregateDeleteOperation,
  valueArrayDelete: emitValueAggregateDeleteOperation,
  runtimeObjectSetPrototype: emitRuntimeObjectSetPrototypeOperation,
  valueObjectSetPrototype: emitValueObjectSetPrototypeOperation,
  runtimeObjectPreventExtensions: emitRuntimeObjectStateMutationOperation,
  runtimeObjectSeal: emitRuntimeObjectStateMutationOperation,
  runtimeObjectFreeze: emitRuntimeObjectStateMutationOperation,
  runtimeObjectAssign: emitRuntimeObjectAssignOperation,
  runtimeObjectDefineDataProperty: emitRuntimeObjectDefineDataPropertyOperation,
  runtimeObjectDefineDataProperties: (operation, context) =>
    operation.descriptors.flatMap((descriptor) =>
      emitRuntimeObjectDefineDataPropertyOperation(
        { kind: "runtimeObjectDefineDataProperty", objectName: operation.objectName, descriptor },
        context
      )
    ),

  // Collection mutation.
  runtimeCollectionSetIterator: emitRuntimeCollectionMutationOperation,
  runtimeMapSet: emitRuntimeCollectionMutationOperation,
  runtimeSetAdd: emitRuntimeCollectionMutationOperation,
  runtimeMapSetResult: emitRuntimeCollectionResultOperation,
  runtimeSetAddResult: emitRuntimeCollectionResultOperation,

  // Control flow and loop control.
  switch: emitSwitchOperation,
  while: emitWhileOperation,
  doWhile: emitDoWhileOperation,
  for: emitForOperation,
  forOfArray: emitForOfArrayOperation,
  forOfString: emitForOfStringOperation,
  forOfSet: emitForOfSetOperation,
  forOfMap: emitForOfMapOperation,
  forOfProtocol: emitForOfProtocolOperation,
  arrayDestructureProtocol: emitArrayDestructureProtocolOperation,
  forInObject: emitForInObjectOperation,
  forInArray: emitForInArrayOperation,
  break: (_operation, context) => emitBreakOperation(context),
  continue: (_operation, context) => emitContinueOperation(context),
  block: emitScopedBlockOperation,
  bindingGroup: emitBindingGroupOperation,
  if: emitIfOperation,
  tryCatch: emitTryCatchOperation,

  /**
   * A function body is emitted as its own `define`, hoisted out of the statement list by
   * `emitLlvmModule`, so the statement itself contributes no lines.
   */
  function: emitHoistedFunctionOperation,

  // Calls, effects and returns.
  print: emitPrintOperation,
  throwValue: emitThrowValueOperation,
  call: emitCallOperation,
  callValue: (operation, context) => [...emitValueCallExpression(operation, context).lines],
  inlineCpp: (operation) => [`  call i64 @${operation.symbol}()`],
  returnNumber: emitNumberReturnOperation,
  returnString: emitStringReturnOperation,
  returnValue: emitValueReturnOperation,
  returnClosure: (_operation, context) => emitNormalGeneratedReturn(jsValueUndefined, context)
});

/**
 * The handler for an operation's kind.
 *
 * This is the one assertion in the emitter, and the reason is a limitation in the correlation
 * between a union-typed discriminant and the per-variant handler it selects: indexing a `Record`
 * by a union key yields a union of function types, and the parameters of that union intersect to
 * `never`, so the compiler will not accept the operation it just indexed with. What makes the
 * lookup safe is upstream of the cast — the table is checked for totality at its declaration and
 * every entry is checked against its own kind — so the (kind, handler) pair is sound by
 * construction and the assertion only re-associates the two. Widening each handler's parameter
 * to the whole union to avoid it would cost every handler the narrowed operation type, which is
 * the property that stops a handler reading a field its kind does not have.
 */
function operationEmitterFor(operation: JsIrOperation): OperationEmitter<JsIrOperation["kind"]> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- totality of the table and per-kind handler types are both checked above
  return operationEmittersByKind[operation.kind] as OperationEmitter<JsIrOperation["kind"]>;
}

function emitOperation(operation: JsIrOperation, context: EmitContext): string[] {
  return operationEmitterFor(operation)(operation, context);
}

function emitScopedBlockOperation(
  operation: OperationOf<"block">,
  context: EmitContext
): string[] {
  return emitOperationsWithScopedBindings(operation.operations, context);
}

function emitBindingGroupOperation(
  operation: OperationOf<"bindingGroup">,
  context: EmitContext
): string[] {
  return context.emitOperations(operation.operations);
}

function emitHoistedFunctionOperation(_operation: OperationOf<"function">, _context: EmitContext): string[] {
  return [];
}





function emitThrowValueOperation(operation: OperationOf<"throwValue">, context: EmitContext): string[] {
  const value = context.emitValue(operation.value);
  // exceptionTarget is already the nearest catch or cleanup throw-entry.
  return [
    ...value.lines,
    emitRootStackPush(value.value, context),
    `  store i64 ${value.value}, ptr ${context.exceptionSlot}`,
    `  br label %${context.exceptionTarget}`
  ];
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
    const value = context.emitNumberExpression(operation.elements[i]);
    lines.push(...pointer.lines, ...value.lines, `  store double ${value.value}, ptr ${pointer.value}`);
  }
  return lines;
}

// eslint-disable-next-line max-statements -- Runtime array literal emission handles holes, values, and spread materialization together.
function emitRuntimeArrayLiteralOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayLiteral" }>,
  context: EmitContext
): string[] {
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
    // The loop bound guarantees this index; the guard keeps the element non-optional so the
    // `kind` narrowing below stays total. Without it a future bounds change would silently
    // dereference undefined here.
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- live once noUncheckedIndexedAccess is enabled
    if (element === undefined) {
      throw new Error(`Runtime array literal element ${i} is missing`);
    }
    if (element.kind === "hole") {
      if (operation.elements.some((candidate) => candidate.kind === "spread" || candidate.kind === "iterableSpread")) {
        const current = `%${operation.name}.hole.current.${i}`;
        lines.push(`  ${current} = load ptr, ptr ${arrayValue.pointerName}`, `  call i64 @arrayPush(ptr ${current}, i64 ${jsValueUndefined})`);
      } else {
        fixedIndex += 1;
      }
      continue;
    }
    if (element.kind === "iterableSpread") {
      const current = `%${operation.name}.iterable.current.${i}`;
      lines.push(
        `  ${current} = load ptr, ptr ${arrayValue.pointerName}`,
        ...emitIterableAppend(element.source, element.notIterableMessage, current, `${operation.name}.${i}`, context)
      );
      continue;
    }
    if (element.kind === "spread") {
      if (element.sourceKind === "fixed") {
        const binding = context.bindings.get(element.arrayName);
        if (binding?.kind !== "array") {
          throw new Error("Expected fixed array spread binding");
        }
        for (let spreadIndex = 0; spreadIndex < binding.length; spreadIndex++) {
          const value = context.emitValue({ kind: "number", value: { kind: "arrayAccess", arrayName: element.arrayName, index: { kind: "literal", value: spreadIndex } } });
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
      lines.push(
        ...source.lines,
        `  ${current} = load ptr, ptr ${arrayValue.pointerName}`,
        `  ${boxed} = call i64 @valueBoxArray(ptr ${source.value})`,
        `  call void @gcRootPush(i64 ${boxed})`,
        `  ${args} = call ptr @arrayNew(i64 1)`,
        `  call void @arraySet(ptr ${args}, i64 0, i64 ${boxed})`,
        `  ${next} = call ptr @arrayConcat(ptr ${current}, ptr ${args})`,
        `  call void @gcRootPop()`,
        `  store ptr ${next}, ptr ${arrayValue.pointerName}`
      );
      continue;
    }
    const value = context.emitValue(element.value);
    if (operation.elements.some((candidate) => candidate.kind === "spread" || candidate.kind === "iterableSpread")) {
      const current = `%${operation.name}.value.current.${i}`;
      lines.push(...value.lines, `  ${current} = load ptr, ptr ${arrayValue.pointerName}`, `  call i64 @arrayPush(ptr ${current}, i64 ${value.value})`);
    } else {
      lines.push(...value.lines, `  call void @arraySet(ptr %${operation.name}.arr, i64 ${fixedIndex}, i64 ${value.value})`);
      fixedIndex += 1;
    }
  }
  return lines;
}











































































































































































function emitRuntimeIteratorNewOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeIteratorNew" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  const collection = emitRuntimeCollectionPointer(operation.collectionName, context);
  const modeCode = runtimeIteratorKindCode(operation.iterationKind);
  let sourceCode = 3;
  if (operation.sourceKind === "map") {
    sourceCode = 2;
  }
  const iteratorValue = `%${operation.name}.iterator.value`;
  context.bindings.set(operation.name, { kind: "valueVariable", name: operation.name });
  if (operation.observeOverride === true) {
    const acquired = emitGeneratedJsCall("getCollectionIterator", [`ptr ${collection.value}`, `i64 ${sourceCode}`, `i64 ${modeCode}`], context);
    return [
      `  ${pointerName} = alloca i64`,
      ...collection.lines,
      ...acquired.lines,
      `  store i64 ${acquired.value}, ptr ${pointerName}`,
      `  call void @gcRootPush(i64 ${acquired.value})`
    ];
  }
  return [
    `  ${pointerName} = alloca i64`,
    ...collection.lines,
    `  ${iteratorValue} = call i64 @createCollectionIterator(ptr ${collection.value}, i64 ${sourceCode}, i64 ${modeCode})`,
    `  store i64 ${iteratorValue}, ptr ${pointerName}`,
    `  call void @gcRootPush(i64 ${iteratorValue})`
  ];
}











function runtimeArrayLiteralInitialLength(elements: readonly JsIrRuntimeArrayElement[]): number {
  if (elements.some((element) => element.kind === "spread" || element.kind === "iterableSpread")) {
    return 0;
  }
  return elements.length;
}



































































































































































































































































































































































































































































































































































































function emitRuntimeErrorLiteralOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeErrorLiteral" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeObject", name: operation.name, errorName: operation.errorName });
  const classId = errorClassIds.get(operation.errorName) ?? 0;
  const nameConstant = addStringConstant(operation.errorName, context);
  const nameLength = utf8ByteLength(operation.errorName);
  const message = context.emitValue(operation.message);
  const objectName = `%obj.rt.${context.objectIndex}`;
  context.objectIndex += 1;
  return [
    `  ${pointerName} = alloca ptr`,
    ...message.lines,
    `  ${objectName} = call ptr @errorNew(i64 ${classId}, i64 ${nameLength}, ptr ${nameConstant}, i64 ${message.value})`,
    `  store ptr ${objectName}, ptr ${pointerName}`
  ];
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
    end = { lines: [`  ${length} = call i64 @arrayLength(ptr ${array.value})`], value: length };
  } else {
    end = emitArrayIndex(operation.end, context);
  }
  const result = `%arr.rt.${context.arrayIndex}`;
  context.arrayIndex += 1;
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
    lines.push(`  ${length} = call i64 @arrayLength(ptr ${array.value})`);
    deleteCountArg = length;
  } else {
    const deleteCount = emitArrayIndex(operation.deleteCount, context);
    lines.push(...deleteCount.lines);
    deleteCountArg = deleteCount.value;
  }
  const items = operation.items.map((item) => context.emitValue(item));
  const itemsName = `%arr.splice.items.${context.arrayIndex}`;
  context.arrayIndex += 1;
  lines.push(`  ${itemsName} = call ptr @arrayNew(i64 ${items.length})`);
  for (let index = 0; index < items.length; index += 1) {
    const value = items[index];
    lines.push(...value.lines, `  call void @arraySet(ptr ${itemsName}, i64 ${index}, i64 ${value.value})`);
  }
  const result = `%arr.rt.${context.arrayIndex}`;
  context.arrayIndex += 1;
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
    lines.push(`  ${length} = call i64 @arrayLength(ptr ${array.value})`);
    deleteCountArg = length;
  } else {
    const deleteCount = emitArrayIndex(operation.deleteCount, context);
    lines.push(...deleteCount.lines);
    deleteCountArg = deleteCount.value;
  }
  const items = operation.items.map((item) => context.emitValue(item));
  const itemsName = `%arr.splice.items.${context.arrayIndex}`;
  context.arrayIndex += 1;
  lines.push(`  ${itemsName} = call ptr @arrayNew(i64 ${items.length})`);
  for (let index = 0; index < items.length; index += 1) {
    const value = items[index];
    lines.push(...value.lines, `  call void @arraySet(ptr ${itemsName}, i64 ${index}, i64 ${value.value})`);
  }
  return [...lines, `  call ptr @arraySplice(ptr ${array.value}, i64 ${start.value}, i64 ${deleteCountArg}, i64 ${items.length}, ptr ${itemsName})`];
}




















function emitRuntimeStringSplitOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeStringSplit" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  const receiver = context.emitStringExpression(operation.receiver);
  const separator = context.emitStringExpression(operation.separator);
  const result = `%arr.rt.${context.arrayIndex}`;
  context.arrayIndex += 1;
  let limitLines: readonly string[] = [];
  let limitValue = "-1";
  if (operation.limit !== undefined) {
    const limit = emitArrayIndex(operation.limit, context);
    limitLines = limit.lines;
    limitValue = limit.value;
  }
  return [
    `  ${pointerName} = alloca ptr`,
    ...receiver.lines,
    ...separator.lines,
    ...limitLines,
    `  ${result} = call ptr @stringSplit(i64 ${receiver.length}, ptr ${receiver.value}, i64 ${separator.length}, ptr ${separator.value}, i64 ${limitValue})`,
    `  store ptr ${result}, ptr ${pointerName}`
  ];
}

function emitRuntimeRegexSplitOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeRegexSplit" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  const receiver = context.emitStringExpression(operation.receiver);
  const regex = context.emitValue(operation.regex);
  const inputValue = `%regex.split.input.${context.callIndex}`;
  const result = `%regex.split.result.${context.arrayIndex}`;
  context.arrayIndex += 1;
  let limitLines: readonly string[] = [];
  let limitValue = "-1";
  if (operation.limit !== undefined) {
    const limit = emitArrayIndex(operation.limit, context);
    limitLines = limit.lines;
    limitValue = limit.value;
  }
  return [
    `  ${pointerName} = alloca ptr`,
    ...regex.lines,
    `  call void @gcRootPush(i64 ${regex.value})`,
    ...receiver.lines,
    `  ${inputValue} = call i64 @valueBoxString(ptr ${receiver.value}, i64 ${receiver.length})`,
    ...limitLines,
    `  ${result} = call ptr @regexSplit(i64 ${regex.value}, i64 ${inputValue}, i64 ${limitValue})`,
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
      return [context.emitValue(value.value)];
    }
    const elements: JsValue[] = [];
    for (let index = 0; index < value.length; index += 1) {
      elements.push(context.emitValue({ kind: "number", value: { kind: "arrayAccess", arrayName: value.arrayName, index: { kind: "literal", value: index } } }));
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
  return [...lines, `  ${result} = call ptr @arrayConcat(ptr ${left.value}, ptr ${argsName})`, `  store ptr ${result}, ptr ${pointerName}`];
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



























































































































































































































































































































































































































































































































function emitRuntimeArrayNamedStoreOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayNamedStore" }>,
  context: EmitContext
): string[] {
  const array = emitRuntimeArrayPointer(operation.arrayName, context);
  const key = context.emitStringExpression(operation.key);
  const value = context.emitValue(operation.value);
  return [...array.lines, ...key.lines, ...value.lines, `  call void @arraySetNamed(ptr ${array.value}, i64 ${key.length}, ptr ${key.value}, i64 ${value.value})`];
}










function emitRuntimeArrayNamedDeleteOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayNamedDelete" }>,
  context: EmitContext
): string[] {
  const array = emitRuntimeArrayPointer(operation.arrayName, context);
  const key = context.emitStringExpression(operation.key);
  return [...array.lines, ...key.lines, `  call void @arrayDeleteNamed(ptr ${array.value}, i64 ${key.length}, ptr ${key.value})`];
}

















































































































































































































































































































































function emitCallOperation(operation: { readonly kind: "call"; readonly name: string; readonly arguments: readonly JsIrCallArgument[] }, context: EmitContext): string[] {
  const args = context.emitCallArguments(operation.arguments);
  return [...args.lines, ...emitGeneratedJsCall(operation.name, args.values, context).lines];
}


















































































































function emitNumberReturnOperation(operation: { readonly kind: "returnNumber"; readonly expression: JsIrNumberExpression }, context: EmitContext): string[] {
  const result = context.emitNumberExpression(operation.expression);
  const index = context.numIndex;
  context.numIndex += 1;
  const boxed = `%ret.num.${index}`;
  return [...result.lines, `  ${boxed} = call i64 @valueBoxNumber(double ${llvmDoubleBitcastOperand(result.value)})`, ...emitNormalGeneratedReturn(boxed, context)];
}

function emitStringReturnOperation(operation: { readonly kind: "returnString"; readonly expression: JsIrStringExpression }, context: EmitContext): string[] {
  const result = context.emitStringExpression(operation.expression);
  const index = context.stringIndex;
  context.stringIndex += 1;
  const boxed = `%ret.str.${index}`;
  // Box, then restore this frame and return the raw i64. No safepoint runs between the
  // box and the ret, and the caller re-roots the result at the handoff (see the value
  // "call" emitter), so the freshly-boxed string is never collected in the gap.
  return [
    ...result.lines,
    `  ${boxed} = call i64 @valueBoxString(ptr ${result.value}, i64 ${result.length})`,
    ...emitNormalGeneratedReturn(boxed, context)
  ];
}

function emitValueReturnOperation(operation: { readonly kind: "returnValue"; readonly expression: JsIrValueExpression }, context: EmitContext): string[] {
  const result = context.emitValue(operation.expression);
  return [...result.lines, ...emitNormalGeneratedReturn(result.value, context)];
}





























































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































