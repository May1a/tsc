import type { JsIrModule } from "./ir.js";

export const emitLlvmIr = (module: JsIrModule): string => {
  const moduleComments = module.modules
    .map((sourceModule) => `; source ${sourceModule.fileName} statements=${sourceModule.statementCount}`)
    .join("\n");
  const printOperations = module.modules.flatMap((sourceModule) =>
    sourceModule.operations.filter((operation) => operation.kind === "printString")
  );
  const stringConstants = printOperations
    .map((operation, index) => {
      const encoded = encodeCString(operation.value);
      return `@.str.${index} = private unnamed_addr constant [${encoded.length} x i8] c"${encoded.value}"`;
    })
    .join("\n");
  const printCalls = printOperations
    .map((_operation, index) => `  %print.${index} = call i32 @puts(ptr @.str.${index})`)
    .join("\n");

  return `; tscn textual LLVM IR placeholder
; entry ${module.entry}
${moduleComments}

target triple = "x86_64-unknown-linux-gnu"

declare i32 @puts(ptr)

${stringConstants}

define i32 @main() {
entry:
${printCalls ? `${printCalls}\n` : ""}  ret i32 0
}
`;
};

export const emitTraceMap = (module: JsIrModule): string =>
  JSON.stringify(
    {
      entry: module.entry,
      modules: module.modules
    },
    null,
    2
  );

const encodeCString = (value: string): { readonly value: string; readonly length: number } => {
  const bytes = [...Buffer.from(value, "utf8"), 0];
  const encoded = bytes
    .map((byte) => {
      if (byte === 34) {
        return "\\22";
      }

      if (byte === 92) {
        return "\\5C";
      }

      if (byte >= 32 && byte <= 126) {
        return String.fromCharCode(byte);
      }

      return `\\${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    })
    .join("");

  return {
    value: encoded,
    length: bytes.length
  };
};
