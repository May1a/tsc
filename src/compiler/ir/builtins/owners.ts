import ts from "typescript";
import type { JsIrBindingValue } from "../bindings.js";
import type { JsIrNumberExpression, JsIrValueExpression } from "../expressions.js";
import { builtinEntryForOwnerAndName } from "./manifest.js";
import { type BuiltinOwner, knownBuiltinMessage } from "./support.js";
import { numberGlobalNames, plannedNumberBuiltinMessage, plannedNumberGlobalMessage } from "./number.js";
import { plannedArrayBuiltinMessage } from "./array.js";
import { plannedCollectionBuiltinMessage } from "./collection.js";
import { plannedDateBuiltinMessage } from "./date.js";
import { plannedErrorBuiltinMessage } from "./error.js";
import { plannedFunctionBuiltinMessage } from "./function.js";
import { plannedIteratorBuiltinMessage } from "./iterator.js";
import { plannedJsonBuiltinMessage } from "./json.js";
import { plannedMathBuiltinMessage } from "./math.js";
import { plannedObjectBuiltinMessage } from "./object.js";
import { plannedRegexpBuiltinMessage } from "./regexp.js";
import { plannedStringBuiltinMessage } from "./string.js";

/**
 * Which support table answers for a call target, and what that table says when it has not been
 * written.
 *
 * This is the seam between the tables and the lowering. A call target has no owner of its own —
 * `Array.with()` and `arr.with()` are the same member on two different things — so the owner comes
 * from the receiver's *binding* when there is one and from the receiver's *spelling* when there is
 * not, and then that owner's table is the only thing that knows whether the member is implemented.
 *
 * It lives beside the tables rather than among the recognizers because it is the only thing that
 * reads all twelve, and because a table that grows an owner without growing this file's
 * `plannedMessageForOwner` record is a compile error.
 */

/**
 * Each owner's refusal, keyed by owner so a new table is a compile error here until it is listed.
 *
 * Every entry is `(name) => string | undefined`, so this reads as a dispatch on the owner rather than
 * as twelve ifs. That is the point of the tables: adding an owner to `BuiltinOwner` and shipping its
 * table is not enough on its own, it also has to say what its refusals read like.
 */
const plannedMessageForOwner: Readonly<
  Record<BuiltinOwner, (name: string) => string | undefined>
> = {
  array: plannedArrayBuiltinMessage,
  collection: plannedCollectionBuiltinMessage,
  date: plannedDateBuiltinMessage,
  error: plannedErrorBuiltinMessage,
  function: plannedFunctionBuiltinMessage,
  iterator: plannedIteratorBuiltinMessage,
  json: plannedJsonBuiltinMessage,
  math: plannedMathBuiltinMessage,
  number: plannedNumberBuiltinMessage,
  object: plannedObjectBuiltinMessage,
  regexp: plannedRegexpBuiltinMessage,
  string: plannedStringBuiltinMessage
};

/**
 * True when the call target is a builtin the compiler knows about and has not written.
 *
 * The generic `callValue` path would dispatch it at run time and fail there with a `TypeError`
 * about a function that does not exist, which says nothing about which builtin is missing. Declining
 * here sends the statement to the diagnostic instead, where the owner's support table can name it.
 */
export function isPlannedBuiltinCall(
  callee: ts.LeftHandSideExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): boolean {
  if (ts.isIdentifier(callee)) {
    return plannedGlobalMessage(callee.text) !== undefined;
  }
  if (!ts.isPropertyAccessExpression(callee) || ts.isPrivateIdentifier(callee.name)) {
    return false;
  }
  return plannedBuiltinMessageFor(callee.expression, callee.name.text, bindings) !== undefined;
}

/**
 * True for an identifier callee this branch must not turn into a direct `call` operation.
 *
 * An unbound identifier is normally a cross-module function, which the emitter resolves by name, so
 * it passes. A *global* is different: the globals have no `@name` definition behind them, so the only
 * thing this could emit is a call to a symbol that does not exist and the compile dies in clang with
 * `use of undefined value '@name'` — which is what `isNaN(2);` did. A known-but-unwritten builtin is
 * different again: it must be reported by name rather than dispatched.
 */
export function unlowerableCallee(
  callee: ts.Expression,
  binding: JsIrBindingValue | undefined,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): boolean {
  if (ts.isIdentifier(callee)) {
    if (binding === undefined && isKnownGlobalCallee(callee)) {
      return true;
    }
    return isPlannedBuiltinCall(callee, bindings);
  }
  if (!ts.isPropertyAccessExpression(callee)) {
    return false;
  }
  const owner = builtinOwnerOfReceiver(callee.expression, bindings);
  return owner !== undefined && plannedMessageForOwner[owner](callee.name.text) !== undefined;
}

