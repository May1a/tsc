# Use a NaN-Boxed Value ABI

Runtime values will initially use a 64-bit NaN-boxed `JSValue` ABI across generated code and runtime calls. This is more complex than boxing every value, but it gives a compact uniform representation for JavaScript primitives and object references while leaving room for primitive fast paths.

Incremental tracer status: the LLVM text backend still has backend-local direct fast paths while `JSValue` lands. Numbers use `double`, booleans use `i1` internally, and the first string-capable function ABI passes strings as `(i64 length, ptr data)` and returns strings as `{ ptr, i64 }`. These direct paths are transitional and must not become the stable runtime ABI.
