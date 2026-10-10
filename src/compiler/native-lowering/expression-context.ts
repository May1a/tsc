import type {
  BindingRef, ResolvedCallArgument, ResolvedCondition, ResolvedExpression, ResolvedNumberExpression,
  ResolvedStringExpression, ResolvedValueExpression
} from "../binding-resolution/index.js";
import type { LlvmGlobalReference, LlvmValue, llvm } from "../llvm-ir/index.js";
import type { FunctionCapabilities } from "./function-owner.js";
import type { BlockCursor } from "./cursor.js";
import type { RootCapability } from "./gc.js";
import type { ExceptionTarget, RuntimeCallCapability, RuntimeString } from "./runtime-calls.js";
import type { BoxedValue, ValueBoundary } from "./value-boundary.js";

export type NativeString = RuntimeString;

export interface BindingReads {
  number(reference: BindingRef): LlvmValue<typeof llvm.double>;
  string(reference: BindingRef): NativeString;
  boolean(reference: BindingRef): LlvmValue<typeof llvm.i1>;
  value(reference: BindingRef): BoxedValue;
  pointer(reference: BindingRef): LlvmValue<typeof llvm.ptr>;
  fixedArrayLength(reference: BindingRef): number | undefined;
  arrayElement(reference: BindingRef, index: LlvmValue<typeof llvm.i64>): LlvmValue<typeof llvm.ptr>;
  objectField(reference: BindingRef, path: readonly string[]): LlvmValue<typeof llvm.ptr>;
  storeNumber(reference: BindingRef, value: LlvmValue<typeof llvm.double>): void;
}

export interface ExpressionEntries {
  number(expression: ResolvedNumberExpression): LlvmValue<typeof llvm.double>;
  string(expression: ResolvedStringExpression): NativeString;
  condition(expression: ResolvedCondition): LlvmValue<typeof llvm.i1>;
  value(expression: ResolvedValueExpression): BoxedValue;
  expression(expression: ResolvedExpression): BoxedValue;
  argument(argument: ResolvedCallArgument): BoxedValue;
}

export type DirectCall = Extract<ResolvedNumberExpression | ResolvedStringExpression | ResolvedValueExpression, { readonly kind: "call" }>;

export interface ExpressionCalls {
  direct(expression: DirectCall): BoxedValue;
  generated(target: BindingRef, args: readonly BoxedValue[]): BoxedValue;
  inlineCpp(symbol: string): BoxedValue;
  functionObject(expression: Extract<ResolvedValueExpression, { readonly kind: "functionObject" }>): BoxedValue;
  tagged(expression: Extract<ResolvedStringExpression | ResolvedValueExpression, { readonly kind: "taggedTemplate" | "taggedTemplateValue" }>): BoxedValue;
}

export interface OptionalTarget {
  current(): BoxedValue;
  withTarget<A>(target: BoxedValue, build: () => A): A;
}

class OptionalTargetOwner implements OptionalTarget {
  readonly #targets: BoxedValue[] = [];

  public current(): BoxedValue {
    const target = this.#targets.at(-1);
    if (target === undefined) { throw new Error("Optional chain has no active target"); }
    return target;
  }

  public withTarget<A>(target: BoxedValue, build: () => A): A {
    this.#targets.push(target);
    try { return build(); } finally { this.#targets.pop(); }
  }
}

export interface ExpressionContext {
  readonly cursor: BlockCursor;
  readonly runtime: RuntimeCallCapability;
  readonly roots: RootCapability;
  readonly values: ValueBoundary;
  readonly bindings: BindingReads;
  readonly expressions: ExpressionEntries;
  readonly calls: ExpressionCalls;
  readonly optional: OptionalTarget;
  stringConstant(text: string): LlvmGlobalReference;
  exceptionTarget(): ExceptionTarget;
}

export interface ExpressionHandlers {
  number(expression: ResolvedNumberExpression, context: ExpressionContext): LlvmValue<typeof llvm.double>;
  string(expression: ResolvedStringExpression, context: ExpressionContext): NativeString;
  condition(expression: ResolvedCondition, context: ExpressionContext): LlvmValue<typeof llvm.i1>;
  value(expression: ResolvedValueExpression, context: ExpressionContext): BoxedValue;
}

export interface ExpressionContextOptions<Calls extends ExpressionCalls = ExpressionCalls> {
  readonly capabilities: FunctionCapabilities;
  readonly bindings: BindingReads;
  readonly calls: Calls | ((context: ExpressionContext) => Calls);
  readonly stringConstant: ExpressionContext["stringConstant"];
  readonly exceptionTarget: ExpressionContext["exceptionTarget"];
  readonly handlers: ExpressionHandlers;
}

class ExpressionOwner<Calls extends ExpressionCalls> implements ExpressionContext {
  public readonly cursor: BlockCursor;
  public readonly runtime: RuntimeCallCapability;
  public readonly roots: RootCapability;
  public readonly values: ValueBoundary;
  public readonly bindings: BindingReads;
  public readonly calls: Calls;
  public readonly optional: OptionalTarget = new OptionalTargetOwner();
  public readonly expressions: ExpressionEntries;
  public readonly stringConstant: ExpressionContext["stringConstant"];
  public readonly exceptionTarget: ExpressionContext["exceptionTarget"];

