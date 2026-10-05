# tsc - Native TypeScript Compiler

Use the `unslop` skill always.

This is a typescript compiler, it is supposed to compile typescript to native code by generating LLVM IR.

Read [CONTEXT.md](./CONTEXT.md) for the domain model: the IR unions, the static runtime IR files,
and which modules are pure. Use those names in code and reviews.

Code Quality must be of a very high priority. Shortcuts must be avoided.
If there is a problem with code quality suggest new lints.

## Commands

- Run the linter with `npm run lint`.
- Run typechecking with `npm run check` (typechecks `src/` and `test/`; see `tsconfig.json` and
  `tsconfig.test.json`).
- Run Vitest tests with `npm test`.
- Fetch the pinned Test262 checkout with `npm run test262:fetch`.
- Run the filtered Test262 suite with `npm run test262:run`; it skips when the checkout has not been fetched.

## Open lint proposals

None of these are enforceable with the rules oxlint ships today. Raised here so the next quality
pass does not rediscover them:

- **`no-dead-export`.** Would immediately have flagged `src/runtime/effect.ts` (an orphan
  mini-Effect with zero importers, whose name collided with the real library), the `Diagnostics`
  service's 3 never-called methods, and 3 error classes with no producer. All removed by hand. The
  general failure is a failure type nobody constructs: it widens every signature that mentions it
  and lints as used. `knip` would cover this.
- **`no-assertion-on-error-cause`.** Banning `as SomeError` applied to `Cause.failureOption` /
  `Exit`. Two test helpers did this against a `CompilationFailed | PlatformError` channel, so a
  `PlatformError` was silently re-read as a compile failure and the assertion read `undefined`.
  Both now narrow with `instanceof`.
- **`no-shadowed-global-type-parameter`.** Catches a type parameter named `Error`.
- **`no-open-union-narrowing`.** Requires a terminal exhaustiveness check after an `if`-chain
  narrowing one of the IR unions. This is aspirational: `typescript/switch-exhaustiveness-check`
  cannot see if-chains. The operation tier no longer has one — it dispatches through
  `operationEmittersByKind`, a `Record<JsIrOperation["kind"], Handler>` whose totality the
  compiler enforces, so a new kind is a compile error until something emits it. The value,
  condition and number/string tiers are still if-chains and still decline with `return undefined`;
  the same table shape is the fix for them. The two points that are checked in the type system are
  `jsIrLeafOperationKinds` and the delegation parameter of `emitTernaryStringExpression`.
- **`max-len` (140) is not an enforceable rule with the pinned oxlint.** oxlint 1.66 does not ship it —
  configuring it reports `Rule 'max-len' not found in plugin 'eslint'`. This replaces an earlier note here
  that called it worth enabling once the two god-files were decomposed; `llvm.ts` is decomposed and `ir.ts`
  is not, and neither fact would have made the rule exist. It needs a rule that ships before a threshold
  for it means anything.

- **No lint, but worth stating: the single narrowing assertion in `src/compiler/llvm.ts`.**
  `operationEmitterFor` asserts a `Record` lookup to a wide function type. TypeScript cannot
  correlate a union-typed discriminant with the per-variant handler it selects, because the
  parameters of the resulting union of function types intersect to `never`. The assertion is safe
  because the table's totality and every handler's own kind are both checked at the table; the
  check that would be equivalent to it cannot be expressed. If the value tiers ever reach the same
  table shape, the same single assertion per table is the cost.

