# Use an Explicit GC Root Stack

Generated code will maintain an explicit runtime-visible root stack for live `JSValue` slots around operations that may allocate. This is simpler and more debuggable with textual LLVM IR than LLVM stack maps, and more precise than conservative stack scanning for NaN-boxed values.
