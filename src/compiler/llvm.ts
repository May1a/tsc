import {
  type JsIrBindingValue,
  type JsIrCallArgument,
  type JsIrCondition,
  type JsIrExpression,
  type JsIrFunctionObjectDefinition,
  type JsIrFunctionParameter,
  type JsIrInlineCppBlock,
  type JsIrModule,
  type JsIrNumberExpression,
  type JsIrNumberOperator,
  type JsIrObjectValue,
  type JsIrOperation,
  type JsIrRuntimeArrayElement,
  type JsIrRuntimeObjectValue,
  type JsIrStringExpression,
  type JsIrSwitchClause,
  type JsIrValueExpression,
  type JsIrValueKind,
  aggregateBindingForOperation,
  visitJsIrOperations
} from "./ir.js";
import type { CompilerDiagnostic } from "./diagnostics.js";
import { type TraceMapV1, buildTraceMap, traceOperationId } from "./trace.js";
import {
  type RuntimeHelper,
  type RuntimeHelperEmitter,
  createRuntimeHelperEmitter,
  defineStructuredRuntimeHelpers,
  emitRuntimeDeclarations,
  emitRuntimeDefinitions,
  useRuntimeHelper
} from "./runtime-helpers.js";
import { jsValueAbi } from "./js-value-abi/index.js";
import { type LegacyLlvmTraceMarker, type RenderedLlvmModule, createLlvmModule } from "./llvm-ir/index.js";

/** Pending abrupt/normal completion kinds for finally / IteratorClose cleanup. */
const COMPLETION_NORMAL = 0;
const COMPLETION_RETURN = 1;
const COMPLETION_THROW = 2;
const COMPLETION_BREAK = 3;
const COMPLETION_CONTINUE = 4;

interface CleanupFrame {
  readonly index: number;
  readonly entryLabel: string;
  readonly finalDispatchLabel: string;
  readonly joinLabel: string;
  readonly throwEntryLabel: string;
  readonly rootFrameName: string;
  /** Entry label of the next outer cleanup frame, if any. */
  readonly outerEntryLabel?: string;
  /** Break/continue destinations resumed when this frame is the outermost cleanup. */
  readonly resumeDests: Map<number, string>;
  readonly kind: "finally" | "iteratorClose";
  /** Same-loop continue targets this label and must not run IteratorClose. */
  readonly skipContinueLabel?: string;
  iteratorSlot?: string;
}

interface CompletionSlots {
  readonly kind: string;
  readonly value: string;
  readonly destination: string;
  readonly until: string;
}

interface EmitContext {
  readonly bindings: Map<string, JsIrBindingValue>;
  readonly stringConstants: string[];
  readonly arrayGlobals: string[];
  readonly objectTypes: string[];
  readonly objectLayouts: Map<string, ObjectLayout>;
  readonly valueGlobals: Set<string>;
  readonly runtime: RuntimeHelperEmitter;
  readonly loopLabels: LoopLabels[];
  /** Innermost-to-outermost cleanup regions (finally / IteratorClose). */
  readonly cleanupStack: CleanupFrame[];
  /** Cleanup bodies currently being emitted, outermost first. */
  readonly activeCleanupBodies: CleanupFrame[];
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
  tryIndex: number;
  cleanupSeq: number;
  readonly optionalTargets: string[];
  exceptionTarget: string;
  exceptionSlot: string;
  // Pending completion slots (function-scoped); shared by all cleanup regions.
  readonly completionSlots: CompletionSlots;
  nextDestId: number;
  /** True when emitting @main rather than a generated JS function. */
  readonly isMain: boolean;
  /** Label for normal @main exit (ignored for generated functions). */
  readonly normalExitLabel?: string;
  // GC root protocol: the SSA name holding this function's saved root-stack depth
  // (from @gcRootSave at entry). Every ret/throw restores to this depth instead of
  // emitting a static number of pops, so the root stack stays balanced across loops,
  // branches, and multiple returns.
  gcFrameName: string;
  readonly traceMarkers: Map<string, Omit<LegacyLlvmTraceMarker, "line">>;
  readonly suppressTrace?: boolean;
}

type ObjectLayout = ObjectValue;

interface NumberValue {
  readonly lines: readonly string[];
  readonly value: string;
}

interface StringValue {
  readonly lines: readonly string[];
  readonly value: string;
  readonly length: string;
}

interface JsValue {
  readonly lines: readonly string[];
  readonly value: string;
}

interface ArrayValue {
  readonly name: string;
  readonly length: number;
  readonly storageKind: "global" | "stack";
}

interface RuntimeArrayValue {
  readonly pointerName: string;
}

interface ObjectValue {
  readonly typeName: string;
  readonly pointerName: string;
  readonly runtimePointerName?: string;
  readonly value: JsIrObjectValue;
}

interface RuntimeObjectValue {
  readonly pointerName: string;
}

interface LoopLabels {
  readonly breakLabel: string;
  readonly continueLabel?: string;
  /** cleanupStack.length when the loop was entered; cleanups at or above this depth run on break. */
  readonly cleanupDepth: number;
}

interface FunctionDef {
  readonly name: string;
  readonly parameters: readonly JsIrFunctionParameter[];
  readonly body: readonly JsIrOperation[];
  readonly outerBindings: Map<string, JsIrBindingValue>;
  readonly traceOperation?: JsIrOperation;
  readonly callingConvention?: "direct" | "functionObject";
  readonly usesDynamicThis?: boolean;
  readonly captures?: JsIrFunctionObjectDefinition["captures"];
  returnType: LlvmReturnType;
}

// Generated JavaScript functions use an explicit payload/status ABI. Most runtime
// helpers remain scalar; jsCall / getIteratorValue / callIteratorNext use the
// explicit value-or-exception aggregate return.
type LlvmReturnType = "aggregate";
const generatedReturnType = "{ i64, i1 }";

const doubleQuoteByte = 34;
const backslashByte = 92;
const firstPrintableAsciiByte = 32;
const lastPrintableAsciiByte = 126;
const hexadecimalRadix = 16;
const noLines = 0;
const legacyJsValue = jsValueAbi.forLegacyLlvm();
const jsValueUndefined = legacyJsValue.immediate("undefined");
const jsValueFalse = legacyJsValue.immediate("false");
const jsValueTrue = legacyJsValue.immediate("true");
const jsValueNull = legacyJsValue.immediate("null");
const descriptorWritableFlag = 1;
const descriptorEnumerableFlag = 2;
const descriptorConfigurableFlag = 4;

