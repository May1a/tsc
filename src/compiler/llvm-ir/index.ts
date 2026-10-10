/** Typed LLVM construction and its public API. Function completion verifies CFG and SSA;
 * module completion seals the graph before rendering or analysis. */
export { type BlockContext, type LlvmBlockBuilder, BlockBuilder } from "./block-builder.js";
export { type LlvmCastOpcode, isBitcastCompatible, isCastAllowed } from "./casts.js";
export {
  type LlvmConstant,
  type LlvmGlobalSpec,
  type LlvmLinkage,
  assertLlvmConstantFitsType,
  encodeLlvmByteString,
  llvmConstantType,
  renderLlvmConstant
} from "./constants.js";
export { type LlvmControlFlowBlock, type LlvmDominatorTree, buildLlvmDominatorTree } from "./dominance.js";
export type { BuiltLlvmBlock, BuiltLlvmFunction, BuiltLlvmModule } from "./built.js";
export { type LlvmFunctionBuilder, FunctionBuilder } from "./function-builder.js";
export type {
  LlvmCastInstruction,
  LlvmExtractValueInstruction,
  LlvmFloatingPointBinaryInstruction,
  LlvmFloatingPointComparisonInstruction,
  LlvmFloatingPointUnaryInstruction,
  LlvmGetElementPtrInstruction,
  LlvmInsertValueInstruction,
  LlvmInstruction,
  LlvmInstructionKind,
  LlvmIntegerBinaryInstruction,
  LlvmIntegerComparisonInstruction,
  LlvmPhiInstruction,
  LlvmProvenance,
  LlvmTerminator
} from "./instructions.js";
export { isLlvmTerminator, llvmInstructionOperands, llvmInstructionResult } from "./instructions.js";
export {
  type LlvmBlockLabel,
  type LlvmGepIndex,
  type LlvmPhiIncoming,
  type LlvmSwitchCase,
  assertBlockLabel,
  createLlvmBlockLabel,
  renderLlvmBlockLabel
} from "./labels.js";
export type { LlvmModuleOptions, StaticRuntimeFragment } from "./static-runtime.js";
export {
  type LlvmModuleBuilder,
  createLlvmModule,
  ModuleBuilder
} from "./module-builder.js";
export type { LlvmGlobalItem, LlvmGlobalReference, LlvmTypeDefinition } from "./module-items.js";
export { type RenderLine, renderLlvmInstruction } from "./render.js";
export { type MutableLineRange, type RenderedLlvmModule, renderLlvmFunctionBody, traceRangesOf } from "./render-module.js";
export {
  type LlvmArgumentTuple,
  type LlvmCallArguments,
  type LlvmCallCallee,
  type LlvmCallSignature,
  type LlvmFunctionParameter,
  type LlvmFunctionSpec,
  type LlvmIndirectCallArguments,
  type LlvmOwnedCallable,
  renderLlvmCallReturnType
} from "./signatures.js";
export {
  type LlvmArrayType,
  type LlvmBooleanType,
  type LlvmDoubleType,
  type LlvmIntegerType,
  type LlvmPointerType,
  type LlvmStructElementAt,
  type LlvmStructIndex,
  type LlvmStructType,
  type LlvmType,
  type LlvmValue,
  type LlvmValueType,
  type LlvmVoidType,
  llvm,
  llvmIntegerFits,
  renderLlvmDouble,
  renderLlvmType,
  sameLlvmType
} from "./types.js";
export { type LlvmValueData, type LlvmValueDefinition, isLlvmValue, llvmValueText } from "./values.js";
