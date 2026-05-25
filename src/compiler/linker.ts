import { Effect } from "effect";
import { spawn } from "node:child_process";
import type { CompilerDiagnostic } from "./diagnostics.js";

export type LinkResult = {
  readonly executable?: string;
  readonly diagnostics: ReadonlyArray<CompilerDiagnostic>;
};

export const linkWithClang = (
  llvmIr: string,
  executable: string
): Effect.Effect<LinkResult, never> =>
  Effect.promise(
    () =>
      new Promise<LinkResult>((resolve) => {
        const child = spawn("clang", [llvmIr, "-o", executable], {
          stdio: ["ignore", "pipe", "pipe"]
        });

        let stderr = "";

        child.stderr.setEncoding("utf8");
        child.stderr.on("data", (chunk: string) => {
          stderr += chunk;
        });

        child.on("error", (error) => {
          const code = (error as NodeJS.ErrnoException).code;
          resolve({
            diagnostics: [
              {
                code: code === "ENOENT" ? "TSCN2001" : "TSCN2002",
                category: code === "ENOENT" ? "warning" : "error",
                message:
                  code === "ENOENT"
                    ? "clang was not found; LLVM IR was emitted but no native executable was linked"
                    : `Failed to start clang: ${error.message}`
              }
            ]
          });
        });

        child.on("close", (exitCode) => {
          if (exitCode === 0) {
            resolve({ executable, diagnostics: [] });
            return;
          }

          resolve({
            diagnostics: [
              {
                code: "TSCN2003",
                category: "error",
                message: `clang failed with exit code ${exitCode ?? "unknown"}${stderr ? `: ${stderr.trim()}` : ""}`
              }
            ]
          });
        });
      })
  );
