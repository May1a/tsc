import type { ResolvedCallArgument, ResolvedRuntimeArrayElement } from "../binding-resolution/index.js";
import { type LlvmValue, llvm } from "../llvm-ir/index.js";
import { branchValue } from "./expression-branches.js";
import type { ExpressionContext } from "./expression-context.js";
import type { BoxedValue } from "./value-boundary.js";
import { type ValueNode, keep, nullish, property, stringValue, undefinedValue } from "./value-support.js";

interface Arguments {
  readonly count: LlvmValue<typeof llvm.i64>;
  readonly pointer: LlvmValue<typeof llvm.ptr>;
}

export function evaluateArguments(args: readonly ResolvedCallArgument[], context: ExpressionContext): readonly BoxedValue[] {
  return args.map((argument) => keep(context.expressions.argument(argument), context));
}

function fixedArguments(args: readonly ResolvedCallArgument[], context: ExpressionContext): Arguments {
  const values = evaluateArguments(args, context);
  const block = context.cursor.currentBlock();
  const count = block.int(llvm.i64, BigInt(values.length));
  const pointer = block.allocaArray(llvm.i64, count, context.cursor.uniqueName("call.arguments"));
  for (const [index, value] of values.entries()) {
    const slot = block.getElementPtr(llvm.i64, pointer, [{ type: llvm.i64, value: BigInt(index) }], context.cursor.uniqueName("call.argument"));
    block.store(value, slot);
  }
  return { count, pointer };
}

function appendElement(element: ResolvedRuntimeArrayElement, array: LlvmValue<typeof llvm.ptr>, context: ExpressionContext): void {
  switch (element.kind) {
    case "hole": {
      context.runtime.call("arrayPush", [array, undefinedValue(context)], context.cursor.uniqueName("call.hole"));
      return;
    }
    case "value": {
      const value = keep(context.expressions.value(element.value), context);
      context.runtime.call("arrayPush", [array, value], context.cursor.uniqueName("call.push"));
      return;
    }
    case "spread": {
      const source = keep(context.bindings.value(element.arrayName), context);
      const message = stringValue("Call argument is not iterable", context);
      context.runtime.callWithCompletion("iterableAppend", [array, source, message], context.cursor.uniqueName("call.spread"), context.exceptionTarget());
      return;
    }
    case "iterableSpread": {
      const source = keep(context.expressions.value(element.source), context);
      const message = stringValue(element.notIterableMessage, context);
      context.runtime.callWithCompletion("iterableAppend", [array, source, message], context.cursor.uniqueName("call.iterable"), context.exceptionTarget());
      return;
    }
    default: {
      const exhaustive: never = element;
      throw new Error(`Unknown call element ${String(exhaustive)}`);
    }
  }
}

function spreadArguments(elements: readonly ResolvedRuntimeArrayElement[], context: ExpressionContext): Arguments {
  const array = context.runtime.callPointer("arrayNew", [context.cursor.currentBlock().int(llvm.i64, 0n)], context.cursor.uniqueName("call.argument.array"));
  keep(context.values.forBlock(context.cursor.currentBlock()).boxReference("array", array), context);
  for (const element of elements) { appendElement(element, array, context); }
  const count = context.runtime.call("arrayLength", [array], context.cursor.uniqueName("call.argument.count"));
  const block = context.cursor.currentBlock();
  const pointer = block.allocaArray(llvm.i64, count, context.cursor.uniqueName("call.argument.buffer"));
  const positionSlot = block.alloca(llvm.i64, context.cursor.uniqueName("call.position.slot"));
  block.store(block.int(llvm.i64, 0n), positionSlot);
  const header = context.cursor.reserveBlock("call.copy.header");
  const body = context.cursor.reserveBlock("call.copy.body");
  const end = context.cursor.reserveBlock("call.copy.end");
  block.br(header);
  context.cursor.openBlock(header);
  const position = context.cursor.currentBlock().load(llvm.i64, positionSlot, context.cursor.uniqueName("call.position"));
  const inRange = context.cursor.currentBlock().icmp("ult", position, count, context.cursor.uniqueName("call.copy.in.range"));
  context.cursor.currentBlock().condBr(inRange, body, end);
  context.cursor.openBlock(body);
  const value = keep(context.runtime.callBoxed("arrayGet", [array, position], context.cursor.uniqueName("call.argument.value")), context);
  const current = context.cursor.currentBlock();
  const slot = current.getElementPtr(llvm.i64, pointer, [{ type: llvm.i64, value: position }], context.cursor.uniqueName("call.argument.slot"));
  current.store(value, slot);
  current.store(current.add(position, current.int(llvm.i64, 1n), context.cursor.uniqueName("call.position.next")), positionSlot);
  current.br(header);
  context.cursor.openBlock(end);
  return { count, pointer };
}

type CallTarget =
  | { readonly kind: "method"; readonly callee: BoxedValue; readonly receiver: BoxedValue }
  | { readonly kind: "value"; readonly callee: BoxedValue };

function resolveTarget(expression: ValueNode<"callValue">, context: ExpressionContext): CallTarget {
  if (expression.methodReceiver !== undefined && expression.methodKey !== undefined) {
    const receiver = keep(context.expressions.value(expression.methodReceiver), context);
    const key = context.expressions.string(expression.methodKey);
    const callee = keep(property(receiver, key, context), context);
    return { kind: "method", callee, receiver };
  }
  const callee = keep(context.expressions.value(expression.callee), context);
  return { kind: "value", callee };
}

function invoke(expression: ValueNode<"callValue">, target: CallTarget, context: ExpressionContext): BoxedValue {
  const defaultReceiver = () => expression.thisValue === undefined ? undefinedValue(context) : keep(context.expressions.value(expression.thisValue), context);
  const receiver = target.kind === "method" ? target.receiver : defaultReceiver();
  const args = expression.spreadArguments === undefined ? fixedArguments(expression.arguments, context) : spreadArguments(expression.spreadArguments, context);
  return context.runtime.callWithCompletion("jsCall", [target.callee, args.count, args.pointer, receiver],
    context.cursor.uniqueName("call.value"), context.exceptionTarget());
}

export function callValue(expression: ValueNode<"callValue">, context: ExpressionContext): BoxedValue {
  const target = resolveTarget(expression, context);
  if (expression.optionalCallee !== true) { return invoke(expression, target, context); }
  const value = branchValue(context.cursor, nullish(target.callee, context), llvm.i64,
    () => undefinedValue(context), () => invoke(expression, target, context), "call.optional");
  return context.values.forBlock(context.cursor.currentBlock()).fromBoundary(value);
}

export function newInstance(expression: ValueNode<"newInstance">, context: ExpressionContext): BoxedValue {
  const args = evaluateArguments(expression.arguments, context);
  const object = context.runtime.callPointer("objectNew", [context.cursor.currentBlock().int(llvm.i64, BigInt(expression.fieldCount))],
    context.cursor.uniqueName("instance.object"));
  const instance = keep(context.values.forBlock(context.cursor.currentBlock()).boxReference("object", object), context);
  const prototype = keep(context.bindings.value(expression.prototypeName), context);
  const pointer = context.runtime.callPointer("valueObjectPtr", [prototype], context.cursor.uniqueName("instance.prototype"));
  context.runtime.callVoid("objectSetPrototype", [object, pointer]);
  context.calls.generated(expression.constructorName, [instance, ...args]);
  return instance;
}
