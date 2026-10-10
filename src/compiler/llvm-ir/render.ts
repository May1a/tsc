import { type LlvmInstruction, type LlvmTerminator, isLlvmTerminator } from "./instructions.js";
import { type LlvmGepIndex, renderLlvmBlockLabel } from "./labels.js";
import { renderLlvmCallReturnType } from "./signatures.js";
import { type LlvmValue, renderLlvmType } from "./types.js";
import { llvmValueText } from "./values.js";

/** A rendered line and its instruction provenance. Trace ranges exclude marker comments. */
export interface RenderLine {
  readonly text: string;
  readonly traceIds: readonly string[];
}

/** Render the closed instruction union after verification. Rendering assigns no names or control flow. */
export function renderLlvmInstruction(instruction: LlvmInstruction): readonly string[] {
  return isLlvmTerminator(instruction) ? renderTerminator(instruction) : renderValueInstruction(instruction);
}

/**
 * Everything that produces a value. A terminator never has an SSA result and a value instruction never
 * lacks one, so the halves are separate functions rather than one switch with two dead branches.
 */
function renderValueInstruction(instruction: LlvmInstruction): readonly string[] {
  switch (instruction.kind) {
    case "integerBinary": {
      return [assign(instruction.result, `${instruction.opcode} ${renderLlvmType(instruction.type)} ${operands(instruction.left, instruction.right)}`)];
    }
    case "floatingPointBinary": {
      return [assign(instruction.result, `${instruction.opcode} double ${operands(instruction.left, instruction.right)}`)];
    }
    case "floatingPointUnary": {
      return [assign(instruction.result, `fneg double ${llvmValueText(instruction.operand)}`)];
    }
    case "integerComparison": {
      return [assign(instruction.result, `icmp ${instruction.predicate} ${renderLlvmType(instruction.type)} ${operands(instruction.left, instruction.right)}`)];
    }
    case "floatingPointComparison": {
      return [assign(instruction.result, `fcmp ${instruction.predicate} double ${operands(instruction.left, instruction.right)}`)];
    }
    case "cast": {
      const source = renderLlvmType(instruction.sourceType);
      return [assign(instruction.result, `${instruction.opcode} ${source} ${llvmValueText(instruction.operand)} to ${renderLlvmType(instruction.targetType)}`)];
    }
    case "select": {
      return [assign(instruction.result, `select i1 ${llvmValueText(instruction.condition)}, ${typed(instruction.whenTrue)}, ${typed(instruction.whenFalse)}`)];
    }
    case "alloca": {
      return [assign(instruction.result, renderAlloca(instruction))];
    }
    case "load": {
      const loaded = renderLlvmType(instruction.loadedType);
      return [assign(instruction.result, `load ${loaded}, ptr ${llvmValueText(instruction.pointer)}${renderAlignment(instruction.alignment)}`)];
    }
    case "store": {
      return [`store ${typed(instruction.value)}, ptr ${llvmValueText(instruction.pointer)}${renderAlignment(instruction.alignment)}`];
    }
    case "getElementPtr": {
      const source = renderLlvmType(instruction.sourceType);
      const indexes = instruction.indexes.map(renderGepIndex).join(", ");
      return [assign(instruction.result, `getelementptr ${source}, ptr ${llvmValueText(instruction.pointer)}, ${indexes}`)];
    }
    case "insertValue": {
      const aggregate = renderLlvmType(instruction.aggregateType);
      return [assign(instruction.result, `insertvalue ${aggregate} ${llvmValueText(instruction.aggregate)}, ${typed(instruction.element)}, ${instruction.index}`)];
    }
    case "extractValue": {
      const aggregate = renderLlvmType(instruction.aggregateType);
      return [assign(instruction.result, `extractvalue ${aggregate} ${llvmValueText(instruction.aggregate)}, ${instruction.index}`)];
    }
    case "phi": {
      return [assign(instruction.result, renderPhi(instruction))];
    }
    case "call": {
      return [assign(instruction.result, renderCall(instruction))];
    }
    default: {
      return renderTerminator(instruction);
    }
  }
}

