import type { JsIrBindingValue } from "../ir/bindings.js";
import type { JsIrOperationNode } from "../ir/types.js";
import { aggregateBindingForOperation } from "../ir/operation-bindings.js";
import type { BindingRepresentation } from "./binding-id.js";

/** One operation kind, or `undefined` for the kinds that are not in the table at all. */
type RepresentationForKind = (operation: JsIrOperationNode) => BindingRepresentation;

type FixedAggregateKind = Exclude<JsIrBindingValue["kind"], "array" | "object" | "runtimeIterator">;

const representationByAggregateKind: Readonly<Record<FixedAggregateKind, BindingRepresentation>> = {
  runtimeArray: { kind: "runtimeArray" },
  runtimeObject: { kind: "runtimeObject" },
  runtimeMap: { kind: "runtimeMap" },
  runtimeSet: { kind: "runtimeSet" },
  string: { kind: "string" },
  stringExpression: { kind: "string" },
  stringVariable: { kind: "string" },
  number: { kind: "number" },
  boolean: { kind: "boolean" },
  booleanExpression: { kind: "boolean" },
  booleanVariable: { kind: "boolean" },
  value: { kind: "value" },
  valueVariable: { kind: "value" },
  closure: { kind: "closure" },
  closureFactory: { kind: "closure" },
  function: { kind: "function" },
  functionReference: { kind: "function" }
};

function representationFromAggregate(aggregate: JsIrBindingValue): BindingRepresentation {
  switch (aggregate.kind) {
    case "array": {
      return { kind: "fixedArray", length: aggregate.length };
    }
    case "object": {
      return { kind: "fixedObject", fieldCount: aggregate.value.fields.length };
    }
    case "runtimeIterator": {
      return {
        kind: "runtimeIterator",
        sourceKind: aggregate.sourceKind,
        iterationKind: aggregate.iterationKind
      };
    }
    default: {
      return representationByAggregateKind[aggregate.kind];
    }
  }
}

const fixedRepresentationByKind: Readonly<Partial<Record<JsIrOperationNode["kind"], BindingRepresentation>>> = {
  // The scalars, the function, and the loop and catch bindings.
  constNumber: { kind: "number" },
  letNumber: { kind: "number" },
  constString: { kind: "string" },
  constStringExpression: { kind: "string" },
  letString: { kind: "string" },
  constBoolean: { kind: "boolean" },
  constBooleanExpression: { kind: "boolean" },
  letBoolean: { kind: "boolean" },
  constValue: { kind: "value" },
  letValue: { kind: "value" },
  constClosure: { kind: "closure" },
  function: { kind: "function" },
  forOfArray: { kind: "value" },
  forOfSet: { kind: "value" },
  forOfMap: { kind: "value" },
  forOfProtocol: { kind: "value" },
  forOfString: { kind: "string" },
  forInObject: { kind: "string" },
  forInArray: { kind: "string" },
  tryCatch: { kind: "value" }
};

const measuredRepresentationByKind: Readonly<Partial<Record<JsIrOperationNode["kind"], RepresentationForKind>>> = {
  runtimeIteratorNew: (operation) => {
    if (operation.kind !== "runtimeIteratorNew") {
      throw new Error("Internal compiler error: runtimeIteratorNew measured a different operation kind");
    }
    return { kind: "runtimeIterator", sourceKind: operation.sourceKind, iterationKind: operation.iterationKind };
  }
};

export function representationFor(operation: JsIrOperationNode): BindingRepresentation | undefined {
  const aggregate = aggregateBindingForOperation(operation);
  if (aggregate !== undefined) {
    return representationFromAggregate(aggregate);
  }
  return measuredRepresentationByKind[operation.kind]?.(operation) ?? fixedRepresentationByKind[operation.kind];
}
