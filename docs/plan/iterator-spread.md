# Plan: Iterator-Based Spread

Implementation plan for GitHub epic #14 and its tickets #22 (array-literal
spread) and #23 (call spread). This plan is scoped to the spread slice only;
the master roadmap remains `docs/PLAN.md`. All delivered behavior must use
native lowering — compile-time evaluation through the B683 interpreter is not
an acceptable implementation of this feature.

## Status

Planned.

Spread is only partially native today: fixed-array literal spread and spread
into rest parameters work, but spread over generic iterables is rejected or
bypasses the observable iterator protocol. This slice routes both array-literal
spread and call spread through the synchronous iterator protocol, reusing the
protocol operations from `docs/plan/iterators.md` and the completion/cleanup
regions from `plan.md` (Abrupt Completion And IteratorClose), which is
implemented.

## Goal

- `[...it]` consumes any supported synchronous iterable in iteration order,
  including mixed literal elements and multiple spreads in one literal.
- `f(...it)` passes iterated values as arguments to user functions, including
  fixed-arity targets, mid-argument-list spreads (`f(1, ...it, 2)`), and
  method-call spread with the correct `this` receiver.
- Abrupt completions during consumption run `IteratorClose` through the shared
  cleanup stack, in the same order as Node.
- Custom `[Symbol.iterator]` overrides are observed rather than bypassed by
  static fast paths.

Compiled behavior must match Node for supported inputs, including iteration
order, observable method lookup, thrown errors, and GC behavior.

## Current State

The protocol and cleanup foundations are present:

- `getIteratorValue`, `callIteratorNext`, and `iteratorClose` are registered
  runtime helpers (`src/compiler/runtime-helpers.ts`).
- The `forOfProtocol` IR operation (`src/compiler/ir.ts:1399`) and its emitter
  `emitForOfProtocolOperation` (`src/compiler/llvm.ts:5567`) install an
  `iteratorClose` cleanup frame via `createCleanupFrame`
  (`src/compiler/llvm.ts:5600`), closing the iterator on `break`, `return`,
  and escaping throws while leaving normal exhaustion and same-loop `continue`
  open.
- Reusable consume loops exist for `Array.from` and collection construction:
  `emitRuntimeArrayFromCollectionOperation` (`src/compiler/llvm.ts:3247`) and
  the `arrayFromValue` runtime helper (`src/compiler/runtime-helpers.ts:3857`).
- Dynamic calls dispatch through `jsCall(i64 fn, i64 argc, ptr argv, i64 this)`
  (`src/compiler/runtime-helpers.ts:2980`); `emitValueCallExpression`
  (`src/compiler/llvm.ts:4656`) already builds a root-scanned `argv` buffer,
  but only with a statically known argument count.

Spread lowering remains split and static:

- Array literals: `lowerArrayLiteralExpression` (`src/compiler/ir.ts:10957`)
  unrolls spread of identifier-bound fixed numeric arrays at compile time.
  `lowerRuntimeArrayLiteralExpression` (`src/compiler/ir.ts:11004`) accepts a
  spread element only when it is an identifier bound to an `array` or
  `runtimeArray` binding, producing
  `JsIrRuntimeArrayElement { kind: "spread", arrayName, sourceKind }`
  (`src/compiler/ir.ts:304`). Any other expression form returns `undefined`
  and becomes an unsupported diagnostic.
- Runtime-array literal spread is emitted by `emitRuntimeArrayLiteralOperation`
  (`src/compiler/llvm.ts:1954`) through `arrayConcat`, which copies elements
  directly and therefore cannot observe a `[Symbol.iterator]` override.
- Call arguments: `lowerTypedCallArgumentsWithRest`
  (`src/compiler/ir.ts:10770`) handles spread only in rest position and only
  for fixed-array identifiers via `lowerSpreadElementValues`
  (`src/compiler/ir.ts:10817`). Spread into a non-rest callee falls out of
  `lowerTypedCallArguments` (`src/compiler/ir.ts:10739`) and becomes the
  existing unsupported diagnostic — see fixture
  `test/fixtures/call-spread-into-non-rest-unsupported.ts`.

