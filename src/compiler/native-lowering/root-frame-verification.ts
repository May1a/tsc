import { type BuiltLlvmBlock, type BuiltLlvmFunction, type LlvmBlockLabel, type LlvmInstruction, llvmValueText } from "../llvm-ir/index.js";

function blockSuccessors(block: BuiltLlvmBlock): readonly LlvmBlockLabel[] {
  const terminator = block.instructions.at(-1);
  switch (terminator?.kind) {
    case "branch": { return [terminator.target]; }
    case "conditionalBranch": { return [terminator.whenTrue, terminator.whenFalse]; }
    case "switch": { return [terminator.defaultTarget, ...terminator.cases.map((entry) => entry.target)]; }
    default: { return []; }
  }
}

function applyInstruction(instruction: LlvmInstruction, frames: string[], location: string): void {
  if (instruction.kind === "return" && frames.length > 0) {
    throw new Error(`GC root frames remain active at return in ${location}`);
  }
  if (instruction.kind !== "call" || instruction.callee.kind !== "symbol") { return; }
  if (instruction.callee.name === "gcRootSave" && instruction.result !== undefined) {
    frames.push(llvmValueText(instruction.result));
  }
  if (instruction.callee.name !== "gcRootRestore") { return; }
  const depth = instruction.arguments.at(0);
  const index = depth === undefined ? -1 : frames.indexOf(llvmValueText(depth));
  if (index < 0) { throw new Error(`GC root restore has no active save in ${location}`); }
  frames.splice(index);
}

// Every reachable exit must restore the same root stack it entered with.
export function verifyRootFrames(fn: BuiltLlvmFunction): void {
  const incoming = new Map<string, readonly string[]>([[fn.entry.label.name, []]]);
  const pending = [fn.entry.label.name];
  const blocks = new Map(fn.blocks.map((block) => [block.label.name, block]));
  while (pending.length > 0) {
    const name = pending.pop();
    if (name === undefined) { break; }
    const block = blocks.get(name);
    const state = incoming.get(name);
    if (block === undefined || state === undefined) { throw new Error("Root verification found an unknown block"); }
    const frames = [...state];
    for (const instruction of block.instructions) { applyInstruction(instruction, frames, `${fn.spec.name}:${name}`); }
    for (const successor of blockSuccessors(block)) {
      const known = incoming.get(successor.name);
      if (known === undefined) {
        incoming.set(successor.name, frames);
        pending.push(successor.name);
      } else if (known.length !== frames.length || known.some((frame, index) => frame !== frames[index])) {
        throw new Error(`GC root frame stacks disagree at ${fn.spec.name}:${successor.name}`);
      }
    }
  }
}
