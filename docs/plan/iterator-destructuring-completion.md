# Plan: Iterator Destructuring Completion

Implementation plan for GitHub issues #20 (defaults, nested patterns, rest, and
parameter destructuring through the iterator protocol) and #21 (IteratorClose on
abrupt destructuring exits), completing epic #13 (array destructuring through the
iterator protocol). Positional destructuring through the protocol already shipped
in #19 (commit `1b7263e`); this plan covers the remainder of the binding-element
grammar. This is a scoped slice of the synchronous-iteration work; the master
roadmap remains `docs/PLAN.md`.

All delivered behavior must use native lowering. Compile-time evaluation
(`loweringMode: "compileTimeFallback"`) is not an acceptable implementation of
this feature; the Node correctness oracle rejects fixtures that fall back
(`test/integration/oracle.ts`).

## Goal

- Consume the full array binding-element grammar through the synchronous
  iterator protocol: default initializers (`const [a = fallback] = it`), nested
  array/object patterns (`const [a, [b], {c}] = it`), rest elements
  (`const [...rest] = it`), and array patterns in function parameter position
  (`function f([a, b]) {}`).
- Close the source iterator through the shared completion/cleanup model when a
  destructuring evaluation exits abruptly, resolving close failures against the
  pending completion in Node order.
- Convert Test262 destructuring coverage gaps into passes in the
  `language/statements` `dstr` subtrees without regressing the filtered-suite
  baseline.

## Context

Positional protocol destructuring landed in #19:

- `src/compiler/ir.ts` defines the `arrayDestructureProtocol` operation and
  `lowerArrayProtocolDestructuring` (`ir.ts:5744`). It lowers only plain
  positional elements: any element with a `dotDotDotToken`, an `initializer`, or
  a non-identifier `name` makes the lowering decline and fall back to the
  direct-index path.
- `src/compiler/llvm.ts` emits it in `emitArrayDestructureProtocolOperation`
  (`llvm.ts:5672`): acquire via `getIteratorValue` (or `getCollectionIterator`
  for recognized Map/Set sources), one `callIteratorNext` per element,
  truthy-`done` branch, `undefined` for elements past exhaustion. There is no
  cleanup region and no per-element expression evaluation.
- Oracle fixtures `destructure-iterator-protocol.ts`,
  `destructure-iterator-override.ts`, `destructure-builtin-iterables.ts`, and
  `destructure-non-iterable.ts` cover the shipped slice.

The shared abrupt-completion machinery this plan consumes landed with the root
`plan.md` (Abrupt Completion And IteratorClose):

- `src/compiler/llvm.ts` owns a per-function `cleanupStack` of `CleanupFrame`s
  (`llvm.ts:43`), created by `createCleanupFrame` (`llvm.ts:776`) with kinds
  `"finally" | "iteratorClose"`. `emitIteratorCloseBody` (`llvm.ts:817`) calls
  the `@iteratorClose` runtime helper and resolves a close failure against the
  pending completion in Node order (a pending throw is preserved; a close error
  replaces any other completion).
- `emitForOfProtocolOperation` (`llvm.ts:5567`) is the reference integration:
  it pushes an `iteratorClose` frame after acquisition, redirects
  `context.exceptionTarget` to the frame's `throwEntryLabel` for the body, and
  skips closing on normal exhaustion and same-loop `continue`.
- `src/compiler/runtime-helpers.ts` registers `iteratorClose`
  (`runtime-helpers.ts:209`) and emits `@iteratorClose`
  (`runtime-helpers.ts:3675`), which performs only protocol mechanics; precedence
  against a pending completion stays in compiler control flow.

## Current State

Shapes not covered by the positional slice currently take other paths:

- **Default initializers and rest in declarations.** `lowerArrayProtocolDestructuring`
  declines, so `lowerDestructuringBinding` falls through to
  `resolveDestructuringSource` + `lowerArrayDestructuringElements`
  (`ir.ts:5837`), which reads elements by static index from fixed arrays,
  runtime arrays, or `valueVariable` sources. Defaults become an eager ternary
  in `lowerDestructuredValueBinding` (`ir.ts:5925`); rest becomes a
  `runtimeArraySlice` over a recognized runtime array only. A user-defined
  iterable source is not a valid `DestructuringSource`, so these shapes over
  protocol iterables are TSCN1002 coverage gaps.
