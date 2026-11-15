// Requires an opaque-pointer-capable llvm-as on PATH, or LLVM_AS set to its
// executable path. Missing tools and verifier errors fail the gate; never skip
// or substitute clang, whose IR parsing alone does not guarantee verification.
import { spawnSync } from "node:child_process";
import { devNull } from "node:os";
import { pathToFileURL } from "node:url";

/** @param {{ ir: string, llvmAs?: string }} options */
export function verifyStaticRuntime({ ir, llvmAs = process.env.LLVM_AS ?? "llvm-as" }) {
  // llvm-as runs LLVM's verifier by default, before writing the bitcode.
  const result = spawnSync(llvmAs, ["-o", devNull, "-"], {
    input: ir,
    encoding: "utf8"
  });
  if (result.error !== undefined) {
    throw new Error(`Cannot run ${llvmAs}. Install LLVM and put llvm-as on PATH or set LLVM_AS to its executable path.`, {
      cause: result.error
    });
  }
  if (result.status !== 0) {
    throw new Error(`Static Runtime IR failed LLVM verification (${result.signal ?? result.status}):\n${result.stderr}`);
  }
}

async function main() {
  // Use the production loader and module construction, including the typed
  // runtime helpers and external declarations referenced by the static files.
  // runtime:verify builds first so these imports and the copied IR are fresh.
  const { runtimeIrText } = await import("../dist/compiler/runtime-files.js");
  const { createLlvmModule } = await import("../dist/compiler/llvm-ir/index.js");
  const { NativeModule } = await import("../dist/compiler/native-lowering/module-owner.js");
  const module = new NativeModule(createLlvmModule({
    staticRuntime: [{ origin: "static runtime", text: runtimeIrText() }]
  }));
  verifyStaticRuntime({ ir: module.render().text });
  console.log("Static Runtime IR passed LLVM verification.");
}

const entryPoint = process.argv.slice(1, 2).at(0);
if (entryPoint !== undefined && import.meta.url === pathToFileURL(entryPoint).href) {
  await main();
}
