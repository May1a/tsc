import { BlockBuilder, type BlockContext, type LlvmBlockBuilder, type RecordedBlock } from "./block-builder.js";
import type { BuiltLlvmFunction } from "./built.js";
import { type LlvmControlFlowBlock, type LlvmDominatorTree, buildLlvmDominatorTree } from "./dominance.js";
import { type LlvmBlockLabel, createLlvmBlockLabel } from "./labels.js";
import type { LlvmGlobalReference } from "./module-items.js";
import { type LlvmInstruction, type LlvmPhiInstruction, llvmInstructionOperands, llvmInstructionTargets } from "./instructions.js";
import type { LlvmFunctionSpec, LlvmOwnedCallable } from "./signatures.js";
import { TraceStack } from "./traces.js";
import { type LlvmValue, type LlvmValueType, sameLlvmType } from "./types.js";
import { createLlvmValue, llvmValueData, llvmValueText } from "./values.js";

/** Labels may name future blocks. SSA result names belong to one definition. Both are checked at finish. */
export interface LlvmFunctionBuilder {
  parameter<T extends LlvmValueType>(index: number, expectedType: T): LlvmValue<T>;
  label(name: string): LlvmBlockLabel;
  /** `build(openBlock(name))`. */
  block(name: string, build: (block: LlvmBlockBuilder) => void): void;
  /** Keeps the block appendable until function completion; blocks may be filled in any order. */
  openBlock(name: string): LlvmBlockBuilder;
  /** Records operation provenance across all blocks visited during the callback. */
  withTrace<A>(traceId: string, build: () => A): A;
  /** Seals every block, runs the whole-graph checks, and returns the finished IR. */
  finish(): BuiltLlvmFunction;
}

/** A block this function owns, kept until `finish` seals it. */
interface OpenBlock {
  readonly name: string;
  readonly builder: BlockBuilder;
}

/** Owns function-scoped values and blocks. Finish and abort seal every retained block handle. */
export class FunctionBuilder implements LlvmFunctionBuilder {
  readonly #spec: LlvmFunctionSpec;
  readonly #owner: symbol;
  readonly #callee: (spec: LlvmFunctionSpec) => LlvmOwnedCallable;
  readonly #functionName: (spec: LlvmFunctionSpec) => string;
  readonly #globalName: (reference: LlvmGlobalReference) => string;
  readonly #openBlocks: OpenBlock[] = [];
  readonly #labels = new Map<string, LlvmBlockLabel>();
  readonly #blockNames = new Set<string>();
  readonly #blockNamesByOwner = new Map<symbol, string>();
  readonly #ssaNames = new Set<string>();
  readonly #parameters: readonly LlvmValue[];
  /** Operation-level trace regions, open across every block they span; see `withTrace`. */
  readonly #traces = new TraceStack();
  #active = true;