- **Nested array patterns.** `lowerArrayDestructuringElements` requires
  identifier names and returns `false` otherwise; nested array patterns over any
  source are unsupported. Nested object patterns work only on the object side
  (`destructure-nested.ts` covers object-in-object).
- **Parameter array patterns.** Function declarations lower destructured
  parameters in a prelude (`ir.ts:4816-4878`) through
  `lowerArrayDestructuringElements` with a `valueVariable` source, i.e. direct
  `valueArrayAccess` indexing. `function f([a, b]) {}` never observes a custom
  `[Symbol.iterator]`.
- **Abrupt exits.** `emitArrayDestructureProtocolOperation` installs no cleanup
  frame. A throw anywhere in a destructuring evaluation (once defaults and
  nested patterns can throw) would propagate without calling the source
  iterator's `return`, diverging from Node.

## Scope

### Included (issue #20)

- Default initializers on positional elements over any supported iterable,
  evaluated only when the yielded value is `undefined`.
- Nested array and object binding patterns as binding elements.
- Rest elements collecting all remaining yielded values into a new runtime
  array.
- Array binding patterns in function parameter position, consuming the protocol
  identically to declarations.
- Retention of the existing fixed-array and recognized-collection fast paths
  where observably equivalent.

### Included (issue #21)

- An `iteratorClose` cleanup region around protocol destructuring evaluation.
- Closing the source iterator when a default initializer or a nested pattern
  throws, before the exception propagates.
- Node-order resolution when the iterator's `return` itself throws against a
  pending completion.
- No `return` call on successful, non-abrupt destructuring (including sources
  that exhaust early).
- GC rooting of pending payloads and in-flight destructured values across
  allocating cleanup.

### Excluded

- Destructuring assignment (`[a, b] = source` as an expression statement).
- Object destructuring protocol changes; object patterns keep their existing
  property-read lowering and participate only as nested binding elements.
- Destructured parameters with their own default (`function f([a] = []) {}`),
  rest parameters combined with patterns, and object patterns combined with
  `...rest` in parameter position.
- Spread in array literals and calls (a separate follow-up).
- Generators, async iteration, and general Symbol values beyond the existing
  `Symbol.iterator` sentinel bridge.

## Design Decisions

### Extend `arrayDestructureProtocol` Rather Than The Direct-Index Path

Widen the operation's `elements` from `readonly (string | undefined)[]` to a
discriminated per-element shape: elision, identifier binding with an optional
default initializer expression, nested pattern, and trailing rest binding. Keep
the existing statically-known-array fast path (`lowerArrayProtocolDestructuring`
already declines identifier-to-fixed-array sources) and the recognized Map/Set
`collection` source.

The direct-index lowering in `lowerArrayDestructuringElements` stays for
non-protocol sources only. Protocol sources must never fall back to index
access: an element shape the protocol path cannot express is a TSCN1002
diagnostic, not a silent semantic change.

### Lazy Default Initializers Inside The Cleanup Region

A default initializer must be evaluated only when the yielded value is
`undefined`, and a throwing default must close the iterator. Neither holds for
the existing eager-ternary shape in `lowerDestructuredValueBinding`. The backend
therefore emits the default expression on the `undefined` branch of each
element, inside the cleanup region, after the `done` check. Defaults lowered
from arbitrary supported expressions reuse the ordinary value-expression
emission so calls, closures, and throws behave exactly as elsewhere.

### Nested Patterns Recurse Through Protocol Acquisition

A nested array pattern evaluates the yielded value through a fresh
`getIteratorValue` acquisition — never index access — so user iterables nest
arbitrarily. A nested object pattern binds the yielded value to a temporary
`valueVariable` and reuses `lowerObjectDestructuringElements` unchanged. A
non-iterable yielded value throws the Node-compatible TypeError from
`getIteratorValue` (`"<subject> is not iterable"`, matching
`iteratorErrorSubject` at `ir.ts:4482`) and closes the outer iterator before
propagating.

