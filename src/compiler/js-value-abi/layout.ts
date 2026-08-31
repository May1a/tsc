/* eslint-disable unicorn/numeric-separators-style -- ABI hex values use 16-bit groups matching the accepted external layout. */
export const jsValueLayout = Object.freeze({
  wordBits: 64,
  payloadBits: 48,
  payloadMask: 0x0000_FFFF_FFFF_FFFFn,
  tagMask: 0xFFFF_0000_0000_0000n,
  exponentMask: 0x7FF0_0000_0000_0000n,
  fractionMask: 0x000F_FFFF_FFFF_FFFFn,
  reservedTagMaximum: 0x7FFF_0000_0000_0000n,
  references: Object.freeze({
    object: 0x7FF8_0000_0000_0000n,
    array: 0x7FF9_0000_0000_0000n,
    string: 0x7FFA_0000_0000_0000n,
    function: 0x7FFB_0000_0000_0000n
  }),
  immediates: Object.freeze({
    undefined: 0x7FFC_0000_0000_0000n,
    false: 0x7FFC_0000_0000_0001n,
    true: 0x7FFC_0000_0000_0002n,
    null: 0x7FFC_0000_0000_0003n
  }),
  internalSentinels: Object.freeze({
    arrayHole: 0x7FFC_0000_0000_0007n
  })
});

function assertAcceptedLayout(): void {
  const referenceTags = Object.values(jsValueLayout.references);
  const sentinels = [
    ...Object.values(jsValueLayout.immediates),
    ...Object.values(jsValueLayout.internalSentinels)
  ];
  const reservedValues = [...referenceTags, ...sentinels];
  if (new Set(reservedValues).size !== reservedValues.length) {
    throw new Error("Internal compiler error: JSValue ABI tags and sentinels must be unique");
  }
  if (jsValueLayout.payloadMask !== (1n << BigInt(jsValueLayout.payloadBits)) - 1n) {
    throw new Error("Internal compiler error: JSValue ABI payload mask does not match its payload width");
  }
  for (const tag of referenceTags) {
    if ((tag & jsValueLayout.payloadMask) !== 0n) {
      throw new Error("Internal compiler error: JSValue ABI reference tag overlaps its payload");
    }
  }
  const maximumWord = (1n << BigInt(jsValueLayout.wordBits)) - 1n;
  for (const value of reservedValues) {
    if (value < 0n || value > maximumWord) {
      throw new Error("Internal compiler error: JSValue ABI value does not fit its word width");
    }
  }
}

assertAcceptedLayout();

export type JsValueReferenceKind = keyof typeof jsValueLayout.references;
export type JsValueImmediateKind = keyof typeof jsValueLayout.immediates;
