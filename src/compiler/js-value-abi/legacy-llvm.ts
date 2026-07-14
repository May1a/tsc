import { jsValueLayout, type JsValueImmediateKind, type JsValueReferenceKind } from "./layout.js";

export type LegacyLlvmJsValues = {
  readonly immediate: (kind: JsValueImmediateKind) => string;
  readonly arrayHole: () => string;
  readonly referenceTag: (kind: JsValueReferenceKind) => string;
  readonly payloadMask: () => string;
  readonly tagMask: () => string;
};

export const legacyLlvmJsValues: LegacyLlvmJsValues = Object.freeze({
  immediate: (kind) => jsValueLayout.immediates[kind].toString(),
  arrayHole: () => jsValueLayout.internalSentinels.arrayHole.toString(),
  referenceTag: (kind) => jsValueLayout.references[kind].toString(),
  payloadMask: () => jsValueLayout.payloadMask.toString(),
  tagMask: () => BigInt.asIntN(jsValueLayout.wordBits, jsValueLayout.tagMask).toString()
});
