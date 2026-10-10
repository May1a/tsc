import type { ResolvedFunctionParameter } from "../binding-resolution/index.js";
import { type LlvmValue, llvm } from "../llvm-ir/index.js";
import { branchValue } from "./expression-branches.js";
import type { NativeFunctionBuilder } from "./function-owner.js";
import type { FunctionPlan } from "./function-plans.js";
import type { OperationContext } from "./operation-context.js";
import type { BoxedValue } from "./value-boundary.js";
import { keep, undefinedValue } from "./value-support.js";

const thisParameterIndex = 3;

function argumentAt(index: number, count: LlvmValue<typeof llvm.i64>, pointer: LlvmValue<typeof llvm.ptr>, context: OperationContext): BoxedValue {
  const position = context.cursor.currentBlock().int(llvm.i64, BigInt(index));
  const present = context.cursor.currentBlock().icmp("ult", position, count, context.cursor.uniqueName("parameter.present"));
  const value = branchValue(context.cursor, present, llvm.i64, () => {
    const block = context.cursor.currentBlock();
    const slot = block.getElementPtr(llvm.i64, pointer, [{ type: llvm.i64, value: position }], context.cursor.uniqueName("parameter.slot"));
    return block.load(llvm.i64, slot, context.cursor.uniqueName("parameter.value"));
  }, () => undefinedValue(context), "parameter");
  return keep(context.values.forBlock(context.cursor.currentBlock()).fromBoundary(value), context);
}

function restArguments(start: number, count: LlvmValue<typeof llvm.i64>, pointer: LlvmValue<typeof llvm.ptr>, context: OperationContext): BoxedValue {
  const { cursor, runtime, values } = context;
  const block = cursor.currentBlock();
  const array = runtime.callPointer("arrayNew", [block.int(llvm.i64, 0n)], cursor.uniqueName("rest.array"));
  const owner = keep(values.forBlock(block).boxReference("array", array), context);
  const indexSlot = block.alloca(llvm.i64, cursor.uniqueName("rest.index.slot"));
  block.store(block.int(llvm.i64, BigInt(start)), indexSlot);
  const header = cursor.reserveBlock("rest.header");
  const body = cursor.reserveBlock("rest.body");
  const end = cursor.reserveBlock("rest.end");
  block.br(header);
  cursor.openBlock(header);
  const index = cursor.currentBlock().load(llvm.i64, indexSlot, cursor.uniqueName("rest.index"));
  cursor.currentBlock().condBr(cursor.currentBlock().icmp("ult", index, count, cursor.uniqueName("rest.present")), body, end);
  cursor.openBlock(body);
  const current = cursor.currentBlock();
  const slot = current.getElementPtr(llvm.i64, pointer, [{ type: llvm.i64, value: index }], cursor.uniqueName("rest.argument.slot"));
  const value = keep(values.forBlock(current).fromBoundary(current.load(llvm.i64, slot, cursor.uniqueName("rest.argument"))), context);
  runtime.call("arrayPush", [array, value], cursor.uniqueName("rest.push"));
  current.store(current.add(index, current.int(llvm.i64, 1n), cursor.uniqueName("rest.next")), indexSlot);
  current.br(header);
  cursor.openBlock(end);
  return owner;
}

function initializeParameter(parameter: ResolvedFunctionParameter, value: BoxedValue, context: OperationContext): void {
  if (parameter.isRest === true || parameter.isOptional === true || parameter.valueKind === "value") {
    context.writes.storeValue(parameter.name, value);
  } else if (parameter.valueKind === "number") {
    context.writes.storeNumber(parameter.name, context.runtime.call("valueToNumber", [value], context.cursor.uniqueName("parameter.number")));
  } else {
    context.writes.storeString(parameter.name, context.runtime.callString("valueToString", [value], context.cursor.uniqueName("parameter.string")));
  }
}

export function initializeParameters(plan: FunctionPlan, fn: NativeFunctionBuilder, context: OperationContext): void {
  const count = fn.parameter(0, llvm.i64);
  const pointer = fn.parameter(1, llvm.ptr);
  for (const [index, parameter] of plan.parameters.entries()) {
    const input = parameter.isRest === true ? restArguments(index, count, pointer, context) : argumentAt(index, count, pointer, context);
    const value = parameter.defaultValue === undefined ? input : branchValue(context.cursor,
      context.values.forBlock(context.cursor.currentBlock()).isImmediate(input, "undefined"), llvm.i64,
      () => {
        if (parameter.defaultValue === undefined) { throw new Error("Default parameter lost its initializer"); }
        const number = context.expressions.number(parameter.defaultValue);
        return context.values.forBlock(context.cursor.currentBlock()).boxNumber(number);
      }, () => input, "parameter.default");
    initializeParameter(parameter, value, context);
  }
  if (plan.thisBinding !== undefined) { context.writes.storeValue(plan.thisBinding, fn.boxedParameter(thisParameterIndex)); }
}