/** The refusal for a bare global this build has not written, or `undefined` when it is not one. */
export function plannedGlobalMessage(name: string): string | undefined {
  return plannedNumberGlobalMessage(name);
}

/**
 * The message for a call the compiler does not recognize, whatever shape its callee has.
 *
 * A builtin the compiler knows about and has not written is a different failure from a call target
 * it does not know at all, and the support tables are what tell the two apart. The owner comes from
 * the receiver's binding rather than its spelling, so `Array.with()` and `arr.with()` are told apart
 * from a `with` on some other object.
 */
/**
 * The globals the compiler lowers itself, so a failure inside one of them is reported by its own
 * recognizer and must not be attributed to the global's name.
 */
const recognizedGlobalCallees: ReadonlySet<string> = new Set([
  "Boolean",
  "Number",
  "String",
  "isNaN",
  "parseFloat",
  "parseInt",
  "print"
]);

const knownGlobalNames: ReadonlySet<string> = new Set(numberGlobalNames());

export function isRecognizedGlobalCallee(callee: ts.LeftHandSideExpression): boolean {
  if (!ts.isIdentifier(callee)) {
    return false;
  }
  return recognizedGlobalCallees.has(callee.text);
}

/**
 * True for a name the support tables list as a bare global. Those have no `@name` definition behind
 * them, so an unbound reference to one cannot be emitted as a call.
 */
export function isKnownGlobalCallee(callee: ts.LeftHandSideExpression): boolean {
  return ts.isIdentifier(callee) && knownGlobalNames.has(callee.text);
}



export function callTargetMessage(
  callee: ts.LeftHandSideExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): string | undefined {
  if (ts.isIdentifier(callee)) {
    const global = plannedGlobalMessage(callee.text);
    if (global !== undefined) {
      return global;
    }
    return `Unrecognized call target: ${callee.getText()}()`;
  }
  if (!ts.isPropertyAccessExpression(callee) || ts.isPrivateIdentifier(callee.name)) {
    return undefined;
  }
  const planned = plannedBuiltinMessageFor(callee.expression, callee.name.text, bindings);
  if (planned !== undefined) {
    return planned;
  }
  return `Unrecognized call target: ${callee.getText()}()`;
}

/**
 * The refusal for a call whose target is a builtin the compiler knows about and has not written, or
 * `undefined` when the target is not one of those. Each owner's table is consulted in turn, so
 * adding a table is what makes its refusals name the builtin.
 */
/**
 * The refusal for a call whose target is a builtin the compiler knows about and has not written, or
 * `undefined` when the target is not one of those. The owner's table is what knows the name, so the
 * work here is finding the owner.
 */
export function plannedBuiltinMessageFor(
  receiver: ts.Expression,
  name: string,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): string | undefined {
  const owner = builtinOwnerOfReceiver(receiver, bindings);
  if (owner === undefined) {
    return undefined;
  }
  return plannedMessageForOwner[owner](name);
}

/**
 * The diagnostic for a member this build has not written, when the expression is a read rather than a
 * call.
 *
 * A call goes through `callTargetMessage`, which sees the callee; `f.length` and `e.stack` are reads,
 * and without this they reported `Unsupported statement in the current lowering slice:
 * ExpressionStatement` — a message about the enclosing statement that names nothing the user wrote. It
 * only fires when the owner's table has an entry for the name, so an unrecognized member of an
 * unrecognized object still gets the statement fallback rather than a builtin the compiler has never
 * heard of.
 */
export function plannedMemberReadMessage(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): string | undefined {
  if (!ts.isPropertyAccessExpression(expression)) {
    return undefined;
  }
  const owner = builtinOwnerOfReceiver(expression.expression, bindings);
  if (owner === undefined) {
    return undefined;
  }
  const entry = builtinEntryForOwnerAndName(owner, expression.name.text);
  if (entry === undefined || entry.state === "supported") {
    return undefined;
  }
  return knownBuiltinMessage(entry);
}

/**
 * The owners reachable by the spelling of a receiver, for the builtins that are globals rather than
 * values a program holds: `Array.of` is the array table's business and `Math.min` the math table's,
 * and there is no binding to read that from.
 */
const staticBuiltinOwners: Readonly<Record<string, BuiltinOwner | undefined>> = {
  Array: "array",
  Date: "date",
  JSON: "json",
  Math: "math",
  Object: "object",
  String: "string",
  Symbol: "iterator"
};

