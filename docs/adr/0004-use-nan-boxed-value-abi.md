# Use a NaN-Boxed Value ABI

Runtime values will initially use a 64-bit NaN-boxed `JSValue` ABI across generated code and runtime calls. This is more complex than boxing every value, but it gives a compact uniform representation for JavaScript primitives and object references while leaving room for primitive fast paths.