function createMainEmitContext(): EmitContext {
  return {
    bindings: new Map(),
    stringConstants: [],
    arrayGlobals: [],
    objectTypes: [],
    objectLayouts: new Map(),
    valueGlobals: new Set(),
    runtime: createRuntimeHelperEmitter(),
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
}

function createFunctionEmitContext(fn: FunctionDef, parent: EmitContext): EmitContext {
  return {
    bindings: new Map(fn.outerBindings),
    stringConstants: parent.stringConstants,
    arrayGlobals: parent.arrayGlobals,
    objectTypes: parent.objectTypes,
    objectLayouts: new Map(parent.objectLayouts),
    valueGlobals: parent.valueGlobals,
    runtime: parent.runtime,
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
}

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

function emitInlineCppDeclarations(blocks: readonly JsIrInlineCppBlock[]): string[] {
  return blocks.map((block) => `declare i64 @${block.symbol}()`);
}

function emitInlineCppFunction(block: JsIrInlineCppBlock): string {
  return `extern "C" std::uint64_t ${block.symbol}() {
${block.code}
}
`;
}

export const emitInlineCppSource = (blocks: readonly JsIrInlineCppBlock[]): string =>
  `#include <bit>
#include <cstdint>
#include <cstdio>
#include <limits>

${jsValueAbi.emitInlineCppSupport()}

${blocks.map(emitInlineCppFunction).join("\n")}`;

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
  const mainLines = emitOperations(mainOps, context);
  const functionObjectGlobals = [...internedFunctions].map(([target]) => `@${internedFunctionGlobal(target)} = internal global i64 ${jsValueUndefined}`);
  const valueGlobals = [...context.valueGlobals].map((name) => `@${name}.value = internal global i64 ${jsValueUndefined}`);
  const aggregateGlobals = [...context.objectTypes, ...context.arrayGlobals, ...functionObjectGlobals, ...valueGlobals].join("\n");
  let numberFormat = "";
  if (context.hasNumberPrint) {
    numberFormat = String.raw`@.fmt.number = private unnamed_addr constant [4 x i8] c"%g\0A\00"
@.fmt.number.nan = private unnamed_addr constant [4 x i8] c"NaN\00"
@.fmt.number.infinity = private unnamed_addr constant [9 x i8] c"Infinity\00"
@.fmt.number.negative-infinity = private unnamed_addr constant [10 x i8] c"-Infinity\00"`;
  }

  // Phase A: invoke the GC initializer before any user statement so that the
  // call to gcInit lands at the start of @main's entry block. Immediately record
  // the root-stack baseline so top-level roots are released before @main returns
  // (otherwise straight-line top-level temporaries stay pinned until process exit).
  if (internedFunctions.size > 0) {
    useRuntimeHelper(context.runtime, "functionObjectNew");
    useRuntimeHelper(context.runtime, "valueBoxString");
  }
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

  useRuntimeHelper(context.runtime, "valuePrint");
  const runtimeDeclarations = emitRuntimeDeclarations(context.runtime);
  const runtimeDefinitions = emitRuntimeDefinitions(context.runtime);
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
  appendLines(runtimeDeclarations);
  appendLines([""]);
  appendText(numberFormat);
  appendText(stringConstants);
  appendText(aggregateGlobals);
  appendLines(runtimeDefinitions.flatMap(splitLegacyDefinition));
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
  defineStructuredRuntimeHelpers(llvmModule, context.runtime);
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

function splitLegacyDefinition(definition: string): readonly string[] {
  if (definition.endsWith("\n")) {
    return definition.slice(0, -1).split("\n");
  }
  return definition.split("\n");
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

// Pin a freshly-allocated boxed value onto the GC root stack. It is released when
// the enclosing scope restores the root-stack depth (function ret, or the per-
// iteration restore at a loop back-edge), so the value survives any subsequent
// allocating call / safepoint until then.
function emitRootStackPush(value: string, _context: EmitContext): string {
  return `  call void @gcRootPush(i64 ${value})`;
}

// Restore the root stack to the depth captured at this function's entry. Emitted at
// every ret/throw point; correct regardless of how many pushes ran, in which branch,
// or how many returns exist (replaces the old static pop counter).
function emitRootStackRestore(context: EmitContext): string[] {
  return [`  call void @gcRootRestore(i64 ${context.gcFrameName})`];
}

function emitGeneratedJsCall(callee: string, arguments_: readonly string[], context: EmitContext): JsValue {
  const index = context.callIndex;
  context.callIndex += 1;
  const result = `%call.${index}.result`;
  const payload = `%call.${index}.payload`;
  const exception = `%call.${index}.exception`;
  const continuation = `call.continue.${index}`;
  return {
    lines: [
      `  ${result} = call ${generatedReturnType} @${callee}(${arguments_.join(", ")})`,
      `  ${payload} = extractvalue ${generatedReturnType} ${result}, 0`,
      `  ${exception} = extractvalue ${generatedReturnType} ${result}, 1`,
      emitRootStackPush(payload, context),
      `  store i64 ${payload}, ptr ${context.exceptionSlot}`,
      `  br i1 ${exception}, label %${context.exceptionTarget}, label %${continuation}`,
      `${continuation}:`
    ],
    value: payload
  };
}

function emitPackedGeneratedReturn(value: string, status: string, context: EmitContext, prefix: string): string[] {
  const index = context.callIndex;
  context.callIndex += 1;
  const base = `%${prefix}.${index}.base`;
  const result = `%${prefix}.${index}`;
  return [
    `  ${base} = insertvalue ${generatedReturnType} undef, i64 ${value}, 0`,
    `  ${result} = insertvalue ${generatedReturnType} ${base}, i1 ${status}, 1`,
    `  ret ${generatedReturnType} ${result}`
  ];
}

function emitNormalGeneratedReturn(value: string, context: EmitContext): string[] {
  if (context.cleanupStack.length > 0) {
    return emitCompletionTransfer(context, {
      kind: COMPLETION_RETURN,
      value,
      untilDepth: 0
    });
  }
  if (context.isMain) {
    return [`  br label %${context.normalExitLabel ?? "main.normal"}`];
  }
  return [...emitRootStackRestore(context), ...emitPackedGeneratedReturn(value, "false", context, "generated.return")];
}

function internCompletionDest(context: EmitContext, label: string, frame: CleanupFrame): number {
  for (const [id, existing] of frame.resumeDests) {
    if (existing === label) {
      return id;
    }
  }
  const id = context.nextDestId;
  context.nextDestId += 1;
  frame.resumeDests.set(id, label);
  return id;
}

interface CompletionTransfer {
  readonly kind: number;
  readonly value?: string;
  readonly destLabel?: string;
  readonly untilDepth: number;
}

/**
 * Route a completion through active cleanup frames (innermost first), or execute it
 * directly when no cleanup is required.
 */
function emitCompletionTransfer(context: EmitContext, transfer: CompletionTransfer): string[] {
  const { cleanupStack } = context;
  if (cleanupStack.length === 0 || transfer.untilDepth >= cleanupStack.length) {
    return emitDirectCompletion(context, transfer);
  }
  const untilFrame = cleanupStack[transfer.untilDepth];
  const firstFrame = cleanupStack[cleanupStack.length - 1];
  const lines: string[] = [
    ...emitActiveCleanupRootRestore(context),
    `  store i8 ${transfer.kind}, ptr ${context.completionSlots.kind}`
  ];
  if (transfer.value !== undefined) {
    lines.push(`  store i64 ${transfer.value}, ptr ${context.completionSlots.value}`, emitRootStackPush(transfer.value, context));
  }
  if (transfer.destLabel !== undefined) {
    const destId = internCompletionDest(context, transfer.destLabel, untilFrame);
    lines.push(`  store i32 ${destId}, ptr ${context.completionSlots.destination}`);
  }
  lines.push(`  store i32 ${transfer.untilDepth}, ptr ${context.completionSlots.until}`, `  br label %${firstFrame.entryLabel}`);
  return lines;
}

/** An abrupt completion exits every cleanup body currently on the emission stack. */
function emitActiveCleanupRootRestore(context: EmitContext): string[] {
  const outermost = context.activeCleanupBodies.at(0);
  if (outermost === undefined) {
    return [];
  }
  return [`  call void @gcRootRestore(i64 ${outermost.rootFrameName})`];
}

function emitDirectCompletion(context: EmitContext, transfer: CompletionTransfer): string[] {
  switch (transfer.kind) {
    case COMPLETION_NORMAL: {
      return [];
    }
    case COMPLETION_RETURN: {
      const value = transfer.value ?? jsValueUndefined;
      if (context.isMain) {
        return [`  br label %${context.normalExitLabel ?? "main.normal"}`];
      }
      return [...emitRootStackRestore(context), ...emitPackedGeneratedReturn(value, "false", context, "generated.return")];
    }
    case COMPLETION_THROW: {
      const value = transfer.value ?? jsValueUndefined;
      return [
        ...emitActiveCleanupRootRestore(context),
        `  store i64 ${value}, ptr ${context.exceptionSlot}`,
        emitRootStackPush(value, context),
        `  br label %${context.exceptionTarget}`
      ];
    }
    case COMPLETION_BREAK:
    case COMPLETION_CONTINUE: {
      if (transfer.destLabel === undefined) {
        return [];
      }
      return [...emitActiveCleanupRootRestore(context), `  br label %${transfer.destLabel}`];
    }
    default: {
      return [];
    }
  }
}

/** After a cleanup frame's body: chain to the next outer frame or final-dispatch. */
function emitCleanupAfterBody(context: EmitContext, frame: CleanupFrame): string[] {
  const seq = context.cleanupSeq;
  context.cleanupSeq += 1;
  const untilValue = `%cleanup.until.${seq}`;
  const more = `%cleanup.more.${seq}`;
  if (frame.index === 0 || frame.outerEntryLabel === undefined) {
    return [`  br label %${frame.finalDispatchLabel}`];
  }
  return [
    `  ${untilValue} = load i32, ptr ${context.completionSlots.until}`,
    `  ${more} = icmp sgt i32 ${frame.index}, ${untilValue}`,
    `  br i1 ${more}, label %${frame.outerEntryLabel}, label %${frame.finalDispatchLabel}`
  ];
}

function emitCleanupFinalDispatch(context: EmitContext, frame: CleanupFrame): string[] {
  const seq = context.cleanupSeq;
  context.cleanupSeq += 1;
  const kind = `%cleanup.kind.${seq}`;
  const value = `%cleanup.value.${seq}`;
  const dest = `%cleanup.dest.${seq}`;
  const lines: string[] = [
    `${frame.finalDispatchLabel}:`,
    `  ${kind} = load i8, ptr ${context.completionSlots.kind}`,
    `  switch i8 ${kind}, label %${frame.joinLabel} [`
  ];
  const returnLabel = `cleanup.ret.${seq}`;
  const throwLabel = `cleanup.throw.${seq}`;
  const breakLabel = `cleanup.break.${seq}`;
  const continueLabel = `cleanup.cont.${seq}`;
  lines.push(
    `    i8 ${COMPLETION_NORMAL}, label %${frame.joinLabel}`,
    `    i8 ${COMPLETION_RETURN}, label %${returnLabel}`,
    `    i8 ${COMPLETION_THROW}, label %${throwLabel}`,
    `    i8 ${COMPLETION_BREAK}, label %${breakLabel}`,
    `    i8 ${COMPLETION_CONTINUE}, label %${continueLabel}`,
    "  ]",
    `${returnLabel}:`,
    `  ${value} = load i64, ptr ${context.completionSlots.value}`,
    ...emitDirectCompletion(context, { kind: COMPLETION_RETURN, value, untilDepth: 0 }),
    `${throwLabel}:`,
    `  %cleanup.throw.val.${seq} = load i64, ptr ${context.completionSlots.value}`,
    `  store i64 %cleanup.throw.val.${seq}, ptr ${context.exceptionSlot}`,
    `  br label %${context.exceptionTarget}`,
    `${breakLabel}:`,
    `  ${dest} = load i32, ptr ${context.completionSlots.destination}`,
    ...emitDestSwitch(dest, frame, frame.joinLabel),
    `${continueLabel}:`,
    `  %cleanup.cont.dest.${seq} = load i32, ptr ${context.completionSlots.destination}`,
    ...emitDestSwitch(`%cleanup.cont.dest.${seq}`, frame, frame.joinLabel)
  );
  return lines;
}

function emitDestSwitch(destValue: string, frame: CleanupFrame, fallback: string): string[] {
  if (frame.resumeDests.size === 0) {
    return [`  br label %${fallback}`];
  }
  const lines: string[] = [`  switch i32 ${destValue}, label %${fallback} [`];
  for (const [id, label] of frame.resumeDests) {
    lines.push(`    i32 ${id}, label %${label}`);
  }
  lines.push("  ]");
  return lines;
}

function createCleanupFrame(
  context: EmitContext,
  kind: "finally" | "iteratorClose",
  options: { readonly skipContinueLabel?: string; readonly iteratorSlot?: string } = {}
): CleanupFrame {
  const index = context.cleanupStack.length;
  const id = context.tryIndex;
  context.tryIndex += 1;
  let outerEntryLabel: string | undefined;
  if (index > 0) {
    outerEntryLabel = context.cleanupStack[index - 1]?.entryLabel;
  }
  return {
    index,
    entryLabel: `cleanup.entry.${id}`,
    finalDispatchLabel: `cleanup.dispatch.${id}`,
    joinLabel: `cleanup.join.${id}`,
    throwEntryLabel: `cleanup.throw.entry.${id}`,
    rootFrameName: `%gc.cleanup.${id}`,
    outerEntryLabel,
    resumeDests: new Map(),
    kind,
    skipContinueLabel: options.skipContinueLabel,
    iteratorSlot: options.iteratorSlot
  };
}

function emitThrowEntryBlock(context: EmitContext, frame: CleanupFrame): string[] {
  const seq = context.cleanupSeq;
  context.cleanupSeq += 1;
  const value = `%cleanup.throw.entry.val.${seq}`;
  return [
    `${frame.throwEntryLabel}:`,
    `  ${value} = load i64, ptr ${context.exceptionSlot}`,
    `  store i8 ${COMPLETION_THROW}, ptr ${context.completionSlots.kind}`,
    `  store i64 ${value}, ptr ${context.completionSlots.value}`,
    `  store i32 ${frame.index}, ptr ${context.completionSlots.until}`,
    `  br label %${frame.entryLabel}`
  ];
}

function emitIteratorCloseBody(context: EmitContext, frame: CleanupFrame): string[] {
  useRuntimeHelper(context.runtime, "iteratorClose");
  const seq = context.cleanupSeq;
  context.cleanupSeq += 1;
  const iterator = `%iter.close.iter.${seq}`;
  const result = `%iter.close.result.${seq}`;
  const payload = `%iter.close.payload.${seq}`;
  const exception = `%iter.close.exc.${seq}`;
  const kind = `%iter.close.kind.${seq}`;
  const isThrow = `%iter.close.is.throw.${seq}`;
  const cont = `iter.close.cont.${seq}`;
  const replace = `iter.close.replace.${seq}`;
  const keep = `iter.close.keep.${seq}`;
  const slot = frame.iteratorSlot ?? "ptr null";
  return [
    `  ${iterator} = load i64, ptr ${slot}`,
    `  ${result} = call ${generatedReturnType} @iteratorClose(i64 ${iterator})`,
    `  ${payload} = extractvalue ${generatedReturnType} ${result}, 0`,
    `  ${exception} = extractvalue ${generatedReturnType} ${result}, 1`,
    emitRootStackPush(payload, context),
    `  br i1 ${exception}, label %${replace}.check, label %${cont}.restore`,
    `${replace}.check:`,
    `  ${kind} = load i8, ptr ${context.completionSlots.kind}`,
    `  ${isThrow} = icmp eq i8 ${kind}, ${COMPLETION_THROW}`,
    `  br i1 ${isThrow}, label %${keep}, label %${replace}`,
    `${replace}:`,
    `  store i8 ${COMPLETION_THROW}, ptr ${context.completionSlots.kind}`,
    `  store i64 ${payload}, ptr ${context.completionSlots.value}`,
    `  call void @gcRootRestore(i64 ${frame.rootFrameName})`,
    emitRootStackPush(payload, context),
    `  br label %${cont}`,
    `${keep}:`,
    `  call void @gcRootRestore(i64 ${frame.rootFrameName})`,
    `  br label %${cont}`,
    `${cont}.restore:`,
    `  call void @gcRootRestore(i64 ${frame.rootFrameName})`,
    `  br label %${cont}`,
    `${cont}:`
  ];
}

function emitExceptionReturnBlock(context: EmitContext): string[] {
  return [
    `${context.exceptionTarget}:`,
    `  %exception.value = load i64, ptr ${context.exceptionSlot}`,
    ...emitRootStackRestore(context),
    ...emitPackedGeneratedReturn("%exception.value", "true", context, "generated.exception")
  ];
}

function traceStartLine(operation: JsIrOperation, context: EmitContext): string {
  const { trace } = operation;
  const id = traceOperationId(operation);
  const source = trace?.source;
  let location = "-";
  if (source !== undefined) {
    location = `${source.fileName}:${source.line}:${source.column}`;
  }
  const line = `; tscn-trace-start ${id} ${operation.kind} ${location} ${trace?.origin ?? "synthesized"}`;
  context.traceMarkers.set(line, { id, kind: "start" });
  return line;
}

function traceEndLine(operation: JsIrOperation, context: EmitContext): string {
  const id = traceOperationId(operation);
  const line = `; tscn-trace-end ${id}`;
  context.traceMarkers.set(line, { id, kind: "end" });
  return line;
}

function wrapFunctionTrace(operation: JsIrOperation, lines: readonly string[], context: EmitContext): string[] {
  let content = lines;
  if (lines.at(-1) === "") {
    content = lines.slice(0, -1);
  }
  return [traceStartLine(operation, context), ...content, traceEndLine(operation, context), ""];
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
    ...emitOperations(fn.body, fnContext)
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
    useRuntimeHelper(context.runtime, "environmentGet");
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
      useRuntimeHelper(context.runtime, "valueStringPtr");
      useRuntimeHelper(context.runtime, "valueStringLength");
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
      useRuntimeHelper(context.runtime, "valueStringPtr");
      useRuntimeHelper(context.runtime, "valueStringLength");
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
  bodyLines.push(...emitOperations(fn.body, fnContext));
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

function emitStringParameterStores(parameters: readonly JsIrFunctionParameter[], context: EmitContext): string[] {
  const lines: string[] = [];
  for (let index = 0; index < parameters.length; index++) {
    const parameter = parameters[index];
    if (parameter.valueKind !== "string") {
      continue;
    }
    // String parameters arrive as a single i64 NaN-boxed reference. Unbox it back
    // into the backend-local (ptr, length) working form held in twin allocas.
    useRuntimeHelper(context.runtime, "valueStringPtr");
    useRuntimeHelper(context.runtime, "valueStringLength");
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
    const emitted = emitOperation(operation, context);
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

// eslint-disable-next-line max-statements -- Operation dispatch is intentionally centralized.
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
    // exceptionTarget is already the nearest catch or cleanup throw-entry.
    return [
      ...value.lines,
      emitRootStackPush(value.value, context),
      `  store i64 ${value.value}, ptr ${context.exceptionSlot}`,
      `  br label %${context.exceptionTarget}`
    ];
  }

  if (operation.kind === "tryCatch") {
    return emitTryCatchOperation(operation, context);
  }

  if (operation.kind === "block") {
    return emitOperationsWithScopedBindings(operation.operations, context);
  }

  if (operation.kind === "bindingGroup") {
    return emitOperations(operation.operations, context);
  }

  if (operation.kind === "if") {
    return emitIfOperation(operation, context);
  }

  const callLines = emitCallLikeOperation(operation, context);
  if (callLines !== undefined) {
    return callLines;
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
    return emitNormalGeneratedReturn(jsValueUndefined, context);
  }

  return [];
}

function emitTryCatchOperation(
  operation: Extract<JsIrOperation, { readonly kind: "tryCatch" }>,
  context: EmitContext
): string[] {
  if (operation.finallyOperations !== undefined) {
    return emitTryFinallyOperation(operation, context);
  }
  return emitTryCatchOnlyOperation(operation, context);
}

function emitTryCatchOnlyOperation(
  operation: Extract<JsIrOperation, { readonly kind: "tryCatch" }>,
  context: EmitContext
): string[] {
  const index = context.tryIndex;
  context.tryIndex += 1;
  const tryLabel = `try.body.${index}`;
  const catchLabel = `try.catch.${index}`;
  const joinLabel = `try.join.${index}`;
  const outerTarget = context.exceptionTarget;
  const tryBindings = new Map(context.bindings);
  context.exceptionTarget = catchLabel;
  const tryLines = emitOperationsWithScopedBindings(operation.tryOperations, context);
  context.exceptionTarget = outerTarget;
  const catchValue = `%try.catch.value.${index}`;
  const catchBindings = new Map(context.bindings);
  if (operation.catchVariable !== "") {
    catchBindings.set(operation.catchVariable, { kind: "valueVariable", name: catchValue });
  }
  context.bindings.clear();
  for (const [name, binding] of catchBindings) {
    context.bindings.set(name, binding);
  }
  const catchLines = emitOperationsWithScopedBindings(operation.catchOperations, context);
  context.bindings.clear();
  for (const [name, binding] of tryBindings) {
    context.bindings.set(name, binding);
  }
  const lines = [`  br label %${tryLabel}`, `${tryLabel}:`, ...tryLines];
  if (!operationListTerminates(operation.tryOperations)) {
    lines.push(`  br label %${joinLabel}`);
  }
  lines.push(`${catchLabel}:`, `  ${catchValue} = load i64, ptr ${context.exceptionSlot}`, ...catchLines);
  if (!operationListTerminates(operation.catchOperations)) {
    lines.push(`  br label %${joinLabel}`);
  }
  if (!operationListTerminates(operation.tryOperations) || !operationListTerminates(operation.catchOperations)) {
    lines.push(`${joinLabel}:`);
  }
  return lines;
}

// eslint-disable-next-line max-statements, complexity -- try/finally lowers catch, cleanup stack, and completion dispatch together.
function emitTryFinallyOperation(
  operation: Extract<JsIrOperation, { readonly kind: "tryCatch" }>,
  context: EmitContext
): string[] {
  const finallyOperations = operation.finallyOperations ?? [];
  const includeCatch = operation.hasCatch;

  const frame = createCleanupFrame(context, "finally");
  const tryLabel = `try.body.${frame.index}.${context.tryIndex}`;
  const catchLabel = `try.catch.${frame.index}.${context.tryIndex}`;
  const catchValue = `%try.catch.value.${frame.index}.${context.tryIndex}`;
  const outerTarget = context.exceptionTarget;
  const outerBindings = new Map(context.bindings);

  // --- try region ---
  context.cleanupStack.push(frame);
  if (includeCatch) {
    context.exceptionTarget = catchLabel;
  } else {
    context.exceptionTarget = frame.throwEntryLabel;
  }
  const tryLines = emitOperationsWithScopedBindings(operation.tryOperations, context);
  const tryTerminates = operationListTerminates(operation.tryOperations);

  // --- catch region (optional) ---
  let catchLines: string[] = [];
  let catchTerminates = true;
  if (includeCatch) {
    context.exceptionTarget = frame.throwEntryLabel;
    const catchBindings = new Map(outerBindings);
    if (operation.catchVariable !== "") {
      catchBindings.set(operation.catchVariable, { kind: "valueVariable", name: catchValue });
    }
    context.bindings.clear();
    for (const [name, binding] of catchBindings) {
      context.bindings.set(name, binding);
    }
    catchLines = emitOperationsWithScopedBindings(operation.catchOperations, context);
    catchTerminates = operationListTerminates(operation.catchOperations);
  }

  context.cleanupStack.pop();
  context.exceptionTarget = outerTarget;
  context.bindings.clear();
  for (const [name, binding] of outerBindings) {
    context.bindings.set(name, binding);
  }

  // --- finally body (frame not on cleanup stack; throws replace pending completion) ---
  const finallyRethrow = `cleanup.finally.rethrow.${frame.index}.${context.tryIndex}`;
  const savedCompletionIndex = context.cleanupSeq;
  context.cleanupSeq += 1;
  const savedKind = `%cleanup.saved.kind.${savedCompletionIndex}`;
  const savedValue = `%cleanup.saved.value.${savedCompletionIndex}`;
  const savedDest = `%cleanup.saved.dest.${savedCompletionIndex}`;
  const savedUntil = `%cleanup.saved.until.${savedCompletionIndex}`;
  context.exceptionTarget = finallyRethrow;
  context.activeCleanupBodies.push(frame);
  const finallyLines = emitOperationsWithScopedBindings(finallyOperations, context);
  const abruptCleanupRootRestore = emitActiveCleanupRootRestore(context);
  context.activeCleanupBodies.pop();
  const finallyTerminates = operationListTerminates(finallyOperations);
  context.exceptionTarget = outerTarget;

  const lines: string[] = [`  br label %${tryLabel}`, `${tryLabel}:`, ...tryLines];
  if (!tryTerminates) {
    lines.push(
      `  store i8 ${COMPLETION_NORMAL}, ptr ${context.completionSlots.kind}`,
      `  store i32 ${frame.index}, ptr ${context.completionSlots.until}`,
      `  br label %${frame.entryLabel}`
    );
  }

  if (includeCatch) {
    lines.push(`${catchLabel}:`, `  ${catchValue} = load i64, ptr ${context.exceptionSlot}`, ...catchLines);
    if (!catchTerminates) {
      lines.push(
        `  store i8 ${COMPLETION_NORMAL}, ptr ${context.completionSlots.kind}`,
        `  store i32 ${frame.index}, ptr ${context.completionSlots.until}`,
        `  br label %${frame.entryLabel}`
      );
    }
  }

  lines.push(
    `${frame.entryLabel}:`,
    `  ${frame.rootFrameName} = call i64 @gcRootSave()`,
    `  ${savedKind} = load i8, ptr ${context.completionSlots.kind}`,
    `  ${savedValue} = load i64, ptr ${context.completionSlots.value}`,
    `  ${savedDest} = load i32, ptr ${context.completionSlots.destination}`,
    `  ${savedUntil} = load i32, ptr ${context.completionSlots.until}`,
    ...finallyLines
  );
  if (!finallyTerminates) {
    lines.push(
      `  call void @gcRootRestore(i64 ${frame.rootFrameName})`,
      `  store i8 ${savedKind}, ptr ${context.completionSlots.kind}`,
      `  store i64 ${savedValue}, ptr ${context.completionSlots.value}`,
      `  store i32 ${savedDest}, ptr ${context.completionSlots.destination}`,
      `  store i32 ${savedUntil}, ptr ${context.completionSlots.until}`,
      ...emitCleanupAfterBody(context, frame)
    );
  }

  // Throw from finally replaces any pending completion and continues outer cleanups.
  const rethrowSeq = context.cleanupSeq;
  context.cleanupSeq += 1;
  const rethrowValue = `%finally.rethrow.val.${rethrowSeq}`;
  lines.push(
    `${finallyRethrow}:`,
    `  ${rethrowValue} = load i64, ptr ${context.exceptionSlot}`,
    ...abruptCleanupRootRestore,
    `  store i8 ${COMPLETION_THROW}, ptr ${context.completionSlots.kind}`,
    `  store i64 ${rethrowValue}, ptr ${context.completionSlots.value}`,
    emitRootStackPush(rethrowValue, context)
  );
  if (frame.outerEntryLabel === undefined) {
    lines.push(
      `  store i64 ${rethrowValue}, ptr ${context.exceptionSlot}`,
      `  br label %${outerTarget}`
    );
  } else {
    lines.push(
      `  store i32 0, ptr ${context.completionSlots.until}`,
      `  br label %${frame.outerEntryLabel}`
    );
  }

  lines.push(...emitThrowEntryBlock(context, frame));
  lines.push(...emitCleanupFinalDispatch(context, frame));
  // Join is the NORMAL fallthrough target. When no try/catch path can complete
  // normally, the block is still referenced by the dispatch switch default and
  // must be a valid terminated block.
  const canNormalJoin =
    (!tryTerminates || (includeCatch && !catchTerminates)) && !finallyTerminates;
  lines.push(`${frame.joinLabel}:`);
  if (!canNormalJoin) {
    lines.push("  unreachable");
  }
  return lines;
}

function emitCallLikeOperation(operation: JsIrOperation, context: EmitContext): string[] | undefined {
  if (operation.kind === "call") {
    return emitCallOperation(operation, context);
  }
  if (operation.kind === "callValue") {
    return [...emitValueCallExpression(operation, context).lines];
  }
  if (operation.kind === "inlineCpp") {
    return [`  call i64 @${operation.symbol}()`];
  }
  return undefined;
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

  if (operation.kind === "runtimeArrayFindCallback" || operation.kind === "runtimeArrayFindIndexCallback" || operation.kind === "runtimeArrayReduceCallback") {
    return emitRuntimeArrayScalarCallbackOperation(operation, context);
  }

  if (operation.kind === "runtimeMapSetResult" || operation.kind === "runtimeSetAddResult") {
    return emitRuntimeCollectionResultOperation(operation, context);
  }

  if (operation.kind === "runtimeIteratorNew") {
    return emitRuntimeIteratorNewOperation(operation, context);
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

  const collectionMutation = emitRuntimeCollectionMutationOperation(operation, context);
  if (collectionMutation !== undefined) {
    return collectionMutation;
  }

  return emitObjectMutationOperation(operation, context);
}

function emitRuntimeCollectionMutationOperation(operation: JsIrOperation, context: EmitContext): string[] | undefined {
  if (operation.kind === "runtimeCollectionSetIterator") {
    const collection = emitRuntimeCollectionPointer(operation.collectionName, context);
    const value = emitValueExpression(operation.value, context);
    const slot = `%collection.iterator.slot.${context.objectIndex}`;
    context.objectIndex += 1;
    return [...collection.lines, ...value.lines, `  ${slot} = getelementptr i8, ptr ${collection.value}, i64 32`, `  store i64 ${value.value}, ptr ${slot}`];
  }
  if (operation.kind === "runtimeMapSet") {
    const collection = emitRuntimeCollectionPointer(operation.mapName, context);
    const key = emitValueExpression(operation.key, context);
    const value = emitValueExpression(operation.value, context);
    useRuntimeHelper(context.runtime, "collectionSet");
    return [...collection.lines, ...key.lines, ...value.lines, `  call void @collectionSet(ptr ${collection.value}, i64 ${key.value}, i64 ${value.value})`];
  }
  if (operation.kind === "runtimeSetAdd") {
    const collection = emitRuntimeCollectionPointer(operation.setName, context);
    const value = emitValueExpression(operation.value, context);
    useRuntimeHelper(context.runtime, "collectionSet");
    return [...collection.lines, ...value.lines, `  call void @collectionSet(ptr ${collection.value}, i64 ${value.value}, i64 ${jsValueTrue})`];
  }
  return undefined;
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

  if (operation.kind === "runtimeArrayForEachCallback") {
    return emitRuntimeArrayForEachCallbackOperation(operation, context);
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

  if (operation.kind === "privateFieldStore") {
    return emitPrivateFieldStoreOperation(operation, context);
  }

  if (operation.kind === "valueObjectDelete" || operation.kind === "valueArrayDelete") {
    return emitValueAggregateDeleteOperation(operation, context);
  }

  if (operation.kind === "runtimeObjectSetPrototype") {
    return emitRuntimeObjectSetPrototypeOperation(operation, context);
  }
  if (operation.kind === "valueObjectSetPrototype") {
    return emitValueObjectSetPrototypeOperation(operation, context);
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

  if (operation.kind === "runtimeMapNew" || operation.kind === "runtimeSetNew") {
    return emitRuntimeCollectionNewOperation(operation, context);
  }

  if (operation.kind === "runtimeMapFromArray" || operation.kind === "runtimeSetFromArray") {
    return emitRuntimeCollectionFromArrayOperation(operation, context);
  }

  if (operation.kind === "runtimeMapFromIterable" || operation.kind === "runtimeSetFromIterable") {
    return emitRuntimeCollectionFromIterableOperation(operation, context);
  }

  if (operation.kind === "runtimeMapFromCollection" || operation.kind === "runtimeSetFromCollection") {
    return emitRuntimeCollectionFromCollectionOperation(operation, context);
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

// eslint-disable-next-line max-statements -- Aggregate binding dispatch keeps each runtime array-producing operation explicit.
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

  if (operation.kind === "runtimeStringSplit") {
    return emitRuntimeStringSplitOperation(operation, context);
  }

  if (operation.kind === "runtimeRegexSplit") {
    return emitRuntimeRegexSplitOperation(operation, context);
  }

  if (operation.kind === "runtimeArrayMapCallback") {
    return emitRuntimeArrayMapCallbackOperation(operation, context);
  }

  if (operation.kind === "runtimeArrayMapFunctionObject") {
    return emitRuntimeArrayMapFunctionObjectOperation(operation, context);
  }

  if (operation.kind === "runtimeArrayFlatMapCallback") {
    return emitRuntimeArrayFlatMapCallbackOperation(operation, context);
  }

  if (operation.kind === "runtimeArrayFilterCallback") {
    return emitRuntimeArrayFilterCallbackOperation(operation, context);
  }

  if (operation.kind === "runtimeArrayConcat") {
    return emitRuntimeArrayConcatOperation(operation, context);
  }

  if (operation.kind === "runtimeArrayMutatorResult") {
    return emitRuntimeArrayMutatorResultOperation(operation, context);
  }

  if (operation.kind === "runtimeArraySort") {
    return emitRuntimeArraySortOperation(operation, context);
  }

  if (operation.kind === "runtimeArrayFrom" || operation.kind === "runtimeArrayFromValue" || operation.kind === "runtimeArrayFromCollection") {
    return emitRuntimeArrayFromFamilyOperation(operation, context);
  }

  if (operation.kind === "runtimeObjectGetPrototype") {
    return emitRuntimeObjectGetPrototypeOperation(operation, context);
  }

  return undefined;
}

function emitRuntimeArrayFromFamilyOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayFrom" | "runtimeArrayFromValue" | "runtimeArrayFromCollection" }>,
  context: EmitContext
): string[] {
  if (operation.kind === "runtimeArrayFromValue") {
    return emitRuntimeArrayFromValueOperation(operation, context);
  }
  if (operation.kind === "runtimeArrayFromCollection") {
    return emitRuntimeArrayFromCollectionOperation(operation, context);
  }
  return emitRuntimeArrayFromOperation(operation, context);
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
  if (operation.kind === "letValue") {
    return emitLetValueOperation(operation, context);
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
  if (operation.kind === "switch") {
    return emitSwitchOperation(operation, context);
  }

  if (operation.kind === "while") {
    return emitWhileOperation(operation, context);
  }

  if (operation.kind === "doWhile") {
    return emitDoWhileOperation(operation, context);
  }

  if (operation.kind === "for") {
    return emitForOperation(operation, context);
  }

  if (operation.kind === "forOfArray") {
    return emitForOfArrayOperation(operation, context);
  }

  if (operation.kind === "forOfString") {
    return emitForOfStringOperation(operation, context);
  }

  if (operation.kind === "forOfSet") {
    return emitForOfSetOperation(operation, context);
  }

  if (operation.kind === "forOfMap") {
    return emitForOfMapOperation(operation, context);
  }

  if (operation.kind === "forOfProtocol") {
    return emitForOfProtocolOperation(operation, context);
  }

  if (operation.kind === "arrayDestructureProtocol") {
    return emitArrayDestructureProtocolOperation(operation, context);
  }

  if (operation.kind === "forInObject") {
    return emitForInObjectOperation(operation, context);
  }

  if (operation.kind === "forInArray") {
    return emitForInArrayOperation(operation, context);
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
    const value = emitValueExpression(element.value, context);
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
  useRuntimeHelper(context.runtime, "getIteratorValue");
  useRuntimeHelper(context.runtime, "callIteratorNext");
  useRuntimeHelper(context.runtime, "valueObjectGet");
  useRuntimeHelper(context.runtime, "valueTruthy");
  useRuntimeHelper(context.runtime, "valueBoxString");
  useRuntimeHelper(context.runtime, "arrayPush");
  const source = emitValueExpression(sourceExpression, context);
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
  useRuntimeHelper(context.runtime, "valueBoxArray");
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

function emitRuntimeCollectionNewOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeMapNew" | "runtimeSetNew" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  let bindingKind: "runtimeMap" | "runtimeSet" = "runtimeSet";
  if (operation.kind === "runtimeMapNew") {
    bindingKind = "runtimeMap";
  }
  context.bindings.set(operation.name, { kind: bindingKind, name: operation.name });
  useRuntimeHelper(context.runtime, "collectionNew");
  return [`  ${pointerName} = alloca ptr`, `  %${operation.name}.collection = call ptr @collectionNew()`, `  store ptr %${operation.name}.collection, ptr ${pointerName}`];
}

// Consumes the currently supported iterable-constructor source shape: a runtime
// array. Map entries are runtime array pairs, matching `new Map([[k, v]])`.
// eslint-disable-next-line max-statements -- Constructor iteration emits allocation, loop control, and per-kind insertion in one LLVM block.
function emitRuntimeCollectionFromArrayOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeMapFromArray" | "runtimeSetFromArray" }>,
  context: EmitContext
): string[] {
  const index = context.arrayIndex;
  context.arrayIndex += 1;
  const pointerName = variablePointerName(operation.name);
  const source = emitRuntimeArrayPointer(operation.sourceName, context);
  const collection = `%${operation.name}.collection`;
  const length = `%${operation.name}.source.length.${index}`;
  const indexSlot = `%${operation.name}.source.index.slot.${index}`;
  const currentIndex = `%${operation.name}.source.index.${index}`;
  const inRange = `%${operation.name}.source.in.range.${index}`;
  const element = `%${operation.name}.source.element.${index}`;
  const nextIndex = `%${operation.name}.source.next.${index}`;
  const condLabel = `${operation.name}.from.array.cond.${index}`;
  const bodyLabel = `${operation.name}.from.array.body.${index}`;
  const endLabel = `${operation.name}.from.array.end.${index}`;
  let bindingKind: "runtimeMap" | "runtimeSet" = "runtimeSet";
  if (operation.kind === "runtimeMapFromArray") {
    bindingKind = "runtimeMap";
  }
  context.bindings.set(operation.name, { kind: bindingKind, name: operation.name });
  useRuntimeHelper(context.runtime, "collectionNew");
  useRuntimeHelper(context.runtime, "collectionSet");
  useRuntimeHelper(context.runtime, "arrayLength");
  useRuntimeHelper(context.runtime, "arrayGet");
  const lines = [
    `  ${pointerName} = alloca ptr`,
    ...source.lines,
    `  ${collection} = call ptr @collectionNew()`,
    `  store ptr ${collection}, ptr ${pointerName}`,
    `  ${length} = call i64 @arrayLength(ptr ${source.value})`,
    `  ${indexSlot} = alloca i64`,
    `  store i64 0, ptr ${indexSlot}`,
    `  br label %${condLabel}`,
    `${condLabel}:`,
    `  ${currentIndex} = load i64, ptr ${indexSlot}`,
    `  ${inRange} = icmp ult i64 ${currentIndex}, ${length}`,
    `  br i1 ${inRange}, label %${bodyLabel}, label %${endLabel}`,
    `${bodyLabel}:`,
    `  ${element} = call i64 @arrayGet(ptr ${source.value}, i64 ${currentIndex})`
  ];
  if (operation.kind === "runtimeMapFromArray") {
    const keyConstant = addStringConstant("0", context);
    const valueConstant = addStringConstant("1", context);
    const key = `%${operation.name}.source.entry.key.${index}`;
    const value = `%${operation.name}.source.entry.value.${index}`;
    useRuntimeHelper(context.runtime, "valueArrayGet");
    lines.push(
      `  ${key} = call i64 @valueArrayGet(i64 ${element}, i64 0, i64 1, ptr ${keyConstant})`,
      `  ${value} = call i64 @valueArrayGet(i64 ${element}, i64 1, i64 1, ptr ${valueConstant})`,
      `  call void @collectionSet(ptr ${collection}, i64 ${key}, i64 ${value})`
    );
  } else {
    lines.push(`  call void @collectionSet(ptr ${collection}, i64 ${element}, i64 ${jsValueTrue})`);
  }
  lines.push(
    `  ${nextIndex} = add i64 ${currentIndex}, 1`,
    `  store i64 ${nextIndex}, ptr ${indexSlot}`,
    `  br label %${condLabel}`,
    `${endLabel}:`
  );
  return lines;
}

function emitRuntimeCollectionResultOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeMapSetResult" | "runtimeSetAddResult" }>,
  context: EmitContext
): string[] {
  let sourceName: string;
  if (operation.kind === "runtimeMapSetResult") {
    sourceName = operation.mapName;
  } else {
    sourceName = operation.setName;
  }
  const collection = emitRuntimeCollectionPointer(sourceName, context);
  const pointerName = variablePointerName(operation.name);
  const lines = [`  ${pointerName} = alloca ptr`, ...collection.lines];
  useRuntimeHelper(context.runtime, "collectionSet");
  if (operation.kind === "runtimeMapSetResult") {
    const key = emitValueExpression(operation.key, context);
    const value = emitValueExpression(operation.value, context);
    lines.push(...key.lines, ...value.lines, `  call void @collectionSet(ptr ${collection.value}, i64 ${key.value}, i64 ${value.value})`);
  } else {
    const value = emitValueExpression(operation.value, context);
    lines.push(...value.lines, `  call void @collectionSet(ptr ${collection.value}, i64 ${value.value}, i64 ${jsValueTrue})`);
  }
  lines.push(`  store ptr ${collection.value}, ptr ${pointerName}`);
  let bindingKind: "runtimeMap" | "runtimeSet" = "runtimeSet";
  if (operation.kind === "runtimeMapSetResult") {
    bindingKind = "runtimeMap";
  }
  context.bindings.set(operation.name, { kind: bindingKind, name: operation.name });
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
  useRuntimeHelper(context.runtime, "createCollectionIterator");
  if (operation.observeOverride === true) {
    useRuntimeHelper(context.runtime, "getCollectionIterator");
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

function runtimeIteratorKindCode(kind: "keys" | "values" | "entries"): number {
  if (kind === "keys") {
    return 0;
  }
  if (kind === "values") {
    return 1;
  }
  return 2;
}

function runtimeArrayLiteralInitialLength(elements: readonly JsIrRuntimeArrayElement[]): number {
  if (elements.some((element) => element.kind === "spread" || element.kind === "iterableSpread")) {
    return 0;
  }
  return elements.length;
}

function emitRuntimeArrayMapCallbackOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayMapCallback" }>,
  context: EmitContext
): string[] {
  useRuntimeHelper(context.runtime, "arrayLength");
  useRuntimeHelper(context.runtime, "arrayGet");
  useRuntimeHelper(context.runtime, "arrayNew");
  useRuntimeHelper(context.runtime, "arraySet");
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  const source = emitRuntimeArrayPointer(operation.arrayName, context);
  const index = context.arrayIndex;
  context.arrayIndex += 1;
  const length = `%arr.map.len.${index}`;
  const output = `%arr.map.out.${index}`;
  const iPointer = `%arr.map.i.${index}.addr`;
  const condLabel = `arr.map.cond.${index}`;
  const bodyLabel = `arr.map.body.${index}`;
  const endLabel = `arr.map.end.${index}`;
  const currentIndex = `%arr.map.i.${index}`;
  const nextIndex = `%arr.map.next.${index}`;
  const element = `%arr.map.value.${index}`;
  const callbackArgs = emitArrayCallbackArguments(operation.callbackParameters, source.value, currentIndex, element, index, context);
  const callbackReturn = emitArrayCallbackReturn(operation.callbackReturnKind, operation.callbackName, callbackArgs.values, index, context);
  return [
    `  ${pointerName} = alloca ptr`,
    ...source.lines,
    `  ${length} = call i64 @arrayLength(ptr ${source.value})`,
    `  ${output} = call ptr @arrayNew(i64 ${length})`,
    `  store ptr ${output}, ptr ${pointerName}`,
    `  ${iPointer} = alloca i64`,
    `  store i64 0, ptr ${iPointer}`,
    `  br label %${condLabel}`,
    `${condLabel}:`,
    `  ${currentIndex} = load i64, ptr ${iPointer}`,
    `  %arr.map.done.${index} = icmp eq i64 ${currentIndex}, ${length}`,
    `  br i1 %arr.map.done.${index}, label %${endLabel}, label %${bodyLabel}`,
    `${bodyLabel}:`,
    `  ${element} = call i64 @arrayGet(ptr ${source.value}, i64 ${currentIndex})`,
    ...callbackArgs.lines,
    ...callbackReturn.lines,
    `  call void @arraySet(ptr ${output}, i64 ${currentIndex}, i64 ${callbackReturn.value})`,
    `  ${nextIndex} = add i64 ${currentIndex}, 1`,
    `  store i64 ${nextIndex}, ptr ${iPointer}`,
    `  br label %${condLabel}`,
    `${endLabel}:`
  ];
}

// eslint-disable-next-line max-statements -- Function-object array dispatch keeps method routing next to the map tracer bullet emitter.
function emitRuntimeArrayMapFunctionObjectOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayMapFunctionObject" }>,
  context: EmitContext
): string[] {
  if (operation.method === "filter") {
    return emitRuntimeArrayFilterFunctionObjectOperation(operation, context);
  }
  if (operation.method === "flatMap") {
    return emitRuntimeArrayFlatMapFunctionObjectOperation(operation, context);
  }
  if (operation.method === "find" || operation.method === "findIndex") {
    return emitRuntimeArrayFindFunctionObjectOperation(operation, context);
  }
  if (operation.method === "reduce" || operation.method === "reduceRight") {
    return emitRuntimeArrayReduceFunctionObjectOperation(operation, context);
  }
  if (operation.method === "forEach") {
    return emitRuntimeArrayForEachFunctionObjectOperation(operation, context);
  }
  useRuntimeHelper(context.runtime, "arrayLength");
  useRuntimeHelper(context.runtime, "arrayGet");
  useRuntimeHelper(context.runtime, "arrayNew");
  useRuntimeHelper(context.runtime, "arraySet");
  useRuntimeHelper(context.runtime, "functionObjectNew");
  useRuntimeHelper(context.runtime, "jsCall");
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  const source = emitRuntimeArrayPointer(operation.arrayName, context);
  const index = context.arrayIndex;
  context.arrayIndex += 1;
  const length = `%arr.map.len.${index}`;
  const output = `%arr.map.out.${index}`;
  const iPointer = `%arr.map.i.${index}.addr`;
  const condLabel = `arr.map.cond.${index}`;
  const bodyLabel = `arr.map.body.${index}`;
  const endLabel = `arr.map.end.${index}`;
  const currentIndex = `%arr.map.i.${index}`;
  const nextIndex = `%arr.map.next.${index}`;
  const element = `%arr.map.value.${index}`;
  const callbackArgs = emitArrayCallbackArguments(operation.callbackParameters, source.value, currentIndex, element, index, context);
  const functionObject = emitFunctionObjectValue(operation, context, index);
  const callbackReturn = emitFunctionObjectCallbackReturn(functionObject.value, callbackArgs.values, index, context);
  return [
    `  ${pointerName} = alloca ptr`,
    ...functionObject.lines,
    ...source.lines,
    `  ${length} = call i64 @arrayLength(ptr ${source.value})`,
    `  ${output} = call ptr @arrayNew(i64 ${length})`,
    `  store ptr ${output}, ptr ${pointerName}`,
    `  ${iPointer} = alloca i64`,
    `  store i64 0, ptr ${iPointer}`,
    `  br label %${condLabel}`,
    `${condLabel}:`,
    `  ${currentIndex} = load i64, ptr ${iPointer}`,
    `  %arr.map.done.${index} = icmp eq i64 ${currentIndex}, ${length}`,
    `  br i1 %arr.map.done.${index}, label %${endLabel}, label %${bodyLabel}`,
    `${bodyLabel}:`,
    `  ${element} = call i64 @arrayGet(ptr ${source.value}, i64 ${currentIndex})`,
    ...callbackArgs.lines,
    ...callbackReturn.lines,
    `  call void @arraySet(ptr ${output}, i64 ${currentIndex}, i64 ${callbackReturn.value})`,
    `  ${nextIndex} = add i64 ${currentIndex}, 1`,
    `  store i64 ${nextIndex}, ptr ${iPointer}`,
    `  br label %${condLabel}`,
    `${endLabel}:`
  ];
}

function emitFunctionObjectValue(operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayMapFunctionObject" }>, context: EmitContext, index: number): { readonly lines: readonly string[]; readonly value: string } {
  useRuntimeHelper(context.runtime, "functionObjectNew");
  useRuntimeHelper(context.runtime, "jsCall");
  const functionValue = `%arr.fnobj.${index}`;
  const captures = operation.captures ?? [];
  const captureLines: string[] = [];
  let environment = "null";
  if (captures.length > 0) {
    useRuntimeHelper(context.runtime, "environmentNew");
    useRuntimeHelper(context.runtime, "environmentSet");
    const emittedCaptures = captures.map((capture) => emitValueExpression(capture.value, context));
    for (const capture of emittedCaptures) {
      captureLines.push(...capture.lines, `  call void @gcRootPush(i64 ${capture.value})`);
    }
    environment = `%arr.fnobj.env.${index}`;
    captureLines.push(`  ${environment} = call ptr @environmentNew(i64 ${captures.length})`);
    for (let captureIndex = 0; captureIndex < emittedCaptures.length; captureIndex += 1) {
      captureLines.push(`  call void @environmentSet(ptr ${environment}, i64 ${captureIndex}, i64 ${emittedCaptures[captureIndex].value})`);
    }
  }
  const thisArg = emitFunctionObjectThisArg(operation, context, `%arr.fnobj.this.frame.${index}`);
  const newCall = `  ${functionValue} = call i64 @functionObjectNew(ptr @${operation.callbackName}, ptr ${environment}, i64 ${thisArg.value}, i64 ${jsValueUndefined}, i64 ${operation.callbackParameters.length})`;
  const push = emitRootStackPush(functionValue, context);
  return { lines: [...captureLines, ...thisArg.setup, newCall, ...thisArg.cleanup, push], value: functionValue };
}

function emitFunctionObjectThisArg(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayMapFunctionObject" }>,
  context: EmitContext,
  frameName: string
): { readonly setup: readonly string[]; readonly value: string; readonly cleanup: readonly string[] } {
  if (operation.thisArg === undefined) {
    return { setup: [], value: jsValueUndefined, cleanup: [] };
  }
  const { lines, value: emittedValue } = emitValueExpression(operation.thisArg, context);
  let value = jsValueUndefined;
  if (operation.callbackKind === "ordinary") {
    value = emittedValue;
  }
  return {
    setup: [`  ${frameName} = call i64 @gcRootSave()`, ...lines, `  call void @gcRootPush(i64 ${emittedValue})`],
    value,
    cleanup: [`  call void @gcRootRestore(i64 ${frameName})`]
  };
}

function emitRuntimeArrayFlatMapFunctionObjectOperation(operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayMapFunctionObject" }>, context: EmitContext): string[] {
  const direct: Extract<JsIrOperation, { readonly kind: "runtimeArrayFlatMapCallback" }> = { kind: "runtimeArrayFlatMapCallback", name: operation.name, arrayName: operation.arrayName, callbackName: operation.callbackName, callbackParameters: operation.callbackParameters, callbackReturnKind: nonVoidCallbackReturnKind(operation.callbackReturnKind) };
  return emitRuntimeArrayCallbackFunctionObjectPrelude(operation, context, (functionValue) => emitRuntimeArrayFlatMapCallbackOperationWithReturn(direct, context, (args, index) => emitFunctionObjectCallbackReturn(functionValue, args, index, context)));
}

function emitRuntimeArrayFilterFunctionObjectOperation(operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayMapFunctionObject" }>, context: EmitContext): string[] {
  const direct: Extract<JsIrOperation, { readonly kind: "runtimeArrayFilterCallback" }> = { kind: "runtimeArrayFilterCallback", name: operation.name, arrayName: operation.arrayName, callbackName: operation.callbackName, callbackParameters: operation.callbackParameters, callbackReturnKind: nonVoidCallbackReturnKind(operation.callbackReturnKind) };
  return emitRuntimeArrayCallbackFunctionObjectPrelude(operation, context, (functionValue) => emitRuntimeArrayFilterCallbackOperationWithReturn(direct, context, (args, index) => emitFunctionObjectCallbackReturn(functionValue, args, index, context)));
}

function emitRuntimeArrayForEachFunctionObjectOperation(operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayMapFunctionObject" }>, context: EmitContext): string[] {
  const direct: Extract<JsIrOperation, { readonly kind: "runtimeArrayForEachCallback" }> = { kind: "runtimeArrayForEachCallback", arrayName: operation.arrayName, callbackName: operation.callbackName, callbackParameters: operation.callbackParameters, callbackReturnKind: operation.callbackReturnKind };
  return emitRuntimeArrayCallbackFunctionObjectPrelude(operation, context, (functionValue) => emitRuntimeArrayForEachCallbackOperationWithCall(direct, context, (args, index) => emitFunctionObjectCallbackReturn(functionValue, args, index, context).lines));
}

function emitRuntimeArrayFindFunctionObjectOperation(operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayMapFunctionObject" }>, context: EmitContext): string[] {
  let kind: "runtimeArrayFindCallback" | "runtimeArrayFindIndexCallback" = "runtimeArrayFindIndexCallback";
  if (operation.method === "find") {
    kind = "runtimeArrayFindCallback";
  }
  const direct: Extract<JsIrOperation, { readonly kind: "runtimeArrayFindCallback" | "runtimeArrayFindIndexCallback" }> = { kind, name: operation.name, arrayName: operation.arrayName, callbackName: operation.callbackName, callbackParameters: operation.callbackParameters, callbackReturnKind: nonVoidCallbackReturnKind(operation.callbackReturnKind) };
  return emitRuntimeArrayCallbackFunctionObjectPrelude(operation, context, (functionValue) => emitRuntimeArrayFindCallbackOperationWithReturn(direct, context, (args, index) => emitFunctionObjectCallbackReturn(functionValue, args, index, context)));
}

function emitRuntimeArrayReduceFunctionObjectOperation(operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayMapFunctionObject" }>, context: EmitContext): string[] {
  const direct: Extract<JsIrOperation, { readonly kind: "runtimeArrayReduceCallback" }> = { kind: "runtimeArrayReduceCallback", name: operation.name, arrayName: operation.arrayName, callbackName: operation.callbackName, callbackParameters: operation.callbackParameters, callbackReturnKind: nonVoidCallbackReturnKind(operation.callbackReturnKind), initialValue: operation.initialValue, direction: operation.direction ?? "left" };
  return emitRuntimeArrayCallbackFunctionObjectPrelude(operation, context, (functionValue) => emitRuntimeArrayReduceCallbackOperationWithReturn(direct, context, (args, index) => emitFunctionObjectCallbackReturn(functionValue, args, index, context)));
}

function nonVoidCallbackReturnKind(returnKind: JsIrValueKind | "void"): JsIrValueKind {
  if (returnKind === "void") {
    return "value";
  }
  return returnKind;
}

function emitRuntimeArrayCallbackFunctionObjectPrelude(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayMapFunctionObject" }>,
  context: EmitContext,
  emitBody: (functionValue: string) => string[]
): string[] {
  const index = context.arrayIndex;
  const functionObject = emitFunctionObjectValue(operation, context, index);
  return [...functionObject.lines, ...emitBody(functionObject.value)];
}

// eslint-disable-next-line max-statements -- flatMap emits callback invocation plus one-level array flattening in one loop.
function emitRuntimeArrayFlatMapCallbackOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayFlatMapCallback" }>,
  context: EmitContext
): string[] {
  return emitRuntimeArrayFlatMapCallbackOperationWithReturn(operation, context, (args, index) => emitArrayCallbackReturn(operation.callbackReturnKind, operation.callbackName, args, index, context));
}

// eslint-disable-next-line max-statements -- flatMap emits callback invocation plus one-level array flattening in one loop.
function emitRuntimeArrayFlatMapCallbackOperationWithReturn(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayFlatMapCallback" }>,
  context: EmitContext,
  emitCallbackReturn: (args: readonly string[], loopIndex: number) => { readonly lines: readonly string[]; readonly value: string }
): string[] {
  useRuntimeHelper(context.runtime, "arrayLength");
  useRuntimeHelper(context.runtime, "arrayGet");
  useRuntimeHelper(context.runtime, "arrayNew");
  useRuntimeHelper(context.runtime, "arrayPush");
  useRuntimeHelper(context.runtime, "valueIsArray");
  useRuntimeHelper(context.runtime, "valueArrayPtr");
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  const source = emitRuntimeArrayPointer(operation.arrayName, context);
  const index = context.arrayIndex;
  context.arrayIndex += 1;
  const length = `%arr.flatmap.len.${index}`;
  const output = `%arr.flatmap.out.${index}`;
  const iPointer = `%arr.flatmap.i.${index}.addr`;
  const innerPointer = `%arr.flatmap.inner.i.${index}.addr`;
  const condLabel = `arr.flatmap.cond.${index}`;
  const bodyLabel = `arr.flatmap.body.${index}`;
  const flattenLabel = `arr.flatmap.flatten.${index}`;
  const scalarLabel = `arr.flatmap.scalar.${index}`;
  const innerCondLabel = `arr.flatmap.inner.cond.${index}`;
  const innerBodyLabel = `arr.flatmap.inner.body.${index}`;
  const advanceLabel = `arr.flatmap.advance.${index}`;
  const endLabel = `arr.flatmap.end.${index}`;
  const currentIndex = `%arr.flatmap.i.${index}`;
  const nextIndex = `%arr.flatmap.next.${index}`;
  const element = `%arr.flatmap.value.${index}`;
  const callbackArgs = emitArrayCallbackArguments(operation.callbackParameters, source.value, currentIndex, element, index, context);
  const callbackReturn = emitCallbackReturn(callbackArgs.values, index);
  const isArray = `%arr.flatmap.is.array.${index}`;
  const innerArray = `%arr.flatmap.inner.array.${index}`;
  const innerLength = `%arr.flatmap.inner.len.${index}`;
  const innerIndex = `%arr.flatmap.inner.i.${index}`;
  const innerNext = `%arr.flatmap.inner.next.${index}`;
  const innerValue = `%arr.flatmap.inner.value.${index}`;
  return [`  ${pointerName} = alloca ptr`, ...source.lines, `  ${length} = call i64 @arrayLength(ptr ${source.value})`, `  ${output} = call ptr @arrayNew(i64 0)`, `  store ptr ${output}, ptr ${pointerName}`, `  ${iPointer} = alloca i64`, `  ${innerPointer} = alloca i64`, `  store i64 0, ptr ${iPointer}`, `  br label %${condLabel}`, `${condLabel}:`, `  ${currentIndex} = load i64, ptr ${iPointer}`, `  %arr.flatmap.done.${index} = icmp eq i64 ${currentIndex}, ${length}`, `  br i1 %arr.flatmap.done.${index}, label %${endLabel}, label %${bodyLabel}`, `${bodyLabel}:`, `  ${element} = call i64 @arrayGet(ptr ${source.value}, i64 ${currentIndex})`, ...callbackArgs.lines, ...callbackReturn.lines, `  ${isArray} = call i1 @valueIsArray(i64 ${callbackReturn.value})`, `  br i1 ${isArray}, label %${flattenLabel}, label %${scalarLabel}`, `${scalarLabel}:`, `  call i64 @arrayPush(ptr ${output}, i64 ${callbackReturn.value})`, `  br label %${advanceLabel}`, `${flattenLabel}:`, `  ${innerArray} = call ptr @valueArrayPtr(i64 ${callbackReturn.value})`, `  ${innerLength} = call i64 @arrayLength(ptr ${innerArray})`, `  store i64 0, ptr ${innerPointer}`, `  br label %${innerCondLabel}`, `${innerCondLabel}:`, `  ${innerIndex} = load i64, ptr ${innerPointer}`, `  %arr.flatmap.inner.done.${index} = icmp eq i64 ${innerIndex}, ${innerLength}`, `  br i1 %arr.flatmap.inner.done.${index}, label %${advanceLabel}, label %${innerBodyLabel}`, `${innerBodyLabel}:`, `  ${innerValue} = call i64 @arrayGet(ptr ${innerArray}, i64 ${innerIndex})`, `  call i64 @arrayPush(ptr ${output}, i64 ${innerValue})`, `  ${innerNext} = add i64 ${innerIndex}, 1`, `  store i64 ${innerNext}, ptr ${innerPointer}`, `  br label %${innerCondLabel}`, `${advanceLabel}:`, `  ${nextIndex} = add i64 ${currentIndex}, 1`, `  store i64 ${nextIndex}, ptr ${iPointer}`, `  br label %${condLabel}`, `${endLabel}:`];
}

function emitRuntimeArrayFilterCallbackOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayFilterCallback" }>,
  context: EmitContext
): string[] {
  return emitRuntimeArrayFilterCallbackOperationWithReturn(operation, context, (args, index) => emitArrayCallbackReturn(operation.callbackReturnKind, operation.callbackName, args, index, context));
}

function emitRuntimeArrayFilterCallbackOperationWithReturn(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayFilterCallback" }>,
  context: EmitContext,
  emitCallbackReturn: (args: readonly string[], loopIndex: number) => { readonly lines: readonly string[]; readonly value: string }
): string[] {
  useRuntimeHelper(context.runtime, "arrayLength");
  useRuntimeHelper(context.runtime, "arrayGet");
  useRuntimeHelper(context.runtime, "arrayNew");
  useRuntimeHelper(context.runtime, "arrayPush");
  useRuntimeHelper(context.runtime, "valueTruthy");
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  const source = emitRuntimeArrayPointer(operation.arrayName, context);
  const index = context.arrayIndex;
  context.arrayIndex += 1;
  const length = `%arr.filter.len.${index}`;
  const output = `%arr.filter.out.${index}`;
  const iPointer = `%arr.filter.i.${index}.addr`;
  const condLabel = `arr.filter.cond.${index}`;
  const bodyLabel = `arr.filter.body.${index}`;
  const keepLabel = `arr.filter.keep.${index}`;
  const advanceLabel = `arr.filter.advance.${index}`;
  const endLabel = `arr.filter.end.${index}`;
  const currentIndex = `%arr.filter.i.${index}`;
  const nextIndex = `%arr.filter.next.${index}`;
  const element = `%arr.filter.value.${index}`;
  const callbackArgs = emitArrayCallbackArguments(operation.callbackParameters, source.value, currentIndex, element, index, context);
  const callbackReturn = emitCallbackReturn(callbackArgs.values, index);
  const keep = `%arr.filter.keep.value.${index}`;
  return [`  ${pointerName} = alloca ptr`, ...source.lines, `  ${length} = call i64 @arrayLength(ptr ${source.value})`, `  ${output} = call ptr @arrayNew(i64 0)`, `  store ptr ${output}, ptr ${pointerName}`, `  ${iPointer} = alloca i64`, `  store i64 0, ptr ${iPointer}`, `  br label %${condLabel}`, `${condLabel}:`, `  ${currentIndex} = load i64, ptr ${iPointer}`, `  %arr.filter.done.${index} = icmp eq i64 ${currentIndex}, ${length}`, `  br i1 %arr.filter.done.${index}, label %${endLabel}, label %${bodyLabel}`, `${bodyLabel}:`, `  ${element} = call i64 @arrayGet(ptr ${source.value}, i64 ${currentIndex})`, ...callbackArgs.lines, ...callbackReturn.lines, `  ${keep} = call i1 @valueTruthy(i64 ${callbackReturn.value})`, `  br i1 ${keep}, label %${keepLabel}, label %${advanceLabel}`, `${keepLabel}:`, `  call i64 @arrayPush(ptr ${output}, i64 ${element})`, `  br label %${advanceLabel}`, `${advanceLabel}:`, `  ${nextIndex} = add i64 ${currentIndex}, 1`, `  store i64 ${nextIndex}, ptr ${iPointer}`, `  br label %${condLabel}`, `${endLabel}:`];
}

function emitRuntimeArrayForEachCallbackOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayForEachCallback" }>,
  context: EmitContext
): string[] {
  return emitRuntimeArrayForEachCallbackOperationWithCall(operation, context, (args) => emitIgnoredCallbackCall(operation.callbackReturnKind, operation.callbackName, args, context));
}

function emitRuntimeArrayForEachCallbackOperationWithCall(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayForEachCallback" }>,
  context: EmitContext,
  emitCallbackCall: (args: readonly string[], loopIndex: number) => readonly string[]
): string[] {
  useRuntimeHelper(context.runtime, "arrayLength");
  useRuntimeHelper(context.runtime, "arrayGet");
  const source = emitRuntimeArrayPointer(operation.arrayName, context);
  const index = context.arrayIndex;
  context.arrayIndex += 1;
  const length = `%arr.each.len.${index}`;
  const iPointer = `%arr.each.i.${index}.addr`;
  const condLabel = `arr.each.cond.${index}`;
  const bodyLabel = `arr.each.body.${index}`;
  const endLabel = `arr.each.end.${index}`;
  const currentIndex = `%arr.each.i.${index}`;
  const nextIndex = `%arr.each.next.${index}`;
  const element = `%arr.each.value.${index}`;
  const callbackArgs = emitArrayCallbackArguments(operation.callbackParameters, source.value, currentIndex, element, index, context);
  return [...source.lines, `  ${length} = call i64 @arrayLength(ptr ${source.value})`, `  ${iPointer} = alloca i64`, `  store i64 0, ptr ${iPointer}`, `  br label %${condLabel}`, `${condLabel}:`, `  ${currentIndex} = load i64, ptr ${iPointer}`, `  %arr.each.done.${index} = icmp eq i64 ${currentIndex}, ${length}`, `  br i1 %arr.each.done.${index}, label %${endLabel}, label %${bodyLabel}`, `${bodyLabel}:`, `  ${element} = call i64 @arrayGet(ptr ${source.value}, i64 ${currentIndex})`, ...callbackArgs.lines, ...emitCallbackCall(callbackArgs.values, index), `  ${nextIndex} = add i64 ${currentIndex}, 1`, `  store i64 ${nextIndex}, ptr ${iPointer}`, `  br label %${condLabel}`, `${endLabel}:`];
}

function emitRuntimeArrayScalarCallbackOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayFindCallback" | "runtimeArrayFindIndexCallback" | "runtimeArrayReduceCallback" }>,
  context: EmitContext
): string[] {
  if (operation.kind === "runtimeArrayReduceCallback") {
    return emitRuntimeArrayReduceCallbackOperation(operation, context);
  }
  return emitRuntimeArrayFindCallbackOperation(operation, context);
}

// eslint-disable-next-line max-statements -- Find and findIndex share one loop because only result storage differs.
function emitRuntimeArrayFindCallbackOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayFindCallback" | "runtimeArrayFindIndexCallback" }>,
  context: EmitContext
): string[] {
  return emitRuntimeArrayFindCallbackOperationWithReturn(operation, context, (args, index) => emitArrayCallbackReturn(operation.callbackReturnKind, operation.callbackName, args, index, context));
}

// eslint-disable-next-line max-statements -- Find and findIndex share one loop because only result storage differs.
function emitRuntimeArrayFindCallbackOperationWithReturn(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayFindCallback" | "runtimeArrayFindIndexCallback" }>,
  context: EmitContext,
  emitCallbackReturn: (args: readonly string[], loopIndex: number) => { readonly lines: readonly string[]; readonly value: string }
): string[] {
  useRuntimeHelper(context.runtime, "arrayLength");
  useRuntimeHelper(context.runtime, "arrayGet");
  useRuntimeHelper(context.runtime, "valueTruthy");
  const isIndex = operation.kind === "runtimeArrayFindIndexCallback";
  const pointerName = variablePointerName(operation.name);
  if (isIndex) {
    context.bindings.set(operation.name, { kind: "number", value: { kind: "variable", name: pointerName } });
  } else {
    context.bindings.set(operation.name, { kind: "valueVariable", name: operation.name });
  }
  const source = emitRuntimeArrayPointer(operation.arrayName, context);
  const index = context.arrayIndex;
  context.arrayIndex += 1;
  const length = `%arr.find.len.${index}`;
  const iPointer = `%arr.find.i.${index}.addr`;
  const foundPointer = `%arr.find.found.${index}.addr`;
  const condLabel = `arr.find.cond.${index}`;
  const bodyLabel = `arr.find.body.${index}`;
  const matchLabel = `arr.find.match.${index}`;
  const advanceLabel = `arr.find.advance.${index}`;
  const endLabel = `arr.find.end.${index}`;
  const currentIndex = `%arr.find.i.${index}`;
  const nextIndex = `%arr.find.next.${index}`;
  const found = `%arr.find.found.${index}`;
  const notFound = `%arr.find.notfound.${index}`;
  const canContinue = `%arr.find.continue.${index}`;
  const element = `%arr.find.value.${index}`;
  const callbackArgs = emitArrayCallbackArguments(operation.callbackParameters, source.value, currentIndex, element, index, context);
  const callbackReturn = emitCallbackReturn(callbackArgs.values, index);
  const keep = `%arr.find.keep.${index}`;
  let initialStore = [`  ${pointerName} = alloca i64`, `  store i64 ${jsValueUndefined}, ptr ${pointerName}`];
  let matchStore = [`  store i64 ${element}, ptr ${pointerName}`];
  if (isIndex) {
    initialStore = [`  ${pointerName} = alloca double`, `  store double -1.0, ptr ${pointerName}`];
    matchStore = [`  %arr.find.index.num.${index} = uitofp i64 ${currentIndex} to double`, `  store double %arr.find.index.num.${index}, ptr ${pointerName}`];
  }
  return [...initialStore, ...source.lines, `  ${length} = call i64 @arrayLength(ptr ${source.value})`, `  ${iPointer} = alloca i64`, `  ${foundPointer} = alloca i1`, `  store i64 0, ptr ${iPointer}`, `  store i1 false, ptr ${foundPointer}`, `  br label %${condLabel}`, `${condLabel}:`, `  ${currentIndex} = load i64, ptr ${iPointer}`, `  ${found} = load i1, ptr ${foundPointer}`, `  ${notFound} = xor i1 ${found}, true`, `  %arr.find.inrange.${index} = icmp ult i64 ${currentIndex}, ${length}`, `  ${canContinue} = and i1 %arr.find.inrange.${index}, ${notFound}`, `  br i1 ${canContinue}, label %${bodyLabel}, label %${endLabel}`, `${bodyLabel}:`, `  ${element} = call i64 @arrayGet(ptr ${source.value}, i64 ${currentIndex})`, ...callbackArgs.lines, ...callbackReturn.lines, `  ${keep} = call i1 @valueTruthy(i64 ${callbackReturn.value})`, `  br i1 ${keep}, label %${matchLabel}, label %${advanceLabel}`, `${matchLabel}:`, ...matchStore, `  store i1 true, ptr ${foundPointer}`, `  br label %${advanceLabel}`, `${advanceLabel}:`, `  ${nextIndex} = add i64 ${currentIndex}, 1`, `  store i64 ${nextIndex}, ptr ${iPointer}`, `  br label %${condLabel}`, `${endLabel}:`];
}

// eslint-disable-next-line max-statements -- reduce/reduceRight share accumulator setup and directional loop emission.
function emitRuntimeArrayReduceCallbackOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayReduceCallback" }>,
  context: EmitContext
): string[] {
  return emitRuntimeArrayReduceCallbackOperationWithReturn(operation, context, (args, index) => emitArrayCallbackReturn(operation.callbackReturnKind, operation.callbackName, args, index, context));
}

// eslint-disable-next-line max-statements -- reduce/reduceRight share accumulator setup and directional loop emission.
function emitRuntimeArrayReduceCallbackOperationWithReturn(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayReduceCallback" }>,
  context: EmitContext,
  emitCallbackReturn: (args: readonly string[], loopIndex: number) => { readonly lines: readonly string[]; readonly value: string }
): string[] {
  useRuntimeHelper(context.runtime, "arrayLength");
  useRuntimeHelper(context.runtime, "arrayGet");
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "valueVariable", name: operation.name });
  const source = emitRuntimeArrayPointer(operation.arrayName, context);
  const index = context.arrayIndex;
  context.arrayIndex += 1;
  const length = `%arr.reduce.len.${index}`;
  const iPointer = `%arr.reduce.i.${index}.addr`;
  const condLabel = `arr.reduce.cond.${index}`;
  const bodyLabel = `arr.reduce.body.${index}`;
  const endLabel = `arr.reduce.end.${index}`;
  const currentIndex = `%arr.reduce.i.${index}`;
  const nextIndex = `%arr.reduce.next.${index}`;
  const element = `%arr.reduce.value.${index}`;
  let initial: JsValue | undefined;
  if (operation.initialValue !== undefined) {
    initial = emitValueExpression(operation.initialValue, context);
  }
  let startIndex = "1";
  let initialLines = [`  %arr.reduce.initial.${index} = call i64 @arrayGet(ptr ${source.value}, i64 0)`];
  if (initial !== undefined) {
    startIndex = "0";
    initialLines = [...initial.lines, `  %arr.reduce.initial.${index} = add i64 ${initial.value}, 0`];
  }
  let doneCheck = `%arr.reduce.done.${index} = icmp eq i64 ${currentIndex}, ${length}`;
  let nextLine = `  ${nextIndex} = add i64 ${currentIndex}, 1`;
  if (operation.direction === "right") {
    startIndex = `%arr.reduce.start.${index}`;
    initialLines = [`  %arr.reduce.last.${index} = sub i64 ${length}, 1`, `  %arr.reduce.initial.${index} = call i64 @arrayGet(ptr ${source.value}, i64 %arr.reduce.last.${index})`, `  ${startIndex} = sub i64 ${length}, 2`];
    if (initial !== undefined) {
      initialLines = [...initial.lines, `  %arr.reduce.initial.${index} = add i64 ${initial.value}, 0`, `  ${startIndex} = sub i64 ${length}, 1`];
    }
    doneCheck = `%arr.reduce.done.${index} = icmp slt i64 ${currentIndex}, 0`;
    nextLine = `  ${nextIndex} = sub i64 ${currentIndex}, 1`;
  }
  const callbackArgs = emitReduceCallbackArguments(operation.callbackParameters, source.value, currentIndex, pointerName, element, index, context);
  const callbackReturn = emitCallbackReturn(callbackArgs.values, index);
  return [`  ${pointerName} = alloca i64`, ...source.lines, `  ${length} = call i64 @arrayLength(ptr ${source.value})`, ...initialLines, `  store i64 %arr.reduce.initial.${index}, ptr ${pointerName}`, `  ${iPointer} = alloca i64`, `  store i64 ${startIndex}, ptr ${iPointer}`, `  br label %${condLabel}`, `${condLabel}:`, `  ${currentIndex} = load i64, ptr ${iPointer}`, `  ${doneCheck}`, `  br i1 %arr.reduce.done.${index}, label %${endLabel}, label %${bodyLabel}`, `${bodyLabel}:`, `  ${element} = call i64 @arrayGet(ptr ${source.value}, i64 ${currentIndex})`, ...callbackArgs.lines, ...callbackReturn.lines, `  store i64 ${callbackReturn.value}, ptr ${pointerName}`, nextLine, `  store i64 ${nextIndex}, ptr ${iPointer}`, `  br label %${condLabel}`, `${endLabel}:`];
}

