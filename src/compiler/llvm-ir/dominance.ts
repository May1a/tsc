/** Compute dominance after all terminators exist, using an iterative predecessor-set intersection. */

/** One basic block's outgoing edges, which is all dominance needs from the CFG. */
export interface LlvmControlFlowBlock {
  readonly name: string;
  readonly successors: readonly string[];
}

export interface LlvmDominatorTree {
  /** Whether `block` is reachable from the entry block. */
  isReachable(block: string): boolean;
  /** Whether every path from the entry block to `block` passes through `definition`. */
  dominates(definition: string, block: string): boolean;
}

function internalError(message: string): Error {
  return new Error(`Internal compiler error: ${message}`);
}

/** Compute dominators for blocks reachable from entry. Unreachable blocks are exempt from SSA dominance checks. */
export function buildLlvmDominatorTree(blocks: readonly LlvmControlFlowBlock[], entry: string): LlvmDominatorTree {
  const indexOf = new Map<string, number>();
  for (const [index, block] of blocks.entries()) {
    indexOf.set(block.name, index);
  }
  const entryIndex = indexOf.get(entry);
  if (entryIndex === undefined) {
    throw internalError(`LLVM entry block ${entry} is not one of the function's blocks`);
  }
  const reachable = reachableIndices(blocks, indexOf, entryIndex);
  const dominators = dominatorSets(blocks, indexOf, reachable, entryIndex);

  return {
    isReachable: (block) => indexOf.get(block) !== undefined && reachable.has(indexOf.get(block) ?? -1),
    dominates: (definition, block) => {
      const definitionIndex = indexOf.get(definition);
      const blockIndex = indexOf.get(block);
      if (definitionIndex === undefined || blockIndex === undefined || !reachable.has(blockIndex)) {
        return false;
      }
      return dominators.get(blockIndex)?.has(definitionIndex) ?? false;
    }
  };
}

/** Every block the entry can reach, by breadth-first search over the edge set. */
function reachableIndices(
  blocks: readonly LlvmControlFlowBlock[],
  indexOf: ReadonlyMap<string, number>,
  entryIndex: number
): Set<number> {
  const reached = new Set<number>([entryIndex]);
  const queue = [entryIndex];
  while (queue.length > 0) {
    const current = queue.pop();
    if (current === undefined) {
      break;
    }
    for (const successor of blocks[current].successors) {
      const successorIndex = indexOf.get(successor);
      if (successorIndex !== undefined && !reached.has(successorIndex)) {
        reached.add(successorIndex);
        queue.push(successorIndex);
      }
    }
  }
  return reached;
}

/** Each block is dominated by itself and the intersection of its reachable predecessors' dominators. */
function dominatorSets(
  blocks: readonly LlvmControlFlowBlock[],
  indexOf: ReadonlyMap<string, number>,
  reachable: ReadonlySet<number>,
  entryIndex: number
): Map<number, Set<number>> {
  const predecessors = predecessorIndices(blocks, indexOf, reachable);
  const dominators = new Map<number, Set<number>>();
  const allReachable = new Set(reachable);
  for (const index of reachable) {
    dominators.set(index, index === entryIndex ? new Set([index]) : new Set(allReachable));
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const index of reachable) {
      if (index === entryIndex) {
        continue;
      }
      const incoming = predecessors.get(index) ?? [];
      const current = dominators.get(index) ?? new Set<number>();
      const narrowed = narrow(index, incoming, dominators);
      if (!sameMembers(current, narrowed)) {
        dominators.set(index, narrowed);
        changed = true;
      }
    }
  }
  return dominators;
}

/** `{b} ∪ (⋂ dom[p])`, or just `{b}` when nothing has a dominator set yet. */
function narrow(block: number, predecessors: readonly number[], dominators: ReadonlyMap<number, ReadonlySet<number>>): Set<number> {
  const [first, ...rest] = predecessors.filter((index) => dominators.has(index)).map((index) => dominators.get(index));
  const narrowed = first === undefined ? new Set<number>() : new Set(first);
  for (const other of rest) {
    if (other === undefined) {
      continue;
    }
    for (const candidate of narrowed) {
      if (!other.has(candidate)) {
        narrowed.delete(candidate);
      }
    }
  }
  narrowed.add(block);
  return narrowed;
}

function predecessorIndices(
  blocks: readonly LlvmControlFlowBlock[],
  indexOf: ReadonlyMap<string, number>,
  reachable: ReadonlySet<number>
): Map<number, number[]> {
  const predecessors = new Map<number, number[]>();
  for (const [index, block] of blocks.entries()) {
    if (!reachable.has(index)) {
      continue;
    }
    for (const successor of block.successors) {
      const successorIndex = indexOf.get(successor);
      if (successorIndex !== undefined && reachable.has(successorIndex)) {
        predecessors.set(successorIndex, [...(predecessors.get(successorIndex) ?? []), index]);
      }
    }
  }
  return predecessors;
}

function sameMembers(left: ReadonlySet<number>, right: ReadonlySet<number>): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const member of left) {
    if (!right.has(member)) {
      return false;
    }
  }
  return true;
}