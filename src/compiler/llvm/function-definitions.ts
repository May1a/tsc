import type { JsIrFunctionObjectDefinition, JsIrFunctionParameter } from "../ir/bindings.js";
import type { EmitContext, FunctionDef } from "./context.js";
import { createFunctionEmitContext } from "./contexts.js";
import {
  COMPLETION_NORMAL,
  emitExceptionReturnBlock,
  emitNormalGeneratedReturn,
  emitPackedGeneratedReturn,
  emitRootStackPush,
  generatedReturnType
} from "./completion.js";
import { operationListTerminates } from "./loops.js";
import { stringLengthPointerName, variablePointerName } from "./names.js";
import { wrapFunctionTrace } from "./trace.js";
import { jsValueUndefined } from "./values.js";

/**
 * Emitting a function definition.
 *
 * A generated function is a `define` with its own entry and exception blocks, its own GC root frame, and
 * its own parameter slots — the three things `createFunctionEmitContext` sets up and the reason a
 * function body needs a context of its own rather than the caller's.
 *
 * Two conventions are worth stating because they are not visible in any one function. **Parameters are
 * pushed, not addressed by index**: `emitParameterRoots` roots a boxed parameter before the body runs, so
 * a collected value cannot be reached through a stale slot. And **the exception return block is part of
 * the definition**, not a caller-side concern: every `define` ends by restoring its root frame and
 * returning the `{ i64, i1 }` status aggregate, which is what makes a `throw` inside the body
 * observable to whoever called it.
 *
 * `emitNumberParameterUnbox` and `emitStringParameterStores` are the two coercions a parameter needs
 * before the body can treat it as a `double` or a `ptr`. They are here rather than in the call sites
 * because the *declaration* decides the representation, and a call site that disagreed about it is the
 * preflight `this`-parameter bug.
 */

