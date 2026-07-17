# Plan: Built-In Synchronous Iterables

Implementation plan for Phase 1 of the synchronous iteration protocol.
The master roadmap remains `docs/PLAN.md`.

## Status

Implemented.

Phase 0 is complete. User-defined `[Symbol.iterator]` methods work with generic
`for...of` during normal exhaustion. Iterator acquisition, `.next()` calls,
truthy `done` coercion, exception propagation, function values, closure
environments, and GC rooting have all been exercised end to end.

This slice makes built-in synchronous iterables participate in that protocol and
adds the first protocol-consuming built-ins. It intentionally does not add weak
collections, iterator closing, destructuring, or spread.

## Goal

Make arrays, strings, maps, and sets observable as synchronous iterables through
`Symbol.iterator`, then use the same protocol for:

- `for...of` over runtime arrays.
- `new Map(iterable)`.
- `new Set(iterable)`.
- `Array.from(iterable)`.

Compiled behavior must match Node for supported inputs, including method lookup,
iterator result validation, thrown errors, iteration order, and GC behavior.

## Current State

The general protocol foundation is present:

- `Symbol.iterator` is represented by a compiler-owned sentinel property key.
- `getIteratorValue` looks up and calls the iterator method.
- `callIteratorNext` looks up and calls `.next()` and validates its result.
- `forOfProtocol` consumes user-defined iterables during normal exhaustion.
- Function values and explicit value-or-exception returns support iterator calls.

Built-in behavior remains split across specialized paths:

- Fixed numeric arrays, strings, Map, and Set have specialized `for...of` IR.
- Runtime arrays are not routed through the generic protocol.
- Map and Set iterator methods use collection-specific iterator operations.
- `new Map` and `new Set` only accept statically recognized array inputs.
- `Array.from` accepts recognized arrays and array-like objects, but not general
  iterables.
- Arrays and strings do not yet have real prototype objects on which to install
  `[Symbol.iterator]`.

## Scope

### Built-In Iterator Methods

Expose protocol-visible iterator methods for:

- Array values: default iterator yields values, including `undefined` for holes.
- String values: default iterator yields strings by Unicode code point, matching
  JavaScript string iteration rather than UTF-16 code-unit indexing.
- Map values: default iterator is `entries`; `keys`, `values`, and `entries`
  continue to return protocol-compatible iterator objects.
- Set values: default iterator is `values`; `keys`, `values`, and `entries`
  continue to return protocol-compatible iterator objects.

Each returned iterator is an object with a callable `.next` function value. A
completed iterator returns `{ value: undefined, done: true }` and remains
completed on subsequent calls.

### Runtime Array `for...of`

Route runtime arrays through a supported iteration path. Prefer the generic
protocol path so runtime arrays exercise the same observable method lookup as
other iterables. Existing fixed-array, string, Map, and Set specialized loop
paths remain valid backend fast paths.

### Iterable Map and Set Constructors

Extend `new Map(input)` and `new Set(input)` to consume arbitrary supported
iterables:

- `new Map(iterable)` requires each yielded item to be an object from which
  element `0` is the key and element `1` is the value.
- `new Set(iterable)` adds each yielded value in iteration order.
- Constructor consumption uses the existing Map `set` and Set `add` semantics,
  including SameValueZero behavior.
- Iterator acquisition, `.next()` calls, property access, and collection
  insertion errors propagate through the existing exception ABI.

The current recognized-array implementation may remain as a fast path only when
it is observably equivalent. Inputs with a custom `[Symbol.iterator]` must use
the protocol rather than direct indexing.

### Iterable `Array.from`

Extend `Array.from(input)` to prefer a callable `Symbol.iterator` when present:

- Consume yielded values in order into a new runtime array.
- Preserve support for array-like objects when no iterator method exists.
- Preserve the existing mapping callback and callback index behavior.
- Call the mapping callback once per yielded value after retrieval.
- Propagate iterator and callback exceptions through the existing exception ABI.

## Design Decisions

### Keep The Well-Known-Symbol Sentinel

Continue representing `Symbol.iterator` as the existing private sentinel key.
This slice does not introduce a general Symbol value, a new NaN-box tag, or
symbol-keyed dictionary storage.

The sentinel remains an internal compatibility bridge until real Symbol values
and built-in prototype objects are designed.

### Use Runtime Thunks Instead Of Prototype Objects

Arrays and strings do not yet have real prototype objects. Their iterator method
lookup therefore uses runtime-owned named function thunks exposed under the
sentinel key. Map and Set use the same externally observable function-value
shape.

The dispatch belongs in the runtime property lookup boundary, not in source AST
special cases. This keeps `getIteratorValue` as the single consumer-facing
operation and allows later replacement with real prototype properties.

### Reuse Existing Heap Kinds