### Rest Collects Through A Consume Loop

A rest element emits a loop of `callIteratorNext` calls after the positional
elements, appending each yielded value to a new runtime array until `done` is
truthy. Reuse the iterator-consumption shape established by the iterators plan
(`docs/plan/iterators.md`, "A Reusable Iterator-Consumption Lowering"): read
`done` before `value`, apply normal truthiness, root the iterator, next result,
and destination array across allocating calls, and include a GC safepoint in
the loop. Exhaustion ends the loop normally and never closes the iterator. A
rest element must be the last element, matching the existing restriction.

### Parameter Patterns Share The Declaration Lowering

Replace the array branch of the parameter prelude (`ir.ts:4864-4867`) so
`ts.isArrayBindingPattern` parameters lower through the same
`lowerArrayProtocolDestructuring`-driven operation as declarations, with the
parameter temporary as the source. Object patterns in parameter position keep
their current lowering. This removes the observable bypass where a parameter
pattern silently indexes a user iterable.

### IteratorClose Uses The Existing Cleanup Frame Unchanged (#21)

`emitArrayDestructureProtocolOperation` installs an `iteratorClose`
`CleanupFrame` immediately after successful acquisition, mirroring
`emitForOfProtocolOperation`: store the iterator in an alloca slot, push the
frame, redirect `context.exceptionTarget` to the frame's `throwEntryLabel` for
the binding-element emission, and pop the frame on normal completion without
closing. Resolution between a close failure and the pending throw stays in
`emitIteratorCloseBody`, which already implements Node order.

Two destructuring-specific rules:

- Only post-acquisition binding failures enter the frame. Exceptions raised by
  `getIteratorValue` or `callIteratorNext` themselves propagate directly,
  matching the spec's `[[Done]]` bookkeeping (a failing `next()` implies no
  close). Nested-pattern acquisition failures occur after the outer iterator was
  acquired, so they do close the outer iterator.
- Destructuring has no `break`/`continue` edges and no loop body, so the frame
  needs no `skipContinueLabel`; throw is the only abrupt entry. Complete
  patterns — including sources that exhaust before the pattern ends — pop the
  frame on the normal edge and never call `return`.

For recognized Map/Set `collection` sources the compiler-owned iterators have no
observable `return`; install the frame uniformly rather than special-casing, so
there is exactly one emission shape and no semantic drift if collection
iterators later gain real prototype objects.

## Implementation Plan

### Phase 0: Native Correctness Guard

- Add failing-first fixtures for every target shape under `test/fixtures/` and
  register them in `test/integration/oracle.test.ts` and
  `test/integration/runtime.test.ts`.
- Assert each fixture compiles with `loweringMode: "native"`; the oracle harness
  already rejects `compileTimeFallback` modules (`test/integration/oracle.ts`).
- Record the current Test262 dstr numbers (see Test Plan) as the starting point.

### Phase 1: Default Initializers (#20)

- Widen the `elements` type on `arrayDestructureProtocol` in `src/compiler/ir.ts`
  and extend `lowerArrayProtocolDestructuring` to accept identifier elements
  with initializers, lowering the initializer as a value expression.
- Extend `updateBindings`, `collectOperationValueExpressions`, and
  `src/compiler/trace.ts` traversal for the new element shape.
- Emit the per-element lazy default branch in `src/compiler/llvm.ts`.
- Diagnose and fix the default-initializer SIGSEGV seen in Test262
  `ary-ptrn-elem-id-init-fn-name-{fn,arrow}.js` before widening coverage.
- Fixtures: defaults firing only on `undefined` (not on other falsy values),
  defaults observing iterator overrides, throwing defaults (assert close in
  Phase 5), Node-oracle comparison.

### Phase 2: Nested Patterns (#20)

- Accept nested array and object patterns as elements; emit recursive
  acquisition for arrays and temporary-plus-object-lowering for objects.
- Fixtures: nested array over user iterable, nested object, mixed
  `[a, [b], {c}]`, non-iterable nested value producing the catchable TypeError.

