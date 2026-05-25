# Use a Single-Entry ESM Bundle

The first module model will compile the transitive project-local ES module graph into one native executable with deterministic module initialization order. NPM package imports are rejected by default so TypeScript module resolution does not accidentally expand the native CLI subset into Node compatibility.
