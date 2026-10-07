import type { JsIrNumberExpression } from "./expressions.js";

export const decimalRadix = 10;

export function numericLiteralValue(expression: JsIrNumberExpression): number | undefined {
  if (expression.kind === "literal") {
    return expression.value;
  }
  if (expression.kind === "nan") {
    return Number.NaN;
  }
  if (expression.kind === "negatedZero") {
    return -0;
  }
  if (expression.kind === "unary") {
    const value = numericLiteralValue(expression.value);
    if (value === undefined) {
      return undefined;
    }
    return -value;
  }
  return undefined;
}

export function coerceStringToNumber(value: string): number {
  const trimmed = value.trim();
  if (trimmed === "") {
    return 0;
  }
  return Number(trimmed);
}

export function numberConstantValue(name: string): number | undefined {
  switch (name) {
    case "MAX_SAFE_INTEGER": {
      return Number.MAX_SAFE_INTEGER;
    }
    case "MIN_SAFE_INTEGER": {
      return Number.MIN_SAFE_INTEGER;
    }
    case "EPSILON": {
      return Number.EPSILON;
    }
    case "MAX_VALUE": {
      return Number.MAX_VALUE;
    }
    case "MIN_VALUE": {
      return Number.MIN_VALUE;
    }
    default: {
      return undefined;
    }
  }
}

export function numberExpressionFromNumber(value: number): JsIrNumberExpression {
  if (Number.isNaN(value)) {
    return { kind: "nan" };
  }
  if (Object.is(value, -0)) {
    return { kind: "negatedZero" };
  }
  return { kind: "literal", value };
}
