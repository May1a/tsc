import { Effect } from "effect";
import { spawn } from "node:child_process";
import type { CompilerDiagnostic } from "./diagnostics.js";

export type LinkResult = {
  readonly executable?: string;
  readonly diagnostics: readonly CompilerDiagnostic[];
};

export type ToolAvailability = {
  readonly name: "clang" | "llvm-as" | "lli";
  readonly available: boolean;
};

const discoverTool = (name: ToolAvailability["name"]): Effect.Effect<ToolAvailability> =>
  Effect.promise(
    async () =>
      new Promise((resolve: (value: ToolAvailability) => void) => {
        const child = spawn(name, ["--version"], { stdio: "ignore" });
        child.on("error", () => {
          resolve({ name, available: false });
        });
        child.on("close", (exitCode) => {
          resolve({ name, available: exitCode === 0 });
        });
      })
  );

export const discoverNativeToolchain = (): Effect.Effect<readonly ToolAvailability[]> =>
  Effect.all([discoverTool("clang"), discoverTool("llvm-as"), discoverTool("lli")]);

export const linkWithClang = (
  llvmIr: string,
  executable: string
): Effect.Effect<LinkResult> =>
  Effect.gen(function* linkWithDiscoveredClang() {
    const toolchain = yield* discoverNativeToolchain();
    const clang = toolchain.find((tool) => tool.name === "clang");
    if (clang?.available !== true) {
      return {
        diagnostics: [
          {
            code: "TSCN2001",
            category: "warning",
            message: "clang was not found during toolchain discovery; LLVM IR was emitted but no native executable was linked"
          }
        ]
      };
    }

    return yield* runClang(llvmIr, executable);
  });

function runClang(llvmIr: string, executable: string): Effect.Effect<LinkResult> {
  return Effect.promise(
    async () =>
      new Promise((resolve: (value: LinkResult) => void) => {
        const child = spawn("clang", [llvmIr, "-o", executable], {
          stdio: ["ignore", "pipe", "pipe"]
        });

        let stderr = "";

        child.stderr.setEncoding("utf8");
        child.stderr.on("data", (chunk: string) => {
          stderr += chunk;
        });

        child.on("error", (error) => {
          resolve(clangStartFailure(error));
        });

        child.on("close", (exitCode) => {
          if (exitCode === 0) {
            resolve({ executable, diagnostics: [] });
            return;
          }
          resolve(clangExitFailure(exitCode, stderr));
        });
      })
  );
}

function clangStartFailure(error: Error): LinkResult {
  const {code} = (error as NodeJS.ErrnoException);
  let diagnosticCode = "TSCN2002";
  let category: CompilerDiagnostic["category"] = "error";
  let message = `Failed to start clang: ${error.message}`;

  if (code === "ENOENT") {
    diagnosticCode = "TSCN2001";
    category = "warning";
    message = "clang was not found; LLVM IR was emitted but no native executable was linked";
  }

  return {
    diagnostics: [
      {
        code: diagnosticCode,
        category,
        message
      }
    ]
  };
}

function clangExitFailure(exitCode: number | null, stderr: string): LinkResult {
  let exitCodeLabel = "unknown";
  if (exitCode !== null) {
    exitCodeLabel = String(exitCode);
  }

  let stderrLabel = "";
  if (stderr) {
    stderrLabel = `: ${stderr.trim()}`;
  }

  return {
    diagnostics: [
      {
        code: "TSCN2003",
        category: "error",
        message: `clang failed with exit code ${exitCodeLabel}${stderrLabel}`
      }
    ]
  };
}
