# Author A Native Backtracking RegExp Engine In The Compiler Runtime

## Status

Accepted.

## Context

JavaScript-compatible native TypeScript needs RegExp literals, dynamic
construction, observable flags and `lastIndex`, and String-method integration.
Linking PCRE2 would add a default native dependency and would still require an
index-translation and GC-integration layer for ADR 0007.

## Decision

Author the regular-expression matcher in the generated compiler runtime. Both
literals and dynamic construction use the same runtime entry point, and the
bounded greedy backtracking matcher returns ordinary runtime arrays and objects
through the explicit value-or-exception ABI.

Matching positions are translated at the string boundary so JavaScript-visible
indices use UTF-16 code units while storage and native slicing remain UTF-8.

## Rejected Alternatives

- PCRE2 or another linked library: it changes the default linker contract,
  introduces external allocation ownership, and does not eliminate index
  translation.
- Compile-time-only specialization: it cannot support a runtime pattern passed
  to `new RegExp`; literal specialization remains a possible optimization.

## Consequences

The ordinary link path remains `clang main.ll -lm`, RegExp state stays under
compiler-runtime ownership, and behavior can be tuned directly against Node.
The trade-off is a larger generated runtime section.
