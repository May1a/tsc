import type { JsIrSwitchClause } from "./expressions.js";
import type { JsIrOperation } from "./types.js";
import { jsIrLeafOperationKinds } from "./visit.js";
import type { JsIrLowerOptions, JsIrLoweringMode, JsIrModuleImport, JsIrOperationTrace, JsIrResult } from "./module.js";
import type { CompilerDiagnostic } from "../diagnostics.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import { createInlineCppCompilation, inlineCppDisabledDiagnostic } from "./inline-cpp.js";
import type { JsIrBindingValue, JsIrFunctionObjectDefinition, JsIrFunctionParameter } from "./bindings.js";
import { collectFunctionObjectDefinitions, collectPromotedAggregateNames } from "./captures.js";
import { type ClassInfo, appendClassOperations } from "./class-info.js";
import { collectClassHierarchy } from "./class-hierarchy.js";
import { collectStoragePlan } from "./storage-plan.js";
import { withHoistedVars } from "./var-hoisting.js";
import { isNonExecutableDeclaration, unsupportedStatementDiagnostic } from "./comparisons.js";
import { lowerClassStatement, preregisterModuleClasses } from "./classes.js";
import { markRuntimeObjectShadows, updateBindings } from "./binding-updates.js";
import { collectForwardReferences } from "./forward-references.js";
import { boundNames } from "./predicates.js";
import { createLoweringContext } from "./lowering-context.js";
import { functionReferenceBinding } from "./function-parameters.js";
import {
  DEFAULT_EXPORT_BINDING_NAME,
  type ModuleExportIndex,
  buildModuleExportIndex,
  buildModuleNamespaceInitOperations,
  buildModuleNamespacePopulateOperations,
  orderSourceFiles,
  wireModuleImports
} from "./module-linking.js";

const traceOperationIdWidth = 6;

/** Hands out a module's trace ids in the order the trace map's walk asks for them. */
function createTraceIdSource(moduleIndex: number): () => string {
  let operationIndex = 0;
  return () => {
    const id = `m${moduleIndex}:o${operationIndex.toString().padStart(traceOperationIdWidth, "0")}`;
    operationIndex += 1;
    return id;
  };
}

/**
 * Numbers a module's operations for the trace map, and returns the tree carrying those numbers.
 *
 * An id names one operation, and `buildTraceMap` walks a module in the order `visitJsIrOperations`
 * walks it, so ids are handed out in that order: a container first, then its children. They cannot be
 * given while the tree is built, because a container's id depends on how many operations precede it.
 *
 * The tree is rebuilt rather than written into. `JsIrOperation.trace` is readonly, and one operation
 * object can sit under several parents, so filling the field in place would mean casting each
 * operation to a type that disagrees with its own declaration. Rebuilding keeps every field's declared
 * mutability and makes the pass total: `withTracedChildren` has a case for every container kind
 * `visit.ts` classifies, and its default asserts that what is left is leaves.
 */
function finalizeOperationTraces(operations: readonly JsIrOperation[], nextTraceId: () => string): readonly JsIrOperation[] {
  return operations.map((operation) => tracedOperation(operation, undefined, nextTraceId));
}

function traceParameterBindings(
  parameters: readonly JsIrFunctionParameter[],
  rebuild: (operation: JsIrOperation) => JsIrOperation
): readonly JsIrFunctionParameter[] {
  return parameters.map((parameter) => ({ ...parameter, bindingOperations: parameter.bindingOperations?.map(rebuild) }));
}

/** One operation with its trace filled in, then the same for everything nested inside it. */
function tracedOperation(
  operation: JsIrOperation,
  parent: JsIrOperation | undefined,
  nextTraceId: () => string
): JsIrOperation {
  const id = nextTraceId();
  const origin = operation.trace?.origin ?? "synthesized";
  // A synthesized operation has no source of its own, so it inherits its parent's — the statement the
  // lowering generated it for.
  const source = operation.trace?.source ?? parent?.trace?.source;
  const trace: JsIrOperationTrace = source === undefined ? { id, origin } : { id, origin, source };
  return withTracedChildren({ ...operation, trace }, nextTraceId);
}

/**
 * The operation with its nested operations rebuilt, for the container kinds.
 *
 * The child order here has to match `jsIrOperationChildren`, because the ids are handed out in the
 * order that walk visits them.
 */
