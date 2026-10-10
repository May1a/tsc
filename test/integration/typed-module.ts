import path from "node:path";
import { Effect } from "effect";
import { expect } from "vitest";
import { type ResolvedModule, resolveBindings } from "../../src/compiler/binding-resolution/index.js";
import { loadProgram } from "../../src/compiler/frontend.js";
import { lowerToJsIr } from "../../src/compiler/ir.js";
import {
  type BuiltLlvmBlock,
  type BuiltLlvmFunction,
  type BuiltLlvmModule,
  type LlvmGepIndex,
  type LlvmGetElementPtrInstruction,
  type LlvmInstruction,
  type LlvmValue,
  createLlvmModule,
  isLlvmTerminator,
  llvmInstructionResult,
  llvmValueText
} from "../../src/compiler/llvm-ir/index.js";
import { emitNativeModule } from "../../src/compiler/native-lowering/module.js";
import { runtimeIrText } from "../../src/compiler/runtime-files.js";
import { commandExecutorLayer, repoRoot } from "./helpers.js";

/** Read structural properties from the production LLVM graph. */

interface TypedFixture {
  readonly module: BuiltLlvmModule;
  readonly resolved: ResolvedModule;
}

/** Anything instructions can be read from: a whole function, or one of its blocks. */
export type InstructionSource = BuiltLlvmFunction | BuiltLlvmBlock;

/** A rendered operation: its opcode or predicate, then its operands. */
export type Operation = readonly [opcode: string, left: string, right: string];

type CallInstruction = Extract<LlvmInstruction, { readonly kind: "call" }>;
type StoreInstruction = Extract<LlvmInstruction, { readonly kind: "store" }>;

const fixtures = new Map<string, Promise<TypedFixture>>();

async function buildFixture(fixture: string): Promise<TypedFixture> {
  const entry = path.join(repoRoot, "test/fixtures", fixture);
  const frontend = await Effect.runPromise(loadProgram(entry).pipe(Effect.provide(commandExecutorLayer)));
  expect(frontend.diagnostics).toEqual([]);
  const lowered = lowerToJsIr(entry, frontend.sourceFiles, frontend.program.getTypeChecker());
  expect(lowered.diagnostics).toEqual([]);
  const resolved = resolveBindings(lowered.module);
  expect(resolved.diagnostics).toEqual([]);
  const builder = createLlvmModule({ staticRuntime: [{ origin: "static runtime", text: runtimeIrText() }] });
  emitNativeModule(resolved.module, builder);
  return { module: builder.build(), resolved: resolved.module };
}

export async function buildTypedFixture(fixture: string): Promise<TypedFixture> {
  const existing = fixtures.get(fixture);
  if (existing !== undefined) return existing;
  const pending = buildFixture(fixture);
  fixtures.set(fixture, pending);
  return pending;
}

function blocksOf(source: InstructionSource): readonly BuiltLlvmBlock[] {
  return "blocks" in source ? source.blocks : [source];
}

export function functionInstructions(fn: BuiltLlvmFunction): readonly LlvmInstruction[] {
  return blocksOf(fn).flatMap((block) => block.instructions);
}

function ofKind<T extends LlvmInstruction["kind"]>(
  source: InstructionSource,
  kind: T
): readonly Extract<LlvmInstruction, { readonly kind: T }>[] {
  return blocksOf(source).flatMap((block) => block.instructions).filter(
    (instruction): instruction is Extract<LlvmInstruction, { readonly kind: T }> => instruction.kind === kind
  );
}


export function mainFunction(module: BuiltLlvmModule): BuiltLlvmFunction {
  const main = module.functions.find((fn) => fn.spec.name === "main");
  if (main === undefined) throw new Error(`The module defines no main: ${module.functions.map((f) => f.spec.name).join(", ")}`);
  return main;
}

/** The names of the module's declarations: symbols it uses but defines elsewhere. */
export function declaredNames(module: BuiltLlvmModule): readonly string[] {
  return module.declarations.map((declaration) => declaration.name);
}

