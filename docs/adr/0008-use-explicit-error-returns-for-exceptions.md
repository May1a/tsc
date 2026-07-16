# Use Explicit Error Returns for Exceptions

JavaScript exceptions will initially lower to explicit value-or-exception returns through generated control flow rather than LLVM personality functions or native unwinding. This keeps exception handling portable and compatible with the TypeScript-authored runtime and explicit GC root tracking, at the cost of noisier generated IR.

Generated JavaScript functions return the LLVM aggregate `{ i64, i1 }`. The first field is a NaN-boxed `JSValue`; the second field is `false` for a normal return and `true` for an exception. A JavaScript function with no explicit return carries `undefined` in the value field. Function objects, constructors, and generated callbacks use the same result convention.

Callers extract and root the value field immediately, then branch on the exception field. An exceptional result transfers control to the nearest catch region or to the enclosing function's exception return. An uncaught top-level exception is printed by the platform entry point and terminates the process with status 1.

The exception value is never stored in process-global state. This keeps the convention compatible with future fibers and nested execution contexts. Compiler runtime helpers retain scalar return types unless their interface explicitly declares that they can throw.
