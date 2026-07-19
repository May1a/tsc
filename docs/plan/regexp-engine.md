# Plan: Runtime RegExp Engine

Implementation plan for GitHub epic #16 ("runtime RegExp") and its tickets #27
through #31. This plan is scoped to that slice only; the master roadmap remains
`docs/PLAN.md`.

## Goal

Replace the compile-time RegExp interpretation that lives inside the B683
fallback interpreter with a real native regular-expression engine in the
runtime. Deliver, in dependency order:

- #27 — an ADR recording the engine decision, plus a minimal native engine
  (literal patterns, character classes, quantifiers, anchors) with `test` and
  `exec` on ASCII inputs.
- #28 — flag semantics for `g`, `i`, `m`, and `y`, global/sticky `lastIndex`
  behavior, and observable `source`/`flags` properties.
- #29 — `String.prototype.match`, `replace`, `search`, and `split` with RegExp
  arguments.
- #30 — capture groups, supported backreferences, and the dynamic
  `new RegExp(pattern, flags)` constructor.
- #31 — non-ASCII and `u`-flag semantics with UTF-16 code-unit observability on
  top of UTF-8 storage (ADR 0007).

End state: the `"RegExp"` entry is removed from `unsupportedFeatures` in
`test262/filters.json`, and all delivered behavior passes the Node correctness
oracle with native lowering and no compile-time fallback.

## Context / Problem

The compiler runtime has no RegExp support at all today. Every program that
mentions a RegExp literal or the `RegExp` constructor is detected by
`usesB683NativeFeatureSurface` (`src/compiler/ir.ts:2637`, with the
`isRegExpConstructorCall` check at `src/compiler/ir.ts:2647`) and routed
whole-file into the B683 compile-time interpreter
(`lowerB683NativeFeatureStatements`, `src/compiler/ir.ts:2596`), which evaluates
`print` arguments at compile time via `b683RegexExec` / `b683RegexMatchLength`
(`src/compiler/ir.ts:3224` and `src/compiler/ir.ts:3237`). Anything the
interpreter cannot handle is rejected with diagnostic `TSCN1002` from
`b683NativeFeatureUnsupportedDiagnostic` (`src/compiler/ir.ts:3371`), gated by
`unsupportedRegExpPatternMessage` (`src/compiler/ir.ts:3471`), which currently
rejects non-ASCII patterns, the `u` flag, backreferences, named groups, and
lookbehind. The Test262 harness classifies any `TSCN1002` rejection as a
coverage gap (`unsupportedFeatureCode`, `src/test262/execute.ts:23`).

Consequences of the current state:

- There is no RegExp value at runtime: no object, no `lastIndex`, no
  `exec` result allocation, no interaction with the GC.
- `new RegExp(pattern, flags)` only works when both arguments are top-level
  string constants resolvable at compile time (`regexpConstructorArgumentCount`,
  `src/compiler/ir.ts:1577`).
- `"RegExp"` plus five `regexp-*` sub-feature entries sit in
  `unsupportedFeatures` in `test262/filters.json:65-70`, so the entire
  `built-ins/RegExp` tree is skipped.
- Fixtures `regex-constructor-dynamic-unsupported.ts`,
  `string-replace-regex-unsupported.ts`, and `regex-nonascii-unsupported.ts`
  assert the `TSCN1002` rejection via `expectUnsupportedDiagnostic`
  (`test/integration/helpers.ts:118`); the remaining `regex-*.ts` fixtures pass
  only through B683 compile-time evaluation.

Relevant runtime layout:

- Runtime helpers are emitted as LLVM IR from `src/compiler/runtime-helpers.ts`
  (the `RuntimeHelper` union at line 6, `runtimeHelperDependencies` at line 270,
  `emitRuntimeDefinitions` at line 671). Structured definitions use the
  `LlvmModuleBuilder` from `src/compiler/llvm-ir/builder.ts`
  (`defineStructuredRuntimeHelpers`, `runtime-helpers.ts:235`).
