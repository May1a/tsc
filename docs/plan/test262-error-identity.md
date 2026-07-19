# Plan: Test262Error Constructor Identity (Test262 `try/dstr/ary-ptrn-elem-id-init-throws`)

Bug-fix plan for GitHub issue #39 — *"Test262 assert.throws exposes Test262Error
representation mismatch"*. This is scoped to the pinned case
`language/statements/try/dstr/ary-ptrn-elem-id-init-throws.js` and the minimal
native defects it exposes; the master roadmap remains `docs/PLAN.md`.

## Goal

The pinned case must pass on both sides of the correctness oracle: the
catch-parameter destructuring default initializer runs, its abrupt completion
propagates, and `assert.throws(Test262Error, fn)` recognizes the natively thrown
instance by constructor identity. Native execution must stop exiting 1 with the
thrown value displayed as `[object Object]`, and the harness must not normalize
the error away — the `__t262Throws` constructor check stays exactly as strict as
upstream `assert.throws` (`build/test262/checkout/harness/assert.js:130`).

## Context / Problem

The harness rewrites `assert.throws(Test262Error, fn)` to the prelude's
`__t262Throws(Test262Error, fn)` (`src/test262/prelude.ts:47-67`), which checks
`thrown.constructor !== args[0]`, mirroring upstream. Upstream, `Test262Error`
is a real constructor (`build/test262/checkout/harness/sta.js:13-20`), so
`new Test262Error().constructor === Test262Error` and Node passes the case.

Investigation (compiled the assembled entry with the real pipeline, ran both
sides) confirmed four stacked defects:

### 1. Catch-parameter destructuring is silently dropped (primary defect)

`catchBindingName` (`src/compiler/ir.ts:4054`) returns `""` for a binding
pattern, and `lowerTryCatchStatement` (`src/compiler/ir.ts:4012-4026`) then
lowers the catch block with **no binding initialization at all** — no
diagnostic, no destructuring. The generated LLVM for the callback confirms it:
`try.catch.0` loads the caught value and branches straight to `try.join.0`; the
pattern `[x = (function() { throw new Test262Error(); })()]` and its default
initializer never evaluate. The callback returns normally, `__t262Throws` takes
its `caught === false` branch, and the resulting `Test262Error` escapes to
`main.unhandled`, which prints any object via `@valuePrint` as `[object Object]`
(`src/compiler/llvm.ts:437-443`, `src/compiler/runtime-helpers.ts:4366-4369`)
and exits 1 — the observed behavior.

### 2. The minimal prelude's `Test262Error` lacks constructor identity

The prelude defines `Test262Error` as a plain function returning
`new Error(message)` with `name` overwritten (`src/test262/prelude.ts:18-22`).
In Node, that instance's `.constructor` is `Error`, not `Test262Error` —
verified: the Node oracle **also exits 1** on this case today (uncaught
`Test262Error` in the structured thrown observation,
`src/test262/behavior.ts:44-57`). The issue's "Node recognizes the constructor
and passes" describes upstream `sta.js` semantics; the minimal prelude must
reproduce that observable identity for the check to be passable at all. This is
not normalizing the error away: the constructor check itself is untouched.

### 3. Function-declaration references have no value identity

Each identifier reference to a function declaration lowers to a fresh
`functionObject` value (`lowerFunctionObjectValue`,
`src/compiler/ir.ts:9397-9414`) and the backend emits a fresh `functionObjectNew`
allocation per evaluation (`src/compiler/llvm.ts:4234-4250`), while
`valueStrictEquals` compares raw pointer identity
(`src/compiler/runtime-helpers.ts:2082`). So `error.constructor = Test262Error`
inside the function body and `Test262Error` at the `__t262Throws` call site
would be two distinct heap objects and `!==` — the check fails natively even
after defects 1, 2, and 4 are fixed.

### 4. `new` on a plain function has no lowering

`lowerRuntimeErrorLiteral` (`src/compiler/ir.ts:4131-4161`) only covers the
built-in error constructors; the class path requires an unbound identifier
(`src/compiler/ir.ts:2526`). `new Test262Error()` therefore has no lowering
today — currently masked by defect 1, which never evaluates the pattern.

## Approach

Four minimal changes, ordered by dependency.

### 1. Lower catch-parameter binding patterns

Mirror the existing function-parameter destructuring path
(`src/compiler/ir.ts:4834-4879`) in `lowerTryCatchStatement`:

