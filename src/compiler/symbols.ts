/**
 * Compiler-owned private-use property key for well-known `Symbol.iterator`.
 * Starts with U+F8FF (BMP private-use) so ordinary user-authored keys are
 * vanishingly unlikely to collide; general Symbol values remain out of scope.
 *
 * This lives in its own leaf module because `ir.ts` needs it, and importing it
 * from runtime-helpers.ts would make the 11k-line runtime library a dependency
 * of the lowering pass.
 */
export const SYMBOL_ITERATOR_SENTINEL = "Symbol.iterator";
