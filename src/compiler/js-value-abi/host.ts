import type { CompilerDiagnostic } from "../diagnostics.js";
import type { TargetFacts } from "../toolchain.js";
import { jsValueLayout } from "./layout.js";

function displayFact(value: number | string | undefined): string {
  if (value === undefined) {
    return "unknown";
  }
  return String(value);
}

export function validateJsValueHost(target: TargetFacts): CompilerDiagnostic | undefined {
  const compatible = target.pointerWidthBits === jsValueLayout.wordBits &&
    target.doubleFormat === "ieee754-binary64" &&
    target.pointerAddressBits !== undefined &&
    target.pointerAddressBits <= jsValueLayout.payloadBits;
  if (compatible) {
    return undefined;
  }
  return {
    code: "TSCN2005",
    category: "error",
    message: `Host target is incompatible with the JSValue ABI: requires 64-bit pointers, IEEE-754 binary64 doubles, and pointers representable in 48 bits; detected ${target.triple} with ${displayFact(target.pointerWidthBits)}-bit pointers, ${target.doubleFormat} doubles, and ${displayFact(target.pointerAddressBits)}-bit pointer addresses`
  };
}
