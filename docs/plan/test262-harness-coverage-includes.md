# Plan: Test262 Harness Coverage — propertyHelper.js, compareArray.js, and the onlyStrict Flag

Harness-side coverage slice for the filtered Test262 suite: teach the prelude
about the `propertyHelper.js` and `compareArray.js` includes, and reclassify the
`onlyStrict` flag from unsupported to benign. This is scoped to the harness
(`src/test262/`, `test262/filters.json`, `test262/baseline.json`) plus the
synthetic fixture suite; no compiler semantics change in this slice. The master
roadmap remains `docs/PLAN.md`.

Related issues: #36 (closed — "Filtered Test262 harness", origin of this
harness; its acceptance criteria for a stable pass/fail/skip report and CI
integration carry over to this slice) and #41 (open — "Distinguish Test262
script goal from module oracle execution", adjacent oracle-goal context for the
`onlyStrict` decision below). No dedicated issue tracks these three skip
reasons today; if one is opened, its acceptance criteria should mirror the
Acceptance Criteria section here.

## Goal

- Eliminate `unsupported-include:propertyHelper.js` (390 skipped tests),
  `unsupported-include:compareArray.js` (37), and `unsupported-flag:onlyStrict`
  (165) as skip reasons in the filtered suite.
- Convert the unlocked tests into passes wherever the compiler already matches
  Node, and into honest `coverage-gap` classifications where it does not.
- Raise `test262/baseline.json` `minimumPass` to the measured post-landing pass
  count so the improvement is locked in.

## Current State

Measured against the pinned checkout (`build/test262/checkout`, revision
`9e61c12835c5e4a3bdba93850427e6742c4f64c4` from `test262/pin.json`) by running
`selectTests` with the current `test262/filters.json`:

- 3715 tests selected; 390 skip on `unsupported-include:propertyHelper.js`,
  37 on `unsupported-include:compareArray.js`, 165 on
  `unsupported-flag:onlyStrict`.
- Baseline: `minimumPass: 785`, `maximumFail: 5`, `maximumBehaviorMismatch: 4`.

Harness architecture relevant to this slice:

- Includes are never read from the checkout's `harness/` directory. The
  compiler-owned prelude in `src/test262/prelude.ts` (`assertionPrelude`)
  provides `$ERROR`, `assert`, and `__t262SameValue`/`__t262NotSameValue`/
  `__t262Throws`; `assert.sameValue`/`notSameValue`/`throws` call sites are
  rewritten to those identifiers via `assertionMethodNames` in
  `rewriteAssertionCalls`. `supportedIncludes: ["assert.js", "sta.js"]` in
  `test262/filters.json` therefore means "covered by the prelude".
- Flag classification lives in `src/test262/selection.ts`: `benignFlags`
  currently holds `noStrict`, `generated`, `CanBlockIsFalse`,
  `CanBlockIsTrue`; `onlyStrict` sits in `unsupportedFlags` in
  `test262/filters.json`.
- The identical assembled entry feeds both sides of the oracle
  (`assembleEntry`), and the Node side executes it through dynamic `import()`
  (`nodeWrapperSource`, `src/test262/behavior.ts:44`) — i.e. under the Module
  goal, which is strict mode.
- The compiler already lowers the descriptor APIs propertyHelper needs:
  `Object.getOwnPropertyDescriptor` (`runtimeObjectOwnPropertyDescriptor`,
  `src/compiler/ir.ts:7159`), `Object.defineProperty` (`src/compiler/ir.ts:11309`),
  `Object.prototype.hasOwnProperty`/`propertyIsEnumerable`
  (`src/compiler/ir.ts:8671`), `delete` (`lowerDeleteExpression`,
  `src/compiler/ir.ts:4290`), and `for...in` (`src/compiler/ir.ts:3937`).

### What the skipped tests actually need

- propertyHelper.js (390): 314 are `language/statements/class` tests calling
  `verifyProperty(C.prototype, "m", { enumerable: false, configurable: true,
  writable: true })`-style assertions on class methods and fields; the rest
  (`for-of`, `for`, `function`, `const`, `let`, `variable`, `try`) verify plain
  object descriptors. Only `verifyProperty` is used (700 call sites); the
  deprecated helpers (`verifyWritable` etc.) appear only outside the filtered
  set. The upstream include itself is **not** compilable by tscn: it captures
  `Function.prototype.call.bind(...)`, reads `arguments.length`, and uses
  `Array.isArray`/`Math.pow` at top level.
