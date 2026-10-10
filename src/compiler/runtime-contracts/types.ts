import type { LlvmType, LlvmValueType } from "../llvm-ir/index.js";

export interface RuntimeCallContract {
  readonly name: string;
  readonly resultKind: "boxed" | "scalar" | "pointer" | "string" | "aggregate" | "completion" | "void";
  readonly pointerResult:
    | { readonly kind: "none" }
    | { readonly kind: "external" }
    | { readonly kind: "heap" }
    | { readonly kind: "borrowed"; readonly parameter: number };
  readonly origin: "staticRuntime" | "structuredRuntime" | "entryDeclaration";
  readonly parameters: readonly LlvmValueType[];
  readonly returns: LlvmType;
  readonly variadic: boolean;
  readonly effects: {
    readonly allocates: boolean;
    readonly collects: boolean;
    readonly completion: "explicit" | "none";
  };
}
