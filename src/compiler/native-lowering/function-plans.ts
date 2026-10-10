import { type BindingRef, type FunctionId, type ResolvedFunctionObject, type ResolvedFunctionParameter, type ResolvedModule, type ResolvedOperation, type ResolvedValueExpression, visitResolvedOperations } from "../binding-resolution/index.js";

export type CaptureSource = { readonly kind: "binding"; readonly reference: BindingRef }
  | { readonly kind: "value"; readonly value: ResolvedValueExpression };

export interface FunctionPlan {
  readonly symbol: string;
  readonly traceId?: string;
  readonly functionId: FunctionId;
  readonly parameters: readonly ResolvedFunctionParameter[];
  readonly captures: readonly BindingRef[];
  readonly sources: readonly CaptureSource[];
  readonly globalCaptureAliases?: readonly { readonly target: BindingRef; readonly source: BindingRef }[];
  readonly body: readonly ResolvedOperation[];
  readonly binding?: BindingRef;
  readonly thisBinding?: BindingRef;
  readonly name: string;
  readonly arrow: boolean;
}

export function collectFunctionPlans(resolved: ResolvedModule): readonly FunctionPlan[] {
  const plans = new Map<FunctionId, FunctionPlan>();
  const spelling = (binding: BindingRef) => {
    const declaration = resolved.bindings.declarations.at(binding.binding.ordinal);
    if (declaration?.id !== binding.binding) { throw new Error("Function binding belongs to another resolution"); }
    return declaration.spelling;
  };
  const collect = (operations: readonly ResolvedOperation[]) => visitResolvedOperations(operations, (operation) => {
    switch (operation.kind) {
      case "function": {
        const captures = operation.enclosingCaptureNames ?? [];
        const symbol = `tscn.function.${operation.functionId.ordinal}`;
        plans.set(operation.functionId, { symbol, functionId: operation.functionId, parameters: operation.parameters, body: operation.body,
          traceId: operation.trace?.id, binding: operation.name, captures, sources: captures.map(bindingSource), name: spelling(operation.name), arrow: false });
        break;
      }
      case "returnClosure": {
        plans.set(operation.functionId, { symbol: `tscn.function.${operation.functionId.ordinal}`, traceId: operation.trace?.id, functionId: operation.functionId,
          parameters: operation.parameters.map((name) => ({ name, valueKind: "value" })), body: operation.body,
          captures: operation.captures, sources: operation.captures.map(bindingSource), name: "", arrow: true });
        break;
      }
      case "runtimeArrayMapFunctionObject": {
        const captures = operation.captures ?? [];
        plans.set(operation.functionId, { symbol: `tscn.function.${operation.functionId.ordinal}`, traceId: operation.trace?.id, functionId: operation.functionId,
          parameters: operation.callbackParameters, body: operation.callbackBody, captures: captures.map((capture) => capture.name),
          sources: captures.map((capture): CaptureSource => capture.sourceBinding === undefined
            ? { kind: "value", value: capture.value } : bindingSource(capture.sourceBinding)), name: "", arrow: operation.callbackKind === "arrow",
          thisBinding: operation.thisBinding });
        break;
      }
      default: { break; }
    }
  });
  for (const source of resolved.modules) {
    collect(source.operations);
    for (const definition of source.functionObjects) {
      if (definition.directTarget !== undefined) { continue; }
      const plan = objectPlan(definition);
      plans.set(plan.functionId, plan);
      collect(plan.body);
    }
  }
  return Object.freeze([...plans.values()].map((plan) => normalizeCaptures(plan, resolved)));
}

function objectPlan(definition: Extract<ResolvedFunctionObject, { readonly functionId: FunctionId }>): FunctionPlan {
  const captures = definition.captures ?? [];
  return { symbol: `tscn.function.${definition.functionId.ordinal}`, functionId: definition.functionId, parameters: definition.parameters,
    body: definition.body, captures: captures.map((capture) => capture.name), sources: captures.map((capture) => bindingSource(capture.sourceBinding ?? capture.name)),
    thisBinding: definition.thisBinding, name: definition.inferredName ?? "", arrow: definition.functionKind === "arrow" };
}

function bindingSource(reference: BindingRef): CaptureSource { return { kind: "binding", reference }; }

function normalizeCaptures(plan: FunctionPlan, resolved: ResolvedModule): FunctionPlan {
    const retained: { readonly target: BindingRef; readonly source: CaptureSource }[] = [];
    const aliases: { readonly target: BindingRef; readonly source: BindingRef }[] = [];
    for (const [index, source] of plan.sources.entries()) {
      const target = plan.captures.at(index);
      if (target === undefined) { throw new Error("Capture source has no target binding"); }
      const declaration = source.kind === "binding" ? resolved.bindings.declarations.at(source.reference.binding.ordinal) : undefined;
      if (source.kind === "binding" && declaration?.owner.kind === "module") {
        if (target.binding !== source.reference.binding) { aliases.push({ target, source: source.reference }); }
      } else { retained.push({ target, source }); }
    }
    return { ...plan, captures: retained.map((capture) => capture.target), sources: retained.map((capture) => capture.source), globalCaptureAliases: aliases };
}