- compareArray.js (37): the pinned `harness/compareArray.js` is a deprecated
  stub — `compareArray` lives in `harness/assert.js` at this revision. The 37
  tests (class destructuring rest, static-init `arguments`) call
  `assert.compareArray(actual, expected)`.
- onlyStrict (165): 115 are `negative: { phase: parse, type: SyntaxError }`
  tests (strict-only grammar: `var eval`, `var arguments`, duplicated
  parameters, labeled/`if`-body function declarations, `yield` as identifier);
  19 are `tco-*` positives that also list `tcoHelper.js` and so stay skipped on
  `unsupported-include:tcoHelper.js`; ~31 are positives using `eval`/`new
  Function`, destructuring assignment to unresolvable references, or field
  definition on frozen/non-extensible objects.

## Approach

### 1. Prelude helpers, not raw include files

Follow the established prelude pattern: implement the helpers in the
compiler-supported subset inside `src/test262/prelude.ts` rather than
attempting to compile the checkout's `harness/*.js` sources. Both oracle sides
already receive the identical assembled source, so a reduced-but-honest helper
cannot introduce oracle asymmetry. The helpers must remain behaviorally
identical under tscn and Node — the same invariant the existing prelude header
documents.

### 2. compareArray.js

- Add `compareArray` to `assertionMethodNames` in `src/test262/prelude.ts`,
  mapping `assert.compareArray` to a new `__t262CompareArray` prelude function
  (length equality plus element-wise `Object.is`, mirroring the existing
  `__t262SameValue` style; throw `Test262Error` on mismatch).
- Also define a global `compareArray` in the prelude, since upstream
  `harness/assert.js` defines one and some tests call it unqualified.
- Add `"compareArray.js"` to `supportedIncludes` in `test262/filters.json`.

Expected unlock: all 37 skips leave the skip list. Most exercise destructuring
rest or static-init `arguments` and will land as `coverage-gap`
(`compiler-unsupported`, TSCN1002) until those compiler slices land; a small
number pass immediately. This is cheap and unblocks the propertyHelper work
below from re-skipping the 5 tests that list both includes.

### 3. propertyHelper.js

- Extend `assertionPrelude` in `src/test262/prelude.ts` with a reduced
  `verifyProperty(obj, name, desc)` and the deprecated helpers used across the
  suite (`verifyEqualTo`, `verifyWritable`, `verifyNotWritable`,
  `verifyEnumerable`, `verifyNotEnumerable`, `verifyConfigurable`,
  `verifyNotConfigurable`), written in the supported subset:
  - `desc === undefined` asserts `Object.getOwnPropertyDescriptor` returns
    `undefined`.
  - Otherwise assert own-ness via `hasOwnProperty`, then compare each provided
    `value`/`writable`/`enumerable`/`configurable` field against the descriptor
    and, where the reduced helper keeps the probe, against behavior: writable
    via a write-and-revert probe, configurable via a `delete` probe,
    enumerable via `for...in` plus `propertyIsEnumerable`.
  - Do not port `arguments`-based arity checks, `Function.prototype.call.bind`
    capture, `verifyCallableProperty`/`verifyAccessorProperty`, or the
    `options.restore` machinery — nothing in the filtered set calls them.
    Throw `Test262Error` on any unexpected extra argument shape so unsupported
    uses fail loudly instead of silently passing.
- Add `"propertyHelper.js"` to `supportedIncludes` in `test262/filters.json`.

Expected unlock: all 390 skips leave the skip list. Passes concentrate in the
non-class families (`for-of`, `for`, `const`, `let`, `variable`, `try`, ~76
tests) where descriptors of ordinary objects are already modeled; the 314
class tests unlock as selected tests but split between pass (where class
method/field descriptor attributes already match Node) and `coverage-gap`/
`fail`. The measured split is an output of this slice, not an assumption —
any `behavior-mismatch` fails exposing wrong descriptor attributes on class
members are filed as compiler issues, not papered over in the harness.