- When `catchClause.variableDeclaration.name` is an `ArrayBindingPattern` or
  `ObjectBindingPattern`, bind a synthetic temp (e.g. `__catch${statement.pos}`)
  as the `catchVariable` — the backend already loads the caught value into a
  `valueVariable` under that name (`emitTryCatchOnlyOperation`,
  `src/compiler/llvm.ts:1263-1267`), so no LLVM change is needed for the
  transport.
- Prepend destructuring operations to `catchOperations`, reusing
  `lowerArrayDestructuringElements` (`src/compiler/ir.ts:5837`) and
  `lowerObjectDestructuringElements` (`src/compiler/ir.ts:5948`) with the temp
  as a `valueVariable` source. Both already handle element default initializers
  via `lowerDestructuredValueBinding` (`src/compiler/ir.ts:5925`).
- Abrupt completion from the default initializer propagates through the existing
  exception ABI (ADR 0008): the backend restores the enclosing
  `exceptionTarget` before emitting catch operations
  (`src/compiler/llvm.ts:1258-1262`) and `emitGeneratedJsCall`
  (`src/compiler/llvm.ts:574-593`) stores the payload and branches on the
  exception bit. Verify with the GC-stress fixture below that the caught value
  stays rooted across the throwing call.
- Default initializers must be **lazy**: the default may only evaluate when the
  element is `undefined`. The current destructured-default path lowers to a
  `ternary` value expression whose backend emission
  (`emitTernaryValueExpression`, `src/compiler/llvm.ts:4878-4897`) evaluates
  both arms eagerly — observably wrong when the default throws or has side
  effects and the element is present. For catch-binding elements with an
  initializer that can throw (any call), lower the default through an explicit
  conditional branch instead of the eager ternary. The pinned case (element
  `undefined`) works either way; laziness is required so this slice does not
  introduce a known-wrong behavior.
- If a pattern cannot be lowered, return `undefined` so the statement becomes a
  `TSCN1002` unsupported diagnostic (`src/compiler/ir.ts:1820`) — never the
  current silent drop.

### 2. Lower `new` on plain functions (guarded)

