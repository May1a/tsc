# Plan: Synchronous Iteration Protocol

Feature plan for the sync iteration protocol — Phase 3 of `docs/plan/first-class-function-objects.md`.
The master roadmap remains `docs/PLAN.md`.

## Status

Phase 0 implemented. User-defined `[Symbol.iterator]` works with generic `for...of` (normal
exhaustion), including assigned methods, truthy `done` coercion, exception propagation, and a GC
stress fixture. Specialized array/string/Set/Map fast paths are unchanged. The next increment is
Phase 1: built-in iterables and iterable constructors.

## Goal

Implement the ECMAScript **sync iteration protocol** for JavaScript-compatible native TypeScript:
`Symbol.iterator`, `for...of` over arbitrary iterables, iterable `Map`/`Set`/`WeakMap`/`WeakSet`
constructors, `Array.from(iterable)`, and unifying array destructuring / spread through the protocol
where it currently special-cases indexing. User-defined `[Symbol.iterator]` works end-to-end.

## Context

Today there is **no general iteration protocol**. First-class function values, arbitrary value calls
through `callValue`/`jsCall`, captured environments, and explicit exception propagation across value
calls are implemented. Existing `for...of`/spread/destructuring remains *type-specialized* per
concrete source kind and **bypasses** `Symbol.iterator`/`.next()` entirely:

- `lowerForOfStatement` (`src/compiler/ir.ts:4217`) dispatches on the static binding kind of the
  source: string → `forOfString`, `runtimeSet` → `forOfSet`, `runtimeMap` → `forOfMap`, fixed numeric
  `array` → `forOfArray`. Anything else — including **`runtimeArray`** and user iterables — returns
  `undefined` → `TSCN1002`.
- Map/Set iteration uses internal IR nodes `runtimeIteratorNew`/`runtimeIteratorNext`
  (`ir.ts:1200`, `1207`) that walk collection cells directly in LLVM (`llvm.ts:1616`); they
  are *not* the JS protocol.
- Array destructuring (`lowerArrayDestructuringElements`, `ir.ts:5549`) uses direct indexed access +
  `runtimeArraySlice` for rest, not the iterator protocol.
- `new Map(iterable)`/`new Set(iterable)` accept statically recognized runtime arrays through
  `runtimeMapFromArray`/`runtimeSetFromArray` (`ir.ts:6138`) but reject general iterables.
  `Array.from(iterable)` only accepts recognized array or array-like sources.
- There is **no `Symbol` value and no symbol property keys**: property keys are `{i64 len, ptr utf8}`
  compared by `memcmp` (`objectGetOwn` `runtime-helpers.ts:5544`, `objectSet:5933`).
  `Symbol.iterator` cannot currently be stored or looked up.
- General value calls are available as `callValue` IR operations and dispatch through `jsCall`.
  Potential exceptions use the explicit value-or-exception ABI and propagate across function-value
  calls. Calling iterator methods therefore does not require another calling-convention change.

Four fixtures already encode the desired behavior as `expectUnsupportedDiagnostic` and become the
flip-list: `for-of-user-iterator-unsupported.ts`, `map-constructor-iterable-unsupported.ts`,
`array-from-symbol-iterator-unsupported.ts`, plus `weak-map-unsupported.ts`/`weak-set-unsupported.ts`.

## Prerequisites

The following prerequisites from `docs/plan/first-class-function-objects.md` have landed:

- `callValue` routes arbitrary `JSValue` callees through `jsCall`.
- Arrow and ordinary function expressions can become heap function objects with captured environments.
- Array callbacks use function objects and support callback `thisArg` where required.
- Exceptions propagate through direct calls, value calls, callbacks, and nested rethrows.

No prerequisite compiler feature remains for the normal-completion Phase 0 tracer bullet.

## Current Decisions

- **Well-known-symbol sentinels first**: well-known symbols (`Symbol.iterator` initially; extensible
  to `Symbol.asyncIterator` later) are represented as **reserved internal property keys** —
  private-use UTF-8 byte sequences that user source cannot produce — and compared by the existing
  `memcmp` path. **No general `Symbol()` value, no arbitrary symbol keys, no new NaN-box tag.**
  `Symbol.iterator` is recognised *syntactically* at lowering time (computed property
  `[Symbol.iterator]`) and as a `Symbol.iterator` member access; the runtime only ever sees the
  sentinel key.
  - Trade-off accepted: `Symbol()` / `Symbol.for` / `Symbol.keyFor` and user-symbol keys are **out
    of scope**. Revisited when a general Symbol value is needed (would require a new NaN-box tag per
    ADR 0004 + symbol-key integration into `objectGetOwn`/`objectSet`/`arrayGetWithKey`).