- The GC already maintains per-kind free lists
  (`@gcFreeString`/`@gcFreeObject`/`@gcFreeFunction`/`@gcFreeIterator`, …,
  `runtime-helpers.ts:689-695`) and an explicit root stack (`gcRootPush`,
  ADR 0009). New GC-owned kinds follow that pattern.
- Strings are stored as UTF-8 with UTF-16 observable semantics per ADR 0007.
  Note that the existing `@stringCharCodeAt` helper is byte-indexed
  (`runtime-helpers.ts:1575`), so UTF-16 observability is still partially
  aspirational; the RegExp engine must not repeat that shortcut — match
  indices, `lastIndex`, and `.index` must count UTF-16 code units.
- Linking is `clang main.ll -o <exe> -lm` (`linkWithClang`,
  `src/compiler/linker.ts:106`); `clang++` only enters through the gated
  `-fcpp` inline-C++ path (`linkWithClangxx`, `linker.ts:113`, ADR 0013).

## Engine Decision (ADR, #27)

Issue #27 names three candidates: a compiler-runtime engine, compiler-owned
intrinsics, or a linked library. The first deliverable of this plan is
`docs/adr/0015-author-a-native-backtracking-regexp-engine-in-the-runtime.md`
recording the decision and its ADR 0007 consequences.

### Option A: Author a small backtracking engine in the runtime (recommended)

Compile each pattern (literal or `new RegExp` argument) at runtime to a compact
bytecode — `char`, `class`, `any`, `split`, `jump`, `save`, `backref`,
`assert-start`/`assert-end`/`assert-word-boundary`, `match` — and interpret it
with a backtracking VM over a code-unit view of the subject string. The
compiler (pattern text → bytecode) and the VM are emitted as runtime helpers
from `src/compiler/runtime-helpers.ts`, authored through the
`src/compiler/llvm-ir/` builder where practical rather than as raw text.

Advantages:

- **No new link dependency.** The default link line stays
  `clang main.ll -lm`; toolchain discovery (`src/compiler/toolchain.ts`) and the
  single-artifact model of ADR 0011 are untouched. ADR 0013 deliberately keeps
  external native runtimes out of ordinary programs.
- **ADR 0007 is under our control.** The VM operates on a decoded UTF-16
  code-unit array (with a byte-offset side table for slicing captures out of
  the UTF-8 storage), so `lastIndex`, `.index`, and `String` method results are
  UTF-16 code-unit based by construction. An off-the-shelf C engine works on
  bytes or its own UTF mode and would still need exactly this translation
  layer, plus an index-mapping shim on every result.
- **GC integration is natural.** Match results are ordinary runtime arrays and
  objects (`arrayNew`/`objectNew`/`arraySet`) rooted per ADR 0009; a C
  library's allocations would live outside the mark-sweep collector.
- **Correctness oracle fidelity.** Node-compatible edge cases (empty-match
  advancement, `lastIndex` reset on failure, sticky anchoring) are far easier
  to tune in code we own.

Cost: roughly a pattern parser, a bytecode emitter, and a VM in generated LLVM
IR — the largest single runtime helper so far. Mitigation: build it with the
`LlvmModuleBuilder` API, keep the instruction set minimal, and grow it phase by
phase.

### Option B: Link an existing C library (PCRE2, …) — rejected

Would require vendoring or discovering the library in
`src/compiler/toolchain.ts`, changing `linkWithClang`, and wrapping every call
in a UTF-8↔UTF-16 index translation layer whose allocations sit outside the
GC. PCRE2's 16-bit mode would give UTF-16 semantics but doubles the integration
surface (two subject representations, build-time mode selection). This trades a
bounded amount of code we control for a permanent external dependency with
worse ADR 0007 fidelity. Rejected.

### Option C: Compiler-owned intrinsics (compile literals to native code) — rejected as the whole answer

