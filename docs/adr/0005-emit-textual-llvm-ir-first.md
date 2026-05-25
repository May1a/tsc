# Emit Textual LLVM IR First

The backend will emit textual LLVM IR first and use the LLVM/clang toolchain to verify, assemble, optimize, and link native executables. Textual IR is easier to generate from TypeScript, easier to snapshot-test, and easier to debug than binding directly to LLVM APIs or emitting binary bitcode from the start.
