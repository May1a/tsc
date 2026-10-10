import type {
  JsIrClosureValue,
  JsIrCondition,
  JsIrNumberExpression,
  JsIrObjectValue,
  JsIrRuntimeObjectValue,
  JsIrStringExpression,
  JsIrValueExpression
} from "./expressions.js";
import type { JsIrOperation } from "./types.js";

export type JsIrValueKind = "number" | "string" | "value";

export interface JsIrFunctionParameter {
  readonly name: string;
  readonly valueKind: JsIrValueKind;
  readonly defaultValue?: JsIrNumberExpression;
  readonly isRest?: boolean;
  /** An omitted optional parameter receives undefined in boxed storage. */
  readonly isOptional?: boolean;
}

export interface JsIrFunctionObjectDefinition {
  readonly codeName: string;
  readonly parameters: readonly JsIrFunctionParameter[];
  readonly functionKind: "arrow" | "ordinary";
  readonly returnKind: JsIrValueKind | "void";
  readonly body?: readonly JsIrOperation[];
  readonly directTarget?: string;
  readonly inferredName?: string;
  readonly captures?: readonly JsIrFunctionObjectCapture[];
}

/**
 * One environment slot a function object fills.
 *
 * `name` is a binding the enclosing scope declared — the source's own name — and `value` is the read
 * that loads it into the environment. A callback operation's capture list uses the same shape for a
 * *generated* slot name, so the two are distinguished by which operation carries them rather than by
 * the shape alone.
 */
export interface JsIrFunctionObjectCapture {
  readonly name: string;
  readonly valueKind: JsIrValueKind;
  readonly value: JsIrValueExpression;
}

export type JsIrCallArgument =
  | {
      readonly valueKind: "number";
      readonly value: JsIrNumberExpression;
    }
  | {
      readonly valueKind: "string";
      readonly value: JsIrStringExpression;
    }
  | {
      readonly valueKind: "value";
      readonly value: JsIrValueExpression;
    }
  | {
      /** An omitted optional parameter: the callee receives `undefined` in that slot. */
      readonly valueKind: "undefined";
    };


export type JsIrBindingValue =
  | {
      readonly kind: "string";
      readonly value: string;
    }
  | {
      readonly kind: "stringExpression";
      readonly value: JsIrStringExpression;
    }
  | {
      readonly kind: "stringVariable";
      readonly name: string;
    }
  | {
      readonly kind: "value";
      readonly value: JsIrValueExpression;
    }
  | {
      readonly kind: "valueVariable";
      readonly name: string;
      readonly valueType?: "function" | "regex";
      // Set when the variable was initialized with `new C(...)`, so method-call
      // receivers resolve their class even when the checker cannot name the
      // class type (anonymous class expressions).
      readonly className?: string;
    }
  | {
      readonly kind: "number";
      readonly value: JsIrNumberExpression;
    }
  | {
      readonly kind: "boolean";
      readonly value: boolean;
    }
  | {
      readonly kind: "booleanExpression";
      readonly value: JsIrCondition;
    }
  | {
      readonly kind: "booleanVariable";
      readonly name: string;
      readonly initialValue?: boolean;
    }
  | {
      readonly kind: "array";
      readonly name: string;
      readonly length: number;
    }
  | {
      readonly kind: "runtimeArray";
      readonly name: string;
    }
  | {
      readonly kind: "runtimeMap" | "runtimeSet";
      readonly name: string;
    }
  | {
      readonly kind: "runtimeIterator";
      readonly name: string;
      readonly sourceKind: "map" | "set";
      readonly iterationKind: "keys" | "values" | "entries";
    }
  | {
      readonly kind: "object";
      readonly value: JsIrObjectValue;
    }
  | {
      readonly kind: "runtimeObject";
      readonly name: string;
      readonly value?: JsIrRuntimeObjectValue;
      readonly errorName?: string;
    }
  | {
      readonly kind: "closure";
      readonly value: JsIrClosureValue;
    }
  | {
      readonly kind: "closureFactory";
      readonly functionName: string;
      readonly factoryParameters: readonly string[];
      readonly captureNames: readonly string[];
    }
  | {
      readonly kind: "function";
      readonly parameters: readonly JsIrFunctionParameter[];
      readonly returnKind: JsIrValueKind | "void";
      readonly body: readonly JsIrOperation[];
      readonly constructibleByObjectReturn?: boolean;
    }
  | {
      readonly kind: "functionReference";
      readonly parameters: readonly JsIrFunctionParameter[];
      readonly returnKind: JsIrValueKind | "void";
    };
