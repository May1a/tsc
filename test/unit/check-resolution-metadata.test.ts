import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { checkRepository, checkTier, tiers, unionVariants } from "../../scripts/check-resolution-metadata.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const irSource = readFileSync(path.join(repoRoot, "src/compiler/ir/expressions.ts"), "utf8");

function tierOf(union: string) {
  const tier = tiers.find((entry) => entry.union === union);
  if (tier === undefined) {
    throw new Error(`${union} is not one of the checked tiers`);
  }
  return tier;
}

const numberTier = tierOf("JsIrNumberExpression");
const stringTier = tierOf("JsIrStringExpression");
const conditionTier = tierOf("JsIrCondition");
const valueTier = tierOf("JsIrValueExpression");

function resolverSource(tier: (typeof tiers)[number]): string {
  return readFileSync(path.join(repoRoot, "src/compiler/binding-resolution", tier.file), "utf8");
}

/** One optional flag, which is exactly the shape every historical loss took. */
const flagUnion = [
  "export type JsIrFlagged =",
  '  | { readonly kind: "flagged"; readonly value: string; readonly flag?: boolean };',
  ""
].join("\n");

/** Two required fields, so a conditional spread of either one is already a fault. */
const pairUnion = [
  "export type JsIrPair =",
  '  | { readonly kind: "pair"; readonly first: string; readonly second: string };',
  ""
].join("\n");

const twoVariantUnion = [
  "export type JsIrTwo =",
  '  | { readonly kind: "flagged"; readonly value: string; readonly flag?: boolean }',
  '  | { readonly kind: "pair"; readonly first: string; readonly second: string };',
  ""
].join("\n");

function fixtureTier(union: string) {
  return { union, file: "fixture.ts", table: "fixtureHandlers" };
}

function fixtureHandlers(body: string): string {
  return `export const fixtureHandlers = {\n${body}\n};\n`;
}

function messages(union: string, handlers: string): string[] {
  return checkTier(fixtureTier(union), union === "JsIrFlagged" ? flagUnion : pairUnion, handlers)
    .findings
    .map((finding) => finding.message);
}

