# Plan: Iterators (the iteration protocol)

Feature plan for the sync iteration protocol — Phase 3 of `docs/plan/first-class-function-objects.md`.
The master roadmap remains `docs/PLAN.md`.

## Goal

Implement the ECMAScript **sync iteration protocol** for JavaScript-compatible native TypeScript:
`Symbol.iterator`, `for...of` over arbitrary iterables, iterable `Map`/`Set`/`WeakMap`/`WeakSet`
constructors, `Array.from(iterable)`, and unifying array destructuring / spread through the protocol
where it currently special-cases indexing. User-defined `[Symbol.iterator]` works end-to-end.

## Context

Today there is **no general iteration protocol**. All existing `for...of`/spread/destructuring is
*type-specialized* per concrete source kind and **bypasses** `Symbol.iterator`/`.next()` entirely:

- `lowerForOfStatement` (`src/compiler/ir.ts:3949`) dispatches on the static binding kind of the
  source: string → `forOfString`, `runtimeSet` → `forOfSet`, `runtimeMap` → `forOfMap`, fixed numeric
  `array` → `forOfArray`. Anything else — including **`runtimeArray`** and user iterables — returns
  `undefined` → `TSCN1002`.
- Map/Set iteration uses internal IR nodes `runtimeIteratorNew`/`runtimeIteratorNext`
  (`ir.ts:1150`, `1157`) that walk 24-byte collection cells directly in LLVM (`llvm.ts:1209`); they
  are *not* the JS protocol.
- Array destructuring (`lowerArrayDestructuringElements`, `ir.ts:5192`) uses direct indexed access +
  `runtimeArraySlice` for rest, not the iterator protocol.
- `new Map(iterable)`/`new Set(iterable)` are **rejected** when given any argument
  (`ir.ts:5762`). `Array.from(iterable)` only accepts array-like sources.
- There is **no `Symbol` value and no symbol property keys**: property keys are `{i64 len, ptr utf8}`
  compared by `memcmp` (`objectGetOwn` `runtime-helpers.ts:5389`, `objectSet:5779`).
  `Symbol.iterator` cannot currently be stored or looked up.
- There is **no general value-call** yet. `jsCall` exists (`runtime-helpers.ts:2666`) but is wired
  only into the Phase-0 `map` tracer bullet (`llvm.ts:1780`). `lowerValueCallExpression`
  (`ir.ts:8588`) handles identifier callees only. Calling `iter.next()` requires value-call lowering.

Four fixtures already encode the desired behavior as `expectUnsupportedDiagnostic` and become the
flip-list: `for-of-user-iterator-unsupported.ts`, `map-constructor-iterable-unsupported.ts`,
`array-from-symbol-iterator-unsupported.ts`, plus `weak-map-unsupported.ts`/`weak-set-unsupported.ts`.

## Prerequisites (referenced, not re-planned)

This plan assumes Phase 1 + Phase 2 of `docs/plan/first-class-function-objects.md` have landed (or
land concurrently):

- **Phase 2 value-calls** — a `callValue` IR op routed through `jsCall` so an arbitrary `i64` callee
  can be invoked, plus arrow/function-expression values allocatable in any position. This is the
  dispatch mechanism `iter.next()` uses. **Without it, the protocol cannot run.**
