# Plan A: First-Class Function Objects

Feature plan for proposal A from the next-feature review. This is scoped to a single
feature; the master roadmap remains `docs/PLAN.md`.

## Goal

Make JavaScript functions **first-class runtime values**: heap-allocated, NaN-boxed
function objects that can be stored in variables, passed as arguments, and called back
from runtime code through one uniform dispatch path. This delivers the unfinished
consequence of ADR 0012 — *"Functions, closures, methods, and array callbacks share one
calling convention"* — and satisfies master PLAN.md Milestone 5's *"unified function
objects with code pointer, environment pointer, prototype metadata, and explicit `this`."*

## Context

The foundational prerequisites just landed: the uniform `i64` NaN-boxed `JSValue` ABI
across all boundaries (ADR 0012) and the non-moving mark-sweep GC with an explicit root
stack (ADR 0009). Despite that, functions are **not** runtime values today:

- Closures use **lambda lifting**. A `closureFactory` binding holds a `functionName` plus
  `captureNames`; at each statically-known call site the captures are prepended as extra
  args (`ir.ts:4148`), and the lifted `define` takes captures as leading params
  (`llvm.ts:311`, via the `returnClosure` op). Closures are only reachable as **return
  values of named function expressions** (`lowerReturnedFunctionExpression`, which
  requires `expression.name`).
- Array callbacks (`map`/`filter`/`reduce`/`forEach`/`find`/`findIndex`/`sort`/`flatMap`)
  require the callback to be a **direct identifier** resolving to a top-level function
  (`ir.ts:5951`: `if (!ts.isIdentifier(callback)) → unsupported`) and emit a direct
  `@callbackName` call inside an inlined LLVM loop. `thisArg` is unsupported.
- There is no function-object allocator, no `jsCall`-style dispatch trampoline, and no way
  to call an arbitrary `i64` callee.

This gates the largest cluster of unsupported language surface (12 fixtures directly,
plus implicit): inline arrow callbacks (the dominant TypeScript idiom), `thisArg`, the
`for-of` iteration protocol, and `Map`/`Set`/`WeakMap`/`WeakSet` iterable constructors.

## Current Decisions

- Function objects are **GC-allocated NaN-boxed pointers**, reusing the object-pointer
  tag family (`valueBoxObject`/`valueObjectPtr`) with a kind discriminator, consistent
  with ADR 0004 and ADR 0012. Boxing helpers `valueBoxFunction`/`valueFunctionPtr` are
  added to the intrinsic table alongside the existing object helpers.
- The function-object layout is a runtime struct: `{ codePtr, envPtr, boundThis,
  prototype, name, flags }`. `codePtr` is a uniform `i64 (i64 argc, ptr argv, ptr env,
  ptr this)` entry point; `envPtr` is a heap environment of captured cells; `boundThis`
  holds a bound receiver or an "unbound" sentinel; `flags` mark constructor / arrow /
  bound.
- A single runtime trampoline `jsCall(i64 fnValue, i64 argc, ptr argv) -> i64` is the
  **only** dispatch point for callees not statically known. It unboxes, loads
  `codePtr`/`envPtr`/`boundThis`, and tail-calls. Direct calls to known top-level
  functions remain as-is — the sanctioned fast path of ADR 0012.
- Captured variables move from lambda lifting's "extra leading args" to a **heap
  `Environment` struct** traced by the GC. Both paths coexist during migration: lambda
  lifting stays for closures that never escape as values; function objects are used when
  a function value flows into unknown-position runtime code.
- `this` is carried on the function object. Method calls bind `this` to the receiver and
  go through the same object; this generalizes the existing synthetic class `this`
  parameter (`CLASS_THIS_NAME`) rather than replacing it outright.
- Call arguments are passed as a contiguous root-scanned `argv` buffer; a fixed-arity
  fast path covers the common N-arg case, falling back to the variadic buffer.

## Phases

### Phase 0 — Tracer Bullet (vertical slice)

Get `arr.map(x => x)` working end to end and nothing more. Prove the ABI + GC + dispatch
path on a single fixture.

- Add runtime `FunctionObject` struct, `valueBoxFunction`/`valueFunctionPtr`, and a
  minimal `jsCall` (loads `codePtr` + `envPtr`, calls).
- Add GC marking for function objects (extend `gcMarkValue`/`gcMarkObject`) and a trivial
  `Environment` with one capture cell.
- Lower a zero/single-capture arrow used directly as an array callback into a function
  object value; route the existing inlined `map` loop's callback invocation through
  `jsCall` instead of a direct `@name` call.
