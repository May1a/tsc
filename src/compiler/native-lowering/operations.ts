import type { ResolvedOperation } from "../binding-resolution/index.js";
import { type VariantHandlers, type VariantOfKind, dispatchKind } from "../dispatch.js";
import { aggregateOperationHandlers } from "./aggregate-operations.js";
import { callbackOperationHandlers } from "./callback-operations.js";
import type { OperationContext } from "./operation-context.js";
import { protocolOperationHandlers } from "./protocol-operations.js";
import { scalarOperationHandlers } from "./scalar-operations.js";

type OperationVariants = { readonly [K in ResolvedOperation["kind"]]: VariantOfKind<ResolvedOperation, K> };

const handlers: VariantHandlers<OperationVariants, OperationContext, void> = {
  ...aggregateOperationHandlers,
  ...callbackOperationHandlers,
  ...protocolOperationHandlers,
  ...scalarOperationHandlers
};

export function lowerOperation(operation: ResolvedOperation, context: OperationContext): void {
  dispatchKind(handlers, operation, context);
}
