import type { JsIrSwitchClause } from "./expressions.js";
import type { JsIrOperation } from "./types.js";
import { jsIrLeafOperationKinds } from "./visit.js";
import type { JsIrLowerOptions, JsIrLoweringMode, JsIrOperationTrace, JsIrResult } from "./module.js";
import type { CompilerDiagnostic } from "../diagnostics.js";
import type { LoweringContext } from "./context.js";
import type ts from "typescript";
import { createInlineCppCompilation, inlineCppDisabledDiagnostic } from "./inline-cpp.js";
import type { JsIrBindingValue, JsIrFunctionObjectDefinition } from "./bindings.js";
import { collectFunctionObjectDefinitions, collectPromotedAggregateNames } from "./captures.js";
import { type ClassInfo, appendClassOperations } from "./class-info.js";
import { isNonExecutableDeclaration, unsupportedStatementDiagnostic } from "./comparisons.js";
import { lowerClassStatement } from "./classes.js";
import { markRuntimeObjectShadows, updateBindings } from "./binding-updates.js";
import { createLoweringContext } from "./lowering-context.js";

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
      return { ...operation, callbackBody: operation.callbackBody.map(tracedOperationChild(operation, nextTraceId)) };
    }
    case "block":
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
    case "while":
    case "doWhile":
    case "forOfArray":
    case "forOfString":
    case "forOfSet":
    case "forOfMap":
    case "forOfProtocol":
    case "forInObject":
    case "forInArray":
    case "function":
    case "returnClosure": {
      return { ...operation, body: operation.body.map(tracedOperationChild(operation, nextTraceId)) };
    }
    case "for": {
      const rebuild = tracedOperationChild(operation, nextTraceId);
      return {
        ...operation,
        initializer: operation.initializer.map(rebuild),
        body: operation.body.map(rebuild),
        increment: rebuild(operation.increment)
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
}

function lowerStatements(
  context: LoweringContext,
  sourceFile: ts.SourceFile
): LoweredStatements {
  context.nextFunctionObjectId = 0;
  context.nextJsonStatementValueId = 0;
  // Class inheritance resolves against declarations in the current source file.
  context.classes = new Map<string, ClassInfo>();
  const inlineCppDiagnostic = inlineCppDisabledDiagnostic(context.inlineCpp, sourceFile);
  if (inlineCppDiagnostic !== undefined) {
    return { operations: [], diagnostics: [inlineCppDiagnostic], loweringMode: "native" };
  }

  return lowerTopLevelStatements(context, sourceFile);
}

/**
 * Lowers a source file's top-level statements, collecting a TSCN1002 for each one nothing
 * recognizes. There is no second attempt: a statement that does not lower is reported where it
 * failed, and a class statement that does not lower is reported with the reason the class tier gave.
 */
function lowerTopLevelStatements(context: LoweringContext,
  sourceFile: ts.SourceFile): LoweredStatements {
  const operations: JsIrOperation[] = [];
  const bindings = new Map<string, JsIrBindingValue>();
  const diagnostics: CompilerDiagnostic[] = [];
  const promotedAggregates = collectPromotedAggregateNames(sourceFile.statements);
  const { classes } = context;

  for (const statement of sourceFile.statements) {
    if (isNonExecutableDeclaration(statement)) {
      continue;
    }

    const classResult = lowerClassStatement(context, statement, bindings, classes);
    if (classResult !== undefined) {
      if (classResult.kind === "unsupported") {
        diagnostics.push(unsupportedStatementDiagnostic(sourceFile, statement, classResult, bindings));
      } else {
        appendClassOperations(operations, classResult.operation, statement, bindings);
      }
      continue;
    }

    const result = context.lowerStatement(context, statement, bindings, promotedAggregates);
    if (result.kind === "lowered") {
      operations.push(result.operation);
      updateBindings(result.operation, bindings);
      continue;
    }
    diagnostics.push(unsupportedStatementDiagnostic(sourceFile, statement, result, bindings));
  }

  return { operations: markRuntimeObjectShadows(operations), diagnostics, loweringMode: "native" };
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
  const allDiagnostics: CompilerDiagnostic[] = [];
  const modules = sourceFiles.map((sourceFile, moduleIndex) => {
    const lowered = lowerStatements(context, sourceFile);
    const nextTraceId = createTraceIdSource(moduleIndex);
    const operations = finalizeOperationTraces(lowered.operations, nextTraceId);
    const finalizeDefinition = (definition: JsIrFunctionObjectDefinition) => ({
      ...definition,
      ...(definition.body === undefined ? {} : { body: finalizeOperationTraces(definition.body, nextTraceId) })
    });
    const functionObjects = collectFunctionObjectDefinitions(operations).map(finalizeDefinition);
    allDiagnostics.push(...lowered.diagnostics);
    return {
      fileName: sourceFile.fileName,
      statementCount: sourceFile.statements.length,
      loweringMode: lowered.loweringMode,
      operations,
      functionObjects
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