/** Generated functions use the boxed thunk parameters and completion result. */
export function generatedFunctions(module: BuiltLlvmModule): readonly BuiltLlvmFunction[] {
  return module.functions.filter((fn) =>
    fn.spec.parameters.map((parameter) => parameter.name).join(",") === "argc,argv,env,this" && returnsCompletion(fn));
}

function returnsCompletion(fn: BuiltLlvmFunction): boolean {
  const { returns } = fn.spec;
  return returns.kind === "struct" && returns.elements.length === 2 &&
    returns.elements[0]?.kind === "integer" && returns.elements[0].bits === 64 &&
    returns.elements[1]?.kind === "integer" && returns.elements[1].bits === 1;
}

export function soleGeneratedFunction(module: BuiltLlvmModule): BuiltLlvmFunction {
  const generated = generatedFunctions(module);
  if (generated.length !== 1) {
    throw new Error(`Expected one generated function, found ${generated.length}: ${generated.map((f) => f.spec.name).join(", ")}`);
  }
  return generated[0];
}

export function blockNames(fn: BuiltLlvmFunction): readonly string[] {
  return fn.blocks.map((block) => block.label.name);
}

export function requireBlock(fn: BuiltLlvmFunction, name: string): BuiltLlvmBlock {
  const found = fn.blocks.find((block) => block.label.name === name);
  if (found === undefined) throw new Error(`No block "${name}" in @${fn.spec.name}; it has: ${blockNames(fn).join(", ")}`);
  return found;
}

/** The labels a block's terminator transfers to; empty when it returns or is unreachable. */
export function successorsOf(block: BuiltLlvmBlock): readonly string[] {
  const { instructions } = block;
  if (instructions.length === 0) return [];
  const terminator = instructions[instructions.length - 1];
  if (!isLlvmTerminator(terminator)) return [];
  switch (terminator.kind) {
    case "branch": {
      return [terminator.target.name];
    }
    case "conditionalBranch": {
      return [terminator.whenTrue.name, terminator.whenFalse.name];
    }
    case "switch": {
      return [...terminator.cases.map((entry) => entry.target.name), terminator.defaultTarget.name];
    }
    case "return":
    case "unreachable": {
      return [];
    }
    default: {
      const exhaustive: never = terminator;
      return exhaustive;
    }
  }
}

/** The join blocks a ternary produced, one per conditional expression. */
export function ternaryJoins(fn: BuiltLlvmFunction): readonly string[] {
  return blockNames(fn).filter((name) => name.endsWith("ternary.join"));
}

/** The block group a logical `&&` or `||` produced, one per logical expression. */
export function shortCircuitBlocks(fn: BuiltLlvmFunction): readonly string[] {
  return blockNames(fn).filter((name) => name.startsWith("condition.logical."));
}


export function callsTo(source: InstructionSource, name: string): readonly CallInstruction[] {
  return ofKind(source, "call").filter((call) => call.callee.kind === "symbol" && call.callee.name === name);
}

export function calleeNames(source: InstructionSource): readonly string[] {
  const names = new Set<string>();
  for (const call of ofKind(source, "call")) {
    if (call.callee.kind === "symbol") names.add(call.callee.name);
  }
  return [...names];
}

/** Read call arity from the argc operand; jsCall has a fixed LLVM argument count. */
export function argumentCounts(fn: BuiltLlvmFunction, name: string): readonly string[] {
  return callsTo(fn, name).map((call) => llvmValueText(call.arguments[1]));
}

/** Return literal text or the producing instruction kind, without pinning SSA names. */
function operandOrigin(fn: BuiltLlvmFunction, value: LlvmValue): string {
  const text = llvmValueText(value);
  if (!text.startsWith("%")) return text;
  const produced = blocksOf(fn).flatMap((block) => block.instructions)
    .find((instruction) => llvmInstructionResult(instruction) === value);
  return produced === undefined ? text : produced.kind;
}

/** LLVM renders every numeric constant with a digit, a sign, or a `0x` bit pattern. */
const literalPattern = /^-?(?:\d|0x)/;

