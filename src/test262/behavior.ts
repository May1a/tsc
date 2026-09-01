import {
  type ObservedBehavior,
  nodeWrapperPrintShim,
  nodeWrapperTerminalRecord
} from "../testing/process-behavior.js";

// Node's built-in .ts loader applies Module identifier restrictions before a
// CommonJS require reaches Script parsing. Strip types with an explicit Script
// module kind, then let CommonJS _compile perform the goal-sensitive parse.
export const nodeScriptWrapperSource = `
${nodeWrapperPrintShim}
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ESNext },
    fileName: filename,
    reportDiagnostics: true
  });
  if (transpiled.diagnostics.length > 0) {
    throw new SyntaxError(ts.flattenDiagnosticMessageText(transpiled.diagnostics[0].messageText, "\\n"));
  }
  module._compile(transpiled.outputText, filename);
};
try {
  require(process.argv[1]);
${nodeWrapperTerminalRecord}`;

export const behaviorsEqual = (left: ObservedBehavior, right: ObservedBehavior): boolean =>
  JSON.stringify(left) === JSON.stringify(right);
