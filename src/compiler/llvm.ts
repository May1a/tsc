import type { JsIrModule } from "./ir.js";

type PrintOperation =
  | {
      readonly kind: "number";
      readonly value: number;
    }
  | {
      readonly kind: "string";
      readonly value: string;
    };

const doubleQuoteByte = 34;
const backslashByte = 92;
const firstPrintableAsciiByte = 32;
const lastPrintableAsciiByte = 126;
const hexadecimalRadix = 16;

const encodeCString = (value: string): { readonly value: string; readonly length: number } => {
  const bytes = [...Buffer.from(value, "utf8"), 0];
  const encoded = bytes
    .map((byte) => {
      if (byte === doubleQuoteByte) {
        return String.raw`\22`;
      }

      if (byte === backslashByte) {
        return String.raw`\5C`;
      }

      if (byte >= firstPrintableAsciiByte && byte <= lastPrintableAsciiByte) {
        return String.fromCharCode(byte);
      }

      return `\\${byte.toString(hexadecimalRadix).toUpperCase().padStart(2, "0")}`;
    })
    .join("");

  return {
    value: encoded,
    length: bytes.length
  };
};

export const emitLlvmIr = (module: JsIrModule): string => {
  const moduleComments = module.modules
    .map((sourceModule) => `; source ${sourceModule.fileName} statements=${sourceModule.statementCount}`)
    .join("\n");
  const printOperations = module.modules.flatMap((sourceModule) => {
    const bindings = new Map<string, PrintOperation>();
    const operations: PrintOperation[] = [];

    for (const operation of sourceModule.operations) {
      if (operation.kind === "constNumber") {
        bindings.set(operation.name, { kind: "number", value: operation.value });
        continue;
      }

      if (operation.kind === "constBoolean") {
        bindings.set(operation.name, { kind: "string", value: String(operation.value) });
        continue;
      }

      if (operation.kind === "constString") {
        bindings.set(operation.name, { kind: "string", value: operation.value });
        continue;
      }

      if (operation.kind === "printString") {
        operations.push({ kind: "string", value: operation.value });
        continue;
      }

      if (operation.kind === "printNumber") {
        operations.push({ kind: "number", value: operation.value });
        continue;
      }

      if (operation.kind === "printBoolean") {
        operations.push({ kind: "string", value: String(operation.value) });
        continue;
      }

      const binding = bindings.get(operation.name);
      if (binding !== undefined) {
        operations.push(binding);
      }
    }

    return operations;
  });
  const stringConstants = printOperations
    .flatMap((operation, index) => {
      if (operation.kind === "number") {
        return [];
      }

      const encoded = encodeCString(operation.value);
      return [`@.str.${index} = private unnamed_addr constant [${encoded.length} x i8] c"${encoded.value}"`];
    })
    .join("\n");
  const printCalls = printOperations
    .map((operation, index) => {
      if (operation.kind === "number") {
        return `  %print.${index} = call i32 (ptr, ...) @printf(ptr @.fmt.number, double ${operation.value})`;
      }

      return `  %print.${index} = call i32 @puts(ptr @.str.${index})`;
    })
    .join("\n");
  let numberFormat = "";
  if (printOperations.some((operation) => operation.kind === "number")) {
    numberFormat = String.raw`@.fmt.number = private unnamed_addr constant [4 x i8] c"%g\0A\00"`;
  }

  let printCallLines = "";
  if (printCalls) {
    printCallLines = `${printCalls}\n`;
  }

  return `; tscn textual LLVM IR placeholder
; entry ${module.entry}
${moduleComments}

target triple = "x86_64-unknown-linux-gnu"

declare i32 @puts(ptr)
declare i32 @printf(ptr, ...)

${numberFormat}
${stringConstants}

define i32 @main() {
entry:
${printCallLines}  ret i32 0
}
`;
};

export const emitTraceMap = (module: JsIrModule): string =>
  JSON.stringify(
    {
      entry: module.entry,
      modules: module.modules
    },
    undefined,
    2
  );