### 4. Accept `onlyStrict` as benign

Recommendation: **accept**. Evidence:

- Both execution sides are already strict-only. The Node oracle imports every
  entry as an ES module (`nodeWrapperSource`), and tscn's frontend treats the
  entry as a strict module — verified empirically: `var a = 42, arguments;`
  and `for (var eval in null) {}` in an assembled entry both fail with
  `TS1215: Invalid use of 'arguments'/'eval'. Modules are automatically in
  strict mode.` There is no sloppy-mode execution anywhere in the harness to
  diverge from.
- The harness already tolerates the mirror-image case: 183 selected tests
  carry the `noStrict` flag (sloppy-only) and pass under the same both-sides-
  strict regime, because the filtered surface is not mode-observable there.
- Of the 165: the 115 parse negatives are rejected by the strict TypeScript
  grammar and pass through the existing `negative-compile` path; the 19 `tco-*`
  positives stay skipped on `unsupported-include:tcoHelper.js` and cannot
  regress; the ~31 remaining positives use unsupported surface (`eval`, `new
  Function`, destructuring assignment, frozen-object field definition) and
  degrade to `coverage-gap`, with a bounded risk of new `behavior-mismatch`
  fails — measured in Phase 3 and kept within `maximumFail`/
  `maximumBehaviorMismatch` or triaged into issues.

Implementation: delete `"onlyStrict"` from `unsupportedFlags` in
`test262/filters.json` and add `"onlyStrict"` to `benignFlags` in
`src/test262/selection.ts`. (Flags are skipped when listed in
`unsupportedFlags` *or* absent from `benignFlags` — `classifyFlags`,
`src/test262/selection.ts:49` — so both edits are required.)

This decision is consistent with, but does not resolve, issue #41: the oracle
goal mismatch #41 describes exists independently of flag classification, and
accepting `onlyStrict` does not make it worse — the affected tests already run
as modules today.

### 5. Add `$DONOTEVALUATE` to the prelude

All 759 currently selected `negative-compile` tests reference
`$DONOTEVALUATE()`, which the prelude does not define; they pass today because
*some* diagnostic (grammar or `TS2304`) always fails compilation. Define
`$DONOTEVALUATE` in the prelude as a function that throws `Test262Error` so
that `negative-compile` passes are earned by a genuine frontend rejection
rather than an unresolved-name error, and so that a wrongly-accepted
strict-only construct fails loudly at runtime. Measure: if any of the 759 (or
the 115 newly unlocked) flip to fail, they were masked passes — investigate
and file rather than reverting.

## Implementation Plan

### Phase 0 — Measure the before state

- `npm run build && node dist/test262/run.js --json - > /tmp/t262-before.json`
  (skips gracefully if the checkout is missing; fetch first with
  `npm run test262:fetch`).
- Record pass/fail/coverage-gap counts and the three target skip-reason
  counts. Selection-only counts (390/37/165) are already confirmed; this run
  fixes the pass baseline behind `minimumPass: 785`.

### Phase 1 — compareArray.js

- Prelude `__t262CompareArray` + global `compareArray`, rewrite-table entry,
  `supportedIncludes` edit.
- Update the synthetic suite: `test/fixtures/test262/suite` gains a fixture
  exercising `assert.compareArray`; flip the `extra-include.js` expectations in
  `test/integration/test262.test.ts` once that fixture no longer skips (see
  Phase 2 — the fixture uses propertyHelper, so its flip lands there).
- Scoped check: `node dist/test262/run.js --path language/statements/class/dstr --json -`.

### Phase 2 — propertyHelper.js

- Prelude helpers per Approach §3; `supportedIncludes` edit.
- Update `test/integration/test262.test.ts`: the `extra-include.js` fixture
  moves from `skip` (`unsupported-include:propertyHelper.js`) to `pass`, so
  `expectedPassCount`/`expectedSkipCount` and the "skips unsupported flags,
  features, and includes" assertions change accordingly.
- Scoped checks: `node dist/test262/run.js --path language/statements/class --json -`
  and `--path language/statements/for-of`. Triage every new
  `behavior-mismatch` before proceeding.

### Phase 3 — onlyStrict

