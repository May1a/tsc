export type ThrownObservation =
  | {
      readonly kind: "error";
      readonly name: string;
      readonly message: string;
    }
  | {
      readonly kind: "value";
      readonly display: string;
    };

export interface ObservedBehavior {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly thrown?: ThrownObservation;
}

// Same thrown-observation sentinel technique as the existing Node correctness
// oracle (test/integration/oracle.ts): the Node wrapper reports uncaught
// throws as structured JSON on a dedicated stderr line so error class and
// message can be compared.
export const thrownSentinel = "__TSCN_NODE_THROWN_V1__";

const parseThrownObservation = (json: string): ThrownObservation | undefined => {
  let parsed: unknown = undefined;
  try {
    parsed = JSON.parse(json);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return undefined;
  }
  if ("kind" in parsed && parsed.kind === "error" && "name" in parsed && "message" in parsed && typeof parsed.name === "string" && typeof parsed.message === "string") {
    return { kind: "error", name: parsed.name, message: parsed.message };
  }
  if ("kind" in parsed && parsed.kind === "value" && "display" in parsed && typeof parsed.display === "string") {
    return { kind: "value", display: parsed.display };
  }
  return undefined;
};

// Common tail of both Node wrappers: the print shim, the try/catch around the
// entry execution, and the thrownSentinel terminal record on stderr. Both
// wrappers must observe and report throws identically.
const nodeWrapperPrintShim = `globalThis.print = (value) => {
  process.stdout.write(String(value) + "\\n");
};`;

const nodeWrapperTerminalRecord = `} catch (thrown) {
  const payload = thrown instanceof Error
    ? { kind: "error", name: thrown.name, message: thrown.message }
    : { kind: "value", display: String(thrown) };
  process.stderr.write(${JSON.stringify(thrownSentinel)} + JSON.stringify(payload) + "\\n");
  process.exitCode = 1;
}
`;

export const nodeWrapperSource = `
${nodeWrapperPrintShim}
try {
  await import(process.argv[1]);
${nodeWrapperTerminalRecord}`;

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

export const nodeBehavior = (run: { readonly status: number; readonly stdout: string; readonly stderr: string }): ObservedBehavior => {
  const terminalRecord = new RegExp(`(?:^|\\n)${thrownSentinel}([^\\n]+)\\n$`);
  const match = terminalRecord.exec(run.stderr);
  if (match === null) {
    return { exitCode: run.status, stdout: run.stdout, stderr: run.stderr };
  }
  const thrown = parseThrownObservation(match[1]);
  let sentinelStart = match.index;
  if (match[0].startsWith("\n")) {
    sentinelStart += 1;
  }
  return {
    exitCode: run.status,
    stdout: run.stdout,
    stderr: run.stderr.slice(0, sentinelStart),
    thrown
  };
};

const uncaughtErrorPattern = /^([A-Za-z_$][\w$]*Error|Error):(?: (.*))?$/;

export const nativeBehavior = (run: { readonly status: number; readonly stdout: string; readonly stderr: string }): ObservedBehavior => {
  if (run.status !== 1 || !run.stdout.endsWith("\n")) {
    return { exitCode: run.status, stdout: run.stdout, stderr: run.stderr };
  }
  const withoutTerminalNewline = run.stdout.slice(0, -1);
  const previousNewline = withoutTerminalNewline.lastIndexOf("\n");
  const display = withoutTerminalNewline.slice(previousNewline + 1);
  let stdout = "";
  if (previousNewline !== -1) {
    stdout = withoutTerminalNewline.slice(0, previousNewline + 1);
  }
  const error = uncaughtErrorPattern.exec(display);
  let thrown: ThrownObservation = { kind: "value", display };
  if (error !== null) {
    thrown = { kind: "error", name: error[1], message: error[2] || "" };
  }
  return { exitCode: run.status, stdout, stderr: run.stderr, thrown };
};

export const behaviorsEqual = (left: ObservedBehavior, right: ObservedBehavior): boolean =>
  JSON.stringify(left) === JSON.stringify(right);