function emitArrayCallbackArguments(
  parameters: readonly JsIrFunctionParameter[],
  sourceArray: string,
  currentIndex: string,
  element: string,
  loopIndex: number,
  context: EmitContext
): { readonly lines: readonly string[]; readonly values: readonly string[] } {
  const lines: string[] = [];
  const values: string[] = [];
  for (let parameterIndex = 0; parameterIndex < parameters.length; parameterIndex += 1) {
    // Number and value callback parameters share the uniform i64 JSValue ABI; the
    // callee unboxes numbers in its prologue.
    const value = emitArrayCallbackValueArgument(parameterIndex, sourceArray, currentIndex, element, loopIndex, context, lines);
    values.push(`i64 ${value}`);
  }
  return { lines, values };
}

function emitReduceCallbackArguments(
  parameters: readonly JsIrFunctionParameter[],
  sourceArray: string,
  currentIndex: string,
  accumulatorPointer: string,
  element: string,
  loopIndex: number,
  context: EmitContext
): { readonly lines: readonly string[]; readonly values: readonly string[] } {
  const lines: string[] = [];
  const values: string[] = [];
  const accumulator = `%arr.reduce.acc.${loopIndex}`;
  lines.push(`  ${accumulator} = load i64, ptr ${accumulatorPointer}`);
  const valueArguments = [accumulator, element];
  // Number and value callback parameters share the uniform i64 JSValue ABI; the
  // callee unboxes numbers in its prologue.
  for (let parameterIndex = 0; parameterIndex < parameters.length; parameterIndex += 1) {
    if (parameterIndex < 2) {
      values.push(`i64 ${valueArguments[parameterIndex]}`);
      continue;
    }
    const value = emitArrayCallbackValueArgument(parameterIndex - 1, sourceArray, currentIndex, element, loopIndex, context, lines);
    values.push(`i64 ${value}`);
  }
  return { lines, values };
}

