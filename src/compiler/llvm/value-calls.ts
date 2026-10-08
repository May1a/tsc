import { emitGeneratedJsCall, emitRootStackPush } from "./completion.js";
import type { EmitContext, JsValue } from "./context.js";
import type { JsIrValueExpression } from "../ir/expressions.js";
import { emitNamedValueBinding } from "./conditions.js";
import { errorClassIds } from "./error-ids.js";
import { emitRuntimeArrayPointer } from "./layout.js";
import { emitArrayIndex } from "./numbers.js";
import { addStringConstant, utf8ByteLength } from "./strings.js";
import { jsValueNull, jsValueUndefined } from "./values.js";

/**
 * The value tier's non-primitive cases: calls, `new`, private fields, and array identity.
 *
 * Each of these has to decide what happens when the thing it wants is not there. `emitDispatchedCall`
 * emits a property load and branches on whether the result is callable, because a *method* call in this
 * language is a property load followed by a call and the receiver may be anything. `new` has the same
 * problem against a constructor. A private field is the opposite: the shape is known, so a brand check
 * that fails is a real error and throws.
 *
 * `emitRuntimeArrayValueExpression` is the array's value-tier identity — the pointer, not the contents
 * — and `emitIterableAppend` is the `for...of` fast path that reads through one. They are here because
 * both answer "what is this array" rather than "what is in it", which is the value tier's question and
 * not the array tier's.
 */

