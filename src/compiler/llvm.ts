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
import { emitObjectFieldPointer } from "./llvm/paths.js";
import {
  emitRuntimeArrayPointer,
  emitRuntimeCollectionPointer,
  emitRuntimeObjectPointer
} from "./llvm/layout.js";
import {
  emitArrayElementPointer,
  emitArrayIndex,
  emitNumberExpression,
  llvmDoubleBitcastOperand,
} from "./llvm/numbers.js";
import { emitStringExpression, emitStringIndexArgument } from "./llvm/string-expressions.js";
import { emitRuntimeCollectionFromArrayOperation, emitRuntimeCollectionFromCollectionOperation, emitRuntimeCollectionFromIterableOperation, emitRuntimeCollectionMutationOperation, emitRuntimeCollectionNewOperation, emitRuntimeCollectionResultOperation } from "./llvm/collections.js";
import { emitNumberValueExpression, emitRuntimeObjectAssignOperation, emitRuntimeObjectCreateOperation, emitRuntimeObjectDefineDataPropertyOperation, emitRuntimeObjectDeleteOperation, emitRuntimeObjectEntriesOperation, emitRuntimeObjectFromEntriesOperation, emitRuntimeObjectGetPrototypeOperation, emitRuntimeObjectKeysOperation, emitRuntimeObjectLiteralOperation, emitRuntimeObjectLiteralStorage, emitRuntimeObjectOwnPropertyDescriptorOperation, emitRuntimeObjectOwnPropertyDescriptorsOperation, emitRuntimeObjectOwnPropertyNamesOperation, emitRuntimeObjectSetPrototypeOperation, emitRuntimeObjectStateMutationOperation, emitRuntimeObjectStoreOperation, emitRuntimeObjectValueExpression, emitRuntimeObjectValuesOperation } from "./llvm/objects.js";
import { emitPrintOperation } from "./llvm/print.js";
import { emitDoWhileOperation, emitForInArrayOperation, emitForInObjectOperation, emitForOfArrayOperation, emitForOfMapOperation, emitForOfProtocolOperation, emitForOfSetOperation, emitForOfStringOperation, emitForOperation, emitWhileOperation } from "./llvm/loop-statements.js";
import { emitBreakOperation, emitContinueOperation, emitIfOperation, emitOperationsWithScopedBindings, emitSwitchOperation, emitTryCatchOperation, noLines } from "./llvm/branches.js";
import { emitRuntimeArrayAppendOperation, emitRuntimeArrayCopyWithinOperation, emitRuntimeArrayDeleteOperation, emitRuntimeArrayFillOperation, emitRuntimeArrayRemoveOperation, emitRuntimeArrayRemoveValueExpression, emitRuntimeArrayReverseOperation, emitRuntimeArraySetLengthOperation, emitRuntimeArrayStoreOperation } from "./llvm/array-mutators.js";
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
import { emitObjectLiteralOperation, emitValueObjectSetPrototypeOperation, emitValueObjectValueExpression } from "./llvm/known-shape-objects.js";
import { functionObjectExpectedArgumentCount, internedFunctionGlobal } from "./llvm/function-objects.js";
import { emitInlineCppDeclarations } from "./llvm/inline-cpp.js";
import { operationListTerminates } from "./llvm/loops.js";
import { emitCondition, emitNamedValueBinding } from "./llvm/conditions.js";
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
  createCleanupFrame,
  emitCleanupAfterBody,
  emitCleanupFinalDispatch,
  emitExceptionReturnBlock,
  emitGeneratedJsCall,
  emitIteratorCloseBody,
  emitNormalGeneratedReturn,
  emitPackedGeneratedReturn,
  emitRootStackPush,
  emitThrowEntryBlock,
  generatedReturnType
} from "./llvm/completion.js";
import {
  jsValueFalse,
  jsValueNull,
  jsValueTrue,
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
















































































































































































































































































function emitLetNumberOperation(
  operation: Extract<JsIrOperation, { readonly kind: "letNumber" }>,
  context: EmitContext
): string[] {
  const result = context.emitNumberExpression(operation.value);
  const pointer = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "number", value: { kind: "variable", name: pointer } });
  return [...result.lines, `  ${pointer} = alloca double`, `  store double ${result.value}, ptr ${pointer}`];
}

function emitLetStringOperation(
  operation: Extract<JsIrOperation, { readonly kind: "letString" }>,
  context: EmitContext
): string[] {
  const result = context.emitStringExpression(operation.value);
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
  const result = context.emitCondition(operation.value);
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

// Consume a synchronous iterable into an existing runtime array. Iterator
// acquisition and next() use the explicit exception ABI; normal exhaustion is
// the only successful exit and therefore never invokes return().
// eslint-disable-next-line max-statements -- Protocol consumption is a compact emitted state machine.
function emitIterableAppend(
  sourceExpression: JsIrValueExpression,
  notIterableMessageText: string,
  destination: string,
  prefix: string,
  context: EmitContext
): string[] {
  const index = context.arrayIndex;
  context.arrayIndex += 1;
  const source = context.emitValue(sourceExpression);
  const messageConstant = addStringConstant(notIterableMessageText, context);
  const message = `%spread.message.${index}`;
  const iteratorCall = emitGeneratedJsCall("getIteratorValue", [`i64 ${source.value}`, `i64 ${message}`], context);
  const iteratorSlot = `%spread.iter.${index}.addr`;
  const condLabel = `spread.cond.${index}`;
  const bodyLabel = `spread.body.${index}`;
  const valueLabel = `spread.value.${index}`;
  const endLabel = `spread.end.${index}`;
  const normalLabel = `spread.normal.${index}`;
  const iterator = `%spread.iter.${index}`;
  const nextCall = emitGeneratedJsCall("callIteratorNext", [`i64 ${iterator}`], context);
  const doneKey = addStringConstant("done", context);
  const valueKey = addStringConstant("value", context);
  const doneValue = `%spread.done.value.${index}`;
  const done = `%spread.done.${index}`;
  const value = `%spread.item.${index}`;
  const destinationValue = `%spread.destination.${index}`;
  return [
    ...source.lines,
    `  call void @gcRootPush(i64 ${source.value})`,
    `  ${message} = call i64 @valueBoxString(ptr ${messageConstant}, i64 ${utf8ByteLength(notIterableMessageText)})`,
    ...iteratorCall.lines,
    `  ${iteratorSlot} = alloca i64`,
    `  store i64 ${iteratorCall.value}, ptr ${iteratorSlot}`,
    `  call void @gcRootPush(i64 ${iteratorCall.value})`,
    `  ${destinationValue} = call i64 @valueBoxArray(ptr ${destination})`,
    `  call void @gcRootPush(i64 ${destinationValue})`,
    `  br label %${condLabel}`,
    `${condLabel}:`,
    `  br label %${bodyLabel}`,
    `${bodyLabel}:`,
    `  ${iterator} = load i64, ptr ${iteratorSlot}`,
    ...nextCall.lines,
    `  ${doneValue} = call i64 @valueObjectGet(i64 ${nextCall.value}, i64 4, ptr ${doneKey})`,
    `  ${done} = call i1 @valueTruthy(i64 ${doneValue})`,
    `  br i1 ${done}, label %${normalLabel}, label %${valueLabel}`,
    `${valueLabel}:`,
    `  ${value} = call i64 @valueObjectGet(i64 ${nextCall.value}, i64 5, ptr ${valueKey})`,
    `  call void @gcRootPush(i64 ${value})`,
    `  call i64 @arrayPush(ptr ${destination}, i64 ${value})`,
    `  call void @gcSafepoint()`,
    `  br label %${condLabel}`,
    `${normalLabel}:`,
    `  br label %${endLabel}`,
    `${endLabel}:`,
    `  ; completed iterable spread ${prefix}`
  ];
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






















































































































































































































































































































































































// Materializes a JSValue into a stable memory slot and binds the name to it, so
// every later reference loads the same value (used for class instance locals).
function emitLetValueOperation(
  operation: Extract<JsIrOperation, { readonly kind: "letValue" }>,
  context: EmitContext
): string[] {
  const value = context.emitValue(operation.value);
  const pointer = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "valueVariable", name: operation.name });
  if (operation.moduleGlobal === true) {
    context.valueGlobals.add(operation.name);
    return [
      ...value.lines,
      `  store i64 ${value.value}, ptr @${operation.name}.value`,
      `  call void @gcRootPush(i64 ${value.value})`
    ];
  }
  return [...value.lines, `  ${pointer} = alloca i64`, `  store i64 ${value.value}, ptr ${pointer}`];
}




















