function emitArrayCallbackValueArgument(
  parameterIndex: number,
  sourceArray: string,
  currentIndex: string,
  element: string,
  loopIndex: number,
  context: EmitContext,
  lines: string[]
): string {
  if (parameterIndex === 0) {
    return element;
  }
  if (parameterIndex === 1) {
    const number = `%arr.map.arg.${loopIndex}.idx.num`;
    const value = `%arr.map.arg.${loopIndex}.idx.value`;
    lines.push(`  ${number} = uitofp i64 ${currentIndex} to double`, `  ${value} = call i64 @valueBoxNumber(double ${number})`);
    return value;
  }
  const value = `%arr.map.arg.${loopIndex}.array`;
  useRuntimeHelper(context.runtime, "valueBoxArray");
  lines.push(`  ${value} = call i64 @valueBoxArray(ptr ${sourceArray})`);
  return value;
}

function emitArrayCallbackReturn(
  _returnKind: JsIrValueKind,
  callbackName: string,
  args: readonly string[],
  _loopIndex: number,
  context: EmitContext
): { readonly lines: readonly string[]; readonly value: string } {
  return emitGeneratedJsCall(callbackName, args, context);
}

function emitFunctionObjectCallbackReturn(
  functionValue: string,
  args: readonly string[],
  loopIndex: number,
  context: EmitContext
): { readonly lines: readonly string[]; readonly value: string } {
  const rawArgs = args.map((arg) => arg.replace(/^i64 /, ""));
  const argv = `%arr.map.argv.${loopIndex}`;
  const lines = [`  ${argv} = alloca i64, i64 ${rawArgs.length}`];
  for (let i = 0; i < rawArgs.length; i += 1) {
    const slot = `%arr.map.argv.${loopIndex}.${i}`;
    lines.push(`  ${slot} = getelementptr i64, ptr ${argv}, i64 ${i}`, `  store i64 ${rawArgs[i]}, ptr ${slot}`);
  }
  const generated = emitGeneratedJsCall(
    "jsCall",
    [`i64 ${functionValue}`, `i64 ${rawArgs.length}`, `ptr ${argv}`, `i64 ${jsValueUndefined}`],
    context
  );
  lines.push(...generated.lines);
  return { lines, value: generated.value };
}

function emitIgnoredCallbackCall(
  _returnKind: JsIrValueKind | "void",
  callbackName: string,
  args: readonly string[],
  context: EmitContext
): readonly string[] {
  return emitGeneratedJsCall(callbackName, args, context).lines;
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

const errorConstructorOrder = ["Error", "TypeError", "RangeError", "EvalError", "URIError", "SyntaxError"] as const;
const errorClassIds = new Map<string, number>(errorConstructorOrder.map((name, index) => [name, index + 1]));

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

function emitRuntimeStringSplitOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeStringSplit" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  const receiver = emitStringExpression(operation.receiver, context);
  const separator = emitStringExpression(operation.separator, context);
  const result = `%arr.rt.${context.arrayIndex}`;
  context.arrayIndex += 1;
  let limitLines: readonly string[] = [];
  let limitValue = "-1";
  if (operation.limit !== undefined) {
    const limit = emitArrayIndex(operation.limit, context);
    limitLines = limit.lines;
    limitValue = limit.value;
  }
  useRuntimeHelper(context.runtime, "stringSplit");
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
  const receiver = emitStringExpression(operation.receiver, context);
  const regex = emitValueExpression(operation.regex, context);
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
  useRuntimeHelper(context.runtime, "valueBoxString");
  useRuntimeHelper(context.runtime, "regexSplit");
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

function emitRuntimeArrayFromOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayFrom" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  let source = emitRuntimeArrayPointer(operation.targetName, context);
  let helper: RuntimeHelper = "arrayFromArray";
  if (operation.targetKind === "object") {
    source = emitRuntimeObjectPointer(operation.targetName, context);
    helper = "arrayFromObject";
  }
  const result = `%arr.from.${context.arrayIndex}`;
  context.arrayIndex += 1;
  useRuntimeHelper(context.runtime, helper);
  return [`  ${pointerName} = alloca ptr`, ...source.lines, `  ${result} = call ptr @${helper}(ptr ${source.value})`, `  store ptr ${result}, ptr ${pointerName}`];
}

function emitRuntimeArrayFromValueOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayFromValue" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  const source = emitValueExpression(operation.source, context);
  let mapper: JsValue = { lines: [], value: jsValueUndefined };
  if (operation.mapper !== undefined) {
    mapper = emitValueExpression(operation.mapper, context);
  }
  let thisArg: JsValue = { lines: [], value: jsValueUndefined };
  if (operation.thisArg !== undefined) {
    thisArg = emitValueExpression(operation.thisArg, context);
  }
  useRuntimeHelper(context.runtime, "arrayFromValue");
  useRuntimeHelper(context.runtime, "valueArrayPtr");
  const generated = emitGeneratedJsCall("arrayFromValue", [`i64 ${source.value}`, `i64 ${mapper.value}`, `i64 ${thisArg.value}`], context);
  const arrayPtr = `%arr.from.value.${context.arrayIndex}`;
  context.arrayIndex += 1;
  return [
    `  ${pointerName} = alloca ptr`,
    ...source.lines,
    ...mapper.lines,
    `  call void @gcRootPush(i64 ${mapper.value})`,
    ...thisArg.lines,
    `  call void @gcRootPush(i64 ${thisArg.value})`,
    ...generated.lines,
    `  ${arrayPtr} = call ptr @valueArrayPtr(i64 ${generated.value})`,
    `  store ptr ${arrayPtr}, ptr ${pointerName}`
  ];
}

// Consumes a Map/Set through its protocol-compatible collection iterator into a new runtime array.
// eslint-disable-next-line max-statements -- Iterator setup, optional mapping, and collection are one control-flow operation.
function emitRuntimeArrayFromCollectionOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArrayFromCollection" }>,
  context: EmitContext
): string[] {
  const index = context.arrayIndex;
  context.arrayIndex += 1;
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  const collection = emitRuntimeCollectionPointer(operation.collectionName, context);
  let mapper: JsValue = { lines: [], value: jsValueUndefined };
  if (operation.mapper !== undefined) {
    mapper = emitValueExpression(operation.mapper, context);
  }
  let thisArg: JsValue = { lines: [], value: jsValueUndefined };
  if (operation.thisArg !== undefined) {
    thisArg = emitValueExpression(operation.thisArg, context);
  }
  const modeCode = runtimeIteratorKindCode(operation.iterationKind);
  let sourceCode = 3;
  if (operation.sourceKind === "map") {
    sourceCode = 2;
  }
  const iteratorCall = emitGeneratedJsCall("getCollectionIterator", [`ptr ${collection.value}`, `i64 ${sourceCode}`, `i64 ${modeCode}`], context);
  const iterator = iteratorCall.value;
  const out = `%arr.from.col.out.${index}`;
  const outRoot = `%arr.from.col.out.root.${index}`;
  const loopFrame = `%arr.from.col.loop.frame.${index}`;
  useRuntimeHelper(context.runtime, "getCollectionIterator");
  useRuntimeHelper(context.runtime, "callIteratorNext");
  useRuntimeHelper(context.runtime, "valueObjectGet");
  useRuntimeHelper(context.runtime, "valueTruthy");
  useRuntimeHelper(context.runtime, "arrayNew");
  useRuntimeHelper(context.runtime, "arrayPush");
  const nextCall = emitGeneratedJsCall("callIteratorNext", [`i64 ${iterator}`], context);
  const doneKey = addStringConstant("done", context);
  const valueKey = addStringConstant("value", context);
  const doneValue = `%arr.from.col.done.${index}`;
  const isDone = `%arr.from.col.is.done.${index}`;
  const item = `%arr.from.col.item.${index}`;
  const mappedItem = `%arr.from.col.mapped.${index}`;
  const currentIndex = `%arr.from.col.index.${index}`;
  const nextIndex = `%arr.from.col.index.next.${index}`;
  const indexPointer = `%arr.from.col.index.addr.${index}`;
  const condLabel = `arr.from.col.cond.${index}`;
  const bodyLabel = `arr.from.col.body.${index}`;
  const endLabel = `arr.from.col.end.${index}`;
  let pushedValue = item;
  const mappingLines: string[] = [];
  if (operation.mapper !== undefined) {
    useRuntimeHelper(context.runtime, "jsCall");
    const indexNumber = `%arr.from.col.index.number.${index}`;
    const indexValue = `%arr.from.col.index.value.${index}`;
    const argv = `%arr.from.col.map.argv.${index}`;
    const arg0 = `%arr.from.col.map.arg0.${index}`;
    const arg1 = `%arr.from.col.map.arg1.${index}`;
    const mapped = emitGeneratedJsCall("jsCall", [`i64 ${mapper.value}`, "i64 2", `ptr ${argv}`, `i64 ${thisArg.value}`], context);
    mappingLines.push(
      `  ${indexNumber} = uitofp i64 ${currentIndex} to double`,
      `  ${indexValue} = call i64 @valueBoxNumber(double ${indexNumber})`,
      `  ${argv} = alloca i64, i64 2`,
      `  ${arg0} = getelementptr i64, ptr ${argv}, i64 0`,
      `  store i64 ${item}, ptr ${arg0}`,
      `  ${arg1} = getelementptr i64, ptr ${argv}, i64 1`,
      `  store i64 ${indexValue}, ptr ${arg1}`,
      ...mapped.lines,
      `  ${mappedItem} = add i64 ${mapped.value}, 0`
    );
    pushedValue = mappedItem;
  }
  return [
    `  ${pointerName} = alloca ptr`,
    ...collection.lines,
    ...mapper.lines,
    `  call void @gcRootPush(i64 ${mapper.value})`,
    ...thisArg.lines,
    `  call void @gcRootPush(i64 ${thisArg.value})`,
    ...iteratorCall.lines,
    `  call void @gcRootPush(i64 ${iterator})`,
    `  ${out} = call ptr @arrayNew(i64 0)`,
    `  store ptr ${out}, ptr ${pointerName}`,
    `  ${outRoot} = call i64 @valueBoxArray(ptr ${out})`,
    `  call void @gcRootPush(i64 ${outRoot})`,
    `  ${indexPointer} = alloca i64`,
    `  store i64 0, ptr ${indexPointer}`,
    `  ${loopFrame} = call i64 @gcRootSave()`,
    `  br label %${condLabel}`,
    `${condLabel}:`,
    `  call void @gcRootRestore(i64 ${loopFrame})`,
    `  call void @gcSafepoint()`,
    ...nextCall.lines,
    `  ${doneValue} = call i64 @valueObjectGet(i64 ${nextCall.value}, i64 4, ptr ${doneKey})`,
    `  ${isDone} = call i1 @valueTruthy(i64 ${doneValue})`,
    `  br i1 ${isDone}, label %${endLabel}, label %${bodyLabel}`,
    `${bodyLabel}:`,
    `  ${item} = call i64 @valueObjectGet(i64 ${nextCall.value}, i64 5, ptr ${valueKey})`,
    `  ${currentIndex} = load i64, ptr ${indexPointer}`,
    ...mappingLines,
    `  call void @gcRootPush(i64 ${pushedValue})`,
    `  call i64 @arrayPush(ptr ${out}, i64 ${pushedValue})`,
    `  ${nextIndex} = add i64 ${currentIndex}, 1`,
    `  store i64 ${nextIndex}, ptr ${indexPointer}`,
    `  br label %${condLabel}`,
    `${endLabel}:`
  ];
}

function emitRuntimeCollectionFromIterableOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeMapFromIterable" | "runtimeSetFromIterable" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  let bindingKind: "runtimeMap" | "runtimeSet" = "runtimeSet";
  let helper: RuntimeHelper = "setFromIterable";
  if (operation.kind === "runtimeMapFromIterable") {
    bindingKind = "runtimeMap";
    helper = "mapFromIterable";
  }
  context.bindings.set(operation.name, { kind: bindingKind, name: operation.name });
  const iterable = emitValueExpression(operation.iterable, context);
  const messageConstant = addStringConstant(operation.notIterableMessage, context);
  const message = `%${operation.name}.not.iterable`;
  useRuntimeHelper(context.runtime, helper);
  useRuntimeHelper(context.runtime, "valueBoxString");
  const generated = emitGeneratedJsCall(helper, [`i64 ${iterable.value}`, `i64 ${message}`], context);
  const collection = `%${operation.name}.collection`;
  return [
    `  ${pointerName} = alloca ptr`,
    ...iterable.lines,
    `  call void @gcRootPush(i64 ${iterable.value})`,
    `  ${message} = call i64 @valueBoxString(ptr ${messageConstant}, i64 ${utf8ByteLength(operation.notIterableMessage)})`,
    ...generated.lines,
    `  ${collection} = inttoptr i64 ${generated.value} to ptr`,
    `  store ptr ${collection}, ptr ${pointerName}`
  ];
}

