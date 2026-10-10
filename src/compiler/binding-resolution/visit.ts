import type { ResolvedOperation } from "./resolved-types.js";
import type { jsIrLeafOperationKinds } from "../ir/visit.js";

type ResolvedLeafOperationKind = keyof typeof jsIrLeafOperationKinds;

export function resolvedOperationChildren(operation: ResolvedOperation): readonly ResolvedOperation[] {
  switch (operation.kind) {
    case "block": case "bindingGroup": { return operation.operations;}
    case "function": case "returnClosure": case "while": case "doWhile": case "forOfArray": case "forOfString":
    case "forOfMap": case "forOfSet": case "forOfProtocol": case "forInObject": case "forInArray": { return operation.body;}
    case "runtimeArrayMapFunctionObject": { return operation.callbackBody;
    }
    case "arrayDestructureProtocol": { return destructureChildren(operation);
    }
    case "tryCatch": { return tryChildren(operation);
    }
    case "if": { return [...operation.thenOperations, ...operation.elseOperations];
    }
    case "switch": { return operation.clauses.flatMap((clause) => clause.operations);
    }
    case "for": { return [...operation.initializer, operation.increment, ...operation.body];
    }
    default: {
      return leafChildren(operation);
    }
  }
}

function leafChildren(_leaf: Extract<ResolvedOperation, { readonly kind: ResolvedLeafOperationKind }>): readonly ResolvedOperation[] { return []; }

function destructureChildren(operation: Extract<ResolvedOperation, { readonly kind: "arrayDestructureProtocol" }>): readonly ResolvedOperation[] {
  return operation.elements.flatMap((element) => element.kind === "nested" ? element.operations : []);
}

function tryChildren(operation: Extract<ResolvedOperation, { readonly kind: "tryCatch" }>): readonly ResolvedOperation[] {
  return [...operation.tryOperations, ...operation.catchOperations, ...(operation.finallyOperations ?? [])];
}

export function visitResolvedOperations(operations: readonly ResolvedOperation[], visit: (operation: ResolvedOperation) => void): void {
  for (const operation of operations) {
    visit(operation);
    visitResolvedOperations(resolvedOperationChildren(operation), visit);
  }
}
