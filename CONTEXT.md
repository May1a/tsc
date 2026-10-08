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

**IR Operation** (`JsIrOperation`) — one statement-level form in the IR. A closed union of 121
kinds. 19 of them are *containers*: they hold nested operations. The rest are leaves. The
container/leaf split is enumerated in `jsIrLeafOperationKinds` (`src/compiler/ir/visit.ts`) and is
checked for completeness by the compiler, so a new operation must be classified before it can be
emitted. Walking the tree — `jsIrOperationChildren` and `visitJsIrOperations` — lives beside that
classification rather than in `types.ts`, so the union file states the IR's shape and `visit.ts`
describes the traversal over it.

**Operation Emitter Table** (`operationEmittersByKind`, `src/compiler/llvm/operations.ts`) — the one place
an operation is turned into LLVM IR text. It is a `Record` keyed by the operation union, so the
compiler rejects a new kind until something emits it, and `Extract` gives each handler its own
narrowed operation so it cannot read a field its kind does not have. Dispatch is a table lookup,
not an `if` chain; the `Record`'s totality is what replaces the exhaustiveness check the chain
could not express.

**IR Value Expression** (`JsIrValueExpression`) — an expression producing a JSValue. Emitted by
`emitValueExpression`.

Object destructuring of a general value starts with the `requireObjectCoercible` IR Operation,
including an empty binding pattern. It throws a TypeError for null or undefined through the
generated completion protocol, so enclosing IteratorClose and finally frames still run. General
property reads use `checkedValuePropertyGet`, which checks nullish receivers and dispatches by
value kind. `valueObjectGet` assumes an object layout and belongs only in Static Runtime IR;
`scripts/check-unchecked-object-access.mjs` rejects that helper in emission templates.

**IR Condition** (`JsIrCondition`) — an expression producing an i1, used by branches and loops.
Emitted by `emitCondition`.

**IR Number Expression** / **IR String Expression** — the numeric and string tiers of the IR.
They exist because the lowering pass proves a static type for those positions, which lets emission
use a narrower runtime ABI than the general value tier.

**Binding Value** (`JsIrBindingValue`) — what a name currently holds. Emission consults these to
decide between direct registers and boxed runtime cells.

**Lowering** (`lowerToJsIr`, `src/compiler/ir/source-module.ts`) — TypeScript AST → JsIrModule.
Pure and synchronous, but **not fiber-safe**: it keeps module-level lowering state. It *returns* diagnostics rather than pushing
them anywhere. Each source file is traversed once: a statement no recognizer claims becomes a
TSCN1002 where it failed, and there is no strict re-run to tell "unrecognized" from "recognized and
gave up".

**Lowering Context** (`LoweringContext`, `src/compiler/ir/context.ts`) holds the recursive entries
shared by lowering domains and the counters and scope flags for the current compilation. The
composition root in `lowering-context.ts` connects ten entries. Domain modules import the context
type instead of importing a recursive caller. `ir.ts` only re-exports the public IR types and
`lowerToJsIr`. Module envelopes live in `ir/module.ts`; `source-module.ts` owns source traversal
and trace finalization.

**Lowered** (`Lowered`, `src/compiler/ir/lowered.ts`) — the result of trying to recognize one AST shape:
`lowered` carries the operation, `notApplicable` continues the recognizer chain, and `unsupported`
stops it with the reason the diagnostic will quote. Expression, scalar, argument, binding and
statement recognizers return this union.
`Produced<T>` omits `notApplicable` for steps below a matched shape. A refusal travels through
function bodies, class members, branches, loops and catch blocks in its return value.
`loweredPayload` accepts only a result already narrowed away from `unsupported`, so it cannot
discard a refusal. The old class refusal holder and statement adapter are gone.

**Emission** (`emitLlvmModule`) — JsIrModule → LLVM IR text. Pure. Operations dispatch through the
Operation Emitter Table; the value, condition and number/string tiers are still `if` chains, which
is why `switch-exhaustiveness-check` does not apply to them.

**Static Runtime IR** (`src/compiler/runtime/*.ll`) — the fixed body of the generated JS runtime, held
as LLVM IR text in one file per domain (`gc`, `values`, `numbers`, `strings`, `regex`, `arrays`,
`objects`, `collections`, `functions`, `json`, `errors`, `iterators`, plus `declares.ll` for the
external `declare`s and `globals.ll` for module-scope constants). `runtime-ir.ts` reads them
through a cached, module-relative loader and `emitLlvmModule` appends the whole blob to every
module. There is **no helper registry and no tree-shaking**: an unused `define` is inert in a
single-module IR file, so paying for all of it costs emitted text and nothing else. Static IR
belongs in these files, never inline in TypeScript — `scripts/check-inline-llvm.mjs` (second stage
of `npm run lint`) enforces that, and `scripts/copy-runtime-ll.mjs` is what puts the files into
`dist/`, so the build is `tsc` *and then* the copy.

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

**Compiler boundaries check** (`scripts/check-compiler-boundaries.mjs`) builds the runtime import
graph for `ir/**` and `llvm/**` after TypeScript erases type-only imports. `npm run lint` rejects
cycles in that graph. The same command enforces 800 nonblank, noncomment lines per source file
and 400 per function, and bans Effect imports throughout both compiler directories.

## Invariants worth knowing

- The IR is a **closed world**. Every union is meant to enumerate every form the lowering pass can
  produce, so emission can be total. This is the property most of the compiler's type-level work
  exists to enforce.
- **Effect is confined to two boundaries**: CLI parsing/help (`src/cli/**`, `@effect/cli`) and
  scoped process spawning (`toolchain.ts`, `linker.ts`, `test262/process.ts`, `@effect/platform`).
  The compiler core — `ir.ts`, `ir/**`, `llvm/**`, `runtime-ir.ts`, `llvm-ir/**`,
  `js-value-abi/**` — is pure and synchronous. This is enforced by the `no-restricted-imports` override in
  `oxlint.config.ts`, not by convention.
- The correctness oracle (`test/integration/oracle.ts`) compiles a fixture with `tscn`, runs the
  native binary, runs the same fixture under Node, and asserts the two agree. The fixtures are
  registered in `oracleFixtures`. Four admitted forms cannot be: Node 22's strip-only mode rejects `accessor`, an `enum`,
  a `namespace` and a parameter property outright, because each needs transformation rather than
  erasure. Those are asserted by native value in `test/integration/core.test.ts` instead, which is
  what backs the manifest's claim that they work. Prefer adding a fixture over asserting on emitted
  text.
