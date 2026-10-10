import type { CompilerDiagnostic, SourceSpan } from "../diagnostics.js";
import type { JsIrModule } from "../ir/module.js";
import { BindingRegistry } from "./binding-id.js";
import { createResolver } from "./resolver.js";
import { Resolution, UnresolvedBindingError } from "./scopes.js";
import type { ResolvedModule, ResolvedSourceModule } from "./resolved-types.js";
import { resolvedTraceSpans } from "./trace-spans.js";

export function resolveBindings(module: JsIrModule): ResolvedBindingsResult {
  const registry = new BindingRegistry();
  const resolution = new Resolution(registry);
  const resolver = createResolver(resolution);
  const spans = resolvedTraceSpans(module);
  const diagnostics: CompilerDiagnostic[] = [];
  const modules: ResolvedSourceModule[] = [];

  for (const sourceModule of module.modules) {
    resolution.openModule(sourceModule.fileName, sourceModule.functionObjects);
    resolver.predeclare(sourceModule.operations);
    resolution.publishFunctions(sourceModule.operations);
  }

  for (const sourceModule of module.modules) {
    resolution.openModule(sourceModule.fileName, sourceModule.functionObjects);
    try {
      modules.push({
        fileName: sourceModule.fileName,
        statementCount: sourceModule.statementCount,
        loweringMode: sourceModule.loweringMode,
        operations: resolver.operations(sourceModule.operations),
        functionObjects: resolution.functionObjects()
      });
    } catch (error) {
      const diagnostic = unresolvedDiagnostic(error, sourceModule.fileName, spans);
      if (diagnostic === undefined) {
        throw error;
      }
      diagnostics.push(diagnostic);
    }
  }

  return {
    module: {
      entry: module.entry,
      modules,
      inlineCppBlocks: module.inlineCppBlocks,
      bindings: registry.table()
    },
    diagnostics
  };
}

/** What one resolution produced: the resolved module, and whatever went wrong resolving it. */
export interface ResolvedBindingsResult {
  readonly module: ResolvedModule;
  readonly diagnostics: readonly CompilerDiagnostic[];
}

/** The diagnostic code for a name that no scope declared. */
const unresolvedBindingCode = "TSCN2006";

function unresolvedDiagnostic(
  error: unknown,
  fileName: string,
  spans: ReadonlyMap<string, SourceSpan>
): CompilerDiagnostic | undefined {
  if (!(error instanceof UnresolvedBindingError)) {
    return undefined;
  }
  const span = error.operationTraceId === undefined ? undefined : spans.get(error.operationTraceId);
  return {
    code: unresolvedBindingCode,
    category: "error",
    message: `${fileName}: ${error.message}`,
    span
  };
}

/** The declaration an identity names, or `undefined` when no declaration has that ordinal. */
export { BindingRegistry } from "./binding-id.js";
export type {
  BindingDeclaration,
  BindingId,
  BindingKind,
  BindingLocation,
  BindingRef,
  BindingRepresentation,
  BindingStorage,
  BindingTable,
  FunctionId,
  LexicalOwner
} from "./binding-id.js";
export { UnresolvedBindingError } from "./scopes.js";
export type { Resolver } from "./resolver.js";
export type {
  ResolvedArrayIsArrayOperand,
  ResolvedArrayMutation,
  ResolvedCallArgument,
  ResolvedClosureValue,
  ResolvedCondition,
  ResolvedConcatElement,
  ResolvedDataDescriptor,
  ResolvedDestructureElement,
  ResolvedDestructureSource,
  ResolvedExpression,
  ResolvedFunctionObject,
  ResolvedFunctionObjectCapture,
  ResolvedFunctionParameter,
  ResolvedModule,
  ResolvedLeafOperationKind,
  ResolvedNumberExpression,
  ResolvedObjectAssignSource,
  ResolvedObjectField,
  ResolvedObjectFieldValue,
  ResolvedObjectValue,
  ResolvedOperation,
  ResolvedRuntimeArrayElement,
  ResolvedRuntimeObjectField,
  ResolvedRuntimeObjectValue,
  ResolvedSourceModule,
  ResolvedStringExpression,
  ResolvedSwitchClause,
  ResolvedValueExpression
} from "./resolved-types.js";

export { resolvedOperationChildren, visitResolvedOperations } from "./visit.js";
