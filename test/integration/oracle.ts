import { expect } from "vitest";
import { Effect } from "effect";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { TraceMapModule, TraceMapOperation, TraceMapV1 } from "../../src/compiler/trace.js";
import { type ObservedBehavior, nativeBehavior, nodeBehavior, nodeModuleWrapperSource } from "../../src/testing/process-behavior.js";
import {
  type CapturedRun,
  type CompileResult,
  captureCommand,
  commandExecutorLayer,
  compileFixture,
  expectLlvmAsVerificationIfAvailable,
  repoRoot,
  runNativeIfAvailable
} from "./helpers.js";

export interface OracleOptions {
  readonly verifyLlvm?: boolean;
  readonly keepArtifactsOnFailure?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTraceMapModule(value: unknown): value is TraceMapModule {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.fileName === "string" &&
    typeof value.statementCount === "number" &&
    value.loweringMode === "native" &&
    Array.isArray(value.operationIds) &&
    value.operationIds.every((id) => typeof id === "string");
}

function isTraceMapOperation(value: unknown): value is TraceMapOperation {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.moduleId === "string" &&
    typeof value.kind === "string" &&
    (value.origin === "source" || value.origin === "synthesized") &&
    Array.isArray(value.llvmRanges);
}

function parseTraceMap(contents: string): TraceMapV1 {
  const value: unknown = JSON.parse(contents);
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.entry !== "string" ||
    !Array.isArray(value.modules) ||
    !Array.isArray(value.operations)
  ) {
    throw new Error("trace-map.json does not match the TraceMapV1 envelope");
  }
  if (!value.modules.every(isTraceMapModule)) {
    throw new Error("trace-map.json contains an invalid module record");
  }
  if (!value.operations.every(isTraceMapOperation)) {
    throw new Error("trace-map.json contains an invalid operation record");
  }
  return {
    version: 1,
    entry: value.entry,
    modules: value.modules,
    operations: value.operations
  };
}

async function runFixtureWithNode(fixture: string): Promise<CapturedRun> {
  const fixtureUrl = pathToFileURL(path.join(repoRoot, "test/fixtures", fixture)).href;
  return Effect.runPromise(
    captureCommand(process.execPath, ["--input-type=module", "--eval", nodeModuleWrapperSource, fixtureUrl], { cwd: repoRoot }).pipe(
      Effect.provide(commandExecutorLayer)
    )
  );
}

function formatFailure(
  fixture: string,
  outDir: string,
  native: ObservedBehavior | undefined,
  node: ObservedBehavior | undefined
): string {
  const sections = [
    `Correctness oracle failed for ${fixture}`,
    `Native behavior:\n${JSON.stringify(native, undefined, 2)}`,
    `Node behavior:\n${JSON.stringify(node, undefined, 2)}`,
    `main.ll: ${path.join(outDir, "main.ll")}`,
    `trace-map.json: ${path.join(outDir, "trace-map.json")}`
  ];
  return sections.join("\n\n");
}

function compilerIsAvailable(result: CompileResult, failureMessage: string): boolean {
  if (result.status === 0) {
    return true;
  }
  if (result.stderr.includes("clang was not found")) {
    expect(result.stderr).toContain("clang was not found");
    return false;
  }
  throw new Error(failureMessage);
}

export async function expectNativeMatchesNodeIfAvailable(
  fixture: string,
  options: OracleOptions = {}
): Promise<void> {
  const keepArtifactsOnFailure = options.keepArtifactsOnFailure ?? true;
  const result = await compileFixture(fixture, { link: true });
  let succeeded = false;
  let native: ObservedBehavior | undefined;
  let node: ObservedBehavior | undefined;

  try {
    if (!compilerIsAvailable(result, formatFailure(fixture, result.outDir, native, node))) {
      succeeded = true;
      return;
    }

    // Every module must lower natively; the compiler no longer has a
    // compile-time fallback mode, so the trace-map envelope rejects anything
    // but `loweringMode: "native"`.
    parseTraceMap(await result.readArtifact("trace-map.json"));

    const nativeRun = await runNativeIfAvailable(result);
    if (nativeRun.skipped) {
      expect(nativeRun.reason).toContain("ENOENT");
      expect(await result.readArtifact("diagnostics.txt")).toContain("clang was not found");
      succeeded = true;
      return;
    }
    native = nativeBehavior({
      status: nativeRun.status ?? -1,
      stdout: nativeRun.stdout ?? "",
      stderr: nativeRun.stderr ?? ""
    });
    node = nodeBehavior(await runFixtureWithNode(fixture));
    expect(native, formatFailure(fixture, result.outDir, native, node)).toEqual(node);

    if (options.verifyLlvm === true) {
      await expectLlvmAsVerificationIfAvailable(result);
    }
    succeeded = true;
  } finally {
    if (succeeded || !keepArtifactsOnFailure) {
      await result.cleanup();
    }
  }
}

