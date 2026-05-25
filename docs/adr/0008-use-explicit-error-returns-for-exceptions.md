# Use Explicit Error Returns for Exceptions

JavaScript exceptions will initially lower to explicit value-or-exception returns through generated control flow rather than LLVM personality functions or native unwinding. This keeps exception handling portable and compatible with the TypeScript-authored runtime and explicit GC root tracking, at the cost of noisier generated IR.