Compiling literal patterns to dedicated machine code at compile time does not
help `new RegExp(runtimeString)` (#30), which must compile patterns at runtime
anyway. A runtime compiler is therefore unavoidable; once it exists, literals
are simply the constant-pattern fast path through the same entry point.
Rejected as the primary mechanism; literals may later get a compile-time
bytecode fast path as an optimization only.

## Semantic Model

### RegExp values

- A RegExp is a GC-allocated cell of a new kind, following the
  function-object precedent: a `@gcFreeRegex` free list, boxing/unboxing
  helpers `valueBoxRegex`/`valueRegexPtr` alongside
  `valueBoxFunction`/`valueFunctionPtr`, and GC marking that keeps the
  compiled program, `source`, and `flags` alive.
- Cell layout: `{ source: string ref, flags: string ref, lastIndex: i64,
  flagBits: i64, program: ptr, programLength: i64 }`. The program is an
  instruction array; it contains no `JSValue`s, so it needs no tracing, but it
  is released with the cell.
- `re.source`, `re.flags`, `re.global`, `re.ignoreCase`, `re.multiline`,
  `re.sticky`, and `re.lastIndex` resolve through the existing property-lookup
  boundary (`valuePropertyGet`), mirroring how iterator thunks are exposed
  under the `SYMBOL_ITERATOR_SENTINEL` (`runtime-helpers.ts:227`).

### Pattern compilation

- One runtime entry point: `regexCompile(patternPtr, patternLen, flagsPtr,
  flagsLen) -> JSValue` returning the boxed RegExp or a SyntaxError through the
  explicit value-or-exception ABI (ADR 0008), using the existing `errorNew`
  helper.
- RegExp literals lower to a new IR op (`regexLiteral { pattern, flags }`) in
  `src/compiler/ir.ts`, emitted by `src/compiler/llvm.ts` as a call to
  `regexCompile` with constant strings. `new RegExp(p, f)` lowers to the same
  call with runtime strings. Both paths share all semantics; the literal path
  just passes constants.
- Unsupported constructs keep failing at compile time with `TSCN1002` where the
  frontend can see them (named groups, lookbehind, dotall `s`, `\p{...}`, the
  `d` flag) and at runtime as a catchable SyntaxError for dynamic patterns.

### Matching and UTF-16 observability

- Before matching, the subject is decoded from UTF-8 into a code-unit array
  with a parallel byte-offset table. All engine positions, match indices,
  `lastIndex`, and `search` results are UTF-16 code-unit indices, matching Node
  (ADR 0007). Captured substrings are sliced from UTF-8 storage through the
  byte-offset table.
- With the `u` flag (#31) the VM steps by code point: a surrogate pair is one
  atom for `.`, classes, and quantifiers; without `u` the pair is two
  independent code units.
- `exec` returns `null` or a runtime array with elements `0..n`, plus `index`
  and `input` properties, matching Node's result shape. Global `match` returns
  a plain array of matched strings.

## Implementation Plan

### Phase 0 — ADR + minimal native engine (#27)

- Write `docs/adr/0015-author-a-native-backtracking-regexp-engine-in-the-runtime.md`
  recording the Option A decision, the rejected alternatives, and the UTF-16
  index consequences under ADR 0007.
- Add the RegExp cell kind, `valueBoxRegex`/`valueRegexPtr`, GC marking and
  free-list wiring in `src/compiler/runtime-helpers.ts`.
- Add `regexCompile` (parser + bytecode emitter) and `regexExec` (backtracking
  VM) helpers supporting: literal characters, escapes (`\d \D \w \W \s \S` and
  escaped metacharacters), character classes with ranges and negation, `.`,
  anchors `^` `$` `\b` `\B`, quantifiers `* + ? {n} {n,} {n,m}` (greedy and
  lazy), alternation, and non-capturing grouping. ASCII subjects only; case
  folding is ASCII-only in this phase.
- Add `regexTest` and `regexExecResult` helpers; `test` returns a boolean,
  `exec` returns `null` or the result array.
- Lower `RegularExpressionLiteral` in `src/compiler/ir.ts` to the new
  `regexLiteral` IR op and emit it in `src/compiler/llvm.ts`; route `.test` and
  `.exec` calls on regex values to the new helpers.
- Stop routing regex-only files into the B683 interpreter: narrow
  `usesB683NativeFeatureSurface` (`src/compiler/ir.ts:2637`) so literals and
  literal-argument constructors lower natively. The B683 interpreter itself
  stays for classes until its own retirement.
- Flip `regex-literal-test.ts` and `regex-literal-exec.ts` to native lowering:
  keep the Node-oracle assertions and add a check that the emitted `main.ll`
  calls `@regexCompile` (no B683 compile-time prints).

### Phase 1 — Flags and lastIndex (#28)

- Implement `i` (ASCII fold), `m` (`^`/`$` at line boundaries), `g`, and `y`
  in the VM.
- Global and sticky `exec`/`test` read, honor, and mutate `lastIndex` on the
  RegExp cell: resume from `lastIndex`, advance on success, reset to `0` on
  failure, exactly per Node. Sticky anchors the match at `lastIndex`.
- Expose `source`, `flags`, `global`, `ignoreCase`, `multiline`, `sticky`,
  `lastIndex` through `valuePropertyGet`; `lastIndex` is writable.
- Flip `regex-literal-global-last-index.ts` and `regex-flags-and-source.ts` to
  native lowering with Node-oracle assertions.

### Phase 2 — String match/replace/search/split with RegExp (#29)

- Extend string method-call lowering (`src/compiler/ir.ts`, near the existing
  string method dispatch around `ir.ts:9752`) to accept RegExp arguments for
  `match`, `replace`, `search`, and `split`, alongside the existing literal
  helpers `stringReplace` and `stringSplit`.
- `match`: non-global returns the `exec`-shaped result; global collects all
  matches into a plain array, advancing past empty matches per Node.
- `replace`: regex pattern with global vs. single replacement and the supported
  `$`-substitutions (`$&`, `$1..$n` once captures land in Phase 3, `$\``,
  `$'`, `$$`). Replacement-string arguments only; function replacers are out
  of scope.
- `search`: first match index in UTF-16 code units, or `-1`.
- `split`: regex separator with capture insertion and `limit` for the
  supported surface.
- Flip `regex-string-match.ts` and `string-replace-regex-unsupported.ts` (from
  `expectUnsupportedDiagnostic` to a Node-oracle fixture).

### Phase 3 — Capture groups and the dynamic constructor (#30)

- Record capture spans during matching (`save` instructions), populate
  `exec`/`match` results in Node's order and numbering, and expose unmatched
  groups as `undefined`.
- Add backreferences `\1..\9` matching the captured text.
- Lower `new RegExp(pattern, flags)` with arbitrary runtime string arguments
  through `regexCompile`; remove the "Dynamic RegExp constructor arguments are
  not supported yet" gate in `unsupportedRegExpConstructor`
  (`src/compiler/ir.ts:3444`). Invalid dynamic patterns raise a catchable
  SyntaxError through the exception ABI, matching Node's error class and
  message where the oracle checks them.
- Flip `regex-constructor-dynamic-unsupported.ts`; move
  `regex-constructor-literal.ts` onto the native path as well.

### Phase 4 — Unicode and non-ASCII semantics (#31)

- Decode subjects (and patterns) to the UTF-16 code-unit view before matching;
  character classes and quantifiers over non-ASCII input match Node.
- Implement the `u` flag for the supported surface: code-point stepping, so a
  surrogate pair is one atom; keep non-`u` behavior as two code units.
- Verify `lastIndex` and all match indices count UTF-16 code units on
  non-ASCII input, matching Node.
- Retire the ASCII gate in `unsupportedRegExpPatternMessage`
  (`src/compiler/ir.ts:3471`) for covered constructs; keep `TSCN1002` for
  named groups, lookbehind, dotall, `\p{...}`, and `d`.
- Flip `regex-nonascii-unsupported.ts` to a Node-oracle fixture.

### Phase 5 — Test262 filters and baseline

- Remove `"RegExp"` from `unsupportedFeatures` in `test262/filters.json:65`.
  Keep `regexp-named-groups`, `regexp-unicode-property-escapes`,
  `regexp-dotall`, `regexp-lookbehind`, and `regexp-match-indices`.
- Run `npm run build && node dist/test262/run.js --path built-ins/RegExp` and
  triage newly selected tests; genuine semantic gaps on the unsupported
  sub-features should surface as coverage gaps (`TSCN1002`), not behavioral
  failures.
- Run the full `npm run test262:run`; if the new pass/fail counts exceed the
  thresholds in `test262/baseline.json` (`minimumPass` 785, `maximumFail` 5,
  `maximumBehaviorMismatch` 4), refresh it with `npm run test262:baseline` and
  review the diff.

## Test Plan

- Fixture flips listed per phase, each comparing stdout, exit code, and thrown
  error class/message against Node via `test/integration/oracle.ts`.
- New focused fixtures: empty-match global advancement (`/a*/g` on `"b"`),
  `lastIndex` reset on failure, sticky anchoring, `replace` with each
  supported `$`-substitution, `split` with a capturing separator, `new RegExp`
  with an invalid pattern (catchable SyntaxError), unmatched capture group
  printing `undefined`, and surrogate-pair stepping with and without `u`.
- GC stress: many compiled patterns and match results across collection
  cycles with a constrained heap (`TSCN_GC_HEAP_SIZE`), asserting patterns and
  results survive until unreachable. (Landed: `test/fixtures/gc-regexp-stress.ts`,
  wired into `test/integration/gc.test.ts` with `TSCN_GC_HEAP_SIZE=2097152`.)
- Generated LLVM keeps passing `llvm-as` verification where available.
- Test262: `built-ins/RegExp` and the RegExp-using subtrees of
  `built-ins/String/prototype/{match,replace,search,split}` show coverage
  gains; no previously passing test regresses.

## Acceptance Criteria

Mirrored from issues #27–#31:

- An ADR records the engine decision and its string-semantics consequences (#27).
- Literal patterns, character classes, quantifiers, and anchors execute
  natively on ASCII inputs; `test` returns Node-compatible booleans and `exec`
  returns Node-compatible match results for the supported shape (#27).
- `regex-literal-test.ts` and `regex-literal-exec.ts` match Node with native
  lowering, no compile-time fallback (#27).
- `i` and `m` change matching behavior per Node; global `exec` advances
  `lastIndex` and resumes from it, resetting per Node on failure; sticky
  matching anchors at `lastIndex`; `source` and `flags` read back the pattern's
  values; `regex-literal-global-last-index.ts` and `regex-flags-and-source.ts`
  match Node with native lowering (#28).
- Non-global `match` returns the `exec`-shaped result and global `match`
  returns all matches; regex `replace` honors global vs. single replacement
  and supported substitution patterns; `search` returns the match index or -1;
  `split` with a regex separator splits per Node;
  `regex-string-match.ts` and `string-replace-regex-unsupported.ts` become
  supported native-oracle fixtures (#29).
- Capturing groups appear in `exec` results in Node's order and numbering;
  supported backreferences match the captured text; `new RegExp` with runtime
  string pattern and flags compiles and matches natively; an invalid pattern
  raises a catchable error matching Node's class and message for tested cases;
  `regex-constructor-dynamic-unsupported.ts` becomes a supported native-oracle
  fixture (#30).
- Character classes and quantifiers over non-ASCII input match Node; a
  surrogate pair is treated per the `u` flag's observable semantics;
  `lastIndex` and match indices count UTF-16 code units;
  `regex-nonascii-unsupported.ts` becomes a supported native-oracle fixture (#31).
- `"RegExp"` is removed from `unsupportedFeatures` in `test262/filters.json`;
  the five `regexp-*` sub-feature entries remain.
- Typecheck, lint, Vitest, and LLVM verification pass (#27–#31).

## Verification

- `npm run check` — typecheck.
- `npm run lint` — oxlint.
- `npm test` — Vitest, including the flipped fixtures and oracle comparisons.
- `npm run build && node dist/test262/run.js --path built-ins/RegExp` — focused
  Test262 sweep after Phase 5.
- `npm run test262:run` — full filtered suite (skips when the pinned checkout
  at `build/test262/checkout` has not been fetched with
  `npm run test262:fetch`).
- `npm run test262:baseline` — only if baseline thresholds need refreshing,
  with a reviewed diff.

## As-Built Notes

Deviations from the plan discovered during implementation and review:

- **Exposed property set.** The RegExp property surface landed as planned:
  `source`, `flags`, `global`, `ignoreCase`, `multiline`, `sticky`, and
  `lastIndex`. A `.unicode` property briefly existed and was removed after
  review — Unicode semantics remain phase #31 as planned. The matcher keeps an
  internal, non-observable `u`-flag bit instead: `@regexFind` derives it by
  scanning the stored flags string rather than reading a property, so
  `.unicode` is not JS-observable while the bit still drives astral-plane
  stepping until #31 lands (comment at `src/compiler/runtime-helpers.ts:2188`).
- **Raw returns on `@regexFind`/`@regexSplit`.** Both helpers intentionally
  keep raw returns (`i64` / `ptr`) instead of the `{ i64, i1 }`
  value-or-exception ABI: neither can produce a JS-observable exception, and
  every callee is a non-throwing scalar helper. The ADR 0008 justification is
  recorded in comments at the emission sites
  (`src/compiler/runtime-helpers.ts:2131` and `:2423`).

## Non-Goals

- Named capture groups, lookbehind, dotall `s`, Unicode property escapes
  `\p{...}`, and the `d` (match indices) flag — these stay `TSCN1002` and keep
  their `test262/filters.json` entries.
- Function replacement callbacks for `String.prototype.replace`.
- `Symbol.replace`/`Symbol.match`/`Symbol.split`/`Symbol.search` override
  dispatch, and RegExp subclassing.
- Full Unicode case folding beyond the ASCII/simple subset needed by the
  fixtures and the supported Test262 surface.
- Compile-time bytecode precomputation for literal patterns (a later
  optimization only).
- Removing the B683 interpreter's class support; only its RegExp routing is
  retired here.
- Performance tuning of the VM beyond a bounded backtrack stack.

## Risks

- **Engine size in generated IR.** The parser + bytecode emitter + VM is the
  largest runtime helper to date. Mitigation: author it with the
  `LlvmModuleBuilder` (`src/compiler/llvm-ir/builder.ts`) instead of raw text,
  and land it in phases so each gate (`npm run check`, `npm run lint`,
  `npm test`) stays green.
- **Backtracking blowup.** Pathological patterns can explode exponentially.
  Mitigation: a bounded backtrack stack with a deterministic failure is
  acceptable for this slice; the oracle fixtures and the selected Test262
  surface do not stress this.
- **B683 entanglement.** Files mixing regex with classes still fall back to
  the B683 interpreter via `lowerStatements` (`src/compiler/ir.ts:1787`).
  Narrow the regex routing carefully so mixed files either lower natively or
  keep their current B683 behavior — no silent semantic change.
- **UTF-16 drift.** Existing helpers such as `@stringCharCodeAt` are
  byte-indexed; the RegExp engine must not copy that shortcut, and string
  methods combining regex indices with byte-indexed slicing are an
  inconsistency risk. The code-unit/byte-offset side table is the single
  translation point; test it with non-ASCII fixtures before the `u`-flag work.
- **Filter removal breadth.** Removing `"RegExp"` from `unsupportedFeatures`
  selects many tests at once. Triage failures into coverage gaps (unsupported
  sub-features) versus real behavioral mismatches before touching
  `test262/baseline.json`.