// Copies entries/values from one collection into a new Map or Set using the
// protocol-compatible collection iterator (entries for maps, values for sets).
// eslint-disable-next-line max-statements -- Collection copy emits iterator acquisition, next loop, and Map/Set insertion together.
function emitRuntimeCollectionFromCollectionOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeMapFromCollection" | "runtimeSetFromCollection" }>,
  context: EmitContext
): string[] {
  const index = context.arrayIndex;
  context.arrayIndex += 1;
  const pointerName = variablePointerName(operation.name);
  let bindingKind: "runtimeMap" | "runtimeSet" = "runtimeSet";
  if (operation.kind === "runtimeMapFromCollection") {
    bindingKind = "runtimeMap";
  }
  context.bindings.set(operation.name, { kind: bindingKind, name: operation.name });
  const source = emitRuntimeCollectionPointer(operation.sourceName, context);
  let sourceCode = 3;
  let iterationKind = 1;
  if (operation.sourceKind === "map") {
    sourceCode = 2;
    iterationKind = 2;
  }
  const iteratorCall = emitGeneratedJsCall("getCollectionIterator", [`ptr ${source.value}`, `i64 ${sourceCode}`, `i64 ${iterationKind}`], context);
  const iterator = iteratorCall.value;
  const collection = `%${operation.name}.collection`;
  const collectionRoot = `%${operation.name}.collection.root`;
  const loopFrame = `%col.from.col.loop.frame.${index}`;
  useRuntimeHelper(context.runtime, "getCollectionIterator");
  useRuntimeHelper(context.runtime, "callIteratorNext");
  useRuntimeHelper(context.runtime, "valueObjectGet");
  useRuntimeHelper(context.runtime, "valueTruthy");
  useRuntimeHelper(context.runtime, "collectionNew");
  useRuntimeHelper(context.runtime, "collectionSet");
  const nextCall = emitGeneratedJsCall("callIteratorNext", [`i64 ${iterator}`], context);
  const doneKey = addStringConstant("done", context);
  const valueKey = addStringConstant("value", context);
  const doneValue = `%col.from.col.done.${index}`;
  const isDone = `%col.from.col.is.done.${index}`;
  const item = `%col.from.col.item.${index}`;
  const condLabel = `col.from.col.cond.${index}`;
  const bodyLabel = `col.from.col.body.${index}`;
  const endLabel = `col.from.col.end.${index}`;
  const lines = [
    `  ${pointerName} = alloca ptr`,
    ...source.lines,
    `  ${collection} = call ptr @collectionNew()`,
    `  store ptr ${collection}, ptr ${pointerName}`,
    `  ${collectionRoot} = call i64 @valueBoxObject(ptr ${collection})`,
    `  call void @gcRootPush(i64 ${collectionRoot})`,
    ...iteratorCall.lines,
    `  call void @gcRootPush(i64 ${iterator})`,
    `  ${loopFrame} = call i64 @gcRootSave()`,
    `  br label %${condLabel}`,
    `${condLabel}:`,
    `  call void @gcRootRestore(i64 ${loopFrame})`,
    `  call void @gcSafepoint()`,
    ...nextCall.lines,
    `  ${doneValue} = call i64 @valueObjectGet(i64 ${nextCall.value}, i64 4, ptr ${doneKey})`,
    `  ${isDone} = call i1 @valueTruthy(i64 ${doneValue})`,
    `  br i1 ${isDone}, label %${endLabel}, label %${bodyLabel}`,
    `${bodyLabel}:`,
    `  ${item} = call i64 @valueObjectGet(i64 ${nextCall.value}, i64 5, ptr ${valueKey})`,
    `  call void @gcRootPush(i64 ${item})`
  ];
  if (operation.kind === "runtimeMapFromCollection") {
    const keyConstant = addStringConstant("0", context);
    const valueConstant = addStringConstant("1", context);
    const key = `%col.from.col.key.${index}`;
    const value = `%col.from.col.value.${index}`;
    useRuntimeHelper(context.runtime, "valueArrayGet");
    useRuntimeHelper(context.runtime, "valueIsArray");
    useRuntimeHelper(context.runtime, "valueIsObject");
    useRuntimeHelper(context.runtime, "valueObjectGet");
    // Entry objects and arrays both support property keys "0"/"1".
    lines.push(
      `  ${key} = call i64 @valueArrayGet(i64 ${item}, i64 0, i64 1, ptr ${keyConstant})`,
      `  ${value} = call i64 @valueArrayGet(i64 ${item}, i64 1, i64 1, ptr ${valueConstant})`,
      `  call void @collectionSet(ptr ${collection}, i64 ${key}, i64 ${value})`
    );
  } else {
    lines.push(`  call void @collectionSet(ptr ${collection}, i64 ${item}, i64 ${jsValueTrue})`);
  }
  lines.push(`  br label %${condLabel}`, `${endLabel}:`);
  return lines;
}

function emitRuntimeArraySortOperation(
  operation: Extract<JsIrOperation, { readonly kind: "runtimeArraySort" }>,
  context: EmitContext
): string[] {
  const pointerName = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "runtimeArray", name: operation.name });
  const array = emitRuntimeArrayPointer(operation.arrayName, context);
  if (operation.callbackName === undefined || operation.callbackParameters === undefined || operation.callbackReturnKind === undefined) {
    useRuntimeHelper(context.runtime, "arraySortDefault");
    return [`  ${pointerName} = alloca ptr`, ...array.lines, `  call void @arraySortDefault(ptr ${array.value})`, `  store ptr ${array.value}, ptr ${pointerName}`];
  }
  const sortLines = emitRuntimeArrayComparatorSort(array.value, operation.callbackName, operation.callbackParameters, operation.callbackReturnKind, context);
  return [`  ${pointerName} = alloca ptr`, ...array.lines, ...sortLines, `  store ptr ${array.value}, ptr ${pointerName}`];
}

// eslint-disable-next-line max-statements -- Comparator sort owns nested loop labels plus callback invocation.
function emitRuntimeArrayComparatorSort(
  array: string,
  callbackName: string,
  callbackParameters: readonly JsIrFunctionParameter[],
  callbackReturnKind: JsIrValueKind,
  context: EmitContext
): string[] {
  useRuntimeHelper(context.runtime, "arrayLength");
  useRuntimeHelper(context.runtime, "arrayGet");
  useRuntimeHelper(context.runtime, "arraySet");
  useRuntimeHelper(context.runtime, "valueToNumber");
  const index = context.arrayIndex;
  context.arrayIndex += 1;
  const length = `%arr.sort.len.${index}`;
  const iPointer = `%arr.sort.i.${index}.addr`;
  const jPointer = `%arr.sort.j.${index}.addr`;
  const outerCond = `arr.sort.outer.cond.${index}`;
  const outerBody = `arr.sort.outer.body.${index}`;
  const innerCond = `arr.sort.inner.cond.${index}`;
  const innerBody = `arr.sort.inner.body.${index}`;
  const swapLabel = `arr.sort.swap.${index}`;
  const advanceLabel = `arr.sort.advance.${index}`;
  const outerAdvance = `arr.sort.outer.advance.${index}`;
  const endLabel = `arr.sort.end.${index}`;
  const i = `%arr.sort.i.${index}`;
  const j = `%arr.sort.j.${index}`;
  const nextJ = `%arr.sort.next.j.${index}`;
  const nextI = `%arr.sort.next.i.${index}`;
  const limit = `%arr.sort.limit.${index}`;
  const left = `%arr.sort.left.${index}`;
  const right = `%arr.sort.right.${index}`;
  const callbackArgs = emitSortCallbackArguments(callbackParameters, left, right);
  const callbackReturn = emitArrayCallbackReturn(callbackReturnKind, callbackName, callbackArgs.values, index, context);
  const order = `%arr.sort.order.${index}`;
  const shouldSwap = `%arr.sort.should.swap.${index}`;
  return [`  ${length} = call i64 @arrayLength(ptr ${array})`, `  ${iPointer} = alloca i64`, `  ${jPointer} = alloca i64`, `  store i64 0, ptr ${iPointer}`, `  br label %${outerCond}`, `${outerCond}:`, `  ${i} = load i64, ptr ${iPointer}`, `  %arr.sort.outer.done.${index} = icmp uge i64 ${i}, ${length}`, `  br i1 %arr.sort.outer.done.${index}, label %${endLabel}, label %${outerBody}`, `${outerBody}:`, `  store i64 0, ptr ${jPointer}`, `  br label %${innerCond}`, `${innerCond}:`, `  ${j} = load i64, ptr ${jPointer}`, `  ${limit} = sub i64 ${length}, 1`, `  %arr.sort.inner.done.${index} = icmp uge i64 ${j}, ${limit}`, `  br i1 %arr.sort.inner.done.${index}, label %${outerAdvance}, label %${innerBody}`, `${innerBody}:`, `  ${nextJ} = add i64 ${j}, 1`, `  ${left} = call i64 @arrayGet(ptr ${array}, i64 ${j})`, `  ${right} = call i64 @arrayGet(ptr ${array}, i64 ${nextJ})`, ...callbackArgs.lines, ...callbackReturn.lines, `  ${order} = call double @valueToNumber(i64 ${callbackReturn.value})`, `  ${shouldSwap} = fcmp ogt double ${order}, 0.0`, `  br i1 ${shouldSwap}, label %${swapLabel}, label %${advanceLabel}`, `${swapLabel}:`, `  call void @arraySet(ptr ${array}, i64 ${j}, i64 ${right})`, `  call void @arraySet(ptr ${array}, i64 ${nextJ}, i64 ${left})`, `  br label %${advanceLabel}`, `${advanceLabel}:`, `  store i64 ${nextJ}, ptr ${jPointer}`, `  br label %${innerCond}`, `${outerAdvance}:`, `  ${nextI} = add i64 ${i}, 1`, `  store i64 ${nextI}, ptr ${iPointer}`, `  br label %${outerCond}`, `${endLabel}:`];
}

