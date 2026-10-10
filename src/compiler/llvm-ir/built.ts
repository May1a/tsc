import type { LlvmInstruction } from "./instructions.js";
import type { LlvmBlockLabel } from "./labels.js";
import type { StaticRuntimeFragment } from "./static-runtime.js";
import type { LlvmGlobalItem, LlvmTypeDefinition } from "./module-items.js";
import type { LlvmFunctionSpec } from "./signatures.js";

/** Immutable functions and blocks consumed by the renderer and verification passes. */

/** One finished basic block: its label and the instructions it recorded, in order. */
export interface BuiltLlvmBlock {
  readonly label: LlvmBlockLabel;
  readonly instructions: readonly LlvmInstruction[];
}

/** A finished function: the spec it was declared with, its entry block, and every block in order. */
export interface BuiltLlvmFunction {
  readonly spec: LlvmFunctionSpec;
  /** The block LLVM treats as the entry point: the first one built. */
  readonly entry: BuiltLlvmBlock;
  readonly blocks: readonly BuiltLlvmBlock[];
}

/** A finished module, as data. */
export interface BuiltLlvmModule {
  readonly types: readonly LlvmTypeDefinition[];
  readonly globals: readonly LlvmGlobalItem[];
  /** Declarations with no definition in this module. */
  readonly declarations: readonly LlvmFunctionSpec[];
  readonly functions: readonly BuiltLlvmFunction[];
  readonly staticRuntime: readonly StaticRuntimeFragment[];
}
