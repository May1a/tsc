import type { EmitContext } from "./context.js";

/**
 * How a JS string becomes an LLVM global.
 *
 * `encodeCString` escapes to the byte sequence inside a `c"..."` literal and reports the length with
 * the terminator, `addStringConstant` interns one and returns its `@.str.N` name. The five byte
 * constants are its decision table: a quote and a backslash are escaped by code because a bare one
 * would end the literal, printable ASCII passes through, and everything else becomes `\XX`.
 *
 * Interning is the reason this is a module rather than a helper. A string is emitted once and named
 * thereafter, and `context.stringConstants` accumulates the globals, so the index in `@.str.N` has
 * to come from that counter rather than from the name being interned. Every domain that formats a
 * string reaches this, which is why it sits below all of them.
 */

const doubleQuoteByte = 34;
const backslashByte = 92;
const firstPrintableAsciiByte = 32;
const lastPrintableAsciiByte = 126;
const hexadecimalRadix = 16;
export const encodeCString = (value: string): { readonly value: string; readonly length: number } => {
  const bytes = [...Buffer.from(value, "utf8"), 0];
  const encoded = bytes
    .map((byte) => {
      if (byte === doubleQuoteByte) {
        return String.raw`\22`;
      }

      if (byte === backslashByte) {
        return String.raw`\5C`;
      }

      if (byte >= firstPrintableAsciiByte && byte <= lastPrintableAsciiByte) {
        return String.fromCharCode(byte);
      }

      return `\\${byte.toString(hexadecimalRadix).toUpperCase().padStart(2, "0")}`;
    })
    .join("");

  return {
    value: encoded,
    length: bytes.length
  };
};
export function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}
export function addStringConstant(value: string, context: EmitContext): string {
  const index = context.printIndex;
  context.printIndex += 1;
  const encoded = encodeCString(value);
  context.stringConstants.push(`@.str.${index} = private unnamed_addr constant [${encoded.length} x i8] c"${encoded.value}"`);
  return `@.str.${index}`;
}