## Semantic Model

### Strict Iterable Consumption

Spread requires an iterable source. Unlike `Array.from`, there is no
array-like fallback: a source without a callable `[Symbol.iterator]` throws
the catchable TypeError produced by `getIteratorValue` (`"<subject> is not
iterable"`, using the same `iteratorErrorSubject` text as `for...of`). The
`arrayFromValue` helper is therefore not reusable for spread; consumption must
drive `getIteratorValue` / `callIteratorNext` directly.

### IteratorClose On Abrupt Completion

Each spread element acquires an iterator, consumes it to exhaustion, and only
then moves to the next element. The iterator is open only during its own
consumption loop. If consumption exits abruptly — a throw from the iterator
method or `.next()`, a non-object iterator or result (already TypeErrors),
or an error evaluating a later argument segment while an earlier spread
iterator is still open — the backend runs the iterator's optional `return`
method through an `iteratorClose` cleanup frame, exactly as
`emitForOfProtocolOperation` does. Normal exhaustion (`done` truthy) does not
close. Close failures resolve against the pending completion in Node order,
reusing the existing cleanup-dispatch machinery.

### Order And Receiver Semantics

Array-literal elements and call arguments are evaluated strictly left to
right. Literal values, holes, and spread segments interleave in source order;
each spread is fully consumed before the next element is evaluated. Method-call
spread evaluates the receiver first and invokes the callee with that receiver
as `this` through the same `jsCall` calling convention.

## Design Decisions

### One Consumption Emitter, Two Consumers

Introduce a single LLVM emission path that acquires an iterator with
`getIteratorValue`, loops `callIteratorNext` / `valueObjectGet` / `valueTruthy`,
appends each yielded value to a runtime array with `arrayPush`, installs an
`iteratorClose` cleanup frame for the loop, roots the iterable, iterator,
result, yielded value, and destination array, and includes a `gcSafepoint` per
iteration. Both array-literal spread and call-spread argument materialization
use it. Model it on `emitRuntimeArrayFromCollectionOperation`
(`src/compiler/llvm.ts:3247`) plus the cleanup-frame wiring of
`emitForOfProtocolOperation` (`src/compiler/llvm.ts:5567`), rather than adding
a third hand-rolled loop.

### Extend The Runtime Array Element, Not The Statement IR

Add an iterable-spread variant to `JsIrRuntimeArrayElement`
(`src/compiler/ir.ts:304`), carrying a general `JsIrValueExpression` source and
the `notIterableMessage`, alongside the existing identifier-based `spread`
variant. Array-literal spread then remains the existing `runtimeArrayLiteral`
operation; only element emission changes. No new top-level statement op is
needed for #22.

### Materialize Call Spread Through A Runtime Array

For `f(1, ...it, 2)`, lower the argument list to a hidden `runtimeArrayLiteral`
whose elements are the literal arguments plus iterable-spread segments, then
emit a call that reads `arrayLength` / `arrayGet` from that array into a
dynamically sized `argv` buffer and dispatches through `jsCall` with a runtime
`argc`. This composes the #22 consumption emitter with the existing
`emitValueCallExpression` shape (`src/compiler/llvm.ts:4656`) instead of
inventing a second variadic calling convention, and it naturally covers
fixed-arity targets, rest targets, mid-list spreads, and method receivers
(`thisValue`). Add the minimal IR surface needed — a spread-aware `callValue`
variant or a value-level `callFromArray` expression — keeping static direct
calls untouched when no spread element is present.

### Fast Paths Only Where Observably Equivalent

