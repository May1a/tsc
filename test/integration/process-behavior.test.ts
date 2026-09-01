import { describe, expect, test } from "vitest";
import { nodeScriptWrapperSource } from "../../src/test262/behavior.js";
import {
  type ObservedBehavior,
  type ProcessOutput,
  nativeBehavior,
  nodeBehavior,
  nodeModuleWrapperSource,
  thrownSentinel
} from "../../src/testing/process-behavior.js";

const record = (payload: string): string => `${thrownSentinel}${payload}\n`;
const errorPayload = (name: string, message: string): string => JSON.stringify({ kind: "error", name, message });
const valuePayload = (display: string): string => JSON.stringify({ kind: "value", display });

const run = (overrides: Partial<ProcessOutput>): ProcessOutput => ({
  status: 0,
  stdout: "",
  stderr: "",
  ...overrides
});

const nodeBehaviorCases: readonly {
  readonly name: string;
  readonly run: ProcessOutput;
  readonly expected: ObservedBehavior;
}[] = [
  {
    name: "passes a normal successful process through unchanged",
    run: run({ status: 0, stdout: "hello\n", stderr: "" }),
    expected: { exitCode: 0, stdout: "hello\n", stderr: "" }
  },
  {
    name: "keeps stderr preceding the sentinel record",
    run: run({ status: 1, stderr: `warning\n${record(errorPayload("TypeError", "boom"))}` }),
    expected: { exitCode: 1, stdout: "", stderr: "warning\n", thrown: { kind: "error", name: "TypeError", message: "boom" } }
  },
  {
    name: "decodes an uncaught Error at the start of stderr",
    run: run({ status: 1, stderr: record(errorPayload("RangeError", "out of range")) }),
    expected: { exitCode: 1, stdout: "", stderr: "", thrown: { kind: "error", name: "RangeError", message: "out of range" } }
  },
  {
    name: "decodes an uncaught non-error value",
    run: run({ status: 1, stderr: record(valuePayload("42")) }),
    expected: { exitCode: 1, stdout: "", stderr: "", thrown: { kind: "value", display: "42" } }
  },
  {
    name: "ignores a sentinel that is not the final stderr record",
    run: run({ status: 1, stdout: "out\n", stderr: `${record(valuePayload("x"))}extra output\n` }),
    expected: { exitCode: 1, stdout: "out\n", stderr: `${record(valuePayload("x"))}extra output\n` }
  }
];

const nodeProtocolErrorCases: readonly { readonly name: string; readonly stderr: string }[] = [
  {
    name: "rejects malformed sentinel JSON",
    stderr: record("{not json")
  },
  {
    name: "rejects a sentinel payload missing required fields",
    stderr: record('{"kind":"error"}')
  },
  {
    name: "rejects a sentinel payload with an unknown kind",
    stderr: record('{"kind":"bogus","display":"x"}')
  },
  {
    name: "rejects a sentinel payload with non-string fields",
    stderr: record('{"kind":"error","name":1,"message":"x"}')
  }
];

const nativeBehaviorCases: readonly {
  readonly name: string;
  readonly run: ProcessOutput;
  readonly expected: ObservedBehavior;
}[] = [
  {
    name: "extracts an uncaught Error from a terminal stdout line",
    run: run({ status: 1, stdout: "before\nTypeError: boom\n", stderr: "ignored" }),
    expected: { exitCode: 1, stdout: "before\n", stderr: "ignored", thrown: { kind: "error", name: "TypeError", message: "boom" } }
  },
  {
    name: "keeps stdout unchanged without a terminal newline",
    run: run({ status: 1, stdout: "TypeError: boom" }),
    expected: { exitCode: 1, stdout: "TypeError: boom", stderr: "" }
  },
  {
    name: "keeps an error-looking line on success status",
    run: run({ status: 0, stdout: "TypeError: not thrown\n" }),
    expected: { exitCode: 0, stdout: "TypeError: not thrown\n", stderr: "" }
  },
  {
    name: "treats a non-error terminal line as a value",
    run: run({ status: 1, stdout: "before\nweird failure\n" }),
    expected: { exitCode: 1, stdout: "before\n", stderr: "", thrown: { kind: "value", display: "weird failure" } }
  },
  {
    name: "decodes an Error with an empty message",
    run: run({ status: 1, stdout: "TypeError:\n" }),
    expected: { exitCode: 1, stdout: "", stderr: "", thrown: { kind: "error", name: "TypeError", message: "" } }
  },
  {
    name: "keeps colons inside the error message",
    run: run({ status: 1, stdout: "TypeError: a: b\n" }),
    expected: { exitCode: 1, stdout: "", stderr: "", thrown: { kind: "error", name: "TypeError", message: "a: b" } }
  }
];

describe("nodeBehavior", () => {
  test.each(nodeBehaviorCases)("$name", ({ run: output, expected }) => {
    expect(nodeBehavior(output)).toEqual(expected);
  });
  test.each(nodeProtocolErrorCases)("$name", ({ stderr }) => {
    expect(() => nodeBehavior(run({ status: 1, stderr }))).toThrow(thrownSentinel);
  });
});

describe("nativeBehavior", () => {
  test.each(nativeBehaviorCases)("$name", ({ run: output, expected }) => {
    expect(nativeBehavior(output)).toEqual(expected);
  });
});

describe("Node wrapper framing", () => {
  test("module wrapper carries the print shim, module import, and sentinel record", () => {
    expect(nodeModuleWrapperSource).toContain("globalThis.print = (value) => {");
    expect(nodeModuleWrapperSource).toContain("await import(process.argv[1]);");
    expect(nodeModuleWrapperSource).toContain(thrownSentinel);
  });
  test("script wrapper carries the transpile hook and the same sentinel record", () => {
    expect(nodeScriptWrapperSource).toContain("require.extensions");
    expect(nodeScriptWrapperSource).toContain(thrownSentinel);
  });
});