- The iterator result `{ value, done }` reuses the existing `objectNew`/`objectSet` path already used
  by `runtimeIteratorNext` (`llvm.ts:1285`). No new cell kind.
- The iterator-protocol loop lowers to ordinary IR (`while`/`if`/`break`) around a `getIterator` op,
  a `callValue` on `.next`, and reads of `done`/`value`. **No special "for-of-generic" IR node** is
  added beyond a small `iteratorProtocol*` op family if a single op proves cleaner for GC safepoints
  — decision deferred to Phase 1 implementation.
- Built-in iterables (`Array.prototype[Symbol.iterator]`, `String.prototype[Symbol.iterator]`,
  `Map`/`Set` iterators, `arguments` later) are wired as named runtime thunks registered under the
  sentinel key, *not* as methods on a real prototype object (prototypes for arrays/strings don't
  exist yet — see PLAN.md Milestone 7). This keeps the change localized; it is reconciled with real
  prototype objects when those land.
- Specialized `forOfArray`/`forOfString`/`forOfSet`/`forOfMap` fast paths are **kept** and selected
  first; the generic protocol path is the fallback for any other source kind. Existing fixtures must
  remain byte-for-byte identical on stdout/exit.

## Phases

### Phase 0 — Sentinel plumbing + tracer bullet

Land the smallest end-to-end slice: `for (const x of obj)` over a user object with a
`[Symbol.iterator]()` returning `{ next() }`.

- Reserve a sentinel key for `Symbol.iterator` in `runtime-helpers.ts` (private-use UTF-8 constant,
  exported). Extend `objectGetOwn`/`objectSet` *only* by ensuring the sentinel flows through `memcmp`
  unchanged (no representation change).
- Add a `getIteratorValue(value) -> value-or-exception` intrinsic: look up the sentinel method, check
  that it is callable, call it through `jsCall`, and check that the returned iterator is an object.
  This centralizes the supported portion of the spec's `GetIterator` abstract operation.
- Add a `callIteratorNext(iteratorObj) -> value-or-exception` helper that reads `.next`, verifies it
  is callable, dispatches through `jsCall` with the iterator as `this`, and verifies that the result
  is an object. The lowering reads `done` before `value` and applies ordinary truthiness to `done`.
- Lower `for-of` whose source kind is unsupported (`ir.ts:4261` returns `undefined` today) into the
  generic protocol loop using `getIteratorValue` + `callIteratorNext` + `break`-on-`done`.
- Recognise `[Symbol.iterator]` computed-member method definitions on user objects and classes,
  assignment through `obj[Symbol.iterator]`, and `obj[Symbol.iterator]()` access syntactically during
  lowering. Lower the method to a function object and store it under the sentinel key.
- Replace `for-of-user-iterator-unsupported.ts` with a fixture that yields at least two values using
  `{ done: false }` before returning `{ done: true }`. The existing fixture only returns
  `{ value: 1, done: true }`, so it does not prove value delivery.
- Add the fixture to the Node correctness oracle and keep LLVM verification green.
- Phase 0 covers normal exhaustion. Until iterator closing lands, reject generic iterator loops that
  can complete abruptly through `break`, `return`, or a propagated throw rather than silently omitting
  `IteratorClose` semantics.

#### Phase 0 Implementation Order

1. Add lowering constants and recognition for the compiler-owned `Symbol.iterator` sentinel. Reject
   general `Symbol()`, `Symbol.for`, and unsupported symbol members precisely.
2. Add IR operations for iterator acquisition and `next` invocation. Both operations return through
   the existing explicit value-or-exception path and carry source traces.
3. Add runtime-helper dependencies and definitions using `objectGet`, function classification,
   `jsCall`, and existing object boxing. Do not introduce a new heap-cell or NaN-box kind.
