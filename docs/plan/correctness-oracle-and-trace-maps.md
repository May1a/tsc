# Correctness Oracle And Operation-Level Trace Maps

This compiler-quality slice was delivered as one combined PR, implemented internally as ordered
checkpoints. It adds a curated Node correctness oracle and deterministic operation-level source tracing
without expanding the supported JavaScript language surface. The master roadmap remains
`docs/PLAN.md`.

## Correctness Oracle

The opt-in integration suite compiles selected native fixtures with linking enabled, validates the trace
artifact, runs the executable and the same fixture under Node 22, and compares the complete observed
behavior. Existing handwritten-output and unsupported-diagnostic tests remain in place.

Node runs through `process.execPath` with `--input-type=module` and an inline ESM wrapper. The fixture is
passed to the wrapper as a file URL. The wrapper installs this native-CLI-compatible output function:

```ts
globalThis.print = (value) => {
  process.stdout.write(`${String(value)}\n`);
};
```

The wrapper dynamically imports the fixture inside `try/catch`. A thrown `Error` is written as one
terminal machine-readable stderr record containing `kind`, `name`, and `message`. Any other thrown
value is recorded with `kind: "value"` and `display: String(thrown)`. The harness removes only that
terminal sentinel record; it never emits or compares a Node stack trace.

Native and Node observations use this model:

```ts
type ThrownObservation =
  | { readonly kind: "error"; readonly name: string; readonly message: string }
  | { readonly kind: "value"; readonly display: string };

type ObservedBehavior = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly thrown?: ThrownObservation;
};
```

Native status zero preserves both streams exactly and has no `thrown` field. Native status one removes
the final newline-terminated stdout line and interprets it as the thrown-value presentation. A
`NameError: message`-shaped presentation becomes an error observation; every other presentation becomes
a value observation. Other statuses preserve the raw streams and do not infer a thrown value. No
whitespace, line-ending, numeric, or error-message normalization is performed.

Oracle fixtures must use native lowering by default. A module marked `compileTimeFallback` makes the
assertion fail before either executable is compared. Inline C++ remains native lowering but is excluded
because it is a compiler extension with no Node equivalent. Direct Node execution also excludes the
import fixture whose `.js` specifier intentionally resolves to a `.ts` project file in the compiler.
Clang absence retains the existing missing-tool diagnostic and skip behavior. Successful comparisons
remove temporary artifacts; failed comparisons retain `main.ll` and `trace-map.json` by default.

## IR Trace Metadata And Provenance

Operations use the existing one-based start-only `SourceSpan` from `src/compiler/diagnostics.ts`:

```ts
type JsIrOperationNode =
  | /* operation variants */;

type JsIrTraceOrigin = "source" | "synthesized";

type JsIrOperationTrace = {
  readonly id: string;
  readonly source?: SourceSpan;
  readonly origin: JsIrTraceOrigin;
};

type JsIrOperation = JsIrOperationNode & {
  readonly trace?: JsIrOperationTrace;
};

type JsIrLoweringMode = "native" | "compileTimeFallback";

type JsIrSourceModule = {
  readonly fileName: string;
  readonly statementCount: number;
  readonly loweringMode: JsIrLoweringMode;
  readonly operations: readonly JsIrOperation[];
};
```

Trace metadata is optional while constructing IR and required after module finalization. Statement
lowering records the source statement start. Generated destructuring bindings, callback adapters, class
setup, and other untraced children inherit their parent's source and use `origin: "synthesized"`.
Function bodies, blocks, conditional branches, loop initializers and bodies, switch clauses, callbacks,
and return-closure bodies share one exhaustive operation-child traversal for finalization and artifact
flattening.

Module order follows the deterministic frontend `sourceFiles` order. A depth-first, parent-before-child
walk assigns local operation IDs in emitted/source order:

```text
m0:o000000
m0:o000001
m1:o000000
```

Successful ordinary and real-class lowering uses `native`. Every B683 interpreter result, including its
diagnostic path, uses `compileTimeFallback`. Inline C++ uses `native`.

## LLVM Markers And V1 Trace Map

LLVM generation is a single operation returning both artifacts:

```ts
type LlvmEmission = {
  readonly llvmIr: string;
  readonly traceMap: TraceMapV1;
};

emitLlvmModule(module: JsIrModule): LlvmEmission;
```

Every operation is surrounded by explicit comments. Zero-code operations retain adjacent markers.
Function operations wrap their complete definition while their bodies retain individual markers. An
operation that contributes to both a generated callback and a call site repeats the same marker ID.

```llvm
; tscn-trace-start m0:o000004 print /path/file.ts:8:3 source
  call void @valuePrint(...)
; tscn-trace-end m0:o000004
```

After the final LLVM document is assembled, the emitter scans only these explicit markers. Unknown,
unmatched, or misnested IDs are internal compiler errors. LLVM line numbers are one-based and inclusive;
marker-comment lines are excluded. Adjacent markers produce no ranges, and repeated or split generated
locations can produce multiple ranges for one operation.

`trace-map.json` is serialized with two-space indentation and one trailing newline. Its V1 schema is:

```ts
type LlvmLineRange = {
  readonly startLine: number;
  readonly endLine: number;
};

type TraceMapOperation = {
  readonly id: string;
  readonly moduleId: string;
  readonly kind: JsIrOperation["kind"];
  readonly source: SourceSpan | null;
  readonly origin: JsIrTraceOrigin;
  readonly llvmRanges: readonly LlvmLineRange[];
};

type TraceMapModule = {
  readonly id: string;
  readonly fileName: string;
  readonly statementCount: number;
  readonly loweringMode: JsIrLoweringMode;
  readonly operationIds: readonly string[];
};

type TraceMapV1 = {
  readonly version: 1;
  readonly entry: string;
  readonly modules: readonly TraceMapModule[];
  readonly operations: readonly TraceMapOperation[];
};
```

The artifact retains lowering order and the resolved entry path. It deliberately contains no raw IR
expressions or operation payloads. V1 replaces the former undocumented raw module serialization; there
is no compatibility layer.

## Deferred Work

Filtered Test262 execution, DWARF, standard source maps, CLI trace flags, and JavaScript semantic
expansion remain future work. This slice makes existing support measurable and traceable; it does not
claim Node runtime compatibility outside the selected behavior oracle.
