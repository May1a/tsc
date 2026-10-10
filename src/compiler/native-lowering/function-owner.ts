import type { GcFunctionFacts } from "../gc-liveness/index.js";
import { type BuiltLlvmFunction, type LlvmBlockBuilder, type LlvmBlockLabel, type LlvmFunctionBuilder, type LlvmType, type LlvmValue, type LlvmValueType, llvm } from "../llvm-ir/index.js";
import type { RuntimeCallees } from "../runtime-contracts/callables/index.js";
import { type CompletionCallCapability, createCompletionCalls } from "./completion-calls.js";
import type { BlockCursor } from "./cursor.js";
import { HeapFacts, type RootCapability, createRootCapability } from "./gc.js";
import { type RuntimeCallCapability, createRuntimeCalls } from "./runtime-calls.js";
import { type BoxedValue, type ValueBoundary, createValueBoundary } from "./value-boundary.js";

export type NativeParameter = { readonly name: string } & (
  | { readonly representation?: "scalar"; readonly type: LlvmValueType }
  | { readonly type: typeof llvm.i64; readonly representation: "boxed"; readonly protection: "borrowed" | "owned" }
);

export type NativeFunctionSpec = {
  readonly name: string;
  readonly parameters: readonly NativeParameter[];
} & (
  | { readonly returnsCompletion: true }
  | { readonly returnsCompletion: false; readonly returns: LlvmType }
);

export interface FunctionCapabilities {
  readonly cursor: BlockCursor;
  readonly runtime: RuntimeCallCapability;
  readonly completion: CompletionCallCapability;
  readonly roots: RootCapability;
  readonly values: ValueBoundary;
}

export interface FinishedNativeFunction {
  readonly function: BuiltLlvmFunction;
  readonly facts: GcFunctionFacts;
}

export interface NativeFunctionBuilder {
  readonly capabilities: FunctionCapabilities;
  parameter<T extends LlvmValueType>(index: number, expectedType: T): LlvmValue<T>;
  boxedParameter(index: number): BoxedValue;
  openEntry(): void;
  withTrace<A>(traceId: string, build: () => A): A;
  finish(): GcFunctionFacts;
}

export type FunctionBuilderPort = Pick<LlvmFunctionBuilder, "openBlock" | "label" | "parameter" | "withTrace">;

export class FunctionCursor implements BlockCursor {
  readonly #builder: Pick<FunctionBuilderPort, "openBlock" | "label">;
  readonly #used = new Set<string>();
  readonly #targets = new Set<LlvmBlockLabel>();
  #current: LlvmBlockBuilder | undefined;

  public constructor(builder: Pick<FunctionBuilderPort, "openBlock" | "label">) { this.#builder = builder; }

  public currentBlock(): LlvmBlockBuilder {
    if (this.#current === undefined) { throw new Error("No native block is open"); }
    return this.#current;
  }

  public reserveBlock(hint: string): LlvmBlockLabel {
    const target = this.#builder.label(this.uniqueName(hint));
    this.#targets.add(target);
    return target;
  }

  public openBlock(target: LlvmBlockLabel): void {
    if (!this.#targets.delete(target)) { throw new Error("Native block is foreign or already open"); }
    this.#current = this.#builder.openBlock(target.name);
  }

  public createBlock(hint: string): LlvmBlockLabel {
    const target = this.reserveBlock(hint);
    this.openBlock(target);
    return target;
  }

  public uniqueName(hint: string): string {
    let suffix = 0;
    let name = hint;
    while (this.#used.has(name)) { suffix += 1; name = `${hint}.${suffix}`; }
    this.#used.add(name);
    return name;
  }
}

class FunctionOwner implements NativeFunctionBuilder {
  readonly #builder: FunctionBuilderPort;
  readonly #spec: NativeFunctionSpec;
  readonly #facts = new HeapFacts();
  readonly #capabilities: FunctionCapabilities;
  #entryOpened = false;

  public constructor(builder: FunctionBuilderPort, spec: NativeFunctionSpec, callees: RuntimeCallees) {
    this.#builder = builder;
    this.#spec = spec;
    const cursor = new FunctionCursor(builder);
    const runtime = createRuntimeCalls(cursor, callees, this.#facts);
    this.#capabilities = Object.freeze({
      cursor, runtime, completion: createCompletionCalls(cursor, this.#facts), roots: createRootCapability(cursor, callees), values: createValueBoundary(this.#facts)
    });
  }

  public get capabilities(): FunctionCapabilities { return this.#capabilities; }
  public parameter<T extends LlvmValueType>(index: number, expectedType: T): LlvmValue<T> {
    const parameter = this.#spec.parameters.at(index);
    if (parameter?.representation === "boxed") { throw new Error("Use boxedParameter for a JSValue parameter"); }
    return this.#builder.parameter(index, expectedType);
  }
  public boxedParameter(index: number): BoxedValue {
    const parameter = this.#spec.parameters.at(index);
    if (parameter?.representation !== "boxed") { throw new Error("Parameter is not a declared JSValue"); }
    const value = this.#builder.parameter(index, llvm.i64);
    this.#facts.parameter(value, parameter.protection === "borrowed");
    return value;
  }
  public openEntry(): void {
    if (this.#entryOpened) { throw new Error("The native entry block is already open"); }
    this.#entryOpened = true;
    this.#capabilities.cursor.createBlock("entry");
  }
  public withTrace<A>(traceId: string, build: () => A): A { return this.#builder.withTrace(traceId, build); }
  public finish(): GcFunctionFacts { return this.#facts.finish(); }
}

export function createFunctionOwner(builder: FunctionBuilderPort, spec: NativeFunctionSpec, callees: RuntimeCallees): NativeFunctionBuilder {
  return new FunctionOwner(builder, spec, callees);
}