4. Emit the iterator operations in `src/compiler/llvm.ts`, including GC roots for the iterable,
   iterator, `next` function, and iterator-result object across allocating calls.
5. Add the generic fallback in `lowerForOfStatement` after the existing fixed array, string, Set,
   and Map branches. Lower it as acquire-once, call-next, test-done, read-value, execute-body.
6. Add focused IR and integration tests, then move the tracer fixture into `oracleFixtures`.

#### Phase 0 Test Matrix

- Object-literal `[Symbol.iterator]()` yields multiple values and terminates.
- Assigned `obj[Symbol.iterator] = function () { ... }` preserves `this` for iterator and `next`.
- Iterator state captured in a function environment survives multiple `next()` calls.
- Missing iterator method throws `TypeError` at runtime.
- Non-callable iterator method throws `TypeError` at runtime.
- Iterator method returning a primitive throws `TypeError` at runtime.
- Non-callable `next` throws `TypeError` at runtime.
- `next()` returning a primitive throws `TypeError` at runtime.
- Exceptions thrown by the iterator method or `next()` propagate and remain catchable.
- `done` is coerced with JavaScript truthiness and `value` is not consumed after `done` becomes true.
- A small GC heap preserves the iterable, iterator, closure environment, and result object.
- Existing specialized array, string, Set, and Map `for...of` fixtures remain unchanged.

### Phase 1 — Built-in iterables + iterable constructors

Make the built-in collections iterable *through the protocol* so user code observes uniform behavior.

- Wire `Array.prototype[Symbol.iterator]`, `String.prototype[Symbol.iterator]`, `Map`/`Set`
  `keys`/`values`/`entries`/default to return iterator objects whose `.next` is a function value
  (replacing the direct `runtimeIteratorNext` fast path for the protocol surface; keep the internal
  fast path for the *specialized* `forOfSet`/`forOfMap` ops).
- Lift `lowerForOfStatement`'s `runtimeArray` gap: a `for-of` over a `runtimeArray` selects the
  generic protocol path (currently rejected outright).
- Iterable constructors: extend the statically recognized runtime-array path at `ir.ts:6138` and
  lower general `new Map(iterable)`/`new Set(iterable)` inputs to `getIteratorValue` + a consume loop.
  Do the same for `WeakMap`/`WeakSet`, which currently reject entirely.
- `Array.from(iterable)`: extend `lowerRuntimeArrayStaticBinding` (`ir.ts:6284`) to detect a
  non-array-like source and consume the iterator; preserve the existing `mapFn` callback routing
  (Phase 1 callback prereq).
- Flip `map-constructor-iterable-unsupported.ts`, `weak-map-unsupported.ts`,
  `weak-set-unsupported.ts`, `array-from-symbol-iterator-unsupported.ts`.

### Phase 2 — Destructuring and spread via the protocol

Where the spec mandates iterator semantics, replace direct indexing with the protocol.

- Array-binding destructuring (`lowerArrayDestructuringElements`, `ir.ts:5549`): for sources that are
  not statically `runtimeArray`/`array`, consume an iterator instead of rejecting. Rest (`...rest`)
  maps to collecting remaining `next()` results.
- Spread in calls (`lowerSpreadElementValues`, `ir.ts:10357`) and array literals
  (`lowerRuntimeArrayLiteralExpression`, `ir.ts:10544`): accept any iterable source by consuming the
  iterator (currently only fixed `array` / `runtimeArray`).
- Keep the array-typed fast paths for the common cases; only fall back to the protocol when the
  source kind is unknown/iterable.

### Phase 3 — Correctness, diagnostics, coverage

- Replace `TSCN1002` with precise diagnostics only for syntax or protocol forms the compiler still
  cannot lower. Invalid values encountered by a compiled program, including a missing iterator or a
  non-callable `.next`, throw runtime `TypeError` values and are not compile-time diagnostics.
- Test262 iterator subset: enable the filtered iterator / for-of / spread / destructuring tests
  against the Node oracle.
- GC safepoints inside iterator-consume loops (consistent with ADR 0009) so a long iterator doesn't
  starve collection.
- Add fixtures: deeply nested iterables, iterator whose `done` flips after side effects,
  `Symbol.iterator` returning a non-object (`TypeError`), and abrupt completion with `IteratorClose`.
