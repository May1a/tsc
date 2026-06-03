# ADR 0010: Transition Fixed Aggregates To Runtime Shapes

## Status

Accepted as an incremental design note.

## Context

The LLVM text backend supports tracer-bullet aggregate behavior while the full NaN-boxed `JSValue` runtime is still landing. Arrays have a fixed-length numeric fast path, runtime-value array helpers, known-shape numeric object structs, and runtime string-key dictionary object helpers.

`docs/PLAN.md` requires spec-like dynamic arrays with holes, `length`, and prototype fallback, plus dictionary objects with descriptors, prototypes, and shape-version fast paths.

## Decision

Keep fixed numeric arrays and known-shape numeric objects as backend-local lowering fast paths. Add runtime aggregate helpers alongside them for cases that need `JSValue` storage or dynamic string-key lookup.

During the transition:

- Fixed numeric array literals continue to lower to `double` globals or stack storage.
- Array literals with holes or non-number values lower to allocated runtime arrays with logical length and `JSValue` elements. Holes are currently represented as `undefined` values; resizing, deletion, and prototype fallback remain deferred.
- Known-shape numeric object literals continue to lower to LLVM structs, and only populate a dictionary side table when dynamic lookup is used. Fixed-property writes must update both the struct and the side table when a side table exists.
- Runtime-only object literals lower to dictionary objects with string keys and `JSValue` fields. Descriptors, prototypes, deletion, and shape guards remain deferred.
- Dynamic computed string keys lower through dictionary lookup rather than compile-time field indexes.
- Computed-key writes on runtime dictionary objects lower through dictionary stores. Runtime dictionaries track capacity and grow before appending new keys. Computed-key writes on known-shape objects are only supported when the key resolves to a known fixed field.

## Consequences

Current fixtures intentionally reject array spread, object spread, shorthand, and methods with `TSCN1002` diagnostics. Array holes, non-number array elements, dynamic computed object keys, and non-number object fields are supported through runtime helpers.

The fixed aggregate bindings should stay internal to the LLVM-text slice. They must not become public runtime ABI, because that would conflict with ADR 0004 and the synchronous runtime milestone.
