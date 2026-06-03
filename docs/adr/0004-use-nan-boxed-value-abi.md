# Use a NaN-Boxed Value ABI

Runtime values will initially use a 64-bit NaN-boxed `JSValue` ABI across generated code and runtime calls. This is more complex than boxing every value, but it gives a compact uniform representation for JavaScript primitives and object references while leaving room for primitive fast paths.

The first stable `JSValue` bit layout is:

- `number`: the raw IEEE-754 double payload bitcast to `i64`, except values in the reserved quiet-NaN tag space below.
- `undefined`: `0x7ffc000000000000` (`9222246136947933184`).
- `false`: `0x7ffc000000000001` (`9222246136947933185`).
- `true`: `0x7ffc000000000002` (`9222246136947933186`).
- `string reference`: `0x7ffa000000000000 | pointerPayload`, where `pointerPayload` is the low 48 bits of the UTF-8, NUL-terminated string data pointer. The current runtime assumes native string pointers fit in that payload space; targets that cannot satisfy this need a different string-reference representation before support.

Generated code and runtime helpers must share these constants. Helper calls that accept or return arbitrary JavaScript-visible values use `i64` at the LLVM boundary.

Incremental tracer status: the LLVM text backend still has backend-local direct fast paths while `JSValue` lands. Numbers use `double`, booleans use `i1` internally, and the first string-capable function ABI passes strings as `(i64 length, ptr data)` and returns strings as `{ ptr, i64 }`. These direct paths are transitional and must not become the stable runtime ABI.
