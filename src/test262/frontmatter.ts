import type { Test262Frontmatter } from "./types.js";

const frontmatterBlockPattern = /\/\*---([\s\S]*?)---\*\//;
const keyValuePattern = /^([^:\s][^:]*):(?:[ \t]+(.*))?$/;
const blockListItemPattern = /^\s+-\s+(.*)$/;
const mapEntryPattern = /^\s+([^:\s]+):[ \t]*(.*)$/;

const isIndented = (line: string): boolean => line.startsWith(" ") || line.startsWith("\t");

const isBlockScalarMarker = (rest: string): boolean => rest.startsWith("|") || rest.startsWith(">");

const parseFlowList = (rest: string): readonly string[] | undefined => {
  if (!rest.endsWith("]")) {
    return undefined;
  }
  return rest
    .slice(1, -1)
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
};

const assignList = (key: string, items: readonly string[], frontmatter: { flags: string[]; includes: string[]; features: string[] }): void => {
  if (key === "flags") {
    frontmatter.flags.push(...items);
  }
  if (key === "includes") {
    frontmatter.includes.push(...items);
  }
  if (key === "features") {
    frontmatter.features.push(...items);
  }
};

const parseNegativeMap = (blockLines: readonly string[]): { readonly phase: string; readonly type: string } | undefined => {
  const entries = new Map<string, string>();
  for (const blockLine of blockLines) {
    const entry = mapEntryPattern.exec(blockLine);
    if (entry === null) {
      return undefined;
    }
    entries.set(entry[1], entry[2].trim());
  }
  const phase = entries.get("phase");
  const type = entries.get("type");
  if (phase === undefined || phase === "" || type === undefined || type === "") {
    return undefined;
  }
  return { phase, type };
};

const parseBlockList = (blockLines: readonly string[]): readonly string[] | undefined => {
  const items: string[] = [];
  for (const blockLine of blockLines) {
    const item = blockListItemPattern.exec(blockLine);
    if (item === null) {
      return undefined;
    }
    items.push(item[1].trim());
  }
  return items;
};

interface MutableFrontmatter { flags: string[]; includes: string[]; features: string[] }
interface NegativeResult { readonly phase: string; readonly type: string }

type LineResult =
  | { readonly kind: "ok"; readonly nextIndex: number; readonly negative: NegativeResult | undefined }
  | { readonly kind: "error" };

const skipBlockScalar = (lines: readonly string[], startIndex: number): number => {
  let index = startIndex;
  while (index < lines.length && (lines[index].trim() === "" || isIndented(lines[index]))) {
    index += 1;
  }
  return index;
};

const collectBlockBody = (lines: readonly string[], startIndex: number): { readonly blockLines: readonly string[]; readonly nextIndex: number } => {
  const blockLines: string[] = [];
  let index = startIndex;
  while (index < lines.length && lines[index].trim() !== "" && isIndented(lines[index])) {
    blockLines.push(lines[index]);
    index += 1;
  }
  return { blockLines, nextIndex: index };
};

const handleBlockBody = (
  key: string,
  lines: readonly string[],
  index: number,
  frontmatter: MutableFrontmatter,
  negative: NegativeResult | undefined
): { readonly nextIndex: number; readonly negative: NegativeResult | undefined } | undefined => {
  const { blockLines, nextIndex } = collectBlockBody(lines, index);
  if (key === "negative") {
    const parsed = parseNegativeMap(blockLines);
    if (parsed === undefined) {
      return undefined;
    }
    return { nextIndex, negative: parsed };
  }
  const items = parseBlockList(blockLines);
  if (items === undefined) {
    return undefined;
  }
  assignList(key, items, frontmatter);
  return { nextIndex, negative };
};

const processFrontmatterLine = (
  line: string,
  lines: readonly string[],
  index: number,
  frontmatter: MutableFrontmatter,
  negative: NegativeResult | undefined
): LineResult => {
  const trimmed = line.trim();
  if (trimmed === "" || trimmed.startsWith("#")) {
    return { kind: "ok", nextIndex: index, negative };
  }
  if (isIndented(line)) {
    return { kind: "error" };
  }
  const keyValue = keyValuePattern.exec(line);
  if (keyValue === null) {
    return { kind: "error" };
  }
  const [, keyPart, restPart] = keyValue;
  const key = keyPart.trim();
  const rest = (restPart ?? "").trim(); // eslint-disable-line no-unnecessary-condition -- Optional regex group can be undefined at runtime despite TS typing.
  if (isBlockScalarMarker(rest)) {
    return { kind: "ok", nextIndex: skipBlockScalar(lines, index), negative };
  }
  if (rest.startsWith("[")) {
    const items = parseFlowList(rest);
    if (items === undefined) {
      return { kind: "error" };
    }
    assignList(key, items, frontmatter);
    return { kind: "ok", nextIndex: index, negative };
  }
  if (rest === "") {
    const result = handleBlockBody(key, lines, index, frontmatter, negative);
    if (result === undefined) {
      return { kind: "error" };
    }
    return { kind: "ok", nextIndex: result.nextIndex, negative: result.negative };
  }
  return { kind: "ok", nextIndex: index, negative };
};

/**
 * Parses the subset of Test262 YAML frontmatter the harness acts on: `flags`,
 * `includes`, `features`, and `negative` (phase/type). Returns `undefined` when
 * the block is missing or falls outside the supported subset so callers can
 * skip conservatively.
 */
export const parseFrontmatter = (source: string): Test262Frontmatter | undefined => {
  const match = frontmatterBlockPattern.exec(source);
  if (match === null) {
    return undefined;
  }
  const lines = match[1].split("\n");
  const frontmatter: MutableFrontmatter = { flags: [], includes: [], features: [] };
  let negative: NegativeResult | undefined = undefined;
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    index += 1;
    const result = processFrontmatterLine(line, lines, index, frontmatter, negative);
    if (result.kind === "error") {
      return undefined;
    }
    ({ nextIndex: index, negative } = result);
  }
  if (negative === undefined) {
    return frontmatter;
  }
  return { ...frontmatter, negative };
};
