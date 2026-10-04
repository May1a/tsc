import {
  type JsIrBindingValue,
  type JsIrFunctionObjectDefinition,
  type JsIrModule,
  type JsIrOperation,
  aggregateBindingForOperation,
  visitJsIrOperations
} from "./ir.js";
import type { EmitContext, FunctionDef } from "./llvm/context.js";

import type { CompilerDiagnostic } from "./diagnostics.js";
import { type TraceMapV1, buildTraceMap } from "./trace.js";
import { noLines } from "./llvm/branches.js";
import { functionObjectExpectedArgumentCount, internedFunctionGlobal } from "./llvm/function-objects.js";
import { emitFunctionDefinition, emitFunctionObjectThunk } from "./llvm/function-definitions.js";
import { emitInlineCppDeclarations } from "./llvm/inline-cpp.js";
import { operationListTerminates } from "./llvm/loops.js";
import { createMainEmitContext } from "./llvm/contexts.js";
import { addStringConstant, utf8ByteLength } from "./llvm/strings.js";
import { defineStructuredRuntimeHelpers, runtimeIrText } from "./runtime-ir.js";
import { COMPLETION_NORMAL } from "./llvm/completion.js";
import {
  jsValueUndefined
} from "./llvm/values.js";
import { type LegacyLlvmTraceMarker, type RenderedLlvmModule, createLlvmModule } from "./llvm-ir/index.js";

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

