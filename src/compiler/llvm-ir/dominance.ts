/** Compute dominance after all terminators exist, as an immediate-dominator tree over reverse postorder. */

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

/** Compute dominators for blocks reachable from entry. Unreachable blocks are exempt from SSA dominance checks. */
export function buildLlvmDominatorTree(blocks: readonly LlvmControlFlowBlock[], entry: string): LlvmDominatorTree {
  const indexOf = new Map(blocks.map((block, index) => [block.name, index]));
  const entryIndex = indexOf.get(entry);
  if (entryIndex === undefined) {
    throw internalError(`LLVM entry block ${entry} is not one of the function's blocks`);
  }
  const successors = blocks.map((block) => block.successors.flatMap((name) => indexOf.get(name) ?? []));
  const order = reversePostorder(successors, entryIndex);
  const rank = new Map(order.map((index, position) => [index, position]));
  const immediate = immediateDominators(order, predecessorRanks(order, rank, successors));
  const intervals = treeIntervals(immediate);
  const intervalOf = (name: string): TreeInterval | undefined => {
    const index = indexOf.get(name);
    const position = index === undefined ? undefined : rank.get(index);
    return position === undefined ? undefined : intervals[position];
  };

  return {
    isReachable: (block) => intervalOf(block) !== undefined,
    dominates: (definition, block) => {
      const outer = intervalOf(definition);
      const inner = intervalOf(block);
      return outer !== undefined && inner !== undefined && outer.first <= inner.first && inner.last <= outer.last;
    }
  };
}

/** The range of tree positions a block's dominated subtree covers. */
interface TreeInterval {
  readonly first: number;
  readonly last: number;
}

/** Reachable blocks with every block before its successors, except along back edges. */
function reversePostorder(successors: readonly (readonly number[])[], entry: number): readonly number[] {
  const postorder: number[] = [];
  const visited = new Set([entry]);
  const stack = [{ block: entry, next: 0 }];
  for (let frame = stack.at(-1); frame !== undefined; frame = stack.at(-1)) {
    const successor = successors[frame.block].at(frame.next);
    frame.next += 1;
    if (frame.next > successors[frame.block].length || successor === undefined) {
      postorder.push(frame.block);
      stack.pop();
    } else if (!visited.has(successor)) {
      visited.add(successor);
      stack.push({ block: successor, next: 0 });
    }
  }
  return postorder.toReversed();
}

function predecessorRanks(
  order: readonly number[], rank: ReadonlyMap<number, number>, successors: readonly (readonly number[])[]
): readonly (readonly number[])[] {
  const predecessors: number[][] = order.map(() => []);
  for (const [position, block] of order.entries()) {
    for (const successor of successors[block]) {
      const target = rank.get(successor);
      if (target !== undefined) {
        predecessors[target].push(position);
      }
    }
  }
  return predecessors;
}

/** Each block's immediate dominator by reverse-postorder rank; the entry, at rank 0, is its own. */
function immediateDominators(
  order: readonly number[], predecessors: readonly (readonly number[])[]
): readonly number[] {
  const immediate = order.map((_block, position): number => position === 0 ? 0 : -1);
  let changed = true;
  while (changed) {
    changed = false;
    for (let position = 1; position < order.length; position += 1) {
      let common = -1;
      for (const predecessor of predecessors[position]) {
        if (immediate[predecessor] !== -1) {
          common = common === -1 ? predecessor : commonAncestor(immediate, common, predecessor);
        }
      }
      if (immediate[position] !== common) {
        immediate[position] = common;
        changed = true;
      }
    }
  }
  return immediate;
}

/** Dominators precede the blocks they dominate, so the later of two ranks is the one to walk up. */
function commonAncestor(immediate: readonly number[], left: number, right: number): number {
  let [first, second] = [left, right];
  while (first !== second) {
    if (first > second) {
      first = immediate[first];
    } else {
      second = immediate[second];
    }
  }
  return first;
}

function treeIntervals(immediate: readonly number[]): readonly TreeInterval[] {
  const sizes = immediate.map(() => 1);
  for (let position = immediate.length - 1; position > 0; position -= 1) {
    sizes[immediate[position]] += sizes[position];
  }
  const next = immediate.map(() => 0);
  const intervals: TreeInterval[] = [];
  for (const [position, parent] of immediate.entries()) {
    const first = position === 0 ? 0 : next[parent];
    if (position !== 0) {
      next[parent] += sizes[position];
    }
    next[position] = first + 1;
    intervals.push({ first, last: first + sizes[position] - 1 });
  }
  return intervals;
}

function internalError(message: string): Error {
  return new Error(`Internal compiler error: ${message}`);
}