  public constructor(options: ExpressionContextOptions<Calls>) {
    this.cursor = options.capabilities.cursor;
    this.runtime = options.capabilities.runtime;
    this.roots = options.capabilities.roots;
    this.values = options.capabilities.values;
    this.bindings = options.bindings;
    this.stringConstant = options.stringConstant;
    this.exceptionTarget = options.exceptionTarget;
    this.expressions = Object.freeze({
      number: (expression: ResolvedNumberExpression) => options.handlers.number(expression, this),
      string: (expression: ResolvedStringExpression) => options.handlers.string(expression, this),
      condition: (expression: ResolvedCondition) => options.handlers.condition(expression, this),
      value: (expression: ResolvedValueExpression) => options.handlers.value(expression, this),
      expression: (expression: ResolvedExpression) => lowerGeneralExpression(expression, this),
      argument: (argument: ResolvedCallArgument) => lowerArgument(argument, this)
    });
    this.calls = typeof options.calls === "function" ? options.calls(this) : options.calls;
    Object.freeze(this);
  }
}

export function createExpressionContext<Calls extends ExpressionCalls>(options: ExpressionContextOptions<Calls>): ExpressionContext & { readonly calls: Calls } {
  return new ExpressionOwner(options);
}

function boxBoolean(value: LlvmValue<typeof llvm.i1>, context: ExpressionContext): BoxedValue {
  const block = context.cursor.currentBlock();
  const boundary = context.values.forBlock(block);
  return block.select(value, boundary.immediate("true"), boundary.immediate("false"), context.cursor.uniqueName("boolean.value"));
}

function boxString(value: NativeString, context: ExpressionContext): BoxedValue {
  const boxed = context.runtime.callBoxed("valueCopyString", [value.bytes, value.length], context.cursor.uniqueName("string.value"));
  context.roots.push(boxed);
  return boxed;
}

function lowerGeneralExpression(expression: ResolvedExpression, context: ExpressionContext): BoxedValue {
  switch (expression.kind) {
    case "number": {
      const number = context.expressions.number(expression.value);
      return context.values.forBlock(context.cursor.currentBlock()).boxNumber(number);
    }
    case "boolean": { return context.values.forBlock(context.cursor.currentBlock()).immediate(expression.value ? "true" : "false"); }
    case "string": { return boxString(context.expressions.string({ kind: "literal", value: expression.value }), context); }
    case "stringExpression": { return boxString(context.expressions.string(expression.value), context); }
    case "identifier": { return context.bindings.value(expression.name); }
    case "call": { return context.calls.direct(expression); }
    case "value": { return context.expressions.value(expression.value); }
    default: {
      const exhaustive: never = expression;
      throw new Error(`Unknown expression ${String(exhaustive)}`);
    }
  }
}

function lowerArgument(argument: ResolvedCallArgument, context: ExpressionContext): BoxedValue {
  switch (argument.valueKind) {
    case "number": {
      const number = context.expressions.number(argument.value);
      return context.values.forBlock(context.cursor.currentBlock()).boxNumber(number);
    }
    case "string": { return boxString(context.expressions.string(argument.value), context); }
    case "value": { return context.expressions.value(argument.value); }
    case "undefined": { return context.values.forBlock(context.cursor.currentBlock()).immediate("undefined"); }
    default: {
      const exhaustive: never = argument;
      throw new Error(`Unknown argument ${String(exhaustive)}`);
    }
  }
}

export { boxBoolean, boxString };