In value-expression lowering (`src/compiler/ir.ts`), accept
`new F(...)` where `F` resolves to a plain `function` binding, and lower it as a
direct call through the existing `{ i64, i1 }` convention, using the returned
value. Guard the fast path so it stays observably exact: the function body must
not reference `this` and must provably return an object on every path (the
prelude's `Test262Error` shape: allocate, assign properties, `return error`).
Anything else — fresh-`this` semantics, primitive returns, conditional returns —
returns `undefined` and becomes `TSCN1002`, not a silent miscompile.

### 3. Intern function objects for declaration references

Give repeated references to the same function declaration one runtime object:

- In the `functionObject` emission (`src/compiler/llvm.ts:4234`), when
  `definition.directTarget` is set and there are no captures and no bound
  `this`, materialize the object once (module-global slot or eager
  initialization in `main` before user code) and reuse the same `i64` at every
  reference site.
- Root the interned objects for process lifetime so the mark-sweep collector
  never reclaims them (a permanent `gcRootPush` at initialization).
- Do **not** change `valueStrictEquals`: pointer identity stays the single
  equality rule; interning is what makes it correct for declarations, matching
  the JavaScript semantics that a function declaration is one object. Comparing
  code/env pointers instead was rejected — distinct closures sharing a code
  pointer must stay `!==`.

### 4. Establish constructor identity in the prelude

In `assertionPrelude` (`src/test262/prelude.ts:18-22`), add
`error.constructor = Test262Error;` to the minimal `Test262Error` so instances
carry the constructor identity upstream `sta.js` guarantees. The prelude stays
byte-identical input to both oracle sides, `thrown instanceof Error` still holds
for the Node wrapper's structured observation
(`src/test262/behavior.ts:51-53`), and the negative-runtime wrapper's `.name`
check is unaffected. Natively this is a `runtimeObjectStore` of the interned
function object onto the `errorNew` object; `@objectSet` grows the entries store
(`src/compiler/runtime-helpers.ts:7193-7210`), so a third property beyond the
`name`/`message` capacity-2 allocation (`src/compiler/runtime-helpers.ts:6233`)
is safe.

## Regression Coverage

- **Test262 (primary):**
  `npm run build && node dist/test262/run.js --path language/statements/try/dstr/ary-ptrn-elem-id-init-throws.js --json -`
  flips the pinned case from `behavior-mismatch` to `pass`. The full filtered
  suite (`npm run test262:run`) must stay within `test262/baseline.json`
  (`minimumPass` 785, `maximumFail` 5, `maximumBehaviorMismatch` 4); flipping
  this case improves the counts, so no baseline edit is expected. No
  `test262/filters.json` change.
- **Fixtures (`test/fixtures/`)**, with Node-oracle comparison:
  - catch-parameter array destructuring whose default initializer throws —
    asserts the throw escapes the callback (pinned-case shape);
  - catch-parameter destructuring with a present element — asserts the default
    does **not** evaluate (laziness);
  - catch-parameter object destructuring with a default;
  - an unsupported catch pattern (e.g. nested rest with initializer) yields
    `TSCN1002`, never silent miscompilation;
  - function-declaration identity: two references to the same declaration are
    `===`, two distinct closures are `!==`;
  - `new` on a plain object-returning function; `new` on a `this`-using
    function yields `TSCN1002`;
  - GC stress in the existing `gc-*` style: catch destructuring with a throwing
    default under a constrained heap, keeping the caught value and the thrown
    error alive across collections.
- **Harness unit/integration:** `test/integration/test262.test.ts` runs the
  fixture mini-suite through `assembleEntry`; the prelude change must not move
  its expected classification counts. Add a focused expectation that the
  prelude's `Test262Error` instances satisfy `instance.constructor === Test262Error`
  under Node.

## Acceptance Criteria

Mirrors GitHub issue #39:

- Catch-parameter destructuring propagates the default initializer abrupt
  completion.
- `Test262Error` instances preserve constructor identity through native
  throw/catch.
- The minimal Test262 `assert.throws` behavior matches upstream for this case.
- The pinned case matches Node without normalizing away the error.
- Typecheck, lint, Vitest, GC stress, and focused Test262 execution pass.

## Verification

- `npm run check` — typecheck clean.
- `npm run lint` — lint clean.
- `npm test` — Vitest green, including the new fixtures.
- `npm run build && node dist/test262/run.js --path language/statements/try/dstr/ary-ptrn-elem-id-init-throws.js --json -`
  — pinned case passes.
- `npm run build && node dist/test262/run.js --path language/statements/try` —
  no regressions in the prefix.
- `npm run test262:run` — filtered suite within `test262/baseline.json`
  (skips when the checkout has not been fetched).

## Non-Goals

- Real `Error` subclassing, prototype chains, or `instanceof` support for
  `Test262Error`; constructor identity is delivered as an own data property,
  exactly what `assert.throws` observes.
- General construct semantics (`new` with fresh `this`, constructor return
  override rules) beyond the guarded plain-function path.
- Changing `@valuePrint`/`main.unhandled` display of uncaught objects — the
  passing path has no uncaught error; the `[object Object]` display is a
  symptom, not the defect.
- Making the remaining eager-ternary destructured defaults
  (`lowerDestructuredValueBinding`) lazy for `const`/parameter destructuring.
  As built, this is narrower than originally scoped: the destructuring
  completion work (#20) already extended `lazyDefault` lowering to call and
  function initializers — `lowerDestructuredValueBinding`
  (`src/compiler/ir.ts:6472-6507`) routes any default that is a call
  expression or lowers to a `functionObject` through the `lazyDefault` value
  expression even when the caller does not request lazy defaults, defensible
  under issue #20's generic laziness acceptance criterion. What stays eager is
  the non-call, non-function default in `const`/parameter destructuring, which
  still lowers to the pre-existing ternary; that limitation is unchanged by
  this slice.
- Widening Test262 coverage beyond the pinned case and its directly exercised
  machinery.

## Risks

- **Interning changes allocation behavior.** Permanently rooted singletons are
  new GC surface; mitigate with eager initialization plus the GC-stress fixture.
- **The `new` guard is too loose or too tight.** Too loose silently miscompiles
  fresh-`this` constructors; too tight turns the pinned case into a
  coverage-gap. Keep the guard syntactic and conservative, and prefer
  `TSCN1002` on any doubt.
- **The prelude change touches every assembled test.** It is behavior-neutral
  for all current classifications (verified by reasoning about both wrappers),
  but the full filtered suite and the fixture mini-suite counts are the proof —
  run both, not just the pinned case.
