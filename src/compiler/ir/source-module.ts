import type { JsIrOperation } from "./types.js";
import { visitJsIrOperations } from "./visit.js";
import type { JsIrInlineCppBlock, JsIrLowerOptions, JsIrLoweringMode, JsIrOperationTrace, JsIrResult } from "./module.js";
import type { CompilerDiagnostic } from "../diagnostics.js";
import type { LoweringContext } from "./context.js";
import type ts from "typescript";
import { inlineCppDisabledDiagnostic, inlineCppState } from "./inline-cpp.js";
import type { JsIrBindingValue } from "./bindings.js";
import { collectFunctionObjectDefinitions, collectPromotedAggregateNames } from "./captures.js";
import { type ClassInfo, appendClassOperations, classLoweringState } from "./class-info.js";
import { isNonExecutableDeclaration, unsupportedStatementDiagnostic } from "./comparisons.js";
import { lowerClassStatement } from "./classes.js";
import { markRuntimeObjectShadows, updateBindings } from "./binding-updates.js";
import { createLoweringContext } from "./lowering-context.js";

const traceOperationIdWidth = 6;

function finalizeOperationTraces(operations: readonly JsIrOperation[], moduleIndex: number): readonly JsIrOperation[] {
  let operationIndex = 0;
  visitJsIrOperations(operations, (operation, parent) => {
    const inheritedSource = operation.trace?.source ?? parent?.trace?.source;
    const id = `m${moduleIndex}:o${operationIndex.toString().padStart(traceOperationIdWidth, "0")}`;
    let trace: JsIrOperationTrace = { id, origin: operation.trace?.origin ?? "synthesized" };
    if (inheritedSource !== undefined) {
      trace = { ...trace, source: inheritedSource };
    }
    (operation as { trace?: JsIrOperationTrace }).trace = trace;
    operationIndex += 1;
  });
  return operations;
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
  const inlineCppDiagnostic = inlineCppDisabledDiagnostic(sourceFile);
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
  const classes = new Map<string, ClassInfo>();
  const { registry: previousClassRegistry } = classLoweringState;
  classLoweringState.registry = classes;

  try {
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
  } finally {
    classLoweringState.registry = previousClassRegistry;
  }

  return { operations: markRuntimeObjectShadows(operations), diagnostics, loweringMode: "native" };
}

/**
 * Lower parsed TypeScript sources and return their diagnostics.
 *
 * Each call creates a LoweringContext. The class registry and inline C++ settings still have
 * module scope, so this pure, synchronous entry is not fiber-safe.
 */
export function lowerToJsIr(
  entry: string,
  sourceFiles: readonly ts.SourceFile[],
  checker?: ts.TypeChecker,
  options: JsIrLowerOptions = {}
): JsIrResult {
  const context = createLoweringContext();
  const allDiagnostics: CompilerDiagnostic[] = [];
  const inlineCppBlocks: JsIrInlineCppBlock[] = [];
  classLoweringState.typeChecker = checker;
  inlineCppState.enabled = options.fcpp === true;
  inlineCppState.blocks = inlineCppBlocks;
  let modules;
  try {
    modules = sourceFiles.map((sourceFile, moduleIndex) => {
      const lowered = lowerStatements(context, sourceFile);
      allDiagnostics.push(...lowered.diagnostics);
      return {
        fileName: sourceFile.fileName,
        statementCount: sourceFile.statements.length,
        loweringMode: lowered.loweringMode,
        operations: finalizeOperationTraces(lowered.operations, moduleIndex),
        functionObjects: collectFunctionObjectDefinitions(lowered.operations)
      };
    });
  } finally {
    classLoweringState.typeChecker = undefined;
    inlineCppState.enabled = false;
    inlineCppState.blocks = undefined;
  }
  return {
    module: {
      entry,
      modules,
      inlineCppBlocks
    },
    diagnostics: allDiagnostics
  };
}
