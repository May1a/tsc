# ADR 0011: Use A Generated Runtime IR Section During JSValue Transition

## Status

Accepted as an incremental design note.

## Context

The backend currently emits textual LLVM IR directly. Runtime helpers such as `strConcat` and `strEquals` are still generated as LLVM text, but helper registration and emission now live behind `src/compiler/runtime-helpers.ts` instead of being embedded throughout `llvm.ts`.

ADR 0004 requires a 64-bit NaN-boxed `JSValue` ABI. The current compiler still has temporary direct fast paths for numbers (`double`), booleans (`i1` internally), fixed numeric arrays, known-shape numeric objects, and strings as `(ptr, length)` pairs.

## Decision

Until the runtime is authored and linked as its own module, the next runtime boundary is a generated runtime IR section inside `main.ll`:

- External runtime declarations are emitted before constants, globals, user forward declarations, runtime definitions, user definitions, and `@main`.
- Runtime helper definitions are emitted once, deterministically, from `runtime-helpers.ts`.
- The string function ABI is a transitional direct ABI: string parameters are `(i64 length, ptr data)`, and string returns use `{ ptr, i64 }`.
- Direct primitive and fixed aggregate paths remain backend-local fast paths only. They are not the stable public runtime ABI.
- New helpers that are not string-specific should be added through `runtime-helpers.ts` first, then migrated behind the `JSValue` ABI as ADR 0004 lands.

## Consequences

The compiler can now support tracer fixtures for string parameters, string returns, string concat, and string equality inside function bodies without committing to the final value representation.

This keeps CLI artifacts understandable (`main.ll`, trace map, diagnostics, and executable when linked), while leaving room to split the generated runtime IR section into a separate linked runtime module later.