// Consume a synchronous iterable into an existing runtime array. Iterator
// acquisition and next() use the explicit exception ABI; normal exhaustion is
// the only successful exit and therefore never invokes return().
// eslint-disable-next-line max-statements -- Protocol consumption is a compact emitted state machine.
export function emitIterableAppend(
  sourceExpression: JsIrValueExpression,
  notIterableMessageText: string,
  destination: string,
  prefix: string,
  context: EmitContext
): string[] {
  const index = context.arrayIndex;
  context.arrayIndex += 1;
  const source = context.emitValue(sourceExpression);
  const messageConstant = addStringConstant(notIterableMessageText, context);
  const message = `%spread.message.${index}`;
  const iteratorCall = emitGeneratedJsCall("getIteratorValue", [`i64 ${source.value}`, `i64 ${message}`], context);
  const iteratorSlot = `%spread.iter.${index}.addr`;
  const condLabel = `spread.cond.${index}`;
  const bodyLabel = `spread.body.${index}`;
  const valueLabel = `spread.value.${index}`;
  const endLabel = `spread.end.${index}`;
  const normalLabel = `spread.normal.${index}`;
  const iterator = `%spread.iter.${index}`;
  const nextCall = emitGeneratedJsCall("callIteratorNext", [`i64 ${iterator}`], context);
  const doneKey = addStringConstant("done", context);
  const valueKey = addStringConstant("value", context);
  const doneValue = `%spread.done.value.${index}`;
  const done = `%spread.done.${index}`;
  const value = `%spread.item.${index}`;
  const destinationValue = `%spread.destination.${index}`;
  return [
    ...source.lines,
    `  call void @gcRootPush(i64 ${source.value})`,
    `  ${message} = call i64 @valueBoxString(ptr ${messageConstant}, i64 ${utf8ByteLength(notIterableMessageText)})`,
    ...iteratorCall.lines,
    `  ${iteratorSlot} = alloca i64`,
    `  store i64 ${iteratorCall.value}, ptr ${iteratorSlot}`,
    `  call void @gcRootPush(i64 ${iteratorCall.value})`,
    `  ${destinationValue} = call i64 @valueBoxArray(ptr ${destination})`,
    `  call void @gcRootPush(i64 ${destinationValue})`,
    `  br label %${condLabel}`,
    `${condLabel}:`,
    `  br label %${bodyLabel}`,
    `${bodyLabel}:`,
    `  ${iterator} = load i64, ptr ${iteratorSlot}`,
    ...nextCall.lines,
    `  ${doneValue} = call i64 @valuePropertyGet(i64 ${nextCall.value}, i64 4, ptr ${doneKey})`,
    `  ${done} = call i1 @valueTruthy(i64 ${doneValue})`,
    `  br i1 ${done}, label %${normalLabel}, label %${valueLabel}`,
    `${valueLabel}:`,
    `  ${value} = call i64 @valuePropertyGet(i64 ${nextCall.value}, i64 5, ptr ${valueKey})`,
    `  call void @gcRootPush(i64 ${value})`,
    `  call i64 @arrayPush(ptr ${destination}, i64 ${value})`,
    `  call void @gcSafepoint()`,
    `  br label %${condLabel}`,
    `${normalLabel}:`,
    `  br label %${endLabel}`,
    `${endLabel}:`,
    `  ; completed iterable spread ${prefix}`
  ];
}
// Emits the TypeError throw shared by private field reads and writes: builds a
// native TypeError object with the given literal message and routes it to the
// nearest exception handler, exactly like a `throwValue` operation.
export function emitPrivateFieldBrandThrow(message: string, labelPrefix: string, context: EmitContext): string[] {
  const messageConstant = addStringConstant(message, context);
  const nameConstant = addStringConstant("TypeError", context);
  const messageValue = `%${labelPrefix}.msg`;
  const errorObject = `%${labelPrefix}.err`;
  const errorBoxed = `%${labelPrefix}.boxed`;
  return [
    `  ${messageValue} = call i64 @valueBoxString(ptr ${messageConstant}, i64 ${utf8ByteLength(message)})`,
    `  ${errorObject} = call ptr @errorNew(i64 ${errorClassIds.get("TypeError") ?? 0}, i64 9, ptr ${nameConstant}, i64 ${messageValue})`,
    `  ${errorBoxed} = call i64 @valueBoxObject(ptr ${errorObject})`,
    emitRootStackPush(errorBoxed, context),
    `  store i64 ${errorBoxed}, ptr ${context.exceptionSlot}`,
    `  br label %${context.exceptionTarget}`
  ];
}
export function emitNewInstanceValueExpression(
  expression: Extract<JsIrValueExpression, { readonly kind: "newInstance" }>,
  context: EmitContext
): JsValue {
  const args = context.emitCallArguments(expression.arguments);
  const index = context.objectIndex;
  context.objectIndex += 1;
  const object = `%instance.obj.${index}`;
  const instance = `%instance.${index}`;
  const prototypePointer = `%instance.prototype.${index}`;
  const prototypeLines: string[] = [];
  if (context.bindings.has(expression.prototypeName)) {
    const prototype = emitNamedValueBinding(expression.prototypeName, context);
    prototypeLines.push(
      ...prototype.lines,
      `  ${prototypePointer} = call ptr @valueObjectPtr(i64 ${prototype.value})`,
      `  call void @objectSetPrototype(ptr ${object}, ptr ${prototypePointer})`
    );
  }
  const constructorArgs = [`i64 ${instance}`, ...args.values];
  const constructorCall = emitGeneratedJsCall(expression.constructorName, constructorArgs, context);
  return {
    lines: [
      ...args.lines,
      `  ${object} = call ptr @objectNew(i64 ${expression.fieldCount})`,
      ...prototypeLines,
      `  ${instance} = call i64 @valueBoxObject(ptr ${object})`,
      // Pin the new instance for the constructor call AND keep it pinned afterwards
      // (released by the enclosing frame/iteration restore) so a later allocation in
      // the consuming function cannot collect the freshly-built object.
      emitRootStackPush(instance, context),
      ...constructorCall.lines
    ],
    value: instance
  };
}
// eslint-disable-next-line max-statements -- Dynamic calls materialize fixed and iterable spread arguments into one argv state machine.
export function emitValueCallExpression(
  expression: Extract<JsIrValueExpression, { readonly kind: "callValue" }>,
  context: EmitContext
): JsValue {
  let callee = context.emitValue(expression.callee);
  const args = context.emitCallArguments(expression.arguments);
  let thisValue: JsValue = { lines: [], value: jsValueUndefined };
  if (expression.methodReceiver !== undefined && expression.methodKey !== undefined) {
    const receiver = context.emitValue(expression.methodReceiver);
    const key = context.emitStringExpression(expression.methodKey);
    const value = `%call.method.${context.callIndex}`;
    callee = {
      lines: [
        ...receiver.lines,
        `  call void @gcRootPush(i64 ${receiver.value})`,
        ...key.lines,
        `  ${value} = call i64 @valuePropertyGet(i64 ${receiver.value}, i64 ${key.length}, ptr ${key.value})`
      ],
      value
    };
    thisValue = { lines: [], value: receiver.value };
  } else if (expression.thisValue !== undefined) {
    thisValue = context.emitValue(expression.thisValue);
  }
  if (expression.spreadArguments !== undefined) {
    const index = context.callIndex;
    context.callIndex += 1;
    const argumentArray = `%call.spread.array.${index}`;
    const boxedArguments = `%call.spread.boxed.${index}`;
    const body = [
      `  call void @gcRootPush(i64 ${callee.value})`,
      ...thisValue.lines,
      `  call void @gcRootPush(i64 ${thisValue.value})`,
      `  ${argumentArray} = call ptr @arrayNew(i64 0)`,
      `  ${boxedArguments} = call i64 @valueBoxArray(ptr ${argumentArray})`,
      `  call void @gcRootPush(i64 ${boxedArguments})`
    ];
    const lines = body;
    for (let argumentIndex = 0; argumentIndex < expression.spreadArguments.length; argumentIndex += 1) {
      const argument = expression.spreadArguments[argumentIndex];
      // The loop bound guarantees this index; the guard keeps the argument non-optional so the
      // `kind` narrowing below stays total.
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- live once noUncheckedIndexedAccess is enabled
      if (argument === undefined) {
        throw new Error(`Call spread argument ${argumentIndex} is missing`);
      }
      if (argument.kind === "value") {
        const value = context.emitValue(argument.value);
        lines.push(...value.lines, `  call void @gcRootPush(i64 ${value.value})`, `  call i64 @arrayPush(ptr ${argumentArray}, i64 ${value.value})`);
      } else if (argument.kind === "iterableSpread") {
        lines.push(...emitIterableAppend(argument.source, argument.notIterableMessage, argumentArray, `call.${index}.${argumentIndex}`, context));
      } else if (argument.kind === "spread") {
        if (argument.sourceKind === "fixed") {
          const binding = context.bindings.get(argument.arrayName);
          if (binding?.kind !== "array") {
            throw new Error("Expected fixed call-spread array binding");
          }
          for (let spreadIndex = 0; spreadIndex < binding.length; spreadIndex += 1) {
            const value = context.emitValue({
              kind: "number",
              value: { kind: "arrayAccess", arrayName: argument.arrayName, index: { kind: "literal", value: spreadIndex } }
            });
            lines.push(...value.lines, `  call i64 @arrayPush(ptr ${argumentArray}, i64 ${value.value})`);
          }
          continue;
        }
        const source = emitRuntimeArrayPointer(argument.arrayName, context);
        const boxed = `%call.spread.source.${index}.${argumentIndex}`;
        lines.push(
          ...source.lines,
          `  ${boxed} = call i64 @valueBoxArray(ptr ${source.value})`,
          ...emitIterableAppend({ kind: "arrayRef", name: argument.arrayName }, `${argument.arrayName} is not iterable`, argumentArray, `call.${index}.${argumentIndex}`, context)
        );
      } else {
        lines.push(`  call i64 @arrayPush(ptr ${argumentArray}, i64 ${jsValueUndefined})`);
      }
    }
    const argc = `%call.spread.argc.${index}`;
    const argv = `%call.spread.argv.${index}`;
    const positionSlot = `%call.spread.position.${index}.addr`;
    const condLabel = `call.spread.copy.cond.${index}`;
    const bodyLabel = `call.spread.copy.body.${index}`;
    const endLabel = `call.spread.copy.end.${index}`;
    const position = `%call.spread.position.${index}`;
    const inRange = `%call.spread.in.range.${index}`;
    const value = `%call.spread.value.${index}`;
    const slot = `%call.spread.slot.${index}`;
    const next = `%call.spread.next.${index}`;
    lines.push(
      `  ${argc} = call i64 @arrayLength(ptr ${argumentArray})`,
      `  ${argv} = alloca i64, i64 ${argc}`,
      `  ${positionSlot} = alloca i64`,
      `  store i64 0, ptr ${positionSlot}`,
      `  br label %${condLabel}`,
      `${condLabel}:`,
      `  ${position} = load i64, ptr ${positionSlot}`,
      `  ${inRange} = icmp ult i64 ${position}, ${argc}`,
      `  br i1 ${inRange}, label %${bodyLabel}, label %${endLabel}`,
      `${bodyLabel}:`,
      `  ${value} = call i64 @arrayGet(ptr ${argumentArray}, i64 ${position})`,
      `  ${slot} = getelementptr i64, ptr ${argv}, i64 ${position}`,
      `  store i64 ${value}, ptr ${slot}`,
      `  ${next} = add i64 ${position}, 1`,
      `  store i64 ${next}, ptr ${positionSlot}`,
      `  br label %${condLabel}`,
      `${endLabel}:`
    );
    const generated = emitGeneratedJsCall(
      "jsCall",
      [`i64 ${callee.value}`, `i64 ${argc}`, `ptr ${argv}`, `i64 ${thisValue.value}`],
      context
    );
    lines.push(...generated.lines);
    return emitDispatchedCall(callee.lines, callee.value, lines, generated.value, expression, context);
  }
  const index = context.callIndex;
  context.callIndex += 1;
  const argv = `%call.value.argv.${index}`;
  const lines = [`  call void @gcRootPush(i64 ${callee.value})`, ...thisValue.lines, `  call void @gcRootPush(i64 ${thisValue.value})`, ...args.lines, `  ${argv} = alloca i64, i64 ${args.values.length}`];
  for (let argumentIndex = 0; argumentIndex < args.values.length; argumentIndex += 1) {
    const value = args.values[argumentIndex].replace(/^i64 /, "");
    const slot = `%call.value.argv.${index}.${argumentIndex}`;
    lines.push(`  call void @gcRootPush(i64 ${value})`, `  ${slot} = getelementptr i64, ptr ${argv}, i64 ${argumentIndex}`, `  store i64 ${value}, ptr ${slot}`);
  }
  const generated = emitGeneratedJsCall(
    "jsCall",
    [`i64 ${callee.value}`, `i64 ${args.values.length}`, `ptr ${argv}`, `i64 ${thisValue.value}`],
    context
  );
  lines.push(...generated.lines);
  return emitDispatchedCall(callee.lines, callee.value, lines, generated.value, expression, context);
}
// Joins the unconditional callee prologue to the argv-building dispatch. ECMAScript's optional
// call `callee?.(...)` still evaluates the callee, so the nullish test sits between the two: a
// nullish callee yields `undefined` without building an argv or reaching `jsCall`, which
// otherwise dereferenced the null pointer behind a non-function value.
export function emitDispatchedCall(
  prologue: readonly string[],
  callee: string,
  body: readonly string[],
  result: string,
  expression: { readonly optionalCallee?: true },
  context: EmitContext
): JsValue {
  if (expression.optionalCallee !== true) {
    return { lines: [...prologue, ...body], value: result };
  }
  const index = context.logicIndex;
  context.logicIndex += 1;
  const testLabel = `optional.call.test.${index}`;
  const bodyLabel = `optional.call.body.${index}`;
  const skipLabel = `optional.call.skip.${index}`;
  const joinLabel = `optional.call.join.${index}`;
  const endLabel = `optional.call.end.${index}`;
  const nullish = emitNullishTest(callee, context);
  const value = `%value.${context.numIndex}`;
  context.numIndex += 1;
  return {
    lines: [
      ...prologue,
      `  br label %${testLabel}`,
      `${testLabel}:`,
      ...nullish.lines,
      `  br i1 ${nullish.value}, label %${skipLabel}, label %${bodyLabel}`,
      `${bodyLabel}:`,
      ...body,
      `  br label %${joinLabel}`,
      `${joinLabel}:`,
      `  br label %${endLabel}`,
      `${skipLabel}:`,
      `  br label %${endLabel}`,
      `${endLabel}:`,
      `  ${value} = phi i64 [ ${jsValueUndefined}, %${skipLabel} ], [ ${result}, %${joinLabel} ]`
    ],
    value
  };
}
export function emitRuntimeArrayValueExpression(
  expression: Extract<JsIrValueExpression, { readonly kind: "arrayAccess" }>,
  context: EmitContext
): JsValue {
  const array = emitRuntimeArrayPointer(expression.arrayName, context);
  const index = emitArrayIndex(expression.index, context);
  const valueIndex = context.numIndex;
  context.numIndex += 1;
  const value = `%value.${valueIndex}`;
  if (expression.key !== undefined) {
    const key = context.emitStringExpression(expression.key);
    // Non-index keys (e.g. Symbol.iterator sentinel) use valuePropertyGet so
    // built-in iterator method thunks resolve. Numeric indices keep arrayGetWithKey.
    const isNonIndexKey = expression.index.kind === "literal" && expression.index.value < 0;
    if (isNonIndexKey) {
      const boxed = `%value.arr.box.${valueIndex}`;
      return {
        lines: [
          ...array.lines,
          ...index.lines,
          ...key.lines,
          `  ${boxed} = call i64 @valueBoxArray(ptr ${array.value})`,
          `  ${value} = call i64 @valuePropertyGet(i64 ${boxed}, i64 ${key.length}, ptr ${key.value})`
        ],
        value
      };
    }
    return {
      lines: [...array.lines, ...index.lines, ...key.lines, `  ${value} = call i64 @arrayGetWithKey(ptr ${array.value}, i64 ${index.value}, i64 ${key.length}, ptr ${key.value})`],
      value
    };
  }
  return { lines: [...array.lines, ...index.lines, `  ${value} = call i64 @arrayGet(ptr ${array.value}, i64 ${index.value})`], value };
}
// Emits a private field read: the class-mangled key must be an own property of
// the receiver (the brand), otherwise a TypeError is thrown.
export function emitPrivateFieldAccessExpression(
  expression: Extract<JsIrValueExpression, { readonly kind: "privateFieldAccess" }>,
  context: EmitContext
): JsValue {
  const receiver = context.emitValue(expression.receiver);
  const keyConstant = addStringConstant(expression.key, context);
  const keyLength = utf8ByteLength(expression.key);
  const index = context.numIndex;
  context.numIndex += 1;
  const has = `%priv.has.${index}`;
  const value = `%value.${index}`;
  const okLabel = `priv.ok.${index}`;
  const throwLabel = `priv.throw.${index}`;
  return {
    lines: [
      ...receiver.lines,
      `  ${has} = call i1 @valueObjectHasOwn(i64 ${receiver.value}, i64 ${keyLength}, ptr ${keyConstant})`,
      `  br i1 ${has}, label %${okLabel}, label %${throwLabel}`,
      `${throwLabel}:`,
      ...emitPrivateFieldBrandThrow(expression.message, `priv.read.${index}`, context),
      `${okLabel}:`,
      `  ${value} = call i64 @valuePropertyGet(i64 ${receiver.value}, i64 ${keyLength}, ptr ${keyConstant})`
    ],
    value
  };
}
export function emitNullishTest(value: string, context: EmitContext): { readonly lines: readonly string[]; readonly value: string } {
  const nullIndex = context.cmpIndex;
  context.cmpIndex += 3;
  const isUndefined = `%cmp.${nullIndex}`;
  const isNull = `%cmp.${nullIndex + 1}`;
  const isNullish = `%cmp.${nullIndex + 2}`;
  return {
    lines: [
      `  ${isUndefined} = icmp eq i64 ${value}, ${jsValueUndefined}`,
      `  ${isNull} = icmp eq i64 ${value}, ${jsValueNull}`,
      `  ${isNullish} = or i1 ${isUndefined}, ${isNull}`
    ],
    value: isNullish
  };
}
