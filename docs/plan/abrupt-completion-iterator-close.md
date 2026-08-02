# Plan: Abrupt Completion And IteratorClose

## Status

Implemented.

This is the next synchronous-semantics slice after explicit exception propagation,
first-class function values, and built-in synchronous iterables. It implements the
follow-up identified in `docs/plan/iterators.md`: one shared completion model for
`try...finally` and `IteratorClose`.

The master roadmap remains `docs/PLAN.md`. Exception transport must continue to
follow ADR 0008's explicit value-or-exception return convention.

## Goal

Represent abrupt JavaScript control flow explicitly enough to:

- Execute `finally` exactly once for normal and abrupt exits.
- Preserve or replace a pending completion according to JavaScript semantics.
- Close generic synchronous iterators on `break`, `return`, and escaping throws.
- Keep `continue` to the same loop open while closing iterators exited by an outer
  transfer.
- Reuse the same mechanism for later iterator-based destructuring and spread.

All delivered behavior must use native lowering. Compile-time evaluation is not an
acceptable implementation of this feature.

## Motivation

The existing foundations are sufficient, but the control-flow model has a visible
gap:

- `try...catch` has native IR and LLVM lowering, but `finally` is rejected in
  `src/compiler/ir.ts`.
- Generic `for...of` rejects bodies that may exit abruptly because it cannot call
  the iterator's optional `return` method.
- The backend currently routes returns, throws, breaks, and continues directly to
  their destinations. A `finally` block or iterator cleanup cannot reliably
  intercept all of those independent edges.
- Destructuring and spread cannot safely adopt the generic iterator protocol until
  iterator cleanup is correct.

Implementing `finally` and iterator closing separately would duplicate pending
control-flow state and make nested cleanup ordering difficult to reason about. They
should be built on one completion abstraction.

## Semantic Model

### Completion Records

The compiler should model the JavaScript completion categories needed by the
supported synchronous language:

```ts
type JsIrCompletionKind =
  | "normal"
  | "return"
  | "throw"
  | "break"
  | "continue";
```

A pending completion carries:

- A kind.
- A `JSValue` payload for `return` and `throw`.
- A control-flow target identity for `break` and `continue` when needed.

This is a compiler control-flow representation, not a JavaScript-visible heap
object. The exact IR shape may use structured operations, explicit destinations,
or backend-local slots, but completion handling must be centralized rather than
reimplemented by each statement emitter.

### Cleanup Regions

Lowering maintains a stack of cleanup regions. A direct control transfer is allowed
only when no active cleanup region must run first. Otherwise the transfer records
its pending completion and enters the innermost cleanup region.

After cleanup:

- Normal cleanup resumes the pending completion.
- An abrupt completion produced by cleanup replaces the pending completion where
  JavaScript requires it.
- Nested cleanup regions run from innermost to outermost.
- Return and throw payloads remain rooted across allocating cleanup code.

The same mechanism serves a `finally` block and a generic iterator-close region.

### IteratorClose

When generic iterator consumption exits before normal exhaustion:

1. Read the iterator's `return` property through ordinary runtime property lookup.
2. If the method is absent, preserve the pending completion.
3. If present but non-callable, apply JavaScript's observable error behavior.
4. Call it with the iterator as `this` through the existing function-value calling
   convention.
5. Validate the returned value where required by JavaScript semantics.
6. Resolve errors from lookup, invocation, or result validation against the pending
   completion in the same order as Node.

Normal exhaustion (`done` is truthy) does not call `return`. A `continue` targeting
the same `for...of` loop also does not close the iterator.

## Scope

### Included

- `try...finally`.
- `try...catch...finally`.
- Nested `finally` blocks.
- `return`, `throw`, `break`, and `continue` through `finally`.
- Generic protocol `for...of` cleanup on early exit.
- Iterator `return` lookup and invocation.
- Exceptions thrown while acquiring or calling iterator `return`.
- Iterator-close result validation.
- GC rooting of pending completion payloads and iterators.
- Native Node-oracle tests and LLVM verification.

### Excluded

