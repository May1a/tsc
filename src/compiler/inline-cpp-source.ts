import type { JsIrInlineCppBlock } from "./ir/module.js";
import { jsValueAbi } from "./js-value-abi/index.js";

export function emitInlineCppSource(blocks: readonly JsIrInlineCppBlock[]): string {
  const functions = blocks.map((block) => `extern "C" std::uint64_t ${block.symbol}() {\n${block.code}\n}\n`);
  return `#include <bit>
#include <cstdint>
#include <cstdio>
#include <limits>

${jsValueAbi.emitInlineCppSupport()}

${functions.join("\n")}`;
}
