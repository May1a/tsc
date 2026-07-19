# Plan: Destructuring Default Function Names

Bug-fix plan for GitHub issue #38 (*Test262 destructuring defaults can segfault
native executables*), related to #20. This is scoped to the crash fix and spec
name inference for binding-element initializers; the master roadmap remains
`docs/PLAN.md`.

## Goal

Two pinned Test262 cases compile and link but the native executables die with
SIGSEGV while Node exits cleanly:

- `language/statements/const/dstr/ary-ptrn-elem-id-init-fn-name-arrow.js` —
  `const [arrow = () => {}] = [];` then `assert.sameValue(arrow.name, 'arrow')`.
- `language/statements/const/dstr/ary-ptrn-elem-id-init-fn-name-fn.js` —
  `const [fn = function () {}, xFn = function x() {}] = [];` then
  `assert.sameValue(fn.name, 'fn')` and `assert.notSameValue(xFn.name, 'xFn')`.

Deliver two things:

1. **Fix the crash.** Reading `.name` (or any property) off a function value
   produced by a destructuring default initializer must not segfault.
2. **Spec name inference.** Per `IsAnonymousFunctionDefinition` /
   `NamedEvaluation` (ES 13.3.3.6 `IteratorBindingInitialization`,
   `SingleNameBinding : BindingIdentifier Initializer`), an anonymous arrow or
   function expression used as a binding-element initializer receives the
   binding identifier as its `name`. An explicitly named function expression
   keeps its own name.

## Context

Iterator-protocol destructuring landed in `1b7263e` (*feat: destructure through
iterator protocol*). That path (`lowerArrayProtocolDestructuring`,
`src/compiler/ir.ts:5744`) deliberately rejects binding elements that carry
initializers (`src/compiler/ir.ts:5756`), so both pinned tests fall through to
the fixed-array destructuring path:

- `lowerDestructuringBinding` (`src/compiler/ir.ts:5718`) →
  `resolveDestructuringSource` (`src/compiler/ir.ts:5805`) binds `[]` as a
  fixed array of length 0 → `lowerFixedArrayDestructuredElement`
  (`src/compiler/ir.ts:5902`) → `lowerDestructuredFallbackOperation`
  (`src/compiler/ir.ts:6056`). With `hasValue === false` it lowers the default
  via `lowerConstVariableBinding(name, defaultInitializer, ...)`.
- The anonymous arrow/function lowers through `lowerFunctionObjectValue`
  (`src/compiler/ir.ts:9393`) into a `functionObject` value bound as a
  `valueVariable`. That function already computes a `displayName`
  (`src/compiler/ir.ts:9444`) but only uses it to decorate the generated code
  symbol — it never reaches the runtime function object.

### Crash Hypothesis

`arrow.name` is lowered by `lowerAggregatePropertyValueAccess`
(`src/compiler/ir.ts:9089`): `isBoxedAggregateCandidateBinding`
(`src/compiler/ir.ts:10496`) returns `true` for any `valueVariable`, so the
access becomes `valueObjectDynamicAccess`, emitted as a `@valueObjectGet` call
(`emitValueObjectValueExpression`, `src/compiler/llvm.ts:4760`;
`src/compiler/runtime-helpers.ts:4049`).

`valueObjectGet` unconditionally masks the NaN-box tag with `valueObjectPtr`
and calls `objectGet` (`src/compiler/runtime-helpers.ts:6805`) on the payload.
For a function-tagged value the payload is the `FunctionObject` layout from
`functionObjectNew` (`src/compiler/runtime-helpers.ts:2958`):

```
offset 0   code pointer
offset 8   env pointer
offset 16  boundThis (i64)
offset 24  prototype (ptr)
offset 32  name (i64, initialized to the undefined immediate)
offset 40  flags (i64)
```

`objectGet` assumes the ordinary-object layout: `objectGetOwn` interprets the
code pointer at offset 0 as object dictionary internals, and the prototype walk
loads payload+32 — the `name` slot holding the undefined immediate, not a
pointer — as a `ptr`. Either is a wild dereference, which matches the observed
SIGSEGV. The generic `valuePropertyGet` helper
(`src/compiler/runtime-helpers.ts:3448`) has the symmetric gap: it dispatches
on object/array/string tags and silently returns `undefined` for a function
receiver, so it is safe but wrong for `.name`.

The `name` slot itself is already GC-traced (`gcMarkValue` on the slot,
`src/compiler/runtime-helpers.ts:1049`), so storing a boxed string there needs
no marker changes.

## Approach

One runtime change fixes both the crash and the missing name: make the
function-object `name` slot a real, populated value and make property access on
function receivers tag-aware instead of blindly delegating to `objectGet`.

### 1. Populate The Function-Object Name Slot

- Extend `JsIrFunctionObjectDefinition` (`src/compiler/ir.ts`) with an optional
  `inferredName?: string` alongside the existing `directTarget`.
- In `lowerFunctionObjectValue` (`src/compiler/ir.ts:9393`), resolve the
  runtime name as: `expression.name.text` when the function expression is
  explicitly named, else the caller-supplied inferred name, else none. Reuse
  the existing `displayName` computation; thread the result onto the
  definition.
- Extend the `functionObjectNew` runtime helper
  (`src/compiler/runtime-helpers.ts:2958`) with a fourth parameter
  `i64 %name.value` stored into the payload+32 slot. Update every emission site
  in `src/compiler/llvm.ts` (`llvm.ts:2259`, `llvm.ts:2305`, `llvm.ts:2325`,
  `llvm.ts:4255`) to pass a boxed string for the resolved name or the undefined
  immediate when there is none. Runtime-owned thunks created inside
  `valuePropertyGet` (`arrayIteratorMethod`, `stringIteratorMethod`) pass
  undefined; well-known built-in names are out of scope.