function emitSortCallbackArguments(
  parameters: readonly JsIrFunctionParameter[],
  left: string,
  right: string
): { readonly lines: readonly string[]; readonly values: readonly string[] } {
  const lines: string[] = [];
  const values: string[] = [];
  const rawValues = [left, right];
  // Number and value callback parameters share the uniform i64 JSValue ABI; the
  // callee unboxes numbers in its prologue.
  for (let parameterIndex = 0; parameterIndex < parameters.length; parameterIndex += 1) {
    const raw = rawValues[parameterIndex] ?? jsValueUndefined;
    values.push(`i64 ${raw}`);
  }
  return { lines, values };
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

// Materializes a JSValue into a stable memory slot and binds the name to it, so
// every later reference loads the same value (used for class instance locals).
function emitLetValueOperation(
  operation: Extract<JsIrOperation, { readonly kind: "letValue" }>,
  context: EmitContext
): string[] {
  const value = emitValueExpression(operation.value, context);
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

// Emits the TypeError throw shared by private field reads and writes: builds a
// native TypeError object with the given literal message and routes it to the
// nearest exception handler, exactly like a `throwValue` operation.
function emitPrivateFieldBrandThrow(message: string, labelPrefix: string, context: EmitContext): string[] {
  const messageConstant = addStringConstant(message, context);
  const nameConstant = addStringConstant("TypeError", context);
  const messageValue = `%${labelPrefix}.msg`;
  const errorObject = `%${labelPrefix}.err`;
  const errorBoxed = `%${labelPrefix}.boxed`;
  useRuntimeHelper(context.runtime, "valueBoxString");
  useRuntimeHelper(context.runtime, "errorNew");
  useRuntimeHelper(context.runtime, "valueBoxObject");
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
  const value = emitValueExpression(operation.value, context);
  const keyConstant = addStringConstant(operation.key, context);
  const keyLength = utf8ByteLength(operation.key);
  const index = context.objectIndex;
  context.objectIndex += 1;
  const has = `%priv.has.${index}`;
  const okLabel = `priv.ok.${index}`;
  const throwLabel = `priv.throw.${index}`;
  useRuntimeHelper(context.runtime, "valueObjectHasOwn");
  useRuntimeHelper(context.runtime, "valueObjectSet");
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

function emitValueObjectSetPrototypeOperation(
  operation: Extract<JsIrOperation, { readonly kind: "valueObjectSetPrototype" }>,
  context: EmitContext
): string[] {
  const target = emitNamedValueBinding(operation.targetName, context);
  const prototype = emitNamedValueBinding(operation.prototypeName, context);
  const targetPointer = `%class.prototype.target.${context.objectIndex}`;
  const prototypePointer = `%class.prototype.base.${context.objectIndex}`;
  context.objectIndex += 1;
  useRuntimeHelper(context.runtime, "valueObjectPtr");
  useRuntimeHelper(context.runtime, "objectSetPrototype");
  return [
    ...target.lines,
    ...prototype.lines,
    `  ${targetPointer} = call ptr @valueObjectPtr(i64 ${target.value})`,
    `  ${prototypePointer} = call ptr @valueObjectPtr(i64 ${prototype.value})`,
    `  call void @objectSetPrototype(ptr ${targetPointer}, ptr ${prototypePointer})`
  ];
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
  const args = emitCallArguments(operation.arguments, context);
  return [...args.lines, ...emitGeneratedJsCall(operation.name, args.values, context).lines];
}

function emitCallExpressionResult(expression: { readonly kind: "call"; readonly name: string; readonly arguments: readonly JsIrNumberExpression[] }, context: EmitContext): { readonly lines: string[]; readonly value: string } {
  const lines: string[] = [];
  const argValues: string[] = [];
  for (const arg of expression.arguments) {
    const result = emitNumberExpression(arg, context);
    const argIndex = context.numIndex;
    context.numIndex += 1;
    const boxed = `%arg.num.${argIndex}`;
    lines.push(...result.lines, `  ${boxed} = call i64 @valueBoxNumber(double ${llvmDoubleBitcastOperand(result.value)})`);
    argValues.push(`i64 ${boxed}`);
  }
  const generated = emitGeneratedJsCall(expression.name, argValues, context);
  const number = `%call.${context.numIndex}.num`;
  context.numIndex += 1;
  lines.push(...generated.lines, `  ${number} = call double @valueNumber(i64 ${generated.value})`);
  return { lines, value: number };
}

function emitNumberCallExpressionResult(expression: { readonly kind: "call"; readonly name: string; readonly arguments: readonly JsIrCallArgument[] }, context: EmitContext): { readonly lines: string[]; readonly value: string } {
  const args = emitCallArguments(expression.arguments, context);
  const generated = emitGeneratedJsCall(expression.name, args.values, context);
  const number = `%call.${context.numIndex}.num`;
  context.numIndex += 1;
  return {
    lines: [...args.lines, ...generated.lines, `  ${number} = call double @valueNumber(i64 ${generated.value})`],
    value: number
  };
}

function emitStringCallExpressionResult(expression: { readonly kind: "call"; readonly name: string; readonly arguments: readonly JsIrCallArgument[] }, context: EmitContext): StringValue {
  const args = emitCallArguments(expression.arguments, context);
  const generated = emitGeneratedJsCall(expression.name, args.values, context);
  const value = `%call.${context.stringIndex}.ptr`;
  const length = `%call.${context.stringIndex}.len`;
  context.stringIndex += 1;
  useRuntimeHelper(context.runtime, "valueStringPtr");
  useRuntimeHelper(context.runtime, "valueStringLength");
  return {
    lines: [
      ...args.lines,
      ...generated.lines,
      `  ${value} = call ptr @valueStringPtr(i64 ${generated.value})`,
      `  ${length} = call i64 @valueStringLength(i64 ${generated.value})`
    ],
    value,
    length
  };
}

function emitNewInstanceValueExpression(
  expression: Extract<JsIrValueExpression, { readonly kind: "newInstance" }>,
  context: EmitContext
): JsValue {
  const args = emitCallArguments(expression.arguments, context);
  const index = context.objectIndex;
  context.objectIndex += 1;
  const object = `%instance.obj.${index}`;
  const instance = `%instance.${index}`;
  useRuntimeHelper(context.runtime, "objectNew");
  useRuntimeHelper(context.runtime, "valueBoxObject");
  const prototypePointer = `%instance.prototype.${index}`;
  const prototypeLines: string[] = [];
  if (context.bindings.has(expression.prototypeName)) {
    useRuntimeHelper(context.runtime, "valueObjectPtr");
    useRuntimeHelper(context.runtime, "objectSetPrototype");
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

function emitCallArguments(args: readonly JsIrCallArgument[], context: EmitContext): { readonly lines: string[]; readonly values: string[] } {
  const lines: string[] = [];
  const values: string[] = [];
  for (const arg of args) {
    if (arg.valueKind === "string") {
      const result = emitStringExpression(arg.value, context);
      const index = context.stringIndex;
      context.stringIndex += 1;
      const boxed = `%arg.str.${index}`;
      useRuntimeHelper(context.runtime, "valueBoxString");
      lines.push(...result.lines, `  ${boxed} = call i64 @valueBoxString(ptr ${result.value}, i64 ${result.length})`);
      values.push(`i64 ${boxed}`);
      continue;
    }
    if (arg.valueKind === "value") {
      const result = emitValueExpression(arg.value, context);
      lines.push(...result.lines);
      values.push(`i64 ${result.value}`);
      continue;
    }
    const result = emitNumberExpression(arg.value, context);
    const index = context.numIndex;
    context.numIndex += 1;
    const boxed = `%arg.num.${index}`;
    lines.push(...result.lines, `  ${boxed} = call i64 @valueBoxNumber(double ${llvmDoubleBitcastOperand(result.value)})`);
    values.push(`i64 ${boxed}`);
  }
  return { lines, values };
}

function emitNumberReturnOperation(operation: { readonly kind: "returnNumber"; readonly expression: JsIrNumberExpression }, context: EmitContext): string[] {
  const result = emitNumberExpression(operation.expression, context);
  const index = context.numIndex;
  context.numIndex += 1;
  const boxed = `%ret.num.${index}`;
  return [...result.lines, `  ${boxed} = call i64 @valueBoxNumber(double ${llvmDoubleBitcastOperand(result.value)})`, ...emitNormalGeneratedReturn(boxed, context)];
}

function emitStringReturnOperation(operation: { readonly kind: "returnString"; readonly expression: JsIrStringExpression }, context: EmitContext): string[] {
  const result = emitStringExpression(operation.expression, context);
  const index = context.stringIndex;
  context.stringIndex += 1;
  const boxed = `%ret.str.${index}`;
  useRuntimeHelper(context.runtime, "valueBoxString");
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
  const result = emitValueExpression(operation.expression, context);
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
      return emitValueExpression(binding.value, context);
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
    const args = emitCallArguments(expression.arguments, context);
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
    const pattern = emitStringExpression(expression.pattern, context);
    const flags = emitStringExpression(expression.flags, context);
    const patternValue = `%regex.pattern.${context.callIndex}`;
    const flagsValue = `%regex.flags.${context.callIndex}`;
    useRuntimeHelper(context.runtime, "valueBoxString");
    useRuntimeHelper(context.runtime, "regexCompile");
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
    const regex = emitValueExpression(expression.regex, context);
    const input = emitStringExpression(expression.input, context);
    const inputValue = `%regex.input.${context.callIndex}`;
    useRuntimeHelper(context.runtime, "valueBoxString");
    let helper: "regexExec" | "regexMatch" = "regexExec";
    if (expression.kind === "regexMatch") {
      helper = "regexMatch";
    }
    useRuntimeHelper(context.runtime, helper);
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
    useRuntimeHelper(context.runtime, "functionObjectNew");
    const captures = expression.definition.captures ?? [];
    const lines: string[] = [];
    let functionName = jsValueUndefined;
    if (expression.definition.inferredName !== undefined) {
      const name = emitStringExpression({ kind: "literal", value: expression.definition.inferredName }, context);
      functionName = `%fnobj.name.${index}`;
      useRuntimeHelper(context.runtime, "valueBoxString");
      lines.push(
        ...name.lines,
        `  ${functionName} = call i64 @valueBoxString(ptr ${name.value}, i64 ${name.length})`,
        emitRootStackPush(functionName, context)
      );
    }
    let environment = "null";
    if (captures.length > 0) {
      useRuntimeHelper(context.runtime, "environmentNew");
      useRuntimeHelper(context.runtime, "environmentSet");
      const emittedCaptures = captures.map((capture) => emitValueExpression(capture.value, context));
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
    useRuntimeHelper(context.runtime, "arrayAt");
    return { lines: [...array.lines, ...atIndex.lines, `  ${value} = call i64 @arrayAt(ptr ${array.value}, i64 ${atIndex.value})`], value };
  }

  if (expression.kind === "valuePlus") {
    const left = emitValueExpression(expression.left, context);
    const right = emitValueExpression(expression.right, context);
    const value = `%value.${context.numIndex}`;
    context.numIndex += 1;
    useRuntimeHelper(context.runtime, "valuePlus");
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
    const text = emitValueExpression(expression.text, context);
    let reviver: JsValue = { lines: [], value: jsValueUndefined };
    if (expression.reviver !== undefined) {
      reviver = emitValueExpression(expression.reviver, context);
    }
    useRuntimeHelper(context.runtime, "jsonParse");
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
    const source = emitValueExpression(expression.value, context);
    const lines = [...source.lines, emitRootStackPush(source.value, context)];
    let filter = "null";
    if (expression.replacerName !== undefined) {
      const filterArray = emitRuntimeArrayPointer(expression.replacerName, context);
      lines.push(...filterArray.lines);
      filter = filterArray.value;
    }
    useRuntimeHelper(context.runtime, "jsonStringify");
    const call = emitGeneratedJsCall("jsonStringify", [`i64 ${source.value}`, `ptr ${filter}`, `i64 ${expression.indent}`], context);
    lines.push(...call.lines);
    return { lines, value: call.value };
  }

  if (expression.kind === "runtimeMapGet") {
    const collection = emitRuntimeCollectionPointer(expression.mapName, context);
    const key = emitValueExpression(expression.key, context);
    const value = `%value.${context.numIndex}`;
    context.numIndex += 1;
    useRuntimeHelper(context.runtime, "collectionGet");
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
    const inner = emitValueExpression(expression.expression, context);
    return { lines: inner.lines, value: jsValueUndefined };
  }

  if (expression.kind === "sequence") {
    const left = emitValueExpression(expression.left, context);
    const right = emitValueExpression(expression.right, context);
    return { lines: [...left.lines, ...right.lines], value: right.value };
  }

  if (expression.kind === "stringStartsWith" || expression.kind === "stringEndsWith") {
    const receiver = emitStringExpression(expression.receiver, context);
    const search = emitStringExpression(expression.search, context);
    let helper: "stringStartsWith" | "stringStartsWithAt" | "stringEndsWith" = "stringEndsWith";
    if (expression.kind === "stringStartsWith") {
      helper = "stringStartsWith";
    }
    if (expression.position !== undefined && expression.kind === "stringStartsWith") {
      helper = "stringStartsWithAt";
    }
    useRuntimeHelper(context.runtime, helper);
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
    const receiver = emitStringExpression(expression.receiver, context);
    const index = emitArrayIndex(expression.index, context);
    const doubleValue = `%num.${context.numIndex}`;
    context.numIndex += 1;
    useRuntimeHelper(context.runtime, "stringCharCodeAt");
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
    const receiver = emitStringExpression(expression.receiver, context);
    const search = emitStringExpression(expression.search, context);
    const doubleValue = `%num.${context.numIndex}`;
    context.numIndex += 1;
    const value = `%value.${context.numIndex}`;
    context.numIndex += 1;
    if (expression.kind === "stringLastIndexOf") {
      useRuntimeHelper(context.runtime, "stringLastIndexOf");
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
    useRuntimeHelper(context.runtime, "stringIndexOf");
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
    const values = expression.elements.map((element) => emitValueExpression(element, context));
    for (const value of values) {
      lines.push(...value.lines);
    }
    const { arrayIndex } = context;
    context.arrayIndex += 1;
    const arrayName = `%rest.array.${arrayIndex}`;
    const lengthValue = expression.elements.length;
    useRuntimeHelper(context.runtime, "arrayNew");
    useRuntimeHelper(context.runtime, "arraySet");
    lines.push(`  ${arrayName} = call ptr @arrayNew(i64 ${lengthValue})`);
    for (let i = 0; i < values.length; i++) {
      lines.push(`  call void @arraySet(ptr ${arrayName}, i64 ${i}, i64 ${values[i].value})`);
    }
    const boxIndex = context.numIndex;
    context.numIndex += 1;
    const boxName = `%value.${boxIndex}`;
    useRuntimeHelper(context.runtime, "valueBoxArray");
    lines.push(`  ${boxName} = call i64 @valueBoxArray(ptr ${arrayName})`);
    return { lines, value: boxName };
  }

  if (expression.kind === "boxedPrimitive") {
    const lines: string[] = [];
    useRuntimeHelper(context.runtime, "objectNew");
    useRuntimeHelper(context.runtime, "objectSet");
    useRuntimeHelper(context.runtime, "valueBoxObject");
    if (expression.storeLength === true) {
      useRuntimeHelper(context.runtime, "valueStringLength");
    }
    const inner = emitValueExpression(expression.inner, context);
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
    const receiver = emitValueExpression(expression.receiver, context);
    lines.push(...receiver.lines);
    const { objectIndex } = context;
    context.objectIndex += 1;
    const objectPtr = `%boxed.object.ptr.${objectIndex}`;
    useRuntimeHelper(context.runtime, "valueObjectPtr");
    lines.push(`  ${objectPtr} = call ptr @valueObjectPtr(i64 ${receiver.value})`);
    if (expression.method === "valueOf") {
      useRuntimeHelper(context.runtime, "boxedValueOf");
      const valueIndex = context.numIndex;
      context.numIndex += 1;
      const value = `%value.${valueIndex}`;
      lines.push(`  ${value} = call i64 @boxedValueOf(ptr ${objectPtr})`);
      return { lines, value };
    }
    useRuntimeHelper(context.runtime, "boxedToString");
    useRuntimeHelper(context.runtime, "valueToString");
    useRuntimeHelper(context.runtime, "valueBoxString");
    useRuntimeHelper(context.runtime, "strConcat");
    useRuntimeHelper(context.runtime, "malloc");
    useRuntimeHelper(context.runtime, "memcpy");
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
    useRuntimeHelper(context.runtime, "arrayNew");
    useRuntimeHelper(context.runtime, "arraySet");
    useRuntimeHelper(context.runtime, "valueBoxString");
    useRuntimeHelper(context.runtime, "valueBoxArray");
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
    const expressionValues = expression.expressions.map((expr) => emitValueExpression(expr, context));
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

function internedFunctionGlobal(target: string): string {
  return `fnobj.singleton.${target}`.replace(/[^A-Za-z0-9_.]/g, "_");
}

// ExpectedArgumentCount: the number of leading parameters before the first
// one with a default initializer or a rest parameter.
function functionObjectExpectedArgumentCount(parameters: readonly JsIrFunctionParameter[]): number {
  let count = 0;
  for (const parameter of parameters) {
    if (parameter.isRest === true || parameter.defaultValue !== undefined) {
      break;
    }
    count += 1;
  }
  return count;
}

// eslint-disable-next-line max-statements -- Dynamic calls materialize fixed and iterable spread arguments into one argv state machine.
function emitValueCallExpression(
  expression: Extract<JsIrValueExpression, { readonly kind: "callValue" }>,
  context: EmitContext
): JsValue {
  useRuntimeHelper(context.runtime, "jsCall");
  let callee = emitValueExpression(expression.callee, context);
  const args = emitCallArguments(expression.arguments, context);
  let thisValue: JsValue = { lines: [], value: jsValueUndefined };
  if (expression.methodReceiver !== undefined && expression.methodKey !== undefined) {
    const receiver = emitValueExpression(expression.methodReceiver, context);
    const key = emitStringExpression(expression.methodKey, context);
    const value = `%call.method.${context.callIndex}`;
    useRuntimeHelper(context.runtime, "valuePropertyGet");
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
    thisValue = emitValueExpression(expression.thisValue, context);
  }
  if (expression.spreadArguments !== undefined) {
    useRuntimeHelper(context.runtime, "arrayNew");
    useRuntimeHelper(context.runtime, "arrayPush");
    useRuntimeHelper(context.runtime, "arrayLength");
    useRuntimeHelper(context.runtime, "arrayGet");
    useRuntimeHelper(context.runtime, "valueBoxArray");
    const index = context.callIndex;
    context.callIndex += 1;
    const argumentArray = `%call.spread.array.${index}`;
    const boxedArguments = `%call.spread.boxed.${index}`;
    const lines = [
      ...callee.lines,
      `  call void @gcRootPush(i64 ${callee.value})`,
      ...thisValue.lines,
      `  call void @gcRootPush(i64 ${thisValue.value})`,
      `  ${argumentArray} = call ptr @arrayNew(i64 0)`,
      `  ${boxedArguments} = call i64 @valueBoxArray(ptr ${argumentArray})`,
      `  call void @gcRootPush(i64 ${boxedArguments})`
    ];
    for (let argumentIndex = 0; argumentIndex < expression.spreadArguments.length; argumentIndex += 1) {
      const argument = expression.spreadArguments[argumentIndex];
      if (argument.kind === "value") {
        const value = emitValueExpression(argument.value, context);
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
            const value = emitValueExpression({
              kind: "number",
              value: { kind: "arrayAccess", arrayName: argument.arrayName, index: { kind: "literal", value: spreadIndex } }
            }, context);
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
    return { lines, value: generated.value };
  }
  const index = context.callIndex;
  context.callIndex += 1;
  const argv = `%call.value.argv.${index}`;
  const lines = [...callee.lines, `  call void @gcRootPush(i64 ${callee.value})`, ...thisValue.lines, `  call void @gcRootPush(i64 ${thisValue.value})`, ...args.lines, `  ${argv} = alloca i64, i64 ${args.values.length}`];
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
  return { lines, value: generated.value };
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
    // Non-index keys (e.g. Symbol.iterator sentinel) use valuePropertyGet so
    // built-in iterator method thunks resolve. Numeric indices keep arrayGetWithKey.
    const isNonIndexKey = expression.index.kind === "literal" && expression.index.value < 0;
    if (isNonIndexKey) {
      const boxed = `%value.arr.box.${valueIndex}`;
      useRuntimeHelper(context.runtime, "valueBoxArray");
      useRuntimeHelper(context.runtime, "valuePropertyGet");
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

// Emits a private field read: the class-mangled key must be an own property of
// the receiver (the brand), otherwise a TypeError is thrown.
function emitPrivateFieldAccessExpression(
  expression: Extract<JsIrValueExpression, { readonly kind: "privateFieldAccess" }>,
  context: EmitContext
): JsValue {
  const receiver = emitValueExpression(expression.receiver, context);
  const keyConstant = addStringConstant(expression.key, context);
  const keyLength = utf8ByteLength(expression.key);
  const index = context.numIndex;
  context.numIndex += 1;
  const has = `%priv.has.${index}`;
  const value = `%value.${index}`;
  const okLabel = `priv.ok.${index}`;
  const throwLabel = `priv.throw.${index}`;
  useRuntimeHelper(context.runtime, "valueObjectHasOwn");
  useRuntimeHelper(context.runtime, "valueObjectGet");
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
  const receiver = emitValueExpression(expression.value, context);
  const index = emitArrayIndex(expression.index, context);
  const key = emitStringExpression(expression.key, context);
  const valueIndex = context.numIndex;
  context.numIndex += 1;
  const value = `%value.${valueIndex}`;
  // Prefer valuePropertyGet for named keys so built-in iterator methods resolve.
  // Numeric index access still uses valueArrayGet for correct hole/index semantics.
  if (expression.index.kind === "literal" && expression.index.value < 0) {
    useRuntimeHelper(context.runtime, "valuePropertyGet");
    return {
      lines: [...receiver.lines, ...index.lines, ...key.lines, `  ${value} = call i64 @valuePropertyGet(i64 ${receiver.value}, i64 ${key.length}, ptr ${key.value})`],
      value
    };
  }
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
  return { lines: [...number.lines, `  ${value} = call i64 @valueBoxNumber(double ${llvmDoubleBitcastOperand(number.value)})`], value };
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
      `  ${value} = call i64 @valueBoxString(ptr ${string.value}, i64 ${string.length})`,
      emitRootStackPush(value, context)
    ],
    value
  };
}

function llvmDoubleBitcastOperand(value: string): string {
  if (/^-?\d+$/.test(value)) {
    return `${value}.0`;
  }
  if (/^-?\d+e[+-]?\d+$/i.test(value)) {
    return value.replace(/e/i, ".0e");
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
  const current = emitValueExpression(expression.value, context);
  const fallback = emitValueExpression(expression.defaultValue, context);
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
  if (!operationListTerminates(thenOperations)) {
    lines.push(`  br label %${endLabel}`);
  }

  if (elseOperations.length > noLines) {
    lines.push(`${elseLabel}:`);
    lines.push(...emitOperationsWithScopedBindings(elseOperations, context));
    if (!operationListTerminates(elseOperations)) {
      lines.push(`  br label %${endLabel}`);
    }
  }

  if (!operationListTerminates(thenOperations) || elseOperations.length === noLines || !operationListTerminates(elseOperations)) {
    lines.push(`${endLabel}:`);
  }
  return lines;
}

// eslint-disable-next-line max-statements -- Switch emission owns dispatch labels plus source-order fall-through labels.
function emitSwitchOperation(operation: Extract<JsIrOperation, { readonly kind: "switch" }>, context: EmitContext): string[] {
  const { loopIndex } = context;
  context.loopIndex += 1;
  const endLabel = `switch.end.${loopIndex}`;
  const clauseLabels = operation.clauses.map((_, index) => `switch.case.${loopIndex}.${index}`);
  const caseIndexes: number[] = [];
  for (let index = 0; index < operation.clauses.length; index++) {
    if (operation.clauses[index].test !== undefined) {
      caseIndexes.push(index);
    }
  }
  const defaultIndex = operation.clauses.findIndex((clause) => clause.test === undefined);
  let noMatchLabel = endLabel;
  if (defaultIndex !== -1) {
    noMatchLabel = clauseLabels[defaultIndex];
  }
  const discriminant = emitValueExpression(operation.expression, context);
  const firstCompareLabel = switchCompareLabel(loopIndex, caseIndexes[0]);
  let firstDispatchLabel = noMatchLabel;
  if (firstCompareLabel !== undefined) {
    firstDispatchLabel = firstCompareLabel;
  }
  const lines = [...discriminant.lines, `  br label %${firstDispatchLabel}`];

  useRuntimeHelper(context.runtime, "valueStrictEquals");
  for (let index = 0; index < caseIndexes.length; index++) {
    const clauseIndex = caseIndexes[index];
    const clause = operation.clauses[clauseIndex];
    const test = emitValueExpression(clause.test ?? { kind: "undefined" }, context);
    const compare = `%switch.cmp.${loopIndex}.${index}`;
    const currentCompareLabel = `switch.test.${loopIndex}.${clauseIndex}`;
    const nextCompareLabel = switchCompareLabel(loopIndex, caseIndexes[index + 1]);
    let failedLabel = noMatchLabel;
    if (nextCompareLabel !== undefined) {
      failedLabel = nextCompareLabel;
    }
    lines.push(
      `${currentCompareLabel}:`,
      ...test.lines,
      `  ${compare} = call i1 @valueStrictEquals(i64 ${discriminant.value}, i64 ${test.value})`,
      `  br i1 ${compare}, label %${clauseLabels[clauseIndex]}, label %${failedLabel}`
    );
  }

  context.loopLabels.push({ breakLabel: endLabel , cleanupDepth: context.cleanupStack.length });
  for (let index = 0; index < operation.clauses.length; index++) {
    const clause = operation.clauses[index];
    const nextLabel = clauseLabels[index + 1] ?? endLabel;
    const bodyLines = emitOperationsWithScopedBindings(clause.operations, context);
    lines.push(`${clauseLabels[index]}:`, ...bodyLines);
    if (!switchClauseTerminates(clause)) {
      lines.push(`  br label %${nextLabel}`);
    }
  }
  context.loopLabels.pop();

  lines.push(`${endLabel}:`);
  return lines;
}

function switchCompareLabel(loopIndex: number, clauseIndex: number | undefined): string | undefined {
  if (clauseIndex === undefined) {
    return undefined;
  }
  return `switch.test.${loopIndex}.${clauseIndex}`;
}

function switchClauseTerminates(clause: JsIrSwitchClause): boolean {
  return operationListTerminates(clause.operations);
}

function tryCatchOperationTerminates(operation: Extract<JsIrOperation, { readonly kind: "tryCatch" }>): boolean {
  if (operation.finallyOperations === undefined) {
    return operationListTerminates(operation.tryOperations) && operationListTerminates(operation.catchOperations);
  }
  // Fall through only when try or catch can complete normally and finally falls through.
  if (operationListTerminates(operation.finallyOperations)) {
    return true;
  }
  const tryFallsThrough = !operationListTerminates(operation.tryOperations);
  const { hasCatch } = operation;
  const catchFallsThrough = hasCatch && !operationListTerminates(operation.catchOperations);
  // No NORMAL join path ⇒ the statement never reaches subsequent ops.
  return !tryFallsThrough && !catchFallsThrough;
}

function operationListTerminates(operations: readonly JsIrOperation[]): boolean {
  const last = operations.at(-1);
  if (last === undefined) {
    return false;
  }
  if (last.kind === "block" || last.kind === "bindingGroup") {
    return operationListTerminates(last.operations);
  }
  if (last.kind === "tryCatch") {
    return tryCatchOperationTerminates(last);
  }
  if (last.kind === "if") {
    return last.elseOperations.length > 0 && operationListTerminates(last.thenOperations) && operationListTerminates(last.elseOperations);
  }
  return last.kind === "break" || last.kind === "continue" || last.kind === "returnNumber" || last.kind === "returnString" || last.kind === "returnValue" || last.kind === "returnClosure" || last.kind === "throwValue";
}

function emitLoopBackEdge(target: string, operations: readonly JsIrOperation[]): string[] {
  if (operationListTerminates(operations)) {
    return [];
  }
  return [`  br label %${target}`];
}

// GC loop frame: name of the root-stack baseline captured immediately before a loop.
function loopFrameName(loopIndex: number): string {
  return `%gc.loop.${loopIndex}`;
}

// Emitted once before a loop: capture the root-stack depth so each iteration can be
// reset back to it. Keeps per-iteration temporaries from accumulating across the
// stress loops while preserving every loop-invariant root pushed before the loop.
function emitLoopFrameSave(loopIndex: number): string {
  return `  ${loopFrameName(loopIndex)} = call i64 @gcRootSave()`;
}

// Emitted at the top of every loop body: drop the previous iteration's roots, then run
// a safepoint. Collection only ever happens here (and at function-level boundaries), so
// raw pointers built mid-statement are never reclaimed, and prior-iteration garbage is
// reclaimed once the body has re-rooted whatever it still needs. Also reached via
// `continue`, which targets the cond/step block and flows back through the body top.
function emitLoopIterationPrologue(loopIndex: number): string[] {
  return [`  call void @gcRootRestore(i64 ${loopFrameName(loopIndex)})`, "  call void @gcSafepoint()"];
}

function emitWhileOperation(operation: Extract<JsIrOperation, { readonly kind: "while" }>, context: EmitContext): string[] {
  const { loopIndex } = context;
  context.loopIndex += 1;
  const condLabel = `while.cond.${loopIndex}`;
  const bodyLabel = `while.body.${loopIndex}`;
  const endLabel = `while.end.${loopIndex}`;
  const emittedCondition = emitCondition(operation.condition, context);
  context.loopLabels.push({ breakLabel: endLabel, continueLabel: condLabel , cleanupDepth: context.cleanupStack.length });
  const bodyLines = emitOperations(operation.body, context);
  context.loopLabels.pop();

  return [
    emitLoopFrameSave(loopIndex),
    `  br label %${condLabel}`,
    `${condLabel}:`,
    ...emittedCondition.lines,
    `  br i1 ${emittedCondition.value}, label %${bodyLabel}, label %${endLabel}`,
    `${bodyLabel}:`,
    ...emitLoopIterationPrologue(loopIndex),
    ...bodyLines,
    ...emitLoopBackEdge(condLabel, operation.body),
    `${endLabel}:`
  ];
}

function emitDoWhileOperation(operation: Extract<JsIrOperation, { readonly kind: "doWhile" }>, context: EmitContext): string[] {
  const { loopIndex } = context;
  context.loopIndex += 1;
  const bodyLabel = `do.body.${loopIndex}`;
  const condLabel = `do.cond.${loopIndex}`;
  const endLabel = `do.end.${loopIndex}`;
  context.loopLabels.push({ breakLabel: endLabel, continueLabel: condLabel , cleanupDepth: context.cleanupStack.length });
  const bodyLines = emitOperations(operation.body, context);
  context.loopLabels.pop();
  const emittedCondition = emitCondition(operation.condition, context);

  return [
    emitLoopFrameSave(loopIndex),
    `  br label %${bodyLabel}`,
    `${bodyLabel}:`,
    ...emitLoopIterationPrologue(loopIndex),
    ...bodyLines,
    ...emitLoopBackEdge(condLabel, operation.body),
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
  const initializerLines = emitOperations([operation.initializer], context);
  const emittedCondition = emitCondition(operation.condition, context);
  context.loopLabels.push({ breakLabel: endLabel, continueLabel: stepLabel , cleanupDepth: context.cleanupStack.length });
  const bodyLines = emitOperations(operation.body, context);
  context.loopLabels.pop();
  const incrementLines = emitOperations([operation.increment], context);

  return [
    ...initializerLines,
    emitLoopFrameSave(loopIndex),
    `  br label %${condLabel}`,
    `${condLabel}:`,
    ...emittedCondition.lines,
    `  br i1 ${emittedCondition.value}, label %${bodyLabel}, label %${endLabel}`,
    `${bodyLabel}:`,
    ...emitLoopIterationPrologue(loopIndex),
    ...bodyLines,
    ...emitLoopBackEdge(stepLabel, operation.body),
    `${stepLabel}:`,
    ...incrementLines,
    `  br label %${condLabel}`,
    `${endLabel}:`
  ];
}

function emitForOfArrayOperation(operation: Extract<JsIrOperation, { readonly kind: "forOfArray" }>, context: EmitContext): string[] {
  const { loopIndex } = context;
  context.loopIndex += 1;
  const condLabel = `for.of.cond.${loopIndex}`;
  const bodyLabel = `for.of.body.${loopIndex}`;
  const stepLabel = `for.of.step.${loopIndex}`;
  const endLabel = `for.of.end.${loopIndex}`;
  const indexPointer = `%for.of.index.${loopIndex}.addr`;
  const itemPointer = variablePointerName(operation.itemName);
  const bodyBindings = new Map(context.bindings);
  bodyBindings.set(operation.itemName, { kind: "number", value: { kind: "variable", name: itemPointer } });
  const previousBindings = new Map(context.bindings);
  const arrayBinding = context.bindings.get(operation.arrayName);
  let arrayLength = 0;
  if (arrayBinding?.kind === "array") {
    arrayLength = arrayBinding.length;
  }
  context.bindings.clear();
  for (const [name, value] of bodyBindings) {
    context.bindings.set(name, value);
  }
  context.loopLabels.push({ breakLabel: endLabel, continueLabel: stepLabel , cleanupDepth: context.cleanupStack.length });
  const bodyLines = emitOperations(operation.body, context);
  context.loopLabels.pop();
  context.bindings.clear();
  for (const [name, value] of previousBindings) {
    context.bindings.set(name, value);
  }
  const currentIndex = `%for.of.index.${loopIndex}`;
  const inRange = `%for.of.in.range.${loopIndex}`;
  const element = emitNumberExpression({ kind: "arrayAccess", arrayName: operation.arrayName, index: { kind: "variable", name: indexPointer } }, context);
  const nextIndex = `%for.of.next.${loopIndex}`;

  return [
    `  ${indexPointer} = alloca double`,
    `  ${itemPointer} = alloca double`,
    `  store double 0.0, ptr ${indexPointer}`,
    emitLoopFrameSave(loopIndex),
    `  br label %${condLabel}`,
    `${condLabel}:`,
    `  ${currentIndex} = load double, ptr ${indexPointer}`,
    `  ${inRange} = fcmp olt double ${currentIndex}, ${llvmDoubleLiteral(arrayLength)}`,
    `  br i1 ${inRange}, label %${bodyLabel}, label %${endLabel}`,
    `${bodyLabel}:`,
    ...emitLoopIterationPrologue(loopIndex),
    ...element.lines,
     `  store double ${element.value}, ptr ${itemPointer}`,
     ...bodyLines,
     ...emitLoopBackEdge(stepLabel, operation.body),
     `${stepLabel}:`,
    `  ${nextIndex} = fadd double ${currentIndex}, 1.0`,
    `  store double ${nextIndex}, ptr ${indexPointer}`,
    `  br label %${condLabel}`,
    `${endLabel}:`
  ];
}

// eslint-disable-next-line max-statements -- String for...of emission walks UTF-8 code points and materializes scoped loop bindings.
function emitForOfStringOperation(operation: Extract<JsIrOperation, { readonly kind: "forOfString" }>, context: EmitContext): string[] {
  const { loopIndex } = context;
  context.loopIndex += 1;
  const condLabel = `for.of.cond.${loopIndex}`;
  const bodyLabel = `for.of.body.${loopIndex}`;
  const asciiLabel = `for.of.ascii.${loopIndex}`;
  const multiLabel = `for.of.multi.${loopIndex}`;
  const multi2Label = `for.of.multi2.${loopIndex}`;
  const multi3Label = `for.of.multi3.${loopIndex}`;
  const multi4Label = `for.of.multi4.${loopIndex}`;
  const copyLabel = `for.of.copy.${loopIndex}`;
  const afterCopyLabel = `for.of.after.copy.${loopIndex}`;
  const stepLabel = `for.of.step.${loopIndex}`;
  const endLabel = `for.of.end.${loopIndex}`;
  const indexPointer = `%for.of.index.${loopIndex}.addr`;
  const itemPointer = variablePointerName(operation.itemName);
  const itemLengthPointer = stringLengthPointerName(operation.itemName);
  const source = emitStringExpression(operation.source, context);
  const bodyBindings = new Map(context.bindings);
  bodyBindings.set(operation.itemName, { kind: "stringVariable", name: operation.itemName });
  const previousBindings = new Map(context.bindings);
  context.bindings.clear();
  for (const [name, value] of bodyBindings) {
    context.bindings.set(name, value);
  }
  context.loopLabels.push({ breakLabel: endLabel, continueLabel: stepLabel , cleanupDepth: context.cleanupStack.length });
  const bodyLines = emitOperations(operation.body, context);
  context.loopLabels.pop();
  context.bindings.clear();
  for (const [name, value] of previousBindings) {
    context.bindings.set(name, value);
  }
  const currentIndex = `%for.of.index.${loopIndex}`;
  const inRange = `%for.of.in.range.${loopIndex}`;
  const charSource = `%for.of.char.src.${loopIndex}`;
  const charValue = `%for.of.char.${loopIndex}`;
  const isAscii = `%for.of.is.ascii.${loopIndex}`;
  const is2 = `%for.of.is2.${loopIndex}`;
  const is3 = `%for.of.is3.${loopIndex}`;
  const seqLen = `%for.of.seq.len.${loopIndex}`;
  const remain = `%for.of.remain.${loopIndex}`;
  const fits = `%for.of.fits.${loopIndex}`;
  const copyLen = `%for.of.copy.len.${loopIndex}`;
  const allocSize = `%for.of.alloc.${loopIndex}`;
  const charString = `%for.of.char.string.${loopIndex}`;
  const charStringNul = `%for.of.char.string.nul.${loopIndex}`;
  const nextIndex = `%for.of.next.${loopIndex}`;
  useRuntimeHelper(context.runtime, "malloc");
  useRuntimeHelper(context.runtime, "memcpy");

  return [
    ...source.lines,
    `  ${indexPointer} = alloca i64`,
    `  ${itemPointer} = alloca ptr`,
    `  ${itemLengthPointer} = alloca i64`,
    `  store i64 0, ptr ${indexPointer}`,
    emitLoopFrameSave(loopIndex),
    `  br label %${condLabel}`,
    `${condLabel}:`,
    `  ${currentIndex} = load i64, ptr ${indexPointer}`,
    `  ${inRange} = icmp ult i64 ${currentIndex}, ${source.length}`,
    `  br i1 ${inRange}, label %${bodyLabel}, label %${endLabel}`,
    `${bodyLabel}:`,
    ...emitLoopIterationPrologue(loopIndex),
    `  ${charSource} = getelementptr i8, ptr ${source.value}, i64 ${currentIndex}`,
    `  ${charValue} = load i8, ptr ${charSource}`,
    `  ${isAscii} = icmp ult i8 ${charValue}, 128`,
    `  br i1 ${isAscii}, label %${asciiLabel}, label %${multiLabel}`,
    `${asciiLabel}:`,
    `  ${charString}.a = call ptr @malloc(i64 2)`,
    `  store i8 ${charValue}, ptr ${charString}.a`,
    `  ${charStringNul}.a = getelementptr i8, ptr ${charString}.a, i64 1`,
    `  store i8 0, ptr ${charStringNul}.a`,
    `  store ptr ${charString}.a, ptr ${itemPointer}`,
    `  store i64 1, ptr ${itemLengthPointer}`,
    `  ${nextIndex}.a = add i64 ${currentIndex}, 1`,
    `  store i64 ${nextIndex}.a, ptr ${indexPointer}`,
    `  br label %${afterCopyLabel}`,
    `${multiLabel}:`,
    `  ${is2} = icmp ult i8 ${charValue}, 224`,
    `  br i1 ${is2}, label %${multi2Label}, label %${multi3Label}`,
    `${multi2Label}:`,
    `  br label %${copyLabel}`,
    `${multi3Label}:`,
    `  ${is3} = icmp ult i8 ${charValue}, 240`,
    `  br i1 ${is3}, label %${multi4Label}.pre3, label %${multi4Label}`,
    `${multi4Label}.pre3:`,
    `  br label %${copyLabel}`,
    `${multi4Label}:`,
    `  br label %${copyLabel}`,
    `${copyLabel}:`,
    `  ${seqLen} = phi i64 [ 2, %${multi2Label} ], [ 3, %${multi4Label}.pre3 ], [ 4, %${multi4Label} ]`,
    `  ${remain} = sub i64 ${source.length}, ${currentIndex}`,
    `  ${fits} = icmp ule i64 ${seqLen}, ${remain}`,
    `  ${copyLen} = select i1 ${fits}, i64 ${seqLen}, i64 1`,
    `  ${allocSize} = add i64 ${copyLen}, 1`,
    `  ${charString} = call ptr @malloc(i64 ${allocSize})`,
    `  call ptr @memcpy(ptr ${charString}, ptr ${charSource}, i64 ${copyLen})`,
    `  ${charStringNul} = getelementptr i8, ptr ${charString}, i64 ${copyLen}`,
    `  store i8 0, ptr ${charStringNul}`,
    `  store ptr ${charString}, ptr ${itemPointer}`,
    `  store i64 ${copyLen}, ptr ${itemLengthPointer}`,
    `  ${nextIndex}.m = add i64 ${currentIndex}, ${copyLen}`,
    `  store i64 ${nextIndex}.m, ptr ${indexPointer}`,
    `  br label %${afterCopyLabel}`,
    `${afterCopyLabel}:`,
    ...bodyLines,
    ...emitLoopBackEdge(stepLabel, operation.body),
    `${stepLabel}:`,
    `  br label %${condLabel}`,
    `${endLabel}:`
  ];
}

function emitForOfSetOperation(operation: Extract<JsIrOperation, { readonly kind: "forOfSet" }>, context: EmitContext): string[] {
  const itemPointer = variablePointerName(operation.itemName);
  return emitForOfCollectionValueOperation(operation.setName, operation.itemName, itemPointer, "i64", operation.body, context, (entryPointer) => {
    const valueSlot = `%for.of.collection.value.slot.${context.objectIndex}`;
    const value = `%for.of.collection.value.${context.objectIndex}`;
    context.objectIndex += 1;
    return {
      lines: [`  ${valueSlot} = getelementptr i8, ptr ${entryPointer}, i64 8`, `  ${value} = load i64, ptr ${valueSlot}`, `  store i64 ${value}, ptr ${itemPointer}`],
      binding: { kind: "valueVariable", name: operation.itemName }
    };
  });
}

// eslint-disable-next-line max-statements -- Protocol for-of installs IteratorClose cleanup and drives next()/body/close.
function emitForOfProtocolOperation(operation: Extract<JsIrOperation, { readonly kind: "forOfProtocol" }>, context: EmitContext): string[] {
  const { loopIndex } = context;
  context.loopIndex += 1;
  const condLabel = `for.of.proto.cond.${loopIndex}`;
  const bodyLabel = `for.of.proto.body.${loopIndex}`;
  const stepLabel = `for.of.proto.step.${loopIndex}`;
  const endLabel = `for.of.proto.end.${loopIndex}`;
  const itemPointer = variablePointerName(operation.itemName);
  const iteratorSlot = `%for.of.proto.iter.${loopIndex}.addr`;

  useRuntimeHelper(context.runtime, "getIteratorValue");
  useRuntimeHelper(context.runtime, "callIteratorNext");
  useRuntimeHelper(context.runtime, "iteratorClose");
  useRuntimeHelper(context.runtime, "valueObjectGet");
  useRuntimeHelper(context.runtime, "valueTruthy");
  useRuntimeHelper(context.runtime, "valueBoxString");

  const iterable = emitValueExpression(operation.iterable, context);
  const notIterableMessageConstant = addStringConstant(operation.notIterableMessage, context);
  const notIterableMessage = `%for.of.proto.not.iterable.${loopIndex}`;
  const getIterator = emitGeneratedJsCall("getIteratorValue", [`i64 ${iterable.value}`, `i64 ${notIterableMessage}`], context);

  const bodyBindings = new Map(context.bindings);
  bodyBindings.set(operation.itemName, { kind: "valueVariable", name: operation.itemName });
  const previousBindings = new Map(context.bindings);
  context.bindings.clear();
  for (const [name, value] of bodyBindings) {
    context.bindings.set(name, value);
  }

  // Install loop labels before the IteratorClose frame so cleanupDepth points at the frame index.
  const cleanupDepth = context.cleanupStack.length;
  context.loopLabels.push({ breakLabel: endLabel, continueLabel: condLabel, cleanupDepth });
  const closeFrame = createCleanupFrame(context, "iteratorClose", {
    skipContinueLabel: condLabel,
    iteratorSlot
  });
  context.cleanupStack.push(closeFrame);
  const outerException = context.exceptionTarget;
  // Escaping throws close the iterator before propagating.
  context.exceptionTarget = closeFrame.throwEntryLabel;
  const bodyLines = emitOperations(operation.body, context);
  context.exceptionTarget = outerException;
  context.cleanupStack.pop();
  context.loopLabels.pop();
  context.bindings.clear();
  for (const [name, value] of previousBindings) {
    context.bindings.set(name, value);
  }

  // Call next after the per-iteration root restore so the iterator result and
  // item stay live across body allocations (same shape as specialized for-of).
  const iteratorLoad = `%for.of.proto.iter.${loopIndex}`;
  const nextCall = emitGeneratedJsCall("callIteratorNext", [`i64 ${iteratorLoad}`], context);
  const doneKey = addStringConstant("done", context);
  const valueKey = addStringConstant("value", context);
  const doneValue = `%for.of.proto.done.${loopIndex}`;
  const isDone = `%for.of.proto.is.done.${loopIndex}`;
  const itemValue = `%for.of.proto.item.${loopIndex}`;

  return [
    ...iterable.lines,
    `  call void @gcRootPush(i64 ${iterable.value})`,
    `  ${notIterableMessage} = call i64 @valueBoxString(ptr ${notIterableMessageConstant}, i64 ${utf8ByteLength(operation.notIterableMessage)})`,
    ...getIterator.lines,
    `  ${iteratorSlot} = alloca i64`,
    `  store i64 ${getIterator.value}, ptr ${iteratorSlot}`,
    `  call void @gcRootPush(i64 ${getIterator.value})`,
    `  ${itemPointer} = alloca i64`,
    emitLoopFrameSave(loopIndex),
    `  br label %${condLabel}`,
    `${condLabel}:`,
    `  br label %${bodyLabel}`,
    `${bodyLabel}:`,
    ...emitLoopIterationPrologue(loopIndex),
    `  ${iteratorLoad} = load i64, ptr ${iteratorSlot}`,
    `  call void @gcRootPush(i64 ${iteratorLoad})`,
    ...nextCall.lines,
    `  ${doneValue} = call i64 @valueObjectGet(i64 ${nextCall.value}, i64 4, ptr ${doneKey})`,
    `  ${isDone} = call i1 @valueTruthy(i64 ${doneValue})`,
    // Normal exhaustion does not call IteratorClose.
    `  br i1 ${isDone}, label %${endLabel}, label %${stepLabel}`,
    `${stepLabel}:`,
    `  ${itemValue} = call i64 @valueObjectGet(i64 ${nextCall.value}, i64 5, ptr ${valueKey})`,
    `  store i64 ${itemValue}, ptr ${itemPointer}`,
    `  call void @gcRootPush(i64 ${itemValue})`,
    ...bodyLines,
    ...emitLoopBackEdge(condLabel, operation.body),
    // IteratorClose cleanup region (abrupt exits only).
    `${closeFrame.entryLabel}:`,
    `  ${closeFrame.rootFrameName} = call i64 @gcRootSave()`,
    ...emitIteratorCloseBody(context, closeFrame),
    ...emitCleanupAfterBody(context, closeFrame),
    ...emitThrowEntryBlock(context, closeFrame),
    ...emitCleanupFinalDispatch(context, closeFrame),
    // IteratorClose is only entered on abrupt exits; NORMAL is unreachable here.
    // Break resumes via dest switch to endLabel; keep join as a safe fallback.
    `${closeFrame.joinLabel}:`,
    `  br label %${endLabel}`,
    `${endLabel}:`
  ];
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
  useRuntimeHelper(context.runtime, "getIteratorValue");
  useRuntimeHelper(context.runtime, "callIteratorNext");
  useRuntimeHelper(context.runtime, "iteratorClose");
  useRuntimeHelper(context.runtime, "valueObjectGet");
  useRuntimeHelper(context.runtime, "valueTruthy");
  useRuntimeHelper(context.runtime, "valueBoxString");
  useRuntimeHelper(context.runtime, "arrayNew");
  useRuntimeHelper(context.runtime, "arrayPush");
  useRuntimeHelper(context.runtime, "valueBoxArray");

  let iteratorCall: JsValue;
  let setupLines: string[];
  if (operation.source.kind === "collection") {
    useRuntimeHelper(context.runtime, "getCollectionIterator");
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
    const iterable = emitValueExpression(operation.source.value, context);
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
        const defaultValue = emitValueExpression(element.defaultValue, context);
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
      lines.push(...emitOperations(element.operations, context));
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

function emitForOfMapOperation(operation: Extract<JsIrOperation, { readonly kind: "forOfMap" }>, context: EmitContext): string[] {
  const itemPointer = variablePointerName(operation.itemName);
  return emitForOfCollectionValueOperation(operation.mapName, operation.itemName, itemPointer, "ptr", operation.body, context, (entryPointer) => {
    const index = context.objectIndex;
    context.objectIndex += 1;
    const keySlot = `%for.of.map.key.slot.${index}`;
    const key = `%for.of.map.key.${index}`;
    const valueSlot = `%for.of.map.value.slot.${index}`;
    const value = `%for.of.map.value.${index}`;
    const pair = `%for.of.map.pair.${index}`;
    useRuntimeHelper(context.runtime, "arrayNew");
    useRuntimeHelper(context.runtime, "arraySet");
    return {
      lines: [
        `  ${keySlot} = getelementptr i8, ptr ${entryPointer}, i64 8`,
        `  ${key} = load i64, ptr ${keySlot}`,
        `  ${valueSlot} = getelementptr i8, ptr ${entryPointer}, i64 16`,
        `  ${value} = load i64, ptr ${valueSlot}`,
        `  ${pair} = call ptr @arrayNew(i64 2)`,
        `  call void @arraySet(ptr ${pair}, i64 0, i64 ${key})`,
        `  call void @arraySet(ptr ${pair}, i64 1, i64 ${value})`,
        `  store ptr ${pair}, ptr ${itemPointer}`
      ],
      binding: { kind: "runtimeArray", name: operation.itemName }
    };
  });
}

// eslint-disable-next-line max-statements -- for...in emission walks the runtime object/array key array and binds a scoped string variable.
function emitForInObjectOperation(operation: Extract<JsIrOperation, { readonly kind: "forInObject" }>, context: EmitContext): string[] {
  return emitForInKeyIteration(operation.itemName, "objectKeys", operation.objectName, emitRuntimeObjectPointer, operation.body, context);
}

// eslint-disable-next-line max-statements -- for...in over runtime arrays reuses the same key-iteration pattern as runtime objects.
function emitForInArrayOperation(operation: Extract<JsIrOperation, { readonly kind: "forInArray" }>, context: EmitContext): string[] {
  return emitForInKeyIteration(operation.itemName, "arrayKeys", operation.arrayName, emitRuntimeArrayPointer, operation.body, context);
}

// eslint-disable-next-line max-statements -- for...in body binding is set up before allocating the key pointers so the body's loops can see the key string.
function emitForInKeyIteration(
  itemName: string,
  helper: "objectKeys" | "arrayKeys",
  sourceName: string,
  emitSourcePointer: (name: string, context: EmitContext) => NumberValue,
  body: readonly JsIrOperation[],
  context: EmitContext
): string[] {
  const { loopIndex } = context;
  context.loopIndex += 1;
  const condLabel = `for.in.cond.${loopIndex}`;
  const bodyLabel = `for.in.body.${loopIndex}`;
  const stepLabel = `for.in.step.${loopIndex}`;
  const endLabel = `for.in.end.${loopIndex}`;
  const indexPointer = `%for.in.index.${loopIndex}.addr`;
  const itemPointer = variablePointerName(itemName);
  const itemLengthPointer = stringLengthPointerName(itemName);
  const bodyBindings = new Map(context.bindings);
  bodyBindings.set(itemName, { kind: "stringVariable", name: itemName });
  const previousBindings = new Map(context.bindings);
  context.bindings.clear();
  for (const [name, value] of bodyBindings) {
    context.bindings.set(name, value);
  }
  context.loopLabels.push({ breakLabel: endLabel, continueLabel: stepLabel , cleanupDepth: context.cleanupStack.length });
  const bodyLines = emitOperations(body, context);
  context.loopLabels.pop();
  context.bindings.clear();
  for (const [name, value] of previousBindings) {
    context.bindings.set(name, value);
  }
  const source = emitSourcePointer(sourceName, context);
  const currentIndex = `%for.in.index.${loopIndex}`;
  const inRange = `%for.in.in.range.${loopIndex}`;
  const keysPointer = `%for.in.keys.${loopIndex}`;
  const keysLength = `%for.in.keys.length.${loopIndex}`;
  const keyElement = `%for.in.key.${loopIndex}`;
  const keyPtr = `%for.in.key.ptr.${loopIndex}`;
  const keyLen = `%for.in.key.len.${loopIndex}`;
  const nextIndex = `%for.in.next.${loopIndex}`;
  useRuntimeHelper(context.runtime, helper);
  useRuntimeHelper(context.runtime, "arrayLength");
  useRuntimeHelper(context.runtime, "arrayGet");
  useRuntimeHelper(context.runtime, "valueStringPtr");
  useRuntimeHelper(context.runtime, "valueStringLength");

  return [
    ...source.lines,
    `  ${indexPointer} = alloca i64`,
    `  ${itemPointer} = alloca ptr`,
    `  ${itemLengthPointer} = alloca i64`,
    `  store i64 0, ptr ${indexPointer}`,
    `  ${keysPointer} = call ptr @${helper}(ptr ${source.value})`,
    `  ${keysLength} = call i64 @arrayLength(ptr ${keysPointer})`,
    emitLoopFrameSave(loopIndex),
    `  br label %${condLabel}`,
    `${condLabel}:`,
    `  ${currentIndex} = load i64, ptr ${indexPointer}`,
    `  ${inRange} = icmp ult i64 ${currentIndex}, ${keysLength}`,
    `  br i1 ${inRange}, label %${bodyLabel}, label %${endLabel}`,
    `${bodyLabel}:`,
    ...emitLoopIterationPrologue(loopIndex),
    `  ${keyElement} = call i64 @arrayGet(ptr ${keysPointer}, i64 ${currentIndex})`,
    `  ${keyPtr} = call ptr @valueStringPtr(i64 ${keyElement})`,
    `  ${keyLen} = call i64 @valueStringLength(i64 ${keyElement})`,
    `  store ptr ${keyPtr}, ptr ${itemPointer}`,
    `  store i64 ${keyLen}, ptr ${itemLengthPointer}`,
     ...bodyLines,
     ...emitLoopBackEdge(stepLabel, body),
     `${stepLabel}:`,
    `  ${nextIndex} = add i64 ${currentIndex}, 1`,
    `  store i64 ${nextIndex}, ptr ${indexPointer}`,
    `  br label %${condLabel}`,
    `${endLabel}:`
  ];
}

// eslint-disable-next-line max-statements -- Collection for...of emission owns the active-slot scan and loop-control labels.
function emitForOfCollectionValueOperation(
  collectionName: string,
  itemName: string,
  itemPointer: string,
  itemPointerType: "i64" | "ptr",
  body: readonly JsIrOperation[],
  context: EmitContext,
  emitItemStore: (entryPointer: string) => { readonly lines: readonly string[]; readonly binding: JsIrBindingValue }
): string[] {
  const { loopIndex } = context;
  context.loopIndex += 1;
  const condLabel = `for.of.cond.${loopIndex}`;
  const checkLabel = `for.of.check.${loopIndex}`;
  const bodyLabel = `for.of.body.${loopIndex}`;
  const stepLabel = `for.of.step.${loopIndex}`;
  const endLabel = `for.of.end.${loopIndex}`;
  const indexPointer = `%for.of.index.${loopIndex}.addr`;
  const collection = emitRuntimeCollectionPointer(collectionName, context);
  const bodyBindings = new Map(context.bindings);
  const previousBindings = new Map(context.bindings);
  const currentIndex = `%for.of.index.${loopIndex}`;
  const usedSlot = `%for.of.collection.used.slot.${loopIndex}`;
  const used = `%for.of.collection.used.${loopIndex}`;
  const inRange = `%for.of.in.range.${loopIndex}`;
  const entriesSlot = `%for.of.collection.entries.slot.${loopIndex}`;
  const entries = `%for.of.collection.entries.${loopIndex}`;
  const entryBytes = `%for.of.collection.entry.bytes.${loopIndex}`;
  const entryPointer = `%for.of.collection.entry.${loopIndex}`;
  const active = `%for.of.collection.active.${loopIndex}`;
  const isActive = `%for.of.collection.is.active.${loopIndex}`;
  const item = emitItemStore(entryPointer);
  bodyBindings.set(itemName, item.binding);
  context.bindings.clear();
  for (const [name, value] of bodyBindings) {
    context.bindings.set(name, value);
  }
  context.loopLabels.push({ breakLabel: endLabel, continueLabel: stepLabel , cleanupDepth: context.cleanupStack.length });
  const bodyLines = emitOperations(body, context);
  context.loopLabels.pop();
  context.bindings.clear();
  for (const [name, value] of previousBindings) {
    context.bindings.set(name, value);
  }
  const nextIndex = `%for.of.next.${loopIndex}`;

  return [
    ...collection.lines,
    `  ${indexPointer} = alloca i64`,
    `  ${itemPointer} = alloca ${itemPointerType}`,
    `  store i64 0, ptr ${indexPointer}`,
    emitLoopFrameSave(loopIndex),
    `  br label %${condLabel}`,
    `${condLabel}:`,
    `  ${currentIndex} = load i64, ptr ${indexPointer}`,
    `  ${usedSlot} = getelementptr i8, ptr ${collection.value}, i64 8`,
    `  ${used} = load i64, ptr ${usedSlot}`,
    `  ${inRange} = icmp ult i64 ${currentIndex}, ${used}`,
    `  br i1 ${inRange}, label %${checkLabel}, label %${endLabel}`,
    `${checkLabel}:`,
    `  ${entriesSlot} = getelementptr i8, ptr ${collection.value}, i64 24`,
    `  ${entries} = load ptr, ptr ${entriesSlot}`,
    `  ${entryBytes} = mul i64 ${currentIndex}, 24`,
    `  ${entryPointer} = getelementptr i8, ptr ${entries}, i64 ${entryBytes}`,
    `  ${active} = load i64, ptr ${entryPointer}`,
    `  ${isActive} = icmp ne i64 ${active}, 0`,
    `  br i1 ${isActive}, label %${bodyLabel}, label %${stepLabel}`,
    `${bodyLabel}:`,
    ...emitLoopIterationPrologue(loopIndex),
    ...item.lines,
     ...bodyLines,
     ...emitLoopBackEdge(stepLabel, body),
     `${stepLabel}:`,
    `  ${nextIndex} = add i64 ${currentIndex}, 1`,
    `  store i64 ${nextIndex}, ptr ${indexPointer}`,
    `  br label %${condLabel}`,
    `${endLabel}:`
  ];
}

function emitBreakOperation(context: EmitContext): string[] {
  const labels = context.loopLabels.at(-1);
  if (labels === undefined) {
    return [];
  }
  // Run cleanups entered inside this loop (iterator close + nested finally).
  if (context.cleanupStack.length > labels.cleanupDepth) {
    return emitCompletionTransfer(context, {
      kind: COMPLETION_BREAK,
      destLabel: labels.breakLabel,
      untilDepth: labels.cleanupDepth
    });
  }
  return [`  br label %${labels.breakLabel}`];
}

function emitContinueOperation(context: EmitContext): string[] {
  let labels: LoopLabels | undefined;
  for (let index = context.loopLabels.length - 1; index >= 0; index--) {
    const candidate = context.loopLabels[index];
    if (candidate.continueLabel !== undefined) {
      labels = candidate;
      break;
    }
  }
  if (labels === undefined) {
    return [];
  }
  const { continueLabel } = labels;
  if (continueLabel === undefined) {
    return [];
  }

  // Same-loop continue skips the loop's own IteratorClose frame (at cleanupDepth),
  // but still runs nested finally frames inside the body.
  if (context.cleanupStack.length > labels.cleanupDepth) {
    const untilDepth = continueCleanupUntilDepth(context, labels);
    if (untilDepth < context.cleanupStack.length) {
      return emitCompletionTransfer(context, {
        kind: COMPLETION_CONTINUE,
        destLabel: continueLabel,
        untilDepth
      });
    }
  }
  return [`  br label %${continueLabel}`];
}

/**
 * Outermost cleanup index that must run for a continue to `labels`.
 * Skips an IteratorClose frame that owns this loop's continue label.
 * Returns cleanupStack.length when no cleanup is required.
 */
function continueCleanupUntilDepth(context: EmitContext, labels: LoopLabels): number {
  const { continueLabel, cleanupDepth } = labels;
  let until = cleanupDepth;
  // Skip the for-of IteratorClose frame installed at cleanupDepth for this loop.
  if (
    until < context.cleanupStack.length &&
    context.cleanupStack[until]?.kind === "iteratorClose" &&
    context.cleanupStack[until]?.skipContinueLabel === continueLabel
  ) {
    until += 1;
  }
  // Nested finally frames above `until` must still run.
  if (until >= context.cleanupStack.length) {
    return context.cleanupStack.length;
  }
  return until;
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

// eslint-disable-next-line max-statements -- Typed condition emission keeps specialized RegExp and class predicates beside numeric comparisons.
function emitCondition(condition: JsIrCondition, context: EmitContext): NumberValue {
  if (condition.kind === "regexTest") {
    const regex = emitValueExpression(condition.regex, context);
    const input = emitStringExpression(condition.input, context);
    const inputValue = `%regex.test.input.${context.callIndex}`;
    useRuntimeHelper(context.runtime, "valueBoxString");
    useRuntimeHelper(context.runtime, "regexTest");
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
    const value = emitValueExpression(condition.value, context);
    const prototype = emitNamedValueBinding(condition.prototypeName, context);
    const prototypePointer = `%instanceof.prototype.${context.objectIndex}`;
    const result = `%cmp.${context.cmpIndex}`;
    context.objectIndex += 1;
    context.cmpIndex += 1;
    useRuntimeHelper(context.runtime, "valueObjectPtr");
    useRuntimeHelper(context.runtime, "jsInstanceOf");
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
    const value = emitValueExpression(condition.value, context);
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
    useRuntimeHelper(context.runtime, "valueObjectPtr");
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
      numberIsFinite: "numberIsFinite",
      numberIsInteger: "numberIsInteger",
      numberIsSafeInteger: "numberIsSafeInteger"
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

function emitRuntimeCollectionCondition(
  condition: Extract<JsIrCondition, { readonly kind: "runtimeCollectionHas" | "runtimeCollectionDelete" }>,
  context: EmitContext
): NumberValue {
  const collection = emitRuntimeCollectionPointer(condition.collectionName, context);
  const key = emitValueExpression(condition.key, context);
  const name = `%cmp.${context.cmpIndex}`;
  context.cmpIndex += 1;
  let helper: RuntimeHelper = "collectionDelete";
  if (condition.kind === "runtimeCollectionHas") {
    helper = "collectionHas";
  }
  useRuntimeHelper(context.runtime, helper);
  return { lines: [...collection.lines, ...key.lines, `  ${name} = call i1 @${helper}(ptr ${collection.value}, i64 ${key.value})`], value: name };
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
    default: {
      const unsupported: never = operator;
      throw new Error(`Unsupported value comparison operator: ${String(unsupported)}`);
    }
  }
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
    default: {
      const unsupported: never = operator;
      throw new Error(`Unsupported comparison operator: ${String(unsupported)}`);
    }
  }
}

// eslint-disable-next-line complexity, max-statements -- Number expression lowering includes temporary runtime array method branches.
function emitNumberExpression(expression: JsIrNumberExpression, context: EmitContext): NumberValue {
  if (expression.kind === "regexSearch") {
    const regex = emitValueExpression(expression.regex, context);
    const input = emitStringExpression(expression.input, context);
    const inputValue = `%regex.search.input.${context.callIndex}`;
    useRuntimeHelper(context.runtime, "valueBoxString");
    useRuntimeHelper(context.runtime, "regexSearch");
    const call = emitGeneratedJsCall("regexSearch", [`i64 ${regex.value}`, `i64 ${inputValue}`], context);
    const number = `%regex.search.number.${context.numIndex}`;
    context.numIndex += 1;
    return {
      lines: [
        ...regex.lines,
        `  call void @gcRootPush(i64 ${regex.value})`,
        ...input.lines,
        `  ${inputValue} = call i64 @valueBoxString(ptr ${input.value}, i64 ${input.length})`,
        ...call.lines,
        `  ${number} = call double @valueNumber(i64 ${call.value})`
      ],
      value: number
    };
  }
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

  if (expression.kind === "runtimeCollectionSize") {
    const collection = emitRuntimeCollectionPointer(expression.collectionName, context);
    const raw = `%collection.size.${context.arrayIndex}`;
    context.arrayIndex += 1;
    const number = `%num.${context.numIndex}`;
    context.numIndex += 1;
    useRuntimeHelper(context.runtime, "collectionSize");
    return { lines: [...collection.lines, `  ${raw} = call i64 @collectionSize(ptr ${collection.value})`, `  ${number} = sitofp i64 ${raw} to double`], value: number };
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

  if (expression.kind === "update") {
    return emitUpdateNumberExpression(expression, context);
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
    if (expression.operator === "bitNot") {
      const integer = `%num.i32.${index}`;
      const inverted = `%num.not.${index}`;
      return {
        lines: [...value.lines, `  ${integer} = fptosi double ${value.value} to i32`, `  ${inverted} = xor i32 ${integer}, -1`, `  ${name} = sitofp i32 ${inverted} to double`],
        value: name
      };
    }

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
  if (isBitwiseNumberOperator(expression.operator)) {
    return emitBitwiseNumberExpression(expression, left, right, name, index);
  }
  if (expression.operator === "power") {
    useRuntimeHelper(context.runtime, "mathPow");
    return { lines: [...left.lines, ...right.lines, `  ${name} = call double @mathPow(double ${left.value}, double ${right.value})`], value: name };
  }

  return {
    lines: [...left.lines, ...right.lines, `  ${name} = ${llvmNumberOperator(expression.operator)} double ${left.value}, ${right.value}`],
    value: name
  };
}

function emitUpdateNumberExpression(
  expression: Extract<JsIrNumberExpression, { readonly kind: "update" }>,
  context: EmitContext
): NumberValue {
  const index = context.numIndex;
  context.numIndex += 1;
  const current = `%num.update.current.${index}`;
  const next = `%num.update.next.${index}`;
  const pointer = variablePointerName(expression.name);
  let instruction = "fadd";
  if (expression.operator === "decrement") {
    instruction = "fsub";
  }
  let result = current;
  if (expression.prefix) {
    result = next;
  }
  return {
    lines: [`  ${current} = load double, ptr ${pointer}`, `  ${next} = ${instruction} double ${current}, 1.0`, `  store double ${next}, ptr ${pointer}`],
    value: result
  };
}

function isBitwiseNumberOperator(operator: JsIrNumberOperator): boolean {
  return operator === "bitAnd" || operator === "bitOr" || operator === "bitXor" || operator === "shiftLeft" || operator === "shiftRight" || operator === "shiftRightUnsigned";
}

function emitBitwiseNumberExpression(
  expression: Extract<JsIrNumberExpression, { readonly kind: "binary" }>,
  left: NumberValue,
  right: NumberValue,
  name: string,
  index: number
): NumberValue {
  const leftInt = `%num.left.i32.${index}`;
  const rightInt = `%num.right.i32.${index}`;
  const raw = `%num.bitwise.${index}`;
  const resultInstruction = bitwiseInstruction(expression.operator);
  let conversion = `sitofp i32 ${raw} to double`;
  if (expression.operator === "shiftRightUnsigned") {
    conversion = `uitofp i32 ${raw} to double`;
  }
  return {
    lines: [
      ...left.lines,
      ...right.lines,
      `  ${leftInt} = fptosi double ${left.value} to i32`,
      `  ${rightInt} = fptosi double ${right.value} to i32`,
      `  ${raw} = ${resultInstruction} i32 ${leftInt}, ${rightInt}`,
      `  ${name} = ${conversion}`
    ],
    value: name
  };
}

function bitwiseInstruction(operator: JsIrNumberOperator): string {
  switch (operator) {
    case "bitAnd": { return "and"; }
    case "bitOr": { return "or"; }
    case "bitXor": { return "xor"; }
    case "shiftLeft": { return "shl"; }
    case "shiftRight": { return "ashr"; }
    case "shiftRightUnsigned": { return "lshr"; }
    default: { throw new Error("Unsupported bitwise operator"); }
  }
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

// eslint-disable-next-line complexity, max-statements -- Math lowering dispatches the supported static runtime surface in one place.
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
  if (expression.method === "hypot") {
    useRuntimeHelper(context.runtime, "mathHypot2");
    const left = args[0]?.value ?? "0.0";
    const right = args[1]?.value ?? "0.0";
    return { lines: [...lines, `  ${number} = call double @mathHypot2(double ${left}, double ${right})`], value: number };
  }
  if (expression.method === "imul") {
    useRuntimeHelper(context.runtime, "mathImul");
    const left = args[0]?.value ?? "0.0";
    const right = args[1]?.value ?? "0.0";
    return { lines: [...lines, `  ${number} = call double @mathImul(double ${left}, double ${right})`], value: number };
  }
  if (expression.method === "random") {
    useRuntimeHelper(context.runtime, "mathRandom");
    return { lines: [...lines, `  ${number} = call double @mathRandom()`], value: number };
  }
  const helperByMethod = {
    abs: "mathAbs",
    floor: "mathFloor",
    ceil: "mathCeil",
    trunc: "mathTrunc",
    round: "mathRound",
    sqrt: "mathSqrt",
    cbrt: "mathCbrt",
    exp: "mathExp",
    log: "mathLog",
    log2: "mathLog2",
    log10: "mathLog10",
    fround: "mathFround",
    clz32: "mathClz32",
    sin: "mathSin",
    cos: "mathCos",
    tan: "mathTan",
    sign: "mathSign"
  } as const;
  const helper = helperByMethod[expression.method];
  useRuntimeHelper(context.runtime, helper);
  const argument = args[0]?.value ?? "0.0";
  return { lines: [...lines, `  ${number} = call double @${runtimeMathFunctionName(helper)}(double ${argument})`], value: number };
}

function runtimeMathFunctionName(helper: RuntimeHelper): string {
  return helper;
}

function arrayNumberAppendHelper(kind: "arrayPush" | "arrayUnshift"): "arrayPush" | "arrayUnshift" {
  if (kind === "arrayPush") {
    return "arrayPush";
  }
  return "arrayUnshift";
}

// eslint-disable-next-line max-statements -- Pre-existing aggregate number expression dispatch centralizes array/object/math branches in one place.
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

  if (expression.kind === "valueLength") {
    const receiver = emitValueExpression(expression.value, context);
    const index = context.numIndex;
    context.numIndex += 1;
    const length = `%value.len.${index}`;
    const value = `%num.${index}`;
    useRuntimeHelper(context.runtime, "valueLength");
    return { lines: [...receiver.lines, `  ${length} = call i64 @valueLength(i64 ${receiver.value})`, `  ${value} = uitofp i64 ${length} to double`], value };
  }

  if (expression.kind === "valueObjectLength") {
    const receiver = emitValueExpression(expression.value, context);
    const index = context.numIndex;
    context.numIndex += 1;
    const raw = `%obj.len.${index}`;
    const value = `%num.${index}`;
    useRuntimeHelper(context.runtime, "valueObjectGet");
    const lengthKey = addStringConstant("length", context);
    return {
      lines: [...receiver.lines, `  ${raw} = call i64 @valueObjectGet(i64 ${receiver.value}, i64 6, ptr ${lengthKey})`, `  ${value} = sitofp i64 ${raw} to double`],
      value
    };
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

function emitRuntimeCollectionPointer(collectionName: string, context: EmitContext): NumberValue {
  const index = context.objectIndex;
  context.objectIndex += 1;
  const value = `%collection.ptr.${index}`;
  return { lines: [`  ${value} = load ptr, ptr ${variablePointerName(collectionName)}`], value };
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

// JS string index arguments convert NaN to zero before clamping; fptosi on NaN
// is poison in LLVM, so the conversion is guarded explicitly.
function emitStringIndexArgument(expression: JsIrNumberExpression, context: EmitContext): NumberValue {
  if (expression.kind === "literal") {
    return { lines: [], value: String(expression.value) };
  }
  const number = emitNumberExpression(expression, context);
  const index = context.arrayIndex;
  context.arrayIndex += 1;
  const nanCheck = `%arr.idx.nan.${index}`;
  const safe = `%arr.idx.safe.${index}`;
  const name = `%arr.idx.${index}`;
  return {
    lines: [
      ...number.lines,
      `  ${nanCheck} = fcmp uno double ${number.value}, ${number.value}`,
      `  ${safe} = select i1 ${nanCheck}, double 0.0, double ${number.value}`,
      `  ${name} = fptosi double ${safe} to i64`
    ],
    value: name
  };
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

// eslint-disable-next-line complexity, max-statements -- Runtime string expression emission is centralized during the JSValue transition.
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

  if (expression.kind === "regexReplace") {
    const receiver = emitStringExpression(expression.receiver, context);
    const regex = emitValueExpression(expression.regex, context);
    const replacement = emitStringExpression(expression.replacement, context);
    const receiverValue = `%regex.replace.receiver.${context.callIndex}`;
    const replacementValue = `%regex.replace.replacement.${context.callIndex}`;
    useRuntimeHelper(context.runtime, "valueBoxString");
    useRuntimeHelper(context.runtime, "valueStringPtr");
    useRuntimeHelper(context.runtime, "valueStringLength");
    useRuntimeHelper(context.runtime, "regexReplace");
    const call = emitGeneratedJsCall("regexReplace", [`i64 ${regex.value}`, `i64 ${receiverValue}`, `i64 ${replacementValue}`], context);
    const value = `%regex.replace.ptr.${context.stringIndex}`;
    const length = `%regex.replace.len.${context.stringIndex}`;
    context.stringIndex += 1;
    return {
      lines: [
        ...receiver.lines,
        ...regex.lines,
        ...replacement.lines,
        `  ${receiverValue} = call i64 @valueBoxString(ptr ${receiver.value}, i64 ${receiver.length})`,
        `  ${replacementValue} = call i64 @valueBoxString(ptr ${replacement.value}, i64 ${replacement.length})`,
        ...call.lines,
        `  ${value} = call ptr @valueStringPtr(i64 ${call.value})`,
        `  ${length} = call i64 @valueStringLength(i64 ${call.value})`
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
      trimEnd: "stringTrimEnd",
      toUpperCase: "stringToUpperCase",
      toLowerCase: "stringToLowerCase",
      repeat: "stringRepeat",
      replace: "stringReplace",
      replaceAll: "stringReplaceAll",
      padStart: "stringPadStart",
      padEnd: "stringPadEnd",
      at: "stringAt",
      charAt: "stringCharAt",
      slice: "stringSlice",
      substring: "stringSubstring",
      substr: "stringSubstr",
      normalize: "stringNormalize"
    } as const;
    const helper = helperByMethod[expression.method];
    useRuntimeHelper(context.runtime, helper);
    if (expression.method === "repeat") {
      const count = emitArrayIndex(expression.count ?? { kind: "literal", value: 0 }, context);
      return {
        lines: [
          ...receiver.lines,
          ...count.lines,
          `  ${raw} = call { ptr, i64 } @${helper}(i64 ${receiver.length}, ptr ${receiver.value}, i64 ${count.value})`,
          `  ${value} = extractvalue { ptr, i64 } ${raw}, 0`,
          `  ${length} = extractvalue { ptr, i64 } ${raw}, 1`
        ],
        value,
        length
      };
    }
    if (expression.method === "replace" || expression.method === "replaceAll") {
      const search = emitStringExpression(expression.search ?? { kind: "literal", value: "" }, context);
      const replacement = emitStringExpression(expression.replacement ?? { kind: "literal", value: "" }, context);
      return {
        lines: [
          ...receiver.lines,
          ...search.lines,
          ...replacement.lines,
          `  ${raw} = call { ptr, i64 } @${helper}(i64 ${receiver.length}, ptr ${receiver.value}, i64 ${search.length}, ptr ${search.value}, i64 ${replacement.length}, ptr ${replacement.value})`,
          `  ${value} = extractvalue { ptr, i64 } ${raw}, 0`,
          `  ${length} = extractvalue { ptr, i64 } ${raw}, 1`
        ],
        value,
        length
      };
    }
    if (expression.method === "padStart" || expression.method === "padEnd") {
      const targetLength = emitArrayIndex(expression.targetLength ?? { kind: "literal", value: 0 }, context);
      const padString = emitStringExpression(expression.padString ?? { kind: "literal", value: "" }, context);
      return {
        lines: [
          ...receiver.lines,
          ...targetLength.lines,
          ...padString.lines,
          `  ${raw} = call { ptr, i64 } @${helper}(i64 ${receiver.length}, ptr ${receiver.value}, i64 ${targetLength.value}, i64 ${padString.length}, ptr ${padString.value})`,
          `  ${value} = extractvalue { ptr, i64 } ${raw}, 0`,
          `  ${length} = extractvalue { ptr, i64 } ${raw}, 1`
        ],
        value,
        length
      };
    }
    if (expression.method === "at") {
      const position = emitArrayIndex(expression.position ?? { kind: "literal", value: 0 }, context);
      return {
        lines: [
          ...receiver.lines,
          ...position.lines,
          `  ${raw} = call { ptr, i64 } @${helper}(i64 ${receiver.length}, ptr ${receiver.value}, i64 ${position.value})`,
          `  ${value} = extractvalue { ptr, i64 } ${raw}, 0`,
          `  ${length} = extractvalue { ptr, i64 } ${raw}, 1`
        ],
        value,
        length
      };
    }
    if (expression.method === "charAt") {
      const position = emitStringIndexArgument(expression.position ?? { kind: "literal", value: 0 }, context);
      return {
        lines: [
          ...receiver.lines,
          ...position.lines,
          `  ${raw} = call { ptr, i64 } @${helper}(i64 ${receiver.length}, ptr ${receiver.value}, i64 ${position.value})`,
          `  ${value} = extractvalue { ptr, i64 } ${raw}, 0`,
          `  ${length} = extractvalue { ptr, i64 } ${raw}, 1`
        ],
        value,
        length
      };
    }
    if (expression.method === "slice" || expression.method === "substring" || expression.method === "substr") {
      const start = emitStringIndexArgument(expression.start ?? { kind: "literal", value: 0 }, context);
      const end = emitStringIndexArgument(expression.end ?? { kind: "literal", value: Number.MAX_SAFE_INTEGER }, context);
      return {
        lines: [
          ...receiver.lines,
          ...start.lines,
          ...end.lines,
          `  ${raw} = call { ptr, i64 } @${helper}(i64 ${receiver.length}, ptr ${receiver.value}, i64 ${start.value}, i64 ${end.value})`,
          `  ${value} = extractvalue { ptr, i64 } ${raw}, 0`,
          `  ${length} = extractvalue { ptr, i64 } ${raw}, 1`
        ],
        value,
        length
      };
    }
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

  if (expression.kind === "stringFromCharCode") {
    useRuntimeHelper(context.runtime, "stringFromCharCode");
    const index = context.stringIndex;
    context.stringIndex += 1;
    const raw = `%str.result.${index}`;
    const value = `%str.${index}`;
    const length = `%str.len.${index}`;
    const codesAddress = `%str.codes.${index}`;
    const lines: string[] = [`  ${codesAddress} = alloca i64, i64 ${expression.codes.length}`];
    for (let i = 0; i < expression.codes.length; i++) {
      const code = emitStringIndexArgument(expression.codes[i], context);
      const slot = `%str.code.${index}.${i}`;
      lines.push(...code.lines);
      lines.push(`  ${slot} = getelementptr i64, ptr ${codesAddress}, i64 ${i}`);
      lines.push(`  store i64 ${code.value}, ptr ${slot}`);
    }
    lines.push(`  ${raw} = call { ptr, i64 } @stringFromCharCode(ptr ${codesAddress}, i64 ${expression.codes.length})`);
    lines.push(`  ${value} = extractvalue { ptr, i64 } ${raw}, 0`);
    lines.push(`  ${length} = extractvalue { ptr, i64 } ${raw}, 1`);
    return { lines, value, length };
  }

  if (expression.kind === "taggedTemplate") {
    return emitTaggedTemplateCall(
      expression.tag,
      expression.head,
      expression.middleTexts,
      expression.expressions,
      context
    );
  }

  if (expression.kind === "numberFormat") {
    const receiver = emitNumberExpression(expression.receiver, context);
    const argument = emitNumberExpression(expression.argument ?? defaultNumberFormatArgument(expression.method), context);
    const index = context.stringIndex;
    context.stringIndex += 1;
    const raw = `%str.result.${index}`;
    const value = `%str.${index}`;
    const length = `%str.len.${index}`;
    const helperByMethod = {
      toFixed: "numberToFixed",
      toPrecision: "numberToPrecision",
      toExponential: "numberToExponential",
      toString: "numberToStringRadix"
    } as const;
    const helper = helperByMethod[expression.method];
    useRuntimeHelper(context.runtime, helper);
    return {
      lines: [
        ...receiver.lines,
        ...argument.lines,
        `  ${raw} = call { ptr, i64 } @${helper}(double ${receiver.value}, double ${argument.value})`,
        `  ${value} = extractvalue { ptr, i64 } ${raw}, 0`,
        `  ${length} = extractvalue { ptr, i64 } ${raw}, 1`
      ],
      value,
      length
    };
  }

  return emitTernaryStringExpression(expression, context);
}

// eslint-disable-next-line max-statements -- Tagged template emission materializes the strings array, boxes each segment, and forwards them to the tag function alongside the interpolated values.
function emitTaggedTemplateCall(
  tag: string,
  head: string,
  middleTexts: readonly string[],
  expressions: readonly JsIrValueExpression[],
  context: EmitContext
): StringValue {
  const lines: string[] = [];
  useRuntimeHelper(context.runtime, "arrayNew");
  useRuntimeHelper(context.runtime, "arraySet");
  useRuntimeHelper(context.runtime, "valueBoxString");
  const { arrayIndex } = context;
  context.arrayIndex += 1;
  const stringsArray = `%strings.array.${arrayIndex}`;
  const totalStrings = middleTexts.length + 1;
  lines.push(`  ${stringsArray} = call ptr @arrayNew(i64 ${totalStrings})`);
  const headString = addStringConstant(head, context);
  const headLength = String(utf8ByteLength(head));
  const headBoxIndex = context.numIndex;
  context.numIndex += 1;
  const headBox = `%value.${headBoxIndex}`;
  lines.push(`  ${headBox} = call i64 @valueBoxString(ptr ${headString}, i64 ${headLength})`);
  lines.push(emitRootStackPush(headBox, context));
  lines.push(`  call void @arraySet(ptr ${stringsArray}, i64 0, i64 ${headBox})`);
  for (let i = 0; i < middleTexts.length; i++) {
    const text = middleTexts[i];
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
  useRuntimeHelper(context.runtime, "valueBoxArray");
  lines.push(`  ${stringsBox} = call i64 @valueBoxArray(ptr ${stringsArray})`);
  lines.push(emitRootStackPush(stringsBox, context));
  const expressionValues = expressions.map((expr) => emitValueExpression(expr, context));
  for (const value of expressionValues) {
    lines.push(...value.lines);
  }
  const callArgs = [`i64 ${stringsBox}`, ...expressionValues.map((v) => `i64 ${v.value}`)];
  const generated = emitGeneratedJsCall(tag, callArgs, context);
  const valueIndex = context.stringIndex;
  context.stringIndex += 1;
  const value = `%str.${valueIndex}`;
  const length = `%str.len.${valueIndex}`;
  useRuntimeHelper(context.runtime, "valueStringPtr");
  useRuntimeHelper(context.runtime, "valueStringLength");
  lines.push(...generated.lines);
  lines.push(`  ${value} = call ptr @valueStringPtr(i64 ${generated.value})`);
  lines.push(`  ${length} = call i64 @valueStringLength(i64 ${generated.value})`);
  return { lines, value, length };
}

function defaultNumberFormatArgument(method: Extract<JsIrStringExpression, { readonly kind: "numberFormat" }>["method"]): JsIrNumberExpression {
  if (method === "toPrecision" || method === "toExponential") {
    return { kind: "literal", value: 6 };
  }
  if (method === "toString") {
    return { kind: "literal", value: 10 };
  }
  return { kind: "literal", value: 0 };
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
    case "remainder": {
      return "frem";
    }
    case "bitAnd":
    case "bitOr":
    case "bitXor":
    case "shiftLeft":
    case "shiftRight":
    case "shiftRightUnsigned": {
      throw new Error("Bitwise operators are emitted through integer lowering");
    }
    case "power": {
      throw new Error("Power operator is emitted through mathPow");
    }
    default: {
      const unsupported: never = operator;
      throw new Error(`Unsupported number operator: ${String(unsupported)}`);
    }
  }
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
  return `  %print.${index}.nan = fcmp uno double ${value}, ${value}
  br i1 %print.${index}.nan, label %print.nan.${index}, label %print.check-infinity.${index}
print.nan.${index}:
  %print.${index}.nan.result = call i32 @puts(ptr @.fmt.number.nan)
  br label %print.end.${index}
print.check-infinity.${index}:
  %print.${index}.bits = call i64 @valueBoxNumber(double ${value})
  %print.${index}.absolute-bits = and i64 %print.${index}.bits, 9223372036854775807
  %print.${index}.infinite = icmp eq i64 %print.${index}.absolute-bits, 9218868437227405312
  br i1 %print.${index}.infinite, label %print.infinity-sign.${index}, label %print.finite.${index}
print.infinity-sign.${index}:
  %print.${index}.negative = icmp slt i64 %print.${index}.bits, 0
  br i1 %print.${index}.negative, label %print.negative-infinity.${index}, label %print.positive-infinity.${index}
print.negative-infinity.${index}:
  %print.${index}.negative-infinity.result = call i32 @puts(ptr @.fmt.number.negative-infinity)
  br label %print.end.${index}
print.positive-infinity.${index}:
  %print.${index}.positive-infinity.result = call i32 @puts(ptr @.fmt.number.infinity)
  br label %print.end.${index}
print.finite.${index}:
  %print.${index} = call i32 (ptr, ...) @printf(ptr @.fmt.number, double ${value})
  br label %print.end.${index}
print.end.${index}:`;
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