function renderTerminator(instruction: LlvmTerminator): readonly string[] {
  switch (instruction.kind) {
    case "switch": {
      return renderSwitch(instruction);
    }
    case "return": {
      const { value, returnType } = instruction;
      return [value === undefined ? "ret void" : `ret ${renderLlvmType(returnType)} ${llvmValueText(value)}`];
    }
    case "branch": {
      return [`br ${renderLlvmBlockLabel(instruction.target)}`];
    }
    case "conditionalBranch": {
      const { condition, whenTrue, whenFalse } = instruction;
      return [`br i1 ${llvmValueText(condition)}, ${renderLlvmBlockLabel(whenTrue)}, ${renderLlvmBlockLabel(whenFalse)}`];
    }
    case "unreachable": {
      return ["unreachable"];
    }
    default: {
      return unrenderableInstruction(instruction);
    }
  }
}

/** Fail if an instruction variant has no renderer. */
function unrenderableInstruction(instruction: { readonly kind?: string }): readonly string[] {
  const { kind } = instruction;
  throw new Error(`Internal compiler error: no renderer for LLVM instruction ${kind ?? "of unknown kind"}`);
}

function renderPhi(instruction: Extract<LlvmInstruction, { readonly kind: "phi" }>): string {
  // A phi's incoming names a basic block, so it is `%entry`, not `label %entry`: the `label` keyword
  // belongs to a branch or a switch target, and writing it here produces a module LLVM rejects with a
  // parse error rather than a type error.
  const incoming = instruction.incoming.map((entry) => `[ ${llvmValueText(entry.value)}, %${entry.block.name} ]`).join(", ");
  return `phi ${renderLlvmType(instruction.phiType)} ${incoming}`;
}

function renderAlloca(instruction: Extract<LlvmInstruction, { readonly kind: "alloca" }>): string {
  const allocated = renderLlvmType(instruction.allocatedType);
  // The element count is a second operand of `alloca`, so it is comma-separated from the type.
  // Space-separated, `alloca i8 i64 8` parses as an unknown opcode and the module does not assemble.
  const count = instruction.count === undefined
    ? ""
    : `, ${renderLlvmType(instruction.count.type)} ${llvmValueText(instruction.count)}`;
  return `alloca ${allocated}${count}${renderAlignment(instruction.alignment)}`;
}

function renderAlignment(alignment: number | undefined): string {
  return alignment === undefined ? "" : `, align ${alignment}`;
}

function renderGepIndex(index: LlvmGepIndex): string {
  const value = typeof index.value === "bigint" ? index.value.toString() : llvmValueText(index.value);
  return `${renderLlvmType(index.type)} ${value}`;
}

function renderCall(instruction: Extract<LlvmInstruction, { readonly kind: "call" }>): string {
  const { callee, arguments: callArguments } = instruction;
  const target = callee.kind === "symbol" ? `@${callee.name}` : llvmValueText(callee.pointer);
  const rendered = callArguments.map(typed).join(", ");
  return `call ${renderLlvmCallReturnType(callee.signature)} ${target}(${rendered})`;
}

function renderSwitch(instruction: Extract<LlvmInstruction, { readonly kind: "switch" }>): readonly string[] {
  if (instruction.cases.length === 0) {
    // A `switch` with no cases has nothing left to dispatch on, so the only faithful rendering is the
    // default edge; `[ ]` is accepted by some LLVM versions and rejected by others.
    return [`br ${renderLlvmBlockLabel(instruction.defaultTarget)}`];
  }
  const conditionType = renderLlvmType(instruction.conditionType);
  const condition = llvmValueText(instruction.condition);
  const cases = instruction.cases.map((entry) => `    ${conditionType} ${entry.value.toString()}, ${renderLlvmBlockLabel(entry.target)}`);
  return [
    `switch ${conditionType} ${condition}, ${renderLlvmBlockLabel(instruction.defaultTarget)} [`,
    ...cases,
    "  ]"
  ];
}

function assign(result: LlvmValue | undefined, body: string): string {
  return result === undefined ? body : `${llvmValueText(result)} = ${body}`;
}

function operands(left: LlvmValue, right: LlvmValue): string {
  return `${llvmValueText(left)}, ${llvmValueText(right)}`;
}

function typed(value: LlvmValue): string {
  return `${renderLlvmType(value.type)} ${llvmValueText(value)}`;
}