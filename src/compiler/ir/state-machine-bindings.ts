import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import type { JsIrValueExpression } from "./expressions.js";
import { type Produced, produced, unsupportedIn } from "./lowered.js";
import { lowerStateMachineExpression } from "./state-machine-expr.js";
import type { StateMachineBuilder } from "./state-machine.js";

export function hoistVarDeclarations(
  builder: StateMachineBuilder,
  body: ts.ConciseBody,
  bindings: Map<string, JsIrBindingValue>
): void {
  if (!ts.isBlock(body)) {
    return;
  }
  const visit = (node: ts.Node): void => {
    if (node !== body && (ts.isFunctionLike(node) || ts.isClassLike(node))) {
      return;
    }
    if (ts.isVariableDeclarationList(node) && (node.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) === 0) {
      for (const decl of node.declarations) {
        collectBindingPatternVarNames(builder, decl.name, bindings);
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
}

function collectBindingPatternVarNames(
  builder: StateMachineBuilder,
  name: ts.BindingName,
  bindings: Map<string, JsIrBindingValue>
): void {
  if (ts.isIdentifier(name)) {
    if (!bindings.has(name.text)) {
      const slot = builder.allocateLocal(name.text);
      bindings.set(name.text, { kind: "valueVariable", name: slot });
    }
    return;
  }
  for (const element of name.elements) {
    if (ts.isBindingElement(element)) {
      collectBindingPatternVarNames(builder, element.name, bindings);
    }
  }
}

export function lowerVariableList(
  builder: StateMachineBuilder,
  list: ts.VariableDeclarationList,
  bindings: Map<string, JsIrBindingValue>
): Produced<undefined> {
  const isVar = (list.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) === 0;
  for (const decl of list.declarations) {
    let initVal: JsIrValueExpression = { kind: "undefined" };
    if (decl.initializer !== undefined) {
      const lowered = lowerStateMachineExpression(builder, decl.initializer, bindings);
      if (lowered.kind !== "lowered") {
        return lowered;
      }
      initVal = lowered.operation;
    }
    const bound = bindPatternValue(builder, decl.name, initVal, isVar, bindings);
    if (bound.kind !== "lowered") {
      return bound;
    }
  }
  return produced(undefined);
}

export function bindPatternValue(
  builder: StateMachineBuilder,
  pattern: ts.BindingName,
  value: JsIrValueExpression,
  isVar: boolean,
  bindings: Map<string, JsIrBindingValue>
): Produced<undefined> {
  if (ts.isIdentifier(pattern)) {
    const existing = isVar ? bindings.get(pattern.text) : undefined;
    const slot = existing?.kind === "valueVariable" ? existing.name : builder.allocateLocal(pattern.text);
    bindings.set(pattern.text, { kind: "valueVariable", name: slot });
    builder.emit({ kind: "assignValue", name: slot, value });
    return produced(undefined);
  }
  const sourceSlot = builder.allocateTemp("pat");
  builder.emit({ kind: "assignValue", name: sourceSlot, value });
  const sourceRef: JsIrValueExpression = { kind: "variable", name: sourceSlot };
  if (ts.isObjectBindingPattern(pattern)) {
    return bindObjectPattern(builder, pattern, sourceRef, isVar, bindings);
  }
  return bindArrayPattern(builder, pattern, sourceRef, isVar, bindings);
}

function bindObjectPattern(
  builder: StateMachineBuilder,
  pattern: ts.ObjectBindingPattern,
  sourceRef: JsIrValueExpression,
  isVar: boolean,
  bindings: Map<string, JsIrBindingValue>
): Produced<undefined> {
  for (const element of pattern.elements) {
    if (element.dotDotDotToken !== undefined) {
      return unsupportedIn("Rest destructuring inside a generator or async function is not supported yet");
    }
    const keyNode = element.propertyName ?? (ts.isIdentifier(element.name) ? element.name : undefined);
    if (keyNode === undefined || (!ts.isIdentifier(keyNode) && !ts.isStringLiteral(keyNode) && !ts.isNumericLiteral(keyNode))) {
      return unsupportedIn("Computed object destructuring key inside a generator or async function is not supported yet");
    }
    let propVal: JsIrValueExpression = { kind: "valueObjectDynamicAccess", value: sourceRef, key: { kind: "literal", value: keyNode.text } };
    if (element.initializer !== undefined) {
      const def = lowerStateMachineExpression(builder, element.initializer, bindings);
      if (def.kind !== "lowered") {
        return def;
      }
      propVal = { kind: "lazyDefault", value: propVal, defaultValue: def.operation };
    }
    const bound = bindPatternValue(builder, element.name, propVal, isVar, bindings);
    if (bound.kind !== "lowered") {
      return bound;
    }
  }
  return produced(undefined);
}

function bindArrayPattern(
  builder: StateMachineBuilder,
  pattern: ts.ArrayBindingPattern,
  sourceRef: JsIrValueExpression,
  isVar: boolean,
  bindings: Map<string, JsIrBindingValue>
): Produced<undefined> {
  const iterSlot = builder.allocateTemp("diter");
  builder.emit({ kind: "assignValue", name: iterSlot, value: { kind: "iteratorOpen", iterable: sourceRef, notIterableMessage: "Value is not iterable" } });
  const iterRef: JsIrValueExpression = { kind: "variable", name: iterSlot };
  const nextCall: JsIrValueExpression = {
    kind: "callValue",
    callee: { kind: "valueObjectDynamicAccess", value: iterRef, key: { kind: "literal", value: "next" } },
    arguments: [],
    methodReceiver: iterRef,
    methodKey: { kind: "literal", value: "next" }
  };
  for (const element of pattern.elements) {
    if (ts.isOmittedExpression(element)) {
      builder.emit({ kind: "discardValue", value: nextCall });
      continue;
    }
    if (element.dotDotDotToken !== undefined) {
      return unsupportedIn("Array rest destructuring inside a generator or async function is not supported yet");
    }
    const stepSlot = builder.allocateTemp("dstep");
    builder.emit({ kind: "assignValue", name: stepSlot, value: nextCall });
    let elemVal: JsIrValueExpression = { kind: "valueObjectDynamicAccess", value: { kind: "variable", name: stepSlot }, key: { kind: "literal", value: "value" } };
    if (element.initializer !== undefined) {
      const def = lowerStateMachineExpression(builder, element.initializer, bindings);
      if (def.kind !== "lowered") {
        return def;
      }
      elemVal = { kind: "lazyDefault", value: elemVal, defaultValue: def.operation };
    }
    const bound = bindPatternValue(builder, element.name, elemVal, isVar, bindings);
    if (bound.kind !== "lowered") {
      return bound;
    }
  }
  return produced(undefined);
}
