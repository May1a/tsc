import { type Lowered, notApplicable, produced } from "./lowered.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import type { JsIrOperation } from "./types.js";
import { lowerStringExpression } from "./string-constants.js";
import type { JsIrRuntimeArrayElement, JsIrRuntimeObjectField, JsIrValueExpression } from "./expressions.js";
import { numberExpressionFromNumber } from "./number-constants.js";

export function lowerJsonParseBinding(
  name: string,
  initializer: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  if (!ts.isCallExpression(initializer) || initializer.arguments.length !== 1) {
    return notApplicable;
  }
  const callee = initializer.expression;
  if (!ts.isPropertyAccessExpression(callee) || !ts.isIdentifier(callee.expression)) {
    return notApplicable;
  }
  if (callee.expression.text !== "JSON" || callee.name.text !== "parse" || bindings.has("JSON")) {
    return notApplicable;
  }
  const text = lowerStringExpression(initializer.arguments[0], bindings);
  if (text === undefined) {
    return notApplicable;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return produced({
      kind: "bindingGroup",
      operations: [
        { kind: "throwValue", value: { kind: "string", value: { kind: "literal", value: "SyntaxError: Unexpected token in JSON" } } },
        { kind: "constValue", name, value: { kind: "undefined" } }
      ]
    });
  }
  const operations: JsIrOperation[] = [];
  lowerParsedJsonBinding(name, parsed, operations);
  return produced({ kind: "bindingGroup", operations });
}

function lowerParsedJsonBinding(name: string, parsed: unknown, operations: JsIrOperation[]): void {
  if (Array.isArray(parsed)) {
    const elements: JsIrRuntimeArrayElement[] = parsed.map((element, index) => ({
      kind: "value",
      value: lowerParsedJsonValueExpression(`${name}.json${index}`, element, operations)
    }));
    operations.push({ kind: "runtimeArrayLiteral", name, elements });
    return;
  }
  if (typeof parsed === "object" && parsed !== null) {
    const fields: JsIrRuntimeObjectField[] = Object.entries(parsed).map(([key, value], index) => ({
      kind: "field",
      key: { kind: "literal", value: key },
      value: lowerParsedJsonValueExpression(`${name}.json${index}`, value, operations)
    }));
    operations.push({ kind: "runtimeObjectLiteral", name, value: { fields } });
    return;
  }
  operations.push({ kind: "constValue", name, value: lowerParsedJsonPrimitive(parsed) });
}

function lowerParsedJsonValueExpression(temporaryName: string, value: unknown, operations: JsIrOperation[]): JsIrValueExpression {
  if (Array.isArray(value)) {
    lowerParsedJsonBinding(temporaryName, value, operations);
    return { kind: "arrayRef", name: temporaryName };
  }
  if (typeof value === "object" && value !== null) {
    lowerParsedJsonBinding(temporaryName, value, operations);
    return { kind: "objectRef", name: temporaryName };
  }
  return lowerParsedJsonPrimitive(value);
}

function lowerParsedJsonPrimitive(value: unknown): JsIrValueExpression {
  if (value === null) {
    return { kind: "null" };
  }
  if (typeof value === "string") {
    return { kind: "string", value: { kind: "literal", value } };
  }
  if (typeof value === "boolean") {
    return { kind: "boolean", value: { kind: "boolean", value } };
  }
  if (typeof value === "number") {
    return { kind: "number", value: numberExpressionFromNumber(value) };
  }
  throw new Error("Unsupported JSON.parse primitive value");
}
