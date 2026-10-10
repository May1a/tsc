# tsc - Native TypeScript Compiler

Use the `unslop` skill always.

This compiler lowers TypeScript through resolved bindings and typed LLVM functions to native code.

Read [CONTEXT.md](./CONTEXT.md) for the domain model: the IR unions, the static runtime IR files,
and which modules are pure. Use those names in code and reviews.

Code Quality must be of a very high priority. Shortcuts must be avoided.
If there is a problem with code quality suggest new lints.

## Commands

- Run the linter with `npm run lint`.
  This includes `no-unchecked-object-access`: emission must use a value-kind-aware property
  getter, never the object-layout-only `valueObjectGet` runtime helper. Production native
  lowering verifies SSA ownership and GC roots before rendering.
  It also enforces immutable branch initialization, array transformations, and compiler layer
  dependencies. See [the lint policy](./docs/code-quality-lints.md).
- Run typechecking with `npm run check` (typechecks `src/` and `test/`; see `tsconfig.json` and
  `tsconfig.test.json`).
- Run Vitest tests with `npm test`.
- Fetch the pinned Test262 checkout with `npm run test262:fetch`.
- Run the filtered Test262 suite with `npm run test262:run`; it skips when the checkout has not been fetched.

## Backend requirements

Generated functions use the uniform boxed `argc`, `argv`, `environment`, and `thisValue`
ABI. Binding allocation restores specialized Number and String storage from resolved
representations. Use owned LLVM operands and block labels, total IR handler tables,
and runtime contracts. Static runtime fragments enter only through module construction.
Do not restore source-name lookup, a text backend, or shared mutable pass state.

## Open lint proposals

These proposals need additional tooling or a cleanup pass. Raised here so the next quality
pass does not rediscover them:

- **`no-implementation-in-dispatch`.** All closed IR tiers now select variant-specific handlers
  through total tables. A future check could restrict entry points to handler selection.
  `no-layer-mixing` enforces module boundaries; it does not infer function responsibilities.

- **`no-dead-export`.** Would immediately have flagged `src/runtime/effect.ts` (an orphan
  mini-Effect with zero importers, whose name collided with the real library), the `Diagnostics`
  service's 3 never-called methods, and 3 error classes with no producer. All removed by hand. The
  general failure is a failure type nobody constructs: it widens every signature that mentions it
  and lints as used. `knip` would cover this.
- **`no-open-union-narrowing`.** The operation and four expression tiers now use total
  handler tables, so new variants require handlers at compile time. An AST check for
  non-exhaustive if-chains elsewhere remains open; `switch-exhaustiveness-check` covers switches.
- **`max-len` (140) needs a JavaScript plugin and a formatting pass.** oxlint 1.66 does not ship a
  native rule: configuring it reports `Rule 'max-len' not found in plugin 'eslint'`.
  Its JavaScript plugin API does enforce `@stylistic/eslint-plugin` 5.10.0's `max-len` rule.
  The investigation records a historical strict scan. Adoption needs a fresh formatting census.
  See [the investigation](./docs/max-len.md) for the tested configuration and adoption options.
