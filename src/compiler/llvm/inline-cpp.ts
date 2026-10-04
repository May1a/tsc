import type { JsIrInlineCppBlock } from "../ir/module.js";
import { jsValueAbi } from "../js-value-abi/index.js";

/**
 * The inline C++ runtime: declarations for the `.ll` module, and the source of the separately
 * compiled translation unit.
 *
 * Two outputs from one list of blocks, and they are not the same output. `emitInlineCppDeclarations`
 * goes into `main.ll` as `declare i64 @symbol()` — the module has to *know* the symbol without seeing
 * its body. `emitInlineCppSource` writes the real definition into a `.cpp` that clang compiles and
 * links beside it. A symbol declared but never defined is a link error, so the two must agree, and
 * that is the whole reason both live here rather than at their two call sites.
 *
 * The prologue is fixed rather than derived: `<bit>`, `<cstdint>`, `<cstdio>`, `<limits>`, plus the
 * value ABI's own support header. Those four are what `runtime-ir.ts` emits against, so a block that
 * uses `std::` anything needs this exact list.
 */
export function emitInlineCppDeclarations(blocks: readonly JsIrInlineCppBlock[]): string[] {
  return blocks.map((block) => `declare i64 @${block.symbol}()`);
}

export function emitInlineCppFunction(block: JsIrInlineCppBlock): string {
  return `extern "C" std::uint64_t ${block.symbol}() {
${block.code}
}
`;
}

export const emitInlineCppSource = (blocks: readonly JsIrInlineCppBlock[]): string =>
  `#include <bit>
#include <cstdint>
#include <cstdio>
#include <limits>

${jsValueAbi.emitInlineCppSupport()}

${blocks.map(emitInlineCppFunction).join("\n")}`;
