import { dispatchKind } from "../dispatch.js";
import type { JsIrCondition, JsIrExpression, JsIrNumberExpression, JsIrStringExpression, JsIrValueExpression } from "../ir/expressions.js";
import type { JsIrOperation } from "../ir/types.js";
import type {
  ResolvedCondition,
  ResolvedExpression,
  ResolvedNumberExpression,
  ResolvedOperation,
  ResolvedStringExpression,
  ResolvedValueExpression
} from "./resolved-types.js";
import type { BindingRef } from "./binding-id.js";
import type { Resolution } from "./scopes.js";
import { conditionHandlers } from "./conditions.js";
import { expressionHandlers } from "./expressions.js";
import { numberHandlers } from "./numbers.js";
import { operationHandlers } from "./operations.js";
import { stringHandlers } from "./strings.js";
import { valueHandlers } from "./values.js";
import { operationRoles } from "./operation-roles.js";
import { representationFor } from "./storage.js";

export interface Resolver {
  /** The scope chain, the identities minted from it, and the module's function-object record. */
  readonly state: Resolution;

  /** Resolves a source spelling to the binding it names, and reports one no scope declares. */
  readonly reference: (name: string) => BindingRef;

  /** Resolves one operation. */
  readonly operation: (operation: JsIrOperation) => ResolvedOperation;

  readonly predeclare: (operations: readonly JsIrOperation[]) => void;

  /** Resolves an operation list in the current lexical scope. */
  readonly operations: (operations: readonly JsIrOperation[]) => readonly ResolvedOperation[];

  /** Resolves a value expression: the general tier, whose result is an `i64` JsValue. */
  readonly value: (expression: JsIrValueExpression) => ResolvedValueExpression;

  /** Resolves a number expression. */
  readonly number: (expression: JsIrNumberExpression) => ResolvedNumberExpression;

  /** Resolves a string expression. */
  readonly string: (expression: JsIrStringExpression) => ResolvedStringExpression;

  /** Resolves a condition: an expression producing an `i1`. */
  readonly condition: (condition: JsIrCondition) => ResolvedCondition;

  /** Resolves the general expression tier, which lowering uses where no narrower tier was proved. */
  readonly expression: (expression: JsIrExpression) => ResolvedExpression;
}

function declarationKind(operation: JsIrOperation) {
  if (operation.kind === "function") {
    return "function";
  }
  return operation.kind === "letNumber" || operation.kind === "letString" || operation.kind === "letBoolean" || operation.kind === "letValue"
    ? "let" : "const";
}

function predeclareOperations(operations: readonly JsIrOperation[], state: Resolution): void {
  for (const operation of operations) {
    if (operation.kind === "bindingGroup") {
      predeclareOperations(operation.operations, state);
      continue;
    }
    const roles = operationRoles[operation.kind];
    if (!("name" in operation && (operation.kind === "function" || ("name" in roles && roles.name.role === "declaration")))) {
      continue;
    }
    const representation = representationFor(operation);
    if (representation === undefined) {
      throw new Error(`Declaration '${operation.kind}' has no representation`);
    }
    const kind = declarationKind(operation);

    state.declareSite(operation, operation.name, kind, representation);
  }
}

export function createResolver(state: Resolution): Resolver {
  const resolver: Resolver = {
    state,
    reference: (name) => state.reference(name),
    predeclare: (operations) => predeclareOperations(operations, state),
    operation: (operation) => state.inOperation(operation.trace?.id,
      () => dispatchKind(operationHandlers, operation, resolver)),
    operations: (operations) => {
      resolver.predeclare(operations);
      return operations.map((operation) => resolver.operation(operation));
    },
    value: (expression) => dispatchKind(valueHandlers, expression, resolver),
    number: (expression) => dispatchKind(numberHandlers, expression, resolver),
    string: (expression) => dispatchKind(stringHandlers, expression, resolver),
    condition: (condition) => dispatchKind(conditionHandlers, condition, resolver),
    expression: (expression) => dispatchKind(expressionHandlers, expression, resolver)
  };
  return resolver;
}
