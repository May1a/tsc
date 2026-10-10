import { type LlvmFunctionSpec, llvm } from "../llvm-ir/index.js";
import type { RuntimeCallContract } from "./types.js";

export const structuredRuntimeFunctions = {
  valueBoxObject: {
    name: "valueBoxObject", parameters: [{ name: "object", type: llvm.ptr }], returns: llvm.i64
  },
  valueBoxNumber: {
    name: "valueBoxNumber", parameters: [{ name: "number", type: llvm.double }], returns: llvm.i64
  },
  valueNumber: {
    name: "valueNumber", parameters: [{ name: "value", type: llvm.i64 }], returns: llvm.double
  }
} as const satisfies Readonly<Record<string, LlvmFunctionSpec>>;

type StructuredContract<Spec extends LlvmFunctionSpec, Kind extends RuntimeCallContract["resultKind"]> = Omit<
  RuntimeCallContract, "name" | "returns" | "origin" | "effects" | "variadic" | "resultKind"
> & {
  readonly name: Spec["name"];
  readonly resultKind: Kind;
  readonly returns: Spec["returns"];
  readonly origin: "structuredRuntime";
  readonly variadic: false;
  readonly effects: { readonly allocates: false; readonly collects: false; readonly completion: "none" };
};

function contractFor<const Spec extends LlvmFunctionSpec, Kind extends RuntimeCallContract["resultKind"]>(
  spec: Spec, resultKind: Kind
): StructuredContract<Spec, Kind> {
  return {
    name: spec.name,
    resultKind,
    pointerResult: { kind: "none" },
    origin: "structuredRuntime",
    parameters: spec.parameters.map((parameter) => parameter.type),
    returns: spec.returns,
    variadic: false,
    effects: { allocates: false, collects: false, completion: "none" }
  };
}

export const structuredRuntimeContracts = {
  valueBoxObject: contractFor(structuredRuntimeFunctions.valueBoxObject, "boxed"),
  valueBoxNumber: contractFor(structuredRuntimeFunctions.valueBoxNumber, "boxed"),
  valueNumber: contractFor(structuredRuntimeFunctions.valueNumber, "scalar")
} as const;

export const entryRuntimeContracts = {
  puts: { name: "puts", resultKind: "scalar", origin: "entryDeclaration", parameters: [llvm.ptr], returns: llvm.i32, variadic: false,
    pointerResult: { kind: "none" },
    effects: { allocates: false, collects: false, completion: "none" } },
  printf: { name: "printf", resultKind: "scalar", origin: "entryDeclaration", parameters: [llvm.ptr], returns: llvm.i32, variadic: true,
    pointerResult: { kind: "none" },
    effects: { allocates: false, collects: false, completion: "none" } },
  exit: { name: "exit", resultKind: "void", origin: "entryDeclaration", parameters: [llvm.i32], returns: llvm.void, variadic: false,
    pointerResult: { kind: "none" },
    effects: { allocates: false, collects: false, completion: "none" } }
} as const satisfies Readonly<Record<string, RuntimeCallContract>>;