/**
 * Every fixture whose native output is compared against Node's.
 *
 * A fixture belongs here only if it is genuinely Node-equivalent, and that is a judgement about the
 * fixture rather than a shape a filename can express. `array-runtime-find-index.ts` is a *passing*
 * fixture that calls `arr.findIndex()` with no callback, which throws in Node, so listing it here
 * would demand a match the compiler deliberately does not deliver. A fixture like that belongs in a
 * unit test, and its member belongs in the support table as `"stubbed"` with the divergence written
 * down rather than as `"supported"` — this list is what backs that claim, so an entry that is not
 * here is not `"supported"`.
 *
 * One admitted form is deliberately absent: `accessor x = 1`. Node 22's type stripper rejects the
 * keyword with a `SyntaxError` before running anything, so there is no Node output to compare and
 * the oracle cannot be the evidence. `core.test.ts` asserts its native output instead, and says why.
 */
export const oracleFixtures: readonly string[] = [
  "hello.ts",
  "multiple-prints.ts",
  "while-loop.ts",
  "const-number-addition.ts",
  "boolean-coercion-supported-values.ts",
  "function-call.ts",
  "nested-function-declaration.ts",
  "nested-function-in-try.ts",
  "function-value-variable-call.ts",
  "function-value-arrow-call.ts",
  "function-value-argument-call.ts",
  "function-value-property-call.ts",
  "function-value-string-closure.ts",
  "function-value-independent-closures.ts",
  "function-value-method-this.ts",
  "function-value-identity.ts",
  "function-constructor-object-return.ts",
  "catch-destructure-default-throws.ts",
  "catch-destructure-default-lazy.ts",
  "catch-destructure-object-default.ts",
  "gc-catch-destructure-default.ts",
  "array-runtime-push-pop.ts",
  "object-runtime-dynamic-store.ts",
  "map-basic-set-get.ts",
  "set-basic-add-has.ts",
  "string-runtime-trim-methods.ts",
  "math-basic-number-functions.ts",
  "number-coercion-primitives.ts",
  "json-parse-primitives.ts",
  "json-parse-dynamic-unsupported.ts",
  "json-parse-reviver-unsupported.ts",
  "destructure-nested.ts",
  "destructure-default-function-name.ts",
  "function-name-length-descriptors.ts",
  "destructure-builtin-iterables.ts",
  "destructure-iterator-protocol.ts",
  "destructure-iterator-override.ts",
  "destructure-non-iterable.ts",
  "destructure-iterator-default-rest.ts",
  "destructure-iterator-nested.ts",
  "destructure-iterator-parameter.ts",
  "destructure-iterator-close.ts",
  "array-iterable-spread.ts",
  "array-iterable-spread-close.ts",
  "call-iterable-spread.ts",
  "call-method-spread.ts",
  "call-spread-into-rest-literal.ts",
  "call-spread-into-rest-literal-string.ts",
  "call-spread-into-rest-after-parameter.ts",
  "call-spread-into-non-rest-unsupported.ts",
  "regex-literal-test.ts",
  "regex-literal-exec.ts",
  "regex-literal-global-last-index.ts",
  "regex-string-match.ts",
  "regex-flags-and-source.ts",
  "regex-constructor-literal.ts",
  "regex-constructor-dynamic-unsupported.ts",
  "regex-nonascii-unsupported.ts",
  "string-replace-regex-unsupported.ts",
  "regex-engine-semantics.ts",
  "regex-captures-backreference.ts",
  "regex-string-search.ts",
  "regex-string-split.ts",
  "regex-string-global-match.ts",
  "regex-string-replace-semantics.ts",
  "regex-constructor-invalid.ts",
  "array-runtime-map-thisarg.ts",
  "array-runtime-callback-thisarg-methods.ts",
  "array-runtime-arrow-thisarg-evaluation.ts",
  "array-runtime-reduce-initial-not-thisarg.ts",
  "array-runtime-reduce-right-initial-not-thisarg.ts",
  "array-runtime-thisarg-strict-values.ts",
  "array-runtime-map-thisarg-in-function.ts",
  "array-runtime-property-thisarg.ts",
  "array-runtime-arrow-lexical-this.ts",
  "class-basic-method.ts",
  "class-method-discarded-call.ts",
  "this-parameter-declaration.ts",
  "this-parameter-method.ts",
  "optional-call-absent-member.ts",
  "optional-call-present-member.ts",
  "class-extends-super-constructor.ts",
  "class-instanceof-inheritance.ts",
  "class-inheritance-construction.ts",
  "class-inherited-members.ts",
  "class-static-inheritance.ts",
  "class-expression-unsupported.ts",
  "class-expression-instance.ts",
  "class-expression-named.ts",
  "class-computed-field-unsupported.ts",
  "class-computed-members.ts",
  "class-private-field-unsupported.ts",
  "gc-retain-live.ts",
  "throw-string-top-level.ts",
  "throw-across-function-caught.ts",
  "throw-across-function-value.ts",
  "throw-across-array-callback.ts",
  "throw-nested-rethrow.ts",
  "gc-retain-thrown-value.ts",
  "for-of-user-iterator.ts",
  "for-of-iterator-assigned.ts",
  "for-of-class-iterator.ts",
  "for-of-iterator-nested-break.ts",
  "for-of-iterator-caught-throw.ts",
  "for-of-iterator-missing.ts",
  "for-of-iterator-non-callable.ts",
  "for-of-iterator-method-primitive.ts",
  "for-of-iterator-next-non-callable.ts",
  "for-of-iterator-result-primitive.ts",
  "for-of-iterator-throws.ts",
  "for-of-iterator-next-throws.ts",
  "try-finally-basic.ts",
  "try-catch-finally.ts",
  "try-finally-return.ts",
  "try-finally-throw.ts",
  "try-finally-nested.ts",
  "try-finally-nested-pending.ts",
  "try-finally-precedence.ts",
  "try-finally-break-continue.ts",
  "for-of-iterator-break-close.ts",
  "for-of-iterator-return-close.ts",
  "for-of-iterator-throw-close.ts",
  "for-of-iterator-continue-no-close.ts",
  "for-of-iterator-close-order.ts",
  "for-of-iterator-return-throws.ts",
  "for-of-iterator-return-non-callable.ts",
  "for-of-iterator-close-semantics.ts",
  "for-of-iterator-propagated-throw.ts",
  "gc-try-finally-return.ts",
  "gc-cleanup-pending-values.ts",
  "collection-runtime-get.ts",
  "collection-runtime-set.ts",
  "collection-runtime-add.ts",
  "collection-runtime-has.ts",
  "collection-runtime-delete.ts",
  "collection-runtime-size.ts",
  "json-runtime-parse.ts",
  "json-runtime-stringify.ts",
  "regexp-runtime-test.ts",
  "regexp-runtime-exec.ts",
  "regexp-runtime-source.ts",
  "regexp-runtime-flags.ts",
  "regexp-runtime-last-index.ts",
  "error-runtime-name.ts",
  "error-runtime-message.ts",
  "error-runtime-to-string.ts",
  "error-runtime-cause.ts",
  "iterator-runtime-symbol-iterator.ts",
  "form-admitted-this-parameter.ts",
  "form-admitted-readonly-modifier.ts",
  "form-admitted-public-modifier.ts",
  "form-admitted-private-modifier.ts",
  "form-admitted-override-modifier.ts",
  "form-admitted-computed-object-method.ts",
  "form-admitted-satisfies-operator.ts",
  "form-admitted-optional-parameter.ts",
  "form-admitted-implements-clause.ts",
  "form-admitted-class-type-parameters.ts",
  "form-admitted-function-overload-signature.ts",
  "form-admitted-abstract-member.ts",
  "form-admitted-declare-member.ts",
] as const;