// eslint-disable-next-line complexity -- One case per container operation kind, as visit.ts states them.
function withTracedChildren(operation: JsIrOperation, nextTraceId: () => string): JsIrOperation {
  switch (operation.kind) {
    case "arrayDestructureProtocol": {
      const rebuild = tracedOperationChild(operation, nextTraceId);
      return {
        ...operation,
        elements: operation.elements.map((element) =>
          element.kind === "nested" ? { ...element, operations: element.operations.map(rebuild) } : element)
      };
    }
    case "runtimeArrayMapFunctionObject": {
      const rebuild = tracedOperationChild(operation, nextTraceId);
      return { ...operation, callbackParameters: traceParameterBindings(operation.callbackParameters, rebuild),
        callbackBody: operation.callbackBody.map(rebuild) };
    }
    case "block":
    case "labeledBlock":
    case "bindingGroup": {
      return { ...operation, operations: operation.operations.map(tracedOperationChild(operation, nextTraceId)) };
    }
    case "tryCatch": {
      const rebuild = tracedOperationChild(operation, nextTraceId);
      const { finallyOperations } = operation;
      return {
        ...operation,
        tryOperations: operation.tryOperations.map(rebuild),
        catchOperations: operation.catchOperations.map(rebuild),
        // Absent stays absent: emission distinguishes "no finally block" from an empty one.
        ...(finallyOperations === undefined ? {} : { finallyOperations: finallyOperations.map(rebuild) })
      };
    }
    case "if": {
      const rebuild = tracedOperationChild(operation, nextTraceId);
      return {
        ...operation,
        thenOperations: operation.thenOperations.map(rebuild),
        elseOperations: operation.elseOperations.map(rebuild)
      };
    }
    case "switch": {
      const rebuild = tracedOperationChild(operation, nextTraceId);
      return { ...operation, clauses: operation.clauses.map(tracedSwitchClause(rebuild)) };
    }
    case "function": {
      const rebuild = tracedOperationChild(operation, nextTraceId);
      return { ...operation,
        parameters: traceParameterBindings(operation.parameters, rebuild),
        body: operation.body.map(rebuild) };
    }
    case "while":
    case "doWhile":
    case "forOfArray":
    case "forOfString":
    case "forOfSet":
    case "forOfMap":
    case "forOfProtocol":
    case "forInObject":
    case "forInArray":
    case "forInValue":
    case "returnClosure": {
      return { ...operation, body: operation.body.map(tracedOperationChild(operation, nextTraceId)) };
    }
    case "for": {
      const rebuild = tracedOperationChild(operation, nextTraceId);
      const { increment } = operation;
      return {
        ...operation,
        initializer: operation.initializer.map(rebuild),
        body: operation.body.map(rebuild),
        // Absent stays absent: emission distinguishes "no update step" from an empty one.
        ...(increment === undefined ? {} : { increment: rebuild(increment) })
      };
    }
    default: {
      // The residual is exactly the leaf set, so indexing jsIrLeafOperationKinds is total by
      // construction and the throw is unreachable. The lint warning is the proof of that, as in visit.ts.
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- totality of the Record is the invariant
      if (!jsIrLeafOperationKinds[operation.kind]) {
        throw new Error(`Unclassified JsIrOperation leaf: ${operation.kind}`);
      }
      return operation;
    }
  }
}

/**
 * The rebuild a container applies to each of its children, with the parent they inherit a source from.
 *
 * The parent passed is the rebuilt operation — the one whose trace is already final — which is what a
 * synthesized child inherits its source location from.
 */
function tracedOperationChild(
  parent: JsIrOperation,
  nextTraceId: () => string
): (operation: JsIrOperation) => JsIrOperation {
  return (child) => tracedOperation(child, parent, nextTraceId);
}

function tracedSwitchClause(
  rebuild: (operation: JsIrOperation) => JsIrOperation
): (clause: JsIrSwitchClause) => JsIrSwitchClause {
  return (clause) => ({ ...clause, operations: clause.operations.map(rebuild) });
}

interface LoweredStatements {
  readonly operations: readonly JsIrOperation[];
  readonly diagnostics: readonly CompilerDiagnostic[];
  readonly loweringMode: JsIrLoweringMode;
  readonly imports: readonly JsIrModuleImport[];
}

/** Module bindings a function or class mentions before the statement declaring them has run. */
function collectForwardReferencedModuleBindings(statements: readonly ts.Statement[]): ReadonlySet<string> {
  const order = new Map<string, number>();
  for (const [index, statement] of statements.entries()) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    for (const name of statement.declarationList.declarations.flatMap((declaration) => boundNames(declaration.name))) {
      if (!order.has(name)) {
        order.set(name, index);
      }
    }
  }
  return collectForwardReferences(statements, order);
}

