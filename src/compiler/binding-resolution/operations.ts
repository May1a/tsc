import type { JsIrOperationNode } from "../ir/types.js";
import type { ResolvedOperation } from "./resolved-types.js";
import { type TierHandlers, tierHandlers } from "./dispatch.js";
import { aggregateHandlers } from "./operations-aggregates.js";
import { callbackHandlers } from "./operations-callbacks.js";
import { controlHandlers } from "./operations-control.js";
import { declarationHandlers } from "./operations-declarations.js";

/** The operations' handler table. Each handler must return exactly its own resolved variant. */
export type OperationHandlers = TierHandlers<JsIrOperationNode, ResolvedOperation>;

export const operationHandlers: TierHandlers<JsIrOperationNode, ResolvedOperation> = tierHandlers<JsIrOperationNode, ResolvedOperation>({
  ...declarationHandlers,
  ...aggregateHandlers,
  ...callbackHandlers,
  ...controlHandlers
});