  public constructor(
    spec: LlvmFunctionSpec,
    resolvers: {
      readonly callee: (spec: LlvmFunctionSpec) => LlvmOwnedCallable;
      readonly functionName: (spec: LlvmFunctionSpec) => string;
      readonly globalName: (reference: LlvmGlobalReference) => string;
    }
  ) {
    this.#spec = spec;
    // One symbol per `defineFunction`, not per module: values are function-scoped in LLVM, and a
    // module-scoped owner would let `%input` of one function satisfy an operand of another.
    this.#owner = Symbol(`llvm-function:${spec.name}`);
    this.#callee = resolvers.callee;
    this.#functionName = resolvers.functionName;
    this.#globalName = resolvers.globalName;
    this.#parameters = spec.parameters.map((parameter) => {
      this.#ssaNames.add(parameter.name);
      return createLlvmValue(parameter.type, this.#owner, `%${parameter.name}`);
    });
  }

  /** Reads a parameter by position and checks its requested type. */
  public parameter<T extends LlvmValueType>(index: number, expectedType: T): LlvmValue<T> {
    this.#assertActive();
    const parameter = this.#parameters.at(index);
    if (parameter === undefined || !sameLlvmType(parameter.type, expectedType)) {
      throw llvmError(`incompatible LLVM parameter ${index}`);
    }
    return createLlvmValue(expectedType, this.#owner, llvmValueText(parameter));
  }

  /** Returns the existing label or mints one for a block that may be opened later. */
  public label(name: string): LlvmBlockLabel {
    this.#assertActive();
    const existing = this.#labels.get(name);
    if (existing !== undefined) {
      return existing;
    }
    const label = createLlvmBlockLabel(assertLlvmName(name, "block name"), this.#owner);
    this.#labels.set(name, label);
    return label;
  }

  public block(name: string, build: (block: LlvmBlockBuilder) => void): void {
    build(this.openBlock(name));
  }

  public withTrace<A>(traceId: string, build: () => A): A {
    this.#assertActive();
    return this.#traces.runOutermost(traceId, build);
  }

  public openBlock(name: string): LlvmBlockBuilder {
    this.#assertActive();
    if (this.#blockNames.has(name)) {
      throw llvmError(`duplicate LLVM block name ${name}`);
    }
    this.#blockNames.add(name);
    const owner = Symbol(`llvm-block:${name}`);
    this.#blockNamesByOwner.set(owner, name);
    const builder = new BlockBuilder(this.#context(this.label(name)), owner);
    this.#openBlocks.push({ name, builder });
    return builder;
  }

  /** Seals all blocks before checking edges, phi predecessors, and operand dominance. */
  public finish(): BuiltLlvmFunction {
    this.#assertActive();
    if (this.#openBlocks.length === 0) {
      throw llvmError(`LLVM function ${this.#spec.name} has no blocks`);
    }
    const blocks = this.#seal();
    const [entry] = blocks;
    this.#assertTargetsExist(blocks);
    this.#assertLabelsClaimed();
    this.#assertPhiPredecessors(blocks);
    this.#verifySsa(blocks, entry);
    return Object.freeze({ spec: this.#spec, entry, blocks: Object.freeze(blocks) });
  }

  /** Discards a partially built function, sealing its blocks so no handle outlives the failure. */
  public abort(): void {
    this.#active = false;
    for (const block of this.#openBlocks) {
      block.builder.discard();
    }
  }

  /** If one block fails to seal, abort closes every remaining block. */
  #seal(): RecordedBlock[] {
    this.#active = false;
    try {
      return this.#openBlocks.map((block) => block.builder.finish());
    } catch (error) {
      this.abort();
      throw error;
    }
  }

  #context(label: LlvmBlockLabel): BlockContext {
    const instructions: LlvmInstruction[] = [];
    return {
      origin: this.#spec.name,
      label,
      returnType: this.#spec.returns,
      functionOwner: this.#owner,
      activeTraceIds: () => this.#traces.active(),
      allocateName: (hint) => this.#allocateName(hint),
      record: (instruction) => instructions.push(instruction) - 1,
      instructions: () => Object.freeze([...instructions]),
      callee: this.#callee,
      functionName: this.#functionName,
      globalName: this.#globalName
    };
  }

  /** Allocate hint or its lowest unused numeric suffix. */
  #allocateName(hint: string): string {
    let candidate = hint;
    let suffix = 1;
    while (this.#ssaNames.has(candidate)) {
      candidate = `${hint}.${suffix}`;
      suffix += 1;
    }
    this.#ssaNames.add(candidate);
    return `%${candidate}`;
  }

  #assertTargetsExist(blocks: readonly RecordedBlock[]): void {
    for (const block of blocks) {
      for (const target of block.successors) {
        if (!this.#blockNames.has(target)) {
          throw llvmError(`LLVM branch references unknown block ${target}`);
        }
      }
    }
  }

  /** Reports unclaimed labels after checking branch targets, preserving the more specific unknown-target error. */
  #assertLabelsClaimed(): void {
    for (const name of this.#labels.keys()) {
      if (!this.#blockNames.has(name)) {
        throw llvmError(`LLVM label ${name} is never claimed by a block`);
      }
    }
  }

  /** Each phi has one incoming value per CFG edge, including repeated predecessor edges. */
  #assertPhiPredecessors(blocks: readonly RecordedBlock[]): void {
    const predecessors = predecessorNames(blocks);
    for (const block of blocks) {
      const expected = predecessors.get(block.label.name) ?? [];
      for (const instruction of block.instructions) {
        if (instruction.kind === "phi") {
          assertPhiEdges(instruction, block.label.name, expected);
        }
      }
    }
  }

  /** Ordinary uses require a dominating definition. Phi uses are checked on the incoming edge.
 * Unreachable blocks are exempt, matching LLVM. */
  #verifySsa(blocks: readonly RecordedBlock[], entry: RecordedBlock): void {
    const tree = buildLlvmDominatorTree(controlFlowOf(blocks), entry.label.name);
    for (const block of blocks) {
      if (!tree.isReachable(block.label.name)) {
        continue;
      }
      for (const instruction of block.instructions) {
        if (instruction.kind === "phi") {
          for (const incoming of instruction.incoming) {
            this.#verifyOperand(incoming.value, incoming.block.name, tree);
          }
          continue;
        }
        for (const operand of llvmInstructionOperands(instruction)) {
          this.#verifyOperand(operand, block.label.name, tree);
        }
      }
    }
  }

  /** Checks dominance at the ordinary use block or the phi's incoming predecessor. */
  #verifyOperand(value: LlvmValue, useName: string, tree: LlvmDominatorTree): void {
    const { definition } = llvmValueData(value);
    if (definition === undefined) {
      return;
    }
    const definedIn = this.#blockNamesByOwner.get(definition.block) ?? "<unknown LLVM block>";
    if (definedIn === useName || tree.dominates(definedIn, useName)) {
      return;
    }
    throw llvmError(`LLVM value ${llvmValueText(value)} is defined in ${definedIn}, which does not dominate its use in ${useName}`);
  }

  #assertActive(): void {
    if (!this.#active) {
      throw llvmError("LLVM function builder escaped its scope");
    }
  }
}

