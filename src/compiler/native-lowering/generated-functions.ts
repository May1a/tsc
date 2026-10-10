import type { BindingId, BindingRef, FunctionId, ResolvedClosureValue, ResolvedModule } from "../binding-resolution/index.js";
import { type LlvmFunctionSpec, type LlvmGlobalReference, llvm } from "../llvm-ir/index.js";
import type { BindingAccess } from "./binding-access.js";
import { branchValue } from "./expression-branches.js";
import type { DirectCall, ExpressionContext } from "./expression-context.js";
import { invokeFunction } from "./function-calls.js";
import type { NativeFunctionBuilder, NativeFunctionSpec } from "./function-owner.js";
import { type CaptureSource, type FunctionPlan, collectFunctionPlans } from "./function-plans.js";
import { initializeParameters } from "./function-parameters.js";
import type { ModuleBindings } from "./module-bindings.js";
import type { NativeModule } from "./module-owner.js";
import type { OperationCalls, OperationContext } from "./operation-context.js";
import type { BoxedValue } from "./value-boundary.js";
import { keep, stringValue, undefinedValue } from "./value-support.js";

interface DeclaredPlan {
  readonly plan: FunctionPlan;
  readonly spec: LlvmFunctionSpec;
  readonly singleton?: LlvmGlobalReference;
}

export type GeneratedBodyRunner = (fn: NativeFunctionBuilder, plan: FunctionPlan, initialize: (context: OperationContext) => void) => void;

export class GeneratedFunctions {
  readonly #module: NativeModule;
  readonly #resolved: ResolvedModule;
  readonly #plans = new Map<FunctionId, DeclaredPlan>();
  readonly #bindings = new Map<BindingId, DeclaredPlan>();
  readonly #cpp = new Map<string, LlvmFunctionSpec & { readonly returns: typeof llvm.i64 }>();
  readonly #templates = new WeakMap<object, LlvmGlobalReference>();
  #templateCount = 0;