function lowerStatements(
  context: LoweringContext,
  sourceFile: ts.SourceFile,
  exportIndex: ModuleExportIndex,
  programChecker: ts.TypeChecker | undefined,
  filesByName: ReadonlyMap<string, ts.SourceFile>,
  moduleClassesByFile: Map<string, Map<string, ClassInfo>>
): LoweredStatements {
  const isPackageFile = exportIndex.packageGraph?.requestedExportsByFile.has(sourceFile.fileName) === true;
  const moduleContext: LoweringContext = isPackageFile ? { ...context, typeChecker: undefined } : context;
  moduleContext.nextFunctionObjectId = 0;
  moduleContext.nextJsonStatementValueId = 0;
  moduleContext.nextOptionalCallStatementValueId = 0;
  moduleContext.nextSyntheticTempId = 0;
  moduleContext.classes = new Map<string, ClassInfo>();
  moduleContext.storagePlan = collectStoragePlan(sourceFile, context.typeChecker);
  moduleContext.moduleForwardBindings = collectForwardReferencedModuleBindings(sourceFile.statements);
  const inlineCppDiagnostic = inlineCppDisabledDiagnostic(moduleContext.inlineCpp, sourceFile);
  if (inlineCppDiagnostic !== undefined) {
    return { operations: [], diagnostics: [inlineCppDiagnostic], loweringMode: "native", imports: [] };
  }

  return lowerTopLevelStatements(moduleContext, sourceFile, exportIndex, programChecker, filesByName, moduleClassesByFile);
}

function preregisterHoistedFunctions(
  statements: readonly ts.Statement[],
  bindings: Map<string, JsIrBindingValue>
): void {
  for (const statement of statements) {
    if (!isNonExecutableDeclaration(statement) && ts.isFunctionDeclaration(statement) && statement.name !== undefined && statement.body !== undefined) {
      bindings.set(statement.name.text, functionReferenceBinding(statement));
    }
  }
}

function lowerTopLevelStatement(
  context: LoweringContext,
  sourceFile: ts.SourceFile,
  statement: ts.Statement,
  bindings: Map<string, JsIrBindingValue>,
  promotedAggregates: ReadonlySet<string>,
  importedClassNames: ReadonlySet<string>,
  localClasses: Map<string, ClassInfo>,
  operations: JsIrOperation[],
  diagnostics: CompilerDiagnostic[]
): void {
  if (isNonExecutableDeclaration(statement)) {
    return;
  }
  if (ts.isExportAssignment(statement)) {
    const value = context.lowerValueExpression(context, statement.expression, bindings);
    if (value.kind === "lowered") {
      const op: JsIrOperation = { kind: "letValue", name: DEFAULT_EXPORT_BINDING_NAME, value: value.operation };
      operations.push(op);
      updateBindings(op, bindings);
    } else {
      diagnostics.push(unsupportedStatementDiagnostic(sourceFile, statement, value, bindings));
    }
    return;
  }
  const classResult = lowerClassStatement(context, statement, bindings, context.classes);
  if (classResult !== undefined) {
    if (classResult.kind === "unsupported") {
      diagnostics.push(unsupportedStatementDiagnostic(sourceFile, statement, classResult, bindings));
    } else {
      appendClassOperations(operations, classResult.operation, statement, bindings);
      recordNewModuleClasses(context.classes, importedClassNames, localClasses, context, sourceFile.fileName);
    }
    return;
  }
  const result = context.lowerStatement(context, statement, bindings, promotedAggregates);
  if (result.kind === "lowered") {
    operations.push(result.operation);
    updateBindings(result.operation, bindings);
    return;
  }
  diagnostics.push(unsupportedStatementDiagnostic(sourceFile, statement, result, bindings));
}

/**
 * Lowers a source file's top-level statements, collecting a TSCN1002 for each one nothing
 * recognizes. There is no second attempt: a statement that does not lower is reported where it
 * failed, and a class statement that does not lower is reported with the reason the class tier gave.
 */