function emitAssignNumberOperation(
  operation: Extract<JsIrOperation, { readonly kind: "assignNumber" }>,
  context: EmitContext
): string[] {
  const binding = context.bindings.get(operation.name);
  if (binding?.kind !== "number" || binding.value.kind !== "variable") {
    return [];
  }

  const result = context.emitNumberExpression(operation.value);
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

  const result = context.emitStringExpression(operation.value);
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

  const result = context.emitCondition(operation.value);
  return [...result.lines, `  store i1 ${result.value}, ptr ${variablePointerName(binding.name)}`];
}

function emitArrayStoreOperation(
  operation: Extract<JsIrOperation, { readonly kind: "arrayStore" }>,
  context: EmitContext
): string[] {
  const pointer = emitArrayElementPointer(operation.arrayName, operation.index, context);
  const value = context.emitNumberExpression(operation.value);
  return [...pointer.lines, ...value.lines, `  store double ${value.value}, ptr ${pointer.value}`];
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






























































































function emitObjectStoreOperation(
  operation: Extract<JsIrOperation, { readonly kind: "objectStore" }>,
  context: EmitContext
): string[] {
  const pointer = emitObjectFieldPointer(operation.objectName, operation.path, context);
  if (pointer === undefined) {
    return [];
  }
  const value = context.emitNumberExpression(operation.value);
  const lines = [...pointer.lines, ...value.lines, `  store double ${value.value}, ptr ${pointer.value}`];
  const layout = context.objectLayouts.get(operation.objectName);
  if (layout?.runtimePointerName !== undefined && operation.path.length === 1) {
    const key = context.emitStringExpression({ kind: "literal", value: operation.path[0] });
    const jsValue = emitNumberValueExpression({ kind: "number", value: operation.value }, context);
    const object = emitRuntimeObjectPointer(operation.objectName, context);
    lines.push(...key.lines, ...jsValue.lines, ...object.lines, `  call void @objectSet(ptr ${object.value}, i64 ${key.length}, ptr ${key.value}, i64 ${jsValue.value})`);
  }
  return lines;
}




















function emitValueAggregateStoreOperation(
  operation: Extract<JsIrOperation, { readonly kind: "valueObjectStore" | "valueArrayStore" | "valueArraySetLength" }>,
  context: EmitContext
): string[] {
  const receiver = emitNamedValueBinding(operation.targetName, context);
  if (operation.kind === "valueArraySetLength") {
    const length = emitArrayIndex(operation.length, context);
    return [...receiver.lines, ...length.lines, `  call void @valueArraySetLength(i64 ${receiver.value}, i64 ${length.value})`];
  }
  if (operation.kind === "valueArrayStore") {
    const index = emitArrayIndex(operation.index, context);
    const value = context.emitValue(operation.value);
    return [...receiver.lines, ...index.lines, ...value.lines, `  call void @valueArraySet(i64 ${receiver.value}, i64 ${index.value}, i64 ${value.value})`];
  }
  const key = context.emitStringExpression(operation.key);
  const value = context.emitValue(operation.value);
  return [...receiver.lines, ...key.lines, ...value.lines, `  call void @valueObjectSet(i64 ${receiver.value}, i64 ${key.length}, ptr ${key.value}, i64 ${value.value})`];
}

// Emits the TypeError throw shared by private field reads and writes: builds a
// native TypeError object with the given literal message and routes it to the
// nearest exception handler, exactly like a `throwValue` operation.
function emitPrivateFieldBrandThrow(message: string, labelPrefix: string, context: EmitContext): string[] {
  const messageConstant = addStringConstant(message, context);
  const nameConstant = addStringConstant("TypeError", context);
  const messageValue = `%${labelPrefix}.msg`;
  const errorObject = `%${labelPrefix}.err`;
  const errorBoxed = `%${labelPrefix}.boxed`;
  return [
    `  ${messageValue} = call i64 @valueBoxString(ptr ${messageConstant}, i64 ${utf8ByteLength(message)})`,
    `  ${errorObject} = call ptr @errorNew(i64 ${errorClassIds.get("TypeError") ?? 0}, i64 9, ptr ${nameConstant}, i64 ${messageValue})`,
    `  ${errorBoxed} = call i64 @valueBoxObject(ptr ${errorObject})`,
    emitRootStackPush(errorBoxed, context),
    `  store i64 ${errorBoxed}, ptr ${context.exceptionSlot}`,
    `  br label %${context.exceptionTarget}`
  ];
}

// Emits a private field write: the class-mangled key must be an own property of
// the receiver (the brand), otherwise a TypeError is thrown.
function emitPrivateFieldStoreOperation(
  operation: Extract<JsIrOperation, { readonly kind: "privateFieldStore" }>,
  context: EmitContext
): string[] {
  const receiver = emitNamedValueBinding(operation.targetName, context);
  const value = context.emitValue(operation.value);
  const keyConstant = addStringConstant(operation.key, context);
  const keyLength = utf8ByteLength(operation.key);
  const index = context.objectIndex;
  context.objectIndex += 1;
  const has = `%priv.has.${index}`;
  const okLabel = `priv.ok.${index}`;
  const throwLabel = `priv.throw.${index}`;
  return [
    ...receiver.lines,
    ...value.lines,
    `  ${has} = call i1 @valueObjectHasOwn(i64 ${receiver.value}, i64 ${keyLength}, ptr ${keyConstant})`,
    `  br i1 ${has}, label %${okLabel}, label %${throwLabel}`,
    `${throwLabel}:`,
    ...emitPrivateFieldBrandThrow(operation.message, `priv.store.${index}`, context),
    `${okLabel}:`,
    `  call void @valueObjectSet(i64 ${receiver.value}, i64 ${keyLength}, ptr ${keyConstant}, i64 ${value.value})`
  ];
}

function emitValueAggregateDeleteOperation(
  operation: Extract<JsIrOperation, { readonly kind: "valueObjectDelete" | "valueArrayDelete" }>,
  context: EmitContext
): string[] {
  const receiver = emitNamedValueBinding(operation.targetName, context);
  if (operation.kind === "valueArrayDelete") {
    const index = emitArrayIndex(operation.index, context);
    return [...receiver.lines, ...index.lines, `  call void @valueArrayDelete(i64 ${receiver.value}, i64 ${index.value})`];
  }
  const key = context.emitStringExpression(operation.key);
  return [...receiver.lines, ...key.lines, `  call void @valueObjectDelete(i64 ${receiver.value}, i64 ${key.length}, ptr ${key.value})`];
}































































































































function emitCallOperation(operation: { readonly kind: "call"; readonly name: string; readonly arguments: readonly JsIrCallArgument[] }, context: EmitContext): string[] {
  const args = context.emitCallArguments(operation.arguments);
  return [...args.lines, ...emitGeneratedJsCall(operation.name, args.values, context).lines];
}
















































function emitNewInstanceValueExpression(
  expression: Extract<JsIrValueExpression, { readonly kind: "newInstance" }>,
  context: EmitContext
): JsValue {
  const args = context.emitCallArguments(expression.arguments);
  const index = context.objectIndex;
  context.objectIndex += 1;
  const object = `%instance.obj.${index}`;
  const instance = `%instance.${index}`;
  const prototypePointer = `%instance.prototype.${index}`;
  const prototypeLines: string[] = [];
  if (context.bindings.has(expression.prototypeName)) {
    const prototype = emitNamedValueBinding(expression.prototypeName, context);
    prototypeLines.push(
      ...prototype.lines,
      `  ${prototypePointer} = call ptr @valueObjectPtr(i64 ${prototype.value})`,
      `  call void @objectSetPrototype(ptr ${object}, ptr ${prototypePointer})`
    );
  }
  const constructorArgs = [`i64 ${instance}`, ...args.values];
  const constructorCall = emitGeneratedJsCall(expression.constructorName, constructorArgs, context);
  return {
    lines: [
      ...args.lines,
      `  ${object} = call ptr @objectNew(i64 ${expression.fieldCount})`,
      ...prototypeLines,
      `  ${instance} = call i64 @valueBoxObject(ptr ${object})`,
      // Pin the new instance for the constructor call AND keep it pinned afterwards
      // (released by the enclosing frame/iteration restore) so a later allocation in
      // the consuming function cannot collect the freshly-built object.
      emitRootStackPush(instance, context),
      ...constructorCall.lines
    ],
    value: instance
  };
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

// eslint-disable-next-line complexity, max-statements -- Transitional JSValue emission remains centralized during aggregate boxing.
function emitValueExpression(expression: JsIrValueExpression, context: EmitContext): JsValue {
  const primitive = emitPrimitiveValueExpression(expression, context);
  if (primitive !== undefined) {
    return primitive;
  }

  if (expression.kind === "variable") {
    const { name: expressionName } = expression;
    const binding = context.bindings.get(expressionName);
    if (binding?.kind === "valueVariable" && binding.name.startsWith("%")) {
      return { lines: [], value: binding.name };
    }
    if (binding?.kind === "value") {
      return context.emitValue(binding.value);
    }
    let name = expressionName;
    if (binding?.kind === "valueVariable") {
      ({ name } = binding);
    }
    if (!name.startsWith("%")) {
      const value = `%value.${context.numIndex}`;
      context.numIndex += 1;
      let pointer = variablePointerName(name);
      if (context.valueGlobals.has(name)) {
        pointer = `@${name}.value`;
      }
      return { lines: [`  ${value} = load i64, ptr ${pointer}`], value };
    }
    return { lines: [], value: name };
  }

  if (expression.kind === "call") {
    const args = context.emitCallArguments(expression.arguments);
    const generated = emitGeneratedJsCall(expression.name, args.values, context);
    return {
      lines: [...args.lines, ...generated.lines],
      value: generated.value
    };
  }

  if (expression.kind === "callValue") {
    return emitValueCallExpression(expression, context);
  }

  if (expression.kind === "regexCompile") {
    const pattern = context.emitStringExpression(expression.pattern);
    const flags = context.emitStringExpression(expression.flags);
    const patternValue = `%regex.pattern.${context.callIndex}`;
    const flagsValue = `%regex.flags.${context.callIndex}`;
    const call = emitGeneratedJsCall("regexCompile", [`i64 ${patternValue}`, `i64 ${flagsValue}`], context);
    return {
      lines: [
        ...pattern.lines,
        ...flags.lines,
        `  ${patternValue} = call i64 @valueBoxString(ptr ${pattern.value}, i64 ${pattern.length})`,
        `  call void @gcRootPush(i64 ${patternValue})`,
        `  ${flagsValue} = call i64 @valueBoxString(ptr ${flags.value}, i64 ${flags.length})`,
        `  call void @gcRootPush(i64 ${flagsValue})`,
        ...call.lines
      ],
      value: call.value
    };
  }

  if (expression.kind === "regexExec" || expression.kind === "regexMatch") {
    const regex = context.emitValue(expression.regex);
    const input = context.emitStringExpression(expression.input);
    const inputValue = `%regex.input.${context.callIndex}`;
    let helper: "regexExec" | "regexMatch" = "regexExec";
    if (expression.kind === "regexMatch") {
      helper = "regexMatch";
    }
    const call = emitGeneratedJsCall(helper, [`i64 ${regex.value}`, `i64 ${inputValue}`], context);
    return {
      lines: [
        ...regex.lines,
        `  call void @gcRootPush(i64 ${regex.value})`,
        ...input.lines,
        `  ${inputValue} = call i64 @valueBoxString(ptr ${input.value}, i64 ${input.length})`,
        `  call void @gcRootPush(i64 ${inputValue})`,
        ...call.lines
      ],
      value: call.value
    };
  }

  if (expression.kind === "functionObject") {
    const index = context.callIndex;
    context.callIndex += 1;
    const value = `%fnobj.${index}`;
    if (expression.definition.directTarget !== undefined && (expression.definition.captures?.length ?? 0) === 0) {
      return {
        lines: [`  ${value} = load i64, ptr @${internedFunctionGlobal(expression.definition.directTarget)}`],
        value
      };
    }
    const captures = expression.definition.captures ?? [];
    const lines: string[] = [];
    let functionName = jsValueUndefined;
    if (expression.definition.inferredName !== undefined) {
      const name = context.emitStringExpression({ kind: "literal", value: expression.definition.inferredName });
      functionName = `%fnobj.name.${index}`;
      lines.push(
        ...name.lines,
        `  ${functionName} = call i64 @valueBoxString(ptr ${name.value}, i64 ${name.length})`,
        emitRootStackPush(functionName, context)
      );
    }
    let environment = "null";
    if (captures.length > 0) {
      const emittedCaptures = captures.map((capture) => context.emitValue(capture.value));
      for (const capture of emittedCaptures) {
        lines.push(...capture.lines, `  call void @gcRootPush(i64 ${capture.value})`);
      }
      environment = `%fnobj.env.${index}`;
      lines.push(`  ${environment} = call ptr @environmentNew(i64 ${captures.length})`);
      for (let captureIndex = 0; captureIndex < emittedCaptures.length; captureIndex += 1) {
        lines.push(`  call void @environmentSet(ptr ${environment}, i64 ${captureIndex}, i64 ${emittedCaptures[captureIndex].value})`);
      }
    }
    lines.push(`  ${value} = call i64 @functionObjectNew(ptr @${expression.definition.codeName}, ptr ${environment}, i64 ${jsValueUndefined}, i64 ${functionName}, i64 ${functionObjectExpectedArgumentCount(expression.definition.parameters)})`, emitRootStackPush(value, context));
    return { lines, value };
  }

  if (expression.kind === "inlineCppValue") {
    const index = context.callIndex;
    context.callIndex += 1;
    const value = `%cpp.${index}`;
    return {
      lines: [`  ${value} = call i64 @${expression.symbol}()`, emitRootStackPush(value, context)],
      value
    };
  }

  if (expression.kind === "newInstance") {
    return emitNewInstanceValueExpression(expression, context);
  }

  if (expression.kind === "ternary") {
    return emitTernaryValueExpression(expression, context);
  }

  if (expression.kind === "lazyDefault") {
    return emitLazyDefaultValueExpression(expression, context);
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

  if (expression.kind === "privateFieldAccess") {
    return emitPrivateFieldAccessExpression(expression, context);
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
    return { lines: [...array.lines, ...atIndex.lines, `  ${value} = call i64 @arrayAt(ptr ${array.value}, i64 ${atIndex.value})`], value };
  }

  if (expression.kind === "valuePlus") {
    const left = context.emitValue(expression.left);
    const right = context.emitValue(expression.right);
    const value = `%value.${context.numIndex}`;
    context.numIndex += 1;
    return {
      lines: [
        ...left.lines,
        ...right.lines,
        `  ${value} = call i64 @valuePlus(i64 ${left.value}, i64 ${right.value})`,
        emitRootStackPush(value, context)
      ],
      value
    };
  }

  if (expression.kind === "logicalValue") {
    return emitLogicalValueExpression(expression, context);
  }

  if (expression.kind === "nullishCoalesce") {
    return emitNullishCoalesceValueExpression(expression, context);
  }

  if (expression.kind === "jsonParse") {
    const text = context.emitValue(expression.text);
    let reviver: JsValue = { lines: [], value: jsValueUndefined };
    if (expression.reviver !== undefined) {
      reviver = context.emitValue(expression.reviver);
    }
    const call = emitGeneratedJsCall("jsonParse", [`i64 ${text.value}`, `i64 ${reviver.value}`], context);
    return {
      lines: [
        ...text.lines,
        emitRootStackPush(text.value, context),
        ...reviver.lines,
        emitRootStackPush(reviver.value, context),
        ...call.lines
      ],
      value: call.value
    };
  }

  if (expression.kind === "jsonStringify") {
    const source = context.emitValue(expression.value);
    const lines = [...source.lines, emitRootStackPush(source.value, context)];
    let filter = "null";
    if (expression.replacerName !== undefined) {
      const filterArray = emitRuntimeArrayPointer(expression.replacerName, context);
      lines.push(...filterArray.lines);
      filter = filterArray.value;
    }
    const call = emitGeneratedJsCall("jsonStringify", [`i64 ${source.value}`, `ptr ${filter}`, `i64 ${expression.indent}`], context);
    lines.push(...call.lines);
    return { lines, value: call.value };
  }

  if (expression.kind === "runtimeMapGet") {
    const collection = emitRuntimeCollectionPointer(expression.mapName, context);
    const key = context.emitValue(expression.key);
    const value = `%value.${context.numIndex}`;
    context.numIndex += 1;
    return { lines: [...collection.lines, ...key.lines, `  ${value} = call i64 @collectionGet(ptr ${collection.value}, i64 ${key.value})`], value };
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

  if (expression.kind === "void") {
    const inner = context.emitValue(expression.expression);
    return { lines: inner.lines, value: jsValueUndefined };
  }

  if (expression.kind === "sequence") {
    const left = context.emitValue(expression.left);
    const right = context.emitValue(expression.right);
    return { lines: [...left.lines, ...right.lines], value: right.value };
  }

  if (expression.kind === "stringStartsWith" || expression.kind === "stringEndsWith") {
    const receiver = context.emitStringExpression(expression.receiver);
    const search = context.emitStringExpression(expression.search);
    let helper: "stringStartsWith" | "stringStartsWithAt" | "stringEndsWith" = "stringEndsWith";
    if (expression.kind === "stringStartsWith") {
      helper = "stringStartsWith";
    }
    if (expression.position !== undefined && expression.kind === "stringStartsWith") {
      helper = "stringStartsWithAt";
    }
    const cmp = context.cmpIndex;
    context.cmpIndex += 1;
    const name = `%cmp.${cmp}`;
    const value = `%value.${context.numIndex}`;
    context.numIndex += 1;
    const positionLines: string[] = [];
    let callArgs = `i64 ${receiver.length}, ptr ${receiver.value}, i64 ${search.length}, ptr ${search.value}`;
    if (expression.position !== undefined) {
      const positionValue = emitArrayIndex(expression.position, context);
      positionLines.push(...positionValue.lines);
      callArgs = `${callArgs}, i64 ${positionValue.value}`;
    }
    return {
      lines: [...receiver.lines, ...search.lines, ...positionLines, `  ${name} = call i1 @${helper}(${callArgs})`, `  ${value} = select i1 ${name}, i64 ${jsValueTrue}, i64 ${jsValueFalse}`],
      value
    };
  }

  if (expression.kind === "stringCharCodeAt" || expression.kind === "stringCodePointAt" || expression.kind === "stringLocaleCompare") {
    const receiver = context.emitStringExpression(expression.receiver);
    const index = emitArrayIndex(expression.index, context);
    const doubleValue = `%num.${context.numIndex}`;
    context.numIndex += 1;
    const value = `%value.${context.numIndex}`;
    context.numIndex += 1;
    const lines: string[] = [
      ...receiver.lines,
      ...index.lines,
      `  ${doubleValue} = call double @stringCharCodeAt(i64 ${receiver.length}, ptr ${receiver.value}, i64 ${index.value})`,
      `  ${value} = call i64 @valueBoxNumber(double ${doubleValue})`
    ];
    return { lines, value };
  }

  if (expression.kind === "stringIndexOf" || expression.kind === "stringLastIndexOf") {
    const receiver = context.emitStringExpression(expression.receiver);
    const search = context.emitStringExpression(expression.search);
    const doubleValue = `%num.${context.numIndex}`;
    context.numIndex += 1;
    const value = `%value.${context.numIndex}`;
    context.numIndex += 1;
    if (expression.kind === "stringLastIndexOf") {
      return {
        lines: [
          ...receiver.lines,
          ...search.lines,
          `  ${doubleValue} = call double @stringLastIndexOf(i64 ${receiver.length}, ptr ${receiver.value}, i64 ${search.length}, ptr ${search.value})`,
          `  ${value} = call i64 @valueBoxNumber(double ${doubleValue})`
        ],
        value
      };
    }
    const position = emitStringIndexArgument(expression.position ?? { kind: "literal", value: 0 }, context);
    return {
      lines: [
        ...receiver.lines,
        ...search.lines,
        ...position.lines,
        `  ${doubleValue} = call double @stringIndexOf(i64 ${receiver.length}, ptr ${receiver.value}, i64 ${search.length}, ptr ${search.value}, i64 ${position.value})`,
        `  ${value} = call i64 @valueBoxNumber(double ${doubleValue})`
      ],
      value
    };
  }

  if (expression.kind === "runtimeArrayValue") {
    const lines: string[] = [];
    const values = expression.elements.map((element) => context.emitValue(element));
    for (const value of values) {
      lines.push(...value.lines);
    }
    const { arrayIndex } = context;
    context.arrayIndex += 1;
    const arrayName = `%rest.array.${arrayIndex}`;
    const lengthValue = expression.elements.length;
    lines.push(`  ${arrayName} = call ptr @arrayNew(i64 ${lengthValue})`);
    for (let i = 0; i < values.length; i++) {
      lines.push(`  call void @arraySet(ptr ${arrayName}, i64 ${i}, i64 ${values[i].value})`);
    }
    const boxIndex = context.numIndex;
    context.numIndex += 1;
    const boxName = `%value.${boxIndex}`;
    lines.push(`  ${boxName} = call i64 @valueBoxArray(ptr ${arrayName})`);
    return { lines, value: boxName };
  }

  if (expression.kind === "boxedPrimitive") {
    const lines: string[] = [];
    const inner = context.emitValue(expression.inner);
    lines.push(...inner.lines);
    const { objectIndex } = context;
    context.objectIndex += 1;
    const objectName = `%boxed.object.${objectIndex}`;
    let capacity = 1;
    if (expression.storeLength === true) {
      capacity = 2;
    }
    lines.push(`  ${objectName} = call ptr @objectNew(i64 ${capacity})`);
    const primitiveKey = "primitive";
    const primitiveKeyLen = primitiveKey.length;
    const keyString = addStringConstant(primitiveKey, context);
    lines.push(`  call void @objectSet(ptr ${objectName}, i64 ${primitiveKeyLen}, ptr ${keyString}, i64 ${inner.value})`);
    if (expression.storeLength === true) {
      const lengthKey = "length";
      const lengthKeyLen = lengthKey.length;
      const lengthKeyString = addStringConstant(lengthKey, context);
      const lengthIndex = context.numIndex;
      context.numIndex += 1;
      const lengthValue = `%value.${lengthIndex}`;
      lines.push(`  ${lengthValue} = call i64 @valueStringLength(i64 ${inner.value})`);
      lines.push(`  call void @objectSet(ptr ${objectName}, i64 ${lengthKeyLen}, ptr ${lengthKeyString}, i64 ${lengthValue})`);
    }
    const valueIndex = context.numIndex;
    context.numIndex += 1;
    const value = `%value.${valueIndex}`;
    lines.push(`  ${value} = call i64 @valueBoxObject(ptr ${objectName})`);
    return { lines, value };
  }

  if (expression.kind === "boxedMethodCall") {
    const lines: string[] = [];
    const receiver = context.emitValue(expression.receiver);
    lines.push(...receiver.lines);
    const { objectIndex } = context;
    context.objectIndex += 1;
    const objectPtr = `%boxed.object.ptr.${objectIndex}`;
    lines.push(`  ${objectPtr} = call ptr @valueObjectPtr(i64 ${receiver.value})`);
    if (expression.method === "valueOf") {
      const valueIndex = context.numIndex;
      context.numIndex += 1;
      const value = `%value.${valueIndex}`;
      lines.push(`  ${value} = call i64 @boxedValueOf(ptr ${objectPtr})`);
      return { lines, value };
    }
    const { stringIndex } = context;
    context.stringIndex += 1;
    const raw = `%str.result.${stringIndex}`;
    const ptrValue = `%str.${stringIndex}`;
    const length = `%str.len.${stringIndex}`;
    lines.push(`  ${raw} = call { ptr, i64 } @boxedToString(ptr ${objectPtr})`);
    lines.push(`  ${ptrValue} = extractvalue { ptr, i64 } ${raw}, 0`);
    lines.push(`  ${length} = extractvalue { ptr, i64 } ${raw}, 1`);
    const allocIndex = context.numIndex;
    context.numIndex += 1;
    const allocPtr = `%str.alloc.${allocIndex}`;
    const totalIndex = context.numIndex;
    context.numIndex += 1;
    const totalLen = `%str.total.${totalIndex}`;
    lines.push(`  ${totalLen} = add i64 ${length}, 1`);
    lines.push(`  ${allocPtr} = call ptr @malloc(i64 ${totalLen})`);
    lines.push(`  call ptr @memcpy(ptr ${allocPtr}, ptr ${ptrValue}, i64 ${length})`);
    const nulIndex = context.numIndex;
    context.numIndex += 1;
    const nulPos = `%str.nul.${nulIndex}`;
    lines.push(`  ${nulPos} = getelementptr i8, ptr ${allocPtr}, i64 ${length}`);
    lines.push(`  store i8 0, ptr ${nulPos}`);
    const boxIndex = context.numIndex;
    context.numIndex += 1;
    const boxValue = `%value.${boxIndex}`;
    lines.push(`  ${boxValue} = call i64 @valueBoxString(ptr ${allocPtr}, i64 ${length})`);
    lines.push(emitRootStackPush(boxValue, context));
    return { lines, value: boxValue };
  }

  if (expression.kind === "taggedTemplateValue") {
    const lines: string[] = [];
    const { arrayIndex } = context;
    context.arrayIndex += 1;
    const stringsArray = `%strings.array.${arrayIndex}`;
    const totalStrings = expression.middleTexts.length + 1;
    lines.push(`  ${stringsArray} = call ptr @arrayNew(i64 ${totalStrings})`);
    const headString = addStringConstant(expression.head, context);
    const headLength = String(utf8ByteLength(expression.head));
    const headBoxIndex = context.numIndex;
    context.numIndex += 1;
    const headBox = `%value.${headBoxIndex}`;
    lines.push(`  ${headBox} = call i64 @valueBoxString(ptr ${headString}, i64 ${headLength})`);
    lines.push(emitRootStackPush(headBox, context));
    lines.push(`  call void @arraySet(ptr ${stringsArray}, i64 0, i64 ${headBox})`);
    for (let i = 0; i < expression.middleTexts.length; i++) {
      const text = expression.middleTexts[i];
      const textString = addStringConstant(text, context);
      const textLength = String(utf8ByteLength(text));
      const textBoxIndex = context.numIndex;
      context.numIndex += 1;
      const textBox = `%value.${textBoxIndex}`;
      lines.push(`  ${textBox} = call i64 @valueBoxString(ptr ${textString}, i64 ${textLength})`);
      lines.push(emitRootStackPush(textBox, context));
      lines.push(`  call void @arraySet(ptr ${stringsArray}, i64 ${i + 1}, i64 ${textBox})`);
    }
    const stringsBoxIndex = context.numIndex;
    context.numIndex += 1;
    const stringsBox = `%value.${stringsBoxIndex}`;
    lines.push(`  ${stringsBox} = call i64 @valueBoxArray(ptr ${stringsArray})`);
    lines.push(emitRootStackPush(stringsBox, context));
    const expressionValues = expression.expressions.map((expr) => context.emitValue(expr));
    for (const value of expressionValues) {
      lines.push(...value.lines);
    }
    const valueArgs: string[] = [];
    if (expression.wrapValuesInRest === true) {
      const restArrayIndex = context.arrayIndex;
      context.arrayIndex += 1;
      const restArray = `%rest.array.${restArrayIndex}`;
      const restLength = expressionValues.length;
      lines.push(`  ${restArray} = call ptr @arrayNew(i64 ${restLength})`);
      for (let i = 0; i < expressionValues.length; i++) {
        lines.push(`  call void @arraySet(ptr ${restArray}, i64 ${i}, i64 ${expressionValues[i].value})`);
      }
      const restBoxIndex = context.numIndex;
      context.numIndex += 1;
      const restBox = `%value.${restBoxIndex}`;
      lines.push(`  ${restBox} = call i64 @valueBoxArray(ptr ${restArray})`);
      lines.push(emitRootStackPush(restBox, context));
      valueArgs.push(restBox);
    } else {
      for (const value of expressionValues) {
        valueArgs.push(value.value);
      }
    }
    const callArgs = [`i64 ${stringsBox}`, ...valueArgs.map((arg) => `i64 ${arg}`)];
    const generated = emitGeneratedJsCall(expression.tag, callArgs, context);
    lines.push(...generated.lines);
    return { lines, value: generated.value };
  }

  if (expression.kind === "arrayFind") {
    const array = emitRuntimeArrayPointer(expression.arrayName, context);
    const value = `%value.${context.numIndex}`;
    context.numIndex += 1;
    return { lines: [...array.lines, `  ${value} = call i64 @arrayFind(ptr ${array.value})`], value };
  }

  if (expression.kind === "arrayForEach") {
    return { lines: [], value: jsValueUndefined };
  }

  if (expression.kind === "objectRef") {
    const object = emitRuntimeObjectPointer(expression.name, context);
    const value = `%value.${context.numIndex}`;
    context.numIndex += 1;
    return { lines: [...object.lines, `  ${value} = call i64 @valueBoxObject(ptr ${object.value})`], value };
  }

  if (expression.kind === "objectLiteralValue") {
    const pointerName = `%obj.value.${context.objectIndex}.addr`;
    const lines = emitRuntimeObjectLiteralStorage(pointerName, expression.value, context);
    const object = `%obj.value.${context.objectIndex}.ptr`;
    const value = `%value.${context.numIndex}`;
    context.numIndex += 1;
    return { lines: [...lines, `  ${object} = load ptr, ptr ${pointerName}`, `  ${value} = call i64 @valueBoxObject(ptr ${object})`], value };
  }

  if (expression.kind === "arrayRef") {
    const array = emitRuntimeArrayPointer(expression.name, context);
    const value = `%value.${context.numIndex}`;
    context.numIndex += 1;
    return { lines: [...array.lines, `  ${value} = call i64 @valueBoxArray(ptr ${array.value})`], value };
  }

  // Defensive: the lowering pass is the closed-world producer, and this tier handles the subset
  // that reaches it. The residual is not `never` because the expression tiers partition the union
  // across declining sub-dispatchers, so this cannot be a compile-time check. The one
  // exhaustiveness point the type system does enforce over operations is jsIrOperationChildren
  // (see ir.ts). emitOperation still ends in `return []`, so an unhandled kind emits nothing;
  // that gap is written up in AGENTS.md under no-open-union-narrowing.
  throw new Error(`Unhandled JsIrValueExpression variant: ${expression.kind}`);
}


















// eslint-disable-next-line max-statements -- Dynamic calls materialize fixed and iterable spread arguments into one argv state machine.
function emitValueCallExpression(
  expression: Extract<JsIrValueExpression, { readonly kind: "callValue" }>,
  context: EmitContext
): JsValue {
  let callee = context.emitValue(expression.callee);
  const args = context.emitCallArguments(expression.arguments);
  let thisValue: JsValue = { lines: [], value: jsValueUndefined };
  if (expression.methodReceiver !== undefined && expression.methodKey !== undefined) {
    const receiver = context.emitValue(expression.methodReceiver);
    const key = context.emitStringExpression(expression.methodKey);
    const value = `%call.method.${context.callIndex}`;
    callee = {
      lines: [
        ...receiver.lines,
        `  call void @gcRootPush(i64 ${receiver.value})`,
        ...key.lines,
        `  ${value} = call i64 @valuePropertyGet(i64 ${receiver.value}, i64 ${key.length}, ptr ${key.value})`
      ],
      value
    };
    thisValue = { lines: [], value: receiver.value };
  } else if (expression.thisValue !== undefined) {
    thisValue = context.emitValue(expression.thisValue);
  }
  if (expression.spreadArguments !== undefined) {
    const index = context.callIndex;
    context.callIndex += 1;
    const argumentArray = `%call.spread.array.${index}`;
    const boxedArguments = `%call.spread.boxed.${index}`;
    const body = [
      `  call void @gcRootPush(i64 ${callee.value})`,
      ...thisValue.lines,
      `  call void @gcRootPush(i64 ${thisValue.value})`,
      `  ${argumentArray} = call ptr @arrayNew(i64 0)`,
      `  ${boxedArguments} = call i64 @valueBoxArray(ptr ${argumentArray})`,
      `  call void @gcRootPush(i64 ${boxedArguments})`
    ];
    const lines = body;
    for (let argumentIndex = 0; argumentIndex < expression.spreadArguments.length; argumentIndex += 1) {
      const argument = expression.spreadArguments[argumentIndex];
      // The loop bound guarantees this index; the guard keeps the argument non-optional so the
      // `kind` narrowing below stays total.
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- live once noUncheckedIndexedAccess is enabled
      if (argument === undefined) {
        throw new Error(`Call spread argument ${argumentIndex} is missing`);
      }
      if (argument.kind === "value") {
        const value = context.emitValue(argument.value);
        lines.push(...value.lines, `  call void @gcRootPush(i64 ${value.value})`, `  call i64 @arrayPush(ptr ${argumentArray}, i64 ${value.value})`);
      } else if (argument.kind === "iterableSpread") {
        lines.push(...emitIterableAppend(argument.source, argument.notIterableMessage, argumentArray, `call.${index}.${argumentIndex}`, context));
      } else if (argument.kind === "spread") {
        if (argument.sourceKind === "fixed") {
          const binding = context.bindings.get(argument.arrayName);
          if (binding?.kind !== "array") {
            throw new Error("Expected fixed call-spread array binding");
          }
          for (let spreadIndex = 0; spreadIndex < binding.length; spreadIndex += 1) {
            const value = context.emitValue({
              kind: "number",
              value: { kind: "arrayAccess", arrayName: argument.arrayName, index: { kind: "literal", value: spreadIndex } }
            });
            lines.push(...value.lines, `  call i64 @arrayPush(ptr ${argumentArray}, i64 ${value.value})`);
          }
          continue;
        }
        const source = emitRuntimeArrayPointer(argument.arrayName, context);
        const boxed = `%call.spread.source.${index}.${argumentIndex}`;
        lines.push(
          ...source.lines,
          `  ${boxed} = call i64 @valueBoxArray(ptr ${source.value})`,
          ...emitIterableAppend({ kind: "arrayRef", name: argument.arrayName }, `${argument.arrayName} is not iterable`, argumentArray, `call.${index}.${argumentIndex}`, context)
        );
      } else {
        lines.push(`  call i64 @arrayPush(ptr ${argumentArray}, i64 ${jsValueUndefined})`);
      }
    }
    const argc = `%call.spread.argc.${index}`;
    const argv = `%call.spread.argv.${index}`;
    const positionSlot = `%call.spread.position.${index}.addr`;
    const condLabel = `call.spread.copy.cond.${index}`;
    const bodyLabel = `call.spread.copy.body.${index}`;
    const endLabel = `call.spread.copy.end.${index}`;
    const position = `%call.spread.position.${index}`;
    const inRange = `%call.spread.in.range.${index}`;
    const value = `%call.spread.value.${index}`;
    const slot = `%call.spread.slot.${index}`;
    const next = `%call.spread.next.${index}`;
    lines.push(
      `  ${argc} = call i64 @arrayLength(ptr ${argumentArray})`,
      `  ${argv} = alloca i64, i64 ${argc}`,
      `  ${positionSlot} = alloca i64`,
      `  store i64 0, ptr ${positionSlot}`,
      `  br label %${condLabel}`,
      `${condLabel}:`,
      `  ${position} = load i64, ptr ${positionSlot}`,
      `  ${inRange} = icmp ult i64 ${position}, ${argc}`,
      `  br i1 ${inRange}, label %${bodyLabel}, label %${endLabel}`,
      `${bodyLabel}:`,
      `  ${value} = call i64 @arrayGet(ptr ${argumentArray}, i64 ${position})`,
      `  ${slot} = getelementptr i64, ptr ${argv}, i64 ${position}`,
      `  store i64 ${value}, ptr ${slot}`,
      `  ${next} = add i64 ${position}, 1`,
      `  store i64 ${next}, ptr ${positionSlot}`,
      `  br label %${condLabel}`,
      `${endLabel}:`
    );
    const generated = emitGeneratedJsCall(
      "jsCall",
      [`i64 ${callee.value}`, `i64 ${argc}`, `ptr ${argv}`, `i64 ${thisValue.value}`],
      context
    );
    lines.push(...generated.lines);
    return emitDispatchedCall(callee.lines, callee.value, lines, generated.value, expression, context);
  }
  const index = context.callIndex;
  context.callIndex += 1;
  const argv = `%call.value.argv.${index}`;
  const lines = [`  call void @gcRootPush(i64 ${callee.value})`, ...thisValue.lines, `  call void @gcRootPush(i64 ${thisValue.value})`, ...args.lines, `  ${argv} = alloca i64, i64 ${args.values.length}`];
  for (let argumentIndex = 0; argumentIndex < args.values.length; argumentIndex += 1) {
    const value = args.values[argumentIndex].replace(/^i64 /, "");
    const slot = `%call.value.argv.${index}.${argumentIndex}`;
    lines.push(`  call void @gcRootPush(i64 ${value})`, `  ${slot} = getelementptr i64, ptr ${argv}, i64 ${argumentIndex}`, `  store i64 ${value}, ptr ${slot}`);
  }
  const generated = emitGeneratedJsCall(
    "jsCall",
    [`i64 ${callee.value}`, `i64 ${args.values.length}`, `ptr ${argv}`, `i64 ${thisValue.value}`],
    context
  );
  lines.push(...generated.lines);
  return emitDispatchedCall(callee.lines, callee.value, lines, generated.value, expression, context);
}

// Joins the unconditional callee prologue to the argv-building dispatch. ECMAScript's optional
// call `callee?.(...)` still evaluates the callee, so the nullish test sits between the two: a
// nullish callee yields `undefined` without building an argv or reaching `jsCall`, which
// otherwise dereferenced the null pointer behind a non-function value.
function emitDispatchedCall(
  prologue: readonly string[],
  callee: string,
  body: readonly string[],
  result: string,
  expression: { readonly optionalCallee?: true },
  context: EmitContext
): JsValue {
  if (expression.optionalCallee !== true) {
    return { lines: [...prologue, ...body], value: result };
  }
  const index = context.logicIndex;
  context.logicIndex += 1;
  const testLabel = `optional.call.test.${index}`;
  const bodyLabel = `optional.call.body.${index}`;
  const skipLabel = `optional.call.skip.${index}`;
  const joinLabel = `optional.call.join.${index}`;
  const endLabel = `optional.call.end.${index}`;
  const nullish = emitNullishTest(callee, context);
  const value = `%value.${context.numIndex}`;
  context.numIndex += 1;
  return {
    lines: [
      ...prologue,
      `  br label %${testLabel}`,
      `${testLabel}:`,
      ...nullish.lines,
      `  br i1 ${nullish.value}, label %${skipLabel}, label %${bodyLabel}`,
      `${bodyLabel}:`,
      ...body,
      `  br label %${joinLabel}`,
      `${joinLabel}:`,
      `  br label %${endLabel}`,
      `${skipLabel}:`,
      `  br label %${endLabel}`,
      `${endLabel}:`,
      `  ${value} = phi i64 [ ${jsValueUndefined}, %${skipLabel} ], [ ${result}, %${joinLabel} ]`
    ],
    value
  };
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
    const key = context.emitStringExpression(expression.key);
    // Non-index keys (e.g. Symbol.iterator sentinel) use valuePropertyGet so
    // built-in iterator method thunks resolve. Numeric indices keep arrayGetWithKey.
    const isNonIndexKey = expression.index.kind === "literal" && expression.index.value < 0;
    if (isNonIndexKey) {
      const boxed = `%value.arr.box.${valueIndex}`;
      return {
        lines: [
          ...array.lines,
          ...index.lines,
          ...key.lines,
          `  ${boxed} = call i64 @valueBoxArray(ptr ${array.value})`,
          `  ${value} = call i64 @valuePropertyGet(i64 ${boxed}, i64 ${key.length}, ptr ${key.value})`
        ],
        value
      };
    }
    return {
      lines: [...array.lines, ...index.lines, ...key.lines, `  ${value} = call i64 @arrayGetWithKey(ptr ${array.value}, i64 ${index.value}, i64 ${key.length}, ptr ${key.value})`],
      value
    };
  }
  return { lines: [...array.lines, ...index.lines, `  ${value} = call i64 @arrayGet(ptr ${array.value}, i64 ${index.value})`], value };
}































// Emits a private field read: the class-mangled key must be an own property of
// the receiver (the brand), otherwise a TypeError is thrown.
function emitPrivateFieldAccessExpression(
  expression: Extract<JsIrValueExpression, { readonly kind: "privateFieldAccess" }>,
  context: EmitContext
): JsValue {
  const receiver = context.emitValue(expression.receiver);
  const keyConstant = addStringConstant(expression.key, context);
  const keyLength = utf8ByteLength(expression.key);
  const index = context.numIndex;
  context.numIndex += 1;
  const has = `%priv.has.${index}`;
  const value = `%value.${index}`;
  const okLabel = `priv.ok.${index}`;
  const throwLabel = `priv.throw.${index}`;
  return {
    lines: [
      ...receiver.lines,
      `  ${has} = call i1 @valueObjectHasOwn(i64 ${receiver.value}, i64 ${keyLength}, ptr ${keyConstant})`,
      `  br i1 ${has}, label %${okLabel}, label %${throwLabel}`,
      `${throwLabel}:`,
      ...emitPrivateFieldBrandThrow(expression.message, `priv.read.${index}`, context),
      `${okLabel}:`,
      `  ${value} = call i64 @valueObjectGet(i64 ${receiver.value}, i64 ${keyLength}, ptr ${keyConstant})`
    ],
    value
  };
}

function emitValueArrayValueExpression(
  expression: Extract<JsIrValueExpression, { readonly kind: "valueArrayAccess" }>,
  context: EmitContext
): JsValue {
  const receiver = context.emitValue(expression.value);
  const index = emitArrayIndex(expression.index, context);
  const key = context.emitStringExpression(expression.key);
  const valueIndex = context.numIndex;
  context.numIndex += 1;
  const value = `%value.${valueIndex}`;
  // Prefer valuePropertyGet for named keys so built-in iterator methods resolve.
  // Numeric index access still uses valueArrayGet for correct hole/index semantics.
  if (expression.index.kind === "literal" && expression.index.value < 0) {
    return {
      lines: [...receiver.lines, ...index.lines, ...key.lines, `  ${value} = call i64 @valuePropertyGet(i64 ${receiver.value}, i64 ${key.length}, ptr ${key.value})`],
      value
    };
  }
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









function emitBooleanValueExpression(expression: Extract<JsIrValueExpression, { readonly kind: "boolean" }>, context: EmitContext): JsValue {
  const condition = context.emitCondition(expression.value);
  const index = context.numIndex;
  context.numIndex += 1;
  const value = `%value.${index}`;
  return { lines: [...condition.lines, `  ${value} = select i1 ${condition.value}, i64 ${jsValueTrue}, i64 ${jsValueFalse}`], value };
}

function emitStringValueExpression(expression: Extract<JsIrValueExpression, { readonly kind: "string" }>, context: EmitContext): JsValue {
  const string = context.emitStringExpression(expression.value);
  const index = context.numIndex;
  context.numIndex += 1;
  const value = `%value.${index}`;
  return {
    lines: [
      ...string.lines,
      `  ${value} = call i64 @valueBoxString(ptr ${string.value}, i64 ${string.length})`,
      emitRootStackPush(value, context)
    ],
    value
  };
}





















function emitTernaryValueExpression(
  expression: Extract<JsIrValueExpression, { readonly kind: "ternary" }>,
  context: EmitContext
): JsValue {
  const condition = context.emitCondition(expression.condition);
  const consequent = context.emitValue(expression.consequent);
  const alternate = context.emitValue(expression.alternate);
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

function emitLazyDefaultValueExpression(
  expression: Extract<JsIrValueExpression, { readonly kind: "lazyDefault" }>,
  context: EmitContext
): JsValue {
  const index = context.logicIndex;
  context.logicIndex += 1;
  const checkLabel = `default.check.${index}`;
  const defaultLabel = `default.value.${index}`;
  const defaultJoinLabel = `default.join.${index}`;
  const endLabel = `default.end.${index}`;
  const current = context.emitValue(expression.value);
  const fallback = context.emitValue(expression.defaultValue);
  const isUndefined = `%cmp.${context.cmpIndex}`;
  context.cmpIndex += 1;
  const value = `%value.${context.numIndex}`;
  context.numIndex += 1;
  return {
    lines: [
      ...current.lines,
      `  br label %${checkLabel}`,
      `${checkLabel}:`,
      `  ${isUndefined} = icmp eq i64 ${current.value}, ${jsValueUndefined}`,
      `  br i1 ${isUndefined}, label %${defaultLabel}, label %${endLabel}`,
      `${defaultLabel}:`,
      ...fallback.lines,
      `  br label %${defaultJoinLabel}`,
      `${defaultJoinLabel}:`,
      `  br label %${endLabel}`,
      `${endLabel}:`,
      `  ${value} = phi i64 [ ${current.value}, %${checkLabel} ], [ ${fallback.value}, %${defaultJoinLabel} ]`
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
  const left = context.emitValue(expression.left);
  const leftTruthy = `%cmp.${context.cmpIndex}`;
  context.cmpIndex += 1;
  const right = context.emitValue(expression.right);
  const value = `%value.${context.numIndex}`;
  context.numIndex += 1;
  let leftTrueLabel = endLabel;
  let leftFalseLabel = rhsLabel;
  if (expression.operator === "&&") {
    leftTrueLabel = rhsLabel;
    leftFalseLabel = endLabel;
  }
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
  const left = context.emitValue(expression.left);
  const nullish = emitNullishTest(left.value, context);
  const right = context.emitValue(expression.right);
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
  const guard = context.emitValue(expression.guard);
  const nullish = emitNullishTest(guard.value, context);
  context.optionalTargets.push(guard.value);
  const access = context.emitValue(expression.access);
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



















































































































































































































































































































































































































































































































































































































































// Array binding consumes the iterator protocol, including lazy defaults, nested
// patterns, rest collection, and IteratorClose for binding-time failures.
// eslint-disable-next-line complexity, max-statements -- The protocol state machine is intentionally emitted in one place.
function emitArrayDestructureProtocolOperation(
  operation: Extract<JsIrOperation, { readonly kind: "arrayDestructureProtocol" }>,
  context: EmitContext
): string[] {
  const index = context.arrayIndex;
  context.arrayIndex += 1;
  const normalLabel = `destructure.proto.normal.${index}`;
  const endLabel = `destructure.proto.end.${index}`;
  const iteratorSlot = `%destructure.proto.iter.${index}.addr`;
  const doneSlot = `%destructure.proto.done.${index}.addr`;

  let iteratorCall: JsValue;
  let setupLines: string[];
  if (operation.source.kind === "collection") {
    const collection = emitRuntimeCollectionPointer(operation.source.name, context);
    let sourceKind = 3;
    let iterationKind = 1;
    if (operation.source.sourceKind === "map") {
      sourceKind = 2;
      iterationKind = 2;
    }
    iteratorCall = emitGeneratedJsCall("getCollectionIterator", [`ptr ${collection.value}`, `i64 ${sourceKind}`, `i64 ${iterationKind}`], context);
    setupLines = [...collection.lines, ...iteratorCall.lines];
  } else {
    const iterable = context.emitValue(operation.source.value);
    const messageConstant = addStringConstant(operation.notIterableMessage, context);
    const message = `%destructure.proto.not.iterable.${index}`;
    iteratorCall = emitGeneratedJsCall("getIteratorValue", [`i64 ${iterable.value}`, `i64 ${message}`], context);
    setupLines = [
      ...iterable.lines,
      `  call void @gcRootPush(i64 ${iterable.value})`,
      `  ${message} = call i64 @valueBoxString(ptr ${messageConstant}, i64 ${utf8ByteLength(operation.notIterableMessage)})`,
      ...iteratorCall.lines
    ];
  }
  const doneKey = addStringConstant("done", context);
  const valueKey = addStringConstant("value", context);
  const lines = [
    ...setupLines,
    `  ${iteratorSlot} = alloca i64`,
    `  store i64 ${iteratorCall.value}, ptr ${iteratorSlot}`,
    `  call void @gcRootPush(i64 ${iteratorCall.value})`,
    `  ${doneSlot} = alloca i1`,
    `  store i1 false, ptr ${doneSlot}`
  ];

  for (const element of operation.elements) {
    if (element.kind === "binding") {
      lines.push(`  ${variablePointerName(element.name)} = alloca i64`);
      context.bindings.set(element.name, { kind: "valueVariable", name: element.name });
    } else if (element.kind === "rest") {
      lines.push(`  ${variablePointerName(element.name)} = alloca ptr`);
      context.bindings.set(element.name, { kind: "runtimeArray", name: element.name });
    } else if (element.kind === "nested") {
      lines.push(`  ${variablePointerName(element.temporaryName)} = alloca i64`);
      context.bindings.set(element.temporaryName, { kind: "valueVariable", name: element.temporaryName });
    }
  }
  if (operation.elements.length === 0) {
    return lines;
  }

  const closeFrame = createCleanupFrame(context, "iteratorClose", { iteratorSlot });
  context.cleanupStack.push(closeFrame);
  const outerException = context.exceptionTarget;

  for (let elementIndex = 0; elementIndex < operation.elements.length; elementIndex += 1) {
    const element = operation.elements[elementIndex];
    // The loop bound guarantees this index; the guard keeps the element non-optional so the
    // `kind` narrowing below stays total.
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- live once noUncheckedIndexedAccess is enabled
    if (element === undefined) {
      throw new Error(`Array destructure element ${elementIndex} is missing`);
    }
    if (element.kind === "rest") {
      const restArray = `%destructure.proto.rest.${index}.${elementIndex}`;
      const restBoxed = `%destructure.proto.rest.boxed.${index}.${elementIndex}`;
      const restCond = `destructure.proto.rest.cond.${index}.${elementIndex}`;
      const restCall = `destructure.proto.rest.call.${index}.${elementIndex}`;
      const restValue = `destructure.proto.rest.value.${index}.${elementIndex}`;
      const restDone = `destructure.proto.rest.done.${index}.${elementIndex}`;
      const iterator = `%destructure.proto.rest.iter.${index}.${elementIndex}`;
      const nextCall = emitGeneratedJsCall("callIteratorNext", [`i64 ${iterator}`], context);
      const doneValue = `%destructure.proto.rest.done.value.${index}.${elementIndex}`;
      const isDone = `%destructure.proto.rest.is.done.${index}.${elementIndex}`;
      const value = `%destructure.proto.rest.item.${index}.${elementIndex}`;
      const alreadyDone = `%destructure.proto.rest.already.done.${index}.${elementIndex}`;
      lines.push(
        `  ${restArray} = call ptr @arrayNew(i64 0)`,
        // Root the rest array across the consumption loop: the per-iteration
        // safepoint can collect while the raw pointer only lives in an alloca
        // (same shape as the iterable-spread destination rooting).
        `  ${restBoxed} = call i64 @valueBoxArray(ptr ${restArray})`,
        `  call void @gcRootPush(i64 ${restBoxed})`,
        `  store ptr ${restArray}, ptr ${variablePointerName(element.name)}`,
        `  br label %${restCond}`,
        `${restCond}:`,
        `  ${alreadyDone} = load i1, ptr ${doneSlot}`,
        `  br i1 ${alreadyDone}, label %${restDone}, label %${restCall}`,
        `${restCall}:`,
        `  ${iterator} = load i64, ptr ${iteratorSlot}`,
        ...nextCall.lines,
        `  ${doneValue} = call i64 @valueObjectGet(i64 ${nextCall.value}, i64 4, ptr ${doneKey})`,
        `  ${isDone} = call i1 @valueTruthy(i64 ${doneValue})`,
        `  br i1 ${isDone}, label %${restDone}, label %${restValue}`,
        `${restValue}:`,
        `  ${value} = call i64 @valueObjectGet(i64 ${nextCall.value}, i64 5, ptr ${valueKey})`,
        `  call void @gcRootPush(i64 ${value})`,
        `  call i64 @arrayPush(ptr ${restArray}, i64 ${value})`,
        `  call void @gcSafepoint()`,
        `  br label %${restCond}`,
        `${restDone}:`,
        `  store i1 true, ptr ${doneSlot}`
      );
      continue;
    }

    const checkLabel = `destructure.proto.check.${index}.${elementIndex}`;
    const callLabel = `destructure.proto.call.${index}.${elementIndex}`;
    const yieldedLabel = `destructure.proto.yielded.${index}.${elementIndex}`;
    const exhaustedLabel = `destructure.proto.exhausted.${index}.${elementIndex}`;
    const bindLabel = `destructure.proto.bind.${index}.${elementIndex}`;
    const incomingSlot = `%destructure.proto.incoming.${index}.${elementIndex}.addr`;
    const iterator = `%destructure.proto.iter.${index}.${elementIndex}`;
    const alreadyDone = `%destructure.proto.already.done.${index}.${elementIndex}`;
    const nextCall = emitGeneratedJsCall("callIteratorNext", [`i64 ${iterator}`], context);
    const doneValue = `%destructure.proto.done.value.${index}.${elementIndex}`;
    const isDone = `%destructure.proto.is.done.${index}.${elementIndex}`;
    lines.push(
      `  ${incomingSlot} = alloca i64`,
      `  br label %${checkLabel}`,
      `${checkLabel}:`,
      `  ${alreadyDone} = load i1, ptr ${doneSlot}`,
      `  br i1 ${alreadyDone}, label %${exhaustedLabel}, label %${callLabel}`,
      `${callLabel}:`,
      `  ${iterator} = load i64, ptr ${iteratorSlot}`,
      ...nextCall.lines,
      `  ${doneValue} = call i64 @valueObjectGet(i64 ${nextCall.value}, i64 4, ptr ${doneKey})`,
      `  ${isDone} = call i1 @valueTruthy(i64 ${doneValue})`,
      `  br i1 ${isDone}, label %${exhaustedLabel}, label %${yieldedLabel}`,
      `${yieldedLabel}:`
    );
    const yieldedValue = `%destructure.proto.item.${index}.${elementIndex}`;
    lines.push(
      `  ${yieldedValue} = call i64 @valueObjectGet(i64 ${nextCall.value}, i64 5, ptr ${valueKey})`,
      `  store i64 ${yieldedValue}, ptr ${incomingSlot}`,
      `  br label %${bindLabel}`,
      `${exhaustedLabel}:`,
      `  store i1 true, ptr ${doneSlot}`,
      `  store i64 ${jsValueUndefined}, ptr ${incomingSlot}`,
      `  br label %${bindLabel}`,
      `${bindLabel}:`
    );
    if (element.kind === "elision") {
      continue;
    }
    const incoming = `%destructure.proto.incoming.${index}.${elementIndex}`;
    lines.push(`  ${incoming} = load i64, ptr ${incomingSlot}`, `  call void @gcRootPush(i64 ${incoming})`);
    if (element.kind === "binding") {
      if (element.defaultValue === undefined) {
        lines.push(`  store i64 ${incoming}, ptr ${variablePointerName(element.name)}`);
      } else {
        const defaultLabel = `destructure.proto.default.${index}.${elementIndex}`;
        const storeLabel = `destructure.proto.store.${index}.${elementIndex}`;
        const useDefault = `%destructure.proto.use.default.${index}.${elementIndex}`;
        context.exceptionTarget = closeFrame.throwEntryLabel;
        const defaultValue = context.emitValue(element.defaultValue);
        context.exceptionTarget = outerException;
        lines.push(
          `  ${useDefault} = icmp eq i64 ${incoming}, ${jsValueUndefined}`,
          `  br i1 ${useDefault}, label %${defaultLabel}, label %${storeLabel}`,
          `${defaultLabel}:`,
          ...defaultValue.lines,
          `  store i64 ${defaultValue.value}, ptr ${variablePointerName(element.name)}`,
          `  br label %${storeLabel}.done`,
          `${storeLabel}:`,
          `  store i64 ${incoming}, ptr ${variablePointerName(element.name)}`,
          `  br label %${storeLabel}.done`,
          `${storeLabel}.done:`
        );
      }
    } else {
      lines.push(`  store i64 ${incoming}, ptr ${variablePointerName(element.temporaryName)}`);
      context.exceptionTarget = closeFrame.throwEntryLabel;
      lines.push(...context.emitOperations(element.operations));
      context.exceptionTarget = outerException;
    }
  }
  context.cleanupStack.pop();
  context.exceptionTarget = outerException;
  lines.push(
    `  br label %${normalLabel}`,
    `${closeFrame.entryLabel}:`,
    `  ${closeFrame.rootFrameName} = call i64 @gcRootSave()`,
    ...emitIteratorCloseBody(context, closeFrame),
    ...emitCleanupAfterBody(context, closeFrame),
    ...emitThrowEntryBlock(context, closeFrame),
    ...emitCleanupFinalDispatch(context, closeFrame),
    `${closeFrame.joinLabel}:`,
    "  unreachable",
    `${normalLabel}:`,
    `  br label %${endLabel}`,
    `${endLabel}:`
  );
  return lines;
}











































































































































































































































































































































































































































































































































































































































































































































function emitRuntimeArrayIncludesCondition(
  expression: Extract<JsIrValueExpression, { readonly kind: "arrayIncludes" }>,
  context: EmitContext
): NumberValue {
  const array = emitRuntimeArrayPointer(expression.arrayName, context);
  const value = context.emitValue(expression.value);
  const name = `%cmp.${context.cmpIndex}`;
  context.cmpIndex += 1;
  return { lines: [...array.lines, ...value.lines, `  ${name} = call i1 @arrayIncludes(ptr ${array.value}, i64 ${value.value})`], value: name };
}







































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