Iterator objects reuse ordinary runtime objects and function objects. Iterator
state may be stored in ordinary object fields or an existing runtime iterator
cell when that cell can be reached and marked through the iterator object.

Do not add a new JavaScript-visible value tag. Any native iterator state must be
owned by a GC-traced object and must keep its source collection or string alive.

### Preserve Specialized Fast Paths Carefully

Specialized `for...of` operations may remain for fixed arrays, strings, Map, and
Set. Protocol-consuming APIs must not bypass observable iterator overrides.

In particular:

- `Array.from(value)` must observe `value[Symbol.iterator]` before using
  array-like indexing.
- Map and Set constructors must observe the supplied iterator method.
- Runtime-array `for...of` must not silently ignore a custom iterator method.

### Normal Completion Only

This slice supports iterator consumption that reaches `done: true`. Generic
iterator consumption that can terminate abruptly through `break`, `return`, or
an escaping exception still requires `IteratorClose`.

Existing compile-time rejection for unsupported abrupt generic `for...of`
remains. Constructor and `Array.from` error paths may propagate errors, but this
slice does not invoke an iterator's optional `return` method. Tests must document
this temporary boundary rather than claiming complete ECMAScript iterator-close
semantics.

## Implementation Plan

### 1. Define Built-In Iterator Runtime Operations

- Add or adapt runtime helpers that create array, string, Map, and Set iterator
  objects.
- Give every iterator object a callable `.next` function value with the iterator
  object as `this`.
- Store iteration kind and cursor state without exposing backend pointers as
  JavaScript values.
- Return ordinary `{ value, done }` runtime objects.
- Ensure repeated `.next()` calls after completion remain completed.
- Register all helper dependencies through the existing runtime-helper registry.

### 2. Expose `Symbol.iterator` On Built-In Values

- Extend value property lookup for array, string, Map, and Set values so the
  iterator sentinel resolves to the appropriate function thunk.
- Ensure ordinary missing-property and non-callable-method behavior still flows
  through `getIteratorValue`.
- Preserve explicit own properties and supported overrides before falling back
  to built-in behavior.
- Keep the sentinel inaccessible through ordinary source string keys.

### 3. Make Existing Collection Iterators Protocol-Compatible

- Route Map `keys`, `values`, and `entries` through iterator objects whose
  `.next` is a function value.
- Route Set `keys`, `values`, and `entries` through the same shape.
- Make Map's default iterator equivalent to `entries`.
- Make Set's default iterator equivalent to `values`.
- Retain internal collection iteration operations only as non-observable fast
  paths.

### 4. Support Runtime Array `for...of`

- Update `lowerForOfStatement` so a runtime-array binding no longer becomes an
  unsupported diagnostic.
- Route it through generic protocol lowering unless an equivalent specialized
  operation observes iterator overrides correctly.
- Verify holes, mutations during iteration, and logical `length` behavior
  against Node.

### 5. Add A Reusable Iterator-Consumption Lowering

- Centralize the acquire-next-test-read loop used by constructors and
  `Array.from`.
- Evaluate the iterable expression once.
- Read `done` before `value` and apply normal JavaScript truthiness.
- Root the iterable, iterator, next result, yielded value, destination
  collection, and callback state across allocating calls.
- Include a GC safepoint in long-running consume loops.
- Keep completion and exception edges explicit in JS IR.

This should be a lowering helper over ordinary IR where practical. Add a new IR
operation only if doing so materially improves exception edges or GC-root
correctness.

### 6. Extend Map and Set Construction

- Preserve zero-argument construction.
- Detect iterable inputs through runtime iterator lookup rather than static
  binding kind alone.
- For Map, validate each yielded entry and read keys `0` and `1` through normal
  property access.
- Insert through the existing Map/Set runtime operations.
- Add precise runtime TypeErrors for malformed Map entries and non-iterable
  inputs, matching Node's class and message where the correctness oracle checks
  them.

### 7. Extend `Array.from`

- Prefer the iterator path when a callable iterator method is present.
- Fall back to the existing array-like path only when no iterator method exists.
- Grow the destination runtime array as values are consumed.
- Preserve mapping callback arguments `(value, index)` and supported `thisArg`
  behavior.
- Ensure callback results and captured environments remain rooted.

### 8. Remove Superseded Special Cases

- Remove constructor and `Array.from` branches made redundant by the reusable
  protocol path when doing so does not regress fast paths.
- Keep specialization decisions local to lowering or backend internals.
- Do not duplicate iterator validation or error-message construction across
  built-ins.

## Test Plan

### Built-In Iterators

- `array[Symbol.iterator]()` returns an object with callable `.next`.
- Array iteration yields mixed values and holes in order.
- Array iterator observes length growth and shrinkage like Node.
- String iteration keeps a surrogate pair together as one yielded string.
- Map default iteration yields `[key, value]` entries in insertion order.
- Set default iteration yields values in insertion order.
- Map/Set `keys`, `values`, and `entries` return protocol-compatible iterators.
- Calling `.next()` after completion remains completed.