/** The edge set dominance needs: each block's name and the names its terminators transfer to. */
function controlFlowOf(blocks: readonly RecordedBlock[]): readonly LlvmControlFlowBlock[] {
  return blocks.map((block) => ({ name: block.label.name, successors: block.successors }));
}

/** The reverse edge set, which is what decides whether a `phi` may read from a given block. */
function predecessorNames(blocks: readonly RecordedBlock[]): Map<string, string[]> {
  const predecessors = new Map<string, string[]>();
  for (const block of blocks) {
    const terminator = block.instructions[block.instructions.length - 1];
    for (const successor of llvmInstructionTargets(terminator)) {
      const sources = predecessors.get(successor.name) ?? [];
      sources.push(block.label.name);
      predecessors.set(successor.name, sources);
    }
  }
  return predecessors;
}

function assertPhiEdges(phi: LlvmPhiInstruction<LlvmValueType>, block: string, predecessors: readonly string[]): void {
  const remaining = [...predecessors];
  const valuesByPredecessor = new Map<string, string>();
  for (const incoming of phi.incoming) {
    const source = incoming.block.name;
    if (!predecessors.includes(source)) {
      throw llvmError(`phi in ${block} reads from ${source}, which is not one of its predecessors`);
    }
    const index = remaining.indexOf(source);
    if (index === -1) {
      throw llvmError(`phi in ${block} has too many incoming values from ${source}`);
    }
    remaining.splice(index, 1);
    const value = llvmValueText(incoming.value);
    const previous = valuesByPredecessor.get(source);
    if (previous !== undefined && previous !== value) {
      throw llvmError(`phi in ${block} has conflicting incoming values from ${source}`);
    }
    valuesByPredecessor.set(source, value);
  }
  const missing = remaining.at(0);
  if (missing !== undefined) {
    throw llvmError(`phi in ${block} is missing an incoming value from ${missing}`);
  }
}

const llvmNamePattern = /^[A-Za-z$._][\w$.-]*$/;

function assertLlvmName(name: string, description: string): string {
  if (!llvmNamePattern.test(name)) {
    throw llvmError(`invalid LLVM ${description} ${name}`);
  }
  return name;
}

function llvmError(message: string): Error {
  return new Error(`Internal compiler error: ${message}`);
}
