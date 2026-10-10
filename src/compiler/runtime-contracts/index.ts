// Generated from Static Runtime IR. Run npm run runtime:contracts to regenerate.
import { arraysContracts } from "./arrays.js";
import { callbacksContracts } from "./callbacks.js";
import { collectionsContracts } from "./collections.js";
import { declaresContracts } from "./declares.js";
import { errorsContracts } from "./errors.js";
import { functionsContracts } from "./functions.js";
import { gcContracts } from "./gc.js";
import { iteratorsContracts } from "./iterators.js";
import { jsonContracts } from "./json.js";
import { numbersContracts } from "./numbers.js";
import { objectsContracts } from "./objects.js";
import { regexContracts } from "./regex.js";
import { stringsContracts } from "./strings.js";
import { valuesContracts } from "./values.js";
import { entryRuntimeContracts, structuredRuntimeContracts } from "./structured.js";

export const runtimeContracts = {
  ...arraysContracts,
  ...callbacksContracts,
  ...collectionsContracts,
  ...declaresContracts,
  ...errorsContracts,
  ...functionsContracts,
  ...gcContracts,
  ...iteratorsContracts,
  ...jsonContracts,
  ...numbersContracts,
  ...objectsContracts,
  ...regexContracts,
  ...stringsContracts,
  ...valuesContracts,
  ...structuredRuntimeContracts,
  ...entryRuntimeContracts,
} as const;

export type RuntimeSymbol = keyof typeof runtimeContracts;