- Filter/`benignFlags` edits per Approach §4.
- Update the `only-strict.js` fixture expectations in
  `test/integration/test262.test.ts` (it moves from `skip` to `pass`, shifting
  the aggregate counts again).
- Scoped check: run the previously-skipped ids and confirm the 115 parse
  negatives pass via `negative-compile`, the `tco-*` tests still skip on
  `tcoHelper.js`, and new fails stay within baseline tolerances:
  `node dist/test262/run.js --classification fail --json -`.

### Phase 4 — Full measurement and baseline

- `npm run build && node dist/test262/run.js --json - > /tmp/t262-after.json`;
  diff pass/fail/coverage-gap and skip-reason counts against Phase 0.
- Update `test262/baseline.json`: raise `minimumPass` to the measured pass
  count; adjust `maximumFail`/`maximumBehaviorMismatch` only if a triaged,
  filed regression justifies it.
- Confirm `npm run test262:baseline` reports no regressions.

## Acceptance Criteria

- `unsupported-include:propertyHelper.js`,
  `unsupported-include:compareArray.js`, and `unsupported-flag:onlyStrict` no
  longer appear as skip reasons in a full `node dist/test262/run.js --json -`
  report.
- The prelude's new helpers (`__t262CompareArray`, `compareArray`,
  `verifyProperty`, deprecated verify* helpers, `$DONOTEVALUATE`) are defined
  once in `src/test262/prelude.ts`, fed unchanged to both oracle sides, and
  reject unsupported argument shapes loudly.
- All 115 unlocked onlyStrict parse negatives pass through the
  `negative-compile` path with `$DONOTEVALUATE` defined (no masked passes).
- `tco-*` tests remain skipped on `unsupported-include:tcoHelper.js`.
- `test262/baseline.json` `minimumPass` equals the measured post-landing pass
  count; `npm run test262:baseline` reports no regressions.
- `npm run check`, `npm run lint`, and `npm test` pass, including the updated
  fixture-suite counts in `test/integration/test262.test.ts`.
- Any compiler `behavior-mismatch` exposed by newly selected tests is filed as
  a GitHub issue before landing, not hidden behind a filter edit.

## Verification

- `npm run check` and `npm run lint` — clean.
- `npm test` — Vitest suite green with updated fixture expectations; add
  assembly-level tests alongside the existing rewrite test in
  `test/integration/test262.test.ts` covering the `assert.compareArray`
  rewrite and the new prelude helpers' presence.
- Before/after: `npm run build && node dist/test262/run.js --json -`, diffed
  per Phase 0/Phase 4.
- Focused reruns during development:
  `node dist/test262/run.js --path <prefix>` for `language/statements/class`,
  `language/statements/class/dstr`, `language/statements/for-of`, and
  `language/statements/variable`.
- Full gate: `npm run test262:run` (skip-safe without the checkout) and
  `npm run test262:baseline`.

## Non-Goals

- Compiler work on class descriptor attributes, destructuring, `eval`, or
  frozen-object semantics that newly selected tests expose — those become
  their own issues/plans.
- `tcoHelper.js` or tail-call-optimization support.
- Porting upstream include sources verbatim into the compiled entry.
- `verifyCallableProperty`/`verifyAccessorProperty`/`verifyPrimordial*` —
  unused by the filtered set at this pin.
- The script-vs-module oracle goal split (issue #41).
- Widening filter groups beyond `language/statements`-adjacent trees.

## Risks

- A reduced `verifyProperty` is weaker than upstream: a compiler bug that
  corrupts a property *and* its descriptor consistently could pass. Mitigated
  by keeping the write/delete/for-in probes where the subset allows, and by
  the Node oracle comparing identical prelude behavior.
- onlyStrict positives may add `behavior-mismatch` fails beyond
  `maximumBehaviorMismatch: 4`. Mitigation: Phase 3 measurement gates landing;
  failures are triaged and filed, and the flag change lands only with the
  baseline green.
- `$DONOTEVALUATE` may reveal masked negative-compile passes among the 759
  existing tests, turning them into fails. That is the intended honesty check;
  each flip is investigated, not reverted.
- Prelude growth increases the compiled surface of every test, including
  negative-compile ones where the prelude must itself always compile. Keep the
  helpers strictly inside the supported lowering subset and covered by
  fixture-suite execution.
