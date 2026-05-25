# Use the TypeScript Frontend First

The compiler will initially use the official `typescript` package for parsing, module resolution, diagnostics, and type checking. This keeps early effort focused on lowering, runtime behavior, LLVM emission, and conformance instead of reimplementing the TypeScript parser and checker before native execution exists.