  public constructor(module: NativeModule, resolved: ResolvedModule, _bindings: ModuleBindings) {
    this.#module = module;
    this.#resolved = resolved;
    for (const plan of collectFunctionPlans(resolved)) {
      const spec = module.declareFunction(nativeSpec(plan));
      const declaration = plan.binding === undefined ? undefined : resolved.bindings.declarations.at(plan.binding.binding.ordinal);
      const singleton = declaration?.owner.kind === "module" ? this.#slot(`tscn.function.singleton.${plan.symbol}`) : undefined;
      const declared = { plan, spec, singleton };
      this.#plans.set(plan.functionId, declared);
      if (plan.binding !== undefined) { this.#bindings.set(plan.binding.binding, declared); }
    }
    for (const block of resolved.inlineCppBlocks) {
      const spec = { name: block.symbol, parameters: [], returns: llvm.i64 };
      const owned = module.declareFunction({ ...spec, returnsCompletion: false });
      this.#cpp.set(block.symbol, owned);
    }
  }

  public defineAll(run: GeneratedBodyRunner): void {
    for (const { plan } of this.#plans.values()) {
      this.#module.defineFunction(nativeSpec(plan), (fn) => run(fn, plan, (context) => {
        initializeParameters(plan, fn, context);
        this.initializeScope(context, plan.functionId);

      }));
    }
  }

  public initializeScope(context: OperationContext, owner: FunctionId | "module"): void {
    for (const declared of this.#bindings.values()) {
      const reference = declared.plan.binding;
      if (reference === undefined) { continue; }
      const declaration = this.#resolved.bindings.declarations.at(reference.binding.ordinal);
      if (declaration?.id !== reference.binding) { throw new Error("Hoisted function binding belongs to another resolution"); }
      const matches = owner === "module" ? declaration.owner.kind === "module"
        : declaration.owner.kind === "function" && declaration.owner.function === owner;
      if (matches) { context.writes.storeValue(reference, this.#materialize(declared, context, context.writes)); }
    }
  }

  public calls(context: ExpressionContext, writes: BindingAccess): OperationCalls {
    return Object.freeze<OperationCalls>({
      direct: (expression) => {
        const callee = keep(this.#reference(expression.name, context, writes), context);
        return invokeFunction(callee, this.#directArguments(expression, context), context);
      },
      generated: (target, args) => invokeFunction(this.#reference(target, context, writes), args, context),
      inlineCpp: (symbol) => {
        const spec = this.#cpp.get(symbol);
        if (spec === undefined) { throw new Error(`Inline C++ symbol ${symbol} was not declared`); }
        const value = context.cursor.currentBlock().call<typeof llvm.i64, typeof spec>(spec, [], context.cursor.uniqueName("cpp.result"));
        return keep(context.values.forBlock(context.cursor.currentBlock()).fromBoundary(value), context);
      },
      reference: (target) => this.#reference(target, context, writes),
      closure: (value) => this.#closure(value, context, writes),
      callback: (operation) => this.#materialize(this.#require(operation.functionId), context, writes),
      returnedClosure: (operation) => this.#materialize(this.#require(operation.functionId), context, writes),
      functionObject: (expression) => expression.definition.directTarget === undefined
        ? this.#materialize(this.#require(expression.definition.functionId), context, writes)
        : this.#reference(expression.definition.directTarget, context, writes),
      tagged: (expression) => {
        const callee = keep(this.#reference(expression.tag, context, writes), context);
        const template = this.#template(expression, context);
        const interpolations = expression.expressions.map((value) => keep(context.expressions.value(value), context));
        return invokeFunction(callee, [template, ...interpolations], context);
      }
    });
  }

  #directArguments(expression: DirectCall, context: ExpressionContext): readonly BoxedValue[] {
    return expression.arguments.map((argument) => {
      if ("valueKind" in argument) { return keep(context.expressions.argument(argument), context); }
      const number = context.expressions.number(argument);
      return keep(context.values.forBlock(context.cursor.currentBlock()).boxNumber(number), context);
    });
  }

  #reference(target: BindingRef, context: ExpressionContext, writes: BindingAccess): BoxedValue {
    return keep(writes.value(target), context);
  }

  #require(identity: FunctionId | undefined): DeclaredPlan {
    if (identity === undefined) { throw new Error("Generated function has no resolved identity"); }
    const plan = this.#plans.get(identity);
    if (plan === undefined) { throw new Error(`Generated function ${identity.ordinal} has no declaration`); }
    return plan;
  }

  #materialize(declared: DeclaredPlan, context: ExpressionContext, writes: BindingAccess): BoxedValue {
    if (declared.singleton === undefined) { return this.#newFunction(declared, context, writes); }
    return this.#cached(declared.singleton, context, () => this.#newFunction(declared, context, writes));
  }

  #cached(global: LlvmGlobalReference, context: ExpressionContext, build: () => BoxedValue): BoxedValue {
    const block = context.cursor.currentBlock();
    const slot = block.globalPointer(global);
    context.runtime.callVoid("gcRegisterGlobalRoot", [slot]);
    const prior = block.load(llvm.i64, slot, context.cursor.uniqueName("singleton.previous"));
    const initialized = block.icmp("ne", prior, block.int(llvm.i64, 0n), context.cursor.uniqueName("singleton.initialized"));
    const result = branchValue(context.cursor, initialized, llvm.i64, () => prior, () => {
      const value = build();
      context.cursor.currentBlock().store(value, slot);
      return value;
    }, "singleton");
    return keep(context.values.forBlock(context.cursor.currentBlock()).fromBoundary(result), context);
  }

  #newFunction(declared: DeclaredPlan, context: ExpressionContext, writes: BindingAccess, sources: readonly CaptureSource[] = declared.plan.sources): BoxedValue {
    const { cursor, runtime, values } = context;
    const captures = sources;
    const block = cursor.currentBlock();
    const environment = captures.length === 0 ? block.nullPtr()
      : runtime.callPointer("environmentNew", [block.int(llvm.i64, BigInt(captures.length))], cursor.uniqueName("closure.environment"));
    if (captures.length > 0) {
      keep(values.forBlock(block).boxReference("object", environment), context);
      for (const [index, source] of captures.entries()) {
        const value = this.#captureCell(source, context, writes);
        runtime.callVoid("environmentSet", [environment, cursor.currentBlock().int(llvm.i64, BigInt(index)), value]);
      }
    }
    const name = keep(stringValue(declared.plan.name, context), context);
    const code = cursor.currentBlock().functionPointer(declared.spec);
    const length = declared.plan.parameters.findIndex((parameter) => parameter.isRest === true || parameter.defaultValue !== undefined);
    const functionLength = length === -1 ? declared.plan.parameters.length : length;
    return keep(runtime.callBoxed("functionObjectNew", [code, environment, undefinedValue(context), name,
      cursor.currentBlock().int(llvm.i64, BigInt(functionLength))], cursor.uniqueName("function.object")), context);
  }

  #captureCell(source: CaptureSource, context: ExpressionContext, writes: BindingAccess): BoxedValue {
    if (source.kind === "binding") { return keep(writes.captureCell(source.reference), context); }
    const { cursor, runtime, values } = context;
    const cell = runtime.callPointer("environmentNew", [cursor.currentBlock().int(llvm.i64, 1n)], cursor.uniqueName("capture.cell"));
    const owner = keep(values.forBlock(cursor.currentBlock()).boxReference("object", cell), context);
    const value = keep(context.expressions.value(source.value), context);
    runtime.callVoid("environmentSet", [cell, cursor.currentBlock().int(llvm.i64, 0n), value]);
    return owner;
  }

  #closure(value: ResolvedClosureValue, context: ExpressionContext, writes: BindingAccess): BoxedValue {
    const declared = this.#require(value.functionId);
    const sources = value.captures.map((number): CaptureSource => ({ kind: "value", value: { kind: "number", value: number } }));
    if (sources.length !== declared.plan.captures.length) { throw new Error("Closure values do not match the resolved capture slots"); }
    return this.#newFunction(declared, context, writes, sources);
  }

  #template(expression: Parameters<OperationCalls["tagged"]>[0], context: ExpressionContext): BoxedValue {
    const known = this.#templates.get(expression);
    const global = known ?? this.#slot(`tscn.template.${this.#templateCount}`);
    if (known === undefined) { this.#templates.set(expression, global); this.#templateCount += 1; }
    return this.#cached(global, context, () => {
      const pieces = [expression.head, ...expression.middleTexts];
      const pointer = context.runtime.callPointer("arrayNew", [context.cursor.currentBlock().int(llvm.i64, BigInt(pieces.length))],
        context.cursor.uniqueName("template.array"));
      const owner = keep(context.values.forBlock(context.cursor.currentBlock()).boxReference("array", pointer), context);
      for (const [index, text] of pieces.entries()) {
        const value = keep(stringValue(text, context), context);
        context.runtime.callVoid("arraySet", [pointer, context.cursor.currentBlock().int(llvm.i64, BigInt(index)), value]);
      }
      return owner;
    });
  }

  #slot(name: string): LlvmGlobalReference {
    return this.#module.defineGlobal({ name, type: llvm.i64, linkage: "internal", constant: false, unnamedAddress: false,
      initializer: { kind: "zeroInitializer", type: llvm.i64 } });
  }
}

function nativeSpec(plan: FunctionPlan): NativeFunctionSpec & { readonly returnsCompletion: true } {
  return { name: plan.symbol, returnsCompletion: true, parameters: [
    { name: "argc", type: llvm.i64 }, { name: "argv", type: llvm.ptr }, { name: "env", type: llvm.ptr },
    { name: "this", type: llvm.i64, representation: "boxed", protection: "borrowed" }
  ] };
}
