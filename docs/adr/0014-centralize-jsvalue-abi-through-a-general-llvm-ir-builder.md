# Centralize The JSValue ABI Through A General LLVM IR Builder

## Status

Implemented.

## Context

ADRs 0004 and 0012 define one stable 64-bit NaN-boxed `JSValue` ABI, while ADR 0013 exposes part of that ABI to inline C++. Its tags, masks, sentinels, payload rules, and boxing operations are currently repeated across textual LLVM emission, generated compiler runtime IR, inline-C++ support, and tests. The LLVM backend also constructs modules from raw strings, so introducing only a `JSValue`-specific text facade would preserve two emission models and provide little leverage beyond constant deduplication.

## Decision

Introduce two deep modules:

- A general LLVM IR builder owns module, declaration, function, block, typed-operand, SSA-name, instruction, terminator, and deterministic-rendering structure. It uses scoped mutable builders with immutable typed value handles and validates structural misuse as an internal compiler error. It continues to emit textual LLVM IR, preserving ADR 0005.
- A `JSValue ABI` module owns the single accepted 64-bit NaN-box layout, its uniform function-boundary convention, host requirements, and semantic boxing, unboxing, classification, immediate, and internal-sentinel operations. The canonical layout is private; production callers cannot read or redefine raw tags, masks, sentinels, or payload limits.

The LLVM adapter consumes a scoped builder and expresses `JSValue` operations through typed handles. Inline C++ uses a purpose-built source adapter generated from the same private ABI model. These are two real adapters, but they do not share a generic cross-language code-generation interface. Generated compiler runtime IR is part of the LLVM adapter, not a third adapter.

The internal array-hole sentinel remains owned by the ABI module but is exposed separately from JavaScript-visible immediate values. Heap-cell layouts, allocation, GC policy, tracing behavior, and JavaScript semantics remain owned by the compiler runtime.

Toolchain discovery supplies normalized target facts. The ABI module decides whether those facts satisfy the current 64-bit word, IEEE-754 binary64, and low-48-bit pointer-payload requirements and reports an incompatible host as a compiler diagnostic before linking. This decision does not introduce multiple configurable ABI layouts.

The LLVM builder records operation trace scopes while emitting instructions and returns rendered line ranges keyed by operation ID. The trace module continues to own the `TraceMapV1` artifact; human-readable marker comments may remain, but range accounting no longer depends on reparsing marker strings from the completed document.

Migration is incremental. The builder temporarily permits tracked module-level legacy LLVM text, but never raw text inside builder-created functions or blocks. Candidate completion requires the builder foundation, centralized ABI ownership, both output adapters, host validation, and shared behavioral conformance tests. Migrating the rest of the backend and deleting the legacy-text escape hatch is separate follow-up work.

## Considered Options

- A single symbolic text materializer was rejected because placeholder tokens are stringly typed, expose representation vocabulary, and are easy to bypass.
- A fully generic cross-language semantic compiler was rejected because its fragment type parameters and primitive adapter interface make the common LLVM path unnecessarily difficult.
- A narrow LLVM string facade was rejected because it would leave the backend split between raw strings and ABI-only fragments instead of establishing a reusable structural module.
- An atomic backend rewrite was rejected because it would combine ABI centralization with roughly thirteen thousand lines of unrelated LLVM migration.

## Consequences

- Existing `JSValue` bit patterns and inline-C++ behavior remain exactly compatible; changing the layout requires a separate ABI decision.
- ABI literals must flow mechanically from the private canonical model. Literal golden values are allowed only in tests that verify the external ABI contract.
- Shared behavioral conformance vectors exercise both textual LLVM and inline C++ adapters; generated-text assertions are secondary diagnostics.
- Backend-local primitive fast paths remain valid, but their transitions across JavaScript-visible function boundaries use the centralized ABI module.
- The builder and ABI implementations live behind narrow directory entrypoints so their internal files do not become new monoliths.

## Implementation

- `src/compiler/llvm-ir/` owns typed declarations, functions, blocks, operands, SSA naming, memory and control-flow instructions, terminators, deterministic rendering, structural validation, trace scopes, and the tracked module-level legacy-text seam.
- `src/compiler/js-value-abi/` privately owns the accepted layout, number encoding, visible immediates, reference tags, payload rules, the internal array-hole sentinel, the uniform LLVM boundary type, host requirements, and the LLVM, legacy LLVM, and inline-C++ adapters.
- Production LLVM composition uses the builder for both tracked legacy output and structured ABI helpers. Trace ranges are returned by the builder from tracked emission metadata; the previous completed-document marker parser has been removed.
- Toolchain discovery supplies normalized active-host facts. Compilation asks the ABI module to validate those facts and emits `TSCN2005` before frontend, LLVM emission, or linking when the host is incompatible.
- Shared behavioral vectors execute through clang-generated LLVM and clang++ and cover number encoding, visible immediates, all reference kinds, payload recovery, classification, and the separately exposed array-hole sentinel.
- Existing legacy runtime and backend code obtains ABI constants and number boundary operations through the ABI adapters. Raw accepted-layout literals remain only in external-contract tests.

The full migration of unrelated legacy backend and compiler-runtime LLVM text to structured builder calls remains the separate follow-up identified in the decision. The tracked module-level legacy seam intentionally remains until that migration completes.
