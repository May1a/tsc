# Implementation Plan

This plan describes the first path toward a TypeScript compiler written in TypeScript that emits native executables through LLVM. The target is JavaScript-compatible native TypeScript, excluding `eval` and `with`.

## Current Decisions

- The compiler is implemented in TypeScript and uses Effect for CLI, configuration, filesystem, diagnostics, tracing, process execution, pass orchestration, and caches.
- The compiler command is `tscn` to avoid colliding with the official TypeScript `tsc` command.
- Development uses Bun for package management and Node for executing the compiler/tooling runtime.
- Tests use `bun test` as the harness, but compiler execution tests spawn Node subprocesses for `tscn`.
- Source is split by boundary with `src/compiler`, `src/runtime`, `src/cli`, `test/fixtures`, and `test/integration`.
- The runtime is authored in TypeScript and may call compiler-owned intrinsics for low-level native operations.
- The runtime includes a small sync-only internal Effect kernel for sequencing, failure, cleanup, and initialization.
- Async functions, promises, fibers, and microtasks are deferred until after the synchronous runtime milestone.
- The frontend initially uses the official `typescript` package for parsing, checking, module resolution, and diagnostics.
- The backend initially emits textual LLVM IR and uses the clang driver to build Linux x86_64 native executables.
- Runtime values use a 64-bit NaN-boxed `JSValue` ABI.
- JavaScript exceptions lower to explicit value-or-exception returns, not native unwinding.
- GC uses a non-moving mark-sweep collector with an explicit root stack maintained by generated code.
- Objects start as dictionary objects with prototype-aware lookup; object layout fast paths require shape version guards.
- Strings may be stored as UTF-8 internally, but all JavaScript-visible string behavior observes UTF-16 code-unit semantics.
- Arrays use a spec-like dynamic array model with indexed storage, holes, `length`, and prototype fallback.
- Modules are project-local ES modules compiled into a single-entry native bundle.
- NPM package imports are rejected by default during the first milestone.
- Program entry is top-level execution of the selected entry module.
- The first observable output API is a compiler-provided `print` builtin.
- Compiler output is a native executable plus optional `.ll`, trace map, and diagnostics artifacts in a build directory.
- Correctness is checked against Node and a filtered Test262 subset by comparing stdout, stderr, exit code, and thrown error class/message.
- Self-hosting is a late goal, after the compiler can compile the runtime and enough of its own implementation.

## Milestone 1: Project Skeleton

- Set up the TypeScript package, Bun lockfile, Effect runtime dependencies, formatter, linter, `bun test` harness, and CLI entrypoint executed by Node.
- Create separate source boundaries for compiler implementation, runtime source, CLI wiring, fixtures, and integration tests.
- Expose the CLI command as `tscn`.
- Add toolchain discovery for `clang`, LLVM verifier tools, and Linux x86_64 target assumptions.
- Read `tsconfig.json` and reserve a minimal native compiler extension block for later.
- Establish TS-style diagnostic rendering with stable error codes and source spans.

## Milestone 2: Frontend and JS IR

- Load the entry module and transitive project-local ES module graph through the TypeScript compiler host.
- Reject unsupported syntax and unsupported imports with compile-time diagnostics.
- Lower TypeScript AST into a CFG-shaped JS-semantics IR with explicit effects, source spans, calls, allocations, branches, and exception edges.
- Use TypeScript checker information only for diagnostics, unsupported-feature detection, and optional guarded optimization hints.

## Milestone 3: Runtime ABI and Intrinsics

- Define the NaN-boxed `JSValue` representation and runtime calling convention.
- Define the intrinsic set for allocation, memory operations, process output, abort, root stack operations, and platform entry.
- Implement explicit value-or-exception return types for potentially throwing runtime calls.
- Implement root stack push/pop conventions around allocating operations.

## Milestone 4: LLVM Text Backend

- Emit textual LLVM IR from JS IR.
- Include source-span comments and trace-map artifacts for debugging generated IR.
- Use clang to compile and link the generated IR into a native Linux x86_64 executable.
- Snapshot generated IR in tests while treating runtime behavior as the correctness source.
- Write the executable plus optional `.ll`, trace map, and diagnostics artifacts into a build directory.

## Milestone 5: Synchronous Runtime Core

- Implement primitives: `undefined`, `null`, booleans, numbers, strings, objects, arrays, and functions.
- Implement core coercions: truthiness, `ToPrimitive`, `ToNumber`, `ToString`, property-key conversion, `+`, comparisons, strict equality, and loose equality.
- Implement dictionary objects, data property descriptors, prototype lookup, and shape version metadata for guarded fast paths.
- Implement unified function objects with code pointer, environment pointer, prototype metadata, and explicit `this` argument.
- Implement runtime exception objects, `throw`, `try`, and `catch` through explicit error returns.
- Implement minimal built-ins: `Object`, `Array`, `Function`, `String`, `Number`, `Boolean`, `Error`, `Math`, and the global `print` builtin.

## Milestone 6: First Vertical Slice

- Compile a single entry ES module with top-level statements to a native executable.
- Support literals, variables, functions, closures, calls, conditionals, loops, basic objects, arrays, strings, numbers, and `print`.
- Run the native executable and compare stdout, stderr, exit code, and thrown errors against Node for supported fixtures.
- Reject unsupported features with precise compile-time diagnostics instead of runtime traps or best-effort lowering.

## Milestone 7: Expansion

- Add basic classes after unified function objects and prototype lookup are stable.
- Add accessors, richer property descriptors, richer built-ins, source-map or DWARF support, package support, and broader Test262 coverage incrementally.
- Add guarded fast paths for primitives, calls, and object layout assumptions, always falling back to baseline JavaScript semantics.
- Add async functions, promises, fibers, and microtask scheduling only after the synchronous runtime milestone is stable.

## Non-Goals for the First Milestone

- No `eval` or `with`.
- No Node-compatible runtime.
- No dynamic `import`.
- No transitive npm package compilation by default.
- No native unwinding or LLVM exception personality functions.
- No self-hosting until the compiler and runtime compatibility surface is large enough.