/** The support-table owner a call target belongs to, from the receiver rather than its spelling. */
export function builtinOwnerOfReceiver(
  receiver: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): BuiltinOwner | undefined {
  if (ts.isIdentifier(receiver)) {
    const staticOwner = staticBuiltinOwners[receiver.text];
    if (staticOwner !== undefined) {
      return staticOwner;
    }
    return builtinOwnerOfBinding(bindings.get(receiver.text));
  }
  if (ts.isCallExpression(receiver) && ts.isIdentifier(receiver.expression)) {
    return staticBuiltinOwners[receiver.expression.text];
  }
  return undefined;
}

/**
 * The support-table owner for a receiver that is a variable, read off what the binding holds.
 *
 * This is why the owner is not the receiver's name: `const s = new Set()` and `const a = []` are both
 * locals, and only the binding says which table answers for `s.add` or `a.at`.
 */
function builtinOwnerOfBinding(binding: JsIrBindingValue | undefined): BuiltinOwner | undefined {
  if (binding === undefined) {
    return undefined;
  }
  switch (binding.kind) {
    case "array":
    case "runtimeArray": {
      return "array";
    }
    case "object": {
      return "object";
    }
    case "runtimeMap":
    case "runtimeSet": {
      return "collection";
    }
    case "runtimeIterator": {
      return "iterator";
    }
    case "string":
    case "stringExpression":
    case "stringVariable": {
      return "string";
    }
    case "value": {
      return builtinOwnerOfValueExpression(binding.value);
    }
    case "valueVariable": {
      return valueVariableOwner(binding);
    }
    case "closure":
    case "closureFactory":
    case "function":
    case "functionReference": {
      // A function value is a `Function`, so `f.call` is `Function.prototype.call`. Nothing on that
      // prototype lowers, and the function table is what says so by name rather than letting the call
      // through to a runtime that has no such function.
      return "function";
    }
    case "runtimeObject": {
      // An `Error` instance is a runtime object carrying its constructor name, and its members are
      // `Object.prototype`'s by inheritance. Which table answers for a missing member is the only
      // thing that tells the two apart, so the error name has to be read here.
      return runtimeObjectOwner(binding);
    }
    default: {
      return numericOwnerOrUndefined(binding);
    }
  }
}

/**
 * The owner for a receiver held in a `value` binding, which the string and number tiers both write.
 *
 * A boxed value carries its own kind, so the owner follows that rather than the binding: a
 * `stringValue` is the string table's and a `numberValue` the number table's, and the same `value`
 * binding can hold either depending on the initializer.
 */
function builtinOwnerOfValueExpression(value: JsIrValueExpression | undefined): BuiltinOwner | undefined {
  if (value === undefined) {
    return undefined;
  }
  switch (value.kind) {
    case "string": {
      return "string";
    }
    case "regexCompile":
    case "regexExec":
    case "regexMatch": {
      return "regexp";
    }
    case "number": {
      return numberBindingOwner(value.value);
    }
    default: {
      return undefined;
    }
  }
}

/** The number tier's business for a boxed number, or `undefined` for a literal, which has no owner. */
function numberBindingOwner(value: JsIrNumberExpression): BuiltinOwner | undefined {
  if (value.kind === "literal") {
    return undefined;
  }
  return "number";
}

/** `Function.prototype` is the function table's; nothing else a `valueVariable` can hold is. */
function valueVariableOwner(binding: Extract<JsIrBindingValue, { readonly kind: "valueVariable" }>): BuiltinOwner | undefined {
  if (binding.valueType === "regex") {
    return "regexp";
  }
  return undefined;
}

/** An `Error` instance is a runtime object that carries its constructor name; a plain one does not. */
function runtimeObjectOwner(binding: Extract<JsIrBindingValue, { readonly kind: "runtimeObject" }>): BuiltinOwner | undefined {
  if (binding.errorName === undefined) {
    return "object";
  }
  return "error";
}

/** The number tier's business for the binding kinds it writes, or `undefined` for the rest. */
function numericOwnerOrUndefined(binding: JsIrBindingValue): BuiltinOwner | undefined {
  if (isNumericBinding(binding)) {
    return "number";
  }
  return undefined;
}

/**
 * True for a binding the number tier can lower through. A `number` binding holds a
 * `JsIrNumberExpression`, so a literal `const` is not one; a `value` binding whose value is the
 * number tier is.
 */
function isNumericBinding(binding: JsIrBindingValue | undefined): boolean {
  if (binding === undefined) {
    return false;
  }
  if (binding.kind === "number") {
    return true;
  }
  return binding.kind === "value" && binding.value.kind === "number";
}
