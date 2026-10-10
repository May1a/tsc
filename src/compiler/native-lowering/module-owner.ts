import type {
  BuiltLlvmModule, LlvmFunctionSpec, LlvmGlobalReference, LlvmGlobalSpec,
  LlvmModuleBuilder, LlvmType, RenderedLlvmModule
} from "../llvm-ir/index.js";
import type { CompletionFunctionSpec } from "./completion-calls.js";
import type { GcFunctionFacts } from "../gc-liveness/index.js";
import { type RuntimeCallees, createRuntimeCallees } from "../runtime-contracts/callables/index.js";
import { defineStructuredRuntimeHelpers } from "../runtime-ir.js";
import { type FinishedNativeFunction, type NativeFunctionBuilder, type NativeFunctionSpec, createFunctionOwner } from "./function-owner.js";
import { verifyFunctionGc } from "./gc.js";
import { completionAggregate } from "./runtime-calls.js";

export class NativeModule {
  readonly #module: LlvmModuleBuilder;
  readonly #callees: RuntimeCallees;
  readonly #strings = new Map<string, LlvmGlobalReference>();
  readonly #functions: FinishedNativeFunction[] = [];
  #failure: unknown;

  public constructor(module: LlvmModuleBuilder) {
    this.#module = module;
    this.#callees = Object.freeze(createRuntimeCallees(module));
    defineStructuredRuntimeHelpers(module);
  }

  public get callees(): RuntimeCallees { return this.#callees; }

  public declareFunction(spec: NativeFunctionSpec & { readonly returnsCompletion: true }): CompletionFunctionSpec;
  public declareFunction<T extends LlvmType>(spec: NativeFunctionSpec & { readonly returnsCompletion: false; readonly returns: T }): LlvmFunctionSpec & { readonly returns: T };
  public declareFunction(spec: NativeFunctionSpec): LlvmFunctionSpec;
  public declareFunction(spec: NativeFunctionSpec): LlvmFunctionSpec {
    this.#assertValid();
    if (!spec.returnsCompletion) {
      return this.#module.declareFunction({ name: spec.name, parameters: spec.parameters, returns: spec.returns });
    }
    return this.#module.declareFunction(functionSpecOf(spec));
  }

  public defineFunction(spec: NativeFunctionSpec, lower: (fn: NativeFunctionBuilder) => void): FinishedNativeFunction {
    this.#assertValid();
    try {
      let facts: GcFunctionFacts | undefined;
      const registered = this.#module.defineFunction(functionSpecOf(spec), (fn) => {
        const owner = createFunctionOwner(fn, spec, this.#callees);
        lower(owner);
        facts = owner.finish();
      });
      if (facts === undefined) { throw new Error(`Function ${spec.name} produced no GC facts`); }
      const built = this.#module.finishedFunction(registered);
      verifyFunctionGc(built, facts);
      const finished = Object.freeze({ function: built, facts });
      this.#functions.push(finished);
      return finished;
    } catch (error) {
      this.#failure = error;
      throw error;
    }
  }

  public stringConstant(text: string): LlvmGlobalReference {
    this.#assertValid();
    const known = this.#strings.get(text);
    if (known !== undefined) { return known; }
    const reference = this.#module.stringConstant(text);
    this.#strings.set(text, reference);
    return reference;
  }

  public defineGlobal(spec: LlvmGlobalSpec): LlvmGlobalReference {
    this.#assertValid();
    return this.#module.defineGlobal(spec);
  }

  public get functions(): readonly FinishedNativeFunction[] { return Object.freeze([...this.#functions]); }
  public build(): BuiltLlvmModule { this.#assertValid(); return this.#module.build(); }
  public render(): RenderedLlvmModule { this.#assertValid(); return this.#module.render(); }

  #assertValid(): void {
    if (this.#failure !== undefined) { throw new Error("Native module contains a failed function", { cause: this.#failure }); }
  }
}

function functionSpecOf(spec: NativeFunctionSpec): LlvmFunctionSpec {
  return {
    name: spec.name,
    parameters: spec.parameters.map(({ name, type }) => ({ name, type })),
    returns: spec.returnsCompletion ? completionAggregate : spec.returns
  };
}
