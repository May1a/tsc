# Plan: Test262 Script vs Module Oracle Execution

Bug-fix plan for GitHub issue #41 — distinguish the Test262 Script parse goal
from the Module goal in the Node correctness oracle. This is scoped to the
Test262 harness only; the master roadmap remains `docs/PLAN.md`.

## Goal

Make the Node oracle parse each assembled test under the same ECMAScript parse
goal the test declares: tests without the `module` frontmatter flag execute
under the Script grammar, and module-flagged tests keep the Module grammar.
The pinned case `language/statements/class/class-name-ident-await-escaped.js`
must stop reporting a false `behavior-mismatch`.

## Context

The harness compares native execution against Node for every selected test
(`src/test262/execute.ts`, `runAndCompare`). The Node side evaluates a wrapper
(`nodeWrapperSource` in `src/test262/behavior.ts`) with
`--input-type=module --eval`, and the wrapper loads the assembled entry through
dynamic `await import(process.argv[1])`. Dynamic import always parses the
target under the Module goal.

The pinned Test262 case
`build/test262/checkout/test/language/statements/class/class-name-ident-await-escaped.js`
declares no `module` flag and is a valid Script (`class aw\u0061it {}`), but
Node's Module grammar rejects `await` as a class name (`SyntaxError: Expected
ident`). Native compilation succeeds, so the harness reports a
`behavior-mismatch` that says nothing about the compiler: Node is simply not a
valid oracle for this test today.

Relevant current state:

- Frontmatter flags are parsed by `parseFrontmatter` in
  `src/test262/frontmatter.ts`; the `module` flag is visible on
  `Test262Frontmatter.flags` (`src/test262/types.ts`).
- Selection (`classifyTest` in `src/test262/selection.ts`) skips any test whose
  flag is listed in `unsupportedFlags` in `test262/filters.json`. `"module"` is
  listed there and **stays** listed: module compilation is out of scope for
  this slice.
- The assembled entry (`assembleEntry` in `src/test262/prelude.ts`) is fed
  byte-identically to tscn and Node; it contains the TS-only
  `declare function print` line, which Node currently tolerates because its
  default type stripping applies to `.ts` under dynamic import.

## Approach

Derive a parse goal from the `module` frontmatter flag, carry it on the
selected test, and give the Node oracle one wrapper per goal. The Script-goal
wrapper evaluates the assembled entry as a CommonJS module (which Node parses
under the Script grammar) instead of dynamic-importing it.

The issue's acceptance criteria allow either a Script-grammar execution mode
or a conservative skip with a stable oracle-inapplicable reason. We choose the
execution mode: it is cheap, it keeps the pinned case as real pass coverage,
and it matches the harness's role as a behavior oracle rather than a skip
generator.

## Design Decisions

### Parse goal lives on `SelectedTest`

Add `parseGoal: "script" | "module"` to `SelectedTest` in
`src/test262/types.ts`. `classifyTest` in `src/test262/selection.ts` computes
it from `frontmatter.flags.includes("module")` before the unsupported-flag
check runs. Because `"module"` remains in `unsupportedFlags`, every executed
test is Script-goal today; the field is the plumbing that lets a future
module-compilation slice flip Module-goal tests on without reworking the
oracle.

### Script goal uses a CommonJS wrapper, not `vm.Script`

Add `nodeScriptWrapperSource` to `src/test262/behavior.ts`, evaluated with
`--input-type=commonjs`. It installs the same `globalThis.print` shim and the
same `thrownSentinel` JSON reporting as `nodeWrapperSource`, then
`require()`s the assembled entry path. Node wraps CommonJS sources in a
function parsed under the Script goal, so escaped-`await` identifiers and
other Script-only constructs parse correctly; a genuine Script-level
`SyntaxError` still throws synchronously out of `require` and is reported
through the sentinel exactly like the module path.

`node:vm`'s `new vm.Script(source)` was considered and rejected: it cannot
strip TypeScript syntax, and the assembled entry contains the
`declare function print` declaration from `assertionPrelude`.

**As built (supersedes the original require-based design):** the planned
design relied on routing through `require` to keep Node's built-in type
stripping active for `.ts` (unflagged since Node 22.18). That turned out to
be unworkable for this use case: Node's built-in `.ts` loader applies Module
identifier restrictions before a CommonJS `require` ever reaches Script
parsing, so the pinned Script-only construct still failed. The wrapper as
implemented registers a `require.extensions[".ts"]` hook that transpiles the
entry with the `typescript` package — `ts.transpileModule` with
`module: ts.ModuleKind.None`, so the transpiled output is goal-neutral — then
hands the result to `module._compile`, letting CommonJS perform the
goal-sensitive parse. Transpile diagnostics are re-thrown as `SyntaxError` so
the sentinel contract is unchanged. This removes the Node-version dependency
on unflagged type stripping entirely (the pinned case passes on the current
toolchain); the cost is that the wrapper process must resolve the
`typescript` package, which the repo already carries as a toolchain
dependency. The Module-goal wrapper is unchanged and still relies on dynamic
import's type stripping.

### The assertion prelude does not change

`assembleEntry` and `assertionPrelude` in `src/test262/prelude.ts` are
untouched. The prelude is goal-agnostic — no `import`/`export`, no top-level
`await` — so the same assembled `entry.ts` is valid under both grammars, and
the oracle's "identical source on both sides" invariant
(`test/integration/oracle.ts` precedent) is preserved.

### Both wrappers stay exercised

Today the module wrapper is covered incidentally by every hermetic harness
test. Once Script-goal tests route to the new wrapper, the module wrapper
would go quiet until module support lands. Hermetic tests must invoke both
wrappers directly (see Test Plan) so neither path decays.

## Implementation Plan

### 1. Carry the parse goal through selection

- Add `parseGoal: "script" | "module"` to `SelectedTest` in
  `src/test262/types.ts`.
- In `classifyTest` (`src/test262/selection.ts`), compute the goal from the
  parsed frontmatter flags and set it when constructing the selected test.
- Leave `test262/filters.json` unchanged: `"module"` stays in
  `unsupportedFlags`, so module-flagged tests keep skipping with the stable
  `unsupported-flag:module` reason.

### 2. Add the Script-goal Node wrapper

- Add `nodeScriptWrapperSource` in `src/test262/behavior.ts` mirroring
  `nodeWrapperSource`: same `print` shim, same `thrownSentinel` payload and
  exit-code-1-on-throw contract, but `require(process.argv[1])` instead of
  `await import(...)`.
- Keep `nodeWrapperSource` (dynamic import) as the Module-goal wrapper.
- `nodeBehavior` and the sentinel parsing need no changes; both wrappers emit
  the same terminal record.

### 3. Select the wrapper at execution time

- In `runAndCompare` (`src/test262/execute.ts`), choose wrapper and argv from
  `test.parseGoal`: Module goal keeps
  `["--input-type=module", "--eval", nodeWrapperSource, pathToFileURL(entry).href]`;
  Script goal uses
  `["--input-type=commonjs", "--eval", nodeScriptWrapperSource, entry]`
  (plain path, since `require` does not accept a `file:` URL string).
- No changes to compilation, `nativeBehavior`, `behaviorsEqual`, runtime
  negatives, or artifact handling.

### 4. Verify against the pinned suite and tighten the baseline

- Run `npm run build && node dist/test262/run.js --path language/statements/class`
  and confirm the pinned case now passes.
- Run the full filtered suite with `npm run test262:run` and update
  `test262/baseline.json` to the observed counts — the pinned case moving from
  `behavior-mismatch` fail to pass should raise `minimumPass` by one and lower
  `maximumFail` / `maximumBehaviorMismatch` by one each (currently 785 / 5 /
  4). Do not loosen any baseline bound.

## Test Plan

Hermetic coverage lives in `test/integration/test262.test.ts` with fixtures
under `test/fixtures/test262/suite/test/language/statements/`:

- **Script-goal end to end.** Add a fixture mirroring the pinned case (e.g.
  `language/statements/class/script-goal-await-ident.js` containing
  `class aw\u0061it {}` plus a `print` call). It must classify `pass` — before
  this change it would report `behavior-mismatch`.
- **Module flag still skipped.** A fixture with `flags: [module]` must still
  classify `skip` with reason `unsupported-flag:module`.
- **Both wrappers, directly.** Spawn `nodeScriptWrapperSource` and
  `nodeWrapperSource` via `captureProcessWithTimeout`
  (`src/test262/process.ts`) against a Script-only source: the Script wrapper
  executes it; the Module wrapper reports a `SyntaxError` through the
  sentinel. This proves the two goals differ without needing the native
  toolchain, and keeps the Module wrapper covered.
- **Prelude parity.** Assert `assembleEntry` output contains no `import`,
  `export`, or top-level `await`, guarding the goal-agnostic invariant.
- Update the full synthetic-suite summary expectations
  (`expectedTotalTests`, pass/skip counts) for the added fixtures.

## Acceptance Criteria

Mirrors issue #41:

- Test262 entries without the `module` flag execute under an oracle mode with
  Script grammar.
- Module-flagged tests continue to use Module grammar when support is enabled
  (the `parseGoal` plumbing is in place; the filter skip stays until then).
- The assembled assertion prelude remains identical in behavior on native and
  oracle sides — it is byte-identical and goal-agnostic.
- The pinned case `class-name-ident-await-escaped.js` no longer reports a
  compiler behavior mismatch.
- Hermetic tests cover both parse goals; `npm run check`, `npm run lint`, and
  `npm test` pass.

## Non-Goals

- Compiling or un-skipping module-flagged tests; `"module"` stays in
  `unsupportedFlags` in `test262/filters.json`.
- `raw`, `onlyStrict`, or `noStrict` frontmatter semantics beyond the existing
  skip behavior.
- Test262 `async` execution or harness includes beyond `assert.js`/`sta.js`.
- Changes to the native compiler, the assertion prelude, or the fixture
  rewrite rules in `src/test262/prelude.ts`.

## Risks

- **Wrapper dependency on the `typescript` package.** The Script wrapper
  transpiles the entry with `ts.transpileModule` inside the spawned Node
  process, so `typescript` must be resolvable from the harness's working
  directory. It is a pinned toolchain dependency, and a resolution failure is
  loud (non-zero exit, stderr), not silent. The as-built transpile hook
  removed the original risk of depending on unflagged type stripping in
  Node ≥ 22.18 for the Script path; the Module wrapper still relies on it for
  dynamic import, so if CI ever pins an older Node the module path degrades
  loudly on its own.
- **CJS/ESM observable drift.** CommonJS adds a function wrapper (top-level
  `this`, `arguments`, `module`) that a future test could observe. The
  filtered suite's current surface does not touch these; if one ever does,
  the correct fix is goal-faithful scoping in the wrapper, not reverting to
  dynamic import.
- **Skip-reason stability.** The `unsupported-flag:module` skip reason must
  not change, since reports and counts key on it; selection changes are
  limited to computing `parseGoal` for selected tests.
