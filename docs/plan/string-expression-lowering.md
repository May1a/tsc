# Plan: Widen Runtime String Expression Lowering

## Status

Landed (pending Test262 re-baseline by the parent agent). GitHub issue: #45.

The master roadmap remains `docs/PLAN.md`. All delivered behavior must use
native lowering; compile-time evaluation is not acceptable.

## Goal

Remove the second-largest Test262 coverage-gap cause (~1975 diagnostics):
"Unsupported string expression in the current runtime string lowering slice"
(`src/compiler/ir.ts` ~11747, driven by the `unsupportedStringExpression`
blame heuristic at ~11939).

## Scope

1. **Missing string-producing methods.** The string channel
   (`lowerStringRuntimeExpression` ~7993, runtime methods at
   `lowerRuntimeStringMethodExpression` ~8115) supports literals, concat,
   templates, `String(x)`, `trim*`/`toUpperCase`/`toLowerCase`/`repeat`/
   `replace*`/`padStart`/`padEnd`, and runtime-array `join`. Add, in the
   established style (lowering case + runtime helper where needed):
   - `charAt`, `at`
   - `slice`, `substring`, `substr`
   - `indexOf`, `lastIndexOf`, `includes` (value-producing)
   - `String.fromCharCode`, `charCodeAt`/`codePointAt` where not already
     covered by the value channel
   - `split` (array-producing) only if the existing runtime-array plumbing
     makes it cheap; otherwise defer and document.
2. **Stale ABI diagnostic.** Delete or rewrite "String returns from functions
   are not supported by the current runtime string ABI" (~11710). ADR 0012
   unified the boundary ABI on NaN-boxed i64 and boxed string returns work
   today (`emitStringReturnOperation` in `llvm.ts` ~4494; fixture
   `test/fixtures/template-as-return.ts` passes). The message misattributes
   unrelated body failures.

Remember UTF-16 code-unit semantics are the observable behavior for all
JavaScript string operations (ADR 0007), even if storage is UTF-8.

## Non-Goals

- Regex-based `split` beyond what the existing RegExp engine already exposes.
- Locale-sensitive methods (`toLocaleUpperCase` etc.).
- Widening Test262 filter groups.

## Verification

- `npm run check`, `npm run lint`, `npm test`.
- New integration fixtures under `test/fixtures/` for each added form.
- `npm run test262:run` — coverage-gap count must drop; then bump
  `minimumPass` in `test262/baseline.json` to the new actual pass count
  (gate stays `maximumFail: 0`, `maximumBehaviorMismatch: 0`).

## What landed

- String channel (`lowerRuntimeStringMethodExpression` in `src/compiler/ir.ts`,
  emission in `emitStringExpression` in `src/compiler/llvm.ts`, helpers in
  `src/compiler/runtime-helpers.ts`):
  - `charAt(index)` → `stringCharAt`; negative/out-of-range indices yield `""`.
    `at(index)` was already emitted via `stringAt` and now lowers in the string
    channel too (previously value channel only), so it composes in concat and
    templates.
  - `slice(start?, end?)` → `stringSlice`; negative indices count from the end,
    both bounds clamp to `[0, length]`.
  - `substring(start?, end?)` → `stringSubstring`; negatives clamp to 0 and the
    bounds swap when start > end.
  - `substr(start, length?)` → `stringSubstr`; negative start counts from the
    end, length clamps to `[0, length - start]`.
  - `String.fromCharCode(...codes)` → `stringFromCharCode` (new IR node
    `stringFromCharCode`); codes are materialized into an alloca'd i64 array at
    the call site. A user binding named `String` shadows the built-in and is
    left unsupported, matching the `Symbol` guard.
  - `split` needed no new work: `lowerRuntimeStringSplitBinding` plus the
    existing `stringSplit`/`regexSplit` helpers already cover it (fixtures
    `string-split-literal.ts`, `string-split-limit.ts`,
    `string-split-empty-separator.ts`).
- Value channel (`lowerRuntimeStringMethodCall` in `src/compiler/ir.ts`,
  emission in `emitValueExpression` in `src/compiler/llvm.ts`):
  - `indexOf(search, fromIndex?)` → `stringIndexOf` (new IR node
    `stringIndexOf`); `fromIndex` clamps to `[0, length]`.
  - `lastIndexOf(search)` → `stringLastIndexOf` (new IR node
    `stringLastIndexOf`).
  - `includes(search)` already lowered through the `stringSearch` condition
    (and folds for literal receivers); the new fixture covers the typed-string
    value path. `charCodeAt`/`codePointAt` were already covered by the value
    channel (`stringCharCodeAt`).
- Index arguments for the new methods convert NaN to 0 before `fptosi`
  (`emitStringIndexArgument` in `llvm.ts`), since `fptosi` on NaN is poison in
  LLVM; the helpers then apply JS clamping/negative-from-end rules.
- Removed the stale "String returns from functions are not supported by the
  current runtime string ABI" blame heuristic from
  `unsupportedStatementMessage`; the underlying diagnostics now show through.
  The string-parameter message stays (that limitation is still real).
- Fixtures/tests (all in `test/integration/packages.test.ts`, package CB):
  `string-char-at-runtime.ts`, `string-slice-runtime.ts`,
  `string-substring-runtime.ts`, `string-substr-runtime.ts`,
  `string-from-char-code.ts`, `string-index-of-runtime.ts`,
  `string-at-concat.ts`.

## UTF-16 caveats

The new typed-channel helpers index raw UTF-8 bytes, exactly like the
pre-existing `stringAt`/`stringCharCodeAt` fast-path helpers. All index
arithmetic (clamping, negative-from-end, NaN→0) follows JS semantics, so the
new methods are exact for ASCII receivers; for non-ASCII input, byte indices
and UTF-16 code-unit indices diverge, and `String.fromCharCode` truncates each
code to one byte (Latin-1 range). Closing that gap requires the
UTF-16-unit-aware indexing tracked under ADR 0007 and is out of scope here;
the boxed (`any`-receiver) dispatch and the regex engine already carry
unit-aware conversions (`regexByteOffset`/`regexUtf16Index`) that a future
slice can generalize.

## Deferrals

- `split` into the value/expression channel (e.g. `print(s.split(","))`
  inline, without a binding declaration) — the existing plumbing only supports
  split as a variable initializer binding (`runtimeStringSplit` operation).
- Non-ASCII-correct (UTF-16 code-unit) indexing for the typed-channel helpers —
  see UTF-16 caveats above.
- `lastIndexOf(search, fromIndex)` — only the single-argument form lowers.