### Phase 3: Rest Elements (#20)

- Accept a trailing rest element; emit the consume-into-new-runtime-array loop
  with rooting and a GC safepoint.
- Fixtures: rest over a user iterable, empty rest, rest after elisions, long
  rest under a constrained GC heap (landed: `test/fixtures/gc-destructure-rest-stress.ts`).

### Phase 4: Parameter Position (#20)

- Route array binding patterns in the function parameter prelude through the
  protocol operation.
- Keep `isRest && isDestructuring` and destructure-with-parameter-default
  rejection behavior unchanged (TSCN1002).
- Fixtures: `function f([a, b]) {}` over a user iterable, over Map/Set, with
  defaults and nested patterns, and non-iterable argument TypeError. Existing
  `param-destructure-*` fixtures must stay green.

### Phase 5: IteratorClose On Abrupt Exits (#21)

- Install the `iteratorClose` cleanup frame in
  `emitArrayDestructureProtocolOperation` as described above; no new runtime
  helper is needed — reuse `@iteratorClose`, `getIteratorValue`,
  `callIteratorNext` as registered in `src/compiler/runtime-helpers.ts`.
- Fixtures: throwing default closes before propagation; failing nested pattern
  closes the outer iterator; throwing `return` resolves against the pending
  throw in Node order; successful destructuring never calls `return`; pending
  thrown objects survive close under a constrained GC heap (landed:
  `test/fixtures/gc-destructure-close-stress.ts`).

### Phase 6: Test262 And Consolidation

- Run the dstr subtrees and the full filtered suite; update this plan and
  `docs/plan/iterators.md`'s follow-up notes to reflect delivered behavior.
- Remove any now-unreachable fallback branches in `lowerArrayDestructuringElements`
  only where the protocol path fully covers them; keep proven fast paths.

## Affected Components

- `src/compiler/ir.ts`: `arrayDestructureProtocol` element shape,
  `lowerArrayProtocolDestructuring`, parameter prelude array branch,
  `updateBindings`, `collectOperationValueExpressions`.
- `src/compiler/llvm.ts`: `emitArrayDestructureProtocolOperation` — lazy
  defaults, nested acquisition, rest loop, `iteratorClose` cleanup frame.
- `src/compiler/runtime-helpers.ts`: no new helpers expected; reuse
  `getIteratorValue`, `callIteratorNext`, `iteratorClose`, and existing runtime
  array operations. Register any new dependency through the helper registry.
- `src/compiler/trace.ts`: exhaustive traversal for new element children.
- `test/fixtures/`, `test/integration/oracle.test.ts`,
  `test/integration/runtime.test.ts`: new and flipped fixtures.
- `test262/filters.json`: unchanged. Selection already matches declared features
  exactly (`src/test262/selection.ts:93`), so `Symbol.iterator`-declaring dstr
  tests are eligible; `Symbol`, generators, and unsupported includes stay
  filtered.

## Test Plan

### Node Correctness Oracle

Every successful fixture joins `test/integration/oracle.test.ts`, matches Node
byte-for-byte, and reports native lowering. Existing fixtures
(`destructure-array-literal.ts`, `destructure-array-rest.ts`,
`destructure-defaults.ts`, `destructure-nested.ts`, `param-destructure-*.ts`)
must remain Node-equivalent — they exercise the retained fast paths.

### Filtered Test262 Suite

Destructuring coverage lives in the `dstr` subtrees of the filtered
`statements` group (`test262/filters.json` includes `language/statements`):

- `language/statements/const/dstr` — 93 tests
- `language/statements/let/dstr` — 93 tests
- `language/statements/variable/dstr` — 97 tests