export function emitFunctionDefinition(fn: FunctionDef, context: EmitContext): string[] {
  if (fn.callingConvention === "functionObject") {
    return emitFunctionObjectDefinition(fn, context);
  }
  const paramList = emitFunctionParameters(fn.parameters).join(", ");
  const lines: string[] = [`define ${generatedReturnType} @${fn.name}(${paramList}) {`];
  const fnContext = createFunctionEmitContext(fn, context);
  for (let i = 0; i < fn.parameters.length; i++) {
    const parameter = fn.parameters[i];
    if (parameter.valueKind === "string") {
      fnContext.bindings.set(parameter.name, { kind: "stringVariable", name: parameter.name });
      continue;
    }
    if (parameter.valueKind === "value") {
      fnContext.bindings.set(parameter.name, { kind: "valueVariable", name: `%p${i}` });
      continue;
    }
    fnContext.bindings.set(parameter.name, {
      kind: "number",
      value: { kind: "parameter", name: `%p${i}.num` }
    });
  }
  const bodyLines = [
    // Record the root-stack baseline first; every ret/throw restores to it.
    `  ${fnContext.gcFrameName} = call i64 @gcRootSave()`,
    `  ${fnContext.exceptionSlot} = alloca i64`,
    `  ${fnContext.completionSlots.kind} = alloca i8`,
    `  ${fnContext.completionSlots.value} = alloca i64`,
    `  ${fnContext.completionSlots.destination} = alloca i32`,
    `  ${fnContext.completionSlots.until} = alloca i32`,
    `  store i8 ${COMPLETION_NORMAL}, ptr ${fnContext.completionSlots.kind}`,
    `  store i64 ${jsValueUndefined}, ptr ${fnContext.completionSlots.value}`,
    `  store i32 0, ptr ${fnContext.completionSlots.destination}`,
    `  store i32 0, ptr ${fnContext.completionSlots.until}`,
    // Pin heap-capable parameters for the whole call so an internal safepoint (e.g. a
    // loop back-edge) cannot collect a value the body still uses. Released by the
    // restore on return.
    ...emitParameterRoots(fn.parameters),
    ...emitStringParameterStores(fn.parameters, fnContext),
    ...emitNumberParameterUnbox(fn.parameters),
    ...fnContext.emitOperations(fn.body)
  ];
  context.printIndex = fnContext.printIndex;
  context.hasNumberPrint = fnContext.hasNumberPrint;
  context.arrayIndex = fnContext.arrayIndex;
  context.objectIndex = fnContext.objectIndex;
  lines.push("entry:", ...bodyLines);
  if (!operationListTerminates(fn.body)) {
    lines.push(...emitNormalGeneratedReturn(jsValueUndefined, fnContext));
  }
  lines.push(...emitExceptionReturnBlock(fnContext), "}", "");
  if (fn.traceOperation === undefined) {
    return lines;
  }
  return wrapFunctionTrace(fn.traceOperation, lines, context);
}
// eslint-disable-next-line max-statements -- Function-object prologue materializes this, captures, and typed argv bindings together.
export function emitFunctionObjectDefinition(fn: FunctionDef, context: EmitContext): string[] {
  const lines: string[] = [`define ${generatedReturnType} @${fn.name}(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {`];
  const fnContext = createFunctionEmitContext(fn, context);
  const bodyLines = [
    `  ${fnContext.gcFrameName} = call i64 @gcRootSave()`,
    `  ${fnContext.exceptionSlot} = alloca i64`,
    `  ${fnContext.completionSlots.kind} = alloca i8`,
    `  ${fnContext.completionSlots.value} = alloca i64`,
    `  ${fnContext.completionSlots.destination} = alloca i32`,
    `  ${fnContext.completionSlots.until} = alloca i32`,
    `  store i8 ${COMPLETION_NORMAL}, ptr ${fnContext.completionSlots.kind}`,
    `  store i64 ${jsValueUndefined}, ptr ${fnContext.completionSlots.value}`,
    `  store i32 0, ptr ${fnContext.completionSlots.destination}`,
    `  store i32 0, ptr ${fnContext.completionSlots.until}`
  ];
  if (fn.usesDynamicThis === true) {
    bodyLines.push("  call void @gcRootPush(i64 %this.value)");
    fnContext.bindings.set("this", { kind: "valueVariable", name: "%this.value" });
  }
  for (let i = 0; i < (fn.captures?.length ?? 0); i += 1) {
    const capture = fn.captures?.[i];
    if (capture === undefined) {
      continue;
    }
    const value = `%fnobj.capture.${i}`;
    bodyLines.push(`  ${value} = call i64 @environmentGet(ptr %env, i64 ${i})`, `  call void @gcRootPush(i64 ${value})`);
    if (capture.valueKind === "number") {
      const number = `%fnobj.capture.${i}.num`;
      bodyLines.push(`  ${number} = call double @valueNumber(i64 ${value})`);
      fnContext.bindings.set(capture.name, { kind: "number", value: { kind: "parameter", name: number } });
      continue;
    }
    if (capture.valueKind === "string") {
      const pointer = `%fnobj.capture.${i}.ptr`;
      const length = `%fnobj.capture.${i}.len`;
      bodyLines.push(
        `  ${pointer} = call ptr @valueStringPtr(i64 ${value})`,
        `  ${length} = call i64 @valueStringLength(i64 ${value})`,
        `  ${variablePointerName(capture.name)} = alloca ptr`,
        `  ${stringLengthPointerName(capture.name)} = alloca i64`,
        `  store ptr ${pointer}, ptr ${variablePointerName(capture.name)}`,
        `  store i64 ${length}, ptr ${stringLengthPointerName(capture.name)}`
      );
      fnContext.bindings.set(capture.name, { kind: "stringVariable", name: capture.name });
      continue;
    }
    fnContext.bindings.set(capture.name, { kind: "valueVariable", name: value });
  }
  for (let i = 0; i < fn.parameters.length; i += 1) {
    const parameter = fn.parameters[i];
    const slot = `%fnobj.arg.${i}.slot`;
    const value = `%fnobj.arg.${i}`;
    bodyLines.push(`  ${slot} = getelementptr i64, ptr %argv, i64 ${i}`, `  ${value} = load i64, ptr ${slot}`, `  call void @gcRootPush(i64 ${value})`);
    if (parameter.valueKind === "number") {
      const number = `%fnobj.arg.${i}.num`;
      bodyLines.push(`  ${number} = call double @valueNumber(i64 ${value})`);
      fnContext.bindings.set(parameter.name, { kind: "number", value: { kind: "parameter", name: number } });
      continue;
    }
    if (parameter.valueKind === "string") {
      const pointer = `%fnobj.arg.${i}.ptr`;
      const length = `%fnobj.arg.${i}.len`;
      bodyLines.push(
        `  ${pointer} = call ptr @valueStringPtr(i64 ${value})`,
        `  ${length} = call i64 @valueStringLength(i64 ${value})`,
        `  ${variablePointerName(parameter.name)} = alloca ptr`,
        `  ${stringLengthPointerName(parameter.name)} = alloca i64`,
        `  store ptr ${pointer}, ptr ${variablePointerName(parameter.name)}`,
        `  store i64 ${length}, ptr ${stringLengthPointerName(parameter.name)}`
      );
      fnContext.bindings.set(parameter.name, { kind: "stringVariable", name: parameter.name });
      continue;
    }
    fnContext.bindings.set(parameter.name, { kind: "valueVariable", name: value });
  }
  bodyLines.push(...fnContext.emitOperations(fn.body));
  context.printIndex = fnContext.printIndex;
  context.hasNumberPrint = fnContext.hasNumberPrint;
  context.arrayIndex = fnContext.arrayIndex;
  context.objectIndex = fnContext.objectIndex;
  lines.push("entry:", ...bodyLines);
  if (!operationListTerminates(fn.body)) {
    lines.push(...emitNormalGeneratedReturn(jsValueUndefined, fnContext));
  }
  lines.push(...emitExceptionReturnBlock(fnContext), "}", "");
  if (fn.traceOperation === undefined) {
    return lines;
  }
  return wrapFunctionTrace(fn.traceOperation, lines, context);
}
export function emitFunctionObjectThunk(definition: JsIrFunctionObjectDefinition, context: EmitContext): string[] {
  const target = definition.directTarget;
  if (target === undefined) {
    return [];
  }
  const result = "%fnobj.thunk.result";
  const payload = "%fnobj.thunk.payload";
  const exception = "%fnobj.thunk.status";
  const callArguments: string[] = [];
  const lines = [
    `define ${generatedReturnType} @${definition.codeName}(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {`,
    "entry:",
    "  %gc.frame = call i64 @gcRootSave()",
    "  %fnobj.thunk.exception.slot = alloca i64",
    "  call void @gcRootPush(i64 %this.value)"
  ];
  for (let index = 0; index < definition.parameters.length; index += 1) {
    const parameter = definition.parameters[index];
    if (parameter.isRest === true) {
      // A direct call passes a rest parameter as an already-built array, so the thunk has to
      // materialize one out of the shared argument buffer. Reading argv slot by slot instead
      // handed the target a single element no matter how many arguments the caller passed.
      const array = `%fnobj.thunk.rest.array.${index}`;
      const boxIndex = context.numIndex;
      context.numIndex += 1;
      const box = `%value.${boxIndex}`;
      lines.push(
        `  ${array} = call ptr @arrayFromArgv(i64 %argc, ptr %argv, i64 ${index})`,
        `  ${box} = call i64 @valueBoxArray(ptr ${array})`,
        emitRootStackPush(box, context)
      );
      callArguments.push(`i64 ${box}`);
      continue;
    }
    const slot = `%fnobj.thunk.arg.${index}.slot`;
    const value = `%fnobj.thunk.arg.${index}`;
    lines.push(`  ${slot} = getelementptr i64, ptr %argv, i64 ${index}`, `  ${value} = load i64, ptr ${slot}`, `  call void @gcRootPush(i64 ${value})`);
    callArguments.push(`i64 ${value}`);
  }
  lines.push(
    `  ${result} = call ${generatedReturnType} @${target}(${callArguments.join(", ")})`,
    `  ${payload} = extractvalue ${generatedReturnType} ${result}, 0`,
    `  ${exception} = extractvalue ${generatedReturnType} ${result}, 1`,
    emitRootStackPush(payload, context),
    `  store i64 ${payload}, ptr %fnobj.thunk.exception.slot`,
    `  br i1 ${exception}, label %fnobj.thunk.exception, label %fnobj.thunk.continue`,
    "fnobj.thunk.continue:",
    "  call void @gcRootRestore(i64 %gc.frame)"
  );
  let normalValue = payload;
  if (definition.returnKind === "void") {
    normalValue = jsValueUndefined;
  }
  lines.push(...emitPackedGeneratedReturn(normalValue, "false", context, "fnobj.thunk.normal"));
  lines.push(
    "fnobj.thunk.exception:",
    "  %fnobj.thunk.exception.value = load i64, ptr %fnobj.thunk.exception.slot",
    "  call void @gcRootRestore(i64 %gc.frame)"
  );
  lines.push(...emitPackedGeneratedReturn("%fnobj.thunk.exception.value", "true", context, "fnobj.thunk.exception"), "}", "");
  return lines;
}
// Push heap-capable parameters (strings and arbitrary JSValues) onto the GC root
// stack at function entry. Numbers are NaN-boxed non-pointers, so they are skipped.
export function emitParameterRoots(parameters: readonly JsIrFunctionParameter[]): string[] {
  const lines: string[] = [];
  for (let index = 0; index < parameters.length; index++) {
    const parameter = parameters[index];
    if (parameter.valueKind === "string" || parameter.valueKind === "value") {
      lines.push(`  call void @gcRootPush(i64 %p${index})`);
    }
  }
  return lines;
}
export function emitFunctionParameters(parameters: readonly JsIrFunctionParameter[]): string[] {
  // Every parameter now uses the uniform i64 NaN-boxed JSValue ABI. Numbers and
  // strings are unboxed back into their backend-local working forms in the
  // function prologue (emitNumberParameterUnbox / emitStringParameterStores).
  return parameters.map((_parameter, index) => `i64 %p${index}`);
}
// Unboxes i64 JSValue number parameters back into raw doubles at function entry,
// mirroring emitStringParameterStores. A number parameter %pN is bound to the
// recovered double register %pN.num (see the parameter binding in
// emitFunctionDefinition).
export function emitNumberParameterUnbox(parameters: readonly JsIrFunctionParameter[]): string[] {
  const lines: string[] = [];
  for (let index = 0; index < parameters.length; index++) {
    const parameter = parameters[index];
    if (parameter.valueKind === "string" || parameter.valueKind === "value") {
      continue;
    }
    lines.push(`  %p${index}.num = call double @valueNumber(i64 %p${index})`);
  }
  return lines;
}
export function emitStringParameterStores(parameters: readonly JsIrFunctionParameter[], _context: EmitContext): string[] {
  const lines: string[] = [];
  for (let index = 0; index < parameters.length; index++) {
    const parameter = parameters[index];
    if (parameter.valueKind !== "string") {
      continue;
    }
    // String parameters arrive as a single i64 NaN-boxed reference. Unbox it back
    // into the backend-local (ptr, length) working form held in twin allocas.
    lines.push(
      `  %p${index}.ptr = call ptr @valueStringPtr(i64 %p${index})`,
      `  %p${index}.len = call i64 @valueStringLength(i64 %p${index})`,
      `  ${variablePointerName(parameter.name)} = alloca ptr`,
      `  ${stringLengthPointerName(parameter.name)} = alloca i64`,
      `  store ptr %p${index}.ptr, ptr ${variablePointerName(parameter.name)}`,
      `  store i64 %p${index}.len, ptr ${stringLengthPointerName(parameter.name)}`
    );
  }
  return lines;
}