### Iterator Overrides

- Runtime array `for...of` observes an assigned `[Symbol.iterator]`.
- `Array.from` observes a custom iterator even when `length` is present.
- Map and Set constructors observe custom iterable methods.
- A non-callable iterator property throws a catchable TypeError.
- An iterator method returning a primitive throws a catchable TypeError.
- A `.next()` returning a primitive throws a catchable TypeError.

### Constructors

- `new Map(userIterable)` consumes entry objects.
- `new Map(map)` copies entries.
- `new Set(userIterable)` consumes values.
- `new Set(set)` copies values.
- Duplicate keys and values preserve existing collection semantics.
- A malformed Map entry throws a catchable TypeError.
- Exceptions from iterator methods, `.next`, entry access, `set`, or `add`
  propagate.

### `Array.from`

- Consumes a user iterable with no `length`.
- Prefers an iterator over an array-like `length`.
- Preserves the array-like fallback when no iterator exists.
- Applies a mapping callback with the correct value and index.
- Propagates iterator and callback exceptions.

### GC And Backend Correctness

- A small GC heap survives long array, string, Map, and Set iteration.
- Iterator state keeps its source alive across collections.
- Constructor consumption keeps destination collections and yielded values
  alive.
- `Array.from` keeps its callback closure and destination alive.
- Generated LLVM passes `llvm-as` verification where available.
- Existing specialized iteration fixtures remain byte-for-byte compatible.

### Fixture Flip List

Convert these unsupported fixtures to successful Node-oracle coverage:

- `map-constructor-iterable-unsupported.ts`.
- `array-from-symbol-iterator-unsupported.ts`.

Add focused fixtures for Set construction from a user iterable, runtime-array
`for...of`, built-in iterator access, Unicode string iteration, iterator
overrides, malformed Map entries, and GC stress.

Do not flip `weak-map-unsupported.ts` or `weak-set-unsupported.ts` in this slice.

## Acceptance Criteria

- Runtime arrays, strings, maps, and sets expose a working default synchronous
  iterator through the existing `Symbol.iterator` sentinel.
- Built-in iterator objects expose a callable `.next` and return valid iterator
  result objects.
- Runtime-array `for...of` compiles and matches Node during normal completion.
- `new Map(iterable)`, `new Set(iterable)`, and `Array.from(iterable)` accept
  user-defined iterables and match Node for the supported matrix.
- Iterator overrides are observed instead of bypassed by static fast paths.
- Errors remain catchable and cross function boundaries through the explicit
  value-or-exception ABI.
- GC stress tests pass with a constrained heap.
- Typecheck, lint, Vitest, Node-oracle comparisons, and LLVM verification pass.
- WeakMap, WeakSet, IteratorClose, destructuring, and spread remain explicitly
  unsupported rather than receiving partial semantics.

## Non-Goals

- `WeakMap` or `WeakSet`. Correct weak collections require a GC design for weak
  references and ephemeron processing.
- `IteratorClose` or invocation of an iterator's `return` method.
- Generic iterator loops with abrupt completion.
- Array destructuring through the iterator protocol.
- Iterable call spread or array-literal spread.
- Generators, `yield`, async functions, promises, async iterators, or
  `for await...of`.
- General `Symbol` values, `Symbol.for`, `Symbol.keyFor`, or user-created symbol
  property keys.
- Real built-in prototype objects.
- Iterator helpers or the `Iterator` constructor proposal.
- Performance optimization beyond retaining existing correct fast paths.

## Follow-Up Work

The next synchronous iteration slice should introduce a shared completion model
for `try...finally` and `IteratorClose`. After abrupt completion is correct,
destructuring and spread can be routed through the iterator protocol without
silently omitting cleanup behavior.

WeakMap and WeakSet require a separate plan coordinated with the non-moving
mark-sweep collector. They must not be implemented as ordinary strong
collections merely to expand API coverage.

## Risks

- Built-in property lookup can accidentally bypass user iterator overrides.
  Test overrides on every protocol-consuming API.
- String indexing and string iteration differ for surrogate pairs. Reuse UTF-16
  observable semantics while advancing iterators by code point.
- Iterator result allocation increases GC pressure. Prioritize correctness and
  rooting before considering reusable internal result cells.
- Map entry validation can become statically specialized and reject valid custom
  entry objects. Perform runtime property access through the value/object path.
- Keeping specialized loops alongside protocol behavior can create semantic
  drift. Treat Node-oracle tests for overrides and mutation as mandatory.
- Omitting `IteratorClose` is observable on failures. Keep the boundary explicit
  and do not claim complete iterator semantics until the follow-up lands.