The fixed numeric array spread path (compile-time unroll) stays: fixed arrays
are compiler-internal bindings that cannot carry a user `[Symbol.iterator]`,
so unrolling is observably identical. Identifier-bound runtime-array literal
spread migrates off `arrayConcat` onto the protocol path, because `arrayConcat`
bypasses an observable override. The rest-parameter spread path in
`lowerTypedCallArgumentsWithRest` may remain as a fast path for fixed-array
identifiers on the same observability grounds.

## Scope

### Included

- Array-literal spread over generic synchronous iterables: `[...it]`, mixed
  literal and spread elements, multiple spreads per literal (#22).
- Call spread over generic synchronous iterables: `f(...it)` into fixed-arity
  and rest targets, `f(1, ...it, 2)`, multiple spreads, and method-call spread
  with the correct receiver (#23).
- `IteratorClose` on every abrupt exit from a spread consumption loop.
- Observable `[Symbol.iterator]` overrides on spread sources.
- Strict not-iterable TypeErrors matching Node's class and message where the
  correctness oracle checks them.
- GC rooting and safepoints inside consumption loops.
- Node-oracle fixtures and `llvm-as` verification for all delivered behavior.

### Excluded

- Generators, async functions, async iterators, and `for await...of`.
- Spread into `new` expressions and `super` calls.
- The `arguments` object and `Function.prototype.apply`/`call`/`bind`.
- Object spread (already supported separately) and rest parameters (already
  supported).
- Array destructuring, which already has `arrayDestructureProtocol`.
- General Symbol values and real built-in prototype objects.
- Performance optimization beyond retaining the proven fixed-array fast path.

## Implementation Plan

### Phase 0: Native Correctness Guard

- Add failing-first fixtures for the target semantics before changing lowering:
  iterable array-literal spread, mixed and multiple spreads, iterator overrides,
  consumption errors, call spread into fixed-arity and rest targets, mid-list
  spread, method-call spread, and `IteratorClose` on abrupt exits.
- Put every successful fixture in the Node correctness oracle and assert each
  fixture's trace map reports `loweringMode: "native"`.
- Keep unsupported forms diagnostic-only until their native lowering lands.

### Phase 1: Array-Literal Spread (#22)

- Add the iterable-spread variant to `JsIrRuntimeArrayElement` in
  `src/compiler/ir.ts` and extend `lowerRuntimeArrayLiteralExpression`
  (`src/compiler/ir.ts:11004`) to accept arbitrary spread expressions lowered
  through `lowerValueExpression`.
- Route identifier-bound runtime-array spreads through the new element variant
  so overrides are observed; keep the fixed-array `sourceKind: "fixed"` unroll.
- Implement the shared consumption emitter in `src/compiler/llvm.ts`: iterator
  acquisition, next/done/value loop, `arrayPush` into the destination, an
  `iteratorClose` cleanup frame via `createCleanupFrame`, rooting, and a GC
  safepoint — wired into `emitRuntimeArrayLiteralOperation`
  (`src/compiler/llvm.ts:1954`).
- Register any new helper dependencies in `src/compiler/runtime-helpers.ts`.
- Extend `src/compiler/trace.ts` traversal for the new element shape.
- Fixtures: add iterable-spread, override, mixed/multiple-spread, holes,
  error-propagation, close-on-abrupt, and GC-stress fixtures; keep
  `array-fixed-spread-multiple.ts`, `array-runtime-spread.ts`,
  `array-runtime-spread-mixed.ts`, and `array-runtime-spread-holes.ts`
  Node-equivalent.

### Phase 2: Call Spread (#23)

- Lower call argument lists containing spread elements to a hidden
  `runtimeArrayLiteral` argument buffer (reusing Phase 1 consumption), then to
  a spread-aware call operation that builds `argv` from the buffer at runtime
  and dispatches through `jsCall` with runtime `argc` and the correct
  `thisValue`.
- Cover user functions without rest parameters, mid-argument-list spreads,
  multiple spreads, and method-call spread on receivers.
- Preserve left-to-right evaluation of receiver, literal arguments, and spread
  consumption; propagate consumption errors through the explicit
  value-or-exception ABI.
- Keep the statically typed direct-call path (`lowerTypedCallArguments`,
  `src/compiler/ir.ts:10739`) and the rest-parameter fast path when no
  protocol-observable spread is present.
- Flip `test/fixtures/call-spread-into-non-rest-unsupported.ts` into a
  supported Node-oracle fixture with native lowering; keep
  `call-spread-into-rest.ts` and `call-spread-mixed.ts` passing byte-for-byte.

### Phase 3: Test262 Measurement And Consolidation

- Run the filtered suite with `npm run test262:run` and record the pass/fail
  delta against `test262/baseline.json` (`minimumPass: 785`, `maximumFail: 5`,
  `maximumBehaviorMismatch: 4`).
- Spot-check spread-heavy prefixes with
  `npm run build && node dist/test262/run.js --path language/statements/for-of`
  and `--path language/statements/try`.
- Update `test262/baseline.json` thresholds to the new measured values.
- Document the new support boundary in `docs/plan/iterators.md` and the master
  roadmap.

## Affected Components

- `src/compiler/ir.ts` — new `JsIrRuntimeArrayElement` iterable-spread variant,
  extended `lowerRuntimeArrayLiteralExpression`, spread-aware call-argument
  lowering, and the call-spread operation or value expression.
- `src/compiler/llvm.ts` — shared iterable-consumption emitter with
  `iteratorClose` cleanup, `emitRuntimeArrayLiteralOperation` integration, and
  dynamic-`argc` `argv` construction next to `emitValueCallExpression`.
- `src/compiler/runtime-helpers.ts` — helper registry entries for any new
  consumption or argument-buffer helpers.
- `src/compiler/trace.ts` — traversal for new IR shapes.
- `test/fixtures/` — new coverage plus the
  `call-spread-into-non-rest-unsupported.ts` flip.
- `test/integration/runtime.test.ts`, `test/integration/oracle.test.ts` —
  unsupported-fixture flips and Node-oracle assertions.
- `test262/baseline.json` — updated thresholds after measurement.

## Test Plan

### Array-Literal Spread

- `[...it]` consumes a user-defined iterable in iteration order.
- `[x, ...it, y]` and multiple spreads preserve Node's element order.
- A custom `[Symbol.iterator]` override on a runtime-array source is observed.
- A non-iterable source throws a catchable TypeError matching Node.
- Throws from the iterator method, `.next()`, or a primitive iterator result
  propagate as catchable exceptions across function boundaries.
- An escaping throw mid-consumption calls the iterator's `return` exactly once;
  normal exhaustion does not.
- String sources spread by code point; Map and Set sources spread entries and
  values respectively.
- Existing fixed-array and runtime-array spread fixtures remain byte-for-byte
  Node-equivalent.

### Call Spread

- `f(...it)` passes iterated values into fixed-arity parameters.
- `f(1, ...it, 2)` preserves argument order around the spread.
- Multiple spreads in one call concatenate in order.
- Method-call spread invokes with the correct `this` receiver.
- Consumption errors propagate as catchable exceptions and close the iterator.
- `call-spread-into-non-rest-unsupported.ts` becomes a supported fixture.

### GC And Backend Correctness

- Consumption loops survive a constrained GC heap across many iterations
  (landed: `test/fixtures/gc-spread-iterable-stress.ts`, run under
  `test/integration/gc.test.ts` with `TSCN_GC_HEAP_SIZE=2097152`).
- Destination arrays, pending arguments, and receiver values stay live across
  allocating `.next()` calls.
- Generated LLVM passes `llvm-as` verification where available.
- Every delivered fixture is marked native lowering in its trace map.

### Test262

- `npm run test262:run` passes with updated `test262/baseline.json`.
- Previously failing filtered tests that depend on iterable spread convert to
  passes; no previously passing test regresses.

## Acceptance Criteria

Mirrored from issues #22 and #23:

- `[...it]` consumes a user-defined iterable in iteration order.
- Mixed literal elements and multiple spreads preserve Node's element order.
- A custom iterator override on a spread source is observable.
- `f(...it)` passes iterated values as arguments, including into fixed-arity
  parameters.
- Spread mid-argument-list preserves argument order around it.
- Method-call spread invokes with the correct `this` receiver.
- Errors thrown during consumption propagate as catchable exceptions through
  the explicit value-or-exception ABI.
- Abrupt exits from consumption run `IteratorClose`; normal exhaustion does
  not.
- Existing fixed-array spread fixtures remain Node-equivalent.
- `call-spread-into-non-rest-unsupported.ts` becomes a supported Node-oracle
  fixture with native lowering.
- Node correctness-oracle fixtures report native lowering; typecheck, lint,
  Vitest, and LLVM verification pass.

## Verification

- `npm run check` — typecheck.
- `npm run lint` — lint.
- `npm test` — Vitest unit, integration, oracle, and trace-map suites.
- `npm run build && node dist/test262/run.js --path language/statements/for-of`
  — focused spread-heavy Test262 prefix.
- `npm run test262:run` — full filtered suite; update `test262/baseline.json`
  (`test262:baseline` regenerates it) with the measured results.

### Expected Coverage-Gap Reduction

The pinned checkout's filtered set contains ~7,100 files under
`language/statements` (plus the iteration and exceptions groups in
`test262/filters.json`); roughly 4,750 of them use spread syntax, dominated by
class tests that remain out of scope. The realistically recoverable gap is the
spread-dependent subset of the iteration, variable-declaration, and exceptions
groups (hundreds of files across `for-of`, `for`, `variable`/`let`/`const`,
and `try` that fail today on `[...it]` or `f(...it)` over generic iterables).
Success is measured concretely: the filtered pass count rises above the
current `minimumPass: 785` floor and the fail/mismatch counts drop below
`maximumFail: 5` / `maximumBehaviorMismatch: 4`, with the exact delta recorded
in `test262/baseline.json` by `npm run test262:run`. A follow-up filter
expansion to `language/expressions/array` and `language/expressions/call`
(about 86 spread-path files in the pinned checkout) becomes viable once this
slice lands but is out of scope here.

## Non-Goals

- Generators, async iteration, promises, or `for await...of`.
- Spread in `new` targets, `super` calls, tagged templates, or destructuring.
- `Function.prototype.apply`/`call`/`bind` or the `arguments` object.
- Real Symbol values, built-in prototype objects, or iterator helpers.
- Any use of the B683 compile-time interpreter for delivered behavior.
- Performance work beyond keeping the fixed-array unroll and static direct
  calls.

## Follow-Up Work

- Expand `test262/filters.json` to `language/expressions/array` and
  `language/expressions/call` and measure the new spread coverage.
- Spread into `new` expressions once constructor dispatch through function
  objects is generalized.
- `Function.prototype.apply`, which shares the dynamic-`argv` machinery built
  here.

## Risks

- Static fast paths can silently bypass iterator overrides. Keep the
  fixed-array unroll only where overrides are unrepresentable, and treat
  Node-oracle override tests as mandatory on every retained fast path.
- Consumption loops increase GC pressure from iterator result objects. Root
  every intermediate and keep the per-iteration safepoint; do not optimize
  result allocation in this slice.
- Dynamic-`argc` calls can diverge from static-arity behavior on argument
  count mismatches. Match Node's missing/extra argument handling through
  `jsCall` and test fixed-arity targets explicitly.
- `IteratorClose` has subtle precedence when both the original completion and
  close fail. Reuse the existing cleanup dispatch unchanged rather than
  reimplementing resolution in the spread emitter.
- The hidden argument-buffer array for call spread must not become observable
  to user code. Keep it compiler-internal, like the existing synthetic
  bindings, and never bind it to a source-level name.
