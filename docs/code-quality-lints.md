# Procedural style and compiler layers

`npm run lint` enforces the rules below. Their rejection and acceptance cases run in
`test/unit/procedural-style-plugin.test.ts` and `test/unit/check-compiler-boundaries.test.ts`.

## Initialize values directly

`tscn/prefer-const-initialization` rejects a local `let` followed immediately by branches
that only assign its value. Use a conditional expression:

```ts
const capacity = expression.storeLength === true ? 2 : 1;
```

The rule covers an uninitialized variable with both branches, or a literal default with
one branch. It checks variable references, so later writes, self-dependent assignments,
shadowed names, and captured state remain valid. Defaults with effects and branches with
additional work are outside the rule. It provides no automatic fix.

The old `no-ternary` restriction forced these choices into procedural code. Conditional
expressions are now allowed. `unicorn/prefer-ternary` enforces simple choices whose condition
and alternatives each fit on one line. Existing restrictions on nested ternaries still apply.

## Express array transformations

`tscn/prefer-array-transform` rejects an empty local array whose first use is a synchronous
`for...of` loop containing only a `push`. Use `map`, `flatMap`, or `Array.from`:

```ts
const sources = operation.sources.map((source) => evaluateSource(source, context));
for (const source of sources) {
	context.runtime.callVoid("valueObjectAssign", [target, source]);
}
```

These steps evaluate every `Object.assign` argument before copying source properties.
Combining evaluation and copying in one callback changes behavior when a later argument
mutates an earlier source. Transformations must preserve the original evaluation order.

The rule accepts loops with additional work, populated output arrays, custom queues,
captured output state, self-dependent output, and `await` or `yield`. It provides no automatic
fix. When rewriting a loop, preserve exception behavior and iterable semantics. Use
`Array.from` for an iterable that has no array methods. Avoid spreading an unbounded result
into a function call, which can exceed the argument limit.

## Keep control flow shallow

`max-depth` rejects more than four nested control-flow blocks in `src/`. Flatten guards or
move a coherent responsibility into its own function. Existing statement, function-size,
and file-size limits still apply. Splitting a function into arbitrary chunks satisfies a
size limit without improving its design.

Function declaration Lowering now delegates parameter recognition and destructuring to
`function-parameter-lowering.ts`. The declaration function handles the function envelope and
body, while parameter helpers handle parameter forms and Binding Values.

## Enforce compiler dependencies

`no-layer-mixing`, in `scripts/check-compiler-boundaries.mjs`, checks these dependencies:

- The IR model depends on other IR model modules. Its files are `bindings.ts`,
  `expressions.ts`, `types.ts`, `module.ts`, `lowered.ts`, `visit.ts`, and `operation-bindings.ts`.
- Lowering depends on the IR model, other Lowering modules, and the TypeScript AST.
- Binding resolution depends on the IR model and other Binding resolution modules.
- Native lowering depends on resolved bindings, the LLVM builder, the JsValue ABI,
  runtime construction, runtime contracts, and GC verification.
- GC verification depends on the LLVM builder and runtime contracts.
- Runtime contracts depend on the LLVM builder. Runtime construction uses the contracts,
  LLVM builder, and JsValue ABI.
- The LLVM builder depends on other LLVM builder modules.
- The JsValue ABI depends on other ABI modules and the LLVM builder.
- Trace construction depends on the IR model. Shared compiler models such as diagnostics,
  target facts, symbol keys, and typed dispatch are pure and cannot import pass implementations.

These domains may use the shared compiler models. Native lowering also consumes trace
construction. They cannot import CLI/process composition boundaries or Effect error
classes. Runtime imports of
Node builtins or Effect are rejected within these domains. Type-only platform imports erase
at runtime, but type-only imports across forbidden compiler layers are still rejected.

Imports, re-exports, dynamic imports with literal specifiers, and inline import types are
checked. Relative paths are normalized. Nonliteral dynamic specifiers are outside this check.
The runtime import graph also rejects cycles after TypeScript erases type-only imports.

The removed text backend cannot be imported. Compiler domains import their permitted model modules directly. The public `ir.ts` barrel
exports the Lowering entry point, so importing it at runtime also loads Lowering. Aggregate
Binding Value classification lives in the IR model's `operation-bindings.ts`. AST diagnostic
fallbacks live in Lowering's `diagnostics.ts`, keeping `Lowered` independent of AST logic.

