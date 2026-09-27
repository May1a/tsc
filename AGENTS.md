# tsc - Native TypeScript Compiler

Use the `unslop` skill always.

This is a typescript compiler, it is supposed to compile typescript to native code by generating LLVM IR.

Read [CONTEXT.md](./CONTEXT.md) for the domain model: the IR unions, the Runtime Helper registry,
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
  cannot see if-chains, and the IR dispatches entirely by `if`. The two points that *can* be
  checked in the type system are now checked — `jsIrLeafOperationKinds` and the delegation
  parameter of `emitTernaryStringExpression`. The operation tier's remaining five dispatchers
  decline with `return undefined`, so their coverage is a property of the chain as a whole and
  needs the `Record<JsIrOperation["kind"], Handler>` table to become checkable.
- **`max-len` (140).** 282 violations, effectively all in `ir.ts` and `llvm.ts`. Worth enabling
  as `warn` once those two files are decomposed.

