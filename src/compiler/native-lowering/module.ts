import type { ResolvedModule } from "../binding-resolution/index.js";
import { type LlvmModuleBuilder, type RenderedLlvmModule, llvm } from "../llvm-ir/index.js";
import { ControlFlow } from "./control-flow.js";
import { GeneratedFunctions } from "./generated-functions.js";
import { ModuleBindings } from "./module-bindings.js";
import { NativeModule } from "./module-owner.js";
import { createOperationContext } from "./operation-owner.js";

export function emitNativeModule(resolved: ResolvedModule, builder: LlvmModuleBuilder): RenderedLlvmModule {
  const module = new NativeModule(builder);
  const bindings = new ModuleBindings(module, resolved);
  const generated = new GeneratedFunctions(module, resolved, bindings);
  generated.defineAll((fn, plan, initialize) => {
    const lowerBody = () => {
      fn.openEntry();
      const { roots, cursor, completion } = fn.capabilities;
      const frame = roots.save();
      const writes = bindings.allocate(fn.capabilities, plan.functionId, {
        environment: fn.parameter(2, llvm.ptr), bindings: plan.captures, globalAliases: plan.globalCaptureAliases
      });
      const flow = new ControlFlow(fn.capabilities, (value, threw) => {
        roots.restore(frame);
        if (threw) { completion.throwValue(value); } else { completion.returnValue(value); }
      });
      const context = createOperationContext({
        capabilities: fn.capabilities, writes, flow,
        calls: (expression) => generated.calls(expression, writes),
        stringConstant: (text) => module.stringConstant(text), withTrace: (id, build) => fn.withTrace(id, build)
      });
      initialize(context);
      context.operations.operations(plan.body);
      if (!cursor.currentBlock().terminated) { flow.returnValue(context.values.forBlock(cursor.currentBlock()).immediate("undefined")); }
      flow.finish();
    };
    if (plan.traceId === undefined) { lowerBody(); } else { fn.withTrace(plan.traceId, lowerBody); }
  });
  module.defineFunction({ name: "main", parameters: [], returnsCompletion: false, returns: llvm.i32 }, (fn) => {
    fn.openEntry();
    const { cursor, runtime, roots } = fn.capabilities;
    runtime.callVoid("gcInit", []);
    const frame = roots.save();
    bindings.registerGlobalRoots(fn.capabilities);
    const writes = bindings.allocate(fn.capabilities, "module");
    const flow = new ControlFlow(fn.capabilities, (value, threw) => {
      if (threw) { runtime.callVoid("valuePrint", [value]); }
      roots.restore(frame);
      cursor.currentBlock().ret(cursor.currentBlock().int(llvm.i32, threw ? 1n : 0n));
    });
    const context = createOperationContext({
      capabilities: fn.capabilities, writes, flow,
      calls: (expression) => generated.calls(expression, writes),
      stringConstant: (text) => module.stringConstant(text), withTrace: (id, build) => fn.withTrace(id, build)
    });
    generated.initializeScope(context, "module");
    for (const source of resolved.modules) { context.operations.operations(source.operations); }
    if (!cursor.currentBlock().terminated) { flow.returnValue(context.values.forBlock(cursor.currentBlock()).immediate("undefined")); }
    flow.finish();
  });
  return module.render();
}