Baseline at the time of writing (pinned checkout `9e61c128`, measured with the
targeted command below): **28 pass, 2 fail, 199 coverage-gap, 54 skip** across
the 283 tests. Skips are declarative (`generators`: 42, `propertyHelper.js`: 9,
`compareArray.js`: 3). Most coverage gaps are TSCN1002 rejections; the dstr
subtrees contain exactly the behavior this plan delivers — `ary-ptrn-elem-*-init`
(defaults), `ary-ptrn-elem-ary-*` (nested patterns), `ary-ptrn-rest-*` (rest),
and `ary-init-iter-close` / `ary-init-iter-no-close` (IteratorClose on abrupt
and normal exits) — so a meaningful share of those gaps should convert to
passes. The 2 pre-existing `behavior-mismatch` failures are
`language/statements/const/dstr/ary-ptrn-elem-id-init-fn-name-fn.js` and
`.../ary-ptrn-elem-id-init-fn-name-arrow.js`: a function/arrow expression used
as a default initializer crashes the native binary with SIGSEGV instead of
matching Node. They are in this plan's scope (Phase 1). The crash must be fixed
so the tests pass or, if function-object `name` inference exceeds the supported
metadata surface, fail cleanly with a precise diagnostic — a native crash is
never an acceptable outcome.

Measure with:

- `npm run build && node dist/test262/run.js --path language/statements/const/dstr --path language/statements/let/dstr --path language/statements/variable/dstr`
- `npm run test262:run` for the full filtered suite against
  `test262/baseline.json` (`minimumPass` 785, `maximumFail` 5,
  `maximumBehaviorMismatch` 4).

Success means the dstr subtree pass count increases, their
`coverage-gap`/`compiler-unsupported` count (TSCN1002 classifications in
`src/test262/execute.ts:140`) drops correspondingly, and the full-suite run
reports no baseline regression. Tests skipped for out-of-scope features
(generators, `Symbol`, unsupported includes) remain skips, not failures.

### Gates

`npm run check`, `npm run lint`, `npm test` (Vitest unit + integration,
including `llvm-as` verification of generated LLVM where available).

## Acceptance Criteria

Mirrored from issues #20 and #21:

- A default initializer evaluates only when the yielded value is `undefined`,
  matching Node.
- Nested patterns destructure each yielded value through the appropriate path.
- A rest element collects all remaining yielded values into a new runtime
  array.
- Function-parameter array patterns consume the protocol identically to
  declarations.
- A throwing default initializer closes the iterator before propagation.
- A failing nested pattern (e.g. a non-iterable yielded value) closes the
  source iterator.
- A throwing iterator `return` resolves against the pending completion in Node
  order.
- Complete, non-abrupt destructuring does not invoke the iterator's `return`.
- Pending payloads remain rooted across allocating cleanup under a constrained
  GC heap.
- Node correctness-oracle fixtures cover each shape and report native lowering.
- The Test262 dstr subtrees under `language/statements` improve (more passes,
  fewer coverage gaps) with no full-suite baseline regression.
- Typecheck, lint, Vitest, and LLVM verification pass.

## Non-Goals

- Destructuring assignment expressions, including the Test262
  `language/expressions/assignment/dstr` and `annexB` destructuring subtrees.
- Object-pattern protocol work beyond nested binding elements.
- Real Symbol values or built-in prototype objects.
- Compile-time evaluation of any destructuring shape.
- Performance optimization beyond retaining existing correct fast paths.

## Follow-Up Work

- Iterable array-literal spread and call spread through the reusable
  iterator-consumption lowering, as identified in `plan.md`.
- Destructuring assignment expressions once statement-level targets are
  supported.
- Broaden Test262 filters (e.g. `compareArray.js` support) so more dstr tests
  become runnable.

## Risks

- The protocol path and the retained direct-index fast path can drift. Keep
  Node-oracle fixtures for both, and never fall back from a protocol source to
  index access.
- Lazy defaults place arbitrary expression emission inside a cleanup region for
  the first time. Root yielded values and pending payloads before any
  allocating default or nested evaluation, and restore root depth on every
  outgoing edge, as the existing cleanup frames do.
- IteratorClose precedence is subtle when both the binding step and `return`
  fail. Reuse `emitIteratorCloseBody` unchanged and treat the Node-oracle
  close-ordering fixtures as mandatory.
- Rest loops can run long. Include a GC safepoint and stress rest collection
  under a constrained heap.
- Test262 dstr tests use surface beyond this slice (object rest, generators).
  Leave them as declarative skips rather than contorting the scope to reach
  them.