### 2. Tag-Aware Property Access On Function Receivers

- Add a function-tag branch to `valueObjectGet`
  (`src/compiler/runtime-helpers.ts:4049`): when the receiver is a function
  value and the key is `"name"`, load the name slot; if the slot holds the
  undefined immediate, return the empty string (the spec default `name`). Any
  other key on a function receiver returns `undefined` until
  `Function.prototype` exists. Non-function receivers keep the current
  `objectGet` behavior byte-for-byte.
- Mirror the same branch in `valuePropertyGet`
  (`src/compiler/runtime-helpers.ts:3448`) so both value property-access
  helpers agree.
- This removes the wild `objectGet` dereference for function values at the
  single choke point; no IR lowering changes are needed for the crash fix.

### 3. Binding-Element Name Inference

- Add an `isAnonymousFunctionDefinition` check in `src/compiler/ir.ts`:
  `ts.isArrowFunction(unwrapped)` or `ts.isFunctionExpression(unwrapped)` with
  `expression.name === undefined`, after `unwrapTypeOnlyExpression`.
- Thread the binding identifier as the inferred name through the destructuring
  default paths: `lowerDestructuredFallbackOperation`
  (`src/compiler/ir.ts:6056`) and `lowerDestructuredValueBinding`
  (`src/compiler/ir.ts:5925`). Both already receive the binding `name`; pass it
  into the function-object lowering only when the initializer is an anonymous
  function definition. This covers array and object patterns, fixed and runtime
  sources, through the existing shared helpers.
- Apply the same inference in `lowerConstVariableBinding` /
  `lowerLetVariableBinding` for ordinary declaration initializers
  (`const f = () => {}`), which share `lowerFunctionObjectValue`. Explicitly
  named function expressions are untouched and keep their own name.
- Keep the inference threading on the `functionObject` value expression rather
  than the destructuring IR operations, so the protocol path
  (`arrayDestructureProtocol`) can adopt it when issue #20 routes initializers
  through the iterator protocol.

## Relation To Issue #20

Issue #20 owns the full binding-element grammar through the iterator protocol
(defaults, nested patterns, rest, parameter position). This plan does not
change which patterns route through the protocol; it fixes the
default-initializer semantics and the function-value property access that #20
will exercise on every shape. When #20 lifts the initializer restriction at
`src/compiler/ir.ts:5756`, the inferred-name plumbing from step 3 must be
reused rather than duplicated.

## Test Plan

### Vitest Fixtures

- Add `test/fixtures/destructure-default-function-name.ts` covering:
  anonymous arrow default (`name` is the binding identifier), anonymous
  function-expression default, explicitly named function-expression default
  (retains its own name, differs from the binding identifier), and a default
  that is *not* taken (yielded value present; initializer never evaluated).
  Register it in the Node correctness oracle list in
  `test/integration/oracle.test.ts`.
- Add a GC regression fixture (e.g. `test/fixtures/gc-function-object-name.ts`)
  that allocates many named function objects via destructuring defaults in a
  loop and observes `.name` after allocations, registered in
  `test/integration/gc.test.ts` with `expectSuccessfulCompile(fixture, { link: true })`,
  matching the existing `gc-function-closure-environment.ts` pattern. The name
  slot is already traced, so this guards against rooting regressions in the new
  boxed-string store.
- Property access on a function receiver for keys other than `name` returns
  `undefined` instead of crashing (covered in the new fixture).

### Test262

- Run the focused paths and confirm both pinned cases execute without a signal
  and match Node behavior:
  `npm run build && node dist/test262/run.js --path language/statements/const/dstr`
- Run the full filtered suite with `npm run test262:run`; update
  `test262/baseline.json` thresholds (`minimumPass`) if the two flipped cases
  change the counts. No `test262/filters.json` changes are expected.

## Acceptance Criteria

Mirrors issue #38:

- Both pinned Test262 cases execute without a signal.
- Anonymous arrow/function defaults receive the binding identifier as their
  `name`; explicitly named functions retain their own name.
- Native behavior matches Node (stdout, exit code, thrown observation).
- Regression fixtures run under GC stress where applicable.
- Typecheck, lint, Vitest, LLVM verification, and the focused Test262 paths
  pass.

## Verification

- `npm run check`
- `npm run lint`
- `npm test`
- `npm run build && node dist/test262/run.js --path language/statements/const/dstr`
- `npm run test262:run`

## Non-Goals

- Routing destructuring defaults through the iterator protocol (issue #20).
- `Function.prototype`, `.length`, `.prototype` on function objects, bound
  functions, or `Function.prototype.bind`/`call`/`apply`.
- Name inference in assignment-expression position (`f = () => {}`), parameter
  defaults, class static blocks, or computed property names.
- Changing the `arrayDestructureProtocol` element restrictions.
- Well-known names for runtime-owned iterator thunks.

## Risks

- The `functionObjectNew` signature change touches every emission site; a
  missed site fails at `llvm-as` verification, which the integration tests
  already run per fixture.
- Key comparison for `"name"` in the runtime helper must match the existing
  length-plus-`memcmp` convention used by `valuePropertyGet`; a length-only
  compare would alias keys.
- Widening name inference to ordinary declarations can flip currently-passing
  Test262 cases that assert the old (empty) name in either direction; the full
  filtered run must stay within `test262/baseline.json` thresholds.
