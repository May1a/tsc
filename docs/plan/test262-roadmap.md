# Plan: Test262 Roadmap — Sequencing the Filtered Suite

Sequencing document for the Test262 work stream: it orders the four open
filtered-suite failures and the follow-on coverage-expansion slices into a
single unlock chain. This plan is scoped to sequencing and gating only — the
individual slices carry their own plans — and the master roadmap remains
`docs/PLAN.md`.

Each slice carries its own plan file under `docs/plan/` (linked below); the
GitHub issues remain the authoritative acceptance reference: #38, #39, #40,
#41 (failures) and epics #13–#16 with #20–#31 (coverage expansion).

## Goal

Drive the filtered Test262 suite from its current state — 785 pass, 5 fail
(4 behavior-mismatch + 1 compile-failure), 2925 coverage-gap, 20271 skip on
pinned revision `9e61c12835c5e4a3bdba93850427e6742c4f64c4` — to zero failures,
then convert coverage gaps into passing tests in unlock-per-effort order.

## Current State

The harness lives in `src/test262/`: `run.ts` (CLI, `--path`/`--classification`/
`--baseline` flags), `runner.ts` (suite execution and summary), `selection.ts`
(filtering against `test262/filters.json`, including `unsupported-include:*`
skips), `execute.ts` (Node-oracle comparison), and `config.ts` (filter and
baseline validation). Declarative filters are in `test262/filters.json`
(three groups: `statements`, `iteration`, `exceptions`;
`supportedIncludes: ["assert.js", "sta.js"]`). The regression gate is
`test262/baseline.json` (`minimumPass: 785`, `maximumFail: 5`,
`maximumBehaviorMismatch: 4`), enforced by `npm run test262:baseline` via
`evaluateBaseline` in `src/test262/run.ts`. The pinned checkout lives at
`build/test262/checkout`.

## Sequence

### Step 1 — Fix the Four Filtered-Suite Failures

Fix the five failing tests via the four root causes, in any order; they are
independent. Each fix has its own plan file mirroring the issue's acceptance
criteria:

- **#40 — Nested function in try statement emits an undefined LLVM callee**
  (compile-failure): `docs/plan/test262-nested-function-in-try.md`.
- **#41 — Distinguish Test262 script goal from module oracle execution**
  (behavior-mismatch): `docs/plan/test262-script-module-oracle.md`.
- **#39 — Test262 `assert.throws` exposes Test262Error representation mismatch**
  (behavior-mismatch): `docs/plan/test262-error-identity.md`.
- **#38 — Test262 destructuring defaults can segfault native executables**
  (behavior-mismatch, 2 tests): `docs/plan/destructuring-default-function-names.md`.

### Step 2 — Tighten the Baseline to Zero Failures

Once all four fixes land and `npm run test262:run` reports 0 fail / 0
behavior-mismatch, tighten `test262/baseline.json`:

- `maximumFail: 0`
- `maximumBehaviorMismatch: 0`
- `minimumPass`: bump to the actual post-fix pass count (expected ≥ 790).

`pinRevision` stays `9e61c12835c5e4a3bdba93850427e6742c4f64c4`. From this
point on, `npm run test262:baseline` is a hard zero-failure gate; any new
filtered-suite failure is a regression, not a baseline entry.

### Step 3 — Coverage Expansion in Unlock-Per-Effort Order

Attack the 2925 coverage-gap tests slice by slice. Each slice unblocks the
largest number of currently filtered or gapped tests per unit of effort and
has its own plan file:

1. **Harness include coverage** (no issue yet):
   `docs/plan/test262-harness-coverage-includes.md`. Extends
   `supportedIncludes` in `test262/filters.json` beyond `assert.js`/`sta.js`
   (`propertyHelper.js`, `compareArray.js`) with prelude support in
   `src/test262/prelude.ts`, and re-evaluates the `onlyStrict` flag. Cheapest
   unlock — mostly harness work — and removes `unsupported-include:*` skips in
   `selection.ts` across every already-selected group.
2. **Iterator destructuring completion** — epic #13 with #20 (defaults, nested
   patterns, rest, parameters) and #21 (`IteratorClose` on abrupt exits):
   `docs/plan/iterator-destructuring-completion.md`. Builds on the delivered
   iterator protocol (`docs/plan/iterators.md`).
3. **Iterator spread** — epic #14 with #22 (array-literal spread) and #23
   (call-argument spread) over generic iterables:
   `docs/plan/iterator-spread.md`.
4. **Class inheritance** — epic #15 with #24 (`extends`/`super()`), #25
   (inherited instance methods, `super.method()`), #26 (statics, `instanceof`
   chains): `docs/plan/class-inheritance.md`. Unblocks the large
   class-behavior surface within the selected groups.
5. **Runtime RegExp** — epic #16 with #27 (ADR + minimal native engine), #28
   (flags, `lastIndex`), #29 (`String` match/replace/search/split), #30
   (capture groups, dynamic `RegExp` constructor), #31 (Unicode semantics):
   `docs/plan/regexp-engine.md`. Largest effort; last. Requires removing
   `RegExp` from `unsupportedFeatures` in `test262/filters.json` as slices
   land.

Ordering rationale: harness includes cost nothing and lift every later slice;
destructuring and spread ride the existing iterator protocol; inheritance is a
compiler feature with no harness dependency; RegExp is a new runtime engine
with an ADR gate (#27) and the deepest semantics.

## Acceptance Criteria

- All five currently failing filtered-suite tests pass; the suite reports 0
  fail and 0 behavior-mismatch on the pinned revision.
- `test262/baseline.json` enforces `maximumFail: 0` and
  `maximumBehaviorMismatch: 0`, with `minimumPass` at the actual pass count.
- Each coverage slice lands behind its own plan file under `docs/plan/` and
  moves tests out of coverage-gap/skip into pass without regressing
  `npm run test262:baseline`.
- Typecheck, lint, and Vitest stay green throughout.

## Verification

- Full suite: `npm run test262:run` (requires `npm run test262:fetch` once for
  the pinned checkout at `build/test262/checkout`).
- Targeted slice runs: `npm run build && node dist/test262/run.js --path <prefix>`
  (e.g. `--path language/statements/try`).
- Baseline gate: `npm run test262:baseline`.
- Standard gates per change: `npm run check`, `npm run lint`, `npm test`.

## Non-Goals

- Repinning or expanding the Test262 checkout beyond the pinned revision.
- Widening filter groups or `unsupportedFlags`/`unsupportedFeatures` beyond
  what each coverage slice's own plan declares.
- Async, generators, or module-goal support beyond the #41 oracle fix.
