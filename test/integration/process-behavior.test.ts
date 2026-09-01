/* eslint-disable unicorn/no-null */
import { describe, expect, it } from "vitest";
import {
  nativeBehavior,
  nodeBehavior,
  thrownSentinel,
} from "../../src/testing/process-behavior.js";

const sentinelRecord = (payload: unknown): string =>
  `${thrownSentinel}${JSON.stringify(payload)}\n`;

const malformedRecord = (raw: string): string => `${thrownSentinel}${raw}\n`;

describe("nodeBehavior", () => {
  it("preserves successful process output with no sentinel", () => {
    const run = { status: 0, stdout: "hi\n", stderr: "" };
    expect(nodeBehavior(run)).toEqual({
      exitCode: 0,
      stdout: "hi\n",
      stderr: "",
    });
  });

  it("preserves stdout and exit code when stderr has no sentinel", () => {
    const run = { status: 0, stdout: "out\n", stderr: "some output\nno sentinel here\n" };
    expect(nodeBehavior(run)).toEqual({
      exitCode: 0,
      stdout: "out\n",
      stderr: "some output\nno sentinel here\n",
    });
  });

  it("returns stderr and stdout unchanged when sentinel is not in stderr", () => {
    const run = { status: 1, stdout: "hello\n", stderr: "Error: foo\n" };
    expect(nodeBehavior(run)).toEqual({
      exitCode: 1,
      stdout: "hello\n",
      stderr: "Error: foo\n",
    });
  });

  it("strips sentinel at start of stderr and returns error observation", () => {
    const payload = { kind: "error", name: "TypeError", message: "oops" };
    const run = { status: 1, stdout: "", stderr: sentinelRecord(payload) };
    expect(nodeBehavior(run)).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: "",
      thrown: { kind: "error", name: "TypeError", message: "oops" },
    });
  });

  it("preserves stderr prefix before sentinel and correctly computes sentinelStart after leading newline", () => {
    const payload = { kind: "error", name: "TypeError", message: "oops" };
    const run = {
      status: 1,
      stdout: "kept\n",
      stderr: `warn: something\n${sentinelRecord(payload)}`,
    };
    expect(nodeBehavior(run)).toEqual({
      exitCode: 1,
      stdout: "kept\n",
      stderr: "warn: something\n",
      thrown: { kind: "error", name: "TypeError", message: "oops" },
    });
  });

  it("handles uncaught Error payload", () => {
    const payload = { kind: "error", name: "Error", message: "boom" };
    const run = { status: 1, stdout: "", stderr: sentinelRecord(payload) };
    expect(nodeBehavior(run)).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: "",
      thrown: { kind: "error", name: "Error", message: "boom" },
    });
  });

  it("handles uncaught non-error value payload", () => {
    const payload = { kind: "value", display: "42" };
    const run = { status: 1, stdout: "", stderr: sentinelRecord(payload) };
    expect(nodeBehavior(run)).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: "",
      thrown: { kind: "value", display: "42" },
    });
  });

  it("handles non-error value with preceding stderr", () => {
    const payload = { kind: "value", display: "hello world" };
    const run = {
      status: 1,
      stdout: "",
      stderr: `prefix\n${sentinelRecord(payload)}`,
    };
    expect(nodeBehavior(run)).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: "prefix\n",
      thrown: { kind: "value", display: "hello world" },
    });
  });

  it("does not treat sentinel as thrown when it is not the final stderr record", () => {
    const payload = { kind: "error", name: "Error", message: "oops" };
    const run = {
      status: 1,
      stdout: "",
      stderr: `${sentinelRecord(payload)}extra\n`,
    };
    expect(nodeBehavior(run)).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: `${sentinelRecord(payload)}extra\n`,
    });
  });

  it("does not treat sentinel as thrown when trailing content follows after prefix sentinel", () => {
    const payload = { kind: "value", display: "42" };
    const run = {
      status: 1,
      stdout: "",
      stderr: `warn\n${sentinelRecord(payload)}trailing\n`,
    };
    expect(nodeBehavior(run)).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: `warn\n${sentinelRecord(payload)}trailing\n`,
    });
  });

  it("does not treat sentinel fragment without trailing newline as thrown", () => {
    const payload = { kind: "error", name: "Error", message: "oops" };
    const fragment = `${thrownSentinel}${JSON.stringify(payload)}`; // no \n
    const run = { status: 1, stdout: "", stderr: fragment };
    expect(nodeBehavior(run)).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: fragment,
    });
  });

  it("preserves exitCode for successful run with stdout and sentinel", () => {
    // sentinel can appear even with status 0; exitCode is preserved verbatim
    const payload = { kind: "value", display: "thrown" };
    const run = { status: 0, stdout: "hi\n", stderr: sentinelRecord(payload) };
    const result = nodeBehavior(run);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("hi\n");
    expect(result.stderr).toBe("");
    expect(result.thrown).toEqual({ kind: "value", display: "thrown" });
  });

  describe("protocol errors throw instead of returning thrown: undefined", () => {
    it("throws on malformed sentinel JSON", () => {
      const run = { status: 1, stdout: "", stderr: malformedRecord("not-json") };
      expect(() => nodeBehavior(run)).toThrow(/invalid Node thrown sentinel payload/);
    });

    it("throws with malformed JSON message marker", () => {
      const run = { status: 1, stdout: "", stderr: malformedRecord("{not: json}") };
      expect(() => nodeBehavior(run)).toThrow(/malformed JSON/);
    });

    it("throws on malformed sentinel JSON even with stderr prefix", () => {
      const run = { status: 1, stdout: "", stderr: `warn\n${malformedRecord("oops")}` };
      expect(() => nodeBehavior(run)).toThrow(/invalid Node thrown sentinel payload/);
    });

    it.each([
      ["null payload", null],
      ["array payload", []],
      ["empty object", {}],
      ["missing kind", { name: "Error", message: "x" }],
      ["unknown kind", { kind: "unknown", foo: "bar" }],
      ["error with numeric name", { kind: "error", name: 123, message: "x" }],
      ["error with numeric message", { kind: "error", name: "Error", message: 123 }],
      ["error missing message", { kind: "error", name: "Error" }],
      ["error missing name", { kind: "error", message: "x" }],
      ["value with numeric display", { kind: "value", display: 123 }],
      ["value missing display", { kind: "value" }],
      ["value with null display", { kind: "value", display: null }],
      ["kind error without payload fields", { kind: "error" }],
    ])("throws on structurally invalid payload: %s", (_label, payload) => {
      const run = { status: 1, stdout: "", stderr: sentinelRecord(payload) };
      expect(() => nodeBehavior(run)).toThrow(/invalid Node thrown sentinel payload/);
    });

    it("throws on structurally invalid payload with prefix", () => {
      const payload = { kind: "error", name: 123, message: "x" };
      const run = { status: 1, stdout: "", stderr: `prefix\n${sentinelRecord(payload)}` };
      expect(() => nodeBehavior(run)).toThrow(/invalid Node thrown sentinel payload/);
    });
  });
});