describe("resolution metadata preservation", () => {
  test("the repository resolves without dropping IR metadata", () => {
    expect(checkRepository()).toEqual([]);
  });

  test("the schema is read from the IR union, optional fields included", () => {
    expect(unionVariants(irSource, "JsIrNumberExpression").get("arrayIndexOf")).toEqual([
      { name: "kind", required: true },
      { name: "arrayName", required: true },
      { name: "value", required: true },
      { name: "fromEnd", required: false },
      { name: "fromIndex", required: false }
    ]);
  });

  test("rejects the arrayIndexOf handler that dropped the fromEnd flag", () => {
    const broken = resolverSource(numberTier).replace('    ...node,\n    kind: "arrayIndexOf",', '    kind: "arrayIndexOf",');
    expect(checkTier(numberTier, irSource, broken).findings.map((finding) => finding.message))
      .toEqual(["JsIrNumberExpression.arrayIndexOf.fromEnd: is not carried into the resolved variant"]);
  });

  test("rejects a dropped optional number-format argument in the string tier", () => {
    const broken = resolverSource(stringTier).replace("    argument: optional(node.argument, resolver.number)\n", "");
    expect(checkTier(stringTier, irSource, broken).findings.map((finding) => finding.message))
      .toEqual(["JsIrStringExpression.numberFormat.argument: is not carried into the resolved variant"]);
  });

  test("rejects the boxedPrimitive handler that dropped storeLength", () => {
    const broken = resolverSource(valueTier).replace(
      '  boxedPrimitive: (node, resolver) => ({\n    ...node,\n    kind: "boxedPrimitive",',
      '  boxedPrimitive: (node, resolver) => ({\n    kind: "boxedPrimitive",'
    );
    expect(checkTier(valueTier, irSource, broken).findings.map((finding) => finding.message))
      .toEqual(["JsIrValueExpression.boxedPrimitive.storeLength: is not carried into the resolved variant"]);
  });

  test("rejects the runtimeObjectHas handler that dropped receiverKind", () => {
    const broken = resolverSource(conditionTier).replace(
      '  runtimeObjectHas: (node, resolver) => ({\n    ...node,\n    kind: "runtimeObjectHas",',
      '  runtimeObjectHas: (node, resolver) => ({\n    kind: "runtimeObjectHas",'
    );
    expect(checkTier(conditionTier, irSource, broken).findings.map((finding) => finding.message))
      .toEqual(["JsIrCondition.runtimeObjectHas.receiverKind: is not carried into the resolved variant"]);
  });

  test("accepts every real tier, including the conditional spreads in callValue", () => {
    for (const tier of tiers) {
      expect(checkTier(tier, irSource, resolverSource(tier)).findings).toEqual([]);
    }
  });

  test("accepts a conditional spread guarded by the field it supplies", () => {
    const guarded = fixtureHandlers(
      '  flagged: (node) => ({ kind: "flagged", value: node.value, ...(node.flag === undefined ? {} : { flag: node.flag }) })'
    );
    expect(messages("JsIrFlagged", guarded)).toEqual([]);
  });

  test("rejects a conditional spread guarded by a field other than the one it supplies", () => {
    const misguarded = fixtureHandlers(
      '  flagged: (node) => ({ kind: "flagged", value: node.value, ...(node.value === undefined ? {} : { flag: true }) })'
    );
    expect(messages("JsIrFlagged", misguarded)).toEqual([
      "JsIrFlagged.flagged.flag: the conditional spread must be guarded by `node.flag`, found: node.value === undefined"
    ]);
  });

  test("rejects a required field that only a conditional spread supplies", () => {
    const spread = fixtureHandlers('  pair: (node) => ({ kind: "pair", second: node.second, ...(node.first === undefined ? {} : { first: node.first }) })');
    expect(messages("JsIrPair", spread)).toEqual(["JsIrPair.pair.first: a required field cannot be spread conditionally"]);
  });

  test("rejects a handler that supplies a field without reading it", () => {
    const rewritten = fixtureHandlers('  flagged: (node) => ({ kind: "flagged", value: "constant", flag: node.flag })');
    expect(messages("JsIrFlagged", rewritten)).toEqual([
      "JsIrFlagged.flagged.value: the resolved field must derive from the field it resolves, not a fresh value"
    ]);
  });

  test("rejects a handler that overrides a copied field with a fresh value", () => {
    const overridden = fixtureHandlers('  flagged: (node) => ({ ...node, kind: "flagged", value: node.value, flag: false })');
    expect(messages("JsIrFlagged", overridden)).toEqual([
      "JsIrFlagged.flagged.flag: the resolved field must derive from the field it resolves, not a fresh value"
    ]);
  });

  test("accepts a field carried by a shorthand whose local reads the source field", () => {
    const shorthand = fixtureHandlers(
      ['  flagged: (node) => {', '    const { value } = node;', '    return { kind: "flagged", value, flag: node.flag };', '  }'].join("\n")
    );
    expect(messages("JsIrFlagged", shorthand)).toEqual([]);
  });

  test("rejects a variant with no handler at all", () => {
    const partial = fixtureHandlers('  flagged: (node) => ({ kind: "flagged", value: node.value, flag: node.flag })');
    expect(checkTier(fixtureTier("JsIrTwo"), twoVariantUnion, partial).findings.map((finding) => finding.rule))
      .toEqual(["no-missing-resolution-handler"]);
  });

  test("reports a handler whose result cannot be read rather than passing it", () => {
    const opaque = fixtureHandlers("  flagged: (node) => resolveFlagged(node)");
    expect(checkTier(fixtureTier("JsIrFlagged"), flagUnion, opaque).findings.map((finding) => finding.message)).toEqual([
      "JsIrFlagged.flagged: return the resolved variant as an object literal so its fields can be checked"
    ]);
  });

  test("checks every return path independently", () => {
    const body = 'flagged: (node) => { if (node.value) return { ...node }; return { kind: "flagged", value: node.value }; }';
    expect(messages("JsIrFlagged", fixtureHandlers(body)))
      .toEqual(["JsIrFlagged.flagged.flag: is not carried into the resolved variant"]);
  });

  test("an unrelated spread cannot stand in for the source node", () => {
    const body = 'flagged: (node) => ({ kind: "flagged", value: node.value, ...other })';
    expect(checkTier(fixtureTier("JsIrFlagged"), flagUnion, fixtureHandlers(body)).findings.map((finding) => finding.rule))
      .toEqual(["no-unverifiable-resolution-handler"]);
  });

  test("a shorthand must have a local source-field initializer", () => {
    const body = 'flagged: (node) => ({ kind: "flagged", value: node.value, flag })';
    expect(messages("JsIrFlagged", fixtureHandlers(body))).toEqual([
      "JsIrFlagged.flagged.flag: the resolved field must derive from the field it resolves, not a fresh value"
    ]);
  });

  test("conditional forwarding cannot replace a flag with a constant", () => {
    const body = 'flagged: (node) => ({ ...node, ...(node.flag === undefined ? {} : { flag: false }) })';
    expect(messages("JsIrFlagged", fixtureHandlers(body))).toEqual([
      "JsIrFlagged.flagged.flag: the resolved field must derive from the field it resolves, not a fresh value"
    ]);
  });

  test("a later source spread restores fields overridden earlier", () => {
    expect(messages("JsIrFlagged", fixtureHandlers('flagged: (node) => ({ flag: false, ...node })'))).toEqual([]);
  });

  test("the absent branch must actually omit the field", () => {
    const body = 'flagged: (node) => ({ kind: "flagged", value: node.value, ...(node.flag === undefined ? { flag: node.flag } : {}) })';
    expect(checkTier(fixtureTier("JsIrFlagged"), flagUnion, fixtureHandlers(body)).findings.map((finding) => finding.rule))
      .toEqual(["no-unguarded-resolution-metadata"]);
  });
  test("a renamed source parameter retains its identity", () => {
    const body = 'flagged: (input) => ({ ...input })';
    expect(messages("JsIrFlagged", fixtureHandlers(body))).toEqual([]);
  });

  test("a shadowed source name cannot supply the original metadata", () => {
    const body = 'flagged: (node) => { { const node = {}; return { ...node }; } }';
    expect(checkTier(fixtureTier("JsIrFlagged"), flagUnion, fixtureHandlers(body)).findings.map((finding) => finding.rule))
      .toEqual(["no-unverifiable-resolution-handler"]);
  });
});