- Convert `array-runtime-map-unsupported-callback.ts` from `expectUnsupportedDiagnostic`
  to an expected-behavior fixture; keep `llvm-as` verification green.

### Phase 1 — Generalize Array Callbacks

- Route every inlined array callback loop (`filter`, `reduce`, `forEach`, `find`,
  `findIndex`, `sort`, `flatMap`) through `jsCall`.
- Accept any callback expression — arrow, function expression, or a value read from a
  variable/property — not just identifiers. This removes the `isIdentifier` gate.
- Add `thisArg` plumbing on the callbacks that take one.
- Add GC safepoints inside the long-running callback loops (consistent with ADR 0009).
- Flip the 8 `array-runtime-*-unsupported-callback` / `-thisarg` / `-noarg` fixtures to
  expected behavior; add new arrow-callback fixtures.

### Phase 2 — Full First-Class Functions

- Lower arrow and function-expression values in **any** position (assignment, property
  storage, array element, argument, return) to function-object allocation, not only as
  the immediate operand of an array method.
- Generalize call expressions so an arbitrary `i64` callee lowers to `jsCall`; keep
  static direct calls for known callees.
- Multi-capture `Environment` with full GC tracing; retire lambda lifting once function
  objects cover the escape analysis (lambda lifting may remain as an optimization).
- Function-object metadata: `name`, `length`, and `prototype` properties; wire
  `Function.prototype` and constructor flags for ordinary functions.
- Connect to class methods so method values are function objects (reconcile with the
  synthetic `this` lowering).

### Phase 3 — Iteration Protocol (downstream payoff)

This phase consumes first-class functions and unlocks the rest of the cluster; it is the
justification for the whole feature.

- `for-of` over user objects via `[Symbol.iterator]`: iterator objects exposing a `next`
  function value dispatched through `jsCall`.
- `Map`/`Set`/`WeakMap`/`WeakSet` iterable constructors (`map-constructor-iterable`,
  `weak-map`, `weak-set` fixtures).
- `Array.from` with iterable/`Symbol.iterator` source.

## Affected Components

- `src/compiler/runtime-helpers.ts` — `FunctionObject` layout, `jsCall` trampoline,
  `Environment` alloc/trace, `valueBoxFunction`/`valueFunctionPtr`, GC marker extension,
  `Symbol.iterator` plumbing (Phase 3).
- `src/compiler/ir.ts` — new ops for function-object/env allocation and `jsCall`; extend
  `constClosure`/`returnClosure`/`closureFactory` toward value-producing allocation.
- `src/compiler/llvm.ts` — emit the new struct/runtime defs, lower `jsCall`, boxing.
- `src/compiler/frontend.ts` — lower arrow/function-expression values; lower callback
  expressions generically; general call-of-value.
- `src/compiler/linker.ts` — link the new runtime definitions.
- `test/fixtures/` — flip unsupported fixtures and add new coverage.

## Non-Goals

- No `arguments` object.
- No `Function.prototype.bind`/`apply`/`call` semantics beyond the bound-`this` slot
  (fast-follow).
- No generators or async functions (deferred past the synchronous milestone per master
  PLAN.md).
- No `new` on arrow functions; no proxy/reflect callable hooks.
- No perf tuning of `jsCall` — fast paths are reserved by ADR 0004 for later.

## Correctness

- Node + filtered Test262 oracle (stdout, stderr, exit code, thrown error class/message),
  per master PLAN.md.
- Every previously-unsupported callback/iterable fixture flips to expected behavior;
  `llvm-as` verification stays green across all fixtures.
- GC regression: add a fixture that allocates many function objects and environments
  across collection cycles and asserts they survive until unreachable.
- No behavior change to existing direct-call and named-callback fixtures (they must keep
  passing byte-for-byte on stdout/exit).

## Risks

- **ABI/GC/root-stack churn.** `jsCall` is additive and the static call path is
  unchanged, so blast radius is bounded; the tracer bullet lands first to de-risk.
- **Closure-capture transition** (lambda lifting → heap env) is the riskiest refactor.
  Mitigation: both paths coexist; function objects are used only when a function value
  escapes, so existing code keeps working during migration.
- **`this` semantics** interaction with class methods and constructors is subtle.
  Mitigation: Phase 0/1 avoid `this`; reconciliation is deferred to Phase 2 where the
  existing class `this` lowering can be migrated deliberately.
- **Performance.** Indirection through `jsCall` plus env loads adds overhead; acceptable
  for the correctness milestone and explicitly reserved as a fast path by ADR 0004.
