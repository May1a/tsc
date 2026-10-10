# tscn domain model

`tscn` compiles TypeScript to native code. The production pipeline resolves lexical
bindings, builds typed LLVM functions, verifies their control flow and GC roots,
and renders LLVM IR for clang.

## Pipeline

```text
entry.ts
  → FrontendResult          TypeScript program, source files, diagnostics
  → Lowering                TypeScript AST → JsIrModule
  → Binding resolution      JsIrModule → ResolvedModule
  → Native lowering         resolved operations → typed LLVM functions
  → LLVM verification       ownership, signatures, CFG, SSA, GC roots
  → LLVM rendering          BuiltLlvmModule → text and trace ranges
  → Linking                 clang or clang++ → native executable
```

`pipeline.ts` composes these passes and writes the artifacts. Filesystem access,
process execution, and Effect belong at compiler boundaries. The passes and their
models are pure, synchronous code with state owned by one compilation.

## IR and Lowering

**IR Operation** (`JsIrOperation`, `ir/types.ts`) is the closed statement union.
**IR Value Expression**, **IR Condition**, **IR Number Expression**, and **IR String
Expression** are the closed expression tiers in `ir/expressions.ts`.

Operations that contain other operations are classified in `ir/visit.ts`.
`jsIrOperationChildren` and `visitJsIrOperations` traverse that classification.
Adding an operation requires both its classification and a native handler.

The **IR model** consists of `ir/{bindings,expressions,types,module,lowered,visit,
operation-bindings}.ts`. It depends on no TypeScript AST logic or compiler pass.
`aggregateBindingForOperation` classifies aggregate Binding Values in this model.

A **Binding Value** (`JsIrBindingValue`) records what Lowering knows about a
binding, including specialized Number, String, and fixed aggregate forms.
Native lowering consumes resolved storage descriptions instead of looking up
these facts by source name.

**Lowering** (`lowerToJsIr`, `ir/source-module.ts`) recognizes TypeScript AST forms
and produces `JsIrModule` with diagnostics. Each invocation owns its class
registries, checker, identifiers, inline C++ blocks, and recursive entries through
`LoweringContext`. Each source module receives its own class registry.
Repeated or interleaved compilations share no mutable Lowering state.

**Lowered** carries `lowered`, `notApplicable`, or `unsupported`. Recognition can
decline an AST shape, but a refusal propagates through the enclosing body.
`Produced<T>` excludes `notApplicable` after recognition. Native lowering never
uses recognition fallthrough for a resolved IR variant.

## Binding resolution

**Binding resolution** (`resolveBindings`, `binding-resolution/index.ts`) gives
each lexical declaration an opaque `BindingId`. Each function body has a
`FunctionId`. References carry identities and storage descriptions. Source
spellings remain available for diagnostics and observable function names.
Property keys, private field keys, string values, and runtime symbols are separate
from lexical identities.

Resolution predeclares scopes before bodies. It records lexical ownership,
shadowing, parameters, catch bindings, captures, loop bindings, and module globals.
`ResolvedModule` contains the resolved operations and the declaration table.
`resolvedOperationChildren` traverses resolved containers.

## Native lowering and storage

**Native lowering** (`emitNativeModule`, `native-lowering/module.ts`) consumes
`ResolvedModule`. Its operation and four expression tiers use total handler tables.
`dispatchKind` in `dispatch.ts` preserves the correlation between each kind and
its handler parameter without a caller assertion.

`NativeModule` owns generated symbols. `FunctionCursor` owns function blocks and
instruction positions. `ControlFlow` owns exception handlers, cleanup frames, and
loop destinations. Domain handlers receive readonly capabilities with operations
for these owners. They cannot change shared counters or maps directly.

`ModuleBindings` allocates storage from the resolved descriptions before body
emission. Number storage uses `double`. String storage retains byte and length
slots plus a boxed GC owner. Fixed arrays retain double elements. Fixed objects
retain numeric fields and, when required, a stable runtime shadow synchronized by
numeric stores. General values use boxed slots. Captured mutable bindings use
boxed environment cells shared by closures. Module GC owners are registered as
global roots, so a value survives after its writer returns.

Generated functions use one thunk ABI:

```text
{ i64, i1 } function(i64 argc, ptr argv, ptr environment, i64 thisValue)
```

Arguments cross this boundary as boxed JSValues. Parameter initialization converts
proven Number and String parameters into their specialized storage. Missing,
default, optional, and rest parameters retain their JavaScript behavior. Function
objects own their environment, name, and callable address. Module function
declarations and tagged template objects use registered global caches for stable
identity. Function expressions and nested declarations create fresh objects each
time their enclosing code runs.

**Completion** is `{ i64, i1 }`: a boxed payload and a throw flag. A call that
returns completion branches to its continuation or exception destination.
`finally`, IteratorClose, return, throw, break, and continue use explicit edges and
payload storage before rendering.

General property reads use `checkedValuePropertyGet`. It checks nullish receivers
and dispatches by value kind. `valueObjectGet` assumes an object layout and belongs
only in Static Runtime IR. Object destructuring starts with
`requireObjectCoercible`, including an empty pattern.

## LLVM construction, runtime, and GC

**LLVM construction** (`llvm-ir/index.ts`) records a closed instruction union with
typed values and owned block labels. Functions seal only after every block exists.
The builder checks operand and function ownership, signatures, terminators,
predecessors, phi inputs, and SSA dominance. `BuiltLlvmModule` is frozen data.
Rendering reads that data after verification and derives trace ranges from
instruction provenance.

**Static Runtime IR** is the fixed LLVM text in `runtime/*.ll`. The filesystem
boundary `runtime-files.ts` loads it. `createLlvmModule({ staticRuntime })` copies
and freezes its origin and text fragments at construction. There is no append API
for generated LLVM text. `runtime-ir.ts` constructs the typed runtime helpers.
All runtime definitions are included, with no tree shaking.

**Runtime call contracts** (`runtime-contracts/index.ts`) describe signatures,
allocation and collection effects, semantic result kinds, pointer ownership, and
completion. `npm run runtime:contracts` derives the catalog from Static Runtime IR
and propagates effects through its call graph. The command reports the current
symbol count. The freshness check is part of `npm run lint`.

The runtime-call capability selects owned callable handles from this catalog.
Heap results receive ownership facts. Completion calls require an exception edge.
Indirect calls conservatively allocate and collect. Unknown foreign `i64` results
receive boxed-value protection rather than an assumed scalar classification.

**GC verification** (`gc-liveness/index.ts`) reads finished typed functions.
Backward SSA liveness includes live phi inputs on their incoming edges. Forward
root analysis intersects protection across predecessors and tracks saved frames.
A collecting call requires protection for live heap values and heap arguments.
Root frame verification checks consistent stacks at joins and restoration at exits.
A failed function prevents module rendering.

**JsValue ABI** (`jsValueAbi`) represents a JavaScript value as tagged `i64` bits.
`forLlvm` constructs typed LLVM values. Inline C++ support uses the same accepted
layout. `TargetFacts` records pointer widths, address bits, architecture, and double
format. Host validation runs before native emission.

## Diagnostics, traces, and verification

**Compilation Diagnostic** has a code, category, message, and optional source span.
Frontend and Lowering collect diagnostics before binding resolution. Any error
prevents native emission, including errors from binding resolution.
**Toolchain** identifies clang, clang++, llvm-as, and
lli at the process boundary.

**Trace Map** (`TraceMapV1`) maps IR operation IDs to rendered LLVM line ranges.
`trace.ts` combines source spans with instruction-derived ranges.

**Inline C++** (`--fcpp`) produces a companion source file from
`JsIrInlineCppBlock`. Its external functions return the JSValue boundary type.

`npm run check` typechecks source and tests. `npm run lint` enforces procedural
style, pass boundaries, owned state, typed instruction construction, and runtime
contract freshness. The dependency scanner rejects forbidden imports and runtime
cycles. Oxlint enforces source file, function, and control-depth limits.

The correctness oracle compiles fixtures and compares their native output with
Node. Forms Node's strip-only mode cannot execute are checked against literal
native expectations. LLVM verification and typed builder tests check structural
properties independently. See [the architecture contract](docs/compiler-architecture.md)
and [lint policy](docs/code-quality-lints.md).
