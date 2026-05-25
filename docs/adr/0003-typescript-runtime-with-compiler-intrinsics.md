# Use a TypeScript Runtime with Compiler Intrinsics

The compiler runtime will be authored in TypeScript, with a small set of compiler-owned intrinsics for operations that cannot be expressed portably in TypeScript source, such as allocation, raw memory access, process I/O, and GC root handling. This preserves the TypeScript-authored runtime constraint without pretending a native executable can exist without low-level primitives.
