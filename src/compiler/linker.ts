import { Effect } from "effect";
import { spawn } from "node:child_process";
import type { CompilerDiagnostic } from "./diagnostics.js";

export type LinkResult = {
  readonly executable?: string;
  readonly diagnostics: readonly CompilerDiagnostic[];
};

export const linkWithClang = (
  llvmIr: string,
  executable: string
): Effect.Effect<LinkResult> =>
  Effect.promise(
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
          const {code} = (error as NodeJS.ErrnoException);
          let diagnosticCode = "TSCN2002";
          let category: CompilerDiagnostic["category"] = "error";
          let message = `Failed to start clang: ${error.message}`;

          if (code === "ENOENT") {
            diagnosticCode = "TSCN2001";
            category = "warning";
            message = "clang was not found; LLVM IR was emitted but no native executable was linked";
          }

          resolve({
            diagnostics: [
              {
                code: diagnosticCode,
                category,
                message
              }
            ]
          });
        });

        child.on("close", (exitCode) => {
          if (exitCode === 0) {
            resolve({ executable, diagnostics: [] });
            return;
          }

          let exitCodeLabel = "unknown";
          if (exitCode !== null) {
            exitCodeLabel = String(exitCode);
          }

          let stderrLabel = "";
          if (stderr) {
            stderrLabel = `: ${stderr.trim()}`;
          }

          resolve({
            diagnostics: [
              {
                code: "TSCN2003",
                category: "error",
                message: `clang failed with exit code ${exitCodeLabel}${stderrLabel}`
              }
            ]
          });
        });
      })
  );
