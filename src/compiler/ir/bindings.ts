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

/**
 * What a name currently holds.
 *
 * The lowering pass records one of these per binding and the emitter consults it to choose between
 * a direct register and a boxed runtime cell, so a new representation is a new variant here before
 * it is anything else. The `aggregate*` forms are the ones a fixed-shape literal or a runtime
 * object stands for; the rest are the tiers the value, number and string expression emitters
 * specialise on.
 */
export type JsIrValueKind = "number" | "string" | "value";

export interface JsIrFunctionParameter {
  readonly name: string;
  readonly valueKind: JsIrValueKind;
  readonly defaultValue?: JsIrNumberExpression;
  readonly isRest?: boolean;
  /**
   * A parameter declared `x?: T` with no initializer, which a call may therefore omit. Omitting it
   * passes `undefined` rather than dropping the argument, so the callee still sees one slot per
   * declared parameter.
   *
   * This is distinct from `defaultValue`: a default is a value the call site substitutes, while this
   * is the absence of one. The parameter keeps its declared `valueKind` because the IR is monomorphic
   * — `x ?? 0` tests the slot at runtime, which is what makes an omitted argument safe to read.
   */
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
  readonly captures?: readonly {
    readonly name: string;
    readonly valueKind: JsIrValueKind;
    readonly value: JsIrValueExpression;
  }[];
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
