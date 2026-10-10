import type { BuiltLlvmFunction } from "./built.js";
import type { LlvmInstruction } from "./instructions.js";
import { type RenderLine, renderLlvmInstruction } from "./render.js";
import { renderLlvmParameterList } from "./signatures.js";
import { renderLlvmType } from "./types.js";

/** Render the verified module, including its immutable Static Runtime IR fragments. */

export interface MutableLineRange {
  readonly startLine: number;
  endLine: number;
}

export interface RenderedLlvmModule {
  readonly text: string;
  readonly traceRanges: ReadonlyMap<string, readonly MutableLineRange[]>;
}

/** Render function blocks in construction order. */
export function renderLlvmFunctionBody(function_: BuiltLlvmFunction): readonly RenderLine[] {
  const parameters = renderLlvmParameterList(function_.spec.parameters, function_.spec.variadic === true);
  return [
    plainLine(`define ${renderLlvmType(function_.spec.returns)} @${function_.spec.name}(${parameters}) {`),
    ...function_.blocks.flatMap((block) => [plainLine(`${block.label.name}:`), ...renderInstructions(block.instructions)]),
    plainLine("}")
  ];
}

/** Derive trace markers from consecutive instructions' trace stacks. */
export function renderInstructions(instructions: readonly LlvmInstruction[]): readonly RenderLine[] {
  const last = instructions.at(-1);
  return [
    ...instructions.flatMap((instruction, index) => [
      ...markerLines(instructions[index - 1]?.provenance.traceIds ?? [], instruction.provenance.traceIds),
      ...instructionLines(instruction)
    ]),
    ...closingMarkers(last?.provenance.traceIds ?? [])
  ];
}

/** Close trace regions innermost first, then open new regions outermost first. */
function markerLines(was: readonly string[], now: readonly string[]): readonly RenderLine[] {
  return [
    ...was.filter((id) => !now.includes(id)).toReversed().map((id) => plainLine(`; tscn-trace-end ${id}`)),
    ...now.filter((id) => !was.includes(id)).map((id) => plainLine(`; tscn-trace-start ${id}`))
  ];
}

function closingMarkers(open: readonly string[]): readonly RenderLine[] {
  return open.toReversed().map((id) => plainLine(`; tscn-trace-end ${id}`));
}

/** One instruction's lines, indented, each carrying the trace ids that were active where it was emitted. */
function instructionLines(instruction: LlvmInstruction): readonly RenderLine[] {
  const { traceIds } = instruction.provenance;
  return renderLlvmInstruction(instruction).map((line) => ({ text: `  ${line}`, traceIds: [...traceIds] }));
}

export function plainLine(text: string): RenderLine {
  return { text, traceIds: [] };
}

/** Merge consecutive lines carrying the same trace id. Marker lines carry no ids. */
export function traceRangesOf(lines: readonly RenderLine[]): Map<string, MutableLineRange[]> {
  const ranges = new Map<string, MutableLineRange[]>();
  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    for (const traceId of lines[index].traceIds) {
      const traceRanges = ranges.get(traceId) ?? [];
      const previous = traceRanges.at(-1);
      if (previous?.endLine === lineNumber - 1) {
        previous.endLine = lineNumber;
      } else {
        traceRanges.push({ startLine: lineNumber, endLine: lineNumber });
      }
      ranges.set(traceId, traceRanges);
    }
  }
  return ranges;
}