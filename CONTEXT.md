# tscn — domain model

`tscn` compiles TypeScript to native code by generating LLVM IR and linking it with clang. This
file names the concepts the compiler is built from. Use these names in code, tests and reviews;
if an idea needs a concept that is not here, add it here first.

## Pipeline

```
entry.ts
  │  ts.createProgram — a typed AST plus tsconfig resolution
  ▼
FrontendResult        program + source files + diagnostics
  │
  ▼
Lowering              TypeScript AST → JsIrModule
  ▼
JsIrModule            the IR: a closed set of operation and expression forms
  │
  ▼
Emission              JsIrModule → LLVM IR text, plus a trace map
  ▼
Linking               clang / clang++ → native executable
```

## Terms

**IR Operation** (`JsIrOperation`) — one statement-level form in the IR. A closed union of 120
kinds. 19 of them are *containers*: they hold nested operations. The rest are leaves. The
container/leaf split is enumerated in `jsIrLeafOperationKinds` (`src/compiler/ir.ts`) and is
checked for completeness by the compiler, so a new operation must be classified before it can be
emitted.

**IR Value Expression** (`JsIrValueExpression`) — an expression producing a JSValue. Emitted by
`emitValueExpression`.

**IR Condition** (`JsIrCondition`) — an expression producing an i1, used by branches and loops.
Emitted by `emitCondition`.

**IR Number Expression** / **IR String Expression** — the numeric and string tiers of the IR.
They exist because the lowering pass proves a static type for those positions, which lets emission
use a narrower runtime ABI than the general value tier.

**Binding Value** (`JsIrBindingValue`) — what a name currently holds. Emission consults these to
decide between direct registers and boxed runtime cells.

**Lowering** (`lowerToJsIr`) — TypeScript AST → JsIrModule. Pure and synchronous, but **not
fiber-safe**: it keeps module-level lowering state. It *returns* diagnostics rather than pushing
them anywhere.

**Emission** (`emitLlvmModule`) — JsIrModule → LLVM IR text. Pure. Dispatch is by `if (kind === …)`
chains, not `switch`, which is why `switch-exhaustiveness-check` does not apply to it.

**Runtime Helper** (`RuntimeHelper`) — one function in the generated JS runtime, emitted into the
LLVM module on demand. A closed union of 281 names. `runtimeHelperDependencies` maps each helper to
the helpers it calls; `useRuntimeHelper` walks that to compute the transitive closure, and only
those definitions are emitted. The map is a total `Record`, so a missing row is a compile error,
and `test/integration/runtime-helpers.test.ts` emits the real output and checks that nothing calls
an undefined symbol.

**JsValue ABI** (`jsValueAbi`) — how a JavaScript value is represented in native code. An `i64`
whose bit pattern encodes a tag plus a payload. The representation differs per host
(`forLlvm` vs `forLegacyLlvm`) and is validated against the host's `TargetFacts` before emission.

**Compilation Diagnostic** (`CompilerDiagnostic`) — a code, category, message and optional source
span. Categories are `error`, `warning` and `info`. Any `error` prevents linking.

**Toolchain** (`Toolchain`) — discovered host tools (`clang`, `clang++`, `llvm-as`, `lli`) plus
the normalized `TargetFacts` of the host.

**Trace Map** (`TraceMapV1`) — the mapping from IR operation id to the LLVM IR line ranges that
operation emitted. Serialized to `trace-map.json` for the debugger and for the correctness oracle.

**Inline C++** (`--fcpp`, `JsIrInlineCppBlock`) — tagged template literals in the source that are
rewritten to a companion `.cpp` file linked alongside the LLVM module.

## Invariants worth knowing

- The IR is a **closed world**. Every union is meant to enumerate every form the lowering pass can
  produce, so emission can be total. This is the property most of the compiler's type-level work
  exists to enforce.
- **Effect is confined to two boundaries**: CLI parsing/help (`src/cli/**`, `@effect/cli`) and
  scoped process spawning (`toolchain.ts`, `linker.ts`, `test262/process.ts`, `@effect/platform`).
  The compiler core — `ir.ts`, `llvm.ts`, `runtime-helpers.ts`, `llvm-ir/**`, `js-value-abi/**` —
  is pure and synchronous. This is enforced by the `no-restricted-imports` override in
  `oxlint.config.ts`, not by convention.
- The correctness oracle (`test/integration/oracle.ts`) compiles a fixture with `tscn`, runs the
  native binary, runs the same fixture under Node, and asserts the two agree. 120 fixtures go
  through it. Prefer adding a fixture over asserting on emitted text.