`runtime-files.ts` loads Static Runtime IR at the filesystem boundary. `runtime-ir.ts`
constructs the compiler's typed runtime helpers. Lowering's shared symbol keys live in
`symbols.ts`, so importing them does not load runtime files or backend implementations.
These checks do not infer the abstraction level of arbitrary code inside a function.
Review still needs to distinguish orchestration from implementation details.

## Own Lowering state

`no-shared-lowering-state`, in `scripts/check-lowering-state.mjs`, rejects mutable module
variables and writes to collections shared by Lowering invocations. It follows imported
symbols and local aliases through the TypeScript checker, so renaming a shared map does
not evade the check. Independent local variables with the same spelling remain valid.

The class registry and inline C++ blocks now belong to `LoweringContext`. Every compilation
gets its own context, and every source module gets its own class registry. The unused class
identifier and counter were deleted. Compilation no longer saves and restores shared state.

`test/unit/check-lowering-state.test.ts` proves rejection of the previous shared-state
patterns. `test/unit/lowering-state.test.ts` checks repeated and interleaved compilations,
module visibility, inline C++ gating, and trace order across the fixture corpus.

## Preserve resolution metadata

`scripts/check-resolution-metadata.mjs` derives the Number, String, Condition, and Value
variant fields from `ir/expressions.ts`. It checks every handler return separately.
Fields must come from the corresponding source field, including optional flags.
The TypeScript checker identifies the source parameter, so renaming or shadowing
it does not evade the check. A conditional spread may omit an optional field only
when that field is undefined. Unknown result or spread shapes fail with a request
to return a checkable object literal.

There are no field-drop exemptions. The regression tests reproduce the losses of
`arrayIndexOf.fromEnd`, `boxedPrimitive.storeLength`, and
`runtimeObjectHas.receiverKind`. They also cover multiple return paths, overridden
spreads, and constants substituted for source metadata.

## Keep global type names visible

`tscn/no-shadowed-global-type-parameter` rejects type parameters named `Error`, `Array`,
`Promise`, and other built-in types. A generic failure channel named `Error` hides the
actual JavaScript error type. Use a domain name such as `TFailure` or `TElement`. The
Oxlint plugin tests cover the previous `Error` pattern and valid constrained parameters.

## Narrow failure channels

`tscn/no-assertion-on-error-cause` rejects assertions on `.cause`, `failureOption`, and
`failureOrCause` results, including local aliases. Two test helpers previously asserted a
`CompilationFailed | PlatformError` failure as `CompilationFailed`, then read missing
diagnostics from a platform failure. Use `instanceof` or a discriminant to narrow the actual
failure. The rule runs on both source and tests and accepts independent shadowed variables.

The check follows variable initializers, not arbitrary assignments or function returns.
Type-aware unsafe-assertion rules remain enabled in compiler source and oracle helpers.

## Construct typed instructions through owners

`scripts/check-emission-architecture.mjs` scans Native lowering. It rejects
LLVM instruction strings and template fragments, obsolete text append calls, direct mutations
of backend context fields, and publicly mutable owner state. Owners keep their state private;
capabilities expose operations and readonly views. The renderer and Static Runtime IR retain
their separate text responsibilities. `createLlvmModule({ staticRuntime })` freezes input
fragments at construction and exposes no generated-code text append capability.

`node scripts/check-emission-architecture.mjs --census` reports findings per file for planning
a migration. The normal invocation fails on every finding. Its tests reproduce instruction
templates, the universal context's maps, renamed receivers, and constructor property state.

## Verify GC control flow

GC verification consumes finished typed functions and semantic heap-reference facts. It
checks live values and collecting-call arguments against roots present on every incoming
path. Indirect and unknown calls conservatively count as collecting. Saved root frames,
restoration, loops, and phi inputs participate in the analysis.

The verifier tests include an unrooted map output, branch-dependent roots, a restored
frame, nested frames, and loop phis. A phi's previous iteration cannot protect its current
incoming value. An unused phi does not extend the incoming value's lifetime. These are
control-flow checks; a syntax lint cannot establish the same property.

## Rule implementation

The custom rules use the repository's existing Oxlint JavaScript plugin support. They
run through the same command and editor configuration as the built-in rules, with no new
dependency or second lint runner. Oxlint documents this API as alpha; the CLI tests check
the actual installed version when dependencies change.

Sources: [Oxlint JavaScript plugins](https://oxc.rs/docs/guide/usage/linter/js-plugins.html),
[prefer-ternary](https://oxc.rs/docs/guide/usage/linter/rules/unicorn/prefer-ternary), and
[max-depth](https://oxc.rs/docs/guide/usage/linter/rules/eslint/max-depth).
