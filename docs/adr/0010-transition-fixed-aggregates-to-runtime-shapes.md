# ADR 0010: Transition Fixed Aggregates To Runtime Shapes

## Status

Accepted as an incremental design note.

## Context

The current LLVM text backend supports tracer-bullet aggregate behavior before the full NaN-boxed `JSValue` ABI exists. Arrays are fixed-length numeric storage, and objects are known-shape numeric structs. This keeps early IR and native execution tests small, but it is not JavaScript-compatible enough for the synchronous runtime milestone.

`docs/PLAN.md` requires spec-like dynamic arrays with holes, `length`, and prototype fallback, plus dictionary objects with descriptors, prototypes, and shape-version fast paths.

## Decision

Keep the current fixed numeric arrays and known-shape numeric objects as backend-local lowering shapes until `JSValue` and runtime allocation are introduced.

When the runtime value ABI lands:

- Array literals lower to allocated array objects with indexed storage, logical length, element kind metadata, and hole representation.
- Array access and mutation call runtime helpers that can observe holes, resize rules, deletion, and prototype fallback.
- Object literals lower to dictionary objects with data descriptors and prototype metadata.
- Known-shape object field loads may remain as fast paths only when guarded by shape identity and shape version.
- Dynamic computed keys lower through property-key conversion and dictionary lookup rather than compile-time field indexes.

## Consequences

Current fixtures intentionally reject array holes, spreads, non-numeric elements, object spread, shorthand, methods, dynamic computed keys, and non-number object fields with `TSCN1002` diagnostics.

The fixed aggregate bindings should stay internal to the LLVM-text slice. They must not become public runtime ABI, because that would conflict with ADR 0004 and the synchronous runtime milestone.