describe("nativeBehavior", () => {
  it("returns as-is when status is not 1", () => {
    const run = { status: 0, stdout: "Error: foo\n", stderr: "" };
    expect(nativeBehavior(run)).toEqual({
      exitCode: 0,
      stdout: "Error: foo\n",
      stderr: "",
    });
  });

  it("returns as-is when status is 2 even with error-like stdout", () => {
    const run = { status: 2, stdout: "TypeError: boom\n", stderr: "err\n" };
    expect(nativeBehavior(run)).toEqual({
      exitCode: 2,
      stdout: "TypeError: boom\n",
      stderr: "err\n",
    });
  });

  it("returns as-is when stdout lacks terminal newline", () => {
    const run = { status: 1, stdout: "TypeError: boom", stderr: "" };
    expect(nativeBehavior(run)).toEqual({
      exitCode: 1,
      stdout: "TypeError: boom",
      stderr: "",
    });
  });

  it("returns as-is when stdout is empty and status 1 but no newline", () => {
    const run = { status: 1, stdout: "", stderr: "" };
    expect(nativeBehavior(run)).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: "",
    });
  });

  it("splits single error line with no previous newline into thrown and empty stdout", () => {
    const run = { status: 1, stdout: "TypeError: boom\n", stderr: "" };
    expect(nativeBehavior(run)).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: "",
      thrown: { kind: "error", name: "TypeError", message: "boom" },
    });
  });

  it("preserves stderr for native error", () => {
    const run = { status: 1, stdout: "TypeError: boom\n", stderr: "native err\n" };
    expect(nativeBehavior(run)).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: "native err\n",
      thrown: { kind: "error", name: "TypeError", message: "boom" },
    });
  });

  it("splits multi-line stdout into preserved prefix and thrown display via previousNewline", () => {
    const run = { status: 1, stdout: "first\nsecond\nError: hello\n", stderr: "" };
    expect(nativeBehavior(run)).toEqual({
      exitCode: 1,
      stdout: "first\nsecond\n",
      stderr: "",
      thrown: { kind: "error", name: "Error", message: "hello" },
    });
  });

  it("handles terminal value line without error pattern", () => {
    const run = { status: 1, stdout: "hello\nworld\n", stderr: "" };
    // withoutTerminalNewline = "hello\nworld", previousNewline=5, display="world"
    expect(nativeBehavior(run)).toEqual({
      exitCode: 1,
      stdout: "hello\n",
      stderr: "",
      thrown: { kind: "value", display: "world" },
    });
  });

  it("handles single value line without error pattern", () => {
    const run = { status: 1, stdout: "hello world\n", stderr: "" };
    expect(nativeBehavior(run)).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: "",
      thrown: { kind: "value", display: "hello world" },
    });
  });

  it("preserves stdout prefix for value throw with multiple lines", () => {
    const run = { status: 1, stdout: "a\nb\nc\n", stderr: "" };
    // display "c", stdout "a\nb\n"
    expect(nativeBehavior(run)).toEqual({
      exitCode: 1,
      stdout: "a\nb\n",
      stderr: "",
      thrown: { kind: "value", display: "c" },
    });
  });

  it("preserves exitCode and stderr for value throw", () => {
    const run = { status: 1, stdout: "hello\nworld\n", stderr: "keep\n" };
    const result = nativeBehavior(run);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("keep\n");
    expect(result.stdout).toBe("hello\n");
    expect(result.thrown).toEqual({ kind: "value", display: "world" });
  });

  describe("error name and message parsing", () => {
    it.each([
      ["Error with message", "Error: hello\n", "Error", "hello"],
      ["TypeError with message", "TypeError: boom\n", "TypeError", "boom"],
      ["RangeError with message", "RangeError: out of range\n", "RangeError", "out of range"],
      ["CustomError ending with Error", "CustomError: x\n", "CustomError", "x"],
      ["SyntaxError", "SyntaxError: unexpected token\n", "SyntaxError", "unexpected token"],
      ["ReferenceError", "ReferenceError: x is not defined\n", "ReferenceError", "x is not defined"],
      ["URIError", "URIError: bad\n", "URIError", "bad"],
      ["$Error with dollar prefix", "$Error: hi\n", "$Error", "hi"],
      ["_MyError with underscore prefix", "_MyError: hi\n", "_MyError", "hi"],
      ["My_Error with underscore", "My_Error: hi\n", "My_Error", "hi"],
      ["MyError123 numeric suffix", "MyError123: hi\n", null, null], // digits after Error break pattern? Actually \w includes digits, so MyError123 does not end with Error, but Error suffix check: [A-Za-z_$][\w$]*Error matches ... Error only at end, MyError123 ends with digits => should be value
    ])("%s", (_label, stdout, expectedName, expectedMessage) => {
      const run = { status: 1, stdout, stderr: "" };
      const result = nativeBehavior(run);
      if (expectedName === null) {
        // expected to be value throw
        expect(result.thrown).toEqual({ kind: "value", display: stdout.slice(0, -1) });
      } else {
        expect(result.thrown).toEqual({ kind: "error", name: expectedName, message: expectedMessage });
      }
    });

    it("parses error with empty message via bare colon", () => {
      const run = { status: 1, stdout: "Error:\n", stderr: "" };
      expect(nativeBehavior(run)).toEqual({
        exitCode: 1,
        stdout: "",
        stderr: "",
        thrown: { kind: "error", name: "Error", message: "" },
      });
    });

    it("parses error with colon-space but empty message", () => {
      const run = { status: 1, stdout: "TypeError: \n", stderr: "" };
      expect(nativeBehavior(run)).toEqual({
        exitCode: 1,
        stdout: "",
        stderr: "",
        thrown: { kind: "error", name: "TypeError", message: "" },
      });
    });

    it("parses error with spaces in message", () => {
      const run = { status: 1, stdout: "Error: hello world with spaces\n", stderr: "" };
      expect(nativeBehavior(run)).toEqual({
        exitCode: 1,
        stdout: "",
        stderr: "",
        thrown: { kind: "error", name: "Error", message: "hello world with spaces" },
      });
    });

    it("treats non-Error suffix as value", () => {
      const run = { status: 1, stdout: "Foo: bar\n", stderr: "" };
      expect(nativeBehavior(run)).toEqual({
        exitCode: 1,
        stdout: "",
        stderr: "",
        thrown: { kind: "value", display: "Foo: bar" },
      });
    });

    it("treats lower-case error as value", () => {
      // pattern requires [A-Za-z_$] then \w then Error; 'typeError' would still match because it ends with Error, so use 'error: foo' for a truly non-matching case
      const run2 = { status: 1, stdout: "error: foo\n", stderr: "" };
      expect(nativeBehavior(run2)).toEqual({
        exitCode: 1,
        stdout: "",
        stderr: "",
        thrown: { kind: "value", display: "error: foo" },
      });
    });

    it("treats message without error prefix as value", () => {
      const run = { status: 1, stdout: "hello world\n", stderr: "" };
      expect(nativeBehavior(run).thrown).toEqual({ kind: "value", display: "hello world" });
    });
  });

  describe("previousNewline edge cases", () => {
    it("handles stdout with only a newline as terminal", () => {
      const run = { status: 1, stdout: "\n", stderr: "" };
      // withoutTerminalNewline = "", previousNewline -1, display ""
      expect(nativeBehavior(run)).toEqual({
        exitCode: 1,
        stdout: "",
        stderr: "",
        thrown: { kind: "value", display: "" },
      });
    });

    it("handles stdout ending with error after double newline prefix", () => {
      const run = { status: 1, stdout: "a\n\nTypeError: boom\n", stderr: "" };
      expect(nativeBehavior(run)).toEqual({
        exitCode: 1,
        stdout: "a\n\n",
        stderr: "",
        thrown: { kind: "error", name: "TypeError", message: "boom" },
      });
    });
  });
});
