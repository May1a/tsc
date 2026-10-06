import type { JsIrNumberExpression, JsIrObjectValue, JsIrRuntimeArrayElement, JsIrRuntimeObjectValue } from "./expressions.js";

export type ArrayLiteralClassification =
  | {
    readonly kind: "fixed";
    readonly elements: readonly JsIrNumberExpression[];
  }
  | {
    readonly kind: "runtime";
    readonly elements: readonly JsIrRuntimeArrayElement[];
  };

export type ObjectLiteralClassification =
  | {
    readonly kind: "fixed";
    readonly value: JsIrObjectValue;
  }
  | {
    readonly kind: "runtime";
    readonly value: JsIrRuntimeObjectValue;
  };
