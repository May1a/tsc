# ADR 0013: Add A Gated Inline C++ Extension

## Status

Accepted.

## Context

The project targets JavaScript-compatible native TypeScript, but issue #5 asks for an explicit native escape hatch:

```ts
@cpp`return tscn::number(42);`
```

The syntax is not valid TypeScript, and linking C++ would normally pull in the C++ driver/runtime. That must not happen for ordinary TypeScript programs.

## Decision

Inline C++ is a compiler extension gated by `-fcpp`.

The frontend rewrites `@cpp` tagged templates to an internal TypeScript tag before parsing. During lowering, that internal tag becomes an `inlineCppValue` expression that calls a generated `extern "C"` C++ wrapper returning the uniform `i64` `JSValue` ABI from ADR 0012.

The first slice supports only no-substitution templates. Interpolation and TypeScript value capture are rejected with a compile-time diagnostic.

When a program contains inline C++ and `-fcpp` is enabled, the compiler emits `inline-cpp.cpp` beside `main.ll` and links with `clang++`. Programs without inline C++ keep the existing `clang main.ll -lm` link path, so the C++ standard library and runtime are not included.

## Consequences

- Inline C++ is not JavaScript-compatible TypeScript; it is an opt-in native CLI subset extension.
- C++ snippets must return `std::uint64_t` values using helper functions such as `tscn::number`, `tscn::true_value`, `tscn::false_value`, `tscn::undefined`, and `tscn::null`.
- String, object, array, and GC-integrated C++ helpers are deferred until the runtime ABI surface is intentionally designed.
- C++ exceptions must not be used as JavaScript exceptions.
