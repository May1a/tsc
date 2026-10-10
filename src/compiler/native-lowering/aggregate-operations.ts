import { arrayOperationHandlers } from "./array-operations.js";
import { collectionOperationHandlers } from "./collection-operations.js";
import { objectOperationHandlers } from "./object-operations.js";

export const aggregateOperationHandlers = {
  ...arrayOperationHandlers,
  ...objectOperationHandlers,
  ...collectionOperationHandlers
};
