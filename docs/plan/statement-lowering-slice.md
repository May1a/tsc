# Plan: Widen the General Statement Lowering Slice

## Status

Implemented. GitHub issue: #44.

The master roadmap remains `docs/PLAN.md`. All delivered behavior uses
native lowering; no compile-time evaluation was introduced.

- **`var` declarations.** Simple `var` bindings (identifier name, single
  declarator, initializer present) lower through the existing `let` path,
  including `for (var i = ...)` initializers. Function-scoped hoisting (use
  before declaration) is **not** modeled — a `var` is only valid where a
  `let` in the same position would be. Same-scope redeclaration **is**
  supported: a repeated `var x = ...` merges into an assignment to the
  existing binding (`lowerVarRedeclaration`), matching function-scoped
  `var` semantics and avoiding duplicate allocas. `var` destructuring
  remains unsupported.
- **Single-statement bodies.** `if`/`else`, `for`, `for...of`, and
  `for...in` now accept unbraced bodies; `while`/`do...while` already did.
  Non-block bodies are normalized through the shared `lowerStatementBody`
  helper (formerly `lowerLoopBody`). Function declarations in unbraced
  if/else positions remain strict-mode early errors (TSCN1004, issue #43).
- **Bare `return;`.** Lowers as `return undefined` in function declarations
  (class methods already normalized this way), matching the uniform JSValue
  return ABI.
- **Diagnostics.** The stale TSCN1002 fallback now reports the failing
  statement kind: "Unsupported statement in the current lowering slice:
  &lt;SyntaxKind&gt;". More specific causes (unsupported expressions, string
  ABI limits) still take precedence where they are cheap to determine.

Hardening after the first Test262 run (every newly admitted construct must
either run with correct semantics or stay a clean coverage-gap):

- References to enclosing-frame mutable number/string/boolean bindings from
  inside a function body are rejected at lowering (`functionFrameBindings`);
  the backend has no cross-frame mutable access and previously emitted
  invalid IR. Returned closures keep their explicit capture parameters.
- Recursive function expressions (references to their own name or to the
  variable being initialized) are rejected: function objects use the dynamic
  calling convention, so a direct self-call would target a function that is
  never emitted.
- `.prototype` accesses on function objects are rejected; the runtime does
  not give function objects a `prototype` property.
- `throw` inside a `finally` block nested in the try region of an enclosing
  try/catch/finally is rejected: the backend's completion routing bypasses
  the enclosing catch for that shape.
- `valueStrictEquals` now compares two numbers with `fcmp oeq` (fixes
  `NaN === NaN`, `-0 === 0`, and `case NaN:` in switch); `arrayIncludes`
  was switched to `valueSameValueZero` per spec, and the
  `array-runtime-index-of.ts` expectation for `indexOf(NaN)` was corrected
  to `-1` (the fixture had codified the old bit-equality bug).

Deferred: postfix/prefix increments (`i++`) as `for` incrementors (the
incrementor channel only accepts assignment expressions), `var` hoisting
semantics, the completion-routing fix for the re-narrowed finally/throw
shape, and Test262 baseline regeneration (left to the follow-up run).

## Goal

Remove the most common causes of the generic TSCN1002 fallback
("Only top-level const string, number, or boolean bindings, print calls, and
if statements are supported by the current lowering slice"), which accounts
for roughly two thirds of all coverage-gap diagnostics in the filtered Test262
run (913 pass / 0 fail / 3354 coverage-gap on the pinned revision).

## Scope

1. **`var` declarations.** `lowerVariableBinding` (`src/compiler/ir.ts` ~5677)
   currently rejects `var` outright. Lower simple `var` bindings through the
   existing `let` path. Bindings are tracked per statement map, so simple
   cases are nearly free; full function-scoped hoisting (use before
   declaration, redeclaration merging) is the only subtlety — document what is
   and is not covered.
2. **Single-statement bodies.** `lowerIfStatement` (~4521) requires block
   bodies for then/else; loops share the same block channel. Normalize a
   non-block body to a synthetic block before lowering.
3. **Bare `return;`.** `lowerReturnStatement` (~5508) rejects it; lower as
   `return undefined` (precedent: class method `undefined` return at ~2699).
4. **Stale diagnostics.** Rewrite the generic fallback text in
   `unsupportedStatementMessage` (~11694) so it describes the current slice,
   and keep blame attribution honest (a failed `if`/`while`/`for`/`switch`/
   `try` currently always gets the generic text).

## Non-Goals

- Full `var` hoisting semantics beyond the simple cases documented above.
- New statement kinds (labeled statements, `debugger`, enums, namespaces).
- Expression-coverage expansion beyond what the items above require.
- Widening Test262 filter groups.

## Verification

- `npm run check`, `npm run lint`, `npm test`.
- New integration fixtures under `test/fixtures/` for each item.
- `npm run test262:run` — coverage-gap count must drop; then bump
  `minimumPass` in `test262/baseline.json` to the new actual pass count
  (gate stays `maximumFail: 0`, `maximumBehaviorMismatch: 0`).