- Implement `IteratorClose`, including lookup and invocation of an iterator's optional `return`
  method, before accepting generic iterator loops with `break`, `return`, or propagated exceptions.

## Affected Components

- `src/compiler/runtime-helpers.ts` — `Symbol.iterator` sentinel constant, `getIteratorValue`/
  `callIteratorNext` intrinsics, GC marking of iterator result objects (reuse object tag), built-in
  iterator thunks.
- `src/compiler/ir.ts` — generic `for-of` lowering branch in `lowerForOfStatement:4217`; iterable
  constructor lowering near `6138`; `Array.from` iterable at `6284`; destructuring at `5549`; spread
  at `10357`/`10544`; new iterator acquisition and `next` IR operations.
- `src/compiler/llvm.ts` — emit the new intrinsics; keep `runtimeIteratorNew`/`runtimeIteratorNext`
  emitters (`1616`) for the specialized fast paths.
- `src/compiler/frontend.ts` — syntactic recognition of `[Symbol.iterator]` and `Symbol.iterator`
  member access; rejection of `Symbol()` / `Symbol.for` with a diagnostic.
- `src/compiler/diagnostics.ts` — new `TSCN1004` "not iterable" / non-callable `.next`.
- `test/fixtures/` — flip the 5 `-unsupported` fixtures; add ~12 new positive fixtures.
- `test/integration/runtime.test.ts` — move flipped fixtures out of `expectUnsupportedDiagnostic`
  blocks (`:696`, `:762`–`764`, `:1085`) into `cases` arrays.

## Non-Goals

- **No generators** (`function*`/`yield`), no async iteration (`Symbol.asyncIterator`/`for await…of`)
  — deferred per master PLAN.md and the function-objects plan. State-machine lowering is a separate
  future plan.
- **No general `Symbol`** (`Symbol()`, `Symbol.for`/`keyFor`, user symbol keys,
  `Symbol.description`/`toString`) — well-known sentinels only; revisit with a full Symbol value
  later.
- **No real prototype objects** for `Array`/`String` yet — iterator thunks are registered under the
  sentinel key and reconciled with prototypes when Milestone 7 lands.
- No `arguments` iterable, no DOM-style iterables, no iterator helpers / `Iterator` class proposal.
- No perf work on `getIteratorValue`/`callIteratorNext` (fast paths reserved per ADR 0004).

## Correctness

- Node + filtered Test262 oracle (stdout, stderr, exit code, thrown error class/message), per master
  PLAN.md.
- All 5 `*-unsupported` fixtures flip to expected behavior; the existing specialized `for-of-*`
  fixtures stay byte-for-byte identical.
- `TypeError` ("x is not iterable", ".next returned non-object") thrown-error class/message must
  match Node exactly.
- Generic iteration must not be accepted for abrupt-completion paths until `IteratorClose` behavior
  is implemented; a precise unsupported diagnostic is preferable to observably incorrect execution.
- `llvm-as` verification stays green across all fixtures.
- GC regression: a fixture that drives a long-lived iterator across multiple collection cycles and
  asserts survivorship of captured iterator/env cells.

## Risks

- **`runtimeArray` for-of gap.** Routing `runtimeArray` through the protocol adds indirection for a
  hot path. Mitigation: keep the specialized `forOfArray` fast path first; only unknown sources fall
  through to the protocol.
- **Iterator-result object churn.** Every `next()` allocates a `{value,done}` object — GC pressure.
  Mitigation: reuse a per-iterator cached result cell updated in place where the spec allows (it does
  not for user iterators, but does for our built-in ones); revisit at perf time.
- **Sentinel collision / leakage.** If the private-use sentinel bytes are guessable, user code could
  forge a `Symbol.iterator` key. Mitigation: choose a long non-shortest UTF-8 sequence that the
  runtime rejects if it ever appears in source; document the invariant.
- **`done` ordering / completion semantics.** Edge cases (`done: true` with a final `value`,
  break-with-finally, calling `next()` after completion) are spec-subtle. Mitigation: drive behavior
  from Test262 fixtures and compare thrown errors exactly.
- **Phase-2 coupling.** If value-calls slip, Phase 1+ of this plan block. Mitigation: Phase 0 is
  designed to ride the existing Phase-0 `jsCall` path so it can land and prove the sentinel design
  independently.
