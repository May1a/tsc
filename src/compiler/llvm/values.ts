import { jsValueAbi } from "../js-value-abi/index.js";

/**
 * The legacy-LLVM view of the js-value ABI: the immediates the emitter compares and stores, and the
 * accessors that read the tags off a live value.
 *
 * These are constants rather than helpers, and they are the reason this module exists. Every use is
 * an `i64` literal or a tag test, so a reader can see the whole encoding surface at once instead of
 * meeting `jsValueAbi.forLegacyLlvm()` once per predicate. It is also the only thing the completion
 * emitters need from the value domain — an absent completion value is `undefined`, and expressing
 * that here rather than inlining a second `immediate("undefined")` keeps one definition of it.
 */
export const legacyJsValue = jsValueAbi.forLegacyLlvm();
export const jsValueUndefined = legacyJsValue.immediate("undefined");
export const jsValueFalse = legacyJsValue.immediate("false");
export const jsValueTrue = legacyJsValue.immediate("true");
export const jsValueNull = legacyJsValue.immediate("null");