- Generators and `yield`.
- Async functions, promises, async iterators, and `for await...of`.
- General Symbol values beyond the existing `Symbol.iterator` bridge.
- Iterator helpers or explicit resource management.
- Labeled statements unless they are separately added to the supported language
  surface.
- Iterator-based destructuring and spread; those are follow-up consumers of this
  work.
- WeakMap and WeakSet.
- Native unwinding or LLVM personality functions.

## Implementation Plan

### Phase 0: Native Correctness Guard

- Add focused fixtures for the target semantics before changing lowering.
- Put every successful fixture in the Node correctness oracle.
- Assert that each fixture's trace map reports `loweringMode: "native"`.
- Keep unsupported forms diagnostic-only until their native implementation lands.
- Do not extend the B683 compile-time interpreter for this work.

### Phase 1: Completion-Aware Control Flow

- Introduce the minimum IR vocabulary needed to represent pending completions and
  cleanup regions.
- Centralize emission of return, throw, break, and continue transfers.
- Preserve existing direct branches when no cleanup region is active.
- Route transfers through active cleanup regions from innermost to outermost.
- Root pending `return` and `throw` values before any allocating cleanup operation.
- Extend operation traversal, trace finalization, and termination analysis for all
  new operation children.

The first tracer fixture should be a function returning from inside
`try...finally`, with observable output proving that cleanup runs before the caller
receives the result.

### Phase 2: `try...finally`

- Replace the current `finallyBlock` rejection with native lowering.
- Generalize the existing `tryCatch` operation or replace it with a structured try
  operation supporting optional catch and finally regions.
- Implement normal fallthrough through `finally`.
- Implement pending return and throw through `finally`.
- Implement abrupt completion inside `finally`, including replacement of an earlier
  return or throw.
- Support nesting and `try...catch...finally` without global exception state.
- Preserve lexical catch bindings and existing explicit exception targets.

### Phase 3: Runtime Iterator Close Operation

- Add a throwing runtime helper or equivalent generated operation for iterator
  `return` lookup, callability checks, invocation with the correct receiver, and
  result validation.
- Reuse `valuePropertyGet`, function-value dispatch, and the existing explicit
  exception ABI rather than adding a second calling path.
- Keep the iterator and returned object rooted across property lookup and calls.
- Register helper dependencies through the runtime-helper registry.
- Match Node's error class and message for the tested invalid cases.

The helper should perform iterator protocol mechanics. Resolution between a close
failure and an already pending completion remains owned by compiler control flow.

### Phase 4: Generic `for...of` Integration

- Install an iterator cleanup region after successful iterator acquisition.
- Remove the blanket `bodyRequiresIteratorClose` rejection.
- Close on `break` from the current loop, function `return`, and escaping throw.
- Do not close on normal exhaustion or same-loop `continue`.
- Correctly close an inner iterator when control transfers to an enclosing loop.
- Preserve cleanup ordering when `for...of` is nested inside `try...finally`, and
  vice versa.
- Ensure a throwing loop-body call follows the same close path as an explicit
  `throw` statement.

Static specialized loops may remain fast paths when they are observably equivalent.
Any path consuming the generic iterator protocol must use the shared cleanup model.

### Phase 5: Consolidation

- Remove the temporary abrupt-exit rejection and obsolete diagnostic text.
- Remove control-flow scans that are no longer needed for correctness.
- Keep analysis only where it enables a proven fast path without changing behavior.
- Document the completed support boundary in `docs/plan/iterators.md` and the master
  roadmap.
- Record any material control-flow or ABI decision in an ADR before broadening the
  design beyond this plan.

## Affected Components

- `src/compiler/ir.ts`: completion representation, cleanup-region lowering,
  `try...finally`, and generic `for...of` integration.
- `src/compiler/llvm.ts`: cleanup dispatch, pending completion storage, rooting,
  and structured try/finally control flow.
- `src/compiler/runtime-helpers.ts`: iterator-close protocol helper and dependencies.
- `src/compiler/trace.ts`: exhaustive traversal if new nested operation forms are
  introduced.