- Phase 1 general array callbacks (consumed by `Array.from`'s optional `mapFn`).

These are hard dependencies. If Phase 2 is delayed, Phase 0 below can still land (it routes `.next()`
through the Phase-0 `jsCall` path the way `map` does), but Phases 1–3 cannot.

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
- Add a `getIteratorValue(value) -> iteratorObj` intrinsic: look up the sentinel on the value, fall
  back to the implicit array/string/collection iterators for known runtime kinds, else `TypeError`.
  This centralizes the spec's `GetIterator` abstract operation.
- Add a `callIteratorNext(iteratorObj) -> {value, done}` helper that reads `.next` off the iterator
  and dispatches via the Phase-0 `jsCall` path (same route as `map` today), then reads `done`/`value`
  from the result object.
- Lower `for-of` whose source kind is unsupported (`ir.ts:3993` returns `undefined` today) into the
  generic protocol loop using `getIteratorValue` + `callIteratorNext` + `break`-on-`done`.
- Recognise `[Symbol.iterator]` computed-member method definitions on user classes/objects and
  `obj[Symbol.iterator]()` access syntactically in the frontend; lower the method body to a function
  object (Phase 2 prereq) and store under the sentinel key.
- Flip `for-of-user-iterator-unsupported.ts` to expected behavior; keep `llvm-as` green.

### Phase 1 — Built-in iterables + iterable constructors

Make the built-in collections iterable *through the protocol* so user code observes uniform behavior.

- Wire `Array.prototype[Symbol.iterator]`, `String.prototype[Symbol.iterator]`, `Map`/`Set`
  `keys`/`values`/`entries`/default to return iterator objects whose `.next` is a function value
  (replacing the direct `runtimeIteratorNext` fast path for the protocol surface; keep the internal
  fast path for the *specialized* `forOfSet`/`forOfMap` ops).
- Lift `lowerForOfStatement`'s `runtimeArray` gap: a `for-of` over a `runtimeArray` selects the
  generic protocol path (currently rejected outright).
- Iterable constructors: drop the `arguments?.length !== 0` gate at `ir.ts:5762` and lower
  `new Map(iterable)`/`new Set(iterable)` to `getIteratorValue` + a consume loop. Same for
  `WeakMap`/`WeakSet` (which today reject entirely).
- `Array.from(iterable)`: extend `lowerRuntimeArrayStaticBinding` (`ir.ts:5912`) to detect a
  non-array-like source and consume the iterator; preserve the existing `mapFn` callback routing
  (Phase 1 callback prereq).
- Flip `map-constructor-iterable-unsupported.ts`, `weak-map-unsupported.ts`,
  `weak-set-unsupported.ts`, `array-from-symbol-iterator-unsupported.ts`.

### Phase 2 — Destructuring and spread via the protocol

Where the spec mandates iterator semantics, replace direct indexing with the protocol.

- Array-binding destructuring (`lowerArrayDestructuringElements`, `ir.ts:5192`): for sources that are
  not statically `runtimeArray`/`array`, consume an iterator instead of rejecting. Rest (`...rest`)
  maps to collecting remaining `next()` results.
- Spread in calls (`lowerSpreadElementValues`, `ir.ts:9703`) and array literals
  (`lowerRuntimeArrayLiteralExpression`, `ir.ts:9890`): accept any iterable source by consuming the
  iterator (currently only fixed `array` / `runtimeArray`).
- Keep the array-typed fast paths for the common cases; only fall back to the protocol when the
  source kind is unknown/iterable.

### Phase 3 — Correctness, diagnostics, coverage

- Replace the generic `TSCN1002` for protocol failures with a precise diagnostic (e.g. `TSCN1004
  "value is not iterable"`, and a distinct code for calling a non-callable `.next`). Update
  `src/compiler/diagnostics.ts` and `unsupportedStatementMessage`/`unsupportedExpressionMessage`.
- Test262 iterator subset: enable the filtered iterator / for-of / spread / destructuring tests
  against the Node oracle.
- GC safepoints inside iterator-consume loops (consistent with ADR 0009) so a long iterator doesn't
  starve collection.
- Add fixtures: deeply nested iterables, iterator whose `done` flips after side effects,
  `Symbol.iterator` returning a non-object (`TypeError`), break with inner finally semantics.

## Affected Components

- `src/compiler/runtime-helpers.ts` — `Symbol.iterator` sentinel constant, `getIteratorValue`/
  `callIteratorNext` intrinsics, GC marking of iterator result objects (reuse object tag), built-in
  iterator thunks.
- `src/compiler/ir.ts` — generic `for-of` lowering branch in `lowerForOfStatement:3993`; iterable
  constructor lowering at `5762`; `Array.from` iterable at `5912`; destructuring at `5192`; spread at
  `9703`/`9890`; new IR ops (TBD: `getIteratorValue`/`iteratorNextValue` or inline via existing ops).
- `src/compiler/llvm.ts` — emit the new intrinsics; keep `runtimeIteratorNew`/`runtimeIteratorNext`
  emitters (`1209`) for the specialized fast paths.
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
