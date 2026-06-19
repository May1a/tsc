# ADR 0012: Adopt The Uniform NaN-Boxed i64 Value ABI Across Function Boundaries

## Status

Accepted.

## Context

ADR 0004 committed the compiler to a 64-bit NaN-boxed `JSValue` ABI. ADRs 0010 and 0011 described transitional, backend-local fast paths in which scalars crossed function boundaries in type-specific forms: numbers as `double`, booleans as `i1`, and strings as `{ ptr, i64 }` / `(i64 len, ptr data)`. The per-value `JsIrValueKind` (`"number" | "string" | "value"`) selected the boundary calling convention per function.

The encode/decode primitives and tag constants for the real ABI already existed in `src/compiler/runtime-helpers.ts` (`valueBoxString`, `valueStringPtr`, `valueStringLength`, `valueBoxObject`, `valueBoxArray`, the 48-bit payload masks, and the quiet-NaN sentinels), and arrays, objects, and collections already passed `i64` at their boundaries.

## Decision

All JavaScript-visible values cross every function boundary as a single `i64` NaN-boxed `JSValue`. This covers function **parameters**, **return types**, **call arguments**, and **array-callback arguments and returns**. Box/unbox happens only at those edges:

- number: `bitcast double <-> i64`.
- string: `valueBoxString` to box; `valueStringPtr` + `valueStringLength` to unbox into the `(ptr, length)` working form.
- value / object / array / boolean: already `i64`.

`JsIrValueKind` no longer determines the boundary ABI (which is always `i64`). It is now only an optimization hint selecting which box/unbox strategy to apply at the edge.

The following remain **backend-internal fast paths** — explicitly sanctioned by ADR 0004's "room for primitive fast paths" — and are *not* the boundary ABI:

- `double` arithmetic SSA temporaries, and the `double` calling convention of the math and number-format runtime helpers.
- `i1` branch conditions.
- local variable storage: `alloca double` (numbers), `alloca i1` (booleans), and the twin `(ptr, length)` allocas (strings). A boxed parameter is unboxed into this storage in the function prologue.
- the `{ ptr, i64 }` / `(i64 len, ptr data)` calling convention *inside* runtime string helpers; callers box/unbox around them.
- fixed numeric array `[N x double]` storage.

Booleans never had a dedicated boundary ABI: a `boolean`-typed parameter lowers as `JsIrValueKind` `"number"`, and boolean values otherwise ride `"value"`; both are already `i64`. No boolean-specific boundary work was required.

## Consequences

- `LlvmReturnType` for user functions is `"void" | "i64" | "ptr"` (`ptr` for returned closures). The `double` and `{ ptr, i64 }` user-function return ABIs are removed.
- Functions, closures, methods, and array callbacks share one calling convention, so values and functions compose uniformly regardless of static type.
- This supersedes the transitional *boundary-ABI* language in ADRs 0010 and 0011 for scalars. Those ADRs' decisions about runtime aggregate helpers and the internal string-helper convention still hold.
- Boxing currently allocates (e.g. `valueBoxString` mallocs a 16-byte `{ptr, len}` cell) without reclamation. A non-moving mark-sweep garbage collector (ADR 0009) is the next step this migration unblocks.