- `test/fixtures/`: positive, negative, nesting, and GC-stress fixtures.
- `test/integration/runtime.test.ts`: unsupported-fixture flips and focused runtime
  assertions.
- `test/integration/oracle.test.ts`: mandatory Node comparisons for successful
  behavior.

## Test Plan

### `finally`

- Normal try fallthrough runs `finally` once.
- A caught throw runs catch and then `finally`.
- An uncaught throw runs `finally` before propagating.
- Return from try runs `finally` and preserves the return value.
- Return from catch runs `finally` and preserves the return value.
- Return from `finally` replaces a prior return or throw.
- Throw from `finally` replaces a prior normal or return completion.
- Nested `finally` blocks run inside-out.
- `break` and `continue` through `finally` preserve loop behavior.
- Mutable bindings changed in `finally` remain observable.

### Iterator Closing

- Early `break` calls iterator `return` exactly once.
- Function `return` from the loop body closes before the function returns.
- Escaping explicit throw closes before propagation.
- An exception from a called function in the body closes before propagation.
- Same-loop `continue` does not close.
- Normal exhaustion does not close.
- Missing `return` preserves the original completion.
- Non-callable `return` produces the Node-compatible error.
- `return` receives the iterator as `this`.
- Primitive close results are handled like Node.
- A throwing `return` interacts correctly with pending break, return, and throw
  completions.
- Nested iterators close inside-out.

### Interaction And GC

- `for...of` inside `try...finally` runs iterator close before the outer finally
  when control exits the loop's region first.
- `try...finally` inside `for...of` runs the inner finally before iterator close.
- Pending object return values survive cleanup under a constrained GC heap.
- Pending thrown objects survive iterator close and nested finally blocks.
- Iterator and `return` function objects survive allocations during close.
- Generated LLVM passes `llvm-as` verification where available.
- Every successful fixture matches Node and is marked as native lowering.

### Fixture Changes

- Convert `try-finally-unsupported.ts` into a successful native fixture, renaming it
  if necessary to reflect supported behavior.
- Convert `for-of-iterator-propagated-throw-unsupported.ts` into a successful native
  Node-oracle fixture.
- Add focused fixtures for return, break, continue, nested cleanup, invalid iterator
  `return`, close-time exceptions, and GC stress.

## Acceptance Criteria

- `try...finally` and `try...catch...finally` match Node for the supported synchronous
  statement surface.
- Generic `for...of` invokes `IteratorClose` on every supported abrupt exit and never
  on normal exhaustion or same-loop continue.
- Nested cleanup executes in JavaScript order and exactly once.
- Pending return and throw values remain live across allocating cleanup code.
- No fixture delivered by this plan uses `compileTimeFallback`.
- Unsupported syntax continues to produce a precise compile-time diagnostic rather
  than a runtime trap or compile-time execution.
- Typecheck, lint, Vitest, Node-oracle comparisons, GC stress tests, and LLVM
  verification pass.

## Follow-Up Work

After this plan is complete:

1. Route array destructuring through the iterator protocol, including abrupt
   completion and elisions.
2. Route iterable array-literal spread and call spread through reusable iterator
   consumption.
3. Continue replacing compile-time fallback behavior with native lowering,
   beginning with class inheritance and runtime RegExp behavior.
4. Expand filtered Test262 coverage for statements, iteration, and exception
   semantics.

## Risks

- Cleanup control flow can grow combinatorially when nested. Mitigate this with one
  cleanup stack and one completion-dispatch mechanism.
- A pending value can be collected while cleanup allocates. Root payloads before
  entering cleanup and restore root depth on every outgoing edge.
- LLVM blocks can become invalid through duplicate terminators or missing joins.
  Add focused IR verification throughout each phase rather than only at completion.
- IteratorClose has subtle precedence rules when both the original operation and
  close operation fail. Treat Node-oracle cases as mandatory, not optional edge
  tests.
- Specialized and protocol iteration can drift semantically. Keep override and
  mutation tests around every retained fast path.
- Extending the existing monolithic emitters can worsen backend debt. Keep the new
  completion interface narrow and use the structured LLVM builder where practical,
  without turning this feature into an atomic backend rewrite.