function lowerTopLevelStatements(
  context: LoweringContext,
  sourceFile: ts.SourceFile,
  exportIndex: ModuleExportIndex,
  programChecker: ts.TypeChecker | undefined,
  filesByName: ReadonlyMap<string, ts.SourceFile>,
  moduleClassesByFile: Map<string, Map<string, ClassInfo>>
): LoweredStatements {
  const operations: JsIrOperation[] = [];
  const bindings = new Map<string, JsIrBindingValue>();
  const diagnostics: CompilerDiagnostic[] = [];
  const promotedAggregates = collectPromotedAggregateNames(sourceFile.statements);
  const { classes } = context;
  const imported = wireModuleImports(context, sourceFile, exportIndex, programChecker, filesByName, moduleClassesByFile, bindings);
  const importedClassNames = new Set(classes.keys());
  const localClasses = new Map<string, ClassInfo>();
  moduleClassesByFile.set(sourceFile.fileName, localClasses);

  return withHoistedVars(context, sourceFile.statements, bindings, new Set(), (preface) => {
    operations.push(...imported.preamble, ...preface);
    preregisterHoistedFunctions(sourceFile.statements, bindings);
    operations.push(...buildModuleNamespaceInitOperations(sourceFile, exportIndex));
    preregisterModuleClasses(sourceFile.statements, bindings, classes);
    for (const statement of sourceFile.statements) {
      lowerTopLevelStatement(context, sourceFile, statement, bindings, promotedAggregates, importedClassNames, localClasses, operations, diagnostics);
    }
    operations.push(
      ...buildModuleNamespacePopulateOperations(
        context,
        sourceFile,
        exportIndex,
        programChecker,
        filesByName,
        moduleClassesByFile,
        localClasses,
        bindings,
        imported.addImport
      )
    );
    return { operations: markRuntimeObjectShadows(operations), diagnostics, loweringMode: "native", imports: imported.imports };
  });
}

function recordNewModuleClasses(
  classes: ReadonlyMap<string, ClassInfo>,
  importedClassNames: ReadonlySet<string>,
  localClasses: Map<string, ClassInfo>,
  context: LoweringContext,
  fileName: string
): void {
  for (const [name, info] of classes) {
    if (importedClassNames.has(name) || localClasses.has(name)) {
      continue;
    }
    localClasses.set(name, info);
    context.allClasses.set(info.name, info);
    context.classOwnerFiles.set(info.name, fileName);
  }
}

/**
 * Lower parsed TypeScript sources and return their diagnostics.
 *
 * Each call creates its own LoweringContext, so every registry, counter, checker and inline C++ block
 * below belongs to this invocation alone: the pass is pure, synchronous and re-entrant, and compiling
 * the same program twice produces the same IR.
 */
export function lowerToJsIr(
  entry: string,
  sourceFiles: readonly ts.SourceFile[],
  checker?: ts.TypeChecker,
  options: JsIrLowerOptions = {}
): JsIrResult {
  const context = createLoweringContext({
    typeChecker: checker,
    inlineCpp: createInlineCppCompilation(options.fcpp === true)
  });
  const orderedSourceFiles = orderSourceFiles(entry, sourceFiles, checker, options.packageGraph);
  const filesByName = new Map(orderedSourceFiles.map((file) => [file.fileName, file]));
  const exportIndex = buildModuleExportIndex(orderedSourceFiles, options.packageGraph, checker, filesByName);
  const moduleClassesByFile = new Map<string, Map<string, ClassInfo>>();
  context.classHierarchy = collectClassHierarchy(orderedSourceFiles);
  const allDiagnostics: CompilerDiagnostic[] = [];
  const modules = orderedSourceFiles.map((sourceFile, moduleIndex) => {
    const lowered = lowerStatements(context, sourceFile, exportIndex, checker, filesByName, moduleClassesByFile);
    const nextTraceId = createTraceIdSource(moduleIndex);
    const operations = finalizeOperationTraces(lowered.operations, nextTraceId);
    const finalizeDefinition = (definition: JsIrFunctionObjectDefinition) => ({
      ...definition,
      parameters: traceParameterBindings(definition.parameters, (operation) => tracedOperation(operation, undefined, nextTraceId)),
      ...(definition.body === undefined ? {} : { body: finalizeOperationTraces(definition.body, nextTraceId) })
    });
    const functionObjects = collectFunctionObjectDefinitions(operations).map(finalizeDefinition);
    allDiagnostics.push(...lowered.diagnostics);
    return {
      fileName: sourceFile.fileName,
      statementCount: sourceFile.statements.length,
      loweringMode: lowered.loweringMode,
      operations,
      functionObjects,
      imports: lowered.imports.length > 0 ? lowered.imports : undefined
    };
  });
  return {
    module: {
      entry,
      modules,
      inlineCppBlocks: context.inlineCpp.blocks
    },
    diagnostics: allDiagnostics
  };
}
