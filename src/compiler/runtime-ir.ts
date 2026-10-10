import { jsValueAbi } from "./js-value-abi/index.js";
import { type LlvmModuleBuilder, llvm } from "./llvm-ir/index.js";
import { structuredRuntimeFunctions } from "./runtime-contracts/structured.js";

// Boxed-JSValue boundary helpers built through the structured module builder.
// Every compiled module emits them; unused definitions are inert.
export function defineStructuredRuntimeHelpers(module: LlvmModuleBuilder): void {
  module.defineFunction(
    structuredRuntimeFunctions.valueBoxObject,
    (fn) => {
      const object = fn.parameter(0, llvm.ptr);
      fn.block("entry", (block) => {
        block.ret(jsValueAbi.forLlvm(block).boxReference("object", object));
      });
    }
  );
  module.defineFunction(
    structuredRuntimeFunctions.valueBoxNumber,
    (fn) => {
      const number = fn.parameter(0, llvm.double);
      fn.block("entry", (block) => block.ret(jsValueAbi.forLlvm(block).boxNumber(number)));
    }
  );
  module.defineFunction(
    structuredRuntimeFunctions.valueNumber,
    (fn) => {
      const value = fn.parameter(0, llvm.i64);
      fn.block("entry", (block) => {
        const values = jsValueAbi.forLlvm(block);
        block.ret(values.unboxNumber(values.fromBoundary(value)));
      });
    }
  );
}