function operandsIn(fn: BuiltLlvmFunction, block: string | undefined): readonly BuiltLlvmBlock[] {
  return block === undefined ? fn.blocks : [requireBlock(fn, block)];
}

/** Comparison predicate and operand origins, optionally restricted to one block. */
export function floatingPointComparisons(fn: BuiltLlvmFunction, block?: string): readonly Operation[] {
  return operandsIn(fn, block).flatMap((source) =>
    ofKind(source, "floatingPointComparison").map(
      (comparison) =>
        [comparison.predicate, operandOrigin(fn, comparison.left), operandOrigin(fn, comparison.right)] as const
    ));
}

/** Comparisons with no computed operand, which is what a folded condition looks like. */
export function foldedComparisons(fn: BuiltLlvmFunction, block?: string): readonly Operation[] {
  return floatingPointComparisons(fn, block).filter(([, left, right]) =>
    literalPattern.test(left) && literalPattern.test(right));
}

export function integerComparisons(fn: BuiltLlvmFunction, block?: string): readonly Operation[] {
  return operandsIn(fn, block).flatMap((source) =>
    ofKind(source, "integerComparison").map(
      (comparison) =>
        [comparison.predicate, operandOrigin(fn, comparison.left), operandOrigin(fn, comparison.right)] as const
    ));
}

export function integerBinaries(fn: BuiltLlvmFunction, block?: string): readonly Operation[] {
  return operandsIn(fn, block).flatMap((source) =>
    ofKind(source, "integerBinary").map(
      (operation) =>
        [operation.opcode, operandOrigin(fn, operation.left), operandOrigin(fn, operation.right)] as const
    ));
}

export function floatingPointBinaries(fn: BuiltLlvmFunction, block?: string): readonly Operation[] {
  return operandsIn(fn, block).flatMap((source) =>
    ofKind(source, "floatingPointBinary").map(
      (operation) =>
        [operation.opcode, operandOrigin(fn, operation.left), operandOrigin(fn, operation.right)] as const
    ));
}

export function floatingPointNegations(fn: BuiltLlvmFunction, block?: string): readonly string[] {
  return operandsIn(fn, block).flatMap((source) =>
    ofKind(source, "floatingPointUnary").map((negation) => operandOrigin(fn, negation.operand)));
}


/** Constant getelementptr indices in instruction order. Computed indices are excluded. */
export function constantGepIndexes(source: InstructionSource): readonly number[] {
  const instructions: readonly LlvmGetElementPtrInstruction[] = ofKind(source, "getElementPtr");
  return instructions.flatMap((instruction) => instruction.indexes.slice(1).flatMap(constantIndex));
}

const constantTextPattern = /^\d+$/;

function constantIndex(index: LlvmGepIndex): readonly number[] {
  if (typeof index.value === "bigint") return [Number(index.value)];
  const text = llvmValueText(index.value);
  return constantTextPattern.test(text) ? [Number(text)] : [];
}

/** The values written into one binding slot, rendered by the builder. */
export function storesTo(source: InstructionSource, global: string): readonly string[] {
  const stores: readonly StoreInstruction[] = ofKind(source, "store");
  return stores.filter((store) => llvmValueText(store.pointer) === `@${global}`)
    .map((store) => llvmValueText(store.value));
}

export function loadsFrom(source: InstructionSource, global: string): readonly string[] {
  return ofKind(source, "load").filter((load) => llvmValueText(load.pointer) === `@${global}`)
    .map((load) => llvmValueText(load.result));
}

/** Physical binding globals in allocation order, including GC owners and fixed-object fields. */
export function bindingGlobals(module: BuiltLlvmModule): readonly string[] {
  return module.globals.flatMap((item) => item.kind === "definition" ? [item.spec.name] : [])
    .filter((name) => name.startsWith("tscn.binding."));
}

export function phiCount(block: BuiltLlvmBlock): number {
  return block.instructions.filter((instruction) => instruction.kind === "phi").length;
}